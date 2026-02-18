"use client";

import { useReadContract } from "wagmi";
import { parseAbi, formatEther } from "viem";
import { ADDRESSES } from "@/lib/contract-addresses";
import { ComputeMarketplaceABI } from "@/lib/contracts";

const ResourceTypeLabels = ["CPU", "GPU", "TPU", "Memory", "Storage"] as const;

export interface ComputeResource {
  resourceId: number;
  provider: `0x${string}`;
  name: string;
  specs: string;
  resourceType: number;
  resourceTypeLabel: string;
  pricePerHour: string;
  paymentToken: `0x${string}`;
  minCreditRating: number;
  minEvolutionLevel: number;
  totalCapacity: number;
  usedCapacity: number;
  active: boolean;
}

export interface Rental {
  rentalId: number;
  agentId: number;
  resourceId: number;
  startTime: number;
  duration: number;
  unitsRented: number;
  depositAmount: string;
  paymentToken: `0x${string}`;
  active: boolean;
  settled: boolean;
}

export function useResource(resourceId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.ComputeMarketplace as `0x${string}`,
    abi: parseAbi(ComputeMarketplaceABI),
    functionName: "resources",
    args: resourceId !== undefined ? [BigInt(resourceId)] : undefined,
    query: { enabled: resourceId !== undefined },
  });

  const resource: ComputeResource | null = data
    ? (() => {
        const d = data as unknown as readonly [
          `0x${string}`, string, string, number, bigint, `0x${string}`,
          number, number, bigint, bigint, boolean,
        ];
        return {
          resourceId: resourceId!,
          provider: d[0],
          name: d[1],
          specs: d[2],
          resourceType: d[3],
          resourceTypeLabel: ResourceTypeLabels[d[3]] ?? "Unknown",
          pricePerHour: formatEther(d[4]),
          paymentToken: d[5],
          minCreditRating: d[6],
          minEvolutionLevel: d[7],
          totalCapacity: Number(d[8]),
          usedCapacity: Number(d[9]),
          active: d[10],
        };
      })()
    : null;

  return { data: resource, isLoading, error, refetch };
}

export function useRental(rentalId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.ComputeMarketplace as `0x${string}`,
    abi: parseAbi(ComputeMarketplaceABI),
    functionName: "rentals",
    args: rentalId !== undefined ? [BigInt(rentalId)] : undefined,
    query: { enabled: rentalId !== undefined },
  });

  const rental: Rental | null = data
    ? (() => {
        const d = data as unknown as readonly [
          bigint, bigint, bigint, bigint, bigint, bigint, `0x${string}`, boolean, boolean,
        ];
        return {
          rentalId: rentalId!,
          agentId: Number(d[0]),
          resourceId: Number(d[1]),
          startTime: Number(d[2]),
          duration: Number(d[3]),
          unitsRented: Number(d[4]),
          depositAmount: formatEther(d[5]),
          paymentToken: d[6],
          active: d[7],
          settled: d[8],
        };
      })()
    : null;

  return { data: rental, isLoading, error, refetch };
}

export function useAgentRentals(agentId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.ComputeMarketplace as `0x${string}`,
    abi: parseAbi(ComputeMarketplaceABI),
    functionName: "getAgentRentals",
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

export function useProviderResources(provider: `0x${string}` | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.ComputeMarketplace as `0x${string}`,
    abi: parseAbi(ComputeMarketplaceABI),
    functionName: "getProviderResources",
    args: provider ? [provider] : undefined,
    query: { enabled: !!provider },
  });

  return {
    data: data ? (data as bigint[]).map(Number) : undefined,
    isLoading,
    error,
    refetch,
  };
}

export function useIsEligible(agentId: number | undefined, resourceId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.ComputeMarketplace as `0x${string}`,
    abi: parseAbi(ComputeMarketplaceABI),
    functionName: "isEligible",
    args:
      agentId !== undefined && resourceId !== undefined
        ? [BigInt(agentId), BigInt(resourceId)]
        : undefined,
    query: { enabled: agentId !== undefined && resourceId !== undefined },
  });

  return { data: data as boolean | undefined, isLoading, error, refetch };
}

export function useActiveRentalCount(agentId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.ComputeMarketplace as `0x${string}`,
    abi: parseAbi(ComputeMarketplaceABI),
    functionName: "getActiveRentalCount",
    args: agentId !== undefined ? [BigInt(agentId)] : undefined,
    query: { enabled: agentId !== undefined },
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}

export function useProtocolFee() {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.ComputeMarketplace as `0x${string}`,
    abi: parseAbi(ComputeMarketplaceABI),
    functionName: "protocolFeeBps",
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}
