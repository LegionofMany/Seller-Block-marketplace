"use client";

import { useEffect } from "react";
import { ErrorBoundaryContent } from "@/components/ui/ErrorBoundaryContent";
import { createLogger } from "@/lib/logger";

const log = createLogger("ListingPage");

export default function ListingError({
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
      title="Could not load this listing"
      description="The listing may have been removed, or a temporary network error occurred."
      error={error}
      reset={reset}
    />
  );
}
