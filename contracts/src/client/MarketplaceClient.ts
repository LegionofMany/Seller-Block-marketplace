import { Interface, type ContractRunner } from "ethers";

import { MarketplaceRegistry__factory } from "../../types/ethers-contracts/factories/MarketplaceRegistry.sol/MarketplaceRegistry__factory.js";
import { AuctionModule__factory } from "../../types/ethers-contracts/factories/AuctionModule.sol/AuctionModule__factory.js";
import { RaffleModule__factory } from "../../types/ethers-contracts/factories/RaffleModule.sol/RaffleModule__factory.js";
import { EscrowVault__factory } from "../../types/ethers-contracts/factories/EscrowVault.sol/EscrowVault__factory.js";

import type { MarketplaceRegistry } from "../../types/ethers-contracts/MarketplaceRegistry.sol/MarketplaceRegistry.js";

import { applyGasBuffer, type GasBufferOptions } from "./gas.js";
import { decodeRevert, formatDecodedRevert } from "./errors.js";
import { assertAddress, assertBytes32, assertTimestamp, assertUint } from "./validation.js";

export type TxOptions = {
  gas?: GasBufferOptions;
  overrides?: Record<string, unknown>;
};

export class MarketplaceClient {
  readonly registry: MarketplaceRegistry;

  private readonly ifaces: Interface[];

  constructor(registry: MarketplaceRegistry) {
    this.registry = registry;
    this.ifaces = [
      this.registry.interface,
      AuctionModule__factory.createInterface(),
      RaffleModule__factory.createInterface(),
      EscrowVault__factory.createInterface(),
    ];
  }

  static connect(registryAddress: string, runner: ContractRunner): MarketplaceClient {
    assertAddress(registryAddress, "registry");
    const registry = MarketplaceRegistry__factory.connect(registryAddress, runner);
    return new MarketplaceClient(registry);
  }

  async addresses() {
    const [escrowVault, auctionModule, raffleModule, feeRecipient] = await Promise.all([
      this.registry.escrowVault(),
      this.registry.auctionModule(),
      this.registry.raffleModule(),
      this.registry.feeRecipient(),
    ]);
    return { escrowVault, auctionModule, raffleModule, feeRecipient };
  }

  async getListing(listingId: string) {
    assertBytes32(listingId, "listingId");
    return this.registry.listings(listingId);
  }

  async estimateBuyGas(listingId: string, gas: GasBufferOptions = {}) {
    assertBytes32(listingId, "listingId");
    const est = await this.registry.buy.estimateGas(listingId);
    return applyGasBuffer(est, gas);
  }

  async buy(listingId: string, opts: TxOptions = {}) {
    assertBytes32(listingId, "listingId");
    try {
      const gasLimit = await this.estimateBuyGas(listingId, opts.gas);
      return this.registry.buy(listingId, { gasLimit, ...(opts.overrides ?? {}) } as any);
    } catch (e) {
      const decoded = decodeRevert(e, this.ifaces);
      throw new Error(`buy failed: ${formatDecodedRevert(decoded)}`);
    }
  }

  async createListing(metadataURI: string, price: bigint, token: string, saleType: number, opts: TxOptions = {}) {
    if (typeof metadataURI !== "string" || metadataURI.length === 0) throw new Error("metadataURI required");
    assertUint(price, "price");
    assertAddress(token, "token");

    try {
      const est = await this.registry.createListing.estimateGas(metadataURI, price, token, saleType);
      const gasLimit = applyGasBuffer(est, opts.gas);
      return this.registry.createListing(metadataURI, price, token, saleType, { gasLimit, ...(opts.overrides ?? {}) } as any);
    } catch (e) {
      const decoded = decodeRevert(e, this.ifaces);
      throw new Error(`createListing failed: ${formatDecodedRevert(decoded)}`);
    }
  }

  async openAuction(
    listingId: string,
    startTime: number,
    endTime: number,
    reservePrice: bigint,
    minBidIncrement: bigint,
    extensionWindow: number,
    extensionSeconds: number,
    opts: TxOptions = {}
  ) {
    assertBytes32(listingId, "listingId");
    assertTimestamp(startTime, "startTime");
    assertTimestamp(endTime, "endTime");
    if (endTime <= startTime) throw new Error("endTime must be > startTime");
    assertUint(reservePrice, "reservePrice");
    assertUint(minBidIncrement, "minBidIncrement");

    try {
      const est = await this.registry.openAuction.estimateGas(
        listingId,
        startTime,
        endTime,
        reservePrice,
        minBidIncrement,
        extensionWindow,
        extensionSeconds
      );
      const gasLimit = applyGasBuffer(est, opts.gas);
      return this.registry.openAuction(
        listingId,
        startTime,
        endTime,
        reservePrice,
        minBidIncrement,
        extensionWindow,
        extensionSeconds,
        { gasLimit, ...(opts.overrides ?? {}) } as any
      );
    } catch (e) {
      const decoded = decodeRevert(e, this.ifaces);
      throw new Error(`openAuction failed: ${formatDecodedRevert(decoded)}`);
    }
  }

  async bid(listingId: string, amount: bigint, opts: TxOptions = {}) {
    assertBytes32(listingId, "listingId");
    assertUint(amount, "amount");

    try {
      const est = await this.registry.bid.estimateGas(listingId, amount, opts.overrides as any);
      const gasLimit = applyGasBuffer(est, opts.gas);
      return this.registry.bid(listingId, amount, { gasLimit, ...(opts.overrides ?? {}) } as any);
    } catch (e) {
      const decoded = decodeRevert(e, this.ifaces);
      throw new Error(`bid failed: ${formatDecodedRevert(decoded)}`);
    }
  }

  async closeAuction(listingId: string, opts: TxOptions = {}) {
    assertBytes32(listingId, "listingId");

    try {
      const est = await this.registry.closeAuction.estimateGas(listingId);
      const gasLimit = applyGasBuffer(est, opts.gas);
      return this.registry.closeAuction(listingId, { gasLimit, ...(opts.overrides ?? {}) } as any);
    } catch (e) {
      const decoded = decodeRevert(e, this.ifaces);
      throw new Error(`closeAuction failed: ${formatDecodedRevert(decoded)}`);
    }
  }

  async openRaffle(
    listingId: string,
    startTime: number,
    endTime: number,
    ticketPrice: bigint,
    targetAmount: bigint,
    minParticipants: number,
    commit: string,
    opts: TxOptions = {}
  ) {
    assertBytes32(listingId, "listingId");
    assertTimestamp(startTime, "startTime");
    assertTimestamp(endTime, "endTime");
    if (endTime <= startTime) throw new Error("endTime must be > startTime");
    assertUint(ticketPrice, "ticketPrice");
    assertUint(targetAmount, "targetAmount");
    assertBytes32(commit, "commit");

    try {
      const est = await this.registry.openRaffle.estimateGas(
        listingId,
        startTime,
        endTime,
        ticketPrice,
        targetAmount,
        minParticipants,
        commit
      );
      const gasLimit = applyGasBuffer(est, opts.gas);
      return this.registry.openRaffle(
        listingId,
        startTime,
        endTime,
        ticketPrice,
        targetAmount,
        minParticipants,
        commit,
        { gasLimit, ...(opts.overrides ?? {}) } as any
      );
    } catch (e) {
      const decoded = decodeRevert(e, this.ifaces);
      throw new Error(`openRaffle failed: ${formatDecodedRevert(decoded)}`);
    }
  }

  async enterRaffle(listingId: string, tickets: number, opts: TxOptions = {}) {
    assertBytes32(listingId, "listingId");
    if (!Number.isInteger(tickets) || tickets <= 0) throw new Error(`Invalid tickets: ${tickets}`);

    try {
      const est = await this.registry.enterRaffle.estimateGas(listingId, tickets, opts.overrides as any);
      const gasLimit = applyGasBuffer(est, opts.gas);
      return this.registry.enterRaffle(listingId, tickets, { gasLimit, ...(opts.overrides ?? {}) } as any);
    } catch (e) {
      const decoded = decodeRevert(e, this.ifaces);
      throw new Error(`enterRaffle failed: ${formatDecodedRevert(decoded)}`);
    }
  }

  async closeRaffle(listingId: string, reveal: string, opts: TxOptions = {}) {
    assertBytes32(listingId, "listingId");
    if (typeof reveal !== "string" || reveal.length === 0) throw new Error("reveal required");

    try {
      const est = await this.registry.closeRaffle.estimateGas(listingId, reveal);
      const gasLimit = applyGasBuffer(est, opts.gas);
      return this.registry.closeRaffle(listingId, reveal, { gasLimit, ...(opts.overrides ?? {}) } as any);
    } catch (e) {
      const decoded = decodeRevert(e, this.ifaces);
      throw new Error(`closeRaffle failed: ${formatDecodedRevert(decoded)}`);
    }
  }

  async confirmDelivery(listingId: string, opts: TxOptions = {}) {
    assertBytes32(listingId, "listingId");

    try {
      const est = await this.registry.confirmDelivery.estimateGas(listingId);
      const gasLimit = applyGasBuffer(est, opts.gas);
      return this.registry.confirmDelivery(listingId, { gasLimit, ...(opts.overrides ?? {}) } as any);
    } catch (e) {
      const decoded = decodeRevert(e, this.ifaces);
      throw new Error(`confirmDelivery failed: ${formatDecodedRevert(decoded)}`);
    }
  }

  async requestRefund(listingId: string, opts: TxOptions = {}) {
    assertBytes32(listingId, "listingId");

    try {
      const est = await this.registry.requestRefund.estimateGas(listingId);
      const gasLimit = applyGasBuffer(est, opts.gas);
      return this.registry.requestRefund(listingId, { gasLimit, ...(opts.overrides ?? {}) } as any);
    } catch (e) {
      const decoded = decodeRevert(e, this.ifaces);
      throw new Error(`requestRefund failed: ${formatDecodedRevert(decoded)}`);
    }
  }

  async withdrawPayout(token: string, opts: TxOptions = {}) {
    assertAddress(token, "token");

    try {
      const est = await this.registry.withdrawPayout.estimateGas(token);
      const gasLimit = applyGasBuffer(est, opts.gas);
      return this.registry.withdrawPayout(token, { gasLimit, ...(opts.overrides ?? {}) } as any);
    } catch (e) {
      const decoded = decodeRevert(e, this.ifaces);
      throw new Error(`withdrawPayout failed: ${formatDecodedRevert(decoded)}`);
    }
  }

  async withdrawAuctionRefund(listingId: string, opts: TxOptions = {}) {
    assertBytes32(listingId, "listingId");

    try {
      const est = await this.registry.withdrawAuctionRefund.estimateGas(listingId);
      const gasLimit = applyGasBuffer(est, opts.gas);
      return this.registry.withdrawAuctionRefund(listingId, { gasLimit, ...(opts.overrides ?? {}) } as any);
    } catch (e) {
      const decoded = decodeRevert(e, this.ifaces);
      throw new Error(`withdrawAuctionRefund failed: ${formatDecodedRevert(decoded)}`);
    }
  }

  async withdrawRaffleRefund(listingId: string, opts: TxOptions = {}) {
    assertBytes32(listingId, "listingId");

    try {
      const est = await this.registry.withdrawRaffleRefund.estimateGas(listingId);
      const gasLimit = applyGasBuffer(est, opts.gas);
      return this.registry.withdrawRaffleRefund(listingId, { gasLimit, ...(opts.overrides ?? {}) } as any);
    } catch (e) {
      const decoded = decodeRevert(e, this.ifaces);
      throw new Error(`withdrawRaffleRefund failed: ${formatDecodedRevert(decoded)}`);
    }
  }

  async withdrawFees(token: string, opts: TxOptions = {}) {
    assertAddress(token, "token");

    try {
      const est = await this.registry.withdrawFees.estimateGas(token);
      const gasLimit = applyGasBuffer(est, opts.gas);
      return this.registry.withdrawFees(token, { gasLimit, ...(opts.overrides ?? {}) } as any);
    } catch (e) {
      const decoded = decodeRevert(e, this.ifaces);
      throw new Error(`withdrawFees failed: ${formatDecodedRevert(decoded)}`);
    }
  }
}
