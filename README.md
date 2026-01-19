# Seller Block Marketplace

Seller Block is a Web3-powered local marketplace for physical goods using
secure auctions and target-based raffles with on-chain escrow.

## Repository Structure

This repository is a monorepo with the following structure:

- `/contracts` — Solidity smart contracts (Hardhat)
  - EscrowVault
  - MarketplaceRegistry
  - AuctionModule
  - RaffleModule

- `/frontend` — Next.js + TailwindCSS web application
  - Wallet connection
  - Listings
  - Auctions & raffles
  - Pickup & acceptance flow

- `/backend` — Node.js backend services
  - Stripe payments (verification & ads)
  - Database (users, ads)
  - Webhooks

## Key Architecture Rules

- Escrow logic is 100% on-chain
- Platform payments (verification, ads) are off-chain via Stripe
- No admin can access escrowed funds
- Buyer must accept item before funds release

## Development Rules

- Do not mix frontend, backend, or contract logic
- One GitHub issue = one feature
- All contract changes require tests