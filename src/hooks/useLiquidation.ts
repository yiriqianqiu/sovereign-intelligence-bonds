"use client";

import { useReadContract } from "wagmi";
import { parseAbi } from "viem";
import { ADDRESSES } from "@/lib/contract-addresses";
import { LiquidationEngineABI } from "@/lib/contracts";

export interface LiquidationStatus {
  agentId: number;
  triggeredAt: number;
  gracePeriodEnd: number;
  executed: boolean;
  cancelled: boolean;
  isUnderLiquidation: boolean;
}

export function useLiquidationStatus(agentId: number | undefined) {
  const {
    data: liqData,
    isLoading: liqLoading,
    error: liqError,
  } = useReadContract({
    address: ADDRESSES.LiquidationEngine as `0x${string}`,
    abi: parseAbi(LiquidationEngineABI),
    functionName: "liquidations",
    args: agentId !== undefined ? [BigInt(agentId)] : undefined,
    query: { enabled: agentId !== undefined },
  });

  const {
    data: isUnderData,
    isLoading: isUnderLoading,
  } = useReadContract({
    address: ADDRESSES.LiquidationEngine as `0x${string}`,
    abi: parseAbi(LiquidationEngineABI),
    functionName: "isUnderLiquidation",
    args: agentId !== undefined ? [BigInt(agentId)] : undefined,
    query: { enabled: agentId !== undefined },
  });

  const status: LiquidationStatus | null = liqData
    ? (() => {
        const d = liqData as unknown as readonly [bigint, bigint, bigint, boolean, boolean];
        return {
          agentId: Number(d[0]),
          triggeredAt: Number(d[1]),
          gracePeriodEnd: Number(d[2]),
          executed: d[3],
          cancelled: d[4],
          isUnderLiquidation: Boolean(isUnderData),
        };
      })()
    : null;

  return {
    data: status,
    isLoading: liqLoading || isUnderLoading,
    error: liqError,
  };
}

export function useGracePeriod() {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.LiquidationEngine as `0x${string}`,
    abi: parseAbi(LiquidationEngineABI),
    functionName: "gracePeriod",
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}
