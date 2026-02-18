"use client";

import { useReadContract } from "wagmi";
import { parseAbi } from "viem";
import { ADDRESSES } from "@/lib/contract-addresses";
import { GreenfieldDataVaultABI } from "@/lib/contracts";

const DataTypeLabels = ["Model", "Training", "Performance", "Inference", "Config"] as const;

export interface DataAsset {
  assetId: number;
  agentId: number;
  bucketName: string;
  objectName: string;
  contentHash: `0x${string}`;
  dataType: number;
  dataTypeLabel: string;
  size: number;
  registeredAt: number;
  verified: boolean;
  active: boolean;
}

export function useAgentAssetIds(agentId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.GreenfieldDataVault as `0x${string}`,
    abi: parseAbi(GreenfieldDataVaultABI),
    functionName: "getAgentAssets",
    args: agentId !== undefined ? [BigInt(agentId)] : undefined,
    query: { enabled: agentId !== undefined },
  });

  return {
    data: data ? (data as bigint[]).map(Number) : undefined,
    isLoading,
    error,
    refetch,
  };
}

export function useDataAsset(assetId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.GreenfieldDataVault as `0x${string}`,
    abi: parseAbi(GreenfieldDataVaultABI),
    functionName: "getDataAsset",
    args: assetId !== undefined ? [BigInt(assetId)] : undefined,
    query: { enabled: assetId !== undefined },
  });

  const asset: DataAsset | null = data
    ? (() => {
        const d = data as unknown as {
          agentId: bigint;
          bucketName: string;
          objectName: string;
          contentHash: `0x${string}`;
          dataType: number;
          size: bigint;
          registeredAt: bigint;
          verified: boolean;
          active: boolean;
        };
        return {
          assetId: assetId!,
          agentId: Number(d.agentId),
          bucketName: d.bucketName,
          objectName: d.objectName,
          contentHash: d.contentHash,
          dataType: d.dataType,
          dataTypeLabel: DataTypeLabels[d.dataType] ?? "Unknown",
          size: Number(d.size),
          registeredAt: Number(d.registeredAt),
          verified: d.verified,
          active: d.active,
        };
      })()
    : null;

  return { data: asset, isLoading, error, refetch };
}

export function useAgentAssetCount(agentId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.GreenfieldDataVault as `0x${string}`,
    abi: parseAbi(GreenfieldDataVaultABI),
    functionName: "getAgentAssetCount",
    args: agentId !== undefined ? [BigInt(agentId)] : undefined,
    query: { enabled: agentId !== undefined },
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}

export function useVerifiedAssetCount(agentId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.GreenfieldDataVault as `0x${string}`,
    abi: parseAbi(GreenfieldDataVaultABI),
    functionName: "getVerifiedAssetCount",
    args: agentId !== undefined ? [BigInt(agentId)] : undefined,
    query: { enabled: agentId !== undefined },
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}

export function useTotalDataSize(agentId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.GreenfieldDataVault as `0x${string}`,
    abi: parseAbi(GreenfieldDataVaultABI),
    functionName: "getTotalDataSize",
    args: agentId !== undefined ? [BigInt(agentId)] : undefined,
    query: { enabled: agentId !== undefined },
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}
