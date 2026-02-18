"use client";

import { useReadContract } from "wagmi";
import { parseAbi, formatEther } from "viem";
import { ADDRESSES } from "@/lib/contract-addresses";
import { TranchingEngineABI } from "@/lib/contracts";

export interface TrancheGroup {
  groupId: number;
  agentId: number;
  seniorClassId: number;
  juniorClassId: number;
  seniorCouponBps: number;
  juniorCouponBps: number;
  paymentToken: `0x${string}`;
  exists: boolean;
}

export function useTrancheGroup(groupId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.TranchingEngine as `0x${string}`,
    abi: parseAbi(TranchingEngineABI),
    functionName: "trancheGroups",
    args: groupId !== undefined ? [BigInt(groupId)] : undefined,
    query: { enabled: groupId !== undefined },
  });

  const group: TrancheGroup | null = data
    ? (() => {
        const d = data as unknown as {
          agentId: bigint;
          seniorClassId: bigint;
          juniorClassId: bigint;
          seniorCouponBps: bigint;
          juniorCouponBps: bigint;
          paymentToken: `0x${string}`;
          exists: boolean;
        };
        return {
          groupId: groupId!,
          agentId: Number(d.agentId),
          seniorClassId: Number(d.seniorClassId),
          juniorClassId: Number(d.juniorClassId),
          seniorCouponBps: Number(d.seniorCouponBps),
          juniorCouponBps: Number(d.juniorCouponBps),
          paymentToken: d.paymentToken,
          exists: d.exists,
        };
      })()
    : null;

  return { data: group, isLoading, error, refetch };
}

export function useIsTranchedClass(classId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.TranchingEngine as `0x${string}`,
    abi: parseAbi(TranchingEngineABI),
    functionName: "isTranchedClass",
    args: classId !== undefined ? [BigInt(classId)] : undefined,
    query: { enabled: classId !== undefined },
  });

  return { data: data as boolean | undefined, isLoading, error, refetch };
}

export function useCounterpartClass(classId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.TranchingEngine as `0x${string}`,
    abi: parseAbi(TranchingEngineABI),
    functionName: "getCounterpartClass",
    args: classId !== undefined ? [BigInt(classId)] : undefined,
    query: { enabled: classId !== undefined },
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}

export function useGroupCount() {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.TranchingEngine as `0x${string}`,
    abi: parseAbi(TranchingEngineABI),
    functionName: "getGroupCount",
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}

export function useSeniorEntitlement(
  groupId: number | undefined,
  nonceId: number | undefined,
  timeDelta: number | undefined,
) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.TranchingEngine as `0x${string}`,
    abi: parseAbi(TranchingEngineABI),
    functionName: "calculateSeniorEntitlement",
    args:
      groupId !== undefined && nonceId !== undefined && timeDelta !== undefined
        ? [BigInt(groupId), BigInt(nonceId), BigInt(timeDelta)]
        : undefined,
    query: {
      enabled: groupId !== undefined && nonceId !== undefined && timeDelta !== undefined,
    },
  });

  return {
    data: data !== undefined ? formatEther(data as bigint) : undefined,
    isLoading,
    error,
    refetch,
  };
}
