import type { Request, Response } from "express";
import { z } from "zod";
import { verifyMessage } from "ethers";

import { HttpError } from "../middlewares/errors";
import { getContext } from "../services/context";
import { createReport, listUserBlocks, upsertUserBlock } from "../services/db";
import { requireAddress, requireBytes32 } from "../utils/validation";

const MAX_SKEW_MS = 10 * 60 * 1000;

function buildBlockMessage(params: { blocker: string; blocked: string; issuedAt: number }): string {
  const issuedAtIso = new Date(params.issuedAt).toISOString();
  return [
    "Seller-Block Marketplace",
    "Action: Block user",
    `Blocker: ${params.blocker}`,
    `Blocked: ${params.blocked}`,
    `IssuedAt: ${issuedAtIso}`,
  ].join("\n");
}

function buildReportMessage(params: {
  reporter: string;
  targetType: string;
  targetId: string;
  reason: string;
  issuedAt: number;
}): string {
  const issuedAtIso = new Date(params.issuedAt).toISOString();
  return [
    "Seller-Block Marketplace",
    "Action: Report",
    `Reporter: ${params.reporter}`,
    `TargetType: ${params.targetType}`,
    `TargetId: ${params.targetId}`,
    `Reason: ${params.reason}`,
    `IssuedAt: ${issuedAtIso}`,
  ].join("\n");
}

function requireRecentIssuedAt(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) throw new HttpError(400, "Missing issuedAt", "MISSING_ISSUED_AT");
  const issuedAt = Math.trunc(n);
  if (Math.abs(Date.now() - issuedAt) > MAX_SKEW_MS) {
    throw new HttpError(400, "issuedAt is too old/new", "INVALID_ISSUED_AT");
  }
  return issuedAt;
}

export async function blockUser(req: Request, res: Response) {
  const { db } = getContext();

  const schema = z.object({
    blocker: z.string().min(1),
    blocked: z.string().min(1),
    signature: z.string().min(1).max(1024),
    issuedAt: z.union([z.number(), z.string()]),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid block payload", "INVALID_BLOCK");

  const blocker = requireAddress(parsed.data.blocker, "blocker");
  const blocked = requireAddress(parsed.data.blocked, "blocked");
  const issuedAt = requireRecentIssuedAt(parsed.data.issuedAt);

  const message = buildBlockMessage({ blocker, blocked, issuedAt });
  let recovered: string;
  try {
    recovered = requireAddress(verifyMessage(message, parsed.data.signature), "signature");
  } catch {
    throw new HttpError(401, "Invalid signature", "INVALID_SIGNATURE");
  }

  if (recovered.toLowerCase() !== blocker.toLowerCase()) {
    throw new HttpError(401, "Signature does not match blocker", "INVALID_SIGNATURE");
  }

  await upsertUserBlock(db, {
    blocker,
    blocked,
    createdAt: Date.now(),
    signature: parsed.data.signature,
    message,
  });

  return res.status(201).json({ ok: true });
}

export async function getBlocks(req: Request, res: Response) {
  const { db } = getContext();
  const blockerRaw = typeof req.query.blocker === "string" ? req.query.blocker : "";
  const blocker = requireAddress(blockerRaw, "blocker");
  const items = await listUserBlocks(db, blocker);
  return res.json({ items: items.map((i) => ({ blocked: i.blocked, createdAt: i.createdAt })) });
}

export async function report(req: Request, res: Response) {
  const { db } = getContext();

  const schema = z.object({
    reporter: z.string().optional(),
    signature: z.string().optional(),
    issuedAt: z.union([z.number(), z.string()]).optional(),
    targetType: z.enum(["listing", "user", "message", "conversation"]),
    targetId: z.string().min(1).max(200),
    reason: z.enum(["spam", "prohibited", "scam", "duplicate", "harassment", "other"]),
    details: z.string().max(1000).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid report payload", "INVALID_REPORT");

  let reporter: string | null = null;

  if (parsed.data.reporter && parsed.data.signature && parsed.data.issuedAt !== undefined) {
    const addr = requireAddress(parsed.data.reporter, "reporter");
    const issuedAt = requireRecentIssuedAt(parsed.data.issuedAt);
    const message = buildReportMessage({
      reporter: addr,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      reason: parsed.data.reason,
      issuedAt,
    });

    try {
      const recovered = requireAddress(verifyMessage(message, parsed.data.signature), "signature");
      if (recovered.toLowerCase() === addr.toLowerCase()) reporter = addr;
    } catch {
      reporter = null;
    }
  }

  const targetId = parsed.data.targetType === "listing" ? requireBytes32(parsed.data.targetId, "listing id") : parsed.data.targetId;

  const createdAt = Date.now();
  const reporterIp = String((req.headers["x-forwarded-for"] as string) ?? req.ip ?? "").slice(0, 80) || null;

  const created = await createReport(db, {
    reporter,
    targetType: parsed.data.targetType,
    targetId,
    reason: parsed.data.reason,
    details: parsed.data.details ?? null,
    createdAt,
    reporterIp,
  });

  return res.status(201).json({ ok: true, id: created.id });
}
