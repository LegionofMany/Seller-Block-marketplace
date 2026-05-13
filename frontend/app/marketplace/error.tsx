"use client";

import { useEffect } from "react";
import { ErrorBoundaryContent } from "@/components/ui/ErrorBoundaryContent";
import { createLogger } from "@/lib/logger";

const log = createLogger("MarketplacePage");

export default function MarketplaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    log.error("Page render error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <ErrorBoundaryContent
      title="Could not load listings"
      description="There was a problem fetching the marketplace. Please try again or refresh the page."
      error={error}
      reset={reset}
    />
  );
}
