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
        const d = data as { symbol: string; decimals: number; priceUsd: bigint; isActive: boolean; addedAt: bigint };
        return {
          symbol: d.symbol,
          decimals: d.decimals,
          priceUsd: formatEther(d.priceUsd),
          isActive: d.isActive,
          addedAt: Number(d.addedAt),
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
