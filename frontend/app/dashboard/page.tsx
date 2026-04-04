"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type Address, type Hex, isAddress, parseAbiItem, zeroAddress } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { toast } from "sonner";

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

type NotificationItem = {
  id: number;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  readAt?: number | null;
  createdAt: number;
};

type PromotionOption = {
  type: "bump" | "top" | "featured";
  label: string;
  description: string;
  amountCents: number;
  durationHours: number;
};

type PromotionItem = {
  id: number;
  listingId: string;
  listingChainKey: string;
  type: "bump" | "top" | "featured";
  status: string;
  endsAt: number;
};

type PaymentItem = {
  id: number;
  listingId?: string | null;
  listingChainKey?: string | null;
  promotionType?: string | null;
  status: string;
  amount: number;
  createdAt: number;
};

function formatFilters(filters: SavedSearchFilters) {
  return Object.entries(filters)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" • ");
}

function formatMoneyFromCents(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
}

function formatDateTime(value: number) {
  return new Date(value).toLocaleString();
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
  const searchParams = useSearchParams();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const auth = useAuth();

  const [displayName, setDisplayName] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [avatarCid, setAvatarCid] = React.useState("");

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
  const [promotionOptions, setPromotionOptions] = React.useState<PromotionOption[]>([]);
  const [promotions, setPromotions] = React.useState<PromotionItem[]>([]);
  const [payments, setPayments] = React.useState<PaymentItem[]>([]);
  const [promotionListingId, setPromotionListingId] = React.useState("");
  const [promotionType, setPromotionType] = React.useState<PromotionOption["type"]>("bump");
  const [isCreatingPromotion, setIsCreatingPromotion] = React.useState(false);
  const [editingSavedSearchId, setEditingSavedSearchId] = React.useState<number | null>(null);
  const [savedSearchDraft, setSavedSearchDraft] = React.useState<SavedSearchDraft | null>(null);
  const [isSavingSavedSearch, setIsSavingSavedSearch] = React.useState(false);
  const [dashboardRefreshKey, setDashboardRefreshKey] = React.useState(0);

  React.useEffect(() => {
    setDisplayName(auth.user?.displayName ?? "");
    setBio(auth.user?.bio ?? "");
    setAvatarCid(auth.user?.avatarCid ?? "");
  }, [auth.user]);

  React.useEffect(() => {
    if (!myListings || myListings.length === 0 || promotionListingId) return;
    setPromotionListingId(myListings[0].id);
  }, [myListings, promotionListingId]);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!auth.isAuthenticated) {
        setSavedSearches([]);
        setNotifications([]);
        setNotificationUnreadCount(0);
        setPayments([]);
        setPromotions([]);
        return;
      }

      try {
        const [savedSearchRes, notificationRes, promotionRes] = await Promise.all([
          fetchJson<{ items: SavedSearch[] }>("/saved-searches", { timeoutMs: 5_000 }),
          fetchJson<{ items: NotificationItem[]; unreadCount: number }>("/notifications?limit=12", { timeoutMs: 5_000 }),
          fetchJson<{ payments: PaymentItem[]; promotions: PromotionItem[]; options: PromotionOption[] }>("/promotions/me", { timeoutMs: 5_000 }),
        ]);
        if (cancelled) return;
        setSavedSearches(savedSearchRes.items ?? []);
        setNotifications(notificationRes.items ?? []);
        setNotificationUnreadCount(notificationRes.unreadCount ?? 0);
        setPayments(promotionRes.payments ?? []);
        setPromotions(promotionRes.promotions ?? []);
        setPromotionOptions(promotionRes.options ?? []);
      } catch (e: any) {
        if (!cancelled) {
          toast.error(e?.message ?? "Failed to load dashboard alerts and promotions");
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
      const sessionId = searchParams.get("promotion_session");
      if (!sessionId || !auth.isAuthenticated) return;

      try {
        const res = await fetchJson<{ activated: boolean }>("/promotions/confirm-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
          timeoutMs: 10_000,
        });
        if (!cancelled) {
          toast.success(res.activated ? "Promotion activated" : "Payment is still pending");
          setDashboardRefreshKey((value) => value + 1);
          window.history.replaceState({}, "", "/dashboard");
        }
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message ?? "Failed to confirm promotion payment");
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated, searchParams]);

  const activeSavedSearchSubcategories = React.useMemo(() => {
    if (!savedSearchDraft?.filters.category) return [];
    return subcategoriesFor(savedSearchDraft.filters.category);
  }, [savedSearchDraft?.filters.category]);

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
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Manage your marketplace activity.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Sign in with your wallet to edit the public profile shown on your seller page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!auth.isAuthenticated ? (
            <div className="space-y-3 text-sm">
              <div className="text-muted-foreground">Connect your wallet and complete wallet sign-in to edit your profile.</div>
              {address ? (
                <Button type="button" variant="outline" size="lg" className="w-full sm:w-auto" disabled={auth.isLoading} onClick={() => void auth.signIn()}>
                  Sign in
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Display name</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Victor's Store" />
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
                        displayName,
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

      <Card>
        <CardHeader>
          <CardTitle>Saved searches</CardTitle>
          <CardDescription>Review, edit, and remove the alert searches you saved from the listings page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!auth.isAuthenticated ? (
            <div className="text-sm text-muted-foreground">Sign in to manage saved search alerts.</div>
          ) : savedSearches.length === 0 ? (
            <div className="text-sm text-muted-foreground">No saved searches yet.</div>
          ) : (
            savedSearches.map((item) => (
              <div key={item.id} className="rounded-md border p-3">
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
                    <div className="grid gap-4 rounded-md border bg-muted/20 p-4 lg:grid-cols-3">
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

      <Card id="notifications">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>In-app alerts for new saved-search matches and promotion activity.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
                <div key={item.id} className={item.readAt ? "rounded-md border p-3" : "rounded-md border border-primary/40 bg-primary/5 p-3"}>
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

      <Card>
        <CardHeader>
          <CardTitle>Promote listings</CardTitle>
          <CardDescription>Purchase bump, top, or featured placement for your active listings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!auth.isAuthenticated ? (
            <div className="text-sm text-muted-foreground">Sign in to purchase listing promotions.</div>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
                <div className="space-y-2">
                  <Label>Listing</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={promotionListingId}
                    onChange={(e) => setPromotionListingId(e.target.value)}
                  >
                    <option value="">Select a listing</option>
                    {(myListings ?? []).map((row) => (
                      <option key={row.id} value={row.id}>{row.id}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Placement</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={promotionType}
                    onChange={(e) => setPromotionType(e.target.value as PromotionOption["type"])}
                  >
                    {promotionOptions.map((option) => (
                      <option key={option.type} value={option.type}>
                        {option.label} - {formatMoneyFromCents(option.amountCents)} / {option.durationHours}h
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    size="lg"
                    disabled={!promotionListingId || isCreatingPromotion}
                    onClick={async () => {
                      try {
                        setIsCreatingPromotion(true);
                        const res = await fetchJson<{ url?: string | null }>("/promotions/checkout-session", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ listingId: promotionListingId, chainKey: env.defaultChain.key, promotionType }),
                          timeoutMs: 10_000,
                        });
                        if (!res.url) throw new Error("Stripe did not return a checkout URL");
                        window.location.assign(res.url);
                      } catch (e: any) {
                        toast.error(e?.message ?? "Failed to start promotion checkout");
                      } finally {
                        setIsCreatingPromotion(false);
                      }
                    }}
                  >
                    Buy placement
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                {promotionOptions.map((option) => (
                  <div key={option.type} className="rounded-md border p-3">
                    <div className="font-medium">{option.label}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{option.description}</div>
                    <div className="mt-2 text-sm">{formatMoneyFromCents(option.amountCents)} for {option.durationHours} hours</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Active and past promotions</div>
                  {promotions.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No promotions yet.</div>
                  ) : (
                    promotions.map((item) => (
                      <div key={item.id} className="rounded-md border p-3 text-sm">
                        <div className="font-medium">{item.type} on <Link className="underline" href={buildListingHref(item.listingId, item.listingChainKey)}>{item.listingId}</Link></div>
                        <div className="text-muted-foreground">Status: {item.status}</div>
                        <div className="text-muted-foreground">Ends: {formatDateTime(item.endsAt)}</div>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-semibold">Payment history</div>
                  {payments.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No promotion payments yet.</div>
                  ) : (
                    payments.map((item) => (
                      <div key={item.id} className="rounded-md border p-3 text-sm">
                        <div className="font-medium">{item.promotionType ?? "promotion"} payment</div>
                        <div className="text-muted-foreground">{formatMoneyFromCents(item.amount)} • {item.status}</div>
                        <div className="text-muted-foreground">{item.listingId ? <Link className="underline" href={buildListingHref(item.listingId, item.listingChainKey)}>{item.listingId}</Link> : "No listing"}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wallet</CardTitle>
          <CardDescription>Connected address and quick helpers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
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

      <Card>
        <CardHeader>
          <CardTitle>Withdraw payout</CardTitle>
          <CardDescription>Withdraw your credits from EscrowVault through the registry.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Owner tools</CardTitle>
          <CardDescription>Admin/owner-only utilities for EscrowVault and the registry.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

          <div className="rounded-md border p-4 space-y-3">
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

          <div className="rounded-md border p-4 space-y-3">
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

          <div className="rounded-md border p-4 space-y-3">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My listings</CardTitle>
          <CardDescription>Listings you created (from on-chain events).</CardDescription>
        </CardHeader>
        <CardContent>
          {myListingIds === null || myListings === null ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-72" />
            </div>
          ) : myListingIds.length === 0 ? (
            <div className="text-sm text-muted-foreground">No listings found.</div>
          ) : (
            <div className="space-y-2">
              {(myListings ?? []).map((row) => (
                <Link key={row.id} href={buildListingHref(String(row.id), env.defaultChain.key)} className="block rounded-md border px-3 py-2 text-sm hover:bg-accent/30">
                  <div className="flex items-center justify-between gap-3">
                    <div className="break-all">{row.id}</div>
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
    </div>
  );
}
