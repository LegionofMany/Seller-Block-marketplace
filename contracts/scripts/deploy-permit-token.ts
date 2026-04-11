import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { network } from "hardhat";

function parseAddress(ethers: Awaited<ReturnType<typeof network.connect>>["ethers"], value: string | undefined, name: string) {
  if (!value?.trim().length) return undefined;
  if (!ethers.isAddress(value)) throw new Error(`Invalid ${name} address`);
  return ethers.getAddress(value);
}

function parseDecimals(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return 6;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 36) {
    throw new Error("Invalid PERMIT_TOKEN_DECIMALS (expected integer 0..36)");
  }
  return parsed;
}

function parseInitialSupply(value: string | undefined, fallback: string) {
  const trimmed = value?.trim() || fallback;
  if (!/^\d+$/.test(trimmed)) {
    throw new Error("Invalid PERMIT_TOKEN_INITIAL_SUPPLY (expected whole number string)");
  }
  return trimmed;
}

async function main() {
  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const tokenName = process.env.PERMIT_TOKEN_NAME?.trim() || "Seller Block USD";
  const tokenSymbol = process.env.PERMIT_TOKEN_SYMBOL?.trim() || "SBUSD";
  const decimals = parseDecimals(process.env.PERMIT_TOKEN_DECIMALS);
  const initialAccount = parseAddress(ethers, process.env.PERMIT_TOKEN_INITIAL_ACCOUNT, "PERMIT_TOKEN_INITIAL_ACCOUNT") ?? deployer.address;
  const initialSupplyWhole = parseInitialSupply(process.env.PERMIT_TOKEN_INITIAL_SUPPLY, "1000000");
  const initialBalance = ethers.parseUnits(initialSupplyWhole, decimals);

  const Token = await ethers.getContractFactory("ERC20PermitMock");
  const token = await Token.deploy(tokenName, tokenSymbol, decimals, initialAccount, initialBalance);
  await token.waitForDeployment();

  const tokenAddress = await token.getAddress();
  console.log("ERC20PermitMock:", tokenAddress);
  console.log("Name:", tokenName);
  console.log("Symbol:", tokenSymbol);
  console.log("Decimals:", decimals);
  console.log("Initial account:", initialAccount);
  console.log("Initial whole-token supply:", initialSupplyWhole);

  const net = await ethers.provider.getNetwork();
  const networkName = process.env.HARDHAT_NETWORK ?? net.name ?? `chain-${net.chainId.toString()}`;
  const deployment = {
    kind: "ERC20PermitMock",
    network: networkName,
    chainId: net.chainId.toString(),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    token: {
      name: tokenName,
      symbol: tokenSymbol,
      decimals,
      initialAccount,
      initialSupplyWhole,
      permitName: tokenName,
      permitVersion: "1",
      address: tokenAddress,
    },
  };

  const outDir = join(process.cwd(), "deployments");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `permit-token.${networkName}.json`);
  writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log("Deployment JSON:", outPath);
}

main().catch((err) => {
  console.error("Permit token deployment failed:", err);
  process.exitCode = 1;
});