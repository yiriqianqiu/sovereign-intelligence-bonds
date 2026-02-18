import { parseAbi, formatEther } from "viem";
import { publicClient } from "./chain.js";
import { config } from "./config.js";
import { NFARegistryABI, SIBControllerV2ABI } from "./abis.js";

const LOG_PREFIX = "[intelligence]";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export interface IntelligenceReport {
  agentId: number;
  timestamp: string;
  agent: {
    name: string;
    active: boolean;
    creditScore: number;
    owner: string | null;
  };
  revenue: {
    totalRevenue: string;
    avgMonthlyRevenue: string;
    revenueCount: number;
  };
  bondMarket: {
    bondClassCount: number;
    bondClasses: string[];
    revenuePoolBnb: string;
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

export async function generatePreviewReport(agentId: number): Promise<Pick<IntelligenceReport, "agentId" | "timestamp" | "agent" | "risk" | "warnings">> {
  const warnings: string[] = [];
  let creditScore = 0;
  let name = "Unknown";
  let active = false;

  try {
    const agentData = await publicClient.readContract({
      address: config.nfaRegistryAddress,
      abi: parseAbi(NFARegistryABI),
      functionName: "agents",
      args: [BigInt(agentId)],
    }) as [string, string, string, bigint, boolean, string, bigint, bigint, bigint, bigint, string];

    name = agentData[0];
    active = agentData[4];
    creditScore = Number(agentData[9]);
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to read agent data:`, err);
    warnings.push("Could not read agent data from NFARegistry");
  }

  const riskInfo = computeRiskGrade(creditScore);

  return {
    agentId,
    timestamp: new Date().toISOString(),
    agent: {
      name,
      active,
      creditScore,
      owner: null, // omitted in preview
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

  // Read agent data from NFARegistry
  let name = "Unknown";
  let active = false;
  let creditScore = 0;
  let owner: string | null = null;
  let totalRevenue = 0n;
  let avgMonthlyRevenue = 0n;
  let revenueCount = 0n;

  try {
    const [agentData, agentOwner] = await Promise.all([
      publicClient.readContract({
        address: config.nfaRegistryAddress,
        abi: parseAbi(NFARegistryABI),
        functionName: "agents",
        args: [bigAgentId],
      }) as Promise<[string, string, string, bigint, boolean, string, bigint, bigint, bigint, bigint, string]>,
      publicClient.readContract({
        address: config.nfaRegistryAddress,
        abi: parseAbi(NFARegistryABI),
        functionName: "getAgentOwner",
        args: [bigAgentId],
      }) as Promise<string>,
    ]);

    name = agentData[0];
    active = agentData[4];
    totalRevenue = agentData[6];
    avgMonthlyRevenue = agentData[7];
    revenueCount = agentData[8];
    creditScore = Number(agentData[9]);
    owner = agentOwner !== ZERO_ADDRESS ? agentOwner : null;
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to read agent data:`, err);
    warnings.push("Could not read agent data from NFARegistry");
  }

  // Read bond market data from SIBControllerV2
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
      args: [bigAgentId, ZERO_ADDRESS], // native BNB uses zero address
    }) as bigint;
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to read revenue pool:`, err);
    warnings.push("Could not read revenue pool balance from SIBControllerV2");
  }

  const riskInfo = computeRiskGrade(creditScore);

  return {
    agentId,
    timestamp: new Date().toISOString(),
    agent: {
      name,
      active,
      creditScore,
      owner,
    },
    revenue: {
      totalRevenue: formatEther(totalRevenue),
      avgMonthlyRevenue: formatEther(avgMonthlyRevenue),
      revenueCount: Number(revenueCount),
    },
    bondMarket: {
      bondClassCount: bondClasses.length,
      bondClasses: bondClasses.map((c) => c.toString()),
      revenuePoolBnb: formatEther(revenuePoolBnb),
    },
    risk: {
      grade: riskInfo.grade,
      creditScore,
      description: riskInfo.description,
    },
    warnings,
  };
}
