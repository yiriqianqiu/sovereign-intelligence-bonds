import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("ComputeMarketplace", function () {
  async function deployFixture() {
    const connection = await hre.network.connect();
    const { ethers, networkHelpers } = connection;
    const [owner, provider, agentOwner, user3, user4] =
      await ethers.getSigners();

    // Deploy NFARegistry
    const NFARegistry = await ethers.getContractFactory("NFARegistry");
    const nfaRegistry = await NFARegistry.deploy();

    // Deploy TokenRegistry
    const TokenRegistry = await ethers.getContractFactory("TokenRegistry");
    const tokenRegistry = await TokenRegistry.deploy(owner.address);

    // Deploy MockERC20
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockToken = await MockERC20.deploy("Mock USDT", "MUSDT", 18);
    const mockTokenAddr = await mockToken.getAddress();

    // Register mock token in TokenRegistry
    await tokenRegistry
      .connect(owner)
      .addToken(mockTokenAddr, "MUSDT", 18, 1n * 10n ** 18n);

    // Deploy ComputeMarketplace
    const ComputeMarketplace =
      await ethers.getContractFactory("ComputeMarketplace");
    const marketplace = await ComputeMarketplace.deploy(
      await nfaRegistry.getAddress(),
      await tokenRegistry.getAddress()
    );

    // Set controller on NFARegistry (owner acts as controller)
    await nfaRegistry.connect(owner).setController(owner.address);

    // Register an agent owned by agentOwner, set to Active
    const tx = await nfaRegistry
      .connect(agentOwner)
      .registerAgent("TestAgent", "A test agent", "hash123", "http://test");
    const receipt = await tx.wait();
    const agentId = 1n; // first agent

    // Transition: Registered -> Active
    await nfaRegistry.connect(agentOwner).updateState(agentId, 1); // 1 = Active

    return {
      marketplace,
      nfaRegistry,
      tokenRegistry,
      mockToken,
      mockTokenAddr,
      ethers,
      networkHelpers,
      owner,
      provider,
      agentOwner,
      user3,
      user4,
      agentId,
    };
  }

  // Helper: register a BNB resource (paymentToken = address(0))
  async function registerBNBResource(
    marketplace: any,
    provider: any,
    opts: {
      name?: string;
      specs?: string;
      resourceType?: number;
      pricePerHour?: bigint;
      minCreditRating?: number;
      minEvolutionLevel?: number;
      totalCapacity?: bigint;
    } = {}
  ) {
    const {
      name = "GPU-A100",
      specs = "80GB HBM2e",
      resourceType = 1, // GPU
      pricePerHour = 10n ** 15n, // 0.001 BNB/hr
      minCreditRating = 0,
      minEvolutionLevel = 0,
      totalCapacity = 10n,
    } = opts;

    const ethersZeroAddr = "0x0000000000000000000000000000000000000000";
    const tx = await marketplace
      .connect(provider)
      .registerResource(
        name,
        specs,
        resourceType,
        pricePerHour,
        ethersZeroAddr,
        minCreditRating,
        minEvolutionLevel,
        totalCapacity
      );
    const receipt = await tx.wait();
    return { tx, receipt };
  }

  // Helper: register an ERC-20 resource
  async function registerERC20Resource(
    marketplace: any,
    provider: any,
    tokenAddr: string,
    opts: {
      pricePerHour?: bigint;
      minCreditRating?: number;
      minEvolutionLevel?: number;
      totalCapacity?: bigint;
    } = {}
  ) {
    const {
      pricePerHour = 10n ** 18n, // 1 token/hr
      minCreditRating = 0,
      minEvolutionLevel = 0,
      totalCapacity = 5n,
    } = opts;

    const tx = await marketplace
      .connect(provider)
      .registerResource(
        "ERC20-GPU",
        "specs",
        1,
        pricePerHour,
        tokenAddr,
        minCreditRating,
        minEvolutionLevel,
        totalCapacity
      );
    const receipt = await tx.wait();
    return { tx, receipt };
  }

  // -------------------------------------------------------------------
  // 1. Deployment
  // -------------------------------------------------------------------

  describe("deployment", function () {
    it("should set nfaRegistry and tokenRegistry correctly", async function () {
      const { marketplace, nfaRegistry, tokenRegistry } = await deployFixture();

      assert.strictEqual(
        await marketplace.nfaRegistry(),
        await nfaRegistry.getAddress()
      );
      assert.strictEqual(
        await marketplace.tokenRegistry(),
        await tokenRegistry.getAddress()
      );
    });

    it("should set default protocolFeeBps to 250", async function () {
      const { marketplace } = await deployFixture();

      assert.strictEqual(await marketplace.protocolFeeBps(), 250n);
    });

    it("should set deployer as owner", async function () {
      const { marketplace, owner } = await deployFixture();

      assert.strictEqual(await marketplace.owner(), owner.address);
    });

    it("should revert if nfaRegistry is zero address", async function () {
      const { ethers, tokenRegistry } = await deployFixture();
      const ComputeMarketplace =
        await ethers.getContractFactory("ComputeMarketplace");

      await assert.rejects(
        async () => {
          await ComputeMarketplace.deploy(
            ethers.ZeroAddress,
            await tokenRegistry.getAddress()
          );
        },
        { message: /zero registry/ }
      );
    });

    it("should revert if tokenRegistry is zero address", async function () {
      const { ethers, nfaRegistry } = await deployFixture();
      const ComputeMarketplace =
        await ethers.getContractFactory("ComputeMarketplace");

      await assert.rejects(
        async () => {
          await ComputeMarketplace.deploy(
            await nfaRegistry.getAddress(),
            ethers.ZeroAddress
          );
        },
        { message: /zero tokenRegistry/ }
      );
    });
  });

  // -------------------------------------------------------------------
  // 2. registerResource
  // -------------------------------------------------------------------

  describe("registerResource", function () {
    it("should register a BNB resource successfully", async function () {
      const { marketplace, provider } = await deployFixture();

      await registerBNBResource(marketplace, provider);

      const res = await marketplace.resources(1n);
      assert.strictEqual(res.provider, provider.address);
      assert.strictEqual(res.name, "GPU-A100");
      assert.strictEqual(res.specs, "80GB HBM2e");
      assert.strictEqual(res.resourceType, 1n); // GPU
      assert.strictEqual(res.pricePerHour, 10n ** 15n);
      assert.strictEqual(res.totalCapacity, 10n);
      assert.strictEqual(res.usedCapacity, 0n);
      assert.strictEqual(res.active, true);
    });

    it("should emit ResourceRegistered event", async function () {
      const { marketplace, provider } = await deployFixture();

      const { receipt } = await registerBNBResource(marketplace, provider);

      const event = receipt?.logs.find((log: any) => {
        try {
          return (
            marketplace.interface.parseLog({
              topics: log.topics as string[],
              data: log.data,
            })?.name === "ResourceRegistered"
          );
        } catch {
          return false;
        }
      });
      assert.ok(event, "ResourceRegistered event should be emitted");
    });

    it("should track provider resources", async function () {
      const { marketplace, provider } = await deployFixture();

      await registerBNBResource(marketplace, provider, { name: "Res1" });
      await registerBNBResource(marketplace, provider, { name: "Res2" });

      const ids = await marketplace.getProviderResources(provider.address);
      assert.strictEqual(ids.length, 2);
      assert.strictEqual(ids[0], 1n);
      assert.strictEqual(ids[1], 2n);
    });

    it("should revert with empty name", async function () {
      const { marketplace, provider, ethers } = await deployFixture();

      await assert.rejects(
        async () => {
          await marketplace
            .connect(provider)
            .registerResource(
              "",
              "specs",
              0,
              10n ** 15n,
              ethers.ZeroAddress,
              0,
              0,
              10
            );
        },
        { message: /empty name/ }
      );
    });

    it("should revert with zero price", async function () {
      const { marketplace, provider, ethers } = await deployFixture();

      await assert.rejects(
        async () => {
          await marketplace
            .connect(provider)
            .registerResource(
              "name",
              "specs",
              0,
              0,
              ethers.ZeroAddress,
              0,
              0,
              10
            );
        },
        { message: /zero price/ }
      );
    });

    it("should revert with zero capacity", async function () {
      const { marketplace, provider, ethers } = await deployFixture();

      await assert.rejects(
        async () => {
          await marketplace
            .connect(provider)
            .registerResource(
              "name",
              "specs",
              0,
              10n ** 15n,
              ethers.ZeroAddress,
              0,
              0,
              0
            );
        },
        { message: /zero capacity/ }
      );
    });

    it("should revert with unsupported ERC-20 token", async function () {
      const { marketplace, provider } = await deployFixture();
      const fakeToken = "0x0000000000000000000000000000000000000099";

      await assert.rejects(
        async () => {
          await marketplace
            .connect(provider)
            .registerResource("name", "specs", 0, 100, fakeToken, 0, 0, 10);
        },
        { message: /unsupported token/ }
      );
    });

    it("should revert with invalid credit rating > 5", async function () {
      const { marketplace, provider, ethers } = await deployFixture();

      await assert.rejects(
        async () => {
          await marketplace
            .connect(provider)
            .registerResource(
              "name",
              "specs",
              0,
              100,
              ethers.ZeroAddress,
              6,
              0,
              10
            );
        },
        { message: /invalid rating/ }
      );
    });

    it("should revert with invalid evolution level > 5", async function () {
      const { marketplace, provider, ethers } = await deployFixture();

      await assert.rejects(
        async () => {
          await marketplace
            .connect(provider)
            .registerResource(
              "name",
              "specs",
              0,
              100,
              ethers.ZeroAddress,
              0,
              6,
              10
            );
        },
        { message: /invalid level/ }
      );
    });
  });

  // -------------------------------------------------------------------
  // 3. updateResourcePrice & deactivateResource
  // -------------------------------------------------------------------

  describe("updateResourcePrice", function () {
    it("should update price successfully", async function () {
      const { marketplace, provider } = await deployFixture();

      await registerBNBResource(marketplace, provider);
      await marketplace.connect(provider).updateResourcePrice(1n, 999n);

      const res = await marketplace.resources(1n);
      assert.strictEqual(res.pricePerHour, 999n);
    });

    it("should revert if not provider", async function () {
      const { marketplace, provider, user3 } = await deployFixture();

      await registerBNBResource(marketplace, provider);

      await assert.rejects(
        async () => {
          await marketplace.connect(user3).updateResourcePrice(1n, 999n);
        },
        { message: /not provider/ }
      );
    });

    it("should revert with zero price", async function () {
      const { marketplace, provider } = await deployFixture();

      await registerBNBResource(marketplace, provider);

      await assert.rejects(
        async () => {
          await marketplace.connect(provider).updateResourcePrice(1n, 0n);
        },
        { message: /zero price/ }
      );
    });
  });

  describe("deactivateResource", function () {
    it("should deactivate by provider", async function () {
      const { marketplace, provider } = await deployFixture();

      await registerBNBResource(marketplace, provider);
      await marketplace.connect(provider).deactivateResource(1n);

      const res = await marketplace.resources(1n);
      assert.strictEqual(res.active, false);
    });

    it("should allow owner to deactivate", async function () {
      const { marketplace, provider, owner } = await deployFixture();

      await registerBNBResource(marketplace, provider);
      await marketplace.connect(owner).deactivateResource(1n);

      const res = await marketplace.resources(1n);
      assert.strictEqual(res.active, false);
    });

    it("should revert if unauthorized", async function () {
      const { marketplace, provider, user3 } = await deployFixture();

      await registerBNBResource(marketplace, provider);

      await assert.rejects(
        async () => {
          await marketplace.connect(user3).deactivateResource(1n);
        },
        { message: /not authorized/ }
      );
    });

    it("should revert if already deactivated", async function () {
      const { marketplace, provider } = await deployFixture();

      await registerBNBResource(marketplace, provider);
      await marketplace.connect(provider).deactivateResource(1n);

      await assert.rejects(
        async () => {
          await marketplace.connect(provider).deactivateResource(1n);
        },
        { message: /not active/ }
      );
    });
  });

  // -------------------------------------------------------------------
  // 4. rentComputeBNB
  // -------------------------------------------------------------------

  describe("rentComputeBNB", function () {
    it("should rent successfully with BNB", async function () {
      const { marketplace, provider, agentOwner, agentId } =
        await deployFixture();

      const pricePerHour = 10n ** 15n; // 0.001 BNB
      await registerBNBResource(marketplace, provider, { pricePerHour });

      const units = 2n;
      const hours = 3n;
      const totalCost = pricePerHour * units * hours;

      const tx = await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, units, hours, { value: totalCost });
      const receipt = await tx.wait();

      // Check rental struct
      const rental = await marketplace.rentals(1n);
      assert.strictEqual(rental.agentId, agentId);
      assert.strictEqual(rental.resourceId, 1n);
      assert.strictEqual(rental.unitsRented, units);
      assert.strictEqual(rental.duration, hours);
      assert.strictEqual(rental.depositAmount, totalCost);
      assert.strictEqual(rental.active, true);
      assert.strictEqual(rental.settled, false);

      // Check used capacity
      const res = await marketplace.resources(1n);
      assert.strictEqual(res.usedCapacity, units);
    });

    it("should refund excess BNB", async function () {
      const { marketplace, provider, agentOwner, agentId, ethers } =
        await deployFixture();

      const pricePerHour = 10n ** 15n;
      await registerBNBResource(marketplace, provider, { pricePerHour });

      const totalCost = pricePerHour * 1n * 1n;
      const excess = 10n ** 16n; // 10x the cost

      const balBefore = await ethers.provider.getBalance(agentOwner.address);
      const tx = await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, 1n, 1n, { value: totalCost + excess });
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(agentOwner.address);

      // balBefore - totalCost - gasUsed should approximately equal balAfter
      const expected = balBefore - totalCost - gasUsed;
      assert.strictEqual(balAfter, expected);
    });

    it("should revert with insufficient BNB", async function () {
      const { marketplace, provider, agentOwner, agentId } =
        await deployFixture();

      const pricePerHour = 10n ** 15n;
      await registerBNBResource(marketplace, provider, { pricePerHour });

      const totalCost = pricePerHour * 1n * 1n;

      await assert.rejects(
        async () => {
          await marketplace
            .connect(agentOwner)
            .rentComputeBNB(agentId, 1n, 1n, 1n, {
              value: totalCost - 1n,
            });
        },
        { message: /insufficient BNB/ }
      );
    });

    it("should revert if agent not active", async function () {
      const { marketplace, provider, agentOwner, nfaRegistry, ethers } =
        await deployFixture();

      // Register a second agent but do NOT activate it
      await nfaRegistry
        .connect(agentOwner)
        .registerAgent("Inactive", "desc", "hash", "http://x");
      const inactiveAgentId = 2n; // still in Registered state

      await registerBNBResource(marketplace, provider);

      await assert.rejects(
        async () => {
          await marketplace
            .connect(agentOwner)
            .rentComputeBNB(inactiveAgentId, 1n, 1n, 1n, {
              value: 10n ** 15n,
            });
        },
        { message: /agent not active/ }
      );
    });

    it("should revert if caller is not agent owner", async function () {
      const { marketplace, provider, agentId, user3 } = await deployFixture();

      await registerBNBResource(marketplace, provider);

      await assert.rejects(
        async () => {
          await marketplace
            .connect(user3)
            .rentComputeBNB(agentId, 1n, 1n, 1n, { value: 10n ** 15n });
        },
        { message: /not authorized/ }
      );
    });

    it("should revert if insufficient capacity", async function () {
      const { marketplace, provider, agentOwner, agentId } =
        await deployFixture();

      const pricePerHour = 100n;
      await registerBNBResource(marketplace, provider, {
        pricePerHour,
        totalCapacity: 2n,
      });

      // Try renting 3 units but only 2 capacity
      await assert.rejects(
        async () => {
          await marketplace
            .connect(agentOwner)
            .rentComputeBNB(agentId, 1n, 3n, 1n, {
              value: pricePerHour * 3n * 1n,
            });
        },
        { message: /insufficient capacity/ }
      );
    });

    it("should revert if resource is deactivated", async function () {
      const { marketplace, provider, agentOwner, agentId } =
        await deployFixture();

      await registerBNBResource(marketplace, provider);
      await marketplace.connect(provider).deactivateResource(1n);

      await assert.rejects(
        async () => {
          await marketplace
            .connect(agentOwner)
            .rentComputeBNB(agentId, 1n, 1n, 1n, { value: 10n ** 15n });
        },
        { message: /resource not active/ }
      );
    });

    it("should revert if credit rating is insufficient", async function () {
      const { marketplace, provider, agentOwner, agentId, owner, nfaRegistry } =
        await deployFixture();

      // Register resource requiring minCreditRating = 3 (A)
      await registerBNBResource(marketplace, provider, {
        minCreditRating: 3,
        pricePerHour: 100n,
      });

      // Agent has creditRating = 0 (Unrated) by default
      await assert.rejects(
        async () => {
          await marketplace
            .connect(agentOwner)
            .rentComputeBNB(agentId, 1n, 1n, 1n, { value: 100n });
        },
        { message: /insufficient credit rating/ }
      );

      // Now set credit rating to 3 (A) -- should succeed
      await nfaRegistry.connect(owner).updateCreditRating(agentId, 3);

      await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, 1n, 1n, { value: 100n });

      const rental = await marketplace.rentals(1n);
      assert.strictEqual(rental.active, true);
    });

    it("should revert if evolution level is insufficient", async function () {
      const { marketplace, provider, agentOwner, agentId, owner, nfaRegistry, ethers } =
        await deployFixture();

      // Register resource requiring minEvolutionLevel = 2
      await registerBNBResource(marketplace, provider, {
        minEvolutionLevel: 2,
        pricePerHour: 100n,
      });

      // Agent has evolutionLevel = 0 by default
      await assert.rejects(
        async () => {
          await marketplace
            .connect(agentOwner)
            .rentComputeBNB(agentId, 1n, 1n, 1n, { value: 100n });
        },
        { message: /insufficient evolution level/ }
      );

      // recordCapitalRaised with 1 ether -> level 2 (Angel milestone)
      await nfaRegistry
        .connect(owner)
        .recordCapitalRaised(agentId, ethers.parseEther("1"));

      const level = await nfaRegistry.evolutionLevel(agentId);
      assert.ok(level >= 2n, "evolution level should be >= 2 after 1 ETH");

      await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, 1n, 1n, { value: 100n });

      const rental = await marketplace.rentals(1n);
      assert.strictEqual(rental.active, true);
    });

    it("should revert if paymentToken is not address(0)", async function () {
      const { marketplace, provider, agentOwner, agentId, mockTokenAddr } =
        await deployFixture();

      // Register an ERC-20 resource
      await registerERC20Resource(marketplace, provider, mockTokenAddr, {
        pricePerHour: 100n,
      });

      // Try renting with rentComputeBNB on an ERC-20 resource
      await assert.rejects(
        async () => {
          await marketplace
            .connect(agentOwner)
            .rentComputeBNB(agentId, 1n, 1n, 1n, { value: 100n });
        },
        { message: /not BNB resource/ }
      );
    });
  });

  // -------------------------------------------------------------------
  // 5. rentComputeERC20
  // -------------------------------------------------------------------

  describe("rentComputeERC20", function () {
    it("should rent successfully with ERC-20", async function () {
      const {
        marketplace,
        provider,
        agentOwner,
        agentId,
        mockToken,
        mockTokenAddr,
      } = await deployFixture();

      const pricePerHour = 10n ** 18n; // 1 token/hr
      await registerERC20Resource(marketplace, provider, mockTokenAddr, {
        pricePerHour,
      });

      const units = 1n;
      const hours = 2n;
      const totalCost = pricePerHour * units * hours;

      // Mint tokens and approve
      await mockToken.mint(agentOwner.address, totalCost);
      await mockToken
        .connect(agentOwner)
        .approve(await marketplace.getAddress(), totalCost);

      const tx = await marketplace
        .connect(agentOwner)
        .rentComputeERC20(agentId, 1n, units, hours);
      await tx.wait();

      const rental = await marketplace.rentals(1n);
      assert.strictEqual(rental.agentId, agentId);
      assert.strictEqual(rental.depositAmount, totalCost);
      assert.strictEqual(rental.paymentToken, mockTokenAddr);
      assert.strictEqual(rental.active, true);
    });

    it("should revert if resource is BNB-priced", async function () {
      const { marketplace, provider, agentOwner, agentId } =
        await deployFixture();

      await registerBNBResource(marketplace, provider, { pricePerHour: 100n });

      await assert.rejects(
        async () => {
          await marketplace
            .connect(agentOwner)
            .rentComputeERC20(agentId, 1n, 1n, 1n);
        },
        { message: /not ERC20 resource/ }
      );
    });
  });

  // -------------------------------------------------------------------
  // 6. endRental
  // -------------------------------------------------------------------

  describe("endRental", function () {
    it("should end rental with partial refund (early termination)", async function () {
      const {
        marketplace,
        provider,
        agentOwner,
        agentId,
        ethers,
        networkHelpers,
      } = await deployFixture();

      const pricePerHour = 10n ** 15n;
      await registerBNBResource(marketplace, provider, { pricePerHour });

      const units = 1n;
      const hours = 10n;
      const totalCost = pricePerHour * units * hours;

      await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, units, hours, { value: totalCost });

      // Advance 3 hours
      await networkHelpers.time.increase(3 * 3600);

      const balBefore = await ethers.provider.getBalance(agentOwner.address);
      const tx = await marketplace.connect(agentOwner).endRental(1n);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(agentOwner.address);

      // Used 3 hours of 10 => usedCost = totalCost * 3 / 10, refund = totalCost * 7 / 10
      const expectedRefund = (totalCost * 7n) / 10n;
      const actualGain = balAfter - balBefore + gasUsed;
      assert.strictEqual(actualGain, expectedRefund);

      // Rental should be inactive
      const rental = await marketplace.rentals(1n);
      assert.strictEqual(rental.active, false);
      // depositAmount should be updated to usedCost
      assert.strictEqual(rental.depositAmount, (totalCost * 3n) / 10n);

      // Capacity should be released
      const res = await marketplace.resources(1n);
      assert.strictEqual(res.usedCapacity, 0n);
    });

    it("should end rental with no refund after full duration", async function () {
      const { marketplace, provider, agentOwner, agentId, networkHelpers } =
        await deployFixture();

      const pricePerHour = 10n ** 15n;
      await registerBNBResource(marketplace, provider, { pricePerHour });

      const hours = 2n;
      const totalCost = pricePerHour * 1n * hours;

      await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, 1n, hours, { value: totalCost });

      // Advance past full duration
      await networkHelpers.time.increase(5 * 3600);

      const tx = await marketplace.connect(agentOwner).endRental(1n);
      const receipt = await tx.wait();

      // Check event for zero refund
      const event = receipt?.logs.find((log: any) => {
        try {
          const parsed = marketplace.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          return parsed?.name === "RentalEnded";
        } catch {
          return false;
        }
      });
      assert.ok(event, "RentalEnded event should be emitted");
      const parsed = marketplace.interface.parseLog({
        topics: event!.topics as string[],
        data: event!.data,
      });
      assert.strictEqual(parsed!.args.refundAmount, 0n);
    });

    it("should allow provider to end rental", async function () {
      const { marketplace, provider, agentOwner, agentId } =
        await deployFixture();

      await registerBNBResource(marketplace, provider, { pricePerHour: 100n });
      await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, 1n, 1n, { value: 100n });

      // Provider ends rental
      await marketplace.connect(provider).endRental(1n);

      const rental = await marketplace.rentals(1n);
      assert.strictEqual(rental.active, false);
    });

    it("should allow contract owner to end rental", async function () {
      const { marketplace, provider, agentOwner, agentId, owner } =
        await deployFixture();

      await registerBNBResource(marketplace, provider, { pricePerHour: 100n });
      await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, 1n, 1n, { value: 100n });

      await marketplace.connect(owner).endRental(1n);

      const rental = await marketplace.rentals(1n);
      assert.strictEqual(rental.active, false);
    });

    it("should revert if unauthorized caller", async function () {
      const { marketplace, provider, agentOwner, agentId, user3 } =
        await deployFixture();

      await registerBNBResource(marketplace, provider, { pricePerHour: 100n });
      await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, 1n, 1n, { value: 100n });

      await assert.rejects(
        async () => {
          await marketplace.connect(user3).endRental(1n);
        },
        { message: /not authorized/ }
      );
    });

    it("should revert if rental already ended", async function () {
      const { marketplace, provider, agentOwner, agentId } =
        await deployFixture();

      await registerBNBResource(marketplace, provider, { pricePerHour: 100n });
      await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, 1n, 1n, { value: 100n });

      await marketplace.connect(agentOwner).endRental(1n);

      await assert.rejects(
        async () => {
          await marketplace.connect(agentOwner).endRental(1n);
        },
        { message: /rental not active/ }
      );
    });
  });

  // -------------------------------------------------------------------
  // 7. claimPayment
  // -------------------------------------------------------------------

  describe("claimPayment", function () {
    it("should allow provider to claim BNB payment with protocol fee", async function () {
      const {
        marketplace,
        provider,
        agentOwner,
        agentId,
        ethers,
        networkHelpers,
      } = await deployFixture();

      const pricePerHour = 10n ** 16n; // 0.01 BNB
      await registerBNBResource(marketplace, provider, { pricePerHour });

      const totalCost = pricePerHour * 1n * 1n;

      await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, 1n, 1n, { value: totalCost });

      // Advance past duration, then end
      await networkHelpers.time.increase(2 * 3600);
      await marketplace.connect(agentOwner).endRental(1n);

      // Provider claims payment
      const balBefore = await ethers.provider.getBalance(provider.address);
      const tx = await marketplace.connect(provider).claimPayment(1n);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(provider.address);

      // Fee = 2.5% of totalCost
      const fee = (totalCost * 250n) / 10000n;
      const providerAmount = totalCost - fee;

      assert.strictEqual(balAfter - balBefore + gasUsed, providerAmount);

      // Check accumulated fees
      assert.strictEqual(await marketplace.accumulatedFees(), fee);

      // Check settled flag
      const rental = await marketplace.rentals(1n);
      assert.strictEqual(rental.settled, true);
    });

    it("should allow provider to claim ERC-20 payment", async function () {
      const {
        marketplace,
        provider,
        agentOwner,
        agentId,
        mockToken,
        mockTokenAddr,
        networkHelpers,
      } = await deployFixture();

      const pricePerHour = 10n ** 18n;
      await registerERC20Resource(marketplace, provider, mockTokenAddr, {
        pricePerHour,
      });

      const totalCost = pricePerHour * 1n * 1n;

      await mockToken.mint(agentOwner.address, totalCost);
      await mockToken
        .connect(agentOwner)
        .approve(await marketplace.getAddress(), totalCost);
      await marketplace
        .connect(agentOwner)
        .rentComputeERC20(agentId, 1n, 1n, 1n);

      await networkHelpers.time.increase(2 * 3600);
      await marketplace.connect(agentOwner).endRental(1n);

      const providerBalBefore = await mockToken.balanceOf(provider.address);
      await marketplace.connect(provider).claimPayment(1n);
      const providerBalAfter = await mockToken.balanceOf(provider.address);

      const fee = (totalCost * 250n) / 10000n;
      const providerAmount = totalCost - fee;
      assert.strictEqual(providerBalAfter - providerBalBefore, providerAmount);

      // Check accumulated token fees
      assert.strictEqual(
        await marketplace.accumulatedTokenFees(mockTokenAddr),
        fee
      );
    });

    it("should revert if rental is still active", async function () {
      const { marketplace, provider, agentOwner, agentId } =
        await deployFixture();

      await registerBNBResource(marketplace, provider, { pricePerHour: 100n });
      await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, 1n, 1n, { value: 100n });

      await assert.rejects(
        async () => {
          await marketplace.connect(provider).claimPayment(1n);
        },
        { message: /rental still active/ }
      );
    });

    it("should revert if already settled", async function () {
      const { marketplace, provider, agentOwner, agentId, networkHelpers } =
        await deployFixture();

      await registerBNBResource(marketplace, provider, { pricePerHour: 100n });
      await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, 1n, 1n, { value: 100n });

      await networkHelpers.time.increase(2 * 3600);
      await marketplace.connect(agentOwner).endRental(1n);
      await marketplace.connect(provider).claimPayment(1n);

      await assert.rejects(
        async () => {
          await marketplace.connect(provider).claimPayment(1n);
        },
        { message: /already settled/ }
      );
    });

    it("should revert if caller is not provider", async function () {
      const { marketplace, provider, agentOwner, agentId, user3 } =
        await deployFixture();

      await registerBNBResource(marketplace, provider, { pricePerHour: 100n });
      await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, 1n, 1n, { value: 100n });

      await marketplace.connect(agentOwner).endRental(1n);

      await assert.rejects(
        async () => {
          await marketplace.connect(user3).claimPayment(1n);
        },
        { message: /not provider/ }
      );
    });
  });

  // -------------------------------------------------------------------
  // 8. Admin: setProtocolFee, withdrawFees
  // -------------------------------------------------------------------

  describe("admin", function () {
    it("should allow owner to set protocol fee", async function () {
      const { marketplace, owner } = await deployFixture();

      await marketplace.connect(owner).setProtocolFee(500n);
      assert.strictEqual(await marketplace.protocolFeeBps(), 500n);
    });

    it("should revert if fee exceeds MAX_FEE_BPS (1000)", async function () {
      const { marketplace, owner } = await deployFixture();

      await assert.rejects(
        async () => {
          await marketplace.connect(owner).setProtocolFee(1001n);
        },
        { message: /fee too high/ }
      );
    });

    it("should revert if non-owner sets fee", async function () {
      const { marketplace, user3 } = await deployFixture();

      await assert.rejects(
        async () => {
          await marketplace.connect(user3).setProtocolFee(100n);
        },
        { message: /OwnableUnauthorizedAccount/ }
      );
    });

    it("should withdraw accumulated BNB fees", async function () {
      const {
        marketplace,
        provider,
        agentOwner,
        agentId,
        owner,
        ethers,
        networkHelpers,
      } = await deployFixture();

      const pricePerHour = 10n ** 16n; // 0.01 BNB
      await registerBNBResource(marketplace, provider, { pricePerHour });

      const totalCost = pricePerHour * 1n * 1n;

      await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, 1n, 1n, { value: totalCost });

      await networkHelpers.time.increase(2 * 3600);
      await marketplace.connect(agentOwner).endRental(1n);
      await marketplace.connect(provider).claimPayment(1n);

      const fee = (totalCost * 250n) / 10000n;
      assert.strictEqual(await marketplace.accumulatedFees(), fee);

      const balBefore = await ethers.provider.getBalance(owner.address);
      const tx = await marketplace.connect(owner).withdrawFees();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(owner.address);

      assert.strictEqual(balAfter - balBefore + gasUsed, fee);
      assert.strictEqual(await marketplace.accumulatedFees(), 0n);
    });

    it("should withdraw accumulated ERC-20 fees", async function () {
      const {
        marketplace,
        provider,
        agentOwner,
        agentId,
        owner,
        mockToken,
        mockTokenAddr,
        networkHelpers,
      } = await deployFixture();

      const pricePerHour = 10n ** 18n;
      await registerERC20Resource(marketplace, provider, mockTokenAddr, {
        pricePerHour,
      });

      const totalCost = pricePerHour * 1n * 1n;
      await mockToken.mint(agentOwner.address, totalCost);
      await mockToken
        .connect(agentOwner)
        .approve(await marketplace.getAddress(), totalCost);
      await marketplace
        .connect(agentOwner)
        .rentComputeERC20(agentId, 1n, 1n, 1n);

      await networkHelpers.time.increase(2 * 3600);
      await marketplace.connect(agentOwner).endRental(1n);
      await marketplace.connect(provider).claimPayment(1n);

      const fee = (totalCost * 250n) / 10000n;

      const ownerBalBefore = await mockToken.balanceOf(owner.address);
      await marketplace.connect(owner).withdrawTokenFees(mockTokenAddr);
      const ownerBalAfter = await mockToken.balanceOf(owner.address);

      assert.strictEqual(ownerBalAfter - ownerBalBefore, fee);
      assert.strictEqual(
        await marketplace.accumulatedTokenFees(mockTokenAddr),
        0n
      );
    });
  });

  // -------------------------------------------------------------------
  // 9. View functions
  // -------------------------------------------------------------------

  describe("view functions", function () {
    it("isEligible should return true when agent meets requirements", async function () {
      const { marketplace, provider, agentId, owner, nfaRegistry, ethers } =
        await deployFixture();

      await registerBNBResource(marketplace, provider, {
        minCreditRating: 2,
        minEvolutionLevel: 1,
      });

      // Initially not eligible
      assert.strictEqual(await marketplace.isEligible(agentId, 1n), false);

      // Set credit to B (2) and evolution to level 1 (0.1 ETH)
      await nfaRegistry.connect(owner).updateCreditRating(agentId, 2);
      await nfaRegistry
        .connect(owner)
        .recordCapitalRaised(agentId, ethers.parseEther("0.1"));

      assert.strictEqual(await marketplace.isEligible(agentId, 1n), true);
    });

    it("isEligible should return false for deactivated resource", async function () {
      const { marketplace, provider, agentId } = await deployFixture();

      await registerBNBResource(marketplace, provider);
      await marketplace.connect(provider).deactivateResource(1n);

      assert.strictEqual(await marketplace.isEligible(agentId, 1n), false);
    });

    it("getActiveRentalCount should track active rentals", async function () {
      const { marketplace, provider, agentOwner, agentId } =
        await deployFixture();

      await registerBNBResource(marketplace, provider, {
        pricePerHour: 100n,
        totalCapacity: 10n,
      });

      // No rentals initially
      assert.strictEqual(
        await marketplace.getActiveRentalCount(agentId),
        0n
      );

      // Rent twice
      await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, 1n, 1n, { value: 100n });
      await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, 1n, 1n, { value: 100n });

      assert.strictEqual(
        await marketplace.getActiveRentalCount(agentId),
        2n
      );

      // End one rental
      await marketplace.connect(agentOwner).endRental(1n);

      assert.strictEqual(
        await marketplace.getActiveRentalCount(agentId),
        1n
      );
    });

    it("getAgentRentals should return rental IDs", async function () {
      const { marketplace, provider, agentOwner, agentId } =
        await deployFixture();

      await registerBNBResource(marketplace, provider, {
        pricePerHour: 100n,
        totalCapacity: 10n,
      });

      await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, 1n, 1n, { value: 100n });
      await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, 1n, 2n, { value: 200n });

      const ids = await marketplace.getAgentRentals(agentId);
      assert.strictEqual(ids.length, 2);
      assert.strictEqual(ids[0], 1n);
      assert.strictEqual(ids[1], 2n);
    });

    it("getProviderResources should return resource IDs", async function () {
      const { marketplace, provider, user3 } = await deployFixture();

      await registerBNBResource(marketplace, provider, { name: "R1" });
      await registerBNBResource(marketplace, user3, { name: "R2" });
      await registerBNBResource(marketplace, provider, { name: "R3" });

      const providerIds = await marketplace.getProviderResources(
        provider.address
      );
      assert.strictEqual(providerIds.length, 2);
      assert.strictEqual(providerIds[0], 1n);
      assert.strictEqual(providerIds[1], 3n);

      const user3Ids = await marketplace.getProviderResources(user3.address);
      assert.strictEqual(user3Ids.length, 1);
      assert.strictEqual(user3Ids[0], 2n);
    });
  });

  // -------------------------------------------------------------------
  // 10. Edge cases
  // -------------------------------------------------------------------

  describe("edge cases", function () {
    it("should handle zero units or zero hours gracefully", async function () {
      const { marketplace, provider, agentOwner, agentId } =
        await deployFixture();

      await registerBNBResource(marketplace, provider, { pricePerHour: 100n });

      await assert.rejects(
        async () => {
          await marketplace
            .connect(agentOwner)
            .rentComputeBNB(agentId, 1n, 0n, 1n, { value: 0n });
        },
        { message: /zero units or hours/ }
      );

      await assert.rejects(
        async () => {
          await marketplace
            .connect(agentOwner)
            .rentComputeBNB(agentId, 1n, 1n, 0n, { value: 0n });
        },
        { message: /zero units or hours/ }
      );
    });

    it("should handle multiple sequential rentals on same resource", async function () {
      const { marketplace, provider, agentOwner, agentId, networkHelpers } =
        await deployFixture();

      await registerBNBResource(marketplace, provider, {
        pricePerHour: 100n,
        totalCapacity: 2n,
      });

      // Rent 1 unit
      await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, 1n, 1n, { value: 100n });

      let res = await marketplace.resources(1n);
      assert.strictEqual(res.usedCapacity, 1n);

      // Rent another unit
      await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, 1n, 1n, { value: 100n });

      res = await marketplace.resources(1n);
      assert.strictEqual(res.usedCapacity, 2n);

      // No more capacity
      await assert.rejects(
        async () => {
          await marketplace
            .connect(agentOwner)
            .rentComputeBNB(agentId, 1n, 1n, 1n, { value: 100n });
        },
        { message: /insufficient capacity/ }
      );

      // End first rental, capacity restored by 1
      await marketplace.connect(agentOwner).endRental(1n);
      res = await marketplace.resources(1n);
      assert.strictEqual(res.usedCapacity, 1n);

      // Now can rent again
      await marketplace
        .connect(agentOwner)
        .rentComputeBNB(agentId, 1n, 1n, 1n, { value: 100n });

      res = await marketplace.resources(1n);
      assert.strictEqual(res.usedCapacity, 2n);
    });

    it("should handle endRental with ERC-20 refund correctly", async function () {
      const {
        marketplace,
        provider,
        agentOwner,
        agentId,
        mockToken,
        mockTokenAddr,
        networkHelpers,
      } = await deployFixture();

      const pricePerHour = 10n ** 18n;
      await registerERC20Resource(marketplace, provider, mockTokenAddr, {
        pricePerHour,
      });

      const hours = 4n;
      const totalCost = pricePerHour * 1n * hours;

      await mockToken.mint(agentOwner.address, totalCost);
      await mockToken
        .connect(agentOwner)
        .approve(await marketplace.getAddress(), totalCost);
      await marketplace
        .connect(agentOwner)
        .rentComputeERC20(agentId, 1n, 1n, hours);

      // Advance 1 hour => used 1/4, refund 3/4
      await networkHelpers.time.increase(1 * 3600);

      const balBefore = await mockToken.balanceOf(agentOwner.address);
      await marketplace.connect(agentOwner).endRental(1n);
      const balAfter = await mockToken.balanceOf(agentOwner.address);

      const expectedRefund = (totalCost * 3n) / 4n;
      assert.strictEqual(balAfter - balBefore, expectedRefund);
    });
  });
});
