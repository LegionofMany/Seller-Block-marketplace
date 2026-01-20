import { expect } from "chai";
import { network } from "hardhat";

describe("RaffleModule", function () {
	let ethers: any;

	before(async function () {
		({ ethers } = await network.connect({
			network: "hardhatMainnet",
			chainType: "l1",
		}));
	});

	async function deployFixture() {
		const [owner, buyer1, buyer2] = await ethers.getSigners();
		const Raffle = await ethers.getContractFactory("RaffleModule");
		const raffle = await Raffle.deploy();
		return { owner, buyer1, buyer2, raffle };
	}

	it("allows ticket purchase and tracks raised amount", async function () {
		const { buyer1, raffle } = await deployFixture();
		const raffleId = ethers.id("raffle-1");

		await raffle.createRaffle(raffleId, ethers.parseEther("1"));
		await expect(
			raffle.connect(buyer1).buyTicket(raffleId, { value: ethers.parseEther("0.2") })
		).to.emit(raffle, "TicketPurchased");

		const r = await raffle.raffles(raffleId);
		expect(r.raised).to.equal(ethers.parseEther("0.2"));
		expect(r.closed).to.equal(false);
	});

	it("auto-closes when target is reached and blocks further purchases", async function () {
		const { buyer1, buyer2, raffle } = await deployFixture();
		const raffleId = ethers.id("raffle-2");

		await raffle.createRaffle(raffleId, ethers.parseEther("0.3"));
		await raffle.connect(buyer1).buyTicket(raffleId, { value: ethers.parseEther("0.2") });

		await expect(
			raffle.connect(buyer2).buyTicket(raffleId, { value: ethers.parseEther("0.2") })
		).to.emit(raffle, "RaffleClosed");

		const r = await raffle.raffles(raffleId);
		expect(r.closed).to.equal(true);

		await expect(
			raffle.connect(buyer1).buyTicket(raffleId, { value: ethers.parseEther("0.01") })
		).to.be.revertedWithCustomError(raffle, "RaffleAlreadyClosed");
	});
});

