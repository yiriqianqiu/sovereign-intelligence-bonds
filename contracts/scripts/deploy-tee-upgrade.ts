/**
 * TEE Integration Upgrade: Deploy TEERegistry + redeploy modified contracts + rewire.
 *
 * What gets deployed:
 *   1. TEERegistry (new)
 *   2. SIBControllerV2 (redeploy - added TEE delegation)
 *   3. B402PaymentReceiver (redeploy - added relay restriction)
 *   4. GreenfieldDataVault (redeploy - added TEE support)
 *   5. ComputeMarketplace (redeploy - added TEE support)
 *
 * What stays unchanged:
 *   NFARegistry, SIBBondManager, DividendVaultV2, TokenRegistry, TranchingEngine,
 *   BondDEX, BondholderGovernor, LiquidationEngine, AutoCompoundVault, IndexBond,
 *   BondCollateralWrapper, Halo2Verifier
 *
 * Usage:
 *   PRIVATE_KEY=0x... npx hardhat run scripts/deploy-tee-upgrade.ts --network bscTestnet
 */

import hre from "hardhat";

// Existing deployed addresses (unchanged contracts)
const EXISTING = {
  Halo2Verifier: "0xad46573cEFE98dDcDB99e8c521fc094331B75f9d",
  TokenRegistry: "0xC5824Ce1cbfFC4A13C2C31191606407de100eB65",
  NFARegistry: "0x802E67532B974ece533702311a66fEE000c1C325",
  SIBBondManager: "0xb3EDaBF3334C37b926b99bAE6D23c8126099baB8",
  DividendVaultV2: "0x66efb45Cd439CF3a216Df8682FFbebDc554729f1",
  TranchingEngine: "0xf70901dA7D9FCDE6aAAF38CcE56D353fA37E0595",
  LiquidationEngine: "0xB0a1f8055bb7C276007ccc8E193719375D5b0418",
  BondDEX: "0xB881e50fD22020a1774CAC535f00A77493350271",
  BondholderGovernor: "0xdAe3DBC6e07d2C028D04aeCfe60084f4816b8135",
  AutoCompoundVault: "0xbD1506A35aD79f076cd035a8312448E50718ad13",
  IndexBond: "0x4ACDd6F2a9dB84ca5455529eC7F24b4BcC174F1f",
  BondCollateralWrapper: "0xaA1D9058A9970a8C00abF768eff21e2c0B86Cf7B",
};

async function main() {
  const connection = await hre.network.connect();
  const { ethers } = connection;
  const [deployer] = await ethers.getSigners();

  console.log("Deployer:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "BNB"
  );

  // ============================================================
  // Step 1: Deploy TEERegistry
  // ============================================================
  console.log("\n[1/5] Deploying TEERegistry...");
  const TEERegistry = await ethers.getContractFactory("TEERegistry");
  const teeRegistry = await TEERegistry.deploy(EXISTING.NFARegistry);
  await teeRegistry.waitForDeployment();
  const teeRegistryAddr = await teeRegistry.getAddress();
  console.log("  TEERegistry:", teeRegistryAddr);

  // ============================================================
  // Step 2: Redeploy SIBControllerV2
  // ============================================================
  console.log("\n[2/5] Deploying new SIBControllerV2 (with TEE delegation)...");
  const SIBControllerV2 = await ethers.getContractFactory("SIBControllerV2");
  const controller = await SIBControllerV2.deploy(
    EXISTING.NFARegistry,
    EXISTING.SIBBondManager,
    EXISTING.DividendVaultV2,
    EXISTING.Halo2Verifier,
    EXISTING.TokenRegistry
  );
  await controller.waitForDeployment();
  const controllerAddr = await controller.getAddress();
  console.log("  SIBControllerV2:", controllerAddr);

  // ============================================================
  // Step 3: Redeploy B402PaymentReceiver
  // ============================================================
  console.log("\n[3/5] Deploying new B402PaymentReceiver (with relay restriction)...");
  const B402 = await ethers.getContractFactory("B402PaymentReceiver");
  const b402 = await B402.deploy();
  await b402.waitForDeployment();
  const b402Addr = await b402.getAddress();
  console.log("  B402PaymentReceiver:", b402Addr);

  // ============================================================
  // Step 4: Redeploy GreenfieldDataVault
  // ============================================================
  console.log("\n[4/5] Deploying new GreenfieldDataVault (with TEE support)...");
  const Greenfield = await ethers.getContractFactory("GreenfieldDataVault");
  const greenfield = await Greenfield.deploy(EXISTING.NFARegistry);
  await greenfield.waitForDeployment();
  const greenfieldAddr = await greenfield.getAddress();
  console.log("  GreenfieldDataVault:", greenfieldAddr);

  // ============================================================
  // Step 5: Redeploy ComputeMarketplace
  // ============================================================
  console.log("\n[5/5] Deploying new ComputeMarketplace (with TEE support)...");
  const Compute = await ethers.getContractFactory("ComputeMarketplace");
  const compute = await Compute.deploy(EXISTING.NFARegistry, EXISTING.TokenRegistry);
  await compute.waitForDeployment();
  const computeAddr = await compute.getAddress();
  console.log("  ComputeMarketplace:", computeAddr);

  // ============================================================
  // Seed initial compute resource
  // ============================================================
  console.log("\nSeeding ComputeMarketplace with initial GPU resource...");
  const seedTx = await compute.registerResource(
    "NVIDIA-A100-80GB",       // name
    "80GB HBM2e, 312 TFLOPS", // specs
    1,                         // GPU type
    ethers.parseEther("0.001"), // 0.001 BNB/hour
    ethers.ZeroAddress,        // BNB payment
    0,                         // no credit gate
    0,                         // no evolution gate
    10                         // 10 units capacity
  );
  await seedTx.wait();
  console.log("  Registered resource #1: NVIDIA-A100-80GB (0.001 BNB/hr, 10 units)");

  // ============================================================
  // Rewire: Set controllers and TEE registries
  // ============================================================
  console.log("\n--- Rewiring permissions ---");

  const setControllerABI = ["function setController(address) external"];
  const setTEERegistryABI = ["function setTEERegistry(address) external"];

  // Controller config
  console.log("[wire 1/11] SIBControllerV2.setTEERegistry...");
  let tx = await controller.setTEERegistry(teeRegistryAddr);
  await tx.wait();

  console.log("[wire 2/11] SIBControllerV2.setTranchingEngine...");
  tx = await controller.setTranchingEngine(EXISTING.TranchingEngine);
  await tx.wait();

  // NFARegistry -> new controller
  console.log("[wire 3/11] NFARegistry.setController...");
  const registry = await ethers.getContractAt(setControllerABI, EXISTING.NFARegistry);
  tx = await registry.setController(controllerAddr);
  await tx.wait();

  // SIBBondManager -> new controller
  console.log("[wire 4/11] SIBBondManager.setController...");
  const bondMgr = await ethers.getContractAt(setControllerABI, EXISTING.SIBBondManager);
  tx = await bondMgr.setController(controllerAddr);
  await tx.wait();

  // DividendVaultV2 -> new controller
  console.log("[wire 5/11] DividendVaultV2.setController...");
  const vault = await ethers.getContractAt(setControllerABI, EXISTING.DividendVaultV2);
  tx = await vault.setController(controllerAddr);
  await tx.wait();

  // B402 -> new controller
  console.log("[wire 6/11] B402PaymentReceiver.setController...");
  tx = await b402.setController(controllerAddr);
  await tx.wait();

  // TranchingEngine -> new controller
  console.log("[wire 7/11] TranchingEngine.setController...");
  const tranching = await ethers.getContractAt(setControllerABI, EXISTING.TranchingEngine);
  tx = await tranching.setController(controllerAddr);
  await tx.wait();

  // LiquidationEngine -> new controller
  console.log("[wire 8/11] LiquidationEngine.setController...");
  const liquidation = await ethers.getContractAt(setControllerABI, EXISTING.LiquidationEngine);
  tx = await liquidation.setController(controllerAddr);
  await tx.wait();

  // GreenfieldDataVault.setTEERegistry
  console.log("[wire 9/10] GreenfieldDataVault.setTEERegistry...");
  const gfVault = await ethers.getContractAt(setTEERegistryABI, greenfieldAddr);
  tx = await gfVault.setTEERegistry(teeRegistryAddr);
  await tx.wait();

  // ComputeMarketplace.setTEERegistry
  console.log("[wire 10/10] ComputeMarketplace.setTEERegistry...");
  const computeMkt = await ethers.getContractAt(setTEERegistryABI, computeAddr);
  tx = await computeMkt.setTEERegistry(teeRegistryAddr);
  await tx.wait();

  // ============================================================
  // Summary
  // ============================================================
  console.log("\n========================================");
  console.log("TEE UPGRADE DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("\nNew contracts:");
  console.log("  TEERegistry:            ", teeRegistryAddr);
  console.log("  SIBControllerV2:        ", controllerAddr);
  console.log("  B402PaymentReceiver:  ", b402Addr);
  console.log("  GreenfieldDataVault:    ", greenfieldAddr);
  console.log("  ComputeMarketplace:     ", computeAddr);
  console.log("\nUnchanged contracts:");
  console.log("  NFARegistry:            ", EXISTING.NFARegistry);
  console.log("  SIBBondManager:         ", EXISTING.SIBBondManager);
  console.log("  DividendVaultV2:        ", EXISTING.DividendVaultV2);
  console.log("  Halo2Verifier:          ", EXISTING.Halo2Verifier);
  console.log("  TokenRegistry:          ", EXISTING.TokenRegistry);
  console.log("  TranchingEngine:        ", EXISTING.TranchingEngine);
  console.log("  BondDEX:                ", EXISTING.BondDEX);
  console.log("  LiquidationEngine:      ", EXISTING.LiquidationEngine);
  console.log("\nUpdate contract-addresses.ts with the new addresses above.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
