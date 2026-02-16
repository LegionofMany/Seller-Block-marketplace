import { expect } from "chai";
import { network } from "hardhat";

/**
 * ERC20 end-to-end integration tests for the full marketplace protocol.
 * Uses ethers v6 and Hardhat v3.
 */
describe("Marketplace Protocol (ERC20 integration)", function () {
  let ethers: any;

  before(async function () {
    ({ ethers } = await network.connect({
      network: "hardhatMainnet",
      chainType: "l1",
    }));
  });

  async function mineTo(ts: number) {
    const latest = await ethers.provider.getBlock("latest");
    const next = Math.max(ts, latest.timestamp + 1);
    await ethers.provider.send("evm_setNextBlockTimestamp", [next]);
    await ethers.provider.send("evm_mine", []);
  }

  async function deployFixture() {
    const [owner, feeRecipient, seller, buyer1, buyer2, buyer3, arbiter] = await ethers.getSigners();

    const Vault = await ethers.getContractFactory("EscrowVault");
    const vault = await Vault.deploy(owner.address);

    const Auction = await ethers.getContractFactory("AuctionModule");
    const auction = await Auction.deploy(owner.address);

    const Raffle = await ethers.getContractFactory("RaffleModule");
    const raffle = await Raffle.deploy(owner.address);

    const Registry = await ethers.getContractFactory("MarketplaceRegistry");
    const registry = await Registry.deploy(owner.address, vault.target, auction.target, raffle.target, feeRecipient.address);

    await vault.connect(owner).setController(registry.target);
    await auction.connect(owner).setRegistry(registry.target);
    await raffle.connect(owner).setRegistry(registry.target);

    await registry.connect(owner).setArbiter(arbiter.address);
    await registry.connect(owner).setProtocolFeeBps(250); // 2.5%

    const Token = await ethers.getContractFactory("ERC20Mock");
    const usdc = await Token.deploy("USD Coin", "USDC", 6, buyer1.address, 0n);
    await usdc.mint(buyer2.address, 10_000_000_000n);
    await usdc.mint(buyer3.address, 10_000_000_000n);
    await usdc.mint(buyer1.address, 10_000_000_000n);

    return { owner, feeRecipient, seller, buyer1, buyer2, buyer3, arbiter, vault, auction, raffle, registry, usdc };
  }

  function listingIdFor(registry: any, nonce: bigint, seller: string, ethersAny: any) {
    return ethersAny.solidityPackedKeccak256(["address", "uint256", "address"], [registry.target, nonce, seller]);
  }

  it("Auction (ERC20): open -> multi bids -> pull refunds -> close -> escrow -> confirm -> payouts + fee", async function () {
    const { owner, feeRecipient, seller, buyer1, buyer2, buyer3, registry, auction, usdc } = await deployFixture();

    await registry.connect(seller).createListing("ipfs://meta/auc-erc20", 0n, usdc.target, 1);
    const nonce = await registry.listingNonce();
    const listingId = listingIdFor(registry, nonce, seller.address, ethers);

    const block = await ethers.provider.getBlock("latest");
    const start = block.timestamp + 10;
    const end = start + 1200;

    await registry.connect(seller).openAuction(
      listingId,
      start,
      end,
      1_000_000n, // reserve: 1 USDC
      100_000n, // min increment: 0.1 USDC
      60,
      30
    );

    // approvals go to AuctionModule, since it pulls funds.
    await usdc.connect(buyer1).approve(auction.target, 10_000_000n);
    await usdc.connect(buyer2).approve(auction.target, 10_000_000n);
    await usdc.connect(buyer3).approve(auction.target, 10_000_000n);

    await mineTo(start);

    await expect(registry.connect(buyer1).bid(listingId, 1_000_000n)).to.emit(registry, "BidPlaced");
    await expect(registry.connect(buyer2).bid(listingId, 1_200_000n)).to.emit(registry, "BidPlaced");
    await expect(registry.connect(buyer3).bid(listingId, 1_500_000n)).to.emit(registry, "BidPlaced");

    // buyer1 and buyer2 can pull-refund their outbid amounts
    const b1Before = await usdc.balanceOf(buyer1.address);
    await registry.connect(buyer1).withdrawAuctionRefund(listingId);
    const b1After = await usdc.balanceOf(buyer1.address);
    expect(b1After - b1Before).to.equal(1_000_000n);

    const b2Before = await usdc.balanceOf(buyer2.address);
    await registry.connect(buyer2).withdrawAuctionRefund(listingId);
    const b2After = await usdc.balanceOf(buyer2.address);
    expect(b2After - b2Before).to.equal(1_200_000n);

    // cannot close early
    await expect(registry.closeAuction(listingId)).to.be.revertedWithCustomError(auction, "AuctionNotEnded");

    await mineTo(end + 1);
    await expect(registry.closeAuction(listingId)).to.emit(registry, "EscrowCreated");

    const listing = await registry.listings(listingId);
    expect(listing.buyer).to.equal(buyer3.address);

    // non-buyer cannot confirm delivery
    await expect(registry.connect(buyer2).confirmDelivery(listingId)).to.be.revertedWithCustomError(registry, "NotBuyer");

    await registry.connect(buyer3).confirmDelivery(listingId);

    const price = 1_500_000n;
    const feeBps: number = await registry.protocolFeeBps();
    const fee = (price * BigInt(feeBps)) / 10_000n;
    const sellerProceeds = price - fee;

    const sellerBalBefore = await usdc.balanceOf(seller.address);
    await registry.connect(seller).withdrawPayout(usdc.target);
    const sellerBalAfter = await usdc.balanceOf(seller.address);
    expect(sellerBalAfter - sellerBalBefore).to.equal(sellerProceeds);

    const feeBalBefore = await usdc.balanceOf(feeRecipient.address);
    await registry.connect(owner).withdrawFees(usdc.target);
    const feeBalAfter = await usdc.balanceOf(feeRecipient.address);
    expect(feeBalAfter - feeBalBefore).to.equal(fee);
  });

  it("Auction (ERC20): no bids -> close results in expired listing and no escrow", async function () {
    const { seller, registry, usdc } = await deployFixture();

    await registry.connect(seller).createListing("ipfs://meta/auc-nobids", 0n, usdc.target, 1);
    const nonce = await registry.listingNonce();
    const listingId = listingIdFor(registry, nonce, seller.address, ethers);

    const block = await ethers.provider.getBlock("latest");
    const start = block.timestamp + 10;
    const end = start + 60;

    await registry.connect(seller).openAuction(listingId, start, end, 1_000_000n, 100_000n, 0, 0);

    await mineTo(end + 1);
    await registry.closeAuction(listingId);

    const listing = await registry.listings(listingId);
    expect(listing.status).to.equal(3); // Expired
    expect(listing.escrowId).to.equal(ethers.ZeroHash);
  });

  it("Raffle (ERC20): enter -> close (commit/reveal) -> winner escrow -> confirm -> payouts + fee", async function () {
    const { owner, feeRecipient, seller, buyer1, buyer2, registry, raffle, usdc } = await deployFixture();

    await registry.connect(seller).createListing("ipfs://meta/raffle-erc20", 0n, usdc.target, 2);
    const nonce = await registry.listingNonce();
    const listingId = listingIdFor(registry, nonce, seller.address, ethers);

    const block = await ethers.provider.getBlock("latest");
    const start = block.timestamp + 10;
    const end = start + 3600;

    const reveal = ethers.id("raffle-secret-erc20");
    const commit = ethers.keccak256(reveal);

    await registry.connect(seller).openRaffle(
      listingId,
      start,
      end,
      500_000n, // 0.5 USDC
      1_000_000n, // target 1 USDC
      2,
      commit
    );

    // approvals go to RaffleModule, since it pulls funds
    await usdc.connect(buyer1).approve(raffle.target, 10_000_000n);
    await usdc.connect(buyer2).approve(raffle.target, 10_000_000n);

    await mineTo(start);
    await expect(registry.connect(buyer1).enterRaffle(listingId, 1)).to.emit(registry, "RaffleEntered");
    await expect(registry.connect(buyer2).enterRaffle(listingId, 1)).to.emit(registry, "RaffleEntered");

    await expect(registry.closeRaffle(listingId, ethers.id("wrong-reveal"))).to.be.revertedWithCustomError(
      registry,
      "CommitmentMismatch"
    );

    await expect(registry.closeRaffle(listingId, reveal)).to.emit(registry, "EscrowCreated");

    const listing = await registry.listings(listingId);
    expect([buyer1.address, buyer2.address]).to.include(listing.buyer);

    const winnerSigner = listing.buyer === buyer1.address ? buyer1 : buyer2;
    await registry.connect(winnerSigner).confirmDelivery(listingId);

    const price = 1_000_000n;
    const feeBps: number = await registry.protocolFeeBps();
    const fee = (price * BigInt(feeBps)) / 10_000n;
    const sellerProceeds = price - fee;

    const sellerBalBefore = await usdc.balanceOf(seller.address);
    await registry.connect(seller).withdrawPayout(usdc.target);
    const sellerBalAfter = await usdc.balanceOf(seller.address);
    expect(sellerBalAfter - sellerBalBefore).to.equal(sellerProceeds);

    const feeBalBefore = await usdc.balanceOf(feeRecipient.address);
    await registry.connect(owner).withdrawFees(usdc.target);
    const feeBalAfter = await usdc.balanceOf(feeRecipient.address);
    expect(feeBalAfter - feeBalBefore).to.equal(fee);
  });

  it("Raffle (ERC20): failure path -> pull-refund for all participants", async function () {
    const { seller, buyer1, buyer2, registry, raffle, usdc } = await deployFixture();

    await registry.connect(seller).createListing("ipfs://meta/raffle-fail-erc20", 0n, usdc.target, 2);
    const nonce = await registry.listingNonce();
    const listingId = listingIdFor(registry, nonce, seller.address, ethers);

    const block = await ethers.provider.getBlock("latest");
    const start = block.timestamp + 10;
    const end = start + 60;

    const reveal = ethers.id("raffle-secret-fail-erc20");
    const commit = ethers.keccak256(reveal);

    await registry.connect(seller).openRaffle(listingId, start, end, 500_000n, 2_000_000n, 3, commit);

    await usdc.connect(buyer1).approve(raffle.target, 10_000_000n);
    await usdc.connect(buyer2).approve(raffle.target, 10_000_000n);

    await mineTo(start);
    await registry.connect(buyer1).enterRaffle(listingId, 1);
    await registry.connect(buyer2).enterRaffle(listingId, 1);

    await mineTo(end + 1);
    await registry.closeRaffle(listingId, reveal);

    const b1Before = await usdc.balanceOf(buyer1.address);
    await registry.connect(buyer1).withdrawRaffleRefund(listingId);
    const b1After = await usdc.balanceOf(buyer1.address);
    expect(b1After - b1Before).to.equal(500_000n);

    const b2Before = await usdc.balanceOf(buyer2.address);
    await registry.connect(buyer2).withdrawRaffleRefund(listingId);
    const b2After = await usdc.balanceOf(buyer2.address);
    expect(b2After - b2Before).to.equal(500_000n);
  });

  it("Pausable: buy/bid/enterRaffle are blocked when paused", async function () {
    const { owner, seller, buyer1, registry, usdc } = await deployFixture();

    await registry.connect(seller).createListing("ipfs://meta/fixed", 1_000_000n, usdc.target, 0);
    const nonce = await registry.listingNonce();
    const listingId = listingIdFor(registry, nonce, seller.address, ethers);

    await registry.connect(owner).pause();

    await expect(registry.connect(buyer1).buy(listingId)).to.be.revertedWithCustomError(registry, "EnforcedPause");
    await expect(registry.connect(buyer1).bid(listingId, 1_000_000n)).to.be.revertedWithCustomError(registry, "EnforcedPause");
    await expect(registry.connect(buyer1).enterRaffle(listingId, 1)).to.be.revertedWithCustomError(registry, "EnforcedPause");
  });
});
