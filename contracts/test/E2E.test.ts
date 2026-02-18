import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("E2E: Full Lifecycle", function () {
  async function deployAll() {
    const connection = await hre.network.connect();
    const { ethers } = connection;
    const [deployer, agentOwner, investor1, investor2, payer] = await ethers.getSigners();

    const registry = await (await ethers.getContractFactory("NFARegistry")).deploy();
    const bondManager = await (await ethers.getContractFactory("SIBBondManager")).deploy();
    const vault = await (await ethers.getContractFactory("DividendVault")).deploy();
    const mockVerifier = await (await ethers.getContractFactory("MockVerifier")).deploy();

    const controller = await (await ethers.getContractFactory("SIBController")).deploy(
      await registry.getAddress(),
      await bondManager.getAddress(),
      await vault.getAddress(),
      await mockVerifier.getAddress()
    );

    const x402 = await (await ethers.getContractFactory("X402PaymentReceiver")).deploy();

    const controllerAddr = await controller.getAddress();
    await registry.setController(controllerAddr);
    await bondManager.setController(controllerAddr);
    await vault.setController(controllerAddr);
    await vault.setBondManager(await bondManager.getAddress());
    await x402.setController(controllerAddr);

    return { registry, bondManager, vault, mockVerifier, controller, x402, ethers, connection, deployer, agentOwner, investor1, investor2, payer };
  }

  it("full lifecycle: mint -> proof -> IPO -> buy -> x402 -> distribute -> claim -> redeem", async function () {
    const { registry, bondManager, vault, controller, x402, ethers, connection, deployer, agentOwner, investor1, investor2, payer } = await deployAll();

    // Step 1: Register NFA agent
    await registry.connect(agentOwner).registerAgent("AlphaBot", "High-frequency DeFi agent", "QmAlpha123", "https://api.alphabot.ai/v1");
    const agentId = 1n;
    assert.equal(await registry.getAgentOwner(agentId), agentOwner.address);

    // Step 2: Activate agent
    await registry.connect(agentOwner).updateState(agentId, 1);
    assert.equal(await registry.getAgentState(agentId), 1n);

    // Step 3: Submit Sharpe ratio proof
    const proof = ethers.randomBytes(128);
    const sharpeRatio = ethers.parseEther("1.8");
    await controller.connect(agentOwner).submitSharpeProof(agentId, proof, [sharpeRatio]);
    const profile = await registry.getRevenueProfile(agentId);
    assert.equal(profile.sharpeRatio, sharpeRatio);
    assert.equal(await registry.creditRatings(agentId), 4n); // AA

    // Step 4: Initiate IPO
    const bondPrice = ethers.parseEther("0.01");
    const maturityPeriod = 86400;
    await controller.connect(agentOwner).initiateIPO(agentId, 500, maturityPeriod, bondPrice, 100);
    assert.equal(await controller.hasIPO(agentId), true);

    // Step 5: Investors purchase bonds
    await controller.connect(investor1).purchaseBonds(agentId, 60, { value: bondPrice * 60n });
    await controller.connect(investor2).purchaseBonds(agentId, 40, { value: bondPrice * 40n });
    assert.equal(await bondManager.balanceOf(investor1.address, agentId, 0), 60n);
    assert.equal(await bondManager.balanceOf(investor2.address, agentId, 0), 40n);
    assert.equal(await bondManager.totalSupply(agentId, 0), 100n);

    // Step 6: x402 payments flow in via X402PaymentReceiver
    const payment1 = ethers.parseEther("1.0");
    const payment2 = ethers.parseEther("2.0");
    await x402.connect(payer).pay(agentId, "/api/signals", { value: payment1 });
    await x402.connect(payer).pay(agentId, "/api/analysis", { value: payment2 });

    const totalPayment = payment1 + payment2;
    const expectedPool = (totalPayment * 7000n) / 10000n;
    assert.equal(await controller.revenuePool(agentId), expectedPool);

    const revenueProfile = await registry.getRevenueProfile(agentId);
    assert.equal(revenueProfile.totalPayments, 2n);

    // Step 7: Distribute dividends
    await controller.distributeDividends(agentId, 0);
    assert.equal(await controller.revenuePool(agentId), 0n);

    // Step 8: Bondholders claim dividends
    const claimable1 = await vault.claimable(investor1.address, agentId, 0);
    const claimable2 = await vault.claimable(investor2.address, agentId, 0);
    assert.ok(claimable1 > 0n);
    assert.ok(claimable2 > 0n);
    const ratio = (claimable1 * 100n) / (claimable1 + claimable2);
    assert.ok(ratio >= 59n && ratio <= 61n, `Ratio should be ~60%, got ${ratio}%`);

    await vault.connect(investor1).claim(agentId, 0);
    await vault.connect(investor2).claim(agentId, 0);

    // Step 9: Fast forward to maturity and redeem
    await connection.provider.send("evm_increaseTime", [maturityPeriod + 1]);
    await connection.provider.send("evm_mine", []);

    await controller.connect(agentOwner).markBondsRedeemable(agentId, 0);
    await deployer.sendTransaction({ to: await controller.getAddress(), value: bondPrice * 100n });

    await controller.connect(investor1).redeemBonds(agentId, 0, 60);
    await controller.connect(investor2).redeemBonds(agentId, 0, 40);

    assert.equal(await bondManager.balanceOf(investor1.address, agentId, 0), 0n);
    assert.equal(await bondManager.balanceOf(investor2.address, agentId, 0), 0n);
    assert.equal(await bondManager.totalSupply(agentId, 0), 0n);
  });

  it("should handle x402 via X402PaymentReceiver correctly", async function () {
    const { registry, controller, x402, ethers, agentOwner, investor1, payer } = await deployAll();

    await registry.connect(agentOwner).registerAgent("Bot", "desc", "hash", "url");
    await registry.connect(agentOwner).updateState(1, 1);
    await controller.connect(agentOwner).initiateIPO(1, 500, 86400, ethers.parseEther("0.01"), 100);
    await controller.connect(investor1).purchaseBonds(1, 10, { value: ethers.parseEther("0.1") });

    await x402.connect(payer).pay(1, "/api/predict", { value: ethers.parseEther("0.5") });

    assert.equal(await x402.getPaymentCount(), 1n);
    const record = await x402.getPayment(0);
    assert.equal(record.payer, payer.address);
    assert.equal(record.agentId, 1n);
    assert.equal(record.endpoint, "/api/predict");
    assert.equal(record.amount, ethers.parseEther("0.5"));
    assert.equal(await x402.agentTotalPayments(1), ethers.parseEther("0.5"));
  });

  it("should handle multiple agents with separate bond classes", async function () {
    const { registry, bondManager, controller, ethers, agentOwner, investor1, investor2 } = await deployAll();

    await registry.connect(agentOwner).registerAgent("Agent1", "desc1", "hash1", "url1");
    await registry.connect(agentOwner).updateState(1, 1);
    await registry.connect(agentOwner).registerAgent("Agent2", "desc2", "hash2", "url2");
    await registry.connect(agentOwner).updateState(2, 1);

    const price = ethers.parseEther("0.01");
    await controller.connect(agentOwner).initiateIPO(1, 500, 86400, price, 100);
    await controller.connect(agentOwner).initiateIPO(2, 800, 86400 * 7, price, 200);

    await controller.connect(investor1).purchaseBonds(1, 10, { value: price * 10n });
    await controller.connect(investor2).purchaseBonds(2, 20, { value: price * 20n });

    assert.equal(await bondManager.balanceOf(investor1.address, 1, 0), 10n);
    assert.equal(await bondManager.balanceOf(investor2.address, 2, 0), 20n);

    const class1 = await bondManager.bondClasses(1);
    const class2 = await bondManager.bondClasses(2);
    assert.equal(class1.agentId, 1n);
    assert.equal(class2.agentId, 2n);
    assert.equal(class1.couponRateBps, 500n);
    assert.equal(class2.couponRateBps, 800n);
  });

  it("should correctly verify ERC-3475 metadata", async function () {
    const { bondManager, registry, controller, ethers, agentOwner } = await deployAll();

    await registry.connect(agentOwner).registerAgent("MetaBot", "desc", "hash", "url");
    await registry.connect(agentOwner).updateState(1, 1);

    await controller.connect(agentOwner).submitSharpeProof(1, ethers.randomBytes(64), [ethers.parseEther("1.5")]);
    await controller.connect(agentOwner).initiateIPO(1, 500, 86400, ethers.parseEther("0.01"), 1000);

    const meta0 = await bondManager.classMetadata(0);
    assert.equal(meta0.title, "Agent ID");
    const meta1 = await bondManager.classMetadata(1);
    assert.equal(meta1.title, "Coupon Rate (bps)");

    const val0 = await bondManager.classValues(1, 0);
    assert.equal(val0.uintValue, 1n);
    const val1 = await bondManager.classValues(1, 1);
    assert.equal(val1.uintValue, 500n);

    const nval3 = await bondManager.nonceValues(1, 0, 3);
    assert.equal(nval3.uintValue, ethers.parseEther("0.01"));
  });

  it("should handle bond transfer correctly", async function () {
    const { registry, bondManager, vault, controller, ethers, agentOwner, investor1, investor2, payer } = await deployAll();

    await registry.connect(agentOwner).registerAgent("TransferBot", "desc", "hash", "url");
    await registry.connect(agentOwner).updateState(1, 1);
    const price = ethers.parseEther("0.01");
    await controller.connect(agentOwner).initiateIPO(1, 500, 86400, price, 100);

    await controller.connect(investor1).purchaseBonds(1, 100, { value: price * 100n });

    await controller.connect(payer).receiveX402Payment(1, { value: ethers.parseEther("1.0") });
    await controller.distributeDividends(1, 0);

    const claimableBefore = await vault.claimable(investor1.address, 1, 0);
    assert.ok(claimableBefore > 0n);

    await vault.connect(investor1).claim(1, 0);

    const txn = [{ classId: 1n, nonceId: 0n, amount: 50n }];
    await bondManager.connect(investor1).transferFrom(investor1.address, investor2.address, txn);

    assert.equal(await bondManager.balanceOf(investor1.address, 1, 0), 50n);
    assert.equal(await bondManager.balanceOf(investor2.address, 1, 0), 50n);
  });
});
