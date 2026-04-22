"use client";

import Link from "next/link";
import * as React from "react";

import { ListingCard } from "@/components/listing/ListingCard";
import { useAuth } from "@/components/providers/AuthProvider";
import { AccentCallout } from "@/components/ui/accent-callout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJson, type ApiError } from "@/lib/api";
import { CATEGORY_TREE } from "@/lib/categories";
import { type ListingSummary, useListings } from "@/lib/hooks/useListings";
import { formatLocationLabel, getProfileLocationFilter } from "@/lib/location";
import { buildMarketplaceHref } from "@/lib/marketplace";

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
  viewCount?: number;
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

const spotlightRules = [
  {
    title: "Sign in before you manage anything",
    detail: "Account creation, watch activity, alerts, and saved seller flow should feel obvious before advanced seller tools show up.",
  },
  {
    title: "Browse by category",
    detail: "Antiques & Collectibles, Housewares, and everyday classifieds categories need to be visible from the first screen.",
  },
  {
    title: "Top ads stay visible",
    detail: "Popular and curated inventory can still lead the page, but the language should read like consumer classifieds rather than ad-tech placement rules.",
  },
];

const ecosystemSignals = [
  "Create an account, then land in a watch-first signed-in view for followed sellers, saved ads, saved searches, and alerts.",
  "Wallet linking stays available after profile setup instead of blocking the first session.",
  "Public launch stays focused on classifieds flow first, with dealer and subscription complexity deferred.",
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
  const [mostViewedListings, setMostViewedListings] = React.useState<Array<{ listing: ListingSummary; viewCount: number }>>([]);
  const [mostViewedError, setMostViewedError] = React.useState<string | null>(null);
  const [localListings, setLocalListings] = React.useState<ListingSummary[]>([]);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [isLoadingLocal, setIsLoadingLocal] = React.useState(false);
  const savedLocation = React.useMemo(() => getProfileLocationFilter(auth.user), [auth.user]);
  const savedLocationLabel = React.useMemo(() => formatLocationLabel(savedLocation), [savedLocation]);

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
      } catch (e: unknown) {
        if (!cancelled) {
          setFollowedSellers([]);
          setFollowedError((e as ApiError | null)?.message ?? "Could not load followed sellers");
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
      } catch (e: unknown) {
        if (!cancelled) {
          setFavoriteListings([]);
          setFavoriteError((e as ApiError | null)?.message ?? "Could not load favorite listings");
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
      } catch (e: unknown) {
        if (!cancelled) {
          setSponsoredListings([]);
          setSponsoredError((e as ApiError | null)?.message ?? "Could not load spotlight placements");
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!auth.isAuthenticated || !savedLocation) {
        setLocalListings([]);
        setLocalError(null);
        setIsLoadingLocal(false);
        return;
      }

      try {
        setIsLoadingLocal(true);
        const sp = new URLSearchParams();
        sp.set("limit", "4");
        sp.set("sort", "newest");
        if (savedLocation.city) sp.set("city", savedLocation.city);
        if (savedLocation.region) sp.set("region", savedLocation.region);
        if (savedLocation.postalCode) sp.set("postalCode", savedLocation.postalCode);

        const res = await fetchJson<{ items: BackendListingRow[] }>(`/listings?${sp.toString()}`, { timeoutMs: 5_000 });
        if (!cancelled) {
          setLocalListings((res.items ?? []).map((item) => toListingSummary(item)));
          setLocalError(null);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setLocalListings([]);
          setLocalError((e as ApiError | null)?.message ?? "Could not load nearby listings");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingLocal(false);
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated, savedLocation]);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetchJson<{ items: BackendListingRow[] }>("/listings/most-viewed?limit=4&windowDays=30", { timeoutMs: 5_000 });
        if (!cancelled) {
          setMostViewedListings((res.items ?? []).map((item) => ({ listing: toListingSummary(item), viewCount: Number(item.viewCount ?? 0) })));
          setMostViewedError(null);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setMostViewedListings([]);
          setMostViewedError((e as ApiError | null)?.message ?? "Could not load most viewed listings");
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
                Buy, sell, and watch local ads from one clear entry point.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-700 sm:text-base">
                The landing page now puts sign-in, categories, top ads, and live marketplace inventory ahead of protocol language. Buyers can start with real classifieds navigation, then move into saved ads, followed sellers, and account tools only when they need them.
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
              <div className="market-chip border-amber-200/80 bg-white/95 text-slate-900 shadow-sm">Antiques & Collectibles ready</div>
              <div className="market-chip border-amber-200/80 bg-white/95 text-slate-900 shadow-sm">Housewares added to public launch</div>
              <div className="market-chip border-amber-200/80 bg-white/95 text-slate-900 shadow-sm">Watch-first account flow for signed-in members</div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="market-stat bg-white/85">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Landing page priorities</div>
              <div className="mt-2 text-xl font-semibold text-slate-950">Sign in, categories, top ads, then the live marketplace.</div>
              <div className="mt-2 text-sm text-slate-700">
                The marketplace feed still lives under Browse, but this entry surface now clearly explains where to sign in, where to browse by category, and which top ads deserve attention right now.
              </div>
            </div>
            <div className="market-note text-sm">
              {auth.isAuthenticated
                ? "Signed-in members now get a watch-first account flow with followed sellers, saved ads, and alerts grouped together."
                : "Sign in to unlock watch activity and personalized order, or keep browsing the public marketplace right away."}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="market-panel market-panel-spotlight market-panel-spotlight-mint">
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
              <AccentCallout label="Follow sellers" tone="mint">
                You are signed in, but you are not following any sellers yet. Visit seller pages, follow trusted profiles, and their newest ads will land here first.
              </AccentCallout>
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
          <Card className="market-panel market-panel-spotlight market-panel-spotlight-blue">
            <CardHeader>
              <CardTitle>Favorites next</CardTitle>
              <CardDescription>The homepage order now explicitly reserves the second slot for favorite ads and sellers.</CardDescription>
            </CardHeader>
            <CardContent>
              {favoriteError ? <div className="market-note text-sm">{favoriteError}</div> : null}
              {!auth.isAuthenticated ? (
                <div className="market-note text-sm">Sign in with email or wallet, save listings from their detail pages, and they will appear here on your next visit.</div>
              ) : favoriteListings.length === 0 ? (
                <AccentCallout label="Save favorites" tone="blue">
                  You do not have favorite listings yet. Open any listing and save it to lift it into this homepage layer.
                </AccentCallout>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {favoriteListings.map((listing) => (
                    <ListingCard key={`${listing.chainKey}-${listing.id}`} row={listing} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="market-panel market-panel-spotlight market-panel-spotlight-amber">
            <CardHeader>
              <CardTitle>Top ads</CardTitle>
              <CardDescription>Featured listings still have a dedicated layer after followed sellers and favorites, but the surface now reads like top marketplace ads instead of an internal placement console.</CardDescription>
            </CardHeader>
            <CardContent>
              {sponsoredError ? <div className="market-note text-sm">{sponsoredError}</div> : null}
              {sponsoredListings.length === 0 ? (
                <AccentCallout label="Featured placement" tone="amber">
                  No featured top ads are active right now. As campaign windows or featured listings go live, they will appear here.
                </AccentCallout>
              ) : (
                <div className="grid gap-4">
                  {sponsoredListings.map((item) => (
                    <div key={`${item.listing.chainKey}-${item.listing.id}`} className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          <span>{item.sponsorLabel || "Top ad"}</span>
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
            <CardTitle>Browse by category</CardTitle>
            <CardDescription>Category entry points now reflect the public-launch classifieds focus, including antiques and housewares.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Object.entries(CATEGORY_TREE).map(([category, subcategories]) => (
              <Link key={category} href={buildMarketplaceHref({ category })} className="market-stat h-full bg-white/85 transition-colors hover:bg-accent/20">
                <div className="text-sm font-semibold text-slate-950">{category}</div>
                <div className="mt-2 text-sm leading-6 text-slate-700">{subcategories.slice(0, 3).join(" • ")}</div>
                <div className="mt-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">Open category</div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="market-panel">
          <CardHeader>
            <CardTitle>Account flow</CardTitle>
            <CardDescription>Keep the public homepage simple, then let sign-in unlock the watch and profile tools.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {spotlightRules.map((rule) => (
              <div key={rule.title} className="market-stat h-full bg-white/85">
                <div className="text-sm font-semibold text-slate-950">{rule.title}</div>
                <div className="mt-2 text-sm leading-6 text-slate-700">{rule.detail}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {auth.isAuthenticated && savedLocation ? (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="market-section-title">Nearby inventory</div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Fresh ads around {savedLocationLabel || "your area"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Signed-in discovery now uses your saved profile location so local inventory can surface before generic marketplace results.</p>
            </div>
            <Button asChild variant="outline" className="rounded-full">
              <Link href={buildMarketplaceHref(savedLocation ?? {})}>Refine local search</Link>
            </Button>
          </div>

          {localError ? <div className="market-note text-sm">{localError}</div> : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {isLoadingLocal
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
              : localListings.length > 0
                ? localListings.map((listing) => <ListingCard key={`${listing.chainKey}-${listing.id}`} row={listing} />)
                : (
                  <Card className="sm:col-span-2 xl:col-span-4">
                    <CardContent className="p-6 text-sm text-muted-foreground">
                      No nearby listings are active for your saved area yet. Open the marketplace to broaden the search or update your profile location.
                    </CardContent>
                  </Card>
                )}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="market-section-title">Live marketplace</div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Fresh ads now</h2>
            <p className="mt-1 text-sm text-muted-foreground">Recent inventory stays visible here after sign-in prompts, category entry points, and top ads are handled above.</p>
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
            <CardTitle>Most viewed ads</CardTitle>
            <CardDescription>Popular listings now reflect real listing detail traffic instead of placeholder homepage copy.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {mostViewedError ? <div className="market-note text-sm">{mostViewedError}</div> : null}
            {mostViewedListings.length === 0 ? (
              <div className="market-note text-sm">View data is still warming up. As shoppers open listing pages, the most viewed ads will populate here.</div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {mostViewedListings.map((item) => (
                  <div key={`${item.listing.chainKey}-${item.listing.id}`} className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.viewCount} views in the current window</div>
                    <ListingCard row={item.listing} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="market-panel market-panel-spotlight market-panel-spotlight-amber">
          <CardHeader>
            <CardTitle>Marketplace safety</CardTitle>
            <CardDescription>Trust and safety rules belong in the main buyer journey, not buried in docs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {safetyWarnings.map((warning) => (
              <AccentCallout key={warning} label="Safety guidance" tone="amber">
                {warning}
              </AccentCallout>
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
        <Card className="market-panel market-panel-spotlight market-panel-spotlight-blue">
          <CardHeader>
            <CardTitle>Sign in on any device</CardTitle>
            <CardDescription>Email-first access now sits alongside wallet connection so phones and tablets are not blocked by desktop wallet assumptions.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <AccentCallout label="Account access" tone="blue">
              Use the sign-in surface to create an account, recover a password, connect a wallet later, and move into the watch-first signed-in flow.
            </AccentCallout>
            <Button asChild className="rounded-full">
              <Link href="/sign-in">Open sign-in</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
