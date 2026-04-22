"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  decodeEventLog,
  isAddress,
  keccak256,
  type Address,
  type Hex,
  zeroAddress,
} from "viem";
import { useChainId, usePublicClient, useWriteContract } from "wagmi";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccentCallout } from "@/components/ui/accent-callout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { fetchJson } from "@/lib/api";
import { describeToken, getDefaultSettlementToken, getPublicNetworkLabel, getTokenOptions, parseTokenAmount } from "@/lib/tokens";
import { getChainConfigById, getEnv } from "@/lib/env";
import { buildListingHref } from "@/lib/listings";
import { CATEGORY_TREE, subcategoriesFor } from "@/lib/categories";

const createListingAbi = [
  {
    type: "function",
    name: "createListing",
    stateMutability: "nonpayable",
    inputs: [
      { name: "metadataURI", type: "string" },
      { name: "price", type: "uint256" },
      { name: "token", type: "address" },
      { name: "saleType", type: "uint8" },
    ],
    outputs: [{ name: "listingId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "openAuction",
    stateMutability: "nonpayable",
    inputs: [
      { name: "listingId", type: "bytes32" },
      { name: "startTime", type: "uint64" },
      { name: "endTime", type: "uint64" },
      { name: "reservePrice", type: "uint256" },
      { name: "minBidIncrement", type: "uint256" },
      { name: "extensionWindow", type: "uint64" },
      { name: "extensionSeconds", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "openRaffle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "listingId", type: "bytes32" },
      { name: "startTime", type: "uint64" },
      { name: "endTime", type: "uint64" },
      { name: "ticketPrice", type: "uint256" },
      { name: "targetAmount", type: "uint256" },
      { name: "minParticipants", type: "uint32" },
      { name: "commit", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "ListingCreated",
    anonymous: false,
    inputs: [
      { indexed: true, name: "id", type: "bytes32" },
      { indexed: false, name: "seller", type: "address" },
      { indexed: false, name: "saleType", type: "uint8" },
      { indexed: false, name: "token", type: "address" },
      { indexed: false, name: "price", type: "uint256" },
      { indexed: false, name: "metadataURI", type: "string" },
    ],
  },
] as const;

type SaleType = 0 | 1 | 2;

type CreateListingDraft = {
  saleType: SaleType;
  title: string;
  description: string;
  tokenAddress: string;
  category: string;
  subcategory: string;
  city: string;
  region: string;
  postalCode: string;
  contactEmail: string;
  contactPhone: string;
  fixedPrice: string;
  auctionStart: string;
  auctionEnd: string;
  reservePrice: string;
  minBidIncrement: string;
  extensionWindow: string;
  extensionSeconds: string;
  raffleStart: string;
  raffleEnd: string;
  ticketPrice: string;
  targetAmount: string;
  minParticipants: string;
  reveal: Hex;
};

type UploadResponse = {
  items: Array<{ ipfsUri: string; url: string }>;
};

type PublishRecoveryStage = "metadata-ready" | "auction-pending" | "raffle-pending";

type PublishRecovery = {
  metadataURI: string;
  chainKey: string;
  saleType: SaleType;
  tokenAddress: string;
  listingId?: Hex;
  stage: PublishRecoveryStage;
  updatedAt: number;
  errorMessage?: string | null;
};

type ReceiptLogLike = {
  data: Hex;
  topics: [Hex, ...Hex[]] | [];
};

const CREATE_DRAFT_KEY = "seller-block.create-listing-draft.v1";
const CREATE_PUBLISH_RECOVERY_KEY = "seller-block.create-listing-recovery.v1";

function nowPlus(minutes: number) {
  return new Date(Date.now() + minutes * 60_000);
}

function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toUnixSeconds(value: string): bigint {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error("Invalid date/time");
  return BigInt(Math.floor(ms / 1000));
}

function parseBytes32(value: string): Hex {
  if (!value?.startsWith("0x") || value.length !== 66) throw new Error("Reveal must be bytes32 (0x + 64 hex chars)");
  return value as Hex;
}

async function uploadImagesWithProgress(
  backendUrl: string,
  files: File[],
  onProgress: (percent: number) => void
): Promise<UploadResponse> {
  const request = new XMLHttpRequest();
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const file of files.slice(0, 12)) form.append("files", file);

    request.open("POST", `${backendUrl.replace(/\/$/, "")}/uploads/images`);
    request.responseType = "json";
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.max(1, Math.min(100, Math.round((event.loaded / event.total) * 100))));
    };
    request.onerror = () => reject(new Error("Image upload failed"));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(request.response as UploadResponse);
        return;
      }

      const message =
        typeof request.response?.message === "string"
          ? request.response.message
          : typeof request.responseText === "string" && request.responseText.trim()
            ? request.responseText.trim()
            : `Upload failed (${request.status})`;
      reject(new Error(message));
    };
    request.send(form);
  });
}

function getErrorMessage(error: unknown, fallback: string) {
  const candidate = error as { shortMessage?: unknown; message?: unknown } | null;
  const message = candidate?.shortMessage ?? candidate?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function getRecoveryActionLabel(recovery: PublishRecovery) {
  return recovery.stage === "metadata-ready"
    ? "Retry publish without re-uploading photos"
    : recovery.stage === "auction-pending"
      ? "Finish auction publish"
      : "Finish raffle publish";
}

function mergeSelectedFiles(current: File[], incoming: File[]): File[] {
  const merged = [...current];
  for (const file of incoming) {
    const duplicate = merged.some(
      (item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified
    );
    if (!duplicate) merged.push(file);
    if (merged.length >= 12) break;
  }
  return merged.slice(0, 12);
}

function getReceiptLogs(receipt: unknown): ReceiptLogLike[] {
  if (!receipt || typeof receipt !== "object") return [];
  const logs = (receipt as { logs?: unknown }).logs;
  if (!Array.isArray(logs)) return [];

  return logs.flatMap((log) => {
    if (!log || typeof log !== "object") return [];
    const candidate = log as { data?: unknown; topics?: unknown };
    if (typeof candidate.data !== "string" || !Array.isArray(candidate.topics)) return [];
    if (!candidate.topics.every((topic) => typeof topic === "string")) return [];
    const topics = candidate.topics as Hex[];
    return [{ data: candidate.data as Hex, topics: topics.length ? [topics[0], ...topics.slice(1)] : [] }];
  });
}

function getListingCreatedId(receipt: unknown): Hex | null {
  for (const log of getReceiptLogs(receipt)) {
    try {
      const decoded = decodeEventLog({ abi: createListingAbi, data: log.data, topics: log.topics });
      if (decoded.eventName !== "ListingCreated") continue;
      const args = decoded.args as Record<string, unknown>;
      if (typeof args.id === "string") return args.id as Hex;
    } catch {
      // ignore non-matching logs
    }
  }
  return null;
}

export default function CreateListingPage() {
  const router = useRouter();
  const publicClient = usePublicClient();
  const walletChainId = useChainId();
  const { writeContractAsync } = useWriteContract();

  const [saleType, setSaleType] = React.useState<SaleType>(0);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [generatedMetadataURI, setGeneratedMetadataURI] = React.useState<string>("");
  const [tokenAddress, setTokenAddress] = React.useState<string>("");

  const [category, setCategory] = React.useState("");
  const [subcategory, setSubcategory] = React.useState("");
  const [city, setCity] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [postalCode, setPostalCode] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  const [contactPhone, setContactPhone] = React.useState("");

  const [fixedPrice, setFixedPrice] = React.useState("0.01");

  const [auctionStart, setAuctionStart] = React.useState(toDatetimeLocalValue(nowPlus(0)));
  const [auctionEnd, setAuctionEnd] = React.useState(toDatetimeLocalValue(nowPlus(60 * 24)));
  const [reservePrice, setReservePrice] = React.useState("0.01");
  const [minBidIncrement, setMinBidIncrement] = React.useState("0.001");
  const [extensionWindow, setExtensionWindow] = React.useState("300");
  const [extensionSeconds, setExtensionSeconds] = React.useState("300");

  const [raffleStart, setRaffleStart] = React.useState(toDatetimeLocalValue(nowPlus(0)));
  const [raffleEnd, setRaffleEnd] = React.useState(toDatetimeLocalValue(nowPlus(60 * 24)));
  const [ticketPrice, setTicketPrice] = React.useState("0.001");
  const [targetAmount, setTargetAmount] = React.useState("0.01");
  const [minParticipants, setMinParticipants] = React.useState("2");
  const ZERO_BYTES32 = ("0x" + "00".repeat(32)) as Hex;
  const [reveal, setReveal] = React.useState<Hex>(ZERO_BYTES32);
  const [previewUrls, setPreviewUrls] = React.useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<number>(0);
  const [uploadStage, setUploadStage] = React.useState<"idle" | "uploading" | "publishing">("idle");
  const [lastUploadError, setLastUploadError] = React.useState<string | null>(null);
  const [draftLoaded, setDraftLoaded] = React.useState(false);
  const [draftRestored, setDraftRestored] = React.useState(false);
  const [lastDraftSavedAt, setLastDraftSavedAt] = React.useState<number | null>(null);
  const [publishRecovery, setPublishRecovery] = React.useState<PublishRecovery | null>(null);

  const envState = React.useMemo(() => {
    try {
      return { env: getEnv(), error: null as string | null };
    } catch (error: unknown) {
      return { env: null, error: getErrorMessage(error, "Missing env vars") };
    }
  }, []);

  const activeChain = envState.env ? getChainConfigById(envState.env, walletChainId) : null;
  const tokenOptions = React.useMemo(
    () => (envState.env && activeChain ? getTokenOptions(envState.env, activeChain.chainId) : []),
    [activeChain, envState.env]
  );
  const preferredToken = React.useMemo(
    () => (envState.env && activeChain ? getDefaultSettlementToken(envState.env, activeChain.chainId) : null),
    [activeChain, envState.env]
  );

  React.useEffect(() => {
    if (tokenAddress.trim()) return;
    if (!preferredToken) return;
    if (preferredToken.address === zeroAddress) return;
    setTokenAddress(preferredToken.address);
  }, [preferredToken, tokenAddress]);

  const selectedToken = React.useMemo(() => {
    if (!envState.env || !activeChain) return null;
    const raw = tokenAddress.trim();
    if (!raw) return describeToken(envState.env, activeChain.chainId, zeroAddress);
    if (!isAddress(raw)) return null;
    return describeToken(envState.env, activeChain.chainId, raw as Address);
  }, [activeChain, envState.env, tokenAddress]);

  React.useEffect(() => {
    if (reveal !== ("0x" + "00".repeat(32))) return;
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    setReveal(("0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")) as Hex);
  }, [reveal]);

  React.useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);

    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [files]);

  const addFiles = React.useCallback((incoming: File[]) => {
    if (!incoming.length) return;
    setFiles((current) => mergeSelectedFiles(current, incoming));
    setLastUploadError(null);
    setGeneratedMetadataURI("");
  }, []);

  const removeFileAt = React.useCallback((index: number) => {
    setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
    setLastUploadError(null);
    setGeneratedMetadataURI("");
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(CREATE_DRAFT_KEY);
    if (!raw) {
      setDraftLoaded(true);
      return;
    }

    try {
      const draft = JSON.parse(raw) as Partial<CreateListingDraft>;
      if (draft.saleType === 0 || draft.saleType === 1 || draft.saleType === 2) setSaleType(draft.saleType);
      if (typeof draft.title === "string") setTitle(draft.title);
      if (typeof draft.description === "string") setDescription(draft.description);
      if (typeof draft.tokenAddress === "string") setTokenAddress(draft.tokenAddress);
      if (typeof draft.category === "string") setCategory(draft.category);
      if (typeof draft.subcategory === "string") setSubcategory(draft.subcategory);
      if (typeof draft.city === "string") setCity(draft.city);
      if (typeof draft.region === "string") setRegion(draft.region);
      if (typeof draft.postalCode === "string") setPostalCode(draft.postalCode);
      if (typeof draft.contactEmail === "string") setContactEmail(draft.contactEmail);
      if (typeof draft.contactPhone === "string") setContactPhone(draft.contactPhone);
      if (typeof draft.fixedPrice === "string") setFixedPrice(draft.fixedPrice);
      if (typeof draft.auctionStart === "string") setAuctionStart(draft.auctionStart);
      if (typeof draft.auctionEnd === "string") setAuctionEnd(draft.auctionEnd);
      if (typeof draft.reservePrice === "string") setReservePrice(draft.reservePrice);
      if (typeof draft.minBidIncrement === "string") setMinBidIncrement(draft.minBidIncrement);
      if (typeof draft.extensionWindow === "string") setExtensionWindow(draft.extensionWindow);
      if (typeof draft.extensionSeconds === "string") setExtensionSeconds(draft.extensionSeconds);
      if (typeof draft.raffleStart === "string") setRaffleStart(draft.raffleStart);
      if (typeof draft.raffleEnd === "string") setRaffleEnd(draft.raffleEnd);
      if (typeof draft.ticketPrice === "string") setTicketPrice(draft.ticketPrice);
      if (typeof draft.targetAmount === "string") setTargetAmount(draft.targetAmount);
      if (typeof draft.minParticipants === "string") setMinParticipants(draft.minParticipants);
      if (typeof draft.reveal === "string" && draft.reveal.startsWith("0x") && draft.reveal.length === 66) setReveal(draft.reveal as Hex);
      setDraftRestored(true);
    } catch {
      window.localStorage.removeItem(CREATE_DRAFT_KEY);
    } finally {
      setDraftLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(CREATE_PUBLISH_RECOVERY_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as Partial<PublishRecovery>;
      if (!parsed || typeof parsed.metadataURI !== "string" || typeof parsed.chainKey !== "string") return;
      const saleTypeValue = parsed.saleType === 1 || parsed.saleType === 2 ? parsed.saleType : 0;
      const recovery: PublishRecovery = {
        metadataURI: parsed.metadataURI,
        chainKey: parsed.chainKey,
        saleType: saleTypeValue,
        tokenAddress: typeof parsed.tokenAddress === "string" ? parsed.tokenAddress : "",
        ...(typeof parsed.listingId === "string" ? { listingId: parsed.listingId as Hex } : {}),
        stage: parsed.stage === "auction-pending" || parsed.stage === "raffle-pending" ? parsed.stage : "metadata-ready",
        updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
        ...(typeof parsed.errorMessage === "string" ? { errorMessage: parsed.errorMessage } : {}),
      };
      setPublishRecovery(recovery);
      setGeneratedMetadataURI(recovery.metadataURI);
      setSaleType((current) => (current === recovery.saleType ? current : recovery.saleType));
    } catch {
      window.localStorage.removeItem(CREATE_PUBLISH_RECOVERY_KEY);
    }
  }, []);

  const draftSnapshot = React.useMemo<CreateListingDraft>(
    () => ({
      saleType,
      title,
      description,
      tokenAddress,
      category,
      subcategory,
      city,
      region,
      postalCode,
      contactEmail,
      contactPhone,
      fixedPrice,
      auctionStart,
      auctionEnd,
      reservePrice,
      minBidIncrement,
      extensionWindow,
      extensionSeconds,
      raffleStart,
      raffleEnd,
      ticketPrice,
      targetAmount,
      minParticipants,
      reveal,
    }),
    [
      saleType,
      title,
      description,
      tokenAddress,
      category,
      subcategory,
      city,
      region,
      postalCode,
      contactEmail,
      contactPhone,
      fixedPrice,
      auctionStart,
      auctionEnd,
      reservePrice,
      minBidIncrement,
      extensionWindow,
      extensionSeconds,
      raffleStart,
      raffleEnd,
      ticketPrice,
      targetAmount,
      minParticipants,
      reveal,
    ]
  );

  React.useEffect(() => {
    if (!draftLoaded || typeof window === "undefined") return;
    const handle = window.setTimeout(() => {
      window.localStorage.setItem(CREATE_DRAFT_KEY, JSON.stringify(draftSnapshot));
      setLastDraftSavedAt(Date.now());
    }, 400);

    return () => window.clearTimeout(handle);
  }, [draftLoaded, draftSnapshot]);

  function clearDraft() {
    if (typeof window !== "undefined") window.localStorage.removeItem(CREATE_DRAFT_KEY);
    setLastDraftSavedAt(null);
    setDraftRestored(false);
  }

  function savePublishRecovery(next: PublishRecovery) {
    setPublishRecovery(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CREATE_PUBLISH_RECOVERY_KEY, JSON.stringify(next));
    }
  }

  function clearPublishRecovery() {
    setPublishRecovery(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(CREATE_PUBLISH_RECOVERY_KEY);
    }
  }

  if (envState.error || !envState.env || !activeChain) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">{envState.error ?? "Missing env vars"}</CardContent>
      </Card>
    );
  }

  const env = envState.env;

  async function publishFromMetadata(metadataURI: string, publishSaleType: SaleType, existingListingId?: Hex) {
    if (tokenAddress.trim().length && !selectedToken) {
      toast.error("Invalid token address");
      return;
    }

    const currentChain = activeChain;
    if (!currentChain) {
      toast.error("Missing chain configuration");
      return;
    }

    const token: Address = tokenAddress.trim().length ? (tokenAddress.trim() as Address) : zeroAddress;
    const settlementToken = selectedToken ?? describeToken(env, currentChain.chainId, zeroAddress);
    const price = publishSaleType === 0 ? parseTokenAmount(fixedPrice || "0", settlementToken) : BigInt(0);

    let listingId: Hex | null = existingListingId ?? null;

    try {
      if (!publicClient) throw new Error("No public client");

      if (!listingId) {
        const toastId = toast.loading("Creating listing…");
        const hash = await writeContractAsync({
          address: currentChain.marketplaceRegistryAddress,
          abi: createListingAbi,
          functionName: "createListing",
          args: [metadataURI, price, token, publishSaleType],
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        listingId = getListingCreatedId(receipt);

        if (!listingId) throw new Error("Could not find ListingCreated event in receipt");

        toast.success("Listing created", { id: toastId });
      }

      if (publishSaleType === 1) {
        savePublishRecovery({
          metadataURI,
          chainKey: currentChain.key,
          saleType: publishSaleType,
          tokenAddress,
          listingId,
          stage: "auction-pending",
          updatedAt: Date.now(),
        });

        const startTime = toUnixSeconds(auctionStart);
        const endTime = toUnixSeconds(auctionEnd);
        const reserve = parseTokenAmount(reservePrice || "0", settlementToken);
        const increment = parseTokenAmount(minBidIncrement || "0", settlementToken);

        const toast2 = toast.loading("Opening auction…");
        const hash2 = await writeContractAsync({
          address: currentChain.marketplaceRegistryAddress,
          abi: createListingAbi,
          functionName: "openAuction",
          args: [
            listingId,
            startTime,
            endTime,
            reserve,
            increment,
            BigInt(extensionWindow),
            BigInt(extensionSeconds),
          ],
        });

        await publicClient.waitForTransactionReceipt({ hash: hash2 });
        toast.success("Auction opened", { id: toast2 });
      }

      if (publishSaleType === 2) {
        savePublishRecovery({
          metadataURI,
          chainKey: currentChain.key,
          saleType: publishSaleType,
          tokenAddress,
          listingId,
          stage: "raffle-pending",
          updatedAt: Date.now(),
        });

        const startTime = toUnixSeconds(raffleStart);
        const endTime = toUnixSeconds(raffleEnd);
        const ticket = parseTokenAmount(ticketPrice || "0", settlementToken);
        const target = parseTokenAmount(targetAmount || "0", settlementToken);
        const minP = Number.parseInt(minParticipants, 10);
        const revealBytes32 = parseBytes32(reveal);
        const commit = keccak256(revealBytes32);

        const toast2 = toast.loading("Opening raffle…");
        const hash2 = await writeContractAsync({
          address: currentChain.marketplaceRegistryAddress,
          abi: createListingAbi,
          functionName: "openRaffle",
          args: [listingId, startTime, endTime, ticket, target, minP, commit],
        });

        await publicClient.waitForTransactionReceipt({ hash: hash2 });
        toast.success("Raffle opened", { id: toast2 });
      }

      clearDraft();
      clearPublishRecovery();
      router.push(buildListingHref(listingId, currentChain.key));
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Transaction failed");
      setLastUploadError(message);
      savePublishRecovery({
        metadataURI,
        chainKey: currentChain.key,
        saleType: publishSaleType,
        tokenAddress,
        ...(listingId ? { listingId } : {}),
        stage: publishSaleType === 1 ? "auction-pending" : publishSaleType === 2 ? "raffle-pending" : "metadata-ready",
        updatedAt: Date.now(),
        errorMessage: message,
      });
      toast.error(message);
    }
  }

  async function submitListing() {
    const currentChain = activeChain;
    if (!currentChain) {
      toast.error("Missing chain configuration");
      return;
    }

    if (!title.trim() || !description.trim()) {
      toast.error("Title and description are required");
      return;
    }

    if (!files.length) {
      toast.error("At least one image is required");
      return;
    }

    let metadataURI: string;
    try {
      setIsSubmitting(true);
      setLastUploadError(null);
      setUploadStage("uploading");
      setUploadProgress(0);
      const uploadJson = await uploadImagesWithProgress(env.backendUrl ?? "http://localhost:4000", files, setUploadProgress);
      const images = uploadJson.items.map((item) => item.ipfsUri).filter(Boolean);
      if (!images.length) throw new Error("Image upload returned no IPFS URIs");

      setUploadStage("publishing");
      setUploadProgress(100);
      const res = await fetchJson<{ metadataURI: string; cid: string; id: string }>("/metadata/ipfs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          images,
          category: category.trim() || undefined,
          subcategory: subcategory.trim() || undefined,
          city: city.trim() || undefined,
          region: region.trim() || undefined,
          postalCode: postalCode.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
          contactPhone: contactPhone.trim() || undefined,
          attributes: [],
        }),
        timeoutMs: 10_000,
      });

      metadataURI = res.metadataURI;
      setGeneratedMetadataURI(res.metadataURI);
      savePublishRecovery({
        metadataURI: res.metadataURI,
        chainKey: currentChain.key,
        saleType,
        tokenAddress,
        stage: "metadata-ready",
        updatedAt: Date.now(),
      });
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to upload metadata");
      setLastUploadError(message);
      setUploadStage("idle");
      setIsSubmitting(false);
      toast.error(message);
      return;
    }

    await publishFromMetadata(metadataURI, saleType);
    setIsSubmitting(false);
    setUploadStage("idle");
  }

  async function continuePublishRecovery() {
    if (!publishRecovery) return;
    if (!activeChain) {
      toast.error("Reconnect to the publish chain before continuing this publish attempt");
      return;
    }
    if (publishRecovery.chainKey !== activeChain.key) {
      toast.error(`Reconnect to ${publishRecovery.chainKey} before continuing this publish attempt`);
      return;
    }

    setIsSubmitting(true);
    setUploadStage("publishing");
    setUploadProgress(100);
    setLastUploadError(null);
    await publishFromMetadata(publishRecovery.metadataURI, publishRecovery.saleType, publishRecovery.listingId);
    setIsSubmitting(false);
    setUploadStage("idle");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitListing();
  }

  const saleTypeDescription =
    saleType === 0
      ? "Best for everyday classifieds with a clear price and direct checkout."
      : saleType === 1
        ? "Advanced format for timed bidding. Use only when the listing really needs an auction."
        : "Advanced format for community draws and limited drops.";
  const publicNetworkLabel = getPublicNetworkLabel(activeChain.name);

  return (
    <div className="space-y-6">
      <section className="market-hero px-4 py-5 sm:px-8 sm:py-8">
        <div className="grid gap-6 lg:grid-cols-[1.5fr_0.9fr] lg:items-end">
          <div className="space-y-4">
            <div className="market-section-title">Post a listing</div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-4xl">List it like a local marketplace, not a protocol dashboard.</h1>
              <p className="max-w-2xl text-[13px] leading-6 text-slate-700 sm:text-base">
                Add photos, location, contact details, and a clear price first. Wallet settlement still powers the listing on the {publicNetworkLabel.toLowerCase()}, but the posting flow now prioritizes what shoppers actually need to see.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="market-chip border-amber-200/80 bg-white/95 text-slate-900 shadow-sm">Photos up to 12</div>
              <div className="market-chip border-amber-200/80 bg-white/95 text-slate-900 shadow-sm">Location-aware metadata</div>
              <div className="market-chip border-amber-200/80 bg-white/95 text-slate-900 shadow-sm">Public listing page after publish</div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <div className="market-stat">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Default flow</div>
              <div className="mt-2 text-lg font-semibold">Fixed price</div>
              <div className="mt-1 text-sm text-muted-foreground">Simple classifieds checkout stays front and center.</div>
            </div>
            <div className="market-stat">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Settlement</div>
              <div className="mt-2 text-lg font-semibold">{selectedToken?.symbol ?? activeChain.nativeCurrencySymbol}</div>
              <div className="mt-1 text-sm text-muted-foreground">Choose the payment currency buyers should see before you publish.</div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-6">
        <Card className="market-panel market-panel-spotlight market-panel-spotlight-blue">
          <CardHeader>
            <div className="market-section-title">Listing setup</div>
            <CardTitle>Build the listing buyers expect</CardTitle>
            <CardDescription>{saleTypeDescription}</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <form onSubmit={onSubmit} className="space-y-6">
              {draftRestored ? (
                <AccentCallout label="Draft restored" tone="amber">
                  Draft restored. Text, pricing, and schedule details came back from local storage. Photos are not persisted, so reselect images before publishing.
                </AccentCallout>
              ) : null}
              {publishRecovery ? (
                <AccentCallout
                  label="Recovered publish session"
                  tone="blue"
                  actions={
                    <>
                      <Button type="button" size="sm" variant="outline" disabled={isSubmitting} onClick={() => void continuePublishRecovery()}>
                        {getRecoveryActionLabel(publishRecovery)}
                      </Button>
                      {publishRecovery.listingId ? (
                        <Button type="button" size="sm" variant="ghost" asChild>
                          <a href={buildListingHref(publishRecovery.listingId, publishRecovery.chainKey)}>Open current listing</a>
                        </Button>
                      ) : null}
                      <Button type="button" size="sm" variant="ghost" onClick={clearPublishRecovery}>
                        Dismiss recovery
                      </Button>
                    </>
                  }
                >
                  <div>
                    {publishRecovery.stage === "metadata-ready"
                      ? "Images and metadata already reached the backend. Continue from the wallet publish step without uploading the photos again."
                      : publishRecovery.stage === "auction-pending"
                        ? "The base listing already exists. Continue from the auction setup step without recreating the ad or re-uploading photos."
                        : "The base listing already exists. Continue from the raffle setup step without recreating the ad or re-uploading photos."}
                    {publishRecovery.errorMessage ? <div className="mt-3 text-xs text-slate-600">Last error: {publishRecovery.errorMessage}</div> : null}
                  </div>
                </AccentCallout>
              ) : null}

              <div className="space-y-3 rounded-2xl border bg-accent/30 p-3 sm:p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <Label>Sale type</Label>
                    <div className="mt-1 text-sm text-muted-foreground">Fixed price stays primary. Auction and raffle remain available as advanced publishing modes.</div>
                  </div>
                  <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Current: {saleType === 0 ? "Fixed price" : saleType === 1 ? "Auction" : "Raffle"}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="lg" variant={saleType === 0 ? "default" : "outline"} onClick={() => setSaleType(0)} className="w-full sm:w-auto">
                    Fixed price
                  </Button>
                  <Button type="button" size="lg" variant={saleType === 1 ? "default" : "outline"} onClick={() => setSaleType(1)} className="w-full sm:w-auto">
                    Auction
                  </Button>
                  <Button type="button" size="lg" variant={saleType === 2 ? "default" : "outline"} onClick={() => setSaleType(2)} className="w-full sm:w-auto">
                    Raffle
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. My item" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Description</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe your item" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Images (required, up to 12)</Label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Choose from gallery</Label>
                      <Input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          addFiles(Array.from(e.target.files ?? []));
                          e.currentTarget.value = "";
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Take photo</Label>
                      <Input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => {
                          addFiles(Array.from(e.target.files ?? []));
                          e.currentTarget.value = "";
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">Photos are selected per device session and are not stored in the local draft. New gallery or camera selections append up to 12 images so phone and tablet uploads can be built in batches.</div>
                  {files.length ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>Selected: {files.length}/12</span>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setFiles([])}>
                          Clear all photos
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
                        {previewUrls.map((url, index) => (
                          <div key={`${files[index]?.name ?? "file"}-${index}`} className="overflow-hidden rounded-md border bg-muted">
                            <div className="relative aspect-square w-full">
                              <Image src={url} alt={files[index]?.name ?? `Selected image ${index + 1}`} fill className="object-cover" unoptimized />
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="absolute right-2 top-2 h-8 rounded-full px-3"
                                onClick={() => removeFileAt(index)}
                              >
                                Remove
                              </Button>
                            </div>
                            <div className="truncate border-t px-2 py-1 text-[11px] text-muted-foreground">
                              {files[index]?.name ?? `Image ${index + 1}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                  {isSubmitting || uploadProgress > 0 ? (
                    <div className="space-y-2 rounded-xl border bg-background/80 p-3">
                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>{uploadStage === "uploading" ? "Uploading images" : uploadStage === "publishing" ? "Publishing metadata" : "Preparing upload"}</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-slate-900 transition-[width] duration-200" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    </div>
                  ) : null}
                  {lastUploadError ? (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                      <div>{lastUploadError}</div>
                      <div className="mt-3">
                        <Button type="button" size="sm" variant="outline" disabled={isSubmitting} onClick={() => void (publishRecovery ? continuePublishRecovery() : submitListing())}>
                          {publishRecovery ? getRecoveryActionLabel(publishRecovery) : "Retry upload and publish"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label>Category</Label>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(CATEGORY_TREE).map((entry) => (
                      <Button
                        key={entry}
                        type="button"
                        size="sm"
                        variant={category === entry ? "default" : "outline"}
                        onClick={() => {
                          setCategory(entry);
                          setSubcategory("");
                        }}
                      >
                        {entry}
                      </Button>
                    ))}
                  </div>
                </div>

                {category ? (
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Subcategory</Label>
                    <div className="flex flex-wrap gap-2">
                      {subcategoriesFor(category).map((entry) => (
                        <Button
                          key={entry}
                          type="button"
                          size="sm"
                          variant={subcategory === entry ? "secondary" : "outline"}
                          onClick={() => setSubcategory(entry)}
                        >
                          {entry}
                        </Button>
                      ))}
                      <Button type="button" size="sm" variant={!subcategory ? "secondary" : "outline"} onClick={() => setSubcategory("")}>All {category}</Button>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label>City</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Toronto" />
                </div>
                <div className="space-y-2">
                  <Label>Region/State</Label>
                  <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. Ontario" />
                </div>
                <div className="space-y-2">
                  <Label>Postal code</Label>
                  <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="e.g. M5V" />
                </div>
                <div className="space-y-2">
                  <Label>Contact email (optional)</Label>
                  <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="name@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Contact phone (optional)</Label>
                  <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+1 555…" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Generated metadataURI (from backend)</Label>
                  <Input value={generatedMetadataURI} readOnly placeholder="Will be generated on submit" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Settlement token</Label>
                  <div className="flex flex-wrap gap-2">
                    {tokenOptions.map((tokenOption) => {
                      const value = tokenOption.address === zeroAddress ? "" : tokenOption.address;
                      const active = tokenAddress.trim().toLowerCase() === value.toLowerCase();
                      return (
                        <Button
                          key={`${tokenOption.symbol}-${tokenOption.address}`}
                          type="button"
                          size="sm"
                          variant={active ? "default" : "outline"}
                          onClick={() => setTokenAddress(value)}
                        >
                          {tokenOption.symbol}
                        </Button>
                      );
                    })}
                  </div>
                  <Input
                    value={tokenAddress}
                    onChange={(e) => setTokenAddress(e.target.value)}
                    placeholder={`Leave empty for ${activeChain.nativeCurrencySymbol}, or paste a custom ERC-20 address`}
                  />
                  <div className="text-xs text-muted-foreground">
                    {selectedToken
                      ? `Using ${selectedToken.name} (${selectedToken.symbol}) with ${selectedToken.decimals} decimals.`
                      : "Custom token address must be a valid ERC-20 contract address."}
                  </div>
                </div>
              </div>

              {saleType === 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="space-y-2">
                    <Label>Price ({selectedToken?.symbol ?? activeChain.nativeCurrencySymbol})</Label>
                    <Input value={fixedPrice} onChange={(e) => setFixedPrice(e.target.value)} />
                  </div>
                </div>
              ) : null}

              {saleType === 1 ? (
                <div className="space-y-4 rounded-2xl border bg-background/80 p-4">
                  <div className="text-sm font-medium">Auction configuration</div>
                  <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                    <div className="space-y-2"><Label>Start</Label><Input type="datetime-local" value={auctionStart} onChange={(e) => setAuctionStart(e.target.value)} /></div>
                    <div className="space-y-2"><Label>End</Label><Input type="datetime-local" value={auctionEnd} onChange={(e) => setAuctionEnd(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Reserve / minimum accepted ({selectedToken?.symbol ?? activeChain.nativeCurrencySymbol})</Label><Input value={reservePrice} onChange={(e) => setReservePrice(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Min bid increment ({selectedToken?.symbol ?? activeChain.nativeCurrencySymbol})</Label><Input value={minBidIncrement} onChange={(e) => setMinBidIncrement(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Extension window (seconds)</Label><Input value={extensionWindow} onChange={(e) => setExtensionWindow(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Extension seconds</Label><Input value={extensionSeconds} onChange={(e) => setExtensionSeconds(e.target.value)} /></div>
                  </div>
                </div>
              ) : null}

              {saleType === 2 ? (
                <div className="space-y-4 rounded-2xl border bg-background/80 p-4">
                  <div className="text-sm font-medium">Raffle configuration</div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label>Start</Label><Input type="datetime-local" value={raffleStart} onChange={(e) => setRaffleStart(e.target.value)} /></div>
                    <div className="space-y-2"><Label>End</Label><Input type="datetime-local" value={raffleEnd} onChange={(e) => setRaffleEnd(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Ticket price ({selectedToken?.symbol ?? activeChain.nativeCurrencySymbol})</Label><Input value={ticketPrice} onChange={(e) => setTicketPrice(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Target amount ({selectedToken?.symbol ?? activeChain.nativeCurrencySymbol})</Label><Input value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Min participants</Label><Input value={minParticipants} onChange={(e) => setMinParticipants(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Reveal (bytes32) - save this to close raffle later</Label><Input value={reveal} onChange={(e) => setReveal(e.target.value as Hex)} /></div>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={isSubmitting}>
                  {isSubmitting ? "Publishing..." : "Publish listing"}
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.localStorage.setItem(CREATE_DRAFT_KEY, JSON.stringify(draftSnapshot));
                      setLastDraftSavedAt(Date.now());
                    }
                    toast.success("Draft saved on this device");
                  }}
                >
                  Save draft
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="ghost"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    clearDraft();
                    toast.success("Draft cleared from this device");
                  }}
                >
                  Clear draft
                </Button>
                {lastDraftSavedAt ? <div className="text-xs text-muted-foreground">Draft saved {new Date(lastDraftSavedAt).toLocaleTimeString()}</div> : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <aside className="space-y-3 sm:space-y-4">
          <Card className="market-panel market-panel-spotlight market-panel-spotlight-amber">
            <CardHeader>
              <div className="market-section-title">What buyers see</div>
              <CardTitle>Publishing checklist</CardTitle>
              <CardDescription>Keep the draft readable, photo-rich, and priced like a real classifieds listing before it goes live.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0 text-sm text-muted-foreground sm:p-6 sm:pt-0">
              <AccentCallout label="Draft handling" tone="blue">
                Listing details auto-save on this device after edits. Photos stay local to the current session and must be reselected after a refresh.
              </AccentCallout>
              <AccentCallout label="Publish recovery" tone="amber">
                If photo upload or listing creation already succeeded and the later publish step fails, this page keeps a recoverable publish session so you can continue without re-uploading the same images.
              </AccentCallout>
              <AccentCallout label="Buyer-facing basics" tone="mint">
                Lead with a plain-language title, real photos, city and region, and one direct price.
              </AccentCallout>
              <AccentCallout label="Recommended for classifieds" tone="mint">
                Use fixed price for most listings so the detail page stays simple and buyers can act immediately.
              </AccentCallout>
              <AccentCallout label="Network" tone="blue">
                This publish flow still settles through the {publicNetworkLabel.toLowerCase()}, but the listing details, location, and recovery path stay front and center instead of chain jargon.
              </AccentCallout>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}