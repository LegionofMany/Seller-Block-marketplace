import { expect } from "chai";
import { network } from "hardhat";

describe("MarketplaceRegistry", function () {
	let ethers: any;

	before(async function () {
		({ ethers } = await network.connect({
			network: "hardhatMainnet",
			chainType: "l1",
		}));
	});

	async function deployFixture() {
		const [owner, seller, other] = await ethers.getSigners();

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

		return { owner, seller, other, vault, registry, auction, raffle };
	}

	it("creates fixed-price listing with metadata, token, and status", async function () {
		const { seller, registry } = await deployFixture();
		await expect(registry.connect(seller).createListing("ipfs://meta/1", 100n, ethers.ZeroAddress, 0)).to.emit(
			registry,
			"ListingCreated"
		);

		const nonce = await registry.listingNonce();
		const listingId = ethers.solidityPackedKeccak256(
			["address", "uint256", "address"],
			[registry.target, nonce, seller.address]
		);

		const listing = await registry.listings(listingId);
		expect(listing.seller).to.equal(seller.address);
		expect(listing.saleType).to.equal(0);
		expect(listing.status).to.equal(1); // Active
		expect(listing.metadataURI).to.equal("ipfs://meta/1");
		expect(listing.price).to.equal(100n);
		expect(listing.token).to.equal(ethers.ZeroAddress);
	});

	it("seller can cancel; others cannot", async function () {
		const { seller, other, registry } = await deployFixture();
		await registry.connect(seller).createListing("ipfs://meta/2", 100n, ethers.ZeroAddress, 0);
		const nonce = await registry.listingNonce();
		const listingId = ethers.solidityPackedKeccak256(
			["address", "uint256", "address"],
			[registry.target, nonce, seller.address]
		);

		await expect(registry.connect(other).cancelListing(listingId)).to.be.revertedWithCustomError(
			registry,
			"NotSeller"
		);
		await expect(registry.connect(seller).cancelListing(listingId)).to.emit(registry, "ListingCancelled");

		const listing = await registry.listings(listingId);
		expect(listing.status).to.equal(2); // Cancelled
	});

	it("pause blocks listing creation", async function () {
		const { owner, seller, registry } = await deployFixture();
		await registry.connect(owner).pause();
		await expect(registry.connect(seller).createListing("ipfs://meta/3", 1n, ethers.ZeroAddress, 0)).to.be.revertedWithCustomError(
			registry,
			"EnforcedPause"
		);
	});
});

