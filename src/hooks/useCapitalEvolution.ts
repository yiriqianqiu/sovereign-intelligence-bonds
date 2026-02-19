"use client";

import { useReadContract } from "wagmi";
import { parseAbi, formatEther } from "viem";
import { ADDRESSES } from "@/lib/contract-addresses";
import { NFARegistryV2ABI } from "@/lib/contracts";

const EvolutionLabels = ["Unregistered", "Seed", "Angel", "Series A", "Series B", "Unicorn"] as const;

export function useEvolutionLevel(agentId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: parseAbi(NFARegistryV2ABI),
    functionName: "getEvolutionLevel",
    args: agentId !== undefined ? [BigInt(agentId)] : undefined,
    query: { enabled: agentId !== undefined },
  });

  const level = data !== undefined ? Number(data) : undefined;
  return {
    data: level,
    label: level !== undefined ? EvolutionLabels[level] ?? "Unknown" : undefined,
    isLoading,
    error,
    refetch,
  };
}

export function useMerkleRoot(agentId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: parseAbi(NFARegistryV2ABI),
    functionName: "getMerkleRoot",
    args: agentId !== undefined ? [BigInt(agentId)] : undefined,
    query: { enabled: agentId !== undefined },
  });

  return {
    data: data as `0x${string}` | undefined,
    isLoading,
    error,
    refetch,
  };
}

export function useCapitalRaised(agentId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: parseAbi(NFARegistryV2ABI),
    functionName: "getCapitalRaised",
    args: agentId !== undefined ? [BigInt(agentId)] : undefined,
    query: { enabled: agentId !== undefined },
  });

  return {
    data: data !== undefined ? formatEther(data as bigint) : undefined,
    raw: data as bigint | undefined,
    isLoading,
    error,
    refetch,
  };
}

export function useMilestoneThresholds() {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: parseAbi(NFARegistryV2ABI),
    functionName: "getMilestoneThresholds",
  });

  const thresholds = data
    ? ([...(data as unknown as readonly bigint[])] as bigint[]).map((t, i) => ({
        level: i + 1,
        label: EvolutionLabels[i + 1],
        threshold: formatEther(t),
        thresholdRaw: t,
      }))
    : undefined;

  return { data: thresholds, isLoading, error, refetch };
}
