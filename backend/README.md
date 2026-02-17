# Seller Block Marketplace — Backend

Express + TypeScript backend workspace for the Seller Block Marketplace monorepo.

This backend is a production-ready MVP API layer that:

- Indexes Sepolia `MarketplaceRegistry` events into SQLite
- Serves listings/auctions/raffles from the local DB (fast)
- Provides a metadata upload endpoint (fake URI for now)

## Prerequisites

- Node.js 18.18+ (or 20+) and npm

## Install

```bash
npm install
```

## Environment variables

This workspace uses `dotenv` and loads a `.env` file from the `backend/` directory.

An example file is provided at `src/.env.local.example`. To use it locally:

```bash
copy src\.env.local.example .env
```

Required:

- `SEPOLIA_RPC_URL`
- `MARKETPLACE_REGISTRY_ADDRESS`

Optional:

- `DB_PATH` (default `./data/marketplace.sqlite`)
- `START_BLOCK` (recommended: set to your deploy block to speed up first sync)
- `INDEXER_POLL_MS`, `INDEXER_CHUNK_SIZE`
- `CACHE_TTL_MS`
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`
- `LOG_LEVEL`, `NODE_ENV`

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

## Project structure

- `src/index.ts` — Express app entrypoint
- `src/routes/` — route modules
- `src/controllers/` — request handlers
- `src/services/` — DB, chain client, cache, metadata
- `src/indexer/` — background event indexer + checkpointing
