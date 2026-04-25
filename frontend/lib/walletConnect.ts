export type WalletConnectAvailability = "enabled" | "preview-disabled" | "unconfigured";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function getCanonicalHostname() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!siteUrl) return undefined;

  try {
    return new URL(siteUrl).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

export function getWalletConnectAvailability(projectId?: string): WalletConnectAvailability {
  if (!projectId) return "unconfigured";
  if (typeof window === "undefined") return "enabled";

  const hostname = window.location.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(hostname) || hostname.endsWith(".local")) {
    return "enabled";
  }

  const canonicalHostname = getCanonicalHostname();
  if (canonicalHostname && hostname === canonicalHostname) {
    return "enabled";
  }

  if (hostname.endsWith(".vercel.app")) {
    // Allow opt-in enabling of WalletConnect on Vercel preview deployments.
    // This must be used in conjunction with adding the preview origin to
    // your WalletConnect project's allowed origins (Reown allowlist).
    const allowPreviews = process.env.NEXT_PUBLIC_WALLETCONNECT_ALLOW_PREVIEWS === "true";
    return allowPreviews ? "enabled" : "preview-disabled";
  }

  return "enabled";
}