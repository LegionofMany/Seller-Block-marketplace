"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api";

export function EscrowAcceptCTA({ listingId, listingChainKey }: { listingId: string; listingChainKey: string }) {
  const [loading, setLoading] = React.useState(false);

  async function handleClick() {
    try {
      setLoading(true);
      await fetchJson("/payments/escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, listingChainKey, amount: 0, currency: "usd" }),
      });
      toast.success("Escrow request submitted for review");
    } catch (err: unknown) {
      if (err instanceof Error) toast.error(err.message);
      else toast.error("Failed to request escrow");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" variant="outline" disabled={loading} onClick={() => void handleClick()}>
      {loading ? "Requesting…" : "Request escrow / manual review"}
    </Button>
  );
}
