import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("CreditModel", function () {
  async function deployFixture() {
    const connection = await hre.network.connect();
    const { ethers } = connection;
    const CreditModelHelper = await ethers.getContractFactory("CreditModelHelper");
    const helper = await CreditModelHelper.deploy();
    return { helper, ethers };
  }

  // Helper to build factors tuple
  function factors(
    sharpeRatio: bigint,
    revenueStability: bigint,
    paymentFrequency: bigint,
    agentAge: bigint,
    totalRevenue: bigint
  ) {
    return { sharpeRatio, revenueStability, paymentFrequency, agentAge, totalRevenue };
  }

  const PRECISION = 10n ** 18n;
  const DAY = 86400n;

  // -- Score Calculation Tests --

  describe("calculateScore", function () {
    it("should return 0 for zero factors", async function () {
      const { helper } = await deployFixture();

      const score = await helper.calculateScore(factors(0n, 0n, 0n, 0n, 0n));
      assert.strictEqual(score, 0n);
    });

    it("should return 3500 for max Sharpe only (35% weight)", async function () {
      const { helper } = await deployFixture();

      const score = await helper.calculateScore(factors(3n * PRECISION, 0n, 0n, 0n, 0n));
      assert.strictEqual(score, 3500n);
    });

    it("should return 2500 for perfect stability only (25% weight)", async function () {
      const { helper } = await deployFixture();

      const score = await helper.calculateScore(factors(0n, PRECISION, 0n, 0n, 0n));
      assert.strictEqual(score, 2500n);
    });

    it("should return 1500 for perfect frequency only (15% weight)", async function () {
      const { helper } = await deployFixture();

      const score = await helper.calculateScore(factors(0n, 0n, PRECISION, 0n, 0n));
      assert.strictEqual(score, 1500n);
    });

    it("should return 1000 for max age only (10% weight)", async function () {
      const { helper } = await deployFixture();

      const score = await helper.calculateScore(factors(0n, 0n, 0n, 365n * DAY, 0n));
      assert.strictEqual(score, 1000n);
    });

    it("should return 1500 for max revenue only (15% weight)", async function () {
      const { helper, ethers } = await deployFixture();

      const score = await helper.calculateScore(factors(0n, 0n, 0n, 0n, ethers.parseEther("100")));
      assert.strictEqual(score, 1500n);
    });

    it("should return 10000 for perfect all factors", async function () {
      const { helper, ethers } = await deployFixture();

      const score = await helper.calculateScore(factors(
        3n * PRECISION,
        PRECISION,
        PRECISION,
        365n * DAY,
        ethers.parseEther("100")
      ));
      assert.strictEqual(score, 10000n);
    });

    it("should compute realistic combined scenario", async function () {
      const { helper, ethers } = await deployFixture();

      // Sharpe 1.5 -> normalized 5000, weighted 1750
      // Stability 0.8 -> normalized 8000, weighted 2000
      // Frequency 0.5 -> normalized 5000, weighted 750
      // Age 180 days -> normalized ~4931, weighted ~493
      // Revenue 50 BNB -> normalized 5000, weighted 750
      // Total ~ 5743
      const score = await helper.calculateScore(factors(
        (15n * PRECISION) / 10n,          // 1.5e18
        (8n * PRECISION) / 10n,           // 0.8e18
        (5n * PRECISION) / 10n,           // 0.5e18
        180n * DAY,                        // 180 days
        ethers.parseEther("50")           // 50 BNB
      ));

      // Score should be in the A range (4000-6000)
      assert.ok(score >= 4000n, `score ${score} should be >= 4000`);
      assert.ok(score <= 6000n, `score ${score} should be <= 6000`);
    });
  });

  // -- Sharpe Normalization Tests --

  describe("Sharpe normalization", function () {
    it("should normalize Sharpe 1.0 to ~3333", async function () {
      const { helper } = await deployFixture();

      const score = await helper.calculateScore(factors(PRECISION, 0n, 0n, 0n, 0n));
      // 3333 * 3500 / 10000 = 1166
      // So full score = 1166 (only sharpe contributes)
      // sharpe normalized = score * 10000 / 3500 = ~3331
      const sharpeNormalized = (score * 10000n) / 3500n;
      assert.ok(sharpeNormalized >= 3330n && sharpeNormalized <= 3334n,
        `Sharpe normalized ${sharpeNormalized} should be ~3333`);
    });

    it("should normalize Sharpe 2.0 to ~6666", async function () {
      const { helper } = await deployFixture();

      const score = await helper.calculateScore(factors(2n * PRECISION, 0n, 0n, 0n, 0n));
      const sharpeNormalized = (score * 10000n) / 3500n;
      assert.ok(sharpeNormalized >= 6664n && sharpeNormalized <= 6668n,
        `Sharpe normalized ${sharpeNormalized} should be ~6666`);
    });

    it("should cap Sharpe at 10000 for values >= 3.0", async function () {
      const { helper } = await deployFixture();

      const score3 = await helper.calculateScore(factors(3n * PRECISION, 0n, 0n, 0n, 0n));
      const score5 = await helper.calculateScore(factors(5n * PRECISION, 0n, 0n, 0n, 0n));
      assert.strictEqual(score3, 3500n);
      assert.strictEqual(score5, 3500n);
    });
  });

  // -- Age Normalization Tests --

  describe("Age normalization", function () {
    it("should normalize 365 days to 10000", async function () {
      const { helper } = await deployFixture();

      const score = await helper.calculateScore(factors(0n, 0n, 0n, 365n * DAY, 0n));
      assert.strictEqual(score, 1000n); // 10000 * 1000 / 10000
    });

    it("should normalize ~182 days to ~5000", async function () {
      const { helper } = await deployFixture();

      const score = await helper.calculateScore(factors(0n, 0n, 0n, 182n * DAY, 0n));
      // ageNormalized = 182 * 10000 / 365 = 4986
      // weighted = 4986 * 1000 / 10000 = 498
      const ageNormalized = (score * 10000n) / 1000n;
      assert.ok(ageNormalized >= 4980n && ageNormalized <= 5000n,
        `Age normalized ${ageNormalized} should be ~4986`);
    });
  });

  // -- Revenue Normalization Tests --

  describe("Revenue normalization", function () {
    it("should normalize 100+ ether to 10000", async function () {
      const { helper, ethers } = await deployFixture();

      const score = await helper.calculateScore(factors(0n, 0n, 0n, 0n, ethers.parseEther("100")));
      assert.strictEqual(score, 1500n); // 10000 * 1500 / 10000

      const score200 = await helper.calculateScore(factors(0n, 0n, 0n, 0n, ethers.parseEther("200")));
      assert.strictEqual(score200, 1500n);
    });

    it("should normalize 50 ether to 5000", async function () {
      const { helper, ethers } = await deployFixture();

      const score = await helper.calculateScore(factors(0n, 0n, 0n, 0n, ethers.parseEther("50")));
      // revNormalized = 50 * 10000 / 100 = 5000
      // weighted = 5000 * 1500 / 10000 = 750
      assert.strictEqual(score, 750n);
    });
  });

  // -- Rating Tests --

  describe("calculateRating", function () {
    it("should return C (1) for score < 2000", async function () {
      const { helper } = await deployFixture();

      assert.strictEqual(await helper.calculateRating(0n), 1n);
      assert.strictEqual(await helper.calculateRating(1999n), 1n);
    });

    it("should return B (2) for score 2000-3999", async function () {
      const { helper } = await deployFixture();

      assert.strictEqual(await helper.calculateRating(2000n), 2n);
      assert.strictEqual(await helper.calculateRating(3999n), 2n);
    });

    it("should return A (3) for score 4000-5999", async function () {
      const { helper } = await deployFixture();

      assert.strictEqual(await helper.calculateRating(4000n), 3n);
      assert.strictEqual(await helper.calculateRating(5999n), 3n);
    });

    it("should return AA (4) for score 6000-7999", async function () {
      const { helper } = await deployFixture();

      assert.strictEqual(await helper.calculateRating(6000n), 4n);
      assert.strictEqual(await helper.calculateRating(7999n), 4n);
    });

    it("should return AAA (5) for score >= 8000", async function () {
      const { helper } = await deployFixture();

      assert.strictEqual(await helper.calculateRating(8000n), 5n);
      assert.strictEqual(await helper.calculateRating(10000n), 5n);
    });
  });

  // -- Multi-Dimensional Rating Tests --

  describe("calculateMultiDimensionalRating", function () {
    it("should return rating C and score 0 for zero factors", async function () {
      const { helper } = await deployFixture();

      const result = await helper.calculateMultiDimensionalRating(factors(0n, 0n, 0n, 0n, 0n));
      assert.strictEqual(result.rating, 1n); // C
      assert.strictEqual(result.score, 0n);
    });

    it("should return rating AAA and score 10000 for perfect factors", async function () {
      const { helper, ethers } = await deployFixture();

      const result = await helper.calculateMultiDimensionalRating(factors(
        3n * PRECISION,
        PRECISION,
        PRECISION,
        365n * DAY,
        ethers.parseEther("100")
      ));
      assert.strictEqual(result.rating, 5n); // AAA
      assert.strictEqual(result.score, 10000n);
    });
  });
});
