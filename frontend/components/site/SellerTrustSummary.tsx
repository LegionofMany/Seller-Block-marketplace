import { Badge } from "@/components/ui/badge";
import { type PublicUserProfileResponse } from "@/lib/auth";

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

  if (variant === "compact") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {sellerVerified ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">Verified seller</Badge> : null}
        <Badge variant="outline">Rep {formatReputation(profile.stats.reputation)}</Badge>
        <Badge variant="outline">Response {formatPercent(profile.stats.responseRate)}</Badge>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {sellerVerified ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">Verified seller</Badge> : null}
        <Badge variant="outline">Rep {formatReputation(profile.stats.reputation)}</Badge>
        <Badge variant="outline">Response {formatPercent(profile.stats.responseRate)}</Badge>
        <Badge variant="outline">Followers {profile.stats.followerCount}</Badge>
      </div>
      {trustNote ? <p className="text-sm text-muted-foreground">{trustNote}</p> : null}
    </div>
  );
}