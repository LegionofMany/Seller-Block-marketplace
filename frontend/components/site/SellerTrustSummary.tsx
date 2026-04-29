import { Badge } from "@/components/ui/badge";
import { type PublicUserProfileResponse } from "@/lib/auth";

const FALLBACK_STATS = {
  listingCount: 0,
  location: null,
  followerCount: 0,
  responseRate: null,
  reputation: null,
} as const;

function formatPercent(value: number | null | undefined) {
  return typeof value === "number" ? `${value}%` : "Building signal";
}

function formatReputation(value: number | null | undefined) {
  return typeof value === "number" ? `${value}/100` : "Building signal";
}

export function SellerTrustSummary({ profile, variant = "compact" }: { profile: PublicUserProfileResponse | null; variant?: "compact" | "detail" }) {
  if (!profile) return null;

  const sellerVerified = typeof profile.user.sellerVerifiedAt === "number";
  const trustNote = profile.user.sellerTrustNote?.trim() || null;
  const stats = profile.stats ?? FALLBACK_STATS;

  if (variant === "compact") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {sellerVerified ? (
          <Badge className="border-transparent bg-primary text-primary-foreground hover:opacity-95">Verified seller</Badge>
        ) : null}
        <Badge variant="outline">Rep {formatReputation(stats.reputation)}</Badge>
        <Badge variant="outline">Response {formatPercent(stats.responseRate)}</Badge>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {sellerVerified ? <Badge className="border-transparent bg-primary text-primary-foreground hover:opacity-95">Verified seller</Badge> : null}
        <Badge variant="outline">Rep {formatReputation(stats.reputation)}</Badge>
        <Badge variant="outline">Response {formatPercent(stats.responseRate)}</Badge>
        <Badge variant="outline">Followers {stats.followerCount}</Badge>
      </div>
      {trustNote ? <p className="text-sm text-muted-foreground">{trustNote}</p> : null}
    </div>
  );
}