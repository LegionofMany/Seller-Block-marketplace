import { getEnv } from "./env";

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
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
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
