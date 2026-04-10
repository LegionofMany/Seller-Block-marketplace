## Wallet-First Classifieds Marketplace Plan

Deliver a classifieds product that feels closer to Kijiji or Facebook Marketplace for discovery and discussion, while keeping wallet connection and on-chain settlement for the transaction layer. The current client direction is: public comments on listings, wallet-first sign-in with RainbowKit, email only as an easy sign-in and notification aid, and no Stripe or other fiat checkout rails.

## Current Product Direction

### Phase 0 Decisions Confirmed
- v1 scope is confirmed as: location-first browsing, accounts/profiles, public listing comments, saved searches/alerts, categories, search/filters/sort, and image uploads.
- v1 notification channels are confirmed as in-app notifications plus email; push stays out of scope for v1.
- v1 safety baseline is confirmed as: global API rate limiting, stricter report/block endpoint throttling, report + block flows, metadata text validation, image-only uploads (max 12 files / 6MB each), auto-hide for listings that cross the configured report threshold, and the same moderation constraints for public comments.

## Current Implementation Status

### Repo Status
- Phase 0 is complete.
- Phase 1 is complete: listings UX parity is implemented, including multi-image uploads, metadata pinning, categories, location-first browse filters, search, sorting, and pagination.
- Phase 2 is complete: wallet sign-in, short-lived JWT auth, protected write endpoints, profile editing, seller profile rendering, and a minimal follow/follower system are implemented. RainbowKit remains the intended wallet-connect entry point.
- Phase 3 is now aligned to public listing comments. Private messaging exists historically in the repo, but it is no longer part of the active product surface.
- Phase 4 is complete: saved searches and notifications are implemented, including CRUD APIs, listings-page save flow, dashboard management, in-app notifications, optional Postmark email delivery, and a background saved-search scan worker.
- Phase 5 is no longer active product scope: Stripe-backed checkout and paid placements are being removed from the client-facing flow.
- Phase 6 repo implementation is complete for the current codebase scope: listings and related records are chain-scoped in Postgres, backend reads/writes/indexer checkpoints are chain-aware, the backend can start one indexer per configured chain, and frontend listing routes carry explicit chain context.
- Phase 6 rollout is not fully complete yet: only the Sepolia deployment is live, the Base Sepolia deployment is still pending, production envs still need the final multi-chain JSON cutover once a second live deployment exists, and second-chain production verification remains rollout-only.

## Delivery Plan

### Functional Steps
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

## Verification And Rollout

### Production Verification Snapshot (2026-04-04)
- Verified locally: backend migrations apply, backend health returns {"status":"ok"}, and the config-driven Sepolia indexer starts successfully.
- Verified against the deployed backend: health and read-path checks were executed as part of the production pass.
- Rollout blocker for true multi-chain production verification: Base Sepolia deployment is not live yet, and the current deployer account has no Base Sepolia gas balance.
- Current product-scope correction: public comments are replacing private messaging, and Stripe-backed product surfaces are being removed from the live app.

### Relevant Files
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

### Verification Checklist
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

## Product Decisions

### Confirmed Decisions
- Pinata for IPFS pinning.
- Location model: city/region/postal code.
- Public comments are in scope; private messaging is not.
- Wallet-first sign-in/connect remains in scope; Stripe does not.

### Further Considerations
1. Email remains useful for saved-search notifications and account convenience, but should not replace wallet identity.
2. If the client wants tighter moderation later, add delete/hide/lock controls for listing comment threads.

## Smart Contract Redesign Review

The key mismatch is that the product has already moved toward a Kijiji-style, off-chain marketplace for discovery and discussion, while the smart contracts still model the entire listing lifecycle on-chain in `contracts/contracts/MarketplaceRegistry.sol`. The frontend still calls `createListing`, `openAuction`, `openRaffle`, `buy`, `confirmDelivery`, `requestRefund`, and `withdrawPayout` directly from the user wallet in `frontend/app/create/page.tsx` and `frontend/app/listing/[id]/page.tsx`. That means too many user-paid transactions, too much wallet friction, and a contract surface that is broader than the current UI actually needs.

### Current Assessment

The existing flow has five structural problems.

1. Listing creation is on-chain, but the product is now off-chain-first.
   The client-facing product now treats listings, comments, search, categories, alerts, and profiles as backend-driven marketplace features. Keeping listing creation on-chain means sellers pay gas before a buyer even exists, which is the opposite of the current product direction.

2. The flow is too transaction-heavy.
   A typical user path can require multiple writes:
   - seller creates listing
   - seller opens auction or raffle
   - buyer approves token
   - buyer buys or bids or enters
   - buyer confirms delivery or requests refund
   - seller withdraws payout
   That is not a professional classifieds UX, and it is incompatible with gas-fee-free usage unless a relayer is added and the step count is reduced.

3. The pull-credit escrow pattern adds unnecessary friction.
   In `contracts/contracts/EscrowVault.sol`, release and refund move funds into credits, and users must later call `withdraw`. That creates another transaction and another place for users to get confused.

4. ERC20 payments require pre-approval transactions.
   The current token flows in `contracts/contracts/AuctionModule.sol`, `contracts/contracts/RaffleModule.sol`, and `contracts/contracts/EscrowVault.sol` rely on `transferFrom`. That means the user must approve first, then act.

5. The raffle design is not professional enough for production.
   The current raffle close path uses seller commit-reveal in `contracts/contracts/MarketplaceRegistry.sol` and `contracts/contracts/RaffleModule.sol`. That gives the seller too much influence over liveness and perceived fairness.

### Most Important Conclusion

The correct smart-contract direction is not to make every current function gasless. The correct direction is:

- keep marketplace discovery fully off-chain
- reduce the on-chain layer to settlement only
- add a relayer-sponsored transaction model only for the few actions that truly need chain finality

That is the professional workflow for the current UI.

### Recommended Target Architecture

Move to a settlement-first protocol with gas sponsorship.

1. Off-chain marketplace layer
   Listings, comments, search, saved searches, profile data, and moderation stay in the backend and frontend. The backend database remains the source of truth for marketplace browsing.

2. On-chain settlement layer
   The chain should only handle:
   - buyer funding of a purchase escrow
   - auction finalization if auctions stay in scope
   - delivery confirmation or refund resolution
   - protocol fee accounting

3. Signed intents instead of on-chain listing creation
   The seller should not create a listing on-chain at publish time. Instead, the seller creates an off-chain listing and signs a settlement intent when needed.

   The intent should include:
   - seller address
   - backend listing id
   - chain id
   - payment token
   - price
   - expiry
   - nonce
   - sale type
   - settlement terms hash

4. Gas sponsorship
   For a real gas-fee-free UX, the backend should relay sponsored transactions.

   Recommended path:
   - short term: ERC-2771 style trusted forwarding for signature-based actions
   - longer term: ERC-4337 smart accounts plus a paymaster
   - practical repo approach: start with a relayer plus typed-data signatures and move to ERC-4337 only if the product proves out

5. Permit-based token funding
   For ERC20 purchases, bids, or ticket entries, use Permit2 or EIP-2612 permit-style approvals so the user signs once and the relayer submits one transaction.

6. Direct payout, not credit withdrawal
   On successful release or refund, funds should go directly to the seller or buyer whenever possible. The withdraw-credit model should be treated as a fallback, not the default UX.

### Critical Constraint

If the client literally wants gas-fee-free transactions for buyers, native ETH is the wrong primary payment rail.

Gas sponsorship works best when:
- the user signs a message
- the relayer submits the transaction
- the contract pulls ERC20 funds using permit

For native ETH buys, the relayer would have to both pay gas and front the purchase value, which is not a clean or scalable design. The professional answer is:

- gasless settlement should be stablecoin-first
- native ETH should either be deprecated for buyer flows or clearly treated as non-sponsored

### Recommended Contract Redesign

Do not keep extending the current registry as-is. Build a V2 settlement contract and migrate the UI to it incrementally.

1. Replace on-chain listing creation with order-based settlement
   Create a new contract, conceptually `MarketplaceSettlementV2`. Instead of `createListing`, it should verify seller-signed intents. A buyer or relayer submits the signed order only when a transaction is actually happening.

2. Introduce typed-data signatures everywhere
   Use EIP-712 for:
   - seller listing intent
   - buyer accept intent
   - buyer confirm delivery intent
   - buyer refund request intent
   - arbiter resolution intent if needed

3. Add nonce and cancellation management
   Each seller should have per-wallet nonces or order hashes. The contract needs:
   - `cancelOrder`
   - `invalidateNonce`
   - deadline enforcement

## Production Rollout Checklist

### Target Chain Checklist

1. Choose the live chain for the first production rollout. The current runtime is still Sepolia-only, so mainnet or Base mainnet must be chosen explicitly before go-live.
2. Deploy `MarketplaceSettlementV2` with the final `owner`, `feeRecipient`, `arbiter`, and `protocolFeeBps` values.
3. Verify the deployed source on the target block explorer and save the final address into `contracts/deployments/settlement-v2.<network>.json`.
4. Fund the relayer wallet on the same chain with enough native gas for sustained throughput and incident recovery.
5. Choose the supported settlement token set. Production should be stablecoin-first, and every listed token should support permit signing.
6. Record the final token metadata per chain: `address`, `decimals`, `permitName`, and `permitVersion`.
7. Run a live dry run on the target chain before public release: publish signed checkout, relayed accept, relayed confirm, and relayed refund.

### Render Checklist

1. Apply backend migration `010_listing_order_intents.sql` to the production Postgres database before enabling V2 traffic.
2. Replace the zero placeholder `marketplaceSettlementV2Address` in `CHAIN_CONFIG_JSON` with the real deployed address.
3. Add the production stablecoin list to `CHAIN_CONFIG_JSON`, including `permitName` and `permitVersion` for each supported token.
4. Set `MARKETPLACE_SETTLEMENT_V2_ADDRESS` to the same deployed address for the single-chain fallback path.
5. Set `RELAYER_PRIVATE_KEY` to the dedicated relayer wallet private key.
6. Confirm `FRONTEND_APP_URL`, `CORS_ORIGINS`, `AUTH_JWT_SECRET`, `DATABASE_URL`, and notification settings are production values.
7. Redeploy the backend and verify `/health`, settlement typed-data endpoints, and relayed actions against the live database.

### Vercel Checklist

1. Replace the zero placeholder `marketplaceSettlementV2Address` in `NEXT_PUBLIC_CHAIN_CONFIG_JSON` with the real deployed address.
2. Add the production stablecoin list to `NEXT_PUBLIC_CHAIN_CONFIG_JSON`, including `permitName` and `permitVersion`.
3. Set `NEXT_PUBLIC_MARKETPLACE_SETTLEMENT_V2_ADDRESS` to the same deployed address for the legacy fallback path.
4. Confirm `NEXT_PUBLIC_BACKEND_URL`, wallet-connect config, RPC URLs, and explorer URLs point to the production environment.
5. Trigger a fresh build after env updates so the client receives the final chain config.
6. Verify the listing detail page can load the seller order, read `consumedOrders`, compute escrow ids, and render relayed status correctly.

### Pre-Launch Smoke Checklist

1. Seller signs in and publishes a gasless fixed-price checkout intent.
2. Buyer signs in and completes a relayed `acceptOrderWithPermit` purchase.
3. Buyer completes a relayed confirm-delivery flow.
4. Buyer completes a relayed refund flow on a fresh escrow.
5. Backend persistence returns the latest signed order intent after relayer activity.
6. Monitoring captures relayer failures, contract reverts, and expired typed-data payloads.

## Relayer And Security Audit Before Deploy

### Current Gaps

1. Critical: runtime config still used a zero-address placeholder for `MarketplaceSettlementV2`, which would make the frontend and backend appear configured while all contract calls fail. This is now blocked at env-parse time and must be replaced with the real deployed address.
2. High: the relayer is currently a single hot wallet model. Production needs a dedicated wallet, funded gas reserves, rotation procedures, and restricted access to the private key.
3. High: the relayer has no explicit budget guardrails in code today. Before production, add operational caps per wallet, per IP, and per time window so a burst of signed requests cannot drain sponsored gas unexpectedly.
4. High: supported settlement tokens are not configured yet. Without a strict allowlist of permit-enabled tokens, the gasless path is operationally undefined for production.
5. Medium: relayed actions depend on short-lived signatures and backend uptime. Production needs retry policy, idempotent transaction tracking, and alerting for stuck or failed relays.
6. Medium: arbiter power is still a single-address role. Production should move arbiter control to a multisig or a governed operational wallet before public value is routed through V2.
7. Medium: there is no production deploy script for V2 in the current repo baseline. A dedicated deployment path and artifact format are required to avoid hand-edited addresses.

### Required Mitigations Before Go-Live

1. Deploy `MarketplaceSettlementV2`, verify it, and replace all zero placeholders with the live address.
2. Use a dedicated relayer wallet with only the gas balance needed for operations, not treasury or admin funds.
3. Keep the production token set narrow at launch. Start with one stablecoin per chain that is confirmed permit-compatible.
4. Add relayer monitoring and alerting for failed broadcasts, revert-heavy request bursts, and abnormal gas consumption.
5. Move `owner` and `arbiter` roles to multisig-controlled addresses if real value will move through the protocol.
6. Complete a full live smoke pass after every env cutover and before public traffic is allowed.

## Pre-Deploy Repository Cleanup

The repository should not ship local SQLite databases or ad-hoc build output files. Before production rollout, remove them from version control and keep them ignored locally.

4. Add permit-based payment functions
   For fixed-price:
   - `acceptOrderWithPermit`

   For auctions:
   - `placeBidWithPermit`

   For raffle, only if retained:
   - `enterRaffleWithPermit`

5. Move from credits to direct settlement
   Replace the current release plus withdraw pattern with:
   - `releaseEscrowAndPayout`
   - `refundEscrowAndReturnFunds`

   If a direct transfer fails, only then fall back to claimable credits.

6. Make close and settlement liveness independent of the seller
   Auction and raffle closure should not depend on the seller showing up. Anyone, or an automation keeper, should be able to finalize a finished auction. If raffle remains, the same rule should apply.

7. Remove seller-controlled raffle randomness
   If raffle stays in scope, use verifiable randomness or remove raffle from production. Given the current classifieds pivot, the recommendation is to de-prioritize or remove raffle from the active product.

8. Keep arbiter logic, but professionalize governance
   The single arbiter in `contracts/contracts/MarketplaceRegistry.sol` and `contracts/contracts/EscrowVault.sol` is acceptable for a prototype but not ideal long term.

   Move arbiter powers behind:
   - a multisig
   - a role-managed dispute resolver contract
   - a backend-operated relayer with signed arbiter actions recorded on-chain

### What To Change In This Repo

This is the practical plan to execute.

1. Freeze the current contracts as V1
   Do not keep layering gasless logic into the existing `createListing`-centric design. It will become harder to reason about and harder to audit.

2. Build `MarketplaceSettlementV2`
   Its scope should be:
   - `createEscrowFromSignedOrder`
   - `acceptCounterOffer`
   - `confirmDeliveryBySig`
   - `requestRefundBySig`
   - `arbiterResolve`
   - `cancelOrder`
   - `invalidateNonce`
   - `withdrawFees`

3. Keep the backend listing id as the primary business identifier
   The contract should reference a backend listing id or listing hash, not become the listing database itself.

4. Remove chain writes from listing publish
   In `frontend/app/create/page.tsx`, the create listing page should become backend-only for normal publish. Only when a buyer takes a transaction action should the chain be involved.

5. Move transaction initiation to the backend relayer
   The frontend should:
   - request typed data from the backend
   - have the wallet sign
   - send the signature back
   - let the relayer submit the sponsored transaction

6. Rework the listing detail action buttons
   In `frontend/app/listing/[id]/page.tsx`, the buttons should shift from direct contract writes to relayed intents:
   - Buy now becomes sign purchase intent
   - Confirm delivery becomes sign release
   - Request refund becomes sign refund request

7. Make stablecoin settlement the default
   Because gasless and native ETH do not combine cleanly for purchases, default settlement should be USDC-style token flows with permit support. Native coin support can remain as an advanced or fallback path, but not as the primary UX if gaslessness is a hard requirement.

8. De-scope or isolate raffle
   If the client still wants raffle, keep it behind a separate module and redesign it with unbiased randomness. If not, remove it from the active protocol surface and simplify the audit footprint.

### Implementation Plan

1. Phase A: Protocol redesign
   Write a V2 spec for:
   - signed listing intent format
   - escrow state machine
   - nonce and cancellation rules
   - fee model
   - arbiter powers
   - supported payment tokens
   - relayer trust model

2. Phase B: Fixed-price gasless settlement first
   Implement only the fixed-price path first. That gives the fastest path to a production-quality, gas-sponsored marketplace flow and matches the current classifieds product best.

3. Phase C: UI and backend relayer integration
   Add backend endpoints for:
   - prepare typed data
   - verify signature
   - submit relayed transaction
   - poll transaction state

   Then switch the frontend actions from wallet write calls to signed-intent calls.

4. Phase D: Auction and raffle decision
   Re-evaluate whether auction and raffle belong in the live product. If auction stays, redesign it around gas-sponsored bids and permissionless finalize. If raffle stays, redesign randomness completely. If neither is strategically important now, remove them from the active UI and keep the protocol narrower.

### Recommendation Summary

If the goal is to satisfy the client request and make the app feel professional, the recommended direction is:

- keep comments, discovery, profiles, and listing management off-chain
- replace the current on-chain listing registry workflow with signed off-chain intents plus on-chain settlement
- sponsor gas through a relayer
- use stablecoin plus permit for real gasless payments
- remove the extra withdraw step from normal user flows
- treat raffle as optional or remove it from the production roadmap

That is the architecture that best matches the current UI pivot and the gas-fee-free requirement.

### Next Step

The next useful deliverable would be a concrete V2 contract specification with exact function signatures, structs, events, and frontend/backend responsibilities.
