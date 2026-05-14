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
import { useInjectedWalletAvailability } from "@/lib/injectedWallet";
import { getWalletConnectAvailability } from "@/lib/walletConnect";

type RegisterStep = "account" | "contact" | "verify" | "complete";
type RegisterFlowStage = RegisterStep;

const REGISTER_STEPS: Array<{ key: RegisterFlowStage; label: string; summary: string }> = [
  { key: "account", label: "Account details", summary: "Name, email, and password" },
  { key: "contact", label: "Contact info", summary: "Phone and local address" },
  { key: "verify", label: "Verification", summary: "Confirm the email account" },
  { key: "complete", label: "Profile completion", summary: "Finish the public seller profile" },
];

export default function SignInPage() {
  const auth = useAuth();
  const { consumeEmailToken, requestMagicLink, requestPasswordReset, resetPasswordWithEmailToken } = auth;
  const { address } = useAccount();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const env = getEnv();
  const walletConnectAvailability = getWalletConnectAvailability(env.walletConnectProjectId);
  const walletConnectEnabled = walletConnectAvailability === "enabled";
  const { checked: injectedWalletChecked, hasInjectedWallet } = useInjectedWalletAvailability();
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
  const [registerStep, setRegisterStep] = React.useState<RegisterStep>("account");
  const [emailLinkBusy, setEmailLinkBusy] = React.useState(false);
  const [emailLinkStatus, setEmailLinkStatus] = React.useState<"idle" | "processing" | "success" | "error">("idle");
  const emailToken = searchParams.get("email_token")?.trim() ?? "";
  const rawEmailIntent = searchParams.get("email_intent")?.trim() ?? "login";
  const emailIntent = rawEmailIntent === "verify" || rawEmailIntent === "reset" ? rawEmailIntent : "login";

  const emailDisabled = auth.isLoading;
  const accountStepMissingFields = [
    !fullName.trim() ? "full name" : null,
    !displayName.trim() ? "display name" : null,
    !email.trim() ? "email" : null,
  ].filter(Boolean) as string[];
  const contactStepMissingFields = [
    !fullName.trim() ? "full name" : null,
    !phoneNumber.trim() ? "phone number" : null,
    !streetAddress1.trim() ? "street address" : null,
    !city.trim() ? "city" : null,
    !region.trim() ? "region/state" : null,
    !postalCode.trim() ? "postal code" : null,
  ].filter(Boolean) as string[];
  const passwordMismatch = mode === "register" && confirmPassword.length > 0 && password !== confirmPassword;
  const accountStepReady = accountStepMissingFields.length === 0 && password.trim().length >= 8 && confirmPassword.trim().length > 0 && !passwordMismatch;
  const contactStepReady = contactStepMissingFields.length === 0;
  const resetPasswordMismatch = resetConfirmPassword.length > 0 && resetPassword !== resetConfirmPassword;
  const resetReady = emailToken.length > 0 && resetPassword.trim().length >= 8 && resetPassword === resetConfirmPassword;
  const registerStepIndex = REGISTER_STEPS.findIndex((step) => step.key === registerStep);

  React.useEffect(() => {
    const requestedMode = emailIntent === "reset" && emailToken ? "reset" : searchParams.get("mode") === "register" ? "register" : searchParams.get("mode") === "reset" ? "reset" : "login";
    setMode((current) => (current === requestedMode ? current : requestedMode));
  }, [emailIntent, emailToken, searchParams]);

  React.useEffect(() => {
    if (mode !== "register") {
      setRegisterStep("account");
    }
  }, [mode]);

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
        router.push(emailIntent === "verify" ? "/account-created?verified=1" : "/dashboard?tab=watch");
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
  }, [consumeEmailToken, emailLinkStatus, emailToken, emailIntent, pathname, router, searchParams]);

  const setModeWithQuery = React.useCallback(
    (nextMode: "login" | "register" | "reset") => {
      setMode(nextMode);
      if (nextMode === "register") {
        setRegisterStep("account");
      }
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
      if (registerStep === "account") {
        if (accountStepMissingFields.length > 0) {
          toast.error(`Complete: ${accountStepMissingFields.join(", ")}`);
          return;
        }
        if (password.trim().length < 8) {
          toast.error("Password must be at least 8 characters");
          return;
        }
        if (passwordMismatch || confirmPassword.trim().length === 0) {
          toast.error("Passwords must match");
          return;
        }
        setRegisterStep("contact");
        return;
      }

      if (registerStep === "contact") {
        if (contactStepMissingFields.length > 0) {
          toast.error(`Complete: ${contactStepMissingFields.join(", ")}`);
          return;
        }

        const result = await auth.registerWithEmail({
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
        setRegisterStep("verify");
        const nextParams = new URLSearchParams();
        nextParams.set("email", email.trim());
        nextParams.set("email_sent", result.emailVerificationSent ? "1" : "0");
        router.push(`/account-created?${nextParams.toString()}`);
      }
      return;
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

  function renderRegisterStepContent() {
    if (registerStep === "account") {
      return (
        <>
          <AccentCallout label="Step 1 of 4" tone="mint">
            Start with the basics buyers and marketplace staff expect to see on a normal account: your name, account email, and password.
          </AccentCallout>
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
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" enterKeyHint="next" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={emailDisabled} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="new-password" enterKeyHint="next" placeholder="Create a password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={emailDisabled} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input id="confirmPassword" type="password" autoComplete="new-password" enterKeyHint="go" placeholder="Confirm your password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={emailDisabled} />
          </div>
          <div className={`rounded-xl border px-4 py-3 text-sm ${
            passwordMismatch
              ? "border-red-200 bg-red-50/80 text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300"
              : accountStepReady
                ? "border-emerald-200 bg-emerald-50/80 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-slate-200/80 bg-white/70 text-slate-600 dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-400"
          }`}>
            {passwordMismatch
              ? "Passwords do not match yet."
              : accountStepMissingFields.length > 0
                ? `Complete these fields to continue: ${accountStepMissingFields.join(", ")}.`
                : password.trim().length < 8
                  ? "Choose a password with at least 8 characters."
                  : "Account basics are ready — continue to contact details."}
          </div>
        </>
      );
    }

    if (registerStep === "contact") {
      return (
        <>
          <AccentCallout label="Step 2 of 4" tone="blue">
            Add the contact details that make the account feel like a real marketplace profile and improve local discovery.
          </AccentCallout>
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
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" autoComplete="address-level2" enterKeyHint="next" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lagos" disabled={emailDisabled} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="region">Region / State</Label>
              <Input id="region" autoComplete="address-level1" enterKeyHint="next" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Lagos State" disabled={emailDisabled} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postalCode">Postal code</Label>
              <Input id="postalCode" autoComplete="postal-code" inputMode="numeric" enterKeyHint="go" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="100001" disabled={emailDisabled} />
            </div>
          </div>
          <div className={`rounded-xl border px-4 py-3 text-sm ${
            contactStepReady
              ? "border-emerald-200 bg-emerald-50/80 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-slate-200/80 bg-white/70 text-slate-600 dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-400"
          }`}>
            {contactStepMissingFields.length > 0
              ? `Complete these fields to continue: ${contactStepMissingFields.join(", ")}.`
              : "Contact details are ready — Zonycs will create the account and send verification next."}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => setRegisterStep("account")} disabled={emailDisabled}>
              Back to account details
            </Button>
          </div>
        </>
      );
    }

    if (registerStep === "verify") {
      return (
        <>
          <AccentCallout label="Step 3 of 4" tone="mint">
            A verification email has been sent to {email.trim() || "your email address"}. Open it and click the link to confirm your account before continuing.
          </AccentCallout>

          <div className="rounded-xl border border-slate-200/80 dark:border-slate-700/50 bg-white/70 dark:bg-slate-800/50 px-4 py-4 space-y-3">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              What to do next
            </div>
            <ol className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-xs font-bold text-blue-700 dark:text-blue-300">1</span>
                Check your inbox for an email from Zonycs.
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-xs font-bold text-blue-700 dark:text-blue-300">2</span>
                Click the verification link inside the email.
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-xs font-bold text-blue-700 dark:text-blue-300">3</span>
                Return here and sign in to complete your profile.
              </li>
            </ol>
          </div>

          <AccentCallout label="No email received?" tone="amber">
            Check your spam or junk folder. If you still cannot find it, go back and confirm your email address is correct, then try registering again.
          </AccentCallout>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModeWithQuery("login")}
              disabled={emailDisabled}
            >
              Go to sign in
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRegisterStep("contact")}
              disabled={emailDisabled}
            >
              Back to contact details
            </Button>
          </div>
        </>
      );
    }

    if (registerStep === "complete") {
      return (
        <>
          <AccentCallout label="Step 4 of 4" tone="mint">
            Your account is verified. Sign in and head to your dashboard to finish setting up your public seller profile — add a bio, avatar, and connect a wallet if you plan to list items for sale.
          </AccentCallout>

          <div className="rounded-xl border border-slate-200/80 dark:border-slate-700/50 bg-white/70 dark:bg-slate-800/50 px-4 py-4 space-y-3">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Complete your profile
            </div>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-emerald-500 dark:text-emerald-400 shrink-0">✓</span>
                Add a profile photo and bio so buyers can trust your listings.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-emerald-500 dark:text-emerald-400 shrink-0">✓</span>
                Connect a wallet from your dashboard to post blockchain-backed listings.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-emerald-500 dark:text-emerald-400 shrink-0">✓</span>
                Set up saved searches and notification preferences.
              </li>
            </ul>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => setModeWithQuery("login")}
              disabled={emailDisabled}
            >
              Sign in to complete profile
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setModeWithQuery("login")}
              disabled={emailDisabled}
            >
              Go to sign in
            </Button>
          </div>
        </>
      );
    }

    return null;
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
          <div className="market-section-title">Consumer setup</div>
          <CardTitle>How account setup works</CardTitle>
          <CardDescription>Seller Block now starts like a normal marketplace account: create the account first, verify it, finish your profile, then connect a seller wallet later if you need seller-side actions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            {REGISTER_STEPS.map((step, index) => {
              const isActive = mode === "register" && registerStep === step.key;
              const isDone = mode === "register" ? registerStepIndex > index : false;
              return (
                <div key={step.key} className={`rounded-2xl border px-4 py-3 ${isActive ? "border-blue-300 bg-blue-50/80" : isDone ? "border-emerald-300 bg-emerald-50/75" : "border-slate-200/80 bg-white/80"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-950">{index + 1}. {step.label}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{step.summary}</div>
                    </div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{isDone ? "Done" : isActive ? "Current" : "Next"}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <AccentCallout label="Wallets come later" tone="mint">
            New accounts should start with email, contact, and profile details. Seller wallets are still supported, but they are now a later profile step instead of the primary entry point.
          </AccentCallout>

          <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-950">Existing wallet-only access</div>
              <div className="mt-1 text-sm text-muted-foreground">If you already use a wallet-based account, you can still sign in here. New marketplace accounts should use the account flow first.</div>
            </div>
            <AccentCallout label="Wallet status" tone={walletConnectEnabled ? "blue" : "amber"}>
              WalletConnect is {walletConnectAvailability === "enabled"
                ? "ready for mobile and tablet scans"
                : walletConnectAvailability === "preview-disabled"
                  ? "disabled on this preview deployment until the Reown allowlist includes this host"
                  : "not configured in this frontend environment yet"}.
            </AccentCallout>
            <div className="flex flex-wrap gap-3">
              <ConnectButton showBalance={false} chainStatus="icon" />
              <div className="text-[12px] text-muted-foreground">Click &quot;Connect&quot; to open wallet options. Scan with WalletConnect on mobile or install a browser extension (MetaMask, Rabby) for one-click connect.</div>
              {address && !auth.isAuthenticated ? (
                <Button type="button" variant="outline" onClick={() => void auth.signIn()} disabled={auth.isLoading}>
                  Use wallet-only sign-in
                </Button>
              ) : null}
            </div>
            {injectedWalletChecked && !hasInjectedWallet ? (
              <AccentCallout label="No browser wallet detected" tone="amber">
                This device does not appear to have an injected wallet extension yet. Install MetaMask or Rabby for one-click browser connect, or use WalletConnect to scan from a mobile wallet.
              </AccentCallout>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="market-panel market-panel-spotlight market-panel-spotlight-amber order-1 xl:order-2 border-amber-200/60 dark:border-slate-700/50 bg-gradient-to-b from-amber-50/80 to-white/95 dark:from-slate-900/90 dark:to-slate-900/95">
        <CardHeader className="pb-4">
          {/* Branded identity bar */}
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-sm font-black text-white shadow-sm">Z</div>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Zonycs Account</span>
          </div>
          <CardTitle className="text-xl font-bold leading-tight">
            {mode === "login" ? "Welcome back" : mode === "register" ? "Create your account" : "Reset your password"}
          </CardTitle>
          <CardDescription className="mt-1 text-sm leading-relaxed">
            {mode === "login"
              ? "Sign in to access your listings, saved ads, and activity across all devices."
              : mode === "register"
                ? "Set up your marketplace account in a few quick steps — no wallet required to start."
                : "Recover access using a one-time reset link. Your favourites, follows, and history stay intact."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
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

          {/* Mode switcher — segmented pill tabs */}
          <div className="flex rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-slate-100/70 dark:bg-slate-800/50 p-1 gap-0.5">
            <button
              type="button"
              onClick={() => setModeWithQuery("login")}
              disabled={emailDisabled}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold transition-all duration-150 ${
                mode === "login"
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5 6s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1H3Z"/>
              </svg>
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setModeWithQuery("register")}
              disabled={emailDisabled}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold transition-all duration-150 ${
                mode === "register"
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M1 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm6.146-2.854a.5.5 0 0 1 .708 0L14 6.293l1.146-1.147a.5.5 0 0 1 .708.708L14.707 7l1.147 1.146a.5.5 0 0 1-.708.708L14 7.707l-1.146 1.147a.5.5 0 0 1-.708-.708L13.293 7l-1.147-1.146a.5.5 0 0 1 0-.708z"/>
              </svg>
              Register
            </button>
            <button
              type="button"
              onClick={() => setModeWithQuery("reset")}
              disabled={emailDisabled}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold transition-all duration-150 ${
                mode === "reset"
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2Zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/>
              </svg>
              Reset
            </button>
          </div>
          {mode === "reset" ? (
            <AccentCallout label="Password reset" tone="amber">
              {emailToken
                ? "Set a new password below. After a successful reset you will be signed in automatically."
                : "Enter your email and we will send a one-time reset link if the account exists."}
            </AccentCallout>
          ) : null}
          {mode === "register" ? (
            <div className="grid gap-4">
              <div className="grid gap-2 sm:grid-cols-4">
                {REGISTER_STEPS.map((step, index) => {
                  const isActive = registerStep === step.key;
                  const isDone = registerStepIndex > index;
                  return (
                    <div key={step.key} className={`relative rounded-xl border px-3 py-3 text-center transition-colors ${
                      isActive
                        ? "border-amber-300 bg-amber-50/90 dark:border-amber-700/50 dark:bg-amber-950/30"
                        : isDone
                          ? "border-emerald-300 bg-emerald-50/75 dark:border-emerald-700/40 dark:bg-emerald-950/20"
                          : "border-slate-200/80 bg-white/60 dark:border-slate-700/50 dark:bg-slate-800/30"
                    }`}>
                      {isDone ? (
                        <div className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                          <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="currentColor"><path d="M8.5 2.5 4 7 1.5 4.5"/></svg>
                        </div>
                      ) : null}
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{isDone ? "Done" : `Step ${index + 1}`}</div>
                      <div className="mt-1 text-sm font-semibold text-slate-950 dark:text-slate-100">{step.label}</div>
                    </div>
                  );
                })}
              </div>
              {(registerStep === "account" || registerStep === "contact") ? (
                <form className="grid gap-4" onSubmit={(event) => void handleEmailSubmit(event)}>
                  {renderRegisterStepContent()}
                  <Button type="submit" disabled={emailDisabled || (registerStep === "account" ? !accountStepReady : !contactStepReady)}>
                    {registerStep === "account" ? "Continue to contact info" : "Create account and send verification"}
                  </Button>
                </form>
              ) : (
                renderRegisterStepContent()
              )}
            </div>
          ) : (
            <form className="grid gap-4" onSubmit={(event) => void handleEmailSubmit(event)}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" enterKeyHint="next" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={emailDisabled || (mode === "reset" && Boolean(emailToken))} />
              </div>
              {mode !== "reset" ? (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" autoComplete="current-password" enterKeyHint="go" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={emailDisabled} />
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
              {mode === "reset" && emailToken ? (
                <div className={`rounded-xl border px-4 py-3 text-sm ${
                  resetPasswordMismatch
                    ? "border-red-200 bg-red-50/80 text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300"
                    : resetPassword.trim().length >= 8 && !resetPasswordMismatch
                      ? "border-emerald-200 bg-emerald-50/80 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-slate-200/80 bg-white/70 text-slate-600 dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-400"
                }`}>
                  {resetPasswordMismatch
                    ? "Passwords do not match yet."
                    : resetPassword.trim().length < 8
                      ? "Your new password must be at least 8 characters."
                      : "Password looks good — ready to apply."}
                </div>
              ) : null}
              <Button
                type="submit"
                disabled={
                  emailDisabled ||
                  (!email.trim() && !(mode === "reset" && Boolean(emailToken))) ||
                  (mode === "login" && password.trim().length < 8) ||
                  (mode === "reset" && emailToken.length > 0 && !resetReady)
                }
              >
                {mode === "login" ? "Sign in with email" : emailToken ? "Update password" : "Email me a reset link"}
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
          )}

          {/* Compact feature callout */}
          <div className="rounded-xl border border-slate-200/70 dark:border-slate-700/50 bg-white/60 dark:bg-slate-800/40 px-4 py-3 space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">What you get</div>
            <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-emerald-500 dark:text-emerald-400 shrink-0">✓</span>
                Favourites, follows, and alerts synced across all your devices
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-emerald-500 dark:text-emerald-400 shrink-0">✓</span>
                Magic-link sign-in — no password needed when email is configured
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-emerald-500 dark:text-emerald-400 shrink-0">✓</span>
                Connect a seller wallet later in Profile — only needed for listings
              </li>
            </ul>
          </div>

          {auth.isAuthenticated ? (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Signed in</div>
                <div className="truncate text-xs text-emerald-700 dark:text-emerald-400">
                  {auth.user?.displayName?.trim() || auth.user?.email?.trim() || auth.address}
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2.5">
            {auth.isAuthenticated ? (
              <Button asChild>
                <Link href="/dashboard?tab=watch">Go to dashboard</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href="/marketplace">Browse marketplace</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}