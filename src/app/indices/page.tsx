"use client";

import { useState, useEffect } from "react";
import { createPublicClient, http, parseAbi } from "viem";
import { bscTestnet } from "viem/chains";
import { useIndexCount } from "@/hooks/useIndexBond";
import { IndexCompositionChart } from "@/components/IndexCompositionChart";
import { IndexBondABI } from "@/lib/contracts";
import { ADDRESSES } from "@/lib/contract-addresses";

const client = createPublicClient({ chain: bscTestnet, transport: http() });

interface IndexSummary {
  indexId: number;
  name: string;
  componentCount: number;
  active: boolean;
}

export default function IndicesPage() {
  const [indices, setIndices] = useState<IndexSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const { data: indexCount, isLoading: countLoading } = useIndexCount();

  useEffect(() => {
    if (indexCount === undefined) return;

    const count = indexCount;
    if (count === 0) {
      setIndices([]);
      setLoading(false);
      return;
    }

    async function fetchIndices() {
      try {
        const summaries: IndexSummary[] = [];

        for (let i = 0; i < count; i++) {
          try {
            const result = await client.readContract({
              address: ADDRESSES.IndexBond as `0x${string}`,
              abi: parseAbi(IndexBondABI),
              functionName: "getIndex",
              args: [BigInt(i)],
            });

            const d = result as [string, bigint[], bigint[], bigint[], boolean];
            summaries.push({
              indexId: i,
              name: d[0],
              componentCount: d[1].length,
              active: d[4],
            });
          } catch {
            // Skip indices that can't be read
          }
        }

        setIndices(summaries);
      } catch {
        setIndices([]);
      } finally {
        setLoading(false);
      }
    }

    fetchIndices();
  }, [indexCount]);

  const activeIndices = indices.filter((idx) => idx.active);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Index Bonds</h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted-foreground))]">
          Diversified bond baskets backed by multiple AI agents
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card-glass rounded-xl p-4">
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Total Indices</p>
          <p className="stat-value font-mono text-2xl text-gold">
            {countLoading || loading ? "..." : indices.length}
          </p>
        </div>
        <div className="card-glass rounded-xl p-4">
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Available Indices</p>
          <p className="stat-value font-mono text-2xl text-sage">
            {countLoading || loading ? "..." : activeIndices.length}
          </p>
        </div>
      </div>

      {/* Index Grid */}
      {loading || countLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <p className="text-[rgb(var(--muted-foreground))]">Loading index bonds...</p>
        </div>
      ) : indices.length === 0 ? (
        <div className="py-12 text-center text-sm text-[rgb(var(--muted-foreground))]">
          No index bonds created yet
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {indices.map((idx) => (
            <div key={idx.indexId} className="space-y-4">
              <IndexCompositionChart indexId={idx.indexId} />
              {/* Action Buttons */}
              <div className="flex gap-3 px-1">
                <button className="cursor-pointer flex-1 rounded-lg border border-[#D4A853]/30 bg-transparent py-2.5 text-sm font-semibold text-gold transition-colors hover:bg-[#D4A853]/10">
                  Mint
                </button>
                <button className="cursor-pointer flex-1 rounded-lg border border-[rgb(var(--border))] bg-transparent py-2.5 text-sm font-semibold text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--secondary))]">
                  Redeem
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
