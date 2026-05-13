"use client";

import * as React from "react";

const DISMISS_KEY = "zonycs_pwa_install_dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * PWAInstallBanner — listens for the browser's beforeinstallprompt event and
 * shows a subtle bottom bar on mobile prompting the user to add Zonycs to their
 * home screen. Dismissal is persisted so the banner doesn't reappear.
 */
export function PWAInstallBanner() {
  const [promptEvent, setPromptEvent] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    // Don't show if already dismissed or already installed
    if (typeof window === "undefined") return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    function handleBeforeInstall(e: Event) {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted") {
      localStorage.setItem(DISMISS_KEY, "1");
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="banner"
      aria-label="Add Zonycs to your home screen"
      className="fixed bottom-0 inset-x-0 z-[9000] flex items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 shadow-lg sm:hidden"
    >
      {/* App identity */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white font-black text-base">
          Z
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight text-foreground">Add Zonycs to Home Screen</p>
          <p className="text-xs text-muted-foreground">Browse listings offline, faster.</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <button
          type="button"
          onClick={install}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-700"
        >
          Install
        </button>
      </div>
    </div>
  );
}
