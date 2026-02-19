"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { formatEther } from "viem";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import { NFARegistryABI, SIBControllerV2ABI, SIBBondManagerABI, DividendVaultV2ABI } from "@/lib/contracts";
import { ADDRESSES } from "@/lib/contract-addresses";
import { DividendClaimButton } from "@/components/DividendClaimButton";
import { useCollateralBalance } from "@/hooks/useBondCollateral";

const client = createPublicClient({ chain: bscTestnet, transport: http() });

interface Position {
  classId: number;
  nonceId: number;
  agentName: string;
  balance: number;
  pricePerBond: bigint;
  couponRateBps: number;
  claimable: bigint;
  maturityTimestamp: number;
  redeemable: boolean;
}

export default function PortfolioPage() {
  const { address: userAddress, isConnected } = useAccount();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  // Write contracts for redeem
  const { writeContract: writeRedeem, data: redeemHash, isPending: redeemPending } = useWriteContract();
  const { isLoading: redeemConfirming, isSuccess: redeemSuccess } = useWaitForTransactionReceipt({ hash: redeemHash });

  // Get total agent count
  const { data: totalSupply } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: NFARegistryABI,
    functionName: "totalSupply",
  });

  // Fetch positions when wallet is connected
  useEffect(() => {
    if (!isConnected || !userAddress || totalSupply === undefined) {
      setLoading(false);
      return;
    }

    const count = Number(totalSupply);
    if (count === 0) {
      setPositions([]);
      setLoading(false);
      return;
    }

    async function fetchPositions() {
      try {
        const found: Position[] = [];

        for (let i = 0; i < count; i++) {
          const agentId = await client.readContract({
            address: ADDRESSES.NFARegistry as `0x${string}`,
            abi: NFARegistryABI,
            functionName: "tokenByIndex",
            args: [BigInt(i)],
          });

          const hasIPO = await client.readContract({
            address: ADDRESSES.SIBControllerV2 as `0x${string}`,
            abi: SIBControllerV2ABI,
            functionName: "hasIPO",
            args: [agentId],
          });

          if (!hasIPO) continue;

          // v2: get all bond class IDs for this agent
          const classIds = await client.readContract({
            address: ADDRESSES.SIBControllerV2 as `0x${string}`,
            abi: SIBControllerV2ABI,
            functionName: "getAgentBondClasses",
            args: [agentId],
          }) as bigint[];

          if (!classIds || classIds.length === 0) continue;

          // Get agent name
          let agentName = `Agent #${Number(agentId)}`;
          try {
            const metadata = await client.readContract({
              address: ADDRESSES.NFARegistry as `0x${string}`,
              abi: NFARegistryABI,
              functionName: "getAgentMetadata",
              args: [agentId],
            });
            const metaTuple = metadata as unknown as readonly [string, string, string, string, bigint];
            if (metaTuple[0]) agentName = metaTuple[0];
          } catch {
            // Keep default
          }

          for (const classIdBig of classIds) {
            const classId = Number(classIdBig);

            // Read bond class info (v1 ABI: 6 values; d[1]=couponRateBps)
            const bondClass = await client.readContract({
              address: ADDRESSES.SIBBondManager as `0x${string}`,
              abi: SIBBondManagerABI,
              functionName: "bondClasses",
              args: [classIdBig],
            });
            const [, couponRateBps] = bondClass as [bigint, bigint, bigint, bigint, bigint, boolean];

            // Get number of nonces
            const nextNonce = await client.readContract({
              address: ADDRESSES.SIBBondManager as `0x${string}`,
              abi: SIBBondManagerABI,
              functionName: "nextNonceId",
              args: [classIdBig],
            });
            const nonceCount = Number(nextNonce);

            // Check each nonce for user balance
            for (let n = 0; n < nonceCount; n++) {
              const balance = await client.readContract({
                address: ADDRESSES.SIBBondManager as `0x${string}`,
                abi: SIBBondManagerABI,
                functionName: "balanceOf",
                args: [userAddress as `0x${string}`, classIdBig, BigInt(n)],
              });

              if (Number(balance) === 0) continue;

              // Read nonce data
              const nonceData = await client.readContract({
                address: ADDRESSES.SIBBondManager as `0x${string}`,
                abi: SIBBondManagerABI,
                functionName: "bondNonces",
                args: [classIdBig, BigInt(n)],
              });
              const [, maturityTimestamp, , pricePerBond, redeemable] = nonceData as [bigint, bigint, bigint, bigint, boolean, boolean];

              // Read claimable dividends
              const claimable = await client.readContract({
                address: ADDRESSES.DividendVaultV2 as `0x${string}`,
                abi: DividendVaultV2ABI,
                functionName: "claimable",
                args: [userAddress as `0x${string}`, classIdBig, BigInt(n), "0x0000000000000000000000000000000000000000" as `0x${string}`],
              });

              found.push({
                classId,
                nonceId: n,
                agentName,
                balance: Number(balance),
                pricePerBond,
                couponRateBps: Number(couponRateBps),
                claimable: claimable as bigint,
                maturityTimestamp: Number(maturityTimestamp),
                redeemable,
              });
            }
          }
        }

        setPositions(found);
      } catch {
        // Failed to load positions
      } finally {
        setLoading(false);
      }
    }

    fetchPositions();
  }, [isConnected, userAddress, totalSupply]);

  // Reset active action on success
  useEffect(() => {
    if (redeemSuccess) {
      setActiveAction(null);
    }
  }, [redeemSuccess]);

  const handleRedeem = useCallback(
    (classId: number, nonceId: number, amount: number) => {
      const key = `redeem-${classId}-${nonceId}`;
      setActiveAction(key);
      writeRedeem({
        address: ADDRESSES.SIBControllerV2 as `0x${string}`,
        abi: SIBControllerV2ABI,
        functionName: "redeemBonds",
        args: [BigInt(classId), BigInt(nonceId), BigInt(amount)],
      });
    },
    [writeRedeem]
  );

  // Not connected state
  if (!isConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-xl font-bold tracking-tight">My Portfolio</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Manage your bond holdings, claim dividends, and redeem mature positions.
          </p>
        </div>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-semibold">Connect Wallet</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Connect your wallet to view your portfolio.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-[rgb(var(--muted-foreground))]">Loading portfolio...</p>
      </div>
    );
  }

  // Calculate totals
  const totalHoldingsValueWei = positions.reduce(
    (sum, p) => sum + BigInt(p.balance) * p.pricePerBond,
    BigInt(0)
  );
  const totalClaimableWei = positions.reduce(
    (sum, p) => sum + p.claimable,
    BigInt(0)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-xl font-bold tracking-tight">My Portfolio</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Manage your bond holdings, claim dividends, and redeem mature positions.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card-glass rounded p-5">
          <p className="label-mono">
            Total Positions
          </p>
          <p className="mt-2 stat-value font-mono text-2xl text-gold">
            {positions.length}
          </p>
        </div>
        <div className="card-glass rounded p-5">
          <p className="label-mono">
            Holdings Value
          </p>
          <p className="mt-2 stat-value font-mono text-2xl">
            {parseFloat(formatEther(totalHoldingsValueWei)).toFixed(4)} BNB
          </p>
        </div>
        <div className="card-glass rounded p-5">
          <p className="label-mono">
            Claimable Dividends
          </p>
          <p className="mt-2 stat-value font-mono text-2xl text-sage">
            {parseFloat(formatEther(totalClaimableWei)).toFixed(6)} BNB
          </p>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="card-glass overflow-hidden rounded">
        <div className="border-b border-[rgb(var(--border))]/50 px-5 py-4">
          <h2 className="text-lg font-semibold">Holdings</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--border))]/30 text-xs font-medium uppercase tracking-wider text-[rgb(var(--muted-foreground))]">
                <th className="px-5 py-3">Bond Class</th>
                <th className="px-5 py-3">Nonce</th>
                <th className="px-5 py-3 text-right">Balance</th>
                <th className="px-5 py-3 text-right">Value</th>
                <th className="px-5 py-3 text-right">Claimable</th>
                <th className="px-5 py-3 text-center">Rate</th>
                <th className="px-5 py-3 text-center">Maturity</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]/20">
              {positions.map((pos) => {
                const now = Date.now() / 1000;
                const isMatured = now >= pos.maturityTimestamp;
                const valueWei = BigInt(pos.balance) * pos.pricePerBond;
                const claimableEth = parseFloat(formatEther(pos.claimable));
                const redeemKey = `redeem-${pos.classId}-${pos.nonceId}`;
                const isRedeemingThis = activeAction === redeemKey && (redeemPending || redeemConfirming);

                return (
                  <tr
                    key={`${pos.classId}-${pos.nonceId}`}
                    className="transition-colors hover:bg-[rgb(var(--secondary))]/30"
                  >
                    <td className="px-5 py-4">
                      <div>
                        <Link
                          href={`/bonds/${pos.classId}`}
                          className="cursor-pointer font-medium text-[rgb(var(--foreground))] hover:text-gold"
                        >
                          Class #{pos.classId}
                        </Link>
                        <p className="text-xs text-[rgb(var(--muted-foreground))]">
                          {pos.agentName}
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-[rgb(var(--muted-foreground))]">
                      #{pos.nonceId}
                    </td>
                    <td className="px-5 py-4 text-right stat-value font-mono">
                      {pos.balance.toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-right stat-value font-mono">
                      {parseFloat(formatEther(valueWei)).toFixed(4)} BNB
                    </td>
                    <td
                      className={`px-5 py-4 text-right stat-value font-mono ${
                        claimableEth > 0 ? "text-sage" : "text-[rgb(var(--muted-foreground))]"
                      }`}
                    >
                      {claimableEth.toFixed(6)} BNB
                    </td>
                    <td className="px-5 py-4 text-center font-mono text-gold">
                      {(pos.couponRateBps / 100).toFixed(1)}%
                    </td>
                    <td className="px-5 py-4 text-center font-mono text-xs text-[rgb(var(--muted-foreground))]">
                      {pos.maturityTimestamp > 0
                        ? new Date(pos.maturityTimestamp * 1000).toLocaleDateString()
                        : "--"}
                    </td>
                    <td className="px-5 py-4 text-center">
                      {pos.redeemable ? (
                        <span className="inline-block rounded-full bg-[#5A8A6E]/10 px-2.5 py-0.5 text-xs font-medium text-sage">
                          Redeemable
                        </span>
                      ) : isMatured ? (
                        <span className="inline-block rounded-full bg-[#D4A853]/10 px-2.5 py-0.5 text-xs font-medium text-gold">
                          Matured
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-[rgb(var(--muted))]/50 px-2.5 py-0.5 text-xs font-medium text-[rgb(var(--muted-foreground))]">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {pos.claimable > 0n && (
                          <DividendClaimButton
                            classId={BigInt(pos.classId)}
                            nonceId={BigInt(pos.nonceId)}
                            claimable={pos.claimable}
                          />
                        )}
                        {pos.redeemable && (
                          <button
                            onClick={() => handleRedeem(pos.classId, pos.nonceId, pos.balance)}
                            disabled={isRedeemingThis}
                            className="cursor-pointer rounded border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-2 text-xs font-medium text-[rgb(var(--foreground))] transition-colors duration-200 hover:bg-[rgb(var(--secondary))]/80 disabled:opacity-50"
                          >
                            {isRedeemingThis ? "Redeeming..." : "Redeem"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {positions.length === 0 && (
          <div className="px-5 py-12 text-center text-[rgb(var(--muted-foreground))]">
            No positions yet.{" "}
            <Link href="/bonds" className="cursor-pointer text-gold transition-colors hover:underline">
              Purchase bonds
            </Link>{" "}
            to get started.
          </div>
        )}
      </div>

      {/* Transaction feedback */}
      {redeemSuccess && (
        <div className="rounded bg-[#5A8A6E]/10 px-4 py-3 text-center text-sm text-sage">
          Bonds redeemed successfully.
        </div>
      )}

      {/* Wrapped Collateral */}
      <WrappedCollateralSection address={userAddress as `0x${string}`} />
    </div>
  );
}

function WrappedCollateralSection({ address }: { address: `0x${string}` }) {
  const { data: balance, isLoading } = useCollateralBalance(address);

  if (isLoading) return null;

  return (
    <div className="card-glass rounded p-5">
      <h2 className="text-lg font-semibold">Wrapped Collateral (ERC-721)</h2>
      <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
        Bond positions wrapped as ERC-721 tokens via BondCollateralWrapper for use as collateral in DeFi.
      </p>
      <div className="mt-4">
        <p className="label-mono">Wrapped Positions</p>
        <p className="stat-value font-mono text-2xl text-gold">{balance ?? 0}</p>
      </div>
      {(balance === undefined || balance === 0) && (
        <p className="mt-3 text-xs text-[rgb(var(--muted-foreground))]">
          No wrapped positions. Wrap your bonds in the bond detail page to use them as collateral.
        </p>
      )}
    </div>
  );
}
