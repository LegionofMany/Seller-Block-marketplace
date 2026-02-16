import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const vaultAddressEnv = process.env.VAULT_ADDRESS;
  const feeRecipientEnv = process.env.FEE_RECIPIENT;
  const arbiterEnv = process.env.ARBITER;
  const protocolFeeBpsEnv = process.env.PROTOCOL_FEE_BPS;

  const feeRecipient = feeRecipientEnv?.length
    ? (() => {
        if (!ethers.isAddress(feeRecipientEnv)) throw new Error("Invalid FEE_RECIPIENT address");
        return ethers.getAddress(feeRecipientEnv);
      })()
    : deployer.address;

  const arbiter = arbiterEnv?.length
    ? (() => {
        if (!ethers.isAddress(arbiterEnv)) throw new Error("Invalid ARBITER address");
        return ethers.getAddress(arbiterEnv);
      })()
    : undefined;

  const protocolFeeBps = protocolFeeBpsEnv?.length
    ? (() => {
        const parsed = Number.parseInt(protocolFeeBpsEnv, 10);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) {
          throw new Error("Invalid PROTOCOL_FEE_BPS (expected integer 0..1000)");
        }
        return parsed;
      })()
    : undefined;

  let vault;
  if (vaultAddressEnv?.length) {
    if (!ethers.isAddress(vaultAddressEnv)) throw new Error("Invalid VAULT_ADDRESS address");
    vault = await ethers.getContractAt("EscrowVault", ethers.getAddress(vaultAddressEnv));
  } else {
    const EscrowVault = await ethers.getContractFactory("EscrowVault");
    vault = await EscrowVault.deploy(deployer.address);
    await vault.waitForDeployment();
  }

  const vaultAddress = await vault.getAddress();

  const Auction = await ethers.getContractFactory("AuctionModule");
  const auction = await Auction.deploy(deployer.address);
  await auction.waitForDeployment();

  const Raffle = await ethers.getContractFactory("RaffleModule");
  const raffle = await Raffle.deploy(deployer.address);
  await raffle.waitForDeployment();

  const Marketplace = await ethers.getContractFactory("MarketplaceRegistry");
  const marketplace = await Marketplace.deploy(
    deployer.address,
    vaultAddress,
    await auction.getAddress(),
    await raffle.getAddress(),
    feeRecipient
  );
  await marketplace.waitForDeployment();

  // Wire controller/registry relationships
  await (await vault.setController(await marketplace.getAddress())).wait();
  await (await auction.setRegistry(await marketplace.getAddress())).wait();
  await (await raffle.setRegistry(await marketplace.getAddress())).wait();

  // Optional post-deploy configuration
  if (typeof protocolFeeBps === "number") {
    await (await marketplace.setProtocolFeeBps(protocolFeeBps)).wait();
  }
  if (arbiter) {
    await (await marketplace.setArbiter(arbiter)).wait();
  }

  console.log("EscrowVault:", vaultAddress);
  console.log("MarketplaceRegistry:", await marketplace.getAddress());
  console.log("AuctionModule:", await auction.getAddress());
  console.log("RaffleModule:", await raffle.getAddress());

  const net = await ethers.provider.getNetwork();
  const networkName = process.env.HARDHAT_NETWORK ?? net.name ?? `chain-${net.chainId.toString()}`;
  const deployment = {
    network: networkName,
    chainId: net.chainId.toString(),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    feeRecipient,
    arbiter: arbiter ?? null,
    protocolFeeBps: typeof protocolFeeBps === "number" ? protocolFeeBps : 250,
    contracts: {
      EscrowVault: vaultAddress,
      MarketplaceRegistry: await marketplace.getAddress(),
      AuctionModule: await auction.getAddress(),
      RaffleModule: await raffle.getAddress(),
    },
  };

  const outDir = join(process.cwd(), "deployments");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${networkName}.json`);
  writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log("Deployment JSON:", outPath);
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exitCode = 1;
});
