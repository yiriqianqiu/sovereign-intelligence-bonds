/**
 * SIB Deploy Script: Deploy all contracts to BSC Testnet.
 *
 * Usage:
 *   PRIVATE_KEY=0x... npx hardhat run scripts/deploy.ts --network bscTestnet
 *
 * Deploy order (respects dependencies):
 *   1. MockVerifier (or real SharpeVerifier)
 *   2. NFARegistry
 *   3. SIBBondManager
 *   4. DividendVault (needs BondManager address)
 *   5. SIBController (needs all above)
 *   6. X402PaymentReceiver (needs Controller address)
 *   7. Wire permissions (setController on Registry, BondManager, Vault)
 */

import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const connection = await hre.network.connect();
  const { ethers } = connection;
  const [deployer] = await ethers.getSigners();

  console.log("Deploying SIB contracts...");
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "BNB"
  );
  console.log("---");

  // 1. MockVerifier
  console.log("[1/6] Deploying MockVerifier...");
  const MockVerifier = await ethers.getContractFactory("MockVerifier");
  const verifier = await MockVerifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddr = await verifier.getAddress();
  console.log("  MockVerifier:", verifierAddr);

  // 2. NFARegistry
  console.log("[2/6] Deploying NFARegistry...");
  const NFARegistry = await ethers.getContractFactory("NFARegistry");
  const registry = await NFARegistry.deploy();
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("  NFARegistry:", registryAddr);

  // 3. SIBBondManager
  console.log("[3/6] Deploying SIBBondManager...");
  const SIBBondManager = await ethers.getContractFactory("SIBBondManager");
  const bondManager = await SIBBondManager.deploy();
  await bondManager.waitForDeployment();
  const bondManagerAddr = await bondManager.getAddress();
  console.log("  SIBBondManager:", bondManagerAddr);

  // 4. DividendVault
  console.log("[4/6] Deploying DividendVault...");
  const DividendVault = await ethers.getContractFactory("DividendVault");
  const vault = await DividendVault.deploy();
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("  DividendVault:", vaultAddr);

  // 5. SIBController
  console.log("[5/6] Deploying SIBController...");
  const SIBController = await ethers.getContractFactory("SIBController");
  const controller = await SIBController.deploy(
    registryAddr,
    bondManagerAddr,
    vaultAddr,
    verifierAddr
  );
  await controller.waitForDeployment();
  const controllerAddr = await controller.getAddress();
  console.log("  SIBController:", controllerAddr);

  // 6. X402PaymentReceiver
  console.log("[6/6] Deploying X402PaymentReceiver...");
  const X402PaymentReceiver = await ethers.getContractFactory(
    "X402PaymentReceiver"
  );
  const x402 = await X402PaymentReceiver.deploy();
  await x402.waitForDeployment();
  const x402Addr = await x402.getAddress();
  console.log("  X402PaymentReceiver:", x402Addr);

  // Wire permissions
  console.log("\nWiring permissions...");
  const tx1 = await registry.setController(controllerAddr);
  await tx1.wait();
  console.log("  NFARegistry.setController -> done");

  const tx2 = await bondManager.setController(controllerAddr);
  await tx2.wait();
  console.log("  SIBBondManager.setController -> done");

  const tx3 = await vault.setController(controllerAddr);
  await tx3.wait();
  console.log("  DividendVault.setController -> done");

  const tx4 = await bondManager.setDividendVault(vaultAddr);
  await tx4.wait();
  console.log("  SIBBondManager.setDividendVault -> done");

  const tx5 = await vault.setBondManager(bondManagerAddr);
  await tx5.wait();
  console.log("  DividendVault.setBondManager -> done");

  const tx6 = await x402.setController(controllerAddr);
  await tx6.wait();
  console.log("  X402PaymentReceiver.setController -> done");

  // Summary
  const addresses = {
    MockVerifier: verifierAddr,
    NFARegistry: registryAddr,
    SIBBondManager: bondManagerAddr,
    DividendVault: vaultAddr,
    SIBController: controllerAddr,
    X402PaymentReceiver: x402Addr,
    deployer: deployer.address,
    network: "bscTestnet",
    chainId: 97,
    timestamp: new Date().toISOString(),
  };

  console.log("\n=== Deployment Complete ===");
  console.log(JSON.stringify(addresses, null, 2));

  // Write bsc.address file
  const bscAddressPath = path.join(__dirname, "..", "..", "bsc.address");
  const bscContent = Object.entries(addresses)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  fs.writeFileSync(bscAddressPath, bscContent + "\n");
  console.log(`\nAddresses written to ${bscAddressPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
