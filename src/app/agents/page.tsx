"use client";

import { useState, useMemo, useEffect } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import { NFARegistryABI, SIBControllerV2ABI } from "@/lib/contracts";
import { ADDRESSES } from "@/lib/contract-addresses";
import AgentCard from "@/components/AgentCard";

type CreditRating = "Unrated" | "C" | "B" | "A" | "AA" | "AAA";
const RATING_LABELS: CreditRating[] = ["Unrated", "C", "B", "A", "AA", "AAA"];

interface Agent {
  id: number;
  name: string;
  description: string;
  owner: string;
  creditRating: CreditRating;
  sharpeRatio: number;
  totalEarned: bigint;
  totalPayments: number;
  hasIPO: boolean;
  state: number;
}

const client = createPublicClient({ chain: bscTestnet, transport: http() });

type SortField = "rating" | "earnings" | "sharpe";

function ratingOrder(r: CreditRating): number {
  const map: Record<CreditRating, number> = {
    Unrated: 0, C: 1, B: 2, A: 3, AA: 4, AAA: 5,
  };
  return map[r];
}

export default function AgentsPage() {
  const { isConnected } = useAccount();
  const [sortBy, setSortBy] = useState<SortField>("rating");
  const [filterRating, setFilterRating] = useState<CreditRating | "All">("All");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  // Register Agent form state
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [regName, setRegName] = useState("");
  const [regDescription, setRegDescription] = useState("");
  const [regModelHash, setRegModelHash] = useState("");
  const [regEndpoint, setRegEndpoint] = useState("");

  const {
    writeContract: writeRegister,
    data: registerHash,
    isPending: registerIsPending,
    error: registerError,
  } = useWriteContract();
  const { isLoading: registerConfirming, isSuccess: registerSuccess } =
    useWaitForTransactionReceipt({ hash: registerHash });

  function handleRegister() {
    if (!regName.trim()) return;
    writeRegister({
      address: ADDRESSES.NFARegistry as `0x${string}`,
      abi: NFARegistryABI,
      functionName: "registerAgent",
      args: [regName, regDescription, regModelHash, regEndpoint],
    });
  }

  const { data: totalSupply } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: NFARegistryABI,
    functionName: "totalSupply",
  });

  useEffect(() => {
    async function fetchAgents() {
      if (!totalSupply || totalSupply === 0n) {
        setLoading(false);
        return;
      }

      const count = Number(totalSupply);
      const limit = Math.min(count, 20);
      const results: Agent[] = [];

      for (let i = 0; i < limit; i++) {
        try {
          const tokenId = await client.readContract({
            address: ADDRESSES.NFARegistry as `0x${string}`,
            abi: NFARegistryABI,
            functionName: "tokenByIndex",
            args: [BigInt(i)],
          });

          const agentId = tokenId as bigint;

          const [metadata, state, rating, revenue, owner, hasIPO] = await Promise.all([
            client.readContract({
              address: ADDRESSES.NFARegistry as `0x${string}`,
              abi: NFARegistryABI,
              functionName: "getAgentMetadata",
              args: [agentId],
            }),
            client.readContract({
              address: ADDRESSES.NFARegistry as `0x${string}`,
              abi: NFARegistryABI,
              functionName: "getAgentState",
              args: [agentId],
            }),
            client.readContract({
              address: ADDRESSES.NFARegistry as `0x${string}`,
              abi: NFARegistryABI,
              functionName: "creditRatings",
              args: [agentId],
            }),
            client.readContract({
              address: ADDRESSES.NFARegistry as `0x${string}`,
              abi: NFARegistryABI,
              functionName: "getRevenueProfile",
              args: [agentId],
            }),
            client.readContract({
              address: ADDRESSES.NFARegistry as `0x${string}`,
              abi: NFARegistryABI,
              functionName: "getAgentOwner",
              args: [agentId],
            }),
            client.readContract({
              address: ADDRESSES.SIBControllerV2 as `0x${string}`,
              abi: SIBControllerV2ABI,
              functionName: "hasIPO",
              args: [agentId],
            }),
          ]);

          const meta = metadata as unknown as readonly [string, string, string, string, bigint];
          const rev = revenue as unknown as readonly [bigint, bigint, bigint, bigint, `0x${string}`];

          results.push({
            id: Number(agentId),
            name: meta[0],
            description: meta[1],
            owner: owner as string,
            creditRating: RATING_LABELS[Number(rating)] || "Unrated",
            sharpeRatio: Number(rev[3]) / 1e18,
            totalEarned: rev[0],
            totalPayments: Number(rev[1]),
            hasIPO: hasIPO as boolean,
            state: Number(state),
          });
        } catch {
          // skip agents that fail to load
        }
      }

      setAgents(results);
      setLoading(false);
    }

    fetchAgents();
  }, [totalSupply]);

  const filtered = useMemo(() => {
    let list = [...agents];
    if (filterRating !== "All") {
      list = list.filter((a) => a.creditRating === filterRating);
    }
    list.sort((a, b) => {
      if (sortBy === "rating") return ratingOrder(b.creditRating) - ratingOrder(a.creditRating);
      if (sortBy === "earnings") return Number(b.totalEarned - a.totalEarned);
      return b.sharpeRatio - a.sharpeRatio;
    });
    return list;
  }, [agents, sortBy, filterRating]);

  if (!isConnected) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="rounded border bg-card p-10 text-center">
          <h2 className="text-xl font-bold">Connect Wallet</h2>
          <p className="mt-2 text-sm text-[rgb(var(--muted-foreground))]">
            Connect your wallet to view registered agents.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold tracking-tight">Registered Agents</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            NFA-registered AI agents eligible for bond issuance
          </p>
        </div>
        <button
          onClick={() => setShowRegisterForm((prev) => !prev)}
          className="cursor-pointer rounded bg-gold px-4 py-2 text-sm font-semibold text-[rgb(var(--primary-foreground))] transition-colors duration-200 hover:bg-[#C49A48]"
        >
          {showRegisterForm ? "Close" : "Register New Agent"}
        </button>
      </div>

      {/* Register Agent Form */}
      {showRegisterForm && (
        <div className="rounded border bg-card p-6">
          <h2 className="text-lg font-semibold">Register New Agent</h2>
          <p className="mt-1 text-sm text-[rgb(var(--muted-foreground))]">
            Register an AI agent as an NFA on-chain to enable bond issuance.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-[rgb(var(--muted-foreground))]">
                Agent Name
              </label>
              <input
                type="text"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="e.g. AlphaTrader-v2"
                className="mt-1 w-full rounded border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-3 py-2 font-mono text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))]/50 focus:border-[#D4A853] focus:outline-none focus:ring-1 focus:ring-[#D4A853]"
              />
            </div>
            <div>
              <label className="block text-xs text-[rgb(var(--muted-foreground))]">
                Endpoint URL
              </label>
              <input
                type="text"
                value={regEndpoint}
                onChange={(e) => setRegEndpoint(e.target.value)}
                placeholder="https://api.example.com/agent"
                className="mt-1 w-full rounded border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-3 py-2 font-mono text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))]/50 focus:border-[#D4A853] focus:outline-none focus:ring-1 focus:ring-[#D4A853]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-[rgb(var(--muted-foreground))]">
                Description
              </label>
              <input
                type="text"
                value={regDescription}
                onChange={(e) => setRegDescription(e.target.value)}
                placeholder="Describe what this agent does"
                className="mt-1 w-full rounded border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-3 py-2 font-mono text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))]/50 focus:border-[#D4A853] focus:outline-none focus:ring-1 focus:ring-[#D4A853]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-[rgb(var(--muted-foreground))]">
                Model Hash
              </label>
              <input
                type="text"
                value={regModelHash}
                onChange={(e) => setRegModelHash(e.target.value)}
                placeholder="IPFS hash or model identifier"
                className="mt-1 w-full rounded border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-3 py-2 font-mono text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))]/50 focus:border-[#D4A853] focus:outline-none focus:ring-1 focus:ring-[#D4A853]"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleRegister}
              disabled={registerIsPending || registerConfirming || !regName.trim()}
              className="cursor-pointer rounded bg-gold px-6 py-2.5 text-sm font-semibold text-[rgb(var(--primary-foreground))] transition-colors duration-200 hover:bg-[#C49A48] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {registerIsPending
                ? "Confirm in Wallet..."
                : registerConfirming
                  ? "Registering..."
                  : "Register Agent"}
            </button>
            {registerSuccess && (
              <p className="text-xs text-sage">
                Agent registered successfully. Refresh to see it in the list.
              </p>
            )}
            {registerError && (
              <p className="text-xs text-crimson">
                {registerError.message?.slice(0, 120) || "Transaction failed"}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Filter / Sort Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[rgb(var(--muted-foreground))]">Filter:</span>
          {(["All", "AAA", "AA", "A", "B", "C", "Unrated"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setFilterRating(r)}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-200 ${
                filterRating === r
                  ? "text-gold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-[rgb(var(--muted-foreground))]">Sort:</span>
          {(
            [
              { key: "rating", label: "Rating" },
              { key: "earnings", label: "Earnings" },
              { key: "sharpe", label: "Sharpe" },
            ] as const
          ).map((s) => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-200 ${
                sortBy === s.key
                  ? "text-gold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="py-12 text-center text-sm text-[rgb(var(--muted-foreground))]">
          Loading agents from chain...
        </div>
      )}

      {/* Agent Grid */}
      {!loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((agent) => (
            <AgentCard
              key={agent.id}
              id={agent.id}
              name={agent.name}
              description={agent.description}
              creditRating={agent.creditRating}
              sharpeRatio={agent.sharpeRatio}
              totalEarned={agent.totalEarned}
              totalPayments={agent.totalPayments}
              hasIPO={agent.hasIPO}
              state={agent.state}
            />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="py-12 text-center text-sm text-[rgb(var(--muted-foreground))]">
          {agents.length === 0
            ? "No agents registered on-chain yet."
            : "No agents match the selected filter."}
        </div>
      )}
    </div>
  );
}
