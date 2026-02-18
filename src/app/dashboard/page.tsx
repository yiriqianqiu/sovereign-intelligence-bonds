"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { formatEther } from "viem";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import { NFARegistryABI, SIBBondManagerV2ABI, BondDEXABI, BondholderGovernorABI, DividendVaultV2ABI } from "@/lib/contracts";
import { ADDRESSES } from "@/lib/contract-addresses";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const RATING_LABELS = ["Unrated", "C", "B", "A", "AA", "AAA"];
const BNB_TOKEN = "0x0000000000000000000000000000000000000000" as `0x${string}`;

interface AgentSummary {
  id: bigint;
  name: string;
  rating: number;
  sharpe: bigint;
  totalEarned: bigint;
}

interface AgentRevenueBar {
  name: string;
  revenue: number;
}

const client = createPublicClient({ chain: bscTestnet, transport: http() });

function getRatingColor(rating: string): string {
  switch (rating) {
    case "AAA":
      return "text-gold";
    case "AA":
      return "text-sage";
    case "A":
      return "text-foreground";
    case "B":
      return "text-muted-foreground";
    case "C":
      return "text-copper";
    default:
      return "text-muted-foreground";
  }
}

export default function DashboardPage() {
  const { isConnected } = useAccount();
  const [topAgents, setTopAgents] = useState<AgentSummary[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [activeBondClasses, setActiveBondClasses] = useState<string>("...");
  const [revenueDistributed, setRevenueDistributed] = useState<string>("...");
  const [protocolTvl, setProtocolTvl] = useState<string>("...");
  const [dexOrders, setDexOrders] = useState<string>("...");
  const [govProposals, setGovProposals] = useState<string>("...");
  const [revenueChartData, setRevenueChartData] = useState<AgentRevenueBar[]>([]);

  const { data: totalSupply, isLoading: supplyLoading } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: NFARegistryABI,
    functionName: "totalSupply",
  });

  // Read DEX order count
  const { data: dexOrderCount } = useReadContract({
    address: ADDRESSES.BondDEX as `0x${string}`,
    abi: BondDEXABI,
    functionName: "getOrderCount",
  });

  // Read governance proposal count
  const { data: govProposalCount } = useReadContract({
    address: ADDRESSES.BondholderGovernor as `0x${string}`,
    abi: BondholderGovernorABI,
    functionName: "getProposalCount",
  });

  // Update DEX orders when data arrives
  useEffect(() => {
    if (dexOrderCount !== undefined) {
      setDexOrders(Number(dexOrderCount).toLocaleString());
    }
  }, [dexOrderCount]);

  // Update governance proposals when data arrives
  useEffect(() => {
    if (govProposalCount !== undefined) {
      setGovProposals(Number(govProposalCount).toLocaleString());
    }
  }, [govProposalCount]);

  // Fetch top agents data + dashboard stats
  useEffect(() => {
    async function fetchAgents() {
      if (!totalSupply || totalSupply === 0n) {
        setAgentsLoading(false);
        setActiveBondClasses("0");
        setRevenueDistributed("0 BNB");
        // Still fetch TVL even with 0 agents
        try {
          const [vaultBal, controllerBal] = await Promise.all([
            client.getBalance({ address: ADDRESSES.DividendVaultV2 as `0x${string}` }),
            client.getBalance({ address: ADDRESSES.SIBControllerV2 as `0x${string}` }),
          ]);
          const tvlBnb = parseFloat(formatEther(vaultBal + controllerBal));
          setProtocolTvl(`${tvlBnb.toFixed(4)} BNB`);
        } catch {
          setProtocolTvl("0 BNB");
        }
        return;
      }

      const count = Number(totalSupply);
      const limit = Math.min(count, 20);
      const agents: AgentSummary[] = [];
      let bondClassCount = 0;
      let totalDividends = 0n;
      const chartBars: AgentRevenueBar[] = [];

      for (let i = 0; i < limit; i++) {
        try {
          const tokenId = await client.readContract({
            address: ADDRESSES.NFARegistry as `0x${string}`,
            abi: NFARegistryABI,
            functionName: "tokenByIndex",
            args: [BigInt(i)],
          });

          const [metadata, rating, revenue] = await Promise.all([
            client.readContract({
              address: ADDRESSES.NFARegistry as `0x${string}`,
              abi: NFARegistryABI,
              functionName: "getAgentMetadata",
              args: [tokenId as bigint],
            }),
            client.readContract({
              address: ADDRESSES.NFARegistry as `0x${string}`,
              abi: NFARegistryABI,
              functionName: "creditRatings",
              args: [tokenId as bigint],
            }),
            client.readContract({
              address: ADDRESSES.NFARegistry as `0x${string}`,
              abi: NFARegistryABI,
              functionName: "getRevenueProfile",
              args: [tokenId as bigint],
            }),
          ]);

          const meta = metadata as { name: string };
          const rev = revenue as { totalEarned: bigint; sharpeRatio: bigint };

          agents.push({
            id: tokenId as bigint,
            name: meta.name,
            rating: Number(rating),
            sharpe: rev.sharpeRatio,
            totalEarned: rev.totalEarned,
          });

          // Chart data: revenue per agent
          const earnedBnb = parseFloat(formatEther(rev.totalEarned));
          if (earnedBnb > 0) {
            chartBars.push({ name: meta.name, revenue: earnedBnb });
          }

          // v2: Count active bond classes via getAgentClassIds
          try {
            const classIds = await client.readContract({
              address: ADDRESSES.SIBBondManager as `0x${string}`,
              abi: SIBBondManagerV2ABI,
              functionName: "getAgentClassIds",
              args: [tokenId as bigint],
            }) as bigint[];

            if (classIds && classIds.length > 0) {
              bondClassCount += classIds.length;

              // Read total deposited dividends for each class
              for (const cid of classIds) {
                try {
                  const deposited = await client.readContract({
                    address: ADDRESSES.DividendVaultV2 as `0x${string}`,
                    abi: DividendVaultV2ABI,
                    functionName: "totalDeposited",
                    args: [cid, BigInt(0), BNB_TOKEN],
                  });
                  totalDividends += deposited as bigint;
                } catch {
                  // skip
                }
              }
            }
          } catch {
            // fallback: agent may not have bond classes
          }
        } catch {
          // skip agents that can't be read
        }
      }

      setActiveBondClasses(bondClassCount.toLocaleString());
      const totalDivBnb = parseFloat(formatEther(totalDividends));
      setRevenueDistributed(`${totalDivBnb.toFixed(4)} BNB`);

      // Fetch Protocol TVL
      try {
        const [vaultBal, controllerBal] = await Promise.all([
          client.getBalance({ address: ADDRESSES.DividendVaultV2 as `0x${string}` }),
          client.getBalance({ address: ADDRESSES.SIBControllerV2 as `0x${string}` }),
        ]);
        const tvlBnb = parseFloat(formatEther(vaultBal + controllerBal));
        setProtocolTvl(`${tvlBnb.toFixed(4)} BNB`);
      } catch {
        setProtocolTvl("0 BNB");
      }

      // Sort chart data by revenue desc
      chartBars.sort((a, b) => b.revenue - a.revenue);
      setRevenueChartData(chartBars);

      // Sort by rating desc, then sharpe desc
      agents.sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return Number(b.sharpe) - Number(a.sharpe);
      });

      setTopAgents(agents.slice(0, 5));
      setAgentsLoading(false);
    }

    fetchAgents();
  }, [totalSupply]);

  if (!isConnected) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="card-glass rounded-xl p-10 text-center">
          <h2 className="text-xl font-bold">Connect Wallet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect your wallet to view the protocol dashboard.
          </p>
        </div>
      </div>
    );
  }

  const agentCount = totalSupply ? Number(totalSupply).toLocaleString() : "0";

  const OVERVIEW_STATS = [
    { label: "Protocol TVL", value: protocolTvl },
    { label: "Active Bond Classes", value: activeBondClasses },
    { label: "Total Agents", value: supplyLoading ? "..." : agentCount },
    { label: "Revenue Distributed", value: revenueDistributed },
    { label: "DEX Orders", value: dexOrders },
    { label: "Governance Proposals", value: govProposals },
  ];

  return (
    <div className="space-y-8 py-4">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Protocol overview and recent activity
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {OVERVIEW_STATS.map((stat) => (
          <div
            key={stat.label}
            className="card-glass rounded-xl p-5 transition-colors duration-200"
          >
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </p>
            <p className="stat-value mt-2 text-2xl text-foreground">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Agent Revenue Breakdown */}
      <div className="card-glass rounded-xl p-6">
        <h2 className="text-lg font-semibold">Agent Revenue Breakdown</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Total earned revenue per agent (on-chain)
        </p>
        <div className="mt-4 h-[260px]">
          {agentsLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading agent data...
            </div>
          ) : revenueChartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No agent revenue data available yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueChartData}>
                <CartesianGrid
                  stroke="rgba(212,168,83,0.08)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#8A8578", fontSize: 11 }}
                  axisLine={{ stroke: "rgba(212,168,83,0.08)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#8A8578", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={50}
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
                  formatter={(value: any) => [`${Number(value).toFixed(6)} BNB`, "Revenue"]}
                />
                <Bar
                  dataKey="revenue"
                  fill="#D4A853"
                  radius={[4, 4, 0, 0]}
                  name="Revenue (BNB)"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Recent Activity */}
        <div className="card-glass rounded-xl p-6 lg:col-span-2">
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
              <div className="space-y-1">
                <p className="text-sm font-medium text-sage">NFARegistry</p>
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                {ADDRESSES.NFARegistry.slice(0, 8)}...{ADDRESSES.NFARegistry.slice(-6)}
              </p>
            </div>
            <div className="flex items-start justify-between border-b border-border/30 pb-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-sage">SIBController</p>
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                {ADDRESSES.SIBControllerV2.slice(0, 8)}...{ADDRESSES.SIBControllerV2.slice(-6)}
              </p>
            </div>
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-sage">DividendVault</p>
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                {ADDRESSES.DividendVaultV2.slice(0, 8)}...{ADDRESSES.DividendVaultV2.slice(-6)}
              </p>
            </div>
          </div>
        </div>

        {/* Top Agents Table */}
        <div className="card-glass rounded-xl p-6 lg:col-span-3">
          <h2 className="text-lg font-semibold">Top Agents</h2>
          {agentsLoading ? (
            <div className="mt-6 text-center text-sm text-muted-foreground">
              Loading agents...
            </div>
          ) : topAgents.length === 0 ? (
            <div className="mt-6 text-center text-sm text-muted-foreground">
              No agents registered yet.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Agent
                    </th>
                    <th className="pb-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Rating
                    </th>
                    <th className="pb-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Sharpe
                    </th>
                    <th className="pb-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Total Earned
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topAgents.map((agent) => {
                    const ratingLabel = RATING_LABELS[agent.rating] || "Unrated";
                    const sharpeDisplay = agent.sharpe > 0n
                      ? (Number(agent.sharpe) / 1000).toFixed(3)
                      : "--";
                    return (
                      <tr
                        key={agent.id.toString()}
                        className="cursor-pointer border-b border-border/20 transition-colors duration-200 last:border-0 hover:bg-secondary/30"
                      >
                        <td className="py-3 font-medium">{agent.name}</td>
                        <td className="py-3 text-center">
                          <span
                            className={`font-mono text-xs font-semibold ${getRatingColor(ratingLabel)}`}
                          >
                            {ratingLabel}
                          </span>
                        </td>
                        <td className="py-3 text-right font-mono text-sage">
                          {sharpeDisplay}
                        </td>
                        <td className="py-3 text-right font-mono">
                          {formatEther(agent.totalEarned)} BNB
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="text-lg font-semibold">Quick Links</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Navigate to v2 protocol features
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { href: "/market", label: "Bond DEX", desc: "Secondary market trading" },
            { href: "/governance", label: "Governance", desc: "Bondholder voting" },
            { href: "/vault", label: "Auto-Compound", desc: "Reinvest dividends" },
            { href: "/indices", label: "Index Bonds", desc: "Diversified baskets" },
            { href: "/liquidations", label: "Liquidations", desc: "At-risk agents" },
          ].map(item => (
            <Link key={item.href} href={item.href} className="card-glass cursor-pointer rounded-xl p-4 transition-colors duration-200">
              <p className="text-sm font-semibold">{item.label}</p>
              <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">{item.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
