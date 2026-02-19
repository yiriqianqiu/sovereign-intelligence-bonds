/**
 * Redeploy SIBControllerV2 (with releaseIPOCapital) and rewire all dependencies.
 *
 * Only 1 contract redeployed. All other 17 contracts stay at their existing addresses.
 *
 * Usage:
 *   npx hardhat run scripts/redeploy-controller.ts --network bscTestnet
 */

import hre from "hardhat";

// Existing deployed addresses (unchanged)
const ADDRESSES = {
  Halo2Verifier: "0xad46573cEFE98dDcDB99e8c521fc094331B75f9d",
  TokenRegistry: "0xC5824Ce1cbfFC4A13C2C31191606407de100eB65",
  NFARegistry: "0x802E67532B974ece533702311a66fEE000c1C325",
  SIBBondManager: "0xb3EDaBF3334C37b926b99bAE6D23c8126099baB8",
  DividendVaultV2: "0x66efb45Cd439CF3a216Df8682FFbebDc554729f1",
  TranchingEngine: "0xf70901dA7D9FCDE6aAAF38CcE56D353fA37E0595",
  B402PaymentReceiver: "0x7248Ff93f64B4D0e49914016A91fbF7289dab90e",
  LiquidationEngine: "0xB0a1f8055bb7C276007ccc8E193719375D5b0418",
  BondDEX: "0xB881e50fD22020a1774CAC535f00A77493350271",
  TEERegistry: "0x437c8314DCCa0eA3B5F66195B5311CEC6d494690",
};

const SET_CONTROLLER_ABI = ["function setController(address) external"];

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

  // 1. Deploy new SIBControllerV2
  console.log("\n[1/9] Deploying new SIBControllerV2 (with releaseIPOCapital)...");
  const SIBControllerV2 = await ethers.getContractFactory("SIBControllerV2");
  const controller = await SIBControllerV2.deploy(
    ADDRESSES.NFARegistry,
    ADDRESSES.SIBBondManager,
    ADDRESSES.DividendVaultV2,
    ADDRESSES.Halo2Verifier,
    ADDRESSES.TokenRegistry
  );
  await controller.waitForDeployment();
  const controllerAddr = await controller.getAddress();
  console.log("  SIBControllerV2:", controllerAddr);

  // 2. NFARegistry.setController
  console.log("[2/9] NFARegistry.setController...");
  const registry = await ethers.getContractAt(SET_CONTROLLER_ABI, ADDRESSES.NFARegistry);
  let tx = await registry.setController(controllerAddr);
  await tx.wait();
  console.log("  done");

  // 3. SIBBondManager.setController
  console.log("[3/9] SIBBondManager.setController...");
  const bondMgr = await ethers.getContractAt(SET_CONTROLLER_ABI, ADDRESSES.SIBBondManager);
  tx = await bondMgr.setController(controllerAddr);
  await tx.wait();
  console.log("  done");

  // 4. DividendVaultV2.setController
  console.log("[4/9] DividendVaultV2.setController...");
  const vault = await ethers.getContractAt(SET_CONTROLLER_ABI, ADDRESSES.DividendVaultV2);
  tx = await vault.setController(controllerAddr);
  await tx.wait();
  console.log("  done");

  // 5. TranchingEngine.setController
  console.log("[5/9] TranchingEngine.setController...");
  const tranching = await ethers.getContractAt(SET_CONTROLLER_ABI, ADDRESSES.TranchingEngine);
  tx = await tranching.setController(controllerAddr);
  await tx.wait();
  console.log("  done");

  // 6. B402PaymentReceiver.setController
  console.log("[6/9] B402PaymentReceiver.setController...");
  const b402 = await ethers.getContractAt(SET_CONTROLLER_ABI, ADDRESSES.B402PaymentReceiver);
  tx = await b402.setController(controllerAddr);
  await tx.wait();
  console.log("  done");

  // 7. LiquidationEngine.setController
  console.log("[7/9] LiquidationEngine.setController...");
  const liquidation = await ethers.getContractAt(SET_CONTROLLER_ABI, ADDRESSES.LiquidationEngine);
  tx = await liquidation.setController(controllerAddr);
  await tx.wait();
  console.log("  done");

  // 8. BondDEX.setController
  console.log("[8/9] BondDEX.setController...");
  const dex = await ethers.getContractAt(SET_CONTROLLER_ABI, ADDRESSES.BondDEX);
  tx = await dex.setController(controllerAddr);
  await tx.wait();
  console.log("  done");

  // 9. SIBControllerV2.setTranchingEngine + setTEERegistry
  console.log("[9/9] SIBControllerV2 post-deploy config...");
  tx = await controller.setTranchingEngine(ADDRESSES.TranchingEngine);
  await tx.wait();
  console.log("  setTranchingEngine done");
  tx = await controller.setTEERegistry(ADDRESSES.TEERegistry);
  await tx.wait();
  console.log("  setTEERegistry done");

  console.log("\n========================================");
  console.log("  Redeployment Complete");
  console.log("========================================");
  console.log("New SIBControllerV2:", controllerAddr);
  console.log("\nUpdate these files with the new address:");
  console.log("  - src/lib/contract-addresses.ts");
  console.log("  - tee-agent/src/config.ts");
  console.log("  - bsc.address");
  console.log("========================================");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
