import { createHash } from "node:crypto";

import type { Request, Response } from "express";
import { getContext } from "../services/context";
import {
  findAuction,
  findListing,
  findRaffle,
  listMostViewedListings,
  queryListings,
  recordListingView,
  upsertListing,
  type ListingRow,
} from "../services/db";
import { fetchListingFromChain, getRegistryInterface, getRegistryContract } from "../services/blockchain";
import { isSmokeMetadataUri, normalizeChainKey } from "../utils/listings";
import { parseBigint, parseBool, parseLimitOffset, requireAddress, requireBytes32 } from "../utils/validation";

function saleTypeFromQuery(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const v = value.toLowerCase();
  if (v === "fixed" || v === "fixedprice") return 0;
  if (v === "auction") return 1;
  if (v === "raffle") return 2;
  return undefined;
}

function sortFromQuery(value: unknown): "newest" | "price_asc" | "price_desc" | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const v = value.toLowerCase();
  if (v === "newest" || v === "recent") return "newest";
  if (v === "price_asc" || v === "price-asc" || v === "price_low" || v === "price_low_high") return "price_asc";
  if (v === "price_desc" || v === "price-desc" || v === "price_high" || v === "price_high_low") return "price_desc";
  return undefined;
}

function toViewerKey(req: Request): string {
  const authToken = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice("Bearer ".length).trim() : "";
  const forwardedFor = String((req.headers["x-forwarded-for"] as string) ?? req.ip ?? "")
    .split(",")[0]
    ?.trim()
    .slice(0, 80);
  const userAgent = String(req.headers["user-agent"] ?? "").trim().slice(0, 160);
  const seed = authToken || `${forwardedFor}|${userAgent}` || "anonymous";
  return createHash("sha256").update(seed).digest("hex");
}

async function backfillListingIfMissing(id: string, chainKey?: string): Promise<ListingRow | null> {
  const { db, getProviderForChain, getSupportedChain } = getContext();
  const chain = getSupportedChain(chainKey);
  const provider = getProviderForChain(chain.key);

  const existing = await findListing(db, id, chain.key);
  if (existing) return existing;

  const iface = getRegistryInterface();
  const registry = getRegistryContract(provider, chain.marketplaceRegistryAddress);

  // Fetch listing struct first (fast path)
  const listing = await fetchListingFromChain(provider, chain.marketplaceRegistryAddress, id);
  if (!listing.seller) return null;

  // Best-effort: locate ListingCreated log for accurate blockNumber/timestamp
  let blockNumber = 0;
  let createdAt = Date.now();
  try {
    const event = iface.getEvent("ListingCreated");
    if (!event) throw new Error("Missing ListingCreated event in ABI");
    const logs = await provider.getLogs({
      address: chain.marketplaceRegistryAddress,
      fromBlock: chain.startBlock ?? 0,
      toBlock: "latest",
      topics: [event.topicHash, id],
    });
    const first = logs[0];
    if (first) {
      blockNumber = first.blockNumber;
      const block = await provider.getBlock(first.blockNumber);
      if (block?.timestamp) createdAt = Number(block.timestamp) * 1000;
    }
  } catch {
    // ignore
  }

  // If block timestamp not found, fall back to listing startTime via contract result (seconds)
  try {
    const raw = await (registry as any).listings(id);
    const startTime = Number(raw.startTime);
    if (Number.isFinite(startTime) && startTime > 0) createdAt = startTime * 1000;
  } catch {
    // ignore
  }

  const row: ListingRow = {
    chainKey: chain.key,
    chainId: chain.chainId,
    id,
    seller: listing.seller,
    metadataURI: listing.metadataURI,
    price: listing.price.toString(),
    token: listing.token,
    saleType: listing.saleType,
    active: listing.active ? 1 : 0,
    createdAt,
    blockNumber,
  };

  await upsertListing(db, row);
  return row;
}

export async function getListings(req: Request, res: Response) {
  const { env, db, cache } = getContext();
  const chainKey = normalizeChainKey(req.query.chainKey ?? req.query.chain);

  const cacheKey = `listings:${JSON.stringify(req.query)}`;
  const cached = cache.get<any>(cacheKey);
  if (cached) return res.json(cached);

  const { limit, offset } = parseLimitOffset(req.query);

  const saleType = saleTypeFromQuery(req.query.type);
  const active = parseBool(req.query.active);
  const minPrice = parseBigint(req.query.minPrice);
  const maxPrice = parseBigint(req.query.maxPrice);

  const q = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
  const category = typeof req.query.category === "string" ? req.query.category.trim() : undefined;
  const subcategory = typeof req.query.subcategory === "string" ? req.query.subcategory.trim() : undefined;
  const city = typeof req.query.city === "string" ? req.query.city.trim() : undefined;
  const region = typeof req.query.region === "string" ? req.query.region.trim() : undefined;
  const postalCode = typeof req.query.postalCode === "string" ? req.query.postalCode.trim() : undefined;
  const sort = sortFromQuery(req.query.sort);

  const rows = await queryListings(db, {
    ...(chainKey ? { chainKey } : {}),
    saleType,
    active,
    minPrice,
    maxPrice,
    ...(q ? { q } : {}),
    ...(category ? { category } : {}),
    ...(subcategory ? { subcategory } : {}),
    ...(city ? { city } : {}),
    ...(region ? { region } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(sort ? { sort } : {}),
    autoHideReportThreshold: env.listingAutoHideReportsThreshold,
    limit,
    offset,
  });

  const body = { items: rows, limit, offset };
  cache.set(cacheKey, body);
  return res.json(body);
}

export async function getMostViewedListings(req: Request, res: Response) {
  const { env, db, cache } = getContext();
  const chainKey = normalizeChainKey(req.query.chainKey ?? req.query.chain);
  const { limit } = parseLimitOffset(req.query);
  const windowDaysRaw = typeof req.query.windowDays === "string" ? Number.parseInt(req.query.windowDays, 10) : Number.NaN;
  const windowDays = Number.isFinite(windowDaysRaw) ? Math.max(1, Math.min(365, windowDaysRaw)) : 30;

  const cacheKey = `listings:most-viewed:${chainKey ?? "any"}:${limit}:${windowDays}`;
  const cached = cache.get<any>(cacheKey);
  if (cached) return res.json(cached);

  const items = await listMostViewedListings(db, {
    ...(chainKey ? { chainKey } : {}),
    active: true,
    sinceMs: Date.now() - windowDays * 24 * 60 * 60 * 1000,
    autoHideReportThreshold: env.listingAutoHideReportsThreshold,
    limit,
  });

  const body = { items, limit, windowDays };
  cache.set(cacheKey, body);
  return res.json(body);
}

export async function getListingById(req: Request, res: Response) {
  const { db, cache } = getContext();
  const id = requireBytes32(String(req.params.id ?? ""), "listing id");
  const chainKey = normalizeChainKey(req.query.chainKey ?? req.query.chain);

  const cacheKey = `listing:${chainKey ?? 'any'}:${id}`;
  const cached = cache.get<any>(cacheKey);
  if (cached) return res.json(cached);

  const listing = ((await findListing(db, id, chainKey)) ?? (await backfillListingIfMissing(id, chainKey)));
  if (!listing) return res.status(404).json({ error: { message: "Listing not found" } });
  if (isSmokeMetadataUri(listing.metadataURI)) {
    return res.status(404).json({ error: { message: "Listing not found" } });
  }

  const auction = await findAuction(db, id, listing.chainKey);
  const raffle = await findRaffle(db, id, listing.chainKey);

  const body = { listing, auction, raffle };
  cache.set(cacheKey, body);
  return res.json(body);
}

export async function createListingView(req: Request, res: Response) {
  const { db } = getContext();
  const id = requireBytes32(String(req.params.id ?? ""), "listing id");
  const chainKey = normalizeChainKey(req.query.chainKey ?? req.query.chain);

  const listing = ((await findListing(db, id, chainKey)) ?? (await backfillListingIfMissing(id, chainKey)));
  if (!listing || isSmokeMetadataUri(listing.metadataURI)) {
    return res.status(404).json({ error: { message: "Listing not found" } });
  }

  const createdAt = Date.now();
  const bucketMs = 30 * 60 * 1000;
  const viewBucketStart = createdAt - (createdAt % bucketMs);

  await recordListingView(db, {
    listingChainKey: listing.chainKey,
    listingId: listing.id,
    viewerKey: toViewerKey(req),
    createdAt,
    viewBucketStart,
  });

  return res.status(202).json({ ok: true });
}

export async function getListingsBySeller(req: Request, res: Response) {
  const { env, db, cache } = getContext();
  const seller = requireAddress(String(req.params.address ?? ""), "seller address");
  const chainKey = normalizeChainKey(req.query.chainKey ?? req.query.chain);

  const cacheKey = `seller:${seller}:${JSON.stringify(req.query)}`;
  const cached = cache.get<any>(cacheKey);
  if (cached) return res.json(cached);

  const { limit, offset } = parseLimitOffset(req.query);
  const saleType = saleTypeFromQuery(req.query.type);
  const active = parseBool(req.query.active);
  const minPrice = parseBigint(req.query.minPrice);
  const maxPrice = parseBigint(req.query.maxPrice);

  const q = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
  const category = typeof req.query.category === "string" ? req.query.category.trim() : undefined;
  const subcategory = typeof req.query.subcategory === "string" ? req.query.subcategory.trim() : undefined;
  const city = typeof req.query.city === "string" ? req.query.city.trim() : undefined;
  const region = typeof req.query.region === "string" ? req.query.region.trim() : undefined;
  const postalCode = typeof req.query.postalCode === "string" ? req.query.postalCode.trim() : undefined;
  const sort = sortFromQuery(req.query.sort);

  const rows = await queryListings(db, {
    ...(chainKey ? { chainKey } : {}),
    seller,
    saleType,
    active,
    minPrice,
    maxPrice,
    ...(q ? { q } : {}),
    ...(category ? { category } : {}),
    ...(subcategory ? { subcategory } : {}),
    ...(city ? { city } : {}),
    ...(region ? { region } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(sort ? { sort } : {}),
    autoHideReportThreshold: env.listingAutoHideReportsThreshold,
    limit,
    offset,
  });

  const body = { items: rows, limit, offset };
  cache.set(cacheKey, body);
  return res.json(body);
}
