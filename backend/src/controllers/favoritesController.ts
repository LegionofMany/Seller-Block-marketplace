import type { Request, Response } from "express";
import { z } from "zod";

import { requireAuthAddress } from "../middlewares/auth";
import { getContext } from "../services/context";
import { createFavoriteListing, deleteFavoriteListing, isListingFavorited, listFavoriteListingsByUser } from "../services/db";
import { requireBytes32 } from "../utils/validation";

export async function listMyFavoriteListings(req: Request, res: Response) {
  const { db } = getContext();
  const userAddress = requireAuthAddress(req);
  const items = await listFavoriteListingsByUser(db, userAddress, 100);
  return res.json({ items });
}

export async function getFavoriteListingState(req: Request, res: Response) {
  const { db } = getContext();
  const userAddress = requireAuthAddress(req);
  const listingId = requireBytes32(String(req.params.listingId ?? ""), "listingId");
  const chainKey = String(req.query.chain ?? "sepolia").trim() || "sepolia";
  const isFavorite = await isListingFavorited(db, userAddress, chainKey, listingId);
  return res.json({ isFavorite });
}

export async function addFavoriteListing(req: Request, res: Response) {
  const parsed = z
    .object({
      listingId: z.string().min(1),
      chainKey: z.string().trim().min(1).max(64),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Invalid favorite payload", code: "INVALID_FAVORITE" } });
  }

  const { db } = getContext();
  const userAddress = requireAuthAddress(req);
  const listingId = requireBytes32(parsed.data.listingId, "listingId");
  const chainKey = parsed.data.chainKey.trim();
  await createFavoriteListing(db, {
    userAddress,
    listingChainKey: chainKey,
    listingId,
    createdAt: Date.now(),
  });

  return res.status(201).json({ ok: true });
}

export async function removeFavoriteListing(req: Request, res: Response) {
  const { db } = getContext();
  const userAddress = requireAuthAddress(req);
  const listingId = requireBytes32(String(req.params.listingId ?? ""), "listingId");
  const chainKey = String(req.query.chain ?? "sepolia").trim() || "sepolia";
  await deleteFavoriteListing(db, userAddress, chainKey, listingId);
  return res.json({ ok: true });
}