import type { NextFunction, Request, Response } from "express";
import { isAddress } from "ethers";

import { HttpError } from "./errors";
import { getContext } from "../services/context";
import { isAdminSubject, verifyAuthToken } from "../services/auth";

const AUTH_ADDRESS_KEY = "authAddress";
const AUTH_ADMIN_KEY = "authAdmin";

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    next(new HttpError(401, "Missing auth token", "MISSING_AUTH_TOKEN"));
    return;
  }

  const token = auth.slice("Bearer ".length).trim();
  if (!token) {
    next(new HttpError(401, "Missing auth token", "MISSING_AUTH_TOKEN"));
    return;
  }

  try {
    const { env } = getContext();
    const subject = verifyAuthToken(token, env);
    (req as any)[AUTH_ADDRESS_KEY] = subject;
    (req as any)[AUTH_ADMIN_KEY] = isAdminSubject(subject, env);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuthAddress(req: Request): string {
  const value = (req as any)[AUTH_ADDRESS_KEY];
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(401, "Missing auth token", "MISSING_AUTH_TOKEN");
  }
  return value;
}

export function requireWalletAuthAddress(req: Request): string {
  const value = requireAuthAddress(req);
  if (!isAddress(value)) {
    throw new HttpError(403, "This action requires a wallet-authenticated account", "WALLET_AUTH_REQUIRED");
  }
  return value;
}

export function requireAdmin(req: Request): string {
  const subject = requireAuthAddress(req);
  if (!(req as any)[AUTH_ADMIN_KEY]) {
    throw new HttpError(403, "Admin access required", "ADMIN_REQUIRED");
  }
  return subject;
}

export function isAdminRequest(req: Request): boolean {
  return Boolean((req as any)[AUTH_ADMIN_KEY]);
}