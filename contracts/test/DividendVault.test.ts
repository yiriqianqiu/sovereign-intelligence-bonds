import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("DividendVault", function () {
  async function deployFixture() {
    const connection = await hre.network.connect();
    const { ethers } = connection;
    const [owner, controller, alice, bob, carol] = await ethers.getSigners();

    const BondManager = await ethers.getContractFactory("SIBBondManager");
    const bondManager = await BondManager.deploy();

    const Vault = await ethers.getContractFactory("DividendVault");
    const vault = await Vault.deploy();

    await vault.setBondManager(await bondManager.getAddress());
    await vault.setController(controller.address);
    await bondManager.setController(controller.address);

    return { vault, bondManager, ethers, owner, controller, alice, bob, carol };
  }

  // Helper: create bond class + nonce, issue bonds to holders
  async function setupBonds(
    bondManager: any,
    ethers: any,
    controller: any,
    classId: number,
    holders: { address: string; amount: bigint }[]
  ) {
    const totalAmount = holders.reduce((s, h) => s + h.amount, 0n);

    await bondManager
      .connect(controller)
      .createBondClass(
        1,            // agentId
        500,          // couponRateBps (5%)
        86400 * 365,  // maturityPeriod (1 year)
        15000,        // sharpeRatioAtIssue (1.5 scaled 1e4)
        totalAmount * 10n,  // maxSupply
        0,            // tranche (standard)
        ethers.ZeroAddress  // paymentToken (BNB)
      );

    await bondManager
      .connect(controller)
      .createNonce(classId, ethers.parseEther("0.01"));

    const NONCE_ID = 0;

    for (const h of holders) {
      await bondManager
        .connect(controller)
        .issue(h.address, [{ classId, nonceId: NONCE_ID, amount: h.amount }]);
    }

    return NONCE_ID;
  }

  const CLASS_ID = 1;
  const NONCE_ID = 0;
  const ONE_ETHER = 10n ** 18n;
  const HALF_ETHER = 5n * 10n ** 17n;
  const QUARTER_ETHER = 25n * 10n ** 16n;

  // -- Deployment --

  it("should deploy with correct owner", async () => {
    const { vault, owner } = await deployFixture();
    assert.equal(await vault.owner(), owner.address);
  });

  it("should set controller and bondManager", async () => {
    const { vault, bondManager, controller } = await deployFixture();
    assert.equal(await vault.controller(), controller.address);
    assert.equal(await vault.bondManager(), await bondManager.getAddress());
  });

  // -- Access Control --

  it("should reject deposit from non-controller", async () => {
    const { vault, alice } = await deployFixture();
    await assert.rejects(
      async () =>
        vault.connect(alice).deposit(CLASS_ID, NONCE_ID, { value: ONE_ETHER }),
      /caller is not controller/
    );
  });

  it("should reject setController from non-owner", async () => {
    const { vault, alice } = await deployFixture();
    await assert.rejects(
      async () => vault.connect(alice).setController(alice.address),
      /OwnableUnauthorizedAccount/
    );
  });

  it("should reject setBondManager from non-owner", async () => {
    const { vault, alice } = await deployFixture();
    await assert.rejects(
      async () => vault.connect(alice).setBondManager(alice.address),
      /OwnableUnauthorizedAccount/
    );
  });

  it("should reject setController with zero address", async () => {
    const { vault, ethers } = await deployFixture();
    await assert.rejects(
      async () => vault.setController(ethers.ZeroAddress),
      /zero address/
    );
  });

  it("should reject setBondManager with zero address", async () => {
    const { vault, ethers } = await deployFixture();
    await assert.rejects(
      async () => vault.setBondManager(ethers.ZeroAddress),
      /zero address/
    );
  });

  it("should reject updateOnTransfer from non-controller", async () => {
    const { vault, alice, bob } = await deployFixture();
    await assert.rejects(
      async () =>
        vault
          .connect(alice)
          .updateOnTransfer(alice.address, bob.address, CLASS_ID, NONCE_ID, 100),
      /unauthorized/
    );
  });

  // -- Deposit --

  it("should reject zero deposit", async () => {
    const { vault, controller } = await deployFixture();
    await assert.rejects(
      async () =>
        vault.connect(controller).deposit(CLASS_ID, NONCE_ID, { value: 0 }),
      /zero deposit/
    );
  });

  it("should reject deposit when supply is zero", async () => {
    const { vault, bondManager, ethers, controller } = await deployFixture();
    await bondManager
      .connect(controller)
      .createBondClass(1, 500, 86400 * 365, 15000, 1000, 0, ethers.ZeroAddress);
    await bondManager
      .connect(controller)
      .createNonce(CLASS_ID, ethers.parseEther("0.01"));

    await assert.rejects(
      async () =>
        vault.connect(controller).deposit(CLASS_ID, NONCE_ID, { value: ONE_ETHER }),
      /zero supply/
    );
  });

  it("should update accumulator on deposit", async () => {
    const { vault, bondManager, ethers, controller, alice } = await deployFixture();
    await setupBonds(bondManager, ethers, controller, CLASS_ID, [
      { address: alice.address, amount: 100n },
    ]);

    await vault.connect(controller).deposit(CLASS_ID, NONCE_ID, { value: ONE_ETHER });

    const accPerBond = await vault.classAccDividendPerBond(CLASS_ID);
    const expected = (ONE_ETHER * (10n ** 18n)) / 100n;
    assert.equal(accPerBond, expected);

    const totalDeposited = await vault.classTotalDeposited(CLASS_ID);
    assert.equal(totalDeposited, ONE_ETHER);
  });

  it("should accumulate multiple deposits", async () => {
    const { vault, bondManager, ethers, controller, alice } = await deployFixture();
    await setupBonds(bondManager, ethers, controller, CLASS_ID, [
      { address: alice.address, amount: 100n },
    ]);

    await vault.connect(controller).deposit(CLASS_ID, NONCE_ID, { value: ONE_ETHER });
    await vault.connect(controller).deposit(CLASS_ID, NONCE_ID, { value: ONE_ETHER });

    const totalDeposited = await vault.classTotalDeposited(CLASS_ID);
    assert.equal(totalDeposited, ONE_ETHER * 2n);
  });

  // -- Claim --

  it("should calculate claimable correctly for single holder", async () => {
    const { vault, bondManager, ethers, controller, alice } = await deployFixture();
    await setupBonds(bondManager, ethers, controller, CLASS_ID, [
      { address: alice.address, amount: 100n },
    ]);

    await vault.connect(controller).deposit(CLASS_ID, NONCE_ID, { value: ONE_ETHER });

    const claimableAmt = await vault.claimable(alice.address, CLASS_ID, NONCE_ID);
    assert.equal(claimableAmt, ONE_ETHER);
  });

  it("should transfer BNB on claim", async () => {
    const { vault, bondManager, ethers, controller, alice } = await deployFixture();
    await setupBonds(bondManager, ethers, controller, CLASS_ID, [
      { address: alice.address, amount: 100n },
    ]);

    await vault.connect(controller).deposit(CLASS_ID, NONCE_ID, { value: ONE_ETHER });

    const balBefore = await ethers.provider.getBalance(alice.address);
    const tx = await vault.connect(alice).claim(CLASS_ID, NONCE_ID);
    const receipt = await tx.wait();
    const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
    const balAfter = await ethers.provider.getBalance(alice.address);

    assert.equal(balAfter - balBefore + gasUsed, ONE_ETHER);
  });

  it("should reject claim when nothing to claim", async () => {
    const { vault, bondManager, ethers, controller, alice } = await deployFixture();
    await setupBonds(bondManager, ethers, controller, CLASS_ID, [
      { address: alice.address, amount: 100n },
    ]);

    await assert.rejects(
      async () => vault.connect(alice).claim(CLASS_ID, NONCE_ID),
      /nothing to claim/
    );
  });

  it("should reset claimable to zero after claim", async () => {
    const { vault, bondManager, ethers, controller, alice } = await deployFixture();
    await setupBonds(bondManager, ethers, controller, CLASS_ID, [
      { address: alice.address, amount: 100n },
    ]);

    await vault.connect(controller).deposit(CLASS_ID, NONCE_ID, { value: ONE_ETHER });
    await vault.connect(alice).claim(CLASS_ID, NONCE_ID);

    const claimableAmt = await vault.claimable(alice.address, CLASS_ID, NONCE_ID);
    assert.equal(claimableAmt, 0n);
  });

  it("should allow claim after second deposit", async () => {
    const { vault, bondManager, ethers, controller, alice } = await deployFixture();
    await setupBonds(bondManager, ethers, controller, CLASS_ID, [
      { address: alice.address, amount: 100n },
    ]);

    await vault.connect(controller).deposit(CLASS_ID, NONCE_ID, { value: ONE_ETHER });
    await vault.connect(alice).claim(CLASS_ID, NONCE_ID);

    await vault.connect(controller).deposit(CLASS_ID, NONCE_ID, { value: HALF_ETHER });

    const claimableAmt = await vault.claimable(alice.address, CLASS_ID, NONCE_ID);
    assert.equal(claimableAmt, HALF_ETHER);
  });

  // -- Multi-Holder Distribution --

  it("should distribute proportionally to multiple holders", async () => {
    const { vault, bondManager, ethers, controller, alice, bob } = await deployFixture();
    await setupBonds(bondManager, ethers, controller, CLASS_ID, [
      { address: alice.address, amount: 75n },
      { address: bob.address, amount: 25n },
    ]);

    await vault.connect(controller).deposit(CLASS_ID, NONCE_ID, { value: ONE_ETHER });

    const aliceClaimable = await vault.claimable(alice.address, CLASS_ID, NONCE_ID);
    const bobClaimable = await vault.claimable(bob.address, CLASS_ID, NONCE_ID);

    // Alice: 75% of 1 ETH, Bob: 25%
    assert.equal(aliceClaimable, 75n * 10n ** 16n);
    assert.equal(bobClaimable, QUARTER_ETHER);
  });

  it("should handle uneven distribution with dust", async () => {
    const { vault, bondManager, ethers, controller, alice, bob, carol } = await deployFixture();
    await setupBonds(bondManager, ethers, controller, CLASS_ID, [
      { address: alice.address, amount: 1n },
      { address: bob.address, amount: 1n },
      { address: carol.address, amount: 1n },
    ]);

    await vault.connect(controller).deposit(CLASS_ID, NONCE_ID, { value: ONE_ETHER });

    const aliceC = await vault.claimable(alice.address, CLASS_ID, NONCE_ID);
    const bobC = await vault.claimable(bob.address, CLASS_ID, NONCE_ID);
    const carolC = await vault.claimable(carol.address, CLASS_ID, NONCE_ID);

    const expected = ONE_ETHER / 3n;
    assert.equal(aliceC, expected);
    assert.equal(bobC, expected);
    assert.equal(carolC, expected);
  });

  // -- Transfer Updates --

  it("should preserve pending rewards on transfer (updateOnTransfer)", async () => {
    const { vault, bondManager, ethers, controller, alice, bob } = await deployFixture();
    await setupBonds(bondManager, ethers, controller, CLASS_ID, [
      { address: alice.address, amount: 100n },
    ]);

    await vault.connect(controller).deposit(CLASS_ID, NONCE_ID, { value: ONE_ETHER });

    // updateOnTransfer before actual ERC3475 transfer
    await vault
      .connect(controller)
      .updateOnTransfer(alice.address, bob.address, CLASS_ID, NONCE_ID, 50n);

    // Actual transfer
    await bondManager.connect(alice).setApprovalFor(controller.address, true);
    await bondManager
      .connect(controller)
      .transferFrom(
        alice.address,
        bob.address,
        [{ classId: CLASS_ID, nonceId: NONCE_ID, amount: 50n }]
      );

    // Alice had 1 ETH pending
    const aliceClaimable = await vault.claimable(alice.address, CLASS_ID, NONCE_ID);
    assert.equal(aliceClaimable, ONE_ETHER);

    // Bob had nothing
    const bobClaimable = await vault.claimable(bob.address, CLASS_ID, NONCE_ID);
    assert.equal(bobClaimable, 0n);
  });

  it("should split future dividends after transfer", async () => {
    const { vault, bondManager, ethers, controller, alice, bob } = await deployFixture();
    await setupBonds(bondManager, ethers, controller, CLASS_ID, [
      { address: alice.address, amount: 100n },
    ]);

    await vault.connect(controller).deposit(CLASS_ID, NONCE_ID, { value: ONE_ETHER });

    // Transfer 50 bonds
    await vault
      .connect(controller)
      .updateOnTransfer(alice.address, bob.address, CLASS_ID, NONCE_ID, 50n);

    await bondManager.connect(alice).setApprovalFor(controller.address, true);
    await bondManager
      .connect(controller)
      .transferFrom(
        alice.address,
        bob.address,
        [{ classId: CLASS_ID, nonceId: NONCE_ID, amount: 50n }]
      );

    // Second deposit
    await vault.connect(controller).deposit(CLASS_ID, NONCE_ID, { value: ONE_ETHER });

    // Alice: 1 ETH (pre) + 0.5 ETH (50/100 of 1 ETH)
    const aliceClaimable = await vault.claimable(alice.address, CLASS_ID, NONCE_ID);
    assert.equal(aliceClaimable, 15n * 10n ** 17n); // 1.5 ETH

    // Bob: 0 (pre) + 0.5 ETH (50/100 of 1 ETH)
    const bobClaimable = await vault.claimable(bob.address, CLASS_ID, NONCE_ID);
    assert.equal(bobClaimable, HALF_ETHER);
  });

  it("should reject updateOnTransfer with zero amount", async () => {
    const { vault, controller, alice, bob } = await deployFixture();
    await assert.rejects(
      async () =>
        vault
          .connect(controller)
          .updateOnTransfer(alice.address, bob.address, CLASS_ID, NONCE_ID, 0n),
      /zero amount/
    );
  });

  // -- Claimable View --

  it("should return 0 claimable for holder with no bonds", async () => {
    const { vault, bondManager, ethers, controller, alice, bob } = await deployFixture();
    await setupBonds(bondManager, ethers, controller, CLASS_ID, [
      { address: alice.address, amount: 100n },
    ]);

    await vault.connect(controller).deposit(CLASS_ID, NONCE_ID, { value: ONE_ETHER });

    const bobClaimable = await vault.claimable(bob.address, CLASS_ID, NONCE_ID);
    assert.equal(bobClaimable, 0n);
  });

  // -- Event Emission --

  it("should emit DividendDeposited on deposit", async () => {
    const { vault, bondManager, ethers, controller, alice } = await deployFixture();
    await setupBonds(bondManager, ethers, controller, CLASS_ID, [
      { address: alice.address, amount: 100n },
    ]);

    const tx = await vault
      .connect(controller)
      .deposit(CLASS_ID, NONCE_ID, { value: ONE_ETHER });
    const receipt = await tx.wait();

    const event = receipt!.logs.find((log: any) => {
      try {
        return vault.interface.parseLog(log)?.name === "DividendDeposited";
      } catch {
        return false;
      }
    });
    assert.ok(event, "DividendDeposited event should be emitted");
  });

  it("should emit DividendClaimed on claim", async () => {
    const { vault, bondManager, ethers, controller, alice } = await deployFixture();
    await setupBonds(bondManager, ethers, controller, CLASS_ID, [
      { address: alice.address, amount: 100n },
    ]);

    await vault.connect(controller).deposit(CLASS_ID, NONCE_ID, { value: ONE_ETHER });
    const tx = await vault.connect(alice).claim(CLASS_ID, NONCE_ID);
    const receipt = await tx.wait();

    const event = receipt!.logs.find((log: any) => {
      try {
        return vault.interface.parseLog(log)?.name === "DividendClaimed";
      } catch {
        return false;
      }
    });
    assert.ok(event, "DividendClaimed event should be emitted");
  });

  // -- Multiple Claims --

  it("should allow multiple holders to claim independently", async () => {
    const { vault, bondManager, ethers, controller, alice, bob } = await deployFixture();
    await setupBonds(bondManager, ethers, controller, CLASS_ID, [
      { address: alice.address, amount: 50n },
      { address: bob.address, amount: 50n },
    ]);

    await vault.connect(controller).deposit(CLASS_ID, NONCE_ID, { value: ONE_ETHER });

    await vault.connect(alice).claim(CLASS_ID, NONCE_ID);
    const aliceClaimable = await vault.claimable(alice.address, CLASS_ID, NONCE_ID);
    assert.equal(aliceClaimable, 0n);

    const bobClaimable = await vault.claimable(bob.address, CLASS_ID, NONCE_ID);
    assert.equal(bobClaimable, HALF_ETHER);
    await vault.connect(bob).claim(CLASS_ID, NONCE_ID);
  });

  it("should handle deposits across different classes independently", async () => {
    const { vault, bondManager, ethers, controller, alice } = await deployFixture();

    // Setup class 1
    await setupBonds(bondManager, ethers, controller, 1, [
      { address: alice.address, amount: 100n },
    ]);

    // Setup class 2 manually (auto-assigns classId=2)
    await bondManager
      .connect(controller)
      .createBondClass(2, 800, 86400 * 365, 20000, 10000, 0, ethers.ZeroAddress);
    await bondManager
      .connect(controller)
      .createNonce(2, ethers.parseEther("0.02"));
    await bondManager
      .connect(controller)
      .issue(alice.address, [{ classId: 2, nonceId: 0, amount: 200n }]);

    await vault.connect(controller).deposit(1, 0, { value: ONE_ETHER });
    await vault.connect(controller).deposit(2, 0, { value: 2n * ONE_ETHER });

    const class1Claimable = await vault.claimable(alice.address, 1, 0);
    const class2Claimable = await vault.claimable(alice.address, 2, 0);

    assert.equal(class1Claimable, ONE_ETHER);
    assert.equal(class2Claimable, 2n * ONE_ETHER);
  });
});
