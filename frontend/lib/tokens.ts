import { formatEther, formatUnits, parseEther, parseUnits, type Address, zeroAddress } from "viem";

import { type ClientEnv, findSupportedToken, getChainConfigById } from "@/lib/env";

export type TokenDescriptor = {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
  isNative: boolean;
  isStablecoin?: boolean;
  permitName?: string;
  permitVersion?: string;
};

function normalizePublicTokenLabel(symbol: string, name: string, isStablecoin?: boolean) {
  if (/seller\s*block\s*usd|sbusd/i.test(symbol) || /seller\s*block\s*usd|sbusd/i.test(name)) {
    return {
      symbol: isStablecoin ? "USD stablecoin" : symbol,
      name: isStablecoin ? "USD stablecoin" : name,
    };
  }

  return { symbol, name };
}

function toPublicTokenDescriptor(token: TokenDescriptor): TokenDescriptor {
  const label = normalizePublicTokenLabel(token.symbol, token.name, token.isStablecoin);
  return {
    ...token,
    symbol: label.symbol,
    name: label.name,
  };
}

export function getPublicNetworkLabel(chainName: string) {
  return /(sepolia|testnet|devnet|goerli|holesky)/i.test(chainName) ? "Marketplace network" : chainName;
}

export function getTokenOptions(env: ClientEnv, chainId?: number | null): TokenDescriptor[] {
  const chain = getChainConfigById(env, chainId);
  return [
    toPublicTokenDescriptor({
      symbol: chain.nativeCurrencySymbol,
      name: chain.nativeCurrencyName,
      address: zeroAddress,
      decimals: 18,
      isNative: true,
    }),
    ...chain.stablecoins.map((token) => ({
      ...toPublicTokenDescriptor({
        symbol: token.symbol,
        name: token.name,
        address: token.address,
        decimals: token.decimals,
        isNative: false,
        ...(token.isStablecoin ? { isStablecoin: true } : {}),
        ...(token.permitName ? { permitName: token.permitName } : {}),
        ...(token.permitVersion ? { permitVersion: token.permitVersion } : {}),
      }),
      address: token.address,
      decimals: token.decimals,
    })),
  ];
}

export function getDefaultSettlementToken(env: ClientEnv, chainId?: number | null): TokenDescriptor {
  const chain = getChainConfigById(env, chainId);
  const preferred = chain.stablecoins.find((token) => token.isStablecoin) ?? chain.stablecoins[0];
  if (preferred) {
    return toPublicTokenDescriptor({
      symbol: preferred.symbol,
      name: preferred.name,
      address: preferred.address,
      decimals: preferred.decimals,
      isNative: false,
      ...(preferred.isStablecoin ? { isStablecoin: true } : {}),
      ...(preferred.permitName ? { permitName: preferred.permitName } : {}),
      ...(preferred.permitVersion ? { permitVersion: preferred.permitVersion } : {}),
    });
  }

  return toPublicTokenDescriptor({
    symbol: chain.nativeCurrencySymbol,
    name: chain.nativeCurrencyName,
    address: zeroAddress,
    decimals: 18,
    isNative: true,
  });
}

export function describeToken(env: ClientEnv, chainId: number | null | undefined, address: Address): TokenDescriptor {
  if (address.toLowerCase() === zeroAddress) {
    const chain = getChainConfigById(env, chainId);
    return toPublicTokenDescriptor({
      symbol: chain.nativeCurrencySymbol,
      name: chain.nativeCurrencyName,
      address: zeroAddress,
      decimals: 18,
      isNative: true,
    });
  }

  const known = findSupportedToken(env, chainId, address);
  if (known) {
    return toPublicTokenDescriptor({
      symbol: known.symbol,
      name: known.name,
      address: known.address,
      decimals: known.decimals,
      isNative: false,
      ...(known.isStablecoin ? { isStablecoin: true } : {}),
      ...(known.permitName ? { permitName: known.permitName } : {}),
      ...(known.permitVersion ? { permitVersion: known.permitVersion } : {}),
    });
  }

  return toPublicTokenDescriptor({
    symbol: "ERC20",
    name: "ERC-20 token",
    address,
    decimals: 18,
    isNative: false,
  });
}

export function parseTokenAmount(input: string, token: TokenDescriptor) {
  const trimmed = input.trim();
  if (!trimmed) return BigInt(0);
  return token.isNative ? parseEther(trimmed) : parseUnits(trimmed, token.decimals);
}

export function formatTokenAmount(amount: bigint, token: TokenDescriptor) {
  const formatted = token.isNative ? formatEther(amount) : formatUnits(amount, token.decimals);
  return `${formatted} ${token.symbol}`;
}
