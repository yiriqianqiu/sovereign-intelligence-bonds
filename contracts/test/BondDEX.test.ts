import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("BondDEX", function () {
  async function deployFixture() {
    const connection = await hre.network.connect();
    const { ethers, networkHelpers } = connection;

    const [owner, controller, seller, buyer, alice] =
      await ethers.getSigners();

    // Deploy BondManager
    const BondManager = await ethers.getContractFactory("SIBBondManager");
    const bondManager = await BondManager.deploy();

    // Deploy DividendVaultV2
    const DividendVault = await ethers.getContractFactory("DividendVaultV2");
    const dividendVault = await DividendVault.deploy();

    // Deploy MockERC20
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const payToken = await MockERC20.deploy("Pay Token", "PAY", 18);

    // Deploy BondDEX
    const BondDEX = await ethers.getContractFactory("BondDEX");
    const dex = await BondDEX.deploy(
      await bondManager.getAddress(),
      await dividendVault.getAddress()
    );
    const dexAddress = await dex.getAddress();

    // Wire up
    await bondManager.setController(controller.address);
    await bondManager.setDividendVault(await dividendVault.getAddress());
    await dividendVault.setController(controller.address);
    await dividendVault.setBondManager(await bondManager.getAddress());

    // Create a bond class (agentId=1, coupon=500bps, maturity=86400, sharpe=15000, maxSupply=10000, tranche=0, BNB)
    await bondManager
      .connect(controller)
      .createBondClass(1n, 500n, 86400n, 15000n, 10000n, 0, ethers.ZeroAddress);
    // classId = 1

    // Create a nonce (price=100)
    await bondManager.connect(controller).createNonce(1n, 100n);
    // nonceId = 0

    // Issue bonds to seller (500 bonds)
    await bondManager
      .connect(controller)
      .issue(seller.address, [{ classId: 1n, nonceId: 0n, amount: 500n }]);

    // Issue bonds to alice (200 bonds) for additional tests
    await bondManager
      .connect(controller)
      .issue(alice.address, [{ classId: 1n, nonceId: 0n, amount: 200n }]);

    // Seller approves DEX
    await bondManager.connect(seller).setApprovalFor(dexAddress, true);

    // Alice approves DEX
    await bondManager.connect(alice).setApprovalFor(dexAddress, true);

    // Mint pay tokens to buyer
    await payToken.mint(buyer.address, ethers.parseEther("10000"));
    // Buyer approves DEX for ERC20
    await payToken.connect(buyer).approve(dexAddress, ethers.MaxUint256);

    // Mint pay tokens to seller (for buy order fills)
    await payToken.mint(seller.address, ethers.parseEther("10000"));
    await payToken.connect(seller).approve(dexAddress, ethers.MaxUint256);

    return {
      bondManager,
      dividendVault,
      dex,
      dexAddress,
      payToken,
      owner,
      controller,
      seller,
      buyer,
      alice,
      ethers,
      networkHelpers,
    };
  }

  // ==================== Deployment ====================

  describe("Deployment", function () {
    it("should set bondManager and dividendVault correctly", async function () {
      const { dex, bondManager, dividendVault } = await deployFixture();
      assert.equal(await dex.bondManager(), await bondManager.getAddress());
      assert.equal(
        await dex.dividendVault(),
        await dividendVault.getAddress()
      );
    });

    it("should set default fee to 50 bps", async function () {
      const { dex } = await deployFixture();
      assert.equal(await dex.protocolFeeBps(), 50n);
    });

    it("should set feeRecipient to deployer", async function () {
      const { dex, owner } = await deployFixture();
      assert.equal(await dex.feeRecipient(), owner.address);
    });
  });

  // ==================== Sell Orders ====================

  describe("Sell Orders", function () {
    it("should create sell order and escrow bonds", async function () {
      const { dex, bondManager, seller, dexAddress, ethers } =
        await deployFixture();

      const balBefore = await bondManager.balanceOf(
        seller.address,
        1n,
        0n
      );
      await dex
        .connect(seller)
        .createSellOrder(1n, 0n, 100n, ethers.parseEther("1"), ethers.ZeroAddress, 0n);

      // Seller lost 100 bonds
      const balAfter = await bondManager.balanceOf(
        seller.address,
        1n,
        0n
      );
      assert.equal(balBefore - balAfter, 100n);

      // DEX holds 100 bonds
      assert.equal(
        await bondManager.balanceOf(dexAddress, 1n, 0n),
        100n
      );

      // Order stored correctly
      const order = await dex.getOrder(1n);
      assert.equal(order.maker, seller.address);
      assert.equal(order.classId, 1n);
      assert.equal(order.nonceId, 0n);
      assert.equal(order.amount, 100n);
      assert.equal(order.pricePerBond, ethers.parseEther("1"));
      assert.equal(order.isSell, true);
      assert.equal(order.active, true);
    });

    it("should emit OrderCreated event", async function () {
      const { dex, seller, ethers } = await deployFixture();

      const tx = await dex
        .connect(seller)
        .createSellOrder(1n, 0n, 50n, ethers.parseEther("2"), ethers.ZeroAddress, 0n);
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log: any) => log.fragment?.name === "OrderCreated"
      );
      assert.ok(event, "OrderCreated event should be emitted");
    });

    it("should revert with zero amount", async function () {
      const { dex, seller, ethers } = await deployFixture();
      await assert.rejects(async () => {
        await dex
          .connect(seller)
          .createSellOrder(1n, 0n, 0n, ethers.parseEther("1"), ethers.ZeroAddress, 0n);
      });
    });

    it("should revert with zero price", async function () {
      const { dex, seller, ethers } = await deployFixture();
      await assert.rejects(async () => {
        await dex
          .connect(seller)
          .createSellOrder(1n, 0n, 100n, 0n, ethers.ZeroAddress, 0n);
      });
    });

    it("should revert with past expiry", async function () {
      const { dex, seller, ethers } = await deployFixture();
      await assert.rejects(async () => {
        await dex
          .connect(seller)
          .createSellOrder(1n, 0n, 100n, ethers.parseEther("1"), ethers.ZeroAddress, 1n);
      });
    });

    it("should revert without approval", async function () {
      const { dex, buyer, ethers } = await deployFixture();
      // buyer has no bonds approved for DEX (and no bonds at all)
      await assert.rejects(async () => {
        await dex
          .connect(buyer)
          .createSellOrder(1n, 0n, 100n, ethers.parseEther("1"), ethers.ZeroAddress, 0n);
      });
    });
  });

  // ==================== Buy Orders ====================

  describe("Buy Orders", function () {
    it("should create buy order and escrow BNB", async function () {
      const { dex, buyer, ethers } = await deployFixture();

      const price = ethers.parseEther("1");
      const amount = 10n;
      const totalCost = price * amount;

      await dex
        .connect(buyer)
        .createBuyOrder(1n, 0n, amount, price, ethers.ZeroAddress, 0n, {
          value: totalCost,
        });

      const order = await dex.getOrder(1n);
      assert.equal(order.maker, buyer.address);
      assert.equal(order.amount, amount);
      assert.equal(order.pricePerBond, price);
      assert.equal(order.isSell, false);
      assert.equal(order.active, true);
    });

    it("should create buy order and escrow ERC20", async function () {
      const { dex, buyer, payToken, dexAddress, ethers } = await deployFixture();

      const price = ethers.parseEther("5");
      const amount = 10n;
      const totalCost = price * amount;
      const payTokenAddr = await payToken.getAddress();

      const balBefore = await payToken.balanceOf(buyer.address);
      await dex
        .connect(buyer)
        .createBuyOrder(1n, 0n, amount, price, payTokenAddr, 0n);

      const balAfter = await payToken.balanceOf(buyer.address);
      assert.equal(balBefore - balAfter, totalCost);

      // DEX holds the tokens
      assert.equal(await payToken.balanceOf(dexAddress), totalCost);
    });

    it("should refund excess BNB", async function () {
      const { dex, buyer, ethers } = await deployFixture();

      const price = ethers.parseEther("1");
      const amount = 5n;
      const totalCost = price * amount;
      const excess = ethers.parseEther("3");

      const balBefore = await ethers.provider.getBalance(buyer.address);
      const tx = await dex
        .connect(buyer)
        .createBuyOrder(1n, 0n, amount, price, ethers.ZeroAddress, 0n, {
          value: totalCost + excess,
        });
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const balAfter = await ethers.provider.getBalance(buyer.address);

      // Should only spend totalCost + gas, not totalCost + excess + gas
      assert.equal(balBefore - balAfter, totalCost + gasUsed);
    });

    it("should revert with insufficient BNB", async function () {
      const { dex, buyer, ethers } = await deployFixture();
      await assert.rejects(async () => {
        await dex
          .connect(buyer)
          .createBuyOrder(1n, 0n, 10n, ethers.parseEther("1"), ethers.ZeroAddress, 0n, {
            value: ethers.parseEther("5"), // only 5 BNB, needs 10
          });
      });
    });

    it("should revert when sending BNB for ERC20 order", async function () {
      const { dex, buyer, payToken, ethers } = await deployFixture();
      const payTokenAddr = await payToken.getAddress();
      await assert.rejects(async () => {
        await dex
          .connect(buyer)
          .createBuyOrder(1n, 0n, 10n, ethers.parseEther("1"), payTokenAddr, 0n, {
            value: ethers.parseEther("1"),
          });
      });
    });
  });

  // ==================== Fill Orders ====================

  describe("Fill Orders", function () {
    it("should fill sell order: buyer pays BNB, receives bonds", async function () {
      const { dex, bondManager, seller, buyer, ethers } = await deployFixture();

      const price = ethers.parseEther("1");
      // Create sell order
      await dex
        .connect(seller)
        .createSellOrder(1n, 0n, 100n, price, ethers.ZeroAddress, 0n);

      const sellerBalBefore = await ethers.provider.getBalance(seller.address);
      const buyerBondsBefore = await bondManager.balanceOf(buyer.address, 1n, 0n);

      // Fill 50 bonds
      const fillAmount = 50n;
      const totalPayment = price * fillAmount;

      await dex
        .connect(buyer)
        .fillOrder(1n, fillAmount, { value: totalPayment });

      // Buyer received bonds
      const buyerBondsAfter = await bondManager.balanceOf(buyer.address, 1n, 0n);
      assert.equal(buyerBondsAfter - buyerBondsBefore, fillAmount);

      // Seller received payment (minus fee)
      const fee = (totalPayment * 50n) / 10000n;
      const sellerBalAfter = await ethers.provider.getBalance(seller.address);
      assert.equal(sellerBalAfter - sellerBalBefore, totalPayment - fee);

      // Order partially filled
      const order = await dex.getOrder(1n);
      assert.equal(order.amount, 50n);
      assert.equal(order.active, true);
    });

    it("should fill sell order partially", async function () {
      const { dex, bondManager, buyer, dexAddress, ethers } = await deployFixture();

      const price = ethers.parseEther("1");
      const { seller } = await deployFixture();

      // Use the original fixture's seller
      const { dex: dex2, seller: seller2 } = await deployFixture();

      // Just use the main fixture
      const fix = await deployFixture();
      await fix.dex
        .connect(fix.seller)
        .createSellOrder(1n, 0n, 100n, price, fix.ethers.ZeroAddress, 0n);

      // Fill only 30
      await fix.dex
        .connect(fix.buyer)
        .fillOrder(1n, 30n, { value: price * 30n });

      const order = await fix.dex.getOrder(1n);
      assert.equal(order.amount, 70n);
      assert.equal(order.active, true);

      // Fill remaining 70
      await fix.dex
        .connect(fix.buyer)
        .fillOrder(1n, 70n, { value: price * 70n });

      const orderAfter = await fix.dex.getOrder(1n);
      assert.equal(orderAfter.amount, 0n);
      assert.equal(orderAfter.active, false);
    });

    it("should fill buy order: seller provides bonds, receives payment", async function () {
      const { dex, bondManager, seller, buyer, ethers } = await deployFixture();

      const price = ethers.parseEther("1");
      const amount = 50n;
      const totalPayment = price * amount;

      // Create buy order (buyer escrows BNB)
      await dex
        .connect(buyer)
        .createBuyOrder(1n, 0n, amount, price, ethers.ZeroAddress, 0n, {
          value: totalPayment,
        });

      const sellerBondsBefore = await bondManager.balanceOf(seller.address, 1n, 0n);
      const sellerBalBefore = await ethers.provider.getBalance(seller.address);

      // Seller fills the buy order (provides bonds, receives BNB)
      const tx = await dex.connect(seller).fillOrder(1n, amount);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      // Seller lost bonds
      const sellerBondsAfter = await bondManager.balanceOf(seller.address, 1n, 0n);
      assert.equal(sellerBondsBefore - sellerBondsAfter, amount);

      // Seller received BNB (minus gas and fee)
      const fee = (totalPayment * 50n) / 10000n;
      const sellerBalAfter = await ethers.provider.getBalance(seller.address);
      assert.equal(
        sellerBalAfter - sellerBalBefore,
        totalPayment - fee - gasUsed
      );

      // Buyer received bonds
      const buyerBonds = await bondManager.balanceOf(buyer.address, 1n, 0n);
      assert.equal(buyerBonds, amount);
    });

    it("should revert on inactive order", async function () {
      const { dex, buyer, ethers } = await deployFixture();
      // Order ID 99 doesn't exist
      await assert.rejects(async () => {
        await dex
          .connect(buyer)
          .fillOrder(99n, 10n, { value: ethers.parseEther("10") });
      });
    });

    it("should revert on expired order", async function () {
      const { dex, seller, buyer, ethers, networkHelpers } =
        await deployFixture();

      // Get current block timestamp and set expiry in future
      const block = await ethers.provider.getBlock("latest");
      const expiry = BigInt(block!.timestamp) + 100n;

      const price = ethers.parseEther("1");
      await dex
        .connect(seller)
        .createSellOrder(1n, 0n, 100n, price, ethers.ZeroAddress, expiry);

      // Fast-forward past expiry
      await networkHelpers.time.increase(200);

      await assert.rejects(async () => {
        await dex
          .connect(buyer)
          .fillOrder(1n, 10n, { value: price * 10n });
      });
    });

    it("should revert on zero amount", async function () {
      const { dex, seller, buyer, ethers } = await deployFixture();

      const price = ethers.parseEther("1");
      await dex
        .connect(seller)
        .createSellOrder(1n, 0n, 100n, price, ethers.ZeroAddress, 0n);

      await assert.rejects(async () => {
        await dex.connect(buyer).fillOrder(1n, 0n);
      });
    });

    it("should revert on amount > remaining", async function () {
      const { dex, seller, buyer, ethers } = await deployFixture();

      const price = ethers.parseEther("1");
      await dex
        .connect(seller)
        .createSellOrder(1n, 0n, 100n, price, ethers.ZeroAddress, 0n);

      await assert.rejects(async () => {
        await dex
          .connect(buyer)
          .fillOrder(1n, 200n, { value: price * 200n });
      });
    });

    it("should calculate fee correctly", async function () {
      const { dex, seller, buyer, dexAddress, ethers } = await deployFixture();

      const price = ethers.parseEther("1");
      await dex
        .connect(seller)
        .createSellOrder(1n, 0n, 100n, price, ethers.ZeroAddress, 0n);

      const fillAmount = 100n;
      const totalPayment = price * fillAmount;
      const expectedFee = (totalPayment * 50n) / 10000n;

      await dex
        .connect(buyer)
        .fillOrder(1n, fillAmount, { value: totalPayment });

      assert.equal(
        await dex.collectedFees(ethers.ZeroAddress),
        expectedFee
      );
    });
  });

  // ==================== Cancel Orders ====================

  describe("Cancel Orders", function () {
    it("should cancel sell order and return bonds to maker", async function () {
      const { dex, bondManager, seller, ethers } = await deployFixture();

      const price = ethers.parseEther("1");
      const bondsBefore = await bondManager.balanceOf(seller.address, 1n, 0n);

      await dex
        .connect(seller)
        .createSellOrder(1n, 0n, 100n, price, ethers.ZeroAddress, 0n);

      // Seller lost bonds
      assert.equal(
        await bondManager.balanceOf(seller.address, 1n, 0n),
        bondsBefore - 100n
      );

      // Cancel
      await dex.connect(seller).cancelOrder(1n);

      // Bonds returned
      assert.equal(
        await bondManager.balanceOf(seller.address, 1n, 0n),
        bondsBefore
      );

      // Order inactive
      const order = await dex.getOrder(1n);
      assert.equal(order.active, false);
    });

    it("should cancel buy order and return payment to maker", async function () {
      const { dex, buyer, ethers } = await deployFixture();

      const price = ethers.parseEther("1");
      const amount = 10n;
      const totalCost = price * amount;

      const balBefore = await ethers.provider.getBalance(buyer.address);

      const tx1 = await dex
        .connect(buyer)
        .createBuyOrder(1n, 0n, amount, price, ethers.ZeroAddress, 0n, {
          value: totalCost,
        });
      const receipt1 = await tx1.wait();
      const gas1 = receipt1.gasUsed * receipt1.gasPrice;

      const tx2 = await dex.connect(buyer).cancelOrder(1n);
      const receipt2 = await tx2.wait();
      const gas2 = receipt2.gasUsed * receipt2.gasPrice;

      const balAfter = await ethers.provider.getBalance(buyer.address);

      // Only lost gas
      assert.equal(balBefore - balAfter, gas1 + gas2);
    });

    it("should revert if not maker and not expired", async function () {
      const { dex, seller, buyer, ethers } = await deployFixture();

      const price = ethers.parseEther("1");
      await dex
        .connect(seller)
        .createSellOrder(1n, 0n, 100n, price, ethers.ZeroAddress, 0n);

      // Buyer tries to cancel seller's order
      await assert.rejects(async () => {
        await dex.connect(buyer).cancelOrder(1n);
      });
    });

    it("should allow anyone to cancel expired order", async function () {
      const { dex, bondManager, seller, buyer, ethers, networkHelpers } =
        await deployFixture();

      const block = await ethers.provider.getBlock("latest");
      const expiry = BigInt(block!.timestamp) + 100n;
      const price = ethers.parseEther("1");

      await dex
        .connect(seller)
        .createSellOrder(1n, 0n, 100n, price, ethers.ZeroAddress, expiry);

      // Fast-forward past expiry
      await networkHelpers.time.increase(200);

      // Anyone (buyer) can cancel
      await dex.connect(buyer).cancelOrder(1n);

      const order = await dex.getOrder(1n);
      assert.equal(order.active, false);

      // Bonds returned to seller (maker)
      assert.equal(
        await bondManager.balanceOf(seller.address, 1n, 0n),
        500n
      );
    });
  });

  // ==================== Fees ====================

  describe("Fees", function () {
    it("should accumulate fees correctly across multiple fills", async function () {
      const { dex, seller, buyer, ethers } = await deployFixture();

      const price = ethers.parseEther("1");
      await dex
        .connect(seller)
        .createSellOrder(1n, 0n, 100n, price, ethers.ZeroAddress, 0n);

      // Fill 40
      await dex
        .connect(buyer)
        .fillOrder(1n, 40n, { value: price * 40n });

      // Fill 60
      await dex
        .connect(buyer)
        .fillOrder(1n, 60n, { value: price * 60n });

      const totalPayment = price * 100n;
      const expectedFee = (totalPayment * 50n) / 10000n;
      assert.equal(
        await dex.collectedFees(ethers.ZeroAddress),
        expectedFee
      );
    });

    it("should withdraw fees to feeRecipient", async function () {
      const { dex, seller, buyer, owner, ethers } = await deployFixture();

      const price = ethers.parseEther("1");
      await dex
        .connect(seller)
        .createSellOrder(1n, 0n, 100n, price, ethers.ZeroAddress, 0n);

      await dex
        .connect(buyer)
        .fillOrder(1n, 100n, { value: price * 100n });

      const fee = (price * 100n * 50n) / 10000n;

      const recipientBefore = await ethers.provider.getBalance(owner.address);
      const tx = await dex.connect(owner).withdrawFees(ethers.ZeroAddress);
      const receipt = await tx.wait();
      const gas = receipt.gasUsed * receipt.gasPrice;
      const recipientAfter = await ethers.provider.getBalance(owner.address);

      assert.equal(recipientAfter - recipientBefore, fee - gas);
      assert.equal(await dex.collectedFees(ethers.ZeroAddress), 0n);
    });

    it("should enforce max fee", async function () {
      const { dex, owner } = await deployFixture();

      // Set to max (500 bps = 5%)
      await dex.connect(owner).setProtocolFee(500n);
      assert.equal(await dex.protocolFeeBps(), 500n);

      // Exceed max
      await assert.rejects(async () => {
        await dex.connect(owner).setProtocolFee(501n);
      });
    });
  });

  // ==================== Admin ====================

  describe("Admin", function () {
    it("should only allow owner to set protocol fee", async function () {
      const { dex, seller } = await deployFixture();
      await assert.rejects(async () => {
        await dex.connect(seller).setProtocolFee(100n);
      });
    });

    it("should only allow owner to set fee recipient", async function () {
      const { dex, seller, buyer } = await deployFixture();
      await assert.rejects(async () => {
        await dex.connect(seller).setFeeRecipient(buyer.address);
      });
    });

    it("should return correct order count and order data", async function () {
      const { dex, seller, buyer, ethers } = await deployFixture();

      assert.equal(await dex.getOrderCount(), 0n);

      const price = ethers.parseEther("1");
      await dex
        .connect(seller)
        .createSellOrder(1n, 0n, 50n, price, ethers.ZeroAddress, 0n);

      assert.equal(await dex.getOrderCount(), 1n);

      await dex
        .connect(buyer)
        .createBuyOrder(1n, 0n, 20n, price, ethers.ZeroAddress, 0n, {
          value: price * 20n,
        });

      assert.equal(await dex.getOrderCount(), 2n);

      const order1 = await dex.getOrder(1n);
      assert.equal(order1.isSell, true);
      const order2 = await dex.getOrder(2n);
      assert.equal(order2.isSell, false);
    });
  });

  // ==================== Integration ====================

  describe("Integration", function () {
    it("should complete full flow: issue -> sell order -> fill -> verify", async function () {
      const { dex, bondManager, seller, buyer, ethers } = await deployFixture();

      const price = ethers.parseEther("0.5");
      const sellAmount = 200n;

      // Create sell order
      await dex
        .connect(seller)
        .createSellOrder(1n, 0n, sellAmount, price, ethers.ZeroAddress, 0n);

      // Verify escrow
      assert.equal(
        await bondManager.balanceOf(seller.address, 1n, 0n),
        300n // 500 - 200
      );

      // Fill entire order
      const totalPayment = price * sellAmount;
      await dex
        .connect(buyer)
        .fillOrder(1n, sellAmount, { value: totalPayment });

      // Verify final state
      assert.equal(
        await bondManager.balanceOf(buyer.address, 1n, 0n),
        sellAmount
      );
      const order = await dex.getOrder(1n);
      assert.equal(order.active, false);
      assert.equal(order.amount, 0n);

      // Fee collected
      const fee = (totalPayment * 50n) / 10000n;
      assert.equal(await dex.collectedFees(ethers.ZeroAddress), fee);
    });

    it("should handle ERC20 payment flow end-to-end", async function () {
      const { dex, bondManager, seller, buyer, payToken, ethers } =
        await deployFixture();

      const payTokenAddr = await payToken.getAddress();
      const price = ethers.parseEther("2");
      const amount = 50n;
      const totalPayment = price * amount;

      // Create sell order (ERC20 payment)
      await dex
        .connect(seller)
        .createSellOrder(1n, 0n, amount, price, payTokenAddr, 0n);

      // Buyer fills with ERC20
      const buyerTokenBefore = await payToken.balanceOf(buyer.address);
      const sellerTokenBefore = await payToken.balanceOf(seller.address);

      await dex.connect(buyer).fillOrder(1n, amount);

      const buyerTokenAfter = await payToken.balanceOf(buyer.address);
      const sellerTokenAfter = await payToken.balanceOf(seller.address);

      // Buyer paid
      assert.equal(buyerTokenBefore - buyerTokenAfter, totalPayment);

      // Seller received (minus fee)
      const fee = (totalPayment * 50n) / 10000n;
      assert.equal(sellerTokenAfter - sellerTokenBefore, totalPayment - fee);

      // Buyer got bonds
      assert.equal(
        await bondManager.balanceOf(buyer.address, 1n, 0n),
        amount
      );

      // Fee tracked in ERC20
      assert.equal(await dex.collectedFees(payTokenAddr), fee);
    });

    it("should handle multiple orders on same bond class", async function () {
      const { dex, bondManager, seller, buyer, alice, ethers } =
        await deployFixture();

      const price1 = ethers.parseEther("1");
      const price2 = ethers.parseEther("2");

      // Seller creates sell order at price 1
      await dex
        .connect(seller)
        .createSellOrder(1n, 0n, 100n, price1, ethers.ZeroAddress, 0n);

      // Alice creates sell order at price 2
      await dex
        .connect(alice)
        .createSellOrder(1n, 0n, 50n, price2, ethers.ZeroAddress, 0n);

      assert.equal(await dex.getOrderCount(), 2n);

      // Buyer fills cheaper order first
      await dex
        .connect(buyer)
        .fillOrder(1n, 100n, { value: price1 * 100n });

      // Buyer fills expensive order
      await dex
        .connect(buyer)
        .fillOrder(2n, 50n, { value: price2 * 50n });

      // Buyer has 150 bonds total
      assert.equal(
        await bondManager.balanceOf(buyer.address, 1n, 0n),
        150n
      );

      // Both orders filled
      assert.equal((await dex.getOrder(1n)).active, false);
      assert.equal((await dex.getOrder(2n)).active, false);
    });
  });
});
