"use client";

import * as React from "react";
import { useTheme } from "next-themes";

/**
 * ThemeToggle — animated sun / moon button.
 * Cycles: system → light → dark → light → …
 * Renders nothing until mounted to avoid SSR hydration mismatch.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-9 w-9" />;

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={[
        "flex h-9 w-9 items-center justify-center rounded-lg",
        "border border-slate-200 dark:border-slate-700",
        "bg-white dark:bg-slate-800",
        "text-slate-600 dark:text-slate-300",
        "shadow-sm transition-colors",
        "hover:bg-slate-50 dark:hover:bg-slate-700",
        "hover:text-slate-900 dark:hover:text-white",
        className,
      ].join(" ")}
    >
      {isDark ? (
        /* Sun icon */
        <svg
          viewBox="0 0 24 24"
          className="h-[18px] w-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        /* Moon icon */
        <svg
          viewBox="0 0 24 24"
          className="h-[18px] w-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
        </svg>
      )}
    </button>
  );
}
