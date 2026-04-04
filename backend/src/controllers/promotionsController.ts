import type { Request, Response } from "express";
import { z } from "zod";

import { requireAuthAddress } from "../middlewares/auth";
import { HttpError } from "../middlewares/errors";
import { getContext } from "../services/context";
import { createNotification, createPayment, createPromotion, findActivePromotionByListing, findListing, findPaymentByProviderSessionId, listPaymentsByUser, listPromotionsByUser, updatePaymentStatus } from "../services/db";
import { getPromotionConfig, getPromotionConfigs, getStripeClient, type PromotionType } from "../services/promotions";
import { normalizeChainKey } from "../utils/listings";
import { requireBytes32 } from "../utils/validation";

const checkoutSchema = z.object({
  listingId: z.string().min(1),
  chainKey: z.string().min(1).optional(),
  promotionType: z.enum(["bump", "top", "featured"]),
});

const confirmSchema = z.object({
  sessionId: z.string().min(1),
});

export async function getPromotionOptions(_req: Request, res: Response) {
  return res.json({ items: getPromotionConfigs() });
}

export async function getMyPromotionData(req: Request, res: Response) {
  const { db } = getContext();
  const address = requireAuthAddress(req);
  const [payments, promotions] = await Promise.all([listPaymentsByUser(db, address), listPromotionsByUser(db, address)]);
  return res.json({ payments, promotions, options: getPromotionConfigs() });
}

export async function createPromotionCheckoutSession(req: Request, res: Response) {
  const { db, env } = getContext();
  const address = requireAuthAddress(req);
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid promotion checkout payload", "INVALID_PROMOTION_CHECKOUT");
  if (!env.frontendAppUrl) throw new HttpError(503, "FRONTEND_APP_URL is not configured", "FRONTEND_URL_NOT_CONFIGURED");

  const listingId = requireBytes32(parsed.data.listingId, "listingId");
  const listingChainKey = normalizeChainKey(parsed.data.chainKey) ?? env.chainKey;
  const listing = await findListing(db, listingId, listingChainKey);
  if (!listing) throw new HttpError(404, "Listing not found", "LISTING_NOT_FOUND");
  if (listing.seller.toLowerCase() !== address.toLowerCase()) {
    throw new HttpError(403, "You can only promote your own listing", "PROMOTION_FORBIDDEN");
  }

  const existing = await findActivePromotionByListing(db, listingId, listing.chainKey, Date.now());
  if (existing && existing.type === parsed.data.promotionType) {
    throw new HttpError(409, "This listing already has an active promotion of that type", "PROMOTION_ALREADY_ACTIVE");
  }

  const config = getPromotionConfig(parsed.data.promotionType);
  const stripe = getStripeClient();
  const appBase = env.frontendAppUrl.replace(/\/$/, "");

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${appBase}/dashboard?promotion_session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appBase}/dashboard?promotion_cancelled=1`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: config.amountCents,
          product_data: {
            name: `${config.label} placement`,
            description: `${config.description} Listing ${listingId}.`,
          },
        },
      },
    ],
    metadata: {
      listingId,
      chainKey: listing.chainKey,
      promotionType: parsed.data.promotionType,
      userAddress: address,
    },
  });

  const now = Date.now();
  await createPayment(db, {
    userAddress: address,
    listingId,
    listingChainKey: listing.chainKey,
    provider: "stripe",
    providerSessionId: session.id,
    status: "pending",
    amount: config.amountCents,
    currency: "usd",
    promotionType: parsed.data.promotionType,
    metadata: {
      checkoutUrl: session.url ?? null,
    },
    createdAt: now,
    updatedAt: now,
  });

  return res.status(201).json({ sessionId: session.id, url: session.url });
}

export async function confirmPromotionCheckoutSession(req: Request, res: Response) {
  const { db, env } = getContext();
  const address = requireAuthAddress(req);
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid promotion confirm payload", "INVALID_PROMOTION_CONFIRM");

  const payment = await findPaymentByProviderSessionId(db, parsed.data.sessionId);
  if (!payment) throw new HttpError(404, "Payment not found", "PAYMENT_NOT_FOUND");
  if (payment.userAddress.toLowerCase() !== address.toLowerCase()) {
    throw new HttpError(403, "Not allowed to confirm this payment", "PAYMENT_FORBIDDEN");
  }

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(parsed.data.sessionId);
  const metadata = {
    ...payment.metadata,
    paymentStatus: session.payment_status,
    customerDetails: session.customer_details?.email ?? null,
  };

  if (session.payment_status !== "paid") {
    const updated = await updatePaymentStatus(db, {
      id: payment.id,
      status: session.status ?? payment.status,
      metadata,
      updatedAt: Date.now(),
    });
    return res.json({ payment: updated, promotion: null, activated: false });
  }

  if (!payment.listingId || !payment.promotionType) {
    throw new HttpError(500, "Payment is missing promotion metadata", "INVALID_PAYMENT_STATE");
  }

  const listingChainKey = payment.listingChainKey ?? env.chainKey;
  const alreadyActive = await findActivePromotionByListing(db, payment.listingId, listingChainKey, Date.now());
  if (payment.status === "completed" && alreadyActive) {
    return res.json({ payment, promotion: alreadyActive, activated: true });
  }

  const config = getPromotionConfig(payment.promotionType);
  const now = Date.now();
  const promotion = await createPromotion(db, {
    listingId: payment.listingId,
    listingChainKey,
    paymentId: payment.id,
    type: payment.promotionType as PromotionType,
    status: "active",
    priority: config.priority,
    startsAt: now,
    endsAt: now + config.durationHours * 60 * 60 * 1000,
    createdAt: now,
    updatedAt: now,
  });

  const updatedPayment = await updatePaymentStatus(db, {
    id: payment.id,
    status: "completed",
    metadata: {
      ...metadata,
      promotionId: promotion.id,
      promotionEndsAt: promotion.endsAt,
    },
    updatedAt: now,
  });

  await createNotification(db, {
    userAddress: address,
    type: "promotion_activated",
    title: `${config.label} placement activated`,
    body: `Your ${config.label.toLowerCase()} placement for listing ${payment.listingId} is now live.`,
    dedupeKey: `promotion-activated:${payment.id}`,
    payload: {
      listingId: payment.listingId,
      chainKey: listingChainKey,
      promotionId: promotion.id,
      promotionType: promotion.type,
      paymentId: payment.id,
      endsAt: promotion.endsAt,
    },
    createdAt: now,
  });

  return res.json({ payment: updatedPayment, promotion, activated: true });
}