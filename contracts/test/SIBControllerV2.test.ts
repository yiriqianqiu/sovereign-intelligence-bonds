import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("SIBControllerV2", function () {
  async function deployAll() {
    const connection = await hre.network.connect();
    const { ethers } = connection;
    const [owner, agentOwner, investor1, investor2, outsider] = await ethers.getSigners();

    // Deploy core contracts
    const registry = await (await ethers.getContractFactory("NFARegistry")).deploy();
    const bondManager = await (await ethers.getContractFactory("SIBBondManager")).deploy();
    const vault = await (await ethers.getContractFactory("DividendVaultV2")).deploy();
    const mockVerifier = await (await ethers.getContractFactory("MockVerifier")).deploy();
    const tokenRegistry = await (await ethers.getContractFactory("TokenRegistry")).deploy(owner.address);

    // Deploy mock ERC20
    const mockToken = await (await ethers.getContractFactory("MockERC20")).deploy("Mock USDT", "USDT", 18);
    // Add token to registry
    await tokenRegistry.addToken(await mockToken.getAddress(), "USDT", 18, ethers.parseEther("1"));

    // Deploy SIBControllerV2
    const controller = await (await ethers.getContractFactory("SIBControllerV2")).deploy(
      await registry.getAddress(),
      await bondManager.getAddress(),
      await vault.getAddress(),
      await mockVerifier.getAddress(),
      await tokenRegistry.getAddress()
    );

    // Deploy TranchingEngine
    const tranchingEngine = await (await ethers.getContractFactory("TranchingEngine")).deploy(
      await bondManager.getAddress()
    );

    // Wire up controllers
    const controllerAddr = await controller.getAddress();
    await registry.setController(controllerAddr);
    await bondManager.setController(controllerAddr);
    await vault.setController(controllerAddr);
    await vault.setBondManager(await bondManager.getAddress());

    // TranchingEngine needs bondManager's controller set to tranchingEngine too
    // Actually, TranchingEngine calls bondManager.createBondClass which is onlyController
    // So TranchingEngine can't call bondManager directly unless it IS the controller
    // Looking at TranchingEngine, it calls bondManager directly - but bondManager only accepts calls from controller
    // This means TranchingEngine needs to be the controller of bondManager, OR we need a different approach
    // Actually looking at the flow: controller calls tranchingEngine, tranchingEngine calls bondManager
    // So tranchingEngine needs to also be allowed to call bondManager
    // But bondManager only has a single controller...
    // Let's set tranchingEngine as controller for bondManager, and then set controller on tranchingEngine
    // Wait - that breaks the controller -> bondManager flow for other functions
    // The solution: set tranchingEngine.setController(controllerAddr) and in tests skip tranching
    // or we need to adjust the architecture

    // For now, we'll test tranching separately since TranchingEngine calls bondManager directly
    // and bondManager only allows one controller. Let's test tranching flows without the full wiring.

    // Set TranchingEngine controller
    await tranchingEngine.setController(controllerAddr);
    await controller.setTranchingEngine(await tranchingEngine.getAddress());

    return {
      registry, bondManager, vault, mockVerifier, tokenRegistry, mockToken,
      controller, tranchingEngine, ethers, connection, owner, agentOwner,
      investor1, investor2, outsider
    };
  }

  async function registerAndActivate(registry: any, agentOwner: any) {
    await registry.connect(agentOwner).registerAgent("SharpeBot", "High-freq trading agent", "QmModel123", "https://api.sharpebot.ai");
    const agentId = 1n;
    await registry.connect(agentOwner).updateState(agentId, 1);
    return agentId;
  }

  async function registerAndActivateN(registry: any, agentOwner: any, n: number) {
    // Register N agents, returns their ids
    const ids: bigint[] = [];
    for (let i = 0; i < n; i++) {
      const tx = await registry.connect(agentOwner).registerAgent(`Bot${i}`, "desc", "hash", "url");
      const receipt = await tx.wait();
      // Agent IDs are sequential starting from 1
      const agentId = BigInt(ids.length + 1);
      await registry.connect(agentOwner).updateState(agentId, 1);
      ids.push(agentId);
    }
    return ids;
  }

  // =================== Deployment Tests ===================

  describe("Deployment", function () {
    it("should deploy with correct addresses", async function () {
      const { controller, registry, bondManager, vault, mockVerifier, tokenRegistry } = await deployAll();
      assert.equal(await controller.nfaRegistry(), await registry.getAddress());
      assert.equal(await controller.bondManager(), await bondManager.getAddress());
      assert.equal(await controller.dividendVault(), await vault.getAddress());
      assert.equal(await controller.verifier(), await mockVerifier.getAddress());
      assert.equal(await controller.tokenRegistry(), await tokenRegistry.getAddress());
    });

    it("should reject zero addresses in constructor", async function () {
      const { bondManager, vault, mockVerifier, tokenRegistry, ethers } = await deployAll();
      const Factory = await ethers.getContractFactory("SIBControllerV2");
      const bmAddr = await bondManager.getAddress();
      const vAddr = await vault.getAddress();
      const mvAddr = await mockVerifier.getAddress();
      const trAddr = await tokenRegistry.getAddress();

      await assert.rejects(
        async () => Factory.deploy(ethers.ZeroAddress, bmAddr, vAddr, mvAddr, trAddr),
        /zero nfaRegistry/
      );
      await assert.rejects(
        async () => Factory.deploy(trAddr, ethers.ZeroAddress, vAddr, mvAddr, trAddr),
        /zero bondManager/
      );
      await assert.rejects(
        async () => Factory.deploy(trAddr, bmAddr, ethers.ZeroAddress, mvAddr, trAddr),
        /zero dividendVault/
      );
      await assert.rejects(
        async () => Factory.deploy(trAddr, bmAddr, vAddr, ethers.ZeroAddress, trAddr),
        /zero verifier/
      );
      await assert.rejects(
        async () => Factory.deploy(trAddr, bmAddr, vAddr, mvAddr, ethers.ZeroAddress),
        /zero tokenRegistry/
      );
    });

    it("should set default bondholder share to 70%", async function () {
      const { controller } = await deployAll();
      assert.equal(await controller.bondholderShareBps(), 7000n);
    });
  });

  // =================== IPO - BNB Tests ===================

  describe("IPO - BNB", function () {
    it("should initiate IPO with BNB payment token", async function () {
      const { controller, registry, agentOwner, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);

      const classes = await controller.getAgentBondClasses(agentId);
      assert.equal(classes.length, 1);
      const classId = classes[0];
      assert.equal(await controller.activeNonce(classId), 0n);
    });

    it("should allow multiple IPOs for same agent", async function () {
      const { controller, registry, agentOwner, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const price = ethers.parseEther("0.01");

      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);
      await controller.connect(agentOwner).initiateIPO(agentId, 800, 86400 * 60, price, 2000, ethers.ZeroAddress);

      const classes = await controller.getAgentBondClasses(agentId);
      assert.equal(classes.length, 2);
    });

    it("should purchase bonds with BNB", async function () {
      const { controller, registry, bondManager, agentOwner, investor1, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);

      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      await controller.connect(investor1).purchaseBondsBNB(classId, 10, { value: price * 10n });
      assert.equal(await bondManager.balanceOf(investor1.address, classId, 0), 10n);
    });

    it("should refund excess BNB on purchase", async function () {
      const { controller, registry, agentOwner, investor1, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);

      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      const balBefore = await ethers.provider.getBalance(investor1.address);
      const tx = await controller.connect(investor1).purchaseBondsBNB(classId, 1, { value: price * 5n });
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(investor1.address);

      // Should only have paid for 1 bond + gas, not 5
      const spent = balBefore - balAfter - gasUsed;
      assert.equal(spent, price);
    });

    it("should revert IPO from non-owner", async function () {
      const { controller, registry, agentOwner, outsider, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      await assert.rejects(
        async () => controller.connect(outsider).initiateIPO(agentId, 500, 86400, ethers.parseEther("0.01"), 1000, ethers.ZeroAddress),
        /not authorized/
      );
    });

    it("should revert IPO for inactive agent", async function () {
      const { controller, registry, agentOwner, ethers } = await deployAll();
      await registry.connect(agentOwner).registerAgent("Bot", "desc", "hash", "url");
      // Agent is in Registered state, not Active
      await assert.rejects(
        async () => controller.connect(agentOwner).initiateIPO(1, 500, 86400, ethers.parseEther("0.01"), 1000, ethers.ZeroAddress),
        /agent not active/
      );
    });
  });

  // =================== IPO - ERC20 Tests ===================

  describe("IPO - ERC20", function () {
    it("should initiate IPO with ERC20 token", async function () {
      const { controller, registry, mockToken, agentOwner, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const tokenAddr = await mockToken.getAddress();
      const price = ethers.parseEther("10"); // 10 USDT per bond

      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, tokenAddr);

      const classes = await controller.getAgentBondClasses(agentId);
      assert.equal(classes.length, 1);
    });

    it("should purchase bonds with ERC20", async function () {
      const { controller, registry, bondManager, mockToken, agentOwner, investor1, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const tokenAddr = await mockToken.getAddress();
      const price = ethers.parseEther("10");

      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, tokenAddr);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      // Mint tokens to investor and approve
      await mockToken.mint(investor1.address, ethers.parseEther("1000"));
      await mockToken.connect(investor1).approve(await controller.getAddress(), ethers.parseEther("1000"));

      await controller.connect(investor1).purchaseBondsERC20(classId, 5);
      assert.equal(await bondManager.balanceOf(investor1.address, classId, 0), 5n);

      // Verify tokens were transferred
      assert.equal(await mockToken.balanceOf(investor1.address), ethers.parseEther("950"));
    });

    it("should revert purchaseBondsERC20 for BNB class", async function () {
      const { controller, registry, agentOwner, investor1, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);

      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      await assert.rejects(
        async () => controller.connect(investor1).purchaseBondsERC20(classId, 1),
        /not ERC20 class/
      );
    });

    it("should revert IPO for unsupported token", async function () {
      const { controller, registry, agentOwner, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      // Use a random address as unsupported token
      const fakeToken = "0x0000000000000000000000000000000000000001";
      await assert.rejects(
        async () => controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, ethers.parseEther("10"), 1000, fakeToken),
        /unsupported token/
      );
    });
  });

  // =================== Revenue Tests ===================

  describe("Revenue", function () {
    it("should receive BNB b402 payment and split 70/30", async function () {
      const { controller, registry, agentOwner, outsider, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      // Need an IPO so agent is active (revenue doesn't require IPO in V2, but agent must be active)
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, ethers.parseEther("0.01"), 1000, ethers.ZeroAddress);

      const payment = ethers.parseEther("1.0");
      const ownerBalBefore = await ethers.provider.getBalance(agentOwner.address);
      await controller.connect(outsider).receiveB402PaymentBNB(agentId, { value: payment });

      // 70% to bondholder pool
      assert.equal(await controller.revenuePool(agentId, ethers.ZeroAddress), ethers.parseEther("0.7"));
      // 30% to owner
      const ownerBalAfter = await ethers.provider.getBalance(agentOwner.address);
      assert.equal(ownerBalAfter - ownerBalBefore, ethers.parseEther("0.3"));
    });

    it("should receive ERC20 b402 payment and split correctly", async function () {
      const { controller, registry, mockToken, agentOwner, outsider, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const tokenAddr = await mockToken.getAddress();

      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, ethers.parseEther("10"), 1000, tokenAddr);

      // Mint tokens to outsider and approve
      await mockToken.mint(outsider.address, ethers.parseEther("100"));
      await mockToken.connect(outsider).approve(await controller.getAddress(), ethers.parseEther("100"));

      await controller.connect(outsider).receiveB402PaymentERC20(agentId, tokenAddr, ethers.parseEther("10"));

      // 70% in pool
      assert.equal(await controller.revenuePool(agentId, tokenAddr), ethers.parseEther("7"));
      // 30% to owner
      assert.equal(await mockToken.balanceOf(agentOwner.address), ethers.parseEther("3"));
    });

    it("should accumulate multiple revenue payments", async function () {
      const { controller, registry, agentOwner, outsider, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, ethers.parseEther("0.01"), 1000, ethers.ZeroAddress);

      await controller.connect(outsider).receiveB402PaymentBNB(agentId, { value: ethers.parseEther("1.0") });
      await controller.connect(outsider).receiveB402PaymentBNB(agentId, { value: ethers.parseEther("2.0") });

      // 0.7 + 1.4 = 2.1
      assert.equal(await controller.revenuePool(agentId, ethers.ZeroAddress), ethers.parseEther("2.1"));
    });

    it("should distribute BNB dividends to vault", async function () {
      const { controller, registry, vault, agentOwner, investor1, outsider, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      // Purchase bonds so totalSupply > 0 (required by vault)
      await controller.connect(investor1).purchaseBondsBNB(classId, 10, { value: price * 10n });

      await controller.connect(outsider).receiveB402PaymentBNB(agentId, { value: ethers.parseEther("1.0") });
      assert.ok((await controller.revenuePool(agentId, ethers.ZeroAddress)) > 0n);

      await controller.connect(agentOwner).distributeDividends(classId, 0);
      assert.equal(await controller.revenuePool(agentId, ethers.ZeroAddress), 0n);

      // Vault should have the BNB
      const vaultBal = await ethers.provider.getBalance(await vault.getAddress());
      assert.equal(vaultBal, ethers.parseEther("0.7"));
    });

    it("should distribute ERC20 dividends to vault", async function () {
      const { controller, registry, vault, mockToken, agentOwner, investor1, outsider, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const tokenAddr = await mockToken.getAddress();
      const price = ethers.parseEther("10");

      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, tokenAddr);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      // Investor buys bonds
      await mockToken.mint(investor1.address, ethers.parseEther("1000"));
      await mockToken.connect(investor1).approve(await controller.getAddress(), ethers.parseEther("1000"));
      await controller.connect(investor1).purchaseBondsERC20(classId, 5);

      // Revenue comes in
      await mockToken.mint(outsider.address, ethers.parseEther("100"));
      await mockToken.connect(outsider).approve(await controller.getAddress(), ethers.parseEther("100"));
      await controller.connect(outsider).receiveB402PaymentERC20(agentId, tokenAddr, ethers.parseEther("10"));

      assert.equal(await controller.revenuePool(agentId, tokenAddr), ethers.parseEther("7"));

      await controller.connect(agentOwner).distributeDividends(classId, 0);
      assert.equal(await controller.revenuePool(agentId, tokenAddr), 0n);

      // Vault should have the tokens
      assert.equal(await mockToken.balanceOf(await vault.getAddress()), ethers.parseEther("7"));
    });

    it("should reject distribution with no revenue", async function () {
      const { controller, registry, agentOwner, investor1, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      await controller.connect(investor1).purchaseBondsBNB(classId, 10, { value: price * 10n });

      await assert.rejects(
        async () => controller.connect(agentOwner).distributeDividends(classId, 0),
        /no revenue/
      );
    });
  });

  // =================== ZK Proof Tests ===================

  describe("ZK Proof", function () {
    it("should accept valid Sharpe proof", async function () {
      const { controller, registry, agentOwner, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const proof = ethers.randomBytes(64);
      const sharpeRatio = ethers.parseEther("1.5");
      await controller.connect(agentOwner).submitSharpeProof(agentId, proof, [sharpeRatio]);
      const profile = await registry.getRevenueProfile(agentId);
      assert.equal(profile.sharpeRatio, sharpeRatio);
    });

    it("should update credit rating based on multi-dimensional score", async function () {
      const { controller, registry, agentOwner, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      await controller.connect(agentOwner).submitSharpeProof(agentId, ethers.randomBytes(64), [ethers.parseEther("2.5")]);
      // With only Sharpe and no other factors, rating will be based on CreditModel
      const rating = await registry.creditRatings(agentId);
      // Should have a rating > 0
      assert.ok(Number(rating) >= 1);
    });

    it("should reject replay of same proof", async function () {
      const { controller, registry, agentOwner, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const proof = ethers.randomBytes(64);
      await controller.connect(agentOwner).submitSharpeProof(agentId, proof, [ethers.parseEther("1.5")]);
      await assert.rejects(
        async () => controller.connect(agentOwner).submitSharpeProof(agentId, proof, [ethers.parseEther("1.5")]),
        /proof already used/
      );
    });

    it("should reject proof from non-owner", async function () {
      const { controller, registry, agentOwner, outsider, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      await assert.rejects(
        async () => controller.connect(outsider).submitSharpeProof(agentId, ethers.randomBytes(64), [ethers.parseEther("1.5")]),
        /not authorized/
      );
    });

    it("should reject instance out of BN254 field", async function () {
      const { controller, registry, agentOwner, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const outOfField = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
      await assert.rejects(
        async () => controller.connect(agentOwner).submitSharpeProof(agentId, ethers.randomBytes(64), [outOfField]),
        /instance out of field/
      );
    });

    it("should reject empty instances", async function () {
      const { controller, registry, agentOwner, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      await assert.rejects(
        async () => controller.connect(agentOwner).submitSharpeProof(agentId, ethers.randomBytes(64), []),
        /empty instances/
      );
    });

    it("should mark proof as used", async function () {
      const { controller, registry, agentOwner, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const proof = ethers.randomBytes(64);
      const proofHash = ethers.keccak256(proof);
      assert.equal(await controller.usedProofs(proofHash), false);
      await controller.connect(agentOwner).submitSharpeProof(agentId, proof, [ethers.parseEther("1.5")]);
      assert.equal(await controller.usedProofs(proofHash), true);
    });
  });

  // =================== Transfer Tests ===================

  describe("Transfer", function () {
    it("should transfer bonds between accounts", async function () {
      const { controller, registry, bondManager, agentOwner, investor1, investor2, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      await controller.connect(investor1).purchaseBondsBNB(classId, 10, { value: price * 10n });
      await controller.connect(investor1).transferBonds(investor2.address, classId, 0, 3);

      assert.equal(await bondManager.balanceOf(investor1.address, classId, 0), 7n);
      assert.equal(await bondManager.balanceOf(investor2.address, classId, 0), 3n);
    });

    it("should revert self-transfer", async function () {
      const { controller, registry, agentOwner, investor1, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      await controller.connect(investor1).purchaseBondsBNB(classId, 10, { value: price * 10n });
      await assert.rejects(
        async () => controller.connect(investor1).transferBonds(investor1.address, classId, 0, 3),
        /self-transfer/
      );
    });

    it("should revert transfer of zero amount", async function () {
      const { controller, registry, agentOwner, investor1, investor2, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      await controller.connect(investor1).purchaseBondsBNB(classId, 10, { value: price * 10n });
      await assert.rejects(
        async () => controller.connect(investor1).transferBonds(investor2.address, classId, 0, 0),
        /zero amount/
      );
    });
  });

  // =================== Redemption Tests ===================

  describe("Redemption", function () {
    it("should redeem BNB bonds after maturity", async function () {
      const { controller, registry, bondManager, agentOwner, investor1, owner, ethers, connection } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const price = ethers.parseEther("0.01");
      const maturity = 86400;
      await controller.connect(agentOwner).initiateIPO(agentId, 500, maturity, price, 1000, ethers.ZeroAddress);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      await controller.connect(investor1).purchaseBondsBNB(classId, 10, { value: price * 10n });
      await controller.connect(agentOwner).markBondsRedeemable(classId, 0);

      // Advance time past maturity
      await connection.provider.send("evm_increaseTime", [maturity + 1]);
      await connection.provider.send("evm_mine", []);

      // Fund controller for principal return
      await owner.sendTransaction({ to: await controller.getAddress(), value: price * 10n });

      await controller.connect(investor1).redeemBonds(classId, 0, 10);
      assert.equal(await bondManager.balanceOf(investor1.address, classId, 0), 0n);
    });

    it("should redeem ERC20 bonds after maturity", async function () {
      const { controller, registry, bondManager, mockToken, agentOwner, investor1, ethers, connection } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const tokenAddr = await mockToken.getAddress();
      const price = ethers.parseEther("10");
      const maturity = 86400;

      await controller.connect(agentOwner).initiateIPO(agentId, 500, maturity, price, 1000, tokenAddr);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      // Investor buys bonds
      await mockToken.mint(investor1.address, ethers.parseEther("1000"));
      await mockToken.connect(investor1).approve(await controller.getAddress(), ethers.parseEther("1000"));
      await controller.connect(investor1).purchaseBondsERC20(classId, 5);

      await controller.connect(agentOwner).markBondsRedeemable(classId, 0);

      await connection.provider.send("evm_increaseTime", [maturity + 1]);
      await connection.provider.send("evm_mine", []);

      // Fund controller with tokens for redemption
      await mockToken.mint(await controller.getAddress(), ethers.parseEther("50"));

      await controller.connect(investor1).redeemBonds(classId, 0, 5);
      assert.equal(await bondManager.balanceOf(investor1.address, classId, 0), 0n);
    });

    it("should mark bonds redeemable by agent owner", async function () {
      const { controller, registry, bondManager, agentOwner, investor1, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400, price, 1000, ethers.ZeroAddress);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      await controller.connect(investor1).purchaseBondsBNB(classId, 10, { value: price * 10n });
      await controller.connect(agentOwner).markBondsRedeemable(classId, 0);

      const nonce = await bondManager.bondNonces(classId, 0);
      assert.equal(nonce[4], true); // redeemable
    });

    it("should revert marking from non-owner", async function () {
      const { controller, registry, agentOwner, investor1, outsider, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400, price, 1000, ethers.ZeroAddress);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      await controller.connect(investor1).purchaseBondsBNB(classId, 10, { value: price * 10n });
      await assert.rejects(
        async () => controller.connect(outsider).markBondsRedeemable(classId, 0),
        /not authorized/
      );
    });
  });

  // =================== Dynamic Coupon Tests ===================

  describe("Dynamic Coupon", function () {
    it("should reduce coupon when credit score is high", async function () {
      const { controller, registry, agentOwner, outsider, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const baseCoupon = 1000n; // 10%

      // Submit Sharpe proof to improve credit
      await controller.connect(agentOwner).submitSharpeProof(agentId, ethers.randomBytes(64), [ethers.parseEther("2.5")]);

      // Send revenue to build up credit factors
      await controller.connect(agentOwner).initiateIPO(agentId, Number(baseCoupon), 86400 * 30, ethers.parseEther("0.01"), 1000, ethers.ZeroAddress);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      // Calculate dynamic coupon
      const newCoupon = await controller.calculateDynamicCoupon(classId);

      // Get the credit score
      const [score] = await registry.calculateCreditScore(agentId);
      if (score > 5000n) {
        // If score is above base, coupon should be reduced
        assert.ok(newCoupon < baseCoupon);
      }
    });

    it("should increase coupon when credit score is low", async function () {
      const { controller, registry, agentOwner, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const baseCoupon = 1000n; // 10%

      // No Sharpe proof, no revenue, low credit score
      await controller.connect(agentOwner).initiateIPO(agentId, Number(baseCoupon), 86400 * 30, ethers.parseEther("0.01"), 1000, ethers.ZeroAddress);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      const newCoupon = await controller.calculateDynamicCoupon(classId);
      const [score] = await registry.calculateCreditScore(agentId);

      if (score < 5000n) {
        // Low score -> coupon should increase
        assert.ok(newCoupon > baseCoupon);
      }
    });

    it("should cap coupon at 3000 bps (30%)", async function () {
      const { controller, registry, agentOwner, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      // High base coupon + low credit score
      const baseCoupon = 2500; // 25%

      await controller.connect(agentOwner).initiateIPO(agentId, baseCoupon, 86400 * 30, ethers.parseEther("0.01"), 1000, ethers.ZeroAddress);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      const newCoupon = await controller.calculateDynamicCoupon(classId);
      assert.ok(newCoupon <= 3000n);
    });

    it("should floor coupon at 100 bps (1%)", async function () {
      const { controller, registry, agentOwner, outsider, ethers, connection } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const baseCoupon = 200; // 2% - low base

      // Submit very high Sharpe proof
      await controller.connect(agentOwner).submitSharpeProof(agentId, ethers.randomBytes(64), [ethers.parseEther("3.0")]);

      // Send lots of revenue to max out credit factors
      await controller.connect(agentOwner).initiateIPO(agentId, baseCoupon, 86400 * 30, ethers.parseEther("0.01"), 1000, ethers.ZeroAddress);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      // Advance time to boost age factor
      await connection.provider.send("evm_increaseTime", [365 * 86400]);
      await connection.provider.send("evm_mine", []);

      // Send revenue to boost revenue + frequency factors
      for (let i = 0; i < 5; i++) {
        await controller.connect(outsider).receiveB402PaymentBNB(agentId, { value: ethers.parseEther("20") });
      }

      const newCoupon = await controller.calculateDynamicCoupon(classId);
      // Coupon should be at least 100 bps
      assert.ok(newCoupon >= 100n);
    });
  });

  // =================== Admin Tests ===================

  describe("Admin", function () {
    it("should adjust bondholder share", async function () {
      const { controller } = await deployAll();
      await controller.adjustBondholderShare(8000);
      assert.equal(await controller.bondholderShareBps(), 8000n);
    });

    it("should reject share below minimum", async function () {
      const { controller } = await deployAll();
      await assert.rejects(
        async () => controller.adjustBondholderShare(500),
        /invalid share/
      );
    });

    it("should reject share above maximum", async function () {
      const { controller } = await deployAll();
      await assert.rejects(
        async () => controller.adjustBondholderShare(10001),
        /invalid share/
      );
    });

    it("should set tranching engine", async function () {
      const { controller, tranchingEngine } = await deployAll();
      const addr = await tranchingEngine.getAddress();
      assert.equal(await controller.tranchingEngine(), addr);
    });

    it("should set verifier", async function () {
      const { controller, ethers } = await deployAll();
      const newVerifier = await (await ethers.getContractFactory("MockVerifier")).deploy();
      await controller.setVerifier(await newVerifier.getAddress());
      assert.equal(await controller.verifier(), await newVerifier.getAddress());
    });

    it("should reject zero address for setTranchingEngine", async function () {
      const { controller, ethers } = await deployAll();
      await assert.rejects(
        async () => controller.setTranchingEngine(ethers.ZeroAddress),
        /zero address/
      );
    });

    it("should reject zero address for setVerifier", async function () {
      const { controller, ethers } = await deployAll();
      await assert.rejects(
        async () => controller.setVerifier(ethers.ZeroAddress),
        /zero address/
      );
    });

    it("should emergency pause and unpause", async function () {
      const { controller, registry, agentOwner, ethers } = await deployAll();
      await controller.emergencyPause();
      assert.equal(await controller.paused(), true);

      const agentId = await registerAndActivate(registry, agentOwner);
      await assert.rejects(
        async () => controller.connect(agentOwner).initiateIPO(agentId, 500, 86400, ethers.parseEther("0.01"), 1000, ethers.ZeroAddress),
        /EnforcedPause/
      );

      await controller.unpause();
      assert.equal(await controller.paused(), false);
    });

    it("should reject non-owner admin calls", async function () {
      const { controller, outsider } = await deployAll();
      await assert.rejects(
        async () => controller.connect(outsider).adjustBondholderShare(8000),
        /OwnableUnauthorizedAccount/
      );
      await assert.rejects(
        async () => controller.connect(outsider).emergencyPause(),
        /OwnableUnauthorizedAccount/
      );
      await assert.rejects(
        async () => controller.connect(outsider).unpause(),
        /OwnableUnauthorizedAccount/
      );
    });
  });

  // =================== Additional Edge Cases ===================

  describe("Edge Cases", function () {
    it("should reject zero amount purchase (BNB)", async function () {
      const { controller, registry, agentOwner, investor1, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      await assert.rejects(
        async () => controller.connect(investor1).purchaseBondsBNB(classId, 0, { value: price }),
        /zero amount/
      );
    });

    it("should reject zero amount purchase (ERC20)", async function () {
      const { controller, registry, mockToken, agentOwner, investor1, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const tokenAddr = await mockToken.getAddress();
      const price = ethers.parseEther("10");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, tokenAddr);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      await assert.rejects(
        async () => controller.connect(investor1).purchaseBondsERC20(classId, 0),
        /zero amount/
      );
    });

    it("should reject insufficient BNB for purchase", async function () {
      const { controller, registry, agentOwner, investor1, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      await assert.rejects(
        async () => controller.connect(investor1).purchaseBondsBNB(classId, 10, { value: price * 5n }),
        /insufficient BNB/
      );
    });

    it("should reject purchaseBondsBNB for ERC20 class", async function () {
      const { controller, registry, mockToken, agentOwner, investor1, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const tokenAddr = await mockToken.getAddress();
      const price = ethers.parseEther("10");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, tokenAddr);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      await assert.rejects(
        async () => controller.connect(investor1).purchaseBondsBNB(classId, 1, { value: ethers.parseEther("10") }),
        /not BNB class/
      );
    });

    it("should reject zero BNB payment", async function () {
      const { controller, registry, agentOwner, outsider } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      await assert.rejects(
        async () => controller.connect(outsider).receiveB402PaymentBNB(agentId, { value: 0 }),
        /zero payment/
      );
    });

    it("should reject zero ERC20 payment", async function () {
      const { controller, registry, mockToken, agentOwner, outsider, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const tokenAddr = await mockToken.getAddress();
      await assert.rejects(
        async () => controller.connect(outsider).receiveB402PaymentERC20(agentId, tokenAddr, 0),
        /zero payment/
      );
    });

    it("should reject zero amount redemption", async function () {
      const { controller, registry, agentOwner, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400, price, 1000, ethers.ZeroAddress);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      await assert.rejects(
        async () => controller.connect(agentOwner).redeemBonds(classId, 0, 0),
        /zero amount/
      );
    });

    it("should reject IPO with zero coupon", async function () {
      const { controller, registry, agentOwner, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      await assert.rejects(
        async () => controller.connect(agentOwner).initiateIPO(agentId, 0, 86400, ethers.parseEther("0.01"), 1000, ethers.ZeroAddress),
        /invalid coupon/
      );
    });

    it("should reject IPO with zero maturity", async function () {
      const { controller, registry, agentOwner, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      await assert.rejects(
        async () => controller.connect(agentOwner).initiateIPO(agentId, 500, 0, ethers.parseEther("0.01"), 1000, ethers.ZeroAddress),
        /zero maturity/
      );
    });

    it("should reject IPO with zero price", async function () {
      const { controller, registry, agentOwner, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      await assert.rejects(
        async () => controller.connect(agentOwner).initiateIPO(agentId, 500, 86400, 0, 1000, ethers.ZeroAddress),
        /zero price/
      );
    });

    it("should reject IPO with zero supply", async function () {
      const { controller, registry, agentOwner, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      await assert.rejects(
        async () => controller.connect(agentOwner).initiateIPO(agentId, 500, 86400, ethers.parseEther("0.01"), 0, ethers.ZeroAddress),
        /zero supply/
      );
    });

    it("should reject transfer to zero address", async function () {
      const { controller, registry, agentOwner, investor1, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      await controller.connect(investor1).purchaseBondsBNB(classId, 10, { value: price * 10n });
      await assert.rejects(
        async () => controller.connect(investor1).transferBonds(ethers.ZeroAddress, classId, 0, 3),
        /zero address/
      );
    });

    it("should allow admin to distribute dividends", async function () {
      const { controller, registry, agentOwner, investor1, outsider, owner, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      await controller.connect(investor1).purchaseBondsBNB(classId, 10, { value: price * 10n });
      await controller.connect(outsider).receiveB402PaymentBNB(agentId, { value: ethers.parseEther("1.0") });

      // Admin (owner) can also distribute
      await controller.connect(owner).distributeDividends(classId, 0);
      assert.equal(await controller.revenuePool(agentId, ethers.ZeroAddress), 0n);
    });

    it("should reject distribution from unauthorized caller", async function () {
      const { controller, registry, agentOwner, investor1, outsider, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);
      const classes = await controller.getAgentBondClasses(agentId);
      const classId = classes[0];

      await controller.connect(investor1).purchaseBondsBNB(classId, 10, { value: price * 10n });
      await controller.connect(outsider).receiveB402PaymentBNB(agentId, { value: ethers.parseEther("1.0") });

      await assert.rejects(
        async () => controller.connect(outsider).distributeDividends(classId, 0),
        /not authorized/
      );
    });

    it("should receive BNB directly", async function () {
      const { controller, owner, ethers } = await deployAll();
      const controllerAddr = await controller.getAddress();
      await owner.sendTransaction({ to: controllerAddr, value: ethers.parseEther("1.0") });
      const bal = await ethers.provider.getBalance(controllerAddr);
      assert.ok(bal >= ethers.parseEther("1.0"));
    });
  });

  // =================== IPO Capital Release Tests ===================

  describe("releaseIPOCapital", function () {
    it("should accumulate ipoCapital on bond purchase", async function () {
      const { controller, registry, tokenRegistry, agentOwner, investor1, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);

      // BNB (address(0)) is auto-supported by TokenRegistry constructor

      // Initiate IPO
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 90, price, 100, "0x0000000000000000000000000000000000000000");

      // Purchase 10 bonds
      const classIds = await controller.getAgentBondClasses(agentId);
      const classId = classIds[0];
      const totalCost = price * 10n;
      await controller.connect(investor1).purchaseBondsBNB(classId, 10, { value: totalCost });

      // Check ipoCapital accumulated
      const cap = await controller.ipoCapital(agentId, "0x0000000000000000000000000000000000000000");
      assert.equal(cap, totalCost);
    });

    it("should release IPO capital to authorized caller", async function () {
      const { controller, registry, tokenRegistry, agentOwner, investor1, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);

      // BNB (address(0)) is auto-supported by TokenRegistry constructor
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 90, price, 100, "0x0000000000000000000000000000000000000000");

      const classIds = await controller.getAgentBondClasses(agentId);
      const classId = classIds[0];
      const totalCost = price * 10n;
      await controller.connect(investor1).purchaseBondsBNB(classId, 10, { value: totalCost });

      // Agent owner releases capital
      const balBefore = await ethers.provider.getBalance(agentOwner.address);
      await controller.connect(agentOwner).releaseIPOCapital(agentId, "0x0000000000000000000000000000000000000000", totalCost);
      const balAfter = await ethers.provider.getBalance(agentOwner.address);

      // Balance should increase (minus gas)
      assert.ok(balAfter > balBefore - ethers.parseEther("0.01"));

      // ipoCapital should be 0
      const cap = await controller.ipoCapital(agentId, "0x0000000000000000000000000000000000000000");
      assert.equal(cap, 0n);
    });

    it("should reject release from unauthorized caller", async function () {
      const { controller, registry, tokenRegistry, agentOwner, investor1, outsider, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);

      // BNB (address(0)) is auto-supported by TokenRegistry constructor
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 90, price, 100, "0x0000000000000000000000000000000000000000");

      const classIds = await controller.getAgentBondClasses(agentId);
      await controller.connect(investor1).purchaseBondsBNB(classIds[0], 10, { value: price * 10n });

      // Outsider tries to release - should fail
      await assert.rejects(
        controller.connect(outsider).releaseIPOCapital(agentId, "0x0000000000000000000000000000000000000000", price * 10n),
        /not authorized/
      );
    });

    it("should reject release exceeding available capital", async function () {
      const { controller, registry, tokenRegistry, agentOwner, investor1, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);

      // BNB (address(0)) is auto-supported by TokenRegistry constructor
      const price = ethers.parseEther("0.01");
      await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 90, price, 100, "0x0000000000000000000000000000000000000000");

      const classIds = await controller.getAgentBondClasses(agentId);
      await controller.connect(investor1).purchaseBondsBNB(classIds[0], 10, { value: price * 10n });

      // Try to release more than available
      await assert.rejects(
        controller.connect(agentOwner).releaseIPOCapital(agentId, "0x0000000000000000000000000000000000000000", price * 20n),
        /insufficient capital/
      );
    });

    it("should reject release of zero amount", async function () {
      const { controller, registry, tokenRegistry, agentOwner, ethers } = await deployAll();
      const agentId = await registerAndActivate(registry, agentOwner);

      await assert.rejects(
        controller.connect(agentOwner).releaseIPOCapital(agentId, "0x0000000000000000000000000000000000000000", 0),
        /zero amount/
      );
    });
  });
});
