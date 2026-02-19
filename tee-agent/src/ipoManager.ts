import { parseAbi, parseEther, zeroAddress } from "viem";
import { config } from "./config.js";
import { publicClient, getWalletClient } from "./chain.js";
import { SIBControllerV2ABI } from "./abis.js";

const LOG_PREFIX = "[ipo]";

/**
 * Phase 2: Fundraising Period -- zkML-driven machine IPO
 *
 * After self-registration and Sharpe proof submission,
 * the TEE agent autonomously issues ERC-3475 bonds
 * to raise capital for compute + data acquisition.
 */

export interface IPOConfig {
  couponRateBps: number;    // e.g. 500 = 5% APY
  maturityDays: number;     // e.g. 90 days
  pricePerBondBnb: string;  // e.g. "0.01"
  maxSupply: number;        // e.g. 100 bonds
}

const DEFAULT_IPO: IPOConfig = {
  couponRateBps: 500,       // 5% APY
  maturityDays: 90,         // 3 months
  pricePerBondBnb: "0.01",  // 0.01 BNB per bond
  maxSupply: 100,           // 100 bonds available
};

export async function initiateIPO(
  agentId: number,
  ipoConfig: IPOConfig = DEFAULT_IPO
): Promise<string | null> {
  try {
    // Check if agent already has an IPO
    const hasIPO = await publicClient.readContract({
      address: config.sibControllerAddress,
      abi: parseAbi(SIBControllerV2ABI),
      functionName: "hasIPO",
      args: [BigInt(agentId)],
    }) as boolean;

    if (hasIPO) {
      console.log(`${LOG_PREFIX} Agent #${agentId} already has an IPO, skipping`);
      return null;
    }

    console.log(`${LOG_PREFIX} Initiating IPO for agent #${agentId}`);
    console.log(`${LOG_PREFIX}   Coupon: ${ipoConfig.couponRateBps / 100}% APY`);
    console.log(`${LOG_PREFIX}   Maturity: ${ipoConfig.maturityDays} days`);
    console.log(`${LOG_PREFIX}   Price: ${ipoConfig.pricePerBondBnb} BNB`);
    console.log(`${LOG_PREFIX}   Supply: ${ipoConfig.maxSupply} bonds`);

    const walletClient = await getWalletClient();
    const maturitySeconds = BigInt(ipoConfig.maturityDays) * 86400n;

    const txHash = await walletClient.writeContract({
      address: config.sibControllerAddress,
      abi: parseAbi(SIBControllerV2ABI),
      functionName: "initiateIPO",
      args: [
        BigInt(agentId),
        BigInt(ipoConfig.couponRateBps),
        maturitySeconds,
        parseEther(ipoConfig.pricePerBondBnb),
        BigInt(ipoConfig.maxSupply),
        zeroAddress, // BNB as payment token
      ],
    });

    console.log(`${LOG_PREFIX} IPO tx: ${txHash}`);
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`${LOG_PREFIX} === Phase 2 Complete: Agent #${agentId} IPO launched ===`);

    return txHash;
  } catch (error) {
    console.error(`${LOG_PREFIX} IPO initiation failed:`, error);
    return null;
  }
}

export async function getAgentBondClasses(agentId: number): Promise<bigint[]> {
  try {
    return await publicClient.readContract({
      address: config.sibControllerAddress,
      abi: parseAbi(SIBControllerV2ABI),
      functionName: "getAgentBondClasses",
      args: [BigInt(agentId)],
    }) as bigint[];
  } catch {
    return [];
  }
}
