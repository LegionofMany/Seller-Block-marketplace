# Seller Block Marketplace — Frontend

Next.js (App Router) + TailwindCSS frontend for the Seller Block Marketplace monorepo.

Current status: this workspace is a UI scaffold (starter template) and is intended as the starting point for marketplace screens.

## Prerequisites

- Node.js 18.18+ (or 20+) and npm

## Getting started

From the repo root:

```bash
cd frontend
npm install
npm run build
npm run dev
```

### Environment variables

This frontend reads contracts/RPC config from `NEXT_PUBLIC_*` variables.

1) Create a local env file:

```bash
copy .env.local.example .env.local
```

2) Edit `.env.local` and set at least:

- `NEXT_PUBLIC_SEPOLIA_RPC_URL` (an HTTPS RPC URL)
- `NEXT_PUBLIC_MARKETPLACE_REGISTRY_ADDRESS`

Optional but useful:

- `NEXT_PUBLIC_ESCROW_VAULT_ADDRESS`
- `NEXT_PUBLIC_AUCTION_MODULE_ADDRESS`
- `NEXT_PUBLIC_RAFFLE_MODULE_ADDRESS`
- `NEXT_PUBLIC_SEPOLIA_START_BLOCK` (improves listings/dashboard load time)
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (enables WalletConnect)

Then start the dev server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Scripts

- `npm run dev` — start the Next.js dev server
- `npm run build` — build for production
- `npm run start` — run the production server
- `npm run lint` — run ESLint

## Project structure

- `app/` — App Router pages/layout
- `public/` — static assets

## Backend integration

The backend API (separate workspace) runs by default on `http://localhost:4000` and currently exposes `GET /health`.

## Notes

- Styling is configured via TailwindCSS.
- Edit `app/page.tsx` to start building UI.
