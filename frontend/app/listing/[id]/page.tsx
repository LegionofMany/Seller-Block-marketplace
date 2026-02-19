"use client";

import * as React from "react";
import Link from "next/link";
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
import { fetchMetadataById, metadataIdFromUri, type MarketplaceMetadata } from "@/lib/metadata";
import { fetchJson } from "@/lib/api";

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

  const { data: raw, isLoading, isError, error } = useReadContract({
    address: env.marketplaceRegistryAddress,
    abi: marketplaceRegistryAbi,
    functionName: "listings",
    args: listingId ? [listingId] : undefined,
    query: { enabled: Boolean(listingId), retry: 1 },
  });

  const loadingListing = isLoading;

  const listingReadError: any = isError ? (error as any) : null;
  const listing = raw ? parseListing(raw) : null;
  const native = listing ? isNativeToken(listing.token as Address) : true;

  const { data: arbiterAddress } = useReadContract({
    address: env.marketplaceRegistryAddress,
    abi: marketplaceRegistryAbi,
    functionName: "arbiter",
    query: { retry: 1 },
  });

  const [metadata, setMetadata] = React.useState<MarketplaceMetadata | null>(null);
  const [isReuploadingMetadata, setIsReuploadingMetadata] = React.useState(false);

  const metadataId = React.useMemo(() => {
    if (!listing?.metadataURI) return null;
    return metadataIdFromUri(listing.metadataURI);
  }, [listing?.metadataURI]);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      setMetadata(null);
      if (!listing?.metadataURI) return;
      const id = metadataIdFromUri(listing.metadataURI);
      if (!id) return;
      try {
        const md = await fetchMetadataById(id);
        if (!cancelled) setMetadata(md);
      } catch {
        // ignore
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [listing?.metadataURI]);

  async function reuploadMissingMetadata() {
    if (!isSeller || !metadataId || !listing?.metadataURI) return;

    const title = window.prompt("Metadata title (required)")?.trim() ?? "";
    if (!title) return;

    const description = window.prompt("Metadata description (required)")?.trim() ?? "";
    if (!description) return;

    const image = window.prompt("Metadata image URL (required)")?.trim() ?? "";
    if (!image) return;

    try {
      setIsReuploadingMetadata(true);
      const res = await fetchJson<{ metadataURI: string; id: string }>("/metadata", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          description,
          image,
          attributes: [],
        }),
        timeoutMs: 7_000,
      });

      if (res.id.toLowerCase() !== metadataId.toLowerCase()) {
        window.alert(
          `Uploaded metadata, but the generated id does not match this listing.\n\nExpected: ${metadataId}\nGot: ${res.id}\n\nThis listing will still show the old metadata URI.`
        );
        return;
      }

      const md = await fetchMetadataById(metadataId);
      setMetadata(md);
      window.alert("Metadata uploaded and linked successfully.");
    } catch (e: any) {
      window.alert(e?.message ?? "Failed to upload metadata");
    } finally {
      setIsReuploadingMetadata(false);
    }
  }

  const isSeller = Boolean(address && listing && address.toLowerCase() === listing.seller.toLowerCase());
  const isBuyer = Boolean(address && listing && address.toLowerCase() === listing.buyer.toLowerCase());
  const isArbiter = Boolean(
    address &&
      typeof arbiterAddress === "string" &&
      arbiterAddress !== zeroAddress &&
      address.toLowerCase() === arbiterAddress.toLowerCase()
  );

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
    try {
      const hash = await tx;
      setPendingHash(hash);
    } catch (e: any) {
      toastTx.fail(e?.shortMessage ?? e?.message ?? "Transaction failed");
    }
  }

  // IMPORTANT: do not return early before hooks above run.
  // Route params can be undefined on the first render, then become defined.
  // Returning early before all hooks would change hook order between renders.
  if (!listingId) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">Invalid listing id.</CardContent>
      </Card>
    );
  }

  if (listingReadError) {
    return (
      <Card>
        <CardContent className="p-6 space-y-2">
          <div className="text-sm font-semibold">Failed to load listing</div>
          <div className="text-sm text-muted-foreground break-words">
            {listingReadError?.shortMessage ?? listingReadError?.message ?? "RPC request failed"}
          </div>
          <div className="text-xs text-muted-foreground break-words">
            This is commonly caused by a rate-limited RPC URL (for example Infura 429). Set a higher-limit
            `NEXT_PUBLIC_SEPOLIA_RPC_URL` and restart `npm run dev`.
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!loadingListing && !listing) {
    return (
      <Card>
        <CardContent className="p-6 space-y-2">
          <div className="text-sm font-semibold">Listing not found</div>
          <div className="text-sm text-muted-foreground break-words">
            The listing could not be loaded from the registry.
          </div>
          <div className="text-xs text-muted-foreground break-words">Listing id: {listingId}</div>
        </CardContent>
      </Card>
    );
  }

  if (!loadingListing && !listing) {
    return (
      <Card>
        <CardContent className="p-6 space-y-2">
          <div className="text-sm font-semibold">Listing not found</div>
          <div className="text-sm text-muted-foreground break-words">
            The listing could not be loaded from the registry.
          </div>
          <div className="text-xs text-muted-foreground break-words">Listing id: {listingId}</div>
        </CardContent>
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
            <span>{metadata?.title ?? (listing ? saleTypeLabel(listing.saleType) : "Loading…")}</span>
            {listing ? <Badge variant="outline">{statusLabel(listing.status)}</Badge> : null}
          </CardTitle>
          {listing ? (
            <CardDescription className="text-sm">
              {metadata?.description ?? listing.metadataURI}
            </CardDescription>
          ) : (
            <div className="text-sm text-muted-foreground break-all">
              <Skeleton className="h-4 w-64" />
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {loadingListing || !listing ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-40" />
            </div>
          ) : (
            <>
              {isSeller && metadataId && !metadata ? (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="text-sm font-medium">Metadata not found in backend</div>
                  <div className="text-xs text-muted-foreground break-words">
                    This listing references metadata id {metadataId}, but the backend returned 404.
                    You can re-upload the original metadata to restore title/description/image.
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isReuploadingMetadata}
                    onClick={reuploadMissingMetadata}
                  >
                    {isReuploadingMetadata ? "Uploading…" : "Re-upload metadata"}
                  </Button>
                </div>
              ) : null}

              {metadata?.image ? (
                <div className="overflow-hidden rounded-md border bg-muted">
                  <img src={metadata.image} alt={metadata.title ?? "Listing image"} className="w-full object-cover" />
                </div>
              ) : null}

              {metadata?.image ? (
                <div className="truncate text-xs text-muted-foreground">Image: {metadata.image}</div>
              ) : null}

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

                {listing.status === 4 && isSeller ? (
                  <div className="rounded-md border p-4 text-sm space-y-2">
                    <div className="font-medium">Pending delivery</div>
                    <div className="text-muted-foreground">
                      The buyer has funded escrow. The listing completes only when the buyer clicks
                      <span className="font-medium"> Confirm Delivery</span> on this page.
                    </div>
                    <div className="text-muted-foreground">
                      After completion, withdraw your payout from the <Link className="underline" href="/dashboard">Dashboard</Link>.
                    </div>
                    {listing.buyer !== zeroAddress ? (
                      <div className="text-xs text-muted-foreground">Buyer: {shortenHex(listing.buyer)}</div>
                    ) : null}
                  </div>
                ) : null}

                {listing.status === 4 && isArbiter ? (
                  <div className="rounded-md border p-4 text-sm space-y-3">
                    <div className="font-medium">Arbiter actions</div>
                    <div className="text-muted-foreground">
                      Use these only to resolve a dispute when delivery cannot be confirmed.
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={receipt.isLoading}
                        onClick={() => send(writeContractAsync({
                          address: env.marketplaceRegistryAddress,
                          abi: marketplaceRegistryAbi,
                          functionName: "arbiterRelease",
                          args: [listingId],
                        }))}
                      >
                        Release to seller
                      </Button>
                      <Button
                        variant="outline"
                        disabled={receipt.isLoading}
                        onClick={() => send(writeContractAsync({
                          address: env.marketplaceRegistryAddress,
                          abi: marketplaceRegistryAbi,
                          functionName: "arbiterRefund",
                          args: [listingId],
                        }))}
                      >
                        Refund buyer
                      </Button>
                    </div>
                  </div>
                ) : null}

                {listing.status === 5 && isSeller ? (
                  <div className="rounded-md border p-4 text-sm space-y-3">
                    <div className="font-medium">Completed</div>
                    <div className="text-muted-foreground">
                      Funds are now credited in EscrowVault. Withdraw them to your wallet.
                    </div>
                    <Button
                      variant="outline"
                      disabled={receipt.isLoading}
                      onClick={() => send(writeContractAsync({
                        address: env.marketplaceRegistryAddress,
                        abi: marketplaceRegistryAbi,
                        functionName: "withdrawPayout",
                        args: [listing.token],
                      }))}
                    >
                      Withdraw payout
                    </Button>
                    <div className="text-xs text-muted-foreground">
                      Note: this withdraws all your credits for this token (not only this listing).
                    </div>
                  </div>
                ) : null}

                {listing.status === 6 && isBuyer ? (
                  <div className="rounded-md border p-4 text-sm space-y-3">
                    <div className="font-medium">Refunded</div>
                    <div className="text-muted-foreground">
                      Your funds were refunded into EscrowVault credits. Withdraw them to your wallet.
                    </div>
                    <Button
                      variant="outline"
                      disabled={receipt.isLoading}
                      onClick={() => send(writeContractAsync({
                        address: env.marketplaceRegistryAddress,
                        abi: marketplaceRegistryAbi,
                        functionName: "withdrawPayout",
                        args: [listing.token],
                      }))}
                    >
                      Withdraw refund
                    </Button>
                    <div className="text-xs text-muted-foreground">
                      Note: this withdraws all your credits for this token (not only this listing).
                    </div>
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
                  <div className="font-medium">
                    <Link className="underline" href={`/seller/${listing.seller}`}>
                      {shortenHex(listing.seller)}
                    </Link>
                  </div>
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
