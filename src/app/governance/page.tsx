"use client";

import { useState, useEffect } from "react";
import { createPublicClient, http, parseAbi } from "viem";
import { bscTestnet } from "viem/chains";
import { useProposalCount, useQuorum, useVotingPeriod } from "@/hooks/useGovernance";
import { GovernanceProposalCard } from "@/components/GovernanceProposalCard";
import { BondholderGovernorABI } from "@/lib/contracts";
import { ADDRESSES } from "@/lib/contract-addresses";

const client = createPublicClient({ chain: bscTestnet, transport: http() });

type FilterTab = "all" | "active" | "passed" | "executed";

interface ProposalSummary {
  proposalId: number;
  state: number;
}

export default function GovernancePage() {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const { data: proposalCount, isLoading: countLoading } = useProposalCount();
  const { data: quorum, isLoading: quorumLoading } = useQuorum();
  const { data: votingPeriod, isLoading: periodLoading } = useVotingPeriod();

  // Fetch all proposals to get their states for filtering
  useEffect(() => {
    if (proposalCount === undefined) return;

    const count = proposalCount;
    if (count === 0) {
      setProposals([]);
      setLoading(false);
      return;
    }

    async function fetchProposals() {
      try {
        const summaries: ProposalSummary[] = [];

        for (let i = 0; i < count; i++) {
          try {
            const proposal = await client.readContract({
              address: ADDRESSES.BondholderGovernor as `0x${string}`,
              abi: parseAbi(BondholderGovernorABI),
              functionName: "getProposal",
              args: [BigInt(i)],
            });

            const d = proposal as unknown as readonly [bigint, number, bigint, bigint, bigint, bigint, bigint, number, `0x${string}`];

            summaries.push({
              proposalId: i,
              state: d[7],
            });
          } catch {
            // Skip proposals that can't be read
          }
        }

        setProposals(summaries);
      } catch {
        setProposals([]);
      } finally {
        setLoading(false);
      }
    }

    fetchProposals();
  }, [proposalCount]);

  const filteredProposals = proposals.filter((p) => {
    if (filter === "all") return true;
    if (filter === "active") return p.state === 0;
    if (filter === "passed") return p.state === 1;
    if (filter === "executed") return p.state === 3;
    return true;
  });

  const quorumDisplay = quorum !== undefined ? `${(quorum / 100).toFixed(1)}%` : "...";
  const votingPeriodDays = votingPeriod !== undefined ? `${Math.round(votingPeriod / 86400)}d` : "...";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-xl font-bold tracking-tight">Governance</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Bond holder voting on protocol parameters
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded border bg-card p-4">
          <p className="label-mono">Total Proposals</p>
          <p className="stat-value font-mono text-2xl text-gold">
            {countLoading ? "..." : (proposalCount ?? 0)}
          </p>
        </div>
        <div className="rounded border bg-card p-4">
          <p className="label-mono">Quorum</p>
          <p className="stat-value font-mono text-2xl">
            {quorumLoading ? "..." : quorumDisplay}
          </p>
        </div>
        <div className="rounded border bg-card p-4">
          <p className="label-mono">Voting Period</p>
          <p className="stat-value font-mono text-2xl">
            {periodLoading ? "..." : votingPeriodDays}
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(["all", "active", "passed", "executed"] as FilterTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`cursor-pointer rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === tab
                ? "text-gold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Proposals List */}
      {loading || countLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <p className="text-[rgb(var(--muted-foreground))]">Loading proposals...</p>
        </div>
      ) : filteredProposals.length === 0 ? (
        <div className="py-12 text-center text-sm text-[rgb(var(--muted-foreground))]">
          No governance proposals yet
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredProposals.map((p) => (
            <GovernanceProposalCard key={p.proposalId} proposalId={p.proposalId} />
          ))}
        </div>
      )}
    </div>
  );
}
