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
  companyName: string;
  compensation: string;
  workMode: string;
  conditionSummary: string;
  inspectionNotes: string;
  transferTerms: string;
  titleStatus: string;
  ownershipConfirmed: boolean;
  publicSaleTermsAccepted: boolean;
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
  serviceLicenseConfirmed?: boolean;
  // Car fields
  vin?: string;
  mileage?: string;
  dealerCost?: string;
  dealerMsrp?: string;
  salePrice?: string;
  // Antique
  provenance?: string;
  // Real estate
  bedrooms?: string;
  bathrooms?: string;
  squareFeet?: string;
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
const JOB_LISTING_MIN_PRICE_WEI = 1n;

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

function isPinataUnavailableError(error: unknown) {
  const message = getErrorMessage(error, "").toLowerCase();
  return message.includes("pinata is not configured") || message.includes("set pinata_jwt");
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
  const [companyName, setCompanyName] = React.useState("");
  const [compensation, setCompensation] = React.useState("");
  const [workMode, setWorkMode] = React.useState("On-site");
  const [conditionSummary, setConditionSummary] = React.useState("");
  const [inspectionNotes, setInspectionNotes] = React.useState("");
  const [transferTerms, setTransferTerms] = React.useState("");
  const [titleStatus, setTitleStatus] = React.useState("");
  const [ownershipConfirmed, setOwnershipConfirmed] = React.useState(false);
  const [publicSaleTermsAccepted, setPublicSaleTermsAccepted] = React.useState(false);
  const [serviceLicenseConfirmed, setServiceLicenseConfirmed] = React.useState(false);
  // Car-specific
  const [vin, setVin] = React.useState("");
  const [mileage, setMileage] = React.useState("");
  const [dealerCost, setDealerCost] = React.useState("");
  const [dealerMsrp, setDealerMsrp] = React.useState("");
  const [salePrice, setSalePrice] = React.useState("");
  // Antique-specific
  const [provenance, setProvenance] = React.useState("");
  // Real-estate-specific
  const [bedrooms, setBedrooms] = React.useState("");
  const [bathrooms, setBathrooms] = React.useState("");
  const [squareFeet, setSquareFeet] = React.useState("");

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
      if (typeof draft.companyName === "string") setCompanyName(draft.companyName);
      if (typeof draft.compensation === "string") setCompensation(draft.compensation);
      if (typeof draft.workMode === "string") setWorkMode(draft.workMode);
      if (typeof draft.conditionSummary === "string") setConditionSummary(draft.conditionSummary);
      if (typeof draft.inspectionNotes === "string") setInspectionNotes(draft.inspectionNotes);
      if (typeof draft.transferTerms === "string") setTransferTerms(draft.transferTerms);
      if (typeof draft.titleStatus === "string") setTitleStatus(draft.titleStatus);
      if (typeof draft.serviceLicenseConfirmed === "boolean") setServiceLicenseConfirmed(draft.serviceLicenseConfirmed);
      if (typeof draft.vin === "string") setVin(draft.vin);
      if (typeof draft.mileage === "string") setMileage(draft.mileage);
      if (typeof draft.dealerCost === "string") setDealerCost(draft.dealerCost);
      if (typeof draft.dealerMsrp === "string") setDealerMsrp(draft.dealerMsrp);
      if (typeof draft.salePrice === "string") setSalePrice(draft.salePrice);
      if (typeof draft.provenance === "string") setProvenance(draft.provenance);
      if (typeof draft.bedrooms === "string") setBedrooms(draft.bedrooms);
      if (typeof draft.bathrooms === "string") setBathrooms(draft.bathrooms);
      if (typeof draft.squareFeet === "string") setSquareFeet(draft.squareFeet);
      if (typeof draft.ownershipConfirmed === "boolean") setOwnershipConfirmed(draft.ownershipConfirmed);
      if (typeof draft.publicSaleTermsAccepted === "boolean") setPublicSaleTermsAccepted(draft.publicSaleTermsAccepted);
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
      companyName,
      compensation,
      workMode,
      conditionSummary,
      inspectionNotes,
      transferTerms,
      titleStatus,
      ownershipConfirmed,
      publicSaleTermsAccepted,
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
      serviceLicenseConfirmed,
      vin,
      mileage,
      dealerCost,
      dealerMsrp,
      salePrice,
      provenance,
      bedrooms,
      bathrooms,
      squareFeet,
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
      companyName,
      compensation,
      workMode,
      conditionSummary,
      inspectionNotes,
      transferTerms,
      titleStatus,
      ownershipConfirmed,
      publicSaleTermsAccepted,
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
      serviceLicenseConfirmed,
      vin,
      mileage,
      dealerCost,
      dealerMsrp,
      salePrice,
      provenance,
      bedrooms,
      bathrooms,
      squareFeet,
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

  const isJobListing = category === "Jobs";
  const isServiceListing = category === "Services";

  React.useEffect(() => {
    if (!isJobListing) return;
    setSaleType(0);
    setTokenAddress("");
  }, [isJobListing]);

  if (envState.error || !envState.env || !activeChain) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">{envState.error ?? "Missing env vars"}</CardContent>
      </Card>
    );
  }

  const env = envState.env;
  const photosOptional = true;

  async function uploadListingMetadata(images: string[]) {
    const payload = {
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
      attributes: isJobListing
        ? [
            { trait_type: "listingKind", value: "job" },
            ...(companyName.trim() ? [{ trait_type: "companyName", value: companyName.trim() }] : []),
            ...(compensation.trim() ? [{ trait_type: "compensation", value: compensation.trim() }] : []),
            ...(workMode.trim() ? [{ trait_type: "workMode", value: workMode.trim() }] : []),
          ]
        : [
            { trait_type: "listingKind", value: "public-sale" },
            { trait_type: "conditionSummary", value: conditionSummary.trim() },
            { trait_type: "inspectionNotes", value: inspectionNotes.trim() },
            ...(transferTerms.trim() ? [{ trait_type: "transferTerms", value: transferTerms.trim() }] : []),
            ...(titleStatus.trim() ? [{ trait_type: "titleStatus", value: titleStatus.trim() }] : []),
            { trait_type: "ownershipConfirmed", value: ownershipConfirmed },
            { trait_type: "publicSaleTermsAccepted", value: publicSaleTermsAccepted },
            ...(category === "Services" ? [{ trait_type: "serviceLicenseConfirmed", value: serviceLicenseConfirmed }] : []),
            ...(category === "Cars & Vehicles"
              ? [
                  ...(vin.trim() ? [{ trait_type: "vin", value: vin.trim() }] : []),
                  ...(mileage.trim() ? [{ trait_type: "mileage", value: mileage.trim() }] : []),
                  ...(dealerCost.trim() ? [{ trait_type: "dealerCost", value: dealerCost.trim() }] : []),
                  ...(dealerMsrp.trim() ? [{ trait_type: "dealerMsrp", value: dealerMsrp.trim() }] : []),
                  ...(salePrice.trim() ? [{ trait_type: "salePrice", value: salePrice.trim() }] : []),
                ]
              : []),
            ...((category === "Buy & Sell" && subcategory === "Antiques & Collectibles")
              ? [...(provenance.trim() ? [{ trait_type: "provenance", value: provenance.trim() }] : [])]
              : []),
            ...(category === "Real Estate"
              ? [
                  ...(bedrooms.trim() ? [{ trait_type: "bedrooms", value: bedrooms.trim() }] : []),
                  ...(bathrooms.trim() ? [{ trait_type: "bathrooms", value: bathrooms.trim() }] : []),
                  ...(squareFeet.trim() ? [{ trait_type: "squareFeet", value: squareFeet.trim() }] : []),
                ]
              : []),
            { trait_type: "saleTerms", value: "As-is / where-is unless noted otherwise by the seller" },
          ],
    };

    if (!images.length) {
      return fetchJson<{ metadataURI: string; id: string }>("/metadata", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        timeoutMs: 10_000,
      });
    }

    try {
      return await fetchJson<{ metadataURI: string; cid: string; id: string }>("/metadata/ipfs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        timeoutMs: 10_000,
      });
    } catch (error: unknown) {
      if (isPinataUnavailableError(error)) {
        throw new Error("Image uploads require Pinata. Remove photos for a text-only publish, or configure PINATA_JWT on the backend.");
      }
      throw error;
    }
  }

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

    const token: Address = isJobListing ? zeroAddress : tokenAddress.trim().length ? (tokenAddress.trim() as Address) : zeroAddress;
    const settlementToken = selectedToken ?? describeToken(env, currentChain.chainId, zeroAddress);
    const price = isJobListing ? JOB_LISTING_MIN_PRICE_WEI : publishSaleType === 0 ? parseTokenAmount(fixedPrice || "0", settlementToken) : BigInt(0);

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

    if (isJobListing && !contactEmail.trim() && !contactPhone.trim()) {
      toast.error("Jobs need an email or phone number so applicants can respond");
      return;
    }

    if (isJobListing && !city.trim() && !region.trim() && !postalCode.trim()) {
      toast.error("Jobs need at least one location detail");
      return;
    }

    if (!isJobListing && !isServiceListing && !conditionSummary.trim()) {
      toast.error("Add a condition summary so buyers know what they are looking at");
      return;
    }

    if (!isJobListing && !isServiceListing && !inspectionNotes.trim()) {
      toast.error("Add inspection or pickup notes for public-sale listings");
      return;
    }

    if (!isJobListing && !isServiceListing && !ownershipConfirmed) {
      toast.error("Confirm that you have the right to sell this item");
      return;
    }

    if (!isJobListing && !isServiceListing && !publicSaleTermsAccepted) {
      toast.error("Accept the public-sale terms before publishing");
      return;
    }

    let metadataURI: string;
    try {
      setIsSubmitting(true);
      setLastUploadError(null);
      const images = files.length
        ? await (async () => {
            setUploadStage("uploading");
            setUploadProgress(0);
            const uploadJson = await uploadImagesWithProgress(env.backendUrl ?? "http://localhost:4000", files, setUploadProgress);
            return uploadJson.items.map((item) => item.ipfsUri).filter(Boolean);
          })()
        : [];

      setUploadStage("publishing");
      setUploadProgress(files.length ? 100 : 35);
      const res = await uploadListingMetadata(images);

      metadataURI = res.metadataURI;
      setGeneratedMetadataURI(res.metadataURI);
      setUploadProgress(100);
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
    isJobListing
      ? "Jobs publish as direct-response ads with recruiter contact details instead of buyer checkout pricing."
      : saleType === 0
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
            <div className="market-section-title">{isJobListing ? "Post a job" : "Post a listing"}</div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{isJobListing ? "Post a hiring ad that feels built for applicants." : "List it like a local marketplace, not a protocol dashboard."}</h1>
              <p className="max-w-2xl text-[13px] leading-6 text-slate-700 sm:text-base">
                {isJobListing
                  ? "Add the role, location, recruiter contact, and compensation notes first. Jobs now publish as direct-response public hiring posts instead of product listings."
                  : `Add location, contact details, and a clear price first. Photos help when you have them, but quick public posts like jobs or simple local ads can still publish without them. Wallet settlement still powers the listing on the ${publicNetworkLabel.toLowerCase()}.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="market-chip border-amber-200/80 bg-white/95 text-slate-900 shadow-sm">{isJobListing ? "Applicant-ready copy" : "Photos optional, up to 12"}</div>
              <div className="market-chip border-amber-200/80 bg-white/95 text-slate-900 shadow-sm">Location-aware metadata</div>
              <div className="market-chip border-amber-200/80 bg-white/95 text-slate-900 shadow-sm">{isJobListing ? "Direct-response contact info" : "Public listing page after publish"}</div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <div className="market-stat">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Default flow</div>
              <div className="mt-2 text-lg font-semibold">{isJobListing ? "Direct response" : "Fixed price"}</div>
              <div className="mt-1 text-sm text-muted-foreground">{isJobListing ? "Applicants respond through the recruiter contact details in the ad." : "Simple classifieds checkout stays front and center."}</div>
            </div>
            <div className="market-stat">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{isJobListing ? "Hiring focus" : "Settlement"}</div>
              <div className="mt-2 text-lg font-semibold">{isJobListing ? "Contact + location" : selectedToken?.symbol ?? activeChain.nativeCurrencySymbol}</div>
              <div className="mt-1 text-sm text-muted-foreground">{isJobListing ? "Applicants should immediately see how to respond and where the role is based." : "Choose the payment currency buyers should see before you publish."}</div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-6">
        <Card className="market-panel market-panel-spotlight market-panel-spotlight-blue">
          <CardHeader>
            <div className="market-section-title">{isJobListing ? "Job setup" : "Listing setup"}</div>
            <CardTitle>{isJobListing ? "Build the job post applicants expect" : "Build the listing buyers expect"}</CardTitle>
            <CardDescription>{saleTypeDescription}</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <form onSubmit={onSubmit} className="space-y-6">
              {draftRestored ? (
                <AccentCallout label="Draft restored" tone="amber">
                  Draft restored. Text, pricing, and schedule details came back from local storage. Photos are not persisted, so reselect them only if this ad should include images.
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

              {isJobListing ? (
                <AccentCallout label="Jobs mode" tone="blue">
                  Jobs publish as direct-response ads. Pricing, token selection, auctions, and raffles are hidden so the form stays focused on the role, location, and recruiter contact details.
                </AccentCallout>
              ) : (
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
              )}

              <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>{isJobListing ? "Role title" : "Title"}</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isJobListing ? "e.g. Office Administrator" : "e.g. My item"} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{isJobListing ? "Role description" : "Description"}</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={isJobListing ? "Describe the responsibilities, requirements, and anything applicants should know before reaching out." : "Describe your item"} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Images ({photosOptional ? "optional" : "required"}, up to 12)</Label>
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
                  <div className="text-xs text-muted-foreground">Photos are selected per device session and are not stored in the local draft. Add them for visual listings like antiques or furniture, or leave this empty for text-first posts such as jobs and quick public notices.</div>
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
                  <Label>Contact email {isJobListing ? "(recommended)" : "(optional)"}</Label>
                  <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="name@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Contact phone {isJobListing ? "(recommended)" : "(optional)"}</Label>
                  <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+1 555…" />
                </div>
                {isJobListing ? (
                  <>
                    <div className="space-y-2">
                      <Label>Company / employer</Label>
                      <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Zonycs Logistics" />
                    </div>
                    <div className="space-y-2">
                      <Label>Compensation summary</Label>
                      <Input value={compensation} onChange={(e) => setCompensation(e.target.value)} placeholder="e.g. CAD 22/hour or salary based on experience" />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Work mode</Label>
                      <div className="flex flex-wrap gap-2">
                        {["On-site", "Hybrid", "Remote"].map((entry) => (
                          <Button key={entry} type="button" size="sm" variant={workMode === entry ? "default" : "outline"} onClick={() => setWorkMode(entry)}>
                            {entry}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {isServiceListing ? (
                      <div className="space-y-3 sm:col-span-2">
                        <div className="text-sm font-medium">Services mode</div>
                        <label className="flex items-start gap-3 text-sm text-muted-foreground">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-slate-300"
                            checked={serviceLicenseConfirmed}
                            onChange={(e) => setServiceLicenseConfirmed(e.target.checked)}
                          />
                          <span>I confirm I hold any required license for this service (no document upload required).</span>
                        </label>
                      </div>
                    ) : null}
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Condition summary</Label>
                      <Textarea
                        value={conditionSummary}
                        onChange={(e) => setConditionSummary(e.target.value)}
                        placeholder="Summarize age, wear, known damage, and what is included in the sale."
                      />
                    </div>

                    {category === "Cars & Vehicles" ? (
                      <>
                        <div className="space-y-2">
                          <Label>VIN</Label>
                          <Input value={vin} onChange={(e) => setVin(e.target.value)} placeholder="Vehicle Identification Number" />
                        </div>
                        <div className="space-y-2">
                          <Label>Mileage</Label>
                          <Input value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="e.g. 120000 km" />
                        </div>
                        <div className="space-y-2">
                          <Label>Dealer cost (optional)</Label>
                          <Input value={dealerCost} onChange={(e) => setDealerCost(e.target.value)} placeholder="Cost for dealer/internal use" />
                        </div>
                        <div className="space-y-2">
                          <Label>MSRP (optional)</Label>
                          <Input value={dealerMsrp} onChange={(e) => setDealerMsrp(e.target.value)} placeholder="Manufacturer suggested retail price" />
                        </div>
                        <div className="space-y-2">
                          <Label>Sale price (public)</Label>
                          <Input value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="Public sale price" />
                        </div>
                      </>
                    ) : null}

                    {category === "Buy & Sell" && subcategory === "Antiques & Collectibles" ? (
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Provenance</Label>
                        <Textarea value={provenance} onChange={(e) => setProvenance(e.target.value)} placeholder="History, provenance, or notes about authenticity" />
                      </div>
                    ) : null}

                    {category === "Real Estate" ? (
                      <>
                        <div className="space-y-2">
                          <Label>Bedrooms</Label>
                          <Input value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} placeholder="e.g. 3" />
                        </div>
                        <div className="space-y-2">
                          <Label>Bathrooms</Label>
                          <Input value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} placeholder="e.g. 2" />
                        </div>
                        <div className="space-y-2">
                          <Label>Square feet / area</Label>
                          <Input value={squareFeet} onChange={(e) => setSquareFeet(e.target.value)} placeholder="e.g. 1200 sqft" />
                        </div>
                      </>
                    ) : null}
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Inspection and pickup notes</Label>
                      <Textarea
                        value={inspectionNotes}
                        onChange={(e) => setInspectionNotes(e.target.value)}
                        placeholder="Tell buyers how they can inspect the item, where pickup happens, and any deadlines that matter."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Transfer or release terms</Label>
                      <Input
                        value={transferTerms}
                        onChange={(e) => setTransferTerms(e.target.value)}
                        placeholder="e.g. Bill of sale at pickup, appointment required"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Title / ownership documents</Label>
                      <Input
                        value={titleStatus}
                        onChange={(e) => setTitleStatus(e.target.value)}
                        placeholder="e.g. Clear title, bill of sale only, not applicable"
                      />
                    </div>
                    <div className="space-y-3 rounded-2xl border bg-background/80 p-4 sm:col-span-2">
                      <div className="text-sm font-medium text-slate-950">Public-sale safeguards</div>
                      <label className="flex items-start gap-3 text-sm text-muted-foreground">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-slate-300"
                          checked={ownershipConfirmed}
                          onChange={(e) => setOwnershipConfirmed(e.target.checked)}
                        />
                        <span>I confirm I have the right to sell or transfer this item and can provide the release terms described in this listing.</span>
                      </label>
                      <label className="flex items-start gap-3 text-sm text-muted-foreground">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-slate-300"
                          checked={publicSaleTermsAccepted}
                          onChange={(e) => setPublicSaleTermsAccepted(e.target.checked)}
                        />
                        <span>I understand this listing is published as a public sale and buyers should rely on these disclosures, inspect before paying, and expect as-is / where-is terms unless I state otherwise above.</span>
                      </label>
                    </div>
                  </>
                )}
                <div className="space-y-2 sm:col-span-2">
                  <Label>Generated metadataURI (from backend)</Label>
                  <Input value={generatedMetadataURI} readOnly placeholder="Will be generated on submit" />
                </div>
                {!isJobListing ? (
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
                ) : null}
              </div>

              {saleType === 0 && !isJobListing ? (
                <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="space-y-2">
                    <Label>Price ({selectedToken?.symbol ?? activeChain.nativeCurrencySymbol})</Label>
                    <Input value={fixedPrice} onChange={(e) => setFixedPrice(e.target.value)} />
                  </div>
                </div>
              ) : null}

              {saleType === 1 && !isJobListing ? (
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

              {saleType === 2 && !isJobListing ? (
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
                  {isSubmitting ? "Publishing..." : isJobListing ? "Publish job" : "Publish ad"}
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
              <div className="market-section-title">{isJobListing ? "What applicants see" : "What buyers see"}</div>
              <CardTitle>Publishing checklist</CardTitle>
              <CardDescription>{isJobListing ? "Keep the draft readable, location-aware, and easy to respond to before it goes live." : "Keep the draft readable, photo-rich, and priced like a real classifieds listing before it goes live."}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0 text-sm text-muted-foreground sm:p-6 sm:pt-0">
              <AccentCallout label="Draft handling" tone="blue">
                Listing details auto-save on this device after edits. Photos stay local to the current session and must be reselected after a refresh.
              </AccentCallout>
              <AccentCallout label="Publish recovery" tone="amber">
                If photo upload or listing creation already succeeded and the later publish step fails, this page keeps a recoverable publish session so you can continue without re-uploading the same images.
              </AccentCallout>
              <AccentCallout label={isJobListing ? "Applicant-facing basics" : "Buyer-facing basics"} tone="mint">
                {isJobListing ? "Lead with a plain-language role title, city or region, clear application contact details, and a short compensation summary." : "Lead with a plain-language title, real photos, city and region, and one direct price."}
              </AccentCallout>
              {!isJobListing ? (
                <AccentCallout label="Public-sale safeguards" tone="amber">
                  Add a condition summary, inspection notes, and the sale terms buyers need before they commit. The live listing now carries those disclosures forward on the public page.
                </AccentCallout>
              ) : null}
              <AccentCallout label={isJobListing ? "Recommended for jobs" : "Recommended for classifieds"} tone="mint">
                {isJobListing ? "Use the description for responsibilities and requirements, then let the applicant reply directly from the public listing page." : "Use fixed price for most listings so the detail page stays simple and buyers can act immediately."}
              </AccentCallout>
              <AccentCallout label="Network" tone="blue">
                {isJobListing ? "Jobs still publish on the marketplace network, but the public page now leads with role details, location, and contact instead of token jargon." : `This publish flow still settles through the ${publicNetworkLabel.toLowerCase()}, but the listing details, location, and recovery path stay front and center instead of chain jargon.`}
              </AccentCallout>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}