# Seller Block Marketplace — Smart Contracts

Solidity contracts and Hardhat tooling for the Seller Block Marketplace monorepo.

## Contracts

Source files are in `contracts/contracts/`:

- `EscrowVault.sol`
- `MarketplaceRegistry.sol`
- `AuctionModule.sol`
- `RaffleModule.sol`
- `MarketplaceSettlementV2.sol`
- `ERC20Mock.sol` (test helper)
- `ERC20PermitMock.sol` (test helper)

## Tooling

- Hardhat 3
- Ethers v6
- Solidity compiler: `0.8.28`

Network configuration lives in `hardhat.config.ts`.

## Install

```bash
npm install
```

## Tests

Run all tests:

```bash
npm test
```

Run only Solidity or Mocha suites:

```bash
npm run test:solidity
npm run test:mocha
```

## TypeScript client helpers

This repo includes a small helper layer (validation + gas estimation + revert decoding) in `src/client/`.

Build it:

```bash
npm run build:client
```

Example usage (ERC20 fixed-price buy):

```ts
import { ethers } from "ethers";
import { MarketplaceClient, approveIfNeeded } from "./dist/client/index.js";

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL!);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

const registryAddress = "0xRegistry";
const listingId = "0x..."; // bytes32

const client = MarketplaceClient.connect(registryAddress, wallet);
const { escrowVault } = await client.addresses();

// For ERC20 buys, the protocol expects approval to the EscrowVault (it pulls funds)
await approveIfNeeded({
	token: "0xToken",
	owner: await wallet.getAddress(),
	spender: escrowVault,
	amount: 1_000_000n,
	runner: wallet,
});

await (await client.buy(listingId)).wait();
```

Example usage (ERC20 auction bid):

```ts
import { ethers } from "ethers";
import { MarketplaceClient, approveIfNeeded } from "./dist/client/index.js";

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL!);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

const client = MarketplaceClient.connect("0xRegistry", wallet);
const { auctionModule } = await client.addresses();

const listingId = "0x..."; // bytes32
const bidAmount = 1_500_000n; // e.g. 1.5 USDC (6 decimals)

// For ERC20 bids, the protocol expects approval to the AuctionModule (it pulls bid funds)
await approveIfNeeded({
	token: "0xToken",
	owner: await wallet.getAddress(),
	spender: auctionModule,
	amount: bidAmount,
	runner: wallet,
});

await (await client.bid(listingId, bidAmount)).wait();
```

## Deploy

Local simulated deployment:

```bash
npm run deploy:local
```

Live deployments (require environment variables):

```bash
npm run deploy:sepolia
npm run deploy:base
npm run deploy:settlement-v2:sepolia
npm run deploy:settlement-v2:base
```

### Environment variables

Create `contracts/.env` with:

```dotenv
PRIVATE_KEY=
SEPOLIA_RPC_URL=
BASE_RPC_URL=

# Optional: if you already deployed EscrowVault and want to reuse it
VAULT_ADDRESS=

# Optional deployment configuration
# If unset, deployer is used as fee recipient.
FEE_RECIPIENT=

# Optional owner override for MarketplaceSettlementV2.
# If unset, deployer is used as owner.
SETTLEMENT_OWNER=

# Optional arbiter (leave empty to disable arbiter actions).
ARBITER=

# Optional protocol fee (bps). If unset, contract default (250 = 2.5%) is used.
# Max allowed by contract is 1000 (10%).
PROTOCOL_FEE_BPS=
```

After `npm run deploy:<network>`, the script writes deployed addresses to:

- `contracts/deployments/<network>.json`
- `contracts/deployments/settlement-v2.<network>.json`

### MarketplaceSettlementV2 deployment artifact format

`settlement-v2.<network>.json` contains:

```json
{
	"kind": "MarketplaceSettlementV2",
	"network": "sepolia",
	"chainId": "11155111",
	"deployedAt": "2026-04-10T00:00:00.000Z",
	"deployer": "0x...",
	"owner": "0x...",
	"feeRecipient": "0x...",
	"arbiter": "0x...",
	"protocolFeeBps": 250,
	"contracts": {
		"MarketplaceSettlementV2": "0x..."
	}
}
```

Phase 6 note:

- Use the existing Sepolia deployment files as the live source of truth.
- Use the `*.example.json` files in `contracts/deployments/` as templates when preparing a low-gas testnet or mainnet rollout.

## Directory layout

- `contracts/` — Solidity sources
- `test/` — contract tests
- `scripts/` — deployment / network scripts
- `artifacts/`, `cache/`, `types/` — generated outputs
