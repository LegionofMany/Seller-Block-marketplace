import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";

import { getContext } from "./services/context";
import { closeDb, migrateDb } from "./services/db";
import { errorHandler, notFound } from "./middlewares/errors";
import { listingsRouter } from "./routes/listings";
import { auctionsRouter } from "./routes/auctions";
import { rafflesRouter } from "./routes/raffles";
import { metadataRouter } from "./routes/metadata";
import { startMarketplaceIndexer } from "./indexer/marketplaceIndexer";

dotenv.config();

const app = express();

async function main() {
  const { env, logger, db } = getContext();

  // Render runs behind a proxy; this makes req.ip and rate limiting correct.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(pinoHttp({ logger }));
  app.use(helmet());

  if (env.corsOrigins?.length) {
    const allowAll = env.corsOrigins.includes("*");
    app.use(
      cors({
        origin: allowAll ? true : env.corsOrigins,
      })
    );
  } else {
    app.use(cors());
  }

  app.use(express.json({ limit: "256kb" }));

  app.use(
    rateLimit({
      windowMs: env.rateLimitWindowMs,
      max: env.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.get("/health", (_req: express.Request, res: express.Response) => {
    res.json({ status: "ok" });
  });

  // Fail fast if DB migrations cannot be applied.
  await migrateDb(db);

  app.use(listingsRouter());
  app.use(auctionsRouter());
  app.use(rafflesRouter());
  app.use(metadataRouter());

  app.use(notFound);
  app.use(errorHandler);

  const server = app.listen(env.port, () => {
    logger.info({ port: env.port }, "API running");
  });

  const indexer = startMarketplaceIndexer();

  async function shutdown(signal: string) {
    logger.info({ signal }, "shutting down");
    try {
      indexer.stop();
    } catch {
      // ignore
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));

    try {
      await closeDb(db);
    } catch (e) {
      logger.warn({ err: e }, "failed to close db");
    }
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM").finally(() => process.exit(0)));
  process.on("SIGINT", () => void shutdown("SIGINT").finally(() => process.exit(0)));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});