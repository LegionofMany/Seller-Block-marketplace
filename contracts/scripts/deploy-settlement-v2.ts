import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { network } from "hardhat";

function parseAddress(ethers: Awaited<ReturnType<typeof network.connect>>["ethers"], value: string | undefined, name: string) {
  if (!value?.trim().length) return undefined;
  if (!ethers.isAddress(value)) throw new Error(`Invalid ${name} address`);
  const normalized = ethers.getAddress(value);
  if (normalized === ethers.ZeroAddress) throw new Error(`Invalid ${name} address (zero address is not allowed)`);
  return normalized;
}

async function main() {
  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const owner = parseAddress(ethers, process.env.SETTLEMENT_OWNER, "SETTLEMENT_OWNER") ?? deployer.address;
  const feeRecipient = parseAddress(ethers, process.env.FEE_RECIPIENT, "FEE_RECIPIENT") ?? deployer.address;
  const arbiter = parseAddress(ethers, process.env.ARBITER, "ARBITER") ?? null;

  const protocolFeeBpsEnv = process.env.PROTOCOL_FEE_BPS?.trim();
  const protocolFeeBps = protocolFeeBpsEnv?.length
    ? (() => {
        const parsed = Number.parseInt(protocolFeeBpsEnv, 10);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) {
          throw new Error("Invalid PROTOCOL_FEE_BPS (expected integer 0..1000)");
        }
        return parsed;
      })()
    : undefined;

  const Settlement = await ethers.getContractFactory("MarketplaceSettlementV2");
  const settlement = await Settlement.deploy(owner, feeRecipient);
  await settlement.waitForDeployment();

  if (typeof protocolFeeBps === "number") {
    await (await settlement.setProtocolFeeBps(protocolFeeBps)).wait();
  }
  if (arbiter) {
    await (await settlement.setArbiter(arbiter)).wait();
  }

  const settlementAddress = await settlement.getAddress();
  console.log("MarketplaceSettlementV2:", settlementAddress);

  const net = await ethers.provider.getNetwork();
  const networkName = process.env.HARDHAT_NETWORK ?? net.name ?? `chain-${net.chainId.toString()}`;
  const deployment = {
    kind: "MarketplaceSettlementV2",
    network: networkName,
    chainId: net.chainId.toString(),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    owner,
    feeRecipient,
    arbiter,
    protocolFeeBps: typeof protocolFeeBps === "number" ? protocolFeeBps : Number(await settlement.protocolFeeBps()),
    contracts: {
      MarketplaceSettlementV2: settlementAddress,
    },
  };

  const outDir = join(process.cwd(), "deployments");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `settlement-v2.${networkName}.json`);
  writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log("Deployment JSON:", outPath);
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exitCode = 1;
});