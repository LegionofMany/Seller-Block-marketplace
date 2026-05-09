"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function MarketplaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Marketplace] page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-2xl text-destructive">
        ⚠
      </div>
      <div>
        <h2 className="text-xl font-bold tracking-tight">
          Could not load listings
        </h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          There was a problem fetching the marketplace. Please try again.
        </p>
      </div>
      <Button onClick={reset} variant="outline" className="rounded-xl">
        Try again
      </Button>
    </div>
  );
}
