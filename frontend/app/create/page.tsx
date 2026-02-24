"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  decodeEventLog,
  isAddress,
  keccak256,
  parseEther,
  type Address,
  type Hex,
  zeroAddress,
} from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { fetchJson } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { marketplaceRegistryAbi } from "@/lib/contracts/abi/MarketplaceRegistry";

type SaleType = 0 | 1 | 2;

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

export default function CreateListingPage() {
  const router = useRouter();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [saleType, setSaleType] = React.useState<SaleType>(0);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [image, setImage] = React.useState("");
  const [generatedMetadataURI, setGeneratedMetadataURI] = React.useState<string>("");
  const [tokenAddress, setTokenAddress] = React.useState<string>("");

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

  React.useEffect(() => {
    // Generate a random default reveal once (so user can save it)
    if (reveal !== ("0x" + "00".repeat(32))) return;
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    setReveal(("0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")) as Hex);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    let env;
    try {
      env = getEnv();
    } catch (err: any) {
      toast.error(err?.message ?? "Missing env vars");
      return;
    }

    if (!title.trim() || !description.trim() || !image.trim()) {
      toast.error("Title, description, and image URL are required");
      return;
    }

    let metadataURI: string;
    try {
      const res = await fetchJson<{ metadataURI: string; id: string }>("/metadata", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          image: image.trim(),
          attributes: [],
        }),
        timeoutMs: 5_000,
      });
      metadataURI = res.metadataURI;
      setGeneratedMetadataURI(res.metadataURI);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to upload metadata");
      return;
    }

    const token: Address = tokenAddress.trim().length
      ? (() => {
          if (!isAddress(tokenAddress.trim())) throw new Error("Invalid token address");
          return tokenAddress.trim() as Address;
        })()
      : zeroAddress;

    const isNative = token.toLowerCase() === zeroAddress;

    const price = (() => {
      if (saleType === 0) {
        return isNative ? parseEther(fixedPrice || "0") : BigInt(fixedPrice || "0");
      }
      return BigInt(0);
    })();

    let listingId: Hex | null = null;

    try {
      if (!publicClient) throw new Error("No public client");
      const toastId = toast.loading("Creating listing…");
      const hash = await writeContractAsync({
        address: env.marketplaceRegistryAddress,
        abi: marketplaceRegistryAbi,
        functionName: "createListing",
        args: [metadataURI, price, token, saleType],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      for (const log of (receipt as any).logs ?? []) {
        try {
          const decoded = decodeEventLog({ abi: marketplaceRegistryAbi, data: log.data, topics: log.topics });
          if (decoded.eventName === "ListingCreated") {
            listingId = (decoded.args as any).id as Hex;
            break;
          }
        } catch {
          // ignore non-matching logs
        }
      }

      if (!listingId) throw new Error("Could not find ListingCreated event in receipt");

      toast.success("Listing created", { id: toastId });

      if (saleType === 1) {
        const startTime = toUnixSeconds(auctionStart);
        const endTime = toUnixSeconds(auctionEnd);
        const reserve = isNative ? parseEther(reservePrice || "0") : BigInt(reservePrice || "0");
        const increment = isNative ? parseEther(minBidIncrement || "0") : BigInt(minBidIncrement || "0");

        const toast2 = toast.loading("Opening auction…");
        const hash2 = await writeContractAsync({
          address: env.marketplaceRegistryAddress,
          abi: marketplaceRegistryAbi,
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

      if (saleType === 2) {
        const startTime = toUnixSeconds(raffleStart);
        const endTime = toUnixSeconds(raffleEnd);
        const ticket = isNative ? parseEther(ticketPrice || "0") : BigInt(ticketPrice || "0");
        const target = isNative ? parseEther(targetAmount || "0") : BigInt(targetAmount || "0");
        const minP = Number.parseInt(minParticipants, 10);
        const revealBytes32 = parseBytes32(reveal);
        const commit = keccak256(revealBytes32);

        const toast2 = toast.loading("Opening raffle…");
        const hash2 = await writeContractAsync({
          address: env.marketplaceRegistryAddress,
          abi: marketplaceRegistryAbi,
          functionName: "openRaffle",
          args: [listingId, startTime, endTime, ticket, target, minP, commit],
        });

        await publicClient.waitForTransactionReceipt({ hash: hash2 });
        toast.success("Raffle opened", { id: toast2 });
      }

      router.push(`/listing/${listingId}`);
    } catch (err: any) {
      toast.error(err?.shortMessage ?? err?.message ?? "Transaction failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create listing</h1>
        <p className="text-sm text-muted-foreground">Create a listing on Sepolia via MarketplaceRegistry.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listing details</CardTitle>
          <CardDescription>Choose a sale type and provide required fields.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label>Sale type</Label>
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. My item" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe your item" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Image URL</Label>
                <Input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://…" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Generated metadataURI (from backend)</Label>
                <Input value={generatedMetadataURI} readOnly placeholder="Will be generated on submit" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Token (optional)</Label>
                <Input value={tokenAddress} onChange={(e) => setTokenAddress(e.target.value)} placeholder="Leave empty for ETH, or paste ERC20 address" />
              </div>
            </div>

            {saleType === 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Price {tokenAddress.trim() ? "(raw units)" : "(ETH)"}</Label>
                  <Input value={fixedPrice} onChange={(e) => setFixedPrice(e.target.value)} />
                </div>
              </div>
            ) : null}

            {saleType === 1 ? (
              <div className="space-y-4 rounded-md border p-4">
                <div className="text-sm font-medium">Auction configuration</div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Start</Label>
                    <Input type="datetime-local" value={auctionStart} onChange={(e) => setAuctionStart(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>End</Label>
                    <Input type="datetime-local" value={auctionEnd} onChange={(e) => setAuctionEnd(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Reserve {tokenAddress.trim() ? "(raw units)" : "(ETH)"}</Label>
                    <Input value={reservePrice} onChange={(e) => setReservePrice(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Min bid increment {tokenAddress.trim() ? "(raw units)" : "(ETH)"}</Label>
                    <Input value={minBidIncrement} onChange={(e) => setMinBidIncrement(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Extension window (seconds)</Label>
                    <Input value={extensionWindow} onChange={(e) => setExtensionWindow(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Extension seconds</Label>
                    <Input value={extensionSeconds} onChange={(e) => setExtensionSeconds(e.target.value)} />
                  </div>
                </div>
              </div>
            ) : null}

            {saleType === 2 ? (
              <div className="space-y-4 rounded-md border p-4">
                <div className="text-sm font-medium">Raffle configuration</div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Start</Label>
                    <Input type="datetime-local" value={raffleStart} onChange={(e) => setRaffleStart(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>End</Label>
                    <Input type="datetime-local" value={raffleEnd} onChange={(e) => setRaffleEnd(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Ticket price {tokenAddress.trim() ? "(raw units)" : "(ETH)"}</Label>
                    <Input value={ticketPrice} onChange={(e) => setTicketPrice(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Target amount {tokenAddress.trim() ? "(raw units)" : "(ETH)"}</Label>
                    <Input value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Min participants</Label>
                    <Input value={minParticipants} onChange={(e) => setMinParticipants(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Reveal (bytes32) — save this to close raffle later</Label>
                    <Input value={reveal} onChange={(e) => setReveal(e.target.value as Hex)} />
                  </div>
                </div>
              </div>
            ) : null}

            <Button type="submit" size="lg" className="w-full sm:w-auto">
              Create
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
