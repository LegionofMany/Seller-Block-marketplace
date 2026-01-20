import { expect } from "chai";
import { network } from "hardhat";

describe("AuctionModule", function () {
	let ethers: any;

	before(async function () {
		({ ethers } = await network.connect({
			network: "hardhatMainnet",
			chainType: "l1",
		}));
	});

	async function deployFixture() {
		const [owner, bidder1, bidder2] = await ethers.getSigners();
		const Auction = await ethers.getContractFactory("AuctionModule");
		const auction = await Auction.deploy();
		return { owner, bidder1, bidder2, auction };
	}

	it("accepts first bid", async function () {
		const { bidder1, auction } = await deployFixture();
		const auctionId = ethers.id("auction-1");

		await auction.createAuction(auctionId);
		await expect(
			auction.connect(bidder1).placeBid(auctionId, { value: ethers.parseEther("0.1") })
		).to.emit(auction, "BidPlaced");

		const a = await auction.auctions(auctionId);
		expect(a.highestBidder).to.equal(bidder1.address);
		expect(a.highestBid).to.equal(ethers.parseEther("0.1"));
		expect(a.active).to.equal(true);
	});

	it("replaces with higher bid and refunds previous bidder", async function () {
		const { bidder1, bidder2, auction } = await deployFixture();
		const auctionId = ethers.id("auction-2");

		await auction.createAuction(auctionId);
		await auction.connect(bidder1).placeBid(auctionId, { value: ethers.parseEther("0.1") });

		const bidder1BalBefore = await ethers.provider.getBalance(bidder1.address);
		const tx = await auction
			.connect(bidder2)
			.placeBid(auctionId, { value: ethers.parseEther("0.2") });
		await tx.wait();

		const bidder1BalAfter = await ethers.provider.getBalance(bidder1.address);
		// Bidder1 gets refunded 0.1 ETH (gas noise tolerated with >= check)
		expect(bidder1BalAfter).to.be.greaterThanOrEqual(bidder1BalBefore + ethers.parseEther("0.1") - 1_000_000_000_000_000n);

		const a = await auction.auctions(auctionId);
		expect(a.highestBidder).to.equal(bidder2.address);
		expect(a.highestBid).to.equal(ethers.parseEther("0.2"));
	});

	it("closes auction and prevents bids after close", async function () {
		const { bidder1, bidder2, auction } = await deployFixture();
		const auctionId = ethers.id("auction-3");

		await auction.createAuction(auctionId);
		await auction.connect(bidder1).placeBid(auctionId, { value: ethers.parseEther("0.05") });
		await expect(auction.closeAuction(auctionId)).to.emit(auction, "AuctionClosed");

		await expect(
			auction.connect(bidder2).placeBid(auctionId, { value: ethers.parseEther("0.06") })
		).to.be.revertedWithCustomError(auction, "AuctionAlreadyClosed");
	});
});

