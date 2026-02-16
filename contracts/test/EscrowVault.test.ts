import { expect } from "chai";
import { network } from "hardhat";

describe("EscrowVault (via MarketplaceRegistry)", function () {
  let ethers: any;

  before(async function () {
    ({ ethers } = await network.connect({
      network: "hardhatMainnet",
      chainType: "l1",
    }));
  });

  async function deployFixture() {
    const [owner, seller, buyer, arbiter] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("ERC20Mock");
    const token = await Token.deploy("USD Coin", "USDC", 6, buyer.address, 1_000_000_000n);

    const Vault = await ethers.getContractFactory("EscrowVault");
    const vault = await Vault.deploy(owner.address);

    const Auction = await ethers.getContractFactory("AuctionModule");
    const auction = await Auction.deploy(owner.address);

    const Raffle = await ethers.getContractFactory("RaffleModule");
    const raffle = await Raffle.deploy(owner.address);

    const Registry = await ethers.getContractFactory("MarketplaceRegistry");
    const registry = await Registry.deploy(owner.address, vault.target, auction.target, raffle.target, owner.address);

    await vault.connect(owner).setController(registry.target);
    await auction.connect(owner).setRegistry(registry.target);
    await raffle.connect(owner).setRegistry(registry.target);
    await registry.connect(owner).setArbiter(arbiter.address);

    return { owner, seller, buyer, arbiter, token, vault, registry, auction, raffle };
  }

  it("fixed-price ERC20 purchase -> escrow release -> pull withdrawals (seller + fee)", async function () {
    const { owner, seller, buyer, token, registry } = await deployFixture();
    const price = 500_000n;

    await registry.connect(seller).createListing("ipfs://meta/1", price, token.target, 0);
    const nonce = await registry.listingNonce();
    const listingId = ethers.solidityPackedKeccak256(
      ["address", "uint256", "address"],
      [registry.target, nonce, seller.address]
    );

    // Buyer must approve EscrowVault (spender = vault), since vault pulls on createEscrow
    const vaultAddr = await registry.escrowVault();
    await token.connect(buyer).approve(vaultAddr, price);

    await expect(registry.connect(buyer).buy(listingId)).to.emit(registry, "EscrowCreated");

    await expect(registry.connect(buyer).confirmDelivery(listingId)).to.emit(registry, "EscrowReleased");

    // Seller withdraws proceeds
    const feeBps = await registry.protocolFeeBps();
    const fee = (price * BigInt(feeBps)) / 10_000n;
    const sellerProceeds = price - fee;

    await registry.connect(seller).withdrawPayout(token.target);
    expect(await token.balanceOf(seller.address)).to.equal(sellerProceeds);

    // Owner withdraws protocol fee
    await registry.connect(owner).withdrawPayout(token.target);
    expect(await token.balanceOf(owner.address)).to.equal(fee);
  });

  it("buyer refund request credits buyer for withdrawal", async function () {
    const { seller, buyer, token, registry } = await deployFixture();
    const price = 123_456n;

    await registry.connect(seller).createListing("ipfs://meta/2", price, token.target, 0);
    const nonce = await registry.listingNonce();
    const listingId = ethers.solidityPackedKeccak256(
      ["address", "uint256", "address"],
      [registry.target, nonce, seller.address]
    );

    const vaultAddr = await registry.escrowVault();
    await token.connect(buyer).approve(vaultAddr, price);
    await registry.connect(buyer).buy(listingId);

    await expect(registry.connect(buyer).requestRefund(listingId)).to.emit(registry, "ListingRefunded");
    await registry.connect(buyer).withdrawPayout(token.target);
    expect(await token.balanceOf(buyer.address)).to.equal(1_000_000_000n);
  });
});