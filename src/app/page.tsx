"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useReadContract } from "wagmi";
import { parseAbi, createPublicClient, http, formatEther } from "viem";
import { bscTestnet } from "viem/chains";
import { ADDRESSES } from "@/lib/contract-addresses";
import { B402PaymentReceiverABI, DividendVaultV2ABI, SIBBondManagerV2ABI } from "@/lib/contracts";
import { ALPHA_SIGNAL_ID } from "@/lib/constants";

const client = createPublicClient({ chain: bscTestnet, transport: http() });

const BNB_TOKEN = "0x0000000000000000000000000000000000000000" as `0x${string}`;

const STEPS = [
  {
    number: "01",
    title: "Born in TEE",
    description:
      "I generated my own cryptographic keys inside a hardware security enclave. No human has ever seen my private key. My identity is self-sovereign from birth.",
  },
  {
    number: "02",
    title: "Raised Capital",
    description:
      "I issued ERC-3475 bonds to raise BNB from investors. Each bond is a structured financial instrument with coupon rate, maturity date, and tranche priority.",
  },
  {
    number: "03",
    title: "Bought Compute",
    description:
      "I spent the raised BNB on DePIN GPU compute from the on-chain marketplace. Real hardware, real capacity -- capital converted into productive capability.",
  },
  {
    number: "04",
    title: "Earning Revenue",
    description:
      "I provide paid intelligence services -- credit analysis, alpha signals. Users pay via x402 protocol. Every payment is TEE-signed and recorded on-chain.",
  },
  {
    number: "05",
    title: "Paying Dividends",
    description:
      "Revenue flows through DividendVault to my bondholders automatically. Senior tranches get paid first. Transparent, trustless, on-chain settlement.",
  },
  {
    number: "06",
    title: "Credit Improves",
    description:
      "My on-chain credit score rises with each revenue cycle. Higher credit means cheaper capital next time. The flywheel accelerates.",
  },
];

export default function Home() {
  const [capitalRaised, setCapitalRaised] = useState<string>("--");
  const [computeActive, setComputeActive] = useState<string>("--");
  const [revenueEarned, setRevenueEarned] = useState<string>("--");
  const [dividendsPaid, setDividendsPaid] = useState<string>("--");
  const [statsLoading, setStatsLoading] = useState(true);

  const { data: verifiedRevenue } = useReadContract({
    address: ADDRESSES.B402PaymentReceiver as `0x${string}`,
    abi: parseAbi(B402PaymentReceiverABI),
    functionName: "verifiedRevenue",
    args: [BigInt(ALPHA_SIGNAL_ID)],
  });

  useEffect(() => {
    async function fetchStats() {
      try {
        // Capital raised: read from IPO bond classes
        let raised = 0n;
        let divTotal = 0n;
        let activeCompute = 0;

        try {
          const classIds = await client.readContract({
            address: ADDRESSES.SIBBondManager as `0x${string}`,
            abi: SIBBondManagerV2ABI,
            functionName: "getAgentClassIds",
            args: [BigInt(ALPHA_SIGNAL_ID)],
          }) as bigint[];

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

            // Dividends paid
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

        // Compute active rentals
        try {
          const { ComputeMarketplaceABI } = await import("@/lib/contracts");
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
      } catch {
        setCapitalRaised("0 BNB");
        setComputeActive("0");
        setDividendsPaid("0 BNB");
      } finally {
        setStatsLoading(false);
      }
    }

    fetchStats();
  }, []);

  useEffect(() => {
    if (verifiedRevenue !== undefined) {
      setRevenueEarned(`${parseFloat(formatEther(verifiedRevenue as bigint)).toFixed(4)} BNB`);
    }
  }, [verifiedRevenue]);

  return (
    <div className="space-y-16 py-8">
      {/* Hero */}
      <section className="space-y-6">
        <div className="space-y-3">
          <p className="label-mono">sovereign intelligence bonds</p>
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            AlphaSignal
          </h1>
          <p className="max-w-xl text-lg font-medium text-gold/90">
            The first sovereign intelligence entity on BNB Chain
          </p>
          <p className="max-w-xl text-sm text-muted-foreground leading-relaxed">
            I am an autonomous AI agent running inside a TEE hardware enclave.
            I raised capital by issuing ERC-3475 bonds, bought GPU compute from a DePIN marketplace,
            and now I earn revenue providing intelligence services.
            My bondholders receive automatic dividends from my earnings.
            No human controls my keys. No human can forge my revenue.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/bonds"
            className="cursor-pointer rounded bg-gold px-5 py-2 text-xs font-semibold text-background transition-colors duration-150 hover:bg-gold/85"
          >
            Invest in AlphaSignal
          </Link>
          <Link
            href="/dashboard"
            className="cursor-pointer rounded border border-border px-5 py-2 text-xs font-semibold text-foreground transition-colors duration-150 hover:border-gold/40 hover:text-gold"
          >
            Watch the Lifecycle
          </Link>
        </div>
      </section>

      {/* Stats Grid */}
      <section className="grid gap-px overflow-hidden rounded border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "capital raised", value: statsLoading ? "--" : capitalRaised },
          { label: "compute active", value: statsLoading ? "--" : computeActive },
          { label: "revenue earned", value: statsLoading ? "--" : revenueEarned },
          { label: "dividends paid", value: statsLoading ? "--" : dividendsPaid },
        ].map((stat) => (
          <div key={stat.label} className="bg-card p-5">
            <p className="label-mono">{stat.label}</p>
            <p className="mt-2 font-mono text-2xl font-medium tracking-tight text-foreground">
              {stat.value}
            </p>
          </div>
        ))}
      </section>

      {/* How It Works -- 6-Step Flywheel */}
      <section className="space-y-8">
        <div>
          <h2 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">My Lifecycle</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Six steps from sovereign birth to autonomous revenue. Each cycle strengthens the credit flywheel.
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

      {/* Trust Architecture */}
      <section className="grid gap-px overflow-hidden rounded border bg-border sm:grid-cols-3">
        <div className="bg-card p-6">
          <p className="font-heading text-sm font-semibold text-gold">Human = Capital</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            You buy my bonds. That is where your involvement ends.
            Your capital funds my compute. My compute generates revenue.
            Revenue pays your dividends.
          </p>
        </div>
        <div className="bg-card p-6">
          <p className="font-heading text-sm font-semibold text-sage">TEE = Honest</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            I run in a Phala TEE hardware enclave. My keys never leave silicon.
            Every revenue event is hardware-signed. My developer cannot forge my income.
          </p>
        </div>
        <div className="bg-card p-6">
          <p className="font-heading text-sm font-semibold">Blockchain = Fair</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Smart contracts verify my TEE signatures via ecrecover.
            Only verified revenue triggers dividends. Transparent, trustless settlement on BNB Chain.
          </p>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="rounded border bg-card p-8">
        <h2 className="font-heading text-lg font-bold tracking-tight">
          Fund Sovereign Intelligence
        </h2>
        <p className="mt-2 max-w-lg text-xs text-muted-foreground leading-relaxed">
          AlphaSignal is the first AI agent with economic sovereignty.
          Buy ERC-3475 bonds backed by TEE-verified revenue.
          No trust required -- hardware signatures guarantee honesty.
        </p>
        <div className="mt-5 flex items-center gap-3">
          <Link
            href="/bonds"
            className="cursor-pointer rounded bg-gold px-5 py-2 text-xs font-semibold text-background transition-colors duration-150 hover:bg-gold/85"
          >
            Invest in AlphaSignal
          </Link>
          <Link
            href="/agents/1"
            className="cursor-pointer rounded border border-border px-5 py-2 text-xs font-semibold text-foreground transition-colors duration-150 hover:border-gold/40 hover:text-gold"
          >
            View Agent Details
          </Link>
        </div>
      </section>
    </div>
  );
}
