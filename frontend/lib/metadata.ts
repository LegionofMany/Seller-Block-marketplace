"use client";

import * as React from "react";

import { fetchJson, type ApiError } from "@/lib/api";
import { ipfsToHttp, isIpfsUri } from "@/lib/ipfs";

export type MarketplaceMetadata = {
  id: string;
  uri?: string;
  title: string;
  description: string;
  image: string;
  images?: string[];
  category?: string;
  subcategory?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  contactEmail?: string;
  contactPhone?: string;
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

function normalizeForRender(md: MarketplaceMetadata): MarketplaceMetadata {
  const image = md.image ? ipfsToHttp(md.image) : md.image;
  const images = Array.isArray(md.images) ? md.images.map((u) => ipfsToHttp(u)) : md.images;
  return { ...md, image, ...(images ? { images } : {}) };
}

export async function fetchMetadataById(id: string): Promise<MarketplaceMetadata | null> {
  const clean = (id ?? "").trim().toLowerCase();
  const existing = cache.get(clean);
  if (existing) return existing;

  const pending = inflight.get(clean);
  if (pending) return pending;

  const promise = fetchJson<MarketplaceMetadata>(`/metadata/${clean}`, { timeoutMs: 5_000 })
    .then((data) => {
      const normalized = normalizeForRender(data);
      cache.set(clean, normalized);
      return normalized;
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

export async function fetchMetadataByUri(uri: string): Promise<MarketplaceMetadata | null> {
  const clean = (uri ?? "").trim();
  if (!clean) return null;

  const existing = cache.get(clean);
  if (existing) return existing;

  const pending = inflight.get(clean);
  if (pending) return pending;

  const promise = fetchJson<MarketplaceMetadata>(`/metadata/lookup?uri=${encodeURIComponent(clean)}`, {
    timeoutMs: 5_000,
  })
    .then((data) => {
      const normalized = normalizeForRender(data);
      cache.set(clean, normalized);
      if (normalized.id) cache.set(String(normalized.id).toLowerCase(), normalized);
      return normalized;
    })
    .catch((err: unknown) => {
      const status = (err as ApiError | undefined)?.status;
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
      if (!metadataURI) {
        setMetadata(null);
        setIsLoading(false);
        return;
      }

      const cacheKey = metadataId ?? metadataURI;
      const existing = cache.get(cacheKey);
      if (existing) {
        setMetadata(existing);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const data = metadataId ? await fetchMetadataById(metadataId) : await fetchMetadataByUri(metadataURI);
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
  }, [metadataId, metadataURI]);

  return { metadataId, metadata, isLoading };
}
