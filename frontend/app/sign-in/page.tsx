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

type RegisterStep = "account" | "contact";
type RegisterFlowStage = RegisterStep | "verify" | "complete";

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
          <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 text-sm text-slate-700">
            {passwordMismatch
              ? "Passwords do not match yet."
              : accountStepMissingFields.length > 0
                ? `Complete these fields before continuing: ${accountStepMissingFields.join(", ")}.`
                : password.trim().length < 8
                  ? "Choose a password with at least 8 characters."
                  : "Your account basics are ready. Continue to contact details."}
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
          <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 text-sm text-slate-700">
            {contactStepMissingFields.length > 0
              ? `Complete these fields before creating the account: ${contactStepMissingFields.join(", ")}.`
              : "Your contact details are ready. Seller Block can create the account and send verification next."}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => setRegisterStep("account")} disabled={emailDisabled}>
              Back to account details
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

      <Card className="market-panel market-panel-spotlight market-panel-spotlight-amber order-1 xl:order-2 border-slate-300/80 bg-[linear-gradient(180deg,rgba(252,248,239,0.92),rgba(255,255,255,0.98))]">
        <CardHeader>
          <div className="market-section-title">Account access</div>
          <CardTitle>{mode === "login" ? "Sign in to your account" : mode === "register" ? "Create your marketplace account" : "Reset your password"}</CardTitle>
          <CardDescription>
            {mode === "login"
              ? "Use the same marketplace account on phone, tablet, or desktop without relying on a wallet browser."
              : mode === "register"
                ? "Create the account in clear steps: account basics, contact info, verification, and then profile completion in the dashboard."
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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button type="button" variant={mode === "login" ? "default" : "outline"} onClick={() => setModeWithQuery("login")} disabled={emailDisabled} className="h-auto min-h-11 w-full whitespace-normal px-3 py-2 text-center leading-5">
              Sign in
            </Button>
            <Button type="button" variant={mode === "register" ? "default" : "outline"} onClick={() => setModeWithQuery("register")} disabled={emailDisabled} className="h-auto min-h-11 w-full whitespace-normal px-3 py-2 text-center leading-5">
              Create account
            </Button>
            <Button type="button" variant={mode === "reset" ? "default" : "outline"} onClick={() => setModeWithQuery("reset")} disabled={emailDisabled} className="h-auto min-h-11 w-full whitespace-normal px-3 py-2 text-center leading-5">
              Reset password
            </Button>
          </div>
          {mode === "reset" ? (
            <AccentCallout label="Password reset" tone="amber">
              {emailToken
                ? "Set a new password for this account. After a successful reset, the session will be signed in automatically."
                : "Enter your account email and Seller Block will send a one-time password reset link if the account exists."}
            </AccentCallout>
          ) : null}
          {mode === "register" ? (
            <div className="grid gap-4">
              <div className="grid gap-2 sm:grid-cols-4">
                {REGISTER_STEPS.map((step, index) => {
                  const isActive = registerStep === step.key;
                  const isDone = registerStepIndex > index;
                  return (
                    <div key={step.key} className={`rounded-2xl border px-3 py-3 text-center ${isActive ? "border-amber-300 bg-amber-50/80" : isDone ? "border-emerald-300 bg-emerald-50/75" : "border-slate-200/80 bg-white/75"}`}>
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Step {index + 1}</div>
                      <div className="mt-1 text-sm font-semibold text-slate-950">{step.label}</div>
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

          <div className="space-y-2 text-sm text-slate-700">
            <div>Marketplace accounts keep favorites, followed sellers, alerts, and saved activity tied to one identity across devices.</div>
            <div>Magic-link access is available for passwordless sign-in on phone, tablet, or desktop when email delivery is configured.</div>
            <div>Seller wallets are now a later account step inside Profile, only when you need listing or settlement actions.</div>
            <div>Profile editing and local discovery now use one consistent account model instead of a separate onboarding placeholder.</div>
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