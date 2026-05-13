import { getEnv } from "./env";
import { getStoredAuthToken } from "./auth";
import { toast } from "sonner";

export type ApiError = {
  message: string;
  status?: number;
};

function baseUrl() {
  const env = getEnv();
  return (env.backendUrl ?? "http://localhost:4000").replace(/\/$/, "");
}

/** Tracks whether a 429 toast is already showing so we don't spam it. */
let rateLimitToastActive = false;

export async function fetchJson<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const url = `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;

  const controller = new AbortController();
  const timeoutMs = init?.timeoutMs ?? 7_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = new Headers(init?.headers ?? {});
    headers.set("Accept", "application/json");

    const token = getStoredAuthToken();
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const res = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });

    // ── 429 Rate-limit feedback ──────────────────────────────────────────
    if (res.status === 429 && !rateLimitToastActive) {
      rateLimitToastActive = true;
      const retryAfter = res.headers.get("Retry-After");
      const seconds = retryAfter ? Number(retryAfter) : null;
      toast.warning(
        seconds
          ? `Too many requests — please wait ${seconds}s before trying again.`
          : "Too many requests — please wait a moment before trying again.",
        {
          id: "rate-limit",
          duration: 5_000,
          onDismiss: () => { rateLimitToastActive = false; },
          onAutoClose: () => { rateLimitToastActive = false; },
        }
      );
    }

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    if (!res.ok) {
      const message = data?.error?.message ?? `Request failed (${res.status})`;
      const err: ApiError = { message, status: res.status };
      throw err;
    }

    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}
