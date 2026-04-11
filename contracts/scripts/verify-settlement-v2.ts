import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";
import hre, { network } from "hardhat";

type SettlementDeployment = {
  kind: string;
  owner: string;
  feeRecipient: string;
  contracts: {
    MarketplaceSettlementV2: string;
  };
};

async function main() {
  const { ethers } = await network.connect();
  const networkName = process.env.HARDHAT_NETWORK ?? "sepolia";
  const deploymentPath = join(process.cwd(), "deployments", `settlement-v2.${networkName}.json`);
  const deployment = JSON.parse(readFileSync(deploymentPath, "utf8")) as SettlementDeployment;

  if (deployment.kind !== "MarketplaceSettlementV2") {
    throw new Error(`Unexpected deployment kind in ${deploymentPath}`);
  }

  const address = ethers.getAddress(deployment.contracts.MarketplaceSettlementV2);
  const owner = ethers.getAddress(deployment.owner);
  const feeRecipient = ethers.getAddress(deployment.feeRecipient);

  console.log("Verifying MarketplaceSettlementV2:", address);
  console.log("Constructor args:", owner, feeRecipient);

  await verifyContract(
    {
      address,
      constructorArgs: [owner, feeRecipient],
      provider: "etherscan",
    },
    hre
  );
}

main().catch((err) => {
  console.error("Settlement verification failed:", err);
  process.exitCode = 1;
});