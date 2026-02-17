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
const errors_1 = require("./middlewares/errors");
const listings_1 = require("./routes/listings");
const auctions_1 = require("./routes/auctions");
const raffles_1 = require("./routes/raffles");
const metadata_1 = require("./routes/metadata");
const marketplaceIndexer_1 = require("./indexer/marketplaceIndexer");
dotenv_1.default.config();
const app = (0, express_1.default)();
const { env, logger } = (0, context_1.getContext)();
app.disable("x-powered-by");
app.use((0, pino_http_1.default)({ logger }));
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
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
app.use((0, listings_1.listingsRouter)());
app.use((0, auctions_1.auctionsRouter)());
app.use((0, raffles_1.rafflesRouter)());
app.use((0, metadata_1.metadataRouter)());
app.use(errors_1.notFound);
app.use(errors_1.errorHandler);
const server = app.listen(env.port, () => {
    logger.info({ port: env.port }, "API running");
    (0, marketplaceIndexer_1.startMarketplaceIndexer)();
});
exports.default = server;
//# sourceMappingURL=index.js.map