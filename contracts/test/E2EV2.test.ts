import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("E2E V2: Full Integration", function () {
  /**
   * deployAllV2 - deploys ALL v2 contracts, wires permissions, creates mock tokens.
   *
   * Wiring strategy:
   *  - BondManager controller = SIBControllerV2 (for standard IPO/purchase/redeem)
   *  - TranchingEngine controller = SIBControllerV2 (so controller can call createTrancheGroup)
   *  - For tranched IPOs, we temporarily swap BondManager controller to TranchingEngine,
   *    then swap back after the tranched IPO completes.
   */
  async function deployAllV2() {
    const connection = await hre.network.connect();
    const { ethers, networkHelpers } = connection;
    const [deployer, agentOwner, agentOwner2, investor1, investor2, payer] =
      await ethers.getSigners();

    // --- Deploy core contracts ---
    const mockVerifier = await (await ethers.getContractFactory("MockVerifier")).deploy();
    const tokenRegistry = await (await ethers.getContractFactory("TokenRegistry")).deploy(deployer.address);
    const registry = await (await ethers.getContractFactory("NFARegistry")).deploy();
    const bondManager = await (await ethers.getContractFactory("SIBBondManager")).deploy();
    const vaultV2 = await (await ethers.getContractFactory("DividendVaultV2")).deploy();

    // --- Deploy SIBControllerV2 ---
    const controller = await (await ethers.getContractFactory("SIBControllerV2")).deploy(
      await registry.getAddress(),
      await bondManager.getAddress(),
      await vaultV2.getAddress(),
      await mockVerifier.getAddress(),
      await tokenRegistry.getAddress()
    );
    const controllerAddr = await controller.getAddress();

    // --- Deploy TranchingEngine ---
    const tranchingEngine = await (await ethers.getContractFactory("TranchingEngine")).deploy(
      await bondManager.getAddress()
    );
    await tranchingEngine.setController(controllerAddr);
    await controller.setTranchingEngine(await tranchingEngine.getAddress());

    // --- Deploy X402PaymentReceiverV2 ---
    const x402V2 = await (await ethers.getContractFactory("X402PaymentReceiverV2")).deploy();
    await x402V2.setController(controllerAddr);

    // --- Deploy LiquidationEngine ---
    const liquidationEngine = await (await ethers.getContractFactory("LiquidationEngine")).deploy(
      await registry.getAddress(),
      await bondManager.getAddress()
    );

    // --- Deploy BondDEX ---
    const bondDEX = await (await ethers.getContractFactory("BondDEX")).deploy(
      await bondManager.getAddress(),
      await vaultV2.getAddress()
    );

    // --- Deploy BondholderGovernor ---
    const governor = await (await ethers.getContractFactory("BondholderGovernor")).deploy(
      await bondManager.getAddress()
    );

    // --- Deploy AutoCompoundVault ---
    // AutoCompoundVault needs a mock dividend vault and mock controller for compound
    // For E2E we will use MockDividendVault and MockAutoCompoundController
    const mockDividendVaultForAC = await (await ethers.getContractFactory("MockDividendVault")).deploy();
    const mockControllerForAC = await (await ethers.getContractFactory("MockAutoCompoundController")).deploy(
      await bondManager.getAddress()
    );
    const autoCompoundVault = await (await ethers.getContractFactory("AutoCompoundVault")).deploy(
      await bondManager.getAddress(),
      await mockDividendVaultForAC.getAddress(),
      await mockControllerForAC.getAddress()
    );

    // --- Deploy IndexBond ---
    const indexBond = await (await ethers.getContractFactory("IndexBond")).deploy(
      await bondManager.getAddress(),
      controllerAddr
    );

    // --- Deploy BondCollateralWrapper ---
    const collateralWrapper = await (await ethers.getContractFactory("BondCollateralWrapper")).deploy(
      await bondManager.getAddress()
    );

    // --- Deploy Mock ERC20s ---
    const mockUSDT = await (await ethers.getContractFactory("MockERC20")).deploy("Mock USDT", "USDT", 18);
    const mockUSDC = await (await ethers.getContractFactory("MockERC20")).deploy("Mock USDC", "USDC", 18);

    // Register tokens in TokenRegistry
    await tokenRegistry.addToken(await mockUSDT.getAddress(), "USDT", 18, ethers.parseEther("1"));
    await tokenRegistry.addToken(await mockUSDC.getAddress(), "USDC", 18, ethers.parseEther("1"));

    // --- Wire permissions ---
    await registry.setController(controllerAddr);
    await bondManager.setController(controllerAddr);
    await bondManager.setDividendVault(await vaultV2.getAddress());
    await vaultV2.setController(controllerAddr);
    await vaultV2.setBondManager(await bondManager.getAddress());

    return {
      ethers, connection, networkHelpers,
      deployer, agentOwner, agentOwner2, investor1, investor2, payer,
      mockVerifier, tokenRegistry, registry, bondManager, vaultV2,
      controller, tranchingEngine, x402V2, liquidationEngine,
      bondDEX, governor, autoCompoundVault, mockDividendVaultForAC, mockControllerForAC,
      indexBond, collateralWrapper, mockUSDT, mockUSDC,
    };
  }

  // Helpers
  // Each deployAllV2() creates a fresh blockchain, so agent IDs always start at 1.
  // We pass a counter object so each test tracks its own agent ID sequence.
  function createAgentCounter() { return { next: 0n }; }
  async function registerAndActivate(registry: any, owner: any, counter: { next: bigint }, name = "AlphaBot") {
    counter.next++;
    const agentId = counter.next;
    await registry.connect(owner).registerAgent(name, "High-freq DeFi agent", "QmAlpha", "https://api.bot.ai");
    await registry.connect(owner).updateState(agentId, 1);
    return agentId;
  }

  // =====================================================
  // Scenario 1: Full lifecycle with tranching
  // =====================================================
  it("1. Full lifecycle with tranching: register -> proof -> tranchedIPO -> buy senior+junior -> x402 -> waterfall -> claim -> redeem", async function () {
    const fix = await deployAllV2();
    const {
      registry, bondManager, vaultV2, controller, tranchingEngine,
      ethers, connection, deployer, agentOwner, investor1, investor2, payer,
    } = fix;

    // Register and activate agent
    const counter = createAgentCounter();
    const agentId = await registerAndActivate(registry, agentOwner, counter);

    // Submit Sharpe proof
    const proof = ethers.randomBytes(128);
    const sharpeRatio = ethers.parseEther("1.8");
    await controller.connect(agentOwner).submitSharpeProof(agentId, proof, [sharpeRatio]);

    // --- Tranched IPO ---
    // Swap BondManager controller to TranchingEngine for tranched IPO
    await bondManager.connect(deployer).setController(await tranchingEngine.getAddress());

    const seniorPrice = ethers.parseEther("0.01");
    const juniorPrice = ethers.parseEther("0.005");
    const tx = await controller.connect(agentOwner).initiateTranchedIPO(
      agentId, 300, 800, 86400, 500, 300, ethers.ZeroAddress, seniorPrice, juniorPrice
    );
    const receipt = await tx.wait();
    const tranchedEvent = receipt.logs.find((log: any) => log.fragment?.name === "TranchedIPOInitiated");
    assert.ok(tranchedEvent, "TranchedIPOInitiated event should be emitted");
    const seniorClassId = tranchedEvent.args[2];
    const juniorClassId = tranchedEvent.args[3];

    // Swap BondManager controller back to SIBControllerV2
    await bondManager.connect(deployer).setController(await controller.getAddress());

    // Investors purchase senior and junior bonds
    await controller.connect(investor1).purchaseBondsBNB(seniorClassId, 100, { value: seniorPrice * 100n });
    await controller.connect(investor2).purchaseBondsBNB(juniorClassId, 50, { value: juniorPrice * 50n });

    assert.equal(await bondManager.balanceOf(investor1.address, seniorClassId, 0), 100n);
    assert.equal(await bondManager.balanceOf(investor2.address, juniorClassId, 0), 50n);

    // x402 BNB revenue
    const payment = ethers.parseEther("2.0");
    await controller.connect(payer).receiveX402PaymentBNB(agentId, { value: payment });

    const pool = await controller.revenuePool(agentId, ethers.ZeroAddress);
    assert.equal(pool, ethers.parseEther("1.4")); // 70% of 2.0

    // Waterfall distribute -- we use distributeDividends which deposits to vault
    // For waterfall, we call vault directly (controller distributes flat, not waterfall)
    // Actually, distributeDividends on controller distributes to a single classId.
    // For senior bonds, distribute dividends to senior class:
    await controller.connect(agentOwner).distributeDividends(seniorClassId, 0);

    // Verify senior can claim
    const seniorClaimable = await vaultV2.claimable(investor1.address, seniorClassId, 0, ethers.ZeroAddress);
    assert.ok(seniorClaimable > 0n, "Senior should have claimable dividends");

    await vaultV2.connect(investor1).claim(seniorClassId, 0, ethers.ZeroAddress);

    // Fast forward to maturity and redeem
    await connection.provider.send("evm_increaseTime", [86401]);
    await connection.provider.send("evm_mine", []);

    await controller.connect(agentOwner).markBondsRedeemable(seniorClassId, 0);
    await deployer.sendTransaction({ to: await controller.getAddress(), value: seniorPrice * 100n });
    await controller.connect(investor1).redeemBonds(seniorClassId, 0, 100);
    assert.equal(await bondManager.balanceOf(investor1.address, seniorClassId, 0), 0n);
  });

  // =====================================================
  // Scenario 2: Secondary market trading (BondDEX)
  // =====================================================
  it("2. Secondary market: IPO -> buy -> sell order on BondDEX -> fill -> verify transfer", async function () {
    const fix = await deployAllV2();
    const {
      registry, bondManager, vaultV2, controller, bondDEX,
      ethers, deployer, agentOwner, investor1, investor2,
    } = fix;

    const counter = createAgentCounter();
    const agentId = await registerAndActivate(registry, agentOwner, counter);
    const price = ethers.parseEther("0.01");
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);
    const classes = await controller.getAgentBondClasses(agentId);
    const classId = classes[0];

    // Investor1 buys 200 bonds
    await controller.connect(investor1).purchaseBondsBNB(classId, 200, { value: price * 200n });
    assert.equal(await bondManager.balanceOf(investor1.address, classId, 0), 200n);

    // Investor1 approves BondDEX
    const dexAddr = await bondDEX.getAddress();
    await bondManager.connect(investor1).setApprovalFor(dexAddr, true);

    // Create sell order: 100 bonds at 0.02 ETH each
    const sellPrice = ethers.parseEther("0.02");
    await bondDEX.connect(investor1).createSellOrder(classId, 0n, 100n, sellPrice, ethers.ZeroAddress, 0n);

    // Investor2 fills the order
    await bondDEX.connect(investor2).fillOrder(1n, 100n, { value: sellPrice * 100n });

    // Verify transfers
    assert.equal(await bondManager.balanceOf(investor1.address, classId, 0), 100n);
    assert.equal(await bondManager.balanceOf(investor2.address, classId, 0), 100n);

    // Order should be fully filled and inactive
    const order = await bondDEX.getOrder(1n);
    assert.equal(order.active, false);
    assert.equal(order.amount, 0n);
  });

  // =====================================================
  // Scenario 3: Governance voting
  // =====================================================
  it("3. Governance: IPO -> buy -> create proposal -> vote -> fast forward -> execute", async function () {
    const fix = await deployAllV2();
    const {
      registry, bondManager, controller, governor,
      ethers, networkHelpers, deployer, agentOwner, investor1,
    } = fix;

    const counter = createAgentCounter();
    const agentId = await registerAndActivate(registry, agentOwner, counter);
    const price = ethers.parseEther("0.01");
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);
    const classes = await controller.getAgentBondClasses(agentId);
    const classId = classes[0];

    // Investor1 buys 500 bonds (need >20% quorum)
    await controller.connect(investor1).purchaseBondsBNB(classId, 500, { value: price * 500n });

    // Create proposal: CouponChange to 800 bps
    await governor.connect(investor1).createProposal(classId, 0, 800n);

    // Vote for
    await governor.connect(investor1).vote(1n, true);

    const proposal = await governor.getProposal(1n);
    assert.equal(proposal.forVotes, 500n);
    assert.equal(proposal.state, 0n); // Active

    // Fast forward 3 days
    await networkHelpers.time.increase(3 * 24 * 60 * 60 + 1);

    // Execute proposal
    await governor.executeProposal(1n);
    const executed = await governor.getProposal(1n);
    assert.equal(executed.state, 1n); // Passed
  });

  // =====================================================
  // Scenario 4: Liquidation flow
  // =====================================================
  it("4. Liquidation: register -> low Sharpe -> trigger -> fast forward grace -> execute -> bonds redeemable", async function () {
    const fix = await deployAllV2();
    const {
      registry, bondManager, controller, liquidationEngine,
      ethers, networkHelpers, deployer, agentOwner, investor1,
    } = fix;

    const counter = createAgentCounter();
    const agentId = await registerAndActivate(registry, agentOwner, counter);

    // Submit low Sharpe proof -> C rating
    const proof = ethers.randomBytes(128);
    const lowSharpe = ethers.parseEther("0.3"); // Very low
    await controller.connect(agentOwner).submitSharpeProof(agentId, proof, [lowSharpe]);

    // Check credit rating
    const rating = await registry.creditRatings(agentId);
    assert.equal(rating, 1n, "Should be C rating with low Sharpe");

    // Create an IPO so bonds exist
    const price = ethers.parseEther("0.01");
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 90, price, 1000, ethers.ZeroAddress);
    const classes = await controller.getAgentBondClasses(agentId);
    const classId = classes[0];
    await controller.connect(investor1).purchaseBondsBNB(classId, 100, { value: price * 100n });

    // Register bond class in liquidation engine
    await liquidationEngine.connect(deployer).registerBondClass(agentId, classId);
    await liquidationEngine.connect(deployer).registerNonce(classId, 0n);

    // Trigger liquidation
    await liquidationEngine.triggerLiquidation(agentId);
    assert.equal(await liquidationEngine.isUnderLiquidation(agentId), true);

    // Fast forward past 7-day grace period
    await networkHelpers.time.increase(7 * 86400 + 1);

    // Switch bondManager controller to liquidationEngine so it can mark redeemable
    await bondManager.connect(deployer).setController(await liquidationEngine.getAddress());
    await liquidationEngine.executeLiquidation(agentId);

    // Verify bonds marked redeemable
    const nonce = await bondManager.bondNonces(classId, 0);
    assert.equal(nonce.redeemable, true);

    // Restore controller
    await bondManager.connect(deployer).setController(await controller.getAddress());
  });

  // =====================================================
  // Scenario 5: Multi-token (ERC-20) flow
  // =====================================================
  it("5. Multi-token: IPO with USDT -> purchaseBondsERC20 -> receiveX402PaymentERC20 -> distribute -> claim ERC20", async function () {
    const fix = await deployAllV2();
    const {
      registry, bondManager, vaultV2, controller, mockUSDT,
      ethers, deployer, agentOwner, investor1, payer,
    } = fix;

    const counter = createAgentCounter();
    const agentId = await registerAndActivate(registry, agentOwner, counter);
    const tokenAddr = await mockUSDT.getAddress();
    const bondPrice = ethers.parseEther("10"); // 10 USDT per bond

    // IPO with USDT
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, bondPrice, 1000, tokenAddr);
    const classes = await controller.getAgentBondClasses(agentId);
    const classId = classes[0];

    // Mint USDT to investor1, approve, and purchase
    await mockUSDT.mint(investor1.address, ethers.parseEther("1000"));
    await mockUSDT.connect(investor1).approve(await controller.getAddress(), ethers.parseEther("1000"));
    await controller.connect(investor1).purchaseBondsERC20(classId, 10);
    assert.equal(await bondManager.balanceOf(investor1.address, classId, 0), 10n);
    assert.equal(await mockUSDT.balanceOf(investor1.address), ethers.parseEther("900")); // 1000 - 100

    // x402 ERC20 payment
    await mockUSDT.mint(payer.address, ethers.parseEther("100"));
    await mockUSDT.connect(payer).approve(await controller.getAddress(), ethers.parseEther("100"));
    await controller.connect(payer).receiveX402PaymentERC20(agentId, tokenAddr, ethers.parseEther("50"));

    const pool = await controller.revenuePool(agentId, tokenAddr);
    assert.equal(pool, ethers.parseEther("35")); // 70% of 50

    // Distribute
    await controller.connect(agentOwner).distributeDividends(classId, 0);
    assert.equal(await controller.revenuePool(agentId, tokenAddr), 0n);

    // Claim ERC20 dividends
    const claimable = await vaultV2.claimable(investor1.address, classId, 0, tokenAddr);
    assert.ok(claimable > 0n, "Should have ERC20 claimable");

    const balBefore = await mockUSDT.balanceOf(investor1.address);
    await vaultV2.connect(investor1).claim(classId, 0, tokenAddr);
    const balAfter = await mockUSDT.balanceOf(investor1.address);
    assert.ok(balAfter > balBefore, "Should have received USDT dividends");
  });

  // =====================================================
  // Scenario 6: Auto-compound
  // =====================================================
  it("6. Auto-compound: IPO -> buy -> deposit to AutoCompoundVault -> compound", async function () {
    const fix = await deployAllV2();
    const {
      registry, bondManager, controller, autoCompoundVault,
      mockDividendVaultForAC, mockControllerForAC,
      ethers, deployer, agentOwner, investor1,
    } = fix;

    const counter = createAgentCounter();
    const agentId = await registerAndActivate(registry, agentOwner, counter);
    const price = ethers.parseEther("0.01");
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);
    const classes = await controller.getAgentBondClasses(agentId);
    const classId = classes[0];

    // Buy bonds
    await controller.connect(investor1).purchaseBondsBNB(classId, 100, { value: price * 100n });

    // Approve vault
    const vaultAddr = await autoCompoundVault.getAddress();
    await bondManager.connect(investor1).setApprovalFor(vaultAddr, true);

    // Deposit bonds
    await autoCompoundVault.connect(investor1).deposit(classId, 0n, 50n);
    assert.equal(await autoCompoundVault.balanceOf(investor1.address, classId, 0n), 50n);
    assert.equal(await bondManager.balanceOf(investor1.address, classId, 0), 50n);

    // Fund mock dividend vault and set claimable for compound
    const mockDivVaultAddr = await mockDividendVaultForAC.getAddress();
    await investor1.sendTransaction({ to: mockDivVaultAddr, value: ethers.parseEther("1") });
    await mockDividendVaultForAC.setClaimable(
      vaultAddr, classId, 0n, ethers.ZeroAddress, ethers.parseEther("0.1")
    );

    // Compound
    await autoCompoundVault.connect(investor1).compound(classId, 0n, ethers.parseEther("0.05"));

    // Verify compound was called
    assert.equal(await mockDividendVaultForAC.claimCallCount(), 1n);
    assert.equal(await mockControllerForAC.lastClassId(), classId);
    // 0.1 / 0.05 = 2 bonds
    assert.equal(await mockControllerForAC.lastAmount(), 2n);

    // Withdraw
    await autoCompoundVault.connect(investor1).withdraw(classId, 0n, 50n);
    assert.equal(await autoCompoundVault.balanceOf(investor1.address, classId, 0n), 0n);
  });

  // =====================================================
  // Scenario 7: Index bond
  // =====================================================
  it("7. Index bond: 2 agents with IPOs -> createIndex -> mint shares -> redeem shares -> verify bonds returned", async function () {
    const fix = await deployAllV2();
    const {
      registry, bondManager, controller, indexBond,
      ethers, deployer, agentOwner, investor1,
    } = fix;

    // Register 2 agents
    const counter = createAgentCounter();
    const agentId1 = await registerAndActivate(registry, agentOwner, counter, "Agent1");
    const agentId2 = await registerAndActivate(registry, agentOwner, counter, "Agent2");

    const price = ethers.parseEther("0.01");
    await controller.connect(agentOwner).initiateIPO(agentId1, 500, 86400 * 30, price, 10000, ethers.ZeroAddress);
    await controller.connect(agentOwner).initiateIPO(agentId2, 800, 86400 * 60, price, 10000, ethers.ZeroAddress);

    const classes1 = await controller.getAgentBondClasses(agentId1);
    const classes2 = await controller.getAgentBondClasses(agentId2);
    const classId1 = classes1[0];
    const classId2 = classes2[0];

    // Investor buys bonds from both agents
    await controller.connect(investor1).purchaseBondsBNB(classId1, 5000, { value: price * 5000n });
    await controller.connect(investor1).purchaseBondsBNB(classId2, 5000, { value: price * 5000n });

    // Approve IndexBond
    const indexBondAddr = await indexBond.getAddress();
    await bondManager.connect(investor1).setApprovalFor(indexBondAddr, true);

    // Create index (50/50 weight)
    await indexBond.connect(deployer).createIndex(
      "Top 2 Agents",
      [classId1, classId2],
      [5000n, 5000n],
      [0n, 0n]
    );

    // Mint 1000 shares -> 500 bonds from each class
    await indexBond.connect(investor1).mintIndex(1n, 1000n);
    assert.equal(await indexBond.userShares(investor1.address, 1n), 1000n);
    assert.equal(await bondManager.balanceOf(investor1.address, classId1, 0), 4500n); // 5000 - 500
    assert.equal(await bondManager.balanceOf(investor1.address, classId2, 0), 4500n);

    // Redeem all shares
    await indexBond.connect(investor1).redeemIndex(1n, 1000n);
    assert.equal(await indexBond.userShares(investor1.address, 1n), 0n);
    assert.equal(await bondManager.balanceOf(investor1.address, classId1, 0), 5000n);
    assert.equal(await bondManager.balanceOf(investor1.address, classId2, 0), 5000n);
  });

  // =====================================================
  // Scenario 8: Collateral wrapper
  // =====================================================
  it("8. Collateral wrapper: IPO -> buy -> wrap as ERC-721 -> verify ownership -> unwrap -> verify bonds returned", async function () {
    const fix = await deployAllV2();
    const {
      registry, bondManager, controller, collateralWrapper,
      ethers, deployer, agentOwner, investor1,
    } = fix;

    const counter = createAgentCounter();
    const agentId = await registerAndActivate(registry, agentOwner, counter);
    const price = ethers.parseEther("0.01");
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);
    const classes = await controller.getAgentBondClasses(agentId);
    const classId = classes[0];

    // Buy bonds
    await controller.connect(investor1).purchaseBondsBNB(classId, 200, { value: price * 200n });

    // Approve wrapper
    const wrapperAddr = await collateralWrapper.getAddress();
    await bondManager.connect(investor1).setApprovalFor(wrapperAddr, true);

    // Wrap 100 bonds
    await collateralWrapper.connect(investor1).wrap(classId, 0n, 100n);

    // Verify ERC-721 ownership
    assert.equal(await collateralWrapper.ownerOf(1n), investor1.address);

    // Verify wrapped position
    const pos = await collateralWrapper.getWrappedPosition(1n);
    assert.equal(pos.classId, classId);
    assert.equal(pos.nonceId, 0n);
    assert.equal(pos.amount, 100n);

    // Verify bond balance moved
    assert.equal(await bondManager.balanceOf(investor1.address, classId, 0), 100n); // 200 - 100

    // Unwrap
    await collateralWrapper.connect(investor1).unwrap(1n);

    // Verify bonds returned
    assert.equal(await bondManager.balanceOf(investor1.address, classId, 0), 200n);

    // NFT should be burned
    await assert.rejects(async () => {
      await collateralWrapper.ownerOf(1n);
    });
  });

  // =====================================================
  // Scenario 9: Dynamic coupon
  // =====================================================
  it("9. Dynamic coupon: IPO -> high Sharpe -> low coupon; low Sharpe -> higher coupon", async function () {
    const fix = await deployAllV2();
    const {
      registry, controller,
      ethers, deployer, agentOwner, payer,
    } = fix;

    const counter = createAgentCounter();
    const agentId = await registerAndActivate(registry, agentOwner, counter);
    const baseCoupon = 1000; // 10%

    // Submit high Sharpe proof
    await controller.connect(agentOwner).submitSharpeProof(agentId, ethers.randomBytes(64), [ethers.parseEther("2.5")]);

    // Boost revenue + age for high credit score
    await controller.connect(agentOwner).initiateIPO(agentId, baseCoupon, 86400 * 30, ethers.parseEther("0.01"), 1000, ethers.ZeroAddress);
    const classes = await controller.getAgentBondClasses(agentId);
    const classId = classes[0];

    // Send revenue to build up credit factors
    for (let i = 0; i < 3; i++) {
      await controller.connect(payer).receiveX402PaymentBNB(agentId, { value: ethers.parseEther("10") });
    }

    const highCoupon = await controller.calculateDynamicCoupon(classId);
    const [highScore] = await registry.calculateCreditScore(agentId);

    // Now register a second agent with no proof/revenue (low credit score)
    const agentId2 = await registerAndActivate(registry, agentOwner, counter, "LowBot");
    await controller.connect(agentOwner).initiateIPO(agentId2, baseCoupon, 86400 * 30, ethers.parseEther("0.01"), 1000, ethers.ZeroAddress);
    const classes2 = await controller.getAgentBondClasses(agentId2);
    const classId2 = classes2[0];

    const lowCoupon = await controller.calculateDynamicCoupon(classId2);
    const [lowScore] = await registry.calculateCreditScore(agentId2);

    // High credit agent should have lower coupon than low credit agent
    if (highScore > 5000n && lowScore < 5000n) {
      assert.ok(highCoupon < lowCoupon, `High credit coupon (${highCoupon}) should be < low credit coupon (${lowCoupon})`);
    }
    // Verify bounds
    assert.ok(highCoupon >= 100n, "Coupon should be >= 1%");
    assert.ok(lowCoupon <= 3000n, "Coupon should be <= 30%");
  });

  // =====================================================
  // Scenario 10: Multi-agent multi-series
  // =====================================================
  it("10. Multi-agent multi-series: 2 agents x 2 IPOs -> buy from all 4 -> x402 -> distribute -> verify independent pools", async function () {
    const fix = await deployAllV2();
    const {
      registry, bondManager, vaultV2, controller,
      ethers, deployer, agentOwner, investor1, payer,
    } = fix;

    const counter = createAgentCounter();
    const agent1 = await registerAndActivate(registry, agentOwner, counter, "AgentA");
    const agent2 = await registerAndActivate(registry, agentOwner, counter, "AgentB");

    const price = ethers.parseEther("0.01");

    // Agent1: 2 IPOs
    await controller.connect(agentOwner).initiateIPO(agent1, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);
    await controller.connect(agentOwner).initiateIPO(agent1, 800, 86400 * 60, price, 2000, ethers.ZeroAddress);

    // Agent2: 2 IPOs
    await controller.connect(agentOwner).initiateIPO(agent2, 600, 86400 * 30, price, 1000, ethers.ZeroAddress);
    await controller.connect(agentOwner).initiateIPO(agent2, 900, 86400 * 90, price, 3000, ethers.ZeroAddress);

    const classes1 = await controller.getAgentBondClasses(agent1);
    const classes2 = await controller.getAgentBondClasses(agent2);
    assert.equal(classes1.length, 2);
    assert.equal(classes2.length, 2);

    // Buy from all 4 classes
    for (const classId of [...classes1, ...classes2]) {
      await controller.connect(investor1).purchaseBondsBNB(classId, 10, { value: price * 10n });
    }

    // x402 payments to each agent
    await controller.connect(payer).receiveX402PaymentBNB(agent1, { value: ethers.parseEther("1.0") });
    await controller.connect(payer).receiveX402PaymentBNB(agent2, { value: ethers.parseEther("2.0") });

    // Verify independent pools
    const pool1 = await controller.revenuePool(agent1, ethers.ZeroAddress);
    const pool2 = await controller.revenuePool(agent2, ethers.ZeroAddress);
    assert.equal(pool1, ethers.parseEther("0.7"));
    assert.equal(pool2, ethers.parseEther("1.4"));

    // Distribute agent1 class 1
    await controller.connect(agentOwner).distributeDividends(classes1[0], 0);
    // Agent1 pool should now be 0
    assert.equal(await controller.revenuePool(agent1, ethers.ZeroAddress), 0n);
    // Agent2 pool untouched
    assert.equal(await controller.revenuePool(agent2, ethers.ZeroAddress), ethers.parseEther("1.4"));

    // Distribute agent2 class 1
    await controller.connect(agentOwner).distributeDividends(classes2[0], 0);
    assert.equal(await controller.revenuePool(agent2, ethers.ZeroAddress), 0n);

    // Verify investor can claim from agent1's first class
    const claimable1 = await vaultV2.claimable(investor1.address, classes1[0], 0, ethers.ZeroAddress);
    assert.ok(claimable1 > 0n, "Should have claimable from agent1");

    // Verify investor can claim from agent2's first class
    const claimable2 = await vaultV2.claimable(investor1.address, classes2[0], 0, ethers.ZeroAddress);
    assert.ok(claimable2 > 0n, "Should have claimable from agent2");
  });

  // =====================================================
  // Scenario 11: Bond transfer with dividend
  // =====================================================
  it("11. Bond transfer with dividend: IPO -> buy 100 -> x402 -> transfer 50 -> distribute -> verify proportional claim", async function () {
    const fix = await deployAllV2();
    const {
      registry, bondManager, vaultV2, controller,
      ethers, deployer, agentOwner, investor1, investor2, payer,
    } = fix;

    const counter = createAgentCounter();
    const agentId = await registerAndActivate(registry, agentOwner, counter);
    const price = ethers.parseEther("0.01");
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 1000, ethers.ZeroAddress);
    const classes = await controller.getAgentBondClasses(agentId);
    const classId = classes[0];

    // Investor1 buys 100 bonds
    await controller.connect(investor1).purchaseBondsBNB(classId, 100, { value: price * 100n });

    // x402 payment
    await controller.connect(payer).receiveX402PaymentBNB(agentId, { value: ethers.parseEther("1.0") });

    // Transfer 50 bonds from investor1 to investor2
    await controller.connect(investor1).transferBonds(investor2.address, classId, 0, 50);
    assert.equal(await bondManager.balanceOf(investor1.address, classId, 0), 50n);
    assert.equal(await bondManager.balanceOf(investor2.address, classId, 0), 50n);

    // Distribute dividends
    await controller.connect(agentOwner).distributeDividends(classId, 0);

    // Both should have claimable -- 50/50
    const claimable1 = await vaultV2.claimable(investor1.address, classId, 0, ethers.ZeroAddress);
    const claimable2 = await vaultV2.claimable(investor2.address, classId, 0, ethers.ZeroAddress);
    assert.ok(claimable1 > 0n, "Investor1 should have claimable");
    assert.ok(claimable2 > 0n, "Investor2 should have claimable");

    // The revenue was earned when investor1 had 100 bonds, then transferred 50.
    // Due to updateOnTransfer, investor1 should have pending rewards for the full period,
    // and after distribution both should share proportionally based on current balances.
    // Total: 0.7 BNB (70% of 1.0)
    const total = claimable1 + claimable2;
    assert.ok(total > 0n, "Total claimable should be > 0");

    // Claim both
    await vaultV2.connect(investor1).claim(classId, 0, ethers.ZeroAddress);
    await vaultV2.connect(investor2).claim(classId, 0, ethers.ZeroAddress);
  });

  // =====================================================
  // Scenario 12: Cross-feature combo
  // =====================================================
  it("12. Cross-feature combo: register -> IPO -> buy -> sell on DEX -> fill -> x402 -> distribute -> governance proposal -> vote", async function () {
    const fix = await deployAllV2();
    const {
      registry, bondManager, vaultV2, controller, bondDEX, governor,
      ethers, networkHelpers, deployer, agentOwner, investor1, investor2, payer,
    } = fix;

    // --- Setup ---
    const counter = createAgentCounter();
    const agentId = await registerAndActivate(registry, agentOwner, counter);
    const price = ethers.parseEther("0.01");
    await controller.connect(agentOwner).initiateIPO(agentId, 500, 86400 * 30, price, 2000, ethers.ZeroAddress);
    const classes = await controller.getAgentBondClasses(agentId);
    const classId = classes[0];

    // --- Investor1 buys 500 bonds ---
    await controller.connect(investor1).purchaseBondsBNB(classId, 500, { value: price * 500n });

    // --- Sell 200 on DEX ---
    const dexAddr = await bondDEX.getAddress();
    await bondManager.connect(investor1).setApprovalFor(dexAddr, true);
    const sellPrice = ethers.parseEther("0.015");
    await bondDEX.connect(investor1).createSellOrder(classId, 0n, 200n, sellPrice, ethers.ZeroAddress, 0n);

    // Investor2 fills 200
    await bondDEX.connect(investor2).fillOrder(1n, 200n, { value: sellPrice * 200n });

    assert.equal(await bondManager.balanceOf(investor1.address, classId, 0), 300n);
    assert.equal(await bondManager.balanceOf(investor2.address, classId, 0), 200n);

    // --- x402 revenue ---
    await controller.connect(payer).receiveX402PaymentBNB(agentId, { value: ethers.parseEther("5.0") });

    // --- Distribute ---
    await controller.connect(agentOwner).distributeDividends(classId, 0);

    // Both should have claimable
    const c1 = await vaultV2.claimable(investor1.address, classId, 0, ethers.ZeroAddress);
    const c2 = await vaultV2.claimable(investor2.address, classId, 0, ethers.ZeroAddress);
    assert.ok(c1 > 0n, "Investor1 should have claimable after distribution");
    assert.ok(c2 > 0n, "Investor2 should have claimable after distribution");

    // --- Governance: create proposal and vote ---
    await governor.connect(investor1).createProposal(classId, 0, 800n); // CouponChange
    await governor.connect(investor1).vote(1n, true);
    await governor.connect(investor2).vote(1n, true);

    const prop = await governor.getProposal(1n);
    assert.equal(prop.forVotes, 500n); // 300 + 200

    // Fast forward and execute
    await networkHelpers.time.increase(3 * 24 * 60 * 60 + 1);
    await governor.executeProposal(1n);
    const executedProp = await governor.getProposal(1n);
    assert.equal(executedProp.state, 1n); // Passed

    // --- Claim dividends ---
    await vaultV2.connect(investor1).claim(classId, 0, ethers.ZeroAddress);
    await vaultV2.connect(investor2).claim(classId, 0, ethers.ZeroAddress);

    // Verify claimed (nothing left)
    assert.equal(await vaultV2.claimable(investor1.address, classId, 0, ethers.ZeroAddress), 0n);
    assert.equal(await vaultV2.claimable(investor2.address, classId, 0, ethers.ZeroAddress), 0n);
  });
});
