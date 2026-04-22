"use client";

import * as React from "react";
import { use } from "react";
import Image from "next/image";
import Link from "next/link";
import { type Address, type Hex, isAddress, parseAbiItem } from "viem";
import { usePublicClient } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/providers/AuthProvider";
import { SellerTrustSummary } from "@/components/site/SellerTrustSummary";

import { fetchJson } from "@/lib/api";
import { type PublicUserProfileResponse } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { marketplaceRegistryAbi } from "@/lib/contracts/abi/MarketplaceRegistry";
import { parseListing } from "@/lib/contracts/parse";
import { isNativeToken, saleTypeLabel, statusLabel, type ListingStatus, type SaleType } from "@/lib/contracts/types";
import { formatPrice, shortenHex } from "@/lib/format";
import { ipfsToHttp } from "@/lib/ipfs";
import { buildListingHref } from "@/lib/listings";
import { fetchMetadataById, getRenderableListingImage, isSmokeMetadataUri, metadataIdFromUri, type MarketplaceMetadata } from "@/lib/metadata";

type ListingSummary = {
  chainKey: string;
  id: Hex;
  seller: Address;
  buyer: Address;
  saleType: SaleType;
  token: Address;
  price: bigint;
  metadataURI: string;
  status: ListingStatus;
};

const listingCreatedEvent = parseAbiItem(
  "event ListingCreated(bytes32 indexed id, address seller, uint8 saleType, address token, uint256 price, string metadataURI)"
);

const SAFE_LOG_SCAN_BLOCKS = 25_000n;

type LogArgsLike = {
  seller?: Address;
  id?: Hex;
};

function formatPercent(value: number | null | undefined) {
  return typeof value === "number" ? `${value}%` : "Building signal";
}

function formatReputation(value: number | null | undefined) {
  return typeof value === "number" ? `${value}/100` : "Building signal";
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function getListingEventArgs(args: unknown): LogArgsLike {
  if (!args || typeof args !== "object") return {};
  const candidate = args as Record<string, unknown>;
  return {
    seller: typeof candidate.seller === "string" && isAddress(candidate.seller) ? (candidate.seller as Address) : undefined,
    id: typeof candidate.id === "string" ? (candidate.id as Hex) : undefined,
  };
}

function isRateLimitError(err: unknown): boolean {
  const candidate = err as { shortMessage?: unknown; message?: unknown; details?: unknown } | null;
  const message = String(candidate?.shortMessage ?? candidate?.message ?? "");
  const details = String(candidate?.details ?? "");
  return /\b429\b/.test(message) ||
    /too many requests/i.test(message) ||
    /rate limit/i.test(message) ||
    /\b429\b/.test(details) ||
    /too many requests/i.test(details) ||
    /rate limit/i.test(details);
}

export default function SellerListingsPage({ params }: { params: Promise<{ address: string }> }) {
  // Next.js 16 types `params` as a Promise in App Router.
  // React 19 `use()` unwraps the promise on the client (suspends if needed).
  const resolvedParams = use(params);
  const publicClient = usePublicClient();
  const auth = useAuth();

  const [listings, setListings] = React.useState<ListingSummary[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [metadataById, setMetadataById] = React.useState<Record<string, MarketplaceMetadata>>({});
  const [profile, setProfile] = React.useState<PublicUserProfileResponse | null>(null);
  const [isFollowing, setIsFollowing] = React.useState(false);
  const [isFollowLoading, setIsFollowLoading] = React.useState(false);

  const envState = React.useMemo(() => {
    try {
      return { env: getEnv(), error: null as string | null };
    } catch (error: unknown) {
      return { env: null, error: getErrorMessage(error, "Missing env vars") };
    }
  }, []);

  const address = resolvedParams?.address;
  const seller = isAddress(address) ? (address as Address) : null;
  const canFollow = Boolean(seller && auth.address && seller.toLowerCase() !== auth.address.toLowerCase());
  const defaultChainKey = envState.env?.defaultChain.key ?? "sepolia";
  const marketplaceRegistryAddress = envState.env?.marketplaceRegistryAddress;
  const fromBlock = envState.env?.fromBlock ?? 0n;

  React.useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!seller) return;
      try {
        const data = await fetchJson<PublicUserProfileResponse>(`/users/${seller}`, { timeoutMs: 5_000 });
        if (!cancelled) setProfile(data);
      } catch {
        if (!cancelled) setProfile(null);
      }
    }

    async function run() {
      try {
        setIsLoading(true);
        setError(null);
        setListings([]);

        if (!seller) throw new Error("Invalid seller address");

        // Prefer backend indexer API (fast). If it returns no items, fall back to on-chain.
        try {
          const resp = await fetchJson<{ items: Array<{ id: string; chainKey: string; seller: string; saleType: number; token: string; price: string; metadataURI: string; active: 0 | 1 }> }>(
            `/seller/${seller}/listings?limit=50&offset=0`,
            { timeoutMs: 5_000 }
          );

          if (resp.items.length > 0) {
            const rows: ListingSummary[] = resp.items.slice(0, 50).map((row) => ({
              chainKey: row.chainKey,
              id: row.id as Hex,
              seller: row.seller as Address,
              buyer: "0x0000000000000000000000000000000000000000" as Address,
              saleType: row.saleType as SaleType,
              token: row.token as Address,
              price: BigInt(row.price),
              metadataURI: row.metadataURI,
              status: (row.active ? 1 : 2) as ListingStatus,
            }));

            const filtered = rows.filter((row) => row.seller.toLowerCase() === seller.toLowerCase() && !isSmokeMetadataUri(row.metadataURI));
            if (!cancelled) setListings(filtered);
            return;
          }
        } catch {
          // fall back to on-chain
        }

        if (!publicClient || !marketplaceRegistryAddress) throw new Error("No public client");

        const latest = await publicClient.getBlockNumber();
        const safeFromBlock = latest > SAFE_LOG_SCAN_BLOCKS ? latest - SAFE_LOG_SCAN_BLOCKS : 0n;

        const primaryFromBlock =
          fromBlock !== 0n ? (fromBlock > latest ? safeFromBlock : fromBlock) : safeFromBlock;

        let logs;
        try {
          logs = await publicClient.getLogs({
            address: marketplaceRegistryAddress,
            event: listingCreatedEvent,
            fromBlock: primaryFromBlock,
            toBlock: "latest",
          });
        } catch (e) {
          if (isRateLimitError(e)) {
            throw new Error(
              "Marketplace activity is temporarily rate limited. Refresh in a moment and try again."
            );
          }
          throw e;
        }

        const ids = logs
          .map((log) => getListingEventArgs(log.args))
          .filter((log) => log.seller?.toLowerCase() === seller.toLowerCase())
          .map((log) => log.id)
          .filter(Boolean)
          .map((id) => id as Hex)
          .reverse();
        const uniqueIds = Array.from(new Set(ids)).slice(0, 50);

        const results = await publicClient.multicall({
          allowFailure: true,
          contracts: uniqueIds.map((id) => ({
            address: marketplaceRegistryAddress,
            abi: marketplaceRegistryAbi,
            functionName: "listings",
            args: [id],
          })),
        });

        const rows: ListingSummary[] = [];
        for (let i = 0; i < uniqueIds.length; i++) {
          const id = uniqueIds[i];
          const r = results[i];
          if (!r || r.status !== "success") continue;
          const parsed = parseListing(r.result);
          const candidate = {
            chainKey: defaultChainKey,
            id,
            seller: parsed.seller,
            buyer: parsed.buyer,
            saleType: parsed.saleType,
            token: parsed.token,
            price: parsed.price,
            metadataURI: parsed.metadataURI,
            status: parsed.status,
          } satisfies ListingSummary;
          if (!isSmokeMetadataUri(candidate.metadataURI)) {
            rows.push(candidate);
          }
        }

        const filtered = rows.filter((r) => r.seller.toLowerCase() === seller.toLowerCase());
        if (!cancelled) setListings(filtered);
      } catch (error: unknown) {
        if (!cancelled) setError(getErrorMessage(error, "Failed to load seller listings"));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadProfile();
    run();
    return () => {
      cancelled = true;
    };
  }, [defaultChainKey, fromBlock, marketplaceRegistryAddress, publicClient, seller]);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!auth.isAuthenticated || !canFollow || !seller) {
        if (!cancelled) setIsFollowing(false);
        return;
      }

      try {
        const data = await fetchJson<{ isFollowing: boolean }>(`/users/${seller}/follow-state`, { timeoutMs: 5_000 });
        if (!cancelled) setIsFollowing(Boolean(data.isFollowing));
      } catch {
        if (!cancelled) setIsFollowing(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated, canFollow, seller]);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      const ids = listings
        .map((l) => metadataIdFromUri(l.metadataURI))
        .filter(Boolean) as string[];
      const missing = Array.from(new Set(ids)).filter((id) => !metadataById[id]);
      if (missing.length === 0) return;

      try {
        const results = await Promise.all(
          missing.map(async (id) => {
            try {
              return await fetchMetadataById(id);
            } catch {
              return null;
            }
          })
        );

        if (cancelled) return;
        setMetadataById((current) => {
          const next = { ...current };
          for (const md of results) {
            if (md?.id) next[md.id] = md;
          }
          return next;
        });
      } catch {
        // ignore
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [listings, metadataById]);

  async function toggleFollow() {
    if (!seller || !canFollow) return;
    try {
      setIsFollowLoading(true);
      if (isFollowing) {
        await fetchJson<{ ok: true }>(`/users/${seller}/follow`, {
          method: "DELETE",
          timeoutMs: 7_000,
        });
      } else {
        await fetchJson<{ ok: true }>(`/users/${seller}/follow`, {
          method: "POST",
          timeoutMs: 7_000,
        });
      }

      setIsFollowing((current) => {
        const next = !current;
        setProfile((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            stats: {
              ...prev.stats,
              followerCount: Math.max(0, prev.stats.followerCount + (next ? 1 : -1)),
            },
          };
        });
        return next;
      });
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Failed to update follow state"));
    } finally {
      setIsFollowLoading(false);
    }
  }

  if (envState.error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">{envState.error}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Seller profile</h1>
        <p className="text-sm text-muted-foreground break-all">{seller ? seller : address}</p>
      </div>

      {profile ? (
        <Card>
          <CardHeader>
            <div className="flex items-start gap-4">
              {profile.user.avatarCid ? (
                <div className="relative h-20 w-20 overflow-hidden rounded-full border bg-muted">
                  <Image
                    src={ipfsToHttp(profile.user.avatarCid)}
                    alt={profile.user.displayName ?? "Seller avatar"}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <CardTitle>{profile.user.displayName?.trim() || shortenHex(profile.user.address)}</CardTitle>
                <CardDescription>{profile.user.bio?.trim() || "No seller bio yet."}</CardDescription>
                <SellerTrustSummary profile={profile} variant="detail" />
                {canFollow ? (
                  <div className="pt-1">
                    <Button type="button" variant={isFollowing ? "outline" : "default"} size="sm" onClick={() => void toggleFollow()} disabled={isFollowLoading}>
                      {isFollowLoading ? "Saving…" : isFollowing ? "Unfollow" : "Follow"}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-muted-foreground">Listings</div>
              <div className="font-medium">{profile.stats.listingCount}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Location</div>
              <div className="font-medium">{[profile.stats.location?.city, profile.stats.location?.region, profile.stats.location?.postalCode].filter(Boolean).join(", ") || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Joined</div>
              <div className="font-medium">{new Date(profile.user.createdAt).toLocaleDateString()}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Follower count</div>
              <div className="font-medium">{profile.stats.followerCount}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Response rate</div>
              <div className="font-medium">{formatPercent(profile.stats.responseRate)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Reputation</div>
              <div className="font-medium">{formatReputation(profile.stats.reputation)}</div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card>
          <CardContent className="p-6 space-y-2">
            <div className="text-sm font-semibold text-destructive">Seller activity could not be loaded</div>
            <div className="text-sm text-muted-foreground break-words">{error}</div>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !error && listings.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">This seller does not have any active listings right now. Check back later or return to the marketplace to browse other ads.</CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-56" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                </CardContent>
              </Card>
            ))
          : listings.map((l) => {
              const native = isNativeToken(l.token);
              const mdId = metadataIdFromUri(l.metadataURI);
              const md = mdId ? metadataById[mdId] : undefined;
              return (
                <Link key={l.id} href={buildListingHref(l.id, l.chainKey)} className="block">
                  <Card className="h-full transition-colors hover:bg-accent/30 active:bg-accent/40">
                    <CardHeader>
                      <div className="overflow-hidden rounded-md border bg-muted">
                        <div className="relative aspect-video w-full">
                          <Image
                            src={getRenderableListingImage(md?.image)}
                            alt={md?.title ?? "Listing preview"}
                            fill
                            className="object-cover"
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                            unoptimized
                            priority={false}
                          />
                        </div>
                      </div>
                      {!md ? <div className="rounded-md border border-dashed bg-accent/20 px-3 py-2 text-xs text-muted-foreground">Listing details are still syncing.</div> : null}
                      <CardTitle className="text-base">{md?.title ?? `${saleTypeLabel(l.saleType)} listing`}</CardTitle>
                      <CardDescription className="text-sm">
                        {md?.description ? md.description : "Price and seller data are available now. Photos and description will appear once metadata is available."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between gap-3">
                      <div className="text-sm">
                        <div className="font-medium">{formatPrice(l.price, native)}</div>
                        <div className="text-xs text-muted-foreground">Seller: {shortenHex(l.seller)}</div>
                        {l.buyer && l.buyer.toLowerCase() !== "0x0000000000000000000000000000000000000000" ? (
                          <div className="text-xs text-muted-foreground">Buyer: {shortenHex(l.buyer)}</div>
                        ) : null}
                      </div>
                      <Badge variant="outline">{statusLabel(l.status)}</Badge>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
      </div>
    </div>
  );
}
