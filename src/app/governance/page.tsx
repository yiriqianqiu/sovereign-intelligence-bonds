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

            const d = proposal as {
              classId: bigint;
              proposalType: number;
              newValue: bigint;
              forVotes: bigint;
              againstVotes: bigint;
              startTime: bigint;
              endTime: bigint;
              state: number;
              proposer: `0x${string}`;
            };

            summaries.push({
              proposalId: i,
              state: d.state,
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
        <h1 className="text-2xl font-bold">Governance</h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted-foreground))]">
          Bond holder voting on protocol parameters
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card-glass rounded-xl p-4">
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Total Proposals</p>
          <p className="stat-value font-mono text-2xl text-gold">
            {countLoading ? "..." : (proposalCount ?? 0)}
          </p>
        </div>
        <div className="card-glass rounded-xl p-4">
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Quorum</p>
          <p className="stat-value font-mono text-2xl">
            {quorumLoading ? "..." : quorumDisplay}
          </p>
        </div>
        <div className="card-glass rounded-xl p-4">
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Voting Period</p>
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
            className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === tab
                ? "bg-[#D4A853]/15 text-gold"
                : "bg-[rgb(var(--secondary))] text-[rgb(var(--muted-foreground))] hover:bg-[rgb(var(--border))]"
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
