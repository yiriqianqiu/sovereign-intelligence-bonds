"use client";

import { useReadContract } from "wagmi";
import { parseAbi, formatEther } from "viem";
import { ADDRESSES } from "@/lib/contract-addresses";
import { TokenRegistryABI } from "@/lib/contracts";

export interface TokenInfo {
  symbol: string;
  decimals: number;
  priceUsd: string;
  isActive: boolean;
  addedAt: number;
}

export function useTokenList() {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.TokenRegistry as `0x${string}`,
    abi: parseAbi(TokenRegistryABI),
    functionName: "getAllTokens",
  });

  return {
    data: data as `0x${string}`[] | undefined,
    isLoading,
    error,
    refetch,
  };
}

export function useTokenInfo(token: `0x${string}` | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.TokenRegistry as `0x${string}`,
    abi: parseAbi(TokenRegistryABI),
    functionName: "getTokenInfo",
    args: token ? [token] : undefined,
    query: { enabled: !!token },
  });

  const info: TokenInfo | null = data
    ? (() => {
        const d = data as unknown as readonly [string, number, bigint, boolean, bigint];
        return {
          symbol: d[0],
          decimals: d[1],
          priceUsd: formatEther(d[2]),
          isActive: d[3],
          addedAt: Number(d[4]),
        };
      })()
    : null;

  return { data: info, isLoading, error, refetch };
}

export function useTokenPrice(token: `0x${string}` | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.TokenRegistry as `0x${string}`,
    abi: parseAbi(TokenRegistryABI),
    functionName: "getTokenPrice",
    args: token ? [token] : undefined,
    query: { enabled: !!token },
  });

  return {
    data: data !== undefined ? formatEther(data as bigint) : undefined,
    isLoading,
    error,
    refetch,
  };
}
