"use client";

import Link from "next/link";
import * as React from "react";

import { ListingCard } from "@/components/listing/ListingCard";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useListings } from "@/lib/hooks/useListings";

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
  const { listings, isLoading } = useListings({ limit: 8, sort: "newest" });

  const spotlightListings = React.useMemo(() => listings.slice(0, 4), [listings]);
  const freshListings = React.useMemo(() => listings.slice(0, 8), [listings]);

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
                ? "Signed-in members will later see favorite ads, followed sellers, and trust-badge surfacing here first."
                : "Sign-in and personalized landing inventory will expand here, but raw browsing remains available now through the marketplace route."}
            </div>
          </div>
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
            <p className="mt-1 text-sm text-muted-foreground">Recent inventory stays visible here, while sponsored and followed placements remain curated above.</p>
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
    </div>
  );
}
