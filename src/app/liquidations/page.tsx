"use client";

import { useState } from "react";
import { createPublicClient, http, parseAbi } from "viem";
import { bscTestnet } from "viem/chains";
import { useGracePeriod, type LiquidationStatus } from "@/hooks/useLiquidation";
import { LiquidationEngineABI, NFARegistryABI } from "@/lib/contracts";
import { ADDRESSES } from "@/lib/contract-addresses";

const client = createPublicClient({ chain: bscTestnet, transport: http() });

function formatTimestamp(ts: number): string {
  if (ts === 0) return "--";
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusLabel(status: LiquidationStatus): {
  label: string;
  className: string;
} {
  if (status.executed) {
    return { label: "Executed", className: "bg-[#B94137]/10 text-crimson" };
  }
  if (status.cancelled) {
    return {
      label: "Cancelled",
      className: "bg-[rgb(var(--muted-foreground))]/10 text-[rgb(var(--muted-foreground))]",
    };
  }
  if (status.isUnderLiquidation) {
    return { label: "Grace Period", className: "bg-[#D4A853]/10 text-gold" };
  }
  return {
    label: "None",
    className: "bg-[rgb(var(--muted-foreground))]/10 text-[rgb(var(--muted-foreground))]",
  };
}

interface LookupResult {
  agentId: number;
  agentName: string;
  status: LiquidationStatus;
}

export default function LiquidationsPage() {
  const [agentIdInput, setAgentIdInput] = useState("");
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const { data: gracePeriod, isLoading: graceLoading } = useGracePeriod();

  const gracePeriodDays =
    gracePeriod !== undefined ? `${Math.round(gracePeriod / 86400)}d` : "...";

  const handleLookup = async () => {
    const agentId = parseInt(agentIdInput);
    if (isNaN(agentId) || agentId < 0) return;

    setLookupLoading(true);
    setLookupError(null);
    setLookupResult(null);

    try {
      // Fetch liquidation data
      const [liqData, isUnder] = await Promise.all([
        client.readContract({
          address: ADDRESSES.LiquidationEngine as `0x${string}`,
          abi: parseAbi(LiquidationEngineABI),
          functionName: "liquidations",
          args: [BigInt(agentId)],
        }),
        client.readContract({
          address: ADDRESSES.LiquidationEngine as `0x${string}`,
          abi: parseAbi(LiquidationEngineABI),
          functionName: "isUnderLiquidation",
          args: [BigInt(agentId)],
        }),
      ]);

      const d = liqData as unknown as {
        agentId: bigint;
        triggeredAt: bigint;
        gracePeriodEnd: bigint;
        executed: boolean;
        cancelled: boolean;
      };

      // Try to get agent name
      let agentName = `Agent #${agentId}`;
      try {
        const metadata = await client.readContract({
          address: ADDRESSES.NFARegistry as `0x${string}`,
          abi: parseAbi(NFARegistryABI),
          functionName: "getAgentMetadata",
          args: [BigInt(agentId)],
        });
        const meta = metadata as { name: string };
        if (meta.name) agentName = meta.name;
      } catch {
        // Keep default name
      }

      setLookupResult({
        agentId,
        agentName,
        status: {
          agentId: Number(d.agentId),
          triggeredAt: Number(d.triggeredAt),
          gracePeriodEnd: Number(d.gracePeriodEnd),
          executed: d.executed,
          cancelled: d.cancelled,
          isUnderLiquidation: Boolean(isUnder),
        },
      });
    } catch (err) {
      setLookupError(
        err instanceof Error ? err.message : "Failed to fetch liquidation status"
      );
    } finally {
      setLookupLoading(false);
    }
  };

  const handleClear = () => {
    setLookupResult(null);
    setLookupError(null);
    setAgentIdInput("");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Liquidations</h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted-foreground))]">
          Monitor at-risk agents and liquidation events
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card-glass rounded-xl p-4">
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Grace Period</p>
          <p className="stat-value font-mono text-2xl text-gold">
            {graceLoading ? "..." : gracePeriodDays}
          </p>
        </div>
        <div className="card-glass rounded-xl p-4">
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Active Liquidations</p>
          <p className="stat-value font-mono text-2xl text-crimson">--</p>
          <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
            Requires event indexing
          </p>
        </div>
      </div>

      {/* Lookup Form */}
      <div className="card-glass rounded-xl p-6">
        <h2 className="text-base font-semibold">Lookup Agent Liquidation Status</h2>
        <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
          Enter an agent ID to check its current liquidation status.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-[rgb(var(--muted-foreground))]">
              Agent ID
            </label>
            <input
              type="number"
              min="0"
              value={agentIdInput}
              onChange={(e) => setAgentIdInput(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-3 py-2 font-mono text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))]/50 focus:border-[#D4A853] focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleLookup}
              disabled={lookupLoading}
              className="cursor-pointer rounded-lg bg-[#D4A853]/15 px-6 py-2 text-sm font-semibold text-gold transition-colors hover:bg-[#D4A853]/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {lookupLoading ? "Loading..." : "Check Status"}
            </button>
            {lookupResult && (
              <button
                onClick={handleClear}
                className="cursor-pointer rounded-lg bg-[rgb(var(--secondary))] px-4 py-2 text-sm font-medium text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--border))]"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lookup Error */}
      {lookupError && (
        <div className="card-glass rounded-xl p-4">
          <p className="text-sm text-crimson">{lookupError}</p>
        </div>
      )}

      {/* Lookup Result */}
      {lookupResult && (
        <div className="card-glass rounded-xl p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-[rgb(var(--muted-foreground))]">
                Agent #{lookupResult.agentId}
              </p>
              <h3 className="mt-0.5 text-base font-semibold">{lookupResult.agentName}</h3>
            </div>
            {(() => {
              const { label, className } = getStatusLabel(lookupResult.status);
              return (
                <span className={`rounded-md px-2.5 py-1 text-xs font-bold ${className}`}>
                  {label}
                </span>
              );
            })()}
          </div>

          {lookupResult.status.triggeredAt > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgb(var(--border))]">
                    <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-[rgb(var(--muted-foreground))]">
                      Field
                    </th>
                    <th className="pb-3 text-right text-xs font-medium uppercase tracking-wider text-[rgb(var(--muted-foreground))]">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[rgb(var(--border))]/30">
                    <td className="py-3 text-[rgb(var(--muted-foreground))]">Triggered At</td>
                    <td className="py-3 text-right font-mono">
                      {formatTimestamp(lookupResult.status.triggeredAt)}
                    </td>
                  </tr>
                  <tr className="border-b border-[rgb(var(--border))]/30">
                    <td className="py-3 text-[rgb(var(--muted-foreground))]">Grace Period End</td>
                    <td className="py-3 text-right font-mono">
                      {formatTimestamp(lookupResult.status.gracePeriodEnd)}
                    </td>
                  </tr>
                  <tr className="border-b border-[rgb(var(--border))]/30">
                    <td className="py-3 text-[rgb(var(--muted-foreground))]">Executed</td>
                    <td className="py-3 text-right font-mono">
                      <span className={lookupResult.status.executed ? "text-crimson" : ""}>
                        {lookupResult.status.executed ? "Yes" : "No"}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 text-[rgb(var(--muted-foreground))]">Cancelled</td>
                    <td className="py-3 text-right font-mono">
                      {lookupResult.status.cancelled ? "Yes" : "No"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[rgb(var(--muted-foreground))]">
              No liquidation has been triggered for this agent.
            </p>
          )}
        </div>
      )}

      {/* Default empty state */}
      {!lookupResult && !lookupError && (
        <div className="py-8 text-center text-sm text-[rgb(var(--muted-foreground))]">
          No active liquidations
        </div>
      )}
    </div>
  );
}
