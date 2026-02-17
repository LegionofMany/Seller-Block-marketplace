import type { Request, Response } from "express";
import { getContext } from "../services/context";
import { findAuction, upsertAuction, type AuctionRow } from "../services/db";
import {
  fetchListingFromChain,
  getAuctionContract,
  getProtocolAddresses,
} from "../services/blockchain";
import { requireBytes32 } from "../utils/validation";

export async function getAuctionByListingId(req: Request, res: Response) {
  const { env, db, cache, provider } = getContext();
  const listingId = requireBytes32(String(req.params.listingId ?? ""), "listing id");

  const cacheKey = `auction:${listingId}`;
  const cached = cache.get<any>(cacheKey);
  if (cached) return res.json(cached);

  const existing = findAuction(db, listingId);
  if (existing) {
    const body = { auction: existing };
    cache.set(cacheKey, body);
    return res.json(body);
  }

  // Fallback: best-effort load from chain on miss.
  const listing = await fetchListingFromChain(provider, env.marketplaceRegistryAddress, listingId);
  if (listing.saleType !== 1) return res.status(404).json({ error: { message: "Auction not found" } });
  if (!listing.moduleId || listing.moduleId === "0x" + "00".repeat(32)) {
    return res.status(404).json({ error: { message: "Auction not opened" } });
  }

  const addrs = await getProtocolAddresses(provider, env.marketplaceRegistryAddress, 5 * 60_000);
  const auction = getAuctionContract(provider, addrs.auctionModule);

  const outcome = await (auction as any).getOutcome(listing.moduleId);
  const winner = String(outcome.winner);
  const winningBid = BigInt(outcome.winningBid);

  const row: AuctionRow = {
    listingId,
    highestBid: winningBid.toString(),
    highestBidder: winner,
    endTime: listing.endTime ?? 0,
  };

  upsertAuction(db, row);
  const body = { auction: row };
  cache.set(cacheKey, body);
  return res.json(body);
}
