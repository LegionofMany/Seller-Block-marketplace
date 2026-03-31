"use client";

import * as React from "react";
import { ListingCard } from "@/components/listing/ListingCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useListings } from "@/lib/hooks/useListings";
import { CATEGORY_TREE, subcategoriesFor } from "@/lib/categories";
import { getBlockedSellers } from "@/lib/blocks";
import { useAccount } from "wagmi";

export default function ListingsPage() {
  const { address } = useAccount();

  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [subcategory, setSubcategory] = React.useState("");
  const [city, setCity] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [postalCode, setPostalCode] = React.useState("");
  const [minPrice, setMinPrice] = React.useState("");
  const [maxPrice, setMaxPrice] = React.useState("");
  const [type, setType] = React.useState<"" | "fixed" | "auction" | "raffle">("");
  const [sort, setSort] = React.useState<"newest" | "price_asc" | "price_desc">("newest");

  const [offset, setOffset] = React.useState(0);
  const limit = 24;

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
    return listings.filter((l) => !blockedSellers.includes(String(l.seller).toLowerCase()));
  }, [listings, blockedSellers]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Listings</h1>
        <p className="text-sm text-muted-foreground">Browse listings created on Sepolia.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>Browse by category, then narrow by subcategory.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {Object.keys(CATEGORY_TREE).map((c) => (
              <Button
                key={c}
                type="button"
                variant={category === c ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setCategory(c);
                  setSubcategory("");
                  setOffset(0);
                }}
              >
                {c}
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
              }}
            >
              All
            </Button>
          </div>

          {category ? (
            <div className="flex flex-wrap gap-2">
              {subcategoriesFor(category).map((sc) => (
                <Button
                  key={sc}
                  type="button"
                  variant={subcategory === sc ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSubcategory(sc);
                    setOffset(0);
                  }}
                >
                  {sc}
                </Button>
              ))}
              <Button
                type="button"
                variant={!subcategory ? "secondary" : "outline"}
                size="sm"
                onClick={() => {
                  setSubcategory("");
                  setOffset(0);
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
          <CardDescription>Filter by sale type, location, price, and sort order.</CardDescription>
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
              <Label>City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Toronto" />
            </div>
            <div className="space-y-2">
              <Label>Region/State</Label>
              <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. Ontario" />
            </div>
            <div className="space-y-2">
              <Label>Postal code</Label>
              <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="e.g. M5V" />
            </div>
            <div className="space-y-2">
              <Label>Min price (wei/raw)</Label>
              <Input value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Max price (wei/raw)</Label>
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
                }}
              >
                Reset
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {error ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {!isLoading && !error && listings.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No listings found yet.
          </CardContent>
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
            : visibleListings.map((l) => <ListingCard key={l.id} row={l} />)}
      </div>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          disabled={offset === 0 || isLoading}
          onClick={() => setOffset(Math.max(0, offset - limit))}
        >
          Previous
        </Button>
        <div className="text-xs text-muted-foreground">Showing {offset + 1}–{offset + visibleListings.length}</div>
        <Button
          type="button"
          variant="outline"
          disabled={visibleListings.length < limit || isLoading}
          onClick={() => setOffset(offset + limit)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
