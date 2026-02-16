"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { type Address, type Hex, isAddress, parseEther, zeroAddress } from "viem";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

import { getEnv } from "@/lib/env";
import { marketplaceRegistryAbi } from "@/lib/contracts/abi/MarketplaceRegistry";
import { erc20Abi } from "@/lib/contracts/abi/ERC20";
import { raffleModuleAbi } from "@/lib/contracts/abi/RaffleModule";
import { parseListing } from "@/lib/contracts/parse";
import { isNativeToken, saleTypeLabel, statusLabel } from "@/lib/contracts/types";
import { formatPrice, shortenHex } from "@/lib/format";
import { useToastTx } from "@/lib/hooks/useToastTx";

function asBytes32(value: string): Hex | null {
  if (!value?.startsWith("0x")) return null;
  if (value.length !== 66) return null;
  return value as Hex;
}

export default function ListingDetailPage() {
  let env;
  try {
    env = getEnv();
  } catch (e: any) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">{e?.message ?? "Missing env vars"}</CardContent>
      </Card>
    );
  }

  const params = useParams<{ id: string }>();
  const id = params?.id;
  const listingId = asBytes32(id);

  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [bidAmount, setBidAmount] = React.useState("");
  const [ticketCount, setTicketCount] = React.useState("1");
  const [reveal, setReveal] = React.useState<Hex>(("0x" + "00".repeat(32)) as Hex);

  const { data: raw, isLoading } = useReadContract({
    address: env.marketplaceRegistryAddress,
    abi: marketplaceRegistryAbi,
    functionName: "listings",
    args: listingId ? [listingId] : undefined,
    query: { enabled: Boolean(listingId) },
  });

  const listing = raw ? parseListing(raw) : null;
  const native = listing ? isNativeToken(listing.token as Address) : true;

  const isSeller = Boolean(address && listing && address.toLowerCase() === listing.seller.toLowerCase());
  const isBuyer = Boolean(address && listing && address.toLowerCase() === listing.buyer.toLowerCase());

  // ERC20 allowance (fixed-price only)
  const needsErc20Approval = Boolean(
    listing &&
      !native &&
      env.escrowVaultAddress !== zeroAddress &&
      address &&
      listing.status === 1 &&
      listing.saleType === 0
  );

  const { data: allowance } = useReadContract({
    address: (listing?.token ?? zeroAddress) as Address,
    abi: erc20Abi,
    functionName: "allowance",
    args:
      needsErc20Approval && address
        ? [address as Address, env.escrowVaultAddress]
        : undefined,
    query: { enabled: Boolean(needsErc20Approval && address && listing?.token && isAddress(listing.token)) },
  });

  const approvedEnough = typeof allowance === "bigint" && listing ? allowance >= listing.price : false;

  const parsedBidAmount = React.useMemo(() => {
    if (!bidAmount) return null;
    try {
      return native ? parseEther(bidAmount) : BigInt(bidAmount);
    } catch {
      return null;
    }
  }, [bidAmount, native]);

  const { data: bidAllowance } = useReadContract({
    address: (listing?.token ?? zeroAddress) as Address,
    abi: erc20Abi,
    functionName: "allowance",
    args:
      !native && address && parsedBidAmount && env.auctionModuleAddress !== zeroAddress
        ? [address as Address, env.auctionModuleAddress]
        : undefined,
    query: { enabled: Boolean(!native && address && parsedBidAmount && env.auctionModuleAddress !== zeroAddress) },
  });

  const bidApproved = !native && typeof bidAllowance === "bigint" && parsedBidAmount ? bidAllowance >= parsedBidAmount : false;

  const parsedTicketCount = React.useMemo(() => {
    try {
      const n = Number.parseInt(ticketCount, 10);
      if (!Number.isFinite(n) || n <= 0 || n > 4_294_967_295) return null;
      return n;
    } catch {
      return null;
    }
  }, [ticketCount]);

  const { data: raffleQuote } = useReadContract({
    address: env.raffleModuleAddress,
    abi: raffleModuleAbi,
    functionName: "quoteEntry",
    args:
      listing &&
      listing.saleType === 2 &&
      listing.moduleId !== ("0x" + "00".repeat(32)) &&
      parsedTicketCount &&
      env.raffleModuleAddress !== zeroAddress
        ? [listing.moduleId, parsedTicketCount]
        : undefined,
    query: {
      enabled: Boolean(
        listing &&
          listing.saleType === 2 &&
          listing.moduleId !== ("0x" + "00".repeat(32)) &&
          parsedTicketCount &&
          env.raffleModuleAddress !== zeroAddress
      ),
    },
  });

  const { data: raffleAllowance } = useReadContract({
    address: (listing?.token ?? zeroAddress) as Address,
    abi: erc20Abi,
    functionName: "allowance",
    args:
      listing &&
      !native &&
      address &&
      typeof raffleQuote === "bigint" &&
      env.raffleModuleAddress !== zeroAddress
        ? [address as Address, env.raffleModuleAddress]
        : undefined,
    query: { enabled: Boolean(listing && !native && address && typeof raffleQuote === "bigint" && env.raffleModuleAddress !== zeroAddress) },
  });

  const raffleApproved = !native && typeof raffleAllowance === "bigint" && typeof raffleQuote === "bigint" ? raffleAllowance >= raffleQuote : false;

  const [pendingHash, setPendingHash] = React.useState<`0x${string}` | undefined>();
  const toastTx = useToastTx(pendingHash, "Transaction pending");
  const receipt = useWaitForTransactionReceipt({ hash: pendingHash, query: { enabled: Boolean(pendingHash) } });

  React.useEffect(() => {
    if (receipt.isSuccess) {
      toastTx.success("Transaction confirmed");
      setPendingHash(undefined);
    }
    if (receipt.isError) {
      toastTx.fail(receipt.error?.message ?? "Transaction failed");
      setPendingHash(undefined);
    }
  }, [receipt.isSuccess, receipt.isError]);

  async function send(tx: Promise<`0x${string}`>) {
    const hash = await tx;
    setPendingHash(hash);
  }

  if (!listingId) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">Invalid listing id.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Listing</h1>
        <p className="text-sm text-muted-foreground break-all">{listingId}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>{listing ? saleTypeLabel(listing.saleType) : "Loading…"}</span>
            {listing ? <Badge variant="outline">{statusLabel(listing.status)}</Badge> : null}
          </CardTitle>
          <CardDescription className="break-all">
            {listing ? listing.metadataURI : <Skeleton className="h-4 w-64" />}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {isLoading || !listing ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-40" />
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="text-sm">
                  <div className="text-muted-foreground">Price</div>
                  <div className="font-medium">{formatPrice(listing.price, native)}</div>
                </div>
                <div className="text-sm">
                  <div className="text-muted-foreground">Token</div>
                  <div className="font-medium break-all">{native ? "ETH" : listing.token}</div>
                </div>
                <div className="text-sm">
                  <div className="text-muted-foreground">Seller</div>
                  <div className="font-medium">{shortenHex(listing.seller)}</div>
                </div>
                <div className="text-sm">
                  <div className="text-muted-foreground">Buyer</div>
                  <div className="font-medium">{listing.buyer === zeroAddress ? "—" : shortenHex(listing.buyer)}</div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="text-sm font-semibold">Actions</div>

                {listing.status === 1 && isSeller ? (
                  <Button
                    variant="destructive"
                    disabled={receipt.isLoading}
                    onClick={() => send(writeContractAsync({
                      address: env.marketplaceRegistryAddress,
                      abi: marketplaceRegistryAbi,
                      functionName: "cancelListing",
                      args: [listingId],
                    }))}
                  >
                    Cancel Listing
                  </Button>
                ) : null}

                {listing.saleType === 0 && listing.status === 1 && !isSeller ? (
                  <div className="space-y-3">
                    {!native ? (
                      <div className="rounded-md border p-4 text-sm">
                        <div className="font-medium">ERC20 purchase</div>
                        <div className="text-muted-foreground">
                          Approve the EscrowVault, then buy.
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            disabled={approvedEnough || receipt.isLoading}
                            onClick={() => send(writeContractAsync({
                              address: listing.token,
                              abi: erc20Abi,
                              functionName: "approve",
                              args: [env.escrowVaultAddress, listing.price],
                            }))}
                          >
                            {approvedEnough ? "Approved" : "Approve"}
                          </Button>
                          <Button
                            disabled={!approvedEnough || receipt.isLoading}
                            onClick={() => send(writeContractAsync({
                              address: env.marketplaceRegistryAddress,
                              abi: marketplaceRegistryAbi,
                              functionName: "buy",
                              args: [listingId],
                            }))}
                          >
                            Buy
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        disabled={receipt.isLoading}
                        onClick={() => send(writeContractAsync({
                          address: env.marketplaceRegistryAddress,
                          abi: marketplaceRegistryAbi,
                          functionName: "buy",
                          args: [listingId],
                          value: listing.price,
                        }))}
                      >
                        Buy ({formatPrice(listing.price, true)})
                      </Button>
                    )}
                  </div>
                ) : null}

                {listing.status === 4 && isBuyer ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={receipt.isLoading}
                      onClick={() => send(writeContractAsync({
                        address: env.marketplaceRegistryAddress,
                        abi: marketplaceRegistryAbi,
                        functionName: "confirmDelivery",
                        args: [listingId],
                      }))}
                    >
                      Confirm Delivery
                    </Button>
                    <Button
                      variant="outline"
                      disabled={receipt.isLoading}
                      onClick={() => send(writeContractAsync({
                        address: env.marketplaceRegistryAddress,
                        abi: marketplaceRegistryAbi,
                        functionName: "requestRefund",
                        args: [listingId],
                      }))}
                    >
                      Request Refund
                    </Button>
                  </div>
                ) : null}

                {listing.saleType === 1 && listing.status === 1 && listing.moduleId !== ("0x" + "00".repeat(32)) ? (
                  <div className="rounded-md border p-4 space-y-3">
                    <div className="text-sm font-medium">Place bid</div>
                    <div className="grid gap-2">
                      <Label>Bid amount {native ? "(ETH)" : "(raw units)"}</Label>
                      <Input value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} placeholder={native ? "0.05" : "1000000"} />
                    </div>
                    {!native ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          disabled={receipt.isLoading || !parsedBidAmount || bidApproved || env.auctionModuleAddress === zeroAddress}
                          onClick={() =>
                            send(
                              writeContractAsync({
                                address: listing.token,
                                abi: erc20Abi,
                                functionName: "approve",
                                args: [env.auctionModuleAddress, parsedBidAmount ?? BigInt(0)],
                              })
                            )
                          }
                        >
                          {bidApproved ? "Approved" : "Approve"}
                        </Button>
                        <Button
                          disabled={receipt.isLoading || !parsedBidAmount || !bidApproved}
                          onClick={() =>
                            send(
                              writeContractAsync({
                                address: env.marketplaceRegistryAddress,
                                abi: marketplaceRegistryAbi,
                                functionName: "bid",
                                args: [listingId, parsedBidAmount ?? BigInt(0)],
                              })
                            )
                          }
                        >
                          Bid
                        </Button>
                      </div>
                    ) : (
                      <Button
                        disabled={receipt.isLoading || !parsedBidAmount}
                        onClick={() =>
                          send(
                            writeContractAsync({
                              address: env.marketplaceRegistryAddress,
                              abi: marketplaceRegistryAbi,
                              functionName: "bid",
                              args: [listingId, parsedBidAmount ?? BigInt(0)],
                              value: parsedBidAmount ?? BigInt(0),
                            })
                          )
                        }
                      >
                        Bid
                      </Button>
                    )}

                    {isSeller ? (
                      <Button
                        variant="secondary"
                        disabled={receipt.isLoading}
                        onClick={() => send(writeContractAsync({
                          address: env.marketplaceRegistryAddress,
                          abi: marketplaceRegistryAbi,
                          functionName: "closeAuction",
                          args: [listingId],
                        }))}
                      >
                        Close Auction
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {listing.saleType === 2 && listing.status === 1 && listing.moduleId !== ("0x" + "00".repeat(32)) ? (
                  <div className="rounded-md border p-4 space-y-3">
                    <div className="text-sm font-medium">Enter raffle</div>
                    <div className="grid gap-2">
                      <Label>Tickets</Label>
                      <Input value={ticketCount} onChange={(e) => setTicketCount(e.target.value)} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Quote: {typeof raffleQuote === "bigint" ? formatPrice(raffleQuote, native) : "—"}
                    </div>

                    {!native ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          disabled={receipt.isLoading || env.raffleModuleAddress === zeroAddress || typeof raffleQuote !== "bigint" || raffleApproved}
                          onClick={() =>
                            send(
                              writeContractAsync({
                                address: listing.token,
                                abi: erc20Abi,
                                functionName: "approve",
                                args: [env.raffleModuleAddress, (raffleQuote as bigint) ?? BigInt(0)],
                              })
                            )
                          }
                        >
                          {raffleApproved ? "Approved" : "Approve"}
                        </Button>
                        <Button
                          disabled={receipt.isLoading || typeof raffleQuote !== "bigint" || !raffleApproved || !parsedTicketCount}
                          onClick={() =>
                            send(
                              writeContractAsync({
                                address: env.marketplaceRegistryAddress,
                                abi: marketplaceRegistryAbi,
                                functionName: "enterRaffle",
                                args: [listingId, parsedTicketCount ?? 0],
                              })
                            )
                          }
                        >
                          Enter
                        </Button>
                      </div>
                    ) : (
                      <Button
                        disabled={receipt.isLoading || typeof raffleQuote !== "bigint" || !parsedTicketCount}
                        onClick={() =>
                          send(
                            writeContractAsync({
                              address: env.marketplaceRegistryAddress,
                              abi: marketplaceRegistryAbi,
                              functionName: "enterRaffle",
                              args: [listingId, parsedTicketCount ?? 0],
                              value: (raffleQuote as bigint) ?? BigInt(0),
                            })
                          )
                        }
                      >
                        Enter
                      </Button>
                    )}

                    {isSeller ? (
                      <div className="grid gap-2">
                        <Label>Reveal (bytes32)</Label>
                        <Input value={reveal} onChange={(e) => setReveal(e.target.value as Hex)} placeholder="0x..." />
                        <Button
                          variant="secondary"
                          disabled={receipt.isLoading}
                          onClick={() => send(writeContractAsync({
                            address: env.marketplaceRegistryAddress,
                            abi: marketplaceRegistryAbi,
                            functionName: "closeRaffle",
                            args: [listingId, reveal],
                          }))}
                        >
                          Close Raffle
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="rounded-md border p-4">
                  <div className="text-sm font-medium">Withdraw payout credits</div>
                  <div className="text-sm text-muted-foreground">Withdraw ETH credits from escrow vault via registry.</div>
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      disabled={receipt.isLoading}
                      onClick={() => send(writeContractAsync({
                        address: env.marketplaceRegistryAddress,
                        abi: marketplaceRegistryAbi,
                        functionName: "withdrawPayout",
                        args: [zeroAddress],
                      }))}
                    >
                      Withdraw ETH
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
