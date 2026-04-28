"use client";

import * as React from "react";

import { fetchJson, type ApiError } from "@/lib/api";
import { ipfsToHttp } from "@/lib/ipfs";

export const LISTING_FALLBACK_IMAGE = "/listing-fallback.svg";

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

export type MetadataAttribute = {
  trait_type: string;
  value: string | number | boolean;
};

const cache = new Map<string, MarketplaceMetadata>();
const inflight = new Map<string, Promise<MarketplaceMetadata | null>>();
const missingCache = new Map<string, number>();

const MISSING_CACHE_TTL_MS = 15 * 60 * 1_000;

function isKnownMissing(key: string | null | undefined): boolean {
  const normalized = (key ?? "").trim();
  if (!normalized) return false;

  const expiresAt = missingCache.get(normalized);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    missingCache.delete(normalized);
    return false;
  }

  return true;
}

function markMissing(...keys: Array<string | null | undefined>) {
  const expiresAt = Date.now() + MISSING_CACHE_TTL_MS;
  for (const key of keys) {
    const normalized = (key ?? "").trim();
    if (!normalized) continue;
    missingCache.set(normalized, expiresAt);
  }
}

function clearMissing(...keys: Array<string | null | undefined>) {
  for (const key of keys) {
    const normalized = (key ?? "").trim();
    if (!normalized) continue;
    missingCache.delete(normalized);
  }
}

export function isSmokeMetadataUri(uri: string | null | undefined): boolean {
  return (uri ?? "").trim().toLowerCase().startsWith("ipfs://seller-block/smoke-");
}

function isExternalPlaceholderImage(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === "via.placeholder.com" || parsed.hostname === "placehold.co";
  } catch {
    return false;
  }
}

export function getRenderableListingImage(image: string | null | undefined): string {
  const normalized = image ? ipfsToHttp(image).trim() : "";
  if (!normalized || isExternalPlaceholderImage(normalized)) return LISTING_FALLBACK_IMAGE;
  return normalized;
}

export function hasCompleteMarketplaceMetadata(metadata: MarketplaceMetadata | null | undefined): boolean {
  if (!metadata) return false;
  const title = metadata.title?.trim();
  const description = metadata.description?.trim();
  return Boolean(title && description);
}

export function getMetadataAttributes(metadata: MarketplaceMetadata | null | undefined): MetadataAttribute[] {
  if (!metadata?.attributes || !Array.isArray(metadata.attributes)) return [];

  return metadata.attributes.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as { trait_type?: unknown; value?: unknown };
    if (typeof candidate.trait_type !== "string") return [];
    if (!["string", "number", "boolean"].includes(typeof candidate.value)) return [];
    return [{ trait_type: candidate.trait_type, value: candidate.value as string | number | boolean }];
  });
}

export function getMetadataAttributeValue(metadata: MarketplaceMetadata | null | undefined, traitType: string): string | null {
  const match = getMetadataAttributes(metadata).find((item) => item.trait_type === traitType);
  if (!match) return null;
  return String(match.value).trim() || null;
}

export function isJobMetadata(metadata: MarketplaceMetadata | null | undefined): boolean {
  return metadata?.category === "Jobs" || getMetadataAttributeValue(metadata, "listingKind") === "job";
}

export function metadataIdFromUri(uri: string): string | null {
  const trimmed = (uri ?? "").trim();
  const m = /^metadata:\/\/sha256\/([0-9a-fA-F]{64})$/.exec(trimmed);
  return m ? m[1].toLowerCase() : null;
}

function normalizeForRender(md: MarketplaceMetadata): MarketplaceMetadata {
  const image = getRenderableListingImage(md.image);
  const images = Array.isArray(md.images) ? md.images.map((u) => getRenderableListingImage(u)) : md.images;
  return { ...md, image, ...(images ? { images } : {}) };
}

export async function fetchMetadataById(id: string): Promise<MarketplaceMetadata | null> {
  const clean = (id ?? "").trim().toLowerCase();
  const existing = cache.get(clean);
  if (existing) return existing;
  if (isKnownMissing(clean)) return null;

  const pending = inflight.get(clean);
  if (pending) return pending;

  const promise = fetchJson<MarketplaceMetadata>(`/metadata/${clean}`, { timeoutMs: 5_000 })
    .then((data) => {
      const normalized = normalizeForRender(data);
      clearMissing(clean, normalized.uri);
      cache.set(clean, normalized);
      if (normalized.uri) cache.set(normalized.uri, normalized);
      return normalized;
    })
    .catch((err: unknown) => {
      const status = (err as ApiError | undefined)?.status;
      // Older listings may reference metadata IDs that were never uploaded to the backend.
      // Treat that as a cacheable "missing" result instead of a hard error.
      if (status === 404) {
        markMissing(clean);
        return null;
      }
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
  const metadataId = metadataIdFromUri(clean);

  const existing = cache.get(clean);
  if (existing) return existing;
  if (metadataId) {
    const idCached = cache.get(metadataId);
    if (idCached) return idCached;
  }
  if (isKnownMissing(clean) || isKnownMissing(metadataId)) return null;

  const pending = inflight.get(clean);
  if (pending) return pending;

  const promise = fetchJson<MarketplaceMetadata>(`/metadata/lookup?uri=${encodeURIComponent(clean)}`, {
    timeoutMs: 5_000,
  })
    .then((data) => {
      const normalized = normalizeForRender(data);
      clearMissing(clean, metadataId, normalized.id, normalized.uri);
      cache.set(clean, normalized);
      if (normalized.id) cache.set(String(normalized.id).toLowerCase(), normalized);
      return normalized;
    })
    .catch((err: unknown) => {
      const status = (err as ApiError | undefined)?.status;
      if (status === 404) {
        markMissing(clean, metadataId);
        return null;
      }
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
      if (isKnownMissing(cacheKey) || isKnownMissing(metadataURI)) {
        setMetadata(null);
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
