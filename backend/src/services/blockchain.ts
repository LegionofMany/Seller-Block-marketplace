import { AbstractProvider, Contract, FallbackProvider, Interface, JsonRpcProvider, getAddress, isHexString } from "ethers";

export type ProtocolAddresses = {
  escrowVault: string;
  auctionModule: string;
  raffleModule: string;
};

const registryAbi = [
  "function escrowVault() view returns (address)",
  "function auctionModule() view returns (address)",
  "function raffleModule() view returns (address)",
  "function listings(bytes32) view returns (tuple(address seller,address buyer,uint8 saleType,uint8 status,string metadataURI,uint256 price,address token,bytes32 moduleId,bytes32 escrowId,uint64 startTime,uint64 endTime,bytes32 raffleCommit))",
  "event ListingCreated(bytes32 indexed id, address seller, uint8 saleType, address token, uint256 price, string metadataURI)",
  "event ListingCancelled(bytes32 indexed id)",
  "event AuctionOpened(bytes32 indexed listingId, bytes32 indexed auctionId)",
  "event BidPlaced(bytes32 indexed listingId, bytes32 indexed auctionId, address bidder, uint256 amount)",
  "event AuctionClosed(bytes32 indexed listingId, bytes32 indexed auctionId, address winner, uint256 amount, bool successful)",
  "event RaffleOpened(bytes32 indexed listingId, bytes32 indexed raffleId)",
  "event RaffleEntered(bytes32 indexed listingId, bytes32 indexed raffleId, address buyer, uint256 tickets, uint256 amount)",
  "event WinnerSelected(bytes32 indexed listingId, bytes32 indexed raffleId, address winner, uint256 raised)",
] as const;

const auctionAbi = [
  "function getOutcome(bytes32) view returns (address winner, uint256 winningBid, address token, bool closed, bool canceled, bool proceedsClaimed)",
] as const;

const raffleAbi = [
  "function quoteEntry(bytes32 raffleId, uint32 ticketCount) view returns (uint256 amount)",
] as const;

let providerSingleton: AbstractProvider | null = null;
let protocolAddrCache: { value: ProtocolAddresses; fetchedAt: number } | null = null;

export function getProvider(rpcUrl: string | Array<string | undefined>) {
  if (providerSingleton) return providerSingleton;

  const urls = (Array.isArray(rpcUrl) ? rpcUrl : [rpcUrl]).filter((u): u is string => Boolean(u && u.trim().length));
  if (urls.length === 0) throw new Error("Missing RPC URL");

  if (urls.length === 1) {
    providerSingleton = new JsonRpcProvider(urls[0]);
    return providerSingleton;
  }

  const providers = urls.map((u) => new JsonRpcProvider(u));
  providerSingleton = new FallbackProvider(
    providers.map((p, i) => ({ provider: p, priority: i + 1, stallTimeout: 2_500, weight: 1 }))
  );
  return providerSingleton;
}

export function getRegistryContract(provider: AbstractProvider, registryAddress: string) {
  return new Contract(registryAddress, registryAbi, provider);
}

export function getAuctionContract(provider: AbstractProvider, auctionAddress: string) {
  return new Contract(auctionAddress, auctionAbi, provider);
}

export function getRaffleContract(provider: AbstractProvider, raffleAddress: string) {
  return new Contract(raffleAddress, raffleAbi, provider);
}

export function getRegistryInterface() {
  return new Interface(registryAbi);
}

export async function getProtocolAddresses(
  provider: AbstractProvider,
  registryAddress: string,
  cacheMs: number
): Promise<ProtocolAddresses> {
  const now = Date.now();
  if (protocolAddrCache && now - protocolAddrCache.fetchedAt < cacheMs) return protocolAddrCache.value;

  const registry = getRegistryContract(provider, registryAddress);
  const [escrowVault, auctionModule, raffleModule] = await Promise.all([
    (registry as any).escrowVault(),
    (registry as any).auctionModule(),
    (registry as any).raffleModule(),
  ]);

  const value = {
    escrowVault: getAddress(escrowVault),
    auctionModule: getAddress(auctionModule),
    raffleModule: getAddress(raffleModule),
  };

  protocolAddrCache = { value, fetchedAt: now };
  return value;
}

export function isBytes32(value: string) {
  return isHexString(value, 32);
}

export function normalizeAddress(value: string) {
  return getAddress(value);
}

export async function fetchListingFromChain(
  provider: AbstractProvider,
  registryAddress: string,
  listingId: string
) {
  const registry = getRegistryContract(provider, registryAddress);
  const raw = await (registry as any).listings(listingId);

  // ethers v6 returns a Result that behaves like both array + object
  const seller = getAddress(raw.seller);
  const metadataURI = String(raw.metadataURI);
  const price = BigInt(raw.price);
  const token = getAddress(raw.token);
  const saleType = Number(raw.saleType);
  const active = Number(raw.status) === 1; // Active
  const endTime = Number(raw.endTime);
  const moduleId = String(raw.moduleId);

  return { seller, metadataURI, price, token, saleType, active, endTime, moduleId };
}
