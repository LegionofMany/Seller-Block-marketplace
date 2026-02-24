"use client";

import Image from "next/image";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type ListingSummary } from "@/lib/hooks/useListings";
import { saleTypeLabel, statusLabel } from "@/lib/contracts/types";
import { formatPrice, shortAddress } from "@/lib/format";
import { useMarketplaceMetadata } from "@/lib/metadata";
import { zeroAddress } from "viem";

export function ListingCard({ row }: { row: ListingSummary }) {
  const status = statusLabel(row.status);
  const isNative = row.token === zeroAddress;
  const { metadata } = useMarketplaceMetadata(row.metadataURI);

  const title = metadata?.title?.trim() || saleTypeLabel(row.saleType);
  const description = metadata?.description?.trim() || row.metadataURI;
  const imageUrl = metadata?.image?.trim() || "";

  return (
    <Link href={`/listing/${row.id}`} className="block">
      <Card className="h-full transition-colors hover:bg-accent/30 active:bg-accent/40">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate">{title}</CardTitle>
              <CardDescription className="break-words">{description}</CardDescription>
            </div>
            <Badge variant="outline">{saleTypeLabel(row.saleType)}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {imageUrl ? (
            <div className="mb-3 overflow-hidden rounded-md border">
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
          ) : null}

          {imageUrl ? (
            <div className="mb-3 truncate text-xs text-muted-foreground">Image: {imageUrl}</div>
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
