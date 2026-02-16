import "dotenv/config";
import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();

  const vaultAddress = process.env.VAULT_ADDRESS;
  if (!vaultAddress || !ethers.isAddress(vaultAddress)) {
    throw new Error("Set VAULT_ADDRESS in .env to your deployed EscrowVault address");
  }

  const registryAddress = process.env.REGISTRY_ADDRESS;
  const auctionAddress = process.env.AUCTION_ADDRESS;
  const raffleAddress = process.env.RAFFLE_ADDRESS;

  if (!registryAddress || !ethers.isAddress(registryAddress)) {
    throw new Error("Set REGISTRY_ADDRESS in .env to your deployed MarketplaceRegistry address");
  }
  if (!auctionAddress || !ethers.isAddress(auctionAddress)) {
    throw new Error("Set AUCTION_ADDRESS in .env to your deployed AuctionModule address");
  }
  if (!raffleAddress || !ethers.isAddress(raffleAddress)) {
    throw new Error("Set RAFFLE_ADDRESS in .env to your deployed RaffleModule address");
  }

  const vault = await ethers.getContractAt("EscrowVault", ethers.getAddress(vaultAddress));
  const auction = await ethers.getContractAt("AuctionModule", ethers.getAddress(auctionAddress));
  const raffle = await ethers.getContractAt("RaffleModule", ethers.getAddress(raffleAddress));
  const registry = await ethers.getContractAt(
    "MarketplaceRegistry",
    ethers.getAddress(registryAddress)
  );

  const [vaultController, auctionRegistry, raffleRegistry, feeRecipient, arbiter, protocolFeeBps] =
    await Promise.all([
      vault.controller(),
      auction.registry(),
      raffle.registry(),
      registry.feeRecipient(),
      registry.arbiter(),
      registry.protocolFeeBps(),
    ]);

  console.log("Vault controller:", vaultController);
  console.log("Auction registry:", auctionRegistry);
  console.log("Raffle registry:", raffleRegistry);
  console.log("Registry feeRecipient:", feeRecipient);
  console.log("Registry arbiter:", arbiter);
  console.log("Registry protocolFeeBps:", protocolFeeBps.toString());

  const registryChecksum = ethers.getAddress(registryAddress);
  if (vaultController !== registryChecksum) throw new Error("Vault controller is not MarketplaceRegistry");
  if (auctionRegistry !== registryChecksum) throw new Error("AuctionModule registry is not MarketplaceRegistry");
  if (raffleRegistry !== registryChecksum) throw new Error("RaffleModule registry is not MarketplaceRegistry");

  console.log("OK: wiring looks correct.");
}

main().catch((err) => {
  console.error("Verify failed:", err);
  process.exitCode = 1;
});
