import type { Request, Response } from "express";
import { getContext } from "../services/context";
import {
  findAuction,
  findListing,
  findRaffle,
  queryListings,
  upsertListing,
  type ListingRow,
} from "../services/db";
import { fetchListingFromChain, getRegistryInterface, getRegistryContract } from "../services/blockchain";
import { parseBigint, parseBool, parseLimitOffset, requireAddress, requireBytes32 } from "../utils/validation";

function saleTypeFromQuery(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const v = value.toLowerCase();
  if (v === "fixed" || v === "fixedprice") return 0;
  if (v === "auction") return 1;
  if (v === "raffle") return 2;
  return undefined;
}

async function backfillListingIfMissing(id: string): Promise<ListingRow | null> {
  const { env, db, provider } = getContext();

  const existing = findListing(db, id);
  if (existing) return existing;

  const iface = getRegistryInterface();
  const registry = getRegistryContract(provider, env.marketplaceRegistryAddress);

  // Fetch listing struct first (fast path)
  const listing = await fetchListingFromChain(provider, env.marketplaceRegistryAddress, id);
  if (!listing.seller) return null;

  // Best-effort: locate ListingCreated log for accurate blockNumber/timestamp
  let blockNumber = 0;
  let createdAt = Date.now();
  try {
    const event = iface.getEvent("ListingCreated");
    if (!event) throw new Error("Missing ListingCreated event in ABI");
    const logs = await provider.getLogs({
      address: env.marketplaceRegistryAddress,
      fromBlock: env.startBlock ?? 0,
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

  upsertListing(db, row);
  return row;
}

export async function getListings(req: Request, res: Response) {
  const { db, cache } = getContext();

  const cacheKey = `listings:${JSON.stringify(req.query)}`;
  const cached = cache.get<any>(cacheKey);
  if (cached) return res.json(cached);

  const { limit, offset } = parseLimitOffset(req.query);

  const saleType = saleTypeFromQuery(req.query.type);
  const active = parseBool(req.query.active);
  const minPrice = parseBigint(req.query.minPrice);
  const maxPrice = parseBigint(req.query.maxPrice);

  const rows = queryListings(db, {
    saleType,
    active,
    minPrice,
    maxPrice,
    limit,
    offset,
  });

  const body = { items: rows, limit, offset };
  cache.set(cacheKey, body);
  return res.json(body);
}

export async function getListingById(req: Request, res: Response) {
  const { db, cache } = getContext();
  const id = requireBytes32(String(req.params.id ?? ""), "listing id");

  const cacheKey = `listing:${id}`;
  const cached = cache.get<any>(cacheKey);
  if (cached) return res.json(cached);

  const listing = (findListing(db, id) ?? (await backfillListingIfMissing(id)));
  if (!listing) return res.status(404).json({ error: { message: "Listing not found" } });

  const auction = findAuction(db, id);
  const raffle = findRaffle(db, id);

  const body = { listing, auction, raffle };
  cache.set(cacheKey, body);
  return res.json(body);
}

export async function getListingsBySeller(req: Request, res: Response) {
  const { db, cache } = getContext();
  const seller = requireAddress(String(req.params.address ?? ""), "seller address");

  const cacheKey = `seller:${seller}:${JSON.stringify(req.query)}`;
  const cached = cache.get<any>(cacheKey);
  if (cached) return res.json(cached);

  const { limit, offset } = parseLimitOffset(req.query);
  const saleType = saleTypeFromQuery(req.query.type);
  const active = parseBool(req.query.active);
  const minPrice = parseBigint(req.query.minPrice);
  const maxPrice = parseBigint(req.query.maxPrice);

  const rows = queryListings(db, {
    seller,
    saleType,
    active,
    minPrice,
    maxPrice,
    limit,
    offset,
  });

  const body = { items: rows, limit, offset };
  cache.set(cacheKey, body);
  return res.json(body);
}
