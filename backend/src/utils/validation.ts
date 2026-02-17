import { getAddress, isAddress, isHexString } from "ethers";
import { HttpError } from "../middlewares/errors";

export function requireAddress(value: string, name = "address") {
  if (!isAddress(value)) throw new HttpError(400, `Invalid ${name}`);
  return getAddress(value);
}

export function requireBytes32(value: string, name = "id") {
  if (!isHexString(value, 32)) throw new HttpError(400, `Invalid ${name}`);
  return value.toLowerCase();
}

export function parseBool(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function parseLimitOffset(query: any) {
  const limitRaw = typeof query?.limit === "string" ? Number(query.limit) : undefined;
  const offsetRaw = typeof query?.offset === "string" ? Number(query.offset) : undefined;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw as number, 1), 100) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw as number, 0) : 0;
  return { limit, offset };
}

export function parseBigint(value: unknown): bigint | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const b = BigInt(value);
    if (b < 0n) return undefined;
    return b;
  } catch {
    return undefined;
  }
}
