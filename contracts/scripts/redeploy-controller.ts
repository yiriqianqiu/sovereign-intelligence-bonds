/**
 * Redeploy SIBControllerV2 (with hasIPO) and rewire all dependencies.
 */

import hre from "hardhat";

// Existing deployed addresses
const ADDRESSES = {
  Halo2Verifier: "0xad46573cEFE98dDcDB99e8c521fc094331B75f9d",
  TokenRegistry: "0xC5824Ce1cbfFC4A13C2C31191606407de100eB65",
  NFARegistry: "0x802E67532B974ece533702311a66fEE000c1C325",
  SIBBondManager: "0xb3EDaBF3334C37b926b99bAE6D23c8126099baB8",
  DividendVaultV2: "0x66efb45Cd439CF3a216Df8682FFbebDc554729f1",
  TranchingEngine: "0xf70901dA7D9FCDE6aAAF38CcE56D353fA37E0595",
  B402PaymentReceiver: "0xde369D0E9dcac61748d148c562f0C76E8c1b4E99",
  LiquidationEngine: "0xB0a1f8055bb7C276007ccc8E193719375D5b0418",
  BondDEX: "0xB881e50fD22020a1774CAC535f00A77493350271",
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

  // 1. Deploy new SIBControllerV2
  console.log("\n[1/6] Deploying new SIBControllerV2 (with hasIPO)...");
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

  // 2. Update NFARegistry.setController
  console.log("\n[2/6] NFARegistry.setController...");
  const registry = await ethers.getContractAt(
    ["function setController(address) external"],
    ADDRESSES.NFARegistry
  );
  let tx = await registry.setController(controllerAddr);
  await tx.wait();
  console.log("  done");

  // 3. Update SIBBondManager.setController
  console.log("[3/6] SIBBondManager.setController...");
  const bondMgr = await ethers.getContractAt(
    ["function setController(address) external"],
    ADDRESSES.SIBBondManager
  );
  tx = await bondMgr.setController(controllerAddr);
  await tx.wait();
  console.log("  done");

  // 4. Update DividendVaultV2.setController
  console.log("[4/6] DividendVaultV2.setController...");
  const vault = await ethers.getContractAt(
    ["function setController(address) external"],
    ADDRESSES.DividendVaultV2
  );
  tx = await vault.setController(controllerAddr);
  await tx.wait();
  console.log("  done");

  // 5. Update B402PaymentReceiver.setController
  console.log("[5/6] B402PaymentReceiver.setController...");
  const b402 = await ethers.getContractAt(
    ["function setController(address) external"],
    ADDRESSES.B402PaymentReceiver
  );
  tx = await b402.setController(controllerAddr);
  await tx.wait();
  console.log("  done");

  // 6. Update BondDEX.setController
  console.log("[6/6] BondDEX.setController...");
  const dex = await ethers.getContractAt(
    ["function setController(address) external"],
    ADDRESSES.BondDEX
  );
  tx = await dex.setController(controllerAddr);
  await tx.wait();
  console.log("  done");

  console.log("\n--- Summary ---");
  console.log("New SIBControllerV2:", controllerAddr);
  console.log("All dependencies rewired.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
