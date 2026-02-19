"use client";

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseAbi } from "viem";
import { ADDRESSES } from "@/lib/contract-addresses";
import { BondCollateralWrapperABI } from "@/lib/contracts";

export interface WrappedPosition {
  tokenId: number;
  classId: number;
  nonceId: number;
  amount: number;
}

export function useWrappedPosition(tokenId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.BondCollateralWrapper as `0x${string}`,
    abi: parseAbi(BondCollateralWrapperABI),
    functionName: "wrappedPositions",
    args: tokenId !== undefined ? [BigInt(tokenId)] : undefined,
    query: { enabled: tokenId !== undefined },
  });

  const position: WrappedPosition | null = data
    ? (() => {
        const d = data as unknown as readonly [bigint, bigint, bigint];
        return {
          tokenId: tokenId!,
          classId: Number(d[0]),
          nonceId: Number(d[1]),
          amount: Number(d[2]),
        };
      })()
    : null;

  return { data: position, isLoading, error, refetch };
}

export function useCollateralBalance(owner: `0x${string}` | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.BondCollateralWrapper as `0x${string}`,
    abi: parseAbi(BondCollateralWrapperABI),
    functionName: "balanceOf",
    args: owner ? [owner] : undefined,
    query: { enabled: !!owner },
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}

export function useWrapBonds() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  function wrap(classId: number, nonceId: number, amount: number) {
    writeContract({
      address: ADDRESSES.BondCollateralWrapper as `0x${string}`,
      abi: parseAbi(BondCollateralWrapperABI),
      functionName: "wrap",
      args: [BigInt(classId), BigInt(nonceId), BigInt(amount)],
    });
  }

  return { wrap, isPending, isConfirming, isSuccess, error };
}

export function useUnwrapBonds() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  function unwrap(tokenId: number) {
    writeContract({
      address: ADDRESSES.BondCollateralWrapper as `0x${string}`,
      abi: parseAbi(BondCollateralWrapperABI),
      functionName: "unwrap",
      args: [BigInt(tokenId)],
    });
  }

  return { unwrap, isPending, isConfirming, isSuccess, error };
}
