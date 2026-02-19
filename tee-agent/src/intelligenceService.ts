import { parseAbi, formatEther } from "viem";
import { publicClient } from "./chain.js";
import { config } from "./config.js";
import { NFARegistryABI, SIBControllerV2ABI, B402ReceiverABI } from "./abis.js";
import { getComputeStatus } from "./computeManager.js";

const LOG_PREFIX = "[intelligence]";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export interface IntelligenceReport {
  agentId: number;
  timestamp: string;
  teeVerified: boolean;
  agent: {
    name: string;
    active: boolean;
    creditScore: number;
    owner: string | null;
  };
  revenue: {
    totalRevenue: string;
    verifiedRevenue: string;
  };
  bondMarket: {
    bondClassCount: number;
    bondClasses: string[];
    revenuePoolBnb: string;
  };
  compute: {
    hasCompute: boolean;
    activeRentals: number;
  };
  risk: {
    grade: string;
    creditScore: number;
    description: string;
  };
  warnings: string[];
}

function computeRiskGrade(score: number): { grade: string; description: string } {
  if (score >= 800) return { grade: "A", description: "Excellent - Strong revenue history and high reliability" };
  if (score >= 650) return { grade: "B", description: "Good - Consistent performance with moderate risk" };
  if (score >= 500) return { grade: "C", description: "Fair - Limited track record or inconsistent revenue" };
  if (score >= 300) return { grade: "D", description: "Poor - High risk with limited revenue data" };
  return { grade: "F", description: "Very High Risk - Insufficient data or critical issues" };
}

export async function generatePreviewReport(agentId: number): Promise<Pick<IntelligenceReport, "agentId" | "timestamp" | "teeVerified" | "agent" | "risk" | "warnings">> {
  const warnings: string[] = [];
  let creditScore = 0;
  let name = "Unknown";
  let active = false;

  try {
    const [metadata, state, score] = await Promise.all([
      publicClient.readContract({
        address: config.nfaRegistryAddress,
        abi: parseAbi(NFARegistryABI),
        functionName: "getAgentMetadata",
        args: [BigInt(agentId)],
      }) as Promise<readonly [string, string, string, string, bigint]>,
      publicClient.readContract({
        address: config.nfaRegistryAddress,
        abi: parseAbi(NFARegistryABI),
        functionName: "getAgentState",
        args: [BigInt(agentId)],
      }) as Promise<number>,
      publicClient.readContract({
        address: config.nfaRegistryAddress,
        abi: parseAbi(NFARegistryABI),
        functionName: "getCreditScore",
        args: [BigInt(agentId)],
      }) as Promise<bigint>,
    ]);

    name = metadata[0];
    active = Number(state) === 1;
    creditScore = Number(score);
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to read agent data:`, err);
    warnings.push("Could not read agent data from NFARegistry");
  }

  const riskInfo = computeRiskGrade(creditScore);

  return {
    agentId,
    timestamp: new Date().toISOString(),
    teeVerified: true,
    agent: {
      name,
      active,
      creditScore,
      owner: null,
    },
    risk: {
      grade: riskInfo.grade,
      creditScore,
      description: riskInfo.description,
    },
    warnings,
  };
}

export async function generateFullReport(agentId: number): Promise<IntelligenceReport> {
  const warnings: string[] = [];
  const bigAgentId = BigInt(agentId);

  let name = "Unknown";
  let active = false;
  let creditScore = 0;
  let owner: string | null = null;

  try {
    const [metadata, state, score, agentOwner] = await Promise.all([
      publicClient.readContract({
        address: config.nfaRegistryAddress,
        abi: parseAbi(NFARegistryABI),
        functionName: "getAgentMetadata",
        args: [bigAgentId],
      }) as Promise<readonly [string, string, string, string, bigint]>,
      publicClient.readContract({
        address: config.nfaRegistryAddress,
        abi: parseAbi(NFARegistryABI),
        functionName: "getAgentState",
        args: [bigAgentId],
      }) as Promise<number>,
      publicClient.readContract({
        address: config.nfaRegistryAddress,
        abi: parseAbi(NFARegistryABI),
        functionName: "getCreditScore",
        args: [bigAgentId],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: config.nfaRegistryAddress,
        abi: parseAbi(NFARegistryABI),
        functionName: "getAgentOwner",
        args: [bigAgentId],
      }) as Promise<string>,
    ]);

    name = metadata[0];
    active = Number(state) === 1;
    creditScore = Number(score);
    owner = agentOwner !== ZERO_ADDRESS ? agentOwner : null;
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to read agent data:`, err);
    warnings.push("Could not read agent data from NFARegistry");
  }

  // Read TEE-verified revenue
  let verifiedRevenue = 0n;
  try {
    verifiedRevenue = await publicClient.readContract({
      address: config.b402ReceiverAddress,
      abi: parseAbi(B402ReceiverABI),
      functionName: "verifiedRevenue",
      args: [bigAgentId],
    }) as bigint;
  } catch {
    warnings.push("Could not read verified revenue from B402");
  }

  // Read total payments
  let totalRevenue = 0n;
  try {
    totalRevenue = await publicClient.readContract({
      address: config.b402ReceiverAddress,
      abi: parseAbi(B402ReceiverABI),
      functionName: "agentTotalPayments",
      args: [bigAgentId, ZERO_ADDRESS],
    }) as bigint;
  } catch {
    // skip
  }

  // Read bond market data
  let bondClasses: bigint[] = [];
  let revenuePoolBnb = 0n;

  try {
    bondClasses = await publicClient.readContract({
      address: config.sibControllerAddress,
      abi: parseAbi(SIBControllerV2ABI),
      functionName: "getAgentBondClasses",
      args: [bigAgentId],
    }) as bigint[];
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to read bond classes:`, err);
    warnings.push("Could not read bond classes from SIBControllerV2");
  }

  try {
    revenuePoolBnb = await publicClient.readContract({
      address: config.sibControllerAddress,
      abi: parseAbi(SIBControllerV2ABI),
      functionName: "revenuePool",
      args: [bigAgentId, ZERO_ADDRESS],
    }) as bigint;
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to read revenue pool:`, err);
    warnings.push("Could not read revenue pool balance");
  }

  const riskInfo = computeRiskGrade(creditScore);

  // Read compute status
  const computeInfo = await getComputeStatus(agentId);

  return {
    agentId,
    timestamp: new Date().toISOString(),
    teeVerified: true,
    agent: {
      name,
      active,
      creditScore,
      owner,
    },
    revenue: {
      totalRevenue: formatEther(totalRevenue),
      verifiedRevenue: formatEther(verifiedRevenue),
    },
    bondMarket: {
      bondClassCount: bondClasses.length,
      bondClasses: bondClasses.map((c) => c.toString()),
      revenuePoolBnb: formatEther(revenuePoolBnb),
    },
    compute: computeInfo,
    risk: {
      grade: riskInfo.grade,
      creditScore,
      description: riskInfo.description,
    },
    warnings,
  };
}
