import { expect } from "chai";
import { network } from "hardhat";

describe("Marketplace Protocol (security scenarios)", function () {
  let ethers: any;

  before(async function () {
    ({ ethers } = await network.connect({
      network: "hardhatMainnet",
      chainType: "l1",
    }));
  });

  async function deployReentrancyFixture() {
    const [owner, feeRecipient, seller, buyer] = await ethers.getSigners();

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

    const Token = await ethers.getContractFactory("ReentrantERC20");
    const token = await Token.deploy("Reent", "RENT", 6, buyer.address, 10_000_000n);

    return { owner, feeRecipient, seller, buyer, vault, auction, raffle, registry, token };
  }

  it("Reentrancy: malicious ERC20 callback cannot re-enter registry.buy", async function () {
    const { seller, buyer, registry, token, vault } = await deployReentrancyFixture();

    await registry.connect(seller).createListing("ipfs://meta/reent", 1_000_000n, token.target, 0);
    const nonce = await registry.listingNonce();
    const listingId = ethers.solidityPackedKeccak256(
      ["address", "uint256", "address"],
      [registry.target, nonce, seller.address]
    );

    // approve escrow vault pull
    await token.connect(buyer).approve(vault.target, 1_000_000n);

    // set callback to attempt to reenter buy(listingId)
    const data = registry.interface.encodeFunctionData("buy", [listingId]);
    await token.setCallback(registry.target, data);

    await registry.connect(buyer).buy(listingId);

    // callback should have failed (reentrancy guard)
    expect(await token.lastCallbackSuccess()).to.equal(false);
    const ret: string = await token.lastCallbackReturnData();
    expect(ret).to.not.equal("0x");

    // selector matches ReentrancyGuardReentrantCall()
    const selector = ret.slice(0, 10);
    const expected = ethers.id("ReentrancyGuardReentrantCall()").slice(0, 10);
    expect(selector).to.equal(expected);
  });
});
