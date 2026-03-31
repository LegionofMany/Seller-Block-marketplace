import type { NextFunction, Request, Response } from "express";

import { HttpError } from "./errors";
import { getContext } from "../services/context";
import { verifyAuthToken } from "../services/auth";

const AUTH_ADDRESS_KEY = "authAddress";

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
    (req as any)[AUTH_ADDRESS_KEY] = verifyAuthToken(token, env);
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