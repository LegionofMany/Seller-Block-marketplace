"use client";

import Image from "next/image";
import Link from "next/link";

import { SellerTrustSummary } from "@/components/site/SellerTrustSummary";
import { Badge } from "@/components/ui/badge";
import { type ListingSummary } from "@/lib/hooks/useListings";
import { useSellerProfile } from "@/lib/hooks/useSellerProfile";
import { buildListingHref } from "@/lib/listings";
import { saleTypeLabel, statusLabel } from "@/lib/contracts/types";
import { formatPrice, shortAddress } from "@/lib/format";
import {
  getMetadataAttributeValue,
  getRenderableListingImage,
  isJobMetadata,
  useMarketplaceMetadata,
} from "@/lib/metadata";
import { zeroAddress } from "viem";

function isPriceFree(price: string | bigint | number | undefined): boolean {
  if (price === undefined || price === null) return false;
  try { return BigInt(price) === 0n; } catch { return false; }
}

/** Format a unix-seconds timestamp to a human-readable "time ago" string */
function timeAgo(createdAt: number | undefined): string {
  if (!createdAt) return "";
  const diffMs = Date.now() - createdAt * 1000;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function SaleTypeBadge({ saleType, cascadeStage }: { saleType: number; cascadeStage?: number }) {
  if (saleType === 0) return <Badge variant="secondary" className="text-[10px]">Fixed price</Badge>;
  if (saleType === 1)
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-[10px]">
        {(cascadeStage ?? 0) > 0 ? "Auction ↑" : "Auction"}
      </Badge>
    );
  return (
    <Badge variant="secondary" className="bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 text-[10px]">
      {(cascadeStage ?? 0) > 1 ? "Raffle ↑↑" : (cascadeStage ?? 0) > 0 ? "Raffle ↑" : "Raffle"}
    </Badge>
  );
}

export function ListingCard({ row }: { row: ListingSummary }) {
  const status = statusLabel(row.status);
  const isNative = row.token === zeroAddress;
  const { metadata } = useMarketplaceMetadata(row.metadataURI);
  const { profile: sellerProfile } = useSellerProfile(row.seller);

  const isJobPost = isJobMetadata(metadata);
  const companyName = getMetadataAttributeValue(metadata, "companyName");
  const compensation = getMetadataAttributeValue(metadata, "compensation");
  const workMode = getMetadataAttributeValue(metadata, "workMode");

  const title = metadata?.title?.trim() || `${saleTypeLabel(row.saleType)} listing`;
  const imageUrl = getRenderableListingImage(metadata?.image);
  const priceLabel = isJobPost ? compensation ?? "See listing" : formatPrice(row.price, isNative);

  const city = metadata?.city?.trim();
  const region = metadata?.region?.trim();
  const locationLabel = [city, region].filter(Boolean).join(", ");

  const category = metadata?.category?.trim();
  const postedAt = timeAgo(metadata?.createdAt);
  const sellerName = sellerProfile?.user.displayName?.trim() || shortAddress(row.seller);

  return (
    <Link href={buildListingHref(row.id, row.chainKey)} className="group block h-full">
      <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md group-active:translate-y-0">

        {/* ── Image ───────────────────────────────────────────── */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
          <Image
            src={imageUrl}
            alt={title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            unoptimized
            priority={false}
          />
          {/* Sale type badge overlay */}
          <div className="absolute left-2.5 top-2.5">
            {isJobPost
              ? <Badge className="bg-blue-600 text-white text-[10px]">Job post</Badge>
              : <SaleTypeBadge saleType={row.saleType} cascadeStage={(row as Record<string, unknown>).cascadeStage as number | undefined} />
            }
          </div>
          {/* Status badge overlay (sold/cancelled) */}
          {status && (
            <div className="absolute right-2.5 top-2.5">
              <Badge variant="outline" className="text-[10px]">{status}</Badge>
            </div>
          )}
        </div>

        {/* ── Body ────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col gap-1.5 p-3.5">

          {/* Price — most prominent element */}
          <div className="text-xl font-bold leading-tight tracking-tight text-foreground">
            {isJobPost && !compensation ? (
              <span className="text-base text-muted-foreground">Compensation in ad</span>
            ) : !isJobPost && isPriceFree(row.price) ? (
              <span className="font-bold text-emerald-600">Free</span>
            ) : (
              priceLabel
            )}
          </div>

          {/* Title */}
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground/90 group-hover:text-primary transition-colors">
            {title}
          </h3>

          {/* Job-specific meta */}
          {isJobPost && (companyName || workMode) && (
            <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              {companyName && <span className="font-medium">{companyName}</span>}
              {workMode && <span className="rounded-full bg-muted px-2 py-0.5">{workMode}</span>}
            </div>
          )}

          {/* Category */}
          {category && !isJobPost && (
            <div className="text-xs text-muted-foreground">{category}</div>
          )}

          {/* Spacer */}
          <div className="mt-auto pt-2">
            {/* Location */}
            {locationLabel && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 fill-primary/70" aria-hidden>
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
                <span className="truncate">{locationLabel}</span>
              </div>
            )}

            {/* Seller + time */}
            <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 min-w-0">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 fill-current opacity-60" aria-hidden>
                  <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                </svg>
                <span className="truncate">{sellerName}</span>
              </div>
              {postedAt && <span className="shrink-0 opacity-70">{postedAt}</span>}
            </div>

            {/* Trust score compact */}
            <div className="mt-1.5">
              <SellerTrustSummary profile={sellerProfile} variant="compact" />
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}
