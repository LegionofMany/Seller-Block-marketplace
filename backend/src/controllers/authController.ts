import type { Request, Response } from "express";
import { z } from "zod";
import { verifyMessage } from "ethers";

import { HttpError } from "../middlewares/errors";
import { requireAuthAddress } from "../middlewares/auth";
import { getContext } from "../services/context";
import { buildAuthMessage, buildEmailSubject, buildMagicLinkEmail, buildPasswordResetEmail, buildVerificationEmail, buildWalletLinkMessage, generateEmailAuthToken, generateNonce, hashEmailAuthToken, hashPassword, isAdminSubject, issueAuthToken, verifyPassword } from "../services/auth";
import { consumeAuthNonce, consumeEmailAuthToken, createAuthNonce, createEmailAuthToken, createEmailUser, ensureUser, findAuthNonce, findEmailAuthToken, findUserByEmail, findUserByLinkedWallet, getUser, getUserPasswordHash, updateUserEmailVerifiedAt, updateUserLastLogin, updateUserLinkedWallet, updateUserPasswordHash } from "../services/db";
import { sendTransactionalEmail, transactionalEmailAvailable } from "../services/email";
import { normalizeEmail, requireAddress } from "../utils/validation";

const MAGIC_LINK_TTL_MS = 20 * 60 * 1000;
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 20 * 60 * 1000;

async function issueEmailTokenEmail(input: { userAddress: string; email: string; purpose: "login" | "verify" | "reset" }) {
  const { db, env } = getContext();
  if (!transactionalEmailAvailable() || !env.frontendAppUrl) {
    throw new HttpError(503, "Email delivery is not configured", "EMAIL_DELIVERY_UNAVAILABLE");
  }

  const rawToken = generateEmailAuthToken();
  const tokenHash = hashEmailAuthToken(rawToken);
  const createdAt = Date.now();
  const expiresAt = createdAt + (input.purpose === "verify" ? EMAIL_VERIFY_TTL_MS : input.purpose === "reset" ? PASSWORD_RESET_TTL_MS : MAGIC_LINK_TTL_MS);
  await createEmailAuthToken(db, {
    tokenHash,
    userAddress: input.userAddress,
    email: input.email,
    purpose: input.purpose,
    expiresAt,
    createdAt,
  });

  const linkUrl = `${env.frontendAppUrl.replace(/\/$/, "")}/sign-in?email_token=${encodeURIComponent(rawToken)}&email_intent=${input.purpose}`;
  const message = input.purpose === "verify"
    ? buildVerificationEmail(input.email, linkUrl)
    : input.purpose === "reset"
      ? buildPasswordResetEmail(input.email, linkUrl)
      : buildMagicLinkEmail(input.email, linkUrl);
  const delivered = await sendTransactionalEmail(input.email, message.subject, message.html, message.text);
  if (!delivered) {
    throw new HttpError(502, "Failed to send email", "EMAIL_DELIVERY_FAILED");
  }
}

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
      fullName: z.string().max(120).optional(),
      displayName: z.string().max(80).optional(),
      phoneNumber: z.string().max(32).optional(),
      streetAddress1: z.string().max(160).optional(),
      streetAddress2: z.string().max(160).optional(),
      city: z.string().max(80).optional(),
      region: z.string().max(80).optional(),
      postalCode: z.string().max(32).optional(),
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
    fullName: parsed.data.fullName?.trim() ? parsed.data.fullName.trim() : null,
    displayName: parsed.data.displayName?.trim() ? parsed.data.displayName.trim() : null,
    phoneNumber: parsed.data.phoneNumber?.trim() ? parsed.data.phoneNumber.trim() : null,
    streetAddress1: parsed.data.streetAddress1?.trim() ? parsed.data.streetAddress1.trim() : null,
    streetAddress2: parsed.data.streetAddress2?.trim() ? parsed.data.streetAddress2.trim() : null,
    city: parsed.data.city?.trim() ? parsed.data.city.trim() : null,
    region: parsed.data.region?.trim() ? parsed.data.region.trim() : null,
    postalCode: parsed.data.postalCode?.trim() ? parsed.data.postalCode.trim() : null,
    createdAt: now,
  });

  const user = await getUser(db, address);
  let emailVerificationSent = false;
  try {
    await issueEmailTokenEmail({ userAddress: address, email, purpose: "verify" });
    emailVerificationSent = true;
  } catch {
    emailVerificationSent = false;
  }
  return res.status(201).json({
    token: issueAuthToken(address, env),
    address,
    user,
    isAdmin: isAdminSubject(address, env),
    emailVerificationSent,
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

export async function issueWalletLinkNonce(req: Request, res: Response) {
  const parsed = z.object({ walletAddress: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid wallet link payload", "INVALID_WALLET_LINK");

  const { db, env } = getContext();
  const subject = requireAuthAddress(req);
  const user = await getUser(db, subject);
  if (!user || user.authMethod !== "email") {
    throw new HttpError(403, "Only email accounts can link a wallet", "EMAIL_AUTH_REQUIRED");
  }

  const walletAddress = requireAddress(parsed.data.walletAddress, "walletAddress");
  const existingLinkedUser = await findUserByLinkedWallet(db, walletAddress);
  if (existingLinkedUser && existingLinkedUser.address !== subject) {
    throw new HttpError(409, "This wallet is already linked to another account", "WALLET_ALREADY_LINKED");
  }

  const nonce = generateNonce();
  const createdAt = Date.now();
  const expiresAt = createdAt + env.authNonceTtlSeconds * 1000;

  await createAuthNonce(db, walletAddress, nonce, expiresAt, createdAt);

  return res.status(201).json({
    walletAddress,
    nonce,
    message: buildWalletLinkMessage(walletAddress, nonce, env),
    expiresAt,
  });
}

export async function verifyWalletLink(req: Request, res: Response) {
  const parsed = z.object({
    walletAddress: z.string().min(1),
    nonce: z.string().min(1).max(256),
    signature: z.string().min(1).max(2048),
  }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid wallet link verification payload", "INVALID_WALLET_LINK");

  const { db, env } = getContext();
  const subject = requireAuthAddress(req);
  const user = await getUser(db, subject);
  if (!user || user.authMethod !== "email") {
    throw new HttpError(403, "Only email accounts can link a wallet", "EMAIL_AUTH_REQUIRED");
  }

  const walletAddress = requireAddress(parsed.data.walletAddress, "walletAddress");
  const nonce = parsed.data.nonce.trim();
  const row = await findAuthNonce(db, walletAddress, nonce);
  if (!row || row.consumedAt) {
    throw new HttpError(401, "Nonce is invalid or already used", "INVALID_AUTH_NONCE");
  }
  if (row.expiresAt < Date.now()) {
    throw new HttpError(401, "Nonce has expired", "EXPIRED_AUTH_NONCE");
  }

  const existingLinkedUser = await findUserByLinkedWallet(db, walletAddress);
  if (existingLinkedUser && existingLinkedUser.address !== subject) {
    throw new HttpError(409, "This wallet is already linked to another account", "WALLET_ALREADY_LINKED");
  }

  const message = buildWalletLinkMessage(walletAddress, nonce, env);
  let recovered: string;
  try {
    recovered = requireAddress(verifyMessage(message, parsed.data.signature), "signature");
  } catch {
    throw new HttpError(401, "Invalid signature", "INVALID_SIGNATURE");
  }

  if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new HttpError(401, "Signature does not match address", "INVALID_SIGNATURE");
  }

  await consumeAuthNonce(db, walletAddress, nonce, Date.now());
  await updateUserLinkedWallet(db, subject, walletAddress, Date.now());
  const refreshedUser = await getUser(db, subject);

  return res.json({ user: refreshedUser });
}

export async function unlinkWallet(req: Request, res: Response) {
  const { db } = getContext();
  const subject = requireAuthAddress(req);
  const user = await getUser(db, subject);
  if (!user || user.authMethod !== "email") {
    throw new HttpError(403, "Only email accounts can unlink a wallet", "EMAIL_AUTH_REQUIRED");
  }

  await updateUserLinkedWallet(db, subject, null, Date.now());
  const refreshedUser = await getUser(db, subject);
  return res.json({ user: refreshedUser });
}

export async function requestMagicLink(req: Request, res: Response) {
  const parsed = z.object({ email: z.string().min(3).max(320) }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid magic-link payload", "INVALID_EMAIL_AUTH");

  const { db } = getContext();
  const email = normalizeEmail(parsed.data.email);
  const user = await findUserByEmail(db, email);
  if (user && user.authMethod === "email") {
    await issueEmailTokenEmail({ userAddress: user.address, email, purpose: "login" });
  }

  return res.status(202).json({ ok: true });
}

export async function requestPasswordReset(req: Request, res: Response) {
  const parsed = z.object({ email: z.string().min(3).max(320) }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid password-reset payload", "INVALID_EMAIL_AUTH");

  const { db } = getContext();
  const email = normalizeEmail(parsed.data.email);
  const user = await findUserByEmail(db, email);
  if (user && user.authMethod === "email") {
    await issueEmailTokenEmail({ userAddress: user.address, email, purpose: "reset" });
  }

  return res.status(202).json({ ok: true });
}

export async function resetPasswordWithEmailToken(req: Request, res: Response) {
  const parsed = z.object({ token: z.string().min(16).max(512), password: z.string().min(8).max(128) }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid password-reset token payload", "INVALID_EMAIL_AUTH");

  const { db, env } = getContext();
  const tokenHash = hashEmailAuthToken(parsed.data.token.trim());
  const row = await findEmailAuthToken(db, tokenHash);
  if (!row || row.consumedAt) {
    throw new HttpError(401, "This password reset link is invalid or has already been used", "INVALID_EMAIL_TOKEN");
  }
  if (row.expiresAt < Date.now()) {
    throw new HttpError(401, "This password reset link has expired", "EXPIRED_EMAIL_TOKEN");
  }
  if (row.purpose !== "reset") {
    throw new HttpError(401, "This email link cannot reset a password", "INVALID_EMAIL_TOKEN");
  }

  const user = await getUser(db, row.userAddress);
  if (!user || user.authMethod !== "email") {
    throw new HttpError(404, "Email account not found", "EMAIL_ACCOUNT_NOT_FOUND");
  }

  const nextPasswordHash = await hashPassword(parsed.data.password);
  const now = Date.now();
  await consumeEmailAuthToken(db, tokenHash, now);
  await updateUserPasswordHash(db, user.address, nextPasswordHash, now);
  await updateUserLastLogin(db, user.address, now);
  const refreshedUser = await getUser(db, user.address);

  return res.json({
    token: issueAuthToken(user.address, env),
    address: user.address,
    user: refreshedUser,
    isAdmin: isAdminSubject(user.address, env),
  });
}

export async function consumeEmailToken(req: Request, res: Response) {
  const parsed = z.object({ token: z.string().min(16).max(512) }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid email token payload", "INVALID_EMAIL_AUTH");

  const { db, env } = getContext();
  const tokenHash = hashEmailAuthToken(parsed.data.token.trim());
  const row = await findEmailAuthToken(db, tokenHash);
  if (!row || row.consumedAt) {
    throw new HttpError(401, "This email link is invalid or has already been used", "INVALID_EMAIL_TOKEN");
  }
  if (row.expiresAt < Date.now()) {
    throw new HttpError(401, "This email link has expired", "EXPIRED_EMAIL_TOKEN");
  }
  if (row.purpose === "reset") {
    throw new HttpError(401, "This email link must be used from the password reset flow", "INVALID_EMAIL_TOKEN");
  }

  const user = await getUser(db, row.userAddress);
  if (!user || user.authMethod !== "email") {
    throw new HttpError(404, "Email account not found", "EMAIL_ACCOUNT_NOT_FOUND");
  }

  await consumeEmailAuthToken(db, tokenHash, Date.now());
  if (row.purpose === "verify" || !user.emailVerifiedAt) {
    await updateUserEmailVerifiedAt(db, user.address, Date.now());
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

export async function sendVerificationEmail(req: Request, res: Response) {
  const { db } = getContext();
  const subject = requireAuthAddress(req);
  const user = await getUser(db, subject);
  if (!user || user.authMethod !== "email" || !user.email) {
    throw new HttpError(403, "Only email accounts can request verification", "EMAIL_AUTH_REQUIRED");
  }

  await issueEmailTokenEmail({ userAddress: user.address, email: user.email, purpose: "verify" });
  return res.status(202).json({ ok: true });
}