"use client";

import Link from "next/link";
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
          <CardTitle>Email sign-in design</CardTitle>
          <CardDescription>This is the non-wallet flow that still needs backend implementation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="name@example.com" disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="Create a password" disabled />
            </div>
            <Button type="button" disabled>
              Email sign-in coming next
            </Button>
          </div>

          <div className="space-y-2 text-sm text-slate-700">
            <div>Planned flow: email verification, password login, reset-password, and optional wallet linking after account creation.</div>
            <div>Backend work still required: users table fields for email/password, verification tokens, reset tokens, auth routes, and rate limiting.</div>
            <div>Frontend work still required: active form submission, session handling, account-link UI, and recovery flows.</div>
          </div>

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