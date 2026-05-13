"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  description: string;
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Shared error boundary content used by all error.tsx files.
 * Shows the error summary, an optional digest code for support, and retry.
 */
export function ErrorBoundaryContent({ title, description, error, reset }: Props) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 px-4 text-center">
      {/* Icon */}
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-3xl text-destructive">
        ⚠
      </div>

      {/* Copy */}
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>

      {/* Error detail (collapsed) */}
      <details className="w-full max-w-sm rounded-xl border border-border bg-muted/40 px-4 py-2 text-left text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none font-semibold">
          Technical details
        </summary>
        <div className="mt-2 space-y-1 font-mono">
          <p className="break-all">{error.message || "Unknown error"}</p>
          {error.digest && (
            <p className="text-[10px] opacity-60">Error ID: {error.digest}</p>
          )}
        </div>
      </details>

      {/* Actions */}
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={reset} className="rounded-xl px-6">
          Try again
        </Button>
        <Button
          variant="outline"
          className="rounded-xl px-6"
          onClick={() => window.history.back()}
        >
          Go back
        </Button>
      </div>
    </div>
  );
}
