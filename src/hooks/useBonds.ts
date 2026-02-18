"use client";

import { useReadContract } from "wagmi";
import { parseAbi, formatEther } from "viem";
import { ADDRESSES } from "@/lib/contract-addresses";
import { SIBBondManagerABI, SIBControllerV2ABI } from "@/lib/contracts";

export interface BondClass {
  classId: number;
  agentId: number;
  couponRateBps: number;
  maturityPeriod: number;
  sharpeRatioAtIssue: string;
  maxSupply: number;
  exists: boolean;
}

export interface BondNonce {
  issueTimestamp: number;
  maturityTimestamp: number;
  totalIssued: number;
  pricePerBond: string;
  redeemable: boolean;
  exists: boolean;
}

export function useBondClass(classId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.SIBBondManager as `0x${string}`,
    abi: parseAbi(SIBBondManagerABI),
    functionName: "bondClasses",
    args: classId !== undefined ? [BigInt(classId)] : undefined,
    query: { enabled: classId !== undefined },
  });

  const bondClass: BondClass | null = data
    ? {
        classId: classId!,
        agentId: Number((data as bigint[])[0]),
        couponRateBps: Number((data as bigint[])[1]),
        maturityPeriod: Number((data as bigint[])[2]),
        sharpeRatioAtIssue: formatEther((data as bigint[])[3]),
        maxSupply: Number((data as bigint[])[4]),
        exists: (data as boolean[])[5] as unknown as boolean,
      }
    : null;

  return { data: bondClass, isLoading, error, refetch };
}

export function useBondNonce(classId: number | undefined, nonceId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.SIBBondManager as `0x${string}`,
    abi: parseAbi(SIBBondManagerABI),
    functionName: "bondNonces",
    args:
      classId !== undefined && nonceId !== undefined
        ? [BigInt(classId), BigInt(nonceId)]
        : undefined,
    query: { enabled: classId !== undefined && nonceId !== undefined },
  });

  const nonce: BondNonce | null = data
    ? {
        issueTimestamp: Number((data as bigint[])[0]),
        maturityTimestamp: Number((data as bigint[])[1]),
        totalIssued: Number((data as bigint[])[2]),
        pricePerBond: formatEther((data as bigint[])[3]),
        redeemable: (data as boolean[])[4] as unknown as boolean,
        exists: (data as boolean[])[5] as unknown as boolean,
      }
    : null;

  return { data: nonce, isLoading, error, refetch };
}

export function useActiveNonce(classId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.SIBControllerV2 as `0x${string}`,
    abi: parseAbi(SIBControllerV2ABI),
    functionName: "activeNonce",
    args: classId !== undefined ? [BigInt(classId)] : undefined,
    query: { enabled: classId !== undefined },
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}

export function useBondBalance(account: `0x${string}` | undefined, classId: number | undefined, nonceId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.SIBBondManager as `0x${string}`,
    abi: parseAbi(SIBBondManagerABI),
    functionName: "balanceOf",
    args:
      account && classId !== undefined && nonceId !== undefined
        ? [account, BigInt(classId), BigInt(nonceId)]
        : undefined,
    query: { enabled: !!account && classId !== undefined && nonceId !== undefined },
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}

export function useBondTotalSupply(classId: number | undefined, nonceId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.SIBBondManager as `0x${string}`,
    abi: parseAbi(SIBBondManagerABI),
    functionName: "totalSupply",
    args:
      classId !== undefined && nonceId !== undefined
        ? [BigInt(classId), BigInt(nonceId)]
        : undefined,
    query: { enabled: classId !== undefined && nonceId !== undefined },
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}
