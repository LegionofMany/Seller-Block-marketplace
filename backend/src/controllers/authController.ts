import type { Request, Response } from "express";
import { z } from "zod";
import { verifyMessage } from "ethers";

import { HttpError } from "../middlewares/errors";
import { requireAuthAddress } from "../middlewares/auth";
import { getContext } from "../services/context";
import { buildAuthMessage, generateNonce, issueAuthToken } from "../services/auth";
import { createAuthNonce, consumeAuthNonce, ensureUser, findAuthNonce, getUser } from "../services/db";
import { requireAddress } from "../utils/validation";

export async function issueNonce(req: Request, res: Response) {
  const parsed = z.object({ address: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid auth nonce payload", "INVALID_AUTH_NONCE");

  const { db, env } = getContext();
  const address = requireAddress(parsed.data.address, "address");
  const nonce = generateNonce();
  const createdAt = Date.now();
  const expiresAt = createdAt + env.authNonceTtlSeconds * 1000;

  await createAuthNonce(db, address, nonce, expiresAt, createdAt);

  return res.status(201).json({
    address,
    nonce,
    message: buildAuthMessage(address, nonce, env),
    expiresAt,
  });
}

export async function verifyNonce(req: Request, res: Response) {
  const parsed = z.object({
    address: z.string().min(1),
    nonce: z.string().min(1).max(256),
    signature: z.string().min(1).max(2048),
  }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid auth verify payload", "INVALID_AUTH_VERIFY");

  const { db, env } = getContext();
  const address = requireAddress(parsed.data.address, "address");
  const nonce = parsed.data.nonce.trim();

  const row = await findAuthNonce(db, address, nonce);
  if (!row || row.consumedAt) {
    throw new HttpError(401, "Nonce is invalid or already used", "INVALID_AUTH_NONCE");
  }
  if (row.expiresAt < Date.now()) {
    throw new HttpError(401, "Nonce has expired", "EXPIRED_AUTH_NONCE");
  }

  const message = buildAuthMessage(address, nonce, env);
  let recovered: string;
  try {
    recovered = requireAddress(verifyMessage(message, parsed.data.signature), "signature");
  } catch {
    throw new HttpError(401, "Invalid signature", "INVALID_SIGNATURE");
  }

  if (recovered.toLowerCase() !== address.toLowerCase()) {
    throw new HttpError(401, "Signature does not match address", "INVALID_SIGNATURE");
  }

  await consumeAuthNonce(db, address, nonce, Date.now());
  await ensureUser(db, address, Date.now());
  const user = await getUser(db, address);

  return res.json({
    token: issueAuthToken(address, env),
    address,
    user,
  });
}

export async function getMe(req: Request, res: Response) {
  const { db } = getContext();
  const address = requireAuthAddress(req);
  await ensureUser(db, address, Date.now());
  const user = await getUser(db, address);
  return res.json({ address, user });
}