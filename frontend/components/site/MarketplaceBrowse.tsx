"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { toast } from "sonner";

import { ListingCard } from "@/components/listing/ListingCard";
import { useAuth } from "@/components/providers/AuthProvider";
import { AccentCallout } from "@/components/ui/accent-callout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getBlockedSellers } from "@/lib/blocks";
import { CATEGORY_TREE, subcategoriesFor } from "@/lib/categories";
import { getEnv } from "@/lib/env";
import { formatLocationLabel, getProfileLocationFilter } from "@/lib/location";
import { fetchJson, type ApiError } from "@/lib/api";
import { useListings } from "@/lib/hooks/useListings";
import { COUNTRY_LIST, CITY_MAP } from "@/lib/locations";

function normalizeSearchValue(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "";
}

function parseSort(value: string | null): "newest" | "price_asc" | "price_desc" {
  return value === "price_asc" || value === "price_desc" ? value : "newest";
}

function parseSaleType(value: string | null): "" | "fixed" | "auction" | "raffle" {
  return value === "fixed" || value === "auction" || value === "raffle" ? value : "";
}

export function MarketplaceBrowse() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { address } = useAccount();
  const auth = useAuth();
  const env = getEnv();

  const [q, setQ] = React.useState(() => normalizeSearchValue(searchParams.get("q")));
  const [category, setCategory] = React.useState(() => normalizeSearchValue(searchParams.get("category")));
  const [subcategory, setSubcategory] = React.useState(() => normalizeSearchValue(searchParams.get("subcategory")));
  const [city, setCity] = React.useState(() => normalizeSearchValue(searchParams.get("city")));
  const [region, setRegion] = React.useState(() => normalizeSearchValue(searchParams.get("region")));
  const [postalCode, setPostalCode] = React.useState(() => normalizeSearchValue(searchParams.get("postalCode")));
  const [minPrice, setMinPrice] = React.useState(() => normalizeSearchValue(searchParams.get("minPrice")));
  const [maxPrice, setMaxPrice] = React.useState(() => normalizeSearchValue(searchParams.get("maxPrice")));
  const [type, setType] = React.useState<"" | "fixed" | "auction" | "raffle">(() => parseSaleType(searchParams.get("type")));
  const [sort, setSort] = React.useState<"newest" | "price_asc" | "price_desc">(() => parseSort(searchParams.get("sort")));

  

  const [offset, setOffset] = React.useState(() => {
    const raw = Number.parseInt(searchParams.get("offset") ?? "0", 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  });
  const [savedSearchName, setSavedSearchName] = React.useState("");
  const [savedSearchEmail, setSavedSearchEmail] = React.useState("");
  const [isSavingSearch, setIsSavingSearch] = React.useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = React.useState(false);
  const limit = 24;
  const savedLocation = React.useMemo(() => getProfileLocationFilter(auth.user), [auth.user]);
  const savedLocationLabel = React.useMemo(() => formatLocationLabel(savedLocation), [savedLocation]);

  React.useEffect(() => {
    setQ(normalizeSearchValue(searchParams.get("q")));
    setCategory(normalizeSearchValue(searchParams.get("category")));
    setSubcategory(normalizeSearchValue(searchParams.get("subcategory")));
    setCity(normalizeSearchValue(searchParams.get("city")));
    setRegion(normalizeSearchValue(searchParams.get("region")));
    setPostalCode(normalizeSearchValue(searchParams.get("postalCode")));
    setMinPrice(normalizeSearchValue(searchParams.get("minPrice")));
    setMaxPrice(normalizeSearchValue(searchParams.get("maxPrice")));
    setType(parseSaleType(searchParams.get("type")));
    setSort(parseSort(searchParams.get("sort")));
    const nextOffset = Number.parseInt(searchParams.get("offset") ?? "0", 10);
    setOffset(Number.isFinite(nextOffset) && nextOffset > 0 ? nextOffset : 0);
  }, [searchParams]);

  const syncUrl = React.useCallback((next: {
    q?: string;
    category?: string;
    subcategory?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    minPrice?: string;
    maxPrice?: string;
    type?: "" | "fixed" | "auction" | "raffle";
    sort?: "newest" | "price_asc" | "price_desc";
    offset?: number;
  }) => {
    const sp = new URLSearchParams();
    if (next.q?.trim()) sp.set("q", next.q.trim());
    if (next.category?.trim()) sp.set("category", next.category.trim());
    if (next.subcategory?.trim()) sp.set("subcategory", next.subcategory.trim());
    if (next.city?.trim()) sp.set("city", next.city.trim());
    if (next.region?.trim()) sp.set("region", next.region.trim());
    if (next.postalCode?.trim()) sp.set("postalCode", next.postalCode.trim());
    if (next.minPrice?.trim()) sp.set("minPrice", next.minPrice.trim());
    if (next.maxPrice?.trim()) sp.set("maxPrice", next.maxPrice.trim());
    if (next.type) sp.set("type", next.type);
    if (next.sort && next.sort !== "newest") sp.set("sort", next.sort);
    if ((next.offset ?? 0) > 0) sp.set("offset", String(next.offset));
    const query = sp.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router]);

  const params = {
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(category.trim() ? { category: category.trim() } : {}),
    ...(subcategory.trim() ? { subcategory: subcategory.trim() } : {}),
    ...(city.trim() ? { city: city.trim() } : {}),
    ...(region.trim() ? { region: region.trim() } : {}),
    ...(postalCode.trim() ? { postalCode: postalCode.trim() } : {}),
    ...(minPrice.trim() ? { minPrice: minPrice.trim() } : {}),
    ...(maxPrice.trim() ? { maxPrice: maxPrice.trim() } : {}),
    ...(type ? { type } : {}),
    ...(sort ? { sort } : {}),
    limit,
    offset,
  };

  const { listings, isLoading, error } = useListings(params);

  const [blockedSellers, setBlockedSellers] = React.useState<string[]>([]);
  React.useEffect(() => {
    setBlockedSellers(getBlockedSellers(address ?? null));
  }, [address]);

  const visibleListings = React.useMemo(() => {
    if (!blockedSellers.length) return listings;
    return listings.filter((listing) => !blockedSellers.includes(String(listing.seller).toLowerCase()));
  }, [listings, blockedSellers]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    syncUrl({ q, category, subcategory, city, region, postalCode, minPrice, maxPrice, type, sort, offset: 0 });
  }

  async function saveCurrentSearch() {
    if (!auth.isAuthenticated) {
      toast.error("Sign in to save searches");
      return;
    }

    const filters = {
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(category.trim() ? { category: category.trim() } : {}),
      ...(subcategory.trim() ? { subcategory: subcategory.trim() } : {}),
      ...(city.trim() ? { city: city.trim() } : {}),
      ...(region.trim() ? { region: region.trim() } : {}),
      ...(postalCode.trim() ? { postalCode: postalCode.trim() } : {}),
      ...(minPrice.trim() ? { minPrice: minPrice.trim() } : {}),
      ...(maxPrice.trim() ? { maxPrice: maxPrice.trim() } : {}),
      ...(type ? { type } : {}),
      ...(sort ? { sort } : {}),
    };

    if (Object.keys(filters).length === 0) {
      toast.error("Apply at least one filter before saving a search");
      return;
    }

    setIsSavingSearch(true);
    try {
      await fetchJson<{ item: { id: number } }>("/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: savedSearchName.trim() || q.trim() || category.trim() || "Saved search",
          email: savedSearchEmail.trim() || undefined,
          filters,
        }),
      });
      setSavedSearchName("");
      toast.success("Saved search created");
    } catch (e: unknown) {
      toast.error((e as ApiError | null)?.message ?? "Failed to save search");
    } finally {
      setIsSavingSearch(false);
    }
  }

  async function detectMyLocation() {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    setIsDetectingLocation(true);
    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 10_000,
            maximumAge: 60_000,
          })
      );

      const { latitude, longitude } = position.coords;

      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
        {
          headers: {
            "Accept-Language": "en",
            "User-Agent": "Zonycs Marketplace/1.0",
          },
        }
      );

      if (!res.ok) throw new Error("Reverse geocode failed");

      const data = await res.json() as {
        address?: {
          city?: string;
          town?: string;
          village?: string;
          state?: string;
          country?: string;
          postcode?: string;
        };
      };

      const detectedCity =
        data.address?.city ||
        data.address?.town ||
        data.address?.village ||
        "";
      const detectedRegion = data.address?.state || "";
      const detectedPostal = data.address?.postcode || "";

      setCity(detectedCity);
      setRegion(detectedRegion);
      setPostalCode(detectedPostal);
      setOffset(0);
      syncUrl({
        q, category, subcategory,
        city: detectedCity,
        region: detectedRegion,
        postalCode: detectedPostal,
        minPrice, maxPrice, type, sort,
        offset: 0,
      });

      toast.success(
        detectedCity
          ? `Location set to ${detectedCity}, ${detectedRegion}`
          : `Location set to ${detectedRegion || "your area"}`
      );
    } catch (error: unknown) {
      const message = error instanceof GeolocationPositionError
        ? error.code === 1
          ? "Location access denied. Enable location in browser settings."
          : "Could not detect your location. Try entering it manually."
        : "Could not detect your location.";
      toast.error(message);
    } finally {
      setIsDetectingLocation(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Marketplace</h1>
        <p className="text-sm text-muted-foreground">Browse live classifieds and settlement-ready listings on {env.defaultChain.name}.</p>
      </div>

      {savedLocation ? (
        <Card className="market-panel market-panel-spotlight market-panel-spotlight-blue">
          <CardHeader>
            <CardTitle>Nearby discovery</CardTitle>
            <CardDescription>Use your saved area to reopen nearby browsing without rebuilding filters each time.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1 w-full sm:max-w-xl">
              <AccentCallout label="Saved area" tone="blue">
                {savedLocationLabel ? `Browsing near ${savedLocationLabel}.` : "Your profile location is ready to shape nearby results."}
              </AccentCallout>
              {savedLocation?.city ? (
                <div className="flex flex-wrap gap-2 mt-1">
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">
                    📍 {savedLocation.city}{savedLocation.region ? `, ${savedLocation.region}` : ""}
                  </span>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => {
                  setCity(savedLocation.city ?? "");
                  setRegion(savedLocation.region ?? "");
                  setPostalCode(savedLocation.postalCode ?? "");
                  setOffset(0);
                  syncUrl({
                    q,
                    category,
                    subcategory,
                    city: savedLocation.city ?? "",
                    region: savedLocation.region ?? "",
                    postalCode: savedLocation.postalCode ?? "",
                    minPrice,
                    maxPrice,
                    type,
                    sort,
                    offset: 0,
                  });
                }}
              >
                Use saved area
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCity("");
                  setRegion("");
                  setPostalCode("");
                  setOffset(0);
                  syncUrl({ q, category, subcategory, city: "", region: "", postalCode: "", minPrice, maxPrice, type, sort, offset: 0 });
                }}
              >
                Clear area
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>Open with broad categories, then tighten the view with subcategories.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {Object.keys(CATEGORY_TREE).map((entry) => (
              <Button
                key={entry}
                type="button"
                variant={category === entry ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setCategory(entry);
                  setSubcategory("");
                  setOffset(0);
                  syncUrl({ q, category: entry, subcategory: "", city, region, postalCode, minPrice, maxPrice, type, sort, offset: 0 });
                }}
              >
                {entry}
              </Button>
            ))}
            <Button
              type="button"
              variant={!category ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setCategory("");
                setSubcategory("");
                setOffset(0);
                syncUrl({ q, category: "", subcategory: "", city, region, postalCode, minPrice, maxPrice, type, sort, offset: 0 });
              }}
            >
              All
            </Button>
          </div>

          {category ? (
            <div className="flex flex-wrap gap-2">
              {subcategoriesFor(category).map((entry) => (
                <Button
                  key={entry}
                  type="button"
                  variant={subcategory === entry ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSubcategory(entry);
                    setOffset(0);
                    syncUrl({ q, category, subcategory: entry, city, region, postalCode, minPrice, maxPrice, type, sort, offset: 0 });
                  }}
                >
                  {entry}
                </Button>
              ))}
              <Button
                type="button"
                variant={!subcategory ? "secondary" : "outline"}
                size="sm"
                onClick={() => {
                  setSubcategory("");
                  setOffset(0);
                    syncUrl({ q, category, subcategory: "", city, region, postalCode, minPrice, maxPrice, type, sort, offset: 0 });
                }}
              >
                All {category}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Search</CardTitle>
          <CardDescription>Refine by sale type, location, price, and sort order, or pull in your saved area once signed in.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={applyFilters} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <Label>Keywords</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or description" />
            </div>
            <div className="space-y-2">
              <Label>Sale type</Label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant={!type ? "default" : "outline"} onClick={() => setType("")}>All</Button>
                <Button type="button" size="sm" variant={type === "fixed" ? "default" : "outline"} onClick={() => setType("fixed")}>Fixed</Button>
                <Button type="button" size="sm" variant={type === "auction" ? "default" : "outline"} onClick={() => setType("auction")}>Auction</Button>
                <Button type="button" size="sm" variant={type === "raffle" ? "default" : "outline"} onClick={() => setType("raffle")}>Raffle</Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Sort</Label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant={sort === "newest" ? "default" : "outline"} onClick={() => setSort("newest")}>Newest</Button>
                <Button type="button" size="sm" variant={sort === "price_asc" ? "default" : "outline"} onClick={() => setSort("price_asc")}>Price ↑</Button>
                <Button type="button" size="sm" variant={sort === "price_desc" ? "default" : "outline"} onClick={() => setSort("price_desc")}>Price ↓</Button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>City</Label>
                <button
                  type="button"
                  onClick={() => void detectMyLocation()}
                  disabled={isDetectingLocation}
                  className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                >
                  {isDetectingLocation ? (
                    <>
                      <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" />
                      Detecting...
                    </>
                  ) : (
                    <>
                      📍 Near me
                    </>
                  )}
                </button>
              </div>
              {region && CITY_MAP[region] ? (
                <select
                  className="h-9 block w-full rounded-md border border-input bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                >
                  <option value="">All cities</option>
                  {CITY_MAP[region].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Edmonton" />
              )}
            </div>
                <div className="space-y-2">
                  <Label>Province / Region</Label>
                  <select
                    className="h-9 block w-full rounded-md border border-input bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                    value={region}
                    onChange={(e) => {
                      const nextRegion = e.target.value;
                      setRegion(nextRegion);
                      setCity("");
                      setOffset(0);
                      syncUrl({ q, category, subcategory, city: "", region: nextRegion, postalCode, minPrice, maxPrice, type, sort, offset: 0 });
                    }}
                  >
                    <option value="">All regions</option>
                    <optgroup label="Canadian Provinces & Territories">
                      {[
                        "Alberta", "British Columbia", "Manitoba",
                        "New Brunswick", "Newfoundland and Labrador",
                        "Northwest Territories", "Nova Scotia", "Nunavut",
                        "Ontario", "Prince Edward Island", "Quebec",
                        "Saskatchewan", "Yukon"
                      ].map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Other Countries">
                      {COUNTRY_LIST.filter((c) => ![
                        "Alberta", "British Columbia", "Manitoba",
                        "New Brunswick", "Newfoundland and Labrador",
                        "Northwest Territories", "Nova Scotia", "Nunavut",
                        "Ontario", "Prince Edward Island", "Quebec",
                        "Saskatchewan", "Yukon"
                      ].includes(c)).map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
            <div className="space-y-2">
              <Label>Postal code</Label>
              <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="e.g. M5V" />
            </div>
            <div className="space-y-2">
              <Label>Min price ({env.defaultChain.nativeCurrencySymbol})</Label>
              <Input value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Max price ({env.defaultChain.nativeCurrencySymbol})</Label>
              <Input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="" />
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit" size="lg">Apply</Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => {
                  setQ("");
                  setCategory("");
                  setSubcategory("");
                  setCity("");
                  setRegion("");
                  setPostalCode("");
                  setMinPrice("");
                  setMaxPrice("");
                  setType("");
                  setSort("newest");
                  setOffset(0);
                  syncUrl({ q: "", category: "", subcategory: "", city: "", region: "", postalCode: "", minPrice: "", maxPrice: "", type: "", sort: "newest", offset: 0 });
                }}
              >
                Reset
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="market-panel market-panel-spotlight market-panel-spotlight-mint">
        <CardHeader>
          <CardTitle>Saved search alerts</CardTitle>
          <CardDescription>Save a refined view and bring it back through a cleaner alert flow. Email stays optional.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <div className="space-y-2">
            <Label>Search name</Label>
            <Input value={savedSearchName} onChange={(e) => setSavedSearchName(e.target.value)} placeholder="e.g. Toronto electronics" />
          </div>
          <div className="space-y-2">
            <Label>Email alerts (optional)</Label>
            <Input value={savedSearchEmail} onChange={(e) => setSavedSearchEmail(e.target.value)} placeholder="name@example.com" />
          </div>
          <div className="flex gap-2">
            <Button type="button" size="lg" disabled={!auth.isAuthenticated || isSavingSearch} onClick={() => void saveCurrentSearch()}>
              Save search
            </Button>
          </div>
          {!auth.isAuthenticated ? (
            <AccentCallout label="Save this search" tone="mint" className="lg:col-span-3">
              Sign in to keep this filtered view on hand and turn it into a polished alert stream.
            </AccentCallout>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {!isLoading && !error && listings.length === 0 ? (
        <Card className="market-panel market-panel-spotlight market-panel-spotlight-amber">
          <CardContent className="p-6">
            <AccentCallout label="No matches yet" tone="amber">
              This view is quiet right now. Broaden the area, category, or price range to reopen the marketplace.
            </AccentCallout>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, index) => (
              <Card key={index}>
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
          : visibleListings.map((listing) => <ListingCard key={listing.id} row={listing} />)}
      </div>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          disabled={offset === 0 || isLoading}
          onClick={() => {
            const nextOffset = Math.max(0, offset - limit);
            setOffset(nextOffset);
            syncUrl({ q, category, subcategory, city, region, postalCode, minPrice, maxPrice, type, sort, offset: nextOffset });
          }}
        >
          Previous
        </Button>
        <div className="text-xs text-muted-foreground">Showing {offset + 1}–{offset + visibleListings.length}</div>
        <Button
          type="button"
          variant="outline"
          disabled={visibleListings.length < limit || isLoading}
          onClick={() => {
            const nextOffset = offset + limit;
            setOffset(nextOffset);
            syncUrl({ q, category, subcategory, city, region, postalCode, minPrice, maxPrice, type, sort, offset: nextOffset });
          }}
        >
          Next
        </Button>
      </div>
    </div>
  );
}