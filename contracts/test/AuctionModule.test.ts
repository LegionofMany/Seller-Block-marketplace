import { expect } from "chai";
import { network } from "hardhat";

describe("AuctionModule", function () {
	let ethers: any;

	async function mineTo(ts: number) {
		const latest = await ethers.provider.getBlock("latest");
		const next = Math.max(ts, latest.timestamp + 1);
		await ethers.provider.send("evm_setNextBlockTimestamp", [next]);
		await ethers.provider.send("evm_mine", []);
	}

	before(async function () {
		({ ethers } = await network.connect({
			network: "hardhatMainnet",
			chainType: "l1",
		}));
	});

	async function deployFixture() {
		const [owner, seller, bidder1, bidder2] = await ethers.getSigners();
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
		return { owner, seller, bidder1, bidder2, vault, auction, raffle, registry };
	}

	it("auction flow (ETH): bids, pull refund, close -> escrow -> confirm -> withdraw", async function () {
		const { owner, seller, bidder1, bidder2, registry } = await deployFixture();
		await registry.connect(seller).createListing("ipfs://meta/auction", 0n, ethers.ZeroAddress, 1);
		const nonce = await registry.listingNonce();
		const listingId = ethers.solidityPackedKeccak256(
			["address", "uint256", "address"],
			[registry.target, nonce, seller.address]
		);

		const block = await ethers.provider.getBlock("latest");
		const start = BigInt(block.timestamp + 10);
		const end = start + 3600n;

		await registry.connect(seller).openAuction(
			listingId,
			Number(start),
			Number(end),
			ethers.parseEther("0.1"),
			ethers.parseEther("0.01"),
			300,
			120
		);

		await mineTo(Number(start));

		await registry.connect(bidder1).bid(listingId, ethers.parseEther("0.1"), { value: ethers.parseEther("0.1") });
		await registry.connect(bidder2).bid(listingId, ethers.parseEther("0.2"), { value: ethers.parseEther("0.2") });

		// bidder1 pull-refunds their outbid amount via registry
		const balBefore = await ethers.provider.getBalance(bidder1.address);
		const refundTx = await registry.connect(bidder1).withdrawAuctionRefund(listingId);
		const refundReceipt = await refundTx.wait();
		const gasPrice: bigint = (refundReceipt.effectiveGasPrice ?? (refundReceipt as any).gasPrice ?? 0n) as bigint;
		const gas = refundReceipt.gasUsed * gasPrice;
		const balAfter = await ethers.provider.getBalance(bidder1.address);
		expect(balAfter).to.be.greaterThanOrEqual(balBefore + ethers.parseEther("0.1") - gas);

		// close after end
		await mineTo(Number(end + 1n));
		await expect(registry.closeAuction(listingId)).to.emit(registry, "EscrowCreated");

		// winner confirms delivery, then seller withdraws
		const listing = await registry.listings(listingId);
		expect(listing.buyer).to.equal(bidder2.address);
		await registry.connect(bidder2).confirmDelivery(listingId);
		await registry.connect(seller).withdrawPayout(ethers.ZeroAddress);

		// owner withdraws protocol fee
		await registry.connect(owner).withdrawPayout(ethers.ZeroAddress);
	});
});

