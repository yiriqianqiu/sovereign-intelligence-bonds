"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { parseAbi, formatEther } from "viem";
import { ADDRESSES } from "@/lib/contract-addresses";
import { BondDEXABI } from "@/lib/contracts";

// Flattened return type ABI for getOrder (avoids tuple parse issue with useReadContracts)
const GetOrderABI = parseAbi([
  "function getOrder(uint256 orderId) view returns (address, uint256, uint256, uint256, uint256, address, bool, uint256, bool)",
]);

export interface Order {
  orderId: number;
  maker: `0x${string}`;
  classId: number;
  nonceId: number;
  amount: number;
  pricePerBond: string;
  paymentToken: `0x${string}`;
  isSell: boolean;
  expiry: number;
  active: boolean;
}

export function useOrderCount() {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.BondDEX as `0x${string}`,
    abi: parseAbi(BondDEXABI),
    functionName: "getOrderCount",
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}

export function useOrder(orderId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.BondDEX as `0x${string}`,
    abi: parseAbi(BondDEXABI),
    functionName: "getOrder",
    args: orderId !== undefined ? [BigInt(orderId)] : undefined,
    query: { enabled: orderId !== undefined },
  });

  const order: Order | null = data
    ? (() => {
        const d = data as unknown as {
          maker: `0x${string}`;
          classId: bigint;
          nonceId: bigint;
          amount: bigint;
          pricePerBond: bigint;
          paymentToken: `0x${string}`;
          isSell: boolean;
          expiry: bigint;
          active: boolean;
        };
        return {
          orderId: orderId!,
          maker: d.maker,
          classId: Number(d.classId),
          nonceId: Number(d.nonceId),
          amount: Number(d.amount),
          pricePerBond: formatEther(d.pricePerBond),
          paymentToken: d.paymentToken,
          isSell: d.isSell,
          expiry: Number(d.expiry),
          active: d.active,
        };
      })()
    : null;

  return { data: order, isLoading, error, refetch };
}

export function useOrders(limit: number) {
  const { data: countData } = useOrderCount();
  const count = countData ?? 0;
  const actualLimit = Math.min(limit, count);

  const contracts = Array.from({ length: actualLimit }, (_, i) => ({
    address: ADDRESSES.BondDEX as `0x${string}`,
    abi: GetOrderABI,
    functionName: "getOrder" as const,
    args: [BigInt(i)] as const,
  }));

  const { data, isLoading, error, refetch } = useReadContracts({
    contracts: contracts.length > 0 ? contracts : undefined,
    query: { enabled: actualLimit > 0 },
  });

  const orders: Order[] = data
    ? data
        .map((result, i) => {
          if (result.status !== "success" || !result.result) return null;
          const d = result.result as readonly [
            `0x${string}`, bigint, bigint, bigint, bigint, `0x${string}`, boolean, bigint, boolean,
          ];
          return {
            orderId: i,
            maker: d[0],
            classId: Number(d[1]),
            nonceId: Number(d[2]),
            amount: Number(d[3]),
            pricePerBond: formatEther(d[4]),
            paymentToken: d[5],
            isSell: d[6],
            expiry: Number(d[7]),
            active: d[8],
          };
        })
        .filter((o): o is Order => o !== null)
    : [];

  return { data: orders, isLoading, error, refetch };
}

export function useProtocolFee() {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.BondDEX as `0x${string}`,
    abi: parseAbi(BondDEXABI),
    functionName: "protocolFeeBps",
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}
