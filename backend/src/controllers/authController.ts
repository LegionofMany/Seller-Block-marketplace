import type { Request, Response } from "express";
import { z } from "zod";
import { verifyMessage } from "ethers";

import { HttpError } from "../middlewares/errors";
import { requireAuthAddress } from "../middlewares/auth";
import { getContext } from "../services/context";
import { buildAuthMessage, buildEmailSubject, generateNonce, hashPassword, isAdminSubject, issueAuthToken, verifyPassword } from "../services/auth";
import { createAuthNonce, consumeAuthNonce, createEmailUser, ensureUser, findAuthNonce, findUserByEmail, getUser, getUserPasswordHash, updateUserLastLogin } from "../services/db";
import { normalizeEmail, requireAddress } from "../utils/validation";

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
  await updateUserLastLogin(db, address, Date.now());
  const user = await getUser(db, address);

  return res.json({
    token: issueAuthToken(address, env),
    address,
    user,
    isAdmin: isAdminSubject(address, env),
  });
}

export async function registerWithEmail(req: Request, res: Response) {
  const parsed = z
    .object({
      email: z.string().min(3).max(320),
      password: z.string().min(8).max(128),
      displayName: z.string().max(80).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid email registration payload", "INVALID_EMAIL_AUTH");

  const { db, env } = getContext();
  const email = normalizeEmail(parsed.data.email);
  const existing = await findUserByEmail(db, email);
  if (existing) {
    throw new HttpError(409, "An account with this email already exists", "EMAIL_ALREADY_EXISTS");
  }

  const now = Date.now();
  const address = buildEmailSubject(email);
  const passwordHash = await hashPassword(parsed.data.password);

  await createEmailUser(db, {
    address,
    email,
    passwordHash,
    displayName: parsed.data.displayName?.trim() ? parsed.data.displayName.trim() : null,
    createdAt: now,
  });

  const user = await getUser(db, address);
  return res.status(201).json({
    token: issueAuthToken(address, env),
    address,
    user,
    isAdmin: isAdminSubject(address, env),
  });
}

export async function loginWithEmail(req: Request, res: Response) {
  const parsed = z
    .object({
      email: z.string().min(3).max(320),
      password: z.string().min(8).max(128),
    })
    .safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid email sign-in payload", "INVALID_EMAIL_AUTH");

  const { db, env } = getContext();
  const email = normalizeEmail(parsed.data.email);
  const user = await findUserByEmail(db, email);
  if (!user || user.authMethod !== "email") {
    throw new HttpError(401, "Invalid email or password", "INVALID_EMAIL_AUTH");
  }

  const passwordHash = await getUserPasswordHash(db, user.address);
  const passwordOk = passwordHash ? await verifyPassword(parsed.data.password, passwordHash) : false;
  if (!passwordOk) {
    throw new HttpError(401, "Invalid email or password", "INVALID_EMAIL_AUTH");
  }

  await updateUserLastLogin(db, user.address, Date.now());
  const refreshedUser = await getUser(db, user.address);

  return res.json({
    token: issueAuthToken(user.address, env),
    address: user.address,
    user: refreshedUser,
    isAdmin: isAdminSubject(user.address, env),
  });
}

export async function getMe(req: Request, res: Response) {
  const { db, env } = getContext();
  const address = requireAuthAddress(req);
  await ensureUser(db, address, Date.now());
  const user = await getUser(db, address);
  return res.json({ address, user, isAdmin: isAdminSubject(address, env) });
}