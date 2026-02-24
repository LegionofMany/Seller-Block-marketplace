"use client";

import * as React from "react";
import Link from "next/link";
import { type Address, type Hex, isAddress, parseAbiItem, zeroAddress } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

import { getEnv } from "@/lib/env";
import { fetchJson } from "@/lib/api";
import { marketplaceRegistryAbi } from "@/lib/contracts/abi/MarketplaceRegistry";
import { escrowVaultAbi } from "@/lib/contracts/abi/EscrowVault";
import { parseListing } from "@/lib/contracts/parse";
import { statusLabel } from "@/lib/contracts/types";
import { shortenHex } from "@/lib/format";

const listingCreatedEvent = parseAbiItem(
  "event ListingCreated(bytes32 indexed id, address seller, uint8 saleType, address token, uint256 price, string metadataURI)"
);

export default function DashboardPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [token, setToken] = React.useState<string>("");
  const [vaultController, setVaultController] = React.useState<string>("");
  const [vaultArbiter, setVaultArbiter] = React.useState<string>("");
  const [registryArbiter, setRegistryArbiter] = React.useState<string>("");
  const [feesToken, setFeesToken] = React.useState<string>("");

  const [inspectEscrowId, setInspectEscrowId] = React.useState<string>("");
  const [escrowInfo, setEscrowInfo] = React.useState<
    | null
    | {
        buyer: Address;
        seller: Address;
        token: Address;
        amount: bigint;
        status: number;
      }
  >(null);

  const [creditRecipient, setCreditRecipient] = React.useState<string>("");
  const [creditToken, setCreditToken] = React.useState<string>("");
  const [creditAmount, setCreditAmount] = React.useState<bigint | null>(null);
  const [myListingIds, setMyListingIds] = React.useState<Hex[] | null>(null);
  const [myListings, setMyListings] = React.useState<Array<{ id: Hex; status: number; buyer: Address }> | null>(null);

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

  const { data: registryOwner } = useReadContract({
    address: env.marketplaceRegistryAddress,
    abi: marketplaceRegistryAbi,
    functionName: "owner",
    query: { retry: 1 },
  });

  const { data: protocolFeeBps } = useReadContract({
    address: env.marketplaceRegistryAddress,
    abi: marketplaceRegistryAbi,
    functionName: "protocolFeeBps",
    query: { retry: 1 },
  });

  const { data: feeRecipient } = useReadContract({
    address: env.marketplaceRegistryAddress,
    abi: marketplaceRegistryAbi,
    functionName: "feeRecipient",
    query: { retry: 1 },
  });

  const { data: vaultOwner } = useReadContract({
    address: env.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "owner",
    query: { enabled: env.escrowVaultAddress !== zeroAddress, retry: 1 },
  });

  const { data: vaultControllerOnchain } = useReadContract({
    address: env.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "controller",
    query: { enabled: env.escrowVaultAddress !== zeroAddress, retry: 1 },
  });

  const { data: vaultArbiterOnchain } = useReadContract({
    address: env.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "arbiter",
    query: { enabled: env.escrowVaultAddress !== zeroAddress, retry: 1 },
  });

  const isRegistryOwner = Boolean(
    address && typeof registryOwner === "string" && address.toLowerCase() === registryOwner.toLowerCase()
  );
  const isVaultOwner = Boolean(
    address && typeof vaultOwner === "string" && address.toLowerCase() === vaultOwner.toLowerCase()
  );

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!address) {
        setMyListingIds([]);
        setMyListings([]);
        return;
      }

      // Prefer backend API (indexed DB). Fallback to on-chain logs if API isn't available.
      try {
        setMyListingIds(null);
        const resp = await fetchJson<{ items: Array<{ id: string }> }>(
          `/seller/${address}/listings?limit=100&offset=0`,
          { timeoutMs: 5_000 }
        );
        const ids = resp.items.map((r) => r.id as Hex);
        if (!cancelled) setMyListingIds(Array.from(new Set(ids)));
        return;
      } catch {
        // ignore, fallback below
      }

      if (!publicClient) {
        setMyListingIds([]);
        return;
      }
      try {
        setMyListingIds(null);
        const SAFE_LOG_SCAN_BLOCKS = 25_000n;
        const latest = await publicClient.getBlockNumber();
        const safeFromBlock = latest > SAFE_LOG_SCAN_BLOCKS ? latest - SAFE_LOG_SCAN_BLOCKS : 0n;

        const primaryFromBlock =
          env.fromBlock !== 0n ? (env.fromBlock > latest ? safeFromBlock : env.fromBlock) : safeFromBlock;

        const logs = await publicClient.getLogs({
          address: env.marketplaceRegistryAddress,
          event: listingCreatedEvent,
          fromBlock: primaryFromBlock,
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

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!address) {
        setMyListings([]);
        return;
      }

      if (!publicClient) {
        setMyListings([]);
        return;
      }

      // Still loading IDs
      if (myListingIds === null) {
        setMyListings(null);
        return;
      }

      if (myListingIds.length === 0) {
        setMyListings([]);
        return;
      }

      try {
        setMyListings(null);
        const ids = myListingIds.slice(0, 50);
        const results = await publicClient.multicall({
          allowFailure: true,
          contracts: ids.map((id) => ({
            address: env.marketplaceRegistryAddress,
            abi: marketplaceRegistryAbi,
            functionName: "listings",
            args: [id],
          })),
        });

        const rows = ids
          .map((id, i) => {
            const r = results[i];
            if (!r || r.status !== "success") return null;
            const parsed = parseListing(r.result);
            return { id, status: Number(parsed.status), buyer: parsed.buyer };
          })
          .filter(Boolean) as Array<{ id: Hex; status: number; buyer: Address }>;

        if (!cancelled) setMyListings(rows);
      } catch {
        if (!cancelled) setMyListings([]);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [address, publicClient, myListingIds]);

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
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-muted-foreground">Address</div>
            <div className="font-medium break-all sm:text-right">{address ? shortenHex(address) : "Not connected"}</div>
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-muted-foreground">Last listing</div>
            <div className="font-medium break-all sm:text-right">
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
            size="lg"
            className="w-full sm:w-auto"
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
          <CardTitle>Owner tools</CardTitle>
          <CardDescription>Admin/owner-only utilities for EscrowVault and the registry.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-muted-foreground">Registry owner</div>
              <div className="font-medium break-all sm:text-right">{typeof registryOwner === "string" ? registryOwner : "—"}</div>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-muted-foreground">Vault owner</div>
              <div className="font-medium break-all sm:text-right">{typeof vaultOwner === "string" ? vaultOwner : "—"}</div>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-muted-foreground">Vault controller</div>
              <div className="font-medium break-all sm:text-right">{typeof vaultControllerOnchain === "string" ? vaultControllerOnchain : "—"}</div>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-muted-foreground">Vault arbiter</div>
              <div className="font-medium break-all sm:text-right">{typeof vaultArbiterOnchain === "string" ? vaultArbiterOnchain : "—"}</div>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-muted-foreground">Protocol fee</div>
              <div className="font-medium sm:text-right">
                {typeof protocolFeeBps === "bigint" ? `${protocolFeeBps.toString()} bps` : "—"}
              </div>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-muted-foreground">Fee recipient</div>
              <div className="font-medium break-all sm:text-right">{typeof feeRecipient === "string" ? feeRecipient : "—"}</div>
            </div>
          </div>

          <div className="rounded-md border p-4 space-y-3">
            <div className="text-sm font-semibold">EscrowVault (owner-only)</div>
            {isVaultOwner ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Set controller address</Label>
                    <Input value={vaultController} onChange={(e) => setVaultController(e.target.value)} placeholder="0x..." />
                    <Button
                      variant="outline"
                      disabled={env.escrowVaultAddress === zeroAddress || !vaultController.trim().length}
                      onClick={async () => {
                        try {
                          if (!publicClient) throw new Error("No public client");
                          const next = vaultController.trim();
                          if (!isAddress(next)) throw new Error("Invalid controller address");

                          const id = toast.loading("Setting controller…");
                          const hash = await writeContractAsync({
                            address: env.escrowVaultAddress,
                            abi: escrowVaultAbi,
                            functionName: "setController",
                            args: [next as Address],
                          });
                          await publicClient.waitForTransactionReceipt({ hash });
                          toast.success("Controller updated", { id });
                        } catch (e: any) {
                          toast.error(e?.shortMessage ?? e?.message ?? "Failed to set controller");
                        }
                      }}
                    >
                      Set controller
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>Set vault arbiter address</Label>
                    <Input value={vaultArbiter} onChange={(e) => setVaultArbiter(e.target.value)} placeholder="0x..." />
                    <Button
                      variant="outline"
                      disabled={env.escrowVaultAddress === zeroAddress || !vaultArbiter.trim().length}
                      onClick={async () => {
                        try {
                          if (!publicClient) throw new Error("No public client");
                          const next = vaultArbiter.trim();
                          if (!isAddress(next)) throw new Error("Invalid arbiter address");

                          const id = toast.loading("Setting vault arbiter…");
                          const hash = await writeContractAsync({
                            address: env.escrowVaultAddress,
                            abi: escrowVaultAbi,
                            functionName: "setArbiter",
                            args: [next as Address],
                          });
                          await publicClient.waitForTransactionReceipt({ hash });
                          toast.success("Vault arbiter updated", { id });
                        } catch (e: any) {
                          toast.error(e?.shortMessage ?? e?.message ?? "Failed to set vault arbiter");
                        }
                      }}
                    >
                      Set vault arbiter
                    </Button>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  Note: EscrowVault escrow actions (create/release/refund/withdraw) are controller-only.
                  In this protocol the controller should be the MarketplaceRegistry.
                </div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground">
                Connect the EscrowVault owner wallet to manage controller/arbiter.
              </div>
            )}
          </div>

          <div className="rounded-md border p-4 space-y-3">
            <div className="text-sm font-semibold">MarketplaceRegistry (owner-only)</div>
            {isRegistryOwner ? (
              <>
                <div className="space-y-2">
                  <Label>Set registry arbiter address</Label>
                  <Input value={registryArbiter} onChange={(e) => setRegistryArbiter(e.target.value)} placeholder="0x..." />
                  <Button
                    variant="outline"
                    disabled={!registryArbiter.trim().length}
                    onClick={async () => {
                      try {
                        if (!publicClient) throw new Error("No public client");
                        const next = registryArbiter.trim();
                        if (!isAddress(next)) throw new Error("Invalid arbiter address");

                        const id = toast.loading("Setting registry arbiter…");
                        const hash = await writeContractAsync({
                          address: env.marketplaceRegistryAddress,
                          abi: marketplaceRegistryAbi,
                          functionName: "setArbiter",
                          args: [next as Address],
                        });
                        await publicClient.waitForTransactionReceipt({ hash });
                        toast.success("Registry arbiter updated", { id });
                      } catch (e: any) {
                        toast.error(e?.shortMessage ?? e?.message ?? "Failed to set registry arbiter");
                      }
                    }}
                  >
                    Set registry arbiter
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Withdraw protocol fees (token optional)</Label>
                  <Input value={feesToken} onChange={(e) => setFeesToken(e.target.value)} placeholder="Leave empty for ETH" />
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        if (!publicClient) throw new Error("No public client");
                        const tokenArg = feesToken.trim().length ? feesToken.trim() : zeroAddress;
                        if (typeof tokenArg === "string" && tokenArg !== zeroAddress && !isAddress(tokenArg)) {
                          throw new Error("Invalid token address");
                        }

                        const id = toast.loading("Withdrawing fees…");
                        const hash = await writeContractAsync({
                          address: env.marketplaceRegistryAddress,
                          abi: marketplaceRegistryAbi,
                          functionName: "withdrawFees",
                          args: [(tokenArg as Address) ?? zeroAddress],
                        });
                        await publicClient.waitForTransactionReceipt({ hash });
                        toast.success("Fees withdrawn", { id });
                      } catch (e: any) {
                        toast.error(e?.shortMessage ?? e?.message ?? "Withdraw fees failed");
                      }
                    }}
                  >
                    Withdraw fees
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground">
                Connect the MarketplaceRegistry owner wallet to manage registry arbiter and withdraw fees.
              </div>
            )}
          </div>

          <div className="rounded-md border p-4 space-y-3">
            <div className="text-sm font-semibold">Inspect EscrowVault (read-only)</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Escrow id (bytes32)</Label>
                <Input value={inspectEscrowId} onChange={(e) => setInspectEscrowId(e.target.value)} placeholder="0x..." />
                <Button
                  variant="outline"
                  disabled={env.escrowVaultAddress === zeroAddress || !inspectEscrowId.trim().length}
                  onClick={async () => {
                    try {
                      if (!publicClient) throw new Error("No public client");
                      const id = inspectEscrowId.trim();
                      if (!id.startsWith("0x") || id.length !== 66) throw new Error("Escrow id must be bytes32 (0x + 64 hex chars)");

                      const res = await publicClient.readContract({
                        address: env.escrowVaultAddress,
                        abi: escrowVaultAbi,
                        functionName: "getEscrow",
                        args: [id as Hex],
                      });

                      const anyRes: any = res as any;
                      const buyer = (anyRes?.buyer ?? anyRes?.[0]) as Address;
                      const seller = (anyRes?.seller ?? anyRes?.[1]) as Address;
                      const token = (anyRes?.token ?? anyRes?.[2]) as Address;
                      const amount = (anyRes?.amount ?? anyRes?.[3]) as bigint;
                      const status = Number(anyRes?.status ?? anyRes?.[4]);

                      setEscrowInfo({ buyer, seller, token, amount, status });
                    } catch (e: any) {
                      setEscrowInfo(null);
                      toast.error(e?.shortMessage ?? e?.message ?? "Failed to read escrow");
                    }
                  }}
                >
                  Read escrow
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Check credits (recipient + token)</Label>
                <Input value={creditRecipient} onChange={(e) => setCreditRecipient(e.target.value)} placeholder="Recipient 0x..." />
                <Input value={creditToken} onChange={(e) => setCreditToken(e.target.value)} placeholder="Token 0x... (empty = ETH)" />
                <Button
                  variant="outline"
                  disabled={env.escrowVaultAddress === zeroAddress || !creditRecipient.trim().length}
                  onClick={async () => {
                    try {
                      if (!publicClient) throw new Error("No public client");
                      const recipient = creditRecipient.trim();
                      if (!isAddress(recipient)) throw new Error("Invalid recipient address");

                      const tokenArg = creditToken.trim().length ? creditToken.trim() : zeroAddress;
                      if (tokenArg !== zeroAddress && !isAddress(tokenArg)) throw new Error("Invalid token address");

                      const amount = await publicClient.readContract({
                        address: env.escrowVaultAddress,
                        abi: escrowVaultAbi,
                        functionName: "creditOf",
                        args: [recipient as Address, tokenArg as Address],
                      });
                      setCreditAmount(amount as bigint);
                    } catch (e: any) {
                      setCreditAmount(null);
                      toast.error(e?.shortMessage ?? e?.message ?? "Failed to read credits");
                    }
                  }}
                >
                  Read credits
                </Button>
              </div>
            </div>

            {escrowInfo ? (
              <div className="mt-2 space-y-1 text-xs text-muted-foreground break-all">
                <div>Buyer: {escrowInfo.buyer}</div>
                <div>Seller: {escrowInfo.seller}</div>
                <div>Token: {escrowInfo.token}</div>
                <div>Amount: {escrowInfo.amount.toString()}</div>
                <div>Status: {escrowInfo.status} (1=Funded, 2=Released, 3=Refunded)</div>
              </div>
            ) : null}

            {creditAmount !== null ? (
              <div className="text-xs text-muted-foreground break-all">Credits: {creditAmount.toString()}</div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My listings</CardTitle>
          <CardDescription>Listings you created (from on-chain events).</CardDescription>
        </CardHeader>
        <CardContent>
          {myListingIds === null || myListings === null ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-72" />
            </div>
          ) : myListingIds.length === 0 ? (
            <div className="text-sm text-muted-foreground">No listings found.</div>
          ) : (
            <div className="space-y-2">
              {(myListings ?? []).map((row) => (
                <Link key={row.id} href={`/listing/${row.id}`} className="block rounded-md border px-3 py-2 text-sm hover:bg-accent/30">
                  <div className="flex items-center justify-between gap-3">
                    <div className="break-all">{row.id}</div>
                    <div className="text-xs text-muted-foreground">{statusLabel(row.status as any)}</div>
                  </div>
                  {row.buyer && row.buyer !== zeroAddress ? (
                    <div className="mt-1 text-xs text-muted-foreground">Buyer: {shortenHex(row.buyer)}</div>
                  ) : null}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
