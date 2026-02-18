"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useReadContract } from "wagmi";
import { parseAbi, createPublicClient, http, formatEther } from "viem";
import { bscTestnet } from "viem/chains";
import { ADDRESSES } from "@/lib/contract-addresses";
import { NFARegistryABI, X402PaymentReceiverABI, SIBControllerV2ABI } from "@/lib/contracts";

const client = createPublicClient({ chain: bscTestnet, transport: http() });

const STEPS = [
  {
    number: "01",
    title: "Register Agent",
    description:
      "Onboard your AI agent with BAP-578 credentials. The protocol verifies identity, capability, and revenue history to establish an initial credit rating.",
  },
  {
    number: "02",
    title: "IPO Bond Class",
    description:
      "Securitize future revenue streams into ERC-3475 bond classes. zkML proofs verify Sharpe ratios and risk metrics on-chain, enabling transparent pricing.",
  },
  {
    number: "03",
    title: "Earn Dividends",
    description:
      "Bond holders receive automated dividend distributions via x402 payment channels. Revenue flows are cryptographically verified before each payout.",
  },
];

export default function Home() {
  const [tvl, setTvl] = useState<string>("...");
  const [activeBonds, setActiveBonds] = useState<string>("...");
  const [statsLoading, setStatsLoading] = useState(true);

  // Read real agent count from chain
  const { data: agentCount, isLoading: agentCountLoading } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: parseAbi(NFARegistryABI),
    functionName: "totalSupply",
  });

  // Read real payment count from chain
  const { data: paymentCount } = useReadContract({
    address: ADDRESSES.X402PaymentReceiverV2 as `0x${string}`,
    abi: parseAbi(X402PaymentReceiverABI),
    functionName: "getPaymentCount",
  });

  // Fetch TVL (DividendVault balance) and active bond count
  useEffect(() => {
    async function fetchStats() {
      try {
        // TVL: BNB balance of DividendVault
        const vaultBalance = await client.getBalance({
          address: ADDRESSES.DividendVaultV2 as `0x${string}`,
        });
        const tvlBnb = parseFloat(formatEther(vaultBalance));
        setTvl(`${tvlBnb.toFixed(4)} BNB`);

        // Active Bonds: iterate agents and count those with hasIPO
        if (agentCount !== undefined && Number(agentCount) > 0) {
          const count = Number(agentCount);
          let bondCount = 0;
          for (let i = 0; i < count; i++) {
            try {
              const tokenId = await client.readContract({
                address: ADDRESSES.NFARegistry as `0x${string}`,
                abi: NFARegistryABI,
                functionName: "tokenByIndex",
                args: [BigInt(i)],
              });
              const hasIPO = await client.readContract({
                address: ADDRESSES.SIBControllerV2 as `0x${string}`,
                abi: SIBControllerV2ABI,
                functionName: "hasIPO",
                args: [tokenId as bigint],
              });
              if (hasIPO) bondCount++;
            } catch {
              // skip
            }
          }
          setActiveBonds(bondCount.toLocaleString());
        } else {
          setActiveBonds("0");
        }
      } catch {
        setTvl("0 BNB");
        setActiveBonds("0");
      } finally {
        setStatsLoading(false);
      }
    }

    fetchStats();
  }, [agentCount]);

  const heroStats = [
    {
      label: "Total Value Locked",
      value: statsLoading ? "..." : tvl,
      subtext: "On-Chain",
    },
    {
      label: "Active Bonds",
      value: statsLoading ? "..." : activeBonds,
      subtext: "On-Chain",
    },
    {
      label: "Registered Agents",
      value: agentCountLoading
        ? "..."
        : agentCount !== undefined
        ? Number(agentCount).toLocaleString()
        : "0",
      subtext: "On-Chain",
    },
  ];

  return (
    <div className="space-y-20 py-8">
      {/* Hero */}
      <section className="space-y-8 text-center">
        <div className="space-y-4">
          <p className="text-sm font-medium uppercase tracking-widest text-gold">
            Sovereign Intelligence Bonds
          </p>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            Agent Wall Street
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Securitize AI agent revenue streams into tradable bond instruments.
            Verifiable credit ratings powered by zkML. Automated dividends via
            x402 payment channels.
          </p>
        </div>

        <div className="flex items-center justify-center gap-4">
          <Link
            href="/agents"
            className="cursor-pointer rounded-lg bg-gold px-6 py-3 text-sm font-semibold text-background transition-colors duration-200 hover:bg-gold/90"
          >
            Explore Agents
          </Link>
          <Link
            href="/bonds"
            className="cursor-pointer rounded-lg border border-gold/30 px-6 py-3 text-sm font-semibold text-gold transition-colors duration-200 hover:border-gold/60 hover:bg-gold/5"
          >
            View Bonds
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="grid gap-6 sm:grid-cols-3">
        {heroStats.map((stat) => (
          <div
            key={stat.label}
            className="card-glass glow-gold rounded-xl p-6 transition-colors duration-200"
          >
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="stat-value mt-2 text-3xl text-foreground">
              {stat.value}
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {stat.subtext}
            </p>
          </div>
        ))}
      </section>

      {/* Protocol Stats */}
      {paymentCount !== undefined && Number(paymentCount) > 0 && (
        <section className="card-glass rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">x402 Payments Processed</p>
              <p className="stat-value mt-1 text-2xl text-foreground font-mono">
                {Number(paymentCount).toLocaleString()}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">On-Chain</p>
          </div>
        </section>
      )}

      {/* How It Works */}
      <section className="space-y-10">
        <div className="text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">How It Works</h2>
          <p className="mt-2 text-muted-foreground">
            Three steps from agent registration to automated revenue distribution
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div
              key={step.number}
              className="card-glass rounded-xl p-6 transition-colors duration-200"
            >
              <span className="stat-value text-3xl text-gold/40">
                {step.number}
              </span>
              <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="card-glass glow-gold rounded-xl p-10 text-center">
        <h2 className="text-2xl font-bold">Start Building on Agent Wall Street</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Register your AI agents, create bond classes backed by verifiable
          revenue streams, and tap into the first decentralized market for
          machine credit.
        </p>
        <div className="mt-6 flex items-center justify-center gap-4">
          <Link
            href="/agents"
            className="cursor-pointer rounded-lg bg-gold px-6 py-3 text-sm font-semibold text-background transition-colors duration-200 hover:bg-gold/90"
          >
            Register Agent
          </Link>
          <Link
            href="/dashboard"
            className="cursor-pointer rounded-lg border border-border px-6 py-3 text-sm font-semibold text-foreground transition-colors duration-200 hover:border-gold/30 hover:text-gold"
          >
            View Dashboard
          </Link>
        </div>
      </section>
    </div>
  );
}
