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
