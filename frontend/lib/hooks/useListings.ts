"use client";

import * as React from "react";
import { type Address, type Hex, parseAbiItem } from "viem";
import { usePublicClient } from "wagmi";

import { getEnv } from "@/lib/env";
import { fetchJson } from "@/lib/api";
import { marketplaceRegistryAbi } from "@/lib/contracts/abi/MarketplaceRegistry";
import { parseListing } from "@/lib/contracts/parse";
import { type ListingStatus, type SaleType } from "@/lib/contracts/types";

export type ListingSummary = {
  id: Hex;
  seller: Address;
  saleType: SaleType;
  token: Address;
  price: bigint;
  metadataURI: string;
  status: ListingStatus;
};

type BackendListingRow = {
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
  const anyErr = err as any;
  const message = String(anyErr?.shortMessage ?? anyErr?.message ?? "");
  const details = String(anyErr?.details ?? "");
  return /\b429\b/.test(message) ||
    /too many requests/i.test(message) ||
    /rate limit/i.test(message) ||
    /\b429\b/.test(details) ||
    /too many requests/i.test(details) ||
    /rate limit/i.test(details);
}

const LISTINGS_CACHE_TTL_MS = 15_000;
let cachedListings: ListingSummary[] | null = null;
let cachedListingsAt = 0;
let cachedListingsPromise: Promise<ListingSummary[]> | null = null;

export function useListings() {
  const publicClient = usePublicClient();

  const [data, setData] = React.useState<ListingSummary[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setIsLoading(true);
        setError(null);

        // Fast path: avoid double-fetching in React strict mode and across navigation.
        if (cachedListings && Date.now() - cachedListingsAt < LISTINGS_CACHE_TTL_MS) {
          if (!cancelled) setData(cachedListings);
          return;
        }

        if (cachedListingsPromise) {
          const existing = await cachedListingsPromise;
          if (!cancelled) setData(existing);
          return;
        }

        cachedListingsPromise = (async () => {
          // Prefer backend indexer API (fast, no RPC log scanning per request).
          // If backend responds successfully but has indexed 0 listings yet, fall back
          // to a small on-chain scan window so the UI can still show recent listings.
          // This keeps discovery working while the indexer is catching up.
          try {
            const resp = await fetchJson<BackendListingsResponse>("/listings?limit=50&offset=0", {
              timeoutMs: 5_000,
            });

            const items = resp.items.map((row) =>
              ({
                id: row.id as Hex,
                seller: row.seller as Address,
                saleType: row.saleType as SaleType,
                token: row.token as Address,
                price: BigInt(row.price),
                metadataURI: row.metadataURI,
                status: (row.active ? 1 : 2) as ListingStatus,
              }) satisfies ListingSummary
            );

            if (items.length > 0) {
              cachedListings = items;
              cachedListingsAt = Date.now();
              return items;
            }

            // Backend is reachable but hasn't indexed listings yet; continue to on-chain fallback.
          } catch {
            // Backend may not be running; fall back to on-chain.
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
                "RPC rate limited (429). Set NEXT_PUBLIC_SEPOLIA_RPC_URL (or NEXT_PUBLIC_SEPOLIA_RPC_FALLBACK_URL) to a higher-limit provider like Alchemy, then restart `npm run dev`."
              );
            }
            throw e;
          }

          const ids = logs.map((l) => l.args.id as Hex).filter(Boolean).reverse();
          const uniqueIds = Array.from(new Set(ids)).slice(0, 50);

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
            listings.push({
              id,
              seller: parsed.seller,
              saleType: parsed.saleType,
              token: parsed.token,
              price: parsed.price,
              metadataURI: parsed.metadataURI,
              status: parsed.status,
            });
          }

          cachedListings = listings;
          cachedListingsAt = Date.now();
          return listings;
        })();

        const listings = await cachedListingsPromise;
        if (!cancelled) setData(listings);
        return;
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load listings");
      } finally {
        cachedListingsPromise = null;
        if (!cancelled) setIsLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [publicClient]);

  return { listings: data, isLoading, error };
}
