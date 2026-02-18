/**
 * Fix remaining rewiring after deploy-tee-upgrade.ts failed at BondDEX.setController
 * (BondDEX has no setController function - it was incorrectly included).
 *
 * Remaining steps: GreenfieldDataVault.setTEERegistry + ComputeMarketplace.setTEERegistry
 */

import hre from "hardhat";

const NEW_ADDRESSES = {
  TEERegistry: "0x29212A3E489236B56Ea4e383da78b6d2EF347Cf3",
  GreenfieldDataVault: "0x553e9ADF83df29aE84f9C1b4FA1505567cf421Cd",
  ComputeMarketplace: "0x22bEa0382eb3295d2028bB9d5767DE73f52c2F5e",
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

  const setTEERegistryABI = ["function setTEERegistry(address) external"];

  // GreenfieldDataVault.setTEERegistry
  console.log("\n[1/2] GreenfieldDataVault.setTEERegistry...");
  const gfVault = await ethers.getContractAt(setTEERegistryABI, NEW_ADDRESSES.GreenfieldDataVault);
  let tx = await gfVault.setTEERegistry(NEW_ADDRESSES.TEERegistry);
  await tx.wait();
  console.log("  done");

  // ComputeMarketplace.setTEERegistry
  console.log("[2/2] ComputeMarketplace.setTEERegistry...");
  const computeMkt = await ethers.getContractAt(setTEERegistryABI, NEW_ADDRESSES.ComputeMarketplace);
  tx = await computeMkt.setTEERegistry(NEW_ADDRESSES.TEERegistry);
  await tx.wait();
  console.log("  done");

  console.log("\nAll remaining wires complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
