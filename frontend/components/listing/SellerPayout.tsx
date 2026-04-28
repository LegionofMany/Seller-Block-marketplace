"use client";

import * as React from "react";
import { isAddress } from "viem";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api";

export function SellerPayout({ sellerAddress }: { sellerAddress: string }) {
  const [payout, setPayout] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!sellerAddress) return;
      try {
        setLoading(true);
        const res = await fetchJson<{ user: { stablecoinAddress?: string | null } }>(`/users/${sellerAddress}`);
        if (cancelled) return;
        const addr = res.user?.stablecoinAddress ?? null;
        setPayout(addr && typeof addr === "string" ? addr : null);
      } catch (err) {
        console.debug("Failed to load seller payout", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [sellerAddress]);

  if (loading) return <div>Loading payout address…</div>;
  if (!payout) return <div>No payout address provided</div>;

  const valid = isAddress(payout);

  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">Seller payout address</div>
      <div className="flex items-center gap-3">
        <div className="font-mono text-sm">{payout}</div>
        <Button
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(payout);
              toast.success("Payout address copied");
            } catch {
              toast.error("Copy failed");
            }
          }}
        >
          Copy
        </Button>
        {!valid ? <div className="text-xs text-amber-600">Invalid address</div> : null}
      </div>
    </div>
  );
}
