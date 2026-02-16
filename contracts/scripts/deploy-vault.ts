import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const EscrowVault = await ethers.getContractFactory("EscrowVault");
  const vault = await EscrowVault.deploy(deployer.address);
  await vault.waitForDeployment();

  const vaultAddress = await vault.getAddress();
  console.log("EscrowVault:", vaultAddress);

  const net = await ethers.provider.getNetwork();
  const networkName = process.env.HARDHAT_NETWORK ?? net.name ?? `chain-${net.chainId.toString()}`;
  const deployment = {
    network: networkName,
    chainId: net.chainId.toString(),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    owner: deployer.address,
    contracts: {
      EscrowVault: vaultAddress,
    },
  };

  const outDir = join(process.cwd(), "deployments");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `vault.${networkName}.json`);
  writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log("Deployment JSON:", outPath);
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exitCode = 1;
});
