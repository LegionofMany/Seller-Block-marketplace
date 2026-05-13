"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useAuth } from "@/components/providers/AuthProvider";
import { fetchJson } from "@/lib/api";
import { shortenHex } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

/* ── Types ─────────────────────────────────────────────────────────────── */
type UserRow = {
  address: string;
  displayName?: string | null;
  fullName?: string | null;
  email?: string | null;
  city?: string | null;
  region?: string | null;
  sellerVerifiedAt?: number | null;
  sellerVerifiedBy?: string | null;
  createdAt?: number;
};

type PublicUserProfile = {
  user: UserRow;
  listingCount: number;
  followerCount: number;
};

type TrustReview = {
  id: number;
  userAddress: string;
  reviewer: string;
  sellerVerified: boolean;
  sellerTrustNote?: string | null;
  createdAt: number;
};

type AdminTrustSummary = {
  queue: PublicUserProfile[];
  verified: PublicUserProfile[];
  history: TrustReview[];
};

type ReportRow = {
  id: number;
  reporter: string | null;
  targetType: string;
  targetId: string;
  reason: string;
  details?: string | null;
  createdAt: number;
};

/* ── Helpers ────────────────────────────────────────────────────────────── */
function timeAgo(ms: number | undefined): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function userName(profile: PublicUserProfile | UserRow): string {
  const u = "user" in profile ? profile.user : profile;
  return u.displayName?.trim() || u.fullName?.trim() || shortenHex(u.address);
}

/* ── Sub-components ─────────────────────────────────────────────────────── */
function VerifyCard({
  profile,
  onAction,
}: {
  profile: PublicUserProfile;
  onAction: (address: string, verify: boolean, note: string) => Promise<void>;
}) {
  const [note, setNote] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const isVerified = Boolean(profile.user.sellerVerifiedAt);

  async function handle(verify: boolean) {
    setLoading(true);
    try {
      await onAction(profile.user.address, verify, note);
      setNote("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      {/* Identity */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground">{userName(profile)}</span>
            {isVerified && (
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px]">
                ✓ Verified
              </Badge>
            )}
          </div>
          <div className="mt-0.5 font-mono text-xs text-muted-foreground break-all">
            {profile.user.address}
          </div>
          {profile.user.email && (
            <div className="text-xs text-muted-foreground">{profile.user.email}</div>
          )}
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {(profile.user.city || profile.user.region) && (
              <span>📍 {[profile.user.city, profile.user.region].filter(Boolean).join(", ")}</span>
            )}
            <span>📋 {profile.listingCount} listing{profile.listingCount !== 1 ? "s" : ""}</span>
            <span>👥 {profile.followerCount} follower{profile.followerCount !== 1 ? "s" : ""}</span>
            {profile.user.createdAt && (
              <span>Joined {timeAgo(profile.user.createdAt)}</span>
            )}
          </div>
        </div>
        <Link
          href={`/seller/${profile.user.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          Profile ↗
        </Link>
      </div>

      {/* Note input */}
      <Input
        placeholder="Trust note (optional, visible to admins)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="text-sm h-9"
      />

      {/* Actions */}
      <div className="flex gap-2">
        {!isVerified ? (
          <Button
            size="sm"
            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={loading}
            onClick={() => handle(true)}
          >
            {loading ? "Verifying…" : "✓ Verify seller"}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            disabled={loading}
            onClick={() => handle(false)}
          >
            {loading ? "Removing…" : "Remove verification"}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── Main admin page ────────────────────────────────────────────────────── */
export default function AdminPage() {
  const auth = useAuth();
  const router = useRouter();

  const [summary, setSummary] = React.useState<AdminTrustSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = React.useState(true);
  const [reports, setReports] = React.useState<ReportRow[]>([]);
  const [reportsLoading, setReportsLoading] = React.useState(true);

  // User search
  const [searchAddress, setSearchAddress] = React.useState("");
  const [searchResult, setSearchResult] = React.useState<PublicUserProfile | null>(null);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchError, setSearchError] = React.useState("");

  // Active tab
  const [tab, setTab] = React.useState<"queue" | "verified" | "search" | "reports" | "history">("queue");

  // ── Guard: must be admin ─────────────────────────────────────────────
  React.useEffect(() => {
    if (!auth.isLoading && !auth.isAdmin) {
      router.replace("/");
    }
  }, [auth.isLoading, auth.isAdmin, router]);

  // ── Load trust summary ───────────────────────────────────────────────
  React.useEffect(() => {
    if (!auth.isAdmin) return;
    setSummaryLoading(true);
    fetchJson<AdminTrustSummary>("/users/admin/trust")
      .then(setSummary)
      .catch(() => toast.error("Failed to load admin summary"))
      .finally(() => setSummaryLoading(false));
  }, [auth.isAdmin]);

  // ── Load reports ─────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!auth.isAdmin) return;
    setReportsLoading(true);
    fetchJson<{ items: ReportRow[] }>("/safety/reports?limit=50")
      .then((r) => setReports(r.items ?? []))
      .catch(() => setReports([]))
      .finally(() => setReportsLoading(false));
  }, [auth.isAdmin]);

  // ── Actions ──────────────────────────────────────────────────────────
  async function handleTrustAction(address: string, verify: boolean, note: string) {
    await fetchJson(`/users/${address}/trust`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sellerVerified: verify, sellerTrustNote: note || undefined }),
    });
    toast.success(verify ? "Seller verified ✓" : "Verification removed");
    // Refresh summary
    const updated = await fetchJson<AdminTrustSummary>("/users/admin/trust");
    setSummary(updated);
    // If the search result was updated, refresh it too
    if (searchResult?.user.address.toLowerCase() === address.toLowerCase()) {
      await searchUser(address);
    }
  }

  async function searchUser(addr: string) {
    const a = addr.trim();
    if (!a) return;
    setSearchLoading(true);
    setSearchError("");
    setSearchResult(null);
    try {
      const profile = await fetchJson<PublicUserProfile>(`/users/${a}`);
      setSearchResult(profile);
    } catch {
      setSearchError("User not found or invalid address.");
    } finally {
      setSearchLoading(false);
    }
  }

  // ── Loading / unauthorized states ────────────────────────────────────
  if (auth.isLoading) {
    return (
      <div className="space-y-4 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (!auth.isAdmin) return null;

  const TAB_CLASSES = "px-4 py-2 text-sm font-semibold rounded-xl transition-colors";
  const ACTIVE = "bg-primary text-primary-foreground shadow-sm";
  const INACTIVE = "text-muted-foreground hover:text-foreground hover:bg-muted";

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Seller verification, reports, and user management.
          </p>
        </div>
        <div className="flex gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border px-2.5 py-1 font-mono">
            {shortenHex(auth.address ?? "")}
          </span>
          <Badge variant="secondary">Admin</Badge>
        </div>
      </div>

      {/* Stats row */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Pending queue", value: summary.queue.length },
            { label: "Verified sellers", value: summary.verified.length },
            { label: "Recent reports", value: reports.length },
            { label: "Review actions", value: summary.history.length },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-4 text-center">
              <div className="text-2xl font-bold text-foreground">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tab strip */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide flex-wrap">
        {([
          { key: "queue",   label: `Queue (${summary?.queue.length ?? "…"})` },
          { key: "verified", label: `Verified (${summary?.verified.length ?? "…"})` },
          { key: "search",  label: "Search user" },
          { key: "reports", label: `Reports (${reports.length})` },
          { key: "history", label: "History" },
        ] as const).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`${TAB_CLASSES} ${tab === t.key ? ACTIVE : INACTIVE}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Verification queue ── */}
      {tab === "queue" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Users with listings who haven&apos;t been verified yet. Review their profile and verify or skip.
          </p>
          {summaryLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-2xl" />
            ))
          ) : summary?.queue.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No users in the verification queue
            </div>
          ) : (
            summary?.queue.map((p) => (
              <VerifyCard key={p.user.address} profile={p} onAction={handleTrustAction} />
            ))
          )}
        </div>
      )}

      {/* ── Tab: Verified sellers ── */}
      {tab === "verified" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Currently verified sellers. You can remove verification here.
          </p>
          {summaryLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-2xl" />
            ))
          ) : summary?.verified.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No verified sellers yet
            </div>
          ) : (
            summary?.verified.map((p) => (
              <VerifyCard key={p.user.address} profile={p} onAction={handleTrustAction} />
            ))
          )}
        </div>
      )}

      {/* ── Tab: Search user ── */}
      {tab === "search" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Look up any user by wallet address or email address to verify or review.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="0x… wallet address"
              value={searchAddress}
              onChange={(e) => setSearchAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchUser(searchAddress)}
              className="font-mono text-sm"
            />
            <Button
              onClick={() => searchUser(searchAddress)}
              disabled={searchLoading || !searchAddress.trim()}
              className="shrink-0"
            >
              {searchLoading ? "Searching…" : "Search"}
            </Button>
          </div>
          {searchError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {searchError}
            </div>
          )}
          {searchResult && (
            <VerifyCard profile={searchResult} onAction={handleTrustAction} />
          )}
        </div>
      )}

      {/* ── Tab: Reports ── */}
      {tab === "reports" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Recent reports from users. High-volume targets may be auto-hidden by the system.
          </p>
          {reportsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))
          ) : reports.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No reports yet
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40">
                  <tr>
                    {["ID", "Type", "Target", "Reason", "Reporter", "When"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reports.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{r.id}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="text-[10px]">{r.targetType}</Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs max-w-[160px] truncate">{r.targetId}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-300">
                          {r.reason}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {r.reporter ? shortenHex(r.reporter) : "anonymous"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {timeAgo(r.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: History ── */}
      {tab === "history" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Audit trail of all verification actions taken by admins.
          </p>
          {summaryLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))
          ) : !summary?.history.length ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No actions yet
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40">
                  <tr>
                    {["User", "Action", "Note", "Reviewer", "When"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {summary.history.map((h) => (
                    <tr key={h.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link href={`/seller/${h.userAddress}`} className="hover:underline text-primary">
                          {shortenHex(h.userAddress)}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {h.sellerVerified ? (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px]">Verified</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Removed</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                        {h.sellerTrustNote ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {shortenHex(h.reviewer)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {timeAgo(h.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
