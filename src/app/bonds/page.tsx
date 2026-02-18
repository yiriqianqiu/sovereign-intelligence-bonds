"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useReadContract } from "wagmi";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import { formatEther } from "viem";
import { NFARegistryABI, SIBBondManagerV2ABI } from "@/lib/contracts";
import { ADDRESSES } from "@/lib/contract-addresses";
import BondCard from "@/components/BondCard";

const client = createPublicClient({ chain: bscTestnet, transport: http() });

const TRANCHE_LABELS = ["Standard", "Senior", "Junior"] as const;
const TRANCHE_FILTERS = ["All", "Standard", "Senior", "Junior"] as const;

interface BondClassData {
  classId: number;
  agentId: number;
  agentName: string;
  couponRateBps: number;
  maturityPeriod: number;
  sharpeRatioAtIssue: number;
  maxSupply: number;
  totalIssued: number;
  pricePerBond: bigint;
  tranche: number;       // 0=standard, 1=senior, 2=junior
  paymentToken: string;   // address(0) = BNB
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export default function BondsPage() {
  const [bondClasses, setBondClasses] = useState<BondClassData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trancheFilter, setTrancheFilter] = useState<string>("All");

  const { data: totalSupply } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: NFARegistryABI,
    functionName: "totalSupply",
  });

  useEffect(() => {
    if (totalSupply === undefined) return;

    const count = Number(totalSupply);
    if (count === 0) {
      setBondClasses([]);
      setLoading(false);
      return;
    }

    async function fetchBondClasses() {
      try {
        const classes: BondClassData[] = [];

        // Iterate through all agents and use getAgentClassIds to find bond classes
        for (let i = 0; i < count; i++) {
          const agentId = await client.readContract({
            address: ADDRESSES.NFARegistry as `0x${string}`,
            abi: NFARegistryABI,
            functionName: "tokenByIndex",
            args: [BigInt(i)],
          });

          // v2: get all class IDs for this agent
          let classIds: bigint[];
          try {
            classIds = await client.readContract({
              address: ADDRESSES.SIBBondManager as `0x${string}`,
              abi: SIBBondManagerV2ABI,
              functionName: "getAgentClassIds",
              args: [agentId as bigint],
            }) as bigint[];
          } catch {
            continue; // no bond classes for this agent
          }

          if (!classIds || classIds.length === 0) continue;

          // Get agent name once
          let agentName = `Agent #${Number(agentId)}`;
          try {
            const metadata = await client.readContract({
              address: ADDRESSES.NFARegistry as `0x${string}`,
              abi: NFARegistryABI,
              functionName: "getAgentMetadata",
              args: [agentId as bigint],
            });
            const metaTuple = metadata as { name: string; description: string; modelHash: string; endpoint: string; registeredAt: bigint };
            if (metaTuple.name) agentName = metaTuple.name;
          } catch {
            // Keep default name
          }

          // Read each bond class
          for (const classId of classIds) {
            try {
              const bondClass = await client.readContract({
                address: ADDRESSES.SIBBondManager as `0x${string}`,
                abi: SIBBondManagerV2ABI,
                functionName: "bondClasses",
                args: [classId],
              });

              // v2 bondClasses returns: (agentId, couponRateBps, maturityPeriod, sharpeRatioAtIssue, maxSupply, tranche, paymentToken, exists)
              const [bcAgentId, couponRateBps, maturityPeriod, sharpeRatioAtIssue, maxSupply, tranche, paymentToken, exists] = bondClass as [bigint, bigint, bigint, bigint, bigint, number, string, boolean];

              if (!exists) continue;

              // Read nonce 0 data for supply and price
              let totalIssued = 0;
              let pricePerBond = BigInt(0);
              try {
                const nonceData = await client.readContract({
                  address: ADDRESSES.SIBBondManager as `0x${string}`,
                  abi: SIBBondManagerV2ABI,
                  functionName: "bondNonces",
                  args: [classId, BigInt(0)],
                });
                const [, , ti, ppb] = nonceData as [bigint, bigint, bigint, bigint, boolean, boolean];
                totalIssued = Number(ti);
                pricePerBond = ppb;
              } catch {
                // nonce 0 may not exist yet
              }

              classes.push({
                classId: Number(classId),
                agentId: Number(bcAgentId),
                agentName,
                couponRateBps: Number(couponRateBps),
                maturityPeriod: Number(maturityPeriod),
                sharpeRatioAtIssue: Number(sharpeRatioAtIssue),
                maxSupply: Number(maxSupply),
                totalIssued,
                pricePerBond,
                tranche: Number(tranche),
                paymentToken: paymentToken as string,
              });
            } catch {
              // skip unreadable class
            }
          }
        }

        setBondClasses(classes);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load bond classes");
      } finally {
        setLoading(false);
      }
    }

    fetchBondClasses();
  }, [totalSupply]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-[rgb(var(--muted-foreground))]">Loading bond market...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-crimson">{error}</p>
      </div>
    );
  }

  // Apply tranche filter
  const filteredBonds = trancheFilter === "All"
    ? bondClasses
    : bondClasses.filter((b) => TRANCHE_LABELS[b.tranche] === trancheFilter);

  const totalClassCount = bondClasses.length;
  const totalIssuedAll = bondClasses.reduce((sum, b) => sum + b.totalIssued, 0);
  const totalValueWei = bondClasses.reduce(
    (sum, b) => sum + BigInt(b.totalIssued) * b.pricePerBond,
    BigInt(0)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Bond Market</h1>
        <p className="mt-1 text-sm text-[rgb(var(--muted-foreground))]">
          ERC-3475 bonds backed by AI agent revenue streams
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card-glass rounded-xl p-4">
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Total Bond Classes</p>
          <p className="stat-value font-mono text-2xl text-gold">{totalClassCount}</p>
        </div>
        <div className="card-glass rounded-xl p-4">
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Total Bonds Issued</p>
          <p className="stat-value font-mono text-2xl">{totalIssuedAll.toLocaleString()}</p>
        </div>
        <div className="card-glass rounded-xl p-4">
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Total Value</p>
          <p className="stat-value font-mono text-2xl">
            {parseFloat(formatEther(totalValueWei)).toFixed(4)} BNB
          </p>
        </div>
      </div>

      {/* Tranche Filter Tabs */}
      <div className="flex items-center gap-1">
        {TRANCHE_FILTERS.map((tab) => (
          <button
            key={tab}
            onClick={() => setTrancheFilter(tab)}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
              trancheFilter === tab
                ? "bg-[#D4A853]/10 text-gold"
                : "text-[rgb(var(--muted-foreground))] hover:bg-[rgb(var(--secondary))] hover:text-[rgb(var(--foreground))]"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Bond Class Grid */}
      {filteredBonds.length === 0 ? (
        <div className="py-12 text-center text-sm text-[rgb(var(--muted-foreground))]">
          {trancheFilter === "All"
            ? "No bond classes found. No agents have initiated an IPO yet."
            : `No ${trancheFilter} tranche bonds found.`}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredBonds.map((bond) => (
            <div key={bond.classId} className="space-y-2">
              <div className="relative">
                <BondCard
                  classId={bond.classId}
                  agentId={bond.agentId}
                  agentName={bond.agentName}
                  couponRateBps={bond.couponRateBps}
                  maturityPeriod={bond.maturityPeriod}
                  sharpeRatioAtIssue={bond.sharpeRatioAtIssue}
                  maxSupply={bond.maxSupply}
                  totalIssued={bond.totalIssued}
                  pricePerBond={bond.pricePerBond}
                />
                {/* Tranche & payment token badges overlaid at top-left */}
                <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2">
                  {bond.tranche === 1 && (
                    <span className="rounded-md bg-[#5A8A6E]/10 px-2 py-1 text-xs font-medium text-sage">Senior</span>
                  )}
                  {bond.tranche === 2 && (
                    <span className="rounded-md bg-[#B87333]/10 px-2 py-1 text-xs font-medium" style={{color: '#B87333'}}>Junior</span>
                  )}
                  {bond.paymentToken.toLowerCase() !== ZERO_ADDRESS && (
                    <span className="rounded-md bg-[#B87333]/10 px-2 py-1 text-xs font-medium" style={{color: '#B87333'}}>ERC-20</span>
                  )}
                </div>
              </div>
              <Link
                href="/market"
                className="flex cursor-pointer items-center justify-center rounded-lg border border-gold/30 py-2 text-xs font-semibold text-gold transition-colors duration-200 hover:border-gold/60 hover:bg-gold/5"
              >
                Trade on DEX
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
