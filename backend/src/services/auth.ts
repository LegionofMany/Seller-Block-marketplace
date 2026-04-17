import crypto from "node:crypto";
import jwt from "jsonwebtoken";

import type { Env } from "../config/env";
import { HttpError } from "../middlewares/errors";

export function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function buildAuthMessage(address: string, nonce: string, env: Env): string {
  return [
    "Seller-Block Marketplace",
    "Action: Sign in",
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `ChainId: ${env.chainId}`,
  ].join("\n");
}

const EMAIL_SUBJECT_PREFIX = "email:";

export function buildEmailSubject(email: string): string {
  return `${EMAIL_SUBJECT_PREFIX}${email.trim().toLowerCase()}`;
}

export function isEmailSubject(subject: string): boolean {
  return subject.startsWith(EMAIL_SUBJECT_PREFIX);
}

export function emailFromSubject(subject: string): string | null {
  return isEmailSubject(subject) ? subject.slice(EMAIL_SUBJECT_PREFIX.length) : null;
}

export function issueAuthToken(subject: string, env: Env): string {
  return jwt.sign({ sub: subject, address: subject }, env.authJwtSecret, {
    expiresIn: env.authTokenTtlSeconds,
  });
}

export function verifyAuthToken(token: string, env: Env): string {
  try {
    const decoded = jwt.verify(token, env.authJwtSecret) as jwt.JwtPayload;
    const address = typeof decoded?.sub === "string" ? decoded.sub : typeof decoded?.address === "string" ? decoded.address : null;
    if (!address) throw new Error("Missing token subject");
    return address;
  } catch {
    throw new HttpError(401, "Invalid or expired auth token", "INVALID_AUTH_TOKEN");
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result as Buffer);
    });
  });

  return `scrypt$${salt.toString("base64")}$${derivedKey.toString("base64")}`;
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, saltEncoded, hashEncoded] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !saltEncoded || !hashEncoded) return false;

  const salt = Buffer.from(saltEncoded, "base64");
  const expected = Buffer.from(hashEncoded, "base64");
  const actual = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, expected.length, (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result as Buffer);
    });
  });

  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function isAdminSubject(subject: string, env: Env): boolean {
  if (isEmailSubject(subject)) {
    const email = emailFromSubject(subject);
    return Boolean(email && env.adminEmails.includes(email));
  }

  return env.adminWalletAddresses.includes(subject.trim().toLowerCase());
}