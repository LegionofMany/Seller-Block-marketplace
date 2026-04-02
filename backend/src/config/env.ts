import { isAddress, getAddress } from "ethers";

export type Env = {
  port: number;
  sepoliaRpcUrl: string;
  sepoliaRpcUrlFallback?: string;
  marketplaceRegistryAddress: string;
  dbPath: string;
  corsOrigins?: string[];
  indexerEnabled: boolean;
  indexerPollMs: number;
  indexerChunkSize: number;
  startBlock?: number | undefined;
  cacheTtlMs: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;

  listingAutoHideReportsThreshold: number;

  authJwtSecret: string;
  authTokenTtlSeconds: number;
  authNonceTtlSeconds: number;

  frontendAppUrl?: string;
  notificationsScanMs: number;
  notificationEmailFrom?: string;
  postmarkServerToken?: string;
  stripeSecretKey?: string;
  promotionBumpPriceCents: number;
  promotionTopPriceCents: number;
  promotionFeaturedPriceCents: number;
  promotionBumpDurationHours: number;
  promotionTopDurationHours: number;
  promotionFeaturedDurationHours: number;

  pinataJwt?: string;
  pinataGatewayBaseUrl?: string;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value?.length ? value : undefined;
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = optional(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid ${name}`);
  return parsed;
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const raw = optional(name);
  if (raw == null) return fallback;
  switch (raw.toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "y":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "n":
    case "off":
      return false;
    default:
      throw new Error(`Invalid ${name} (expected true/false)`);
  }
}

function validateRpcUrl(name: string, value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid ${name} (expected an http(s):// or ws(s):// URL)`);
  }
  if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) {
    throw new Error(`Invalid ${name} protocol (expected http(s) or ws(s))`);
  }
  if (!parsed.hostname) {
    throw new Error(`Invalid ${name} (missing hostname)`);
  }
}

function validateDatabaseUrl(name: string, value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `Invalid ${name} (expected postgres:// or postgresql:// connection string; ensure special characters in the password are URL-encoded)`
    );
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`Invalid ${name} protocol (expected postgres:// or postgresql://)`);
  }

  if (!parsed.hostname) {
    throw new Error(`Invalid ${name} (missing hostname)`);
  }

  if (!parsed.pathname || parsed.pathname === '/') {
    throw new Error(`Invalid ${name} (missing database name)`);
  }
}

function parseOrigins(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!parts.length) return undefined;
  if (parts.includes("*")) return ["*"];

  for (const o of parts) {
    try {
      const u = new URL(o);
      if (!u.protocol || !u.hostname) throw new Error();
    } catch {
      throw new Error(`Invalid CORS origin: ${o}`);
    }
  }
  return parts;
}

export function getEnv(): Env {
  const port = numberFromEnv("PORT", 4000);
  const sepoliaRpcUrl = required("SEPOLIA_RPC_URL");
  validateRpcUrl("SEPOLIA_RPC_URL", sepoliaRpcUrl);

  const sepoliaRpcUrlFallback = optional("SEPOLIA_RPC_URL_FALLBACK");
  if (sepoliaRpcUrlFallback) validateRpcUrl("SEPOLIA_RPC_URL_FALLBACK", sepoliaRpcUrlFallback);

  const marketplaceRegistryAddressRaw = required("MARKETPLACE_REGISTRY_ADDRESS");
  if (!isAddress(marketplaceRegistryAddressRaw)) throw new Error("Invalid MARKETPLACE_REGISTRY_ADDRESS");
  const marketplaceRegistryAddress = getAddress(marketplaceRegistryAddressRaw);

  const databaseUrl = optional("DATABASE_URL");
  if (!databaseUrl) {
    if (optional("DB_PATH")) {
      throw new Error("DB_PATH is no longer supported. Set DATABASE_URL to a Postgres connection string.");
    }
    throw new Error("Missing required env var: DATABASE_URL");
  }
  validateDatabaseUrl("DATABASE_URL", databaseUrl);

  // Kept as dbPath for backward compatibility in the rest of the codebase.
  const dbPath = databaseUrl;

  const corsOrigins = parseOrigins(optional("CORS_ORIGINS") ?? optional("CORS_ORIGIN"));

  const indexerEnabled = boolFromEnv("INDEXER_ENABLED", true);
  const indexerPollMs = numberFromEnv("INDEXER_POLL_MS", 5_000);
  const indexerChunkSize = numberFromEnv("INDEXER_CHUNK_SIZE", 2_000);
  const startBlockRaw = optional("START_BLOCK");
  const startBlock = startBlockRaw ? Number(startBlockRaw) : undefined;
  if (startBlockRaw && (!Number.isFinite(startBlock) || (startBlock ?? 0) < 0)) throw new Error("Invalid START_BLOCK");

  const cacheTtlMs = numberFromEnv("CACHE_TTL_MS", 30_000);
  const rateLimitWindowMs = numberFromEnv("RATE_LIMIT_WINDOW_MS", 60_000);
  const rateLimitMax = numberFromEnv("RATE_LIMIT_MAX", 120);

  // Safety baseline: auto-hide listings once they have >= N reports.
  // Set to 0 to disable auto-hide.
  const listingAutoHideReportsThreshold = numberFromEnv("LISTING_AUTOHIDE_REPORTS_THRESHOLD", 3);

  const authJwtSecret = optional("AUTH_JWT_SECRET") ?? "seller-block-local-dev-secret-change-me";
  const authTokenTtlSeconds = numberFromEnv("AUTH_TOKEN_TTL_SECONDS", 60 * 60 * 8);
  const authNonceTtlSeconds = numberFromEnv("AUTH_NONCE_TTL_SECONDS", 60 * 10);

  const frontendAppUrl = optional("FRONTEND_APP_URL") ?? optional("APP_BASE_URL");
  if (frontendAppUrl) validateRpcUrl("FRONTEND_APP_URL", frontendAppUrl);

  const notificationsScanMs = numberFromEnv("NOTIFICATIONS_SCAN_MS", 60_000);
  const notificationEmailFrom = optional("NOTIFICATION_EMAIL_FROM");
  const postmarkServerToken = optional("POSTMARK_SERVER_TOKEN");
  const stripeSecretKey = optional("STRIPE_SECRET_KEY");

  const promotionBumpPriceCents = numberFromEnv("PROMOTION_BUMP_PRICE_CENTS", 500);
  const promotionTopPriceCents = numberFromEnv("PROMOTION_TOP_PRICE_CENTS", 1500);
  const promotionFeaturedPriceCents = numberFromEnv("PROMOTION_FEATURED_PRICE_CENTS", 3000);
  const promotionBumpDurationHours = numberFromEnv("PROMOTION_BUMP_DURATION_HOURS", 24);
  const promotionTopDurationHours = numberFromEnv("PROMOTION_TOP_DURATION_HOURS", 72);
  const promotionFeaturedDurationHours = numberFromEnv("PROMOTION_FEATURED_DURATION_HOURS", 168);

  const pinataJwt = optional("PINATA_JWT");
  const pinataGatewayBaseUrl = optional("PINATA_GATEWAY_BASE_URL");
  if (pinataGatewayBaseUrl) validateRpcUrl("PINATA_GATEWAY_BASE_URL", pinataGatewayBaseUrl);

  return {
    port,
    sepoliaRpcUrl,
    ...(sepoliaRpcUrlFallback ? { sepoliaRpcUrlFallback } : {}),
    marketplaceRegistryAddress,
    dbPath,
    ...(corsOrigins ? { corsOrigins } : {}),
    indexerEnabled,
    indexerPollMs,
    indexerChunkSize,
    startBlock,
    cacheTtlMs,
    rateLimitWindowMs,
    rateLimitMax,

    listingAutoHideReportsThreshold,

    authJwtSecret,
    authTokenTtlSeconds,
    authNonceTtlSeconds,

    ...(frontendAppUrl ? { frontendAppUrl } : {}),
    notificationsScanMs,
    ...(notificationEmailFrom ? { notificationEmailFrom } : {}),
    ...(postmarkServerToken ? { postmarkServerToken } : {}),
    ...(stripeSecretKey ? { stripeSecretKey } : {}),
    promotionBumpPriceCents,
    promotionTopPriceCents,
    promotionFeaturedPriceCents,
    promotionBumpDurationHours,
    promotionTopDurationHours,
    promotionFeaturedDurationHours,

    ...(pinataJwt ? { pinataJwt } : {}),
    ...(pinataGatewayBaseUrl ? { pinataGatewayBaseUrl } : {}),
  };
}
