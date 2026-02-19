"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useReadContract, useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatEther } from "viem";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import { SIBBondManagerV2ABI, SIBControllerV2ABI, DividendVaultV2ABI, NFARegistryABI } from "@/lib/contracts";
import { ADDRESSES } from "@/lib/contract-addresses";
import { BondPurchaseModal } from "@/components/BondPurchaseModal";

const client = createPublicClient({ chain: bscTestnet, transport: http() });

const TRANCHE_LABELS = ["Standard", "Senior", "Junior"] as const;
const BNB_TOKEN = "0x0000000000000000000000000000000000000000" as `0x${string}`;

interface NonceData {
  nonceId: number;
  issueTimestamp: number;
  maturityTimestamp: number;
  totalIssued: number;
  pricePerBond: bigint;
  redeemable: boolean;
  exists: boolean;
}

export default function BondDetailPage() {
  const params = useParams();
  const classId = params.classId as string;
  const classIdBigInt = BigInt(classId);
  const { isConnected } = useAccount();

  const [nonces, setNonces] = useState<NonceData[]>([]);
  const [agentName, setAgentName] = useState<string>("");
  const [noncesLoading, setNoncesLoading] = useState(true);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);

  // Distribute dividends
  const { writeContract: distribute, data: distributeTxHash, isPending: distributeIsPending } = useWriteContract();
  const { isLoading: distributeIsConfirming, isSuccess: distributeIsSuccess } = useWaitForTransactionReceipt({
    hash: distributeTxHash,
  });

  // Read bond class data (v2: 8 fields)
  const { data: bondClassData, isLoading: classLoading, isError: classError } = useReadContract({
    address: ADDRESSES.SIBBondManager as `0x${string}`,
    abi: SIBBondManagerV2ABI,
    functionName: "bondClasses",
    args: [classIdBigInt],
  });

  // Parse the v2 bond class tuple
  const bcTuple = bondClassData as [bigint, bigint, bigint, bigint, bigint, number, string, boolean] | undefined;
  const agentId = bcTuple ? bcTuple[0] : undefined;
  const tranche = bcTuple ? Number(bcTuple[5]) : 0;
  const paymentToken = bcTuple ? (bcTuple[6] as string) : BNB_TOKEN;
  const isBNB = !paymentToken || paymentToken.toLowerCase() === BNB_TOKEN.toLowerCase();

  // Read dynamic coupon from v2 controller
  const { data: dynamicCouponData } = useReadContract({
    address: ADDRESSES.SIBControllerV2 as `0x${string}`,
    abi: SIBControllerV2ABI,
    functionName: "calculateDynamicCoupon",
    args: [classIdBigInt],
    query: { enabled: !!bcTuple },
  });

  // Read revenue pool for the agent (v2 with token param)
  const { data: revenuePoolData } = useReadContract({
    address: ADDRESSES.SIBControllerV2 as `0x${string}`,
    abi: SIBControllerV2ABI,
    functionName: "revenuePool",
    args: agentId !== undefined ? [agentId, BNB_TOKEN] : undefined,
    query: { enabled: agentId !== undefined },
  });

  // Read dividend accumulator (v2 with token param)
  const { data: accDividendData } = useReadContract({
    address: ADDRESSES.DividendVaultV2 as `0x${string}`,
    abi: DividendVaultV2ABI,
    functionName: "accDividendPerBond",
    args: [classIdBigInt, BigInt(0), BNB_TOKEN],
  });

  // Read total dividends deposited (v2 with token param)
  const { data: totalDepositedData } = useReadContract({
    address: ADDRESSES.DividendVaultV2 as `0x${string}`,
    abi: DividendVaultV2ABI,
    functionName: "totalDeposited",
    args: [classIdBigInt, BigInt(0), BNB_TOKEN],
  });

  // Read next nonce ID to know how many nonces exist
  const { data: nextNonceIdData } = useReadContract({
    address: ADDRESSES.SIBBondManager as `0x${string}`,
    abi: SIBBondManagerV2ABI,
    functionName: "nextNonceId",
    args: [classIdBigInt],
  });

  // Fetch nonces and agent name
  useEffect(() => {
    if (nextNonceIdData === undefined || !bondClassData) return;

    const bc = bondClassData as [bigint, bigint, bigint, bigint, bigint, number, string, boolean];
    if (!bc[7]) {
      setNoncesLoading(false);
      return;
    }

    async function fetchNoncesAndName() {
      try {
        const nonceCount = Number(nextNonceIdData);
        const fetchedNonces: NonceData[] = [];

        for (let i = 0; i < nonceCount; i++) {
          const nonceData = await client.readContract({
            address: ADDRESSES.SIBBondManager as `0x${string}`,
            abi: SIBBondManagerV2ABI,
            functionName: "bondNonces",
            args: [classIdBigInt, BigInt(i)],
          });
          const [issueTimestamp, maturityTimestamp, totalIssued, pricePerBond, redeemable, exists] = nonceData as [bigint, bigint, bigint, bigint, boolean, boolean];

          if (exists) {
            fetchedNonces.push({
              nonceId: i,
              issueTimestamp: Number(issueTimestamp),
              maturityTimestamp: Number(maturityTimestamp),
              totalIssued: Number(totalIssued),
              pricePerBond,
              redeemable,
              exists,
            });
          }
        }

        setNonces(fetchedNonces);

        // Get agent name
        const bcAgentId = bc[0];
        try {
          const metadata = await client.readContract({
            address: ADDRESSES.NFARegistry as `0x${string}`,
            abi: NFARegistryABI,
            functionName: "getAgentMetadata",
            args: [bcAgentId],
          });
          const metaTuple = metadata as unknown as readonly [string, string, string, string, bigint];
          if (metaTuple[0]) setAgentName(metaTuple[0]);
          else setAgentName(`Agent #${Number(bcAgentId)}`);
        } catch {
          setAgentName(`Agent #${Number(bcAgentId)}`);
        }
      } catch {
        // Nonce loading failed
      } finally {
        setNoncesLoading(false);
      }
    }

    fetchNoncesAndName();
  }, [nextNonceIdData, bondClassData, classIdBigInt]);

  // Loading state
  if (classLoading || noncesLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-[rgb(var(--muted-foreground))]">Loading bond details...</p>
      </div>
    );
  }

  // Parse bond class data
  if (!bondClassData || classError) {
    return (
      <div className="py-20 text-center">
        <h2 className="text-lg font-semibold">Bond Class Not Found</h2>
        <p className="mt-2 text-sm text-[rgb(var(--muted-foreground))]">
          No bond class with ID {classId} exists.
        </p>
        <Link
          href="/bonds"
          className="mt-4 inline-block cursor-pointer text-sm text-gold transition-colors duration-200 hover:underline"
        >
          Back to Bond Market
        </Link>
      </div>
    );
  }

  const bc = bondClassData as [bigint, bigint, bigint, bigint, bigint, number, string, boolean];
  const [bcAgentId, couponRateBps, maturityPeriod, sharpeRatioAtIssue, maxSupply, , , exists] = bc;

  if (!exists) {
    return (
      <div className="py-20 text-center">
        <h2 className="text-lg font-semibold">Bond Class Not Found</h2>
        <p className="mt-2 text-sm text-[rgb(var(--muted-foreground))]">
          Bond class #{classId} does not exist on-chain.
        </p>
        <Link
          href="/bonds"
          className="mt-4 inline-block cursor-pointer text-sm text-gold transition-colors duration-200 hover:underline"
        >
          Back to Bond Market
        </Link>
      </div>
    );
  }

  const maturityDays = Math.round(Number(maturityPeriod) / 86400);
  const couponPct = (Number(couponRateBps) / 100).toFixed(1);
  const sharpeDisplay = (Number(sharpeRatioAtIssue) / 1000).toFixed(3);
  const totalIssuedAll = nonces.reduce((sum, n) => sum + n.totalIssued, 0);
  const remaining = Number(maxSupply) - totalIssuedAll;

  // Dynamic coupon
  const dynamicCoupon = dynamicCouponData ? Number(dynamicCouponData as bigint) : null;
  const dynamicCouponPct = dynamicCoupon !== null ? (dynamicCoupon / 100).toFixed(1) : null;

  // Price from the latest nonce (active nonce)
  const activeNonce = nonces.length > 0 ? nonces[nonces.length - 1] : null;
  const pricePerBondWei = activeNonce ? activeNonce.pricePerBond : BigInt(0);
  const priceDisplay = parseFloat(formatEther(pricePerBondWei));
  const priceUnit = isBNB ? "BNB" : "ERC-20";

  const revenuePool = revenuePoolData ? parseFloat(formatEther(revenuePoolData as bigint)) : 0;
  const accDividend = accDividendData ? parseFloat(formatEther(accDividendData as bigint)) : 0;
  const totalDeposited = totalDepositedData ? parseFloat(formatEther(totalDepositedData as bigint)) : 0;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/bonds" className="cursor-pointer text-[rgb(var(--muted-foreground))] transition-colors duration-200 hover:text-[rgb(var(--foreground))]">
          Bonds
        </Link>
        <span className="text-[rgb(var(--muted-foreground))]">/</span>
        <span className="text-gold">Class #{classId}</span>
      </div>

      {/* Bond Class Header */}
      <div className="card-glass rounded p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-[rgb(var(--muted-foreground))]">Bond Class #{classId}</p>
              {/* Tranche badge */}
              {tranche === 0 && (
                <span className="rounded-md bg-[rgb(var(--muted))]/50 px-2 py-0.5 text-xs font-medium text-[rgb(var(--muted-foreground))]">Standard</span>
              )}
              {tranche === 1 && (
                <span className="rounded-md bg-[#5A8A6E]/10 px-2 py-0.5 text-xs font-medium text-sage">Senior</span>
              )}
              {tranche === 2 && (
                <span className="rounded-md bg-[#B87333]/10 px-2 py-0.5 text-xs font-medium" style={{color: '#B87333'}}>Junior</span>
              )}
              {/* Payment token badge */}
              {!isBNB && (
                <span className="rounded-md bg-[#B87333]/10 px-2 py-0.5 text-xs font-medium" style={{color: '#B87333'}}>ERC-20</span>
              )}
            </div>
            <h1 className="mt-1 font-heading text-xl font-bold tracking-tight">{agentName || `Agent #${Number(bcAgentId)}`}</h1>
            <div className="mt-1 flex items-center gap-3">
              <Link
                href={`/agents/${Number(bcAgentId)}`}
                className="inline-block cursor-pointer text-xs text-gold transition-colors duration-200 hover:underline"
              >
                View Agent Profile
              </Link>
              {tranche !== 0 && (
                <Link
                  href={`/bonds/${classId}/tranches`}
                  className="inline-block cursor-pointer text-xs text-sage transition-colors duration-200 hover:underline"
                >
                  View Tranches
                </Link>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 self-start">
            <span className="rounded bg-[#D4A853]/10 px-4 py-2 text-lg font-bold text-gold">
              {couponPct}% APY
            </span>
            {dynamicCouponPct !== null && dynamicCouponPct !== couponPct && (
              <span className="text-xs text-sage">
                Dynamic: {dynamicCouponPct}% APY
              </span>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <p className="text-xs text-[rgb(var(--muted-foreground))]">Coupon Rate</p>
            <p className="stat-value font-mono text-lg">{Number(couponRateBps)} bps</p>
          </div>
          <div>
            <p className="text-xs text-[rgb(var(--muted-foreground))]">Maturity Period</p>
            <p className="stat-value font-mono text-lg">{maturityDays} days</p>
          </div>
          <div>
            <p className="text-xs text-[rgb(var(--muted-foreground))]">Sharpe at Issue</p>
            <p className="stat-value font-mono text-lg">{sharpeDisplay}</p>
          </div>
          <div>
            <p className="text-xs text-[rgb(var(--muted-foreground))]">Max Supply</p>
            <p className="stat-value font-mono text-lg">{Number(maxSupply).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-[rgb(var(--muted-foreground))]">Remaining</p>
            <p className="stat-value font-mono text-lg">{remaining.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-[rgb(var(--muted-foreground))]">Payment Token</p>
            <p className="stat-value font-mono text-lg">{isBNB ? "BNB" : `${paymentToken.slice(0, 6)}...${paymentToken.slice(-4)}`}</p>
          </div>
        </div>
      </div>

      {/* Dynamic Coupon Section */}
      {dynamicCoupon !== null && (
        <div className="card-glass rounded p-5">
          <h2 className="text-lg font-semibold">Dynamic Coupon Rate</h2>
          <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
            Coupon rate adjusted by the agent&apos;s real-time performance metrics.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="rounded bg-[rgb(var(--secondary))] p-4">
              <p className="text-xs text-[rgb(var(--muted-foreground))]">Base Coupon</p>
              <p className="stat-value font-mono text-xl">{couponPct}%</p>
            </div>
            <div className="rounded bg-[rgb(var(--secondary))] p-4">
              <p className="text-xs text-[rgb(var(--muted-foreground))]">Dynamic Coupon</p>
              <p className="stat-value font-mono text-xl text-sage">{dynamicCouponPct}%</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Purchase Section */}
        <div className="card-glass rounded p-5">
          <h2 className="text-lg font-semibold">Purchase Bonds</h2>
          <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
            Price: {priceDisplay} {priceUnit} per bond
          </p>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded bg-[rgb(var(--secondary))] px-3 py-2">
              <span className="text-xs text-[rgb(var(--muted-foreground))]">Available</span>
              <span className="stat-value font-mono text-sm">{remaining.toLocaleString()} bonds</span>
            </div>
            <div className="flex items-center justify-between rounded bg-[rgb(var(--secondary))] px-3 py-2">
              <span className="text-xs text-[rgb(var(--muted-foreground))]">Price Per Bond</span>
              <span className="stat-value font-mono text-sm text-gold">{priceDisplay} {priceUnit}</span>
            </div>
            <div className="flex items-center justify-between rounded bg-[rgb(var(--secondary))] px-3 py-2">
              <span className="text-xs text-[rgb(var(--muted-foreground))]">Tranche</span>
              <span className="stat-value font-mono text-sm">{TRANCHE_LABELS[tranche]}</span>
            </div>

            {!isConnected ? (
              <p className="text-center text-xs text-[rgb(var(--muted-foreground))]">
                Connect wallet to purchase
              </p>
            ) : (
              <button
                onClick={() => setPurchaseModalOpen(true)}
                disabled={remaining <= 0}
                className="w-full cursor-pointer rounded bg-gold py-2.5 text-sm font-semibold text-[rgb(var(--primary-foreground))] transition-colors duration-200 hover:bg-[#C49A48] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Buy Bonds
              </button>
            )}

            <Link
              href="/market"
              className="flex cursor-pointer items-center justify-center rounded border border-gold/30 py-2 text-xs font-semibold text-gold transition-colors duration-200 hover:border-gold/60 hover:bg-gold/5"
            >
              Trade on DEX
            </Link>
          </div>

          {activeNonce && (
            <BondPurchaseModal
              classId={classIdBigInt}
              nonceId={BigInt(activeNonce.nonceId)}
              pricePerBond={pricePerBondWei}
              maxSupply={maxSupply}
              totalIssued={BigInt(totalIssuedAll)}
              isOpen={purchaseModalOpen}
              onClose={() => setPurchaseModalOpen(false)}
            />
          )}
        </div>

        {/* Dividend Info */}
        <div className="card-glass rounded p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold">Dividend Information</h2>
          <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
            Dividends are distributed from the agent&apos;s revenue pool.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded bg-[rgb(var(--secondary))] p-4">
              <p className="text-xs text-[rgb(var(--muted-foreground))]">Accumulated Per Bond</p>
              <p className="stat-value font-mono text-xl text-gold">{accDividend.toFixed(6)} {isBNB ? "BNB" : "tokens"}</p>
            </div>
            <div className="rounded bg-[rgb(var(--secondary))] p-4">
              <p className="text-xs text-[rgb(var(--muted-foreground))]">Total Deposited</p>
              <p className="stat-value font-mono text-xl">{totalDeposited.toFixed(4)} {isBNB ? "BNB" : "tokens"}</p>
            </div>
            <div className="rounded bg-[rgb(var(--secondary))] p-4">
              <p className="text-xs text-[rgb(var(--muted-foreground))]">Revenue Pool</p>
              <p className="stat-value font-mono text-xl">{revenuePool.toFixed(4)} BNB</p>
            </div>
          </div>

          {isConnected && activeNonce && (
            <div className="mt-4">
              <button
                onClick={() =>
                  distribute({
                    address: ADDRESSES.SIBControllerV2 as `0x${string}`,
                    abi: SIBControllerV2ABI,
                    functionName: "distributeDividends",
                    args: [classIdBigInt, BigInt(activeNonce.nonceId)],
                  })
                }
                disabled={distributeIsPending || distributeIsConfirming}
                className="w-full cursor-pointer rounded border border-gold/30 py-2.5 text-sm font-semibold text-gold transition-colors duration-200 hover:border-gold/60 hover:bg-gold/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {distributeIsPending
                  ? "Confirm in Wallet..."
                  : distributeIsConfirming
                  ? "Distributing..."
                  : "Distribute Dividends"}
              </button>
              {distributeIsSuccess && (
                <p className="mt-2 text-center text-xs text-sage">
                  Dividends distributed successfully.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Nonce List */}
      <div className="card-glass rounded p-6">
        <h2 className="text-lg font-semibold">Bond Nonces</h2>
        <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
          Each nonce represents a batch of bonds issued at a specific time.
        </p>

        {nonces.length === 0 ? (
          <div className="mt-4 py-8 text-center text-sm text-[rgb(var(--muted-foreground))]">
            No nonces found for this bond class.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--border))]">
                  <th className="pb-3 pr-4 text-left text-xs font-medium text-[rgb(var(--muted-foreground))]">Nonce</th>
                  <th className="pb-3 pr-4 text-left text-xs font-medium text-[rgb(var(--muted-foreground))]">Issue Date</th>
                  <th className="pb-3 pr-4 text-left text-xs font-medium text-[rgb(var(--muted-foreground))]">Maturity Date</th>
                  <th className="pb-3 pr-4 text-right text-xs font-medium text-[rgb(var(--muted-foreground))]">Issued</th>
                  <th className="pb-3 pr-4 text-right text-xs font-medium text-[rgb(var(--muted-foreground))]">Price</th>
                  <th className="pb-3 text-right text-xs font-medium text-[rgb(var(--muted-foreground))]">Status</th>
                </tr>
              </thead>
              <tbody>
                {nonces.map((nonce) => {
                  const now = Date.now() / 1000;
                  const isMatured = now >= nonce.maturityTimestamp;
                  return (
                    <tr key={nonce.nonceId} className="border-b border-[rgb(var(--border))]/50">
                      <td className="py-3 pr-4">
                        <span className="stat-value font-mono text-sm">#{nonce.nonceId}</span>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        {nonce.issueTimestamp > 0
                          ? new Date(nonce.issueTimestamp * 1000).toLocaleDateString()
                          : "--"}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        {nonce.maturityTimestamp > 0
                          ? new Date(nonce.maturityTimestamp * 1000).toLocaleDateString()
                          : "--"}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span className="stat-value font-mono text-sm">{nonce.totalIssued.toLocaleString()}</span>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span className="stat-value font-mono text-sm">
                          {parseFloat(formatEther(nonce.pricePerBond))} {priceUnit}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {nonce.redeemable ? (
                          <span className="rounded-md bg-[#5A8A6E]/10 px-2 py-1 text-xs font-medium text-sage">
                            Redeemable
                          </span>
                        ) : isMatured ? (
                          <span className="rounded-md bg-[#D4A853]/10 px-2 py-1 text-xs font-medium text-gold">
                            Matured
                          </span>
                        ) : (
                          <span className="rounded-md bg-[rgb(var(--muted))]/50 px-2 py-1 text-xs font-medium text-[rgb(var(--muted-foreground))]">
                            Active
                          </span>
                        )}
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
  );
}
