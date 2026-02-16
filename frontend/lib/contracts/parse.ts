import { type Address, type Hex } from "viem";
import { type Listing, type ListingStatus, type SaleType } from "./types";

export function parseListing(raw: any): Listing {
  const tuple = raw as any;
  const seller = tuple.seller ?? tuple[0];
  const buyer = tuple.buyer ?? tuple[1];
  const saleType = (tuple.saleType ?? tuple[2]) as SaleType;
  const status = (tuple.status ?? tuple[3]) as ListingStatus;
  const metadataURI = tuple.metadataURI ?? tuple[4];
  const price = tuple.price ?? tuple[5];
  const token = tuple.token ?? tuple[6];
  const moduleId = tuple.moduleId ?? tuple[7];
  const escrowId = tuple.escrowId ?? tuple[8];
  const startTime = tuple.startTime ?? tuple[9];
  const endTime = tuple.endTime ?? tuple[10];
  const raffleCommit = tuple.raffleCommit ?? tuple[11];

  return {
    seller: seller as Address,
    buyer: buyer as Address,
    saleType,
    status,
    metadataURI: metadataURI as string,
    price: price as bigint,
    token: token as Address,
    moduleId: moduleId as Hex,
    escrowId: escrowId as Hex,
    startTime: startTime as bigint,
    endTime: endTime as bigint,
    raffleCommit: raffleCommit as Hex,
  };
}
