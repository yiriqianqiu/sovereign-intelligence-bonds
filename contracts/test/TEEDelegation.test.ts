import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("TEEDelegation", function () {
  async function deployAll() {
    const connection = await hre.network.connect();
    const { ethers } = connection;
    const [owner, agentOwner, teeWallet, investor1, outsider] = await ethers.getSigners();

    // Deploy core contracts
    const registry = await (await ethers.getContractFactory("NFARegistry")).deploy();
    const bondManager = await (await ethers.getContractFactory("SIBBondManager")).deploy();
    const vault = await (await ethers.getContractFactory("DividendVaultV2")).deploy();
    const mockVerifier = await (await ethers.getContractFactory("MockVerifier")).deploy();
    const tokenRegistry = await (await ethers.getContractFactory("TokenRegistry")).deploy(owner.address);

    // Deploy SIBControllerV2
    const controller = await (await ethers.getContractFactory("SIBControllerV2")).deploy(
      await registry.getAddress(),
      await bondManager.getAddress(),
      await vault.getAddress(),
      await mockVerifier.getAddress(),
      await tokenRegistry.getAddress()
    );

    // Deploy TEERegistry
    const teeRegistry = await (await ethers.getContractFactory("TEERegistry")).deploy(
      await registry.getAddress()
    );

    // Wire up controllers
    const controllerAddr = await controller.getAddress();
    await registry.setController(controllerAddr);
    await bondManager.setController(controllerAddr);
    await vault.setController(controllerAddr);
    await vault.setBondManager(await bondManager.getAddress());

    // Set TEERegistry on controller
    await controller.setTEERegistry(await teeRegistry.getAddress());

    // Deploy X402PaymentReceiverV2
    const x402 = await (await ethers.getContractFactory("X402PaymentReceiverV2")).deploy();
    await x402.setController(controllerAddr);

    return {
      registry, bondManager, vault, mockVerifier, tokenRegistry,
      controller, teeRegistry, x402, ethers, connection,
      owner, agentOwner, teeWallet, investor1, outsider
    };
  }

  async function registerAndActivate(registry: any, agentOwner: any) {
    await registry.connect(agentOwner).registerAgent("SharpeBot", "High-freq trading agent", "QmModel123", "https://api.sharpebot.ai");
    const agentId = 1n;
    await registry.connect(agentOwner).updateState(agentId, 1);
    return agentId;
  }

  async function setupTEE(teeRegistry: any, agentOwner: any, teeWallet: any, agentId: bigint) {
    await teeRegistry.connect(agentOwner).authorizeTEEAgent(agentId, teeWallet.address);
    await teeRegistry.connect(teeWallet).pushTEEAttestation(
      agentId,
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    );
  }

  // =================== TEE submitSharpeProof ===================

  describe("TEE submitSharpeProof", function () {
    it("should allow TEE wallet to submit Sharpe proof", async function () {
      const { controller, registry, teeRegistry, agentOwner, teeWallet, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      await setupTEE(teeRegistry, agentOwner, teeWallet, agentId);

      const proof = "0x1234";
      const instances = [1000n];
      await controller.connect(teeWallet).submitSharpeProof(agentId, proof, instances);

      const profile = await registry.getRevenueProfile(agentId);
      assert.equal(profile.sharpeRatio, 1000n);
    });

    it("should reject unauthorized address for submitSharpeProof", async function () {
      const { controller, registry, teeRegistry, agentOwner, teeWallet, outsider, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      await setupTEE(teeRegistry, agentOwner, teeWallet, agentId);

      await assert.rejects(
        async () => controller.connect(outsider).submitSharpeProof(agentId, "0x1234", [1000n]),
        /not authorized/
      );
    });
  });

  // =================== TEE distributeDividends ===================

  describe("TEE distributeDividends", function () {
    it("should allow TEE wallet to distribute dividends", async function () {
      const { controller, registry, teeRegistry, vault, agentOwner, teeWallet, investor1, outsider, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      await setupTEE(teeRegistry, agentOwner, teeWallet, agentId);

      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      // Purchase bonds
      await controller.connect(investor1).purchaseBondsBNB(classId, 10, { value: price * 10n });

      // Send revenue
      await controller.connect(outsider).receiveX402PaymentBNB(agentId, { value: ethers.parseEther("1.0") });
      assert.ok((await controller.revenuePool(agentId, ethers.ZeroAddress)) > 0n);

      // TEE distributes
      await controller.connect(teeWallet).distributeDividends(classId, 0);
      assert.equal(await controller.revenuePool(agentId, ethers.ZeroAddress), 0n);
    });
  });

  // =================== TEE initiateIPO ===================

  describe("TEE initiateIPO", function () {
    it("should allow TEE wallet to initiate IPO", async function () {
      const { controller, registry, teeRegistry, agentOwner, teeWallet, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      await setupTEE(teeRegistry, agentOwner, teeWallet, agentId);

      const price = ethers.parseEther("0.01");
      await controller.connect(teeWallet).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);

      const classes = await controller.getAgentBondClasses(agentId);
      assert.equal(classes.length, 1);
    });
  });

  // =================== TEE initiateTranchedIPO ===================

  describe("TEE initiateTranchedIPO", function () {
    it("should pass TEE authorization check for tranched IPO", async function () {
      const { controller, registry, teeRegistry, agentOwner, teeWallet, outsider, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      await setupTEE(teeRegistry, agentOwner, teeWallet, agentId);

      // Without tranchingEngine set, should fail with "tranching not set" (past auth check)
      await assert.rejects(
        async () => controller.connect(teeWallet).initiateTranchedIPO(
          agentId, 300, 800, 86400 * 30, 500, 1000, ethers.ZeroAddress,
          ethers.parseEther("0.01"), ethers.parseEther("0.005")
        ),
        /tranching not set/
      );

      // Unauthorized address fails with "not authorized" (auth check)
      await assert.rejects(
        async () => controller.connect(outsider).initiateTranchedIPO(
          agentId, 300, 800, 86400 * 30, 500, 1000, ethers.ZeroAddress,
          ethers.parseEther("0.01"), ethers.parseEther("0.005")
        ),
        /not authorized/
      );
    });
  });

  // =================== TEE markBondsRedeemable ===================

  describe("TEE markBondsRedeemable", function () {
    it("should allow TEE wallet to mark bonds redeemable", async function () {
      const { controller, registry, teeRegistry, bondManager, agentOwner, teeWallet, investor1, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      await setupTEE(teeRegistry, agentOwner, teeWallet, agentId);

      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400, price, 1000, ethers.ZeroAddress);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      await controller.connect(investor1).purchaseBondsBNB(classId, 10, { value: price * 10n });

      // TEE marks redeemable
      await controller.connect(teeWallet).markBondsRedeemable(classId, 0);
      const nonce = await bondManager.bondNonces(classId, 0);
      assert.equal(nonce[4], true); // redeemable
    });
  });

  // =================== Owner still works ===================

  describe("Owner can still call all functions", function () {
    it("should allow agent owner to call functions with TEE set", async function () {
      const { controller, registry, teeRegistry, agentOwner, teeWallet, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      await setupTEE(teeRegistry, agentOwner, teeWallet, agentId);

      // Agent owner can still initiate IPO
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);
      const classes = await controller.getAgentBondClasses(agentId);
      assert.equal(classes.length, 1);

      // Agent owner can still submit proof
      await controller.connect(agentOwner).submitSharpeProof(agentId, "0xabcd", [2000n]);
      const profile = await registry.getRevenueProfile(agentId);
      assert.equal(profile.sharpeRatio, 2000n);
    });
  });

  // =================== Without TEERegistry ===================

  describe("Without TEERegistry set", function () {
    it("should only allow agent owner when teeRegistry is not set", async function () {
      const { controller, registry, agentOwner, teeWallet, outsider, ethers } = await deployAll();

      // Deploy a fresh controller without TEERegistry
      const bondManager2 = await (await ethers.getContractFactory("SIBBondManager")).deploy();
      const vault2 = await (await ethers.getContractFactory("DividendVaultV2")).deploy();
      const mockVerifier2 = await (await ethers.getContractFactory("MockVerifier")).deploy();
      const tokenRegistry2 = await (await ethers.getContractFactory("TokenRegistry")).deploy((await ethers.getSigners())[0].address);
      const registry2 = await (await ethers.getContractFactory("NFARegistry")).deploy();

      const controller2 = await (await ethers.getContractFactory("SIBControllerV2")).deploy(
        await registry2.getAddress(),
        await bondManager2.getAddress(),
        await vault2.getAddress(),
        await mockVerifier2.getAddress(),
        await tokenRegistry2.getAddress()
      );

      // Wire up
      const c2Addr = await controller2.getAddress();
      await registry2.setController(c2Addr);
      await bondManager2.setController(c2Addr);
      await vault2.setController(c2Addr);
      await vault2.setBondManager(await bondManager2.getAddress());

      // Do NOT set TEERegistry

      // Register agent
      await registry2.connect(agentOwner).registerAgent("Bot", "desc", "hash", "url");
      await registry2.connect(agentOwner).updateState(1, 1);

      // Agent owner can still call
      await controller2.connect(agentOwner).submitSharpeProof(1, "0x1234", [1000n]);

      // Non-owner cannot call (even if they would be a TEE wallet)
      await assert.rejects(
        async () => controller2.connect(teeWallet).submitSharpeProof(1, "0x5678", [2000n]),
        /not authorized/
      );
    });
  });

  // =================== setTEERegistry admin ===================

  describe("setTEERegistry", function () {
    it("should only allow owner to set TEERegistry", async function () {
      const { controller, outsider, ethers } = await deployAll();
      const fakeAddr = "0x0000000000000000000000000000000000000001";
      await assert.rejects(
        async () => controller.connect(outsider).setTEERegistry(fakeAddr),
        /OwnableUnauthorizedAccount/
      );
    });

    it("should allow owner to set TEERegistry to zero address (disable)", async function () {
      const { controller, ethers } = await deployAll();
      await controller.setTEERegistry(ethers.ZeroAddress);
      assert.equal(await controller.teeRegistry(), ethers.ZeroAddress);
    });
  });

  // =================== X402V2 Relay Restriction ===================

  describe("X402V2 relay restriction", function () {
    it("should allow anyone when relayRestricted=false", async function () {
      const { x402, registry, controller, agentOwner, outsider, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);

      // relayRestricted defaults to false
      assert.equal(await x402.relayRestricted(), false);

      // Setup IPO so receiveX402PaymentBNB works
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, ethers.parseEther("0.01"), 1000, ethers.ZeroAddress);

      // Anyone can call payBNB
      await x402.connect(outsider).payBNB(agentId, "/api/test", { value: ethers.parseEther("0.1") });
      assert.equal(await x402.getPaymentCount(), 1n);
    });

    it("should block unauthorized relay when relayRestricted=true", async function () {
      const { x402, registry, controller, agentOwner, outsider, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, ethers.parseEther("0.01"), 1000, ethers.ZeroAddress);

      await x402.setRelayRestricted(true);

      await assert.rejects(
        async () => x402.connect(outsider).payBNB(agentId, "/api/test", { value: ethers.parseEther("0.1") }),
        /unauthorized relay/
      );
    });

    it("should allow authorized relay when relayRestricted=true", async function () {
      const { x402, registry, controller, agentOwner, teeWallet, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, ethers.parseEther("0.01"), 1000, ethers.ZeroAddress);

      await x402.setRelayRestricted(true);
      await x402.setAuthorizedRelay(teeWallet.address, true);

      await x402.connect(teeWallet).payBNB(agentId, "/api/test", { value: ethers.parseEther("0.1") });
      assert.equal(await x402.getPaymentCount(), 1n);
    });

    it("should only allow owner to call setAuthorizedRelay", async function () {
      const { x402, outsider, teeWallet } = await deployAll();
      await assert.rejects(
        async () => x402.connect(outsider).setAuthorizedRelay(teeWallet.address, true),
        /OwnableUnauthorizedAccount/
      );
    });

    it("should only allow owner to call setRelayRestricted", async function () {
      const { x402, outsider } = await deployAll();
      await assert.rejects(
        async () => x402.connect(outsider).setRelayRestricted(true),
        /OwnableUnauthorizedAccount/
      );
    });

    it("should reject zero address for setAuthorizedRelay", async function () {
      const { x402, ethers } = await deployAll();
      await assert.rejects(
        async () => x402.setAuthorizedRelay(ethers.ZeroAddress, true),
        /zero address/
      );
    });
  });
});
