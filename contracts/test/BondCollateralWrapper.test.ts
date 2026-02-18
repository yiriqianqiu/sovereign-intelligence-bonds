import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("BondCollateralWrapper", function () {
  async function deployFixture() {
    const connection = await hre.network.connect();
    const { ethers } = connection;

    const [owner, controller, alice, bob] = await ethers.getSigners();

    // Deploy SIBBondManager
    const BondManager = await ethers.getContractFactory("SIBBondManager");
    const bondManager = await BondManager.deploy();
    await bondManager.setController(controller.address);

    // Deploy BondCollateralWrapper
    const Wrapper = await ethers.getContractFactory("BondCollateralWrapper");
    const wrapper = await Wrapper.deploy(await bondManager.getAddress());

    // Create bond class + nonce, issue bonds to alice
    const tx = await bondManager.connect(controller).createBondClass(
      42n, 500n, 86400n, 15000n, 10000n, 0, ethers.ZeroAddress
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find((log: any) => log.fragment?.name === "BondClassCreated");
    const classId = event ? event.args[0] : 1n;

    await bondManager.connect(controller).createNonce(classId, 100n);
    await bondManager.connect(controller).issue(alice.address, [
      { classId, nonceId: 0n, amount: 5000n },
    ]);

    // Alice approves wrapper to transfer her bonds
    const wrapperAddr = await wrapper.getAddress();
    await bondManager.connect(alice).setApprovalFor(wrapperAddr, true);

    return { bondManager, wrapper, owner, controller, alice, bob, ethers, classId };
  }

  // -- wrap --

  describe("wrap", function () {
    it("should wrap bonds into an NFT", async function () {
      const { wrapper, bondManager, alice, classId } = await deployFixture();
      const tx = await wrapper.connect(alice).wrap(classId, 0n, 100n);
      const receipt = await tx.wait();

      // Check NFT ownership
      assert.equal(await wrapper.ownerOf(1n), alice.address);

      // Check wrapped position
      const pos = await wrapper.getWrappedPosition(1n);
      assert.equal(pos.classId, classId);
      assert.equal(pos.nonceId, 0n);
      assert.equal(pos.amount, 100n);

      // Check bond balances
      assert.equal(await bondManager.balanceOf(alice.address, classId, 0n), 4900n);
      const wrapperAddr = await wrapper.getAddress();
      assert.equal(await bondManager.balanceOf(wrapperAddr, classId, 0n), 100n);
    });

    it("should auto-increment token IDs", async function () {
      const { wrapper, alice, classId } = await deployFixture();
      await wrapper.connect(alice).wrap(classId, 0n, 50n);
      await wrapper.connect(alice).wrap(classId, 0n, 75n);

      assert.equal(await wrapper.ownerOf(1n), alice.address);
      assert.equal(await wrapper.ownerOf(2n), alice.address);

      const pos1 = await wrapper.getWrappedPosition(1n);
      const pos2 = await wrapper.getWrappedPosition(2n);
      assert.equal(pos1.amount, 50n);
      assert.equal(pos2.amount, 75n);
    });

    it("should emit Wrapped event", async function () {
      const { wrapper, alice, classId } = await deployFixture();
      const tx = await wrapper.connect(alice).wrap(classId, 0n, 100n);
      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => log.fragment?.name === "Wrapped");
      assert.ok(event, "Wrapped event should be emitted");
      assert.equal(event.args[0], 1n);
      assert.equal(event.args[1], alice.address);
      assert.equal(event.args[2], classId);
      assert.equal(event.args[3], 0n);
      assert.equal(event.args[4], 100n);
    });

    it("should revert on zero amount", async function () {
      const { wrapper, alice, classId } = await deployFixture();
      await assert.rejects(async () => {
        await wrapper.connect(alice).wrap(classId, 0n, 0n);
      });
    });
  });

  // -- unwrap --

  describe("unwrap", function () {
    it("should unwrap NFT and return bonds", async function () {
      const { wrapper, bondManager, alice, classId } = await deployFixture();
      await wrapper.connect(alice).wrap(classId, 0n, 100n);
      await wrapper.connect(alice).unwrap(1n);

      // NFT should be burned
      await assert.rejects(async () => {
        await wrapper.ownerOf(1n);
      });

      // Bonds should be back
      assert.equal(await bondManager.balanceOf(alice.address, classId, 0n), 5000n);
    });

    it("should emit Unwrapped event", async function () {
      const { wrapper, alice, classId } = await deployFixture();
      await wrapper.connect(alice).wrap(classId, 0n, 100n);
      const tx = await wrapper.connect(alice).unwrap(1n);
      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => log.fragment?.name === "Unwrapped");
      assert.ok(event, "Unwrapped event should be emitted");
      assert.equal(event.args[0], 1n);
      assert.equal(event.args[1], alice.address);
    });

    it("should revert when called by non-owner of NFT", async function () {
      const { wrapper, alice, bob, classId } = await deployFixture();
      await wrapper.connect(alice).wrap(classId, 0n, 100n);
      await assert.rejects(async () => {
        await wrapper.connect(bob).unwrap(1n);
      });
    });

    it("should clear wrapped position after unwrap", async function () {
      const { wrapper, alice, classId } = await deployFixture();
      await wrapper.connect(alice).wrap(classId, 0n, 100n);
      await wrapper.connect(alice).unwrap(1n);
      await assert.rejects(async () => {
        await wrapper.getWrappedPosition(1n);
      });
    });
  });

  // -- ERC721 transfer --

  describe("ERC721 transfer", function () {
    it("should allow transfer of wrapped position NFT", async function () {
      const { wrapper, alice, bob, classId } = await deployFixture();
      await wrapper.connect(alice).wrap(classId, 0n, 100n);

      // Transfer NFT from alice to bob
      await wrapper.connect(alice).transferFrom(alice.address, bob.address, 1n);
      assert.equal(await wrapper.ownerOf(1n), bob.address);
    });

    it("should allow new NFT owner to unwrap", async function () {
      const { wrapper, bondManager, alice, bob, classId } = await deployFixture();
      await wrapper.connect(alice).wrap(classId, 0n, 100n);

      // Transfer NFT from alice to bob
      await wrapper.connect(alice).transferFrom(alice.address, bob.address, 1n);

      // Bob unwraps
      await wrapper.connect(bob).unwrap(1n);
      assert.equal(await bondManager.balanceOf(bob.address, classId, 0n), 100n);
    });
  });

  // -- getWrappedPosition --

  describe("getWrappedPosition", function () {
    it("should return correct position data", async function () {
      const { wrapper, alice, classId } = await deployFixture();
      await wrapper.connect(alice).wrap(classId, 0n, 200n);
      const pos = await wrapper.getWrappedPosition(1n);
      assert.equal(pos.classId, classId);
      assert.equal(pos.nonceId, 0n);
      assert.equal(pos.amount, 200n);
    });

    it("should revert for non-existent token", async function () {
      const { wrapper } = await deployFixture();
      await assert.rejects(async () => {
        await wrapper.getWrappedPosition(999n);
      });
    });
  });

  // -- constructor --

  describe("constructor", function () {
    it("should revert with zero address for bondManager", async function () {
      const { ethers } = await deployFixture();
      const Wrapper = await ethers.getContractFactory("BondCollateralWrapper");
      await assert.rejects(async () => {
        await Wrapper.deploy(ethers.ZeroAddress);
      });
    });

    it("should set correct name and symbol", async function () {
      const { wrapper } = await deployFixture();
      assert.equal(await wrapper.name(), "SIB Collateral");
      assert.equal(await wrapper.symbol(), "SIBC");
    });
  });
});
