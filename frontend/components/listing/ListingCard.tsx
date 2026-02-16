"use client";

import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type ListingSummary } from "@/lib/hooks/useListings";
import { saleTypeLabel, statusLabel } from "@/lib/contracts/types";
import { formatPrice, shortAddress } from "@/lib/format";
import { zeroAddress } from "viem";

export function ListingCard({ row }: { row: ListingSummary }) {
  const status = statusLabel(row.status);
  const isNative = row.token === zeroAddress;

  return (
    <Link href={`/listing/${row.id}`} className="block">
      <Card className="transition-colors hover:bg-accent/30">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate">Listing</CardTitle>
              <CardDescription className="truncate">{row.metadataURI}</CardDescription>
            </div>
            <Badge variant="outline">{saleTypeLabel(row.saleType)}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">Seller</div>
            <div>{shortAddress(row.seller)}</div>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <div className="text-muted-foreground">Price</div>
            <div>{formatPrice(row.price, isNative)}</div>
          </div>
          {status ? (
            <div className="mt-2 flex items-center justify-between text-sm">
              <div className="text-muted-foreground">Status</div>
              <div>{status}</div>
            </div>
          ) : null}
          <div className="mt-3 truncate text-xs text-muted-foreground">{row.id}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
