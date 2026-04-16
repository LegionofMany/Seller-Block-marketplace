"use client";

import * as React from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/AuthProvider";
import { fetchJson } from "@/lib/api";
import { shortenHex } from "@/lib/format";

export function SiteHeader() {
  const [open, setOpen] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const { address } = useAccount();
  const auth = useAuth();

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!auth.isAuthenticated) {
        setUnreadCount(0);
        return;
      }

      try {
        const res = await fetchJson<{ unreadCount: number }>("/notifications?limit=1", { timeoutMs: 4_000 });
        if (!cancelled) setUnreadCount(res.unreadCount ?? 0);
      } catch {
        if (!cancelled) setUnreadCount(0);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated]);

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
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-screen-xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link href="/" className="min-w-0">
            <div className="truncate text-[15px] font-semibold tracking-tight sm:text-base">Seller Block</div>
            <div className="hidden text-[11px] uppercase tracking-[0.22em] text-muted-foreground sm:block">Marketplace classifieds</div>
          </Link>
          <nav className="hidden items-center gap-2 sm:flex">
            <Button asChild variant="ghost" size="sm">
              <Link href="/marketplace">Listings</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/create">Create</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            {auth.isAuthenticated ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard#notifications">Alerts{unreadCount > 0 ? ` (${unreadCount})` : ""}</Link>
              </Button>
            ) : null}
          </nav>
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          <div className="market-chip">Public replies, local discovery, wallet checkout</div>
          <ConnectButton showBalance={false} chainStatus="icon" />
          {!address && !auth.isAuthenticated ? (
            <Button asChild type="button" variant="outline" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          ) : null}
          {address && !auth.isAuthenticated ? (
            <Button type="button" variant="outline" size="sm" disabled={auth.isLoading} onClick={() => void auth.signIn()}>
              Sign in
            </Button>
          ) : null}
          {auth.isAuthenticated ? (
            <>
              <div className="max-w-36 truncate text-xs text-muted-foreground">
                {auth.user?.displayName?.trim() || shortenHex(auth.address ?? address ?? "")}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={auth.signOut}>
                Sign out
              </Button>
            </>
          ) : null}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 sm:hidden"
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
              ? "fixed inset-y-0 right-0 w-[88%] max-w-[20rem] border-l bg-background shadow-lg transition-transform duration-200 ease-out translate-x-0"
              : "fixed inset-y-0 right-0 w-[88%] max-w-[20rem] border-l bg-background shadow-lg transition-transform duration-200 ease-out translate-x-full"
          }
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Menu</div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Browse and manage</div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10"
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
            <div className="market-note text-xs">Public replies, local discovery, and wallet checkout are all available from the main marketplace flow.</div>
            <Button asChild variant="ghost" className="h-10 w-full justify-start rounded-xl" onClick={() => setOpen(false)}>
              <Link href="/marketplace">Listings</Link>
            </Button>
            <Button asChild variant="ghost" className="h-10 w-full justify-start rounded-xl" onClick={() => setOpen(false)}>
              <Link href="/create">Create</Link>
            </Button>
            <Button asChild variant="ghost" className="h-10 w-full justify-start rounded-xl" onClick={() => setOpen(false)}>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            {auth.isAuthenticated ? (
              <Button asChild variant="ghost" className="h-10 w-full justify-start rounded-xl" onClick={() => setOpen(false)}>
                <Link href="/dashboard#notifications">Alerts{unreadCount > 0 ? ` (${unreadCount})` : ""}</Link>
              </Button>
            ) : null}

            <div className="rounded-2xl border bg-accent/20 p-3 pt-3">
              <div className="text-xs text-muted-foreground">Wallet</div>
              <div className="mt-2">
                <ConnectButton showBalance={false} chainStatus="icon" />
              </div>
              {!address && !auth.isAuthenticated ? (
                <Button asChild type="button" variant="outline" className="mt-3 h-10 w-full rounded-xl">
                  <Link href="/sign-in" onClick={() => setOpen(false)}>Sign in</Link>
                </Button>
              ) : null}
              {address && !auth.isAuthenticated ? (
                <Button type="button" variant="outline" className="mt-3 h-10 w-full rounded-xl" disabled={auth.isLoading} onClick={() => void auth.signIn()}>
                  Sign in
                </Button>
              ) : null}
              {auth.isAuthenticated ? (
                <Button type="button" variant="ghost" className="mt-3 h-10 w-full rounded-xl" onClick={auth.signOut}>
                  Sign out
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
