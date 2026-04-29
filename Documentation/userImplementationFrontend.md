

# Seller Block Marketplace — Frontend User Guide (Updated)

This document explains how to run and manually test the frontend and summarizes the current user-facing features in this release.

Core updates in this release
---------------------------
- Image-by-URL support: users can add image URLs in the Create flow. URLs are validated (file extension + URL syntax) and render a preview thumbnail in the form before publishing.
- File uploads: existing file-upload flow remains supported and uploads files to `POST /uploads/images` which returns IPFS URIs.
- Country-select for Region: the Create and Marketplace Browse filters now offer a selectable country list instead of a free-text region field.
- Listing attributes: category-specific attributes are included and displayed on listings (VIN, mileage, provenance, bedrooms, bathrooms, squareFeet, etc.).
- `stablecoinAddress` profile field: sellers can save a payout stablecoin address in their profile; the `SellerPayout` component surfaces it.
- Payments & escrow: backend endpoints exist for creating payments/escrow rows (manual-review CTA in dashboard). A background worker polls approved payments and will relay settlement rows to the on-chain settlement contract when metadata contains the required payload.

Important environment variables
-------------------------------
- `PINATA_JWT` — required on backend for `POST /uploads/images` (Pinata IPFS pinning).
- `RELAYER_PRIVATE_KEY` — relayer wallet private key for settlement relays (used by payments worker). Keep this secret.

Quick test checklist (manual)
----------------------------
1. Ensure backend is running and reachable from the frontend (`NEXT_PUBLIC_BACKEND_URL` in `frontend/.env.local`).
2. Start the frontend:

```powershell
cd Seller-Block-marketplace/frontend
npm install
npm run dev
```

3. Open `http://localhost:3000`.
4. Sign up at `/sign-in` (email) or sign in with a test account.
5. Go to `/create` and try these flows:
   - Add an image by URL (paste a valid image URL ending in `.jpg`, `.png`, `.webp`, etc.). The preview thumbnail should appear.
   - Upload images from disk and confirm they appear in the preview grid.
   - Select a country from the Region / Country dropdown and confirm it persists in the draft.
   - Fill category-specific attributes (VIN, mileage for Cars; provenance for Antiques; bedrooms/bathrooms for Real Estate) and publish a no-photo listing to verify metadata path.
6. Verify metadata created in the backend: after publishing, inspect `POST /metadata` or the public listing page.

Notes on image previews and optimization
---------------------------------------
Previews for external URLs are rendered as unoptimized `next/image` elements (unoptimized flag) to avoid requiring image proxy configuration. This is intentional for quick manual testing; production optimization may require adding external domains to `next.config.js` or a custom loader.

Testing image uploads via curl
------------------------------
Example `curl` to upload a single image (replace `BACKEND_URL` and `/path/to/image.jpg`):

```bash
BACKEND_URL=https://seller-block-marketplace-4.onrender.com
## Welcome to Zonycs (zonycs.com) — Quick User Guide

This guide is for end users of the live site at https://zonycs.com. It explains, in simple terms, how to sign in, create listings, add photos (by URL or upload), and the difference between off-chain (regular) and on-chain (blockchain) publishing.

Who this is for
---------------
Anyone who wants to list items, post jobs, or browse and respond to listings on zonycs.com — no developer knowledge required.

Quick overview — two publishing modes
-----------------------------------
- Off-chain (easy): create listings, post job ads, and upload photos. No crypto wallet is required for browsing, saving drafts, or publishing basic listings. This is what most users will do.
- On-chain (optional): to finalize an on-chain listing or enable crypto settlement, connect a wallet (MetaMask or WalletConnect). The app will prompt you when a blockchain signature or transaction is required. On-chain publishing means the listing's record is anchored on the configured blockchain and settlement can happen with tokens.

Simple test account (use these values for testing on the live site)
-----------------------------------------------------------------
- Full name: John Doe
- Display name: John's Garage
- Email: test+1@example.com
- Password: Password123!
- Phone: +1 555-0100
- Street address: 123 Main St
- City: Anytown
- Country: Canada
- Postal code: M5V 2T6

Step-by-step: Sign in and create a basic listing (no wallet needed)
----------------------------------------------------------------
1. Open https://zonycs.com in your browser.
2. Click "Sign in" and choose "Create account" (or sign in with the email account above).
3. After signing in, click "Create" to open the listing form.
4. Fill the required fields:
    - Title (e.g. Used 2015 Honda Civic — reliable commuter)
    - Description (short, plain language)
    - Category → pick the category (e.g. Cars & Vehicles)
    - City / Country / Postal code
5. Optional: add details in category fields (VIN, mileage for cars; provenance for antiques; bedrooms for real estate).
6. To add a photo by URL: paste an image URL into "Add image by URL" and click Add — a thumbnail should appear.
7. Or upload photos from your device using "Choose from gallery".
8. Click Publish. The app will upload metadata and create the public listing. You do not need a wallet for this basic publish in most cases — the app will guide you if a wallet is required.

Step-by-step: Create an on-chain listing (wallet required)
------------------------------------------------------
1. Connect a browser wallet (MetaMask) or use WalletConnect in the app (there will be a "Connect wallet" button).
2. Fill the listing form as above and click Publish.
3. When a blockchain transaction is required, your wallet will show a confirmation popup with gas/fee details. Approve the transaction to finalize the on-chain publish.
4. After the transaction confirms, the listing will be anchored on-chain and settlement features (if used) can proceed.

Example listing data (copy/paste into form fields)
--------------------------------------------------
Car listing (image-by-URL):
- Title: Used 2015 Honda Civic — reliable commuter
- Description: Clean local car, two owners, well maintained.
- Category: Cars & Vehicles → Cars
- City: Anytown
- Country: Canada
- Postal code: M5V 2T6
- VIN: 1HGCM82633A004352
- Mileage: 132000
- Fixed price: 4500
- Image URL (paste into "Add image by URL"):
   - https://upload.wikimedia.org/wikipedia/commons/3/3e/2016_Honda_Civic_EXT.jpg

Antique listing (example):
- Title: Antique wooden chest — provenance included
- Category: Buy & Sell → Antiques & Collectibles
- Provenance: Estate of the Smith family, acquired 1954
- Image URL (optional): https://upload.wikimedia.org/wikipedia/commons/4/47/Antique_chest_example.jpg

Real-estate example:
- Title: 2-bedroom apartment near downtown
- Bedrooms: 2
- Bathrooms: 1
- Square feet: 800

Where to put a payout address (seller stablecoin address)
------------------------------------------------------
If you are a seller and want to receive token payouts, open your Profile (click your avatar → Profile) and look for the Payout or Seller Payout section. Paste your stablecoin address there. This is optional and only needed if you will receive crypto payouts.

What happens when you publish (lay terms)
----------------------------------------
- Off-chain publish: the app sends the listing details to the site backend and creates a public listing page you and buyers can see. No wallet interaction required.
- On-chain publish: after preparing the listing, the app asks your wallet to sign or send a small blockchain transaction. This registers the listing on the blockchain. You will need some gas on the selected network to complete this.

Image URLs — tips and quick checks
---------------------------------
- Use public image URLs that end with `.jpg`, `.jpeg`, `.png`, `.webp`, or `.gif`.
- If a URL doesn't show a preview, try another URL (some servers block direct embedding).
- Example safe URLs: Wikimedia images provided above.

Troubleshooting (user-friendly)
------------------------------
- I pasted an image URL but nothing showed: try a different URL (use the example Wikimedia links), or upload a photo from your device.
- I tried to publish and nothing happened: check for an error message at the top of the page. If it mentions a wallet, connect your wallet or choose the option to publish without on-chain settlement.
- I can't sign in: use the email you registered with and check your spam for any confirmation emails.

Safety and privacy
------------------
- Do not share private keys with anyone. Never paste a wallet private key into the website.
- Use test data or throwaway emails if you are experimenting on the live site.

If you'd like this guide added as a short help panel on the site (or linked from the footer), I can prepare a compact version suitable for the UI.

Suggested commit message if you want to commit this file:
`docs: user-facing guide for zonycs.com — on-chain and off-chain steps, example data`

