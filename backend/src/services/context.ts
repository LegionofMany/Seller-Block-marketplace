import type Database from "better-sqlite3";
import { getEnv, type Env } from "../config/env";
import { createLogger } from "../config/logger";
import { openDb } from "./db";
import { TtlCache } from "./cache";
import { getProvider } from "./blockchain";

export type AppContext = {
  env: Env;
  logger: ReturnType<typeof createLogger>;
  db: Database.Database;
  cache: TtlCache;
  provider: ReturnType<typeof getProvider>;
};

let ctx: AppContext | null = null;

export function getContext(): AppContext {
  if (ctx) return ctx;

  const env = getEnv();
  const logger = createLogger();
  const db = openDb(env.dbPath);
  const cache = new TtlCache(env.cacheTtlMs);
  const provider = getProvider(env.sepoliaRpcUrl);

  ctx = { env, logger, db, cache, provider };
  return ctx;
}
