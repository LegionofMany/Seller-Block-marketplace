"use client";

import * as React from "react";
import Link from "next/link";
import { type Address, type Hex, parseAbiItem, zeroAddress } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

import { getEnv } from "@/lib/env";
import { marketplaceRegistryAbi } from "@/lib/contracts/abi/MarketplaceRegistry";
import { shortenHex } from "@/lib/format";

const listingCreatedEvent = parseAbiItem(
  "event ListingCreated(bytes32 indexed id, address seller, uint8 saleType, address token, uint256 price, string metadataURI)"
);

export default function DashboardPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [token, setToken] = React.useState<string>("");
  const [myListingIds, setMyListingIds] = React.useState<Hex[] | null>(null);

  let env: ReturnType<typeof getEnv>;
  try {
    env = getEnv();
  } catch (e: any) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">{e?.message ?? "Missing env vars"}</CardContent>
      </Card>
    );
  }

  const { data: lastListingId } = useReadContract({
    address: env.marketplaceRegistryAddress,
    abi: marketplaceRegistryAbi,
    functionName: "lastListingIdOf",
    args: address ? [address as Address] : undefined,
    query: { enabled: Boolean(address) },
  });

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!address) {
        setMyListingIds([]);
        return;
      }
      if (!publicClient) {
        setMyListingIds([]);
        return;
      }
      try {
        setMyListingIds(null);
        const logs = await publicClient.getLogs({
          address: env.marketplaceRegistryAddress,
          event: listingCreatedEvent,
          fromBlock: env.fromBlock,
          toBlock: "latest",
        });
        const ids = logs
          .filter((l) => (l.args as any).seller?.toLowerCase?.() === address.toLowerCase())
          .map((l) => (l.args as any).id as Hex)
          .reverse();
        if (!cancelled) setMyListingIds(Array.from(new Set(ids)));
      } catch {
        if (!cancelled) setMyListingIds([]);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [address, publicClient]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Manage your marketplace activity.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Wallet</CardTitle>
          <CardDescription>Connected address and quick helpers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-muted-foreground">Address</div>
            <div className="font-medium">{address ? shortenHex(address) : "Not connected"}</div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-muted-foreground">Last listing</div>
            <div className="font-medium break-all">
              {lastListingId && lastListingId !== ("0x" + "00".repeat(32)) ? (
                <Link className="underline" href={`/listing/${lastListingId}`}> {shortenHex(lastListingId)} </Link>
              ) : (
                "—"
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Withdraw payout</CardTitle>
          <CardDescription>Withdraw your credits from EscrowVault through the registry.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Token address (optional)</Label>
            <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Leave empty for ETH" />
          </div>
          <Button
            variant="outline"
            disabled={!address}
            onClick={async () => {
              try {
                if (!publicClient) throw new Error("No public client");
                const tokenArg = token.trim().length ? (token.trim() as Address) : zeroAddress;
                const id = toast.loading("Withdrawing…");
                const hash = await writeContractAsync({
                  address: env.marketplaceRegistryAddress,
                  abi: marketplaceRegistryAbi,
                  functionName: "withdrawPayout",
                  args: [tokenArg],
                });
                await publicClient.waitForTransactionReceipt({ hash });
                toast.success("Withdraw complete", { id });
              } catch (e: any) {
                toast.error(e?.shortMessage ?? e?.message ?? "Withdraw failed");
              }
            }}
          >
            Withdraw
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My listings</CardTitle>
          <CardDescription>Listings you created (from on-chain events).</CardDescription>
        </CardHeader>
        <CardContent>
          {myListingIds === null ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-72" />
            </div>
          ) : myListingIds.length === 0 ? (
            <div className="text-sm text-muted-foreground">No listings found.</div>
          ) : (
            <div className="space-y-2">
              {myListingIds.map((id) => (
                <Link key={id} href={`/listing/${id}`} className="block rounded-md border px-3 py-2 text-sm hover:bg-accent/30">
                  {id}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
