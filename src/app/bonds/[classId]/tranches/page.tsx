"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createPublicClient, http, parseAbi } from "viem";
import { bscTestnet } from "viem/chains";
import { TrancheComparison } from "@/components/TrancheComparison";
import { useSeniorEntitlement } from "@/hooks/useTranching";
import { TranchingEngineABI } from "@/lib/contracts";
import { ADDRESSES } from "@/lib/contract-addresses";

const client = createPublicClient({ chain: bscTestnet, transport: http() });

export default function TranchesPage() {
  const params = useParams();
  const classId = params?.classId !== undefined ? Number(params.classId) : undefined;

  const [isTranched, setIsTranched] = useState<boolean | null>(null);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Entitlement calculator state
  const [timeDeltaDays, setTimeDeltaDays] = useState("");
  const [calcNonceId, setCalcNonceId] = useState("0");

  const timeDeltaSeconds = timeDeltaDays
    ? Math.round(parseFloat(timeDeltaDays) * 86400)
    : undefined;

  const { data: entitlement, isLoading: entitlementLoading } = useSeniorEntitlement(
    groupId !== null ? groupId : undefined,
    calcNonceId !== "" ? parseInt(calcNonceId) : undefined,
    timeDeltaSeconds,
  );

  // Check if class is tranched and get groupId
  useEffect(() => {
    if (classId === undefined) return;

    async function checkTranche() {
      try {
        const tranched = await client.readContract({
          address: ADDRESSES.TranchingEngine as `0x${string}`,
          abi: parseAbi(TranchingEngineABI),
          functionName: "isTranchedClass",
          args: [BigInt(classId!)],
        });

        setIsTranched(Boolean(tranched));

        if (tranched) {
          const gId = await client.readContract({
            address: ADDRESSES.TranchingEngine as `0x${string}`,
            abi: parseAbi(TranchingEngineABI),
            functionName: "classToGroup",
            args: [BigInt(classId!)],
          });
          setGroupId(Number(gId));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load tranche data");
      } finally {
        setLoading(false);
      }
    }

    checkTranche();
  }, [classId]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-[rgb(var(--muted-foreground))]">Loading tranche data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-crimson">{error}</p>
      </div>
    );
  }

  if (!isTranched) {
    return (
      <div className="space-y-6">
        <div>
          <Link
            href={`/bonds/${classId}`}
            className="cursor-pointer text-sm text-[rgb(var(--muted-foreground))] transition-colors hover:text-gold"
          >
            Back to Bond Class #{classId}
          </Link>
        </div>

        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="card-glass rounded p-10 text-center">
            <h2 className="text-xl font-bold">Not a Tranched Class</h2>
            <p className="mt-2 text-sm text-[rgb(var(--muted-foreground))]">
              This bond class is not part of a tranche group.
            </p>
            <Link
              href={`/bonds/${classId}`}
              className="mt-4 inline-block cursor-pointer rounded bg-[#D4A853]/15 px-6 py-2 text-sm font-semibold text-gold transition-colors hover:bg-[#D4A853]/25"
            >
              Back to Bond Details
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <Link
          href={`/bonds/${classId}`}
          className="cursor-pointer text-sm text-[rgb(var(--muted-foreground))] transition-colors hover:text-gold"
        >
          Back to Bond Class #{classId}
        </Link>
      </div>

      {/* Header */}
      <div>
        <h1 className="font-heading text-xl font-bold tracking-tight">Tranche Comparison</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Senior vs Junior tranche analysis for Bond Class #{classId}
          {groupId !== null && (
            <span className="ml-2 font-mono text-xs">/ Group #{groupId}</span>
          )}
        </p>
      </div>

      {/* Tranche Comparison Component */}
      {groupId !== null && <TrancheComparison groupId={groupId} />}

      {/* Senior Entitlement Calculator */}
      {groupId !== null && (
        <div className="card-glass rounded p-6">
          <h3 className="text-base font-semibold">Senior Entitlement Calculator</h3>
          <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
            Calculate the senior tranche entitlement based on time elapsed since bond
            issuance. This determines the priority distribution amount for senior
            bondholders.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-[rgb(var(--muted-foreground))]">
                Nonce ID
              </label>
              <input
                type="number"
                min="0"
                value={calcNonceId}
                onChange={(e) => setCalcNonceId(e.target.value)}
                placeholder="0"
                className="w-full rounded border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-3 py-2 font-mono text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))]/50 focus:border-[#D4A853] focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-[rgb(var(--muted-foreground))]">
                Time Delta (days)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={timeDeltaDays}
                onChange={(e) => setTimeDeltaDays(e.target.value)}
                placeholder="30"
                className="w-full rounded border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-3 py-2 font-mono text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))]/50 focus:border-[#D4A853] focus:outline-none"
              />
            </div>
          </div>

          {/* Result */}
          <div className="mt-4 rounded bg-[rgb(var(--secondary))] p-4">
            <p className="text-xs text-[rgb(var(--muted-foreground))]">
              Senior Entitlement
            </p>
            <p className="stat-value mt-1 text-xl text-gold">
              {!timeDeltaDays
                ? "Enter time delta to calculate"
                : entitlementLoading
                  ? "Calculating..."
                  : entitlement !== undefined
                    ? `${entitlement} BNB`
                    : "--"}
            </p>
            {timeDeltaDays && timeDeltaSeconds !== undefined && (
              <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
                For {timeDeltaDays} days ({timeDeltaSeconds.toLocaleString()} seconds)
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
