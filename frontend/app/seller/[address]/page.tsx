"use client";

import * as React from "react";
import { use } from "react";
import Image from "next/image";
import Link from "next/link";
import { type Address, type Hex, isAddress, parseAbiItem } from "viem";
import { usePublicClient } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { fetchJson } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { marketplaceRegistryAbi } from "@/lib/contracts/abi/MarketplaceRegistry";
import { parseListing } from "@/lib/contracts/parse";
import { isNativeToken, saleTypeLabel, statusLabel, type ListingStatus, type SaleType } from "@/lib/contracts/types";
import { formatPrice, shortenHex } from "@/lib/format";
import { fetchMetadataById, metadataIdFromUri, type MarketplaceMetadata } from "@/lib/metadata";

type ListingSummary = {
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

function isRateLimitError(err: unknown): boolean {
  const anyErr = err as any;
  const message = String(anyErr?.shortMessage ?? anyErr?.message ?? "");
  const details = String(anyErr?.details ?? "");
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

  const [listings, setListings] = React.useState<ListingSummary[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [metadataById, setMetadataById] = React.useState<Record<string, MarketplaceMetadata>>({});

  let env: ReturnType<typeof getEnv>;
  try {
    env = getEnv();
  } catch (e: any) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">{e?.message ?? "Missing env vars"}</CardContent>
      </Card>
    );
  }

  const address = resolvedParams?.address;
  const seller = isAddress(address) ? (address as Address) : null;

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setIsLoading(true);
        setError(null);
        setListings([]);

        if (!seller) throw new Error("Invalid seller address");

        // Prefer backend indexer API (fast). If it returns no items, fall back to on-chain.
        try {
          const resp = await fetchJson<{ items: Array<{ id: string }> }>(
            `/seller/${seller}/listings?limit=50&offset=0`,
            { timeoutMs: 5_000 }
          );

          const ids = resp.items.map((r) => r.id as Hex);
          const uniqueIds = Array.from(new Set(ids)).slice(0, 50);

          if (uniqueIds.length > 0) {
            if (!publicClient) throw new Error("No public client");

            const results = await publicClient.multicall({
              allowFailure: true,
              contracts: uniqueIds.map((id) => ({
                address: env.marketplaceRegistryAddress,
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
              rows.push({
                id,
                seller: parsed.seller,
                buyer: parsed.buyer,
                saleType: parsed.saleType,
                token: parsed.token,
                price: parsed.price,
                metadataURI: parsed.metadataURI,
                status: parsed.status,
              });
            }

            const filtered = rows.filter((r) => r.seller.toLowerCase() === seller.toLowerCase());
            if (!cancelled) setListings(filtered);
            return;
          }
        } catch {
          // fall back to on-chain
        }

        if (!publicClient) throw new Error("No public client");

        const latest = await publicClient.getBlockNumber();
        const safeFromBlock = latest > SAFE_LOG_SCAN_BLOCKS ? latest - SAFE_LOG_SCAN_BLOCKS : 0n;

        const primaryFromBlock =
          env.fromBlock !== 0n ? (env.fromBlock > latest ? safeFromBlock : env.fromBlock) : safeFromBlock;

        let logs;
        try {
          logs = await publicClient.getLogs({
            address: env.marketplaceRegistryAddress,
            event: listingCreatedEvent,
            fromBlock: primaryFromBlock,
            toBlock: "latest",
          });
        } catch (e) {
          if (isRateLimitError(e)) {
            throw new Error(
              "RPC rate limited (429). Configure a higher-limit Sepolia RPC (NEXT_PUBLIC_SEPOLIA_RPC_URL / NEXT_PUBLIC_SEPOLIA_RPC_FALLBACK_URL) and restart the dev server."
            );
          }
          throw e;
        }

        const ids = logs
          .filter((l) => (l.args as any).seller?.toLowerCase?.() === seller.toLowerCase())
          .map((l) => (l.args as any).id as Hex)
          .filter(Boolean)
          .reverse();
        const uniqueIds = Array.from(new Set(ids)).slice(0, 50);

        const results = await publicClient.multicall({
          allowFailure: true,
          contracts: uniqueIds.map((id) => ({
            address: env.marketplaceRegistryAddress,
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
          rows.push({
            id,
            seller: parsed.seller,
            buyer: parsed.buyer,
            saleType: parsed.saleType,
            token: parsed.token,
            price: parsed.price,
            metadataURI: parsed.metadataURI,
            status: parsed.status,
          });
        }

        const filtered = rows.filter((r) => r.seller.toLowerCase() === seller.toLowerCase());
        if (!cancelled) setListings(filtered);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load seller listings");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [env.fromBlock, env.marketplaceRegistryAddress, publicClient, seller]);

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
        const next = { ...metadataById };
        for (const md of results) {
          if (md?.id) next[md.id] = md;
        }
        setMetadataById(next);
      } catch {
        // ignore
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [listings]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Seller</h1>
        <p className="text-sm text-muted-foreground break-all">{seller ? seller : address}</p>
      </div>

      {error ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {!isLoading && !error && listings.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">No listings found for this seller.</CardContent>
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
                <Link key={l.id} href={`/listing/${l.id}`} className="block">
                  <Card className="h-full transition-colors hover:bg-accent/30 active:bg-accent/40">
                    <CardHeader>
                      {md?.image ? (
                        <div className="overflow-hidden rounded-md border bg-muted">
                          <div className="relative aspect-video w-full">
                            <Image
                              src={md.image}
                              alt={md.title ?? "Listing image"}
                              fill
                              className="object-cover"
                              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                              unoptimized
                              priority={false}
                            />
                          </div>
                        </div>
                      ) : null}
                      {md?.image ? (
                        <div className="truncate text-xs text-muted-foreground">Image: {md.image}</div>
                      ) : null}
                      <CardTitle className="text-base">{md?.title ?? saleTypeLabel(l.saleType as any)}</CardTitle>
                      <CardDescription className="text-sm">
                        {md?.description ? md.description : l.metadataURI || shortenHex(l.id)}
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
                      <Badge variant="outline">{statusLabel(l.status as any)}</Badge>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
      </div>
    </div>
  );
}
