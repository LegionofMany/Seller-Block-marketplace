import { expect } from "chai";
import { network } from "hardhat";

describe("EscrowVault", function () {
  let ethers: any;

  before(async function () {
    ({ ethers } = await network.connect({
      network: "hardhatMainnet",
      chainType: "l1",
    }));
  });

  async function deployFixture() {
    const [owner, buyer, seller, arbiter, attacker] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("ERC20Mock");
    // USDC-like: 6 decimals
    const token = await Token.deploy(
      "USD Coin",
      "USDC",
      6,
      buyer.address,
      1_000_000_000n
    );

    const Vault = await ethers.getContractFactory("EscrowVault");
    const vault = await Vault.deploy(owner.address);
    await vault.connect(owner).setArbiter(arbiter.address);

    return { owner, buyer, seller, arbiter, attacker, token, vault };
  }

  it("creates escrow with ERC20 approval and transfers funds into vault", async function () {
    const { buyer, seller, token, vault } = await deployFixture();
    const amount = 500_000n;
    const escrowId = ethers.id("order-1");

    await token.connect(buyer).approve(vault.target, amount);

    await expect(
      vault.connect(buyer).createEscrow(escrowId, seller.address, token.target, amount)
    ).to.emit(vault, "EscrowCreated");

    expect(await token.balanceOf(vault.target)).to.equal(amount);
    expect(await token.balanceOf(buyer.address)).to.equal(1_000_000_000n - amount);
  });

  it("releases funds by buyer", async function () {
    const { buyer, seller, token, vault } = await deployFixture();
    const amount = 123_456n;
    const escrowId = ethers.id("order-2");

    await token.connect(buyer).approve(vault.target, amount);
    await vault.connect(buyer).createEscrow(escrowId, seller.address, token.target, amount);

    await expect(vault.connect(buyer).release(escrowId)).to.emit(vault, "EscrowReleased");
    expect(await token.balanceOf(seller.address)).to.equal(amount);
    expect(await token.balanceOf(vault.target)).to.equal(0);
  });

  it("releases funds by arbiter", async function () {
    const { buyer, seller, arbiter, token, vault } = await deployFixture();
    const amount = 10_000n;
    const escrowId = ethers.id("order-3");

    await token.connect(buyer).approve(vault.target, amount);
    await vault.connect(buyer).createEscrow(escrowId, seller.address, token.target, amount);

    await expect(vault.connect(arbiter).release(escrowId)).to.emit(vault, "EscrowReleased");
    expect(await token.balanceOf(seller.address)).to.equal(amount);
  });

  it("refunds funds by buyer", async function () {
    const { buyer, seller, token, vault } = await deployFixture();
    const amount = 50_000n;
    const escrowId = ethers.id("order-4");

    await token.connect(buyer).approve(vault.target, amount);
    await vault.connect(buyer).createEscrow(escrowId, seller.address, token.target, amount);

    await expect(vault.connect(buyer).refund(escrowId)).to.emit(vault, "EscrowRefunded");
    expect(await token.balanceOf(buyer.address)).to.equal(1_000_000_000n);
    expect(await token.balanceOf(vault.target)).to.equal(0);
  });

  it("refunds funds by arbiter", async function () {
    const { buyer, seller, arbiter, token, vault } = await deployFixture();
    const amount = 1_000n;
    const escrowId = ethers.id("order-5");

    await token.connect(buyer).approve(vault.target, amount);
    await vault.connect(buyer).createEscrow(escrowId, seller.address, token.target, amount);

    await expect(vault.connect(arbiter).refund(escrowId)).to.emit(vault, "EscrowRefunded");
    expect(await token.balanceOf(buyer.address)).to.equal(1_000_000_000n);
  });

  it("unauthorized release/refund must revert", async function () {
    const { buyer, seller, attacker, token, vault } = await deployFixture();
    const amount = 1_000n;
    const escrowId = ethers.id("order-6");

    await token.connect(buyer).approve(vault.target, amount);
    await vault.connect(buyer).createEscrow(escrowId, seller.address, token.target, amount);

    await expect(vault.connect(attacker).release(escrowId)).to.be.revertedWithCustomError(
      vault,
      "NotAuthorized"
    );
    await expect(vault.connect(attacker).refund(escrowId)).to.be.revertedWithCustomError(
      vault,
      "NotAuthorized"
    );
  });

  it("invalid escrow IDs must revert", async function () {
    const { buyer, vault } = await deployFixture();
    const badId = ethers.id("does-not-exist");

    await expect(vault.connect(buyer).release(badId)).to.be.revertedWithCustomError(
      vault,
      "InvalidEscrowId"
    );
    await expect(vault.connect(buyer).refund(badId)).to.be.revertedWithCustomError(
      vault,
      "InvalidEscrowId"
    );
    await expect(vault.getEscrow(badId)).to.be.revertedWithCustomError(vault, "InvalidEscrowId");
  });

  it("state transitions must be enforced", async function () {
    const { buyer, seller, token, vault } = await deployFixture();
    const amount = 2_000n;
    const escrowId = ethers.id("order-7");

    await token.connect(buyer).approve(vault.target, amount);
    await vault.connect(buyer).createEscrow(escrowId, seller.address, token.target, amount);

    await vault.connect(buyer).release(escrowId);

    await expect(vault.connect(buyer).refund(escrowId)).to.be.revertedWithCustomError(
      vault,
      "InvalidState"
    );
    await expect(vault.connect(buyer).release(escrowId)).to.be.revertedWithCustomError(
      vault,
      "InvalidState"
    );
  });
});