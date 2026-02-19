"use client";

import { useReadContract, useAccount } from "wagmi";
import { parseAbi } from "viem";
import { ADDRESSES } from "@/lib/contract-addresses";
import { BondholderGovernorABI } from "@/lib/contracts";

export interface Proposal {
  proposalId: number;
  classId: number;
  proposalType: number;
  newValue: number;
  forVotes: number;
  againstVotes: number;
  startTime: number;
  endTime: number;
  state: number;
  proposer: `0x${string}`;
}

const PROPOSAL_STATES = ["Active", "Passed", "Rejected", "Executed", "Cancelled"] as const;

export function proposalStateLabel(state: number): string {
  return PROPOSAL_STATES[state] ?? "Unknown";
}

const PROPOSAL_TYPES = ["CouponChange", "ShareChange", "AgentSuspend"] as const;

export function proposalTypeLabel(pType: number): string {
  return PROPOSAL_TYPES[pType] ?? "Unknown";
}

export function useProposal(proposalId: number | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.BondholderGovernor as `0x${string}`,
    abi: parseAbi(BondholderGovernorABI),
    functionName: "getProposal",
    args: proposalId !== undefined ? [BigInt(proposalId)] : undefined,
    query: { enabled: proposalId !== undefined },
  });

  const proposal: Proposal | null = data
    ? (() => {
        const d = data as unknown as readonly [bigint, number, bigint, bigint, bigint, bigint, bigint, number, `0x${string}`];
        return {
          proposalId: proposalId!,
          classId: Number(d[0]),
          proposalType: d[1],
          newValue: Number(d[2]),
          forVotes: Number(d[3]),
          againstVotes: Number(d[4]),
          startTime: Number(d[5]),
          endTime: Number(d[6]),
          state: d[7],
          proposer: d[8],
        };
      })()
    : null;

  return { data: proposal, isLoading, error, refetch };
}

export function useProposalCount() {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.BondholderGovernor as `0x${string}`,
    abi: parseAbi(BondholderGovernorABI),
    functionName: "getProposalCount",
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}

export function useHasVoted(proposalId: number | undefined) {
  const { address } = useAccount();

  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.BondholderGovernor as `0x${string}`,
    abi: parseAbi(BondholderGovernorABI),
    functionName: "hasVoted",
    args:
      proposalId !== undefined && address
        ? [BigInt(proposalId), address]
        : undefined,
    query: { enabled: proposalId !== undefined && !!address },
  });

  return { data: data as boolean | undefined, isLoading, error, refetch };
}

export function useQuorum() {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.BondholderGovernor as `0x${string}`,
    abi: parseAbi(BondholderGovernorABI),
    functionName: "quorumBps",
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}

export function useVotingPeriod() {
  const { data, isLoading, error, refetch } = useReadContract({
    address: ADDRESSES.BondholderGovernor as `0x${string}`,
    abi: parseAbi(BondholderGovernorABI),
    functionName: "votingPeriod",
  });

  return { data: data !== undefined ? Number(data) : undefined, isLoading, error, refetch };
}
