"use client";

import * as React from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-screen-xl items-center justify-between gap-3 px-4 py-3 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            Seller Block
          </Link>
          <nav className="hidden items-center gap-2 sm:flex">
            <Button asChild variant="ghost" size="sm">
              <Link href="/">Listings</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/create">Create</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </nav>
        </div>

        <div className="hidden sm:block">
          <ConnectButton showBalance={false} chainStatus="icon" />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 sm:hidden"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path
              d="M4 7h16M4 12h16M4 17h16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </Button>
      </div>

      {/* Mobile drawer */}
      <div
        className={
          open
            ? "fixed inset-0 z-50 sm:hidden"
            : "pointer-events-none fixed inset-0 z-50 opacity-0 sm:hidden"
        }
        aria-hidden={!open}
      >
        <button
          type="button"
          className={
            open
              ? "absolute inset-0 bg-background/20 backdrop-blur-sm"
              : "absolute inset-0 bg-transparent"
          }
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />

        <div
          role="dialog"
          aria-modal="true"
          className={
            open
              ? "fixed inset-y-0 right-0 w-[85%] max-w-xs border-l bg-background shadow-lg transition-transform duration-200 ease-out translate-x-0"
              : "fixed inset-y-0 right-0 w-[85%] max-w-xs border-l bg-background shadow-lg transition-transform duration-200 ease-out translate-x-full"
          }
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="text-sm font-semibold">Menu</div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </Button>
          </div>

          <div className="space-y-2 p-4">
            <Button asChild variant="ghost" className="h-11 w-full justify-start" onClick={() => setOpen(false)}>
              <Link href="/">Listings</Link>
            </Button>
            <Button asChild variant="ghost" className="h-11 w-full justify-start" onClick={() => setOpen(false)}>
              <Link href="/create">Create</Link>
            </Button>
            <Button asChild variant="ghost" className="h-11 w-full justify-start" onClick={() => setOpen(false)}>
              <Link href="/dashboard">Dashboard</Link>
            </Button>

            <div className="pt-2">
              <div className="text-xs text-muted-foreground">Wallet</div>
              <div className="mt-2">
                <ConnectButton showBalance={false} chainStatus="icon" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
