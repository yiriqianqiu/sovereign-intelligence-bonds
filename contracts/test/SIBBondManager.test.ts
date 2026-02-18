import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("SIBBondManager", function () {
  async function deployFixture() {
    const connection = await hre.network.connect();
    const { ethers, networkHelpers } = connection;

    const [owner, controller, alice, bob, charlie] =
      await ethers.getSigners();
    const BondManager =
      await ethers.getContractFactory("SIBBondManager");
    const bondManager = await BondManager.deploy();
    await bondManager.setController(controller.address);
    return { bondManager, owner, controller, alice, bob, charlie, ethers, networkHelpers };
  }

  // Helper: create a default bond class via controller (new signature: no classId param, returns classId)
  // agentId=42, couponRateBps=500, maturityPeriod=86400, sharpe=15000, maxSupply=1000, tranche=0(standard), paymentToken=ZeroAddress(BNB)
  async function createDefaultClass(
    bondManager: any,
    controller: any,
    ethers: any,
    agentId = 42n
  ) {
    const tx = await bondManager
      .connect(controller)
      .createBondClass(agentId, 500n, 86400n, 15000n, 1000n, 0, ethers.ZeroAddress);
    const receipt = await tx.wait();
    // Extract classId from BondClassCreated event
    const event = receipt.logs.find(
      (log: any) => log.fragment?.name === "BondClassCreated"
    );
    const classId = event ? event.args[0] : undefined;
    return { tx, receipt, classId };
  }

  // Helper: create a nonce
  async function createDefaultNonce(
    bondManager: any,
    controller: any,
    classId = 1n,
    price = 100n
  ) {
    await bondManager.connect(controller).createNonce(classId, price);
  }

  // -- setController --

  describe("setController", function () {
    it("should allow owner to set controller", async function () {
      const { bondManager, controller } = await deployFixture();
      assert.equal(await bondManager.controller(), controller.address);
    });

    it("should reject non-owner setting controller", async function () {
      const { bondManager, alice } = await deployFixture();
      await assert.rejects(
        async () => {
          await bondManager.connect(alice).setController(alice.address);
        }
      );
    });

    it("should reject zero address", async function () {
      const { bondManager, owner } = await deployFixture();
      await assert.rejects(
        async () => {
          await bondManager
            .connect(owner)
            .setController("0x0000000000000000000000000000000000000000");
        }
      );
    });
  });

  // -- createBondClass --

  describe("createBondClass", function () {
    it("should create a bond class with correct values", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      const { classId } = await createDefaultClass(bondManager, controller, ethers);

      assert.equal(classId, 1n);
      const bc = await bondManager.bondClasses(1n);
      assert.equal(bc.agentId, 42n);
      assert.equal(bc.couponRateBps, 500n);
      assert.equal(bc.maturityPeriod, 86400n);
      assert.equal(bc.sharpeRatioAtIssue, 15000n);
      assert.equal(bc.maxSupply, 1000n);
      assert.equal(bc.tranche, 0n);
      assert.equal(bc.paymentToken, ethers.ZeroAddress);
      assert.equal(bc.exists, true);
    });

    it("should auto-increment classId starting from 1", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      const { classId: id1 } = await createDefaultClass(bondManager, controller, ethers, 42n);
      const { classId: id2 } = await createDefaultClass(bondManager, controller, ethers, 43n);
      const { classId: id3 } = await createDefaultClass(bondManager, controller, ethers, 44n);

      assert.equal(id1, 1n);
      assert.equal(id2, 2n);
      assert.equal(id3, 3n);
    });

    it("should allow multiple classes per agent", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      const { classId: id1 } = await createDefaultClass(bondManager, controller, ethers, 42n);
      // Create second class for same agent
      const tx2 = await bondManager
        .connect(controller)
        .createBondClass(42n, 800n, 172800n, 20000n, 500n, 1, ethers.ZeroAddress);
      const receipt2 = await tx2.wait();
      const event2 = receipt2.logs.find((log: any) => log.fragment?.name === "BondClassCreated");
      const id2 = event2.args[0];

      assert.equal(id1, 1n);
      assert.equal(id2, 2n);

      // Both belong to agent 42
      const agentIds = await bondManager.getAgentClassIds(42n);
      assert.equal(agentIds.length, 2);
      assert.equal(agentIds[0], 1n);
      assert.equal(agentIds[1], 2n);
    });

    it("should revert when called by non-controller", async function () {
      const { bondManager, alice, ethers } = await deployFixture();
      await assert.rejects(async () => {
        await bondManager
          .connect(alice)
          .createBondClass(42n, 500n, 86400n, 15000n, 1000n, 0, ethers.ZeroAddress);
      });
    });

    it("should revert when maxSupply is zero", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      await assert.rejects(async () => {
        await bondManager
          .connect(controller)
          .createBondClass(42n, 500n, 86400n, 15000n, 0n, 0, ethers.ZeroAddress);
      });
    });

    it("should emit BondClassCreated event", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      const { receipt } = await createDefaultClass(bondManager, controller, ethers);
      const event = receipt.logs.find(
        (log: any) => log.fragment?.name === "BondClassCreated"
      );
      assert.ok(event, "BondClassCreated event should be emitted");
    });
  });

  // -- Tranche and PaymentToken --

  describe("tranche and paymentToken", function () {
    it("should create standard tranche (0)", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      await bondManager.connect(controller).createBondClass(1n, 500n, 86400n, 15000n, 1000n, 0, ethers.ZeroAddress);
      const bc = await bondManager.bondClasses(1n);
      assert.equal(bc.tranche, 0n);
    });

    it("should create senior tranche (1)", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      await bondManager.connect(controller).createBondClass(1n, 300n, 86400n, 15000n, 1000n, 1, ethers.ZeroAddress);
      const bc = await bondManager.bondClasses(1n);
      assert.equal(bc.tranche, 1n);
    });

    it("should create junior tranche (2)", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      await bondManager.connect(controller).createBondClass(1n, 800n, 86400n, 15000n, 1000n, 2, ethers.ZeroAddress);
      const bc = await bondManager.bondClasses(1n);
      assert.equal(bc.tranche, 2n);
    });

    it("should store BNB as payment token (ZeroAddress)", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      await bondManager.connect(controller).createBondClass(1n, 500n, 86400n, 15000n, 1000n, 0, ethers.ZeroAddress);
      const bc = await bondManager.bondClasses(1n);
      assert.equal(bc.paymentToken, ethers.ZeroAddress);
    });

    it("should store ERC-20 as payment token", async function () {
      const { bondManager, controller, alice } = await deployFixture();
      // Use alice's address as a mock ERC-20 token address
      await bondManager.connect(controller).createBondClass(1n, 500n, 86400n, 15000n, 1000n, 0, alice.address);
      const bc = await bondManager.bondClasses(1n);
      assert.equal(bc.paymentToken, alice.address);
    });
  });

  // -- getAgentClassIds --

  describe("getAgentClassIds", function () {
    it("should return empty array for agent with no classes", async function () {
      const { bondManager } = await deployFixture();
      const ids = await bondManager.getAgentClassIds(999n);
      assert.equal(ids.length, 0);
    });

    it("should return all class ids for an agent", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      // Create 3 classes for agent 42
      await bondManager.connect(controller).createBondClass(42n, 500n, 86400n, 15000n, 1000n, 0, ethers.ZeroAddress);
      await bondManager.connect(controller).createBondClass(42n, 300n, 172800n, 20000n, 500n, 1, ethers.ZeroAddress);
      await bondManager.connect(controller).createBondClass(42n, 800n, 43200n, 10000n, 2000n, 2, ethers.ZeroAddress);

      const ids = await bondManager.getAgentClassIds(42n);
      assert.equal(ids.length, 3);
      assert.equal(ids[0], 1n);
      assert.equal(ids[1], 2n);
      assert.equal(ids[2], 3n);
    });

    it("should not mix class ids between agents", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      await bondManager.connect(controller).createBondClass(42n, 500n, 86400n, 15000n, 1000n, 0, ethers.ZeroAddress);
      await bondManager.connect(controller).createBondClass(99n, 300n, 86400n, 15000n, 1000n, 0, ethers.ZeroAddress);

      const ids42 = await bondManager.getAgentClassIds(42n);
      const ids99 = await bondManager.getAgentClassIds(99n);
      assert.equal(ids42.length, 1);
      assert.equal(ids42[0], 1n);
      assert.equal(ids99.length, 1);
      assert.equal(ids99[0], 2n);
    });
  });

  // -- getClassesByTranche --

  describe("getClassesByTranche", function () {
    it("should filter classes by tranche", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      // Agent 42: standard, senior, junior, standard
      await bondManager.connect(controller).createBondClass(42n, 500n, 86400n, 15000n, 1000n, 0, ethers.ZeroAddress); // id=1 standard
      await bondManager.connect(controller).createBondClass(42n, 300n, 86400n, 15000n, 1000n, 1, ethers.ZeroAddress); // id=2 senior
      await bondManager.connect(controller).createBondClass(42n, 800n, 86400n, 15000n, 1000n, 2, ethers.ZeroAddress); // id=3 junior
      await bondManager.connect(controller).createBondClass(42n, 400n, 86400n, 15000n, 1000n, 0, ethers.ZeroAddress); // id=4 standard

      const standard = await bondManager.getClassesByTranche(42n, 0);
      assert.equal(standard.length, 2);
      assert.equal(standard[0], 1n);
      assert.equal(standard[1], 4n);

      const senior = await bondManager.getClassesByTranche(42n, 1);
      assert.equal(senior.length, 1);
      assert.equal(senior[0], 2n);

      const junior = await bondManager.getClassesByTranche(42n, 2);
      assert.equal(junior.length, 1);
      assert.equal(junior[0], 3n);
    });

    it("should return empty array when no classes match tranche", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      await bondManager.connect(controller).createBondClass(42n, 500n, 86400n, 15000n, 1000n, 0, ethers.ZeroAddress);

      const senior = await bondManager.getClassesByTranche(42n, 1);
      assert.equal(senior.length, 0);
    });
  });

  // -- createNonce --

  describe("createNonce", function () {
    it("should auto-increment nonceId starting from 0", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);

      await bondManager.connect(controller).createNonce(1n, 100n);
      await bondManager.connect(controller).createNonce(1n, 200n);

      const nonce0 = await bondManager.bondNonces(1n, 0n);
      const nonce1 = await bondManager.bondNonces(1n, 1n);

      assert.equal(nonce0.exists, true);
      assert.equal(nonce0.pricePerBond, 100n);
      assert.equal(nonce1.exists, true);
      assert.equal(nonce1.pricePerBond, 200n);
      assert.equal(await bondManager.nextNonceId(1n), 2n);
    });

    it("should revert if class does not exist", async function () {
      const { bondManager, controller } = await deployFixture();
      await assert.rejects(async () => {
        await bondManager.connect(controller).createNonce(999n, 100n);
      });
    });

    it("should set maturityTimestamp = issueTimestamp + maturityPeriod", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await bondManager.connect(controller).createNonce(1n, 100n);

      const nonce = await bondManager.bondNonces(1n, 0n);
      assert.equal(
        nonce.maturityTimestamp,
        nonce.issueTimestamp + 86400n
      );
    });

    it("should emit BondNonceCreated event", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      const tx = await bondManager
        .connect(controller)
        .createNonce(1n, 100n);
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log: any) => log.fragment?.name === "BondNonceCreated"
      );
      assert.ok(event, "BondNonceCreated event should be emitted");
    });
  });

  // -- issue --

  describe("issue", function () {
    it("should mint bonds to recipient", async function () {
      const { bondManager, controller, alice, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);

      await bondManager
        .connect(controller)
        .issue(alice.address, [{ classId: 1n, nonceId: 0n, amount: 50n }]);

      assert.equal(await bondManager.balanceOf(alice.address, 1n, 0n), 50n);
      assert.equal(await bondManager.totalSupply(1n, 0n), 50n);
    });

    it("should update totalIssued in nonce", async function () {
      const { bondManager, controller, alice, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);

      await bondManager
        .connect(controller)
        .issue(alice.address, [{ classId: 1n, nonceId: 0n, amount: 50n }]);

      const nonce = await bondManager.bondNonces(1n, 0n);
      assert.equal(nonce.totalIssued, 50n);
    });

    it("should revert when exceeding maxSupply", async function () {
      const { bondManager, controller, alice, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);

      await assert.rejects(async () => {
        await bondManager
          .connect(controller)
          .issue(alice.address, [
            { classId: 1n, nonceId: 0n, amount: 1001n },
          ]);
      });
    });

    it("should handle multiple transactions in one call", async function () {
      const { bondManager, controller, alice, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);
      await bondManager.connect(controller).createNonce(1n, 200n);

      await bondManager.connect(controller).issue(alice.address, [
        { classId: 1n, nonceId: 0n, amount: 100n },
        { classId: 1n, nonceId: 1n, amount: 200n },
      ]);

      assert.equal(
        await bondManager.balanceOf(alice.address, 1n, 0n),
        100n
      );
      assert.equal(
        await bondManager.balanceOf(alice.address, 1n, 1n),
        200n
      );
    });

    it("should emit Issue event", async function () {
      const { bondManager, controller, alice, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);

      const tx = await bondManager
        .connect(controller)
        .issue(alice.address, [{ classId: 1n, nonceId: 0n, amount: 10n }]);
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log: any) => log.fragment?.name === "Issue"
      );
      assert.ok(event, "Issue event should be emitted");
    });

    it("should revert when non-controller calls issue", async function () {
      const { bondManager, controller, alice, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);

      await assert.rejects(async () => {
        await bondManager
          .connect(alice)
          .issue(alice.address, [
            { classId: 1n, nonceId: 0n, amount: 10n },
          ]);
      });
    });
  });

  // -- transferFrom --

  describe("transferFrom", function () {
    it("should allow owner to transfer their own bonds", async function () {
      const { bondManager, controller, alice, bob, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);
      await bondManager
        .connect(controller)
        .issue(alice.address, [{ classId: 1n, nonceId: 0n, amount: 100n }]);

      await bondManager
        .connect(alice)
        .transferFrom(alice.address, bob.address, [
          { classId: 1n, nonceId: 0n, amount: 30n },
        ]);

      assert.equal(
        await bondManager.balanceOf(alice.address, 1n, 0n),
        70n
      );
      assert.equal(
        await bondManager.balanceOf(bob.address, 1n, 0n),
        30n
      );
    });

    it("should allow approved operator to transfer", async function () {
      const { bondManager, controller, alice, bob, charlie, ethers } =
        await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);
      await bondManager
        .connect(controller)
        .issue(alice.address, [{ classId: 1n, nonceId: 0n, amount: 100n }]);

      await bondManager.connect(alice).setApprovalFor(bob.address, true);

      await bondManager
        .connect(bob)
        .transferFrom(alice.address, charlie.address, [
          { classId: 1n, nonceId: 0n, amount: 40n },
        ]);

      assert.equal(
        await bondManager.balanceOf(alice.address, 1n, 0n),
        60n
      );
      assert.equal(
        await bondManager.balanceOf(charlie.address, 1n, 0n),
        40n
      );
    });

    it("should revert for unauthorized transfer", async function () {
      const { bondManager, controller, alice, bob, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);
      await bondManager
        .connect(controller)
        .issue(alice.address, [{ classId: 1n, nonceId: 0n, amount: 100n }]);

      await assert.rejects(async () => {
        await bondManager
          .connect(bob)
          .transferFrom(alice.address, bob.address, [
            { classId: 1n, nonceId: 0n, amount: 10n },
          ]);
      });
    });

    it("should revert on insufficient balance", async function () {
      const { bondManager, controller, alice, bob, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);
      await bondManager
        .connect(controller)
        .issue(alice.address, [{ classId: 1n, nonceId: 0n, amount: 10n }]);

      await assert.rejects(async () => {
        await bondManager
          .connect(alice)
          .transferFrom(alice.address, bob.address, [
            { classId: 1n, nonceId: 0n, amount: 50n },
          ]);
      });
    });
  });

  // -- redeem --

  describe("redeem", function () {
    it("should redeem mature and redeemable bonds", async function () {
      const { bondManager, controller, alice, ethers, networkHelpers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);
      await bondManager
        .connect(controller)
        .issue(alice.address, [{ classId: 1n, nonceId: 0n, amount: 50n }]);

      await bondManager.connect(controller).markRedeemable(1n, 0n);

      // Fast-forward past maturity (86400 seconds)
      await networkHelpers.time.increase(86401);

      await bondManager
        .connect(controller)
        .redeem(alice.address, [{ classId: 1n, nonceId: 0n, amount: 20n }]);

      assert.equal(
        await bondManager.balanceOf(alice.address, 1n, 0n),
        30n
      );
      assert.equal(await bondManager.totalSupply(1n, 0n), 30n);
    });

    it("should revert if not mature", async function () {
      const { bondManager, controller, alice, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);
      await bondManager
        .connect(controller)
        .issue(alice.address, [{ classId: 1n, nonceId: 0n, amount: 50n }]);
      await bondManager.connect(controller).markRedeemable(1n, 0n);

      await assert.rejects(async () => {
        await bondManager
          .connect(controller)
          .redeem(alice.address, [
            { classId: 1n, nonceId: 0n, amount: 10n },
          ]);
      });
    });

    it("should revert if not redeemable", async function () {
      const { bondManager, controller, alice, ethers, networkHelpers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);
      await bondManager
        .connect(controller)
        .issue(alice.address, [{ classId: 1n, nonceId: 0n, amount: 50n }]);

      // Fast-forward past maturity but do NOT mark redeemable
      await networkHelpers.time.increase(86401);

      await assert.rejects(async () => {
        await bondManager
          .connect(controller)
          .redeem(alice.address, [
            { classId: 1n, nonceId: 0n, amount: 10n },
          ]);
      });
    });

    it("should revert on insufficient balance", async function () {
      const { bondManager, controller, alice, ethers, networkHelpers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);
      await bondManager
        .connect(controller)
        .issue(alice.address, [{ classId: 1n, nonceId: 0n, amount: 10n }]);
      await bondManager.connect(controller).markRedeemable(1n, 0n);

      await networkHelpers.time.increase(86401);

      await assert.rejects(async () => {
        await bondManager
          .connect(controller)
          .redeem(alice.address, [
            { classId: 1n, nonceId: 0n, amount: 100n },
          ]);
      });
    });
  });

  // -- burn --

  describe("burn", function () {
    it("should allow controller to burn bonds", async function () {
      const { bondManager, controller, alice, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);
      await bondManager
        .connect(controller)
        .issue(alice.address, [{ classId: 1n, nonceId: 0n, amount: 50n }]);

      await bondManager
        .connect(controller)
        .burn(alice.address, [{ classId: 1n, nonceId: 0n, amount: 20n }]);

      assert.equal(
        await bondManager.balanceOf(alice.address, 1n, 0n),
        30n
      );
      assert.equal(await bondManager.totalSupply(1n, 0n), 30n);
    });

    it("should revert for non-controller", async function () {
      const { bondManager, controller, alice, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);
      await bondManager
        .connect(controller)
        .issue(alice.address, [{ classId: 1n, nonceId: 0n, amount: 50n }]);

      await assert.rejects(async () => {
        await bondManager
          .connect(alice)
          .burn(alice.address, [
            { classId: 1n, nonceId: 0n, amount: 10n },
          ]);
      });
    });
  });

  // -- markRedeemable --

  describe("markRedeemable", function () {
    it("should mark nonce as redeemable", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);

      await bondManager.connect(controller).markRedeemable(1n, 0n);
      const nonce = await bondManager.bondNonces(1n, 0n);
      assert.equal(nonce.redeemable, true);
    });

    it("should be idempotent", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);

      await bondManager.connect(controller).markRedeemable(1n, 0n);
      await bondManager.connect(controller).markRedeemable(1n, 0n);

      const nonce = await bondManager.bondNonces(1n, 0n);
      assert.equal(nonce.redeemable, true);
    });

    it("should revert for non-controller", async function () {
      const { bondManager, controller, alice, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);

      await assert.rejects(async () => {
        await bondManager.connect(alice).markRedeemable(1n, 0n);
      });
    });

    it("should emit BondMarkedRedeemable event", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);

      const tx = await bondManager
        .connect(controller)
        .markRedeemable(1n, 0n);
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log: any) => log.fragment?.name === "BondMarkedRedeemable"
      );
      assert.ok(event, "BondMarkedRedeemable event should be emitted");
    });
  });

  // -- approval --

  describe("setApprovalFor / isApprovedFor", function () {
    it("should set and query approval", async function () {
      const { bondManager, alice, bob } = await deployFixture();
      assert.equal(
        await bondManager.isApprovedFor(alice.address, bob.address),
        false
      );

      await bondManager.connect(alice).setApprovalFor(bob.address, true);
      assert.equal(
        await bondManager.isApprovedFor(alice.address, bob.address),
        true
      );
    });

    it("should revoke approval", async function () {
      const { bondManager, alice, bob } = await deployFixture();
      await bondManager.connect(alice).setApprovalFor(bob.address, true);
      await bondManager.connect(alice).setApprovalFor(bob.address, false);
      assert.equal(
        await bondManager.isApprovedFor(alice.address, bob.address),
        false
      );
    });

    it("should revert on self-approval", async function () {
      const { bondManager, alice } = await deployFixture();
      await assert.rejects(async () => {
        await bondManager.connect(alice).setApprovalFor(alice.address, true);
      });
    });

    it("should emit ApprovalFor event", async function () {
      const { bondManager, alice, bob } = await deployFixture();
      const tx = await bondManager
        .connect(alice)
        .setApprovalFor(bob.address, true);
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log: any) => log.fragment?.name === "ApprovalFor"
      );
      assert.ok(event, "ApprovalFor event should be emitted");
    });
  });

  // -- classMetadata / classValues / nonceValues --

  describe("classMetadata", function () {
    it("should return correct metadata for all 7 fields (0-6)", async function () {
      const { bondManager } = await deployFixture();

      const m0 = await bondManager.classMetadata(0n);
      assert.equal(m0.title, "Agent ID");
      assert.equal(m0._type, "uint256");

      const m1 = await bondManager.classMetadata(1n);
      assert.equal(m1.title, "Coupon Rate (bps)");

      const m2 = await bondManager.classMetadata(2n);
      assert.equal(m2.title, "Maturity Period");

      const m3 = await bondManager.classMetadata(3n);
      assert.equal(m3.title, "Sharpe Ratio at Issue");

      const m4 = await bondManager.classMetadata(4n);
      assert.equal(m4.title, "Max Supply");

      const m5 = await bondManager.classMetadata(5n);
      assert.equal(m5.title, "Tranche");
      assert.equal(m5._type, "uint8");

      const m6 = await bondManager.classMetadata(6n);
      assert.equal(m6.title, "Payment Token");
      assert.equal(m6._type, "address");
    });

    it("should revert for invalid metadataId (7)", async function () {
      const { bondManager } = await deployFixture();
      await assert.rejects(async () => {
        await bondManager.classMetadata(7n);
      });
    });
  });

  describe("classValues", function () {
    it("should return correct values for a class (0-4)", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);

      const v0 = await bondManager.classValues(1n, 0n);
      assert.equal(v0.uintValue, 42n); // agentId

      const v1 = await bondManager.classValues(1n, 1n);
      assert.equal(v1.uintValue, 500n); // couponRateBps

      const v4 = await bondManager.classValues(1n, 4n);
      assert.equal(v4.uintValue, 1000n); // maxSupply
    });

    it("should return tranche via classValues metadataId 5", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      // Create senior tranche
      await bondManager.connect(controller).createBondClass(42n, 300n, 86400n, 15000n, 1000n, 1, ethers.ZeroAddress);

      const v5 = await bondManager.classValues(1n, 5n);
      assert.equal(v5.uintValue, 1n); // senior
    });

    it("should return paymentToken via classValues metadataId 6", async function () {
      const { bondManager, controller, alice, ethers } = await deployFixture();
      await bondManager.connect(controller).createBondClass(42n, 500n, 86400n, 15000n, 1000n, 0, alice.address);

      const v6 = await bondManager.classValues(1n, 6n);
      assert.equal(v6.addressValue, alice.address);
    });

    it("should return ZeroAddress for BNB payment token", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);

      const v6 = await bondManager.classValues(1n, 6n);
      assert.equal(v6.addressValue, ethers.ZeroAddress);
    });

    it("should revert for non-existent class", async function () {
      const { bondManager } = await deployFixture();
      await assert.rejects(async () => {
        await bondManager.classValues(999n, 0n);
      });
    });

    it("should revert for invalid metadataId (7)", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);

      await assert.rejects(async () => {
        await bondManager.classValues(1n, 7n);
      });
    });
  });

  describe("nonceValues", function () {
    it("should return correct values for a nonce", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);

      const v3 = await bondManager.nonceValues(1n, 0n, 3n);
      assert.equal(v3.uintValue, 100n); // pricePerBond

      const v4 = await bondManager.nonceValues(1n, 0n, 4n);
      assert.equal(v4.boolValue, false); // redeemable initially false
    });

    it("should revert for non-existent nonce", async function () {
      const { bondManager, controller, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await assert.rejects(async () => {
        await bondManager.nonceValues(1n, 99n, 0n);
      });
    });
  });

  // -- balanceOf / totalSupply --

  describe("balanceOf / totalSupply", function () {
    it("should return 0 for uninitialized balances", async function () {
      const { bondManager, alice } = await deployFixture();
      assert.equal(
        await bondManager.balanceOf(alice.address, 1n, 0n),
        0n
      );
      assert.equal(await bondManager.totalSupply(1n, 0n), 0n);
    });

    it("should track supply across multiple issuances", async function () {
      const { bondManager, controller, alice, bob, ethers } = await deployFixture();
      await createDefaultClass(bondManager, controller, ethers);
      await createDefaultNonce(bondManager, controller);

      await bondManager
        .connect(controller)
        .issue(alice.address, [{ classId: 1n, nonceId: 0n, amount: 100n }]);
      await bondManager
        .connect(controller)
        .issue(bob.address, [{ classId: 1n, nonceId: 0n, amount: 200n }]);

      assert.equal(await bondManager.totalSupply(1n, 0n), 300n);
      assert.equal(
        await bondManager.balanceOf(alice.address, 1n, 0n),
        100n
      );
      assert.equal(
        await bondManager.balanceOf(bob.address, 1n, 0n),
        200n
      );
    });
  });

  // -- setDividendVault --

  describe("setDividendVault", function () {
    it("should allow owner to set dividend vault", async function () {
      const { bondManager, owner, alice } = await deployFixture();
      await bondManager.connect(owner).setDividendVault(alice.address);
      assert.equal(await bondManager.dividendVault(), alice.address);
    });

    it("should reject non-owner", async function () {
      const { bondManager, alice } = await deployFixture();
      await assert.rejects(async () => {
        await bondManager.connect(alice).setDividendVault(alice.address);
      });
    });

    it("should reject zero address", async function () {
      const { bondManager, owner } = await deployFixture();
      await assert.rejects(async () => {
        await bondManager.connect(owner).setDividendVault("0x0000000000000000000000000000000000000000");
      });
    });
  });
});
