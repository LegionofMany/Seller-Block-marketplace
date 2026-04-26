import type { Request, Response } from "express";
import { z } from "zod";

import { requireAdmin, requireAuthAddress } from "../middlewares/auth";
import { HttpError } from "../middlewares/errors";
import { getContext } from "../services/context";
import {
  createNotification,
  createPayment,
  createPromotion,
  deletePromotion,
  findListing,
  findPaymentById,
  findPromotionById,
  findPromotionForSellerListing,
  getUser,
  listAllPromotions,
  listHomepageSponsoredPromotions,
  listPromotionsByCreator,
  updatePayment,
  updatePromotion,
} from "../services/db";
import { requireBytes32 } from "../utils/validation";

const promotionPayload = z.object({
  listingId: z.string().min(1),
  listingChainKey: z.string().trim().min(1).max(64),
  status: z.enum(["draft", "active", "paused", "archived"]),
  priority: z.number().int().min(0).max(1000),
  placementSlot: z.string().trim().max(120).optional(),
  campaignName: z.string().trim().max(160).optional(),
  sponsorLabel: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
  startsAt: z.number().int().nonnegative(),
  endsAt: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const sellerPromotionRequestPayload = z.object({
  listingId: z.string().min(1),
  listingChainKey: z.string().trim().min(1).max(64).optional(),
  campaignName: z.string().trim().max(160).optional(),
  sponsorLabel: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const approvePromotionPayload = z.object({
  startsAt: z.number().int().nonnegative().optional(),
  endsAt: z.number().int().nonnegative().optional(),
  notes: z.string().trim().max(2000).optional(),
});

const reviewPromotionPayload = z.object({
  notes: z.string().trim().max(2000).optional(),
});

const HOMEPAGE_PROMOTION_TYPE = "homepage_sponsored";

function normalizeWalletAddress(value: string) {
  return value.trim().toLowerCase();
}

function getHomepagePromotionConfig() {
  const { env } = getContext();
  return {
    enabled: true,
    mode: "manual_pending" as const,
    amountCents: env.promotionHomepagePriceCents,
    durationDays: env.promotionHomepageDurationDays,
    currency: "usd",
    priority: env.promotionHomepagePriority,
    placementSlot: env.promotionHomepagePlacementSlot,
  };
}

async function requireSellerOwnedListing(listingId: string, listingChainKey: string, subject: string) {
  const { db } = getContext();
  const listing = await findListing(db, listingId, listingChainKey);
  if (!listing) {
    throw new HttpError(404, "Listing not found", "LISTING_NOT_FOUND");
  }

  const user = await getUser(db, subject);
  const ownedAddresses = new Set(
    [subject, user?.linkedWalletAddress ?? null]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => normalizeWalletAddress(value))
  );

  if (!ownedAddresses.has(normalizeWalletAddress(listing.seller))) {
    throw new HttpError(403, "You can only request placement for your own listing", "PROMOTION_LISTING_OWNERSHIP_REQUIRED");
  }

  return { listing, createdBy: normalizeWalletAddress(subject) };
}

export async function listHomepagePromotions(req: Request, res: Response) {
  const { db } = getContext();
  const items = await listHomepageSponsoredPromotions(db, Date.now(), 8);
  return res.json({ items });
}

export async function listSellerPromotionOverview(req: Request, res: Response) {
  const sellerAddress = requireAuthAddress(req);
  const { db } = getContext();
  const items = await listPromotionsByCreator(db, sellerAddress, HOMEPAGE_PROMOTION_TYPE);
  return res.json({
    pricing: getHomepagePromotionConfig(),
    items,
  });
}

export async function createSellerPromotionRequest(req: Request, res: Response) {
  const sellerAddress = requireAuthAddress(req);
  const parsed = sellerPromotionRequestPayload.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Invalid promotion request payload", "INVALID_PROMOTION_REQUEST");
  }

  const listingChainKey = parsed.data.listingChainKey?.trim() || getContext().env.chainKey;
  const listingId = requireBytes32(parsed.data.listingId, "listingId");
  const config = getHomepagePromotionConfig();
  const { listing, createdBy } = await requireSellerOwnedListing(listingId, listingChainKey, sellerAddress);
  const existingPromotion = await findPromotionForSellerListing(getContext().db, listingId, listingChainKey, createdBy, HOMEPAGE_PROMOTION_TYPE);

  if (existingPromotion && existingPromotion.status === "active" && existingPromotion.endsAt > Date.now()) {
    throw new HttpError(409, "This listing already has an active homepage ad", "PROMOTION_ALREADY_ACTIVE");
  }

  const now = Date.now();
  const payment = await createPayment(getContext().db, {
    userAddress: createdBy,
    listingId,
    listingChainKey,
    provider: "manual_review",
    providerSessionId: null,
    status: "pending_review",
    amount: config.amountCents,
    currency: config.currency,
    promotionType: HOMEPAGE_PROMOTION_TYPE,
    metadata: {
      durationDays: config.durationDays,
      placementSlot: config.placementSlot,
      requestedListingSeller: normalizeWalletAddress(listing.seller),
      requestMode: config.mode,
      campaignName: parsed.data.campaignName?.trim() || null,
      sponsorLabel: parsed.data.sponsorLabel?.trim() || null,
      notes: parsed.data.notes?.trim() || null,
    },
    createdAt: now,
    updatedAt: now,
  });

  const promotionMetadata = {
    durationDays: config.durationDays,
    requestMode: config.mode,
    requestedAt: now,
    reviewStatus: "pending",
    paymentReviewState: "pending_review",
  };

  const promotion = existingPromotion
    ? await updatePromotion(getContext().db, {
        ...existingPromotion,
        paymentId: payment.id,
        type: HOMEPAGE_PROMOTION_TYPE,
        status: "draft",
        priority: config.priority,
        placementSlot: config.placementSlot,
        campaignName: parsed.data.campaignName?.trim() || existingPromotion.campaignName || `Homepage ad request for ${listing.id.slice(0, 10)}...`,
        sponsorLabel: parsed.data.sponsorLabel?.trim() || existingPromotion.sponsorLabel || null,
        createdBy,
        notes: parsed.data.notes?.trim() || "Seller requested a homepage paid ad. Payment collection is pending.",
        metadata: {
          ...existingPromotion.metadata,
          ...promotionMetadata,
        },
        startsAt: now,
        endsAt: now + config.durationDays * 24 * 60 * 60 * 1000,
        updatedAt: now,
      })
    : await createPromotion(getContext().db, {
      listingId,
      listingChainKey,
      paymentId: payment.id,
      type: HOMEPAGE_PROMOTION_TYPE,
        status: "draft",
        priority: config.priority,
        placementSlot: config.placementSlot,
        campaignName: parsed.data.campaignName?.trim() || `Homepage ad request for ${listing.id.slice(0, 10)}...`,
        sponsorLabel: parsed.data.sponsorLabel?.trim() || null,
        createdBy,
        notes: parsed.data.notes?.trim() || "Seller requested a homepage paid ad. Payment collection is pending.",
        metadata: promotionMetadata,
        startsAt: now,
        endsAt: now + config.durationDays * 24 * 60 * 60 * 1000,
        createdAt: now,
        updatedAt: now,
    });

  if (!promotion) {
    throw new HttpError(500, "Failed to save homepage ad request", "PROMOTION_REQUEST_FAILED");
  }

  return res.status(201).json({
    payment,
    promotion,
    pricing: config,
    message: "Homepage ad request saved. Payment collection stays pending while the request waits for review.",
  });
}

export async function listAdminPromotions(req: Request, res: Response) {
  requireAdmin(req);
  const { db } = getContext();
  const items = await listAllPromotions(db, typeof req.query.type === "string" ? req.query.type : undefined);
  return res.json({ items });
}

export async function createAdminPromotion(req: Request, res: Response) {
  const createdBy = requireAdmin(req);
  const parsed = promotionPayload.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid promotion payload", "INVALID_PROMOTION");
  if (parsed.data.endsAt <= parsed.data.startsAt) {
    throw new HttpError(400, "Promotion end must be after start", "INVALID_PROMOTION_WINDOW");
  }

  const { db } = getContext();
  const now = Date.now();
  const item = await createPromotion(db, {
    listingId: requireBytes32(parsed.data.listingId, "listingId"),
    listingChainKey: parsed.data.listingChainKey,
    type: "homepage_sponsored",
    status: parsed.data.status,
    priority: parsed.data.priority,
    placementSlot: parsed.data.placementSlot?.trim() || null,
    campaignName: parsed.data.campaignName?.trim() || null,
    sponsorLabel: parsed.data.sponsorLabel?.trim() || null,
    createdBy,
    notes: parsed.data.notes?.trim() || null,
    metadata: parsed.data.metadata ?? {},
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    createdAt: now,
    updatedAt: now,
  });
  return res.status(201).json({ item });
}

export async function updateAdminPromotion(req: Request, res: Response) {
  const createdBy = requireAdmin(req);
  const parsed = promotionPayload.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid promotion payload", "INVALID_PROMOTION");
  if (parsed.data.endsAt <= parsed.data.startsAt) {
    throw new HttpError(400, "Promotion end must be after start", "INVALID_PROMOTION_WINDOW");
  }

  const id = Number(req.params.id ?? 0);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid promotion id", "INVALID_PROMOTION");

  const { db } = getContext();
  const item = await updatePromotion(db, {
    id,
    listingId: requireBytes32(parsed.data.listingId, "listingId"),
    listingChainKey: parsed.data.listingChainKey,
    type: "homepage_sponsored",
    status: parsed.data.status,
    priority: parsed.data.priority,
    placementSlot: parsed.data.placementSlot?.trim() || null,
    campaignName: parsed.data.campaignName?.trim() || null,
    sponsorLabel: parsed.data.sponsorLabel?.trim() || null,
    createdBy,
    notes: parsed.data.notes?.trim() || null,
    metadata: parsed.data.metadata ?? {},
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    updatedAt: Date.now(),
  });
  if (!item) throw new HttpError(404, "Promotion not found", "PROMOTION_NOT_FOUND");
  return res.json({ item });
}

export async function approveAdminPromotion(req: Request, res: Response) {
  const reviewer = requireAdmin(req);
  const parsed = approvePromotionPayload.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, "Invalid promotion approval payload", "INVALID_PROMOTION_APPROVAL");
  }

  const id = Number(req.params.id ?? 0);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid promotion id", "INVALID_PROMOTION");

  const { db } = getContext();
  const existing = await findPromotionById(db, id);
  if (!existing) throw new HttpError(404, "Promotion not found", "PROMOTION_NOT_FOUND");
  if (existing.type !== HOMEPAGE_PROMOTION_TYPE) {
    throw new HttpError(400, "Unsupported promotion type", "INVALID_PROMOTION_TYPE");
  }

  const now = Date.now();
  const durationMs = Math.max(60_000, existing.endsAt - existing.startsAt);
  const startsAt = parsed.data.startsAt ?? now;
  const endsAt = parsed.data.endsAt ?? startsAt + durationMs;
  if (endsAt <= startsAt) {
    throw new HttpError(400, "Promotion end must be after start", "INVALID_PROMOTION_WINDOW");
  }

  const metadata = {
    ...existing.metadata,
    reviewStatus: "approved",
    paymentReviewState: "approved_pending_collection",
    approvedAt: now,
    approvedBy: reviewer,
  };

  const item = await updatePromotion(db, {
    ...existing,
    status: "active",
    notes: parsed.data.notes?.trim() || existing.notes || "Approved from seller ad request queue.",
    metadata,
    startsAt,
    endsAt,
    updatedAt: now,
  });

  if (!item) throw new HttpError(500, "Failed to approve promotion", "PROMOTION_APPROVAL_FAILED");

  if (existing.paymentId) {
    const payment = await findPaymentById(db, existing.paymentId);
    if (payment) {
      await updatePayment(db, {
        ...payment,
        status: "approved_pending_collection",
        metadata: {
          ...payment.metadata,
          reviewStatus: "approved",
          paymentReviewState: "approved_pending_collection",
          approvedAt: now,
          approvedBy: reviewer,
          promotionId: item.id,
        },
        updatedAt: now,
      });
    }
  }

  if (existing.createdBy) {
    await createNotification(db, {
      userAddress: existing.createdBy,
      type: "promotion_review",
      title: "Homepage ad approved",
      body: "Your homepage ad request was approved and is now queued for manual payment collection.",
      dedupeKey: `promotion-review:${item.id}:approved:${now}`,
      payload: {
        promotionId: item.id,
        listingId: item.listingId,
        chainKey: item.listingChainKey,
        status: item.status,
        reviewStatus: "approved",
      },
      createdAt: now,
    });
  }

  return res.json({ item });
}

export async function rejectAdminPromotion(req: Request, res: Response) {
  const reviewer = requireAdmin(req);
  const parsed = reviewPromotionPayload.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, "Invalid promotion rejection payload", "INVALID_PROMOTION_REJECTION");
  }

  const id = Number(req.params.id ?? 0);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid promotion id", "INVALID_PROMOTION");

  const { db } = getContext();
  const existing = await findPromotionById(db, id);
  if (!existing) throw new HttpError(404, "Promotion not found", "PROMOTION_NOT_FOUND");

  const now = Date.now();
  const item = await updatePromotion(db, {
    ...existing,
    status: "archived",
    notes: parsed.data.notes?.trim() || existing.notes || "Rejected from seller ad request queue.",
    metadata: {
      ...existing.metadata,
      reviewStatus: "rejected",
      paymentReviewState: "rejected",
      rejectedAt: now,
      rejectedBy: reviewer,
    },
    updatedAt: now,
  });

  if (!item) throw new HttpError(500, "Failed to reject promotion", "PROMOTION_REJECTION_FAILED");

  if (existing.paymentId) {
    const payment = await findPaymentById(db, existing.paymentId);
    if (payment) {
      await updatePayment(db, {
        ...payment,
        status: "rejected",
        metadata: {
          ...payment.metadata,
          reviewStatus: "rejected",
          paymentReviewState: "rejected",
          rejectedAt: now,
          rejectedBy: reviewer,
          promotionId: item.id,
        },
        updatedAt: now,
      });
    }
  }

  if (existing.createdBy) {
    await createNotification(db, {
      userAddress: existing.createdBy,
      type: "promotion_review",
      title: "Homepage ad not approved",
      body: parsed.data.notes?.trim() || "Your homepage ad request was not approved. Review the notes and resubmit when ready.",
      dedupeKey: `promotion-review:${item.id}:rejected:${now}`,
      payload: {
        promotionId: item.id,
        listingId: item.listingId,
        chainKey: item.listingChainKey,
        status: item.status,
        reviewStatus: "rejected",
      },
      createdAt: now,
    });
  }

  return res.json({ item });
}

export async function pauseAdminPromotion(req: Request, res: Response) {
  const reviewer = requireAdmin(req);
  const parsed = reviewPromotionPayload.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, "Invalid promotion pause payload", "INVALID_PROMOTION_PAUSE");
  }

  const id = Number(req.params.id ?? 0);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid promotion id", "INVALID_PROMOTION");

  const { db } = getContext();
  const existing = await findPromotionById(db, id);
  if (!existing) throw new HttpError(404, "Promotion not found", "PROMOTION_NOT_FOUND");

  const now = Date.now();
  const item = await updatePromotion(db, {
    ...existing,
    status: "paused",
    notes: parsed.data.notes?.trim() || existing.notes || "Paused from seller ad request queue.",
    metadata: {
      ...existing.metadata,
      reviewStatus: "paused",
      paymentReviewState: existing.paymentId ? "on_hold" : (existing.metadata?.paymentReviewState ?? "pending_review"),
      pausedAt: now,
      pausedBy: reviewer,
    },
    updatedAt: now,
  });

  if (!item) throw new HttpError(500, "Failed to pause promotion", "PROMOTION_PAUSE_FAILED");

  if (existing.paymentId) {
    const payment = await findPaymentById(db, existing.paymentId);
    if (payment) {
      await updatePayment(db, {
        ...payment,
        status: "on_hold",
        metadata: {
          ...payment.metadata,
          reviewStatus: "paused",
          paymentReviewState: "on_hold",
          pausedAt: now,
          pausedBy: reviewer,
          promotionId: item.id,
        },
        updatedAt: now,
      });
    }
  }

  return res.json({ item });
}

export async function deleteAdminPromotion(req: Request, res: Response) {
  requireAdmin(req);
  const id = Number(req.params.id ?? 0);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid promotion id", "INVALID_PROMOTION");
  const { db } = getContext();
  await deletePromotion(db, id);
  return res.json({ ok: true });
}