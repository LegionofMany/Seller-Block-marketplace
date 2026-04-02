## Plan: Kijiji-Style Classifieds (Clone Scope)

Deliver a Kijiji-like classifieds product on top of the existing web3 marketplace core by adding: location-first browsing, Kijiji-like categories, rich listing creation with multi-photo uploads (IPFS/Pinata), user accounts/profiles, saved searches + alerts, paid placements (bump/top/featured), and in-app messaging. Keep existing smart contracts as the transaction rail (escrow/auction/raffle), but make the day-to-day classifieds experience primarily off-chain (Postgres + backend APIs) with on-chain settlement.

**Phase 0 Decisions Confirmed**
- v1 scope is confirmed as: location-first browsing, accounts/profiles, saved searches/alerts, paid placements, messaging, categories, search/filters/sort, and image uploads.
- v1 notification channels are confirmed as in-app notifications plus email; push stays out of scope for v1.
- v1 safety baseline is confirmed as: global API rate limiting, stricter report/block endpoint throttling, report + block flows, metadata text validation, image-only uploads (max 12 files / 6MB each), and auto-hide for listings that cross the configured report threshold. Messaging should reuse the same rate-limit/report/block/content constraints when Phase 3 ships.

**Implementation Status (Current Repo)**
- Phase 0 is complete.
- Phase 1 is complete: listings UX parity is implemented, including multi-image uploads, metadata pinning, categories, location-first browse filters, search, sorting, and pagination.
- Phase 2 is complete: wallet sign-in, short-lived JWT auth, protected write endpoints, profile editing, seller profile rendering, and a minimal follow/follower system are implemented.
- Phase 3 is complete: conversations, polling-based message delivery, block/report safety flows, and end-user message pagination via "load older messages" are implemented.
- Phase 4 is complete: `saved_searches` and `notifications` tables, saved-search CRUD APIs, listings-page save flow, dashboard edit/delete management, in-app notifications, optional Postmark email delivery, and a background saved-search scan worker are implemented.
- Phase 5 is complete: Stripe-backed checkout sessions, `payments` and `promotions` tables, dashboard purchase/history UI, active promotion ranking in listings queries, and promoted listing badges/highlighting are implemented.
- Phase 6 is not yet implemented in this repo.

**Steps**
1. Phase 0 — Product alignment & guardrails (blocking)
   1) Confirm the exact Kijiji clone target scope for v1 (required features already selected: location, accounts, saved searches/alerts, paid placements, messaging, categories, search/filters/sort, image uploads).
   2) Define the minimal moderation and safety baseline for messaging and listings (rate limits, abuse reporting, block user, basic content constraints).
   3) Decide notification channels for alerts and messages: in-app only vs email + push (recommend: in-app + email for v1).

2. Phase 1 — Listings UX parity (posting + browse like Kijiji)
   1) Listing creation: multi-photo upload + metadata pinning
      - Backend: implement file upload endpoint(s) and Pinata pinning (store CID(s)); pin metadata JSON to IPFS.
      - Frontend: replace image URL input with file picker + preview; include category + location + contact fields.
      - Compatibility: keep rendering existing listings with old single-image URL.
   2) Kijiji-like categories
      - Add a fixed initial category tree (category + subcategory) and store on listing/metadata.
      - Update browsing UI to show category navigation.
   3) Location-first browsing
      - Add location fields to listings: city, region/state, postal code (simple text model per your choice).
      - Add filters: location + category + price + sale type; add sorting: newest, price low→high, price high→low.
   4) Search + pagination UX
      - Search bar across title/description + optional location/category scoping.
      - Pagination controls on home/category pages.

3. Phase 2 — Accounts, auth, and profiles (Kijiji-like identity)
   1) Auth model
      - Implement Sign-In with Ethereum (SIWE-like) for session creation.
      - Backend issues short-lived JWT (or session cookie) bound to wallet address; middleware protects write endpoints.
   2) User profiles
      - DB `users` table keyed by wallet address; profile fields: displayName, bio, avatarCid, createdAt.
      - Seller profile page shows: listings, location (optional), follower count, join date, response rate (later), reputation (later).

4. Phase 3 — Messaging (Kijiji Messages)
   1) Conversation model
      - DB tables: `conversations` (participants + listingId optional), `conversation_participants`, `messages`.
      - APIs: start conversation, list conversations, fetch messages (paged), send message.
   2) Realtime delivery
      - Minimum viable: polling with `since` cursor; upgrade to WebSocket/SSE if needed.
   3) Safety baseline
      - Rate limiting per address/IP, message length limits, block user, report conversation/message.
      - Store message text in DB; optionally store attachments later (out of v1 unless required).

5. Phase 4 — Saved searches & alerts
   1) Saved searches
      - DB `saved_searches` table storing query params (category, location, price range, keywords, sale type, sort).
      - UI to save/edit/delete searches.
   2) Alerts/notifications
      - Minimum viable: email alerts (SendGrid/Postmark) + in-app notification list.
      - Background job: periodic scan for new listings matching saved searches.
      - DB `notifications` table (userAddress, type, payloadJson, readAt, createdAt).

6. Phase 5 — Paid placements (Kijiji-style monetization)
   1) Placement types
      - Bump (moves listing to top), Top Ad (pinned placement), Featured (highlighted).
   2) Storage & ranking
      - DB tables: `payments` (provider, status, amount, currency/chainId, txHash), `promotions` (listingId, type, startsAt, endsAt, priority).
      - Update listings queries to apply promotion ranking rules.
   3) Payments integration
      - Decide payment rail per market: off-chain (Stripe) vs on-chain stablecoin (USDC). Recommend: Stripe for Kijiji parity; keep on-chain option as Phase 6.

7. Phase 6 — Chain/gas optimization (optional but aligned to update.md)
   1) Multi-chain configuration
      - Frontend supports multiple chain configs + deployment addresses.
      - Backend indexer becomes chain-aware (partition indexer state by chainId).
   2) Deploy to a low-gas EVM chain (TBD)
      - Add new deployments JSON and env config.
   3) Stablecoin-first UX
      - Token list per chain; default to USDC where available.

**Relevant files**
- Listing creation and browsing
  - backend/src/routes/metadata.ts and backend/src/controllers/metadataController.ts — evolve to IPFS pinning + multi-image metadata
  - backend/src/routes/listings.ts and backend/src/controllers/listingsController.ts — add category/location/search/sort params
  - backend/migrations/001_init.sql — reference baseline; add new migration(s) for new tables
  - frontend/app/create/page.tsx — add file upload, category/location/contact fields
  - frontend/app/page.tsx and frontend/lib/hooks/useListings.ts — search/filter/sort/pagination UI and query wiring
  - frontend/components/listing/ListingCard.tsx — category/location badges, featured styling
  - frontend/app/seller/[address]/page.tsx — richer seller profile view
- Auth/accounts
  - backend/src/middlewares (new) — SIWE/JWT middleware
  - frontend/components/providers/Web3Providers.tsx — reuse wagmi; add sign-in flow
- Messaging (new areas)
  - backend/src/routes/messages.ts (new) and controllers/services to manage conversations/messages
  - frontend/app/messages/* (new) — conversation list + thread UI
- Alerts
  - backend/src/services/jobs/* (new) — scheduled job runner
  - backend/src/routes/savedSearches.ts (new), notifications routes
- Monetization
   - backend/src/routes/promotions.ts (new)

**Verification**
1. Listings parity
   - Create listing with multi-images + category + location; verify pinning and display on home/category/seller pages.
   - Verify search/filter/sort/pagination match expected Kijiji behaviors.
2. Accounts
   - SIWE login: nonce issuance, signature verification, token/session; protected routes enforced.
3. Messaging
   - Start conversation from listing; send/receive messages; pagination works; rate limit triggers.
4. Saved searches/alerts
   - Save a search and receive notification/email when a matching listing is created.
5. Promotions
   - Purchase/activate bump/top/featured; verify ranking and expiration.

**Decisions**
- Pinata for IPFS pinning.
- Location model: city/region/postal code (simple text fields).
- Messaging is in scope (explicitly confirmed), so we must add moderation and rate limiting baseline.

**Further Considerations**
1. Messaging + alerts require a chosen email provider and background job runtime (Render cron/worker). Pick one early.
2. If the client wants exact Kijiji UX, confirm which sections must exist (Autos, Real Estate, Jobs, etc.) and whether category-specific fields are required (e.g., car make/model/year).
