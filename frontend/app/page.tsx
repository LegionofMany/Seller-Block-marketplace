"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useListings } from "@/lib/hooks/useListings";
import { formatPrice, shortenHex } from "@/lib/format";
import { isNativeToken, saleTypeLabel, statusLabel } from "@/lib/contracts/types";

export default function ListingsPage() {
  const { listings, isLoading, error } = useListings();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Listings</h1>
        <p className="text-sm text-muted-foreground">Browse listings created on Sepolia.</p>
      </div>

      {error ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          : listings.map((l) => {
              const native = isNativeToken(l.token);
              return (
                <Link key={l.id} href={`/listing/${l.id}`} className="block">
                  <Card className="h-full transition-colors hover:bg-accent/40">
                    <CardHeader>
                      <CardTitle className="text-base">{saleTypeLabel(l.saleType as any)}</CardTitle>
                      <CardDescription className="break-all">
                        {l.metadataURI || shortenHex(l.id)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between gap-3">
                      <div className="text-sm">
                        <div className="font-medium">{formatPrice(l.price, native)}</div>
                        <div className="text-xs text-muted-foreground">Seller: {shortenHex(l.seller)}</div>
                      </div>
                      <Badge variant="outline">{statusLabel(l.status as any)}</Badge>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
      </div>
    </div>
  );
}
