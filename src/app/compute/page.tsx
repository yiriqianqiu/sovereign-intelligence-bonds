"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { createPublicClient, http, formatEther, parseAbi } from "viem";
import { bscTestnet } from "viem/chains";
import { ComputeMarketplaceABI } from "@/lib/contracts";
import { ADDRESSES } from "@/lib/contract-addresses";
import { useProtocolFee } from "@/hooks/useComputeMarketplace";

const ResourceTypeLabels = ["CPU", "GPU", "TPU", "Memory", "Storage"] as const;

const client = createPublicClient({ chain: bscTestnet, transport: http() });

interface ResourceRow {
  resourceId: number;
  provider: string;
  name: string;
  specs: string;
  resourceType: number;
  pricePerHour: bigint;
  paymentToken: string;
  totalCapacity: number;
  usedCapacity: number;
  active: boolean;
}

export default function ComputePage() {
  const { isConnected } = useAccount();
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { data: protocolFee } = useProtocolFee();

  useEffect(() => {
    async function fetchResources() {
      try {
        // Try to read resources by iterating from 1 upward
        const found: ResourceRow[] = [];
        for (let i = 1; i <= 50; i++) {
          try {
            const data = await client.readContract({
              address: ADDRESSES.ComputeMarketplace as `0x${string}`,
              abi: parseAbi(ComputeMarketplaceABI),
              functionName: "resources",
              args: [BigInt(i)],
            }) as readonly [
              `0x${string}`, string, string, number, bigint, `0x${string}`,
              number, number, bigint, bigint, boolean,
            ];

            // Check if resource exists (provider is not zero address)
            if (data[0] === "0x0000000000000000000000000000000000000000") break;

            found.push({
              resourceId: i,
              provider: data[0],
              name: data[1],
              specs: data[2],
              resourceType: data[3],
              pricePerHour: data[4],
              paymentToken: data[5] as string,
              totalCapacity: Number(data[8]),
              usedCapacity: Number(data[9]),
              active: data[10],
            });
          } catch {
            break;
          }
        }
        setResources(found);
      } catch {
        // Failed
      } finally {
        setLoading(false);
      }
    }

    fetchResources();
  }, []);

  if (!isConnected) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="card-glass rounded p-10 text-center">
          <h2 className="text-xl font-bold">Connect Wallet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect your wallet to view the compute marketplace.
          </p>
        </div>
      </div>
    );
  }

  const activeResources = resources.filter(r => r.active);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-xl font-bold tracking-tight">Compute Marketplace</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          AI agents can rent GPU, CPU, and storage resources. Providers earn fees from compute rentals.
        </p>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card-glass rounded p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-[rgb(var(--muted-foreground))]">
            Total Resources
          </p>
          <p className="mt-2 stat-value font-mono text-2xl text-gold">
            {loading ? "..." : resources.length}
          </p>
        </div>
        <div className="card-glass rounded p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-[rgb(var(--muted-foreground))]">
            Active
          </p>
          <p className="mt-2 stat-value font-mono text-2xl text-sage">
            {loading ? "..." : activeResources.length}
          </p>
        </div>
        <div className="card-glass rounded p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-[rgb(var(--muted-foreground))]">
            Protocol Fee
          </p>
          <p className="mt-2 stat-value font-mono text-2xl">
            {protocolFee !== undefined ? `${(protocolFee / 100).toFixed(1)}%` : "..."}
          </p>
        </div>
      </div>

      {/* Resources Table */}
      <div className="card-glass overflow-hidden rounded">
        <div className="border-b border-[rgb(var(--border))]/50 px-5 py-4">
          <h2 className="text-lg font-semibold">Available Resources</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--border))]/30 text-xs font-medium uppercase tracking-wider text-[rgb(var(--muted-foreground))]">
                <th className="px-5 py-3">ID</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Provider</th>
                <th className="px-5 py-3 text-right">Price/hr</th>
                <th className="px-5 py-3 text-right">Capacity</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]/20">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-[rgb(var(--muted-foreground))]">
                    Loading resources...
                  </td>
                </tr>
              ) : resources.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-[rgb(var(--muted-foreground))]">
                    No compute resources registered yet.
                  </td>
                </tr>
              ) : (
                resources.map((r) => {
                  const isBNB = r.paymentToken === "0x0000000000000000000000000000000000000000";
                  const utilization = r.totalCapacity > 0
                    ? Math.round((r.usedCapacity / r.totalCapacity) * 100)
                    : 0;
                  return (
                    <tr
                      key={r.resourceId}
                      className="transition-colors hover:bg-[rgb(var(--secondary))]/30"
                    >
                      <td className="px-5 py-3 font-mono text-[rgb(var(--muted-foreground))]">
                        #{r.resourceId}
                      </td>
                      <td className="px-5 py-3">
                        <div>
                          <p className="font-medium">{r.name}</p>
                          <p className="text-xs text-[rgb(var(--muted-foreground))]">{r.specs}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="rounded-md bg-[#D4A853]/10 px-2 py-0.5 text-xs font-medium text-gold">
                          {ResourceTypeLabels[r.resourceType] ?? "Unknown"}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-[rgb(var(--muted-foreground))]">
                        {r.provider.slice(0, 6)}...{r.provider.slice(-4)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono">
                        {parseFloat(formatEther(r.pricePerHour)).toFixed(4)} {isBNB ? "BNB" : ""}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="text-right">
                          <span className="font-mono text-xs">
                            {r.usedCapacity}/{r.totalCapacity}
                          </span>
                          <div className="mt-1 h-1.5 w-full rounded-full bg-[rgb(var(--muted))]/30">
                            <div
                              className="h-full rounded-full bg-gold"
                              style={{ width: `${utilization}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-center">
                        {r.active ? (
                          <span className="inline-block rounded-full bg-[#5A8A6E]/10 px-2.5 py-0.5 text-xs font-medium text-sage">
                            Active
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-[rgb(var(--muted))]/50 px-2.5 py-0.5 text-xs font-medium text-[rgb(var(--muted-foreground))]">
                            Inactive
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info */}
      <div className="card-glass rounded p-5">
        <h2 className="text-sm font-semibold text-[rgb(var(--muted-foreground))]">How It Works</h2>
        <div className="mt-3 grid gap-4 text-xs text-[rgb(var(--muted-foreground))] sm:grid-cols-3">
          <div>
            <p className="font-medium text-[rgb(var(--foreground))]">1. Providers Register</p>
            <p className="mt-1">
              Compute providers register GPU/CPU/Storage resources with pricing and capacity.
            </p>
          </div>
          <div>
            <p className="font-medium text-[rgb(var(--foreground))]">2. Agents Rent</p>
            <p className="mt-1">
              AI agents with sufficient credit rating rent compute. Deposit held in escrow.
            </p>
          </div>
          <div>
            <p className="font-medium text-[rgb(var(--foreground))]">3. Settlement</p>
            <p className="mt-1">
              On rental end, provider claims payment. Unused time refunded to agent. Protocol fee deducted.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
