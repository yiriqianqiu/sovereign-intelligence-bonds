/**
 * Deploy real EZKL SharpeVerifier and update SIBControllerV2.
 *
 * Usage:
 *   PRIVATE_KEY=0x... npx hardhat run scripts/deploy-real-verifier.ts --network bscTestnet
 */

import hre from "hardhat";

const CONTROLLER_ADDRESS = "0x340f0C9FF74d9534b0189974b9A569700D90bC72";

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

  // Deploy real Halo2Verifier (SharpeVerifier)
  console.log("\n[1/2] Deploying real Halo2Verifier (EZKL SharpeVerifier)...");
  const Verifier = await ethers.getContractFactory("Halo2Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddr = await verifier.getAddress();
  console.log("  Halo2Verifier deployed:", verifierAddr);

  // Update SIBControllerV2 to use real verifier
  console.log("\n[2/2] Updating SIBControllerV2.setVerifier()...");
  const controller = await ethers.getContractAt(
    ["function setVerifier(address) external"],
    CONTROLLER_ADDRESS
  );
  const tx = await controller.setVerifier(verifierAddr);
  await tx.wait();
  console.log("  Controller updated to use real verifier");

  console.log("\n--- Summary ---");
  console.log("Real Halo2Verifier:", verifierAddr);
  console.log(
    "SIBControllerV2:",
    CONTROLLER_ADDRESS,
    "(now using real verifier)"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
