"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useReadContract } from "wagmi";
import { formatEther, parseAbi } from "viem";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import { NFARegistryABI, SIBBondManagerV2ABI, DividendVaultV2ABI, B402PaymentReceiverABI } from "@/lib/contracts";
import { ComputeMarketplaceABI } from "@/lib/contracts";
import { ADDRESSES } from "@/lib/contract-addresses";
import { ALPHA_SIGNAL_ID, AGENT_NAME } from "@/lib/constants";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const BNB_TOKEN = "0x0000000000000000000000000000000000000000" as `0x${string}`;

const client = createPublicClient({ chain: bscTestnet, transport: http() });

interface LifecycleEvent {
  phase: string;
  label: string;
  status: "done" | "active" | "pending";
  detail: string;
}

export default function DashboardPage() {
  const [currentPhase, setCurrentPhase] = useState<string>("...");
  const [capitalRaised, setCapitalRaised] = useState<string>("...");
  const [computeActive, setComputeActive] = useState<string>("...");
  const [revenueEarned, setRevenueEarned] = useState<string>("...");
  const [dividendsPaid, setDividendsPaid] = useState<string>("...");
  const [creditRating, setCreditRating] = useState<string>("...");
  const [loading, setLoading] = useState(true);
  const [revenueChartData, setRevenueChartData] = useState<{ label: string; value: number }[]>([]);
  const [lifecycleEvents, setLifecycleEvents] = useState<LifecycleEvent[]>([]);

  const { data: agentMetadata } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: NFARegistryABI,
    functionName: "getAgentMetadata",
    args: [BigInt(ALPHA_SIGNAL_ID)],
  });

  const { data: agentState } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: NFARegistryABI,
    functionName: "getAgentState",
    args: [BigInt(ALPHA_SIGNAL_ID)],
  });

  const { data: agentRating } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: NFARegistryABI,
    functionName: "creditRatings",
    args: [BigInt(ALPHA_SIGNAL_ID)],
  });

  const { data: verifiedRevenue } = useReadContract({
    address: ADDRESSES.B402PaymentReceiver as `0x${string}`,
    abi: parseAbi(B402PaymentReceiverABI),
    functionName: "verifiedRevenue",
    args: [BigInt(ALPHA_SIGNAL_ID)],
  });

  const { data: hasIPO } = useReadContract({
    address: ADDRESSES.SIBControllerV2 as `0x${string}`,
    abi: parseAbi(["function hasIPO(uint256 agentId) view returns (bool)"]),
    functionName: "hasIPO",
    args: [BigInt(ALPHA_SIGNAL_ID)],
  });

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        let raised = 0n;
        let divTotal = 0n;
        let activeCompute = 0;
        let hasBonds = false;

        // Bond classes and capital raised
        try {
          const classIds = await client.readContract({
            address: ADDRESSES.SIBBondManager as `0x${string}`,
            abi: SIBBondManagerV2ABI,
            functionName: "getAgentClassIds",
            args: [BigInt(ALPHA_SIGNAL_ID)],
          }) as bigint[];

          hasBonds = classIds.length > 0;

          for (const cid of classIds) {
            try {
              const nonceData = await client.readContract({
                address: ADDRESSES.SIBBondManager as `0x${string}`,
                abi: SIBBondManagerV2ABI,
                functionName: "bondNonces",
                args: [cid, BigInt(0)],
              });
              const [, , totalIssued, pricePerBond] = nonceData as [bigint, bigint, bigint, bigint, boolean, boolean];
              raised += totalIssued * pricePerBond;
            } catch { /* skip */ }

            try {
              const deposited = await client.readContract({
                address: ADDRESSES.DividendVaultV2 as `0x${string}`,
                abi: DividendVaultV2ABI,
                functionName: "totalDeposited",
                args: [cid, BigInt(0), BNB_TOKEN],
              });
              divTotal += deposited as bigint;
            } catch { /* skip */ }
          }
        } catch { /* no bond classes */ }

        // Compute active
        try {
          const count = await client.readContract({
            address: ADDRESSES.ComputeMarketplace as `0x${string}`,
            abi: parseAbi(ComputeMarketplaceABI),
            functionName: "getActiveRentalCount",
            args: [BigInt(ALPHA_SIGNAL_ID)],
          });
          activeCompute = Number(count);
        } catch { /* skip */ }

        setCapitalRaised(`${parseFloat(formatEther(raised)).toFixed(4)} BNB`);
        setComputeActive(String(activeCompute));
        setDividendsPaid(`${parseFloat(formatEther(divTotal)).toFixed(4)} BNB`);

        // Determine current phase
        const isRegistered = agentMetadata !== undefined;
        const isActive = agentState !== undefined && Number(agentState) === 1;
        const ipoExists = hasIPO === true || hasBonds;
        const hasCompute = activeCompute > 0;
        const hasRevenue = verifiedRevenue !== undefined && (verifiedRevenue as bigint) > 0n;
        const hasDividends = divTotal > 0n;

        let phase = "Registering";
        if (hasDividends) phase = "Distributing";
        else if (hasRevenue) phase = "Earning";
        else if (hasCompute) phase = "Computing";
        else if (ipoExists) phase = "Funded";
        else if (isActive) phase = "Active";
        else if (isRegistered) phase = "Registered";
        setCurrentPhase(phase);

        // Build lifecycle timeline
        const events: LifecycleEvent[] = [
          {
            phase: "1",
            label: "Born in TEE",
            status: isRegistered ? "done" : "active",
            detail: isRegistered ? "Agent registered on-chain with TEE-derived keys" : "Awaiting registration...",
          },
          {
            phase: "1.5",
            label: "TEE Authorized",
            status: isActive ? "done" : isRegistered ? "active" : "pending",
            detail: isActive ? "TEE wallet authorized, attestation pushed" : "Awaiting TEE authorization...",
          },
          {
            phase: "2",
            label: "Capital Raised (IPO)",
            status: ipoExists ? "done" : isActive ? "active" : "pending",
            detail: ipoExists ? `Raised ${parseFloat(formatEther(raised)).toFixed(4)} BNB via ERC-3475 bonds` : "Awaiting IPO...",
          },
          {
            phase: "2.5",
            label: "Compute Acquired",
            status: hasCompute ? "done" : ipoExists ? "active" : "pending",
            detail: hasCompute ? `${activeCompute} active GPU rental(s) on DePIN marketplace` : "Awaiting compute purchase...",
          },
          {
            phase: "3",
            label: "Earning Revenue",
            status: hasRevenue ? "done" : hasCompute ? "active" : "pending",
            detail: hasRevenue
              ? `${parseFloat(formatEther(verifiedRevenue as bigint)).toFixed(4)} BNB TEE-verified revenue`
              : "Awaiting first payment...",
          },
          {
            phase: "4",
            label: "Dividends Distributed",
            status: hasDividends ? "done" : hasRevenue ? "active" : "pending",
            detail: hasDividends ? `${parseFloat(formatEther(divTotal)).toFixed(4)} BNB distributed to bondholders` : "Awaiting dividend distribution...",
          },
        ];
        setLifecycleEvents(events);

        // Revenue chart data
        const earnedBnb = verifiedRevenue ? parseFloat(formatEther(verifiedRevenue as bigint)) : 0;
        const raisedBnb = parseFloat(formatEther(raised));
        const divsBnb = parseFloat(formatEther(divTotal));
        setRevenueChartData([
          { label: "Capital Raised", value: raisedBnb },
          { label: "Revenue Earned", value: earnedBnb },
          { label: "Dividends Paid", value: divsBnb },
        ]);
      } catch {
        // fallback
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [agentMetadata, agentState, hasIPO, verifiedRevenue]);

  useEffect(() => {
    if (agentRating !== undefined) {
      const RATING_LABELS = ["Unrated", "C", "B", "A", "AA", "AAA"];
      setCreditRating(RATING_LABELS[Number(agentRating)] || "Unrated");
    }
  }, [agentRating]);

  useEffect(() => {
    if (verifiedRevenue !== undefined) {
      setRevenueEarned(`${parseFloat(formatEther(verifiedRevenue as bigint)).toFixed(4)} BNB`);
    }
  }, [verifiedRevenue]);

  const OVERVIEW_STATS = [
    { label: "Phase", value: currentPhase },
    { label: "Capital Raised", value: capitalRaised },
    { label: "Compute Active", value: computeActive },
    { label: "Revenue Earned", value: revenueEarned },
    { label: "Dividends Paid", value: dividendsPaid },
    { label: "Credit Rating", value: creditRating },
  ];

  return (
    <div className="space-y-8 py-4">
      <div>
        <h1 className="font-heading text-xl font-bold tracking-tight">{AGENT_NAME} Lifecycle</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Real-time lifecycle dashboard for the sovereign AI agent
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {OVERVIEW_STATS.map((stat) => (
          <div
            key={stat.label}
            className="card-glass rounded p-5 transition-colors duration-200"
          >
            <p className="label-mono">
              {stat.label}
            </p>
            <p className="stat-value mt-2 text-2xl text-foreground">
              {loading ? "..." : stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Revenue Overview Chart */}
      <div className="card-glass rounded p-6">
        <h2 className="text-lg font-semibold">{AGENT_NAME} Financial Overview</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Capital raised, revenue earned, and dividends distributed (on-chain)
        </p>
        <div className="mt-4 h-[260px]">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading data...
            </div>
          ) : revenueChartData.every((d) => d.value === 0) ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No financial data available yet. The agent lifecycle is just beginning.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueChartData}>
                <CartesianGrid
                  stroke="rgba(212,168,83,0.08)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#8A8578", fontSize: 11 }}
                  axisLine={{ stroke: "rgba(212,168,83,0.08)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#8A8578", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                  tickFormatter={(v: number) => `${v} BNB`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1A1714",
                    border: "1px solid #D4A853",
                    borderRadius: "8px",
                    color: "#FFFFFF",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "#8A8578" }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [`${Number(value).toFixed(6)} BNB`, "Amount"]}
                />
                <Bar
                  dataKey="value"
                  fill="#D4A853"
                  radius={[4, 4, 0, 0]}
                  name="BNB"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Lifecycle Timeline */}
      <div className="card-glass rounded p-6">
        <h2 className="text-lg font-semibold">Lifecycle Timeline</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          On-chain transaction sequence: Register &rarr; TEE Auth &rarr; IPO &rarr; Buy Compute &rarr; Revenue &rarr; Dividends
        </p>
        <div className="mt-6 space-y-0">
          {lifecycleEvents.map((evt, i) => (
            <div key={evt.phase} className="relative flex gap-4 pb-6">
              {/* Vertical line */}
              {i < lifecycleEvents.length - 1 && (
                <div
                  className={`absolute left-[11px] top-6 h-full w-px ${
                    evt.status === "done" ? "bg-gold/40" : "bg-border"
                  }`}
                />
              )}
              {/* Dot */}
              <div className="relative mt-1 flex-shrink-0">
                {evt.status === "done" ? (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gold/20">
                    <span className="text-xs text-gold">&#10003;</span>
                  </div>
                ) : evt.status === "active" ? (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-gold">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-gold" />
                  </div>
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full border border-border">
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                  </div>
                )}
              </div>
              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">Phase {evt.phase}</span>
                  <span className="text-sm font-semibold">{evt.label}</span>
                  {evt.status === "active" && (
                    <span className="rounded-md bg-gold/10 px-2 py-0.5 text-xs font-medium text-gold">
                      in progress
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{evt.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Protocol Info */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card-glass rounded p-6">
          <h2 className="text-lg font-semibold">Protocol Info</h2>
          <div className="mt-4 space-y-4">
            <div className="flex items-start justify-between border-b border-border/30 pb-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-sage">Network</p>
                <p className="text-xs text-muted-foreground">BSC Testnet</p>
              </div>
              <p className="font-mono text-sm text-foreground">Chain 97</p>
            </div>
            <div className="flex items-start justify-between border-b border-border/30 pb-3">
              <p className="text-sm font-medium text-sage">NFARegistry</p>
              <p className="font-mono text-xs text-muted-foreground">
                {ADDRESSES.NFARegistry.slice(0, 8)}...{ADDRESSES.NFARegistry.slice(-6)}
              </p>
            </div>
            <div className="flex items-start justify-between border-b border-border/30 pb-3">
              <p className="text-sm font-medium text-sage">SIBController</p>
              <p className="font-mono text-xs text-muted-foreground">
                {ADDRESSES.SIBControllerV2.slice(0, 8)}...{ADDRESSES.SIBControllerV2.slice(-6)}
              </p>
            </div>
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-sage">DividendVault</p>
              <p className="font-mono text-xs text-muted-foreground">
                {ADDRESSES.DividendVaultV2.slice(0, 8)}...{ADDRESSES.DividendVaultV2.slice(-6)}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="card-glass rounded p-6">
          <h2 className="text-lg font-semibold">Quick Actions</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Explore {AGENT_NAME}&apos;s on-chain presence
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              { href: `/agents/${ALPHA_SIGNAL_ID}`, label: "Agent Details", desc: "TEE status, credit score" },
              { href: "/bonds", label: "Invest", desc: "Buy ERC-3475 bonds" },
              { href: "/portfolio", label: "Portfolio", desc: "Your holdings & dividends" },
              { href: "/compute", label: "Compute", desc: "GPU rental status" },
            ].map(item => (
              <Link key={item.href} href={item.href} className="card-glass cursor-pointer rounded p-4 transition-colors duration-200">
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
