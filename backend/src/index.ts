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
import { uploadsRouter } from "./routes/uploads";
import { safetyRouter } from "./routes/safety";
import { authRouter } from "./routes/auth";
import { usersRouter } from "./routes/users";
import { commentsRouter } from "./routes/comments";
import { savedSearchesRouter } from "./routes/savedSearches";
import { notificationsRouter } from "./routes/notifications";
import { settlementRouter } from "./routes/settlement";
import { favoritesRouter } from "./routes/favorites";
import { promotionsRouter } from "./routes/promotions";
import { startMarketplaceIndexer, type MarketplaceIndexerHandle } from "./indexer/marketplaceIndexer";
import { startNotificationsWorker } from "./services/notifications";
import { getPinataAuthStatus } from "./services/ipfs";

dotenv.config();

const app = express();

function isOriginAllowed(requestOrigin: string, allowedOrigins: string[]) {
  if (allowedOrigins.includes("*")) return true;

  let parsedRequestOrigin: URL;
  try {
    parsedRequestOrigin = new URL(requestOrigin);
  } catch {
    return false;
  }

  return allowedOrigins.some((allowedOrigin) => {
    if (allowedOrigin === requestOrigin) return true;
    if (!allowedOrigin.includes("*")) return false;

    const wildcardMatch = allowedOrigin.match(/^(https?):\/\/([^/?#]+)$/i);
    if (!wildcardMatch) return false;

    const allowedProtocol = wildcardMatch[1];
    const allowedHost = wildcardMatch[2];
    if (!allowedProtocol || !allowedHost) return false;

    if (parsedRequestOrigin.protocol !== `${allowedProtocol.toLowerCase()}:`) return false;

    const requestHost = parsedRequestOrigin.host.toLowerCase();
    const pattern = allowedHost
      .toLowerCase()
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, "[^.]+?");

    return new RegExp(`^${pattern}$`, "i").test(requestHost);
  });
}

async function main() {
  const { env, logger, db } = getContext();
  const shutdownTimeoutMs = 10_000;
  let shutdownPromise: Promise<void> | null = null;
  let shuttingDown = false;
  let indexers: MarketplaceIndexerHandle[] = [];
  let notificationsWorker: ReturnType<typeof startNotificationsWorker> | null = null;

  // Render runs behind a proxy; this makes req.ip and rate limiting correct.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(pinoHttp({ logger }));
  app.use(helmet());

  if (env.corsOrigins?.length) {
    app.use(
      cors({
        origin(origin, callback) {
          if (!origin) {
            callback(null, true);
            return;
          }

          if (isOriginAllowed(origin, env.corsOrigins ?? [])) {
            callback(null, true);
            return;
          }

          callback(new Error("Not allowed by CORS"));
        },
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

  async function probeStatus() {
    let dbOk = false;
    try {
      await db.query("select 1");
      dbOk = true;
    } catch (err) {
      logger.warn({ err }, "health check database probe failed");
    }

    const indexerStatuses = indexers.map((indexer) => indexer.getStatus());
    const notificationsStatus = notificationsWorker?.getStatus();
    const degradedIndexers = indexerStatuses.filter((status) => {
      if (!status.lastFailureAt) return false;
      return !status.lastSuccessAt || status.lastFailureAt >= status.lastSuccessAt;
    });
    const notificationsDegraded = Boolean(
      notificationsStatus?.lastFailureAt && (!notificationsStatus.lastSuccessAt || notificationsStatus.lastFailureAt >= notificationsStatus.lastSuccessAt)
    );

    return {
      dbOk,
      indexerStatuses,
      notificationsStatus,
      degradedIndexers,
      notificationsDegraded,
    };
  }

  app.get("/health", async (_req: express.Request, res: express.Response) => {
    const { dbOk, indexerStatuses, notificationsStatus, degradedIndexers, notificationsDegraded } = await probeStatus();

    const status = !dbOk ? "fail" : degradedIndexers.length || notificationsDegraded ? "degraded" : "ok";
    const statusCode = dbOk ? 200 : 503;

    res.status(statusCode).json({
      status,
      live: true,
      ready: dbOk && !shuttingDown,
      shuttingDown,
      services: {
        db: dbOk ? "ok" : "fail",
        indexer: degradedIndexers.length ? "degraded" : "ok",
        notifications: notificationsDegraded ? "degraded" : "ok",
      },
      indexers: indexerStatuses,
      notifications: notificationsStatus,
    });
  });

  app.get("/ready", async (_req: express.Request, res: express.Response) => {
    const { dbOk, degradedIndexers, notificationsDegraded, indexerStatuses, notificationsStatus } = await probeStatus();
    const ready = dbOk && !shuttingDown && degradedIndexers.length === 0 && !notificationsDegraded;

    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not_ready",
      ready,
      shuttingDown,
      services: {
        db: dbOk ? "ok" : "fail",
        indexer: degradedIndexers.length ? "degraded" : "ok",
        notifications: notificationsDegraded ? "degraded" : "ok",
      },
      indexers: indexerStatuses,
      notifications: notificationsStatus,
    });
  });

  app.get("/health/pinata", async (_req: express.Request, res: express.Response) => {
    const pinata = await getPinataAuthStatus(env);

    if (!pinata.configured) {
      res.status(200).json({
        status: "unconfigured",
        pinata,
      });
      return;
    }

    res.status(pinata.authenticated ? 200 : 503).json({
      status: pinata.authenticated ? "ok" : "fail",
      pinata,
    });
  });

  // Fail fast if DB migrations cannot be applied.
  await migrateDb(db);

  app.use(listingsRouter());
  app.use(auctionsRouter());
  app.use(rafflesRouter());
  app.use(metadataRouter());
  app.use(uploadsRouter());
  app.use(safetyRouter());
  app.use(authRouter());
  app.use(usersRouter());
  app.use(commentsRouter());
  app.use(savedSearchesRouter());
  app.use(notificationsRouter());
  app.use(favoritesRouter());
  app.use(promotionsRouter());
  app.use(settlementRouter());

  app.use(notFound);
  app.use(errorHandler);

  const server = app.listen(env.port, () => {
    logger.info({ port: env.port }, "API running");
  });

  indexers = env.supportedChains.map((chain) => startMarketplaceIndexer(chain));
  notificationsWorker = startNotificationsWorker();

  async function shutdown(signal: string) {
    if (shutdownPromise) return shutdownPromise;

    shuttingDown = true;
    logger.info({ signal }, "shutting down");
    shutdownPromise = (async () => {
      for (const indexer of indexers) {
        try {
          indexer.stop();
        } catch {
          // ignore
        }
      }
      try {
        notificationsWorker?.stop();
      } catch {
        // ignore
      }

      await Promise.race([
        new Promise<void>((resolve) => server.close(() => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, shutdownTimeoutMs)),
      ]);

      try {
        await Promise.race([closeDb(db), new Promise<void>((resolve) => setTimeout(resolve, shutdownTimeoutMs))]);
      } catch (e) {
        logger.warn({ err: e }, "failed to close db");
      }
    })();

    return shutdownPromise;
  }

  function shutdownAndExit(signal: string, exitCode: number) {
    void shutdown(signal)
      .catch((err) => {
        logger.error({ err, signal }, "shutdown failed");
      })
      .finally(() => process.exit(exitCode));
  }

  process.on("SIGTERM", () => shutdownAndExit("SIGTERM", 0));
  process.on("SIGINT", () => shutdownAndExit("SIGINT", 0));
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason }, "unhandled promise rejection");
    shutdownAndExit("unhandledRejection", 1);
  });
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "uncaught exception");
    shutdownAndExit("uncaughtException", 1);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});