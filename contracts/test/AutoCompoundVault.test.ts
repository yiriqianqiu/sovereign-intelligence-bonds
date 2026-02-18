import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("AutoCompoundVault", function () {
  async function deployFixture() {
    const connection = await hre.network.connect();
    const { ethers } = connection;

    const [owner, controller, alice, bob] = await ethers.getSigners();

    // Deploy SIBBondManager
    const BondManager = await ethers.getContractFactory("SIBBondManager");
    const bondManager = await BondManager.deploy();
    await bondManager.setController(controller.address);

    // Deploy mock dividend vault and mock controller
    const MockDividendVault = await ethers.getContractFactory("MockDividendVault");
    const mockDividendVault = await MockDividendVault.deploy();

    const MockController = await ethers.getContractFactory("MockAutoCompoundController");
    const mockController = await MockController.deploy(await bondManager.getAddress());

    // Deploy AutoCompoundVault
    const Vault = await ethers.getContractFactory("AutoCompoundVault");
    const vault = await Vault.deploy(
      await bondManager.getAddress(),
      await mockDividendVault.getAddress(),
      await mockController.getAddress()
    );

    // Setup: create bond class + nonce, issue bonds to alice
    const tx = await bondManager.connect(controller).createBondClass(
      42n, 500n, 86400n, 15000n, 1000n, 0, ethers.ZeroAddress
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find((log: any) => log.fragment?.name === "BondClassCreated");
    const classId = event ? event.args[0] : 1n;

    await bondManager.connect(controller).createNonce(classId, 100n);
    await bondManager.connect(controller).issue(alice.address, [
      { classId, nonceId: 0n, amount: 500n },
    ]);

    // Alice approves vault to transfer her bonds
    const vaultAddr = await vault.getAddress();
    await bondManager.connect(alice).setApprovalFor(vaultAddr, true);

    return { bondManager, mockDividendVault, mockController, vault, owner, controller, alice, bob, ethers, classId };
  }

  // -- deposit --

  describe("deposit", function () {
    it("should deposit bonds into vault", async function () {
      const { vault, bondManager, alice, classId } = await deployFixture();
      await vault.connect(alice).deposit(classId, 0n, 100n);

      assert.equal(await vault.balanceOf(alice.address, classId, 0n), 100n);
      assert.equal(await vault.totalDeposits(classId, 0n), 100n);
      assert.equal(await bondManager.balanceOf(alice.address, classId, 0n), 400n);
    });

    it("should allow multiple deposits", async function () {
      const { vault, alice, classId } = await deployFixture();
      await vault.connect(alice).deposit(classId, 0n, 50n);
      await vault.connect(alice).deposit(classId, 0n, 30n);

      assert.equal(await vault.balanceOf(alice.address, classId, 0n), 80n);
      assert.equal(await vault.totalDeposits(classId, 0n), 80n);
    });

    it("should emit Deposited event", async function () {
      const { vault, alice, classId } = await deployFixture();
      const tx = await vault.connect(alice).deposit(classId, 0n, 100n);
      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => log.fragment?.name === "Deposited");
      assert.ok(event, "Deposited event should be emitted");
      assert.equal(event.args[0], alice.address);
      assert.equal(event.args[1], classId);
      assert.equal(event.args[2], 0n);
      assert.equal(event.args[3], 100n);
    });

    it("should revert on zero amount", async function () {
      const { vault, alice, classId } = await deployFixture();
      await assert.rejects(async () => {
        await vault.connect(alice).deposit(classId, 0n, 0n);
      });
    });
  });

  // -- withdraw --

  describe("withdraw", function () {
    it("should withdraw bonds from vault", async function () {
      const { vault, bondManager, alice, classId } = await deployFixture();
      await vault.connect(alice).deposit(classId, 0n, 100n);
      await vault.connect(alice).withdraw(classId, 0n, 40n);

      assert.equal(await vault.balanceOf(alice.address, classId, 0n), 60n);
      assert.equal(await vault.totalDeposits(classId, 0n), 60n);
      assert.equal(await bondManager.balanceOf(alice.address, classId, 0n), 440n);
    });

    it("should allow full withdrawal", async function () {
      const { vault, bondManager, alice, classId } = await deployFixture();
      await vault.connect(alice).deposit(classId, 0n, 100n);
      await vault.connect(alice).withdraw(classId, 0n, 100n);

      assert.equal(await vault.balanceOf(alice.address, classId, 0n), 0n);
      assert.equal(await vault.totalDeposits(classId, 0n), 0n);
      assert.equal(await bondManager.balanceOf(alice.address, classId, 0n), 500n);
    });

    it("should emit Withdrawn event", async function () {
      const { vault, alice, classId } = await deployFixture();
      await vault.connect(alice).deposit(classId, 0n, 100n);
      const tx = await vault.connect(alice).withdraw(classId, 0n, 50n);
      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => log.fragment?.name === "Withdrawn");
      assert.ok(event, "Withdrawn event should be emitted");
      assert.equal(event.args[3], 50n);
    });

    it("should revert on zero amount", async function () {
      const { vault, alice, classId } = await deployFixture();
      await vault.connect(alice).deposit(classId, 0n, 100n);
      await assert.rejects(async () => {
        await vault.connect(alice).withdraw(classId, 0n, 0n);
      });
    });

    it("should revert on insufficient deposit", async function () {
      const { vault, alice, classId } = await deployFixture();
      await vault.connect(alice).deposit(classId, 0n, 100n);
      await assert.rejects(async () => {
        await vault.connect(alice).withdraw(classId, 0n, 200n);
      });
    });

    it("should revert when no deposit exists", async function () {
      const { vault, alice, classId } = await deployFixture();
      await assert.rejects(async () => {
        await vault.connect(alice).withdraw(classId, 0n, 10n);
      });
    });
  });

  // -- compound --

  describe("compound", function () {
    it("should revert when nothing to compound", async function () {
      const { vault, alice, classId } = await deployFixture();
      await vault.connect(alice).deposit(classId, 0n, 100n);
      await assert.rejects(async () => {
        await vault.connect(alice).compound(classId, 0n, 10n);
      });
    });

    it("should call claim on dividend vault when claimable > 0", async function () {
      const { vault, mockDividendVault, alice, ethers, classId } = await deployFixture();
      await vault.connect(alice).deposit(classId, 0n, 100n);

      const vaultAddr = await vault.getAddress();
      // Fund the mock dividend vault and set claimable
      await alice.sendTransaction({ to: await mockDividendVault.getAddress(), value: ethers.parseEther("1") });
      await mockDividendVault.setClaimable(vaultAddr, classId, 0n, ethers.ZeroAddress, ethers.parseEther("0.1"));

      await vault.connect(alice).compound(classId, 0n, ethers.parseEther("0.05"));

      assert.equal(await mockDividendVault.claimCallCount(), 1n);
      assert.equal(await mockDividendVault.lastClaimClassId(), classId);
    });

    it("should purchase bonds via controller", async function () {
      const { vault, mockDividendVault, mockController, alice, ethers, classId } = await deployFixture();
      await vault.connect(alice).deposit(classId, 0n, 100n);

      const vaultAddr = await vault.getAddress();
      await alice.sendTransaction({ to: await mockDividendVault.getAddress(), value: ethers.parseEther("1") });
      await mockDividendVault.setClaimable(vaultAddr, classId, 0n, ethers.ZeroAddress, ethers.parseEther("0.1"));

      const pricePerBond = ethers.parseEther("0.05");
      await vault.connect(alice).compound(classId, 0n, pricePerBond);

      // 0.1 / 0.05 = 2 bonds purchased
      assert.equal(await mockController.lastClassId(), classId);
      assert.equal(await mockController.lastAmount(), 2n);
      assert.equal(await mockController.totalPurchased(), 2n);
    });

    it("should emit Compounded event", async function () {
      const { vault, mockDividendVault, alice, ethers, classId } = await deployFixture();
      await vault.connect(alice).deposit(classId, 0n, 100n);

      const vaultAddr = await vault.getAddress();
      await alice.sendTransaction({ to: await mockDividendVault.getAddress(), value: ethers.parseEther("1") });
      await mockDividendVault.setClaimable(vaultAddr, classId, 0n, ethers.ZeroAddress, ethers.parseEther("0.1"));

      const tx = await vault.connect(alice).compound(classId, 0n, ethers.parseEther("0.05"));
      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => log.fragment?.name === "Compounded");
      assert.ok(event, "Compounded event should be emitted");
    });
  });

  // -- balanceOf --

  describe("balanceOf", function () {
    it("should return 0 for user with no deposit", async function () {
      const { vault, bob, classId } = await deployFixture();
      assert.equal(await vault.balanceOf(bob.address, classId, 0n), 0n);
    });

    it("should return correct balance after deposit", async function () {
      const { vault, alice, classId } = await deployFixture();
      await vault.connect(alice).deposit(classId, 0n, 75n);
      assert.equal(await vault.balanceOf(alice.address, classId, 0n), 75n);
    });
  });

  // -- constructor --

  describe("constructor", function () {
    it("should revert with zero address for bondManager", async function () {
      const { ethers, mockDividendVault, mockController } = await deployFixture();
      const Vault = await ethers.getContractFactory("AutoCompoundVault");
      await assert.rejects(async () => {
        await Vault.deploy(
          ethers.ZeroAddress,
          await mockDividendVault.getAddress(),
          await mockController.getAddress()
        );
      });
    });
  });
});
