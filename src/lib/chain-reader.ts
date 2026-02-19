import { createPublicClient, http, formatEther, parseAbi } from "viem";
import { bscTestnet } from "viem/chains";
import { ADDRESSES } from "./contract-addresses";
import { NFARegistryABI, SIBBondManagerABI } from "./contracts";

export const publicClient = createPublicClient({
  chain: bscTestnet,
  transport: http("https://data-seed-prebsc-1-s1.bnbchain.org:8545"),
});

export async function getAgentCount(): Promise<number> {
  const total = await publicClient.readContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: parseAbi(NFARegistryABI),
    functionName: "totalSupply",
  });
  return Number(total);
}

export interface AgentData {
  id: number;
  name: string;
  description: string;
  modelHash: string;
  endpoint: string;
  registeredAt: number;
  state: number;
  owner: string;
  totalEarned: string;
  totalPayments: number;
  sharpeRatio: string;
  creditRating: number;
}

export async function getAgentData(agentId: bigint): Promise<AgentData> {
  const [metadata, state, owner, revenue, rating] = await Promise.all([
    publicClient.readContract({
      address: ADDRESSES.NFARegistry as `0x${string}`,
      abi: parseAbi(NFARegistryABI),
      functionName: "getAgentMetadata",
      args: [agentId],
    }),
    publicClient.readContract({
      address: ADDRESSES.NFARegistry as `0x${string}`,
      abi: parseAbi(NFARegistryABI),
      functionName: "getAgentState",
      args: [agentId],
    }),
    publicClient.readContract({
      address: ADDRESSES.NFARegistry as `0x${string}`,
      abi: parseAbi(NFARegistryABI),
      functionName: "getAgentOwner",
      args: [agentId],
    }),
    publicClient.readContract({
      address: ADDRESSES.NFARegistry as `0x${string}`,
      abi: parseAbi(NFARegistryABI),
      functionName: "getRevenueProfile",
      args: [agentId],
    }),
    publicClient.readContract({
      address: ADDRESSES.NFARegistry as `0x${string}`,
      abi: parseAbi(NFARegistryABI),
      functionName: "creditRatings",
      args: [agentId],
    }),
  ]);

  const md = metadata as unknown as readonly [string, string, string, string, bigint];
  const rev = revenue as unknown as readonly [bigint, bigint, bigint, bigint, `0x${string}`];

  return {
    id: Number(agentId),
    name: md[0],
    description: md[1],
    modelHash: md[2],
    endpoint: md[3],
    registeredAt: Number(md[4]),
    state: Number(state),
    owner: owner as string,
    totalEarned: formatEther(rev[0]),
    totalPayments: Number(rev[1]),
    sharpeRatio: formatEther(rev[3]),
    creditRating: Number(rating),
  };
}

export interface BondClassData {
  classId: number;
  agentId: number;
  couponRateBps: number;
  maturityPeriod: number;
  sharpeRatioAtIssue: string;
  maxSupply: number;
  exists: boolean;
}

export async function getBondClassData(classId: bigint): Promise<BondClassData> {
  const result = await publicClient.readContract({
    address: ADDRESSES.SIBBondManager as `0x${string}`,
    abi: parseAbi(SIBBondManagerABI),
    functionName: "bondClasses",
    args: [classId],
  });

  const data = result as [bigint, bigint, bigint, bigint, bigint, boolean];
  return {
    classId: Number(classId),
    agentId: Number(data[0]),
    couponRateBps: Number(data[1]),
    maturityPeriod: Number(data[2]),
    sharpeRatioAtIssue: formatEther(data[3]),
    maxSupply: Number(data[4]),
    exists: data[5],
  };
}
