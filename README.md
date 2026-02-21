# Seller Block Marketplace

Seller Block Marketplace is a monorepo for an on-chain escrow + marketplace smart-contract system, plus a web frontend and a backend API scaffold.

## What’s in this repo (current state)

This repository contains three workspaces:

- `contracts/` — Hardhat 3 + Solidity contracts with tests and deployment scripts
  - Contracts: `EscrowVault`, `MarketplaceRegistry`, `AuctionModule`, `RaffleModule`, plus `ERC20Mock` for testing
  - Test suites are in `contracts/test/`
- `backend/` — Express + TypeScript API scaffold
  - Currently exposes `GET /health` and loads environment variables via `dotenv`
  - Folders for `routes/`, `controllers/`, `services/`, `webhooks/` exist but are not implemented yet
- `frontend/` — Next.js (App Router) + TailwindCSS
  - Currently the starter template page (use this as the UI starting point)

If you’re looking for design notes / planning artifacts, see `Documentation/`.

## Prerequisites

- Node.js 18.18+ (or 20+) and npm
- (Optional, for deployments) an RPC URL + funded private key for the target network

## Quickstart

### 1) Smart contracts

```bash
cd contracts
npm install
```

Run the full test suite:

```bash
npm test
```

Deploy to a local simulated network:

```bash
npm run deploy:local
```

#### Contracts environment variables (only needed for live networks)

Create `contracts/.env` with:

```dotenv
PRIVATE_KEY=
SEPOLIA_RPC_URL=
BASE_RPC_URL=
```

Then deploy:

```bash
npm run deploy:sepolia
# or
npm run deploy:base
```

### 2) Backend API

```bash
cd backend
npm install
```

Create a local env file (optional for now):

```bash
copy src\.env.local.example .env
```

Run the API in dev mode:

```bash
npm run dev
```

Verify the server is up:

- `GET http://localhost:4000/health` → `{ "status": "ok" }`

### 3) Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Scripts (per workspace)

### contracts/

- `npm test` — run Hardhat tests
- `npm run deploy:local` — deploy contracts to the local simulated network
- `npm run deploy:sepolia` / `npm run deploy:base` — deploy to live networks (requires `contracts/.env`)

### backend/

- `npm run dev` — run the Express API via `nodemon` + `ts-node`
- `npm run build` — TypeScript compile to `dist/`
- `npm start` — run compiled server from `dist/`

Database / production notes
---------------------------

- Prefer a managed Postgres instance in production. Set the Postgres connection string in `DATABASE_URL` (example: `postgres://user:pass@host:5432/dbname`).
- The backend will use `DATABASE_URL` if present; for local development you may continue to use `DB_PATH` with SQLite (but the recent migration changes prefer Postgres).

Migration from SQLite to Postgres
--------------------------------

If you have existing data in the local SQLite DB (`backend/data/marketplace.sqlite`) you can copy it to Postgres using the included script:

```bash
# set these env vars to point to your Postgres and local sqlite
export DATABASE_URL="postgres://user:pass@host:5432/dbname"
export DB_PATH="./backend/data/marketplace.sqlite"
cd backend
npm install
npm run migrate:sqlite-to-pg
```

Notes:
- The script `backend/scripts/sqlite_to_pg.js` uses `better-sqlite3` and `pg` to read SQLite rows and upsert into Postgres. Ensure the target Postgres has the schema created (see `backend/migrations/001_init.sql`).
- For production, create a managed Postgres (Render, Railway, Heroku, Supabase) and set `DATABASE_URL` in your environment/CI.

### frontend/

- `npm run dev` — Next.js dev server
- `npm run build` — production build
- `npm start` — start production server

## Notes / conventions

- Keep contract logic in `contracts/` and covered by tests.
- Treat `backend/` and `frontend/` as independent apps (separate dependency installs).

## License

See `LICENSE`.