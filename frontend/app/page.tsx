"use client";

import Link from "next/link";
import * as React from "react";

import { ListingCard } from "@/components/listing/ListingCard";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJson } from "@/lib/api";
import { type ListingSummary, useListings } from "@/lib/hooks/useListings";

type FavoriteListing = {
  listingChainKey: string;
  listingId: string;
  createdAt: number;
};

type PromotionItem = {
  id: number;
  listingId: string;
  listingChainKey: string;
  sponsorLabel?: string | null;
  campaignName?: string | null;
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

function toListingSummary(row: BackendListingRow): ListingSummary {
  return {
    chainKey: row.chainKey,
    chainId: row.chainId,
    id: row.id as `0x${string}`,
    seller: row.seller as `0x${string}`,
    saleType: row.saleType as 0 | 1 | 2,
    token: row.token as `0x${string}`,
    price: BigInt(row.price),
    metadataURI: row.metadataURI,
    status: (row.active ? 1 : 2) as 1 | 2,
  };
}

const marketHubRules = [
  {
    title: "Paid subscription placement",
    detail: "Homepage spotlight inventory is reserved for sellers who pay for a MarketHub placement or partner campaign.",
  },
  {
    title: "Profile favorites",
    detail: "Favorite-driven placements are reserved for members saving trusted sellers and recurring ads they want to revisit.",
  },
  {
    title: "Followed profiles",
    detail: "Followed sellers earn priority visibility on the landing page so repeat buyers can pick up where they left off.",
  },
];

const ecosystemSignals = [
  "MarketHub is the paid banner and advertising layer for promoted listings.",
  "BlockPages increases seller verification, social trust, and partner visibility.",
  "Trusted seller badges and response signals will sit beside profile reputation, not inside random listing tiles.",
];

const safetyWarnings = [
  "Meet in safe public locations and avoid cash-only pressure tactics.",
  "Report scam attempts, counterfeit goods, and illicit sales directly from profile and listing pages.",
  "Warnings can escalate to badge removal or full profile bans when seller behavior crosses marketplace rules.",
];

export default function HomePage() {
  const auth = useAuth();
  const { listings, isLoading } = useListings({ limit: 24, sort: "newest" });
  const [followedSellers, setFollowedSellers] = React.useState<string[]>([]);
  const [followedError, setFollowedError] = React.useState<string | null>(null);
  const [favoriteListings, setFavoriteListings] = React.useState<ListingSummary[]>([]);
  const [favoriteError, setFavoriteError] = React.useState<string | null>(null);
  const [sponsoredListings, setSponsoredListings] = React.useState<Array<{ listing: ListingSummary; sponsorLabel?: string | null; campaignName?: string | null }>>([]);
  const [sponsoredError, setSponsoredError] = React.useState<string | null>(null);

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
        const uniqueKeys = Array.from(new Set((favorites.items ?? []).map((item) => `${item.listingChainKey}:${item.listingId}`))).slice(0, 4);
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
      try {
        const promotions = await fetchJson<{ items: PromotionItem[] }>("/promotions/homepage", { timeoutMs: 5_000 });
        const items = await Promise.all(
          (promotions.items ?? []).slice(0, 4).map(async (item) => {
            const detail = await fetchJson<{ listing: BackendListingRow }>(`/listings/${item.listingId}?chain=${encodeURIComponent(item.listingChainKey)}`, {
              timeoutMs: 5_000,
            });
            return {
              listing: toListingSummary(detail.listing),
              sponsorLabel: item.sponsorLabel ?? null,
              campaignName: item.campaignName ?? null,
            };
          })
        );

        if (!cancelled) {
          setSponsoredListings(items);
          setSponsoredError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setSponsoredListings([]);
          setSponsoredError(e?.message ?? "Could not load sponsored placements");
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const followedListings = React.useMemo(
    () => listings.filter((listing) => followedSellers.includes(String(listing.seller).toLowerCase())).slice(0, 4),
    [listings, followedSellers]
  );
  const spotlightListings = React.useMemo(
    () => listings.filter((listing) => !followedSellers.includes(String(listing.seller).toLowerCase())).slice(0, 4),
    [listings, followedSellers]
  );
  const freshListings = React.useMemo(
    () => listings.filter((listing) => !followedSellers.includes(String(listing.seller).toLowerCase())).slice(0, 8),
    [listings, followedSellers]
  );

  return (
    <div className="space-y-8">
      <section className="market-hero px-5 py-6 sm:px-8 sm:py-8">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr] lg:items-end">
          <div className="space-y-5">
            <div className="market-section-title">Zonycs marketplace</div>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                Local classifieds first, trust and promotion layered in through MarketHub.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-700 sm:text-base">
                The landing page now behaves like a consumer marketplace entry point instead of a protocol dashboard. Buyers land on curated inventory, seller trust signals, and a clear path into the live marketplace.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full px-6">
                <Link href="/marketplace">Browse marketplace</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full px-6">
                <Link href="/create">Post an ad</Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="rounded-full px-6 text-slate-700">
                <Link href="/dashboard">Seller dashboard</Link>
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="market-chip border-amber-200/80 bg-white/95 text-slate-900 shadow-sm">Desktop-first for power sellers</div>
              <div className="market-chip border-amber-200/80 bg-white/95 text-slate-900 shadow-sm">Tablet/mobile support for camera uploads</div>
              <div className="market-chip border-amber-200/80 bg-white/95 text-slate-900 shadow-sm">Wallet checkout stays available when needed</div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="market-stat bg-white/85">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Front-page rules</div>
              <div className="mt-2 text-xl font-semibold text-slate-950">Homepage placements are curated, not open feed inventory.</div>
              <div className="mt-2 text-sm text-slate-700">
                The marketplace feed lives under Browse. The landing page is reserved for paid placements, favorite-driven visibility, and followed-profile discovery.
              </div>
            </div>
            <div className="market-note text-sm">
              {auth.isAuthenticated
                ? "Signed-in members now get followed-seller inventory first. Favorites and sponsored placement slots are staged directly underneath it."
                : "Sign-in and personalized landing inventory expand here, but raw browsing remains available now through the marketplace route."}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="market-panel">
          <CardHeader>
            <CardTitle>Followed sellers first</CardTitle>
            <CardDescription>This section is driven by your real follow graph, not static homepage copy.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {followedError ? <div className="market-note text-sm">{followedError}</div> : null}
            {!auth.isAuthenticated ? (
              <div className="market-note text-sm">
                Follow a seller from their profile page, then come back here to see their newest ads ahead of the open marketplace feed.
              </div>
            ) : followedSellers.length === 0 ? (
              <div className="market-note text-sm">
                You are signed in, but you are not following any sellers yet. Visit seller pages, follow trusted profiles, and their newest ads will land here first.
              </div>
            ) : followedListings.length === 0 ? (
              <div className="market-note text-sm">
                You follow sellers already, but none of their recent inventory is available in the current homepage window yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {followedListings.map((listing) => (
                  <ListingCard key={`${listing.chainKey}-${listing.id}`} row={listing} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="market-panel">
            <CardHeader>
              <CardTitle>Favorites next</CardTitle>
              <CardDescription>The homepage order now explicitly reserves the second slot for favorite ads and sellers.</CardDescription>
            </CardHeader>
            <CardContent>
              {favoriteError ? <div className="market-note text-sm">{favoriteError}</div> : null}
              {!auth.isAuthenticated ? (
                <div className="market-note text-sm">Sign in with email or wallet, save listings from their detail pages, and they will appear here on your next visit.</div>
              ) : favoriteListings.length === 0 ? (
                <div className="market-note text-sm">You do not have favorite listings yet. Open any listing and save it to lift it into this homepage layer.</div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {favoriteListings.map((listing) => (
                    <ListingCard key={`${listing.chainKey}-${listing.id}`} row={listing} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="market-panel">
            <CardHeader>
              <CardTitle>Sponsored placements</CardTitle>
              <CardDescription>Paid MarketHub placements remain a dedicated layer after followed sellers and favorites.</CardDescription>
            </CardHeader>
            <CardContent>
              {sponsoredError ? <div className="market-note text-sm">{sponsoredError}</div> : null}
              {sponsoredListings.length === 0 ? (
                <div className="market-note text-sm">No sponsored placements are active right now. MarketHub inventory will appear here as soon as an admin activates a campaign window.</div>
              ) : (
                <div className="grid gap-4">
                  {sponsoredListings.map((item) => (
                    <div key={`${item.listing.chainKey}-${item.listing.id}`} className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        <span>{item.sponsorLabel || "MarketHub placement"}</span>
                        {item.campaignName ? <span>{item.campaignName}</span> : null}
                      </div>
                      <ListingCard row={item.listing} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="market-panel">
          <CardHeader>
            <CardTitle>MarketHub spotlight policy</CardTitle>
            <CardDescription>Only curated placement categories belong on the landing page.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {marketHubRules.map((rule) => (
              <div key={rule.title} className="market-stat h-full bg-white/85">
                <div className="text-sm font-semibold text-slate-950">{rule.title}</div>
                <div className="mt-2 text-sm leading-6 text-slate-700">{rule.detail}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="market-panel">
          <CardHeader>
            <CardTitle>BlockPages partnership</CardTitle>
            <CardDescription>Verification and online presence grow through partner trust layers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ecosystemSignals.map((signal) => (
              <div key={signal} className="market-note text-sm leading-6">
                {signal}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="market-section-title">Live marketplace</div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Fresh ads now</h2>
            <p className="mt-1 text-sm text-muted-foreground">Recent inventory stays visible here after followed sellers, favorites, and sponsored placement layers are handled above.</p>
          </div>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/marketplace">Open full marketplace</Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, index) => (
                <Card key={index}>
                  <CardHeader>
                    <div className="h-5 w-40 rounded bg-muted" />
                    <div className="h-4 w-56 rounded bg-muted" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="h-40 rounded bg-muted" />
                    <div className="h-4 w-32 rounded bg-muted" />
                    <div className="h-4 w-24 rounded bg-muted" />
                  </CardContent>
                </Card>
              ))
            : spotlightListings.map((listing) => <ListingCard key={listing.id} row={listing} />)}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="market-panel">
          <CardHeader>
            <CardTitle>Marketplace safety</CardTitle>
            <CardDescription>Trust and safety rules belong in the main buyer journey, not buried in docs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {safetyWarnings.map((warning) => (
              <div key={warning} className="market-note text-sm leading-6">
                {warning}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="market-panel">
          <CardHeader>
            <CardTitle>Fresh this week</CardTitle>
            <CardDescription>Newest real inventory remains available without burying the landing page under utility controls.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {freshListings.slice(0, 4).map((listing) => (
              <Link key={listing.id} href={`/listing/${listing.id}?chain=${listing.chainKey}`} className="block rounded-2xl border p-4 transition-colors hover:bg-accent/20">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{listing.saleType === 0 ? "Fixed price" : listing.saleType === 1 ? "Auction" : "Raffle"}</div>
                    <div className="mt-1 break-all text-xs text-muted-foreground">{listing.id}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{listing.chainKey}</div>
                </div>
              </Link>
            ))}
            <Button asChild variant="ghost" className="w-full justify-start rounded-xl">
              <Link href="/marketplace">See all live listings</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="market-panel">
          <CardHeader>
            <CardTitle>Mobile and tablet sign-in</CardTitle>
            <CardDescription>WalletConnect is the current mobile bridge for users outside wallet browsers.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="market-note text-sm">
              Use the sign-in surface to connect a wallet on tablet/mobile and review the planned non-wallet sign-in flow.
            </div>
            <Button asChild className="rounded-full">
              <Link href="/sign-in">Open sign-in</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
