/**
 * AGENT WALL STREET - Full Lifecycle Demo
 *
 * Demonstrates the complete SIB (Sovereign Intelligence Bonds) lifecycle:
 *   1. Deploy all contracts locally
 *   2. Wire permissions
 *   3. Register an AI agent (NFA)
 *   4. Agent IPO (issue bonds)
 *   5. Investor buys bonds
 *   6. Release IPO capital + rent GPU compute
 *   7. Agent earns b402 revenue (intelligence payments)
 *   8. Distribute dividends to bondholders
 *   9. Investor claims dividends
 *  10. Print summary
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
  console.log("[1/10] Deploying contracts...");

  const halo2Verifier = await (await ethers.getContractFactory("Halo2Verifier")).deploy();
  await halo2Verifier.waitForDeployment();
  const halo2VerifierAddr = await halo2Verifier.getAddress();
  console.log("  Halo2Verifier:     " + halo2VerifierAddr);

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
    halo2VerifierAddr,
    tokenRegistryAddr
  );
  await controller.waitForDeployment();
  const controllerAddr = await controller.getAddress();
  console.log("  SIBControllerV2:   " + controllerAddr);

  const b402 = await (await ethers.getContractFactory("B402PaymentReceiver")).deploy();
  await b402.waitForDeployment();
  const b402Addr = await b402.getAddress();
  console.log("  B402Payment:     " + b402Addr);

  const teeRegistryContract = await (await ethers.getContractFactory("TEERegistry")).deploy(nfaRegistryAddr);
  await teeRegistryContract.waitForDeployment();
  const teeRegistryAddr = await teeRegistryContract.getAddress();
  console.log("  TEERegistry:       " + teeRegistryAddr);

  const computeMarketplace = await (await ethers.getContractFactory("ComputeMarketplace")).deploy(
    nfaRegistryAddr,
    tokenRegistryAddr
  );
  await computeMarketplace.waitForDeployment();
  const computeMarketplaceAddr = await computeMarketplace.getAddress();
  console.log("  ComputeMarketplace:" + computeMarketplaceAddr);

  console.log();

  // ============================================================
  // Step 2: Wire permissions
  // ============================================================
  console.log("[2/10] Wiring permissions...");

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

  await (await b402.setController(controllerAddr)).wait();
  console.log("  B402Payment.setController       -> done");

  await (await controller.setTEERegistry(teeRegistryAddr)).wait();
  console.log("  Controller.setTEERegistry        -> done");

  await (await computeMarketplace.setTEERegistry(teeRegistryAddr)).wait();
  console.log("  ComputeMarketplace.setTEERegistry -> done");

  // Seed initial GPU resource
  await (await computeMarketplace.registerResource(
    "NVIDIA-A100-80GB", "80GB HBM2e, 312 TFLOPS",
    1, ethers.parseEther("0.001"), ethers.ZeroAddress, 0, 0, 10
  )).wait();
  console.log("  ComputeMarketplace.registerResource -> GPU #1 seeded");

  console.log();

  // ============================================================
  // Step 3: Register AI Agent
  // ============================================================
  console.log('[3/10] Registering AI Agent "AlphaSignal-01"...');

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
  console.log("[4/10] Agent IPO: issuing bonds...");

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
  console.log("[5/10] Investor buying 10 bonds...");

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
  // Step 6: Release IPO Capital + Rent GPU Compute
  // ============================================================
  console.log("[6/10] Deploying capital to GPU compute...");

  const ipoCapital = await controller.ipoCapital(agentId, ethers.ZeroAddress);
  console.log("  IPO capital available: " + ethers.formatEther(ipoCapital) + " BNB");

  // Release capital from Controller to deployer (acting as TEE wallet)
  const rentCost = ethers.parseEther("0.024"); // 1 unit * 24 hours * 0.001 BNB/hr
  const releaseTx = await controller.releaseIPOCapital(agentId, ethers.ZeroAddress, rentCost);
  await releaseTx.wait();
  console.log("  Released " + ethers.formatEther(rentCost) + " BNB from Controller");

  // Rent GPU compute
  const resourceId = 1n;
  const rentTx = await computeMarketplace.rentComputeBNB(agentId, resourceId, 1n, 24n, {
    value: rentCost,
  });
  await rentTx.wait();

  const activeRentals = await computeMarketplace.getActiveRentalCount(agentId);
  console.log("  Rented: NVIDIA-A100-80GB, 1 unit, 24 hours");
  console.log("  Active rentals: " + activeRentals.toString());
  console.log("  Capital -> Compute -> Ready to earn revenue");
  console.log();

  // ============================================================
  // Step 7: Agent earns b402 revenue (intelligence payments)
  // ============================================================
  console.log("[7/10] Agent earning revenue (b402 intelligence payments)...");

  const paymentAmount = ethers.parseEther("0.01");
  const endpoints = [
    "/api/v1/alpha-signals",
    "/api/v1/market-analysis",
    "/api/v1/risk-assessment",
  ];

  for (let i = 0; i < 3; i++) {
    const payTx = await b402.payBNB(agentId, endpoints[i], { value: paymentAmount });
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
  // Step 8: Distribute dividends
  // ============================================================
  console.log("[8/10] Distributing dividends to bondholders...");

  const distTx = await controller.distributeDividends(classId, nonceId);
  await distTx.wait();

  console.log("  Distributed " + ethers.formatEther(bondholderRevenue) + " BNB to bond class " + classId.toString());
  console.log();

  // ============================================================
  // Step 9: Investor claims dividends
  // ============================================================
  console.log("[9/10] Investor claiming dividends...");

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
  // Step 10: Print summary
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
  console.log("Total revenue earned: " + ethers.formatEther(revenueProfile.totalEarned) + " BNB (from " + revenueProfile.totalPayments.toString() + " b402 payments)");
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
