import type { Request, Response } from "express";
import { getContext } from "../services/context";
import { findRaffle, upsertRaffle, type RaffleRow } from "../services/db";
import { fetchListingFromChain, getRegistryInterface } from "../services/blockchain";
import { requireBytes32 } from "../utils/validation";

export async function getRaffleByListingId(req: Request, res: Response) {
  const { env, db, cache, provider } = getContext();
  const listingId = requireBytes32(String(req.params.listingId ?? ""), "listing id");

  const cacheKey = `raffle:${listingId}`;
  const cached = cache.get<any>(cacheKey);
  if (cached) return res.json(cached);

  const existing = await findRaffle(db, listingId);
  if (existing) {
    const body = { raffle: existing };
    cache.set(cacheKey, body);
    return res.json(body);
  }

  // Fallback: estimate ticketsSold from on-chain logs (only on miss).
  const listing = await fetchListingFromChain(provider, env.marketplaceRegistryAddress, listingId);
  if (listing.saleType !== 2) return res.status(404).json({ error: { message: "Raffle not found" } });

  const iface = getRegistryInterface();
  const event = iface.getEvent("RaffleEntered");
  if (!event) return res.status(500).json({ error: { message: "Indexer ABI misconfigured" } });

  const logs = await provider.getLogs({
    address: env.marketplaceRegistryAddress,
    fromBlock: env.startBlock ?? 0,
    toBlock: "latest",
    topics: [event.topicHash, listingId],
  });

  let ticketsSold = 0;
  for (const log of logs) {
    try {
      const parsed = iface.parseLog(log) as any;
      if (!parsed) continue;
      const tickets = Number(parsed.args.tickets);
      if (Number.isFinite(tickets) && tickets > 0) ticketsSold += tickets;
    } catch {
      // ignore
    }
  }

  const row: RaffleRow = {
    listingId,
    ticketsSold,
    endTime: listing.endTime ?? 0,
  };

  await upsertRaffle(db, row);

  const body = { raffle: row };
  cache.set(cacheKey, body);
  return res.json(body);
}
