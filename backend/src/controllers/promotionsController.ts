import type { Request, Response } from "express";
import { z } from "zod";

import { requireAdmin } from "../middlewares/auth";
import { HttpError } from "../middlewares/errors";
import { getContext } from "../services/context";
import { createPromotion, deletePromotion, listAllPromotions, listHomepageSponsoredPromotions, updatePromotion } from "../services/db";
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

export async function listHomepagePromotions(req: Request, res: Response) {
  const { db } = getContext();
  const items = await listHomepageSponsoredPromotions(db, Date.now(), 8);
  return res.json({ items });
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

export async function deleteAdminPromotion(req: Request, res: Response) {
  requireAdmin(req);
  const id = Number(req.params.id ?? 0);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid promotion id", "INVALID_PROMOTION");
  const { db } = getContext();
  await deletePromotion(db, id);
  return res.json({ ok: true });
}