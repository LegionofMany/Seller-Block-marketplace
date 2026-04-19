"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { type Address, type Hex, isAddress, parseEther, zeroAddress } from "viem";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWalletClient, useWriteContract } from "wagmi";
import { toast } from "sonner";

import { useAuth } from "@/components/providers/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

import { getChainConfigByKey, getEnv } from "@/lib/env";
import { marketplaceRegistryAbi } from "@/lib/contracts/abi/MarketplaceRegistry";
import { marketplaceSettlementV2Abi } from "@/lib/contracts/abi/MarketplaceSettlementV2";
import { erc20Abi } from "@/lib/contracts/abi/ERC20";
import { raffleModuleAbi } from "@/lib/contracts/abi/RaffleModule";
import { parseListing } from "@/lib/contracts/parse";
import { isNativeToken, saleTypeLabel, statusLabel } from "@/lib/contracts/types";
import { formatPrice, shortenHex } from "@/lib/format";
import { useToastTx } from "@/lib/hooks/useToastTx";
import { buildListingHref } from "@/lib/listings";
import { fetchMetadataById, fetchMetadataByUri, getRenderableListingImage, hasCompleteMarketplaceMetadata, isSmokeMetadataUri, LISTING_FALLBACK_IMAGE, metadataIdFromUri, type MarketplaceMetadata } from "@/lib/metadata";
import { fetchJson } from "@/lib/api";
import { addBlockedSeller } from "@/lib/blocks";
import { describeToken } from "@/lib/tokens";
import {
  fetchLatestSellerOrder,
  prepareBuyerAcceptance,
  prepareEscrowAction,
  prepareSellerOrder,
  publishSellerOrder,
  relayAcceptWithPermit,
  relayEscrowAction,
  type ListingOrderIntent,
} from "@/lib/settlement";

function asBytes32(value: string): Hex | null {
  if (!value?.startsWith("0x")) return null;
  if (value.length !== 66) return null;
  return value as Hex;
}

type ListingComment = {
  id: number;
  listingId: string;
  listingChainKey: string;
  authorAddress: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  authorDisplayName?: string | null;
};

const ZERO_BYTES32 = ("0x" + "00".repeat(32)) as Hex;

const erc20PermitNonceAbi = [
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

function settlementEscrowStatusLabel(status: number) {
  switch (status) {
    case 1:
      return "Funded";
    case 2:
      return "Released";
    case 3:
      return "Refunded";
    default:
      return "Not funded";
  }
}

export default function ListingDetailPage() {
  const searchParams = useSearchParams();
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

  const params = useParams<{ id: string }>();
  const id = params?.id;
  const listingId = asBytes32(id);
  const chainKey = searchParams.get("chain") ?? env.defaultChain.key;
  const activeChain = getChainConfigByKey(env, chainKey);
  const registryAddress = activeChain.marketplaceRegistryAddress;
  const settlementAddress = activeChain.marketplaceSettlementV2Address;
  const auctionModuleAddress = activeChain.auctionModuleAddress;
  const raffleModuleAddress = activeChain.raffleModuleAddress;

  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();
  const auth = useAuth();

  const [bidAmount, setBidAmount] = React.useState("");
  const [ticketCount, setTicketCount] = React.useState("1");
  const [reveal, setReveal] = React.useState<Hex>(ZERO_BYTES32);

  const { data: raw, isLoading, isError, error } = useReadContract({
    address: registryAddress,
    chainId: activeChain.chainId,
    abi: marketplaceRegistryAbi,
    functionName: "listings",
    args: listingId ? [listingId] : undefined,
    query: { enabled: Boolean(listingId), retry: 1 },
  });

  const loadingListing = isLoading;

  const listingReadError: any = isError ? (error as any) : null;
  const listing = raw ? parseListing(raw) : null;
  const hiddenSmokeListing = Boolean(listing && isSmokeMetadataUri(listing.metadataURI));
  const native = listing ? isNativeToken(listing.token as Address) : true;

  const { data: arbiterAddress } = useReadContract({
    address: registryAddress,
    chainId: activeChain.chainId,
    abi: marketplaceRegistryAbi,
    functionName: "arbiter",
    query: { retry: 1 },
  });

  const [metadata, setMetadata] = React.useState<MarketplaceMetadata | null>(null);
  const [isReuploadingMetadata, setIsReuploadingMetadata] = React.useState(false);
  const [comments, setComments] = React.useState<ListingComment[]>([]);
  const [commentsError, setCommentsError] = React.useState<string | null>(null);
  const [isLoadingComments, setIsLoadingComments] = React.useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = React.useState(false);
  const [isFavorite, setIsFavorite] = React.useState(false);
  const [isFavoriteLoading, setIsFavoriteLoading] = React.useState(false);
  const [commentDraft, setCommentDraft] = React.useState("");
  const [sellerOrder, setSellerOrder] = React.useState<ListingOrderIntent | null>(null);
  const [sellerOrderError, setSellerOrderError] = React.useState<string | null>(null);
  const [isLoadingSellerOrder, setIsLoadingSellerOrder] = React.useState(false);
  const [isPublishingSellerOrder, setIsPublishingSellerOrder] = React.useState(false);
  const [isRelayingSettlementAction, setIsRelayingSettlementAction] = React.useState(false);

  const settlementToken = React.useMemo(
    () => (listing ? describeToken(env, activeChain.chainId, listing.token as Address) : null),
    [activeChain.chainId, env, listing]
  );

  const galleryImages = React.useMemo(() => {
    const items = Array.isArray(metadata?.images) && metadata.images.length
      ? metadata.images
      : metadata?.image
        ? [metadata.image]
        : [];
    const normalized = Array.from(new Set(items.filter(Boolean).map((item) => getRenderableListingImage(item))));
    return normalized.length ? normalized : [LISTING_FALLBACK_IMAGE];
  }, [metadata?.image, metadata?.images]);

  const metadataId = React.useMemo(() => {
    if (!listing?.metadataURI) return null;
    return metadataIdFromUri(listing.metadataURI);
  }, [listing?.metadataURI]);

  React.useEffect(() => {
    async function run() {
      if (!listingId) return;
      try {
        setIsLoadingComments(true);
        setCommentsError(null);
        const res = await fetchJson<{ items: ListingComment[] }>(
          `/listings/${listingId}/comments?chain=${encodeURIComponent(activeChain.key)}&limit=50&offset=0`,
          { timeoutMs: 10_000 }
        );
        setComments(res.items ?? []);
      } catch (e: any) {
        setCommentsError(e?.message ?? "Failed to load comments");
      } finally {
        setIsLoadingComments(false);
      }
    }

    void run();
  }, [listingId, activeChain.key]);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!listingId || !auth.isAuthenticated) {
        setIsFavorite(false);
        return;
      }

      try {
        setIsFavoriteLoading(true);
        const res = await fetchJson<{ isFavorite: boolean }>(`/favorites/listings/${listingId}/state?chain=${encodeURIComponent(activeChain.key)}`, {
          timeoutMs: 5_000,
        });
        if (!cancelled) setIsFavorite(Boolean(res.isFavorite));
      } catch {
        if (!cancelled) setIsFavorite(false);
      } finally {
        if (!cancelled) setIsFavoriteLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [activeChain.key, auth.isAuthenticated, listingId]);

  const refreshSellerOrder = React.useCallback(async () => {
    if (!listingId || !listing || listing.saleType !== 0) {
      setSellerOrder(null);
      setSellerOrderError(null);
      return;
    }

    try {
      setIsLoadingSellerOrder(true);
      setSellerOrderError(null);
      const res = await fetchLatestSellerOrder(listingId, activeChain.key);
      setSellerOrder(res.item);
    } catch (e: any) {
      setSellerOrder(null);
      setSellerOrderError(e?.message ?? "Failed to load seller order");
    } finally {
      setIsLoadingSellerOrder(false);
    }
  }, [activeChain.key, listing, listingId]);

  React.useEffect(() => {
    void refreshSellerOrder();
  }, [refreshSellerOrder]);

  const { data: permitNonce } = useReadContract({
    address: listing?.token,
    chainId: activeChain.chainId,
    abi: erc20PermitNonceAbi,
    functionName: "nonces",
    args: listing && !native && address ? [address as Address] : undefined,
    query: {
      enabled: Boolean(listing && !native && address),
      retry: 1,
    },
  });

  const { data: consumedSellerOrder } = useReadContract({
    address: settlementAddress,
    chainId: activeChain.chainId,
    abi: marketplaceSettlementV2Abi,
    functionName: "consumedOrders",
    args: sellerOrder ? [sellerOrder.orderHash] : undefined,
    query: {
      enabled: Boolean(sellerOrder),
      retry: 1,
    },
  });

  const { data: buyerEscrowId } = useReadContract({
    address: settlementAddress,
    chainId: activeChain.chainId,
    abi: marketplaceSettlementV2Abi,
    functionName: "computeEscrowId",
    args: sellerOrder && address ? [sellerOrder.orderHash, address as Address] : undefined,
    query: {
      enabled: Boolean(sellerOrder && address),
      retry: 1,
    },
  });

  const { data: settlementEscrowRaw } = useReadContract({
    address: settlementAddress,
    chainId: activeChain.chainId,
    abi: marketplaceSettlementV2Abi,
    functionName: "escrows",
    args: buyerEscrowId ? [buyerEscrowId] : undefined,
    query: {
      enabled: Boolean(buyerEscrowId),
      retry: 1,
    },
  });

  const settlementEscrow = React.useMemo(() => {
    if (!settlementEscrowRaw) return null;
    const tuple = settlementEscrowRaw as any;
    return {
      orderHash: (tuple.orderHash ?? tuple[0]) as Hex,
      listingId: (tuple.listingId ?? tuple[1]) as Hex,
      seller: (tuple.seller ?? tuple[2]) as Address,
      buyer: (tuple.buyer ?? tuple[3]) as Address,
      token: (tuple.token ?? tuple[4]) as Address,
      amount: (tuple.amount ?? tuple[5]) as bigint,
      status: Number(tuple.status ?? tuple[6]),
    };
  }, [settlementEscrowRaw]);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      setMetadata(null);
      if (!listing?.metadataURI) return;
      try {
        const id = metadataIdFromUri(listing.metadataURI);
        const md = id ? await fetchMetadataById(id) : await fetchMetadataByUri(listing.metadataURI);
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

  async function blockSeller() {
    if (!address) {
      toast.error("Connect your wallet to block a seller.");
      return;
    }
    if (!walletClient) {
      toast.error("Wallet client not available.");
      return;
    }
    if (!listing) return;

    const blocker = address;
    const blocked = listing.seller as Address;
    const issuedAt = Date.now();

    const message = [
      "Seller-Block Marketplace",
      "Action: Block user",
      `Blocker: ${blocker}`,
      `Blocked: ${blocked}`,
      `IssuedAt: ${new Date(issuedAt).toISOString()}`,
    ].join("\n");

    try {
      const signature = await walletClient.signMessage({ message });
      await fetchJson<{ ok: true }>("/safety/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocker, blocked, signature, issuedAt }),
        timeoutMs: 7_000,
      });
    } catch (e: any) {
      // If backend is down, we still want local blocking to work.
      toast.error(e?.message ?? "Failed to save block on backend");
    }

    addBlockedSeller(blocker, blocked);
    toast.success("Seller blocked locally");
  }

  async function reportListing() {
    if (!listingId) return;
    const reasonRaw = window
      .prompt("Report reason: spam, prohibited, scam, duplicate, harassment, other", "spam")
      ?.trim()
      .toLowerCase();
    if (!reasonRaw) return;
    const allowed = new Set(["spam", "prohibited", "scam", "duplicate", "harassment", "other"]);
    if (!allowed.has(reasonRaw)) {
      toast.error("Invalid report reason");
      return;
    }
    const details = window.prompt("Optional details (max 1000 chars)")?.trim();

    const issuedAt = Date.now();

    try {
      if (address && walletClient) {
        const message = [
          "Seller-Block Marketplace",
          "Action: Report",
          `Reporter: ${address}`,
          "TargetType: listing",
          `TargetId: ${listingId}`,
          `Reason: ${reasonRaw}`,
          `IssuedAt: ${new Date(issuedAt).toISOString()}`,
        ].join("\n");

        const signature = await walletClient.signMessage({ message });
        await fetchJson<{ ok: true; id: string }>("/safety/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reporter: address,
            signature,
            issuedAt,
            targetType: "listing",
            targetId: listingId,
            chainKey: activeChain.key,
            reason: reasonRaw,
            ...(details ? { details: details.slice(0, 1000) } : {}),
          }),
          timeoutMs: 7_000,
        });
      } else {
        await fetchJson<{ ok: true; id: string }>("/safety/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetType: "listing",
            targetId: listingId,
            chainKey: activeChain.key,
            reason: reasonRaw,
            ...(details ? { details: details.slice(0, 1000) } : {}),
          }),
          timeoutMs: 7_000,
        });
      }

      toast.success("Report submitted");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to submit report");
    }
  }

  async function submitComment() {
    const body = commentDraft.trim();
    if (!listingId || !body) return;
    if (!auth.isAuthenticated) {
      toast.error("Sign in with your wallet to comment");
      return;
    }

    try {
      setIsSubmittingComment(true);
      const res = await fetchJson<{ item: ListingComment }>(
        `/listings/${listingId}/comments?chain=${encodeURIComponent(activeChain.key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
          timeoutMs: 10_000,
        }
      );
      setCommentDraft("");
      setComments((current) => [...current, res.item]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to post comment");
    } finally {
      setIsSubmittingComment(false);
    }
  }

  async function toggleFavorite() {
    if (!listingId) return;
    if (!auth.isAuthenticated) {
      toast.error("Sign in first to save favorites");
      return;
    }

    try {
      setIsFavoriteLoading(true);
      if (isFavorite) {
        await fetchJson(`/favorites/listings/${listingId}?chain=${encodeURIComponent(activeChain.key)}`, { method: "DELETE" });
        setIsFavorite(false);
        toast.success("Removed from favorites");
      } else {
        await fetchJson("/favorites/listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId, chainKey: activeChain.key }),
        });
        setIsFavorite(true);
        toast.success("Saved to favorites");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update favorites");
    } finally {
      setIsFavoriteLoading(false);
    }
  }

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

  const canUseGaslessSettlement = Boolean(listing && listing.saleType === 0 && !native);
  const hasActiveSellerOrder = Boolean(sellerOrder && sellerOrder.expiry * 1000 > Date.now());
  const hasConsumedSellerOrder = Boolean(consumedSellerOrder);
  const buyerHasFundedEscrow = Boolean(
    settlementEscrow &&
      settlementEscrow.status === 1 &&
      address &&
      settlementEscrow.buyer.toLowerCase() === address.toLowerCase()
  );
  const settlementPendingForSeller = Boolean(settlementEscrow && settlementEscrow.status === 1 && isSeller);

  async function publishGaslessSellerOrder() {
    if (!listingId || !walletClient || !address || !auth.isAuthenticated || !listing) {
      toast.error("Connect, sign in, and open the listing as the seller first");
      return;
    }

    try {
      setIsPublishingSellerOrder(true);
      const prepared = await prepareSellerOrder(listingId, activeChain.key, {});
      const signature = await walletClient.signTypedData({
        account: address as Address,
        domain: prepared.domain as any,
        types: prepared.types as any,
        primaryType: prepared.primaryType as any,
        message: prepared.message as any,
      });
      const res = await publishSellerOrder(listingId, activeChain.key, prepared.message, signature);
      setSellerOrder(res.item);
      toast.success("Gasless checkout published");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to publish gasless checkout");
    } finally {
      setIsPublishingSellerOrder(false);
    }
  }

  async function acceptGaslessOrder() {
    if (!listingId || !walletClient || !address || !auth.isAuthenticated || !sellerOrder || !settlementToken) {
      toast.error("Connect and sign in before buying");
      return;
    }
    if (settlementToken.isNative) {
      toast.error("Gasless settlement currently supports permit-enabled ERC20 listings only");
      return;
    }
    if (permitNonce == null) {
      toast.error("This token does not expose permit nonces for gasless checkout");
      return;
    }

    try {
      setIsRelayingSettlementAction(true);
      const prepared = await prepareBuyerAcceptance(listingId, activeChain.key, { orderHash: sellerOrder.orderHash });
      const buyerSignature = await walletClient.signTypedData({
        account: address as Address,
        domain: prepared.domain as any,
        types: prepared.types as any,
        primaryType: prepared.primaryType as any,
        message: prepared.message as any,
      });

      const permitDeadline = prepared.message.deadline;
      const permitSignature = await walletClient.signTypedData({
        account: address as Address,
        domain: {
          name: settlementToken.permitName ?? settlementToken.name,
          version: settlementToken.permitVersion ?? "1",
          chainId: activeChain.chainId,
          verifyingContract: settlementToken.address,
        } as any,
        types: {
          Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        } as any,
        primaryType: "Permit",
        message: {
          owner: address as Address,
          spender: settlementAddress,
          value: BigInt(sellerOrder.price),
          nonce: permitNonce,
          deadline: BigInt(permitDeadline),
        } as any,
      });

      const relayed = await relayAcceptWithPermit(listingId, activeChain.key, {
        orderHash: prepared.orderHash,
        buyerDeadline: prepared.message.deadline,
        buyerSignature,
        permitSignature,
        permitDeadline,
      });
      setPendingHash(relayed.txHash);
      toast.success("Gasless purchase submitted");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to submit gasless purchase");
    } finally {
      setIsRelayingSettlementAction(false);
    }
  }

  async function relayBuyerEscrowAction(action: "confirm" | "refund") {
    if (!listingId || !walletClient || !address || !auth.isAuthenticated || !sellerOrder) {
      toast.error("Connect and sign in before continuing");
      return;
    }

    try {
      setIsRelayingSettlementAction(true);
      const prepared = await prepareEscrowAction(listingId, activeChain.key, action, { orderHash: sellerOrder.orderHash });
      const buyerSignature = await walletClient.signTypedData({
        account: address as Address,
        domain: prepared.domain as any,
        types: prepared.types as any,
        primaryType: prepared.primaryType as any,
        message: prepared.message as any,
      });
      const relayed = await relayEscrowAction(listingId, activeChain.key, action, {
        orderHash: prepared.orderHash,
        deadline: prepared.message.deadline,
        buyerSignature,
      });
      setPendingHash(relayed.txHash);
      toast.success(action === "confirm" ? "Delivery confirmation submitted" : "Refund request submitted");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to relay buyer action");
    } finally {
      setIsRelayingSettlementAction(false);
    }
  }

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
    chainId: activeChain.chainId,
    abi: erc20Abi,
    functionName: "allowance",
    args:
      !native && address && parsedBidAmount && auctionModuleAddress !== zeroAddress
        ? [address as Address, auctionModuleAddress]
        : undefined,
    query: { enabled: Boolean(!native && address && parsedBidAmount && auctionModuleAddress !== zeroAddress) },
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
    address: raffleModuleAddress,
    chainId: activeChain.chainId,
    abi: raffleModuleAbi,
    functionName: "quoteEntry",
    args:
      listing &&
      listing.saleType === 2 &&
      listing.moduleId !== ("0x" + "00".repeat(32)) &&
      parsedTicketCount &&
      raffleModuleAddress !== zeroAddress
        ? [listing.moduleId, parsedTicketCount]
        : undefined,
    query: {
      enabled: Boolean(
        listing &&
          listing.saleType === 2 &&
          listing.moduleId !== ("0x" + "00".repeat(32)) &&
          parsedTicketCount &&
          raffleModuleAddress !== zeroAddress
      ),
    },
  });

  const { data: raffleAllowance } = useReadContract({
    address: (listing?.token ?? zeroAddress) as Address,
    chainId: activeChain.chainId,
    abi: erc20Abi,
    functionName: "allowance",
    args:
      listing &&
      !native &&
      address &&
      typeof raffleQuote === "bigint" &&
      raffleModuleAddress !== zeroAddress
        ? [address as Address, raffleModuleAddress]
        : undefined,
    query: { enabled: Boolean(listing && !native && address && typeof raffleQuote === "bigint" && raffleModuleAddress !== zeroAddress) },
  });

  const raffleApproved = !native && typeof raffleAllowance === "bigint" && typeof raffleQuote === "bigint" ? raffleAllowance >= raffleQuote : false;

  const [pendingHash, setPendingHash] = React.useState<`0x${string}` | undefined>();
  const toastTx = useToastTx(pendingHash, "Transaction pending");
  const receipt = useWaitForTransactionReceipt({ chainId: activeChain.chainId, hash: pendingHash, query: { enabled: Boolean(pendingHash) } });

  React.useEffect(() => {
    if (receipt.isSuccess) {
      toastTx.success("Transaction confirmed");
      setPendingHash(undefined);
      void refreshSellerOrder();
    }
    if (receipt.isError) {
      toastTx.fail(receipt.error?.message ?? "Transaction failed");
      setPendingHash(undefined);
    }
  }, [receipt.isSuccess, receipt.isError, receipt.error, refreshSellerOrder, toastTx]);

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
            This is commonly caused by a rate-limited RPC URL. Update the RPC in NEXT_PUBLIC_CHAIN_CONFIG_JSON,
            or set a higher-limit legacy NEXT_PUBLIC_SEPOLIA_RPC_URL, and restart npm run dev.
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

  if (hiddenSmokeListing) {
    return (
      <Card>
        <CardContent className="p-6 space-y-2">
          <div className="text-sm font-semibold">Listing not available</div>
          <div className="text-sm text-muted-foreground break-words">
            This test listing is hidden from the public marketplace experience.
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasCompleteMetadata = hasCompleteMarketplaceMetadata(metadata);

  if (!loadingListing && listing && !hasCompleteMetadata && !isSeller) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="text-sm font-semibold">Listing details unavailable</div>
          <div className="text-sm text-muted-foreground break-words">
            This listing has not finished metadata validation yet, so it is hidden from the public marketplace detail view until the seller restores complete title, description, and image data.
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/marketplace">Back to marketplace</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const pageTitle = metadata?.title ?? (listing ? `${saleTypeLabel(listing.saleType)} listing` : "Loading…");
  const priceLabel = listing ? formatPrice(listing.price, native, activeChain.nativeCurrencySymbol) : "—";
  const locationLabel = [metadata?.city, metadata?.region, metadata?.postalCode].filter(Boolean).join(", ");
  const pageDescription = listing
    ? metadata?.description ?? (isSeller ? "Your listing is missing complete metadata. Restore title, description, and at least one image before sharing it publicly." : "Listing details unavailable.")
    : "Loading listing details...";

  return (
    <div className="space-y-6">
      <section className="market-hero px-4 py-5 sm:px-8 sm:py-8">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr] lg:items-end">
          <div className="space-y-4">
            <div className="market-section-title">Listing detail</div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{pageTitle}</h1>
                {listing ? <Badge variant="outline" className="border-amber-200/80 bg-white/95 text-slate-900">{statusLabel(listing.status)}</Badge> : null}
              </div>
              <p className="max-w-2xl text-[13px] leading-6 text-slate-700 sm:text-base">{pageDescription}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {metadata?.category ? <div className="market-chip border-amber-200/80 bg-white/95 text-slate-900 shadow-sm">{metadata.subcategory ? `${metadata.category} / ${metadata.subcategory}` : metadata.category}</div> : null}
              {locationLabel ? <div className="market-chip border-amber-200/80 bg-white/95 text-slate-900 shadow-sm">{locationLabel}</div> : null}
              <div className="market-chip border-amber-200/80 bg-white/95 text-slate-900 shadow-sm">{priceLabel}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-1">
            <div className="market-stat">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Seller</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">{listing ? shortenHex(listing.seller) : "—"}</div>
            </div>
            <div className="market-stat">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Checkout</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">{listing?.saleType === 0 ? "Fixed price" : saleTypeLabel(listing?.saleType ?? 0)}</div>
            </div>
          </div>
        </div>
      </section>

      <Card className="market-panel">
        <CardContent className="space-y-5 p-4 sm:space-y-6 sm:p-6">
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
                    size="lg"
                    className="w-full sm:w-auto"
                    disabled={isReuploadingMetadata}
                    onClick={reuploadMissingMetadata}
                  >
                    {isReuploadingMetadata ? "Uploading…" : "Re-upload metadata"}
                  </Button>
                </div>
              ) : null}

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_360px] xl:gap-6">
                <div className="space-y-4 sm:space-y-6">
                  <div className="overflow-hidden rounded-2xl border bg-muted">
                    <div className="relative w-full aspect-[4/3]">
                      <Image
                        src={galleryImages[0]}
                        alt={metadata?.title ?? "Listing image"}
                        fill
                        className="object-cover"
                        sizes="100vw"
                        unoptimized
                        priority={false}
                      />
                    </div>
                  </div>

                  {!metadata ? (
                    <div className="rounded-xl border border-dashed bg-accent/20 p-4 text-sm text-muted-foreground">
                      Listing details are still syncing. Core on-chain data is available, but photos and the full description have not been restored in the metadata service yet.
                    </div>
                  ) : null}

                  {galleryImages.length > 1 ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
                      {galleryImages.map((image, index) => (
                        <div key={`${image}-${index}`} className="overflow-hidden rounded-xl border bg-muted">
                          <div className="relative aspect-square w-full">
                            <Image
                              src={image}
                              alt={`${metadata?.title ?? "Listing"} image ${index + 1}`}
                              fill
                              className="object-cover"
                              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                              unoptimized
                              priority={false}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    {metadata?.category ? (
                      <div className="text-sm">
                        <div className="text-muted-foreground">Category</div>
                        <div className="font-medium">{metadata.subcategory ? `${metadata.category} / ${metadata.subcategory}` : metadata.category}</div>
                      </div>
                    ) : null}
                    {locationLabel ? (
                      <div className="text-sm">
                        <div className="text-muted-foreground">Location</div>
                        <div className="font-medium">{locationLabel}</div>
                      </div>
                    ) : null}
                    <div className="text-sm">
                      <div className="text-muted-foreground">Price</div>
                      <div className="font-medium">{priceLabel}</div>
                    </div>
                    <div className="text-sm">
                      <div className="text-muted-foreground">Token</div>
                      <div className="font-medium break-all">{native ? activeChain.nativeCurrencySymbol : listing.token}</div>
                    </div>
                    <div className="text-sm">
                      <div className="text-muted-foreground">Seller</div>
                      <div className="font-medium">
                        <Link className="underline" href={`/seller/${listing.seller}`}>
                          {shortenHex(listing.seller)}
                        </Link>
                      </div>
                    </div>
                    <div className="text-sm">
                      <div className="text-muted-foreground">Buyer</div>
                      <div className="font-medium">{listing.buyer === zeroAddress ? "—" : shortenHex(listing.buyer)}</div>
                    </div>
                    {metadata?.contactEmail || metadata?.contactPhone ? (
                      <div className="text-sm sm:col-span-2">
                        <div className="text-muted-foreground">Contact</div>
                        <div className="font-medium">{[metadata.contactEmail, metadata.contactPhone].filter(Boolean).join(" • ")}</div>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">Public comments</div>
                        <div className="text-xs text-muted-foreground">Questions and replies stay attached to the listing instead of moving into private inboxes.</div>
                      </div>
                      <div className="text-xs text-muted-foreground">{comments.length} comment{comments.length === 1 ? "" : "s"}</div>
                    </div>

                    <div className="rounded-2xl border p-3 space-y-3 sm:p-4">
                  <Textarea
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder={auth.isAuthenticated ? "Ask a public question about this listing" : "Connect and sign in with your wallet to join the discussion"}
                    rows={4}
                    maxLength={1000}
                    disabled={isSubmittingComment}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-muted-foreground">
                      {auth.isAuthenticated
                        ? "Comments are public and tied to your wallet profile."
                        : address
                          ? "Use wallet sign-in before posting."
                          : "Use the RainbowKit wallet connect button in the header, then sign in to comment."}
                    </div>
                    <div className="flex gap-2">
                      {!auth.isAuthenticated && address ? (
                        <Button type="button" variant="outline" onClick={() => void auth.signIn()} disabled={auth.isLoading}>
                          Sign in with wallet
                        </Button>
                      ) : null}
                      <Button type="button" onClick={() => void submitComment()} disabled={!commentDraft.trim() || isSubmittingComment || !auth.isAuthenticated}>
                        Post comment
                      </Button>
                    </div>
                  </div>
                    </div>

                    <div className="space-y-3">
                  {isLoadingComments ? (
                    <div className="text-sm text-muted-foreground">Loading comments...</div>
                  ) : commentsError ? (
                    <div className="text-sm text-destructive">{commentsError}</div>
                  ) : comments.length === 0 ? (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      No public comments yet.
                    </div>
                  ) : (
                    comments.map((item) => (
                      <div key={item.id} className="rounded-2xl border p-3 space-y-2 sm:p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <div className="font-medium">{item.authorDisplayName?.trim() || shortenHex(item.authorAddress)}</div>
                          <div className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</div>
                        </div>
                        <div className="text-sm whitespace-pre-wrap break-words">{item.body}</div>
                      </div>
                    ))
                  )}
                    </div>
                  </div>
                </div>

                <aside className="space-y-3 sm:space-y-4">
                  <div className="rounded-2xl border bg-accent/25 p-3 space-y-3 sm:p-4">
                    <div>
                      <div className="market-section-title">Buyer actions</div>
                      <div className="mt-1 text-lg font-semibold">Checkout and safety</div>
                    </div>

                {listing.status === 1 && !isSeller ? (
                  <div className="rounded-xl border bg-background/80 p-3 space-y-2 sm:p-4">
                    <div className="text-sm font-medium">Safety</div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button type="button" variant={isFavorite ? "default" : "outline"} size="lg" className="w-full sm:w-auto" disabled={isFavoriteLoading} onClick={() => void toggleFavorite()}>
                        {isFavorite ? "Saved" : "Save favorite"}
                      </Button>
                      {!auth.isAuthenticated ? (
                        <Button asChild type="button" variant="ghost" size="lg" className="w-full sm:w-auto">
                          <Link href="/sign-in">Sign in to save</Link>
                        </Button>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button type="button" variant="outline" size="lg" className="w-full sm:w-auto" onClick={blockSeller}>
                        Block seller
                      </Button>
                      <Button type="button" variant="outline" size="lg" className="w-full sm:w-auto" onClick={reportListing}>
                        Report listing
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border bg-background/80 p-3 space-y-2 sm:p-4">
                    <div className="text-sm font-medium">Safety</div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button type="button" variant={isFavorite ? "default" : "outline"} size="lg" className="w-full sm:w-auto" disabled={isFavoriteLoading} onClick={() => void toggleFavorite()}>
                        {isFavorite ? "Saved" : "Save favorite"}
                      </Button>
                      {!auth.isAuthenticated ? (
                        <Button asChild type="button" variant="ghost" size="lg" className="w-full sm:w-auto">
                          <Link href="/sign-in">Sign in to save</Link>
                        </Button>
                      ) : null}
                    </div>
                    <Button type="button" variant="outline" size="lg" className="w-full sm:w-auto" onClick={reportListing}>
                      Report listing
                    </Button>
                  </div>
                )}

                {listing.status === 1 && isSeller ? (
                  <Button
                    variant="destructive"
                    size="lg"
                    className="w-full sm:w-auto"
                    disabled={receipt.isLoading}
                    onClick={() => send(writeContractAsync({
                      address: registryAddress,
                      chainId: activeChain.chainId,
                      abi: marketplaceRegistryAbi,
                      functionName: "cancelListing",
                      args: [listingId],
                    }))}
                  >
                    Cancel Listing
                  </Button>
                ) : null}

                {listing.saleType === 0 && listing.status === 1 ? (
                  <div className="rounded-xl border bg-background/80 p-3 text-sm space-y-3 sm:p-4">
                    <div className="font-medium">Gasless fixed-price checkout</div>
                    {!canUseGaslessSettlement ? (
                      <div className="text-muted-foreground">
                        This listing is priced in the native token. The V2 relayer flow currently supports permit-enabled ERC20 checkout only.
                      </div>
                    ) : (
                      <>
                        <div className="text-muted-foreground">
                          Sellers publish a signed checkout intent once. Buyers then sign permit and acceptance typed data, and the relayer submits the transaction.
                        </div>

                        {isLoadingSellerOrder ? (
                          <div className="text-muted-foreground">Loading seller checkout intent...</div>
                        ) : sellerOrderError ? (
                          <div className="text-destructive">{sellerOrderError}</div>
                        ) : hasActiveSellerOrder && sellerOrder ? (
                          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="font-medium">Seller order is live</div>
                              <Badge variant="outline">Expires {new Date(sellerOrder.expiry * 1000).toLocaleString()}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground break-all">Order hash: {sellerOrder.orderHash}</div>
                            <div className="text-xs text-muted-foreground">
                              Settlement status: {settlementEscrow ? settlementEscrowStatusLabel(settlementEscrow.status) : hasConsumedSellerOrder ? "Consumed" : "Awaiting buyer"}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-md border border-dashed p-3 text-muted-foreground">
                            No seller checkout intent is published yet.
                          </div>
                        )}

                        {isSeller ? (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            {!auth.isAuthenticated ? (
                              <Button type="button" variant="outline" onClick={() => void auth.signIn()} disabled={auth.isLoading}>
                                Sign in with wallet
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="lg"
                              className="w-full sm:w-auto"
                              disabled={isPublishingSellerOrder || !auth.isAuthenticated || isRelayingSettlementAction}
                              onClick={() => void publishGaslessSellerOrder()}
                            >
                              {isPublishingSellerOrder ? "Publishing..." : hasActiveSellerOrder ? "Refresh signed checkout" : "Publish signed checkout"}
                            </Button>
                          </div>
                        ) : null}

                        {!isSeller ? (
                          <div className="flex flex-col gap-2">
                            {!auth.isAuthenticated && address ? (
                              <Button type="button" variant="outline" onClick={() => void auth.signIn()} disabled={auth.isLoading}>
                                Sign in with wallet
                              </Button>
                            ) : null}

                            {buyerHasFundedEscrow ? (
                              <div className="flex flex-col gap-2 sm:flex-row">
                                <Button
                                  size="lg"
                                  className="w-full sm:w-auto"
                                  disabled={isRelayingSettlementAction || receipt.isLoading}
                                  onClick={() => void relayBuyerEscrowAction("confirm")}
                                >
                                  Confirm Delivery
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="lg"
                                  className="w-full sm:w-auto"
                                  disabled={isRelayingSettlementAction || receipt.isLoading}
                                  onClick={() => void relayBuyerEscrowAction("refund")}
                                >
                                  Request Refund
                                </Button>
                              </div>
                            ) : (
                              <Button
                                type="button"
                                size="lg"
                                className="w-full sm:w-auto"
                                disabled={
                                  !auth.isAuthenticated ||
                                  !hasActiveSellerOrder ||
                                  isRelayingSettlementAction ||
                                  receipt.isLoading ||
                                  permitNonce == null
                                }
                                onClick={() => void acceptGaslessOrder()}
                              >
                                Buy Gaslessly
                              </Button>
                            )}

                            {permitNonce == null ? (
                              <div className="text-xs text-muted-foreground">
                                This token must support ERC-2612 permit for the relayer checkout path.
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {settlementPendingForSeller ? (
                          <div className="rounded-md border bg-muted/30 p-3 text-muted-foreground space-y-1">
                            <div className="font-medium text-foreground">Buyer escrow funded</div>
                            <div>The buyer has funded MarketplaceSettlementV2 and can now confirm delivery or request a refund from this page.</div>
                            {settlementEscrow?.buyer ? <div className="text-xs">Buyer: {shortenHex(settlementEscrow.buyer)}</div> : null}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}

                  </div>

                  <details className="market-details rounded-2xl border p-3 sm:p-4">
                    <summary className="flex items-center justify-between gap-3">
                      <div>
                        <div className="market-section-title">Advanced sale tools</div>
                        <div className="mt-1 text-base font-semibold">Seller, auction, raffle, and settlement controls</div>
                      </div>
                      <div className="text-sm font-medium text-muted-foreground">Expand</div>
                    </summary>
                    <div className="mt-3 space-y-3 sm:mt-4 sm:space-y-4">

                {listing.status === 4 && isBuyer ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      size="lg"
                      className="w-full sm:w-auto"
                      disabled={receipt.isLoading}
                      onClick={() => send(writeContractAsync({
                        address: registryAddress,
                        chainId: activeChain.chainId,
                        abi: marketplaceRegistryAbi,
                        functionName: "confirmDelivery",
                        args: [listingId],
                      }))}
                    >
                      Confirm Delivery
                    </Button>
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full sm:w-auto"
                      disabled={receipt.isLoading}
                      onClick={() => send(writeContractAsync({
                        address: registryAddress,
                        chainId: activeChain.chainId,
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
                  <div className="rounded-xl border p-4 text-sm space-y-2">
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
                  <div className="rounded-xl border p-4 text-sm space-y-3">
                    <div className="font-medium">Arbiter actions</div>
                    <div className="text-muted-foreground">
                      Use these only to resolve a dispute when delivery cannot be confirmed.
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        size="lg"
                        className="w-full sm:w-auto"
                        disabled={receipt.isLoading}
                        onClick={() => send(writeContractAsync({
                          address: registryAddress,
                          chainId: activeChain.chainId,
                          abi: marketplaceRegistryAbi,
                          functionName: "arbiterRelease",
                          args: [listingId],
                        }))}
                      >
                        Release to seller
                      </Button>
                      <Button
                        variant="outline"
                        size="lg"
                        className="w-full sm:w-auto"
                        disabled={receipt.isLoading}
                        onClick={() => send(writeContractAsync({
                          address: registryAddress,
                          chainId: activeChain.chainId,
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
                  <div className="rounded-xl border p-4 text-sm space-y-3">
                    <div className="font-medium">Completed</div>
                    <div className="text-muted-foreground">
                      Funds are now credited in EscrowVault. Withdraw them to your wallet.
                    </div>
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full sm:w-auto"
                      disabled={receipt.isLoading}
                      onClick={() => send(writeContractAsync({
                        address: registryAddress,
                        chainId: activeChain.chainId,
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
                  <div className="rounded-xl border p-4 text-sm space-y-3">
                    <div className="font-medium">Refunded</div>
                    <div className="text-muted-foreground">
                      Your funds were refunded into EscrowVault credits. Withdraw them to your wallet.
                    </div>
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full sm:w-auto"
                      disabled={receipt.isLoading}
                      onClick={() => send(writeContractAsync({
                        address: registryAddress,
                        chainId: activeChain.chainId,
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
                  <div className="rounded-xl border p-4 space-y-3">
                    <div className="text-sm font-medium">Place bid</div>
                    <div className="grid gap-2">
                      <Label>Bid amount {native ? `(${activeChain.nativeCurrencySymbol})` : "(token units)"}</Label>
                      <Input value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} placeholder={native ? "0.05" : "1.0"} />
                    </div>
                    {!native ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          variant="secondary"
                          size="lg"
                          className="w-full sm:w-auto"
                          disabled={receipt.isLoading || !parsedBidAmount || bidApproved || auctionModuleAddress === zeroAddress}
                          onClick={() =>
                            send(
                              writeContractAsync({
                                address: listing.token,
                                chainId: activeChain.chainId,
                                abi: erc20Abi,
                                functionName: "approve",
                                args: [auctionModuleAddress, parsedBidAmount ?? BigInt(0)],
                              })
                            )
                          }
                        >
                          {bidApproved ? "Approved" : "Approve"}
                        </Button>
                        <Button
                          size="lg"
                          className="w-full sm:w-auto"
                          disabled={receipt.isLoading || !parsedBidAmount || !bidApproved}
                          onClick={() =>
                            send(
                              writeContractAsync({
                                address: registryAddress,
                                chainId: activeChain.chainId,
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
                        size="lg"
                        className="w-full sm:w-auto"
                        disabled={receipt.isLoading || !parsedBidAmount}
                        onClick={() =>
                          send(
                            writeContractAsync({
                                address: registryAddress,
                                chainId: activeChain.chainId,
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
                        size="lg"
                        className="w-full sm:w-auto"
                        disabled={receipt.isLoading}
                        onClick={() => send(writeContractAsync({
                          address: registryAddress,
                          chainId: activeChain.chainId,
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
                  <div className="rounded-xl border p-4 space-y-3">
                    <div className="text-sm font-medium">Enter raffle</div>
                    <div className="grid gap-2">
                      <Label>Tickets</Label>
                      <Input value={ticketCount} onChange={(e) => setTicketCount(e.target.value)} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Quote: {typeof raffleQuote === "bigint" ? formatPrice(raffleQuote, native, activeChain.nativeCurrencySymbol) : "—"}
                    </div>

                    {!native ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          variant="secondary"
                          size="lg"
                          className="w-full sm:w-auto"
                          disabled={receipt.isLoading || raffleModuleAddress === zeroAddress || typeof raffleQuote !== "bigint" || raffleApproved}
                          onClick={() =>
                            send(
                              writeContractAsync({
                                address: listing.token,
                                chainId: activeChain.chainId,
                                abi: erc20Abi,
                                functionName: "approve",
                                args: [raffleModuleAddress, (raffleQuote as bigint) ?? BigInt(0)],
                              })
                            )
                          }
                        >
                          {raffleApproved ? "Approved" : "Approve"}
                        </Button>
                        <Button
                          size="lg"
                          className="w-full sm:w-auto"
                          disabled={receipt.isLoading || typeof raffleQuote !== "bigint" || !raffleApproved || !parsedTicketCount}
                          onClick={() =>
                            send(
                              writeContractAsync({
                                address: registryAddress,
                                chainId: activeChain.chainId,
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
                        size="lg"
                        className="w-full sm:w-auto"
                        disabled={receipt.isLoading || typeof raffleQuote !== "bigint" || !parsedTicketCount}
                        onClick={() =>
                          send(
                            writeContractAsync({
                                address: registryAddress,
                                chainId: activeChain.chainId,
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
                          size="lg"
                          className="w-full sm:w-auto"
                          disabled={receipt.isLoading}
                          onClick={() => send(writeContractAsync({
                            address: registryAddress,
                            chainId: activeChain.chainId,
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

                <div className="rounded-xl border p-4">
                  <div className="text-sm font-medium">Withdraw payout credits</div>
                  <div className="font-medium">
                    <Link className="underline" href={`/seller/${listing.seller}`}>
                      {shortenHex(listing.seller)}
                    </Link>
                  </div>
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full sm:w-auto"
                      disabled={receipt.isLoading}
                      onClick={() => send(writeContractAsync({
                        address: registryAddress,
                        chainId: activeChain.chainId,
                        abi: marketplaceRegistryAbi,
                        functionName: "withdrawPayout",
                        args: [zeroAddress],
                      }))}
                    >
                      Withdraw native payout
                    </Button>
                  </div>
                </div>
                    </div>
                  </details>
                </aside>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
