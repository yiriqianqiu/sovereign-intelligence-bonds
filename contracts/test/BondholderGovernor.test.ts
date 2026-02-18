import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("BondholderGovernor", function () {
  async function deployFixture() {
    const connection = await hre.network.connect();
    const { ethers, networkHelpers } = connection;

    const [owner, controller, alice, bob, charlie] =
      await ethers.getSigners();

    // Deploy BondManager
    const BondManager = await ethers.getContractFactory("SIBBondManager");
    const bondManager = await BondManager.deploy();
    await bondManager.setController(controller.address);

    // Deploy Governor
    const Governor = await ethers.getContractFactory("BondholderGovernor");
    const governor = await Governor.deploy(await bondManager.getAddress());

    return { bondManager, governor, owner, controller, alice, bob, charlie, ethers, networkHelpers };
  }

  // Helper: create class + nonce + issue bonds to a holder
  async function setupBondsFor(
    bondManager: any,
    controller: any,
    holder: any,
    ethers: any,
    amount = 100n
  ) {
    const tx = await bondManager
      .connect(controller)
      .createBondClass(42n, 500n, 86400n, 15000n, 1000n, 0, ethers.ZeroAddress);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (log: any) => log.fragment?.name === "BondClassCreated"
    );
    const classId = event ? event.args[0] : 1n;

    await bondManager.connect(controller).createNonce(classId, 100n);
    await bondManager
      .connect(controller)
      .issue(holder.address, [{ classId, nonceId: 0n, amount }]);

    return classId;
  }

  const THREE_DAYS = 3 * 24 * 60 * 60;

  // -- Deployment --

  describe("Deployment", function () {
    it("should set bondManager address correctly", async function () {
      const { bondManager, governor } = await deployFixture();
      const bmAddr = await bondManager.getAddress();
      assert.equal(await governor.bondManager(), bmAddr);
    });

    it("should set deployer as owner", async function () {
      const { governor, owner } = await deployFixture();
      assert.equal(await governor.owner(), owner.address);
    });
  });

  // -- createProposal --

  describe("createProposal", function () {
    it("should create a CouponChange proposal successfully", async function () {
      const { bondManager, governor, controller, alice, ethers } = await deployFixture();
      const classId = await setupBondsFor(bondManager, controller, alice, ethers);

      await governor.connect(alice).createProposal(classId, 0, 500n); // CouponChange

      const p = await governor.getProposal(1n);
      assert.equal(p.classId, classId);
      assert.equal(p.proposalType, 0n); // CouponChange
      assert.equal(p.newValue, 500n);
      assert.equal(p.forVotes, 0n);
      assert.equal(p.againstVotes, 0n);
      assert.equal(p.state, 0n); // Active
      assert.equal(p.proposer, alice.address);
    });

    it("should emit ProposalCreated event", async function () {
      const { bondManager, governor, controller, alice, ethers } = await deployFixture();
      const classId = await setupBondsFor(bondManager, controller, alice, ethers);

      const tx = await governor.connect(alice).createProposal(classId, 0, 500n);
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log: any) => log.fragment?.name === "ProposalCreated"
      );
      assert.ok(event, "ProposalCreated event should be emitted");
      assert.equal(event.args[0], 1n); // proposalId
      assert.equal(event.args[1], classId);
    });

    it("should revert CouponChange with value out of range", async function () {
      const { bondManager, governor, controller, alice, ethers } = await deployFixture();
      const classId = await setupBondsFor(bondManager, controller, alice, ethers);

      // Too low
      await assert.rejects(async () => {
        await governor.connect(alice).createProposal(classId, 0, 50n);
      });
      // Too high
      await assert.rejects(async () => {
        await governor.connect(alice).createProposal(classId, 0, 5000n);
      });
    });

    it("should revert ShareChange with value out of range", async function () {
      const { bondManager, governor, controller, alice, ethers } = await deployFixture();
      const classId = await setupBondsFor(bondManager, controller, alice, ethers);

      // Too low
      await assert.rejects(async () => {
        await governor.connect(alice).createProposal(classId, 1, 500n);
      });
      // Too high
      await assert.rejects(async () => {
        await governor.connect(alice).createProposal(classId, 1, 9500n);
      });
    });

    it("should revert when proposer has no bonds", async function () {
      const { bondManager, governor, controller, alice, bob, ethers } = await deployFixture();
      const classId = await setupBondsFor(bondManager, controller, alice, ethers);

      // bob has no bonds
      await assert.rejects(async () => {
        await governor.connect(bob).createProposal(classId, 0, 500n);
      });
    });
  });

  // -- vote --

  describe("vote", function () {
    it("should record vote with correct weight", async function () {
      const { bondManager, governor, controller, alice, ethers } = await deployFixture();
      const classId = await setupBondsFor(bondManager, controller, alice, ethers, 200n);

      await governor.connect(alice).createProposal(classId, 0, 500n);
      await governor.connect(alice).vote(1n, true);

      const p = await governor.getProposal(1n);
      assert.equal(p.forVotes, 200n);
      assert.equal(p.againstVotes, 0n);
    });

    it("should revert if already voted", async function () {
      const { bondManager, governor, controller, alice, ethers } = await deployFixture();
      const classId = await setupBondsFor(bondManager, controller, alice, ethers);

      await governor.connect(alice).createProposal(classId, 0, 500n);
      await governor.connect(alice).vote(1n, true);

      await assert.rejects(async () => {
        await governor.connect(alice).vote(1n, false);
      });
    });

    it("should revert after voting period ends", async function () {
      const { bondManager, governor, controller, alice, ethers, networkHelpers } = await deployFixture();
      const classId = await setupBondsFor(bondManager, controller, alice, ethers);

      await governor.connect(alice).createProposal(classId, 0, 500n);

      // Fast-forward past voting period
      await networkHelpers.time.increase(THREE_DAYS + 1);

      await assert.rejects(async () => {
        await governor.connect(alice).vote(1n, true);
      });
    });

    it("should revert when voter has no bonds", async function () {
      const { bondManager, governor, controller, alice, bob, ethers } = await deployFixture();
      const classId = await setupBondsFor(bondManager, controller, alice, ethers);

      await governor.connect(alice).createProposal(classId, 0, 500n);

      // bob has no bonds
      await assert.rejects(async () => {
        await governor.connect(bob).vote(1n, true);
      });
    });

    it("should track for and against votes separately", async function () {
      const { bondManager, governor, controller, alice, bob, ethers } = await deployFixture();
      const classId = await setupBondsFor(bondManager, controller, alice, ethers, 100n);

      // Give bob some bonds too
      await bondManager
        .connect(controller)
        .issue(bob.address, [{ classId, nonceId: 0n, amount: 50n }]);

      await governor.connect(alice).createProposal(classId, 0, 500n);
      await governor.connect(alice).vote(1n, true);   // 100 for
      await governor.connect(bob).vote(1n, false);     // 50 against

      const p = await governor.getProposal(1n);
      assert.equal(p.forVotes, 100n);
      assert.equal(p.againstVotes, 50n);
    });
  });

  // -- executeProposal --

  describe("executeProposal", function () {
    it("should pass with quorum and majority", async function () {
      const { bondManager, governor, controller, alice, ethers, networkHelpers } = await deployFixture();
      const classId = await setupBondsFor(bondManager, controller, alice, ethers, 500n);

      await governor.connect(alice).createProposal(classId, 0, 500n);
      await governor.connect(alice).vote(1n, true);

      await networkHelpers.time.increase(THREE_DAYS + 1);
      await governor.executeProposal(1n);

      const p = await governor.getProposal(1n);
      assert.equal(p.state, 1n); // Passed
    });

    it("should reject without quorum", async function () {
      const { bondManager, governor, controller, alice, bob, ethers, networkHelpers } = await deployFixture();
      const classId = await setupBondsFor(bondManager, controller, alice, ethers, 100n);

      // Issue 900 more to bob so alice's 100 is only 10% of 1000 total (quorum is 20%)
      await bondManager
        .connect(controller)
        .issue(bob.address, [{ classId, nonceId: 0n, amount: 900n }]);

      await governor.connect(alice).createProposal(classId, 0, 500n);
      await governor.connect(alice).vote(1n, true); // 100 votes, 1000 total, 10% < 20% quorum

      await networkHelpers.time.increase(THREE_DAYS + 1);
      await governor.executeProposal(1n);

      const p = await governor.getProposal(1n);
      assert.equal(p.state, 2n); // Rejected
    });

    it("should reject when majority votes against", async function () {
      const { bondManager, governor, controller, alice, bob, ethers, networkHelpers } = await deployFixture();
      const classId = await setupBondsFor(bondManager, controller, alice, ethers, 100n);

      // Give bob more bonds so total > quorum and against > for
      await bondManager
        .connect(controller)
        .issue(bob.address, [{ classId, nonceId: 0n, amount: 200n }]);

      await governor.connect(alice).createProposal(classId, 0, 500n);
      await governor.connect(alice).vote(1n, true);  // 100 for
      await governor.connect(bob).vote(1n, false);    // 200 against

      await networkHelpers.time.increase(THREE_DAYS + 1);
      await governor.executeProposal(1n);

      const p = await governor.getProposal(1n);
      assert.equal(p.state, 2n); // Rejected
    });

    it("should revert before voting period ends", async function () {
      const { bondManager, governor, controller, alice, ethers } = await deployFixture();
      const classId = await setupBondsFor(bondManager, controller, alice, ethers);

      await governor.connect(alice).createProposal(classId, 0, 500n);
      await governor.connect(alice).vote(1n, true);

      // Do not fast-forward
      await assert.rejects(async () => {
        await governor.executeProposal(1n);
      });
    });
  });

  // -- cancelProposal --

  describe("cancelProposal", function () {
    it("should allow owner to cancel an active proposal", async function () {
      const { bondManager, governor, controller, alice, owner, ethers } = await deployFixture();
      const classId = await setupBondsFor(bondManager, controller, alice, ethers);

      await governor.connect(alice).createProposal(classId, 0, 500n);
      await governor.connect(owner).cancelProposal(1n);

      const p = await governor.getProposal(1n);
      assert.equal(p.state, 4n); // Cancelled
    });

    it("should revert when non-owner tries to cancel", async function () {
      const { bondManager, governor, controller, alice, ethers } = await deployFixture();
      const classId = await setupBondsFor(bondManager, controller, alice, ethers);

      await governor.connect(alice).createProposal(classId, 0, 500n);

      await assert.rejects(async () => {
        await governor.connect(alice).cancelProposal(1n);
      });
    });
  });

  // -- View functions --

  describe("View functions", function () {
    it("should return correct proposal via getProposal", async function () {
      const { bondManager, governor, controller, alice, ethers } = await deployFixture();
      const classId = await setupBondsFor(bondManager, controller, alice, ethers);

      await governor.connect(alice).createProposal(classId, 2, 1n); // AgentSuspend

      const p = await governor.getProposal(1n);
      assert.equal(p.classId, classId);
      assert.equal(p.proposalType, 2n); // AgentSuspend
      assert.equal(p.newValue, 1n);
      assert.equal(p.proposer, alice.address);
    });

    it("should return correct proposal count", async function () {
      const { bondManager, governor, controller, alice, ethers } = await deployFixture();
      const classId = await setupBondsFor(bondManager, controller, alice, ethers);

      assert.equal(await governor.getProposalCount(), 0n);

      await governor.connect(alice).createProposal(classId, 0, 500n);
      assert.equal(await governor.getProposalCount(), 1n);

      await governor.connect(alice).createProposal(classId, 1, 5000n);
      assert.equal(await governor.getProposalCount(), 2n);
    });
  });
});
