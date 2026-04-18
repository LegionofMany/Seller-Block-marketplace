"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type Address, type Hex, isAddress, parseAbiItem, zeroAddress } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { toast } from "sonner";

import { ListingCard } from "@/components/listing/ListingCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

import { useAuth } from "@/components/providers/AuthProvider";
import { getEnv } from "@/lib/env";
import { fetchJson } from "@/lib/api";
import { CATEGORY_TREE, subcategoriesFor } from "@/lib/categories";
import { marketplaceRegistryAbi } from "@/lib/contracts/abi/MarketplaceRegistry";
import { escrowVaultAbi } from "@/lib/contracts/abi/EscrowVault";
import { parseListing } from "@/lib/contracts/parse";
import { statusLabel } from "@/lib/contracts/types";
import { shortenHex } from "@/lib/format";
import { type UserProfile } from "@/lib/auth";
import { buildListingHref } from "@/lib/listings";
import { type ListingSummary } from "@/lib/hooks/useListings";

const listingCreatedEvent = parseAbiItem(
  "event ListingCreated(bytes32 indexed id, address seller, uint8 saleType, address token, uint256 price, string metadataURI)"
);

type SavedSearch = {
  id: number;
  name: string;
  email?: string | null;
  filters: SavedSearchFilters;
  createdAt: number;
  updatedAt: number;
};

type SavedSearchFilters = {
  q?: string;
  category?: string;
  subcategory?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  minPrice?: string;
  maxPrice?: string;
  type?: "fixed" | "auction" | "raffle";
  sort?: "newest" | "price_asc" | "price_desc";
};

type SavedSearchDraft = {
  name: string;
  email: string;
  filters: SavedSearchFilters;
};

type FavoriteListing = {
  listingChainKey: string;
  listingId: string;
  createdAt: number;
};

type BackendListingRow = {
  chainKey: string;
  chainId: number;
  id: string;
  seller: string;
  metadataURI: string;
  price: string;
  token: string;
  saleType: number;
  active: 0 | 1;
};

type NotificationItem = {
  id: number;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  readAt?: number | null;
  createdAt: number;
};

type PromotionAdminItem = {
  id: number;
  listingId: string;
  listingChainKey: string;
  type: string;
  status: "draft" | "active" | "paused" | "archived";
  priority: number;
  placementSlot?: string | null;
  campaignName?: string | null;
  sponsorLabel?: string | null;
  createdBy?: string | null;
  notes?: string | null;
  startsAt: number;
  endsAt: number;
  createdAt: number;
  updatedAt: number;
};

type PromotionDraft = {
  listingId: string;
  listingChainKey: string;
  status: PromotionAdminItem["status"];
  priority: number;
  placementSlot: string;
  campaignName: string;
  sponsorLabel: string;
  notes: string;
  startsAt: string;
  endsAt: string;
};

type AccountTab = "profile" | "follows" | "garage" | "dealer-garage";

function formatFilters(filters: SavedSearchFilters) {
  return Object.entries(filters)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" • ");
}

function formatDateTime(value: number) {
  return new Date(value).toLocaleString();
}

function formatDateTimeInput(value: number) {
  const date = new Date(value);
  const offsetMinutes = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offsetMinutes * 60_000);
  return local.toISOString().slice(0, 16);
}

function parseDateTimeInput(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toListingSummary(row: BackendListingRow): ListingSummary {
  return {
    chainKey: row.chainKey,
    chainId: row.chainId,
    id: row.id as Hex,
    seller: row.seller as Address,
    saleType: row.saleType as 0 | 1 | 2,
    token: row.token as Address,
    price: BigInt(row.price),
    metadataURI: row.metadataURI,
    status: (row.active ? 1 : 2) as 1 | 2,
  };
}

function emptyPromotionDraft(defaultChainKey: string): PromotionDraft {
  const now = Date.now();
  return {
    listingId: "",
    listingChainKey: defaultChainKey,
    status: "active",
    priority: 90,
    placementSlot: "homepage-hero",
    campaignName: "",
    sponsorLabel: "",
    notes: "",
    startsAt: formatDateTimeInput(now),
    endsAt: formatDateTimeInput(now + 7 * 24 * 60 * 60 * 1000),
  };
}

function toPromotionDraft(item: PromotionAdminItem): PromotionDraft {
  return {
    listingId: item.listingId,
    listingChainKey: item.listingChainKey,
    status: item.status,
    priority: item.priority,
    placementSlot: item.placementSlot ?? "",
    campaignName: item.campaignName ?? "",
    sponsorLabel: item.sponsorLabel ?? "",
    notes: item.notes ?? "",
    startsAt: formatDateTimeInput(item.startsAt),
    endsAt: formatDateTimeInput(item.endsAt),
  };
}

function toSavedSearchDraft(item: SavedSearch): SavedSearchDraft {
  return {
    name: item.name,
    email: item.email ?? "",
    filters: {
      ...(item.filters.q ? { q: item.filters.q } : {}),
      ...(item.filters.category ? { category: item.filters.category } : {}),
      ...(item.filters.subcategory ? { subcategory: item.filters.subcategory } : {}),
      ...(item.filters.city ? { city: item.filters.city } : {}),
      ...(item.filters.region ? { region: item.filters.region } : {}),
      ...(item.filters.postalCode ? { postalCode: item.filters.postalCode } : {}),
      ...(item.filters.minPrice ? { minPrice: item.filters.minPrice } : {}),
      ...(item.filters.maxPrice ? { maxPrice: item.filters.maxPrice } : {}),
      ...(item.filters.type ? { type: item.filters.type } : {}),
      ...(item.filters.sort ? { sort: item.filters.sort } : {}),
    },
  };
}

function cleanSavedSearchDraft(draft: SavedSearchDraft) {
  const filters = Object.fromEntries(
    Object.entries(draft.filters).flatMap(([key, value]) => {
      if (typeof value !== "string") return [];
      const trimmed = value.trim();
      return trimmed ? [[key, trimmed]] : [];
    })
  ) as SavedSearchFilters;

  return {
    name: draft.name.trim(),
    email: draft.email.trim(),
    filters,
  };
}

export default function DashboardPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [accountTab, setAccountTab] = React.useState<AccountTab>("profile");
  const [fullName, setFullName] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [avatarCid, setAvatarCid] = React.useState("");
  const [streetAddress1, setStreetAddress1] = React.useState("");
  const [streetAddress2, setStreetAddress2] = React.useState("");
  const [city, setCity] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [postalCode, setPostalCode] = React.useState("");
  const [followedSellers, setFollowedSellers] = React.useState<string[]>([]);
  const [followedError, setFollowedError] = React.useState<string | null>(null);
  const [favoriteListings, setFavoriteListings] = React.useState<ListingSummary[]>([]);
  const [favoriteError, setFavoriteError] = React.useState<string | null>(null);

  const [token, setToken] = React.useState<string>("");
  const [vaultController, setVaultController] = React.useState<string>("");
  const [vaultArbiter, setVaultArbiter] = React.useState<string>("");
  const [registryArbiter, setRegistryArbiter] = React.useState<string>("");
  const [feesToken, setFeesToken] = React.useState<string>("");

  const [inspectEscrowId, setInspectEscrowId] = React.useState<string>("");
  const [escrowInfo, setEscrowInfo] = React.useState<
    | null
    | {
        buyer: Address;
        seller: Address;
        token: Address;
        amount: bigint;
        status: number;
      }
  >(null);

  const [creditRecipient, setCreditRecipient] = React.useState<string>("");
  const [creditToken, setCreditToken] = React.useState<string>("");
  const [creditAmount, setCreditAmount] = React.useState<bigint | null>(null);
  const [myListingIds, setMyListingIds] = React.useState<Hex[] | null>(null);
  const [myListings, setMyListings] = React.useState<Array<{ id: Hex; status: number; buyer: Address }> | null>(null);
  const [savedSearches, setSavedSearches] = React.useState<SavedSearch[]>([]);
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = React.useState(0);
  const [editingSavedSearchId, setEditingSavedSearchId] = React.useState<number | null>(null);
  const [savedSearchDraft, setSavedSearchDraft] = React.useState<SavedSearchDraft | null>(null);
  const [isSavingSavedSearch, setIsSavingSavedSearch] = React.useState(false);
  const [dashboardRefreshKey, setDashboardRefreshKey] = React.useState(0);
  const [promotions, setPromotions] = React.useState<PromotionAdminItem[]>([]);
  const [isLoadingPromotions, setIsLoadingPromotions] = React.useState(false);
  const [isSavingPromotion, setIsSavingPromotion] = React.useState(false);
  const [editingPromotionId, setEditingPromotionId] = React.useState<number | null>(null);
  const [promotionDraft, setPromotionDraft] = React.useState<PromotionDraft | null>(null);

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

  React.useEffect(() => {
    setFullName(auth.user?.fullName ?? "");
    setDisplayName(auth.user?.displayName ?? "");
    setBio(auth.user?.bio ?? "");
    setAvatarCid(auth.user?.avatarCid ?? "");
    setStreetAddress1(auth.user?.streetAddress1 ?? "");
    setStreetAddress2(auth.user?.streetAddress2 ?? "");
    setCity(auth.user?.city ?? "");
    setRegion(auth.user?.region ?? "");
    setPostalCode(auth.user?.postalCode ?? "");
  }, [auth.user]);

  React.useEffect(() => {
    const requestedTab = searchParams.get("tab");
    const nextTab: AccountTab = requestedTab === "follows" || requestedTab === "garage" || requestedTab === "dealer-garage" ? requestedTab : "profile";
    setAccountTab((current) => (current === nextTab ? current : nextTab));
  }, [searchParams]);

  const selectAccountTab = React.useCallback(
    (nextTab: AccountTab) => {
      setAccountTab(nextTab);
      const params = new URLSearchParams(searchParams.toString());
      if (nextTab === "profile") {
        params.delete("tab");
      } else {
        params.set("tab", nextTab);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!auth.isAuthenticated) {
        setFollowedSellers([]);
        setFollowedError(null);
        return;
      }

      try {
        const res = await fetchJson<{ items: string[] }>("/users/me/follows", { timeoutMs: 5_000 });
        if (!cancelled) {
          setFollowedSellers((res.items ?? []).map((item) => String(item).toLowerCase()));
          setFollowedError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setFollowedSellers([]);
          setFollowedError(e?.message ?? "Could not load followed sellers");
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated]);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!auth.isAuthenticated) {
        setFavoriteListings([]);
        setFavoriteError(null);
        return;
      }

      try {
        const favorites = await fetchJson<{ items: FavoriteListing[] }>("/favorites/listings", { timeoutMs: 5_000 });
        const uniqueKeys = Array.from(new Set((favorites.items ?? []).map((item) => `${item.listingChainKey}:${item.listingId}`))).slice(0, 12);
        const listingResponses = await Promise.all(
          uniqueKeys.map(async (key) => {
            const [chainKey, listingId] = key.split(":");
            const detail = await fetchJson<{ listing: BackendListingRow }>(`/listings/${listingId}?chain=${encodeURIComponent(chainKey)}`, { timeoutMs: 5_000 });
            return toListingSummary(detail.listing);
          })
        );

        if (!cancelled) {
          setFavoriteListings(listingResponses);
          setFavoriteError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setFavoriteListings([]);
          setFavoriteError(e?.message ?? "Could not load favorite listings");
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated]);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!auth.isAuthenticated) {
        setSavedSearches([]);
        setNotifications([]);
        setNotificationUnreadCount(0);
        return;
      }

      try {
        const [savedSearchRes, notificationRes] = await Promise.all([
          fetchJson<{ items: SavedSearch[] }>("/saved-searches", { timeoutMs: 5_000 }),
          fetchJson<{ items: NotificationItem[]; unreadCount: number }>("/notifications?limit=12", { timeoutMs: 5_000 }),
        ]);
        if (cancelled) return;
        setSavedSearches(savedSearchRes.items ?? []);
        setNotifications(notificationRes.items ?? []);
        setNotificationUnreadCount(notificationRes.unreadCount ?? 0);
      } catch (e: any) {
        if (!cancelled) {
          toast.error(e?.message ?? "Failed to load dashboard alerts");
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated, dashboardRefreshKey]);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!auth.isAuthenticated || !auth.isAdmin) {
        setPromotions([]);
        setEditingPromotionId(null);
        setPromotionDraft(null);
        return;
      }

      try {
        setIsLoadingPromotions(true);
        const res = await fetchJson<{ items: PromotionAdminItem[] }>("/promotions/admin?type=homepage_sponsored", { timeoutMs: 7_000 });
        if (cancelled) return;
        setPromotions(res.items ?? []);
        setPromotionDraft((current) => current ?? emptyPromotionDraft(env.defaultChain.key));
      } catch (e: any) {
        if (!cancelled) {
          toast.error(e?.message ?? "Failed to load MarketHub placements");
        }
      } finally {
        if (!cancelled) setIsLoadingPromotions(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated, auth.isAdmin, dashboardRefreshKey, env.defaultChain.key]);

  const activeSavedSearchSubcategories = React.useMemo(() => {
    if (!savedSearchDraft?.filters.category) return [];
    return subcategoriesFor(savedSearchDraft.filters.category);
  }, [savedSearchDraft?.filters.category]);

  const accountTabs = React.useMemo(
    () => [
      { key: "profile" as const, label: "Profile", description: "Identity, address, and account settings", count: auth.user?.postalCode?.trim() ? auth.user.postalCode.trim() : auth.user?.email?.trim() || "Setup" },
      { key: "follows" as const, label: "Follows", description: "Seller profiles you want to revisit", count: String(followedSellers.length) },
      { key: "garage" as const, label: "Garage", description: "Favorite listings saved for later", count: String(favoriteListings.length) },
      { key: "dealer-garage" as const, label: "Dealer Garage", description: "Listings connected to your seller wallet", count: Array.isArray(myListingIds) ? String(myListingIds.length) : "-" },
    ],
    [auth.user?.email, auth.user?.postalCode, favoriteListings.length, followedSellers.length, myListingIds]
  );

  const activeTabMeta = accountTabs.find((tab) => tab.key === accountTab) ?? accountTabs[0];

  const { data: lastListingId } = useReadContract({
    address: env.marketplaceRegistryAddress,
    abi: marketplaceRegistryAbi,
    functionName: "lastListingIdOf",
    args: address ? [address as Address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const { data: registryOwner } = useReadContract({
    address: env.marketplaceRegistryAddress,
    abi: marketplaceRegistryAbi,
    functionName: "owner",
    query: { retry: 1 },
  });

  const { data: protocolFeeBps } = useReadContract({
    address: env.marketplaceRegistryAddress,
    abi: marketplaceRegistryAbi,
    functionName: "protocolFeeBps",
    query: { retry: 1 },
  });

  const { data: feeRecipient } = useReadContract({
    address: env.marketplaceRegistryAddress,
    abi: marketplaceRegistryAbi,
    functionName: "feeRecipient",
    query: { retry: 1 },
  });

  const { data: vaultOwner } = useReadContract({
    address: env.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "owner",
    query: { enabled: env.escrowVaultAddress !== zeroAddress, retry: 1 },
  });

  const { data: vaultControllerOnchain } = useReadContract({
    address: env.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "controller",
    query: { enabled: env.escrowVaultAddress !== zeroAddress, retry: 1 },
  });

  const { data: vaultArbiterOnchain } = useReadContract({
    address: env.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "arbiter",
    query: { enabled: env.escrowVaultAddress !== zeroAddress, retry: 1 },
  });

  const isRegistryOwner = Boolean(
    address && typeof registryOwner === "string" && address.toLowerCase() === registryOwner.toLowerCase()
  );
  const isVaultOwner = Boolean(
    address && typeof vaultOwner === "string" && address.toLowerCase() === vaultOwner.toLowerCase()
  );

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!address) {
        setMyListingIds([]);
        setMyListings([]);
        return;
      }

      // Prefer backend API (indexed DB). Fallback to on-chain logs if API isn't available.
      try {
        setMyListingIds(null);
        const resp = await fetchJson<{ items: Array<{ id: string }> }>(
          `/seller/${address}/listings?limit=100&offset=0`,
          { timeoutMs: 5_000 }
        );
        const ids = resp.items.map((r) => r.id as Hex);
        if (!cancelled) setMyListingIds(Array.from(new Set(ids)));
        return;
      } catch {
        // ignore, fallback below
      }

      if (!publicClient) {
        setMyListingIds([]);
        return;
      }
      try {
        setMyListingIds(null);
        const SAFE_LOG_SCAN_BLOCKS = 25_000n;
        const latest = await publicClient.getBlockNumber();
        const safeFromBlock = latest > SAFE_LOG_SCAN_BLOCKS ? latest - SAFE_LOG_SCAN_BLOCKS : 0n;

        const primaryFromBlock =
          env.fromBlock !== 0n ? (env.fromBlock > latest ? safeFromBlock : env.fromBlock) : safeFromBlock;

        const logs = await publicClient.getLogs({
          address: env.marketplaceRegistryAddress,
          event: listingCreatedEvent,
          fromBlock: primaryFromBlock,
          toBlock: "latest",
        });

        const ids = logs
          .filter((l) => (l.args as any).seller?.toLowerCase?.() === address.toLowerCase())
          .map((l) => (l.args as any).id as Hex)
          .reverse();
        if (!cancelled) setMyListingIds(Array.from(new Set(ids)));
      } catch {
        if (!cancelled) setMyListingIds([]);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [address, publicClient]);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!address) {
        setMyListings([]);
        return;
      }

      if (!publicClient) {
        setMyListings([]);
        return;
      }

      // Still loading IDs
      if (myListingIds === null) {
        setMyListings(null);
        return;
      }

      if (myListingIds.length === 0) {
        setMyListings([]);
        return;
      }

      try {
        setMyListings(null);
        const ids = myListingIds.slice(0, 50);
        const results = await publicClient.multicall({
          allowFailure: true,
          contracts: ids.map((id) => ({
            address: env.marketplaceRegistryAddress,
            abi: marketplaceRegistryAbi,
            functionName: "listings",
            args: [id],
          })),
        });

        const rows = ids
          .map((id, i) => {
            const r = results[i];
            if (!r || r.status !== "success") return null;
            const parsed = parseListing(r.result);
            return { id, status: Number(parsed.status), buyer: parsed.buyer };
          })
          .filter(Boolean) as Array<{ id: Hex; status: number; buyer: Address }>;

        if (!cancelled) setMyListings(rows);
      } catch {
        if (!cancelled) setMyListings([]);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [address, publicClient, myListingIds]);

  return (
    <div className="space-y-6">
      <section className="market-hero px-4 py-5 sm:px-8 sm:py-8">
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-end">
          <div className="space-y-4">
            <div className="market-section-title">Your account</div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Run your account like a local marketplace hub.</h1>
              <p className="max-w-2xl text-[13px] leading-6 text-muted-foreground sm:text-base">Profile, follows, saved garage items, and dealer inventory now sit behind a clearer account shell. Wallet and owner utilities still exist, but they no longer compete with the main account flow.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
            <div className="market-stat">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Follows</div>
              <div className="mt-2 text-2xl font-semibold">{followedSellers.length}</div>
            </div>
            <div className="market-stat">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Garage saves</div>
              <div className="mt-2 text-2xl font-semibold">{favoriteListings.length}</div>
            </div>
            <div className="market-stat">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Unread alerts</div>
              <div className="mt-2 text-2xl font-semibold">{notificationUnreadCount}</div>
            </div>
            <div className="market-stat">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Dealer garage</div>
              <div className="mt-2 text-2xl font-semibold">{Array.isArray(myListingIds) ? myListingIds.length : "—"}</div>
              <div className="mt-1 text-sm text-muted-foreground">Listings tied to your current seller wallet.</div>
            </div>
          </div>
        </div>
      </section>

      <div className="market-tab-strip -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Account sections">
        {accountTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={accountTab === tab.key}
            className={accountTab === tab.key ? "market-tab-button market-tab-button-active" : "market-tab-button"}
            onClick={() => selectAccountTab(tab.key)}
          >
            <span className="text-sm font-semibold text-slate-950">{tab.label}</span>
            <span className="mt-1 text-xs text-muted-foreground">{tab.description}</span>
            <span className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{tab.count}</span>
          </button>
        ))}
      </div>

      <div className="market-tab-affordance sm:hidden" aria-hidden="true">
        Swipe to see Garage and Dealer Garage.
      </div>

      <Card className="market-panel border-slate-200/80 bg-white/78">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <div className="market-section-title">{activeTabMeta.label}</div>
            <div className="mt-1 text-sm text-muted-foreground">{activeTabMeta.description}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {accountTab === "garage" ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/marketplace">Browse listings</Link>
              </Button>
            ) : null}
            {accountTab === "follows" ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/marketplace">Find sellers</Link>
              </Button>
            ) : null}
            {accountTab === "dealer-garage" ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/create">Create listing</Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-6">
        <div className="space-y-4 sm:space-y-6">
          {accountTab === "profile" ? (
            <>
              <Card className="market-panel">
                <CardHeader>
                  <div className="market-section-title">Public profile</div>
                  <CardTitle>Profile</CardTitle>
                  <CardDescription>Update the account identity buyers, alerts, and local discovery use across your marketplace session.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
                  {!auth.isAuthenticated ? (
                    <div className="space-y-3 text-sm">
                      <div className="text-muted-foreground">Sign in with email or wallet to edit your profile and location settings.</div>
                      {address && !auth.isAuthenticated ? (
                        <Button type="button" variant="outline" size="lg" className="w-full sm:w-auto" disabled={auth.isLoading} onClick={() => void auth.signIn()}>
                          Sign in with wallet
                        </Button>
                      ) : null}
                      <Button asChild type="button" variant="outline" size="lg" className="w-full sm:w-auto">
                        <Link href="/sign-in">Open sign-in</Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      <div className="flex flex-wrap gap-2 text-xs">
                        {auth.user?.email?.trim() ? <span className="market-chip">Email account</span> : null}
                        {auth.user?.postalCode?.trim() ? <span className="market-chip">Local zone {auth.user.postalCode.trim()}</span> : null}
                        {address ? <span className="market-chip">Wallet {shortenHex(address)}</span> : null}
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Full name</Label>
                          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Victor Adeyemi" />
                        </div>
                        <div className="space-y-2">
                          <Label>Display name</Label>
                          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Victor's Store" />
                        </div>
                      </div>
                      {auth.user?.email ? (
                        <div className="space-y-2">
                          <Label>Email</Label>
                          <Input value={auth.user.email} disabled />
                        </div>
                      ) : null}
                      <div className="space-y-2">
                        <Label>Street address</Label>
                        <Input value={streetAddress1} onChange={(e) => setStreetAddress1(e.target.value)} placeholder="123 Market Street" />
                      </div>
                      <div className="space-y-2">
                        <Label>Address line 2</Label>
                        <Input value={streetAddress2} onChange={(e) => setStreetAddress2(e.target.value)} placeholder="Suite, unit, or landmark" />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                          <Label>City</Label>
                          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lagos" />
                        </div>
                        <div className="space-y-2">
                          <Label>Region / State</Label>
                          <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Lagos State" />
                        </div>
                        <div className="space-y-2">
                          <Label>Postal code</Label>
                          <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="100001" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Bio</Label>
                        <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell buyers what you sell and how to reach you." />
                      </div>
                      <div className="space-y-2">
                        <Label>Avatar URI (optional)</Label>
                        <Input value={avatarCid} onChange={(e) => setAvatarCid(e.target.value)} placeholder="ipfs://... or https://..." />
                      </div>
                      <Button
                        type="button"
                        size="lg"
                        className="w-full sm:w-auto"
                        disabled={auth.isLoading}
                        onClick={async () => {
                          try {
                            const res = await fetchJson<{ user: UserProfile }>("/users/me", {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                fullName,
                                displayName,
                                streetAddress1,
                                streetAddress2,
                                city,
                                region,
                                postalCode,
                                bio,
                                avatarCid,
                              }),
                            });
                            auth.setUser(res.user);
                            await auth.refresh();
                            toast.success("Profile updated");
                          } catch (e: any) {
                            toast.error(e?.message ?? "Failed to update profile");
                          }
                        }}
                      >
                        Save profile
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {auth.isAdmin ? (
        <Card className="market-panel border-amber-300/60 bg-[linear-gradient(180deg,rgba(255,252,244,0.92),rgba(255,255,255,0.98))]">
          <CardHeader>
            <div className="market-section-title">MarketHub admin</div>
            <CardTitle>Sponsored homepage placements</CardTitle>
            <CardDescription>Manage the inventory that appears in the sponsored layer on the landing page. Changes here write directly to the backend placement model.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="market-stat bg-white/90">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Total campaigns</div>
                <div className="mt-2 text-2xl font-semibold">{promotions.length}</div>
              </div>
              <div className="market-stat bg-white/90">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Live now</div>
                <div className="mt-2 text-2xl font-semibold">{promotions.filter((item) => item.status === "active").length}</div>
              </div>
              <div className="market-stat bg-white/90">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Admin identity</div>
                <div className="mt-2 break-all text-sm font-semibold">{auth.user?.email?.trim() || auth.address || "Signed in"}</div>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Current placement inventory</div>
                    <div className="text-sm text-muted-foreground">Review priority, timing, and sponsorship labels before they surface on the landing page.</div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingPromotionId(null);
                      setPromotionDraft(emptyPromotionDraft(env.defaultChain.key));
                    }}
                  >
                    New placement
                  </Button>
                </div>

                {isLoadingPromotions ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : promotions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed bg-white/70 p-4 text-sm text-muted-foreground">No sponsored placements exist yet. Create the first campaign from the form on the right.</div>
                ) : (
                  promotions.map((item) => (
                    <div key={item.id} className="rounded-2xl border bg-white/80 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-semibold">{item.campaignName?.trim() || item.sponsorLabel?.trim() || "Untitled placement"}</div>
                            <span className="rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{item.status}</span>
                            <span className="rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Priority {item.priority}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">Slot: {item.placementSlot || "homepage"}</div>
                          <div className="break-all text-xs text-muted-foreground">Listing: {item.listingId}</div>
                          <div className="text-xs text-muted-foreground">Window: {formatDateTime(item.startsAt)} to {formatDateTime(item.endsAt)}</div>
                          {item.notes ? <div className="text-sm text-slate-700">{item.notes}</div> : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingPromotionId(item.id);
                              setPromotionDraft(toPromotionDraft(item));
                            }}
                          >
                            Edit
                          </Button>
                          <Button asChild type="button" variant="ghost" size="sm">
                            <Link href={buildListingHref(item.listingId, item.listingChainKey)}>Open listing</Link>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isSavingPromotion}
                            onClick={async () => {
                              try {
                                setIsSavingPromotion(true);
                                await fetchJson(`/promotions/admin/${item.id}`, { method: "DELETE" });
                                setPromotions((current) => current.filter((entry) => entry.id !== item.id));
                                if (editingPromotionId === item.id) {
                                  setEditingPromotionId(null);
                                  setPromotionDraft(emptyPromotionDraft(env.defaultChain.key));
                                }
                                toast.success("Placement removed");
                              } catch (e: any) {
                                toast.error(e?.message ?? "Failed to remove placement");
                              } finally {
                                setIsSavingPromotion(false);
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="rounded-2xl border bg-white/90 p-4 sm:p-5">
                <div className="space-y-1">
                  <div className="text-sm font-semibold">{editingPromotionId ? "Update placement" : "Create placement"}</div>
                  <div className="text-sm text-muted-foreground">Use a real listing id and a clean campaign label so the landing page reads like curated inventory instead of raw ad tech.</div>
                </div>

                {promotionDraft ? (
                  <div className="mt-4 grid gap-4">
                    <div className="space-y-2">
                      <Label>Listing id</Label>
                      <Input
                        value={promotionDraft.listingId}
                        onChange={(e) => setPromotionDraft((current) => current ? { ...current, listingId: e.target.value } : current)}
                        placeholder="0x..."
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Chain key</Label>
                        <Input
                          value={promotionDraft.listingChainKey}
                          onChange={(e) => setPromotionDraft((current) => current ? { ...current, listingChainKey: e.target.value } : current)}
                          placeholder={env.defaultChain.key}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={promotionDraft.status}
                          onChange={(e) => setPromotionDraft((current) => current ? { ...current, status: e.target.value as PromotionDraft["status"] } : current)}
                        >
                          <option value="draft">Draft</option>
                          <option value="active">Active</option>
                          <option value="paused">Paused</option>
                          <option value="archived">Archived</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Campaign name</Label>
                        <Input
                          value={promotionDraft.campaignName}
                          onChange={(e) => setPromotionDraft((current) => current ? { ...current, campaignName: e.target.value } : current)}
                          placeholder="Weekend local spotlight"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Sponsor label</Label>
                        <Input
                          value={promotionDraft.sponsorLabel}
                          onChange={(e) => setPromotionDraft((current) => current ? { ...current, sponsorLabel: e.target.value } : current)}
                          placeholder="Zonycs MarketHub"
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Placement slot</Label>
                        <Input
                          value={promotionDraft.placementSlot}
                          onChange={(e) => setPromotionDraft((current) => current ? { ...current, placementSlot: e.target.value } : current)}
                          placeholder="homepage-hero"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Priority</Label>
                        <Input
                          type="number"
                          min={0}
                          max={1000}
                          value={promotionDraft.priority}
                          onChange={(e) => setPromotionDraft((current) => current ? { ...current, priority: Number(e.target.value || 0) } : current)}
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Start time</Label>
                        <Input
                          type="datetime-local"
                          value={promotionDraft.startsAt}
                          onChange={(e) => setPromotionDraft((current) => current ? { ...current, startsAt: e.target.value } : current)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>End time</Label>
                        <Input
                          type="datetime-local"
                          value={promotionDraft.endsAt}
                          onChange={(e) => setPromotionDraft((current) => current ? { ...current, endsAt: e.target.value } : current)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea
                        rows={4}
                        value={promotionDraft.notes}
                        onChange={(e) => setPromotionDraft((current) => current ? { ...current, notes: e.target.value } : current)}
                        placeholder="Why this placement exists, who approved it, and what part of the homepage it is meant to influence."
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        disabled={isSavingPromotion}
                        onClick={async () => {
                          if (!promotionDraft) return;

                          const startsAt = parseDateTimeInput(promotionDraft.startsAt);
                          const endsAt = parseDateTimeInput(promotionDraft.endsAt);
                          if (!promotionDraft.listingId.trim()) {
                            toast.error("Listing id is required");
                            return;
                          }
                          if (!promotionDraft.listingChainKey.trim()) {
                            toast.error("Chain key is required");
                            return;
                          }
                          if (startsAt == null || endsAt == null) {
                            toast.error("Start and end time are required");
                            return;
                          }
                          if (endsAt <= startsAt) {
                            toast.error("End time must be after start time");
                            return;
                          }

                          const payload = {
                            listingId: promotionDraft.listingId.trim(),
                            listingChainKey: promotionDraft.listingChainKey.trim(),
                            status: promotionDraft.status,
                            priority: Math.max(0, Math.min(1000, Number(promotionDraft.priority) || 0)),
                            placementSlot: promotionDraft.placementSlot.trim(),
                            campaignName: promotionDraft.campaignName.trim(),
                            sponsorLabel: promotionDraft.sponsorLabel.trim(),
                            notes: promotionDraft.notes.trim(),
                            startsAt,
                            endsAt,
                          };

                          try {
                            setIsSavingPromotion(true);
                            const res = await fetchJson<{ item: PromotionAdminItem }>(
                              editingPromotionId ? `/promotions/admin/${editingPromotionId}` : "/promotions/admin",
                              {
                                method: editingPromotionId ? "PUT" : "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(payload),
                              }
                            );

                            setPromotions((current) => {
                              if (editingPromotionId) {
                                return current.map((entry) => (entry.id === editingPromotionId ? res.item : entry));
                              }
                              return [res.item, ...current];
                            });
                            setEditingPromotionId(null);
                            setPromotionDraft(emptyPromotionDraft(env.defaultChain.key));
                            toast.success(editingPromotionId ? "Placement updated" : "Placement created");
                          } catch (e: any) {
                            toast.error(e?.message ?? "Failed to save placement");
                          } finally {
                            setIsSavingPromotion(false);
                          }
                        }}
                      >
                        {editingPromotionId ? "Save placement" : "Create placement"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isSavingPromotion}
                        onClick={() => {
                          setEditingPromotionId(null);
                          setPromotionDraft(emptyPromotionDraft(env.defaultChain.key));
                        }}
                      >
                        Reset
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
              ) : null}

              <Card className="market-panel">
        <CardHeader>
          <div className="market-section-title">Discovery</div>
          <CardTitle>Saved searches</CardTitle>
          <CardDescription>Review, edit, and remove the alert searches you saved from the listings page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
          {!auth.isAuthenticated ? (
            <div className="text-sm text-muted-foreground">Sign in to manage saved search alerts.</div>
          ) : savedSearches.length === 0 ? (
            <div className="text-sm text-muted-foreground">No saved searches yet.</div>
          ) : (
            savedSearches.map((item) => (
              <div key={item.id} className="rounded-md border p-3 sm:p-4">
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{formatFilters(item.filters)}</div>
                      {item.email ? <div className="text-xs text-muted-foreground">Email: {item.email}</div> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingSavedSearchId(item.id);
                          setSavedSearchDraft(toSavedSearchDraft(item));
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            await fetchJson(`/saved-searches/${item.id}`, { method: "DELETE" });
                            setSavedSearches((current) => current.filter((entry) => entry.id !== item.id));
                            if (editingSavedSearchId === item.id) {
                              setEditingSavedSearchId(null);
                              setSavedSearchDraft(null);
                            }
                            toast.success("Saved search removed");
                          } catch (e: any) {
                            toast.error(e?.message ?? "Failed to remove saved search");
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  {editingSavedSearchId === item.id && savedSearchDraft ? (
                    <div className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:gap-4 sm:p-4 lg:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                          value={savedSearchDraft.name}
                          onChange={(e) => setSavedSearchDraft((current) => (current ? { ...current, name: e.target.value } : current))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                          value={savedSearchDraft.email}
                          onChange={(e) => setSavedSearchDraft((current) => (current ? { ...current, email: e.target.value } : current))}
                          placeholder="name@example.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Keywords</Label>
                        <Input
                          value={savedSearchDraft.filters.q ?? ""}
                          onChange={(e) => setSavedSearchDraft((current) => current ? { ...current, filters: { ...current.filters, q: e.target.value } } : current)}
                          placeholder="Search title or description"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={savedSearchDraft.filters.category ?? ""}
                          onChange={(e) => setSavedSearchDraft((current) => current ? {
                            ...current,
                            filters: {
                              ...current.filters,
                              category: e.target.value || undefined,
                              subcategory: undefined,
                            },
                          } : current)}
                        >
                          <option value="">All</option>
                          {Object.keys(CATEGORY_TREE).map((category) => (
                            <option key={category} value={category}>{category}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Subcategory</Label>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={savedSearchDraft.filters.subcategory ?? ""}
                          onChange={(e) => setSavedSearchDraft((current) => current ? { ...current, filters: { ...current.filters, subcategory: e.target.value || undefined } } : current)}
                          disabled={!savedSearchDraft.filters.category}
                        >
                          <option value="">All</option>
                          {activeSavedSearchSubcategories.map((subcategory) => (
                            <option key={subcategory} value={subcategory}>{subcategory}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Sale type</Label>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={savedSearchDraft.filters.type ?? ""}
                          onChange={(e) => setSavedSearchDraft((current) => current ? { ...current, filters: { ...current.filters, type: (e.target.value || undefined) as SavedSearchFilters["type"] } } : current)}
                        >
                          <option value="">All</option>
                          <option value="fixed">Fixed</option>
                          <option value="auction">Auction</option>
                          <option value="raffle">Raffle</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Sort</Label>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={savedSearchDraft.filters.sort ?? "newest"}
                          onChange={(e) => setSavedSearchDraft((current) => current ? { ...current, filters: { ...current.filters, sort: e.target.value as SavedSearchFilters["sort"] } } : current)}
                        >
                          <option value="newest">Newest</option>
                          <option value="price_asc">Price low to high</option>
                          <option value="price_desc">Price high to low</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>City</Label>
                        <Input
                          value={savedSearchDraft.filters.city ?? ""}
                          onChange={(e) => setSavedSearchDraft((current) => current ? { ...current, filters: { ...current.filters, city: e.target.value } } : current)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Region/State</Label>
                        <Input
                          value={savedSearchDraft.filters.region ?? ""}
                          onChange={(e) => setSavedSearchDraft((current) => current ? { ...current, filters: { ...current.filters, region: e.target.value } } : current)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Postal code</Label>
                        <Input
                          value={savedSearchDraft.filters.postalCode ?? ""}
                          onChange={(e) => setSavedSearchDraft((current) => current ? { ...current, filters: { ...current.filters, postalCode: e.target.value } } : current)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Min price</Label>
                        <Input
                          value={savedSearchDraft.filters.minPrice ?? ""}
                          onChange={(e) => setSavedSearchDraft((current) => current ? { ...current, filters: { ...current.filters, minPrice: e.target.value } } : current)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Max price</Label>
                        <Input
                          value={savedSearchDraft.filters.maxPrice ?? ""}
                          onChange={(e) => setSavedSearchDraft((current) => current ? { ...current, filters: { ...current.filters, maxPrice: e.target.value } } : current)}
                        />
                      </div>
                      <div className="flex flex-wrap items-end gap-2 lg:col-span-3">
                        <Button
                          type="button"
                          disabled={isSavingSavedSearch}
                          onClick={async () => {
                            if (!savedSearchDraft) return;

                            const cleaned = cleanSavedSearchDraft(savedSearchDraft);
                            if (!cleaned.name) {
                              toast.error("Saved search name is required");
                              return;
                            }
                            if (Object.keys(cleaned.filters).length === 0) {
                              toast.error("Add at least one saved-search filter");
                              return;
                            }

                            try {
                              setIsSavingSavedSearch(true);
                              const res = await fetchJson<{ item: SavedSearch }>(`/saved-searches/${item.id}`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  name: cleaned.name,
                                  email: cleaned.email,
                                  filters: cleaned.filters,
                                }),
                              });
                              setSavedSearches((current) => current.map((entry) => (entry.id === item.id ? res.item : entry)));
                              setEditingSavedSearchId(null);
                              setSavedSearchDraft(null);
                              toast.success("Saved search updated");
                            } catch (e: any) {
                              toast.error(e?.message ?? "Failed to update saved search");
                            } finally {
                              setIsSavingSavedSearch(false);
                            }
                          }}
                        >
                          Save changes
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isSavingSavedSearch}
                          onClick={() => {
                            setEditingSavedSearchId(null);
                            setSavedSearchDraft(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

              <Card id="notifications" className="market-panel">
        <CardHeader>
          <div className="market-section-title">Alerts</div>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>In-app alerts for saved-search matches and marketplace activity.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <div>Unread: {notificationUnreadCount}</div>
            {auth.isAuthenticated && notificationUnreadCount > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await fetchJson("/notifications/read-all", { method: "POST" });
                    setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? Date.now() })));
                    setNotificationUnreadCount(0);
                  } catch (e: any) {
                    toast.error(e?.message ?? "Failed to mark notifications as read");
                  }
                }}
              >
                Mark all read
              </Button>
            ) : null}
          </div>

          {!auth.isAuthenticated ? (
            <div className="text-sm text-muted-foreground">Sign in to view alerts.</div>
          ) : notifications.length === 0 ? (
            <div className="text-sm text-muted-foreground">No notifications yet.</div>
          ) : (
            notifications.map((item) => {
              const listingId = typeof item.payload.listingId === "string" ? item.payload.listingId : null;
              const listingChainKey = typeof item.payload.chainKey === "string" ? item.payload.chainKey : null;
              return (
                <div key={item.id} className={item.readAt ? "rounded-md border p-3 sm:p-4" : "rounded-md border border-primary/40 bg-primary/5 p-3 sm:p-4"}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="font-medium">{item.title}</div>
                      <div className="text-sm text-muted-foreground">{item.body}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</div>
                      {listingId ? <Link className="text-sm underline" href={buildListingHref(listingId, listingChainKey)}>Open listing</Link> : null}
                    </div>
                    {!item.readAt ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            await fetchJson(`/notifications/${item.id}/read`, { method: "POST" });
                            setNotifications((current) => current.map((entry) => (entry.id === item.id ? { ...entry, readAt: Date.now() } : entry)));
                            setNotificationUnreadCount((current) => Math.max(0, current - 1));
                          } catch (e: any) {
                            toast.error(e?.message ?? "Failed to mark notification as read");
                          }
                        }}
                      >
                        Mark read
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

            </>
          ) : null}

          {accountTab === "follows" ? (
            <Card className="market-panel">
              <CardHeader>
                <div className="market-section-title">Network</div>
                <CardTitle>Follows</CardTitle>
                <CardDescription>People and seller pages you chose to keep in your repeat-buying circle.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
                {!auth.isAuthenticated ? (
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <div>Sign in to manage the seller profiles you follow.</div>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/sign-in">Sign in</Link>
                    </Button>
                  </div>
                ) : followedError ? (
                  <div className="text-sm text-muted-foreground">{followedError}</div>
                ) : followedSellers.length === 0 ? (
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <div>You are not following any sellers yet.</div>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/marketplace">Browse marketplace</Link>
                    </Button>
                  </div>
                ) : (
                  followedSellers.map((sellerAddress) => (
                    <Link key={sellerAddress} href={`/seller/${sellerAddress}`} className="flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition-colors hover:bg-accent/30">
                      <div>
                        <div className="font-medium">Seller profile</div>
                        <div className="text-xs text-muted-foreground">{sellerAddress}</div>
                      </div>
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Open</div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}

          {accountTab === "garage" ? (
            <Card className="market-panel">
              <CardHeader>
                <div className="market-section-title">Saved inventory</div>
                <CardTitle>Garage</CardTitle>
                <CardDescription>Listings you saved for later comparison, follow-up, or local pickup planning.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
                {!auth.isAuthenticated ? (
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <div>Sign in to keep favorite listings in your garage.</div>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/sign-in?mode=register">Create account</Link>
                    </Button>
                  </div>
                ) : favoriteError ? (
                  <div className="text-sm text-muted-foreground">{favoriteError}</div>
                ) : favoriteListings.length === 0 ? (
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <div>Your garage is empty. Save a listing from any detail page to see it here.</div>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/marketplace">Browse listings</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {favoriteListings.map((listing) => (
                      <ListingCard key={`${listing.chainKey}-${listing.id}`} row={listing} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {accountTab === "dealer-garage" ? (
            <Card className="market-panel">
        <CardHeader>
          <div className="market-section-title">Listings</div>
          <CardTitle>Dealer Garage</CardTitle>
          <CardDescription>Listings you created, surfaced in a simple buyer and seller inventory view.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {myListingIds === null || myListings === null ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-72" />
            </div>
          ) : myListingIds.length === 0 ? (
            <div className="space-y-3 text-sm text-muted-foreground">
              <div>No listings found.</div>
              <Button asChild variant="outline" size="sm">
                <Link href="/create">Create your first listing</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {(myListings ?? []).map((row) => (
                <Link key={row.id} href={buildListingHref(String(row.id), env.defaultChain.key)} className="block rounded-2xl border px-3 py-3 text-sm transition-colors hover:bg-accent/30 sm:px-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="break-all font-medium">{row.id}</div>
                    <div className="text-xs text-muted-foreground">{statusLabel(row.status as any)}</div>
                  </div>
                  {row.buyer && row.buyer !== zeroAddress ? (
                    <div className="mt-1 text-xs text-muted-foreground">Buyer: {shortenHex(row.buyer)}</div>
                  ) : null}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
          ) : null}
        </div>

        <aside className={auth.isAuthenticated ? "space-y-3 sm:space-y-4" : "hidden xl:block xl:space-y-4"}>
      <Card className="market-panel">
        <CardHeader>
          <div className="market-section-title">Scope</div>
          <CardTitle>Payments</CardTitle>
          <CardDescription>Stripe and off-chain promotion checkout are no longer part of the active product.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Wallet connection and on-chain settlement remain in scope. Private inboxes and Stripe-backed placement purchases do not.
          </div>
        </CardContent>
      </Card>

      <Card className="market-panel">
        <CardHeader>
          <div className="market-section-title">Wallet</div>
          <CardTitle>Wallet</CardTitle>
          <CardDescription>Connected address and quick helpers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-0 text-sm sm:p-6 sm:pt-0">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-muted-foreground">Address</div>
            <div className="font-medium break-all sm:text-right">{address ? shortenHex(address) : "Not connected"}</div>
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-muted-foreground">Last listing</div>
            <div className="font-medium break-all sm:text-right">
              {lastListingId && lastListingId !== ("0x" + "00".repeat(32)) ? (
                <Link className="underline" href={buildListingHref(String(lastListingId), env.defaultChain.key)}> {shortenHex(lastListingId)} </Link>
              ) : (
                "—"
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <details className="market-details market-panel overflow-hidden">
        <summary className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5">
          <div>
            <div className="market-section-title">Advanced tools</div>
            <div className="mt-1 text-lg font-semibold">Wallet withdrawals and owner utilities</div>
            <div className="mt-1 text-sm text-muted-foreground">Hidden by default so the main dashboard stays marketplace-first.</div>
          </div>
          <div className="text-sm font-medium text-muted-foreground">Expand</div>
        </summary>
        <div className="space-y-4 border-t px-4 py-4 sm:px-6 sm:py-6">
          <div className="rounded-2xl border p-3 space-y-3 sm:p-4">
            <div>
              <div className="text-sm font-semibold">Withdraw payout</div>
              <div className="text-sm text-muted-foreground">Withdraw your credits from EscrowVault through the registry.</div>
            </div>
            <div className="space-y-2">
              <Label>Token address (optional)</Label>
              <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder={`Leave empty for ${env.defaultChain.nativeCurrencySymbol}`} />
            </div>
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
              disabled={!address}
              onClick={async () => {
                try {
                  if (!publicClient) throw new Error("No public client");
                  const tokenArg = token.trim().length ? (token.trim() as Address) : zeroAddress;
                  const id = toast.loading("Withdrawing…");
                  const hash = await writeContractAsync({
                    address: env.marketplaceRegistryAddress,
                    abi: marketplaceRegistryAbi,
                    functionName: "withdrawPayout",
                    args: [tokenArg],
                  });
                  await publicClient.waitForTransactionReceipt({ hash });
                  toast.success("Withdraw complete", { id });
                } catch (e: any) {
                  toast.error(e?.shortMessage ?? e?.message ?? "Withdraw failed");
                }
              }}
            >
              Withdraw
            </Button>
          </div>

          <div className="rounded-2xl border p-3 space-y-4 sm:p-4">
            <div>
              <div className="text-sm font-semibold">Owner tools</div>
              <div className="text-sm text-muted-foreground">Admin and owner-only utilities for EscrowVault and the registry.</div>
            </div>
          <div className="space-y-2 text-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-muted-foreground">Registry owner</div>
              <div className="font-medium break-all sm:text-right">{typeof registryOwner === "string" ? registryOwner : "—"}</div>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-muted-foreground">Vault owner</div>
              <div className="font-medium break-all sm:text-right">{typeof vaultOwner === "string" ? vaultOwner : "—"}</div>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-muted-foreground">Vault controller</div>
              <div className="font-medium break-all sm:text-right">{typeof vaultControllerOnchain === "string" ? vaultControllerOnchain : "—"}</div>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-muted-foreground">Vault arbiter</div>
              <div className="font-medium break-all sm:text-right">{typeof vaultArbiterOnchain === "string" ? vaultArbiterOnchain : "—"}</div>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-muted-foreground">Protocol fee</div>
              <div className="font-medium sm:text-right">
                {typeof protocolFeeBps === "bigint" ? `${protocolFeeBps.toString()} bps` : "—"}
              </div>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-muted-foreground">Fee recipient</div>
              <div className="font-medium break-all sm:text-right">{typeof feeRecipient === "string" ? feeRecipient : "—"}</div>
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-3 sm:p-4">
            <div className="text-sm font-semibold">EscrowVault (owner-only)</div>
            {isVaultOwner ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Set controller address</Label>
                    <Input value={vaultController} onChange={(e) => setVaultController(e.target.value)} placeholder="0x..." />
                    <Button
                      variant="outline"
                      disabled={env.escrowVaultAddress === zeroAddress || !vaultController.trim().length}
                      onClick={async () => {
                        try {
                          if (!publicClient) throw new Error("No public client");
                          const next = vaultController.trim();
                          if (!isAddress(next)) throw new Error("Invalid controller address");

                          const id = toast.loading("Setting controller…");
                          const hash = await writeContractAsync({
                            address: env.escrowVaultAddress,
                            abi: escrowVaultAbi,
                            functionName: "setController",
                            args: [next as Address],
                          });
                          await publicClient.waitForTransactionReceipt({ hash });
                          toast.success("Controller updated", { id });
                        } catch (e: any) {
                          toast.error(e?.shortMessage ?? e?.message ?? "Failed to set controller");
                        }
                      }}
                    >
                      Set controller
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>Set vault arbiter address</Label>
                    <Input value={vaultArbiter} onChange={(e) => setVaultArbiter(e.target.value)} placeholder="0x..." />
                    <Button
                      variant="outline"
                      disabled={env.escrowVaultAddress === zeroAddress || !vaultArbiter.trim().length}
                      onClick={async () => {
                        try {
                          if (!publicClient) throw new Error("No public client");
                          const next = vaultArbiter.trim();
                          if (!isAddress(next)) throw new Error("Invalid arbiter address");

                          const id = toast.loading("Setting vault arbiter…");
                          const hash = await writeContractAsync({
                            address: env.escrowVaultAddress,
                            abi: escrowVaultAbi,
                            functionName: "setArbiter",
                            args: [next as Address],
                          });
                          await publicClient.waitForTransactionReceipt({ hash });
                          toast.success("Vault arbiter updated", { id });
                        } catch (e: any) {
                          toast.error(e?.shortMessage ?? e?.message ?? "Failed to set vault arbiter");
                        }
                      }}
                    >
                      Set vault arbiter
                    </Button>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  Note: EscrowVault escrow actions (create/release/refund/withdraw) are controller-only.
                  In this protocol the controller should be the MarketplaceRegistry.
                </div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground">
                Connect the EscrowVault owner wallet to manage controller/arbiter.
              </div>
            )}
          </div>

          <div className="rounded-md border p-3 space-y-3 sm:p-4">
            <div className="text-sm font-semibold">MarketplaceRegistry (owner-only)</div>
            {isRegistryOwner ? (
              <>
                <div className="space-y-2">
                  <Label>Set registry arbiter address</Label>
                  <Input value={registryArbiter} onChange={(e) => setRegistryArbiter(e.target.value)} placeholder="0x..." />
                  <Button
                    variant="outline"
                    disabled={!registryArbiter.trim().length}
                    onClick={async () => {
                      try {
                        if (!publicClient) throw new Error("No public client");
                        const next = registryArbiter.trim();
                        if (!isAddress(next)) throw new Error("Invalid arbiter address");

                        const id = toast.loading("Setting registry arbiter…");
                        const hash = await writeContractAsync({
                          address: env.marketplaceRegistryAddress,
                          abi: marketplaceRegistryAbi,
                          functionName: "setArbiter",
                          args: [next as Address],
                        });
                        await publicClient.waitForTransactionReceipt({ hash });
                        toast.success("Registry arbiter updated", { id });
                      } catch (e: any) {
                        toast.error(e?.shortMessage ?? e?.message ?? "Failed to set registry arbiter");
                      }
                    }}
                  >
                    Set registry arbiter
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Withdraw protocol fees (token optional)</Label>
                  <Input value={feesToken} onChange={(e) => setFeesToken(e.target.value)} placeholder={`Leave empty for ${env.defaultChain.nativeCurrencySymbol}`} />
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        if (!publicClient) throw new Error("No public client");
                        const tokenArg = feesToken.trim().length ? feesToken.trim() : zeroAddress;
                        if (typeof tokenArg === "string" && tokenArg !== zeroAddress && !isAddress(tokenArg)) {
                          throw new Error("Invalid token address");
                        }

                        const id = toast.loading("Withdrawing fees…");
                        const hash = await writeContractAsync({
                          address: env.marketplaceRegistryAddress,
                          abi: marketplaceRegistryAbi,
                          functionName: "withdrawFees",
                          args: [(tokenArg as Address) ?? zeroAddress],
                        });
                        await publicClient.waitForTransactionReceipt({ hash });
                        toast.success("Fees withdrawn", { id });
                      } catch (e: any) {
                        toast.error(e?.shortMessage ?? e?.message ?? "Withdraw fees failed");
                      }
                    }}
                  >
                    Withdraw fees
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground">
                Connect the MarketplaceRegistry owner wallet to manage registry arbiter and withdraw fees.
              </div>
            )}
          </div>

          <div className="rounded-md border p-3 space-y-3 sm:p-4">
            <div className="text-sm font-semibold">Inspect EscrowVault (read-only)</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Escrow id (bytes32)</Label>
                <Input value={inspectEscrowId} onChange={(e) => setInspectEscrowId(e.target.value)} placeholder="0x..." />
                <Button
                  variant="outline"
                  disabled={env.escrowVaultAddress === zeroAddress || !inspectEscrowId.trim().length}
                  onClick={async () => {
                    try {
                      if (!publicClient) throw new Error("No public client");
                      const id = inspectEscrowId.trim();
                      if (!id.startsWith("0x") || id.length !== 66) throw new Error("Escrow id must be bytes32 (0x + 64 hex chars)");

                      const res = await publicClient.readContract({
                        address: env.escrowVaultAddress,
                        abi: escrowVaultAbi,
                        functionName: "getEscrow",
                        args: [id as Hex],
                      });

                      const anyRes: any = res as any;
                      const buyer = (anyRes?.buyer ?? anyRes?.[0]) as Address;
                      const seller = (anyRes?.seller ?? anyRes?.[1]) as Address;
                      const token = (anyRes?.token ?? anyRes?.[2]) as Address;
                      const amount = (anyRes?.amount ?? anyRes?.[3]) as bigint;
                      const status = Number(anyRes?.status ?? anyRes?.[4]);

                      setEscrowInfo({ buyer, seller, token, amount, status });
                    } catch (e: any) {
                      setEscrowInfo(null);
                      toast.error(e?.shortMessage ?? e?.message ?? "Failed to read escrow");
                    }
                  }}
                >
                  Read escrow
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Check credits (recipient + token)</Label>
                <Input value={creditRecipient} onChange={(e) => setCreditRecipient(e.target.value)} placeholder="Recipient 0x..." />
                <Input value={creditToken} onChange={(e) => setCreditToken(e.target.value)} placeholder={`Token 0x... (empty = ${env.defaultChain.nativeCurrencySymbol})`} />
                <Button
                  variant="outline"
                  disabled={env.escrowVaultAddress === zeroAddress || !creditRecipient.trim().length}
                  onClick={async () => {
                    try {
                      if (!publicClient) throw new Error("No public client");
                      const recipient = creditRecipient.trim();
                      if (!isAddress(recipient)) throw new Error("Invalid recipient address");

                      const tokenArg = creditToken.trim().length ? creditToken.trim() : zeroAddress;
                      if (tokenArg !== zeroAddress && !isAddress(tokenArg)) throw new Error("Invalid token address");

                      const amount = await publicClient.readContract({
                        address: env.escrowVaultAddress,
                        abi: escrowVaultAbi,
                        functionName: "creditOf",
                        args: [recipient as Address, tokenArg as Address],
                      });
                      setCreditAmount(amount as bigint);
                    } catch (e: any) {
                      setCreditAmount(null);
                      toast.error(e?.shortMessage ?? e?.message ?? "Failed to read credits");
                    }
                  }}
                >
                  Read credits
                </Button>
              </div>
            </div>

            {escrowInfo ? (
              <div className="mt-2 space-y-1 text-xs text-muted-foreground break-all">
                <div>Buyer: {escrowInfo.buyer}</div>
                <div>Seller: {escrowInfo.seller}</div>
                <div>Token: {escrowInfo.token}</div>
                <div>Amount: {escrowInfo.amount.toString()}</div>
                <div>Status: {escrowInfo.status} (1=Funded, 2=Released, 3=Refunded)</div>
              </div>
            ) : null}

            {creditAmount !== null ? (
              <div className="text-xs text-muted-foreground break-all">Credits: {creditAmount.toString()}</div>
            ) : null}
          </div>
          </div>
        </div>
      </details>
        </aside>
      </div>
    </div>
  );
}
