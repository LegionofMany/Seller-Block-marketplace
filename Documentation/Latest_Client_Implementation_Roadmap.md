# Latest Client Implementation Roadmap

> Scope note (April 2026): this document is based on the most recent client chat and is intended to be the active implementation roadmap for the next delivery tranche. It should be read alongside [Documentation/update02.md](Documentation/update02.md), but where the two documents conflict on near-term priorities, this roadmap reflects the latest client direction. For the literal requirement breakdown from the latest client chat, also read [Documentation/Latest_Client_Chat_Requirement_Matrix.md](Documentation/Latest_Client_Chat_Requirement_Matrix.md).

## Purpose

This roadmap translates the latest client feedback into a repo-ready delivery plan.

The main product signal from the latest chat is:

- stop widening scope prematurely
- make the public marketplace launch flow feel like a polished classifieds product
- prioritize sign-in, posting, categories, favorites/follows/watch flow, landing page quality, and user trust
- defer dealership, subscription, and payment-rail complexity until the public launch UX is stable

## Current Product Priority

### Immediate Launch Target

Launch a public-facing classifieds marketplace for general users first, with a strong antique / collectibles / local-seller use case.

This launch target should feel closer to Kijiji, Marketplace, or GovDeals account setup than to a protocol demo.

### Priority Outcomes

1. Clean email-first account creation
2. Full profile and address capture
3. Reliable posting and publishing flow
4. Better categories for public launch
5. Watch / favorites / followed sellers experience after sign-in
6. Strong landing page with categories and top ads
7. Less confusing token / network language
8. Clearer visual feedback and brighter accent styling

## Implementation Status Snapshot

Status as of April 22, 2026 for this roadmap tranche:

- shipped: email-first sign-in and registration, forgot-password flow, profile/address/phone capture, watch/favorites/follows dashboard refactor, landing-page/category improvements, local discovery, create-flow publish recovery, public-launch category updates, token/network copy cleanup, accent refresh, saved-search alerts with marketplace deep links, and notification/email copy polish
- partially complete: final manual UX regression across sign-in, posting, watch flow, and trust/copy surfaces; hosted deployment and migration verification outside local builds
- unresolved but now decision-ready: SMS verification scope, BlockPages timing, exact "SEO and google loop" implementation meaning, and stablecoin launch matrix by geography

This means the implementation is near-complete for the public-launch UX scope. The closure path is now explicit: adopt the launch defaults in the final closure pass below, finish the remaining manual validation, and confirm hosted deployment parity.

## Final Closure Pass

This section converts the remaining open questions into launch-default recommendations so the tranche can move from near-complete to signoff-ready without reopening broad scope.

### Recommended Launch Defaults

1. SMS verification

Recommended decision: do not require SMS verification for public launch.

Reasoning:

- email-first sign-up, verification email, password reset, and full identity capture are already implemented
- adding SMS now introduces provider, delivery, and fraud-control dependencies without improving the current launch-critical UX enough to justify the delay
- SMS can remain a post-launch trust uplift or abuse-control feature if usage patterns show it is needed

Implementation consequence:

- phase 1 can be treated as complete for launch scope once manual regression passes

2. BlockPages timing

Recommended decision: keep BlockPages out of first-run onboarding and stage it as an immediate post-launch trust/KYC layer.

Reasoning:

- the client explicitly described BlockPages as a later trust step, not the first barrier
- forcing KYC into basic sign-up would cut directly against the current classifieds-first launch target
- trust surfaces already exist in the product and can absorb a later verification badge or trust-upgrade entry point cleanly

Implementation consequence:

- BlockPages remains roadmap follow-up work and does not block public-launch signoff

3. "SEO and google loop"

Recommended decision: define launch scope as SEO-ready marketplace pages now, and defer Google-assisted address autofill unless separately approved.

Launch interpretation:

- keep sitemap and robots in place
- ensure landing, marketplace, listing detail, and seller profile surfaces remain indexable where appropriate
- keep metadata and shareable URLs aligned with real marketplace navigation
- do not treat Google Maps or Places integration as implied launch scope without explicit client approval

Reasoning:

- this is the narrowest interpretation consistent with the client language and the current codebase
- it improves discovery and trust without creating new external-service complexity at the end of the tranche

Implementation consequence:

- this item can be closed for launch scope unless the client explicitly means Google address autocomplete or ad-network integration

4. Launch stablecoin / geography matrix

Recommended decision: keep actual settlement support narrow at launch and keep regional currency messaging broader than the underlying token rail.

Launch default:

- one confirmed permit-compatible stablecoin per supported production chain
- Canada-facing UI may present CAD-oriented marketplace expectations, but should not promise QCAD settlement unless QCAD is actually configured, available, and validated on the launch chain
- US-facing UI should prefer plain USDC-style wording where the underlying rail is a USD stablecoin
- avoid exposing a wide multi-token matrix at launch; expand only after production token support is verified

Reasoning:

- this is consistent with the repo guidance to stay stablecoin-first and narrow at launch
- it avoids overpromising regional token support before production chain config and permit compatibility are fully confirmed
- it preserves user clarity while still allowing later locale-aware token defaults

Implementation consequence:

- token/network copy can be treated as launch-complete once production config confirms the single-token-per-chain choice

### Signoff Trigger

This roadmap tranche can move from near-complete to signed off when all of the following are true:

1. The four recommended launch defaults above are accepted, either explicitly by the client or implicitly by product leadership for the launch cut.
2. Manual regression is completed for sign-in, password reset, profile editing, watch flow, local discovery, create/publish recovery, and trust/copy surfaces.
3. Hosted deployment parity is verified for the current frontend/backend behavior, including required migrations and environment configuration.
4. No launch-surface copy or UX blockers remain after the final QA pass.

### Signed-Off State

If the recommended launch defaults are accepted, the correct roadmap status becomes:

- signed off for public-launch implementation scope
- BlockPages, SMS, broader regional token expansion, and other deferred items remain in post-launch roadmap status unless separately promoted

## Scope Lock

### In Scope Now

- sign-in and account setup improvements
- forgot password
- address and postal-code flow fixes
- profile completion and post-login routing
- landing page improvements
- favorites / follows / watch surface
- listing publish reliability
- public-launch category cleanup
- user-facing copy cleanup for token and network naming
- visual polish for accent colors and interaction clarity

### Deferred Until After Public Launch

- subscription plan implementation
- dealer garage entitlement logic
- XML / CSV / FTP ingestion for dealership feeds
- finalized payment rails
- full monetization rollout
- advanced dealership workflow
- auto-industry legal workflow implementation
- large smart-contract redesign for vehicle-specific compliance
- app module work

### Needs Explicit Decision Before Implementation

- what "SEO and google loop" means in implementation terms
- whether SMS verification is required for launch or only planned
- whether BlockPages is launch-critical or staged immediately after launch
- exact stablecoin matrix for launch geography

## Key Product Requirements From Latest Client Chat

### Identity And Onboarding

- sign-up should be email-first
- required fields should include:
  - name
  - email
  - phone number
  - full address
  - postal code
- account verification should support email and possibly SMS
- forgot password is required
- wallet connection should happen after account creation and profile setup
- BlockPages should be a later trust / KYC step, not the first barrier

### Discovery And Landing Experience

- landing page must feel like a real marketplace entry point
- landing page should show categories and top ads
- users should be able to follow seller profiles and watch listings
- signed-in users should be guided toward followed sellers, watched items, or favorites
- timing-sensitive items should be easier to surface after login

### Profile And Location

- full address must work correctly in profile creation and editing
- postal code must be editable and stored correctly
- location should help drive local discovery
- profile types will later include public, garage, and dealer profiles, but those tiers are not finalized for current build work

### Listing Creation And Categories

- image upload already matters to the client and should remain central
- publish flow must become reliable immediately
- categories need public-launch refinement, including at least:
  - antique collectable
  - housewares
- reserve / cost language for auctions should be clearer
- clicks and selection changes should produce more obvious feedback

### Wallet / Token / Network Clarity

- RainbowKit desktop support is accepted as working
- user-facing references to SBUSD are confusing and should be removed or renamed for launch surfaces
- user-facing Sepolia / testnet language should be cleaned up where it hurts trust
- launch stablecoin expectations currently point toward CAD / QCAD for Canada and USDC-like clarity for the US

### Design Direction

- keep dark mode
- keep black as the design base
- replace muddy accent colors with brighter green or blue accents
- improve the clarity of selected states and click feedback

## Implementation Phases

## Phase 0 - Scope Freeze And Decision Log

### Status

Decision-ready. The public-launch scope and deferred work are documented, and the remaining open items now have recommended launch defaults in the final closure pass.

### Goal

Lock the public-launch scope and prevent dealer, subscription, and payment-rail work from diluting the next sprint.

### Tasks

- create a short scope note for the current launch target
- define launch persona as public classifieds seller / buyer first
- remove or mark deferred all dealership and subscription work from the active sprint board
- resolve the meaning of "SEO and google loop"
- decide whether SMS verification is launch scope or roadmap scope
- decide whether BlockPages is launch scope or immediate post-launch scope

### Acceptance Criteria

- one approved scope note exists in the repo
- one list of deferred items exists and is not mixed into current sprint work
- launch token / locale assumptions are written down

## Phase 1 - Sign-In And Account Flow

### Status

Mostly complete. Email-first sign-up, password login, password reset, address capture, postal code, phone number, verification email, and post-sign-in routing are implemented. SMS verification remains a decision, not a shipped feature.

### Goal

Make onboarding feel like a consumer marketplace account flow rather than a wallet-first crypto product.

### Tasks

- keep email-first sign-up as the main entry path
- add or confirm forgot-password flow
- require full address fields in account setup or profile completion
- require postal code and phone number capture
- ensure email verification is clear and reliable
- if SMS is approved, add SMS verification plan or implementation
- move wallet connection emphasis to post-sign-up profile setup
- ensure profile completion happens before deeper seller actions

### Likely Repo Surfaces

- frontend/app/sign-in/page.tsx
- frontend/components/providers/AuthProvider.tsx
- frontend/lib/auth.ts
- backend/src/controllers/authController.ts
- backend/src/routes/auth.ts

### Acceptance Criteria

- a new user can create an account through email-first flow
- forgot password works end to end
- address and phone capture are part of the user identity flow
- wallet connection is presented as a follow-up action, not the first mandatory step

## Phase 2 - Landing, Watch, Favorites, And Follows

### Status

Mostly complete. The landing page now surfaces categories, top ads, and signed-in discovery; the dashboard now groups followed sellers, saved ads, saved searches, and alerts into a watch-first flow.

### Goal

Make the product useful immediately after sign-in and more compelling for repeat visits.

### Tasks

- strengthen landing page hierarchy
- show categories and top ads clearly
- route signed-in users toward watched items, favorites, or followed sellers
- create or refine a dedicated watch / favorites / followed page
- emphasize timing-sensitive auction or raffle items in signed-in views
- improve visible feedback for follow and favorite actions

### Likely Repo Surfaces

- frontend/app/page.tsx
- frontend/app/dashboard/page.tsx
- frontend/app/seller/[address]/page.tsx
- frontend/components/site/MarketplaceBrowse.tsx
- frontend/components/listing/ListingCard.tsx

### Acceptance Criteria

- landing page shows categories and top ads clearly
- users can follow sellers and save / watch listings with obvious state changes
- signed-in users have a clear place to see followed sellers and watched inventory

## Phase 3 - Profile, Address, And Location Relevance

### Status

Mostly complete. Profile editing now carries phone/address data consistently, postal code persists, and signed-in local discovery uses saved profile location.

### Goal

Make profile data useful for trust and nearby discovery.

### Tasks

- fix any profile tab issues around prefill or address display
- ensure postal code can be edited reliably
- validate stored address fields across sign-up and profile edit
- use postal code and location data to improve local listing relevance
- ensure public seller profile reflects meaningful location information where appropriate

### Likely Repo Surfaces

- frontend/app/dashboard/page.tsx
- frontend/lib/auth.ts
- backend/src/controllers/usersController.ts
- backend/src/services/db.ts

### Acceptance Criteria

- profile edit flow correctly saves full address
- postal code is editable and persists correctly
- nearby or location-aware discovery becomes more relevant for logged-in users

## Phase 4 - Listing Publish Reliability And Categories

### Status

Mostly complete. The create flow includes publish-recovery handling after upload/listing creation failures, categories now include antiques and housewares, and auction wording is clearer. The remaining gap is final end-to-end manual publish validation in the intended hosted environment.

### Goal

Make posting feel stable and understandable for public launch.

### Tasks

- fix remaining publish blockers in create flow
- keep image-first posting simple and reliable
- refine category list for launch
- add at minimum:
  - antique collectable
  - housewares
- clarify auction reserve / cost wording
- improve selection visibility and control feedback in posting flow

### Likely Repo Surfaces

- frontend/app/create/page.tsx
- frontend/lib/categories.ts
- backend/src/controllers/listingsController.ts
- backend/src/controllers/metadataController.ts

### Acceptance Criteria

- a user can upload photos and successfully publish a listing
- launch categories reflect the client's public-marketplace use case
- auction wording is understandable without contract knowledge

## Phase 5 - Token, Network, And Trust Copy Cleanup

### Status

Mostly complete. User-facing SBUSD/testnet language has been reduced across launch surfaces, saved-search notifications and emails now use human-facing copy, and listing/seller/detail surfaces have been cleaned up. A final trust/copy review pass is still warranted before calling this phase fully closed.

### Goal

Reduce user confusion from dev-network language and unclear token naming.

### Tasks

- remove or rename SBUSD on user-facing surfaces if it is not part of launch reality
- reduce visible Sepolia / testnet language where it undermines trust
- improve token display language to match launch geography expectations
- keep decentralized settlement direction without exposing unnecessary internal naming

### Likely Repo Surfaces

- frontend/lib/tokens.ts
- frontend/lib/env.ts
- frontend/app/create/page.tsx
- frontend/app/listing/[id]/page.tsx
- frontend/app/sign-in/page.tsx

### Acceptance Criteria

- users are not forced to understand internal dev/test token names to use the app
- launch-facing currency and token copy is clearer and more trustworthy

## Phase 6 - Visual Refresh

### Status

Mostly complete. The brighter accent system and stronger state visibility are implemented, but this still needs final visual signoff across the full launch journey.

### Goal

Improve perceived quality without destabilizing the product.

### Tasks

- preserve dark mode foundation
- test brighter green and brighter blue accent options
- improve state-change visibility for buttons, chips, and selected filters
- reduce muddy / low-contrast accent usage

### Likely Repo Surfaces

- frontend/app/globals.css
- frontend/components/ui
- frontend/app/layout.tsx

### Acceptance Criteria

- the interface feels more deliberate and polished
- interaction states are visually obvious
- design direction remains consistent with dark mode

## Post-Launch Roadmap

These should not block the public-launch tranche.

### Monetization And Packaging

- public garage subscription
- dealer garage subscription
- subscription billing model
- monetization logic for promoted surfaces

### Dealer Workflow

- dealer profile model
- staff / shared access model
- XML / CSV / FTP feed imports
- drop-box style dealer feature set

### Auto-Industry Expansion

- vehicle-specific category and compliance expansion
- smart-contract updates required by legal or regulatory constraints
- CTA flows for inspections, mechanics, detailing, insurance-related partners

### Broader Platform Expansion

- app module
- deeper international currency / locale expansion
- larger data-storage pricing and adoption review

## Validation Plan

### Current Validation Status

- completed locally: backend TypeScript builds and frontend production builds passed after each major implementation slice
- still pending: final manual regression across sign-up, password reset, posting, watch flow, local discovery, and trust/copy surfaces in the target deployment environment

### Functional Validation

- sign-up flow works from first visit to profile creation
- forgot-password flow completes successfully
- address and postal code are editable and persist
- watch / favorite / follow flows are visible and understandable
- listing publish succeeds with image upload
- categories match the public launch goal
- landing page reflects categories and top ads clearly

### Manual UX Validation

- review first-run sign-up flow against GovDeals-style expectations
- test new-user posting flow end to end
- test signed-in routing to watch / favorites / followed views
- test profile editing and location persistence
- review all user-facing token and network copy for trust issues

## Risks And Constraints

- the latest client direction contains intentionally deferred decisions around payments and subscriptions; implementing those too early will destabilize scope
- legal and industry-specific requirements for auto workflows are real but should not drive the public classifieds launch sprint
- if SMS verification is required for launch, provider choice and backend integration become a dependency
- if BlockPages is made launch-critical, onboarding complexity will increase and must be designed carefully

## Recommended Next Sprint

1. Accept or override the four recommended launch defaults in the final closure pass
2. Run final manual regression on sign-in, password reset, posting, watch flow, and local discovery
3. Verify required backend migrations and hosted deployment parity for the latest frontend/backend slices
4. Mark the tranche signed off for public-launch scope if no blocking issues remain

## Ownership Notes

This roadmap is intended to be a working implementation reference, not a historical archive. When priorities change again, update this document first and then reconcile the active task list and implementation notes with it.