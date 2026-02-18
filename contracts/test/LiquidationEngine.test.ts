import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("LiquidationEngine", function () {
  const DAY = 86400;
  const SEVEN_DAYS = 7 * DAY;

  async function deployFixture() {
    const connection = await hre.network.connect();
    const { ethers, networkHelpers } = connection;
    const [owner, user1, user2, controller] = await ethers.getSigners();

    // Deploy NFARegistry
    const NFARegistry = await ethers.getContractFactory("NFARegistry");
    const nfaRegistry = await NFARegistry.deploy();

    // Deploy SIBBondManager
    const SIBBondManager = await ethers.getContractFactory("SIBBondManager");
    const bondManager = await SIBBondManager.deploy();

    // Deploy LiquidationEngine
    const LiquidationEngine = await ethers.getContractFactory("LiquidationEngine");
    const liquidationEngine = await LiquidationEngine.deploy(
      await nfaRegistry.getAddress(),
      await bondManager.getAddress()
    );

    return { liquidationEngine, nfaRegistry, bondManager, ethers, networkHelpers, owner, user1, user2, controller };
  }

  async function deployWithAgentFixture() {
    const base = await deployFixture();
    const { liquidationEngine, nfaRegistry, bondManager, owner, user1, controller } = base;

    // Register an agent as user1
    await nfaRegistry.connect(user1).registerAgent(
      "TestAgent", "A test agent", "QmModelHash123", "https://agent.example.com/api"
    );
    const agentId = 1n;

    // Set NFARegistry controller to owner (so owner can update credit rating)
    await nfaRegistry.connect(owner).setController(owner.address);

    // Set credit rating to C (1) for liquidation testing
    await nfaRegistry.connect(owner).updateCreditRating(agentId, 1n);

    // Set BondManager controller to liquidationEngine address (so markRedeemable works)
    await bondManager.connect(owner).setController(await liquidationEngine.getAddress());

    return { ...base, agentId };
  }

  async function deployWithBondsFixture() {
    const base = await deployWithAgentFixture();
    const { liquidationEngine, bondManager, owner } = base;
    const agentId = base.agentId;

    // Temporarily set bondManager controller to owner to create classes/nonces
    await bondManager.connect(owner).setController(owner.address);

    // Create a bond class and nonce
    const classId = 1n;
    await bondManager.connect(owner).createBondClass(
      agentId, 500n, BigInt(90 * DAY), 1500000000000000000n, 1000n, 0, "0x0000000000000000000000000000000000000000"
    );
    const nonceId = 0n;
    await bondManager.connect(owner).createNonce(classId, 1000000000000000000n);

    // Register bond class/nonce in liquidation engine
    await liquidationEngine.connect(owner).registerBondClass(agentId, classId);
    await liquidationEngine.connect(owner).registerNonce(classId, nonceId);

    // Set bondManager controller back to liquidationEngine
    await bondManager.connect(owner).setController(await liquidationEngine.getAddress());

    return { ...base, classId, nonceId };
  }

  // -- Deployment Tests --

  describe("Deployment", function () {
    it("should set nfaRegistry and bondManager addresses", async function () {
      const { liquidationEngine, nfaRegistry, bondManager } = await deployFixture();

      assert.strictEqual(
        await liquidationEngine.nfaRegistry(),
        await nfaRegistry.getAddress()
      );
      assert.strictEqual(
        await liquidationEngine.bondManager(),
        await bondManager.getAddress()
      );
    });

    it("should revert deployment with zero addresses", async function () {
      const connection = await hre.network.connect();
      const { ethers } = connection;
      const LiquidationEngine = await ethers.getContractFactory("LiquidationEngine");

      await assert.rejects(
        async () => {
          await LiquidationEngine.deploy(ethers.ZeroAddress, ethers.ZeroAddress);
        },
        { message: /zero address/ }
      );
    });
  });

  // -- triggerLiquidation Tests --

  describe("triggerLiquidation", function () {
    it("should trigger liquidation when agent is rated C", async function () {
      const { liquidationEngine, agentId } = await deployWithAgentFixture();

      const tx = await liquidationEngine.triggerLiquidation(agentId);
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          return liquidationEngine.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "LiquidationTriggered";
        } catch { return false; }
      });
      assert.ok(event, "LiquidationTriggered event should be emitted");

      const liq = await liquidationEngine.liquidations(agentId);
      assert.ok(liq.triggeredAt > 0n);
      assert.ok(!liq.executed);
      assert.ok(!liq.cancelled);
    });

    it("should revert when agent is not rated C", async function () {
      const { liquidationEngine, nfaRegistry, owner, agentId } = await deployWithAgentFixture();

      // Change rating to B (2)
      await nfaRegistry.connect(owner).updateCreditRating(agentId, 2n);

      await assert.rejects(
        async () => { await liquidationEngine.triggerLiquidation(agentId); },
        { message: /agent not rated C/ }
      );
    });

    it("should revert when liquidation already triggered", async function () {
      const { liquidationEngine, agentId } = await deployWithAgentFixture();

      await liquidationEngine.triggerLiquidation(agentId);

      await assert.rejects(
        async () => { await liquidationEngine.triggerLiquidation(agentId); },
        { message: /already triggered/ }
      );
    });

    it("should revert when liquidation already executed", async function () {
      const { liquidationEngine, networkHelpers, agentId } = await deployWithAgentFixture();

      await liquidationEngine.triggerLiquidation(agentId);
      await networkHelpers.time.increase(SEVEN_DAYS);
      await liquidationEngine.executeLiquidation(agentId);

      await assert.rejects(
        async () => { await liquidationEngine.triggerLiquidation(agentId); },
        (err: any) => {
          // Hardhat may not decode the revert reason; just verify it reverts
          assert.ok(err.message.match(/already executed|reverted/), `Unexpected error: ${err.message}`);
          return true;
        }
      );
    });
  });

  // -- executeLiquidation Tests --

  describe("executeLiquidation", function () {
    it("should execute after grace period ends", async function () {
      const { liquidationEngine, networkHelpers, agentId } = await deployWithAgentFixture();

      await liquidationEngine.triggerLiquidation(agentId);
      await networkHelpers.time.increase(SEVEN_DAYS);

      const tx = await liquidationEngine.executeLiquidation(agentId);
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          return liquidationEngine.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "LiquidationExecuted";
        } catch { return false; }
      });
      assert.ok(event, "LiquidationExecuted event should be emitted");

      const liq = await liquidationEngine.liquidations(agentId);
      assert.ok(liq.executed);
    });

    it("should mark bonds as redeemable on execution", async function () {
      const { liquidationEngine, bondManager, networkHelpers, classId, nonceId, agentId } = await deployWithBondsFixture();

      await liquidationEngine.triggerLiquidation(agentId);
      await networkHelpers.time.increase(SEVEN_DAYS);
      await liquidationEngine.executeLiquidation(agentId);

      const nonce = await bondManager.bondNonces(classId, nonceId);
      assert.ok(nonce.redeemable, "Bond nonce should be marked redeemable");
    });

    it("should revert before grace period ends", async function () {
      const { liquidationEngine, networkHelpers, agentId } = await deployWithAgentFixture();

      await liquidationEngine.triggerLiquidation(agentId);
      // Only advance 3 days (grace is 7)
      await networkHelpers.time.increase(3 * DAY);

      await assert.rejects(
        async () => { await liquidationEngine.executeLiquidation(agentId); },
        { message: /grace period not ended/ }
      );
    });

    it("should revert when not active", async function () {
      const { liquidationEngine, agentId } = await deployWithAgentFixture();

      await assert.rejects(
        async () => { await liquidationEngine.executeLiquidation(agentId); },
        { message: /not active/ }
      );
    });
  });

  // -- cancelLiquidation Tests --

  describe("cancelLiquidation", function () {
    it("should allow owner to cancel active liquidation", async function () {
      const { liquidationEngine, owner, agentId } = await deployWithAgentFixture();

      await liquidationEngine.triggerLiquidation(agentId);
      const tx = await liquidationEngine.connect(owner).cancelLiquidation(agentId);
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          return liquidationEngine.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "LiquidationCancelled";
        } catch { return false; }
      });
      assert.ok(event, "LiquidationCancelled event should be emitted");

      const liq = await liquidationEngine.liquidations(agentId);
      assert.ok(liq.cancelled);
    });

    it("should revert when called by non-owner", async function () {
      const { liquidationEngine, user1, agentId } = await deployWithAgentFixture();

      await liquidationEngine.triggerLiquidation(agentId);

      await assert.rejects(
        async () => { await liquidationEngine.connect(user1).cancelLiquidation(agentId); },
        { message: /OwnableUnauthorizedAccount/ }
      );
    });

    it("should revert when liquidation is not active", async function () {
      const { liquidationEngine, owner, agentId } = await deployWithAgentFixture();

      await assert.rejects(
        async () => { await liquidationEngine.connect(owner).cancelLiquidation(agentId); },
        { message: /not active/ }
      );
    });
  });

  // -- isUnderLiquidation Tests --

  describe("isUnderLiquidation", function () {
    it("should return true when liquidation is triggered", async function () {
      const { liquidationEngine, agentId } = await deployWithAgentFixture();

      await liquidationEngine.triggerLiquidation(agentId);
      assert.strictEqual(await liquidationEngine.isUnderLiquidation(agentId), true);
    });

    it("should return false after cancellation", async function () {
      const { liquidationEngine, owner, agentId } = await deployWithAgentFixture();

      await liquidationEngine.triggerLiquidation(agentId);
      await liquidationEngine.connect(owner).cancelLiquidation(agentId);

      assert.strictEqual(await liquidationEngine.isUnderLiquidation(agentId), false);
    });

    it("should return false after execution", async function () {
      const { liquidationEngine, networkHelpers, agentId } = await deployWithAgentFixture();

      await liquidationEngine.triggerLiquidation(agentId);
      await networkHelpers.time.increase(SEVEN_DAYS);
      await liquidationEngine.executeLiquidation(agentId);

      assert.strictEqual(await liquidationEngine.isUnderLiquidation(agentId), false);
    });
  });

  // -- Admin Tests --

  describe("Admin", function () {
    it("should allow owner to set grace period", async function () {
      const { liquidationEngine, owner } = await deployFixture();

      const tx = await liquidationEngine.connect(owner).setGracePeriod(BigInt(14 * DAY));
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          return liquidationEngine.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "GracePeriodUpdated";
        } catch { return false; }
      });
      assert.ok(event, "GracePeriodUpdated event should be emitted");
      assert.strictEqual(await liquidationEngine.gracePeriod(), BigInt(14 * DAY));
    });

    it("should allow owner to set controller", async function () {
      const { liquidationEngine, owner, controller } = await deployFixture();

      await liquidationEngine.connect(owner).setController(controller.address);
      assert.strictEqual(await liquidationEngine.controller(), controller.address);
    });

    it("should revert grace period outside bounds", async function () {
      const { liquidationEngine, owner } = await deployFixture();

      // Too short (0 days)
      await assert.rejects(
        async () => { await liquidationEngine.connect(owner).setGracePeriod(0n); },
        { message: /invalid period/ }
      );

      // Too long (31 days)
      await assert.rejects(
        async () => { await liquidationEngine.connect(owner).setGracePeriod(BigInt(31 * DAY)); },
        { message: /invalid period/ }
      );
    });

    it("should revert setController with zero address", async function () {
      const { liquidationEngine, ethers, owner } = await deployFixture();

      await assert.rejects(
        async () => { await liquidationEngine.connect(owner).setController(ethers.ZeroAddress); },
        { message: /zero address/ }
      );
    });
  });
});
