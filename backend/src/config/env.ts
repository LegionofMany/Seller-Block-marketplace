import { ZeroAddress, isAddress, getAddress } from "ethers";

export type SupportedChainToken = {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  isStablecoin?: boolean;
  permitName?: string;
  permitVersion?: string;
};

export type SupportedChainConfig = {
  key: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  rpcFallbackUrl?: string;
  marketplaceRegistryAddress: string;
  marketplaceSettlementV2Address?: string;
  startBlock?: number;
  nativeCurrencySymbol: string;
  stablecoins: SupportedChainToken[];
};

export type Env = {
  port: number;
  chainKey: string;
  chainName: string;
  chainId: number;
  sepoliaRpcUrl: string;
  sepoliaRpcUrlFallback?: string;
  marketplaceRegistryAddress: string;
  supportedChains: SupportedChainConfig[];
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
  adminEmails: string[];
  adminWalletAddresses: string[];
  frontendAppUrl?: string;
  notificationsScanMs: number;
  notificationEmailFrom?: string;
  postmarkServerToken?: string;
  relayerPrivateKey?: string;
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

function assertNonZeroAddress(value: string, name: string) {
  if (getAddress(value) === ZeroAddress) {
    throw new Error(`Invalid ${name} (zero address is not allowed)`);
  }
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

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error(`Invalid ${name} protocol (expected postgres:// or postgresql://)`);
  }

  if (!parsed.hostname) {
    throw new Error(`Invalid ${name} (missing hostname)`);
  }

  if (!parsed.pathname || parsed.pathname === "/") {
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
    if (o.includes("*")) {
      const wildcardMatch = o.match(/^(https?):\/\/([^/?#]+)$/i);
      if (!wildcardMatch) {
        throw new Error(`Invalid CORS origin: ${o}`);
      }

      const host = wildcardMatch[2];
      if (!host) {
        throw new Error(`Invalid CORS origin: ${o}`);
      }

      const normalizedHost = host.replace(/:\d+$/, "");
      if (!normalizedHost.includes("*")) {
        throw new Error(`Invalid CORS origin: ${o}`);
      }

      continue;
    }

    try {
      const u = new URL(o);
      if (!u.protocol || !u.hostname) throw new Error();
    } catch {
      throw new Error(`Invalid CORS origin: ${o}`);
    }
  }
  return parts;
}

function parseEmailList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function parseWalletAddressList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      if (!isAddress(value)) throw new Error(`Invalid admin wallet address: ${value}`);
      assertNonZeroAddress(value, `admin wallet address ${value}`);
      return getAddress(value).toLowerCase();
    });
}

function parseSupportedChains(raw: string | undefined): { defaultChainKey?: string; chains: SupportedChainConfig[] } | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid CHAIN_CONFIG_JSON");
  }

  const root = parsed as Record<string, unknown>;
  const chainsRaw = Array.isArray(root?.chains) ? root.chains : Array.isArray(parsed) ? parsed : null;
  if (!chainsRaw?.length) throw new Error("CHAIN_CONFIG_JSON must include at least one chain");

  const chains = chainsRaw.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`Invalid chain config at index ${index}`);
    const chain = entry as Record<string, unknown>;
    const key = typeof chain.key === "string" ? chain.key.trim() : "";
    const name = typeof chain.name === "string" ? chain.name.trim() : "";
    const chainId = Number(chain.chainId);
    const rpcUrl = typeof chain.rpcUrl === "string" ? chain.rpcUrl.trim() : "";
    const rpcFallbackUrl = typeof chain.rpcFallbackUrl === "string" ? chain.rpcFallbackUrl.trim() : undefined;
    const marketplaceRegistryAddressRaw =
      typeof chain.marketplaceRegistryAddress === "string" ? chain.marketplaceRegistryAddress.trim() : "";
    const marketplaceSettlementV2AddressRaw =
      typeof chain.marketplaceSettlementV2Address === "string" ? chain.marketplaceSettlementV2Address.trim() : undefined;
    const startBlock = chain.startBlock == null || chain.startBlock === "" ? undefined : Number(chain.startBlock);
    const nativeCurrencySymbol =
      typeof chain.nativeCurrencySymbol === "string" && chain.nativeCurrencySymbol.trim() ? chain.nativeCurrencySymbol.trim() : "ETH";
    const stablecoins = Array.isArray(chain.stablecoins)
      ? chain.stablecoins.map((token, tokenIndex) => {
          if (!token || typeof token !== "object") {
            throw new Error(`Invalid token config at index ${tokenIndex} for chain ${key || index}`);
          }
          const value = token as Record<string, unknown>;
          const symbol = typeof value.symbol === "string" ? value.symbol.trim() : "";
          const tokenName = typeof value.name === "string" ? value.name.trim() : symbol;
          const address = typeof value.address === "string" ? value.address.trim() : "";
          const decimals = Number(value.decimals ?? 18);
          const permitName = typeof value.permitName === "string" ? value.permitName.trim() : undefined;
          const permitVersion = typeof value.permitVersion === "string" ? value.permitVersion.trim() : undefined;
          if (!symbol) throw new Error(`Missing token symbol for chain ${key || index}`);
          if (!isAddress(address)) throw new Error(`Invalid token address for ${symbol} on chain ${key || index}`);
          assertNonZeroAddress(address, `token address for ${symbol} on chain ${key || index}`);
          if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
            throw new Error(`Invalid token decimals for ${symbol} on chain ${key || index}`);
          }
          return {
            symbol,
            name: tokenName || symbol,
            address: getAddress(address),
            decimals,
            ...(value.isStablecoin === true ? { isStablecoin: true } : {}),
            ...(permitName ? { permitName } : {}),
            ...(permitVersion ? { permitVersion } : {}),
          } satisfies SupportedChainToken;
        })
      : [];

    if (!key) throw new Error(`Missing chain key at index ${index}`);
    if (!name) throw new Error(`Missing chain name for ${key}`);
    if (!Number.isInteger(chainId) || chainId <= 0) throw new Error(`Invalid chainId for ${key}`);
    validateRpcUrl(`rpcUrl for ${key}`, rpcUrl);
    if (rpcFallbackUrl) validateRpcUrl(`rpcFallbackUrl for ${key}`, rpcFallbackUrl);
    if (!isAddress(marketplaceRegistryAddressRaw)) throw new Error(`Invalid marketplaceRegistryAddress for ${key}`);
    assertNonZeroAddress(marketplaceRegistryAddressRaw, `marketplaceRegistryAddress for ${key}`);
    if (marketplaceSettlementV2AddressRaw && !isAddress(marketplaceSettlementV2AddressRaw)) {
      throw new Error(`Invalid marketplaceSettlementV2Address for ${key}`);
    }
    if (marketplaceSettlementV2AddressRaw) {
      assertNonZeroAddress(marketplaceSettlementV2AddressRaw, `marketplaceSettlementV2Address for ${key}`);
    }
    if (startBlock != null && (!Number.isFinite(startBlock) || startBlock < 0)) throw new Error(`Invalid startBlock for ${key}`);

    return {
      key,
      name,
      chainId,
      rpcUrl,
      ...(rpcFallbackUrl ? { rpcFallbackUrl } : {}),
      marketplaceRegistryAddress: getAddress(marketplaceRegistryAddressRaw),
      ...(marketplaceSettlementV2AddressRaw
        ? { marketplaceSettlementV2Address: getAddress(marketplaceSettlementV2AddressRaw) }
        : {}),
      ...(startBlock != null ? { startBlock } : {}),
      nativeCurrencySymbol,
      stablecoins,
    } satisfies SupportedChainConfig;
  });

  const defaultChainKey = typeof root?.defaultChainKey === "string" ? root.defaultChainKey.trim() : undefined;
  return { ...(defaultChainKey ? { defaultChainKey } : {}), chains };
}

export function getEnv(): Env {
  const port = numberFromEnv("PORT", 4000);
  const chainConfigs = parseSupportedChains(optional("CHAIN_CONFIG_JSON"));

  const primaryChain: SupportedChainConfig = (() => {
    if (chainConfigs) {
      const selected: SupportedChainConfig | undefined = chainConfigs.defaultChainKey
        ? chainConfigs.chains.find((chain) => chain.key === chainConfigs.defaultChainKey)
        : undefined;
      const fallback: SupportedChainConfig | undefined = chainConfigs.chains[0];
      if (!selected && !fallback) throw new Error("CHAIN_CONFIG_JSON must include at least one chain");
      if (selected) return selected;
      return fallback as SupportedChainConfig;
    }

    const sepoliaRpcUrl = required("SEPOLIA_RPC_URL");
    validateRpcUrl("SEPOLIA_RPC_URL", sepoliaRpcUrl);

    const sepoliaRpcUrlFallback = optional("SEPOLIA_RPC_URL_FALLBACK");
    if (sepoliaRpcUrlFallback) validateRpcUrl("SEPOLIA_RPC_URL_FALLBACK", sepoliaRpcUrlFallback);

    const marketplaceRegistryAddressRaw = required("MARKETPLACE_REGISTRY_ADDRESS");
    if (!isAddress(marketplaceRegistryAddressRaw)) throw new Error("Invalid MARKETPLACE_REGISTRY_ADDRESS");
    assertNonZeroAddress(marketplaceRegistryAddressRaw, "MARKETPLACE_REGISTRY_ADDRESS");
    const marketplaceSettlementV2AddressRaw = optional("MARKETPLACE_SETTLEMENT_V2_ADDRESS");
    if (marketplaceSettlementV2AddressRaw && !isAddress(marketplaceSettlementV2AddressRaw)) {
      throw new Error("Invalid MARKETPLACE_SETTLEMENT_V2_ADDRESS");
    }
    if (marketplaceSettlementV2AddressRaw) {
      assertNonZeroAddress(marketplaceSettlementV2AddressRaw, "MARKETPLACE_SETTLEMENT_V2_ADDRESS");
    }

    return {
      key: optional("CHAIN_KEY") ?? "sepolia",
      name: optional("CHAIN_NAME") ?? "Ethereum Sepolia",
      chainId: numberFromEnv("CHAIN_ID", 11155111),
      rpcUrl: sepoliaRpcUrl,
      ...(sepoliaRpcUrlFallback ? { rpcFallbackUrl: sepoliaRpcUrlFallback } : {}),
      marketplaceRegistryAddress: getAddress(marketplaceRegistryAddressRaw),
      ...(marketplaceSettlementV2AddressRaw
        ? { marketplaceSettlementV2Address: getAddress(marketplaceSettlementV2AddressRaw) }
        : {}),
      ...(optional("START_BLOCK") ? { startBlock: Number(optional("START_BLOCK")) } : {}),
      nativeCurrencySymbol: optional("CHAIN_NATIVE_CURRENCY_SYMBOL") ?? "ETH",
      stablecoins: [],
    } satisfies SupportedChainConfig;
  })();

  const sepoliaRpcUrl = primaryChain.rpcUrl;
  const sepoliaRpcUrlFallback = primaryChain.rpcFallbackUrl;
  const marketplaceRegistryAddress = primaryChain.marketplaceRegistryAddress;
  const supportedChains: SupportedChainConfig[] = chainConfigs?.chains ?? [primaryChain];

  const databaseUrl = optional("DATABASE_URL");
  if (!databaseUrl) {
    if (optional("DB_PATH")) {
      throw new Error("DB_PATH is no longer supported. Set DATABASE_URL to a Postgres connection string.");
    }
    throw new Error("Missing required env var: DATABASE_URL");
  }
  validateDatabaseUrl("DATABASE_URL", databaseUrl);

  const dbPath = databaseUrl;
  const corsOrigins = parseOrigins(optional("CORS_ORIGINS") ?? optional("CORS_ORIGIN"));
  const indexerEnabled = boolFromEnv("INDEXER_ENABLED", true);
  const indexerPollMs = numberFromEnv("INDEXER_POLL_MS", 5_000);
  const indexerChunkSize = numberFromEnv("INDEXER_CHUNK_SIZE", 2_000);
  const startBlockRaw = optional("START_BLOCK");
  const startBlock = startBlockRaw ? Number(startBlockRaw) : primaryChain.startBlock;
  if (startBlockRaw && (!Number.isFinite(startBlock) || (startBlock ?? 0) < 0)) throw new Error("Invalid START_BLOCK");

  const cacheTtlMs = numberFromEnv("CACHE_TTL_MS", 30_000);
  const rateLimitWindowMs = numberFromEnv("RATE_LIMIT_WINDOW_MS", 60_000);
  const rateLimitMax = numberFromEnv("RATE_LIMIT_MAX", 120);
  const listingAutoHideReportsThreshold = numberFromEnv("LISTING_AUTOHIDE_REPORTS_THRESHOLD", 3);
  const authJwtSecret = optional("AUTH_JWT_SECRET") ?? "seller-block-local-dev-secret-change-me";
  const authTokenTtlSeconds = numberFromEnv("AUTH_TOKEN_TTL_SECONDS", 60 * 60 * 8);
  const authNonceTtlSeconds = numberFromEnv("AUTH_NONCE_TTL_SECONDS", 60 * 10);
  const adminEmails = parseEmailList(optional("ADMIN_EMAILS"));
  const adminWalletAddresses = parseWalletAddressList(optional("ADMIN_WALLET_ADDRESSES"));

  const frontendAppUrl = optional("FRONTEND_APP_URL") ?? optional("APP_BASE_URL");
  if (frontendAppUrl) validateRpcUrl("FRONTEND_APP_URL", frontendAppUrl);

  const notificationsScanMs = numberFromEnv("NOTIFICATIONS_SCAN_MS", 60_000);
  const notificationEmailFrom = optional("NOTIFICATION_EMAIL_FROM");
  const postmarkServerToken = optional("POSTMARK_SERVER_TOKEN");
  const relayerPrivateKey = optional("RELAYER_PRIVATE_KEY");
  if (relayerPrivateKey && !/^0x[0-9a-fA-F]{64}$/.test(relayerPrivateKey)) {
    throw new Error("Invalid RELAYER_PRIVATE_KEY");
  }
  const pinataJwt = optional("PINATA_JWT");
  const pinataGatewayBaseUrl = optional("PINATA_GATEWAY_BASE_URL");
  if (pinataGatewayBaseUrl) validateRpcUrl("PINATA_GATEWAY_BASE_URL", pinataGatewayBaseUrl);

  return {
    port,
    chainKey: primaryChain.key,
    chainName: primaryChain.name,
    chainId: primaryChain.chainId,
    sepoliaRpcUrl,
    ...(sepoliaRpcUrlFallback ? { sepoliaRpcUrlFallback } : {}),
    marketplaceRegistryAddress,
    supportedChains,
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
    adminEmails,
    adminWalletAddresses,
    ...(frontendAppUrl ? { frontendAppUrl } : {}),
    notificationsScanMs,
    ...(notificationEmailFrom ? { notificationEmailFrom } : {}),
    ...(postmarkServerToken ? { postmarkServerToken } : {}),
    ...(relayerPrivateKey ? { relayerPrivateKey } : {}),
    ...(pinataJwt ? { pinataJwt } : {}),
    ...(pinataGatewayBaseUrl ? { pinataGatewayBaseUrl } : {}),
  };
}
