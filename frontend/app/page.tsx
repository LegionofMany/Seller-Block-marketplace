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
  const featuredCategories = React.useMemo(() => Object.keys(CATEGORY_TREE).slice(0, 6), []);

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-[2rem] border border-amber-300/70 bg-[linear-gradient(135deg,rgba(255,248,228,0.95),rgba(255,255,255,0.98))] px-5 py-6 shadow-[0_30px_80px_rgba(146,64,14,0.08)] sm:px-8 sm:py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="market-section-title">Homepage paid ads</div>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Paid ads now lead the Zonycs home page before sign-in or deeper browsing.
            </h1>
            
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="rounded-full px-6">
              <Link href="/create">Post an ad</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full px-6">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            {auth.isAdmin ? (
              <Button asChild size="lg" variant="ghost" className="rounded-full px-6 text-slate-700">
                <Link href="/dashboard">Manage homepage ads</Link>
              </Button>
            ) : null}
          </div>
        </div>

        {sponsoredError ? <AccentCallout label="Homepage paid ads" tone="amber">{sponsoredError}</AccentCallout> : null}

        {sponsoredListings.length === 0 ? (
          <Card className="border-amber-200/70 bg-white/90">
            <CardContent className="flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-slate-950">No homepage paid ads are live right now.</div>
                <div className="text-sm text-slate-700">
                  As soon as a sponsored campaign is activated, it will appear here first for every visitor before the rest of the marketplace flow.
                </div>
              </div>
              {auth.isAdmin ? (
                <Button asChild className="rounded-full">
                  <Link href="/dashboard">Create homepage ad</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
            {sponsoredListings.map((item, index) => (
              <div key={`${item.listing.chainKey}-${item.listing.id}`} className={index === 0 ? "xl:col-span-2" : "xl:col-span-1"}>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  <span>{item.sponsorLabel || "Paid ad"}</span>
                  {item.campaignName ? <span>{item.campaignName}</span> : null}
                </div>
                <ListingCard row={item.listing} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="market-hero px-5 py-6 sm:px-8 sm:py-8">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr] lg:items-end">
          <div className="space-y-5">
            <div className="market-section-title">Zonycs marketplace</div>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                Post ads, discover local inventory, and sign in only when you need the account tools.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-700 sm:text-base">
                The public entry point is being narrowed down to the pieces that matter most: homepage paid ads, a direct post-ad path, a clear sign-in option, and live marketplace inventory that feels closer to familiar classifieds sites.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full px-6">
                <Link href="/create">Post an ad</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full px-6">
                <Link href="/marketplace">Browse marketplace</Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="rounded-full px-6 text-slate-700">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="market-chip border-amber-200/80 bg-white/95 text-slate-900 shadow-sm">Homepage paid ads first</div>
              <div className="market-chip border-amber-200/80 bg-white/95 text-slate-900 shadow-sm">Direct post-an-ad path</div>
              {featuredCategories.map((category) => (
                <Link key={category} href={buildMarketplaceHref({ category })} className="market-chip border-amber-200/80 bg-white/95 text-slate-900 shadow-sm">
                  {category}
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="market-stat bg-white/85">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Landing page priorities</div>
              <div className="mt-2 text-xl font-semibold text-slate-950">Paid ads first. Posting and browsing stay one click away.</div>
              <div className="mt-2 text-sm text-slate-700">
                The first screen should read like a marketplace front page, not a control panel. Sponsored inventory leads and the rest of the tools stay compact until the user chooses them.
              </div>
            </div>
            <AccentCallout label="Watch-first flow" tone={auth.isAuthenticated ? "mint" : "blue"}>
              {auth.isAuthenticated
                ? "Signed-in members still get watched items, followed sellers, and personalized discovery, but those now sit behind the first homepage impression instead of ahead of it."
                : "Visitors can browse right away, then sign in when they want saved searches, watched ads, and account tools."}
            </AccentCallout>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="market-panel market-panel-spotlight market-panel-spotlight-mint">
          <CardHeader>
            <CardTitle>Quick browse</CardTitle>
            <CardDescription>Keep the next step simple: browse fast, post fast, or sign in for personalized tools.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {featuredCategories.map((category) => (
                <Link key={category} href={buildMarketplaceHref({ category })} className="market-stat h-full bg-white/85 transition-colors hover:bg-accent/20">
                  <div className="text-sm font-semibold text-slate-950">{category}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">{CATEGORY_TREE[category].slice(0, 2).join(" • ")}</div>
                  <div className="mt-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">Open category</div>
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="rounded-full">
                <Link href="/create">Post an ad</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/marketplace">Open marketplace</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="market-panel market-panel-spotlight market-panel-spotlight-blue">
          <CardHeader>
            <CardTitle>{auth.isAuthenticated ? "Your shortcuts" : "Sign in when you want the extras"}</CardTitle>
            <CardDescription>
              {auth.isAuthenticated
                ? "Saved ads and followed sellers stay available without crowding the opening screen."
                : "Browsing stays public. Sign in only when you want favorites, follows, and saved-search tools."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {followedError ? <AccentCallout label="Followed sellers" tone="amber">{followedError}</AccentCallout> : null}
            {favoriteError ? <AccentCallout label="Favorites" tone="amber">{favoriteError}</AccentCallout> : null}

            {auth.isAuthenticated ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="market-stat h-full bg-white/85">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Followed sellers</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">{followedSellers.length}</div>
                    <div className="mt-2 text-sm text-slate-700">{followedListings.length > 0 ? "Fresh inventory from trusted sellers is ready below." : "Follow more sellers to personalize the feed."}</div>
                  </div>
                  <div className="market-stat h-full bg-white/85">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Saved favorites</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">{favoriteListings.length}</div>
                    <div className="mt-2 text-sm text-slate-700">Open any listing and save it to keep it close to the homepage.</div>
                  </div>
                </div>

                {followedListings.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-slate-950">From followed sellers</div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {followedListings.slice(0, 2).map((listing) => (
                        <ListingCard key={`${listing.chainKey}-${listing.id}`} row={listing} />
                      ))}
                    </div>
                  </div>
                ) : null}

                {favoriteListings.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-slate-950">Saved favorites</div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {favoriteListings.slice(0, 2).map((listing) => (
                        <ListingCard key={`${listing.chainKey}-${listing.id}`} row={listing} />
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <Button asChild variant="outline" className="rounded-full">
                    <Link href="/dashboard?tab=watch">Open watch tools</Link>
                  </Button>
                  <Button asChild variant="ghost" className="rounded-full">
                    <Link href="/marketplace">Keep browsing</Link>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <AccentCallout label="Personalized later" tone="blue">
                  Sign in to save favorites, follow sellers, and bring watched inventory back onto the homepage after the paid-ad layer.
                </AccentCallout>
                <div className="flex flex-wrap gap-3">
                  <Button asChild className="rounded-full">
                    <Link href="/sign-in">Open sign-in</Link>
                  </Button>
                  <Button asChild variant="outline" className="rounded-full">
                    <Link href="/marketplace">Keep browsing</Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {auth.isAuthenticated && savedLocation ? (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="market-section-title">Nearby inventory</div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Fresh ads around {savedLocationLabel || "your area"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Signed-in discovery uses your saved location so nearby inventory can surface before generic marketplace results.</p>
            </div>
            <Button asChild variant="outline" className="rounded-full">
              <Link href={buildMarketplaceHref(savedLocation ?? {})}>Refine local search</Link>
            </Button>
          </div>

          {localError ? <AccentCallout label="Nearby inventory" tone="amber">{localError}</AccentCallout> : null}

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
                  <Card className="market-panel market-panel-spotlight market-panel-spotlight-blue sm:col-span-2 xl:col-span-4">
                    <CardContent className="p-6">
                      <AccentCallout label="No nearby matches" tone="blue">
                        No nearby listings are active for your saved area yet. Open the marketplace to broaden the search or update your profile location.
                      </AccentCallout>
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
            <p className="mt-1 text-sm text-muted-foreground">Recent inventory stays visible here after sign-in prompts, categories, and featured ads are handled above.</p>
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
        <Card className="market-panel market-panel-spotlight market-panel-spotlight-blue">
          <CardHeader>
            <CardTitle>Most viewed ads</CardTitle>
            <CardDescription>Popular listings now reflect real buyer attention instead of placeholder ranking.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {mostViewedError ? <AccentCallout label="Most viewed ads" tone="amber">{mostViewedError}</AccentCallout> : null}
            {mostViewedListings.length === 0 ? (
              <AccentCallout label="View data warming up" tone="blue">
                As shoppers open listing pages, the most viewed ads will populate here.
              </AccentCallout>
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
            <CardDescription>Trust and safety belong in the buyer journey, not buried in documentation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {safetyWarnings.map((warning) => (
              <AccentCallout key={warning} label="Safety guidance" tone="amber">
                {warning}
              </AccentCallout>
            ))}
          </CardContent>
        </Card>

        <Card className="market-panel market-panel-spotlight market-panel-spotlight-mint">
          <CardHeader>
            <CardTitle>Fresh this week</CardTitle>
            <CardDescription>Fresh inventory stays visible without letting utility controls take over the page.</CardDescription>
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
            <CardDescription>Email-first access stays available without getting in the way of the homepage ad experience.</CardDescription>
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
