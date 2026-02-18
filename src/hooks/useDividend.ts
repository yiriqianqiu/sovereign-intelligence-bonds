"use client";

import { useReadContract, useAccount } from "wagmi";
import { parseAbi, formatEther } from "viem";
import { ADDRESSES } from "@/lib/contract-addresses";
import { DividendVaultV2ABI } from "@/lib/contracts";

const BNB_TOKEN = "0x0000000000000000000000000000000000000000" as `0x${string}`;

export function useClaimable(classId: number | undefined, nonceId: number | undefined) {
  const { address } = useAccount();

  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.DividendVaultV2 as `0x${string}`,
    abi: parseAbi(DividendVaultV2ABI),
    functionName: "claimable",
    args:
      address && classId !== undefined && nonceId !== undefined
        ? [address, BigInt(classId), BigInt(nonceId), BNB_TOKEN]
        : undefined,
    query: { enabled: !!address && classId !== undefined && nonceId !== undefined },
  });

  return {
    data: data !== undefined ? formatEther(data as bigint) : undefined,
    isLoading,
    error,
    refetch,
  };
}

export function useClassDividendInfo(classId: number | undefined) {
  const {
    data: accData,
    isLoading: accLoading,
  } = useReadContract({
    address: ADDRESSES.DividendVaultV2 as `0x${string}`,
    abi: parseAbi(DividendVaultV2ABI),
    functionName: "accDividendPerBond",
    args: classId !== undefined ? [BigInt(classId), BigInt(0), BNB_TOKEN] : undefined,
    query: { enabled: classId !== undefined },
  });

  const {
    data: totalData,
    isLoading: totalLoading,
  } = useReadContract({
    address: ADDRESSES.DividendVaultV2 as `0x${string}`,
    abi: parseAbi(DividendVaultV2ABI),
    functionName: "totalDeposited",
    args: classId !== undefined ? [BigInt(classId), BigInt(0), BNB_TOKEN] : undefined,
    query: { enabled: classId !== undefined },
  });

  return {
    accDividendPerBond: accData !== undefined ? formatEther(accData as bigint) : undefined,
    totalDeposited: totalData !== undefined ? formatEther(totalData as bigint) : undefined,
    isLoading: accLoading || totalLoading,
  };
}
