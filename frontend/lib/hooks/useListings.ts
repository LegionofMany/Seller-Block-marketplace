"use client";

import * as React from "react";
import { type Address, type Hex, parseAbiItem } from "viem";
import { usePublicClient } from "wagmi";

import { getEnv } from "@/lib/env";
import { fetchJson, type ApiError } from "@/lib/api";
import { marketplaceRegistryAbi } from "@/lib/contracts/abi/MarketplaceRegistry";
import { parseListing } from "@/lib/contracts/parse";
import { type ListingStatus, type SaleType } from "@/lib/contracts/types";
import { isSmokeMetadataUri } from "@/lib/metadata";

export type ListingSummary = {
  chainKey: string;
  chainId: number;
  id: Hex;
  seller: Address;
  saleType: SaleType;
  token: Address;
  price: bigint;
  metadataURI: string;
  status: ListingStatus;
};

export type ListingsParams = {
  chainKey?: string;
  q?: string;
  category?: string;
  subcategory?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  minPrice?: string;
  maxPrice?: string;
  type?: "fixed" | "auction" | "raffle";
  sort?: "newest" | "price_asc" | "price_desc";
  limit?: number;
  offset?: number;
};

type BackendListingRow = {
  chainKey: string;
  chainId: number;
  id: string;
  seller: string;
  metadataURI: string;
  price: string;
  token: string;
  saleType: number;
  active: 0 | 1;
  createdAt: number;
  blockNumber: number;
};

type BackendListingsResponse = {
  items: BackendListingRow[];
  limit: number;
  offset: number;
};

const listingCreatedEvent = parseAbiItem(
  "event ListingCreated(bytes32 indexed id, address seller, uint8 saleType, address token, uint256 price, string metadataURI)"
);

const SAFE_LOG_SCAN_BLOCKS = 10_000n;

function isRateLimitError(err: unknown): boolean {
  const errorLike = err as { shortMessage?: unknown; message?: unknown; details?: unknown } | null;
  const message = String(errorLike?.shortMessage ?? errorLike?.message ?? "");
  const details = String(errorLike?.details ?? "");
  return /\b429\b/.test(message) ||
    /too many requests/i.test(message) ||
    /rate limit/i.test(message) ||
    /\b429\b/.test(details) ||
    /too many requests/i.test(details) ||
    /rate limit/i.test(details);
}

const LISTINGS_CACHE_TTL_MS = 15_000;
const cacheByKey = new Map<string, { at: number; items: ListingSummary[] }>();
const inflightByKey = new Map<string, Promise<ListingSummary[]>>();

function canUseOnchainFallback(params?: ListingsParams): boolean {
  const p = params ?? {};
  return !Boolean(
    p.q ||
      p.category ||
      p.subcategory ||
      p.city ||
      p.region ||
      p.postalCode
  );
}

function applyClientSideFilters(items: ListingSummary[], params?: ListingsParams): ListingSummary[] {
  const p = params ?? {};

  let filtered = items;

  if (p.chainKey) {
    filtered = filtered.filter((item) => item.chainKey === p.chainKey);
  }

  if (p.type) {
    const saleType = p.type === "fixed" ? 0 : p.type === "auction" ? 1 : 2;
    filtered = filtered.filter((item) => item.saleType === saleType);
  }

  if (p.minPrice) {
    try {
      const minPrice = BigInt(p.minPrice);
      filtered = filtered.filter((item) => item.price >= minPrice);
    } catch {
      // Ignore malformed optional filter and leave validation to the backend path when available.
    }
  }

  if (p.maxPrice) {
    try {
      const maxPrice = BigInt(p.maxPrice);
      filtered = filtered.filter((item) => item.price <= maxPrice);
    } catch {
      // Ignore malformed optional filter and leave validation to the backend path when available.
    }
  }

  const sorted = [...filtered];
  if (p.sort === "price_asc") {
    sorted.sort((left, right) => (left.price === right.price ? 0 : left.price < right.price ? -1 : 1));
  } else if (p.sort === "price_desc") {
    sorted.sort((left, right) => (left.price === right.price ? 0 : left.price > right.price ? -1 : 1));
  }

  const offset = p.offset ?? 0;
  const limit = p.limit ?? 50;
  return sorted.slice(offset, offset + limit);
}

function buildQuery(params: ListingsParams | undefined): string {
  const p = params ?? {};
  const sp = new URLSearchParams();
  sp.set("limit", String(p.limit ?? 50));
  sp.set("offset", String(p.offset ?? 0));

  if (p.q) sp.set("q", p.q);
  if (p.chainKey) sp.set("chain", p.chainKey);
  if (p.category) sp.set("category", p.category);
  if (p.subcategory) sp.set("subcategory", p.subcategory);
  if (p.city) sp.set("city", p.city);
  if (p.region) sp.set("region", p.region);
  if (p.postalCode) sp.set("postalCode", p.postalCode);
  if (p.minPrice) sp.set("minPrice", p.minPrice);
  if (p.maxPrice) sp.set("maxPrice", p.maxPrice);
  if (p.type) sp.set("type", p.type);
  if (p.sort) sp.set("sort", p.sort);
  return sp.toString();
}

export function useListings(params?: ListingsParams) {
  const publicClient = usePublicClient();

  const [data, setData] = React.useState<ListingSummary[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const query = buildQuery(params);
    const cacheKey = `listings:${query}`;
    const allowOnchainFallback = canUseOnchainFallback(params);

    async function run() {
      try {
        setIsLoading(true);
        setError(null);

        // Fast path: avoid double-fetching in React strict mode and across navigation.
        const cached = cacheByKey.get(cacheKey);
        if (cached && Date.now() - cached.at < LISTINGS_CACHE_TTL_MS) {
          if (!cancelled) setData(cached.items);
          return;
        }

        const inflight = inflightByKey.get(cacheKey);
        if (inflight) {
          const existing = await inflight;
          if (!cancelled) setData(existing);
          return;
        }

        const promise = (async () => {
          // Prefer backend indexer API (fast, no RPC log scanning per request).
          // If backend responds successfully but has indexed 0 listings yet, fall back
          // to a small on-chain scan window so the UI can still show recent listings.
          // This keeps discovery working while the indexer is catching up.
          try {
            const resp = await fetchJson<BackendListingsResponse>(`/listings?${query}`, {
              timeoutMs: 5_000,
            });

            const items = resp.items.map((row) =>
              ({
                chainKey: row.chainKey,
                chainId: row.chainId,
                id: row.id as Hex,
                seller: row.seller as Address,
                saleType: row.saleType as SaleType,
                token: row.token as Address,
                price: BigInt(row.price),
                metadataURI: row.metadataURI,
                status: (row.active ? 1 : 2) as ListingStatus,
              }) satisfies ListingSummary
            ).filter((row) => !isSmokeMetadataUri(row.metadataURI));

            if (items.length > 0) {
              cacheByKey.set(cacheKey, { items, at: Date.now() });
              return items;
            }

            // Backend is reachable but hasn't indexed listings yet; continue to on-chain fallback (only for default view).
          } catch {
            // Backend may not be running; fall back to on-chain.
          }

          if (!allowOnchainFallback) {
            throw new Error("Filtered marketplace results are temporarily unavailable. Refresh in a moment and try again.");
          }

          if (!publicClient) throw new Error("No public client");
          const env = getEnv();

          const latest = await publicClient.getBlockNumber();
          const safeFromBlock = latest > SAFE_LOG_SCAN_BLOCKS ? latest - SAFE_LOG_SCAN_BLOCKS : 0n;

          const primaryFromBlock =
            env.fromBlock !== 0n ? (env.fromBlock > latest ? safeFromBlock : env.fromBlock) : safeFromBlock;

          let logs;
          try {
            logs = await publicClient.getLogs({
              address: env.marketplaceRegistryAddress,
              event: listingCreatedEvent,
              fromBlock: primaryFromBlock,
              toBlock: "latest",
            });
          } catch (e) {
            if (isRateLimitError(e)) {
              throw new Error(
                "Marketplace activity is temporarily rate limited. Refresh in a moment and try again."
              );
            }
            throw e;
          }

          const ids = logs.map((l) => l.args.id as Hex).filter(Boolean).reverse();
          const desiredWindow = Math.max((params?.offset ?? 0) + (params?.limit ?? 50), 50);
          const uniqueIds = Array.from(new Set(ids)).slice(0, Math.min(desiredWindow * 4, 200));

          const multicallResults = await publicClient.multicall({
            allowFailure: true,
            contracts: uniqueIds.map((id) => ({
              address: env.marketplaceRegistryAddress,
              abi: marketplaceRegistryAbi,
              functionName: "listings",
              args: [id],
            })),
          });

          const listings: ListingSummary[] = [];
          for (let i = 0; i < uniqueIds.length; i++) {
            const id = uniqueIds[i];
            const result = multicallResults[i];
            if (!result || result.status !== "success") continue;
            const parsed = parseListing(result.result);
            const candidate = {
              chainKey: env.defaultChain.key,
              chainId: env.defaultChain.chainId,
              id,
              seller: parsed.seller,
              saleType: parsed.saleType,
              token: parsed.token,
              price: parsed.price,
              metadataURI: parsed.metadataURI,
              status: parsed.status,
            } satisfies ListingSummary;
            if (!isSmokeMetadataUri(candidate.metadataURI)) {
              listings.push(candidate);
            }
          }

          const filteredListings = applyClientSideFilters(listings, params);
          cacheByKey.set(cacheKey, { items: filteredListings, at: Date.now() });
          return filteredListings;
        })();

        inflightByKey.set(cacheKey, promise);
        const listings = await promise;
        if (!cancelled) setData(listings);
        return;
      } catch (e: unknown) {
        if (!cancelled) setError((e as ApiError | null)?.message ?? "Marketplace results could not be loaded right now.");
      } finally {
        inflightByKey.delete(cacheKey);
        if (!cancelled) setIsLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [publicClient, JSON.stringify(params ?? {})]);

  return { listings: data, isLoading, error };
}
