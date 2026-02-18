/**
 * AGENT WALL STREET - Full Lifecycle Demo
 *
 * Demonstrates the complete SIB (Sovereign Intelligence Bonds) lifecycle:
 *   1. Deploy all contracts locally
 *   2. Wire permissions
 *   3. Register an AI agent (NFA)
 *   4. Agent IPO (issue bonds)
 *   5. Investor buys bonds
 *   6. Agent earns x402 revenue (intelligence payments)
 *   7. Distribute dividends to bondholders
 *   8. Investor claims dividends
 *   9. Print summary
 *
 * Usage:
 *   npx hardhat run scripts/demo-lifecycle.ts
 */

import hre from "hardhat";

async function main() {
  const connection = await hre.network.connect();
  const { ethers } = connection;
  const [deployer, investor] = await ethers.getSigners();

  console.log("========================================");
  console.log("AGENT WALL STREET - Full Lifecycle Demo");
  console.log("========================================");
  console.log();

  // ============================================================
  // Step 1: Deploy all contracts locally
  // ============================================================
  console.log("[1/9] Deploying contracts...");

  const mockVerifier = await (await ethers.getContractFactory("MockVerifier")).deploy();
  await mockVerifier.waitForDeployment();
  const mockVerifierAddr = await mockVerifier.getAddress();
  console.log("  MockVerifier:      " + mockVerifierAddr);

  const tokenRegistry = await (await ethers.getContractFactory("TokenRegistry")).deploy(deployer.address);
  await tokenRegistry.waitForDeployment();
  const tokenRegistryAddr = await tokenRegistry.getAddress();
  console.log("  TokenRegistry:     " + tokenRegistryAddr);

  const nfaRegistry = await (await ethers.getContractFactory("NFARegistry")).deploy();
  await nfaRegistry.waitForDeployment();
  const nfaRegistryAddr = await nfaRegistry.getAddress();
  console.log("  NFARegistry:       " + nfaRegistryAddr);

  const bondManager = await (await ethers.getContractFactory("SIBBondManager")).deploy();
  await bondManager.waitForDeployment();
  const bondManagerAddr = await bondManager.getAddress();
  console.log("  SIBBondManager:    " + bondManagerAddr);

  const dividendVault = await (await ethers.getContractFactory("DividendVaultV2")).deploy();
  await dividendVault.waitForDeployment();
  const dividendVaultAddr = await dividendVault.getAddress();
  console.log("  DividendVaultV2:   " + dividendVaultAddr);

  const controller = await (await ethers.getContractFactory("SIBControllerV2")).deploy(
    nfaRegistryAddr,
    bondManagerAddr,
    dividendVaultAddr,
    mockVerifierAddr,
    tokenRegistryAddr
  );
  await controller.waitForDeployment();
  const controllerAddr = await controller.getAddress();
  console.log("  SIBControllerV2:   " + controllerAddr);

  const x402 = await (await ethers.getContractFactory("X402PaymentReceiverV2")).deploy();
  await x402.waitForDeployment();
  const x402Addr = await x402.getAddress();
  console.log("  X402PaymentV2:     " + x402Addr);

  console.log();

  // ============================================================
  // Step 2: Wire permissions
  // ============================================================
  console.log("[2/9] Wiring permissions...");

  await (await nfaRegistry.setController(controllerAddr)).wait();
  console.log("  NFARegistry.setController       -> done");

  await (await bondManager.setController(controllerAddr)).wait();
  console.log("  SIBBondManager.setController     -> done");

  await (await bondManager.setDividendVault(dividendVaultAddr)).wait();
  console.log("  SIBBondManager.setDividendVault  -> done");

  await (await dividendVault.setController(controllerAddr)).wait();
  console.log("  DividendVaultV2.setController     -> done");

  await (await dividendVault.setBondManager(bondManagerAddr)).wait();
  console.log("  DividendVaultV2.setBondManager    -> done");

  await (await x402.setController(controllerAddr)).wait();
  console.log("  X402PaymentV2.setController       -> done");

  console.log();

  // ============================================================
  // Step 3: Register AI Agent
  // ============================================================
  console.log('[3/9] Registering AI Agent "AlphaSignal-01"...');

  const registerTx = await nfaRegistry.registerAgent(
    "AlphaSignal-01",
    "Market Intelligence AI -- real-time on-chain alpha signals",
    "QmAlphaSignalModelHash2026",
    "https://alphasignal.ai/api/v1"
  );
  await registerTx.wait();
  const agentId = 1n;

  // Activate the agent (Registered -> Active)
  await (await nfaRegistry.updateState(agentId, 1)).wait(); // 1 = Active

  console.log("  Agent ID:      " + agentId.toString());
  console.log("  Agent State:   Active");
  console.log("  Agent Owner:   " + deployer.address);
  console.log();

  // ============================================================
  // Step 4: Agent IPO -- issue bonds
  // ============================================================
  console.log("[4/9] Agent IPO: issuing bonds...");

  const couponRateBps = 500n;        // 5% annual coupon
  const maturityPeriod = 86400n * 365n; // 1 year
  const pricePerBond = ethers.parseEther("0.01"); // 0.01 BNB per bond
  const maxSupply = 100n;
  const paymentToken = ethers.ZeroAddress; // BNB

  const ipoTx = await controller.initiateIPO(
    agentId,
    couponRateBps,
    maturityPeriod,
    pricePerBond,
    maxSupply,
    paymentToken
  );
  const ipoReceipt = await ipoTx.wait();

  // Parse IPOInitiated event to get classId and nonceId
  const ipoLog = ipoReceipt.logs.find((log: any) => {
    try {
      return controller.interface.parseLog(log)?.name === "IPOInitiated";
    } catch { return false; }
  });
  const ipoEvent = controller.interface.parseLog(ipoLog!);
  const classId = ipoEvent!.args[1]; // indexed classId
  const nonceId = ipoEvent!.args[2];

  console.log("  Bond Class ID: " + classId.toString());
  console.log("  Nonce ID:      " + nonceId.toString());
  console.log("  Coupon Rate:   5%");
  console.log("  Maturity:      365 days");
  console.log("  Max Supply:    " + maxSupply.toString() + " bonds");
  console.log("  Price:         0.01 BNB per bond");
  console.log();

  // ============================================================
  // Step 5: Investor buys bonds
  // ============================================================
  console.log("[5/9] Investor buying 10 bonds...");

  const bondsToBuy = 10n;
  const totalCost = pricePerBond * bondsToBuy; // 0.1 BNB

  const purchaseTx = await controller.connect(investor).purchaseBondsBNB(
    classId,
    bondsToBuy,
    { value: totalCost }
  );
  await purchaseTx.wait();

  const investorBalance = await bondManager.balanceOf(investor.address, classId, nonceId);
  console.log("  Investor:      " + investor.address);
  console.log("  Bonds bought:  " + bondsToBuy.toString());
  console.log("  Total cost:    " + ethers.formatEther(totalCost) + " BNB");
  console.log("  Bond balance:  " + investorBalance.toString());
  console.log();

  // ============================================================
  // Step 6: Agent earns x402 revenue (intelligence payments)
  // ============================================================
  console.log("[6/9] Agent earning revenue (x402 intelligence payments)...");

  const paymentAmount = ethers.parseEther("0.01");
  const endpoints = [
    "/api/v1/alpha-signals",
    "/api/v1/market-analysis",
    "/api/v1/risk-assessment",
  ];

  for (let i = 0; i < 3; i++) {
    const payTx = await x402.payBNB(agentId, endpoints[i], { value: paymentAmount });
    const payReceipt = await payTx.wait();
    console.log("  Payment " + (i + 1) + ": " + ethers.formatEther(paymentAmount) + " BNB -> " + endpoints[i]);
    console.log("           tx: " + payReceipt.hash);
  }

  const totalRevenue = paymentAmount * 3n;
  console.log("  Total revenue: " + ethers.formatEther(totalRevenue) + " BNB");

  // Check revenue pool (70% goes to bondholders, 30% to agent owner)
  const bondholderShareBps = await controller.bondholderShareBps();
  const bondholderRevenue = (totalRevenue * bondholderShareBps) / 10000n;
  const ownerRevenue = totalRevenue - bondholderRevenue;
  console.log("  Bondholder pool (70%): " + ethers.formatEther(bondholderRevenue) + " BNB");
  console.log("  Owner share (30%):     " + ethers.formatEther(ownerRevenue) + " BNB");
  console.log();

  // ============================================================
  // Step 7: Distribute dividends
  // ============================================================
  console.log("[7/9] Distributing dividends to bondholders...");

  const distTx = await controller.distributeDividends(classId, nonceId);
  await distTx.wait();

  console.log("  Distributed " + ethers.formatEther(bondholderRevenue) + " BNB to bond class " + classId.toString());
  console.log();

  // ============================================================
  // Step 8: Investor claims dividends
  // ============================================================
  console.log("[8/9] Investor claiming dividends...");

  const claimableBefore = await dividendVault.claimable(investor.address, classId, nonceId, ethers.ZeroAddress);
  console.log("  Claimable:     " + ethers.formatEther(claimableBefore) + " BNB");

  const investorBalanceBefore = await ethers.provider.getBalance(investor.address);

  const claimTx = await dividendVault.connect(investor).claim(classId, nonceId, ethers.ZeroAddress);
  const claimReceipt = await claimTx.wait();

  const investorBalanceAfter = await ethers.provider.getBalance(investor.address);
  const gasCost = claimReceipt.gasUsed * claimReceipt.gasPrice;
  const netReceived = investorBalanceAfter - investorBalanceBefore + gasCost;

  console.log("  Claimed:       " + ethers.formatEther(netReceived) + " BNB");
  console.log("  tx:            " + claimReceipt.hash);
  console.log();

  // ============================================================
  // Step 9: Print summary
  // ============================================================
  const revenueProfile = await nfaRegistry.getRevenueProfile(agentId);
  const agentMeta = await nfaRegistry.getAgentMetadata(agentId);
  const evolutionLevel = await nfaRegistry.getEvolutionLevel(agentId);
  const capitalRaised = await nfaRegistry.getCapitalRaised(agentId);

  console.log("========================================");
  console.log("SUMMARY");
  console.log("========================================");
  console.log("Agent: " + agentMeta.name + " (ID: " + agentId.toString() + ")");
  console.log("Description: " + agentMeta.description);
  console.log("Total revenue earned: " + ethers.formatEther(revenueProfile.totalEarned) + " BNB (from " + revenueProfile.totalPayments.toString() + " x402 payments)");
  console.log("Capital raised (bonds): " + ethers.formatEther(capitalRaised) + " BNB");
  console.log("Evolution level: " + evolutionLevel.toString());
  console.log("Bonds: " + maxSupply.toString() + " total supply, investor holds " + bondsToBuy.toString() + " (" + ((bondsToBuy * 100n) / maxSupply).toString() + "%)");
  console.log("Revenue split: " + bondholderShareBps.toString() + " bps to bondholders, " + (10000n - bondholderShareBps).toString() + " bps to agent owner");
  console.log("Dividends claimed by investor: " + ethers.formatEther(netReceived) + " BNB");
  console.log();
  console.log("This is Agent Wall Street.");
  console.log("AI agents that IPO, earn revenue, and pay dividends.");
  console.log("========================================");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
