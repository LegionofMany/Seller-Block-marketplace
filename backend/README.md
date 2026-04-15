# Seller Block Marketplace — Backend

Express + TypeScript backend workspace for the Seller Block Marketplace monorepo.

This backend is a production-ready MVP API layer that:

- Indexes configured `MarketplaceRegistry` events into Postgres
- Serves listings/auctions/raffles from the DB
- Provides a metadata upload endpoint (fake URI for now)

## Prerequisites

- Node.js 18.18+ (or 20+) and npm

## Install

```bash
npm install
```

## Environment variables

This workspace uses `dotenv` and loads a `.env` file from the `backend/` directory.

An example file is provided at `.env.example`. To use it locally:

```bash
copy .env.example .env
```

Required:

- Either `CHAIN_CONFIG_JSON` for multi-chain support, or the legacy single-chain variables below
- `DATABASE_URL` (managed Postgres connection string)

Legacy single-chain fallback:

- `SEPOLIA_RPC_URL`
- (Optional backup) `SEPOLIA_RPC_URL_FALLBACK`
- `MARKETPLACE_REGISTRY_ADDRESS`

Optional chain metadata for the legacy single-chain fallback:

- `CHAIN_KEY`
- `CHAIN_NAME`
- `CHAIN_ID`
- `CHAIN_NATIVE_CURRENCY_SYMBOL`

### Local Postgres (recommended for dev)

If you don't have a managed Postgres instance available (or it refuses external connections), you can run a local Postgres via Docker:

```bash
docker compose up -d
```

Then set your `.env` to use:

- `DATABASE_URL=postgres://marketplace:marketplace@localhost:5432/marketplace`

### Managed Postgres notes

If you're using a hosted Postgres URL (e.g. Render) and see `Error: Connection terminated unexpectedly` during startup migrations, it usually means the provider is dropping connections at the protocol level (often because external connections are disabled or you're using an internal-only URL). Verify the database allows external connections and use the provider's "external" connection string.

Optional:

- `PORT` (defaults to `4000`)
- `START_BLOCK` (legacy single-chain fallback only; when using `CHAIN_CONFIG_JSON`, prefer per-chain `startBlock` values)
- `INDEXER_ENABLED` (default `true`; set to `false` to run API without the background indexer)
- `INDEXER_POLL_MS`, `INDEXER_CHUNK_SIZE`
- `CACHE_TTL_MS`
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`
- `LISTING_AUTOHIDE_REPORTS_THRESHOLD` (default `3`; set to `0` to disable auto-hide)
- `CORS_ORIGINS` (comma-separated list of allowed origins; include every exact production, custom-domain, and preview frontend origin that should call the API)
- `LOG_LEVEL`, `NODE_ENV`

### Multi-chain config format

`CHAIN_CONFIG_JSON` accepts either an array of chains or an object with `defaultChainKey` and `chains`.
Each chain entry supports:

- `key`, `name`, `chainId`
- `rpcUrl`, optional `rpcFallbackUrl`
- `marketplaceRegistryAddress`
- optional `startBlock`
- `nativeCurrencySymbol`
- optional `stablecoins` with `symbol`, `name`, `address`, `decimals`, and optional `isStablecoin`

## Run

Start in dev mode (nodemon + ts-node):

```bash
npm run dev
```

By default the server listens on `PORT=4000`.

Build and run production output:

```bash
npm run build
npm start
```

## Endpoints

- `GET /health` → `{ "status": "ok" }`

Listings

- `GET /listings`
- `GET /listings/:id`
- `GET /seller/:address/listings`

Query params for `/listings` and `/seller/:address/listings`:

- `q=<string>` (search title/description)
- `category=<string>` / `subcategory=<string>`
- `city=<string>` / `region=<string>`
- `sort=newest|price_asc|price_desc`
- `type=fixed|auction|raffle`
- `active=true|false`
- `minPrice=<uint>` / `maxPrice=<uint>` (raw token units)
- `limit` / `offset`

Auctions

- `GET /auctions/:listingId`

Raffles

- `GET /raffles/:listingId`

Metadata

- `POST /metadata` (JSON body: `{ title, description, image, attributes }`)
- `GET /metadata/:id`

## Project structure

- `src/index.ts` — Express app entrypoint
- `src/routes/` — route modules
- `src/controllers/` — request handlers
- `src/services/` — DB, chain client, cache, metadata
- `src/indexer/` — background event indexer + checkpointing
