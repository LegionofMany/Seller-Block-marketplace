import type { Request, Response } from "express";
import { z } from "zod";

import { HttpError } from "../middlewares/errors";
import { requireAuthAddress, requireAdmin } from "../middlewares/auth";
import { getContext } from "../services/context";
import { createPayment, findPaymentById, updatePayment } from "../services/db";
import { relayAcceptOrderWithPermit } from "../services/settlement";

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

  // If admin approved and metadata contains settlement payload, attempt to relay to chain.
  try {
    if (updated && updated.status === "approved") {
      const meta = updated.metadata ?? {};
      const order = meta.order as any | undefined;
      const permit = meta.permit as any | undefined;
      const sellerSignature = typeof meta.sellerSignature === "string" ? meta.sellerSignature : undefined;
      const buyerSignature = typeof meta.buyerSignature === "string" ? meta.buyerSignature : undefined;
      const buyer = typeof meta.buyer === "string" ? meta.buyer : undefined;
      const buyerDeadline = typeof meta.buyerDeadline === "number" ? meta.buyerDeadline : undefined;

      if (order && buyer && buyerDeadline && sellerSignature && buyerSignature && permit) {
        try {
          const chainKey = updated.listingChainKey ?? String(meta.chainKey ?? null);
          const result = await relayAcceptOrderWithPermit({
            chainKey: chainKey as string,
            order: order as any,
            buyer,
            buyerDeadline,
            sellerSignature,
            buyerSignature,
            permit: permit as { deadline: number; v: number; r: string; s: string },
          });

          // Persist tx references into metadata
          const newMeta = { ...(updated.metadata ?? {}), settlement: { txHash: result.txHash, escrowId: result.escrowId, orderHash: result.orderHash } };
          await updatePayment(getContext().db, {
            id: updated.id,
            userAddress: updated.userAddress,
            listingId: updated.listingId ?? null,
            listingChainKey: updated.listingChainKey ?? null,
            provider: updated.provider,
            providerSessionId: updated.providerSessionId ?? null,
            status: updated.status,
            amount: updated.amount,
            currency: updated.currency,
            promotionType: updated.promotionType ?? null,
            metadata: newMeta,
            updatedAt: Date.now(),
          });
        } catch (err: any) {
          const newMeta = { ...(updated.metadata ?? {}), settlementError: String(err?.message ?? err) };
          await updatePayment(getContext().db, {
            id: updated.id,
            userAddress: updated.userAddress,
            listingId: updated.listingId ?? null,
            listingChainKey: updated.listingChainKey ?? null,
            provider: updated.provider,
            providerSessionId: updated.providerSessionId ?? null,
            status: "failed",
            amount: updated.amount,
            currency: updated.currency,
            promotionType: updated.promotionType ?? null,
            metadata: newMeta,
            updatedAt: Date.now(),
          });
        }
      }
    }
  } catch (err) {
    // swallow - we've already updated the payment and don't want to surface relayer errors here
  }

  return res.json({ payment: await findPaymentById(getContext().db, id) });
}
