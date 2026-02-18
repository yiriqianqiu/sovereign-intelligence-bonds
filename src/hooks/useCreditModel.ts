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
        const d = data as unknown as { score: bigint; rating: number };
        return {
          score: Number(d.score),
          rating: d.rating,
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
    ? (data as bigint[]).map((v) => Number(formatEther(v)))
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
        const d = data as unknown as {
          sharpeRatio: bigint;
          revenueStability: bigint;
          paymentFrequency: bigint;
          agentAge: bigint;
          totalRevenue: bigint;
        };
        return {
          sharpeRatio: formatEther(d.sharpeRatio),
          revenueStability: formatEther(d.revenueStability),
          paymentFrequency: formatEther(d.paymentFrequency),
          agentAge: formatEther(d.agentAge),
          totalRevenue: formatEther(d.totalRevenue),
        };
      })()
    : null;

  return { data: factors, isLoading, error, refetch };
}
