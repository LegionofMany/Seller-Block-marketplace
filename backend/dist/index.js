"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const pino_http_1 = __importDefault(require("pino-http"));
const context_1 = require("./services/context");
const db_1 = require("./services/db");
const errors_1 = require("./middlewares/errors");
const listings_1 = require("./routes/listings");
const auctions_1 = require("./routes/auctions");
const raffles_1 = require("./routes/raffles");
const metadata_1 = require("./routes/metadata");
const marketplaceIndexer_1 = require("./indexer/marketplaceIndexer");
dotenv_1.default.config();
const app = (0, express_1.default)();
async function main() {
    const { env, logger, db } = (0, context_1.getContext)();
    // Render runs behind a proxy; this makes req.ip and rate limiting correct.
    app.set("trust proxy", 1);
    app.disable("x-powered-by");
    app.use((0, pino_http_1.default)({ logger }));
    app.use((0, helmet_1.default)());
    if (env.corsOrigins?.length) {
        const allowAll = env.corsOrigins.includes("*");
        app.use((0, cors_1.default)({
            origin: allowAll ? true : env.corsOrigins,
        }));
    }
    else {
        app.use((0, cors_1.default)());
    }
    app.use(express_1.default.json({ limit: "256kb" }));
    app.use((0, express_rate_limit_1.default)({
        windowMs: env.rateLimitWindowMs,
        max: env.rateLimitMax,
        standardHeaders: true,
        legacyHeaders: false,
    }));
    app.get("/health", (_req, res) => {
        res.json({ status: "ok" });
    });
    // Fail fast if DB migrations cannot be applied.
    await (0, db_1.migrateDb)(db);
    app.use((0, listings_1.listingsRouter)());
    app.use((0, auctions_1.auctionsRouter)());
    app.use((0, raffles_1.rafflesRouter)());
    app.use((0, metadata_1.metadataRouter)());
    app.use(errors_1.notFound);
    app.use(errors_1.errorHandler);
    const server = app.listen(env.port, () => {
        logger.info({ port: env.port }, "API running");
    });
    const indexer = (0, marketplaceIndexer_1.startMarketplaceIndexer)();
    async function shutdown(signal) {
        logger.info({ signal }, "shutting down");
        try {
            indexer.stop();
        }
        catch {
            // ignore
        }
        await new Promise((resolve) => server.close(() => resolve()));
        try {
            await (0, db_1.closeDb)(db);
        }
        catch (e) {
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
//# sourceMappingURL=index.js.map