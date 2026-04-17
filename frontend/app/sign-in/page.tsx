"use client";

import Link from "next/link";
import * as React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getEnv } from "@/lib/env";

export default function SignInPage() {
  const auth = useAuth();
  const { address } = useAccount();
  const env = getEnv();
  const walletConnectEnabled = Boolean(env.walletConnectProjectId);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [mode, setMode] = React.useState<"login" | "register">("login");

  const emailDisabled = auth.isLoading;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      <Card className="market-panel">
        <CardHeader>
          <CardTitle>Wallet sign-in</CardTitle>
          <CardDescription>Desktop extension wallets still work, but tablet and mobile users usually need WalletConnect unless they are already inside a wallet browser.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="market-note text-sm">
            WalletConnect status: {walletConnectEnabled ? "enabled" : "missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID"}
          </div>
          <div className="flex flex-wrap gap-3">
            <ConnectButton showBalance={false} chainStatus="icon" />
            {address && !auth.isAuthenticated ? (
              <Button type="button" onClick={() => void auth.signIn()} disabled={auth.isLoading}>
                Sign in with wallet
              </Button>
            ) : null}
            {auth.isAuthenticated ? (
              <Button type="button" variant="outline" onClick={auth.signOut}>
                Sign out
              </Button>
            ) : null}
          </div>
          <div className="space-y-2 text-sm text-slate-700">
            <div>1. Connect with an extension wallet on desktop or scan from mobile using WalletConnect.</div>
            <div>2. Approve the nonce message to create the existing wallet session.</div>
            <div>3. After sign-in, marketplace alerts, follows, and personalized homepage inventory can use your authenticated profile.</div>
          </div>
          {!walletConnectEnabled ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-700">
              Mobile/tablet wallet connection is still blocked until a real WalletConnect Cloud project ID is added to the frontend env and deployed. The code path is already wired; the missing piece is the env value.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="market-panel">
        <CardHeader>
          <CardTitle>Email sign-in</CardTitle>
          <CardDescription>Create a marketplace account without a wallet, then keep favorites, alerts, and homepage personalization tied to that session.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button type="button" variant={mode === "login" ? "default" : "outline"} onClick={() => setMode("login")} disabled={emailDisabled}>
              Sign in
            </Button>
            <Button type="button" variant={mode === "register" ? "default" : "outline"} onClick={() => setMode("register")} disabled={emailDisabled}>
              Create account
            </Button>
          </div>
          <div className="grid gap-4">
            {mode === "register" ? (
              <div className="space-y-2">
                <Label htmlFor="displayName">Display name</Label>
                <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="MarketHub shopper" disabled={emailDisabled} />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={emailDisabled} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder={mode === "register" ? "Create a password" : "Enter your password"} value={password} onChange={(e) => setPassword(e.target.value)} disabled={emailDisabled} />
            </div>
            <Button
              type="button"
              disabled={emailDisabled || !email.trim() || password.trim().length < 8}
              onClick={() =>
                void (mode === "login"
                  ? auth.signInWithEmail({ email: email.trim(), password })
                  : auth.registerWithEmail({ email: email.trim(), password, displayName: displayName.trim() || undefined }))
              }
            >
              {mode === "login" ? "Sign in with email" : "Create email account"}
            </Button>
          </div>

          <div className="space-y-2 text-sm text-slate-700">
            <div>Email accounts now create a real backend session and keep homepage favorites, followed-seller ordering, and alerts tied to that account.</div>
            <div>Wallet checkout and on-chain seller actions still require a connected wallet. This page keeps both paths available side by side.</div>
            <div>Account recovery and wallet-linking can be added next without replacing this session model.</div>
          </div>

          {auth.isAuthenticated ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-slate-700">
              Signed in as {auth.user?.displayName?.trim() || auth.user?.email?.trim() || auth.address}.
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/marketplace">Back to marketplace</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/">Back to landing page</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}