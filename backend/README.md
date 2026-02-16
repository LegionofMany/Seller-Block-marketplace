# Seller Block Marketplace — Backend

Express + TypeScript backend workspace for the Seller Block Marketplace monorepo.

Current status: API scaffold. The only implemented route is a health check.

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

Variables currently listed in the example:

- `DATABASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Note: these are not consumed by the current code yet; they are placeholders for upcoming integrations.

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

## Project structure

- `src/index.ts` — Express app entrypoint
- `src/routes/`, `src/controllers/`, `src/services/`, `src/webhooks/` — reserved for future implementation
