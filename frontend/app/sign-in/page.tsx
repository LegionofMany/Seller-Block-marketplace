"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { toast } from "sonner";
import { useAccount } from "wagmi";

import { useAuth } from "@/components/providers/AuthProvider";
import { AccentCallout } from "@/components/ui/accent-callout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getEnv } from "@/lib/env";

export default function SignInPage() {
  const auth = useAuth();
  const { consumeEmailToken, requestMagicLink, requestPasswordReset, resetPasswordWithEmailToken } = auth;
  const { address } = useAccount();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const env = getEnv();
  const walletConnectEnabled = Boolean(env.walletConnectProjectId);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [resetPassword, setResetPassword] = React.useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [phoneNumber, setPhoneNumber] = React.useState("");
  const [streetAddress1, setStreetAddress1] = React.useState("");
  const [streetAddress2, setStreetAddress2] = React.useState("");
  const [city, setCity] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [postalCode, setPostalCode] = React.useState("");
  const [mode, setMode] = React.useState<"login" | "register" | "reset">("login");
  const [emailLinkBusy, setEmailLinkBusy] = React.useState(false);
  const [emailLinkStatus, setEmailLinkStatus] = React.useState<"idle" | "processing" | "success" | "error">("idle");
  const emailToken = searchParams.get("email_token")?.trim() ?? "";
  const rawEmailIntent = searchParams.get("email_intent")?.trim() ?? "login";
  const emailIntent = rawEmailIntent === "verify" || rawEmailIntent === "reset" ? rawEmailIntent : "login";

  const emailDisabled = auth.isLoading;
  const registrationMissingFields = [
    !fullName.trim() ? "full name" : null,
    !displayName.trim() ? "display name" : null,
    !phoneNumber.trim() ? "phone number" : null,
    !streetAddress1.trim() ? "street address" : null,
    !city.trim() ? "city" : null,
    !region.trim() ? "region/state" : null,
    !postalCode.trim() ? "postal code" : null,
  ].filter(Boolean) as string[];
  const registrationReady = registrationMissingFields.length === 0 && password.trim().length >= 8 && password === confirmPassword;
  const passwordMismatch = mode === "register" && confirmPassword.length > 0 && password !== confirmPassword;
  const resetPasswordMismatch = resetConfirmPassword.length > 0 && resetPassword !== resetConfirmPassword;
  const resetReady = emailToken.length > 0 && resetPassword.trim().length >= 8 && resetPassword === resetConfirmPassword;

  React.useEffect(() => {
    const requestedMode = emailIntent === "reset" && emailToken ? "reset" : searchParams.get("mode") === "register" ? "register" : searchParams.get("mode") === "reset" ? "reset" : "login";
    setMode((current) => (current === requestedMode ? current : requestedMode));
  }, [emailIntent, emailToken, searchParams]);

  React.useEffect(() => {
    if (!emailToken || emailIntent === "reset" || emailLinkStatus === "processing" || emailLinkStatus === "success") return;

    let cancelled = false;
    setEmailLinkStatus("processing");
    setEmailLinkBusy(true);
    void consumeEmailToken({ token: emailToken })
      .then(() => {
        if (cancelled) return;
        setEmailLinkStatus("success");
        const params = new URLSearchParams(searchParams.toString());
        params.delete("email_token");
        params.delete("email_intent");
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        router.push("/dashboard?tab=watch");
      })
      .catch(() => {
        if (!cancelled) setEmailLinkStatus("error");
      })
      .finally(() => {
        if (!cancelled) setEmailLinkBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [consumeEmailToken, emailLinkStatus, emailToken, pathname, router, searchParams]);

  const setModeWithQuery = React.useCallback(
    (nextMode: "login" | "register" | "reset") => {
      setMode(nextMode);
      const params = new URLSearchParams(searchParams.toString());
      if (nextMode === "register") {
        params.set("mode", "register");
      } else if (nextMode === "reset") {
        params.set("mode", "reset");
      } else {
        params.delete("mode");
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  async function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode === "register") {
      if (registrationMissingFields.length > 0) {
        toast.error(`Complete: ${registrationMissingFields.join(", ")}`);
        return;
      }
      if (passwordMismatch) {
        toast.error("Passwords must match");
        return;
      }

      await auth.registerWithEmail({
        email: email.trim(),
        password,
        fullName: fullName.trim() || undefined,
        displayName: displayName.trim() || undefined,
        phoneNumber: phoneNumber.trim() || undefined,
        streetAddress1: streetAddress1.trim() || undefined,
        streetAddress2: streetAddress2.trim() || undefined,
        city: city.trim() || undefined,
        region: region.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
      });
    } else if (mode === "reset") {
      if (!emailToken) {
        await handlePasswordResetRequest();
        return;
      }
      if (resetPasswordMismatch) {
        toast.error("Passwords must match");
        return;
      }

      await resetPasswordWithEmailToken({ token: emailToken, password: resetPassword });
      const params = new URLSearchParams(searchParams.toString());
      params.delete("email_token");
      params.delete("email_intent");
      params.delete("mode");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    } else {
      await auth.signInWithEmail({ email: email.trim(), password });
    }

    router.push("/dashboard?tab=watch");
  }

  async function handleMagicLinkRequest() {
    if (!email.trim()) {
      toast.error("Enter your email first");
      return;
    }

    setEmailLinkBusy(true);
    try {
      await requestMagicLink({ email: email.trim() });
    } finally {
      setEmailLinkBusy(false);
    }
  }

  async function handlePasswordResetRequest() {
    if (!email.trim()) {
      toast.error("Enter your email first");
      return;
    }

    setEmailLinkBusy(true);
    try {
      await requestPasswordReset({ email: email.trim() });
    } finally {
      setEmailLinkBusy(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <Card className="market-panel market-panel-spotlight market-panel-spotlight-blue order-2 xl:order-1">
        <CardHeader>
          <CardTitle>Wallet sign-in</CardTitle>
          <CardDescription>Desktop extension wallets still work, but tablet and mobile users usually need WalletConnect unless they are already inside a wallet browser.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AccentCallout label="Wallet status" tone={walletConnectEnabled ? "blue" : "amber"}>
            WalletConnect is {walletConnectEnabled ? "ready for mobile and tablet scans" : "not configured in the frontend environment yet"}.
          </AccentCallout>
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
          {walletConnectEnabled ? (
            <AccentCallout label="Mobile wallet flow" tone="mint">
              WalletConnect is configured, so tablet and phone users can scan into the wallet flow here instead of relying on desktop-only wallet browsers.
            </AccentCallout>
          ) : (
            <AccentCallout label="Fallback path" tone="amber">
              Mobile and tablet wallet connection still needs a deployed WalletConnect Cloud project ID in the frontend environment. The email sign-in flow below remains the clean fallback until that production setting is present.
            </AccentCallout>
          )}
        </CardContent>
      </Card>

      <Card className="market-panel market-panel-spotlight market-panel-spotlight-amber order-1 xl:order-2 border-slate-300/80 bg-[linear-gradient(180deg,rgba(252,248,239,0.92),rgba(255,255,255,0.98))]">
        <CardHeader>
          <div className="market-section-title">Account access</div>
          <CardTitle>{mode === "login" ? "Email sign-in" : mode === "register" ? "Create your account" : "Reset your password"}</CardTitle>
          <CardDescription>
            {mode === "login"
              ? "Use your marketplace account on phone, tablet, or desktop without relying on wallet browser support."
              : mode === "register"
                ? "Build a standard marketplace account with profile and location details so local inventory, follows, saved ads, and alerts have a real identity behind them."
                : "Recover access to your marketplace account with a one-time reset link, then continue with the same identity, favorites, follows, and alerts."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {emailToken ? (
            <AccentCallout label="Email link status" tone="blue">
              {emailIntent === "reset"
                ? "Create a new password below. This reset link can only be used once and expires quickly for safety."
                : emailLinkStatus === "error"
                  ? `This ${emailIntent === "verify" ? "verification" : "sign-in"} link is invalid, expired, or already used.`
                  : emailLinkBusy
                    ? `Checking your ${emailIntent === "verify" ? "verification" : "sign-in"} link...`
                    : "This email link has been processed."}
            </AccentCallout>
          ) : null}
          <div className="grid grid-cols-3 gap-2">
            <Button type="button" variant={mode === "login" ? "default" : "outline"} onClick={() => setModeWithQuery("login")} disabled={emailDisabled} className="w-full">
              Sign in
            </Button>
            <Button type="button" variant={mode === "register" ? "default" : "outline"} onClick={() => setModeWithQuery("register")} disabled={emailDisabled} className="w-full">
              Create account
            </Button>
            <Button type="button" variant={mode === "reset" ? "default" : "outline"} onClick={() => setModeWithQuery("reset")} disabled={emailDisabled} className="w-full">
              Reset password
            </Button>
          </div>
          {mode === "register" ? (
            <AccentCallout label="Mobile-first account setup" tone="mint">
              This form is mobile-first: start with identity and location, then create the password that keeps your watch activity, follows, and alerts together across devices. Postal code is used to make local discovery and nearby inventory more useful.
            </AccentCallout>
          ) : null}
          {mode === "reset" ? (
            <AccentCallout label="Password reset" tone="amber">
              {emailToken
                ? "Set a new password for this account. After a successful reset, the session will be signed in automatically."
                : "Enter your account email and Seller Block will send a one-time password reset link if the account exists."}
            </AccentCallout>
          ) : null}
          <form className="grid gap-4" onSubmit={(event) => void handleEmailSubmit(event)}>
            {mode === "register" ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full name</Label>
                    <Input id="fullName" autoComplete="name" enterKeyHint="next" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Victor Adeyemi" disabled={emailDisabled} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Display name</Label>
                    <Input id="displayName" autoComplete="nickname" enterKeyHint="next" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Victor's Garage" disabled={emailDisabled} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">Phone number</Label>
                  <Input id="phoneNumber" autoComplete="tel" inputMode="tel" enterKeyHint="next" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+234 800 000 0000" disabled={emailDisabled} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="streetAddress1">Street address</Label>
                  <Input id="streetAddress1" autoComplete="address-line1" enterKeyHint="next" value={streetAddress1} onChange={(e) => setStreetAddress1(e.target.value)} placeholder="123 Market Street" disabled={emailDisabled} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="streetAddress2">Address line 2</Label>
                  <Input id="streetAddress2" autoComplete="address-line2" enterKeyHint="next" value={streetAddress2} onChange={(e) => setStreetAddress2(e.target.value)} placeholder="Suite, unit, or landmark (optional)" disabled={emailDisabled} />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" autoComplete="address-level2" enterKeyHint="next" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lagos" disabled={emailDisabled} />
                  </div>
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="region">Region / State</Label>
                    <Input id="region" autoComplete="address-level1" enterKeyHint="next" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Lagos State" disabled={emailDisabled} />
                  </div>
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="postalCode">Postal code</Label>
                    <Input id="postalCode" autoComplete="postal-code" inputMode="numeric" enterKeyHint="next" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="100001" disabled={emailDisabled} />
                  </div>
                </div>
              </>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" enterKeyHint="next" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={emailDisabled || (mode === "reset" && Boolean(emailToken))} />
            </div>
            {mode !== "reset" ? (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} enterKeyHint={mode === "register" ? "next" : "go"} placeholder={mode === "register" ? "Create a password" : "Enter your password"} value={password} onChange={(e) => setPassword(e.target.value)} disabled={emailDisabled} />
              </div>
            ) : null}
            {mode === "register" ? (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input id="confirmPassword" type="password" autoComplete="new-password" enterKeyHint="go" placeholder="Confirm your password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={emailDisabled} />
              </div>
            ) : null}
            {mode === "reset" && emailToken ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="resetPassword">New password</Label>
                  <Input id="resetPassword" type="password" autoComplete="new-password" enterKeyHint="next" placeholder="Create a new password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} disabled={emailDisabled} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="resetConfirmPassword">Confirm new password</Label>
                  <Input id="resetConfirmPassword" type="password" autoComplete="new-password" enterKeyHint="go" placeholder="Confirm your new password" value={resetConfirmPassword} onChange={(e) => setResetConfirmPassword(e.target.value)} disabled={emailDisabled} />
                </div>
              </>
            ) : null}
            {mode === "register" ? (
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 text-sm text-slate-700">
                {passwordMismatch
                  ? "Passwords do not match yet."
                  : registrationMissingFields.length > 0
                    ? `Complete these fields before creating the account: ${registrationMissingFields.join(", ")}.`
                    : "Your profile and location details are ready to create the account."}
              </div>
            ) : null}
            {mode === "reset" && emailToken ? (
              <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 text-sm text-slate-700">
                {resetPasswordMismatch
                  ? "Passwords do not match yet."
                  : resetPassword.trim().length < 8
                    ? "Your new password must be at least 8 characters."
                    : "This password is ready to be applied to the account."}
              </div>
            ) : null}
            <Button
              type="submit"
              disabled={
                emailDisabled ||
                (!email.trim() && !(mode === "reset" && Boolean(emailToken))) ||
                (mode === "login" && password.trim().length < 8) ||
                (mode === "register" && !registrationReady) ||
                (mode === "reset" && emailToken.length > 0 && !resetReady)
              }
            >
              {mode === "login" ? "Sign in with email" : mode === "register" ? "Create email account" : emailToken ? "Update password" : "Email me a reset link"}
            </Button>
            {mode === "login" ? (
              <Button type="button" variant="outline" disabled={emailDisabled || emailLinkBusy || !email.trim()} onClick={() => void handleMagicLinkRequest()}>
                {emailLinkBusy ? "Sending link..." : "Email me a sign-in link"}
              </Button>
            ) : null}
            {mode === "reset" && !emailToken ? (
              <Button type="button" variant="outline" disabled={emailDisabled || emailLinkBusy || !email.trim()} onClick={() => void handlePasswordResetRequest()}>
                {emailLinkBusy ? "Sending link..." : "Send password reset email"}
              </Button>
            ) : null}
          </form>

          <div className="space-y-2 text-sm text-slate-700">
            <div>Email accounts now create a real backend session and keep homepage favorites, followed-seller ordering, alerts, and watch activity tied to that account.</div>
            <div>Magic-link access is available for passwordless sign-in on phone, tablet, or desktop when email delivery is configured.</div>
            <div>Wallet settlement and on-chain seller actions still require a connected wallet. This page keeps both identity paths available side by side.</div>
            <div>Profile editing, local discovery, and account tabs now use the same identity model instead of a separate onboarding placeholder.</div>
          </div>

          {auth.isAuthenticated ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-slate-700">
              Signed in as {auth.user?.displayName?.trim() || auth.user?.email?.trim() || auth.address}.
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            {auth.isAuthenticated ? (
              <Button asChild>
                <Link href="/dashboard?tab=watch">Continue to watch</Link>
              </Button>
            ) : null}
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