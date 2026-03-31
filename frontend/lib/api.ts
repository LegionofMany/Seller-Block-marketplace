import { getEnv } from "./env";
import { getStoredAuthToken } from "./auth";

export type ApiError = {
  message: string;
  status?: number;
};

function baseUrl() {
  const env = getEnv();
  return (env.backendUrl ?? "http://localhost:4000").replace(/\/$/, "");
}

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
