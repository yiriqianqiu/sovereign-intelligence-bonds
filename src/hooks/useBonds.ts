"use client";

import { useReadContract } from "wagmi";
import { parseAbi, formatEther } from "viem";
import { ADDRESSES } from "@/lib/contract-addresses";
import { SIBBondManagerV2ABI, SIBControllerV2ABI } from "@/lib/contracts";

export interface BondClass {
  classId: number;
  agentId: number;
  couponRateBps: number;
  maturityPeriod: number;
  sharpeRatioAtIssue: string;
  maxSupply: number;
  tranche: number;
  paymentToken: string;
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
    abi: parseAbi(SIBBondManagerV2ABI),
    functionName: "bondClasses",
    args: classId !== undefined ? [BigInt(classId)] : undefined,
    query: { enabled: classId !== undefined },
  });

  const bondClass: BondClass | null = data
    ? (() => {
        const d = data as unknown as readonly [bigint, bigint, bigint, bigint, bigint, number, string, boolean];
        return {
          classId: classId!,
          agentId: Number(d[0]),
          couponRateBps: Number(d[1]),
          maturityPeriod: Number(d[2]),
          sharpeRatioAtIssue: formatEther(d[3]),
          maxSupply: Number(d[4]),
          tranche: Number(d[5]),
          paymentToken: d[6] as string,
          exists: d[7],
        };
      })()
    : null;

  return { data: bondClass, isLoading, error, refetch };
}

export function useBondNonce(classId: number | undefined, nonceId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.SIBBondManager as `0x${string}`,
    abi: parseAbi(SIBBondManagerV2ABI),
    functionName: "bondNonces",
    args:
      classId !== undefined && nonceId !== undefined
        ? [BigInt(classId), BigInt(nonceId)]
        : undefined,
    query: { enabled: classId !== undefined && nonceId !== undefined },
  });

  const nonce: BondNonce | null = data
    ? (() => {
        const d = data as unknown as readonly [bigint, bigint, bigint, bigint, boolean, boolean];
        return {
          issueTimestamp: Number(d[0]),
          maturityTimestamp: Number(d[1]),
          totalIssued: Number(d[2]),
          pricePerBond: formatEther(d[3]),
          redeemable: d[4],
          exists: d[5],
        };
      })()
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
    abi: parseAbi(SIBBondManagerV2ABI),
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
    abi: parseAbi(SIBBondManagerV2ABI),
    functionName: "totalSupply",
    args:
      classId !== undefined && nonceId !== undefined
        ? [BigInt(classId), BigInt(nonceId)]
        : undefined,
    query: { enabled: classId !== undefined && nonceId !== undefined },
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}
