import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Signature } from "ethers";
import { network } from "hardhat";

type AuthNonceResponse = {
  address: string;
  nonce: string;
  message: string;
  expiresAt: number;
};

type AuthVerifyResponse = {
  token: string;
  address: string;
};

type SellerOrderPrepareResponse = {
  domain: Record<string, unknown>;
  primaryType: string;
  types: Record<string, Array<{ name: string; type: string }>>;
  message: Record<string, unknown>;
  orderHash: string;
};

type LatestSellerOrderResponse = {
  item: {
    orderHash: string;
    signature: string;
    price: string;
    token: string;
    expiry: number;
    nonce: string;
    termsHash: string;
    seller: string;
    listingId: string;
  } | null;
};

type BuyerAcceptancePrepareResponse = {
  domain: Record<string, unknown>;
  primaryType: string;
  types: Record<string, Array<{ name: string; type: string }>>;
  message: { orderHash: string; buyer: string; deadline: number };
  order: {
    seller: string;
    listingId: string;
    token: string;
    price: string;
    expiry: number;
    nonce: string;
    termsHash: string;
  };
  orderHash: string;
  sellerSignature: string;
};

type RelayAcceptResponse = {
  txHash: string;
  escrowId: string;
  orderHash: string;
};

type EscrowActionPrepareResponse = {
  domain: Record<string, unknown>;
  primaryType: string;
  types: Record<string, Array<{ name: string; type: string }>>;
  message: { escrowId: string; buyer: string; action: number; deadline: number };
  orderHash: string;
  escrowId: string;
};

type RelayEscrowActionResponse = {
  txHash: string;
  escrowId: string;
  orderHash: string;
};

const CONFIRM_PRICE = 1_000_000n;
const REFUND_PRICE = 2_000_000n;

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function parseBackendEnvValue(name: string) {
  const envPath = join(process.cwd(), "..", "backend", ".env");
  const text = readFileSync(envPath, "utf8");
  const line = text.split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
  if (!line) throw new Error(`Missing ${name} in backend/.env`);
  return line.slice(name.length + 1).trim();
}

async function fetchJson<T>(baseUrl: string, path: string, init?: RequestInit, token?: string): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  headers.set("Accept", "application/json");
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.error?.message ?? `Request failed (${response.status})`);
  }
  return data as T;
}

async function authenticate(baseUrl: string, wallet: Awaited<ReturnType<typeof network.connect>>["ethers"]["Wallet"]) {
  const nonce = await fetchJson<AuthNonceResponse>(
    baseUrl,
    "/auth/nonce",
    { method: "POST", body: JSON.stringify({ address: wallet.address }) }
  );
  const signature = await wallet.signMessage(nonce.message);
  const verified = await fetchJson<AuthVerifyResponse>(
    baseUrl,
    "/auth/verify",
    { method: "POST", body: JSON.stringify({ address: wallet.address, nonce: nonce.nonce, signature }) }
  );
  return verified.token;
}

async function waitForListing(baseUrl: string, listingId: string, chainKey: string, timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetchJson<any>(baseUrl, `/listings/${listingId}?chainKey=${chainKey}`);
      const listing = response?.listing ?? response;
      if (listing?.id?.toLowerCase() === listingId.toLowerCase()) return listing;
    } catch {
      // ignore until indexed
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error(`Timed out waiting for listing ${listingId} to index`);
}

async function waitForSellerOrder(baseUrl: string, listingId: string, chainKey: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const order = await fetchJson<LatestSellerOrderResponse>(baseUrl, `/listings/${listingId}/settlement/order?chainKey=${chainKey}`);
    if (order.item) return order.item;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Timed out waiting for seller order on listing ${listingId}`);
}

async function ensureRelayerFunded(ethers: Awaited<ReturnType<typeof network.connect>>["ethers"], seller: any) {
  const relayerPrivateKey = parseBackendEnvValue("RELAYER_PRIVATE_KEY");
  const relayer = new ethers.Wallet(relayerPrivateKey, seller.provider);
  const balance = await seller.provider.getBalance(relayer.address);
  if (balance >= ethers.parseEther("0.01")) {
    console.log("Relayer already funded:", relayer.address, ethers.formatEther(balance), "ETH");
    return relayer.address;
  }
  const tx = await seller.sendTransaction({ to: relayer.address, value: ethers.parseEther("0.02") });
  await tx.wait();
  const fundedBalance = await seller.provider.getBalance(relayer.address);
  console.log("Funded relayer:", relayer.address, ethers.formatEther(fundedBalance), "ETH");
  return relayer.address;
}

async function createListing(args: {
  ethers: Awaited<ReturnType<typeof network.connect>>["ethers"];
  registry: any;
  seller: any;
  metadataURI: string;
  price: bigint;
  tokenAddress: string;
}) {
  const tx = await args.registry.connect(args.seller).createListing(args.metadataURI, args.price, args.tokenAddress, 0);
  await tx.wait();
  const nonce = await args.registry.listingNonce();
  const listingId = args.ethers.solidityPackedKeccak256(
    ["address", "uint256", "address"],
    [await args.registry.getAddress(), nonce, args.seller.address]
  );
  console.log("Created listing:", listingId, "metadata:", args.metadataURI, "price:", args.price.toString());
  return listingId;
}

async function publishSellerOrder(args: {
  baseUrl: string;
  chainKey: string;
  listingId: string;
  sellerWallet: any;
  sellerToken: string;
}) {
  const prepared = await fetchJson<SellerOrderPrepareResponse>(
    args.baseUrl,
    `/listings/${args.listingId}/settlement/order/prepare?chainKey=${args.chainKey}`,
    { method: "POST", body: JSON.stringify({}) },
    args.sellerToken
  );

  const signature = await args.sellerWallet.signTypedData(prepared.domain, prepared.types, prepared.message);
  await fetchJson(
    args.baseUrl,
    `/listings/${args.listingId}/settlement/order?chainKey=${args.chainKey}`,
    {
      method: "POST",
      body: JSON.stringify({
        order: prepared.message,
        signature,
      }),
    },
    args.sellerToken
  );
  const published = await waitForSellerOrder(args.baseUrl, args.listingId, args.chainKey);
  console.log("Published seller order:", published.orderHash);
  return published;
}

async function acceptOrder(args: {
  baseUrl: string;
  chainKey: string;
  listingId: string;
  buyerWallet: any;
  buyerToken: string;
  permitToken: any;
}) {
  const prepared = await fetchJson<BuyerAcceptancePrepareResponse>(
    args.baseUrl,
    `/listings/${args.listingId}/settlement/acceptance/prepare?chainKey=${args.chainKey}`,
    { method: "POST", body: JSON.stringify({}) },
    args.buyerToken
  );

  const buyerSignature = await args.buyerWallet.signTypedData(prepared.domain, prepared.types, prepared.message);
  const permitNonce = await args.permitToken.nonces(args.buyerWallet.address);
  const permitSignature = await args.buyerWallet.signTypedData(
    {
      name: "Seller Block USD",
      version: "1",
      chainId: 11155111,
      verifyingContract: await args.permitToken.getAddress(),
    },
    {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    {
      owner: args.buyerWallet.address,
      spender: requireEnv("MARKETPLACE_SETTLEMENT_ADDRESS_SMOKE"),
      value: BigInt(prepared.order.price),
      nonce: permitNonce,
      deadline: BigInt(prepared.message.deadline),
    }
  );

  const parsedPermit = Signature.from(permitSignature);
  const relayed = await fetchJson<RelayAcceptResponse>(
    args.baseUrl,
    `/listings/${args.listingId}/settlement/accept?chainKey=${args.chainKey}`,
    {
      method: "POST",
      body: JSON.stringify({
        orderHash: prepared.orderHash,
        buyerDeadline: prepared.message.deadline,
        buyerSignature,
        permit: {
          deadline: prepared.message.deadline,
          v: parsedPermit.v,
          r: parsedPermit.r,
          s: parsedPermit.s,
        },
      }),
    },
    args.buyerToken
  );
  console.log("Accepted order:", relayed.orderHash, "escrow:", relayed.escrowId, "tx:", relayed.txHash);
  return relayed;
}

async function relayEscrowAction(args: {
  baseUrl: string;
  chainKey: string;
  listingId: string;
  buyerWallet: any;
  buyerToken: string;
  path: "confirm" | "refund";
}) {
  const prepared = await fetchJson<EscrowActionPrepareResponse>(
    args.baseUrl,
    `/listings/${args.listingId}/settlement/${args.path}/prepare?chainKey=${args.chainKey}`,
    { method: "POST", body: JSON.stringify({}) },
    args.buyerToken
  );

  const buyerSignature = await args.buyerWallet.signTypedData(prepared.domain, prepared.types, prepared.message);
  const relayed = await fetchJson<RelayEscrowActionResponse>(
    args.baseUrl,
    `/listings/${args.listingId}/settlement/${args.path}?chainKey=${args.chainKey}`,
    {
      method: "POST",
      body: JSON.stringify({
        orderHash: prepared.orderHash,
        deadline: prepared.message.deadline,
        buyerSignature,
      }),
    },
    args.buyerToken
  );
  console.log(`${args.path} relayed:`, relayed.escrowId, relayed.txHash);
  return relayed;
}

async function main() {
  const { ethers } = await network.connect();
  const sellerPrivateKey = `0x${requireEnv("PRIVATE_KEY").replace(/^0x/, "")}`;
  const sellerWallet = new ethers.Wallet(sellerPrivateKey, new ethers.JsonRpcProvider(requireEnv("SEPOLIA_RPC_URL")));
  const backendUrl = (process.env.SMOKE_BACKEND_URL?.trim() || "http://127.0.0.1:4000").replace(/\/$/, "");
  const chainKey = "sepolia";
  const registryAddress = ethers.getAddress(requireEnv("REGISTRY_ADDRESS"));
  const settlementAddress = ethers.getAddress(process.env.MARKETPLACE_SETTLEMENT_ADDRESS_SMOKE?.trim() || "0x36c40B5c2cdA7096968CDD43aa6b9C6406f09ceC");
  process.env.MARKETPLACE_SETTLEMENT_ADDRESS_SMOKE = settlementAddress;
  const permitTokenAddress = ethers.getAddress(JSON.parse(readFileSync(join(process.cwd(), "deployments", "permit-token.sepolia.json"), "utf8")).token.address);

  const registry = await ethers.getContractAt("MarketplaceRegistry", registryAddress, sellerWallet);
  const settlement = await ethers.getContractAt("MarketplaceSettlementV2", settlementAddress, sellerWallet);
  const permitToken = await ethers.getContractAt("ERC20PermitMock", permitTokenAddress, sellerWallet);

  await ensureRelayerFunded(ethers, sellerWallet);

  const buyerWallet = ethers.Wallet.createRandom().connect(sellerWallet.provider);
  console.log("Buyer wallet:", buyerWallet.address);

  const mintTx = await permitToken.mint(buyerWallet.address, CONFIRM_PRICE + REFUND_PRICE + 1_000_000n);
  await mintTx.wait();
  console.log("Minted SBUSD to buyer");

  const sellerToken = await authenticate(backendUrl, sellerWallet);
  const buyerToken = await authenticate(backendUrl, buyerWallet);

  const confirmListingId = await createListing({
    ethers,
    registry,
    seller: sellerWallet,
    metadataURI: `ipfs://seller-block/smoke-confirm-${Date.now()}`,
    price: CONFIRM_PRICE,
    tokenAddress: permitTokenAddress,
  });

  await waitForListing(backendUrl, confirmListingId, chainKey);
  await publishSellerOrder({
    baseUrl: backendUrl,
    chainKey,
    listingId: confirmListingId,
    sellerWallet,
    sellerToken,
  });
  const confirmAccept = await acceptOrder({
    baseUrl: backendUrl,
    chainKey,
    listingId: confirmListingId,
    buyerWallet,
    buyerToken,
    permitToken,
  });
  await sellerWallet.provider.waitForTransaction(confirmAccept.txHash);
  const confirmAction = await relayEscrowAction({
    baseUrl: backendUrl,
    chainKey,
    listingId: confirmListingId,
    buyerWallet,
    buyerToken,
    path: "confirm",
  });
  await sellerWallet.provider.waitForTransaction(confirmAction.txHash);
  const confirmEscrow = await settlement.escrows(confirmAccept.escrowId);
  console.log("Confirm escrow status:", confirmEscrow.status.toString());

  const refundListingId = await createListing({
    ethers,
    registry,
    seller: sellerWallet,
    metadataURI: `ipfs://seller-block/smoke-refund-${Date.now()}`,
    price: REFUND_PRICE,
    tokenAddress: permitTokenAddress,
  });

  await waitForListing(backendUrl, refundListingId, chainKey);
  await publishSellerOrder({
    baseUrl: backendUrl,
    chainKey,
    listingId: refundListingId,
    sellerWallet,
    sellerToken,
  });
  const refundAccept = await acceptOrder({
    baseUrl: backendUrl,
    chainKey,
    listingId: refundListingId,
    buyerWallet,
    buyerToken,
    permitToken,
  });
  await sellerWallet.provider.waitForTransaction(refundAccept.txHash);
  const refundAction = await relayEscrowAction({
    baseUrl: backendUrl,
    chainKey,
    listingId: refundListingId,
    buyerWallet,
    buyerToken,
    path: "refund",
  });
  await sellerWallet.provider.waitForTransaction(refundAction.txHash);
  const refundEscrow = await settlement.escrows(refundAccept.escrowId);
  console.log("Refund escrow status:", refundEscrow.status.toString());

  console.log("SMOKE_OK", JSON.stringify({
    permitToken: permitTokenAddress,
    buyer: buyerWallet.address,
    confirm: {
      listingId: confirmListingId,
      acceptTxHash: confirmAccept.txHash,
      confirmTxHash: confirmAction.txHash,
      escrowId: confirmAccept.escrowId,
      status: confirmEscrow.status.toString(),
    },
    refund: {
      listingId: refundListingId,
      acceptTxHash: refundAccept.txHash,
      refundTxHash: refundAction.txHash,
      escrowId: refundAccept.escrowId,
      status: refundEscrow.status.toString(),
    },
  }));
}

main().catch((err) => {
  console.error("Settlement V2 smoke failed:", err);
  process.exitCode = 1;
});