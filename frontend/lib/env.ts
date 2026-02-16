import { type Address, getAddress, isAddress, zeroAddress } from "viem";

export type ClientEnv = {
  chainId: number;
  sepoliaRpcUrl: string;
  walletConnectProjectId?: string;
  marketplaceRegistryAddress: Address;
  escrowVaultAddress: Address;
  auctionModuleAddress: Address;
  raffleModuleAddress: Address;
  fromBlock: bigint;
};

let cached: ClientEnv | null = null;

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed?.length ? trimmed : undefined;
}

export function getEnv(): ClientEnv {
  if (cached) return cached;

  // NOTE: This file is used in client components. Next.js only inlines
  // `process.env.NEXT_PUBLIC_*` values for literal property access, not
  // dynamic indexing (e.g. `process.env[name]`). Keep these as literals.
  const chainId = Number.parseInt(clean(process.env.NEXT_PUBLIC_CHAIN_ID) ?? "11155111", 10);
  const sepoliaRpcUrl = clean(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL);
  if (!sepoliaRpcUrl) throw new Error("Missing required env var: NEXT_PUBLIC_SEPOLIA_RPC_URL");

  const walletConnectProjectId = clean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID);

  const marketplaceRegistryAddressRaw = clean(process.env.NEXT_PUBLIC_MARKETPLACE_REGISTRY_ADDRESS);
  if (!marketplaceRegistryAddressRaw) {
    throw new Error("Missing required env var: NEXT_PUBLIC_MARKETPLACE_REGISTRY_ADDRESS");
  }
  if (!isAddress(marketplaceRegistryAddressRaw)) throw new Error("Invalid NEXT_PUBLIC_MARKETPLACE_REGISTRY_ADDRESS");
  const marketplaceRegistryAddress = getAddress(marketplaceRegistryAddressRaw) as Address;

  const escrowVaultAddress = (() => {
    const raw = clean(process.env.NEXT_PUBLIC_ESCROW_VAULT_ADDRESS);
    if (!raw) return zeroAddress;
    if (!isAddress(raw)) throw new Error("Invalid NEXT_PUBLIC_ESCROW_VAULT_ADDRESS");
    return getAddress(raw) as Address;
  })();

  const auctionModuleAddress = (() => {
    const raw = clean(process.env.NEXT_PUBLIC_AUCTION_MODULE_ADDRESS);
    if (!raw) return zeroAddress;
    if (!isAddress(raw)) throw new Error("Invalid NEXT_PUBLIC_AUCTION_MODULE_ADDRESS");
    return getAddress(raw) as Address;
  })();

  const raffleModuleAddress = (() => {
    const raw = clean(process.env.NEXT_PUBLIC_RAFFLE_MODULE_ADDRESS);
    if (!raw) return zeroAddress;
    if (!isAddress(raw)) throw new Error("Invalid NEXT_PUBLIC_RAFFLE_MODULE_ADDRESS");
    return getAddress(raw) as Address;
  })();

  const fromBlock = (() => {
     const raw = clean(process.env.NEXT_PUBLIC_SEPOLIA_START_BLOCK);
     if (!raw) return BigInt(0);
     const parsed = BigInt(raw);
     if (parsed < BigInt(0)) throw new Error("NEXT_PUBLIC_SEPOLIA_START_BLOCK must be >= 0");
    return parsed;
  })();

  cached = {
    chainId,
    sepoliaRpcUrl,
    walletConnectProjectId,
    marketplaceRegistryAddress,
    escrowVaultAddress,
    auctionModuleAddress,
    raffleModuleAddress,
    fromBlock,
  };
  return cached;
}
