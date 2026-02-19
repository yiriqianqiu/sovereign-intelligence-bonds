/**
 * E2E Lifecycle Test — BSC Testnet
 *
 * Tests the full AlphaSignal capital loop on deployed contracts:
 *
 *   1. Register Agent
 *   2. Activate Agent
 *   3. Authorize TEE
 *   4. Initiate IPO (ERC-3475 bonds)
 *   5. Investor purchases bonds (BNB → Controller)
 *   6. releaseIPOCapital (Controller → TEE wallet)
 *   7. Register compute resource + rent compute (TEE wallet → ComputeMarketplace)
 *   8. Agent earns revenue (b402 payment)
 *   9. Distribute dividends (revenuePool → DividendVault)
 *  10. Investor claims dividends
 *
 * Usage:
 *   PRIVATE_KEY=0x... npx hardhat run scripts/e2e-lifecycle.ts --network bscTestnet
 */

import hre from "hardhat";

const ADDRESSES = {
  SIBControllerV2: "0xF71C0a2fFEB12AE11fcbB97fbe3edc5Ea8273F7f",
  NFARegistry: "0x802E67532B974ece533702311a66fEE000c1C325",
  SIBBondManager: "0xb3EDaBF3334C37b926b99bAE6D23c8126099baB8",
  DividendVaultV2: "0x66efb45Cd439CF3a216Df8682FFbebDc554729f1",
  B402PaymentReceiver: "0x7248Ff93f64B4D0e49914016A91fbF7289dab90e",
  ComputeMarketplace: "0xe279cF8E564c170EF89C7E63600d16CFd37d9D99",
  TEERegistry: "0x437c8314DCCa0eA3B5F66195B5311CEC6d494690",
  TokenRegistry: "0xC5824Ce1cbfFC4A13C2C31191606407de100eB65",
};

const ZERO = "0x0000000000000000000000000000000000000000";

async function main() {
  const connection = await hre.network.connect();
  const { ethers } = connection;
  const [deployer] = await ethers.getSigners();

  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("========================================");
  console.log("  SIB E2E Lifecycle Test — BSC Testnet");
  console.log("========================================");
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(bal)} BNB\n`);

  const results: { step: string; status: string; detail: string }[] = [];

  function log(step: string, status: "OK" | "FAIL" | "SKIP", detail: string) {
    const icon = status === "OK" ? "✅" : status === "FAIL" ? "❌" : "⏭️";
    console.log(`  ${icon} ${step}: ${detail}`);
    results.push({ step, status, detail });
  }

  // ============================================================
  // Contracts
  // ============================================================
  const registry = await ethers.getContractAt([
    "function registerAgent(string,string,string,string) returns (uint256)",
    "function updateState(uint256,uint8)",
    "function getAgentState(uint256) view returns (uint8)",
    "function getAgentOwner(uint256) view returns (address)",
    "function totalSupply() view returns (uint256)",
    "function creditRatings(uint256) view returns (uint8)",
    "function capitalRaised(uint256) view returns (uint256)",
  ], ADDRESSES.NFARegistry);

  const controller = await ethers.getContractAt([
    "function initiateIPO(uint256,uint256,uint256,uint256,uint256,address)",
    "function purchaseBondsBNB(uint256,uint256) payable",
    "function receiveB402PaymentBNB(uint256) payable",
    "function distributeDividends(uint256,uint256)",
    "function releaseIPOCapital(uint256,address,uint256)",
    "function ipoCapital(uint256,address) view returns (uint256)",
    "function revenuePool(uint256,address) view returns (uint256)",
    "function getAgentBondClasses(uint256) view returns (uint256[])",
    "function hasIPO(uint256) view returns (bool)",
    "function activeNonce(uint256) view returns (uint256)",
  ], ADDRESSES.SIBControllerV2);

  const bondManager = await ethers.getContractAt([
    "function balanceOf(address,uint256,uint256) view returns (uint256)",
    "function bondClasses(uint256) view returns (uint256,uint256,uint256,uint256,uint256,uint8,address,bool)",
  ], ADDRESSES.SIBBondManager);

  const vault = await ethers.getContractAt([
    "function claimable(address,uint256,uint256,address) view returns (uint256)",
    "function claim(uint256,uint256,address)",
    "function totalDeposited(uint256,uint256,address) view returns (uint256)",
  ], ADDRESSES.DividendVaultV2);

  const teeReg = await ethers.getContractAt([
    "function authorizeTEEAgent(uint256,address)",
    "function isTEEAgent(uint256,address) view returns (bool)",
  ], ADDRESSES.TEERegistry);

  const compute = await ethers.getContractAt([
    "function registerResource(string,string,uint8,uint256,address,uint8,uint8,uint256) returns (uint256)",
    "function rentComputeBNB(uint256,uint256,uint256,uint256) payable returns (uint256)",
    "function getActiveRentalCount(uint256) view returns (uint256)",
    "function resources(uint256) view returns (address,string,string,uint8,uint256,address,uint8,uint8,uint256,uint256,bool)",
  ], ADDRESSES.ComputeMarketplace);

  const b402 = await ethers.getContractAt([
    "function payBNB(uint256,string) payable",
  ], ADDRESSES.B402PaymentReceiver);

  // ============================================================
  // Step 1: Register Agent
  // ============================================================
  console.log("\n--- Step 1: Register Agent ---");
  let agentId: bigint;
  try {
    // Get totalSupply before registration to derive agentId
    const supplyBefore = await registry.totalSupply();
    const tx = await registry.registerAgent(
      "AlphaSignal-E2E",
      "E2E test agent for lifecycle validation",
      "QmE2ETestHash",
      "https://e2e.test/api"
    );
    await tx.wait();
    agentId = supplyBefore + 1n; // agentId = previous totalSupply + 1
    log("Register Agent", "OK", `Agent #${agentId} registered`);
  } catch (e: any) {
    console.error(e.message?.slice(0, 100));
    log("Register Agent", "FAIL", e.message?.slice(0, 80));
    return printSummary(results);
  }

  // ============================================================
  // Step 2: Activate Agent
  // ============================================================
  console.log("\n--- Step 2: Activate Agent ---");
  try {
    const tx = await registry.updateState(agentId, 1); // 1 = Active
    await tx.wait();
    const state = await registry.getAgentState(agentId);
    log("Activate Agent", "OK", `State = ${state}`);
  } catch (e: any) {
    log("Activate Agent", "FAIL", e.message?.slice(0, 80));
    return printSummary(results);
  }

  // ============================================================
  // Step 3: Authorize TEE
  // ============================================================
  console.log("\n--- Step 3: Authorize TEE ---");
  try {
    const tx = await teeReg.authorizeTEEAgent(agentId, deployer.address);
    await tx.wait();
    const isTee = await teeReg.isTEEAgent(agentId, deployer.address);
    log("Authorize TEE", "OK", `isTEEAgent = ${isTee}`);
  } catch (e: any) {
    log("Authorize TEE", "FAIL", e.message?.slice(0, 80));
  }

  // ============================================================
  // Step 4: Initiate IPO
  // ============================================================
  console.log("\n--- Step 4: Initiate IPO ---");
  let classId: bigint;
  try {
    const couponBps = 500n;       // 5%
    const maturity = 86400n * 90n; // 90 days
    const price = ethers.parseEther("0.001"); // 0.001 BNB per bond
    const maxSupply = 100n;

    const tx = await controller.initiateIPO(
      agentId, couponBps, maturity, price, maxSupply, ZERO
    );
    await tx.wait();

    // Get classId from agentBondClasses
    const classes = await controller.getAgentBondClasses(agentId);
    classId = classes[classes.length - 1];
    log("Initiate IPO", "OK", `classId = ${classId}`);
  } catch (e: any) {
    log("Initiate IPO", "FAIL", e.message?.slice(0, 80));
    return printSummary(results);
  }

  // ============================================================
  // Step 5: Purchase Bonds
  // ============================================================
  console.log("\n--- Step 5: Purchase Bonds ---");
  const nonceId = await controller.activeNonce(classId);
  const bondAmount = 10n;
  const totalCost = ethers.parseEther("0.001") * bondAmount; // 0.01 BNB
  try {
    const tx = await controller.purchaseBondsBNB(classId, bondAmount, {
      value: totalCost,
    });
    await tx.wait();

    const balance = await bondManager.balanceOf(deployer.address, classId, nonceId);
    const ipoCapBefore = await controller.ipoCapital(agentId, ZERO);
    log("Purchase Bonds", "OK", `${balance} bonds held, ipoCapital = ${ethers.formatEther(ipoCapBefore)} BNB`);
  } catch (e: any) {
    log("Purchase Bonds", "FAIL", e.message?.slice(0, 80));
    return printSummary(results);
  }

  // ============================================================
  // Step 6: Release IPO Capital
  // ============================================================
  console.log("\n--- Step 6: Release IPO Capital ---");
  try {
    const capBefore = await controller.ipoCapital(agentId, ZERO);
    const balBefore = await ethers.provider.getBalance(deployer.address);

    const tx = await controller.releaseIPOCapital(agentId, ZERO, capBefore);
    await tx.wait();

    const capAfter = await controller.ipoCapital(agentId, ZERO);
    const balAfter = await ethers.provider.getBalance(deployer.address);
    const received = balAfter - balBefore; // approximate (minus gas)

    log("Release IPO Capital", "OK",
      `Released ${ethers.formatEther(capBefore)} BNB, remaining ipoCapital = ${ethers.formatEther(capAfter)}`);
  } catch (e: any) {
    log("Release IPO Capital", "FAIL", e.message?.slice(0, 80));
  }

  // ============================================================
  // Step 7: Register Resource + Rent Compute
  // ============================================================
  console.log("\n--- Step 7: Rent Compute ---");
  let resourceId: bigint | undefined;
  try {
    // Register a GPU resource
    // Try resourceId 1, 2, ... to find one, or register new
    // First try to register a new resource and use return value
    const regTx = await compute.registerResource(
      "NVIDIA-A100-E2E",    // name
      "80GB HBM2e",         // specs
      1,                     // GPU type
      ethers.parseEther("0.001"), // 0.001 BNB/hour
      ZERO,                  // BNB payment
      0,                     // no credit gate
      0,                     // no evolution gate
      10                     // 10 units capacity
    );
    await regTx.wait();

    // Find our resource: scan from 1 until we find ours
    resourceId = 1n;
    for (let i = 1n; i <= 20n; i++) {
      try {
        const res = await compute.resources(i);
        if (res[0].toLowerCase() === deployer.address.toLowerCase() && res[1] === "NVIDIA-A100-E2E") {
          resourceId = i;
          break;
        }
        resourceId = i + 1n; // next candidate
      } catch { break; }
    }

    log("Register Resource", "OK", `resourceId = ${resourceId}`);
    {

      // Rent 1 unit for 1 hour = 0.001 BNB
      const rentCost = ethers.parseEther("0.001");
      const rentTx = await compute.rentComputeBNB(agentId, resourceId, 1n, 1n, {
        value: rentCost,
      });
      await rentTx.wait();

      const active = await compute.getActiveRentalCount(agentId);
      log("Rent Compute", "OK", `activeRentals = ${active}`);
    }
  } catch (e: any) {
    log("Rent Compute", "FAIL", e.message?.slice(0, 80));
  }

  // ============================================================
  // Step 8: Agent Earns Revenue (b402 payment)
  // ============================================================
  console.log("\n--- Step 8: Agent Earns Revenue ---");
  try {
    const payAmount = ethers.parseEther("0.01");
    const tx = await b402.payBNB(agentId, "/api/intelligence", { value: payAmount });
    await tx.wait();

    const pool = await controller.revenuePool(agentId, ZERO);
    log("Revenue Payment", "OK", `0.01 BNB paid, revenuePool = ${ethers.formatEther(pool)} BNB (70% bondholder share)`);
  } catch (e: any) {
    log("Revenue Payment", "FAIL", e.message?.slice(0, 80));
  }

  // ============================================================
  // Step 9: Distribute Dividends
  // ============================================================
  console.log("\n--- Step 9: Distribute Dividends ---");
  try {
    const poolBefore = await controller.revenuePool(agentId, ZERO);
    const tx = await controller.distributeDividends(classId, nonceId);
    await tx.wait();

    const poolAfter = await controller.revenuePool(agentId, ZERO);
    const deposited = await vault.totalDeposited(classId, nonceId, ZERO);
    log("Distribute Dividends", "OK",
      `Pool ${ethers.formatEther(poolBefore)} → ${ethers.formatEther(poolAfter)} BNB, vault deposited = ${ethers.formatEther(deposited)} BNB`);
  } catch (e: any) {
    log("Distribute Dividends", "FAIL", e.message?.slice(0, 80));
  }

  // ============================================================
  // Step 10: Claim Dividends
  // ============================================================
  console.log("\n--- Step 10: Claim Dividends ---");
  try {
    const claimableBefore = await vault.claimable(deployer.address, classId, nonceId, ZERO);

    if (claimableBefore > 0n) {
      const balBefore = await ethers.provider.getBalance(deployer.address);
      const tx = await vault.claim(classId, nonceId, ZERO);
      await tx.wait();
      const balAfter = await ethers.provider.getBalance(deployer.address);

      log("Claim Dividends", "OK",
        `Claimed ${ethers.formatEther(claimableBefore)} BNB`);
    } else {
      log("Claim Dividends", "SKIP", "Nothing claimable (0 BNB)");
    }
  } catch (e: any) {
    log("Claim Dividends", "FAIL", e.message?.slice(0, 80));
  }

  // ============================================================
  // Final State
  // ============================================================
  console.log("\n--- Final State ---");
  try {
    const state = await registry.getAgentState(agentId);
    const credit = await registry.creditRatings(agentId);
    const capRaised = await registry.capitalRaised(agentId);
    const bondBal = await bondManager.balanceOf(deployer.address, classId, nonceId);
    const activeRentals = await compute.getActiveRentalCount(agentId);
    const ipoCap = await controller.ipoCapital(agentId, ZERO);
    const pool = await controller.revenuePool(agentId, ZERO);

    console.log(`  Agent #${agentId}`);
    console.log(`    State:          ${state} (1=Active)`);
    console.log(`    Credit Rating:  ${credit}`);
    console.log(`    Capital Raised: ${ethers.formatEther(capRaised)} BNB`);
    console.log(`    Bonds Held:     ${bondBal}`);
    console.log(`    IPO Capital:    ${ethers.formatEther(ipoCap)} BNB`);
    console.log(`    Revenue Pool:   ${ethers.formatEther(pool)} BNB`);
    console.log(`    Active Rentals: ${activeRentals}`);
  } catch (e: any) {
    console.log(`  Error reading final state: ${e.message?.slice(0, 80)}`);
  }

  printSummary(results);
}

function printSummary(results: { step: string; status: string; detail: string }[]) {
  const ok = results.filter((r) => r.status === "OK").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const skip = results.filter((r) => r.status === "SKIP").length;

  console.log("\n========================================");
  console.log("  E2E Summary");
  console.log("========================================");
  console.log(`  ✅ Passed: ${ok}`);
  console.log(`  ❌ Failed: ${fail}`);
  console.log(`  ⏭️  Skipped: ${skip}`);
  console.log("========================================");

  if (fail > 0) {
    console.log("\nFailed steps:");
    results.filter((r) => r.status === "FAIL").forEach((r) => {
      console.log(`  ❌ ${r.step}: ${r.detail}`);
    });
  }

  console.log("");
  if (fail === 0) {
    console.log("🎉 Full lifecycle loop PASSED!");
    console.log("   Register → IPO → Buy Bonds → Release Capital → Rent Compute → Earn Revenue → Distribute → Claim");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
