"use client";

import { useProposal, useHasVoted, proposalStateLabel, proposalTypeLabel } from "@/hooks/useGovernance";

interface GovernanceProposalCardProps {
  proposalId: number;
}

const STATE_STYLES: Record<number, { bg: string; text: string }> = {
  0: { bg: "rgba(212, 168, 83, 0.1)", text: "#D4A853" },   // Active
  1: { bg: "rgba(90, 138, 110, 0.1)", text: "#5A8A6E" },   // Passed
  2: { bg: "rgba(185, 65, 55, 0.1)", text: "#B94137" },     // Rejected
  3: { bg: "rgba(90, 138, 110, 0.15)", text: "#5A8A6E" },   // Executed
  4: { bg: "rgba(148, 140, 128, 0.1)", text: "#948C80" },   // Cancelled
};

export function GovernanceProposalCard({ proposalId }: GovernanceProposalCardProps) {
  const { data: proposal, isLoading } = useProposal(proposalId);
  const { data: hasVoted } = useHasVoted(proposalId);

  if (isLoading || !proposal) {
    return (
      <div className="card-glass rounded-xl p-6">
        <p className="text-sm text-[rgb(var(--muted-foreground))]">Loading proposal...</p>
      </div>
    );
  }

  const totalVotes = proposal.forVotes + proposal.againstVotes;
  const forPct = totalVotes > 0 ? (proposal.forVotes / totalVotes) * 100 : 0;
  const againstPct = totalVotes > 0 ? (proposal.againstVotes / totalVotes) * 100 : 0;

  const now = Math.floor(Date.now() / 1000);
  const remaining = proposal.endTime - now;
  const isActive = proposal.state === 0 && remaining > 0;

  let timeLabel = "Ended";
  if (remaining > 0) {
    if (remaining < 3600) timeLabel = `${Math.floor(remaining / 60)}m remaining`;
    else if (remaining < 86400) timeLabel = `${Math.floor(remaining / 3600)}h remaining`;
    else timeLabel = `${Math.floor(remaining / 86400)}d remaining`;
  }

  const stateStyle = STATE_STYLES[proposal.state] ?? STATE_STYLES[4];

  return (
    <div className="card-glass rounded-xl p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Proposal #{proposalId}</p>
          <h3 className="mt-0.5 text-base font-semibold">
            {proposalTypeLabel(proposal.proposalType)}
          </h3>
          <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
            Class #{proposal.classId} / New Value: {proposal.newValue}
          </p>
        </div>
        <span
          className="rounded-md px-2.5 py-1 text-xs font-bold"
          style={{ color: stateStyle.text, backgroundColor: stateStyle.bg }}
        >
          {proposalStateLabel(proposal.state)}
        </span>
      </div>

      {/* Proposer */}
      <p className="mt-3 text-xs text-[rgb(var(--muted-foreground))]">
        Proposer: <span className="font-mono">{proposal.proposer.slice(0, 6)}...{proposal.proposer.slice(-4)}</span>
      </p>

      {/* Vote progress */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gold">For: {proposal.forVotes}</span>
          <span className="text-[rgb(var(--muted-foreground))]">Against: {proposal.againstVotes}</span>
        </div>
        <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--secondary))]">
          <div
            className="h-full rounded-l-full bg-[#D4A853] transition-all duration-500"
            style={{ width: `${forPct}%` }}
          />
          <div
            className="h-full rounded-r-full bg-[rgb(var(--muted-foreground))] transition-all duration-500"
            style={{ width: `${againstPct}%` }}
          />
        </div>
      </div>

      {/* Time remaining */}
      <p className="mt-3 text-xs text-[rgb(var(--muted-foreground))]">{timeLabel}</p>

      {/* Vote buttons */}
      {isActive && !hasVoted && (
        <div className="mt-4 flex gap-2">
          <button className="flex-1 rounded-lg bg-[#D4A853]/10 py-2 text-xs font-semibold text-gold transition-colors hover:bg-[#D4A853]/20">
            Vote For
          </button>
          <button className="flex-1 rounded-lg bg-[rgb(var(--secondary))] py-2 text-xs font-semibold text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--border))]">
            Vote Against
          </button>
        </div>
      )}

      {hasVoted && (
        <p className="mt-4 text-xs text-sage">You have already voted on this proposal.</p>
      )}
    </div>
  );
}
