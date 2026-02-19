"use client";

import * as React from "react";

import { fetchJson, type ApiError } from "@/lib/api";

export type MarketplaceMetadata = {
  id: string;
  title: string;
  description: string;
  image: string;
  attributes?: unknown;
  createdAt?: number;
};

const cache = new Map<string, MarketplaceMetadata>();
const inflight = new Map<string, Promise<MarketplaceMetadata | null>>();

export function metadataIdFromUri(uri: string): string | null {
  const trimmed = (uri ?? "").trim();
  const m = /^metadata:\/\/sha256\/([0-9a-fA-F]{64})$/.exec(trimmed);
  return m ? m[1].toLowerCase() : null;
}

export async function fetchMetadataById(id: string): Promise<MarketplaceMetadata | null> {
  const clean = (id ?? "").trim().toLowerCase();
  const existing = cache.get(clean);
  if (existing) return existing;

  const pending = inflight.get(clean);
  if (pending) return pending;

  const promise = fetchJson<MarketplaceMetadata>(`/metadata/${clean}`, { timeoutMs: 5_000 })
    .then((data) => {
      cache.set(clean, data);
      return data;
    })
    .catch((err: unknown) => {
      const status = (err as ApiError | undefined)?.status;
      // Older listings may reference metadata IDs that were never uploaded to the backend.
      // Treat that as a cacheable "missing" result instead of a hard error.
      if (status === 404) return null;
      throw err;
    })
    .finally(() => {
      inflight.delete(clean);
    });

  inflight.set(clean, promise);
  return promise;
}

export function useMarketplaceMetadata(metadataURI: string | null | undefined) {
  const metadataId = React.useMemo(() => {
    if (!metadataURI) return null;
    return metadataIdFromUri(metadataURI);
  }, [metadataURI]);

  const [metadata, setMetadata] = React.useState<MarketplaceMetadata | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!metadataId) {
        setMetadata(null);
        setIsLoading(false);
        return;
      }

      const existing = cache.get(metadataId);
      if (existing) {
        setMetadata(existing);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const data = await fetchMetadataById(metadataId);
        if (!cancelled) setMetadata(data);
      } catch {
        if (!cancelled) setMetadata(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [metadataId]);

  return { metadataId, metadata, isLoading };
}
