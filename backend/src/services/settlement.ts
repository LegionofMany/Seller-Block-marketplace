import {
  Contract,
  TypedDataEncoder,
  Wallet,
  ZeroAddress,
  getAddress,
  keccak256,
  toUtf8Bytes,
  verifyTypedData,
} from "ethers";
import type { TypedDataField } from "ethers";

import { HttpError } from "../middlewares/errors";
import { getContext } from "./context";
import type { ListingOrderIntentRow, ListingRow } from "./db";

export type SettlementOrder = {
  seller: string;
  listingId: string;
  token: string;
  price: string;
  expiry: number;
  nonce: string;
  termsHash: string;
};

export type PermitParams = {
  deadline: number;
  v: number;
  r: string;
  s: string;
};

export const settlementOrderTypes: Record<string, TypedDataField[]> = {
  Order: [
    { name: "seller", type: "address" },
    { name: "listingId", type: "bytes32" },
    { name: "token", type: "address" },
    { name: "price", type: "uint256" },
    { name: "expiry", type: "uint64" },
    { name: "nonce", type: "uint256" },
    { name: "termsHash", type: "bytes32" },
  ],
};

export const buyerAcceptanceTypes: Record<string, TypedDataField[]> = {
  BuyerAcceptance: [
    { name: "orderHash", type: "bytes32" },
    { name: "buyer", type: "address" },
    { name: "deadline", type: "uint64" },
  ],
};

export const escrowActionTypes: Record<string, TypedDataField[]> = {
  EscrowAction: [
    { name: "escrowId", type: "bytes32" },
    { name: "buyer", type: "address" },
    { name: "action", type: "uint8" },
    { name: "deadline", type: "uint64" },
  ],
};

export const ESCROW_ACTION_CONFIRM_DELIVERY = 0;
export const ESCROW_ACTION_REQUEST_REFUND = 1;

const settlementAbi = [
  "function computeEscrowId(bytes32 orderHash,address buyer) view returns (bytes32)",
  "function acceptOrderWithPermit((address seller,bytes32 listingId,address token,uint256 price,uint64 expiry,uint256 nonce,bytes32 termsHash),address buyer,uint64 buyerDeadline,bytes sellerSignature,bytes buyerSignature,(uint256 deadline,uint8 v,bytes32 r,bytes32 s)) returns (bytes32)",
  "function confirmDeliveryBySig(bytes32 escrowId,uint64 deadline,bytes buyerSignature)",
  "function requestRefundBySig(bytes32 escrowId,uint64 deadline,bytes buyerSignature)",
] as const;

export function requireSettlementChain(chainKey?: string | null) {
  const { getSupportedChain } = getContext();
  const chain = getSupportedChain(chainKey);
  if (!chain.marketplaceSettlementV2Address) {
    throw new HttpError(503, `MarketplaceSettlementV2 is not configured for chain ${chain.key}`);
  }
  return chain;
}

export async function getSettlementDomain(chainKey?: string | null) {
  const { getProviderForChain } = getContext();
  const chain = requireSettlementChain(chainKey);
  const provider = getProviderForChain(chain.key);
  const network = await provider.getNetwork();
  return {
    name: "MarketplaceSettlementV2",
    version: "1",
    chainId: Number(network.chainId),
    verifyingContract: chain.marketplaceSettlementV2Address as string,
  };
}

export function buildTermsHash(listing: ListingRow, chainKey: string) {
  return keccak256(
    toUtf8Bytes(
      JSON.stringify({
        chainKey,
        listingId: listing.id,
        metadataURI: listing.metadataURI,
        price: listing.price,
        token: listing.token,
        saleType: listing.saleType,
      })
    )
  );
}

export function buildSettlementOrder(listing: ListingRow, seller: string, expiry: number, nonce: string): SettlementOrder {
  return {
    seller: getAddress(seller),
    listingId: listing.id,
    token: getAddress(listing.token),
    price: listing.price,
    expiry,
    nonce,
    termsHash: buildTermsHash(listing, listing.chainKey),
  };
}

export async function hashOrder(order: SettlementOrder, chainKey?: string | null) {
  const domain = await getSettlementDomain(chainKey);
  return TypedDataEncoder.hash(domain, settlementOrderTypes, {
    ...order,
    price: BigInt(order.price),
    expiry: BigInt(order.expiry),
    nonce: BigInt(order.nonce),
  });
}

export async function verifySellerOrderSignature(order: SettlementOrder, signature: string, chainKey?: string | null) {
  const domain = await getSettlementDomain(chainKey);
  const recovered = verifyTypedData(
    domain,
    settlementOrderTypes,
    {
      ...order,
      price: BigInt(order.price),
      expiry: BigInt(order.expiry),
      nonce: BigInt(order.nonce),
    },
    signature
  );
  return getAddress(recovered);
}

export function orderFromIntentRow(row: ListingOrderIntentRow): SettlementOrder {
  return {
    seller: row.seller,
    listingId: row.listingId,
    token: row.token,
    price: row.price,
    expiry: row.expiry,
    nonce: row.nonce,
    termsHash: row.termsHash,
  };
}

export async function computeEscrowId(orderHash: string, buyer: string, chainKey?: string | null) {
  const { getProviderForChain } = getContext();
  const chain = requireSettlementChain(chainKey);
  const provider = getProviderForChain(chain.key);
  const contract = new Contract(chain.marketplaceSettlementV2Address as string, settlementAbi, provider);
  return String(await (contract as any).computeEscrowId(orderHash, getAddress(buyer)));
}

function getRelayerSigner(chainKey?: string | null) {
  const { env, getProviderForChain } = getContext();
  if (!env.relayerPrivateKey) {
    throw new HttpError(503, "RELAYER_PRIVATE_KEY is not configured");
  }
  const chain = requireSettlementChain(chainKey);
  const provider = getProviderForChain(chain.key);
  return {
    chain,
    signer: new Wallet(env.relayerPrivateKey, provider),
  };
}

export async function relayAcceptOrderWithPermit(args: {
  chainKey: string;
  order: SettlementOrder;
  buyer: string;
  buyerDeadline: number;
  sellerSignature: string;
  buyerSignature: string;
  permit: PermitParams;
}) {
  const { chain, signer } = getRelayerSigner(args.chainKey);
  if (args.order.token === ZeroAddress) {
    throw new HttpError(400, "Gasless acceptance currently requires an ERC20 permit-enabled token");
  }
  const contract = new Contract(chain.marketplaceSettlementV2Address as string, settlementAbi, signer);
  const tx = await (contract as any).acceptOrderWithPermit(
    {
      seller: args.order.seller,
      listingId: args.order.listingId,
      token: args.order.token,
      price: BigInt(args.order.price),
      expiry: BigInt(args.order.expiry),
      nonce: BigInt(args.order.nonce),
      termsHash: args.order.termsHash,
    },
    getAddress(args.buyer),
    BigInt(args.buyerDeadline),
    args.sellerSignature,
    args.buyerSignature,
    {
      deadline: BigInt(args.permit.deadline),
      v: args.permit.v,
      r: args.permit.r,
      s: args.permit.s,
    }
  );
  const orderHash = await hashOrder(args.order, args.chainKey);
  const escrowId = await computeEscrowId(orderHash, args.buyer, args.chainKey);
  return { txHash: String(tx.hash), escrowId, orderHash };
}

export async function relayConfirmDelivery(args: {
  chainKey: string;
  escrowId: string;
  deadline: number;
  buyerSignature: string;
}) {
  const { chain, signer } = getRelayerSigner(args.chainKey);
  const contract = new Contract(chain.marketplaceSettlementV2Address as string, settlementAbi, signer);
  const tx = await (contract as any).confirmDeliveryBySig(args.escrowId, BigInt(args.deadline), args.buyerSignature);
  return { txHash: String(tx.hash) };
}

export async function relayRequestRefund(args: {
  chainKey: string;
  escrowId: string;
  deadline: number;
  buyerSignature: string;
}) {
  const { chain, signer } = getRelayerSigner(args.chainKey);
  const contract = new Contract(chain.marketplaceSettlementV2Address as string, settlementAbi, signer);
  const tx = await (contract as any).requestRefundBySig(args.escrowId, BigInt(args.deadline), args.buyerSignature);
  return { txHash: String(tx.hash) };
}