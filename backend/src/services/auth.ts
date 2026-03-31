import crypto from "node:crypto";
import jwt from "jsonwebtoken";

import type { Env } from "../config/env";
import { HttpError } from "../middlewares/errors";

export function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function buildAuthMessage(address: string, nonce: string): string {
  return [
    "Seller-Block Marketplace",
    "Action: Sign in",
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    "ChainId: 11155111",
  ].join("\n");
}

export function issueAuthToken(address: string, env: Env): string {
  return jwt.sign({ sub: address, address }, env.authJwtSecret, {
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