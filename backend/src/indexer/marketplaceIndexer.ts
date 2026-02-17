import { ZeroAddress } from "ethers";
import { getContext } from "../services/context";
import {
  findListing,
  getCheckpoint,
  incrementRaffleTickets,
  setCheckpoint,
  setListingActive,
  upsertAuction,
  upsertListing,
  upsertRaffle,
  updateAuctionBid,
} from "../services/db";
import { fetchListingFromChain, getRegistryInterface } from "../services/blockchain";

const CONFIRMATIONS = 3;

export function startMarketplaceIndexer() {
  const { env, db, provider, logger } = getContext();

  const iface = getRegistryInterface();
  const checkpointKey = `registry:${env.marketplaceRegistryAddress}:lastProcessedBlock`;

  const events = [
    "ListingCreated",
    "ListingCancelled",
    "AuctionOpened",
    "BidPlaced",
    "AuctionClosed",
    "RaffleOpened",
    "RaffleEntered",
    "WinnerSelected",
  ] as const;

  const topic0 = events.map((name) => {
    const ev = iface.getEvent(name);
    if (!ev) throw new Error(`Missing ${name} event in ABI`);
    return ev.topicHash;
  });

  let running = false;

  async function ensureListingExists(listingId: string, createdAt: number, blockNumber: number) {
    const existing = findListing(db, listingId);
    if (existing) return;
    const listing = await fetchListingFromChain(provider, env.marketplaceRegistryAddress, listingId);
    upsertListing(db, {
      id: listingId,
      seller: listing.seller,
      metadataURI: listing.metadataURI,
      price: listing.price.toString(),
      token: listing.token,
      saleType: listing.saleType,
      active: listing.active ? 1 : 0,
      createdAt,
      blockNumber,
    });
  }

  async function tick() {
    if (running) return;
    running = true;

    try {
      const latest = await provider.getBlockNumber();
      const target = Math.max(0, latest - CONFIRMATIONS);

      const checkpoint = getCheckpoint(db, checkpointKey);
      const lastProcessed = checkpoint ?? ((env.startBlock ?? 0) - 1);

      let fromBlock = lastProcessed + 1;
      if (fromBlock > target) return;

      while (fromBlock <= target) {
        const toBlock = Math.min(target, fromBlock + env.indexerChunkSize - 1);

        const logs = await provider.getLogs({
          address: env.marketplaceRegistryAddress,
          fromBlock,
          toBlock,
          topics: [topic0],
        });

        logs.sort((a, b) => (a.blockNumber - b.blockNumber) || (a.index - b.index));

        const tsCache = new Map<number, number>();
        async function blockTsMs(blockNumber: number) {
          const cached = tsCache.get(blockNumber);
          if (cached) return cached;
          const block = await provider.getBlock(blockNumber);
          const ms = Number(block?.timestamp ?? 0) * 1000;
          tsCache.set(blockNumber, ms);
          return ms;
        }

        for (const log of logs) {
          let parsed: any;
          try {
            parsed = iface.parseLog(log);
          } catch {
            continue;
          }
          if (!parsed) continue;

          const createdAt = await blockTsMs(log.blockNumber);

          switch (parsed.name) {
            case "ListingCreated": {
              const id = String(parsed.args.id).toLowerCase();
              const seller = String(parsed.args.seller);
              const saleType = Number(parsed.args.saleType);
              const token = String(parsed.args.token);
              const price = BigInt(parsed.args.price);
              const metadataURI = String(parsed.args.metadataURI);

              upsertListing(db, {
                id,
                seller,
                metadataURI,
                price: price.toString(),
                token,
                saleType,
                active: 1,
                createdAt,
                blockNumber: log.blockNumber,
              });
              break;
            }
            case "ListingCancelled": {
              const id = String(parsed.args.id).toLowerCase();
              setListingActive(db, id, 0);
              break;
            }
            case "AuctionOpened": {
              const listingId = String(parsed.args.listingId).toLowerCase();
              try {
                await ensureListingExists(listingId, createdAt, log.blockNumber);
              } catch {
                // ignore
              }
              // Best-effort endTime from chain listing struct.
              let endTime = 0;
              try {
                const listing = await fetchListingFromChain(provider, env.marketplaceRegistryAddress, listingId);
                endTime = listing.endTime ?? 0;
              } catch {
                // ignore
              }

              upsertAuction(db, {
                listingId,
                highestBid: "0",
                highestBidder: ZeroAddress,
                endTime,
              });
              break;
            }
            case "BidPlaced": {
              const listingId = String(parsed.args.listingId).toLowerCase();
              const bidder = String(parsed.args.bidder);
              const amount = BigInt(parsed.args.amount);
              try {
                await ensureListingExists(listingId, createdAt, log.blockNumber);
              } catch {
                // ignore
              }
              updateAuctionBid(db, listingId, bidder, amount);
              break;
            }
            case "AuctionClosed": {
              const listingId = String(parsed.args.listingId).toLowerCase();
              const winner = String(parsed.args.winner);
              const amount = BigInt(parsed.args.amount);

              try {
                await ensureListingExists(listingId, createdAt, log.blockNumber);
              } catch {
                // ignore
              }

              // Preserve endTime if we have it; otherwise fetch.
              let endTime = 0;
              try {
                const listing = await fetchListingFromChain(provider, env.marketplaceRegistryAddress, listingId);
                endTime = listing.endTime ?? 0;
              } catch {
                // ignore
              }

              upsertAuction(db, {
                listingId,
                highestBid: amount.toString(),
                highestBidder: winner,
                endTime,
              });
              setListingActive(db, listingId, 0);
              break;
            }
            case "RaffleOpened": {
              const listingId = String(parsed.args.listingId).toLowerCase();
              try {
                await ensureListingExists(listingId, createdAt, log.blockNumber);
              } catch {
                // ignore
              }
              let endTime = 0;
              try {
                const listing = await fetchListingFromChain(provider, env.marketplaceRegistryAddress, listingId);
                endTime = listing.endTime ?? 0;
              } catch {
                // ignore
              }

              upsertRaffle(db, {
                listingId,
                ticketsSold: 0,
                endTime,
              });
              break;
            }
            case "RaffleEntered": {
              const listingId = String(parsed.args.listingId).toLowerCase();
              const tickets = Number(parsed.args.tickets);
              try {
                await ensureListingExists(listingId, createdAt, log.blockNumber);
              } catch {
                // ignore
              }
              if (Number.isFinite(tickets) && tickets > 0) {
                incrementRaffleTickets(db, listingId, tickets);
              }
              break;
            }
            case "WinnerSelected": {
              const listingId = String(parsed.args.listingId).toLowerCase();
              try {
                await ensureListingExists(listingId, createdAt, log.blockNumber);
              } catch {
                // ignore
              }
              setListingActive(db, listingId, 0);
              break;
            }
            default:
              break;
          }
        }

        setCheckpoint(db, checkpointKey, toBlock);
        fromBlock = toBlock + 1;
      }
    } catch (e: any) {
      logger.error({ err: e }, "indexer tick failed");
    } finally {
      running = false;
    }
  }

  logger.info(
    {
      address: env.marketplaceRegistryAddress,
      pollMs: env.indexerPollMs,
      chunkSize: env.indexerChunkSize,
      startBlock: env.startBlock,
    },
    "marketplace indexer started"
  );

  // Fire immediately then poll.
  tick().catch(() => undefined);
  const timer = setInterval(() => void tick(), env.indexerPollMs);

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
