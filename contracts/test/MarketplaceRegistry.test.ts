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

		const Registry = await ethers.getContractFactory("MarketplaceRegistry");
		const registry = await Registry.deploy(owner.address, vault.target);

		return { owner, seller, other, vault, registry };
	}

	it("creates listing with correct seller ownership and SaleType assignment", async function () {
		const { seller, registry } = await deployFixture();
		const listingId = ethers.id("listing-1");

		await expect(registry.connect(seller).createListing(listingId, 0)).to.emit(
			registry,
			"ListingCreated"
		);

		const listing = await registry.listings(listingId);
		expect(listing.seller).to.equal(seller.address);
		expect(listing.saleType).to.equal(0);
		expect(listing.active).to.equal(true);
	});

	it("deactivates listing by seller only", async function () {
		const { seller, other, registry } = await deployFixture();
		const listingId = ethers.id("listing-2");

		await registry.connect(seller).createListing(listingId, 1);

		await expect(registry.connect(other).deactivateListing(listingId))
			.to.be.revertedWithCustomError(registry, "NotSeller");

		await expect(registry.connect(seller).deactivateListing(listingId)).to.emit(
			registry,
			"ListingDeactivated"
		);

		const listing = await registry.listings(listingId);
		expect(listing.active).to.equal(false);
	});

	it("invalid access must revert (deactivate non-existent)", async function () {
		const { seller, registry } = await deployFixture();
		const listingId = ethers.id("missing");
		await expect(registry.connect(seller).deactivateListing(listingId)).
			to.be.revertedWithCustomError(registry, "ListingNotFound");
	});

	it("prevents listing overwrite", async function () {
		const { seller, registry } = await deployFixture();
		const listingId = ethers.id("listing-3");

		await registry.connect(seller).createListing(listingId, 2);
		await expect(registry.connect(seller).createListing(listingId, 2)).
			to.be.revertedWithCustomError(registry, "ListingAlreadyExists");
	});
});

