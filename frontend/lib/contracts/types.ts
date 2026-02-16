import { type Address, type Hex, zeroAddress } from "viem";

export type SaleType = 0 | 1 | 2; // FixedPrice, Auction, Raffle
export type ListingStatus = 0 | 1 | 2 | 3 | 4 | 5 | 6; // None..Refunded

export type Listing = {
  seller: Address;
  buyer: Address;
  saleType: SaleType;
  status: ListingStatus;
  metadataURI: string;
  price: bigint;
  token: Address;
  moduleId: Hex;
  escrowId: Hex;
  startTime: bigint;
  endTime: bigint;
  raffleCommit: Hex;
};

export function isNativeToken(token: Address) {
  return token.toLowerCase() === zeroAddress;
}

export function saleTypeLabel(saleType: SaleType) {
  if (saleType === 0) return "Fixed Price";
  if (saleType === 1) return "Auction";
  return "Raffle";
}

export function statusLabel(status: ListingStatus) {
  switch (status) {
    case 0:
      return "None";
    case 1:
      return "Active";
    case 2:
      return "Cancelled";
    case 3:
      return "Expired";
    case 4:
      return "Pending Delivery";
    case 5:
      return "Completed";
    case 6:
      return "Refunded";
    default:
      return "Unknown";
  }
}
