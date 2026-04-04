import { type Address, getAddress, isAddress, zeroAddress } from "viem";

export type SupportedToken = {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
  isStablecoin?: boolean;
};

export type FrontendChainConfig = {
  key: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  rpcFallbackUrl?: string;
  marketplaceRegistryAddress: Address;
  escrowVaultAddress: Address;
  auctionModuleAddress: Address;
  raffleModuleAddress: Address;
  fromBlock: bigint;
  nativeCurrencySymbol: string;
  nativeCurrencyName: string;
  blockExplorerUrl?: string;
  stablecoins: SupportedToken[];
};

export type ClientEnv = {
  chainId: number;
  sepoliaRpcUrl: string;
  sepoliaRpcFallbackUrl?: string;
  walletConnectProjectId?: string;
  backendUrl?: string;
  ipfsGatewayBaseUrl?: string;
  marketplaceRegistryAddress: Address;
  escrowVaultAddress: Address;
  auctionModuleAddress: Address;
  raffleModuleAddress: Address;
  fromBlock: bigint;
  defaultChainKey: string;
  defaultChain: FrontendChainConfig;
  chains: FrontendChainConfig[];
};

let cached: ClientEnv | null = null;

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed?.length ? trimmed : undefined;
}

function asAddress(value: string, envName: string) {
  if (!isAddress(value)) throw new Error(`Invalid ${envName}`);
  return getAddress(value) as Address;
}

function optionalAddress(value: string | undefined, envName: string) {
  if (!value) return zeroAddress;
  return asAddress(value, envName);
}

function parseToken(raw: unknown, chainKey: string): SupportedToken {
  if (!raw || typeof raw !== "object") throw new Error(`Invalid token config for chain ${chainKey}`);
  const token = raw as Record<string, unknown>;
  const symbol = typeof token.symbol === "string" ? token.symbol.trim() : "";
  const name = typeof token.name === "string" ? token.name.trim() : symbol;
  const addressRaw = typeof token.address === "string" ? token.address.trim() : "";
  const decimals = Number(token.decimals ?? 18);
  if (!symbol) throw new Error(`Missing token symbol for chain ${chainKey}`);
  if (!addressRaw || !isAddress(addressRaw)) throw new Error(`Invalid token address for ${symbol} on chain ${chainKey}`);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error(`Invalid token decimals for ${symbol} on chain ${chainKey}`);
  }
  return {
    symbol,
    name: name || symbol,
    address: getAddress(addressRaw) as Address,
    decimals,
    ...(token.isStablecoin === true ? { isStablecoin: true } : {}),
  };
}

function parseChainConfigJson(raw: string): { defaultChainKey?: string; chains: FrontendChainConfig[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid NEXT_PUBLIC_CHAIN_CONFIG_JSON");
  }

  const root = parsed as Record<string, unknown>;
  const chainsRaw = Array.isArray(root?.chains) ? root.chains : Array.isArray(parsed) ? parsed : null;
  if (!chainsRaw?.length) throw new Error("NEXT_PUBLIC_CHAIN_CONFIG_JSON must include at least one chain");

  const chains = chainsRaw.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`Invalid chain config at index ${index}`);
    const chain = entry as Record<string, unknown>;
    const key = typeof chain.key === "string" ? chain.key.trim() : "";
    const name = typeof chain.name === "string" ? chain.name.trim() : "";
    const chainId = Number(chain.chainId);
    const rpcUrl = typeof chain.rpcUrl === "string" ? chain.rpcUrl.trim() : "";
    const rpcFallbackUrl = typeof chain.rpcFallbackUrl === "string" ? chain.rpcFallbackUrl.trim() : undefined;
    const marketplaceRegistryAddress = typeof chain.marketplaceRegistryAddress === "string" ? chain.marketplaceRegistryAddress.trim() : "";
    const escrowVaultAddress = typeof chain.escrowVaultAddress === "string" ? chain.escrowVaultAddress.trim() : "";
    const auctionModuleAddress = typeof chain.auctionModuleAddress === "string" ? chain.auctionModuleAddress.trim() : "";
    const raffleModuleAddress = typeof chain.raffleModuleAddress === "string" ? chain.raffleModuleAddress.trim() : "";
    const fromBlock = typeof chain.fromBlock === "string" || typeof chain.fromBlock === "number" ? BigInt(chain.fromBlock) : BigInt(0);
    const nativeCurrencySymbol = typeof chain.nativeCurrencySymbol === "string" && chain.nativeCurrencySymbol.trim() ? chain.nativeCurrencySymbol.trim() : "ETH";
    const nativeCurrencyName = typeof chain.nativeCurrencyName === "string" && chain.nativeCurrencyName.trim() ? chain.nativeCurrencyName.trim() : nativeCurrencySymbol;
    const blockExplorerUrl = typeof chain.blockExplorerUrl === "string" && chain.blockExplorerUrl.trim() ? chain.blockExplorerUrl.trim() : undefined;
    const stablecoins = Array.isArray(chain.stablecoins) ? chain.stablecoins.map((token) => parseToken(token, key || String(index))) : [];

    if (!key) throw new Error(`Missing chain key at index ${index}`);
    if (!name) throw new Error(`Missing chain name for ${key}`);
    if (!Number.isInteger(chainId) || chainId <= 0) throw new Error(`Invalid chainId for ${key}`);
    if (!rpcUrl) throw new Error(`Missing rpcUrl for ${key}`);
    if (!marketplaceRegistryAddress) throw new Error(`Missing marketplaceRegistryAddress for ${key}`);

    return {
      key,
      name,
      chainId,
      rpcUrl,
      ...(rpcFallbackUrl ? { rpcFallbackUrl } : {}),
      marketplaceRegistryAddress: asAddress(marketplaceRegistryAddress, `marketplaceRegistryAddress for ${key}`),
      escrowVaultAddress: optionalAddress(escrowVaultAddress, `escrowVaultAddress for ${key}`),
      auctionModuleAddress: optionalAddress(auctionModuleAddress, `auctionModuleAddress for ${key}`),
      raffleModuleAddress: optionalAddress(raffleModuleAddress, `raffleModuleAddress for ${key}`),
      fromBlock,
      nativeCurrencySymbol,
      nativeCurrencyName,
      ...(blockExplorerUrl ? { blockExplorerUrl } : {}),
      stablecoins,
    } satisfies FrontendChainConfig;
  });

  const defaultChainKey = typeof root?.defaultChainKey === "string" ? root.defaultChainKey.trim() : undefined;
  return { ...(defaultChainKey ? { defaultChainKey } : {}), chains };
}

export function getEnv(): ClientEnv {
  if (cached) return cached;

  // NOTE: This file is used in client components. Next.js only inlines
  // `process.env.NEXT_PUBLIC_*` values for literal property access, not
  // dynamic indexing (e.g. `process.env[name]`). Keep these as literals.
  const walletConnectProjectId = clean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID);
  const backendUrl = clean(process.env.NEXT_PUBLIC_BACKEND_URL);
  const ipfsGatewayBaseUrl = clean(process.env.NEXT_PUBLIC_IPFS_GATEWAY_BASE_URL) ?? undefined;

  const chainConfigJson = clean(process.env.NEXT_PUBLIC_CHAIN_CONFIG_JSON);

  const parsed = chainConfigJson
    ? parseChainConfigJson(chainConfigJson)
    : (() => {
        const chainId = Number.parseInt(clean(process.env.NEXT_PUBLIC_CHAIN_ID) ?? "11155111", 10);
        const sepoliaRpcUrl = clean(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL);
        if (!sepoliaRpcUrl) throw new Error("Missing required env var: NEXT_PUBLIC_SEPOLIA_RPC_URL");
        const sepoliaRpcFallbackUrl = clean(process.env.NEXT_PUBLIC_SEPOLIA_RPC_FALLBACK_URL) ?? undefined;
        const marketplaceRegistryAddressRaw = clean(process.env.NEXT_PUBLIC_MARKETPLACE_REGISTRY_ADDRESS);
        if (!marketplaceRegistryAddressRaw) {
          throw new Error("Missing required env var: NEXT_PUBLIC_MARKETPLACE_REGISTRY_ADDRESS");
        }

        const fromBlock = (() => {
          const raw = clean(process.env.NEXT_PUBLIC_SEPOLIA_START_BLOCK);
          if (!raw) return BigInt(0);
          const value = BigInt(raw);
          if (value < BigInt(0)) throw new Error("NEXT_PUBLIC_SEPOLIA_START_BLOCK must be >= 0");
          return value;
        })();

        return {
          defaultChainKey: "sepolia",
          chains: [
            {
              key: "sepolia",
              name: "Ethereum Sepolia",
              chainId,
              rpcUrl: sepoliaRpcUrl,
              ...(sepoliaRpcFallbackUrl ? { rpcFallbackUrl: sepoliaRpcFallbackUrl } : {}),
              marketplaceRegistryAddress: asAddress(marketplaceRegistryAddressRaw, "NEXT_PUBLIC_MARKETPLACE_REGISTRY_ADDRESS"),
              escrowVaultAddress: optionalAddress(clean(process.env.NEXT_PUBLIC_ESCROW_VAULT_ADDRESS), "NEXT_PUBLIC_ESCROW_VAULT_ADDRESS"),
              auctionModuleAddress: optionalAddress(clean(process.env.NEXT_PUBLIC_AUCTION_MODULE_ADDRESS), "NEXT_PUBLIC_AUCTION_MODULE_ADDRESS"),
              raffleModuleAddress: optionalAddress(clean(process.env.NEXT_PUBLIC_RAFFLE_MODULE_ADDRESS), "NEXT_PUBLIC_RAFFLE_MODULE_ADDRESS"),
              fromBlock,
              nativeCurrencySymbol: "ETH",
              nativeCurrencyName: "Ether",
              blockExplorerUrl: "https://sepolia.etherscan.io",
              stablecoins: [],
            } satisfies FrontendChainConfig,
          ],
        };
      })();

  const defaultChainKey = parsed.defaultChainKey ?? parsed.chains[0]?.key;
  const defaultChain = parsed.chains.find((chain) => chain.key === defaultChainKey) ?? parsed.chains[0];
  if (!defaultChain) throw new Error("No frontend chains configured");

  cached = {
    chainId: defaultChain.chainId,
    sepoliaRpcUrl: defaultChain.rpcUrl,
    ...(defaultChain.rpcFallbackUrl ? { sepoliaRpcFallbackUrl: defaultChain.rpcFallbackUrl } : {}),
    walletConnectProjectId,
    backendUrl,
    ipfsGatewayBaseUrl,
    marketplaceRegistryAddress: defaultChain.marketplaceRegistryAddress,
    escrowVaultAddress: defaultChain.escrowVaultAddress,
    auctionModuleAddress: defaultChain.auctionModuleAddress,
    raffleModuleAddress: defaultChain.raffleModuleAddress,
    fromBlock: defaultChain.fromBlock,
    defaultChainKey: defaultChain.key,
    defaultChain,
    chains: parsed.chains,
  };
  return cached;
}

export function getChainConfigById(env: ClientEnv, chainId?: number | null) {
  if (typeof chainId === "number") {
    const match = env.chains.find((chain) => chain.chainId === chainId);
    if (match) return match;
  }
  return env.defaultChain;
}

export function getChainConfigByKey(env: ClientEnv, chainKey?: string | null) {
  if (chainKey) {
    const match = env.chains.find((chain) => chain.key === chainKey);
    if (match) return match;
  }
  return env.defaultChain;
}

export function findSupportedToken(env: ClientEnv, chainId: number | null | undefined, address: Address) {
  const chain = getChainConfigById(env, chainId);
  return chain.stablecoins.find((token) => token.address.toLowerCase() === address.toLowerCase()) ?? null;
}
