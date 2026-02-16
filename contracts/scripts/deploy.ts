import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const EscrowVault = await ethers.getContractFactory("EscrowVault");
  const vault = await EscrowVault.deploy(deployer.address);
  await vault.waitForDeployment();

  const Auction = await ethers.getContractFactory("AuctionModule");
  const auction = await Auction.deploy(deployer.address);
  await auction.waitForDeployment();

  const Raffle = await ethers.getContractFactory("RaffleModule");
  const raffle = await Raffle.deploy(deployer.address);
  await raffle.waitForDeployment();

  const Marketplace = await ethers.getContractFactory("MarketplaceRegistry");
  const marketplace = await Marketplace.deploy(
    deployer.address,
    await vault.getAddress(),
    await auction.getAddress(),
    await raffle.getAddress(),
    deployer.address
  );
  await marketplace.waitForDeployment();

  // Wire controller/registry relationships
  await (await vault.setController(await marketplace.getAddress())).wait();
  await (await auction.setRegistry(await marketplace.getAddress())).wait();
  await (await raffle.setRegistry(await marketplace.getAddress())).wait();

  console.log("EscrowVault:", await vault.getAddress());
  console.log("MarketplaceRegistry:", await marketplace.getAddress());
  console.log("AuctionModule:", await auction.getAddress());
  console.log("RaffleModule:", await raffle.getAddress());
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exitCode = 1;
});
