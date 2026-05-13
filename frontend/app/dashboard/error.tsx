"use client";

import { useEffect } from "react";
import { ErrorBoundaryContent } from "@/components/ui/ErrorBoundaryContent";
import { createLogger } from "@/lib/logger";

const log = createLogger("DashboardPage");

export default function DashboardError({
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
      title="Dashboard failed to load"
      description="Something went wrong loading your account. Please try again or refresh the page."
      error={error}
      reset={reset}
    />
  );
}
