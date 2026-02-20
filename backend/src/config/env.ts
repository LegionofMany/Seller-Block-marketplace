import { isAddress, getAddress } from "ethers";

export type Env = {
  port: number;
  sepoliaRpcUrl: string;
  sepoliaRpcUrlFallback?: string;
  marketplaceRegistryAddress: string;
  dbPath: string;
  indexerEnabled: boolean;
  indexerPollMs: number;
  indexerChunkSize: number;
  startBlock?: number | undefined;
  cacheTtlMs: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
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

export function getEnv(): Env {
  const port = numberFromEnv("PORT", 4000);
  const sepoliaRpcUrl = required("SEPOLIA_RPC_URL");
  validateRpcUrl("SEPOLIA_RPC_URL", sepoliaRpcUrl);

  const sepoliaRpcUrlFallback = optional("SEPOLIA_RPC_URL_FALLBACK");
  if (sepoliaRpcUrlFallback) validateRpcUrl("SEPOLIA_RPC_URL_FALLBACK", sepoliaRpcUrlFallback);

  const marketplaceRegistryAddressRaw = required("MARKETPLACE_REGISTRY_ADDRESS");
  if (!isAddress(marketplaceRegistryAddressRaw)) throw new Error("Invalid MARKETPLACE_REGISTRY_ADDRESS");
  const marketplaceRegistryAddress = getAddress(marketplaceRegistryAddressRaw);

  const dbPath = optional("DB_PATH") ?? "./data/marketplace.sqlite";

  const indexerEnabled = boolFromEnv("INDEXER_ENABLED", true);
  const indexerPollMs = numberFromEnv("INDEXER_POLL_MS", 5_000);
  const indexerChunkSize = numberFromEnv("INDEXER_CHUNK_SIZE", 2_000);
  const startBlockRaw = optional("START_BLOCK");
  const startBlock = startBlockRaw ? Number(startBlockRaw) : undefined;
  if (startBlockRaw && (!Number.isFinite(startBlock) || (startBlock ?? 0) < 0)) throw new Error("Invalid START_BLOCK");

  const cacheTtlMs = numberFromEnv("CACHE_TTL_MS", 30_000);
  const rateLimitWindowMs = numberFromEnv("RATE_LIMIT_WINDOW_MS", 60_000);
  const rateLimitMax = numberFromEnv("RATE_LIMIT_MAX", 120);

  return {
    port,
    sepoliaRpcUrl,
    ...(sepoliaRpcUrlFallback ? { sepoliaRpcUrlFallback } : {}),
    marketplaceRegistryAddress,
    dbPath,
    indexerEnabled,
    indexerPollMs,
    indexerChunkSize,
    startBlock,
    cacheTtlMs,
    rateLimitWindowMs,
    rateLimitMax,
  };
}
