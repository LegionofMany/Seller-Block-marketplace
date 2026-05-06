"use client";

import * as React from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/AuthProvider";
import { fetchJson } from "@/lib/api";
import { shortenHex } from "@/lib/format";
import { useInjectedWalletAvailability } from "@/lib/injectedWallet";

function formatIdentityLabel(
  address: string | null,
  email?: string | null,
  displayName?: string | null
) {
  if (displayName?.trim()) return displayName.trim();
  if (email?.trim()) return email.trim();
  if (!address) return "Signed in";
  return address.startsWith("0x")
    ? shortenHex(address)
    : address.replace(/^email:/, "");
}

export function SiteHeader() {
  const [open, setOpen] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const { address } = useAccount();
  const auth = useAuth();
  const { checked: injectedWalletChecked, hasInjectedWallet } =
    useInjectedWalletAvailability();

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!auth.isAuthenticated) { setUnreadCount(0); return; }
      try {
        const res = await fetchJson<{ unreadCount: number }>(
          "/notifications?limit=1", { timeoutMs: 4_000 }
        );
        if (!cancelled) setUnreadCount(res.unreadCount ?? 0);
      } catch {
        if (!cancelled) setUnreadCount(0);
      }
    }
    void run();
    return () => { cancelled = true; };
  }, [auth.isAuthenticated]);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      {/* ── Main header bar ── */}
      <div className="mx-auto flex w-full max-w-screen-xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-6 sm:py-3">

        {/* Logo */}
        <Link href="/" className="min-w-0 shrink-0">
          <div className="text-[15px] font-bold tracking-tight text-slate-950 sm:text-base">
            Zonycs
          </div>
          <div className="hidden text-[10px] uppercase tracking-[0.22em] text-muted-foreground sm:block">
            Marketplace
          </div>
        </Link>

        {/* Desktop nav + wallet */}
        <div className="hidden items-center gap-4 sm:flex">
          <nav className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm" className="text-sm font-medium text-slate-700 hover:text-slate-950">
              <Link href="/marketplace">Listings</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-sm font-medium text-slate-700 hover:text-slate-950">
              <Link href="/create">Post ad</Link>
            </Button>
            {auth.isAuthenticated ? (
              <Button asChild variant="ghost" size="sm" className="text-sm font-medium text-slate-700 hover:text-slate-950">
                <Link href="/dashboard">
                  Dashboard
                  {unreadCount > 0 ? (
                    <span className="ml-1.5 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {unreadCount}
                    </span>
                  ) : null}
                </Link>
              </Button>
            ) : null}
          </nav>

          <div className="h-5 w-px bg-border/60" />

          <div className="flex items-center gap-2">
            <ConnectButton showBalance={false} chainStatus="icon" />

            {!address && !auth.isAuthenticated ? (
              <Button asChild size="sm" className="rounded-full bg-blue-600 text-white hover:bg-blue-700 border-0">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            ) : null}

            {address && !auth.isAuthenticated ? (
              <Button
                type="button"
                size="sm"
                className="rounded-full bg-blue-600 text-white hover:bg-blue-700 border-0"
                disabled={auth.isLoading}
                onClick={() => void auth.signIn()}
              >
                {auth.isLoading ? "Signing in…" : "Sign in"}
              </Button>
            ) : null}

            {auth.isAuthenticated ? (
              <div className="flex items-center gap-2">
                <div className="max-w-[120px] truncate text-xs font-medium text-slate-700">
                  {formatIdentityLabel(
                    auth.address ?? address ?? null,
                    auth.user?.email,
                    auth.user?.displayName
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full text-xs"
                  onClick={auth.signOut}
                >
                  Sign out
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 sm:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>


      {/* ── Mobile drawer overlay ── */}
      {open ? (
        <div className="fixed inset-0 z-50 sm:hidden" aria-hidden="false">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Drawer panel */}
          <div
            role="dialog"
            aria-modal="true"
            className="absolute inset-y-0 right-0 flex w-[85%] max-w-[22rem] flex-col border-l border-blue-500/40 bg-gradient-to-b from-blue-700 to-blue-800 shadow-2xl"
          >
            {/* Drawer header */}
            <div className="flex shrink-0 items-center justify-between border-b border-blue-600/50 px-5 py-4">
              <div>
                <div className="text-base font-bold text-white">Zonycs</div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-blue-300">Marketplace</div>
              </div>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-blue-200 transition-colors hover:bg-blue-600/50 hover:text-white"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-4">

              {/* Nav links */}
              <div className="space-y-1">
                <div className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300">
                  Navigate
                </div>
                {[
                  { href: "/marketplace", label: "Listings" },
                  { href: "/create", label: "Post an ad" },
                  { href: "/dashboard", label: "Dashboard" },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-600/50"
                  >
                    {item.label}
                  </Link>
                ))}
                {auth.isAuthenticated ? (
                  <Link
                    href="/dashboard#notifications"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-600/50"
                  >
                    <span>Alerts</span>
                    {unreadCount > 0 ? (
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-blue-700">
                        {unreadCount}
                      </span>
                    ) : null}
                  </Link>
                ) : null}
              </div>

              <div className="my-3 h-px bg-blue-600/40" />


              {/* Wallet & Account */}
              <div className="space-y-3">
                <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300">
                  Wallet & Account
                </div>

                <div className="space-y-3 rounded-2xl border border-blue-500/40 bg-blue-900/40 p-4">
                  <div className="text-xs font-semibold text-blue-200">Connect your wallet</div>
                  <ConnectButton showBalance={false} chainStatus="icon" />

                  {injectedWalletChecked && !hasInjectedWallet ? (
                    <div className="rounded-xl border border-blue-500/40 bg-blue-800/40 px-3 py-2 text-xs leading-5 text-blue-200">
                      No browser wallet detected. Use WalletConnect to connect from mobile or install MetaMask on desktop.
                    </div>
                  ) : null}

                  {!address && !auth.isAuthenticated ? (
                    <Link
                      href="/sign-in"
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-50"
                    >
                      Sign in with email
                    </Link>
                  ) : null}

                  {address && !auth.isAuthenticated ? (
                    <button
                      type="button"
                      disabled={auth.isLoading}
                      onClick={() => void auth.signIn()}
                      className="flex w-full items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-50 disabled:opacity-60"
                    >
                      {auth.isLoading ? "Signing in…" : "Sign in with wallet"}
                    </button>
                  ) : null}

                  {auth.isAuthenticated ? (
                    <div className="space-y-2">
                      <div className="rounded-xl border border-blue-500/40 bg-blue-800/40 px-3 py-2">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-blue-300">Signed in as</div>
                        <div className="mt-1 truncate text-xs font-semibold text-white">
                          {formatIdentityLabel(
                            auth.address ?? address ?? null,
                            auth.user?.email,
                            auth.user?.displayName
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { auth.signOut(); setOpen(false); }}
                        className="flex w-full items-center justify-center rounded-xl border border-blue-500/40 px-4 py-2.5 text-sm font-semibold text-blue-100 transition-colors hover:bg-blue-600/50"
                      >
                        Sign out
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="my-3 h-px bg-blue-600/40" />

              {/* Platform features */}
              <div className="space-y-2 rounded-2xl border border-blue-500/30 bg-blue-900/30 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300">
                  Platform features
                </div>
                {[
                  "Public listings & local discovery",
                  "Blockchain escrow & wallet settlement",
                  "Follow sellers & save searches",
                  "Post free ads in minutes",
                ].map((feature) => (
                  <div key={feature} className="flex items-center gap-2 text-xs font-medium text-blue-100">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                    {feature}
                  </div>
                ))}
              </div>

            </div>
          </div>
        </div>
      ) : null}

    </header>
  );
}
