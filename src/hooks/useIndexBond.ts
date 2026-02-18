"use client";

import { useReadContract, useAccount } from "wagmi";
import { parseAbi } from "viem";
import { ADDRESSES } from "@/lib/contract-addresses";
import { IndexBondABI } from "@/lib/contracts";

export interface BondIndex {
  indexId: number;
  name: string;
  classIds: number[];
  weights: number[];
  nonceIds: number[];
  active: boolean;
}

export function useIndex(indexId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.IndexBond as `0x${string}`,
    abi: parseAbi(IndexBondABI),
    functionName: "getIndex",
    args: indexId !== undefined ? [BigInt(indexId)] : undefined,
    query: { enabled: indexId !== undefined },
  });

  const index: BondIndex | null = data
    ? (() => {
        const d = data as [string, bigint[], bigint[], bigint[], boolean];
        return {
          indexId: indexId!,
          name: d[0],
          classIds: d[1].map(Number),
          weights: d[2].map(Number),
          nonceIds: d[3].map(Number),
          active: d[4],
        };
      })()
    : null;

  return { data: index, isLoading, error, refetch };
}

export function useIndexCount() {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.IndexBond as `0x${string}`,
    abi: parseAbi(IndexBondABI),
    functionName: "getIndexCount",
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}

export function useUserShares(indexId: number | undefined) {
  const { address } = useAccount();

  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.IndexBond as `0x${string}`,
    abi: parseAbi(IndexBondABI),
    functionName: "userShares",
    args:
      address && indexId !== undefined ? [address, BigInt(indexId)] : undefined,
    query: { enabled: !!address && indexId !== undefined },
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}

export function useTotalShares(indexId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.IndexBond as `0x${string}`,
    abi: parseAbi(IndexBondABI),
    functionName: "totalShares",
    args: indexId !== undefined ? [BigInt(indexId)] : undefined,
    query: { enabled: indexId !== undefined },
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}
