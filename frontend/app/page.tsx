"use client";

import Link from "next/link";
import * as React from "react";
import { useRouter } from "next/navigation";

import { ListingCard } from "@/components/listing/ListingCard";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api";
import { CATEGORY_TREE } from "@/lib/categories";
import { type ListingSummary, useListings } from "@/lib/hooks/useListings";
import { formatLocationLabel, getProfileLocationFilter } from "@/lib/location";
import { buildMarketplaceHref } from "@/lib/marketplace";
import { fetchMetadataByUri } from "@/lib/metadata";

/* ─── Category icons (inline SVG paths) ──────────────────────────── */
const CATEGORY_META: Record<string, { icon: string; color: string }> = {
  "Buy & Sell":    { icon: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z", color: "bg-blue-50 text-blue-600" },
  "Cars & Vehicles": { icon: "M8 17a2 2 0 100 4 2 2 0 000-4zm8 0a2 2 0 100 4 2 2 0 000-4zm-8-2h8M3 17V7l3-4h12l3 4v10", color: "bg-green-50 text-green-600" },
  "Real Estate":   { icon: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10", color: "bg-orange-50 text-orange-600" },
  "Jobs":          { icon: "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z", color: "bg-purple-50 text-purple-600" },
  "Services":      { icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z", color: "bg-rose-50 text-rose-600" },
  "Pets":          { icon: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z", color: "bg-amber-50 text-amber-600" },
};

type FavoriteListing  = { listingChainKey: string; listingId: string; createdAt: number };
type PromotionItem    = { id: number; listingId: string; listingChainKey: string; sponsorLabel?: string | null; campaignName?: string | null };
type BackendListingRow = { chainKey: string; chainId: number; id: string; seller: string; metadataURI: string; price: string; token: string; saleType: number; active: 0 | 1; viewCount?: number };

function toListingSummary(row: BackendListingRow): ListingSummary {
  return {
    chainKey: row.chainKey, chainId: row.chainId,
    id: row.id as `0x${string}`, seller: row.seller as `0x${string}`,
    saleType: row.saleType as 0 | 1 | 2, token: row.token as `0x${string}`,
    price: BigInt(row.price), metadataURI: row.metadataURI,
    status: (row.active ? 1 : 2) as 1 | 2,
  };
}

/* ─── Hero search bar ─────────────────────────────────────────────── */
function HeroSearch() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    router.push(`/marketplace${sp.toString() ? `?${sp}` : ""}`);
  }
  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-2xl gap-2">
      <div className="relative flex-1">
        <svg className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="What are you looking for?"
          className="h-12 w-full rounded-full border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <button
        type="submit"
        className="h-12 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        Search
      </button>
    </form>
  );
}

/* ─── Stat chip ───────────────────────────────────────────────────── */
function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-2xl font-bold text-slate-900">{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

/* ─── Section header ──────────────────────────────────────────────── */
function SectionHeader({ title, subtitle, href, linkLabel }: { title: string; subtitle?: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {href && linkLabel && (
        <Link href={href} className="shrink-0 text-sm font-semibold text-primary hover:underline">
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────── */
export default function HomePage() {
  const auth = useAuth();
  const { listings, isLoading } = useListings({ limit: 8, sort: "newest" });

  const [favoriteListings,  setFavoriteListings]  = React.useState<ListingSummary[]>([]);
  const [sponsoredListings, setSponsoredListings] = React.useState<Array<{ listing: ListingSummary; sponsorLabel?: string | null }>>([]);
  const [mostViewedListings,setMostViewedListings]= React.useState<Array<{ listing: ListingSummary; viewCount: number }>>([]);
  const [localListings,     setLocalListings]     = React.useState<ListingSummary[]>([]);
  const [isLoadingLocal,    setIsLoadingLocal]    = React.useState(false);
  const [freshMeta, setFreshMeta] = React.useState<Record<string, { title: string; image: string; location: string }>>({});

  const savedLocation = React.useMemo(() => getProfileLocationFilter(auth.user), [auth.user]);
  const savedLocationLabel = React.useMemo(() => formatLocationLabel(savedLocation), [savedLocation]);
  const featuredCategories = React.useMemo(() => Object.keys(CATEGORY_TREE).slice(0, 6), []);
  const spotlightListings  = React.useMemo(() => listings.slice(0, 8), [listings]);

  /* Favourites */
  React.useEffect(() => {
    if (!auth.isAuthenticated) { setFavoriteListings([]); return; }
    let cancelled = false;
    async function run() {
      try {
        const favs = await fetchJson<{ items: FavoriteListing[] }>("/favorites/listings", { timeoutMs: 5_000 });
        const keys = Array.from(new Set((favs.items ?? []).map((f) => `${f.listingChainKey}:${f.listingId}`))).slice(0, 4);
        const rows = await Promise.all(keys.map(async (k) => {
          const [chainKey, id] = k.split(":");
          const d = await fetchJson<{ listing: BackendListingRow }>(`/listings/${id}?chain=${encodeURIComponent(chainKey)}`, { timeoutMs: 5_000 });
          return toListingSummary(d.listing);
        }));
        if (!cancelled) setFavoriteListings(rows);
      } catch { if (!cancelled) setFavoriteListings([]); }
    }
    void run();
    return () => { cancelled = true; };
  }, [auth.isAuthenticated]);

  /* Sponsored */
  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const promo = await fetchJson<{ items: PromotionItem[] }>("/promotions/homepage", { timeoutMs: 5_000 });
        const items = await Promise.all((promo.items ?? []).slice(0, 4).map(async (p) => {
          const d = await fetchJson<{ listing: BackendListingRow }>(`/listings/${p.listingId}?chain=${encodeURIComponent(p.listingChainKey)}`, { timeoutMs: 5_000 });
          return { listing: toListingSummary(d.listing), sponsorLabel: p.sponsorLabel ?? null };
        }));
        if (!cancelled) setSponsoredListings(items);
      } catch { if (!cancelled) setSponsoredListings([]); }
    }
    void run();
    return () => { cancelled = true; };
  }, []);

  /* Most viewed */
  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await fetchJson<{ items: BackendListingRow[] }>("/listings/most-viewed?limit=4&windowDays=30", { timeoutMs: 5_000 });
        if (!cancelled) setMostViewedListings((res.items ?? []).map((r) => ({ listing: toListingSummary(r), viewCount: Number(r.viewCount ?? 0) })));
      } catch { if (!cancelled) setMostViewedListings([]); }
    }
    void run();
    return () => { cancelled = true; };
  }, []);

  /* Local listings */
  React.useEffect(() => {
    if (!auth.isAuthenticated || !savedLocation) { setLocalListings([]); return; }
    let cancelled = false;
    const loc = savedLocation;
    async function run() {
      setIsLoadingLocal(true);
      try {
        const sp = new URLSearchParams({ limit: "4", sort: "newest" });
        if (loc.city) sp.set("city", loc.city);
        if (loc.region) sp.set("region", loc.region);
        if (loc.postalCode) sp.set("postalCode", loc.postalCode);
        const res = await fetchJson<{ items: BackendListingRow[] }>(`/listings?${sp}`, { timeoutMs: 5_000 });
        if (!cancelled) setLocalListings((res.items ?? []).map(toListingSummary));
      } catch { if (!cancelled) setLocalListings([]); }
      finally { if (!cancelled) setIsLoadingLocal(false); }
    }
    void run();
    return () => { cancelled = true; };
  }, [auth.isAuthenticated, savedLocation]);

  /* Fresh listing meta */
  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      const missing = spotlightListings.filter((l) => !freshMeta[l.id]);
      await Promise.all(missing.map(async (l) => {
        try {
          const uri = l.metadataURI;
          let res: { title?: string; image?: string; images?: string[]; city?: string; region?: string } | null = null;
          if (uri.startsWith("metadata://sha256/")) res = await fetchJson(`/metadata/lookup?uri=${encodeURIComponent(uri)}`, { timeoutMs: 5_000 });
          else if (uri.startsWith("ipfs://")) res = await fetchMetadataByUri(uri);
          if (cancelled) return;
          const image = (Array.isArray(res?.images) && res.images[0]) || res?.image || "";
          const location = [res?.city, res?.region].filter(Boolean).join(", ");
          setFreshMeta((c) => ({ ...c, [l.id]: { title: res?.title?.trim() || "Listing", image, location } }));
        } catch { if (!cancelled) setFreshMeta((c) => ({ ...c, [l.id]: { title: "Listing", image: "", location: "" } })); }
      }));
    }
    void run();
    return () => { cancelled = true; };
  }, [spotlightListings, freshMeta]);

  return (
    <div className="space-y-12">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6 py-14 sm:px-12 sm:py-20 text-white">
        {/* subtle grid pattern */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-white/70">
            🇨🇦 Canada&apos;s blockchain marketplace
          </div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
            Buy, sell &amp; discover<br className="hidden sm:block" /> anything near you.
          </h1>
          <p className="max-w-xl text-base text-white/70 sm:text-lg">
            Free to post, free to browse. Secure blockchain-settled transactions for cars, real estate, jobs &amp; more.
          </p>
          <HeroSearch />
          <div className="flex flex-wrap justify-center gap-2 text-sm text-white/60">
            {featuredCategories.map((cat) => (
              <Link key={cat} href={buildMarketplaceHref({ category: cat })}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 transition-colors hover:bg-white/10 hover:text-white">
                {cat}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust stats ──────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-4 rounded-2xl border bg-white px-6 py-6 sm:grid-cols-4 sm:gap-0 sm:divide-x">
        <StatChip value="Free" label="to post any ad" />
        <StatChip value="24/7" label="live marketplace" />
        <StatChip value="🔒" label="blockchain escrow" />
        <StatChip value="Local" label="listings near you" />
      </section>

      {/* ── Categories ───────────────────────────────────────── */}
      <section className="space-y-5">
        <SectionHeader title="Browse by category" subtitle="Find what you need — or post your own ad in minutes." href="/marketplace" linkLabel="All listings" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {featuredCategories.map((cat) => {
            const meta = CATEGORY_META[cat] ?? { icon: "", color: "bg-slate-50 text-slate-600" };
            return (
              <Link
                key={cat}
                href={buildMarketplaceHref({ category: cat })}
                className="group flex flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-white p-5 text-center shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${meta.color}`}>
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d={meta.icon} />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-slate-800 group-hover:text-primary transition-colors">{cat}</span>
                <span className="text-xs text-slate-400">{(CATEGORY_TREE[cat] ?? []).slice(0, 2).join(" · ")}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Sponsored / featured ─────────────────────────────── */}
      {sponsoredListings.length > 0 && (
        <section className="space-y-5">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-widest text-amber-700">Featured</span>
            <h2 className="text-xl font-bold text-slate-900">Promoted listings</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {sponsoredListings.map((item) => (
              <div key={`${item.listing.chainKey}-${item.listing.id}`} className="relative">
                {item.sponsorLabel && (
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-600">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                    {item.sponsorLabel}
                  </div>
                )}
                <ListingCard row={item.listing} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Nearby listings (authenticated + location saved) ─── */}
      {auth.isAuthenticated && savedLocation && (
        <section className="space-y-5 rounded-2xl border border-blue-100 bg-blue-50/40 p-6">
          <SectionHeader
            title={`Near ${savedLocationLabel || "you"}`}
            subtitle="Fresh ads in your saved area."
            href={buildMarketplaceHref(savedLocation ?? {})}
            linkLabel="Refine search"
          />
          {isLoadingLocal ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-slate-200" />
              ))}
            </div>
          ) : localListings.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {localListings.map((l) => <ListingCard key={`${l.chainKey}-${l.id}`} row={l} />)}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No listings found near your saved area yet.</p>
          )}
        </section>
      )}

      {/* ── Latest listings ───────────────────────────────────── */}
      <section className="space-y-5">
        <SectionHeader title="Latest listings" subtitle="The most recently posted ads from sellers everywhere." href="/marketplace" linkLabel="See all" />
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                <div className="aspect-[4/3] animate-pulse bg-slate-100" />
                <div className="space-y-2 p-3">
                  <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
                  <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {spotlightListings.map((l) => <ListingCard key={l.id} row={l} />)}
          </div>
        )}
      </section>

      {/* ── Most viewed ──────────────────────────────────────── */}
      {mostViewedListings.length > 0 && (
        <section className="space-y-5">
          <SectionHeader title="Most viewed right now" subtitle="The listings buyers are looking at most." href="/marketplace?sort=newest" linkLabel="Browse all" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {mostViewedListings.map((item) => (
              <div key={`${item.listing.chainKey}-${item.listing.id}`}>
                <div className="mb-2 flex items-center gap-1 text-xs font-medium text-slate-400">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {item.viewCount} views
                </div>
                <ListingCard row={item.listing} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Favourites (authenticated) ───────────────────────── */}
      {auth.isAuthenticated && favoriteListings.length > 0 && (
        <section className="space-y-5">
          <SectionHeader title="Your saved listings" subtitle="Items you saved while browsing." href="/dashboard?tab=watch" linkLabel="Open dashboard" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {favoriteListings.map((l) => <ListingCard key={`${l.chainKey}-${l.id}`} row={l} />)}
          </div>
        </section>
      )}

      {/* ── Post CTA banner ───────────────────────────────────── */}
      <section className="flex flex-col items-center gap-6 rounded-3xl bg-gradient-to-r from-primary to-primary/80 px-8 py-14 text-center text-white sm:flex-row sm:justify-between sm:text-left">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold sm:text-3xl">Ready to sell?</h2>
          <p className="text-white/80">Post a free ad and reach thousands of local buyers in minutes.</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-center gap-3 sm:justify-start">
          <Button asChild size="lg" className="rounded-full bg-white text-primary hover:bg-white/90">
            <Link href="/create">Post a free ad</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-full border-white/30 text-white hover:bg-white/10">
            <Link href="/marketplace">Browse listings</Link>
          </Button>
        </div>
      </section>

      {/* ── Safety section ────────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", title: "Safe transactions", body: "Blockchain escrow protects buyers and sellers — funds only release when both parties are satisfied." },
          { icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z", title: "Verified sellers", body: "Seller trust badges and community reviews help you find reliable sellers before you commit." },
          { icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z", title: "Report &amp; block", body: "Spot something wrong? Report scams, counterfeit goods, or unsafe listings directly from any page." },
        ].map((item) => (
          <div key={item.title} className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
              <svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
            </div>
            <h3 className="mt-4 text-sm font-bold text-slate-900" dangerouslySetInnerHTML={{ __html: item.title }} />
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{item.body}</p>
          </div>
        ))}
      </section>

      {/* ── Sign-in nudge (unauthenticated) ──────────────────── */}
      {!auth.isAuthenticated && (
        <section className="flex flex-col items-center gap-4 rounded-2xl border bg-white px-8 py-10 text-center shadow-sm sm:flex-row sm:justify-between sm:text-left">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Save favourites &amp; get alerts</h2>
            <p className="mt-1 text-sm text-slate-500">Create a free account to save listings, follow sellers, and receive alerts on saved searches.</p>
          </div>
          <Button asChild size="lg" className="shrink-0 rounded-full">
            <Link href="/sign-in">Sign in free</Link>
          </Button>
        </section>
      )}

    </div>
  );
}
