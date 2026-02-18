import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("NFARegistry", function () {
  async function deployFixture() {
    const connection = await hre.network.connect();
    const { ethers, networkHelpers } = connection;
    const [owner, user1, user2, controller] = await ethers.getSigners();
    const NFARegistry = await ethers.getContractFactory("NFARegistry");
    const registry = await NFARegistry.deploy();
    return { registry, ethers, networkHelpers, owner, user1, user2, controller };
  }

  async function deployWithAgentFixture() {
    const base = await deployFixture();
    const { registry, ethers, user1, controller, owner } = base;

    // Register an agent as user1
    await registry.connect(user1).registerAgent(
      "TestAgent",
      "A test agent",
      "QmModelHash123",
      "https://agent.example.com/api"
    );
    const agentId = 1n;

    // Set controller
    await registry.connect(owner).setController(controller.address);

    return { ...base, agentId };
  }

  async function deployActiveAgentFixture() {
    const base = await deployWithAgentFixture();
    const { registry, user1, agentId } = base;
    await registry.connect(user1).updateState(agentId, 1n); // Active
    return base;
  }

  const DAY = 86400;
  const MONTH = 30 * DAY;

  // -- Registration Tests --

  describe("registerAgent", function () {
    it("should mint an ERC721 token to the caller", async function () {
      const { registry, user1 } = await deployFixture();

      await registry.connect(user1).registerAgent(
        "Agent1", "desc", "hash", "endpoint"
      );

      assert.strictEqual(await registry.ownerOf(1n), user1.address);
      assert.strictEqual(await registry.balanceOf(user1.address), 1n);
    });

    it("should auto-increment agent IDs starting from 1", async function () {
      const { registry, user1, user2 } = await deployFixture();

      await registry.connect(user1).registerAgent("A1", "d1", "h1", "e1");
      await registry.connect(user2).registerAgent("A2", "d2", "h2", "e2");

      assert.strictEqual(await registry.ownerOf(1n), user1.address);
      assert.strictEqual(await registry.ownerOf(2n), user2.address);
      assert.strictEqual(await registry.totalSupply(), 2n);
    });

    it("should store agent metadata correctly", async function () {
      const { registry, user1 } = await deployFixture();

      await registry.connect(user1).registerAgent(
        "AgentName", "AgentDesc", "ModelHash", "https://endpoint"
      );

      const meta = await registry.getAgentMetadata(1n);
      assert.strictEqual(meta.name, "AgentName");
      assert.strictEqual(meta.description, "AgentDesc");
      assert.strictEqual(meta.modelHash, "ModelHash");
      assert.strictEqual(meta.endpoint, "https://endpoint");
      assert.ok(meta.registeredAt > 0n);
    });

    it("should set initial state to Registered", async function () {
      const { registry, user1 } = await deployFixture();

      await registry.connect(user1).registerAgent("A", "d", "h", "e");

      const state = await registry.getAgentState(1n);
      assert.strictEqual(state, 0n); // AgentState.Registered
    });

    it("should emit AgentRegistered event", async function () {
      const { registry, user1 } = await deployFixture();

      const tx = await registry.connect(user1).registerAgent(
        "Agent1", "desc", "hash", "endpoint"
      );
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          return registry.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "AgentRegistered";
        } catch { return false; }
      });
      assert.ok(event, "AgentRegistered event should be emitted");
    });
  });

  // -- State Transition Tests --

  describe("updateState", function () {
    it("should allow owner to transition Registered -> Active", async function () {
      const { registry, user1, agentId } = await deployWithAgentFixture();

      await registry.connect(user1).updateState(agentId, 1n); // Active
      assert.strictEqual(await registry.getAgentState(agentId), 1n);
    });

    it("should allow transition Active -> Suspended", async function () {
      const { registry, user1, agentId } = await deployWithAgentFixture();

      await registry.connect(user1).updateState(agentId, 1n); // Active
      await registry.connect(user1).updateState(agentId, 2n); // Suspended
      assert.strictEqual(await registry.getAgentState(agentId), 2n);
    });

    it("should allow transition Suspended -> Deregistered", async function () {
      const { registry, user1, agentId } = await deployWithAgentFixture();

      await registry.connect(user1).updateState(agentId, 1n); // Active
      await registry.connect(user1).updateState(agentId, 2n); // Suspended
      await registry.connect(user1).updateState(agentId, 3n); // Deregistered
      assert.strictEqual(await registry.getAgentState(agentId), 3n);
    });

    it("should emit AgentStateChanged event", async function () {
      const { registry, user1, agentId } = await deployWithAgentFixture();

      const tx = await registry.connect(user1).updateState(agentId, 1n);
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          return registry.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "AgentStateChanged";
        } catch { return false; }
      });
      assert.ok(event, "AgentStateChanged event should be emitted");
    });

    it("should revert if caller is not agent owner", async function () {
      const { registry, user2, agentId } = await deployWithAgentFixture();

      await assert.rejects(
        async () => { await registry.connect(user2).updateState(agentId, 1n); },
        { message: /caller is not agent owner/ }
      );
    });

    it("should revert for non-existent agent", async function () {
      const { registry, user1 } = await deployFixture();

      await assert.rejects(
        async () => { await registry.connect(user1).updateState(999n, 1n); },
        { message: /agent does not exist/ }
      );
    });
  });

  // -- Fund Agent Tests --

  describe("fundAgent", function () {
    it("should accept ETH and track balance", async function () {
      const { registry, ethers, user2, agentId } = await deployWithAgentFixture();
      const amount = ethers.parseEther("1.0");

      await registry.connect(user2).fundAgent(agentId, { value: amount });

      const balance = await registry.getAgentBalance(agentId);
      assert.strictEqual(balance, amount);
    });

    it("should accumulate multiple fundings", async function () {
      const { registry, ethers, user2, agentId } = await deployWithAgentFixture();
      const amount = ethers.parseEther("0.5");

      await registry.connect(user2).fundAgent(agentId, { value: amount });
      await registry.connect(user2).fundAgent(agentId, { value: amount });

      const balance = await registry.getAgentBalance(agentId);
      assert.strictEqual(balance, ethers.parseEther("1.0"));
    });

    it("should emit AgentFunded event", async function () {
      const { registry, ethers, user2, agentId } = await deployWithAgentFixture();
      const amount = ethers.parseEther("1.0");

      const tx = await registry.connect(user2).fundAgent(agentId, { value: amount });
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          return registry.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "AgentFunded";
        } catch { return false; }
      });
      assert.ok(event, "AgentFunded event should be emitted");
    });

    it("should revert if no value sent", async function () {
      const { registry, user2, agentId } = await deployWithAgentFixture();

      await assert.rejects(
        async () => { await registry.connect(user2).fundAgent(agentId, { value: 0n }); },
        { message: /must send value/ }
      );
    });
  });

  // -- Record Revenue Tests --

  describe("recordRevenue", function () {
    it("should record revenue for active agent", async function () {
      const { registry, ethers, controller, agentId } = await deployActiveAgentFixture();

      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("100"));

      const profile = await registry.getRevenueProfile(agentId);
      assert.strictEqual(profile.totalEarned, ethers.parseEther("100"));
      assert.strictEqual(profile.totalPayments, 1n);
      assert.ok(profile.lastPaymentTime > 0n);
    });

    it("should accumulate multiple revenue recordings", async function () {
      const { registry, ethers, controller, agentId } = await deployActiveAgentFixture();

      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("50"));
      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("75"));

      const profile = await registry.getRevenueProfile(agentId);
      assert.strictEqual(profile.totalEarned, ethers.parseEther("125"));
      assert.strictEqual(profile.totalPayments, 2n);
    });

    it("should emit RevenueRecorded event", async function () {
      const { registry, ethers, controller, agentId } = await deployActiveAgentFixture();

      const tx = await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("10"));
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          return registry.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "RevenueRecorded";
        } catch { return false; }
      });
      assert.ok(event, "RevenueRecorded event should be emitted");
    });

    it("should revert if caller is not controller", async function () {
      const { registry, user1, agentId } = await deployActiveAgentFixture();

      await assert.rejects(
        async () => { await registry.connect(user1).recordRevenue(agentId, 100n); },
        { message: /caller is not controller/ }
      );
    });

    it("should revert if agent is not active", async function () {
      const { registry, controller, agentId } = await deployWithAgentFixture();

      // Agent is in Registered state, not Active
      await assert.rejects(
        async () => { await registry.connect(controller).recordRevenue(agentId, 100n); },
        { message: /agent is not active/ }
      );
    });

    it("should revert if amount is zero", async function () {
      const { registry, controller, agentId } = await deployActiveAgentFixture();

      await assert.rejects(
        async () => { await registry.connect(controller).recordRevenue(agentId, 0n); },
        { message: /amount must be positive/ }
      );
    });
  });

  // -- Sharpe Ratio Tests --

  describe("updateSharpe", function () {
    it("should store sharpe ratio and proof hash", async function () {
      const { registry, ethers, controller, agentId } = await deployWithAgentFixture();

      const sharpe = ethers.parseEther("1.5"); // 1.5 scaled 1e18
      const proofHash = ethers.keccak256(ethers.toUtf8Bytes("proof-data"));

      await registry.connect(controller).updateSharpe(agentId, sharpe, proofHash);

      const profile = await registry.getRevenueProfile(agentId);
      assert.strictEqual(profile.sharpeRatio, sharpe);
      assert.strictEqual(profile.sharpeProofHash, proofHash);
    });

    it("should emit SharpeUpdated event", async function () {
      const { registry, ethers, controller, agentId } = await deployWithAgentFixture();

      const sharpe = ethers.parseEther("2.0");
      const proofHash = ethers.keccak256(ethers.toUtf8Bytes("proof"));

      const tx = await registry.connect(controller).updateSharpe(agentId, sharpe, proofHash);
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          return registry.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "SharpeUpdated";
        } catch { return false; }
      });
      assert.ok(event, "SharpeUpdated event should be emitted");
    });

    it("should revert if caller is not controller", async function () {
      const { registry, ethers, user1, agentId } = await deployWithAgentFixture();

      const proofHash = ethers.keccak256(ethers.toUtf8Bytes("proof"));

      await assert.rejects(
        async () => { await registry.connect(user1).updateSharpe(agentId, 100n, proofHash); },
        { message: /caller is not controller/ }
      );
    });
  });

  // -- Credit Rating Tests --

  describe("updateCreditRating", function () {
    it("should update credit rating", async function () {
      const { registry, controller, agentId } = await deployWithAgentFixture();

      await registry.connect(controller).updateCreditRating(agentId, 5n); // AAA
      assert.strictEqual(await registry.creditRatings(agentId), 5n);
    });

    it("should support all rating levels", async function () {
      const { registry, controller, agentId } = await deployWithAgentFixture();

      // Unrated (0) -- default
      assert.strictEqual(await registry.creditRatings(agentId), 0n);

      // C (1)
      await registry.connect(controller).updateCreditRating(agentId, 1n);
      assert.strictEqual(await registry.creditRatings(agentId), 1n);

      // B (2)
      await registry.connect(controller).updateCreditRating(agentId, 2n);
      assert.strictEqual(await registry.creditRatings(agentId), 2n);

      // A (3)
      await registry.connect(controller).updateCreditRating(agentId, 3n);
      assert.strictEqual(await registry.creditRatings(agentId), 3n);

      // AA (4)
      await registry.connect(controller).updateCreditRating(agentId, 4n);
      assert.strictEqual(await registry.creditRatings(agentId), 4n);

      // AAA (5)
      await registry.connect(controller).updateCreditRating(agentId, 5n);
      assert.strictEqual(await registry.creditRatings(agentId), 5n);
    });

    it("should emit CreditRatingUpdated event", async function () {
      const { registry, controller, agentId } = await deployWithAgentFixture();

      const tx = await registry.connect(controller).updateCreditRating(agentId, 3n);
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          return registry.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "CreditRatingUpdated";
        } catch { return false; }
      });
      assert.ok(event, "CreditRatingUpdated event should be emitted");
    });

    it("should revert if caller is not controller", async function () {
      const { registry, user1, agentId } = await deployWithAgentFixture();

      await assert.rejects(
        async () => { await registry.connect(user1).updateCreditRating(agentId, 3n); },
        { message: /caller is not controller/ }
      );
    });
  });

  // -- Controller Management Tests --

  describe("setController", function () {
    it("should allow owner to set controller", async function () {
      const { registry, owner, controller } = await deployFixture();

      await registry.connect(owner).setController(controller.address);
      assert.strictEqual(await registry.controller(), controller.address);
    });

    it("should emit ControllerSet event", async function () {
      const { registry, owner, controller } = await deployFixture();

      const tx = await registry.connect(owner).setController(controller.address);
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          return registry.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "ControllerSet";
        } catch { return false; }
      });
      assert.ok(event, "ControllerSet event should be emitted");
    });

    it("should revert if caller is not owner", async function () {
      const { registry, user1, controller } = await deployFixture();

      await assert.rejects(
        async () => { await registry.connect(user1).setController(controller.address); },
        { message: /OwnableUnauthorizedAccount/ }
      );
    });

    it("should revert if setting zero address", async function () {
      const { registry, ethers, owner } = await deployFixture();

      await assert.rejects(
        async () => { await registry.connect(owner).setController(ethers.ZeroAddress); },
        { message: /zero address/ }
      );
    });
  });

  // -- View Function / ERC721 Tests --

  describe("view functions and ERC721", function () {
    it("should return correct owner via getAgentOwner", async function () {
      const { registry, user1, agentId } = await deployWithAgentFixture();

      assert.strictEqual(await registry.getAgentOwner(agentId), user1.address);
    });

    it("should track totalSupply correctly", async function () {
      const { registry, user1, user2 } = await deployFixture();

      assert.strictEqual(await registry.totalSupply(), 0n);

      await registry.connect(user1).registerAgent("A1", "d", "h", "e");
      assert.strictEqual(await registry.totalSupply(), 1n);

      await registry.connect(user2).registerAgent("A2", "d", "h", "e");
      assert.strictEqual(await registry.totalSupply(), 2n);
    });

    it("should revert getAgentMetadata for non-existent agent", async function () {
      const { registry } = await deployFixture();

      await assert.rejects(
        async () => { await registry.getAgentMetadata(999n); },
        { message: /agent does not exist/ }
      );
    });

    it("should revert getAgentState for non-existent agent", async function () {
      const { registry } = await deployFixture();

      await assert.rejects(
        async () => { await registry.getAgentState(999n); },
        { message: /agent does not exist/ }
      );
    });

    it("should return default revenue profile for new agent", async function () {
      const { registry, agentId } = await deployWithAgentFixture();

      const profile = await registry.getRevenueProfile(agentId);
      assert.strictEqual(profile.totalEarned, 0n);
      assert.strictEqual(profile.totalPayments, 0n);
      assert.strictEqual(profile.lastPaymentTime, 0n);
      assert.strictEqual(profile.sharpeRatio, 0n);
    });
  });

  // -- Monthly Revenue Tracking Tests --

  describe("monthly revenue tracking", function () {
    it("should update monthlyRevenue buffer on first recordRevenue", async function () {
      const { registry, ethers, controller, agentId } = await deployActiveAgentFixture();

      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("10"));

      const monthly = await registry.getMonthlyRevenue(agentId);
      assert.strictEqual(monthly[0], ethers.parseEther("10"));
      // All other months zero
      for (let i = 1; i < 12; i++) {
        assert.strictEqual(monthly[i], 0n);
      }
    });

    it("should accumulate revenue within same month", async function () {
      const { registry, ethers, controller, agentId } = await deployActiveAgentFixture();

      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("5"));
      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("15"));

      const monthly = await registry.getMonthlyRevenue(agentId);
      assert.strictEqual(monthly[0], ethers.parseEther("20"));
    });

    it("should advance month index after 30 days", async function () {
      const { registry, ethers, networkHelpers, controller, agentId } = await deployActiveAgentFixture();

      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("10"));

      // Advance 30 days
      await networkHelpers.time.increase(MONTH);

      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("20"));

      const monthly = await registry.getMonthlyRevenue(agentId);
      assert.strictEqual(monthly[0], ethers.parseEther("10"));
      assert.strictEqual(monthly[1], ethers.parseEther("20"));

      const profile = await registry.getRevenueProfile(agentId);
      assert.strictEqual(profile.currentMonthIndex, 1n);
    });

    it("should handle multiple month gaps", async function () {
      const { registry, ethers, networkHelpers, controller, agentId } = await deployActiveAgentFixture();

      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("10"));

      // Advance 3 months
      await networkHelpers.time.increase(MONTH * 3);

      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("30"));

      const monthly = await registry.getMonthlyRevenue(agentId);
      assert.strictEqual(monthly[0], ethers.parseEther("10"));
      // Months 1, 2 should be cleared (advanced through them)
      assert.strictEqual(monthly[1], 0n);
      assert.strictEqual(monthly[2], 0n);
      // Month 3 has the new revenue
      assert.strictEqual(monthly[3], ethers.parseEther("30"));

      const profile = await registry.getRevenueProfile(agentId);
      assert.strictEqual(profile.currentMonthIndex, 3n);
    });

    it("should wrap around circular buffer after 12 months", async function () {
      const { registry, ethers, networkHelpers, controller, agentId } = await deployActiveAgentFixture();

      // Record in month 0
      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("1"));

      // Advance 12 months -> wraps to index 0
      await networkHelpers.time.increase(MONTH * 12);

      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("99"));

      const monthly = await registry.getMonthlyRevenue(agentId);
      // Index 0 was cleared and then new revenue written
      assert.strictEqual(monthly[0], ethers.parseEther("99"));

      const profile = await registry.getRevenueProfile(agentId);
      assert.strictEqual(profile.currentMonthIndex, 0n);
    });

    it("should return correct array via getMonthlyRevenue", async function () {
      const { registry, ethers, networkHelpers, controller, agentId } = await deployActiveAgentFixture();

      // Record across 3 months
      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("10"));
      await networkHelpers.time.increase(MONTH);
      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("20"));
      await networkHelpers.time.increase(MONTH);
      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("30"));

      const monthly = await registry.getMonthlyRevenue(agentId);
      assert.strictEqual(monthly[0], ethers.parseEther("10"));
      assert.strictEqual(monthly[1], ethers.parseEther("20"));
      assert.strictEqual(monthly[2], ethers.parseEther("30"));
      assert.strictEqual(monthly.length, 12);
    });
  });

  // -- Credit Factors Tests --

  describe("credit factors", function () {
    it("should store credit factors via updateCreditFactors", async function () {
      const { registry, ethers, controller, agentId } = await deployWithAgentFixture();

      const factors = {
        sharpeRatio: ethers.parseEther("1.5"),
        revenueStability: ethers.parseEther("0.8"),
        paymentFrequency: ethers.parseEther("0.5"),
        agentAge: BigInt(180 * DAY),
        totalRevenue: ethers.parseEther("50"),
      };

      await registry.connect(controller).updateCreditFactors(agentId, factors);

      const stored = await registry.creditFactors(agentId);
      assert.strictEqual(stored.sharpeRatio, factors.sharpeRatio);
      assert.strictEqual(stored.revenueStability, factors.revenueStability);
      assert.strictEqual(stored.paymentFrequency, factors.paymentFrequency);
      assert.strictEqual(stored.agentAge, factors.agentAge);
      assert.strictEqual(stored.totalRevenue, factors.totalRevenue);
    });

    it("should revert updateCreditFactors from non-controller", async function () {
      const { registry, ethers, user1, agentId } = await deployWithAgentFixture();

      const factors = {
        sharpeRatio: 0n,
        revenueStability: 0n,
        paymentFrequency: 0n,
        agentAge: 0n,
        totalRevenue: 0n,
      };

      await assert.rejects(
        async () => { await registry.connect(user1).updateCreditFactors(agentId, factors); },
        { message: /caller is not controller/ }
      );
    });

    it("should calculate credit score from stored factors", async function () {
      const { registry, ethers, controller, agentId } = await deployWithAgentFixture();

      // Set perfect factors
      const factors = {
        sharpeRatio: ethers.parseEther("3"),
        revenueStability: ethers.parseEther("1"),
        paymentFrequency: ethers.parseEther("1"),
        agentAge: BigInt(365 * DAY),
        totalRevenue: ethers.parseEther("100"),
      };

      await registry.connect(controller).updateCreditFactors(agentId, factors);

      const result = await registry.calculateCreditScore(agentId);
      assert.strictEqual(result.score, 10000n);
      assert.strictEqual(result.rating, 5n); // AAA
    });

    it("should return C rating for zero factors", async function () {
      const { registry, agentId } = await deployWithAgentFixture();

      const result = await registry.calculateCreditScore(agentId);
      assert.strictEqual(result.score, 0n);
      assert.strictEqual(result.rating, 1n); // C
    });

    it("should auto-update credit factors on recordRevenue", async function () {
      const { registry, ethers, controller, agentId } = await deployActiveAgentFixture();

      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("10"));

      const factors = await registry.creditFactors(agentId);
      // totalRevenue should match
      assert.strictEqual(factors.totalRevenue, ethers.parseEther("10"));
      // agentAge should be > 0
      assert.ok(factors.agentAge >= 0n);
      // revenueStability should be 1/12 * 1e18 (one non-zero month)
      const expectedStability = (1n * BigInt(1e18)) / 12n;
      assert.strictEqual(factors.revenueStability, expectedStability);
      // paymentFrequency should be capped at 1e18 (1 payment in < 1 month)
      assert.strictEqual(factors.paymentFrequency, BigInt(1e18));
    });
  });

  // -- Revenue Stability Tests --

  describe("revenue stability", function () {
    it("should have 0 stability with no revenue", async function () {
      const { registry, agentId } = await deployWithAgentFixture();

      const factors = await registry.creditFactors(agentId);
      assert.strictEqual(factors.revenueStability, 0n);
    });

    it("should have high stability with consistent monthly revenue", async function () {
      const { registry, ethers, networkHelpers, controller, agentId } = await deployActiveAgentFixture();

      // Record revenue in 6 consecutive months
      for (let i = 0; i < 6; i++) {
        await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("10"));
        if (i < 5) {
          await networkHelpers.time.increase(MONTH);
        }
      }

      const factors = await registry.creditFactors(agentId);
      // 6 non-zero months out of 12 -> stability = 6/12 * 1e18 = 0.5e18
      const expectedStability = (6n * BigInt(1e18)) / 12n;
      assert.strictEqual(factors.revenueStability, expectedStability);
    });

    it("should reach max stability with 12 months of revenue", async function () {
      const { registry, ethers, networkHelpers, controller, agentId } = await deployActiveAgentFixture();

      // Record revenue in all 12 months
      for (let i = 0; i < 12; i++) {
        await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("10"));
        if (i < 11) {
          await networkHelpers.time.increase(MONTH);
        }
      }

      const factors = await registry.creditFactors(agentId);
      // 12 non-zero months -> stability = 12/12 * 1e18 = 1e18
      assert.strictEqual(factors.revenueStability, BigInt(1e18));
    });

    it("should have low stability with sporadic revenue", async function () {
      const { registry, ethers, networkHelpers, controller, agentId } = await deployActiveAgentFixture();

      // Record only once, then skip months
      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("10"));

      // Advance 5 months (no revenue during this time)
      await networkHelpers.time.increase(MONTH * 5);

      // Record again
      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("10"));

      const factors = await registry.creditFactors(agentId);
      // Only 2 non-zero months out of 12 -> stability = 2/12 * 1e18
      const expectedStability = (2n * BigInt(1e18)) / 12n;
      assert.strictEqual(factors.revenueStability, expectedStability);
    });
  });

  // -- Integration Tests --

  describe("integration", function () {
    it("full flow: register -> activate -> 12 months revenue -> check credit score", async function () {
      const { registry, ethers, networkHelpers, controller, user1, agentId } = await deployActiveAgentFixture();

      // Set a sharpe ratio
      const proofHash = ethers.keccak256(ethers.toUtf8Bytes("proof"));
      await registry.connect(controller).updateSharpe(agentId, ethers.parseEther("2"), proofHash);

      // Record revenue for 12 months
      for (let i = 0; i < 12; i++) {
        await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("10"));
        if (i < 11) {
          await networkHelpers.time.increase(MONTH);
        }
      }

      // Check credit factors auto-populated
      const factors = await registry.creditFactors(agentId);
      assert.strictEqual(factors.totalRevenue, ethers.parseEther("120"));
      assert.strictEqual(factors.revenueStability, BigInt(1e18)); // all months non-zero
      assert.strictEqual(factors.sharpeRatio, ethers.parseEther("2"));
      assert.ok(factors.agentAge > 0n);

      // Calculate credit score
      const result = await registry.calculateCreditScore(agentId);
      // With sharpe 2.0, full stability, good frequency, ~330 days age, 120 BNB revenue
      // Should be in the AA range (6000-8000) or better
      assert.ok(result.score >= 6000n, `score ${result.score} should be >= 6000`);
    });

    it("multiple agents with different profiles", async function () {
      const { registry, ethers, networkHelpers, controller, user1, user2, owner } = await deployFixture();

      // Register two agents
      await registry.connect(user1).registerAgent("Agent1", "d", "h", "e");
      await registry.connect(user2).registerAgent("Agent2", "d", "h", "e");
      await registry.connect(owner).setController(controller.address);

      // Activate both
      await registry.connect(user1).updateState(1n, 1n);
      await registry.connect(user2).updateState(2n, 1n);

      // Agent1: consistent revenue
      for (let i = 0; i < 3; i++) {
        await registry.connect(controller).recordRevenue(1n, ethers.parseEther("10"));
        if (i < 2) await networkHelpers.time.increase(MONTH);
      }

      // Agent2: single large revenue
      await registry.connect(controller).recordRevenue(2n, ethers.parseEther("30"));

      const factors1 = await registry.creditFactors(1n);
      const factors2 = await registry.creditFactors(2n);

      // Agent1 should have higher stability (3 months vs 1 month)
      assert.ok(factors1.revenueStability > factors2.revenueStability,
        `Agent1 stability ${factors1.revenueStability} should be > Agent2 stability ${factors2.revenueStability}`);

      // Same total revenue
      assert.strictEqual(factors1.totalRevenue, ethers.parseEther("30"));
      assert.strictEqual(factors2.totalRevenue, ethers.parseEther("30"));
    });

    it("credit score increases as agent matures", async function () {
      const { registry, ethers, networkHelpers, controller, agentId } = await deployActiveAgentFixture();

      // Record initial revenue
      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("5"));
      const score1 = (await registry.calculateCreditScore(agentId)).score;

      // Advance time and record more
      await networkHelpers.time.increase(MONTH * 3);
      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("5"));
      await networkHelpers.time.increase(MONTH * 3);
      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("5"));

      const score2 = (await registry.calculateCreditScore(agentId)).score;

      // Score should increase (more revenue, more age, more stability)
      assert.ok(score2 > score1, `score2 ${score2} should be > score1 ${score1}`);
    });
  });

  // -- Capital Evolution Tests --

  describe("Capital Evolution", function () {
    it("recordCapitalRaised - basic recording", async function () {
      const { registry, ethers, controller, agentId } = await deployActiveAgentFixture();

      await registry.connect(controller).recordCapitalRaised(agentId, ethers.parseEther("0.05"));

      assert.strictEqual(await registry.capitalRaised(agentId), ethers.parseEther("0.05"));
    });

    it("recordCapitalRaised - only controller can call", async function () {
      const { registry, ethers, user1, agentId } = await deployActiveAgentFixture();

      await assert.rejects(
        async () => { await registry.connect(user1).recordCapitalRaised(agentId, ethers.parseEther("1")); },
        { message: /caller is not controller/ }
      );
    });

    it("recordCapitalRaised - accumulates correctly", async function () {
      const { registry, ethers, controller, agentId } = await deployActiveAgentFixture();

      await registry.connect(controller).recordCapitalRaised(agentId, ethers.parseEther("0.03"));
      await registry.connect(controller).recordCapitalRaised(agentId, ethers.parseEther("0.07"));
      await registry.connect(controller).recordCapitalRaised(agentId, ethers.parseEther("0.4"));

      assert.strictEqual(await registry.capitalRaised(agentId), ethers.parseEther("0.5"));
    });

    it("recordCapitalRaised - reverts on zero amount", async function () {
      const { registry, controller, agentId } = await deployActiveAgentFixture();

      await assert.rejects(
        async () => { await registry.connect(controller).recordCapitalRaised(agentId, 0n); },
        { message: /zero amount/ }
      );
    });

    it("evolution to Level 1 at 0.1 ETH (Seed)", async function () {
      const { registry, ethers, controller, agentId } = await deployActiveAgentFixture();

      const tx = await registry.connect(controller).recordCapitalRaised(agentId, ethers.parseEther("0.1"));
      const receipt = await tx.wait();

      assert.strictEqual(await registry.evolutionLevel(agentId), 1n);

      // Verify CapitalEvolution event was emitted
      const event = receipt?.logs.find((log: any) => {
        try {
          return registry.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "CapitalEvolution";
        } catch { return false; }
      });
      assert.ok(event, "CapitalEvolution event should be emitted");

      const parsed = registry.interface.parseLog({ topics: event!.topics as string[], data: event!.data });
      assert.strictEqual(parsed?.args.newLevel, 1n);
      assert.strictEqual(parsed?.args.capitalRaisedTotal, ethers.parseEther("0.1"));
    });

    it("evolution to Level 2 at 1 ETH (Angel)", async function () {
      const { registry, ethers, controller, agentId } = await deployActiveAgentFixture();

      // First reach level 1
      await registry.connect(controller).recordCapitalRaised(agentId, ethers.parseEther("0.1"));
      assert.strictEqual(await registry.evolutionLevel(agentId), 1n);

      // Then reach level 2
      await registry.connect(controller).recordCapitalRaised(agentId, ethers.parseEther("0.9"));
      assert.strictEqual(await registry.evolutionLevel(agentId), 2n);
      assert.strictEqual(await registry.capitalRaised(agentId), ethers.parseEther("1"));
    });

    it("evolution to Level 5 at 100 ETH (Unicorn)", async function () {
      const { registry, ethers, controller, agentId } = await deployActiveAgentFixture();

      // Single large capital raise that crosses all thresholds
      await registry.connect(controller).recordCapitalRaised(agentId, ethers.parseEther("100"));

      assert.strictEqual(await registry.evolutionLevel(agentId), 5n);
      assert.strictEqual(await registry.capitalRaised(agentId), ethers.parseEther("100"));
    });

    it("no evolution below threshold", async function () {
      const { registry, ethers, controller, agentId } = await deployActiveAgentFixture();

      await registry.connect(controller).recordCapitalRaised(agentId, ethers.parseEther("0.05"));

      assert.strictEqual(await registry.evolutionLevel(agentId), 0n);

      // Add more but still below 0.1
      await registry.connect(controller).recordCapitalRaised(agentId, ethers.parseEther("0.04"));

      assert.strictEqual(await registry.evolutionLevel(agentId), 0n);
      assert.strictEqual(await registry.capitalRaised(agentId), ethers.parseEther("0.09"));
    });

    it("merkle root auto-generated on evolution", async function () {
      const { registry, ethers, controller, agentId } = await deployActiveAgentFixture();

      // Before evolution, merkle root should be zero
      assert.strictEqual(await registry.agentMerkleRoot(agentId), ethers.ZeroHash);

      // Trigger evolution
      await registry.connect(controller).recordCapitalRaised(agentId, ethers.parseEther("0.1"));

      // After evolution, merkle root should be non-zero
      const root = await registry.agentMerkleRoot(agentId);
      assert.notStrictEqual(root, ethers.ZeroHash);
    });

    it("merkle root changes with different state", async function () {
      const { registry, ethers, controller, agentId } = await deployActiveAgentFixture();

      // Evolve to level 1
      await registry.connect(controller).recordCapitalRaised(agentId, ethers.parseEther("0.1"));
      const root1 = await registry.agentMerkleRoot(agentId);

      // Record revenue to change agent state
      await registry.connect(controller).recordRevenue(agentId, ethers.parseEther("50"));

      // Evolve to level 2 - new root should be calculated from different state
      await registry.connect(controller).recordCapitalRaised(agentId, ethers.parseEther("0.9"));
      const root2 = await registry.agentMerkleRoot(agentId);

      assert.notStrictEqual(root1, root2, "Merkle root should change when agent state differs");
    });

    it("updateMerkleRoot - manual update by controller", async function () {
      const { registry, ethers, controller, agentId } = await deployActiveAgentFixture();

      const manualRoot = ethers.keccak256(ethers.toUtf8Bytes("manual-merkle-root"));

      const tx = await registry.connect(controller).updateMerkleRoot(agentId, manualRoot);
      const receipt = await tx.wait();

      assert.strictEqual(await registry.agentMerkleRoot(agentId), manualRoot);

      // Verify MerkleRootUpdated event
      const event = receipt?.logs.find((log: any) => {
        try {
          return registry.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "MerkleRootUpdated";
        } catch { return false; }
      });
      assert.ok(event, "MerkleRootUpdated event should be emitted");

      const parsed = registry.interface.parseLog({ topics: event!.topics as string[], data: event!.data });
      assert.strictEqual(parsed?.args.merkleRoot, manualRoot);
    });

    it("updateMerkleRoot - rejects zero root", async function () {
      const { registry, ethers, controller, agentId } = await deployActiveAgentFixture();

      await assert.rejects(
        async () => { await registry.connect(controller).updateMerkleRoot(agentId, ethers.ZeroHash); },
        { message: /zero root/ }
      );
    });

    it("updateMerkleRoot - only controller can call", async function () {
      const { registry, ethers, user1, agentId } = await deployActiveAgentFixture();

      const root = ethers.keccak256(ethers.toUtf8Bytes("root"));

      await assert.rejects(
        async () => { await registry.connect(user1).updateMerkleRoot(agentId, root); },
        { message: /caller is not controller/ }
      );
    });

    it("getEvolutionLevel - returns correct level", async function () {
      const { registry, ethers, controller, agentId } = await deployActiveAgentFixture();

      // Initially level 0
      assert.strictEqual(await registry.getEvolutionLevel(agentId), 0n);

      // Evolve to level 3 (Series A)
      await registry.connect(controller).recordCapitalRaised(agentId, ethers.parseEther("10"));

      assert.strictEqual(await registry.getEvolutionLevel(agentId), 3n);
    });

    it("getCapitalRaised - returns accumulated capital", async function () {
      const { registry, ethers, controller, agentId } = await deployActiveAgentFixture();

      // Initially zero
      assert.strictEqual(await registry.getCapitalRaised(agentId), 0n);

      await registry.connect(controller).recordCapitalRaised(agentId, ethers.parseEther("2.5"));
      await registry.connect(controller).recordCapitalRaised(agentId, ethers.parseEther("7.5"));

      assert.strictEqual(await registry.getCapitalRaised(agentId), ethers.parseEther("10"));
    });

    it("getMilestoneThresholds - returns correct thresholds", async function () {
      const { registry, ethers } = await deployActiveAgentFixture();

      const thresholds = await registry.getMilestoneThresholds();

      assert.strictEqual(thresholds[0], ethers.parseEther("0.1"));
      assert.strictEqual(thresholds[1], ethers.parseEther("1"));
      assert.strictEqual(thresholds[2], ethers.parseEther("10"));
      assert.strictEqual(thresholds[3], ethers.parseEther("50"));
      assert.strictEqual(thresholds[4], ethers.parseEther("100"));
      assert.strictEqual(thresholds.length, 5);
    });
  });
});
