/**
 * Seed ComputeMarketplace with initial GPU resources.
 *
 * Run this once after deployment to register compute resources
 * so TEE agents can rent GPU via deployCapitalToCompute().
 *
 * Usage:
 *   PRIVATE_KEY=0x... npx hardhat run scripts/seed-compute.ts --network bscTestnet
 */

import hre from "hardhat";

const ADDRESSES = {
  ComputeMarketplace: "0xe279cF8E564c170EF89C7E63600d16CFd37d9D99",
};

async function main() {
  const connection = await hre.network.connect();
  const { ethers } = connection;
  const [deployer] = await ethers.getSigners();

  console.log("Seeding ComputeMarketplace with GPU resources...");
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "BNB"
  );

  const compute = await ethers.getContractAt(
    [
      "function registerResource(string,string,uint8,uint256,address,uint8,uint8,uint256) returns (uint256)",
      "function resources(uint256) view returns (address,string,string,uint8,uint256,address,uint8,uint8,uint256,uint256,bool)",
    ],
    ADDRESSES.ComputeMarketplace
  );

  // Check if resource #1 already exists
  try {
    const res = await compute.resources(1);
    if (res[0] !== ethers.ZeroAddress) {
      console.log(`\nResource #1 already exists: "${res[1]}" by ${res[0]}`);
      console.log("Skipping seed -- marketplace already has resources.");
      return;
    }
  } catch {
    // No resource exists yet, proceed
  }

  // Register GPU resource #1: NVIDIA A100
  console.log("\n[1/2] Registering NVIDIA-A100-80GB...");
  const tx1 = await compute.registerResource(
    "NVIDIA-A100-80GB",         // name
    "80GB HBM2e, 312 TFLOPS",  // specs
    1,                           // GPU type
    ethers.parseEther("0.001"), // 0.001 BNB/hour
    ethers.ZeroAddress,          // BNB payment
    0,                           // no credit gate (any agent)
    0,                           // no evolution gate
    10                           // 10 units capacity
  );
  await tx1.wait();
  console.log("  Registered resource #1: NVIDIA-A100-80GB (0.001 BNB/hr, 10 units, no gate)");

  // Register GPU resource #2: NVIDIA H100 (credit-gated)
  console.log("[2/2] Registering NVIDIA-H100-80GB (credit-gated)...");
  const tx2 = await compute.registerResource(
    "NVIDIA-H100-80GB",         // name
    "80GB HBM3, 990 TFLOPS",   // specs
    1,                           // GPU type
    ethers.parseEther("0.005"), // 0.005 BNB/hour
    ethers.ZeroAddress,          // BNB payment
    3,                           // min credit A
    0,                           // no evolution gate
    5                            // 5 units capacity
  );
  await tx2.wait();
  console.log("  Registered resource #2: NVIDIA-H100-80GB (0.005 BNB/hr, 5 units, min credit A)");

  console.log("\nComputeMarketplace seeded. TEE agents can now rent GPU compute.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
