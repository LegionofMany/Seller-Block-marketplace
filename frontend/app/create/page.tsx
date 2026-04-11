"use client";

import * as React from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { fetchJson } from "@/lib/api";
import { describeToken, getDefaultSettlementToken, getTokenOptions, parseTokenAmount } from "@/lib/tokens";
import { getChainConfigById, getEnv, type ClientEnv } from "@/lib/env";
import { buildListingHref } from "@/lib/listings";
import { marketplaceRegistryAbi } from "@/lib/contracts/abi/MarketplaceRegistry";
import { CATEGORY_TREE, subcategoriesFor } from "@/lib/categories";

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

  let env: ClientEnv;
  try {
    env = getEnv();
  } catch (e: any) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">{e?.message ?? "Missing env vars"}</CardContent>
      </Card>
    );
  }

  const activeChain = getChainConfigById(env, walletChainId);
  const tokenOptions = React.useMemo(() => getTokenOptions(env, activeChain.chainId), [env, activeChain.chainId]);
  const preferredToken = React.useMemo(() => getDefaultSettlementToken(env, activeChain.chainId), [env, activeChain.chainId]);

  React.useEffect(() => {
    if (tokenAddress.trim()) return;
    if (preferredToken.address === zeroAddress) return;
    setTokenAddress(preferredToken.address);
  }, [preferredToken.address, tokenAddress]);

  const selectedToken = React.useMemo(() => {
    const raw = tokenAddress.trim();
    if (!raw) return describeToken(env, activeChain.chainId, zeroAddress);
    if (!isAddress(raw)) return null;
    return describeToken(env, activeChain.chainId, raw as Address);
  }, [activeChain.chainId, env, tokenAddress]);

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

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
      const form = new FormData();
      for (const file of files.slice(0, 12)) form.append("files", file);

      const uploadRes = await fetch(`${(env.backendUrl ?? "http://localhost:4000").replace(/\/$/, "")}/uploads/images`, {
        method: "POST",
        body: form,
      });

      if (!uploadRes.ok) {
        const text = await uploadRes.text().catch(() => "");
        throw new Error(text || `Upload failed (${uploadRes.status})`);
      }

      const uploadJson = (await uploadRes.json()) as { items: Array<{ ipfsUri: string; url: string }> };
      const images = uploadJson.items.map((item) => item.ipfsUri).filter(Boolean);
      if (!images.length) throw new Error("Image upload returned no IPFS URIs");

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
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to upload metadata");
      return;
    }

    if (tokenAddress.trim().length && !selectedToken) {
      toast.error("Invalid token address");
      return;
    }

    const token: Address = tokenAddress.trim().length ? (tokenAddress.trim() as Address) : zeroAddress;
    const settlementToken = selectedToken ?? describeToken(env, activeChain.chainId, zeroAddress);
    const price = saleType === 0 ? parseTokenAmount(fixedPrice || "0", settlementToken) : BigInt(0);

    let listingId: Hex | null = null;

    try {
      if (!publicClient) throw new Error("No public client");

      const toastId = toast.loading("Creating listing…");
      const hash = await writeContractAsync({
        address: activeChain.marketplaceRegistryAddress,
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
        const reserve = parseTokenAmount(reservePrice || "0", settlementToken);
        const increment = parseTokenAmount(minBidIncrement || "0", settlementToken);

        const toast2 = toast.loading("Opening auction…");
        const hash2 = await writeContractAsync({
          address: activeChain.marketplaceRegistryAddress,
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
        const ticket = parseTokenAmount(ticketPrice || "0", settlementToken);
        const target = parseTokenAmount(targetAmount || "0", settlementToken);
        const minP = Number.parseInt(minParticipants, 10);
        const revealBytes32 = parseBytes32(reveal);
        const commit = keccak256(revealBytes32);

        const toast2 = toast.loading("Opening raffle…");
        const hash2 = await writeContractAsync({
          address: activeChain.marketplaceRegistryAddress,
          abi: marketplaceRegistryAbi,
          functionName: "openRaffle",
          args: [listingId, startTime, endTime, ticket, target, minP, commit],
        });

        await publicClient.waitForTransactionReceipt({ hash: hash2 });
        toast.success("Raffle opened", { id: toast2 });
      }

      router.push(buildListingHref(listingId, activeChain.key));
    } catch (err: any) {
      toast.error(err?.shortMessage ?? err?.message ?? "Transaction failed");
    }
  }

  const saleTypeDescription =
    saleType === 0
      ? "Best for everyday classifieds with a clear price and direct checkout."
      : saleType === 1
        ? "Advanced format for timed bidding. Use only when the listing really needs an auction."
        : "Advanced format for community draws and limited drops.";

  return (
    <div className="space-y-6">
      <section className="market-hero px-4 py-5 sm:px-8 sm:py-8">
        <div className="grid gap-6 lg:grid-cols-[1.5fr_0.9fr] lg:items-end">
          <div className="space-y-4">
            <div className="market-section-title">Post a listing</div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-4xl">List it like a local marketplace, not a protocol dashboard.</h1>
              <p className="max-w-2xl text-[13px] leading-6 text-muted-foreground sm:text-base">
                Add photos, location, contact details, and a clear price first. Wallet settlement still powers the listing on {activeChain.name}, but the posting flow now prioritizes what shoppers actually need to see.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="market-chip">Photos up to 12</div>
              <div className="market-chip">Location-aware metadata</div>
              <div className="market-chip">Public listing page after publish</div>
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
              <div className="mt-1 text-sm text-muted-foreground">Choose a supported token before you publish.</div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-6">
        <Card className="market-panel">
          <CardHeader>
            <div className="market-section-title">Listing setup</div>
            <CardTitle>Build the listing buyers expect</CardTitle>
            <CardDescription>{saleTypeDescription}</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <form onSubmit={onSubmit} className="space-y-6">
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
                  <Input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
                  {files.length ? (
                    <>
                      <div className="text-xs text-muted-foreground">Selected: {files.map((file) => file.name).join(", ")}</div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
                        {previewUrls.map((url, index) => (
                          <div key={`${files[index]?.name ?? "file"}-${index}`} className="overflow-hidden rounded-md border bg-muted">
                            <div className="relative aspect-square w-full">
                              <img src={url} alt={files[index]?.name ?? `Selected image ${index + 1}`} className="h-full w-full object-cover" />
                            </div>
                            <div className="truncate border-t px-2 py-1 text-[11px] text-muted-foreground">
                              {files[index]?.name ?? `Image ${index + 1}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
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
                          {tokenOption.symbol}{tokenOption.isStablecoin ? " (stablecoin)" : ""}
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
                    <div className="space-y-2"><Label>Reserve ({selectedToken?.symbol ?? activeChain.nativeCurrencySymbol})</Label><Input value={reservePrice} onChange={(e) => setReservePrice(e.target.value)} /></div>
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

              <Button type="submit" size="lg" className="w-full sm:w-auto">
                Publish listing
              </Button>
            </form>
          </CardContent>
        </Card>

        <aside className="space-y-3 sm:space-y-4">
          <Card className="market-panel">
            <CardHeader>
              <div className="market-section-title">What buyers see</div>
              <CardTitle>Publishing checklist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0 text-sm text-muted-foreground sm:p-6 sm:pt-0">
              <div className="market-note">Lead with plain-language title, real photos, city/region, and one direct price.</div>
              <div className="rounded-xl border p-4">
                <div className="font-medium text-foreground">Recommended for classifieds</div>
                <div className="mt-1">Use fixed price for most listings so the detail page stays simple and buyers can act immediately.</div>
              </div>
              <div className="rounded-xl border p-4">
                <div className="font-medium text-foreground">Network</div>
                <div className="mt-1">This publish flow still settles through {activeChain.name}, but that is now kept as context instead of the main story.</div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}