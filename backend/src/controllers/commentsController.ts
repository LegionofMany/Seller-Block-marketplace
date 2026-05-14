import type { Request, Response } from "express";
import { z } from "zod";

import { requireAuthAddress } from "../middlewares/auth";
import { HttpError } from "../middlewares/errors";
import { fetchListingFromChain } from "../services/blockchain";
import { getContext } from "../services/context";
import {
  createListingComment,
  createNotification,
  ensureUser,
  findListing,
  listListingComments,
  type ListingRow,
  upsertListing,
} from "../services/db";
import { normalizeChainKey } from "../utils/listings";
import { parseLimitOffset, requireBytes32 } from "../utils/validation";

const createCommentSchema = z.object({
  body: z.string().min(1).max(1000),
});

async function ensureListingExists(id: string, chainKey?: string): Promise<ListingRow | null> {
  const { db, getProviderForChain, getSupportedChain } = getContext();
  const chain = getSupportedChain(chainKey);
  const existing = await findListing(db, id, chain.key);
  if (existing) return existing;

  const provider = getProviderForChain(chain.key);
  const listing = await fetchListingFromChain(provider, chain.marketplaceRegistryAddress, id);
  if (!listing.seller) return null;

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
    createdAt: Date.now(),
    blockNumber: 0,
  };

  await upsertListing(db, row);
  return row;
}

export async function getListingComments(req: Request, res: Response) {
  const { db } = getContext();
  const listingId = requireBytes32(String(req.params.id ?? ""), "listing id");
  const chainKey = normalizeChainKey(req.query.chainKey ?? req.query.chain);
  const listing = await ensureListingExists(listingId, chainKey);
  if (!listing) {
    throw new HttpError(404, "Listing not found");
  }

  const { limit, offset } = parseLimitOffset(req.query);
  const items = await listListingComments(db, listingId, listing.chainKey, { limit, offset });
  return res.json({ items, limit, offset });
}

export async function createComment(req: Request, res: Response) {
  const { db } = getContext();
  const listingId = requireBytes32(String(req.params.id ?? ""), "listing id");
  const chainKey = normalizeChainKey(req.query.chainKey ?? req.query.chain);
  const listing = await ensureListingExists(listingId, chainKey);
  if (!listing) {
    throw new HttpError(404, "Listing not found");
  }

  const parsed = createCommentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid comment body");
  }

  const authorAddress = requireAuthAddress(req);
  const body = parsed.data.body.trim();
  if (!body) {
    throw new HttpError(400, "Comment body is required");
  }
  if (/[<>]/.test(body)) {
    throw new HttpError(400, "Comment body contains invalid characters");
  }

  const now = Date.now();
  await ensureUser(db, authorAddress, now);
  const item = await createListingComment(db, {
    listingId,
    listingChainKey: listing.chainKey,
    authorAddress,
    body,
    createdAt: now,
    updatedAt: now,
  });

  // Notify the listing owner — skip if they commented on their own ad
  const sellerAddress = listing.seller?.toLowerCase() ?? "";
  if (sellerAddress && sellerAddress !== authorAddress.toLowerCase()) {
    const { env } = getContext();
    const listingHref = env.frontendAppUrl
      ? `${env.frontendAppUrl.replace(/\/$/, "")}/listing/${listingId}?chain=${encodeURIComponent(listing.chainKey)}`
      : null;

    // Fire-and-forget: notification failure must never block the comment response
    void createNotification(db, {
      userAddress: listing.seller!,
      type: "listing_comment",
      title: "New comment on your listing",
      body: body.length > 120 ? `${body.slice(0, 120)}…` : body,
      dedupeKey: `listing-comment:${item.id}`,
      payload: {
        commentId: item.id,
        listingId,
        chainKey: listing.chainKey,
        ...(listingHref ? { href: listingHref } : {}),
      },
      createdAt: now,
    });
  }

  return res.status(201).json({ item });
}
