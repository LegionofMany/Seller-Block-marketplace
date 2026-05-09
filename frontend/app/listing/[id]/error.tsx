"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ListingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Listing] page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-2xl text-destructive">
        ⚠
      </div>
      <div>
        <h2 className="text-xl font-bold tracking-tight">
          Could not load this listing
        </h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          The listing may have been removed or there was a temporary error.
        </p>
      </div>
      <div className="flex gap-3">
        <Button onClick={reset} variant="outline" className="rounded-xl">
          Try again
        </Button>
        <Button asChild className="rounded-xl">
          <Link href="/marketplace">Browse listings</Link>
        </Button>
      </div>
    </div>
  );
}
