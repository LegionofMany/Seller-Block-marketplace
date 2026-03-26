"use client";

import * as React from "react";
import { ListingCard } from "@/components/listing/ListingCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useListings } from "@/lib/hooks/useListings";

export default function ListingsPage() {
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [city, setCity] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [minPrice, setMinPrice] = React.useState("");
  const [maxPrice, setMaxPrice] = React.useState("");

  const [offset, setOffset] = React.useState(0);
  const limit = 24;

  const params = {
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(category.trim() ? { category: category.trim() } : {}),
    ...(city.trim() ? { city: city.trim() } : {}),
    ...(region.trim() ? { region: region.trim() } : {}),
    ...(minPrice.trim() ? { minPrice: minPrice.trim() } : {}),
    ...(maxPrice.trim() ? { maxPrice: maxPrice.trim() } : {}),
    limit,
    offset,
  };

  const { listings, isLoading, error } = useListings(params);

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
          <CardTitle>Search</CardTitle>
          <CardDescription>Filter by category, location, and price.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={applyFilters} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <Label>Keywords</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or description" />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Cars & Vehicles" />
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
                  setCity("");
                  setRegion("");
                  setMinPrice("");
                  setMaxPrice("");
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
          : listings.map((l) => <ListingCard key={l.id} row={l} />)}
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
        <div className="text-xs text-muted-foreground">Showing {offset + 1}–{offset + listings.length}</div>
        <Button
          type="button"
          variant="outline"
          disabled={listings.length < limit || isLoading}
          onClick={() => setOffset(offset + limit)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
