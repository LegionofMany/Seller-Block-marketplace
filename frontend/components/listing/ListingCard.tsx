"use client";

import Image from "next/image";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type ListingSummary } from "@/lib/hooks/useListings";
import { buildListingHref } from "@/lib/listings";
import { saleTypeLabel, statusLabel } from "@/lib/contracts/types";
import { formatPrice, shortAddress } from "@/lib/format";
import { getRenderableListingImage, useMarketplaceMetadata } from "@/lib/metadata";
import { zeroAddress } from "viem";

export function ListingCard({ row }: { row: ListingSummary }) {
  const status = statusLabel(row.status);
  const isNative = row.token === zeroAddress;
  const { metadata } = useMarketplaceMetadata(row.metadataURI);
  const metadataMissing = !metadata;

  const title = metadata?.title?.trim() || `${saleTypeLabel(row.saleType)} listing`;
  const description = metadata?.description?.trim() || "Listing details are still syncing. Open the listing for price, seller, and checkout status.";
  const imageUrl = getRenderableListingImage(metadata?.image);
  const subtitleParts = [metadata?.category, metadata?.city, metadata?.region, metadata?.postalCode].filter(Boolean).join(" • ");

  return (
    <Link href={buildListingHref(row.id, row.chainKey)} className="block">
      <Card className="h-full transition-colors hover:bg-accent/30 active:bg-accent/40">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate">{title}</CardTitle>
              <CardDescription className="break-words">{description}</CardDescription>
              {subtitleParts ? <div className="mt-1 truncate text-xs text-muted-foreground">{subtitleParts}</div> : null}
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge variant="outline">{saleTypeLabel(row.saleType)}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-3 overflow-hidden rounded-md border bg-muted/70">
            <div className="relative h-40 w-full">
              <Image
                src={imageUrl}
                alt={title}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                unoptimized
                priority={false}
              />
            </div>
          </div>

          {metadataMissing ? (
            <div className="mb-3 rounded-md border border-dashed bg-accent/20 px-3 py-2 text-xs text-muted-foreground">
              Photos and description are not available yet for this listing.
            </div>
          ) : null}

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
