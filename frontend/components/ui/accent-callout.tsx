import * as React from "react";

import { cn } from "@/lib/utils";

type AccentCalloutTone = "mint" | "blue" | "amber";

export function AccentCallout({
  label,
  tone,
  children,
  actions,
  className,
}: {
  label: string;
  tone: AccentCalloutTone;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("market-callout", `market-callout-${tone}`, className)}>
      <div className="market-callout-label">{label}</div>
      <div className="market-callout-copy">{children}</div>
      {actions ? <div className="market-callout-actions">{actions}</div> : null}
    </div>
  );
}