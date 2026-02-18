import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("SIBController", function () {
  async function deployAll() {
    const connection = await hre.network.connect();
    const { ethers } = connection;
    const [owner, agentOwner, investor1, investor2, outsider] = await ethers.getSigners();

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

    return { registry, bondManager, vault, mockVerifier, controller, x402, ethers, connection, owner, agentOwner, investor1, investor2, outsider };
  }

  async function registerAndActivate(registry: any, agentOwner: any) {
    await registry.connect(agentOwner).registerAgent("SharpeBot", "High-freq trading agent", "QmModel123", "https://api.sharpebot.ai");
    const agentId = 1n;
    await registry.connect(agentOwner).updateState(agentId, 1);
    return agentId;
  }

  // -- Deployment --

  it("should deploy with correct addresses", async function () {
    const { controller, registry, bondManager, vault, mockVerifier } = await deployAll();
    assert.equal(await controller.nfaRegistry(), await registry.getAddress());
    assert.equal(await controller.bondManager(), await bondManager.getAddress());
    assert.equal(await controller.dividendVault(), await vault.getAddress());
    assert.equal(await controller.verifier(), await mockVerifier.getAddress());
  });

  it("should reject zero addresses in constructor", async function () {
    const { bondManager, vault, mockVerifier, ethers } = await deployAll();
    const SIBController = await ethers.getContractFactory("SIBController");
    await assert.rejects(
      async () => SIBController.deploy(ethers.ZeroAddress, await bondManager.getAddress(), await vault.getAddress(), await mockVerifier.getAddress()),
      /zero nfaRegistry/
    );
  });

  it("should set default bondholder share to 70%", async function () {
    const { controller } = await deployAll();
    assert.equal(await controller.bondholderShareBps(), 7000n);
  });

  // -- IPO --

  it("should allow agent owner to initiate IPO", async function () {
    const { controller, registry, agentOwner, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, ethers.parseEther("0.01"), 1000);
    assert.equal(await controller.hasIPO(agentId), true);
    assert.equal(await controller.agentBondClass(agentId), agentId);
  });

  it("should reject IPO from non-owner", async function () {
    const { controller, registry, agentOwner, outsider, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    await assert.rejects(
      async () => controller.connect(outsider).initiateIPO(agentId, 500, 86400, ethers.parseEther("0.01"), 1000),
      /not agent owner/
    );
  });

  it("should reject duplicate IPO", async function () {
    const { controller, registry, agentOwner, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400, ethers.parseEther("0.01"), 1000);
    await assert.rejects(
      async () => controller.connect(agentOwner).initiateIPO(agentId, 500, 86400, ethers.parseEther("0.01"), 1000),
      /IPO already exists/
    );
  });

  it("should reject IPO for inactive agent", async function () {
    const { controller, registry, agentOwner, ethers } = await deployAll();
    await registry.connect(agentOwner).registerAgent("Bot", "desc", "hash", "url");
    await assert.rejects(
      async () => controller.connect(agentOwner).initiateIPO(1, 500, 86400, ethers.parseEther("0.01"), 1000),
      /agent not active/
    );
  });

  it("should reject IPO with zero coupon rate", async function () {
    const { controller, registry, agentOwner, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    await assert.rejects(
      async () => controller.connect(agentOwner).initiateIPO(agentId, 0, 86400, ethers.parseEther("0.01"), 1000),
      /invalid coupon rate/
    );
  });

  it("should reject IPO with zero maturity", async function () {
    const { controller, registry, agentOwner, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    await assert.rejects(
      async () => controller.connect(agentOwner).initiateIPO(agentId, 500, 0, ethers.parseEther("0.01"), 1000),
      /zero maturity/
    );
  });

  // -- Bond Purchase --

  it("should allow bond purchase with exact payment", async function () {
    const { controller, registry, bondManager, agentOwner, investor1, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    const price = ethers.parseEther("0.01");
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000);
    await controller.connect(investor1).purchaseBonds(agentId, 10, { value: price * 10n });
    assert.equal(await bondManager.balanceOf(investor1.address, agentId, 0), 10n);
  });

  it("should reject purchase with insufficient payment", async function () {
    const { controller, registry, agentOwner, investor1, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    const price = ethers.parseEther("0.01");
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000);
    await assert.rejects(
      async () => controller.connect(investor1).purchaseBonds(agentId, 10, { value: price * 5n }),
      /insufficient payment/
    );
  });

  it("should reject zero amount purchase", async function () {
    const { controller, registry, agentOwner, investor1, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    const price = ethers.parseEther("0.01");
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000);
    await assert.rejects(
      async () => controller.connect(investor1).purchaseBonds(agentId, 0, { value: price }),
      /zero amount/
    );
  });

  it("should allow multiple investors to purchase", async function () {
    const { controller, registry, bondManager, agentOwner, investor1, investor2, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    const price = ethers.parseEther("0.01");
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000);
    await controller.connect(investor1).purchaseBonds(agentId, 5, { value: price * 5n });
    await controller.connect(investor2).purchaseBonds(agentId, 3, { value: price * 3n });
    assert.equal(await bondManager.balanceOf(investor1.address, agentId, 0), 5n);
    assert.equal(await bondManager.balanceOf(investor2.address, agentId, 0), 3n);
  });

  // -- x402 Revenue --

  it("should receive x402 payment and split revenue", async function () {
    const { controller, registry, agentOwner, outsider, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, ethers.parseEther("0.01"), 1000);

    const payment = ethers.parseEther("1.0");
    const ownerBalanceBefore = await ethers.provider.getBalance(agentOwner.address);
    await controller.connect(outsider).receiveX402Payment(agentId, { value: payment });

    assert.equal(await controller.revenuePool(agentId), ethers.parseEther("0.7"));
    const ownerBalanceAfter = await ethers.provider.getBalance(agentOwner.address);
    assert.equal(ownerBalanceAfter - ownerBalanceBefore, ethers.parseEther("0.3"));
  });

  it("should reject zero x402 payment", async function () {
    const { controller, registry, agentOwner, outsider } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    await assert.rejects(
      async () => controller.connect(outsider).receiveX402Payment(agentId, { value: 0 }),
      /reverted/
    );
  });

  it("should reject payment for agent without IPO", async function () {
    const { controller, registry, agentOwner, outsider, ethers } = await deployAll();
    await registerAndActivate(registry, agentOwner);
    await registry.connect(agentOwner).registerAgent("Bot2", "desc", "hash", "url");
    await registry.connect(agentOwner).updateState(2, 1);
    await assert.rejects(
      async () => controller.connect(outsider).receiveX402Payment(2, { value: ethers.parseEther("0.1") }),
      /no IPO for agent/
    );
  });

  it("should record revenue on NFA registry", async function () {
    const { controller, registry, agentOwner, outsider, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, ethers.parseEther("0.01"), 1000);
    await controller.connect(outsider).receiveX402Payment(agentId, { value: ethers.parseEther("1.0") });
    const profile = await registry.getRevenueProfile(agentId);
    assert.equal(profile.totalEarned, ethers.parseEther("1.0"));
    assert.equal(profile.totalPayments, 1n);
  });

  it("should accumulate multiple x402 payments", async function () {
    const { controller, registry, agentOwner, outsider, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, ethers.parseEther("0.01"), 1000);
    await controller.connect(outsider).receiveX402Payment(agentId, { value: ethers.parseEther("1.0") });
    await controller.connect(outsider).receiveX402Payment(agentId, { value: ethers.parseEther("2.0") });
    assert.equal(await controller.revenuePool(agentId), ethers.parseEther("2.1"));
  });

  // -- Dividend Distribution --

  it("should distribute revenue to vault", async function () {
    const { controller, registry, agentOwner, investor1, outsider, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    const price = ethers.parseEther("0.01");
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000);
    await controller.connect(investor1).purchaseBonds(agentId, 10, { value: price * 10n });
    await controller.connect(outsider).receiveX402Payment(agentId, { value: ethers.parseEther("1.0") });
    assert.ok(await controller.revenuePool(agentId) > 0n);
    await controller.distributeDividends(agentId, 0);
    assert.equal(await controller.revenuePool(agentId), 0n);
  });

  it("should reject distribution with no revenue", async function () {
    const { controller, registry, agentOwner, investor1, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    const price = ethers.parseEther("0.01");
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000);
    await controller.connect(investor1).purchaseBonds(agentId, 10, { value: price * 10n });
    await assert.rejects(
      async () => controller.distributeDividends(agentId, 0),
      /no revenue to distribute/
    );
  });

  it("should allow bondholder to claim after distribution", async function () {
    const { controller, registry, vault, agentOwner, investor1, outsider, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    const price = ethers.parseEther("0.01");
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000);
    await controller.connect(investor1).purchaseBonds(agentId, 10, { value: price * 10n });
    await controller.connect(outsider).receiveX402Payment(agentId, { value: ethers.parseEther("1.0") });
    await controller.distributeDividends(agentId, 0);

    const claimable = await vault.claimable(investor1.address, agentId, 0);
    assert.ok(claimable > 0n);
  });

  // -- Sharpe Proof --

  it("should accept valid Sharpe proof", async function () {
    const { controller, registry, agentOwner, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    const proof = ethers.randomBytes(64);
    const sharpeRatio = ethers.parseEther("1.5");
    await controller.connect(agentOwner).submitSharpeProof(agentId, proof, [sharpeRatio]);
    const profile = await registry.getRevenueProfile(agentId);
    assert.equal(profile.sharpeRatio, sharpeRatio);
  });

  it("should update credit rating based on Sharpe", async function () {
    const { controller, registry, agentOwner, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    await controller.connect(agentOwner).submitSharpeProof(agentId, ethers.randomBytes(64), [ethers.parseEther("2.5")]);
    assert.equal(await registry.creditRatings(agentId), 5n); // AAA
  });

  it("should assign correct credit ratings for all tiers", async function () {
    const { controller, registry, agentOwner, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);

    await controller.connect(agentOwner).submitSharpeProof(agentId, ethers.randomBytes(64), [ethers.parseEther("0.3")]);
    assert.equal(await registry.creditRatings(agentId), 1n); // C

    await controller.connect(agentOwner).submitSharpeProof(agentId, ethers.randomBytes(64), [ethers.parseEther("0.7")]);
    assert.equal(await registry.creditRatings(agentId), 2n); // B

    await controller.connect(agentOwner).submitSharpeProof(agentId, ethers.randomBytes(64), [ethers.parseEther("1.2")]);
    assert.equal(await registry.creditRatings(agentId), 3n); // A

    await controller.connect(agentOwner).submitSharpeProof(agentId, ethers.randomBytes(64), [ethers.parseEther("1.8")]);
    assert.equal(await registry.creditRatings(agentId), 4n); // AA
  });

  it("should reject replay of same proof", async function () {
    const { controller, registry, agentOwner, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    const proof = ethers.randomBytes(64);
    await controller.connect(agentOwner).submitSharpeProof(agentId, proof, [ethers.parseEther("1.5")]);
    await assert.rejects(
      async () => controller.connect(agentOwner).submitSharpeProof(agentId, proof, [ethers.parseEther("1.5")]),
      /proof already used/
    );
  });

  it("should reject proof from non-owner", async function () {
    const { controller, registry, agentOwner, outsider, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    await assert.rejects(
      async () => controller.connect(outsider).submitSharpeProof(agentId, ethers.randomBytes(64), [ethers.parseEther("1.5")]),
      /not agent owner/
    );
  });

  it("should reject instance out of BN254 field", async function () {
    const { controller, registry, agentOwner, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    const outOfField = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
    await assert.rejects(
      async () => controller.connect(agentOwner).submitSharpeProof(agentId, ethers.randomBytes(64), [outOfField]),
      /instance out of field/
    );
  });

  // -- Bond Redemption --

  it("should allow agent owner to mark bonds redeemable", async function () {
    const { controller, registry, bondManager, agentOwner, investor1, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    const price = ethers.parseEther("0.01");
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400, price, 1000);
    await controller.connect(investor1).purchaseBonds(agentId, 10, { value: price * 10n });
    await controller.connect(agentOwner).markBondsRedeemable(agentId, 0);
    const nonce = await bondManager.bondNonces(agentId, 0);
    assert.equal(nonce[4], true);
  });

  it("should reject marking from non-owner", async function () {
    const { controller, registry, agentOwner, investor1, outsider, ethers } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    const price = ethers.parseEther("0.01");
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400, price, 1000);
    await controller.connect(investor1).purchaseBonds(agentId, 10, { value: price * 10n });
    await assert.rejects(
      async () => controller.connect(outsider).markBondsRedeemable(agentId, 0),
      /not agent owner/
    );
  });

  it("should redeem mature + redeemable bonds", async function () {
    const { controller, registry, bondManager, agentOwner, investor1, owner, ethers, connection } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    const price = ethers.parseEther("0.01");
    const maturity = 86400;
    await controller.connect(agentOwner).initiateIPO(agentId, 500, maturity, price, 1000);
    await controller.connect(investor1).purchaseBonds(agentId, 10, { value: price * 10n });
    await controller.connect(agentOwner).markBondsRedeemable(agentId, 0);

    await connection.provider.send("evm_increaseTime", [maturity + 1]);
    await connection.provider.send("evm_mine", []);

    await owner.sendTransaction({ to: await controller.getAddress(), value: price * 10n });
    await controller.connect(investor1).redeemBonds(agentId, 0, 10);
    assert.equal(await bondManager.balanceOf(investor1.address, agentId, 0), 0n);
  });

  it("should reject redemption of non-redeemable bonds", async function () {
    const { controller, registry, agentOwner, investor1, ethers, connection } = await deployAll();
    const agentId = await registerAndActivate(registry, agentOwner);
    const price = ethers.parseEther("0.01");
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400, price, 1000);
    await controller.connect(investor1).purchaseBonds(agentId, 10, { value: price * 10n });

    await connection.provider.send("evm_increaseTime", [86401]);
    await connection.provider.send("evm_mine", []);

    await assert.rejects(
      async () => controller.connect(investor1).redeemBonds(agentId, 0, 10),
      /not redeemable/
    );
  });

  // -- Admin Functions --

  it("should adjust bondholder share", async function () {
    const { controller } = await deployAll();
    await controller.adjustBondholderShare(8000);
    assert.equal(await controller.bondholderShareBps(), 8000n);
  });

  it("should reject share > 100%", async function () {
    const { controller } = await deployAll();
    await assert.rejects(
      async () => controller.adjustBondholderShare(10001),
      /exceeds max/
    );
  });

  it("should only allow owner to adjust share", async function () {
    const { controller, outsider } = await deployAll();
    await assert.rejects(
      async () => controller.connect(outsider).adjustBondholderShare(8000),
      /OwnableUnauthorizedAccount/
    );
  });

  it("should emergency pause and unpause", async function () {
    const { controller, registry, agentOwner, ethers } = await deployAll();
    await controller.emergencyPause();
    assert.equal(await controller.paused(), true);

    const agentId = await registerAndActivate(registry, agentOwner);
    await assert.rejects(
      async () => controller.connect(agentOwner).initiateIPO(agentId, 500, 86400, ethers.parseEther("0.01"), 1000),
      /EnforcedPause/
    );

    await controller.unpause();
    assert.equal(await controller.paused(), false);
  });

  it("should allow changing verifier", async function () {
    const { controller, ethers } = await deployAll();
    const newVerifier = await (await ethers.getContractFactory("MockVerifier")).deploy();
    await controller.setVerifier(await newVerifier.getAddress());
    assert.equal(await controller.verifier(), await newVerifier.getAddress());
  });
});
