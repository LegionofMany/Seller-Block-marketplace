"use client";

import * as React from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import { useAuth } from "@/components/providers/AuthProvider";
import { fetchJson } from "@/lib/api";
import { shortenHex } from "@/lib/format";
import { useInjectedWalletAvailability } from "@/lib/injectedWallet";
import { useFocusTrap } from "@/lib/useFocusTrap";

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
  const drawerRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(drawerRef, open);
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
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {/* ─────────────────────────────────────────
          HEADER BAR
      ───────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl shadow-sm dark:shadow-slate-900/50">
        <div className="mx-auto flex w-full max-w-screen-xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6">

          {/* Logo */}
          <Link href="/" className="min-w-0 shrink-0 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white text-xs font-black">
              Z
            </div>
            <div>
              <div className="text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">
                Zonycs
              </div>
              <div className="hidden text-[9px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 sm:block">
                Marketplace
              </div>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 sm:flex">
            <Button asChild variant="ghost" size="sm"
              className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800">
              <Link href="/marketplace">Listings</Link>
            </Button>
            <Button asChild variant="ghost" size="sm"
              className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800">
              <Link href="/create">Post ad</Link>
            </Button>
            {auth.isAuthenticated ? (
              <Button asChild variant="ghost" size="sm"
                className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800">
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
            {auth.isAdmin ? (
              <Button asChild variant="ghost" size="sm"
                className="text-sm font-medium text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900/20">
                <Link href="/admin">Admin</Link>
              </Button>
            ) : null}
          </nav>

          {/* Desktop wallet + auth + theme toggle */}
          <div className="hidden items-center gap-2 sm:flex">
            <ThemeToggle />
            <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
            <ConnectButton showBalance={false} chainStatus="icon" />
            <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />

            {!address && !auth.isAuthenticated ? (
              <Button asChild size="sm"
                className="rounded-full bg-blue-600 text-white hover:bg-blue-700 border-0 px-5">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            ) : null}

            {address && !auth.isAuthenticated ? (
              <Button type="button" size="sm"
                className="rounded-full bg-blue-600 text-white hover:bg-blue-700 border-0 px-5"
                disabled={auth.isLoading}
                onClick={() => void auth.signIn()}>
                {auth.isLoading ? "Signing in…" : "Sign in"}
              </Button>
            ) : null}

            {auth.isAuthenticated ? (
              <div className="flex items-center gap-2">
                <div className="max-w-[110px] truncate text-xs font-medium text-slate-600 dark:text-slate-300">
                  {formatIdentityLabel(
                    auth.address ?? address ?? null,
                    auth.user?.email,
                    auth.user?.displayName
                  )}
                </div>
                <Button type="button" variant="outline" size="sm"
                  className="rounded-full text-xs border-slate-300 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  onClick={auth.signOut}>
                  Sign out
                </Button>
              </div>
            ) : null}
          </div>

          {/* Mobile: theme toggle + hamburger */}
          <div className="flex items-center gap-2 sm:hidden">
            <ThemeToggle />
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </header>


      {/* ─────────────────────────────────────────
          MOBILE DRAWER
      ───────────────────────────────────────── */}
      {open ? (
        <div
          className="fixed inset-0 z-[9999]"
          aria-modal="true"
          role="dialog"
          style={{ isolation: "isolate" }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/50 dark:bg-black/60 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />

          {/* Drawer panel */}
          <div ref={drawerRef} className="absolute inset-y-0 right-0 flex w-[82%] max-w-[20rem] flex-col bg-white dark:bg-slate-950 shadow-2xl dark:shadow-black/60">

            {/* Drawer top bar */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-blue-600 dark:bg-blue-700 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-white text-xs font-black">
                  Z
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Zonycs</div>
                  <div className="text-[9px] uppercase tracking-[0.18em] text-blue-200">
                    Marketplace
                  </div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex flex-1 flex-col overflow-y-auto">

              {/* Nav section */}
              <div className="px-4 pt-5 pb-3">
                <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                  Navigation
                </div>
                <nav className="space-y-0.5">
                  {[
                    { href: "/marketplace", label: "Listings", icon: "🏪" },
                    { href: "/create", label: "Post an ad", icon: "✏️" },
                    { href: "/dashboard", label: "Dashboard", icon: "📊" },
                  ].map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300"
                    >
                      <span className="text-base">{item.icon}</span>
                      {item.label}
                    </Link>
                  ))}
                  {auth.isAuthenticated ? (
                    <Link
                      href="/dashboard#notifications"
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-base">🔔</span>
                        Alerts
                      </div>
                      {unreadCount > 0 ? (
                        <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">
                          {unreadCount}
                        </span>
                      ) : null}
                    </Link>
                  ) : null}
                  {auth.isAdmin ? (
                    <Link
                      href="/admin"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-amber-700 dark:text-amber-400 transition-colors hover:bg-amber-50 dark:hover:bg-amber-900/20"
                    >
                      <span className="text-base">🛡</span>
                      Admin
                    </Link>
                  ) : null}
                </nav>
              </div>

              <div className="mx-4 h-px bg-slate-100 dark:bg-slate-800" />

              {/* Wallet & Account section */}
              <div className="px-4 pt-4 pb-3">
                <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                  Wallet & Account
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 space-y-3">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Connect your wallet
                  </div>
                  <div className="flex justify-start max-w-full overflow-hidden">
                    <div className="max-w-full [&>div]:max-w-full [&_button]:max-w-full [&_button]:truncate">
                      <ConnectButton showBalance={false} chainStatus="icon" />
                    </div>
                  </div>

                  {injectedWalletChecked && !hasInjectedWallet ? (
                    <div className="rounded-xl border border-amber-200 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-300">
                      No browser wallet found. Use WalletConnect on mobile or install MetaMask on desktop.
                    </div>
                  ) : null}

                  {!address && !auth.isAuthenticated ? (
                    <Link
                      href="/sign-in"
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700"
                    >
                      Sign in with email
                    </Link>
                  ) : null}

                  {address && !auth.isAuthenticated ? (
                    <button
                      type="button"
                      disabled={auth.isLoading}
                      onClick={() => void auth.signIn()}
                      className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                    >
                      {auth.isLoading ? "Signing in…" : "Sign in with wallet"}
                    </button>
                  ) : null}

                  {auth.isAuthenticated ? (
                    <div className="space-y-2">
                      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          Signed in as
                        </div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-white">
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
                        className="flex w-full items-center justify-center rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        Sign out
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mx-4 h-px bg-slate-100 dark:bg-slate-800" />

              {/* Platform features */}
              <div className="px-4 pt-4 pb-3">
                <div className="mb-3 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                  Why Zonycs?
                </div>
                <div className="space-y-2">
                  {[
                    { icon: "📍", text: "Local listings & discovery" },
                    { icon: "🔒", text: "Blockchain escrow & safe payments" },
                    { icon: "⭐", text: "Follow sellers & save searches" },
                    { icon: "🆓", text: "Free to browse and post ads" },
                  ].map((item) => (
                    <div key={item.text}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60">
                      <span className="text-base shrink-0">{item.icon}</span>
                      {item.text}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mx-4 h-px bg-slate-100 dark:bg-slate-800" />

              {/* Appearance row */}
              <div className="px-4 py-4 flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                  Appearance
                </div>
                <ThemeToggle />
              </div>

            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
