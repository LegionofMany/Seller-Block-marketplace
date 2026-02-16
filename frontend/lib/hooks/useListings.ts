"use client";

import * as React from "react";
import { type Address, type Hex, parseAbiItem } from "viem";
import { usePublicClient } from "wagmi";

import { getEnv } from "@/lib/env";
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

const listingCreatedEvent = parseAbiItem(
  "event ListingCreated(bytes32 indexed id, address seller, uint8 saleType, address token, uint256 price, string metadataURI)"
);

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

        if (!publicClient) throw new Error("No public client");

        const env = getEnv();

        const logs = await publicClient.getLogs({
          address: env.marketplaceRegistryAddress,
          event: listingCreatedEvent,
          fromBlock: env.fromBlock,
          toBlock: "latest",
        });

        const ids = logs
          .map((l) => l.args.id as Hex)
          .filter(Boolean)
          .reverse();

        const uniqueIds = Array.from(new Set(ids));

        const listings = await Promise.all(
          uniqueIds.map(async (id) => {
            const raw = await publicClient.readContract({
              address: env.marketplaceRegistryAddress,
              abi: marketplaceRegistryAbi,
              functionName: "listings",
              args: [id],
            });
            const parsed = parseListing(raw);
            return {
              id,
              seller: parsed.seller,
              saleType: parsed.saleType,
              token: parsed.token,
              price: parsed.price,
              metadataURI: parsed.metadataURI,
              status: parsed.status,
            } satisfies ListingSummary;
          })
        );

        if (!cancelled) setData(listings);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load listings");
      } finally {
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
