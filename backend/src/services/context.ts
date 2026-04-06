import type { Pool } from "pg";
import { getEnv, type Env, type SupportedChainConfig } from "../config/env";
import { createLogger } from "../config/logger";
import { openDb } from "./db";
import { TtlCache } from "./cache";
import { getProvider } from "./blockchain";

export type AppContext = {
  env: Env;
  logger: ReturnType<typeof createLogger>;
  db: Pool;
  cache: TtlCache;
  provider: ReturnType<typeof getProvider>;
  providersByChainKey: Map<string, ReturnType<typeof getProvider>>;
  getSupportedChain: (chainKey?: string | null) => SupportedChainConfig;
  getProviderForChain: (chainKey?: string | null) => ReturnType<typeof getProvider>;
};

let ctx: AppContext | null = null;

export function getContext(): AppContext {
  if (ctx) return ctx;

  const env = getEnv();
  const logger = createLogger();
  const db = openDb(env.dbPath);
  const cache = new TtlCache(env.cacheTtlMs);
  const providersByChainKey = new Map(
    env.supportedChains.map((chain) => [chain.key, getProvider([chain.rpcUrl, chain.rpcFallbackUrl])])
  );
  const provider = providersByChainKey.get(env.chainKey) ?? getProvider([env.sepoliaRpcUrl, env.sepoliaRpcUrlFallback]);

  const fallbackChain = env.supportedChains[0];
  if (!fallbackChain) {
    throw new Error("No supported chains configured");
  }

  const getSupportedChain = (chainKey?: string | null): SupportedChainConfig => {
    const match = chainKey ? env.supportedChains.find((chain) => chain.key === chainKey) : undefined;
    return match ?? fallbackChain;
  };

  const getProviderForChain = (chainKey?: string | null) => {
    const chain = getSupportedChain(chainKey);
    return providersByChainKey.get(chain.key) ?? provider;
  };

  ctx = { env, logger, db, cache, provider, providersByChainKey, getSupportedChain, getProviderForChain };
  return ctx;
}
