"use client";

import { useReadContract } from "wagmi";
import { parseAbi, formatEther } from "viem";
import { ADDRESSES } from "@/lib/contract-addresses";
import { NFARegistryABI, SIBControllerV2ABI } from "@/lib/contracts";

const CREDIT_LABELS = ["Unrated", "C", "B", "A", "AA", "AAA"];

export function creditRatingLabel(rating: number): string {
  return CREDIT_LABELS[rating] || "Unrated";
}

export interface RevenueProfile {
  totalEarned: string;
  totalPayments: number;
  lastPaymentTime: number;
  sharpeRatio: string;
  sharpeProofHash: string;
}

export function useAgentRevenue(agentId: number | undefined) {
  const {
    data: revenueData,
    isLoading: revenueLoading,
    error: revenueError,
    refetch: refetchRevenue,
  } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: parseAbi(NFARegistryABI),
    functionName: "getRevenueProfile",
    args: agentId !== undefined ? [BigInt(agentId)] : undefined,
    query: { enabled: agentId !== undefined },
  });

  const {
    data: ratingData,
    isLoading: ratingLoading,
    error: ratingError,
    refetch: refetchRating,
  } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: parseAbi(NFARegistryABI),
    functionName: "creditRatings",
    args: agentId !== undefined ? [BigInt(agentId)] : undefined,
    query: { enabled: agentId !== undefined },
  });

  const {
    data: hasIPOData,
    isLoading: ipoLoading,
  } = useReadContract({
    address: ADDRESSES.SIBControllerV2 as `0x${string}`,
    abi: parseAbi(SIBControllerV2ABI),
    functionName: "hasIPO",
    args: agentId !== undefined ? [BigInt(agentId)] : undefined,
    query: { enabled: agentId !== undefined },
  });

  const {
    data: revenuePoolData,
  } = useReadContract({
    address: ADDRESSES.SIBControllerV2 as `0x${string}`,
    abi: parseAbi(SIBControllerV2ABI),
    functionName: "revenuePool",
    args: agentId !== undefined ? [BigInt(agentId), "0x0000000000000000000000000000000000000000" as `0x${string}`] : undefined,
    query: { enabled: agentId !== undefined },
  });

  const revenue: RevenueProfile | null = revenueData
    ? (() => {
        const d = revenueData as unknown as readonly [bigint, bigint, bigint, bigint, `0x${string}`];
        return {
          totalEarned: formatEther(d[0]),
          totalPayments: Number(d[1]),
          lastPaymentTime: Number(d[2]),
          sharpeRatio: formatEther(d[3]),
          sharpeProofHash: d[4],
        };
      })()
    : null;

  const creditRating = ratingData !== undefined ? Number(ratingData) : undefined;
  const hasIPO = hasIPOData !== undefined ? Boolean(hasIPOData) : undefined;
  const revenuePool = revenuePoolData !== undefined ? formatEther(revenuePoolData as bigint) : undefined;

  return {
    data: revenue,
    creditRating,
    hasIPO,
    revenuePool,
    isLoading: revenueLoading || ratingLoading || ipoLoading,
    error: revenueError || ratingError,
    refetch: () => {
      refetchRevenue();
      refetchRating();
    },
  };
}

export function useAgentMetadata(agentId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: parseAbi(NFARegistryABI),
    functionName: "getAgentMetadata",
    args: agentId !== undefined ? [BigInt(agentId)] : undefined,
    query: { enabled: agentId !== undefined },
  });

  const metadata = data
    ? (() => {
        const d = data as unknown as readonly [string, string, string, string, bigint];
        return {
          name: d[0],
          description: d[1],
          modelHash: d[2],
          endpoint: d[3],
          registeredAt: Number(d[4]),
        };
      })()
    : null;

  return { data: metadata, isLoading, error, refetch };
}

export function useAgentTotalSupply() {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: parseAbi(NFARegistryABI),
    functionName: "totalSupply",
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}
