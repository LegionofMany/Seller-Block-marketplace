import { parseSignature, type Address, type Hex } from "viem";

import { fetchJson } from "./api";

export type ListingOrderIntent = {
  orderHash: Hex;
  chainKey: string;
  listingId: Hex;
  seller: Address;
  signature: Hex;
  token: Address;
  price: string;
  expiry: number;
  nonce: string;
  termsHash: Hex;
  isLatest: boolean;
  createdAt: number;
  updatedAt: number;
};

export type TypedDataEnvelope<TMessage> = {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  primaryType: string;
  types: Record<string, Array<{ name: string; type: string }>>;
  message: TMessage;
};

export type SettlementOrderMessage = {
  seller: Address;
  listingId: Hex;
  token: Address;
  price: string;
  expiry: number;
  nonce: string;
  termsHash: Hex;
};

export type BuyerAcceptanceMessage = {
  orderHash: Hex;
  buyer: Address;
  deadline: number;
};

export type EscrowActionMessage = {
  escrowId: Hex;
  buyer: Address;
  action: number;
  deadline: number;
};

function listingPath(listingId: Hex, chainKey: string, suffix = "") {
  const query = chainKey ? `?chain=${encodeURIComponent(chainKey)}` : "";
  return `/listings/${listingId}/settlement${suffix}${query}`;
}

export async function fetchLatestSellerOrder(listingId: Hex, chainKey: string) {
  return fetchJson<{ item: ListingOrderIntent | null }>(listingPath(listingId, chainKey, "/order"), { timeoutMs: 10_000 });
}

export async function prepareSellerOrder(listingId: Hex, chainKey: string, body?: { expiry?: number; nonce?: string }) {
  return fetchJson<TypedDataEnvelope<SettlementOrderMessage> & { orderHash: Hex }>(listingPath(listingId, chainKey, "/order/prepare"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    timeoutMs: 10_000,
  });
}

export async function publishSellerOrder(
  listingId: Hex,
  chainKey: string,
  order: SettlementOrderMessage,
  signature: Hex
) {
  return fetchJson<{ item: ListingOrderIntent }>(listingPath(listingId, chainKey, "/order"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order, signature }),
    timeoutMs: 10_000,
  });
}

export async function prepareBuyerAcceptance(listingId: Hex, chainKey: string, body?: { orderHash?: Hex; deadline?: number }) {
  return fetchJson<
    TypedDataEnvelope<BuyerAcceptanceMessage> & { order: SettlementOrderMessage; orderHash: Hex; sellerSignature: Hex }
  >(listingPath(listingId, chainKey, "/acceptance/prepare"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    timeoutMs: 10_000,
  });
}

export async function relayAcceptWithPermit(
  listingId: Hex,
  chainKey: string,
  body: { orderHash?: Hex; buyerDeadline: number; buyerSignature: Hex; permitSignature: Hex; permitDeadline: number }
) {
  const permit = parseSignature(body.permitSignature);
  return fetchJson<{ txHash: Hex; escrowId: Hex; orderHash: Hex }>(listingPath(listingId, chainKey, "/accept"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderHash: body.orderHash,
      buyerDeadline: body.buyerDeadline,
      buyerSignature: body.buyerSignature,
      permit: {
        deadline: body.permitDeadline,
        v: permit.v,
        r: permit.r,
        s: permit.s,
      },
    }),
    timeoutMs: 20_000,
  });
}

export async function prepareEscrowAction(
  listingId: Hex,
  chainKey: string,
  action: "confirm" | "refund",
  body?: { orderHash?: Hex; deadline?: number }
) {
  return fetchJson<TypedDataEnvelope<EscrowActionMessage> & { orderHash: Hex; escrowId: Hex }>(
    listingPath(listingId, chainKey, `/${action}/prepare`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      timeoutMs: 10_000,
    }
  );
}

export async function relayEscrowAction(
  listingId: Hex,
  chainKey: string,
  action: "confirm" | "refund",
  body: { orderHash?: Hex; deadline: number; buyerSignature: Hex }
) {
  return fetchJson<{ txHash: Hex; escrowId: Hex; orderHash: Hex }>(listingPath(listingId, chainKey, `/${action}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: 20_000,
  });
}