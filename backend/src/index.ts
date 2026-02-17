import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";

import { getContext } from "./services/context";
import { errorHandler, notFound } from "./middlewares/errors";
import { listingsRouter } from "./routes/listings";
import { auctionsRouter } from "./routes/auctions";
import { rafflesRouter } from "./routes/raffles";
import { metadataRouter } from "./routes/metadata";
import { startMarketplaceIndexer } from "./indexer/marketplaceIndexer";

dotenv.config();

const app = express();

const { env, logger } = getContext();

app.disable("x-powered-by");

app.use(pinoHttp({ logger }));
app.use(helmet());
app.use(cors());
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

app.use(listingsRouter());
app.use(auctionsRouter());
app.use(rafflesRouter());
app.use(metadataRouter());

app.use(notFound);
app.use(errorHandler);

const server = app.listen(env.port, () => {
  logger.info({ port: env.port }, "API running");
  startMarketplaceIndexer();
});

export default server;