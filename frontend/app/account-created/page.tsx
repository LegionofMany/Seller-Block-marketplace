"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { useAuth } from "@/components/providers/AuthProvider";
import { AccentCallout } from "@/components/ui/accent-callout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AccountCreatedPage() {
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email")?.trim() || auth.user?.email?.trim() || "your email";
  const verificationSent = searchParams.get("email_sent") === "1";
  const verifiedFromLink = searchParams.get("verified") === "1";

  const setupActions = [
    { label: "Finish identity details", href: "/dashboard?focus=identity" },
    { label: "Complete contact details", href: "/dashboard?focus=contact" },
    { label: "Add public bio", href: "/dashboard?focus=bio" },
    { label: "Link seller wallet later", href: "/dashboard?focus=wallet" },
  ];

  return (
    <div className="mx-auto grid max-w-5xl gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <Card className="market-panel market-panel-spotlight market-panel-spotlight-mint order-2 xl:order-1">
        <CardHeader>
          <div className="market-section-title">Account created</div>
          <CardTitle>{verifiedFromLink ? "Your email is confirmed" : "Your marketplace account is ready"}</CardTitle>
          <CardDescription>
            {verifiedFromLink
              ? "The account is now confirmed. Finish the public profile next so buyers see a complete marketplace identity."
              : "This is the handoff point after sign-up: verify the account, complete the public profile, then add a seller wallet later only if you need seller-side actions."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AccentCallout label={verifiedFromLink ? "Verification complete" : "Verification status"} tone={verifiedFromLink || verificationSent ? "mint" : "amber"}>
            {verifiedFromLink
              ? `The verification link for ${email} has been accepted.`
              : verificationSent
                ? `A verification email was sent to ${email}. Open it to confirm the account for recovery, alerts, and trusted sign-in.`
                : "The account was created, but this environment did not send the verification email automatically. You can resend it below."}
          </AccentCallout>

          <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-950">Next steps</div>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <div>1. Confirm the email account if you have not already done it.</div>
              <div>2. Open Profile and complete identity, contact, and bio details.</div>
              <div>3. Link a seller wallet later only when you need listing or settlement actions.</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => router.push("/dashboard")}>Open profile setup</Button>
            <Button type="button" variant="outline" onClick={() => router.push("/dashboard?focus=contact")}>Go to missing contact details</Button>
            <Button asChild variant="ghost">
              <Link href="/marketplace">Browse marketplace</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="market-panel market-panel-spotlight market-panel-spotlight-blue order-1 xl:order-2">
        <CardHeader>
          <div className="market-section-title">Guided setup</div>
          <CardTitle>Complete the account like a normal marketplace</CardTitle>
          <CardDescription>These links take you straight to the part of Profile that still matters after sign-up.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!verifiedFromLink && auth.user?.authMethod === "email" && !auth.user?.emailVerifiedAt ? (
            <AccentCallout
              label="Need another verification email?"
              tone="blue"
              actions={
                <Button type="button" variant="outline" disabled={auth.isLoading || !auth.user?.email} onClick={() => void auth.sendVerificationEmail()}>
                  Resend verification email
                </Button>
              }
            >
              Use this if the first message did not arrive or expired.
            </AccentCallout>
          ) : null}

          <div className="grid gap-3">
            {setupActions.map((action) => (
              <Link key={action.label} href={action.href} className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-sm font-medium text-slate-900 transition hover:border-slate-300 hover:bg-white">
                {action.label}
              </Link>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/85 p-4 text-sm text-slate-700">
            Wallet-first access still exists for older wallet-only accounts, but new onboarding is now account-first by default.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
