"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { isAddress } from "viem";

import { useAuth } from "@/components/providers/AuthProvider";
import { SellerTrustSummary } from "@/components/site/SellerTrustSummary";
import { AccentCallout } from "@/components/ui/accent-callout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ListingCard } from "@/components/listing/ListingCard";
import { fetchJson } from "@/lib/api";
import { shortenHex } from "@/lib/format";
import { useSellerProfile } from "@/lib/hooks/useSellerProfile";
import { useListings } from "@/lib/hooks/useListings";
import { buildMarketplaceHref } from "@/lib/marketplace";

export default function SellerProfilePage() {
  const params = useParams<{ address: string }>();
  const rawAddress = params?.address ?? "";
  const address = isAddress(rawAddress) ? rawAddress : null;

  const auth = useAuth();
  const { profile, isLoading } = useSellerProfile(address);

  const { listings, isLoading: isLoadingListings } = useListings({
    limit: 8,
    sort: "newest",
    seller: address ?? undefined,
  });

  const [isFollowing, setIsFollowing] = React.useState(false);
  const [isFollowLoading, setIsFollowLoading] = React.useState(false);
  const [followError, setFollowError] = React.useState<string | null>(null);
  const [shareCopied, setShareCopied] = React.useState(false);

  const user = profile?.user;
  const displayName = user?.displayName?.trim() || user?.fullName?.trim() || shortenHex(address ?? "0x0");
  const avatarUrl = user?.avatarCid ? `https://ipfs.io/ipfs/${user.avatarCid}` : null;
  const locationLabel = [user?.city, user?.region].filter(Boolean).join(", ");

  React.useEffect(() => {
    if (!address) return;
    const name = user?.displayName?.trim() || user?.fullName?.trim();
    document.title = name ? `${name} — Seller on Zonycs` : `Seller ${shortenHex(address)} — Zonycs`;
    return () => {
      document.title = "Zonycs — Buy & Sell Locally";
    };
  }, [address, user?.displayName, user?.fullName]);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!auth.isAuthenticated || !address) {
        setIsFollowing(false);
        return;
      }
      try {
        const res = await fetchJson<{ items: string[] }>("/users/me/follows", { timeoutMs: 5_000 });
        if (!cancelled) {
          setIsFollowing(
            (res.items ?? []).map((item) => String(item).toLowerCase()).includes(address.toLowerCase())
          );
        }
      } catch {
        if (!cancelled) setIsFollowing(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated, address]);

  async function toggleFollow() {
    if (!auth.isAuthenticated) {
      setFollowError("Sign in to follow sellers");
      return;
    }
    if (!address) return;

    const prev = isFollowing;
    setIsFollowing(!prev);

    try {
      setIsFollowLoading(true);
      setFollowError(null);
      if (prev) {
        await fetchJson(`/users/${address}/follow`, { method: "DELETE" });
      } else {
        await fetchJson(`/users/${address}/follow`, { method: "POST" });
      }
    } catch {
      setIsFollowing(prev);
      setFollowError("Failed to update follow status");
    } finally {
      setIsFollowLoading(false);
    }
  }

  async function shareProfile() {
    const url = typeof window !== "undefined" ? window.location.href : `https://www.zonycs.com/seller/${address}`;
    const shareData = {
      title: displayName ? `${displayName} on Zonycs` : "Seller on Zonycs",
      text: `Check out ${displayName}'s listings on Zonycs`,
      url,
    };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
      }
    } catch {
      // User cancelled or clipboard failed — silently ignore
    }
  }

  if (!address) {
    return (
      <Card>
        <CardContent className="p-6 space-y-2">
          <div className="text-sm font-semibold text-destructive">Invalid seller address</div>
          <div className="text-sm text-muted-foreground">
            This seller profile link is incomplete or invalid.
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/marketplace">Back to marketplace</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Profile Header */}
      <section className="market-hero px-5 py-6 sm:px-8 sm:py-8">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr] lg:items-end">
          <div className="space-y-4">
            <div className="market-section-title">Seller profile</div>
            <div className="flex items-center gap-4">
              {avatarUrl ? (
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border bg-muted">
                  <Image
                    src={avatarUrl}
                    alt={displayName}
                    fill
                    className="object-cover"
                    sizes="64px"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border bg-muted text-xl font-semibold text-slate-950">
                  {displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="space-y-1">
                {isLoading ? (
                  <div className="h-7 w-40 rounded bg-muted" />
                ) : (
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{displayName}</h1>
                )}
                {locationLabel ? <div className="text-sm text-muted-foreground">{locationLabel}</div> : null}
              </div>
            </div>

            {user?.bio ? (
              <p className="max-w-2xl text-sm leading-7 text-slate-700">{user.bio}</p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => void toggleFollow()}
                disabled={isFollowLoading}
                variant={isFollowing ? "outline" : "default"}
                className="rounded-full px-6"
              >
                {isFollowLoading ? "Updating..." : isFollowing ? "Following" : "Follow seller"}
              </Button>
              <Button asChild variant="outline" className="rounded-full px-6">
                <Link href={buildMarketplaceHref({ seller: address })}>View all listings</Link>
              </Button>
              {/* Share profile CTA */}
              <Button
                type="button"
                variant="outline"
                className="rounded-full px-6 gap-2"
                onClick={() => void shareProfile()}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                {shareCopied ? "Link copied!" : "Share profile"}
              </Button>
            </div>

            {followError ? (
              <AccentCallout label="Follow" tone="amber">
                {followError}
              </AccentCallout>
            ) : null}
          </div>

          {/* Trust Summary */}
          <div className="space-y-3">
            <SellerTrustSummary profile={profile} variant="detail" />
            <div className="market-stat bg-white/85">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Wallet address</div>
              <div className="mt-2 break-all text-sm font-mono text-slate-950">{address}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Active Listings */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="market-section-title">Active listings</div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              {displayName}&apos;s ads
            </h2>
          </div>
          <Button asChild variant="outline" className="rounded-full">
            <Link href={buildMarketplaceHref({ seller: address })}>See all</Link>
          </Button>
        </div>

        {isLoadingListings ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Card key={index}>
                <CardContent className="space-y-3 p-6">
                  <div className="h-40 rounded bg-muted" />
                  <div className="h-5 w-40 rounded bg-muted" />
                  <div className="h-4 w-32 rounded bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : listings.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {listings.map((listing) => (
              <ListingCard key={`${listing.chainKey}-${listing.id}`} row={listing} />
            ))}
          </div>
        ) : (
          <Card className="market-panel market-panel-spotlight market-panel-spotlight-blue">
            <CardContent className="p-6">
              <AccentCallout label="No listings" tone="blue">
                This seller has no active listings right now. Follow them to get notified when they post
                new ads.
              </AccentCallout>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
