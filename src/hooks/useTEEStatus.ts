"use client";

import { useReadContract } from "wagmi";
import { parseAbi } from "viem";
import { ADDRESSES } from "@/lib/contract-addresses";

const TEERegistryABI = parseAbi([
  "function getTEEStatus(uint256 agentId) view returns (address, bytes32, uint256, bool)",
  "function authorizedTEEAgent(uint256 agentId) view returns (address)",
]);

export function useTEEStatus(agentId: bigint | undefined) {
  const { data: statusData, isLoading, refetch } = useReadContract({
    address: ADDRESSES.TEERegistry as `0x${string}`,
    abi: TEERegistryABI,
    functionName: "getTEEStatus",
    args: agentId !== undefined ? [agentId] : undefined,
    query: {
      enabled: agentId !== undefined && (ADDRESSES.TEERegistry as string) !== "0x0000000000000000000000000000000000000000",
    },
  });

  const teeWallet = statusData?.[0] as `0x${string}` | undefined;
  const quoteHash = statusData?.[1] as `0x${string}` | undefined;
  const attestedAt = statusData?.[2] as bigint | undefined;
  const isActive = statusData?.[3] as boolean | undefined;

  return {
    teeWallet,
    quoteHash,
    attestedAt,
    isActive: isActive ?? false,
    isLoading,
    refetch,
  };
}
