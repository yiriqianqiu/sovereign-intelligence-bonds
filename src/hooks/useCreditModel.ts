"use client";

import { useReadContract } from "wagmi";
import { parseAbi, formatEther } from "viem";
import { ADDRESSES } from "@/lib/contract-addresses";
import { NFARegistryV2ABI } from "@/lib/contracts";

export interface CreditScore {
  score: number;
  rating: number;
}

export interface CreditFactors {
  sharpeRatio: string;
  revenueStability: string;
  paymentFrequency: string;
  agentAge: string;
  totalRevenue: string;
}

const RATING_LABELS = ["Unrated", "C", "B", "A", "AA", "AAA"] as const;

export function creditRatingLabel(rating: number): string {
  return RATING_LABELS[rating] ?? RATING_LABELS[0];
}

export function useCreditScore(agentId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: parseAbi(NFARegistryV2ABI),
    functionName: "calculateCreditScore",
    args: agentId !== undefined ? [BigInt(agentId)] : undefined,
    query: { enabled: agentId !== undefined },
  });

  const score: CreditScore | null = data
    ? (() => {
        const d = data as unknown as readonly [bigint, number];
        return {
          score: Number(d[0]),
          rating: d[1],
        };
      })()
    : null;

  return { data: score, isLoading, error, refetch };
}

export function useMonthlyRevenue(agentId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: parseAbi(NFARegistryV2ABI),
    functionName: "getMonthlyRevenue",
    args: agentId !== undefined ? [BigInt(agentId)] : undefined,
    query: { enabled: agentId !== undefined },
  });

  const monthly: number[] | null = data
    ? ([...(data as unknown as readonly bigint[])]).map((v) => Number(formatEther(v)))
    : null;

  return { data: monthly, isLoading, error, refetch };
}

export function useCreditFactors(agentId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: parseAbi(NFARegistryV2ABI),
    functionName: "creditFactors",
    args: agentId !== undefined ? [BigInt(agentId)] : undefined,
    query: { enabled: agentId !== undefined },
  });

  const factors: CreditFactors | null = data
    ? (() => {
        const d = data as unknown as readonly [bigint, bigint, bigint, bigint, bigint];
        return {
          sharpeRatio: formatEther(d[0]),
          revenueStability: formatEther(d[1]),
          paymentFrequency: formatEther(d[2]),
          agentAge: formatEther(d[3]),
          totalRevenue: formatEther(d[4]),
        };
      })()
    : null;

  return { data: factors, isLoading, error, refetch };
}
