"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type Address, type Hex, isAddress, parseAbiItem, zeroAddress } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { useSignMessage } from "wagmi";
import { toast } from "sonner";

import { ListingCard } from "@/components/listing/ListingCard";
import { SellerTrustSummary } from "@/components/site/SellerTrustSummary";
import { AccentCallout } from "@/components/ui/accent-callout";
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
import { type PublicUserProfileResponse, type UserProfile } from "@/lib/auth";
import { invalidateSellerProfile, primeSellerProfile, useSellerProfile } from "@/lib/hooks/useSellerProfile";
import { buildListingHref } from "@/lib/listings";
import { type ListingSummary } from "@/lib/hooks/useListings";
import { getProfileLocationFilter } from "@/lib/location";
import { buildMarketplaceHref } from "@/lib/marketplace";

const listingCreatedEvent = parseAbiItem(
  "event ListingCreated(bytes32 indexed id, address seller, uint8 saleType, address token, uint256 price, string metadataURI)"
);

type ListingCreatedLogArgs = {
  seller?: Address;
  id?: Hex;
};

type EscrowReadShape = {
  buyer?: Address;
  seller?: Address;
  token?: Address;
  amount?: bigint;
  status?: number | bigint;
  0?: Address;
  1?: Address;
  2?: Address;
  3?: bigint;
  4?: number | bigint;
};

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

type TrustReviewHistoryItem = {
  id: number;
  userAddress: string;
  reviewer: string;
  sellerVerified: boolean;
  sellerTrustNote?: string | null;
  previousSellerVerified?: boolean | null;
  previousSellerTrustNote?: string | null;
  createdAt: number;
};

type AdminTrustSummaryResponse = {
  queue: PublicUserProfileResponse[];
  verified: PublicUserProfileResponse[];
  history: TrustReviewHistoryItem[];
};

type AccountTab = "profile" | "watch" | "my-listings";

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

function getErrorMessage(error: unknown, fallback: string) {
  const candidate = error as { shortMessage?: unknown; message?: unknown } | null;
  const message = candidate?.shortMessage ?? candidate?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function getListingCreatedLogArgs(args: unknown): ListingCreatedLogArgs {
  if (!args || typeof args !== "object") return {};
  const candidate = args as Record<string, unknown>;
  return {
    seller: typeof candidate.seller === "string" && isAddress(candidate.seller) ? (candidate.seller as Address) : undefined,
    id: typeof candidate.id === "string" ? (candidate.id as Hex) : undefined,
  };
}

function decodeEscrowReadResult(value: unknown) {
  const candidate = (value ?? {}) as EscrowReadShape;
  return {
    buyer: (candidate.buyer ?? candidate[0] ?? zeroAddress) as Address,
    seller: (candidate.seller ?? candidate[1] ?? zeroAddress) as Address,
    token: (candidate.token ?? candidate[2] ?? zeroAddress) as Address,
    amount: (candidate.amount ?? candidate[3] ?? 0n) as bigint,
    status: Number(candidate.status ?? candidate[4] ?? 0),
  };
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

function buildSavedSearchHref(filters: SavedSearchFilters) {
  return buildMarketplaceHref({
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.subcategory ? { subcategory: filters.subcategory } : {}),
    ...(filters.city ? { city: filters.city } : {}),
    ...(filters.region ? { region: filters.region } : {}),
    ...(filters.postalCode ? { postalCode: filters.postalCode } : {}),
    ...(filters.minPrice ? { minPrice: filters.minPrice } : {}),
    ...(filters.maxPrice ? { maxPrice: filters.maxPrice } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.sort ? { sort: filters.sort } : {}),
  });
}

export default function DashboardPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { signMessageAsync } = useSignMessage();
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [accountTab, setAccountTab] = React.useState<AccountTab>("profile");
  const [fullName, setFullName] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [avatarCid, setAvatarCid] = React.useState("");
  const [phoneNumber, setPhoneNumber] = React.useState("");
  const [streetAddress1, setStreetAddress1] = React.useState("");
  const [streetAddress2, setStreetAddress2] = React.useState("");
  const [city, setCity] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [postalCode, setPostalCode] = React.useState("");
  const [isLinkingWallet, setIsLinkingWallet] = React.useState(false);
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
  const [myListings, setMyListings] = React.useState<Array<{ id: Hex; status: Parameters<typeof statusLabel>[0]; buyer: Address }> | null>(null);
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
  const [adminTrustAddress, setAdminTrustAddress] = React.useState("");
  const [adminTrustNote, setAdminTrustNote] = React.useState("");
  const [isSavingTrust, setIsSavingTrust] = React.useState(false);
  const [trustQueue, setTrustQueue] = React.useState<PublicUserProfileResponse[]>([]);
  const [verifiedSellers, setVerifiedSellers] = React.useState<PublicUserProfileResponse[]>([]);
  const [trustHistory, setTrustHistory] = React.useState<TrustReviewHistoryItem[]>([]);
  const [isLoadingTrustAdmin, setIsLoadingTrustAdmin] = React.useState(false);
  const profileLocationFilter = React.useMemo(() => getProfileLocationFilter(auth.user), [auth.user]);
  const watchBrowseHref = React.useMemo(() => buildMarketplaceHref(profileLocationFilter), [profileLocationFilter]);

  const envState = React.useMemo(() => {
    try {
      return { env: getEnv(), error: null as string | null };
    } catch (error: unknown) {
      return { env: null, error: getErrorMessage(error, "Missing env vars") };
    }
  }, []);
  const envReady = Boolean(envState.env);
  const defaultChainKey = envState.env?.defaultChain.key ?? "sepolia";
  const defaultNativeCurrencySymbol = envState.env?.defaultChain.nativeCurrencySymbol ?? "ETH";
  const marketplaceRegistryAddress = envState.env?.marketplaceRegistryAddress ?? zeroAddress;
  const escrowVaultAddress = envState.env?.escrowVaultAddress ?? zeroAddress;
  const fromBlock = envState.env?.fromBlock ?? 0n;
  const trustTargetAddress = isAddress(adminTrustAddress) ? adminTrustAddress : null;
  const { profile: adminTrustProfile, isLoading: isLoadingAdminTrustProfile } = useSellerProfile(trustTargetAddress);

  React.useEffect(() => {
    setFullName(auth.user?.fullName ?? "");
    setDisplayName(auth.user?.displayName ?? "");
    setBio(auth.user?.bio ?? "");
    setAvatarCid(auth.user?.avatarCid ?? "");
    setPhoneNumber(auth.user?.phoneNumber ?? "");
    setStreetAddress1(auth.user?.streetAddress1 ?? "");
    setStreetAddress2(auth.user?.streetAddress2 ?? "");
    setCity(auth.user?.city ?? "");
    setRegion(auth.user?.region ?? "");
    setPostalCode(auth.user?.postalCode ?? "");
  }, [auth.user]);

  React.useEffect(() => {
    if (!adminTrustProfile || !trustTargetAddress) return;
    if (adminTrustProfile.user.address.toLowerCase() !== trustTargetAddress.toLowerCase()) return;
    setAdminTrustNote(adminTrustProfile.user.sellerTrustNote ?? "");
  }, [adminTrustProfile, trustTargetAddress]);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!auth.isAuthenticated || !auth.isAdmin) {
        setTrustQueue([]);
        setVerifiedSellers([]);
        setTrustHistory([]);
        return;
      }

      try {
        setIsLoadingTrustAdmin(true);
        const res = await fetchJson<AdminTrustSummaryResponse>("/users/admin/trust", { timeoutMs: 7_000 });
        if (cancelled) return;
        for (const profile of [...(res.queue ?? []), ...(res.verified ?? [])]) {
          primeSellerProfile(profile);
        }
        setTrustQueue(res.queue ?? []);
        setVerifiedSellers(res.verified ?? []);
        setTrustHistory(res.history ?? []);
      } catch (error: unknown) {
        if (!cancelled) {
          toast.error(getErrorMessage(error, "Failed to load seller trust review data"));
        }
      } finally {
        if (!cancelled) setIsLoadingTrustAdmin(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated, auth.isAdmin, dashboardRefreshKey]);

  React.useEffect(() => {
    const requestedTab = searchParams.get("tab");
    const nextTab: AccountTab = requestedTab === "watch" || requestedTab === "my-listings" ? requestedTab : "profile";
    setAccountTab((current) => (current === nextTab ? current : nextTab));
  }, [searchParams]);

  async function updateSellerTrust(sellerVerified: boolean) {
    if (!trustTargetAddress) {
      toast.error("Enter a valid seller address first");
      return;
    }

    try {
      setIsSavingTrust(true);
      await fetchJson<{ user: UserProfile | null }>(`/users/${trustTargetAddress}/trust`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerVerified,
          sellerTrustNote: adminTrustNote,
        }),
      });

      invalidateSellerProfile(trustTargetAddress);
      const refreshed = await fetchJson<PublicUserProfileResponse>(`/users/${trustTargetAddress}`, { timeoutMs: 5_000 });
      primeSellerProfile(refreshed);
      setAdminTrustNote(refreshed.user.sellerTrustNote ?? "");
      setDashboardRefreshKey((current) => current + 1);

      if (auth.user?.address?.toLowerCase() === trustTargetAddress.toLowerCase()) {
        auth.setUser(refreshed.user);
      }

      toast.success(sellerVerified ? "Seller verification enabled" : "Seller verification cleared");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update seller trust"));
    } finally {
      setIsSavingTrust(false);
    }
  }

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
      } catch (error: unknown) {
        if (!cancelled) {
          setFollowedSellers([]);
          setFollowedError(getErrorMessage(error, "Could not load followed sellers"));
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
      } catch (error: unknown) {
        if (!cancelled) {
          setFavoriteListings([]);
          setFavoriteError(getErrorMessage(error, "Could not load favorite listings"));
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
      } catch (error: unknown) {
        if (!cancelled) {
          toast.error(getErrorMessage(error, "Failed to load dashboard alerts"));
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
        setPromotionDraft((current) => current ?? emptyPromotionDraft(defaultChainKey));
      } catch (error: unknown) {
        if (!cancelled) {
          toast.error(getErrorMessage(error, "Failed to load spotlight placements"));
        }
      } finally {
        if (!cancelled) setIsLoadingPromotions(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated, auth.isAdmin, dashboardRefreshKey, defaultChainKey]);

  const activeSavedSearchSubcategories = React.useMemo(() => {
    if (!savedSearchDraft?.filters.category) return [];
    return subcategoriesFor(savedSearchDraft.filters.category);
  }, [savedSearchDraft?.filters.category]);

  const accountTabs = React.useMemo(
    () => [
      { key: "profile" as const, label: "Profile", description: "Identity, address, and account settings.", tone: "mint", count: auth.user?.postalCode?.trim() ? auth.user.postalCode.trim() : auth.user?.email?.trim() || "Setup" },
      { key: "watch" as const, label: "Watch", description: "Followed sellers, saved ads, alerts, and search watches.", tone: "blue", count: String(followedSellers.length + favoriteListings.length + savedSearches.length + notificationUnreadCount) },
      { key: "my-listings" as const, label: "My listings", description: "Ads connected to your current seller wallet.", tone: "amber", count: Array.isArray(myListingIds) ? String(myListingIds.length) : "-" },
    ],
    [auth.user?.email, auth.user?.postalCode, favoriteListings.length, followedSellers.length, myListingIds, notificationUnreadCount, savedSearches.length]
  );

  const activeTabMeta = accountTabs.find((tab) => tab.key === accountTab) ?? accountTabs[0];
  const activeTabSummaryClass =
    activeTabMeta.tone === "mint"
      ? "market-panel market-panel-spotlight market-panel-spotlight-mint border-slate-200/80 bg-white/78"
      : activeTabMeta.tone === "amber"
        ? "market-panel market-panel-spotlight market-panel-spotlight-amber border-slate-200/80 bg-white/78"
        : "market-panel market-panel-spotlight market-panel-spotlight-blue border-slate-200/80 bg-white/78";

  const { data: lastListingId } = useReadContract({
    address: marketplaceRegistryAddress,
    abi: marketplaceRegistryAbi,
    functionName: "lastListingIdOf",
    args: address ? [address as Address] : undefined,
    query: { enabled: envReady && Boolean(address) },
  });

  const { data: registryOwner } = useReadContract({
    address: marketplaceRegistryAddress,
    abi: marketplaceRegistryAbi,
    functionName: "owner",
    query: { enabled: envReady, retry: 1 },
  });

  const { data: protocolFeeBps } = useReadContract({
    address: marketplaceRegistryAddress,
    abi: marketplaceRegistryAbi,
    functionName: "protocolFeeBps",
    query: { enabled: envReady, retry: 1 },
  });

  const { data: feeRecipient } = useReadContract({
    address: marketplaceRegistryAddress,
    abi: marketplaceRegistryAbi,
    functionName: "feeRecipient",
    query: { enabled: envReady, retry: 1 },
  });

  const { data: vaultOwner } = useReadContract({
    address: escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "owner",
    query: { enabled: envReady && escrowVaultAddress !== zeroAddress, retry: 1 },
  });

  const { data: vaultControllerOnchain } = useReadContract({
    address: escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "controller",
    query: { enabled: envReady && escrowVaultAddress !== zeroAddress, retry: 1 },
  });

  const { data: vaultArbiterOnchain } = useReadContract({
    address: escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "arbiter",
    query: { enabled: envReady && escrowVaultAddress !== zeroAddress, retry: 1 },
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
          fromBlock !== 0n ? (fromBlock > latest ? safeFromBlock : fromBlock) : safeFromBlock;

        const logs = await publicClient.getLogs({
          address: marketplaceRegistryAddress,
          event: listingCreatedEvent,
          fromBlock: primaryFromBlock,
          toBlock: "latest",
        });

        const ids = logs
          .map((log) => getListingCreatedLogArgs(log.args))
          .filter((log) => log.seller?.toLowerCase() === address.toLowerCase())
          .map((log) => log.id)
          .filter(Boolean)
          .map((id) => id as Hex)
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
  }, [address, fromBlock, marketplaceRegistryAddress, publicClient]);

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
            address: marketplaceRegistryAddress,
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
          .filter(Boolean) as Array<{ id: Hex; status: Parameters<typeof statusLabel>[0]; buyer: Address }>;

        if (!cancelled) setMyListings(rows);
      } catch {
        if (!cancelled) setMyListings([]);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [address, marketplaceRegistryAddress, publicClient, myListingIds]);

  if (envState.error || !envState.env) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">{envState.error ?? "Missing env vars"}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="market-hero px-4 py-5 sm:px-8 sm:py-8">
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-end">
          <div className="space-y-4">
            <div className="market-section-title">Your account</div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Run your account with a cleaner market rhythm.</h1>
              <p className="max-w-2xl text-[13px] leading-6 text-muted-foreground sm:text-base">Profile, watch activity, and live inventory now sit inside one sharper account shell, so follows, saved ads, alerts, and listings feel like one continuous flow.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
            <div className="market-stat">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Follows</div>
              <div className="mt-2 text-2xl font-semibold">{followedSellers.length}</div>
            </div>
            <div className="market-stat">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Saved ads</div>
              <div className="mt-2 text-2xl font-semibold">{favoriteListings.length}</div>
            </div>
            <div className="market-stat">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Unread alerts</div>
              <div className="mt-2 text-2xl font-semibold">{notificationUnreadCount}</div>
            </div>
            <div className="market-stat">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">My listings</div>
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
            className={
              accountTab === tab.key
                ? `market-tab-button market-tab-button-${tab.tone} market-tab-button-active market-tab-button-active-${tab.tone}`
                : `market-tab-button market-tab-button-${tab.tone}`
            }
            onClick={() => selectAccountTab(tab.key)}
          >
            <span className="text-sm font-semibold text-slate-950">{tab.label}</span>
            <span className="mt-1 text-xs text-muted-foreground">{tab.description}</span>
            <span className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{tab.count}</span>
          </button>
        ))}
      </div>

      <div className="market-tab-affordance sm:hidden" aria-hidden="true">
        Swipe to see Watch and My listings.
      </div>

      <Card className={activeTabSummaryClass}>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <div className="market-section-title">{activeTabMeta.label}</div>
            <div className="mt-1 text-sm text-muted-foreground">{activeTabMeta.description}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {accountTab === "watch" ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/marketplace">Browse marketplace</Link>
              </Button>
            ) : null}
            {accountTab === "my-listings" ? (
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
            <React.Fragment>
              <Card className="market-panel market-panel-spotlight market-panel-spotlight-mint">
                <CardHeader>
                  <div className="market-section-title">Public profile</div>
                  <CardTitle>Profile</CardTitle>
                  <CardDescription>Shape the public identity, contact details, and local profile signals buyers see first.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
                  {!auth.isAuthenticated ? (
                    <AccentCallout
                      label="Open your profile"
                      tone="mint"
                      actions={
                        <>
                          {address && !auth.isAuthenticated ? (
                            <Button type="button" variant="outline" size="lg" className="w-full sm:w-auto" disabled={auth.isLoading} onClick={() => void auth.signIn()}>
                              Sign in with wallet
                            </Button>
                          ) : null}
                          <Button asChild type="button" variant="outline" size="lg" className="w-full sm:w-auto">
                            <Link href="/sign-in">Open sign-in</Link>
                          </Button>
                        </>
                      }
                    >
                      Sign in with email or wallet to edit your profile, identity, and location settings.
                    </AccentCallout>
                  ) : (
                    <div className="grid gap-4">
                      <div className="flex flex-wrap gap-2 text-xs">
                        {auth.user?.email?.trim() ? <span className="market-chip">Email account</span> : null}
                        {auth.user?.authMethod === "email" ? <span className="market-chip">{auth.user?.emailVerifiedAt ? "Email verified" : "Email not verified"}</span> : null}
                        {auth.user?.postalCode?.trim() ? <span className="market-chip">Local zone {auth.user.postalCode.trim()}</span> : null}
                        {address ? <span className="market-chip">Wallet {shortenHex(address)}</span> : null}
                        {auth.user?.linkedWalletAddress ? <span className="market-chip">Linked wallet {shortenHex(auth.user.linkedWalletAddress)}</span> : null}
                      </div>
                      {auth.user?.authMethod === "email" && !auth.user?.emailVerifiedAt ? (
                        <AccentCallout
                          label="Verify your email"
                          tone="amber"
                          actions={
                            <Button
                              type="button"
                              variant="outline"
                              disabled={auth.isLoading || !auth.user?.email}
                              onClick={async () => {
                                await auth.sendVerificationEmail();
                              }}
                            >
                              Send verification email
                            </Button>
                          }
                        >
                          Verification unlocks a confirmed account state for sign-in links, notifications, and account recovery.
                        </AccentCallout>
                      ) : null}
                      {auth.user?.authMethod === "email" ? (
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 shadow-sm">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-1">
                              <div className="text-sm font-semibold text-slate-950">Wallet link</div>
                              <div className="text-sm text-muted-foreground">
                                Link a wallet to this email account for seller actions and chain settlement while keeping subscription billing separate from the product.
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {auth.user?.linkedWalletAddress
                                  ? `Linked wallet: ${auth.user.linkedWalletAddress}`
                                  : address
                                    ? `Connected wallet ready to link: ${address}`
                                    : "Connect the wallet you want to use for seller actions, then link it here."}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                disabled={isLinkingWallet || !address || auth.user?.linkedWalletAddress?.toLowerCase() === address.toLowerCase()}
                                onClick={async () => {
                                  if (!address) {
                                    toast.error("Connect a wallet first");
                                    return;
                                  }

                                  try {
                                    setIsLinkingWallet(true);
                                    const nonce = await fetchJson<{ walletAddress: string; nonce: string; message: string }>("/auth/link-wallet/nonce", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ walletAddress: address }),
                                    });
                                    const signature = await signMessageAsync({ message: nonce.message });
                                    const res = await fetchJson<{ user: UserProfile }>("/auth/link-wallet/verify", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ walletAddress: address, nonce: nonce.nonce, signature }),
                                    });
                                    auth.setUser(res.user);
                                    await auth.refresh();
                                    toast.success("Wallet linked");
                                  } catch (error: unknown) {
                                    toast.error(getErrorMessage(error, "Failed to link wallet"));
                                  } finally {
                                    setIsLinkingWallet(false);
                                  }
                                }}
                              >
                                {auth.user?.linkedWalletAddress?.toLowerCase() === address?.toLowerCase() ? "Wallet linked" : isLinkingWallet ? "Linking..." : "Link connected wallet"}
                              </Button>
                              {auth.user?.linkedWalletAddress ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  disabled={isLinkingWallet}
                                  onClick={async () => {
                                    try {
                                      setIsLinkingWallet(true);
                                      const res = await fetchJson<{ user: UserProfile }>("/auth/link-wallet/unlink", { method: "POST" });
                                      auth.setUser(res.user);
                                      await auth.refresh();
                                      toast.success("Wallet unlinked");
                                    } catch (error: unknown) {
                                      toast.error(getErrorMessage(error, "Failed to unlink wallet"));
                                    } finally {
                                      setIsLinkingWallet(false);
                                    }
                                  }}
                                >
                                  Unlink wallet
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : null}
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
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Email</Label>
                            <Input value={auth.user.email} disabled />
                          </div>
                          <div className="space-y-2">
                            <Label>Phone number</Label>
                            <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+234 800 000 0000" />
                          </div>
                        </div>
                      ) : null}
                      {!auth.user?.email ? (
                        <div className="space-y-2">
                          <Label>Phone number</Label>
                          <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+234 800 000 0000" />
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
                                phoneNumber,
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
                          } catch (error: unknown) {
                            toast.error(getErrorMessage(error, "Failed to update profile"));
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
              <Card className="market-panel market-panel-spotlight market-panel-spotlight-amber border-amber-300/60 bg-[linear-gradient(180deg,rgba(255,252,244,0.92),rgba(255,255,255,0.98))]">
          <CardHeader>
            <div className="market-section-title">Homepage admin</div>
            <CardTitle>Spotlight placements</CardTitle>
            <CardDescription>Control the featured inventory and trust surfaces that shape the public landing page.</CardDescription>
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

            <div className="rounded-2xl border bg-white/85 p-4 space-y-4">
              <div className="space-y-1">
                <div className="text-sm font-semibold">Seller trust controls</div>
                <div className="text-sm text-muted-foreground">Promote trusted sellers with an admin-managed verification badge and a short internal trust note that appears publicly on the profile and listing surfaces.</div>
              </div>
              <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Seller address</Label>
                    <Input
                      value={adminTrustAddress}
                      onChange={(event) => setAdminTrustAddress(event.target.value.trim())}
                      placeholder="0x..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Public trust note</Label>
                    <Textarea
                      value={adminTrustNote}
                      onChange={(event) => setAdminTrustNote(event.target.value)}
                      placeholder="Why this seller is trusted for launch buyers"
                      rows={3}
                      maxLength={500}
                      disabled={!trustTargetAddress}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={() => void updateSellerTrust(true)} disabled={!trustTargetAddress || isSavingTrust}>
                      {isSavingTrust ? "Saving…" : "Mark verified seller"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void updateSellerTrust(false)} disabled={!trustTargetAddress || isSavingTrust}>
                      Clear verification
                    </Button>
                  </div>
                </div>
                <div className="rounded-2xl border border-dashed bg-slate-50/80 p-4">
                  {!trustTargetAddress ? (
                        <AccentCallout label="Trust preview" tone="amber">
                          Enter a valid seller address to preview the current trust state before making changes.
                        </AccentCallout>
                  ) : isLoadingAdminTrustProfile ? (
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-4 w-64" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : adminTrustProfile ? (
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm font-semibold">{adminTrustProfile.user.displayName?.trim() || shortenHex(adminTrustProfile.user.address)}</div>
                        <div className="text-xs text-muted-foreground break-all">{adminTrustProfile.user.address}</div>
                      </div>
                      <SellerTrustSummary profile={adminTrustProfile} variant="detail" />
                    </div>
                  ) : (
                    <AccentCallout label="No public profile" tone="amber">
                      That address has no public seller profile yet, so there is nothing to review or verify.
                    </AccentCallout>
                  )}
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border bg-white/90 p-4 space-y-3">
                  <div>
                    <div className="text-sm font-semibold">Review queue</div>
                    <div className="text-sm text-muted-foreground">Seller profiles waiting for a first trust decision.</div>
                  </div>
                  {isLoadingTrustAdmin ? (
                    <div className="space-y-2">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ) : trustQueue.length === 0 ? (
                    <AccentCallout label="Queue is clear" tone="mint">
                      No seller profiles are waiting for review right now.
                    </AccentCallout>
                  ) : (
                    trustQueue.map((profile) => (
                      <button
                        key={profile.user.address}
                        type="button"
                        className="w-full rounded-2xl border p-3 text-left transition-colors hover:bg-accent/20"
                        onClick={() => setAdminTrustAddress(profile.user.address)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="font-medium">{profile.user.displayName?.trim() || shortenHex(profile.user.address)}</div>
                            <div className="text-xs text-muted-foreground break-all">{profile.user.address}</div>
                          </div>
                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Review</div>
                        </div>
                        <div className="mt-2">
                          <SellerTrustSummary profile={profile} variant="detail" />
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="rounded-2xl border bg-white/90 p-4 space-y-3">
                  <div>
                    <div className="text-sm font-semibold">Verified sellers</div>
                    <div className="text-sm text-muted-foreground">Recently approved sellers stay visible for fast review and note cleanup.</div>
                  </div>
                  {isLoadingTrustAdmin ? (
                    <div className="space-y-2">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ) : verifiedSellers.length === 0 ? (
                    <AccentCallout label="No verified sellers" tone="blue">
                      No seller has been marked verified yet, so this list will open once the first trust approval is made.
                    </AccentCallout>
                  ) : (
                    verifiedSellers.map((profile) => (
                      <button
                        key={profile.user.address}
                        type="button"
                        className="w-full rounded-2xl border p-3 text-left transition-colors hover:bg-accent/20"
                        onClick={() => setAdminTrustAddress(profile.user.address)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="font-medium">{profile.user.displayName?.trim() || shortenHex(profile.user.address)}</div>
                            <div className="text-xs text-muted-foreground break-all">{profile.user.address}</div>
                          </div>
                          <div className="text-xs text-muted-foreground">{profile.user.sellerVerifiedAt ? formatDateTime(profile.user.sellerVerifiedAt) : "Verified"}</div>
                        </div>
                        <div className="mt-2">
                          <SellerTrustSummary profile={profile} variant="detail" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border bg-white/90 p-4 space-y-3">
                <div>
                  <div className="text-sm font-semibold">Trust review history</div>
                  <div className="text-sm text-muted-foreground">Every trust decision stays visible as an auditable review trail.</div>
                </div>
                {isLoadingTrustAdmin ? (
                  <div className="space-y-2">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                ) : trustHistory.length === 0 ? (
                  <AccentCallout label="No review history" tone="amber">
                    No trust actions have been recorded yet, so the audit trail is still empty.
                  </AccentCallout>
                ) : (
                  <div className="space-y-2">
                    {trustHistory.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="w-full rounded-2xl border p-3 text-left transition-colors hover:bg-accent/20"
                        onClick={() => setAdminTrustAddress(item.userAddress)}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <div className="font-medium">{item.sellerVerified ? "Verified seller" : "Verification cleared"}</div>
                            <div className="text-xs text-muted-foreground break-all">Seller: {item.userAddress}</div>
                            <div className="text-xs text-muted-foreground">Reviewer: {item.reviewer}</div>
                            {item.sellerTrustNote?.trim() ? <div className="text-sm text-slate-700">{item.sellerTrustNote.trim()}</div> : null}
                            {item.previousSellerTrustNote?.trim() && item.previousSellerTrustNote.trim() !== item.sellerTrustNote?.trim() ? (
                              <div className="text-xs text-muted-foreground">Previous note: {item.previousSellerTrustNote.trim()}</div>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Current placement inventory</div>
                    <div className="text-sm text-muted-foreground">Review timing, priority, and labeling before a placement reaches the homepage.</div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingPromotionId(null);
                      setPromotionDraft(emptyPromotionDraft(defaultChainKey));
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
                  <AccentCallout label="No spotlight placements" tone="amber">
                    The spotlight layer is empty. Create the first placement from the form to the right.
                  </AccentCallout>
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
                                  setPromotionDraft(emptyPromotionDraft(defaultChainKey));
                                }
                                toast.success("Placement removed");
                              } catch (error: unknown) {
                                toast.error(getErrorMessage(error, "Failed to remove placement"));
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
                  <div className="text-sm text-muted-foreground">Use a real listing id and a clean campaign label so the homepage reads like curated inventory, not ad ops.</div>
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
                          placeholder={defaultChainKey}
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
                          placeholder="Zonycs Spotlight"
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
                            setPromotionDraft(emptyPromotionDraft(defaultChainKey));
                            toast.success(editingPromotionId ? "Placement updated" : "Placement created");
                          } catch (error: unknown) {
                            toast.error(getErrorMessage(error, "Failed to save placement"));
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
                          setPromotionDraft(emptyPromotionDraft(defaultChainKey));
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
            </React.Fragment>
              ) : null}

          {accountTab === "watch" ? (
            <React.Fragment>
              <Card className="market-panel market-panel-spotlight market-panel-spotlight-blue">
                <CardHeader>
                  <div className="market-section-title">Watch center</div>
                  <CardTitle>Watch activity</CardTitle>
                  <CardDescription>Follows, saved ads, alerts, and search watches stay together here for faster repeat browsing.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-2 sm:p-6 sm:pt-0 xl:grid-cols-4">
                  <div className="market-stat border-emerald-200/80 bg-[linear-gradient(180deg,rgba(238,255,250,0.98),rgba(255,255,255,0.94))] shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Followed sellers</div>
                    <div className="mt-2 text-3xl font-semibold text-slate-950">{followedSellers.length}</div>
                    <div className="mt-1 text-sm leading-6 text-slate-600">Profiles you want to revisit first.</div>
                  </div>
                  <div className="market-stat border-sky-200/80 bg-[linear-gradient(180deg,rgba(240,248,255,0.99),rgba(255,255,255,0.94))] shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Saved ads</div>
                    <div className="mt-2 text-3xl font-semibold text-slate-950">{favoriteListings.length}</div>
                    <div className="mt-1 text-sm leading-6 text-slate-600">Listings kept for comparison or follow-up.</div>
                  </div>
                  <div className="market-stat border-cyan-200/80 bg-[linear-gradient(180deg,rgba(238,252,255,0.99),rgba(255,255,255,0.94))] shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Saved searches</div>
                    <div className="mt-2 text-3xl font-semibold text-slate-950">{savedSearches.length}</div>
                    <div className="mt-1 text-sm leading-6 text-slate-600">Search watches that keep bringing inventory back.</div>
                  </div>
                  <div className="market-stat border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,249,235,0.99),rgba(255,255,255,0.94))] shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Unread alerts</div>
                    <div className="mt-2 text-3xl font-semibold text-slate-950">{notificationUnreadCount}</div>
                    <div className="mt-1 text-sm leading-6 text-slate-600">Signals worth checking before you browse again.</div>
                  </div>
                </CardContent>
              </Card>

              <Card className="market-panel market-panel-spotlight market-panel-spotlight-mint">
                <CardHeader>
                  <div className="market-section-title">Network</div>
                  <CardTitle>Followed sellers</CardTitle>
                  <CardDescription>Sellers you want close at hand when you come back to browse again.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
                  {!auth.isAuthenticated ? (
                    <AccentCallout
                      label="Follow sellers"
                      tone="mint"
                      actions={
                        <Button asChild variant="outline" size="sm">
                          <Link href="/sign-in">Open sign-in</Link>
                        </Button>
                      }
                    >
                      Sign in to keep trusted sellers in a cleaner private network.
                    </AccentCallout>
                  ) : followedError ? (
                    <div className="text-sm text-muted-foreground">{followedError}</div>
                  ) : followedSellers.length === 0 ? (
                    <AccentCallout
                      label="Build your circle"
                      tone="mint"
                      actions={
                        <Button asChild variant="outline" size="sm">
                          <Link href={watchBrowseHref}>Browse marketplace</Link>
                        </Button>
                      }
                    >
                      Your follow list is still open. Start with sellers you trust and their newest inventory will surface here first.
                    </AccentCallout>
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

              <Card className="market-panel market-panel-spotlight market-panel-spotlight-blue">
                <CardHeader>
                  <div className="market-section-title">Saved inventory</div>
                  <CardTitle>Favorite ads</CardTitle>
                  <CardDescription>Saved listings that deserve a second look, a comparison pass, or a follow-up.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
                  {!auth.isAuthenticated ? (
                    <AccentCallout
                      label="Save standout ads"
                      tone="blue"
                      actions={
                        <Button asChild variant="outline" size="sm">
                          <Link href="/sign-in?mode=register">Create account</Link>
                        </Button>
                      }
                    >
                      Sign in to keep saved listings inside your watch flow instead of losing them between visits.
                    </AccentCallout>
                  ) : favoriteError ? (
                    <div className="text-sm text-muted-foreground">{favoriteError}</div>
                  ) : favoriteListings.length === 0 ? (
                    <AccentCallout
                      label="Curate your shortlist"
                      tone="blue"
                      actions={
                        <Button asChild variant="outline" size="sm">
                          <Link href={watchBrowseHref}>Browse listings</Link>
                        </Button>
                      }
                    >
                      Your shortlist is empty. Save any listing that deserves a second look and it will stay ready here.
                    </AccentCallout>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {favoriteListings.map((listing) => (
                        <ListingCard key={`${listing.chainKey}-${listing.id}`} row={listing} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="market-panel market-panel-spotlight market-panel-spotlight-amber">
                <CardHeader>
                  <div className="market-section-title">Discovery</div>
                  <CardTitle>Saved searches</CardTitle>
                  <CardDescription>Edit the search watches that keep bringing the right inventory back.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
                  {!auth.isAuthenticated ? (
                    <AccentCallout label="Search watches" tone="amber">
                      Sign in to keep saved search alerts organized in one sharper watch layer.
                    </AccentCallout>
                  ) : savedSearches.length === 0 ? (
                    <AccentCallout label="No saved searches yet" tone="amber">
                      Your alert list is still blank. Save a refined marketplace view and it will reappear here with its filters intact.
                    </AccentCallout>
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
                              <Button asChild type="button" variant="outline" size="sm">
                                <Link href={buildSavedSearchHref(item.filters)}>Open in marketplace</Link>
                              </Button>
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
                                  } catch (error: unknown) {
                                    toast.error(getErrorMessage(error, "Failed to remove saved search"));
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
                                    } catch (error: unknown) {
                                      toast.error(getErrorMessage(error, "Failed to update saved search"));
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

              <Card id="notifications" className="market-panel market-panel-spotlight market-panel-spotlight-blue">
                <CardHeader>
                  <div className="market-section-title">Alerts</div>
                  <CardTitle>Notifications</CardTitle>
                  <CardDescription>One inbox for saved-search matches, seller activity, and listing updates.</CardDescription>
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
                          } catch (error: unknown) {
                            toast.error(getErrorMessage(error, "Failed to mark notifications as read"));
                          }
                        }}
                      >
                        Mark all read
                      </Button>
                    ) : null}
                  </div>

                  {!auth.isAuthenticated ? (
                    <AccentCallout label="Watch inbox" tone="blue">
                      Sign in to keep saved-search alerts and marketplace updates in one refined inbox.
                    </AccentCallout>
                  ) : notifications.length === 0 ? (
                    <AccentCallout label="Inbox is clear" tone="blue">
                      Nothing needs attention right now. Fresh saved-search matches and marketplace updates will appear here as they land.
                    </AccentCallout>
                  ) : (
                    notifications.map((item) => {
                      const listingId = typeof item.payload.listingId === "string" ? item.payload.listingId : null;
                      const listingChainKey = typeof item.payload.chainKey === "string" ? item.payload.chainKey : null;
                      const marketplaceHref = typeof item.payload.marketplaceHref === "string" ? item.payload.marketplaceHref : null;
                      return (
                        <div key={item.id} className={item.readAt ? "rounded-md border p-3 sm:p-4" : "rounded-md border border-primary/40 bg-primary/5 p-3 sm:p-4"}>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-1">
                              <div className="font-medium">{item.title}</div>
                              <div className="text-sm text-muted-foreground">{item.body}</div>
                              <div className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</div>
                              <div className="flex flex-wrap gap-3 pt-1">
                                {listingId ? <Link className="text-sm underline" href={buildListingHref(listingId, listingChainKey)}>Open listing</Link> : null}
                                {marketplaceHref ? <Link className="text-sm underline" href={marketplaceHref}>Open matching results</Link> : null}
                              </div>
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
                                  } catch (error: unknown) {
                                    toast.error(getErrorMessage(error, "Failed to mark notification as read"));
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
            </React.Fragment>
          ) : null}

          {accountTab === "my-listings" ? (
            <Card className="market-panel market-panel-spotlight market-panel-spotlight-mint">
              <CardHeader>
                <div className="market-section-title">Listings</div>
                <CardTitle>My listings</CardTitle>
                <CardDescription>Your live seller inventory, presented in a cleaner classifieds-style view.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                {myListingIds === null || myListings === null ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-64" />
                    <Skeleton className="h-4 w-56" />
                    <Skeleton className="h-4 w-72" />
                  </div>
                ) : myListingIds.length === 0 ? (
                  <AccentCallout
                    label="Start selling"
                    tone="mint"
                    actions={
                      <Button asChild variant="outline" size="sm">
                        <Link href="/create">Create your first listing</Link>
                      </Button>
                    }
                  >
                    Your seller inventory is still empty. Publish the first listing and this space becomes your live storefront.
                  </AccentCallout>
                ) : (
                  <div className="space-y-2">
                    {(myListings ?? []).map((row) => (
                      <Link key={row.id} href={buildListingHref(String(row.id), defaultChainKey)} className="block rounded-2xl border px-3 py-3 text-sm transition-colors hover:bg-accent/30 sm:px-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="break-all font-medium">{row.id}</div>
                          <div className="text-xs text-muted-foreground">{statusLabel(row.status)}</div>
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
      <Card className="market-panel market-panel-spotlight market-panel-spotlight-amber">
        <CardHeader>
          <div className="market-section-title">Scope</div>
          <CardTitle>Settlement scope</CardTitle>
          <CardDescription>Account tools stay aligned to wallet connection and on-chain settlement only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
          <AccentCallout label="In scope" tone="amber">
            Wallet connection, escrow, and chain settlement remain in scope. Subscription billing and off-chain placement checkout are intentionally out of the product until they are fully implemented.
          </AccentCallout>
        </CardContent>
      </Card>

      <Card className="market-panel market-panel-spotlight market-panel-spotlight-blue">
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
                <Link className="underline" href={buildListingHref(String(lastListingId), defaultChainKey)}> {shortenHex(lastListingId)} </Link>
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
              <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder={`Leave empty for ${defaultNativeCurrencySymbol}`} />
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
                    address: marketplaceRegistryAddress,
                    abi: marketplaceRegistryAbi,
                    functionName: "withdrawPayout",
                    args: [tokenArg],
                  });
                  await publicClient.waitForTransactionReceipt({ hash });
                  toast.success("Withdraw complete", { id });
                } catch (error: unknown) {
                  toast.error(getErrorMessage(error, "Withdraw failed"));
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
                      disabled={escrowVaultAddress === zeroAddress || !vaultController.trim().length}
                      onClick={async () => {
                        try {
                          if (!publicClient) throw new Error("No public client");
                          const next = vaultController.trim();
                          if (!isAddress(next)) throw new Error("Invalid controller address");

                          const id = toast.loading("Setting controller…");
                          const hash = await writeContractAsync({
                            address: escrowVaultAddress,
                            abi: escrowVaultAbi,
                            functionName: "setController",
                            args: [next as Address],
                          });
                          await publicClient.waitForTransactionReceipt({ hash });
                          toast.success("Controller updated", { id });
                        } catch (error: unknown) {
                          toast.error(getErrorMessage(error, "Failed to set controller"));
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
                      disabled={escrowVaultAddress === zeroAddress || !vaultArbiter.trim().length}
                      onClick={async () => {
                        try {
                          if (!publicClient) throw new Error("No public client");
                          const next = vaultArbiter.trim();
                          if (!isAddress(next)) throw new Error("Invalid arbiter address");

                          const id = toast.loading("Setting vault arbiter…");
                          const hash = await writeContractAsync({
                            address: escrowVaultAddress,
                            abi: escrowVaultAbi,
                            functionName: "setArbiter",
                            args: [next as Address],
                          });
                          await publicClient.waitForTransactionReceipt({ hash });
                          toast.success("Vault arbiter updated", { id });
                        } catch (error: unknown) {
                          toast.error(getErrorMessage(error, "Failed to set vault arbiter"));
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
                          address: marketplaceRegistryAddress,
                          abi: marketplaceRegistryAbi,
                          functionName: "setArbiter",
                          args: [next as Address],
                        });
                        await publicClient.waitForTransactionReceipt({ hash });
                        toast.success("Registry arbiter updated", { id });
                      } catch (error: unknown) {
                        toast.error(getErrorMessage(error, "Failed to set registry arbiter"));
                      }
                    }}
                  >
                    Set registry arbiter
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Withdraw protocol fees (token optional)</Label>
                  <Input value={feesToken} onChange={(e) => setFeesToken(e.target.value)} placeholder={`Leave empty for ${defaultNativeCurrencySymbol}`} />
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
                          address: marketplaceRegistryAddress,
                          abi: marketplaceRegistryAbi,
                          functionName: "withdrawFees",
                          args: [tokenArg as Address],
                        });
                        await publicClient.waitForTransactionReceipt({ hash });
                        toast.success("Fees withdrawn", { id });
                      } catch (error: unknown) {
                        toast.error(getErrorMessage(error, "Withdraw fees failed"));
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
                  disabled={escrowVaultAddress === zeroAddress || !inspectEscrowId.trim().length}
                  onClick={async () => {
                    try {
                      if (!publicClient) throw new Error("No public client");
                      const id = inspectEscrowId.trim();
                      if (!id.startsWith("0x") || id.length !== 66) throw new Error("Escrow id must be bytes32 (0x + 64 hex chars)");

                      const res = await publicClient.readContract({
                        address: escrowVaultAddress,
                        abi: escrowVaultAbi,
                        functionName: "getEscrow",
                        args: [id as Hex],
                      });

                      setEscrowInfo(decodeEscrowReadResult(res));
                    } catch (error: unknown) {
                      setEscrowInfo(null);
                      toast.error(getErrorMessage(error, "Failed to read escrow"));
                    }
                  }}
                >
                  Read escrow
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Check credits (recipient + token)</Label>
                <Input value={creditRecipient} onChange={(e) => setCreditRecipient(e.target.value)} placeholder="Recipient 0x..." />
                <Input value={creditToken} onChange={(e) => setCreditToken(e.target.value)} placeholder={`Token 0x... (empty = ${defaultNativeCurrencySymbol})`} />
                <Button
                  variant="outline"
                  disabled={escrowVaultAddress === zeroAddress || !creditRecipient.trim().length}
                  onClick={async () => {
                    try {
                      if (!publicClient) throw new Error("No public client");
                      const recipient = creditRecipient.trim();
                      if (!isAddress(recipient)) throw new Error("Invalid recipient address");

                      const tokenArg = creditToken.trim().length ? creditToken.trim() : zeroAddress;
                      if (tokenArg !== zeroAddress && !isAddress(tokenArg)) throw new Error("Invalid token address");

                      const amount = await publicClient.readContract({
                        address: escrowVaultAddress,
                        abi: escrowVaultAbi,
                        functionName: "creditOf",
                        args: [recipient as Address, tokenArg as Address],
                      });
                      setCreditAmount(amount as bigint);
                    } catch (error: unknown) {
                      setCreditAmount(null);
                      toast.error(getErrorMessage(error, "Failed to read credits"));
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
