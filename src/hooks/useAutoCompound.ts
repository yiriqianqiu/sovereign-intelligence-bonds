"use client";

import { useReadContract, useAccount } from "wagmi";
import { parseAbi } from "viem";
import { ADDRESSES } from "@/lib/contract-addresses";
import { AutoCompoundVaultABI } from "@/lib/contracts";

export function useVaultBalance(classId: number | undefined, nonceId: number | undefined) {
  const { address } = useAccount();

  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.AutoCompoundVault as `0x${string}`,
    abi: parseAbi(AutoCompoundVaultABI),
    functionName: "balanceOf",
    args:
      address && classId !== undefined && nonceId !== undefined
        ? [address, BigInt(classId), BigInt(nonceId)]
        : undefined,
    query: { enabled: !!address && classId !== undefined && nonceId !== undefined },
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}

export function useVaultTotalDeposits(classId: number | undefined, nonceId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.AutoCompoundVault as `0x${string}`,
    abi: parseAbi(AutoCompoundVaultABI),
    functionName: "totalDeposits",
    args:
      classId !== undefined && nonceId !== undefined
        ? [BigInt(classId), BigInt(nonceId)]
        : undefined,
    query: { enabled: classId !== undefined && nonceId !== undefined },
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}
