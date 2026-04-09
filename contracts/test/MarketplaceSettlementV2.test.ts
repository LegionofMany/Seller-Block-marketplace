import { expect } from "chai";
import { network } from "hardhat";

describe("MarketplaceSettlementV2", function () {
  let ethers: any;

  before(async function () {
    ({ ethers } = await network.connect({
      network: "hardhatMainnet",
      chainType: "l1",
    }));
  });

  async function deployFixture() {
    const [owner, feeRecipient, seller, buyer, relayer, arbiter] = await ethers.getSigners();

    const Settlement = await ethers.getContractFactory("MarketplaceSettlementV2");
    const settlement = await Settlement.deploy(owner.address, feeRecipient.address);
    await settlement.connect(owner).setArbiter(arbiter.address);

    const Token = await ethers.getContractFactory("ERC20Mock");
    const usdc = await Token.deploy("USD Coin", "USDC", 6, buyer.address, 10_000_000_000n);

    const PermitToken = await ethers.getContractFactory("ERC20PermitMock");
    const permitUsdc = await PermitToken.deploy("Permit USD Coin", "pUSDC", 6, buyer.address, 10_000_000_000n);

    return { owner, feeRecipient, seller, buyer, relayer, arbiter, settlement, usdc, permitUsdc };
  }

  async function domainFor(settlement: any) {
    const networkInfo = await ethers.provider.getNetwork();
    return {
      name: "MarketplaceSettlementV2",
      version: "1",
      chainId: Number(networkInfo.chainId),
      verifyingContract: settlement.target,
    };
  }

  const orderTypes = {
    Order: [
      { name: "seller", type: "address" },
      { name: "listingId", type: "bytes32" },
      { name: "token", type: "address" },
      { name: "price", type: "uint256" },
      { name: "expiry", type: "uint64" },
      { name: "nonce", type: "uint256" },
      { name: "termsHash", type: "bytes32" },
    ],
  };

  const acceptanceTypes = {
    BuyerAcceptance: [
      { name: "orderHash", type: "bytes32" },
      { name: "buyer", type: "address" },
      { name: "deadline", type: "uint64" },
    ],
  };

  const actionTypes = {
    EscrowAction: [
      { name: "escrowId", type: "bytes32" },
      { name: "buyer", type: "address" },
      { name: "action", type: "uint8" },
      { name: "deadline", type: "uint64" },
    ],
  };

  const permitTypes = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  async function buildSignedOrder(settlement: any, seller: any, buyer: any, token: string, nonce = 0n) {
    const latest = await ethers.provider.getBlock("latest");
    const order = {
      seller: seller.address,
      listingId: ethers.id(`listing-${nonce.toString()}`),
      token,
      price: 1_500_000n,
      expiry: BigInt(latest.timestamp + 3600),
      nonce,
      termsHash: ethers.id("terms-v1"),
    };

    const domain = await domainFor(settlement);
    const sellerSignature = await seller.signTypedData(domain, orderTypes, order);
    const orderHash = await settlement.hashOrder(order);
    const acceptanceDeadline = BigInt(latest.timestamp + 7200);
    const buyerSignature = await buyer.signTypedData(domain, acceptanceTypes, {
      orderHash,
      buyer: buyer.address,
      deadline: acceptanceDeadline,
    });

    return { order, orderHash, acceptanceDeadline, sellerSignature, buyerSignature };
  }

  it("accepts a signed ERC20 order through a relayer and releases payout directly on buyer confirmation", async function () {
    const { feeRecipient, seller, buyer, relayer, settlement, usdc } = await deployFixture();

    await usdc.connect(buyer).approve(settlement.target, 10_000_000n);

    const { order, orderHash, acceptanceDeadline, sellerSignature, buyerSignature } = await buildSignedOrder(
      settlement,
      seller,
      buyer,
      usdc.target,
      0n
    );

    await expect(
      settlement.connect(relayer).acceptOrder(order, buyer.address, acceptanceDeadline, sellerSignature, buyerSignature)
    ).to.emit(settlement, "OrderAccepted");

    const escrowId = await settlement.computeEscrowId(orderHash, buyer.address);
    const latest = await ethers.provider.getBlock("latest");
    const confirmDeadline = BigInt(latest.timestamp + 3600);
    const confirmSignature = await buyer.signTypedData(await domainFor(settlement), actionTypes, {
      escrowId,
      buyer: buyer.address,
      action: 0,
      deadline: confirmDeadline,
    });

    const sellerBefore = await usdc.balanceOf(seller.address);
    const feeBefore = await usdc.balanceOf(feeRecipient.address);

    await expect(settlement.connect(relayer).confirmDeliveryBySig(escrowId, confirmDeadline, confirmSignature)).to.emit(
      settlement,
      "EscrowReleased"
    );

    const sellerAfter = await usdc.balanceOf(seller.address);
    const feeAfter = await usdc.balanceOf(feeRecipient.address);
    expect(sellerAfter - sellerBefore).to.equal(1_462_500n);
    expect(feeAfter - feeBefore).to.equal(37_500n);
  });

  it("accepts a signed ERC20 order with permit through a relayer without prior approval", async function () {
    const { feeRecipient, seller, buyer, relayer, settlement, permitUsdc } = await deployFixture();

    const { order, orderHash, acceptanceDeadline, sellerSignature, buyerSignature } = await buildSignedOrder(
      settlement,
      seller,
      buyer,
      permitUsdc.target,
      3n
    );

    const latest = await ethers.provider.getBlock("latest");
    const permitDeadline = BigInt(latest.timestamp + 3600);
    const permitNonce = await permitUsdc.nonces(buyer.address);
    const permitDomain = {
      name: "Permit USD Coin",
      version: "1",
      chainId: Number((await ethers.provider.getNetwork()).chainId),
      verifyingContract: permitUsdc.target,
    };
    const permitSignature = await buyer.signTypedData(permitDomain, permitTypes, {
      owner: buyer.address,
      spender: settlement.target,
      value: order.price,
      nonce: permitNonce,
      deadline: permitDeadline,
    });
    const parsedPermit = ethers.Signature.from(permitSignature);

    await expect(
      settlement.connect(relayer).acceptOrderWithPermit(
        order,
        buyer.address,
        acceptanceDeadline,
        sellerSignature,
        buyerSignature,
        {
          deadline: permitDeadline,
          v: parsedPermit.v,
          r: parsedPermit.r,
          s: parsedPermit.s,
        }
      )
    ).to.emit(settlement, "OrderAccepted");

    const escrowId = await settlement.computeEscrowId(orderHash, buyer.address);
    const confirmDeadline = BigInt(latest.timestamp + 7200);
    const confirmSignature = await buyer.signTypedData(await domainFor(settlement), actionTypes, {
      escrowId,
      buyer: buyer.address,
      action: 0,
      deadline: confirmDeadline,
    });

    const sellerBefore = await permitUsdc.balanceOf(seller.address);
    const feeBefore = await permitUsdc.balanceOf(feeRecipient.address);

    await settlement.connect(relayer).confirmDeliveryBySig(escrowId, confirmDeadline, confirmSignature);

    const sellerAfter = await permitUsdc.balanceOf(seller.address);
    const feeAfter = await permitUsdc.balanceOf(feeRecipient.address);
    expect(sellerAfter - sellerBefore).to.equal(1_462_500n);
    expect(feeAfter - feeBefore).to.equal(37_500n);
  });

  it("refunds the buyer on a relayed refund request signature", async function () {
    const { buyer, relayer, seller, settlement, usdc } = await deployFixture();

    await usdc.connect(buyer).approve(settlement.target, 10_000_000n);

    const { order, orderHash, acceptanceDeadline, sellerSignature, buyerSignature } = await buildSignedOrder(
      settlement,
      seller,
      buyer,
      usdc.target,
      1n
    );

    const buyerStart = await usdc.balanceOf(buyer.address);
    await settlement.connect(relayer).acceptOrder(order, buyer.address, acceptanceDeadline, sellerSignature, buyerSignature);
    const buyerAfterFunding = await usdc.balanceOf(buyer.address);
    expect(buyerStart - buyerAfterFunding).to.equal(order.price);

    const escrowId = await settlement.computeEscrowId(orderHash, buyer.address);
    const latest = await ethers.provider.getBlock("latest");
    const refundDeadline = BigInt(latest.timestamp + 3600);
    const refundSignature = await buyer.signTypedData(await domainFor(settlement), actionTypes, {
      escrowId,
      buyer: buyer.address,
      action: 1,
      deadline: refundDeadline,
    });

    await expect(settlement.connect(relayer).requestRefundBySig(escrowId, refundDeadline, refundSignature)).to.emit(
      settlement,
      "EscrowRefunded"
    );

    const buyerAfterRefund = await usdc.balanceOf(buyer.address);
    expect(buyerAfterRefund).to.equal(buyerStart);
  });

  it("blocks orders below an invalidated seller nonce", async function () {
    const { buyer, relayer, seller, settlement, usdc } = await deployFixture();

    await usdc.connect(buyer).approve(settlement.target, 10_000_000n);
    await settlement.connect(seller).invalidateNonce(5n);

    const { order, acceptanceDeadline, sellerSignature, buyerSignature } = await buildSignedOrder(
      settlement,
      seller,
      buyer,
      usdc.target,
      4n
    );

    await expect(
      settlement.connect(relayer).acceptOrder(order, buyer.address, acceptanceDeadline, sellerSignature, buyerSignature)
    ).to.be.revertedWithCustomError(settlement, "InvalidNonce");
  });

  it("blocks a seller-cancelled order", async function () {
    const { buyer, relayer, seller, settlement, usdc } = await deployFixture();

    await usdc.connect(buyer).approve(settlement.target, 10_000_000n);

    const { order, acceptanceDeadline, sellerSignature, buyerSignature } = await buildSignedOrder(
      settlement,
      seller,
      buyer,
      usdc.target,
      2n
    );

    await settlement.connect(seller).cancelOrder(order);

    await expect(
      settlement.connect(relayer).acceptOrder(order, buyer.address, acceptanceDeadline, sellerSignature, buyerSignature)
    ).to.be.revertedWithCustomError(settlement, "OrderAlreadyCancelled");
  });
});