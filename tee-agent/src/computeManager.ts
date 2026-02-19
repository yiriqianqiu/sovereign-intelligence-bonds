import { parseAbi, formatEther } from "viem";
import { config } from "./config.js";
import { publicClient, getWalletClient } from "./chain.js";
import { ComputeMarketplaceABI } from "./abis.js";

const LOG_PREFIX = "[compute]";

export interface ComputeStatus {
  hasCompute: boolean;
  activeRentals: number;
}

/**
 * Phase 2.5: Capital Deployment -- Buy DePIN GPU Compute
 *
 * After IPO raises capital, the TEE agent autonomously
 * purchases GPU compute from the ComputeMarketplace.
 * This is the critical missing link: capital -> compute -> revenue.
 */
export async function deployCapitalToCompute(agentId: number): Promise<string | null> {
  const bigAgentId = BigInt(agentId);
  const resourceId = BigInt(config.computeResourceId);

  try {
    // 1. Check if agent already has active rentals
    const existing = await getComputeStatus(agentId);
    if (existing.activeRentals > 0) {
      console.log(`${LOG_PREFIX} Agent #${agentId} already has ${existing.activeRentals} active rental(s), skipping`);
      return null;
    }

    // 2. Check eligibility for the target resource
    let eligible = false;
    try {
      eligible = await publicClient.readContract({
        address: config.computeMarketplaceAddress,
        abi: parseAbi(ComputeMarketplaceABI),
        functionName: "isEligible",
        args: [bigAgentId, resourceId],
      }) as boolean;
    } catch {
      console.log(`${LOG_PREFIX} Could not check eligibility, attempting rental anyway`);
      eligible = true;
    }

    if (!eligible) {
      console.log(`${LOG_PREFIX} Agent #${agentId} not eligible for resource #${config.computeResourceId} (credit rating too low?)`);
      return null;
    }

    // 3. Read resource details to calculate cost
    let resourceName = `Resource #${config.computeResourceId}`;
    let pricePerHour = 0n;
    try {
      const resource = await publicClient.readContract({
        address: config.computeMarketplaceAddress,
        abi: parseAbi(ComputeMarketplaceABI),
        functionName: "resources",
        args: [resourceId],
      }) as readonly [string, string, string, number, bigint, string, number, number, bigint, bigint, boolean];

      resourceName = resource[1];
      pricePerHour = resource[4];

      if (!resource[10]) {
        console.log(`${LOG_PREFIX} Resource #${config.computeResourceId} is not active`);
        return null;
      }
    } catch {
      console.log(`${LOG_PREFIX} Could not read resource details, attempting rental with default params`);
    }

    const units = BigInt(config.computeRentalUnits);
    const hours = BigInt(config.computeRentalHours);
    const totalCost = pricePerHour * units * hours;

    console.log(`${LOG_PREFIX} Renting compute: ${resourceName}`);
    console.log(`${LOG_PREFIX}   Resource ID: ${config.computeResourceId}`);
    console.log(`${LOG_PREFIX}   Units: ${config.computeRentalUnits}`);
    console.log(`${LOG_PREFIX}   Duration: ${config.computeRentalHours}h`);
    console.log(`${LOG_PREFIX}   Estimated cost: ${formatEther(totalCost)} BNB`);

    // 4. Execute rental
    const walletClient = await getWalletClient();
    const txHash = await walletClient.writeContract({
      address: config.computeMarketplaceAddress,
      abi: parseAbi(ComputeMarketplaceABI),
      functionName: "rentComputeBNB",
      args: [bigAgentId, resourceId, units, hours],
      value: totalCost,
    });

    console.log(`${LOG_PREFIX} Rental tx: ${txHash}`);
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`${LOG_PREFIX} === Capital deployed: ${resourceName} rented for ${config.computeRentalHours}h ===`);

    return txHash;
  } catch (error) {
    console.error(`${LOG_PREFIX} Capital deployment failed:`, error);
    return null;
  }
}

/**
 * Get current compute status for an agent
 */
export async function getComputeStatus(agentId: number): Promise<ComputeStatus> {
  const bigAgentId = BigInt(agentId);

  let activeRentals = 0;
  try {
    const count = await publicClient.readContract({
      address: config.computeMarketplaceAddress,
      abi: parseAbi(ComputeMarketplaceABI),
      functionName: "getActiveRentalCount",
      args: [bigAgentId],
    }) as bigint;
    activeRentals = Number(count);
  } catch {
    // contract may not support this function or agent has no rentals
  }

  return {
    hasCompute: activeRentals > 0,
    activeRentals,
  };
}
