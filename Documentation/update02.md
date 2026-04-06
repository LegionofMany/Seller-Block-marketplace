## Plan: Wallet-First Classifieds Marketplace

Deliver a classifieds product that feels closer to Kijiji or Facebook Marketplace for discovery and discussion, while keeping wallet connection and on-chain settlement for the transaction layer. The current client direction is: public comments on listings, wallet-first sign-in with RainbowKit, email only as an easy sign-in and notification aid, and no Stripe or other fiat checkout rails.

**Phase 0 Decisions Confirmed**
- v1 scope is confirmed as: location-first browsing, accounts/profiles, public listing comments, saved searches/alerts, categories, search/filters/sort, and image uploads.
- v1 notification channels are confirmed as in-app notifications plus email; push stays out of scope for v1.
- v1 safety baseline is confirmed as: global API rate limiting, stricter report/block endpoint throttling, report + block flows, metadata text validation, image-only uploads (max 12 files / 6MB each), auto-hide for listings that cross the configured report threshold, and the same moderation constraints for public comments.

**Implementation Status (Current Repo)**
- Phase 0 is complete.
- Phase 1 is complete: listings UX parity is implemented, including multi-image uploads, metadata pinning, categories, location-first browse filters, search, sorting, and pagination.
- Phase 2 is complete: wallet sign-in, short-lived JWT auth, protected write endpoints, profile editing, seller profile rendering, and a minimal follow/follower system are implemented. RainbowKit remains the intended wallet-connect entry point.
- Phase 3 is now aligned to public listing comments. Private messaging exists historically in the repo, but it is no longer part of the active product surface.
- Phase 4 is complete: saved searches and notifications are implemented, including CRUD APIs, listings-page save flow, dashboard management, in-app notifications, optional Postmark email delivery, and a background saved-search scan worker.
- Phase 5 is no longer active product scope: Stripe-backed checkout and paid placements are being removed from the client-facing flow.
- Phase 6 repo implementation is complete for the current codebase scope: listings and related records are chain-scoped in Postgres, backend reads/writes/indexer checkpoints are chain-aware, the backend can start one indexer per configured chain, and frontend listing routes carry explicit chain context.
- Phase 6 rollout is not fully complete yet: only the Sepolia deployment is live, the Base Sepolia deployment is still pending, production envs still need the final multi-chain JSON cutover once a second live deployment exists, and second-chain production verification remains rollout-only.

**Steps**
1. Phase 0 — Product alignment & guardrails
   - Confirm wallet-first connect/sign-in, public comments, listings UX, saved searches, and email notifications as the active v1 product.
   - Keep report/block/rate-limit controls applied to listings and comments.
2. Phase 1 — Listings UX parity
   - Multi-photo uploads and metadata pinning.
   - Kijiji-like categories and location-first browsing.
   - Search, sort, and pagination across listings.
3. Phase 2 — Accounts, auth, and profiles
   - SIWE-style session creation with wallet signature.
   - Profile editing and seller pages keyed by wallet address.
   - Email remains optional convenience, not the primary identity rail.
4. Phase 3 — Public listing comments
   - DB table: listing_comments keyed to (listingChainKey, listingId).
   - APIs: list comments for a listing and create a comment as an authenticated wallet user.
   - Listing detail pages should show a public discussion thread below the ad.
5. Phase 4 — Saved searches & alerts
   - Saved-search CRUD.
   - In-app notifications and optional email notifications.
   - Background worker to scan for new matches.
6. Phase 5 — Monetization and payment rails
   - Stripe, fiat checkout, and listing placement purchases are out of scope.
   - Settlement and value transfer should remain wallet-connected and chain-aware.
7. Phase 6 — Chain/gas optimization
   - Implemented: frontend supports multiple chain configs through NEXT_PUBLIC_CHAIN_CONFIG_JSON.
   - Implemented: backend env parsing, auth, indexer checkpoints, and listing identity are chain-aware through CHAIN_CONFIG_JSON.
   - Rollout-only: production multi-chain cutover after a second real deployment exists.

**Production Verification Snapshot (2026-04-04)**
- Verified locally: backend migrations apply, backend health returns {"status":"ok"}, and the config-driven Sepolia indexer starts successfully.
- Verified against the deployed backend: health and read-path checks were executed as part of the production pass.
- Rollout blocker for true multi-chain production verification: Base Sepolia deployment is not live yet, and the current deployer account has no Base Sepolia gas balance.
- Current product-scope correction: public comments are replacing private messaging, and Stripe-backed product surfaces are being removed from the live app.

**Relevant files**
- Listing creation and browsing
  - backend/src/routes/metadata.ts and backend/src/controllers/metadataController.ts
  - backend/src/routes/listings.ts and backend/src/controllers/listingsController.ts
  - frontend/app/create/page.tsx
  - frontend/app/page.tsx and frontend/lib/hooks/useListings.ts
  - frontend/components/listing/ListingCard.tsx
- Wallet auth and profiles
  - frontend/components/providers/Web3Providers.tsx
  - frontend/components/providers/AuthProvider.tsx
  - backend/src/routes/auth.ts
  - backend/src/routes/users.ts
- Public comments
  - backend/migrations/008_public_listing_comments.sql
  - backend/src/routes/comments.ts
  - backend/src/controllers/commentsController.ts
  - frontend/app/listing/[id]/page.tsx

**Verification**
1. Listings parity
   - Create listing with multi-images + category + location and verify browse/search behavior.
2. Accounts
   - Verify wallet connect, nonce issuance, signature verification, and protected routes.
3. Public comments
   - Open a listing, post a public comment as a signed-in wallet user, and verify comments render in order with validation and rate limiting.
4. Saved searches and alerts
   - Save a search and verify in-app or email notification delivery for matching listings.
5. Payment scope
   - Verify no Stripe purchase flow is exposed in the active dashboard or listing experience.

**Decisions**
- Pinata for IPFS pinning.
- Location model: city/region/postal code.
- Public comments are in scope; private messaging is not.
- Wallet-first sign-in/connect remains in scope; Stripe does not.

**Further Considerations**
1. Email remains useful for saved-search notifications and account convenience, but should not replace wallet identity.
2. If the client wants tighter moderation later, add delete/hide/lock controls for listing comment threads.
