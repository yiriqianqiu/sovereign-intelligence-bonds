import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("IndexBond", function () {
  async function deployFixture() {
    const connection = await hre.network.connect();
    const { ethers } = connection;

    const [owner, controller, alice, bob] = await ethers.getSigners();

    // Deploy SIBBondManager
    const BondManager = await ethers.getContractFactory("SIBBondManager");
    const bondManager = await BondManager.deploy();
    await bondManager.setController(controller.address);

    // Deploy IndexBond
    const IndexBondFactory = await ethers.getContractFactory("IndexBond");
    const indexBond = await IndexBondFactory.deploy(
      await bondManager.getAddress(),
      controller.address
    );

    // Create 3 bond classes and nonces, issue bonds to alice
    const classIds: bigint[] = [];
    for (let i = 0; i < 3; i++) {
      const tx = await bondManager.connect(controller).createBondClass(
        BigInt(42 + i), 500n, 86400n, 15000n, 10000n, 0, ethers.ZeroAddress
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => log.fragment?.name === "BondClassCreated");
      classIds.push(event.args[0]);

      await bondManager.connect(controller).createNonce(classIds[i], 100n);
      await bondManager.connect(controller).issue(alice.address, [
        { classId: classIds[i], nonceId: 0n, amount: 5000n },
      ]);
    }

    // Alice approves IndexBond to transfer her bonds
    const indexBondAddr = await indexBond.getAddress();
    await bondManager.connect(alice).setApprovalFor(indexBondAddr, true);

    return { bondManager, indexBond, owner, controller, alice, bob, ethers, classIds };
  }

  // -- createIndex --

  describe("createIndex", function () {
    it("should create an index with correct parameters", async function () {
      const { indexBond, owner, classIds } = await deployFixture();
      const tx = await indexBond.connect(owner).createIndex(
        "Top 3 Agents",
        classIds,
        [5000n, 3000n, 2000n],
        [0n, 0n, 0n]
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => log.fragment?.name === "IndexCreated");
      assert.ok(event, "IndexCreated event should be emitted");
      assert.equal(event.args[0], 1n); // indexId
      assert.equal(event.args[1], "Top 3 Agents");
      assert.equal(event.args[2], 3n); // componentCount

      const [name, retClassIds, weights, nonceIds, active] = await indexBond.getIndex(1n);
      assert.equal(name, "Top 3 Agents");
      assert.equal(retClassIds.length, 3);
      assert.equal(weights[0], 5000n);
      assert.equal(weights[1], 3000n);
      assert.equal(weights[2], 2000n);
      assert.equal(active, true);
    });

    it("should auto-increment index IDs", async function () {
      const { indexBond, owner, classIds } = await deployFixture();
      await indexBond.connect(owner).createIndex("Index A", classIds, [5000n, 3000n, 2000n], [0n, 0n, 0n]);
      await indexBond.connect(owner).createIndex("Index B", classIds, [3333n, 3334n, 3333n], [0n, 0n, 0n]);

      assert.equal(await indexBond.getIndexCount(), 2n);

      const [nameA] = await indexBond.getIndex(1n);
      const [nameB] = await indexBond.getIndex(2n);
      assert.equal(nameA, "Index A");
      assert.equal(nameB, "Index B");
    });

    it("should revert if weights do not sum to 10000", async function () {
      const { indexBond, owner, classIds } = await deployFixture();
      await assert.rejects(async () => {
        await indexBond.connect(owner).createIndex(
          "Bad Index", classIds, [5000n, 3000n, 1000n], [0n, 0n, 0n]
        );
      });
    });

    it("should revert with zero weight", async function () {
      const { indexBond, owner, classIds } = await deployFixture();
      await assert.rejects(async () => {
        await indexBond.connect(owner).createIndex(
          "Bad Index", classIds, [5000n, 5000n, 0n], [0n, 0n, 0n]
        );
      });
    });

    it("should revert with 0 components", async function () {
      const { indexBond, owner } = await deployFixture();
      await assert.rejects(async () => {
        await indexBond.connect(owner).createIndex("Empty", [], [], []);
      });
    });

    it("should revert with >10 components", async function () {
      const { indexBond, owner } = await deployFixture();
      const ids = Array.from({ length: 11 }, (_, i) => BigInt(i + 1));
      const weights = Array.from({ length: 11 }, () => 909n);
      weights[0] = 910n; // adjust to sum 10000
      const nonces = Array.from({ length: 11 }, () => 0n);
      await assert.rejects(async () => {
        await indexBond.connect(owner).createIndex("Too Many", ids, weights, nonces);
      });
    });

    it("should revert with length mismatch", async function () {
      const { indexBond, owner, classIds } = await deployFixture();
      await assert.rejects(async () => {
        await indexBond.connect(owner).createIndex(
          "Mismatch", classIds, [5000n, 5000n], [0n, 0n, 0n]
        );
      });
    });

    it("should revert when non-owner calls", async function () {
      const { indexBond, alice, classIds } = await deployFixture();
      await assert.rejects(async () => {
        await indexBond.connect(alice).createIndex(
          "Unauthorized", classIds, [5000n, 3000n, 2000n], [0n, 0n, 0n]
        );
      });
    });
  });

  // -- mintIndex --

  describe("mintIndex", function () {
    it("should transfer proportional bonds from user to contract", async function () {
      const { indexBond, bondManager, owner, alice, classIds } = await deployFixture();
      await indexBond.connect(owner).createIndex(
        "Top 3", classIds, [5000n, 3000n, 2000n], [0n, 0n, 0n]
      );

      // Mint 10000 shares -> class1: 5000, class2: 3000, class3: 2000
      await indexBond.connect(alice).mintIndex(1n, 10000n);

      assert.equal(await bondManager.balanceOf(alice.address, classIds[0], 0n), 0n);   // 5000 - 5000
      assert.equal(await bondManager.balanceOf(alice.address, classIds[1], 0n), 2000n); // 5000 - 3000
      assert.equal(await bondManager.balanceOf(alice.address, classIds[2], 0n), 3000n); // 5000 - 2000

      assert.equal(await indexBond.userShares(alice.address, 1n), 10000n);
      assert.equal(await indexBond.totalShares(1n), 10000n);
    });

    it("should emit IndexMinted event", async function () {
      const { indexBond, owner, alice, classIds } = await deployFixture();
      await indexBond.connect(owner).createIndex(
        "Top 3", classIds, [5000n, 3000n, 2000n], [0n, 0n, 0n]
      );
      const tx = await indexBond.connect(alice).mintIndex(1n, 1000n);
      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => log.fragment?.name === "IndexMinted");
      assert.ok(event, "IndexMinted event should be emitted");
      assert.equal(event.args[0], 1n);
      assert.equal(event.args[1], alice.address);
      assert.equal(event.args[2], 1000n);
    });

    it("should revert on zero shares", async function () {
      const { indexBond, owner, alice, classIds } = await deployFixture();
      await indexBond.connect(owner).createIndex(
        "Top 3", classIds, [5000n, 3000n, 2000n], [0n, 0n, 0n]
      );
      await assert.rejects(async () => {
        await indexBond.connect(alice).mintIndex(1n, 0n);
      });
    });

    it("should revert on inactive index", async function () {
      const { indexBond, owner, alice, classIds } = await deployFixture();
      await indexBond.connect(owner).createIndex(
        "Top 3", classIds, [5000n, 3000n, 2000n], [0n, 0n, 0n]
      );
      await indexBond.connect(owner).deactivateIndex(1n);
      await assert.rejects(async () => {
        await indexBond.connect(alice).mintIndex(1n, 1000n);
      });
    });
  });

  // -- redeemIndex --

  describe("redeemIndex", function () {
    it("should return proportional bonds to user", async function () {
      const { indexBond, bondManager, owner, alice, classIds } = await deployFixture();
      await indexBond.connect(owner).createIndex(
        "Top 3", classIds, [5000n, 3000n, 2000n], [0n, 0n, 0n]
      );

      // Also approve indexBond to transfer bonds back (it already owns them, needs to transfer FROM itself)
      // The IndexBond contract transfers from itself, so it's msg.sender == from, which is allowed.

      await indexBond.connect(alice).mintIndex(1n, 10000n);
      await indexBond.connect(alice).redeemIndex(1n, 10000n);

      // All bonds should be back
      assert.equal(await bondManager.balanceOf(alice.address, classIds[0], 0n), 5000n);
      assert.equal(await bondManager.balanceOf(alice.address, classIds[1], 0n), 5000n);
      assert.equal(await bondManager.balanceOf(alice.address, classIds[2], 0n), 5000n);

      assert.equal(await indexBond.userShares(alice.address, 1n), 0n);
      assert.equal(await indexBond.totalShares(1n), 0n);
    });

    it("should allow partial redemption", async function () {
      const { indexBond, bondManager, owner, alice, classIds } = await deployFixture();
      await indexBond.connect(owner).createIndex(
        "Top 3", classIds, [5000n, 3000n, 2000n], [0n, 0n, 0n]
      );

      await indexBond.connect(alice).mintIndex(1n, 10000n);
      await indexBond.connect(alice).redeemIndex(1n, 5000n);

      // Half returned: class1: 2500, class2: 1500, class3: 1000
      assert.equal(await bondManager.balanceOf(alice.address, classIds[0], 0n), 2500n);
      assert.equal(await bondManager.balanceOf(alice.address, classIds[1], 0n), 3500n); // 2000 + 1500
      assert.equal(await bondManager.balanceOf(alice.address, classIds[2], 0n), 4000n); // 3000 + 1000

      assert.equal(await indexBond.userShares(alice.address, 1n), 5000n);
    });

    it("should emit IndexRedeemed event", async function () {
      const { indexBond, owner, alice, classIds } = await deployFixture();
      await indexBond.connect(owner).createIndex(
        "Top 3", classIds, [5000n, 3000n, 2000n], [0n, 0n, 0n]
      );
      await indexBond.connect(alice).mintIndex(1n, 10000n);
      const tx = await indexBond.connect(alice).redeemIndex(1n, 5000n);
      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => log.fragment?.name === "IndexRedeemed");
      assert.ok(event, "IndexRedeemed event should be emitted");
    });

    it("should revert on zero shares", async function () {
      const { indexBond, owner, alice, classIds } = await deployFixture();
      await indexBond.connect(owner).createIndex(
        "Top 3", classIds, [5000n, 3000n, 2000n], [0n, 0n, 0n]
      );
      await assert.rejects(async () => {
        await indexBond.connect(alice).redeemIndex(1n, 0n);
      });
    });

    it("should revert on insufficient shares", async function () {
      const { indexBond, owner, alice, classIds } = await deployFixture();
      await indexBond.connect(owner).createIndex(
        "Top 3", classIds, [5000n, 3000n, 2000n], [0n, 0n, 0n]
      );
      await indexBond.connect(alice).mintIndex(1n, 1000n);
      await assert.rejects(async () => {
        await indexBond.connect(alice).redeemIndex(1n, 2000n);
      });
    });
  });

  // -- rebalance --

  describe("rebalance", function () {
    it("should update weights", async function () {
      const { indexBond, owner, classIds } = await deployFixture();
      await indexBond.connect(owner).createIndex(
        "Top 3", classIds, [5000n, 3000n, 2000n], [0n, 0n, 0n]
      );

      await indexBond.connect(owner).rebalance(1n, [3333n, 3334n, 3333n]);

      const [, , weights] = await indexBond.getIndex(1n);
      assert.equal(weights[0], 3333n);
      assert.equal(weights[1], 3334n);
      assert.equal(weights[2], 3333n);
    });

    it("should emit IndexRebalanced event", async function () {
      const { indexBond, owner, classIds } = await deployFixture();
      await indexBond.connect(owner).createIndex(
        "Top 3", classIds, [5000n, 3000n, 2000n], [0n, 0n, 0n]
      );
      const tx = await indexBond.connect(owner).rebalance(1n, [3333n, 3334n, 3333n]);
      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => log.fragment?.name === "IndexRebalanced");
      assert.ok(event, "IndexRebalanced event should be emitted");
    });

    it("should revert if weights do not sum to 10000", async function () {
      const { indexBond, owner, classIds } = await deployFixture();
      await indexBond.connect(owner).createIndex(
        "Top 3", classIds, [5000n, 3000n, 2000n], [0n, 0n, 0n]
      );
      await assert.rejects(async () => {
        await indexBond.connect(owner).rebalance(1n, [5000n, 5000n, 5000n]);
      });
    });

    it("should revert on length mismatch", async function () {
      const { indexBond, owner, classIds } = await deployFixture();
      await indexBond.connect(owner).createIndex(
        "Top 3", classIds, [5000n, 3000n, 2000n], [0n, 0n, 0n]
      );
      await assert.rejects(async () => {
        await indexBond.connect(owner).rebalance(1n, [5000n, 5000n]);
      });
    });

    it("should revert when non-owner calls", async function () {
      const { indexBond, owner, alice, classIds } = await deployFixture();
      await indexBond.connect(owner).createIndex(
        "Top 3", classIds, [5000n, 3000n, 2000n], [0n, 0n, 0n]
      );
      await assert.rejects(async () => {
        await indexBond.connect(alice).rebalance(1n, [3333n, 3334n, 3333n]);
      });
    });
  });

  // -- deactivateIndex --

  describe("deactivateIndex", function () {
    it("should deactivate an index", async function () {
      const { indexBond, owner, classIds } = await deployFixture();
      await indexBond.connect(owner).createIndex(
        "Top 3", classIds, [5000n, 3000n, 2000n], [0n, 0n, 0n]
      );
      await indexBond.connect(owner).deactivateIndex(1n);

      const [, , , , active] = await indexBond.getIndex(1n);
      assert.equal(active, false);
    });
  });

  // -- view functions --

  describe("view functions", function () {
    it("getIndexCount should return 0 initially", async function () {
      const { indexBond } = await deployFixture();
      assert.equal(await indexBond.getIndexCount(), 0n);
    });

    it("getIndex should return all fields", async function () {
      const { indexBond, owner, classIds } = await deployFixture();
      await indexBond.connect(owner).createIndex(
        "Top 3", classIds, [5000n, 3000n, 2000n], [0n, 0n, 0n]
      );

      const [name, retClassIds, weights, nonceIds, active] = await indexBond.getIndex(1n);
      assert.equal(name, "Top 3");
      assert.equal(retClassIds.length, 3);
      assert.equal(weights.length, 3);
      assert.equal(nonceIds.length, 3);
      assert.equal(active, true);
    });
  });
});
