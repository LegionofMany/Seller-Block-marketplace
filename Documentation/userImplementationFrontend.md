
# Seller Block Marketplace — Frontend Guide

This guide explains, in plain language, how to run the frontend and how to use the app once it opens in the browser.

It is written for someone who is not a developer. If you follow the steps in order, you should be able to:

- start the frontend on your computer
- open the marketplace in your browser
- sign in with email
- browse listings
- save favorites and follow sellers
- create a listing
- use the dashboard

## What this app is

Seller Block Marketplace is a classifieds-style marketplace frontend built with Next.js.

The current app is centered around normal user flows first:

- email sign-in
- password reset
- public marketplace browsing
- dashboard watch activity
- profile and address details
- listing creation and publishing

Wallet connection still exists, but it is not the first thing a normal user needs to do.

## Before you start

You need these items on your computer:

1. Windows with PowerShell
2. Node.js 18.18 or newer
3. npm
4. The project files already downloaded on your machine

To check whether Node.js is installed, open PowerShell and run:

```powershell
node -v
npm -v
```

If both commands return a version number, you are ready to continue.

## Important note about the backend

The frontend can open by itself, but the full app experience depends on the backend API.

You need the backend if you want to use features like:

- email sign-in
- password reset
- favorites and follows
- saved searches and alerts
- metadata creation during listing publish
- faster marketplace and dashboard data loading

If the backend is not running, the frontend may still open, but important parts of the app will not work correctly.

## Frontend folder

All frontend commands in this guide run from:

```powershell
c:\Users\user\Desktop\marketPlace\Seller-Block-marketplace\frontend
```

## First-time setup

Open PowerShell and run:

```powershell
Set-Location "c:\Users\user\Desktop\marketPlace\Seller-Block-marketplace\frontend"
npm install
```

This installs the frontend packages.

## Create the frontend environment file

This project expects a `.env.local` file inside the `frontend` folder.

Create a file named:

```text
frontend/.env.local
```

Add the values your environment needs. For a typical local setup, the most important values are:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_CHAIN_CONFIG_JSON={"defaultChainKey":"sepolia","chains":[{"key":"sepolia","name":"Sepolia","chainId":11155111,"rpcUrl":"YOUR_RPC_URL","marketplaceRegistryAddress":"YOUR_MARKETPLACE_REGISTRY_ADDRESS","nativeCurrencySymbol":"ETH","nativeCurrencyName":"Ether"}]}
```

Notes:

- replace `YOUR_RPC_URL` with the RPC URL used by your project
- replace `YOUR_MARKETPLACE_REGISTRY_ADDRESS` with the marketplace registry address for your environment
- if your team already has a working `.env.local`, use that instead of creating a new one from scratch

Optional but useful frontend values:

- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `NEXT_PUBLIC_IPFS_GATEWAY_BASE_URL`
- `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`

## Start the frontend

From the `frontend` folder, run:

```powershell
npm run dev
```

When the server starts, open this address in your browser:

```text
http://localhost:3000
```

## Check that the frontend is working

When the app opens successfully, you should be able to visit these pages:

- Home page: `/`
- Marketplace: `/marketplace`
- Sign in: `/sign-in`
- Dashboard: `/dashboard`
- Create listing: `/create`

If those pages load, the frontend is running.

## How a normal user uses the app

## 1. Start at the home page

The home page is the public marketplace entry point.

It highlights:

- categories
- top or featured listings
- saved and followed activity for signed-in users
- trust and marketplace guidance

Use the home page if you want a quick overview before searching deeper.

## 2. Sign in

Open the sign-in page at `/sign-in`.

The app supports:

- email sign-in
- password login
- password reset
- wallet connection as a follow-up option

For a normal user, the easiest path is email sign-in.

Typical flow:

1. Open `/sign-in`
2. Create an account with email
3. Fill in the contact details step
4. After account creation, Seller Block opens an account-created handoff page
5. Verify the email if prompted
6. Use the guided links on that handoff page to open the correct profile setup area
7. Finish the profile details in the dashboard

If password reset is needed, use the reset option on the sign-in page.

### After the account is created

New users are no longer left inside the sign-in form after registration.

Seller Block now opens a dedicated account-created page that explains:

- whether the verification email was sent
- whether the email has already been confirmed
- what the next account steps are
- direct links into the dashboard profile areas that still need attention

This makes the onboarding flow feel more like a normal marketplace account setup.

## 3. Browse the marketplace

Open `/marketplace`.

This is where users can:

- browse active listings
- search by keyword
- filter by category
- use local discovery when profile location exists
- save search patterns

If the backend is connected, results load faster and saved-search features work better.

## 4. Open a listing

Click any listing card to open its details page.

The listing page shows the main information for that item, such as:

- title
- price
- seller information
- trust indicators
- listing type
- current status

Depending on the listing and the user account, the page may allow actions like:

- save or favorite
- buy
- bid
- enter raffle
- confirm delivery
- request refund

## 5. Create a listing

Open `/create`.

This page is where a seller can publish a new item.

The form is designed around public marketplace use, not technical contract language.

Users should fill in:

- a clear title
- a plain-language description
- photos
- location details
- price or auction settings
- the right category

Main listing types:

- fixed price
- auction
- raffle

Important:

- the backend must be available for metadata creation and recovery support
- wallet-related actions may still be required depending on the settlement path
- if the app shows a draft recovery or publish recovery message, follow that prompt instead of starting over

## 6. Use the dashboard

Open `/dashboard`.

The dashboard is the main account area.

It currently centers around three main sections:

- `Profile`
- `Watch`
- `My listings`

### Profile

Use this section to manage:

- identity details
- email status
- address
- phone number
- postal code
- profile information buyers may see

The Profile section now includes a guided account setup checklist.

This checklist can:

- show which setup steps are already complete
- highlight what is still missing
- jump the user directly to the missing section such as email verification, contact details, bio, or seller wallet setup

This means users do not need to search the form manually to find the next missing item.

### Watch

Use this section to manage:

- followed sellers
- saved ads
- saved searches
- alerts and watch activity

This is the section users return to when they want to pick up where they left off.

### My listings

Use this section to:

- review items you created
- open listing details again
- check listing activity connected to your seller account

### Admin listing tools

If the signed-in account has admin access, the dashboard also shows an extra listing management panel.

Admins can use this panel to:

- search by seller address or listing id
- filter listings by chain and active status
- see the exact number of matching listings returned by the server
- load more results when the first group is not enough
- remove listings from the marketplace index for moderation or cleanup

This area is only for trusted marketplace operators. Regular buyers and sellers do not need it.

## When a wallet is needed

The app is no longer explained as wallet-first, but some flows may still require a wallet connection.

For new users, wallet setup is now treated as a later seller step inside the profile/dashboard experience.

Examples:

- seller-side blockchain actions
- settlement actions
- contract-linked listing operations
- owner or admin tools

If a wallet is needed, the app will guide the user at that point.

## Common problems and simple fixes

## Frontend opens, but data looks empty

Likely cause:

- the backend is not running
- `NEXT_PUBLIC_BACKEND_URL` is wrong

What to do:

1. Confirm the backend is running
2. Check `frontend/.env.local`
3. Restart the frontend server

## Sign-in does not work

Likely cause:

- backend auth routes are unavailable
- email settings are not configured on the backend

What to do:

1. Check backend health
2. Confirm the frontend is pointing to the correct backend URL
3. Confirm backend email configuration is set correctly

## Create page fails during publish

Likely cause:

- metadata upload or listing publish support is not available from the backend
- a wallet or chain action was not confirmed

What to do:

1. Keep the draft if the recovery message appears
2. Confirm backend connectivity
3. Retry from the recovery prompt instead of rebuilding the entire listing

## Wallet actions are not working

Likely cause:

- wrong chain configuration
- missing wallet connection
- missing project env values

What to do:

1. Confirm the frontend chain configuration is correct
2. Confirm wallet connection is active
3. Reload the page after changing wallet network

## Commands summary

Use these commands in PowerShell:

```powershell
Set-Location "c:\Users\user\Desktop\marketPlace\Seller-Block-marketplace\frontend"
npm install
npm run dev
```

Useful extra commands:

```powershell
npm run build
npm run start
npm run lint
```

## Simple success checklist

You can consider the frontend ready for a layperson to use when all of these are true:

1. `npm install` completes without errors
2. `npm run dev` starts the app
3. `http://localhost:3000` opens successfully
4. `/sign-in`, `/marketplace`, `/dashboard`, and `/create` all load
5. the backend is reachable from the frontend
6. email sign-in works
7. users can browse, watch, and create listings without confusion

## Final note

For the current app, the simplest way to explain it to a non-technical user is this:

Seller Block Marketplace is a marketplace website. Start the backend, start the frontend, open the browser, sign in with email, browse the marketplace, and use the dashboard to manage profile, watched items, and your listings.

