import { isAddress, getAddress } from "ethers";

export type Env = {
  port: number;
  sepoliaRpcUrl: string;
  marketplaceRegistryAddress: string;
  dbPath: string;
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

export function getEnv(): Env {
  const port = numberFromEnv("PORT", 4000);
  const sepoliaRpcUrl = required("SEPOLIA_RPC_URL");

  const marketplaceRegistryAddressRaw = required("MARKETPLACE_REGISTRY_ADDRESS");
  if (!isAddress(marketplaceRegistryAddressRaw)) throw new Error("Invalid MARKETPLACE_REGISTRY_ADDRESS");
  const marketplaceRegistryAddress = getAddress(marketplaceRegistryAddressRaw);

  const dbPath = optional("DB_PATH") ?? "./data/marketplace.sqlite";

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
    marketplaceRegistryAddress,
    dbPath,
    indexerPollMs,
    indexerChunkSize,
    startBlock,
    cacheTtlMs,
    rateLimitWindowMs,
    rateLimitMax,
  };
}
