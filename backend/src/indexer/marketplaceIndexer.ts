import { ZeroAddress } from "ethers";
import type { SupportedChainConfig } from "../config/env";
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
import { isTransientRpcError, rpcErrorHint } from "../utils/rpc";

const CONFIRMATIONS = 3;

export type MarketplaceIndexerStatus = {
  chainKey: string;
  chainId: number;
  running: boolean;
  stopped: boolean;
  failureCount: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastError?: string;
  lastHint?: string;
  nextRetryMs?: number;
};

function backoffMs(baseMs: number, failures: number): number {
  const cappedFailures = Math.min(Math.max(failures, 0), 8);
  const maxMs = Math.max(baseMs, 5 * 60_000);
  const exp = Math.min(maxMs, baseMs * Math.pow(2, cappedFailures));
  // +/- 20% jitter
  const jitter = exp * 0.2 * (Math.random() * 2 - 1);
  return Math.max(baseMs, Math.round(exp + jitter));
}

export function startMarketplaceIndexer(chainConfig?: SupportedChainConfig) {
  const { env, db, logger, getProviderForChain, getSupportedChain } = getContext();
  const chain = getSupportedChain(chainConfig?.key);
  const provider = getProviderForChain(chain.key);

  if (!env.indexerEnabled) {
    logger.info({ enabled: env.indexerEnabled }, "marketplace indexer disabled");
    return {
      stop() {},
      getStatus() {
        return {
          chainKey: chain.key,
          chainId: chain.chainId,
          running: false,
          stopped: false,
          failureCount: 0,
        } satisfies MarketplaceIndexerStatus;
      },
    };
  }

  const iface = getRegistryInterface();
  const checkpointKey = `chain:${chain.chainId}:registry:${chain.marketplaceRegistryAddress}:lastProcessedBlock`;

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
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let failureCount = 0;
  const status: MarketplaceIndexerStatus = {
    chainKey: chain.key,
    chainId: chain.chainId,
    running: false,
    stopped: false,
    failureCount: 0,
  };

  async function ensureListingExists(listingId: string, createdAt: number, blockNumber: number) {
    const existing = await findListing(db, listingId, chain.key);
    if (existing) return;
    const listing = await fetchListingFromChain(provider, chain.marketplaceRegistryAddress, listingId);
    await upsertListing(db, {
      chainKey: chain.key,
      chainId: chain.chainId,
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

  function scheduleNext(delayMs: number) {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void tick(), delayMs);
  }

  async function tick() {
    if (stopped) return;
    if (running) return;
    running = true;
    status.running = true;

    let nextDelayMs = env.indexerPollMs;
    try {
      const latest = await provider.getBlockNumber();
      const target = Math.max(0, latest - CONFIRMATIONS);

      const checkpoint = await getCheckpoint(db, checkpointKey);
      const lastProcessed = checkpoint ?? ((chain.startBlock ?? 0) - 1);

      let fromBlock = lastProcessed + 1;
      if (fromBlock > target) return;

      while (fromBlock <= target) {
        const toBlock = Math.min(target, fromBlock + env.indexerChunkSize - 1);

        const logs = await provider.getLogs({
          address: chain.marketplaceRegistryAddress,
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

              await upsertListing(db, {
                chainKey: chain.key,
                chainId: chain.chainId,
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
              await setListingActive(db, id, chain.key, 0);
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
                const listing = await fetchListingFromChain(provider, chain.marketplaceRegistryAddress, listingId);
                endTime = listing.endTime ?? 0;
              } catch {
                // ignore
              }

              await upsertAuction(db, {
                chainKey: chain.key,
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
              await updateAuctionBid(db, listingId, chain.key, bidder, amount);
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
                const listing = await fetchListingFromChain(provider, chain.marketplaceRegistryAddress, listingId);
                endTime = listing.endTime ?? 0;
              } catch {
                // ignore
              }

              await upsertAuction(db, {
                chainKey: chain.key,
                listingId,
                highestBid: amount.toString(),
                highestBidder: winner,
                endTime,
              });
              await setListingActive(db, listingId, chain.key, 0);
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
                const listing = await fetchListingFromChain(provider, chain.marketplaceRegistryAddress, listingId);
                endTime = listing.endTime ?? 0;
              } catch {
                // ignore
              }

              await upsertRaffle(db, {
                chainKey: chain.key,
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
                await incrementRaffleTickets(db, listingId, chain.key, tickets);
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
              await setListingActive(db, listingId, chain.key, 0);
              break;
            }
            default:
              break;
          }
        }

        await setCheckpoint(db, checkpointKey, toBlock);
        fromBlock = toBlock + 1;
      }

      failureCount = 0;
      status.failureCount = 0;
      status.lastSuccessAt = Date.now();
      status.lastError = undefined;
      status.lastHint = undefined;
      status.nextRetryMs = nextDelayMs;
    } catch (e: any) {
      failureCount += 1;
      const transient = isTransientRpcError(e);
      const hint = rpcErrorHint(e);
      nextDelayMs = transient ? backoffMs(env.indexerPollMs, failureCount) : env.indexerPollMs;
      status.failureCount = failureCount;
      status.lastFailureAt = Date.now();
      status.lastError = e?.shortMessage ?? e?.message ?? String(e);
      status.lastHint = hint;
      status.nextRetryMs = nextDelayMs;
      logger.error(
        {
          err: e,
          transient,
          failureCount,
          nextRetryMs: nextDelayMs,
          hint,
        },
        "indexer tick failed"
      );
    } finally {
      running = false;
      status.running = false;
      scheduleNext(nextDelayMs);
    }
  }

  logger.info(
    {
      chainKey: chain.key,
      chainName: chain.name,
      chainId: chain.chainId,
      address: chain.marketplaceRegistryAddress,
      pollMs: env.indexerPollMs,
      chunkSize: env.indexerChunkSize,
      startBlock: chain.startBlock,
      rpcFallbackConfigured: Boolean(chain.rpcFallbackUrl),
    },
    "marketplace indexer started"
  );

  // Fire immediately then self-schedule (with adaptive backoff on failures).
  tick().catch(() => undefined);

  return {
    stop() {
      stopped = true;
      status.stopped = true;
      status.running = false;
      if (timer) clearTimeout(timer);
    },
    getStatus() {
      return { ...status };
    },
  };
}
