import type { Request, Response } from "express";
import { z } from "zod";
import { getAddress, isHexString } from "ethers";

import { requireAuthAddress } from "../middlewares/auth";
import { HttpError } from "../middlewares/errors";
import { getContext } from "../services/context";
import {
  ensureUser,
  findLatestListingOrderIntent,
  findListing,
  findListingOrderIntentByHash,
  publishListingOrderIntent,
} from "../services/db";
import {
  ESCROW_ACTION_CONFIRM_DELIVERY,
  ESCROW_ACTION_REQUEST_REFUND,
  buildSettlementOrder,
  buyerAcceptanceTypes,
  computeEscrowId,
  escrowActionTypes,
  getSettlementDomain,
  hashOrder,
  orderFromIntentRow,
  relayAcceptOrderWithPermit,
  relayConfirmDelivery,
  relayRequestRefund,
  requireSettlementChain,
  settlementOrderTypes,
  verifySellerOrderSignature,
} from "../services/settlement";
import { normalizeChainKey } from "../utils/listings";
import { requireBytes32 } from "../utils/validation";

const prepareSellerOrderSchema = z.object({
  expiry: z.coerce.number().int().positive().optional(),
  nonce: z.string().trim().min(1).optional(),
});

const publishSellerOrderSchema = z.object({
  order: z.object({
    seller: z.string().min(1),
    listingId: z.string().min(1),
    token: z.string().min(1),
    price: z.string().min(1),
    expiry: z.coerce.number().int().positive(),
    nonce: z.string().min(1),
    termsHash: z.string().min(1),
  }),
  signature: z.string().min(1),
});

const prepareBuyerAcceptanceSchema = z.object({
  orderHash: z.string().trim().optional(),
  deadline: z.coerce.number().int().positive().optional(),
});

const relayAcceptSchema = z.object({
  orderHash: z.string().trim().optional(),
  buyerDeadline: z.coerce.number().int().positive(),
  buyerSignature: z.string().min(1),
  permit: z.object({
    deadline: z.coerce.number().int().positive(),
    v: z.coerce.number().int().min(0).max(255),
    r: z.string().min(1),
    s: z.string().min(1),
  }),
});

const prepareEscrowActionSchema = z.object({
  orderHash: z.string().trim().optional(),
  deadline: z.coerce.number().int().positive().optional(),
});

const relayEscrowActionSchema = z.object({
  orderHash: z.string().trim().optional(),
  deadline: z.coerce.number().int().positive(),
  buyerSignature: z.string().min(1),
});

async function ensureFixedPriceListing(
  listingId: string,
  chainKey?: string | null,
  options?: { requireSettlementConfig?: boolean }
) {
  const { db, getSupportedChain } = getContext();
  const requireSettlementConfig = options?.requireSettlementConfig ?? true;
  const chain = requireSettlementConfig ? requireSettlementChain(chainKey) : getSupportedChain(chainKey);
  const listing = await findListing(db, listingId, chain.key);
  if (!listing) {
    throw new HttpError(404, "Listing not found");
  }
  if (listing.saleType !== 0) {
    throw new HttpError(400, "Only fixed-price listings support MarketplaceSettlementV2");
  }
  if (!listing.active) {
    throw new HttpError(400, "Listing is not active");
  }
  return listing;
}

async function loadIntent(listingId: string, chainKey: string, orderHash?: string) {
  const { db } = getContext();
  const row = orderHash ? await findListingOrderIntentByHash(db, orderHash) : await findLatestListingOrderIntent(db, listingId, chainKey);
  if (!row || row.listingId !== listingId || row.chainKey !== chainKey) {
    throw new HttpError(404, "Signed seller order not found");
  }
  if (row.expiry < Math.floor(Date.now() / 1000)) {
    throw new HttpError(410, "Signed seller order has expired");
  }
  return row;
}

function requireHexSignatureComponent(value: string, name: string) {
  if (!isHexString(value, 32)) throw new HttpError(400, `Invalid ${name}`);
  return value;
}

export async function prepareSellerOrder(req: Request, res: Response) {
  const seller = requireAuthAddress(req);
  const listingId = requireBytes32(String(req.params.id ?? ""), "listing id");
  const chainKey = normalizeChainKey(req.query.chainKey ?? req.query.chain);
  const listing = await ensureFixedPriceListing(listingId, chainKey);
  if (getAddress(listing.seller) !== getAddress(seller)) {
    throw new HttpError(403, "Only the seller can publish a signed order");
  }

  const parsed = prepareSellerOrderSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid seller order request");
  }

  const expiry = parsed.data.expiry ?? Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  if (expiry <= Math.floor(Date.now() / 1000) + 60) {
    throw new HttpError(400, "Expiry must be at least 60 seconds in the future");
  }
  const nonce = parsed.data.nonce ?? String(Date.now());

  const order = buildSettlementOrder(listing, seller, expiry, nonce);
  const orderHash = await hashOrder(order, listing.chainKey);
  const domain = await getSettlementDomain(listing.chainKey);

  return res.json({
    domain,
    primaryType: "Order",
    types: settlementOrderTypes,
    message: order,
    orderHash,
  });
}

export async function publishSellerOrder(req: Request, res: Response) {
  const { db } = getContext();
  const seller = requireAuthAddress(req);
  const now = Date.now();
  const listingId = requireBytes32(String(req.params.id ?? ""), "listing id");
  const chainKey = normalizeChainKey(req.query.chainKey ?? req.query.chain);
  const listing = await ensureFixedPriceListing(listingId, chainKey);
  if (getAddress(listing.seller) !== getAddress(seller)) {
    throw new HttpError(403, "Only the seller can publish a signed order");
  }

  const parsed = publishSellerOrderSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid signed order payload");
  }

  const { order, signature } = parsed.data;
  if (requireBytes32(order.listingId, "listing id") !== listingId) throw new HttpError(400, "Listing id mismatch");
  if (getAddress(order.seller) !== getAddress(seller)) throw new HttpError(400, "Seller mismatch");
  if (getAddress(order.token) !== getAddress(listing.token)) throw new HttpError(400, "Order token no longer matches listing");
  if (order.price !== listing.price) throw new HttpError(400, "Order price no longer matches listing");

  const recovered = await verifySellerOrderSignature(order, signature, listing.chainKey);
  if (getAddress(recovered) !== getAddress(seller)) {
    throw new HttpError(401, "Invalid seller signature");
  }

  await ensureUser(db, seller, now);
  const item = await publishListingOrderIntent(db, {
    orderHash: await hashOrder(order, listing.chainKey),
    chainKey: listing.chainKey,
    listingId,
    seller: getAddress(seller),
    signature,
    token: getAddress(order.token),
    price: order.price,
    expiry: order.expiry,
    nonce: order.nonce,
    termsHash: order.termsHash,
    isLatest: true,
    createdAt: now,
    updatedAt: now,
  });

  return res.status(201).json({ item });
}

export async function getLatestSellerOrder(req: Request, res: Response) {
  const { db } = getContext();
  const listingId = requireBytes32(String(req.params.id ?? ""), "listing id");
  const chainKey = normalizeChainKey(req.query.chainKey ?? req.query.chain);
  const listing = await ensureFixedPriceListing(listingId, chainKey, { requireSettlementConfig: false });

  try {
    requireSettlementChain(listing.chainKey);
  } catch (err) {
    if (err instanceof HttpError && err.status === 503) {
      return res.json({ item: null });
    }
    throw err;
  }

  const item = await findLatestListingOrderIntent(db, listingId, listing.chainKey);
  if (!item || item.expiry < Math.floor(Date.now() / 1000)) {
    return res.json({ item: null });
  }
  return res.json({ item });
}

export async function prepareBuyerAcceptance(req: Request, res: Response) {
  const buyer = requireAuthAddress(req);
  const listingId = requireBytes32(String(req.params.id ?? ""), "listing id");
  const chainKey = normalizeChainKey(req.query.chainKey ?? req.query.chain);
  const listing = await ensureFixedPriceListing(listingId, chainKey);
  const parsed = prepareBuyerAcceptanceSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid buyer acceptance request");
  }
  if (getAddress(listing.seller) === getAddress(buyer)) {
    throw new HttpError(400, "Seller cannot accept their own order");
  }

  const intent = await loadIntent(listingId, listing.chainKey, parsed.data.orderHash);
  const deadline = parsed.data.deadline ?? Math.floor(Date.now() / 1000) + 15 * 60;
  const domain = await getSettlementDomain(listing.chainKey);

  return res.json({
    domain,
    primaryType: "BuyerAcceptance",
    types: buyerAcceptanceTypes,
    message: {
      orderHash: intent.orderHash,
      buyer: getAddress(buyer),
      deadline,
    },
    order: orderFromIntentRow(intent),
    orderHash: intent.orderHash,
    sellerSignature: intent.signature,
  });
}

export async function relayAccept(req: Request, res: Response) {
  const buyer = requireAuthAddress(req);
  const listingId = requireBytes32(String(req.params.id ?? ""), "listing id");
  const chainKey = normalizeChainKey(req.query.chainKey ?? req.query.chain);
  const listing = await ensureFixedPriceListing(listingId, chainKey);
  const parsed = relayAcceptSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid acceptance relay payload");
  }
  if (getAddress(listing.seller) === getAddress(buyer)) {
    throw new HttpError(400, "Seller cannot accept their own order");
  }

  const intent = await loadIntent(listingId, listing.chainKey, parsed.data.orderHash);
  const result = await relayAcceptOrderWithPermit({
    chainKey: listing.chainKey,
    order: orderFromIntentRow(intent),
    buyer,
    buyerDeadline: parsed.data.buyerDeadline,
    sellerSignature: intent.signature,
    buyerSignature: parsed.data.buyerSignature,
    permit: {
      deadline: parsed.data.permit.deadline,
      v: parsed.data.permit.v,
      r: requireHexSignatureComponent(parsed.data.permit.r, "permit.r"),
      s: requireHexSignatureComponent(parsed.data.permit.s, "permit.s"),
    },
  });

  return res.status(202).json(result);
}

async function prepareEscrowAction(req: Request, res: Response, action: 0 | 1) {
  const buyer = requireAuthAddress(req);
  const listingId = requireBytes32(String(req.params.id ?? ""), "listing id");
  const chainKey = normalizeChainKey(req.query.chainKey ?? req.query.chain);
  const listing = await ensureFixedPriceListing(listingId, chainKey);
  const parsed = prepareEscrowActionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid escrow action request");
  }

  const intent = await loadIntent(listingId, listing.chainKey, parsed.data.orderHash);
  const deadline = parsed.data.deadline ?? Math.floor(Date.now() / 1000) + 15 * 60;
  const escrowId = await computeEscrowId(intent.orderHash, buyer, listing.chainKey);
  const domain = await getSettlementDomain(listing.chainKey);

  return res.json({
    domain,
    primaryType: "EscrowAction",
    types: escrowActionTypes,
    message: {
      escrowId,
      buyer: getAddress(buyer),
      action,
      deadline,
    },
    orderHash: intent.orderHash,
    escrowId,
  });
}

export async function prepareConfirmDelivery(req: Request, res: Response) {
  return prepareEscrowAction(req, res, ESCROW_ACTION_CONFIRM_DELIVERY);
}

export async function prepareRequestRefund(req: Request, res: Response) {
  return prepareEscrowAction(req, res, ESCROW_ACTION_REQUEST_REFUND);
}

export async function relayConfirm(req: Request, res: Response) {
  const buyer = requireAuthAddress(req);
  const listingId = requireBytes32(String(req.params.id ?? ""), "listing id");
  const chainKey = normalizeChainKey(req.query.chainKey ?? req.query.chain);
  const listing = await ensureFixedPriceListing(listingId, chainKey);
  const parsed = relayEscrowActionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid confirm relay payload");
  }

  const intent = await loadIntent(listingId, listing.chainKey, parsed.data.orderHash);
  const escrowId = await computeEscrowId(intent.orderHash, buyer, listing.chainKey);
  const result = await relayConfirmDelivery({
    chainKey: listing.chainKey,
    escrowId,
    deadline: parsed.data.deadline,
    buyerSignature: parsed.data.buyerSignature,
  });
  return res.status(202).json({ ...result, escrowId, orderHash: intent.orderHash });
}

export async function relayRefund(req: Request, res: Response) {
  const buyer = requireAuthAddress(req);
  const listingId = requireBytes32(String(req.params.id ?? ""), "listing id");
  const chainKey = normalizeChainKey(req.query.chainKey ?? req.query.chain);
  const listing = await ensureFixedPriceListing(listingId, chainKey);
  const parsed = relayEscrowActionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid refund relay payload");
  }

  const intent = await loadIntent(listingId, listing.chainKey, parsed.data.orderHash);
  const escrowId = await computeEscrowId(intent.orderHash, buyer, listing.chainKey);
  const result = await relayRequestRefund({
    chainKey: listing.chainKey,
    escrowId,
    deadline: parsed.data.deadline,
    buyerSignature: parsed.data.buyerSignature,
  });
  return res.status(202).json({ ...result, escrowId, orderHash: intent.orderHash });
}