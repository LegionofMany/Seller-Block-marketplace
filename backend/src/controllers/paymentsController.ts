import type { Request, Response } from "express";
import { z } from "zod";

import { HttpError } from "../middlewares/errors";
import { requireAuthAddress, requireAdmin } from "../middlewares/auth";
import { getContext } from "../services/context";
import { createPayment, findPaymentById, updatePayment } from "../services/db";

const createEscrowPayload = z.object({
  listingId: z.string().min(1),
  listingChainKey: z.string().trim().min(1).max(64).optional(),
  amount: z.number().int().nonnegative().optional(),
  currency: z.string().trim().max(12).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const reviewPayload = z.object({
  status: z.enum(["pending_review", "approved", "rejected", "refunded"]).optional(),
  notes: z.string().max(2000).optional(),
});

export async function createEscrowPayment(req: Request, res: Response) {
  const subject = requireAuthAddress(req);
  const parsed = createEscrowPayload.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, "Invalid payload", "INVALID_PAYLOAD");

  const listingChainKey = parsed.data.listingChainKey?.trim() || getContext().env.chainKey;
  const listingId = parsed.data.listingId.trim();
  const now = Date.now();

  const payment = await createPayment(getContext().db, {
    userAddress: subject,
    listingId,
    listingChainKey,
    provider: "escrow_manual",
    providerSessionId: null,
    status: "pending_review",
    amount: parsed.data.amount ?? 0,
    currency: parsed.data.currency ?? "usd",
    promotionType: null,
    metadata: parsed.data.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  });

  return res.status(201).json({ payment });
}

export async function reviewPayment(req: Request, res: Response) {
  requireAdmin(req);
  const id = Number(req.params.id ?? 0);
  if (!Number.isFinite(id) || id <= 0) throw new HttpError(400, "Invalid payment id", "INVALID_ID");
  const parsed = reviewPayload.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, "Invalid review payload", "INVALID_PAYLOAD");

  const existing = await findPaymentById(getContext().db, id);
  if (!existing) throw new HttpError(404, "Payment not found", "PAYMENT_NOT_FOUND");

  const updated = await updatePayment(getContext().db, {
    id: existing.id,
    userAddress: existing.userAddress,
    listingId: existing.listingId ?? null,
    listingChainKey: existing.listingChainKey ?? null,
    provider: existing.provider,
    providerSessionId: existing.providerSessionId ?? null,
    status: parsed.data.status ?? existing.status,
    amount: existing.amount,
    currency: existing.currency,
    promotionType: existing.promotionType ?? null,
    metadata: { ...(existing.metadata ?? {}), reviewNotes: parsed.data.notes ?? null },
    updatedAt: Date.now(),
  });

  return res.json({ payment: updated });
}
