"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useReadContract } from "wagmi";
import { parseAbi, createPublicClient, http, formatEther } from "viem";
import { bscTestnet } from "viem/chains";
import { ADDRESSES } from "@/lib/contract-addresses";
import { NFARegistryABI, B402PaymentReceiverABI, SIBControllerV2ABI } from "@/lib/contracts";

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
      "Bond holders receive automated dividend distributions via b402 payment channels. Revenue flows are cryptographically verified before each payout.",
  },
];

export default function Home() {
  const [tvl, setTvl] = useState<string>("--");
  const [activeBonds, setActiveBonds] = useState<string>("--");
  const [statsLoading, setStatsLoading] = useState(true);

  const { data: agentCount, isLoading: agentCountLoading } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: parseAbi(NFARegistryABI),
    functionName: "totalSupply",
  });

  const { data: paymentCount } = useReadContract({
    address: ADDRESSES.B402PaymentReceiver as `0x${string}`,
    abi: parseAbi(B402PaymentReceiverABI),
    functionName: "getPaymentCount",
  });

  useEffect(() => {
    async function fetchStats() {
      try {
        const vaultBalance = await client.getBalance({
          address: ADDRESSES.DividendVaultV2 as `0x${string}`,
        });
        const tvlBnb = parseFloat(formatEther(vaultBalance));
        setTvl(`${tvlBnb.toFixed(4)} BNB`);

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
          setActiveBonds(String(bondCount));
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

  return (
    <div className="space-y-16 py-8">
      {/* Hero */}
      <section className="space-y-6">
        <div className="space-y-3">
          <p className="label-mono">sovereign intelligence bonds</p>
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Agent Wall Street
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground leading-relaxed">
            Securitize AI agent revenue streams into tradable bond instruments.
            Verifiable credit ratings powered by zkML. Automated dividends via
            b402 payment channels.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/agents"
            className="cursor-pointer rounded bg-gold px-5 py-2 text-xs font-semibold text-background transition-colors duration-150 hover:bg-gold/85"
          >
            explore agents
          </Link>
          <Link
            href="/bonds"
            className="cursor-pointer rounded border border-border px-5 py-2 text-xs font-semibold text-foreground transition-colors duration-150 hover:border-gold/40 hover:text-gold"
          >
            view bonds
          </Link>
        </div>
      </section>

      {/* Stats Grid */}
      <section className="grid gap-px overflow-hidden rounded border bg-border sm:grid-cols-3">
        {[
          {
            label: "tvl",
            value: statsLoading ? "--" : tvl,
          },
          {
            label: "active bonds",
            value: statsLoading ? "--" : activeBonds,
          },
          {
            label: "registered agents",
            value: agentCountLoading
              ? "--"
              : agentCount !== undefined
              ? String(Number(agentCount))
              : "0",
          },
        ].map((stat) => (
          <div key={stat.label} className="bg-card p-5">
            <p className="label-mono">{stat.label}</p>
            <p className="mt-2 font-mono text-2xl font-medium tracking-tight text-foreground">
              {stat.value}
            </p>
          </div>
        ))}
      </section>

      {/* b402 Payment Count */}
      {paymentCount !== undefined && Number(paymentCount) > 0 && (
        <section className="rounded border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="label-mono">b402 payments processed</p>
              <p className="mt-1 font-mono text-xl font-medium text-foreground">
                {Number(paymentCount).toLocaleString()}
              </p>
            </div>
            <span className="label-mono">on-chain</span>
          </div>
        </section>
      )}

      {/* How It Works */}
      <section className="space-y-8">
        <div>
          <h2 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">How It Works</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Three steps from agent registration to automated revenue distribution.
          </p>
        </div>

        <div className="grid gap-px overflow-hidden rounded border bg-border sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.number} className="bg-card p-5">
              <span className="font-mono text-2xl font-light text-gold/30">
                {step.number}
              </span>
              <h3 className="mt-3 font-heading text-sm font-semibold">{step.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="rounded border bg-card p-8">
        <h2 className="font-heading text-lg font-bold tracking-tight">
          Start Building on Agent Wall Street
        </h2>
        <p className="mt-2 max-w-lg text-xs text-muted-foreground leading-relaxed">
          Register your AI agents, create bond classes backed by verifiable
          revenue streams, and tap into the first decentralized market for
          machine credit.
        </p>
        <div className="mt-5 flex items-center gap-3">
          <Link
            href="/agents"
            className="cursor-pointer rounded bg-gold px-5 py-2 text-xs font-semibold text-background transition-colors duration-150 hover:bg-gold/85"
          >
            register agent
          </Link>
          <Link
            href="/dashboard"
            className="cursor-pointer rounded border border-border px-5 py-2 text-xs font-semibold text-foreground transition-colors duration-150 hover:border-gold/40 hover:text-gold"
          >
            view dashboard
          </Link>
        </div>
      </section>
    </div>
  );
}
