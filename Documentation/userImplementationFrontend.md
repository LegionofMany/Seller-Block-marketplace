

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
## Zonycs — Quick User Guide (for non-technical users)

This guide is written for regular users of the live site at https://zonycs.com. It shows how to sign in, create listings, add multiple images (by URL or upload), and how to submit a homepage ad (paid ad request) for review — all in plain language.

Who this guide is for
---------------------
Anyone who wants to buy, sell, or post jobs on Zonycs without needing any technical knowledge.

Test account (sample values you can use)
--------------------------------------
- Full name: John Doe
- Display name: John's Garage
- Email: test+1@example.com
- Password: Password123!
- Phone: +1 555-0100
- Street address: 123 Main St
- City: Anytown
- Country: Canada
- Postal code: M5V 2T6

Sign in and create a listing (step-by-step)
------------------------------------------
1. Open your browser and go to https://zonycs.com.
2. Click "Sign in" and create an account using the sample values above (or sign in if you already have an account).
3. Click "Create" to open the listing form.
4. Fill the main fields: Title, Description, Category, City, Country, Postal code.
5. Fill extra fields for your category if applicable (VIN/mileage for cars, provenance for antiques, bedrooms for real estate).

Adding images — multiple URLs and files (detailed)
------------------------------------------------
Zonycs supports up to 12 images per listing. You can mix image URLs and files.

Add images by URL:
- Find "Add image by URL" in the Create form.
- Paste one image URL and click "Add".
- Repeat to add more URLs (up to 12 total images combined with files).
- Example safe image URLs to try:
   - https://upload.wikimedia.org/wikipedia/commons/3/3e/2016_Honda_Civic_EXT.jpg
   - https://upload.wikimedia.org/wikipedia/commons/6/6e/2017_Toyota_Camry_SE.jpg
   - https://upload.wikimedia.org/wikipedia/commons/4/47/Antique_chest_example.jpg
- Tips: URLs should end in `.jpg`, `.jpeg`, `.png`, `.webp`, or `.gif`. If the thumbnail does not load, try another URL.

Upload image files from your device:
- Click "Choose from gallery" or "Take photo".
- In the file picker, select multiple images (hold Ctrl or Shift to multi-select).
- The app shows local previews immediately. Files are uploaded when you publish.

Managing images before publish:
- To reorder, drag or use any provided controls (if available) — otherwise the order you add them is used.
- To remove an image click Remove on the thumbnail.

How the app handles images when you publish:
- If you uploaded files, the site uploads them and stores them (you will see upload progress); these are included in the listing.
- Image URLs you added are saved as-is into the listing metadata.

Example: create a car listing with multiple images
------------------------------------------------
1. Title: Used 2015 Honda Civic — reliable commuter
2. Description: Clean local car, two owners, well maintained.
3. Category: Cars & Vehicles → Cars
4. VIN: 1HGCM82633A004352
5. Mileage: 132000
6. Add images:
    - Paste the Honda Civic image URL above and click Add.
    - Click Choose from gallery and select one local photo.
7. Click Publish.

Posting a homepage ad (create a paid ad request)
-----------------------------------------------
Zonycs supports a seller-request flow to show a listing as a homepage ad. This is a manual-review workflow:

1. Go to your Dashboard (click your avatar → Dashboard).
2. Find the section labeled "Ads" or "Promote listing".
3. Click "Create ad request" or "New ad".
4. Select which listing to promote from your existing listings.
5. Enter a Campaign name (e.g., "Spring Sale — Civic") and a Sponsor label (e.g., "John's Garage").
6. Choose a thumbnail: use the listing's images or upload/select a specific image.
7. Submit the request.

What happens next:
- The ad request is saved and sent for manual review by the site admin team.
- The Dashboard shows the request status (Pending, Approved, Rejected) and any payment state.
- If payment is required, follow the instructions shown in the Dashboard (the site will display payment options or steps).

On-chain vs Off-chain publishing (simple explanation)
--------------------------------------------------
- Off-chain: most users will publish this way. The listing appears on the site without you needing a crypto wallet.
- On-chain: if a listing requires a blockchain transaction (for settlement or registry), the app asks you to connect a wallet. Your wallet will pop up a confirmation — approve it to complete the on-chain publish.

Troubleshooting (plain language)
-------------------------------
- Image URL doesn't show a preview: use one of the example Wikimedia URLs, or upload a file from your device.
- Upload fails or shows an error: try publishing without images (text-only) and contact support if the problem persists.
- Can't sign in: double-check your email and password and check your spam folder for confirmation emails.

Safety and privacy reminder
--------------------------
- Never paste private keys or seed phrases into the site.
- Use an email you control for account recovery.

Want this guide added to the site footer or help panel?
----------------------------------------------------
If you want, I can shorten this into a compact help panel to link from the site footer or Dashboard. I can also commit the file with this content.

Suggested commit message if you want to commit this update:
`docs: user-facing guide for zonycs.com — images, ads, and simple publishing steps`

