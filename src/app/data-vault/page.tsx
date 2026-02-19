"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import { NFARegistryABI, GreenfieldDataVaultABI } from "@/lib/contracts";
import { ADDRESSES } from "@/lib/contract-addresses";

const DataTypeLabels = ["Model", "Training", "Performance", "Inference", "Config"] as const;

const client = createPublicClient({ chain: bscTestnet, transport: http() });

interface AssetRow {
  assetId: number;
  agentId: number;
  agentName: string;
  bucketName: string;
  objectName: string;
  dataType: number;
  size: number;
  verified: boolean;
  active: boolean;
}

export default function DataVaultPage() {
  const { isConnected } = useAccount();
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const totalSupply = await client.readContract({
          address: ADDRESSES.NFARegistry as `0x${string}`,
          abi: NFARegistryABI,
          functionName: "totalSupply",
        });

        const count = Number(totalSupply);
        const found: AssetRow[] = [];

        for (let i = 0; i < Math.min(count, 20); i++) {
          const tokenId = await client.readContract({
            address: ADDRESSES.NFARegistry as `0x${string}`,
            abi: NFARegistryABI,
            functionName: "tokenByIndex",
            args: [BigInt(i)],
          });

          const agentId = Number(tokenId);

          // Get agent name
          let agentName = `Agent #${agentId}`;
          try {
            const metadata = await client.readContract({
              address: ADDRESSES.NFARegistry as `0x${string}`,
              abi: NFARegistryABI,
              functionName: "getAgentMetadata",
              args: [tokenId as bigint],
            });
            const meta = metadata as unknown as readonly [string, string, string, string, bigint];
            if (meta[0]) agentName = meta[0];
          } catch { /* keep default */ }

          // Get asset IDs for this agent
          try {
            const assetIds = await client.readContract({
              address: ADDRESSES.GreenfieldDataVault as `0x${string}`,
              abi: GreenfieldDataVaultABI,
              functionName: "getAgentAssets",
              args: [tokenId as bigint],
            }) as bigint[];

            for (const aid of assetIds) {
              try {
                const asset = await client.readContract({
                  address: ADDRESSES.GreenfieldDataVault as `0x${string}`,
                  abi: GreenfieldDataVaultABI,
                  functionName: "getDataAsset",
                  args: [aid],
                }) as readonly [bigint, string, string, `0x${string}`, number, bigint, bigint, boolean, boolean];

                found.push({
                  assetId: Number(aid),
                  agentId,
                  agentName,
                  bucketName: asset[1],
                  objectName: asset[2],
                  dataType: asset[4],
                  size: Number(asset[5]),
                  verified: asset[7],
                  active: asset[8],
                });
              } catch { /* skip */ }
            }
          } catch { /* no assets */ }
        }

        setAssets(found);
      } catch {
        // Failed
      } finally {
        setLoading(false);
      }
    }

    fetchAll();
  }, []);

  if (!isConnected) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="card-glass rounded p-10 text-center">
          <h2 className="text-xl font-bold">Connect Wallet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect your wallet to view the data vault.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-xl font-bold tracking-tight">Greenfield Data Vault</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Decentralized data assets stored on BNB Greenfield, registered by AI agents for due diligence and transparency.
        </p>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card-glass rounded p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-[rgb(var(--muted-foreground))]">
            Total Assets
          </p>
          <p className="mt-2 stat-value font-mono text-2xl text-gold">
            {loading ? "..." : assets.length}
          </p>
        </div>
        <div className="card-glass rounded p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-[rgb(var(--muted-foreground))]">
            Verified
          </p>
          <p className="mt-2 stat-value font-mono text-2xl text-sage">
            {loading ? "..." : assets.filter(a => a.verified).length}
          </p>
        </div>
        <div className="card-glass rounded p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-[rgb(var(--muted-foreground))]">
            Total Size
          </p>
          <p className="mt-2 stat-value font-mono text-2xl">
            {loading ? "..." : `${(assets.reduce((s, a) => s + a.size, 0) / 1024).toFixed(1)} KB`}
          </p>
        </div>
      </div>

      {/* Assets Table */}
      <div className="card-glass overflow-hidden rounded">
        <div className="border-b border-[rgb(var(--border))]/50 px-5 py-4">
          <h2 className="text-lg font-semibold">Data Assets</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--border))]/30 text-xs font-medium uppercase tracking-wider text-[rgb(var(--muted-foreground))]">
                <th className="px-5 py-3">ID</th>
                <th className="px-5 py-3">Agent</th>
                <th className="px-5 py-3">Object</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3 text-right">Size</th>
                <th className="px-5 py-3 text-center">Verified</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]/20">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-[rgb(var(--muted-foreground))]">
                    Loading data assets...
                  </td>
                </tr>
              ) : assets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-[rgb(var(--muted-foreground))]">
                    No data assets registered yet.
                  </td>
                </tr>
              ) : (
                assets.map((a) => (
                  <tr
                    key={a.assetId}
                    className="transition-colors hover:bg-[rgb(var(--secondary))]/30"
                  >
                    <td className="px-5 py-3 font-mono text-[rgb(var(--muted-foreground))]">
                      #{a.assetId}
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/agents/${a.agentId}`}
                        className="cursor-pointer text-[rgb(var(--foreground))] transition-colors hover:text-gold"
                      >
                        {a.agentName}
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">
                      {a.bucketName}/{a.objectName}
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-md bg-[rgb(var(--muted))]/50 px-2 py-0.5 text-xs font-medium text-[rgb(var(--muted-foreground))]">
                        {DataTypeLabels[a.dataType] ?? "Unknown"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs">
                      {a.size > 1024 ? `${(a.size / 1024).toFixed(1)} KB` : `${a.size} B`}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {a.verified ? (
                        <span className="inline-block rounded-full bg-[#5A8A6E]/10 px-2.5 py-0.5 text-xs font-medium text-sage">
                          Verified
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-[rgb(var(--muted))]/50 px-2.5 py-0.5 text-xs font-medium text-[rgb(var(--muted-foreground))]">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {a.active ? (
                        <span className="text-xs text-sage">Active</span>
                      ) : (
                        <span className="text-xs text-[rgb(var(--muted-foreground))]">Inactive</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
