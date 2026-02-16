import { expect } from "chai";
import { network } from "hardhat";

describe("RaffleModule", function () {
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
		const [owner, seller, buyer1, buyer2] = await ethers.getSigners();
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
		return { owner, seller, buyer1, buyer2, vault, auction, raffle, registry };
	}

	it("raffle success (ETH): enter, close, winner escrow, confirm, withdraw", async function () {
		const { seller, buyer1, buyer2, registry } = await deployFixture();
		await registry.connect(seller).createListing("ipfs://meta/raffle", 0n, ethers.ZeroAddress, 2);
		const nonce = await registry.listingNonce();
		const listingId = ethers.solidityPackedKeccak256(
			["address", "uint256", "address"],
			[registry.target, nonce, seller.address]
		);

		const block = await ethers.provider.getBlock("latest");
		const start = BigInt(block.timestamp + 10);
		const end = start + 3600n;
		const reveal = ethers.id("raffle-secret");
		const commit = ethers.keccak256(reveal);

		await registry.connect(seller).openRaffle(
			listingId,
			Number(start),
			Number(end),
			ethers.parseEther("0.1"),
			ethers.parseEther("0.3"),
			2,
			commit
		);

		await mineTo(Number(start));

		await registry.connect(buyer1).enterRaffle(listingId, 2, { value: ethers.parseEther("0.2") });
		await registry.connect(buyer2).enterRaffle(listingId, 1, { value: ethers.parseEther("0.1") });

		await expect(registry.closeRaffle(listingId, reveal)).to.emit(registry, "EscrowCreated");
		const listing = await registry.listings(listingId);
		expect([buyer1.address, buyer2.address]).to.include(listing.buyer);

		// winner confirms delivery, seller withdraws
		const winnerSigner = listing.buyer === buyer1.address ? buyer1 : buyer2;
		await registry.connect(winnerSigner).confirmDelivery(listingId);
		await registry.connect(seller).withdrawPayout(ethers.ZeroAddress);
	});

	it("raffle failure refunds (min participants not met)", async function () {
		const { seller, buyer1, buyer2, registry } = await deployFixture();
		await registry.connect(seller).createListing("ipfs://meta/raffle-fail", 0n, ethers.ZeroAddress, 2);
		const nonce = await registry.listingNonce();
		const listingId = ethers.solidityPackedKeccak256(
			["address", "uint256", "address"],
			[registry.target, nonce, seller.address]
		);

		const block = await ethers.provider.getBlock("latest");
		const start = BigInt(block.timestamp + 10);
		const end = start + 60n;
		const reveal = ethers.id("raffle-secret-2");
		const commit = ethers.keccak256(reveal);

		await registry.connect(seller).openRaffle(
			listingId,
			Number(start),
			Number(end),
			ethers.parseEther("0.1"),
			ethers.parseEther("0.3"),
			3,
			commit
		);

		await mineTo(Number(start));
		await registry.connect(buyer1).enterRaffle(listingId, 1, { value: ethers.parseEther("0.1") });
		await registry.connect(buyer2).enterRaffle(listingId, 1, { value: ethers.parseEther("0.1") });

		await mineTo(Number(end + 1n));
		await registry.closeRaffle(listingId, reveal);

		const bal1Before = await ethers.provider.getBalance(buyer1.address);
		const tx1 = await registry.connect(buyer1).withdrawRaffleRefund(listingId);
		const r1 = await tx1.wait();
		const gasPrice1: bigint = (r1.effectiveGasPrice ?? (r1 as any).gasPrice ?? 0n) as bigint;
		const gas1 = r1.gasUsed * gasPrice1;
		const bal1After = await ethers.provider.getBalance(buyer1.address);
		expect(bal1After).to.be.greaterThanOrEqual(bal1Before + ethers.parseEther("0.1") - gas1);
	});
});

