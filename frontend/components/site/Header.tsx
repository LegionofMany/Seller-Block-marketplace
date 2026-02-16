"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <div className="flex items-center gap-3">
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

        <ConnectButton showBalance={false} chainStatus="icon" />
      </div>
    </header>
  );
}
