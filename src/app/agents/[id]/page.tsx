"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatEther, parseEther } from "viem";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import {
  NFARegistryABI,
  SIBBondManagerV2ABI,
  SIBControllerV2ABI,
  B402PaymentReceiverABI,
} from "@/lib/contracts";
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
import { SharpeGauge } from "@/components/SharpeGauge";
import { CreditScoreRadar } from "@/components/CreditScoreRadar";
import { TEEStatusPanel } from "@/components/TEEStatusPanel";
import { useAgentAssetCount, useVerifiedAssetCount, useTotalDataSize } from "@/hooks/useGreenfield";
import { useActiveRentalCount, useAgentRentals, useResource } from "@/hooks/useComputeMarketplace";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type CreditRating = "Unrated" | "C" | "B" | "A" | "AA" | "AAA";
const RATING_LABELS: CreditRating[] = ["Unrated", "C", "B", "A", "AA", "AAA"];
const STATE_LABELS = ["Registered", "Active", "Suspended", "Deregistered"];

const viemClient = createPublicClient({ chain: bscTestnet, transport: http() });

interface AgentData {
  name: string;
  description: string;
  modelHash: string;
  endpoint: string;
  registeredAt: bigint;
  state: number;
  owner: string;
  creditRating: CreditRating;
  ratingIndex: number;
  totalEarned: bigint;
  totalPayments: bigint;
  lastPaymentTime: bigint;
  sharpeRatio: bigint;
  balance: bigint;
  hasBondClasses: boolean;
}

interface BondClassInfo {
  classId: bigint;
  couponRateBps: bigint;
  maturityPeriod: bigint;
  sharpeRatioAtIssue: bigint;
  maxSupply: bigint;
  tranche: number;
  paymentToken: string;
  exists: boolean;
  totalIssued: bigint;
  pricePerBond: bigint;
}

function RatingBadge({ rating }: { rating: CreditRating }) {
  let colorClass: string;
  if (rating === "AAA" || rating === "AA") {
    colorClass = "text-gold bg-[#D4A853]/10";
  } else if (rating === "A" || rating === "B") {
    colorClass = "text-sage bg-[#5A8A6E]/10";
  } else if (rating === "C") {
    colorClass = "text-crimson bg-[#B94137]/10";
  } else {
    colorClass = "text-[rgb(var(--muted-foreground))] bg-[rgb(var(--muted))]/50";
  }
  return (
    <span
      className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-bold ${colorClass}`}
    >
      {rating}
    </span>
  );
}

function DataAssetsSection({ agentId }: { agentId: number }) {
  const { data: assetCount, isLoading: countLoading } = useAgentAssetCount(agentId);
  const { data: verifiedCount } = useVerifiedAssetCount(agentId);
  const { data: totalSize } = useTotalDataSize(agentId);

  if (countLoading) return null;
  if (assetCount === undefined || assetCount === 0) return null;

  const sizeKB = totalSize ? (totalSize / 1024).toFixed(1) : "0";

  return (
    <div className="card-glass rounded p-5">
      <h2 className="text-sm font-semibold text-[rgb(var(--muted-foreground))]">
        Greenfield Data Vault
      </h2>
      <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
        Decentralized data assets registered by this agent
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Total Assets</p>
          <p className="stat-value font-mono text-xl">{assetCount}</p>
        </div>
        <div>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Verified</p>
          <p className="stat-value font-mono text-xl text-sage">
            {verifiedCount ?? 0}
            <span className="ml-1 text-sm text-[rgb(var(--muted-foreground))]">
              / {assetCount}
            </span>
          </p>
        </div>
        <div>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Total Data Size</p>
          <p className="stat-value font-mono text-xl">{sizeKB} KB</p>
        </div>
      </div>
    </div>
  );
}

function RentalDetail({ rentalId }: { rentalId: number }) {
  const { data: resource } = useResource(rentalId);
  if (!resource) return null;
  return (
    <div className="rounded border border-border/30 bg-secondary/20 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{resource.name}</span>
        <span className="rounded-md bg-sage/10 px-2 py-0.5 text-xs font-medium text-sage">
          {resource.resourceTypeLabel}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-[rgb(var(--muted-foreground))]">
        <div>
          <p>Price/hr</p>
          <p className="font-mono text-foreground">{resource.pricePerHour} BNB</p>
        </div>
        <div>
          <p>Capacity</p>
          <p className="font-mono text-foreground">{resource.usedCapacity}/{resource.totalCapacity}</p>
        </div>
        <div>
          <p>Provider</p>
          <p className="font-mono text-foreground">{resource.provider.slice(0, 6)}...{resource.provider.slice(-4)}</p>
        </div>
      </div>
    </div>
  );
}

function ComputeRentalsSection({ agentId }: { agentId: number }) {
  const { data: activeCount, isLoading: countLoading } = useActiveRentalCount(agentId);
  const { data: rentalIds } = useAgentRentals(agentId);

  if (countLoading) return null;
  const totalRentals = rentalIds?.length ?? 0;
  if (totalRentals === 0 && (activeCount === undefined || activeCount === 0)) return null;

  return (
    <div className="card-glass rounded p-5">
      <h2 className="text-sm font-semibold text-[rgb(var(--muted-foreground))]">
        Compute Marketplace
      </h2>
      <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
        DePIN GPU resources rented by this agent with IPO capital
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Active Rentals</p>
          <p className="stat-value font-mono text-xl text-sage">{activeCount ?? 0}</p>
        </div>
        <div>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Total Rentals</p>
          <p className="stat-value font-mono text-xl">{totalRentals}</p>
        </div>
      </div>
      {rentalIds && rentalIds.length > 0 && (
        <div className="mt-4 space-y-2">
          {rentalIds.slice(0, 5).map((rid) => (
            <RentalDetail key={rid} rentalId={rid} />
          ))}
        </div>
      )}
    </div>
  );
}

const LIFECYCLE_PHASES = [
  { key: "born", label: "Born in TEE" },
  { key: "capital", label: "Capital Raised" },
  { key: "compute", label: "Compute Acquired" },
  { key: "earning", label: "Earning" },
  { key: "distributing", label: "Distributing" },
] as const;

function LifecycleProgressBar({ state, hasBonds, hasCompute, hasRevenue, hasDividends }: {
  state: number;
  hasBonds: boolean;
  hasCompute: boolean;
  hasRevenue: boolean;
  hasDividends: boolean;
}) {
  const phaseStatus = [
    state >= 0,      // born (registered)
    hasBonds,        // capital raised
    hasCompute,      // compute acquired
    hasRevenue,      // earning
    hasDividends,    // distributing
  ];

  // Find the active phase (first incomplete)
  let activeIdx = phaseStatus.findIndex((s) => !s);
  if (activeIdx === -1) activeIdx = phaseStatus.length; // all done

  return (
    <div className="card-glass rounded p-4">
      <div className="flex items-center gap-1 overflow-x-auto">
        {LIFECYCLE_PHASES.map((phase, i) => {
          const done = phaseStatus[i];
          const active = i === activeIdx;
          return (
            <div key={phase.key} className="flex items-center gap-1">
              {i > 0 && (
                <div className={`h-px w-4 sm:w-8 ${done ? "bg-gold/50" : "bg-border"}`} />
              )}
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  done
                    ? "bg-gold/20 text-gold"
                    : active
                      ? "border-2 border-gold text-gold"
                      : "border border-border text-muted-foreground"
                }`}>
                  {done ? "\u2713" : i + 1}
                </span>
                <span className={`text-xs font-medium ${
                  done ? "text-gold" : active ? "text-foreground" : "text-muted-foreground"
                }`}>
                  {phase.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AgentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const agentId = BigInt(id);

  const { address: walletAddress, isConnected } = useAccount();

  const [agentData, setAgentData] = useState<AgentData | null>(null);
  const [bondClasses, setBondClasses] = useState<BondClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // IPO form state
  const [couponRate, setCouponRate] = useState("500");
  const [maturityDays, setMaturityDays] = useState("90");
  const [pricePerBond, setPricePerBond] = useState("0.1");
  const [maxSupply, setMaxSupply] = useState("1000");
  const [ipoPaymentToken, setIpoPaymentToken] = useState(ZERO_ADDRESS);

  // IPO write contract (v2 with paymentToken)
  const {
    writeContract: writeIPO,
    data: ipoHash,
    isPending: ipoIsPending,
    error: ipoError,
  } = useWriteContract();
  const { isLoading: ipoConfirming, isSuccess: ipoSuccess } =
    useWaitForTransactionReceipt({ hash: ipoHash });

  // Activate agent write contract
  const {
    writeContract: writeActivate,
    data: activateHash,
    isPending: activateIsPending,
    error: activateError,
  } = useWriteContract();
  const { isLoading: activateConfirming, isSuccess: activateSuccess } =
    useWaitForTransactionReceipt({ hash: activateHash });

  // Fund Agent state
  const [fundAmount, setFundAmount] = useState("");
  const {
    writeContract: writeFund,
    data: fundHash,
    isPending: fundIsPending,
    error: fundError,
  } = useWriteContract();
  const { isLoading: fundConfirming, isSuccess: fundSuccess } =
    useWaitForTransactionReceipt({ hash: fundHash });

  function handleFund() {
    if (!fundAmount || Number(fundAmount) <= 0) return;
    writeFund({
      address: ADDRESSES.NFARegistry as `0x${string}`,
      abi: NFARegistryABI,
      functionName: "fundAgent",
      args: [agentId],
      value: parseEther(fundAmount),
    });
  }

  // Credit Report Payment state
  const [creditReport, setCreditReport] = useState<Record<string, unknown> | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportTargetId, setReportTargetId] = useState("");
  const {
    writeContract: writePayment,
    data: paymentHash,
    isPending: paymentIsPending,
    error: paymentError,
  } = useWriteContract();
  const { isLoading: paymentConfirming, isSuccess: paymentSuccess } =
    useWaitForTransactionReceipt({ hash: paymentHash });

  // Fetch credit report after payment confirms
  useEffect(() => {
    if (paymentSuccess && reportTargetId) {
      setReportLoading(true);
      fetch(`/api/credit-report?agentId=${reportTargetId}`)
        .then((res) => res.json())
        .then((data) => {
          setCreditReport(data);
          setReportLoading(false);
        })
        .catch(() => setReportLoading(false));
    }
  }, [paymentSuccess, reportTargetId]);

  function handleCreditReportPayment() {
    const targetId = reportTargetId || id;
    setReportTargetId(targetId);
    setCreditReport(null);
    writePayment({
      address: ADDRESSES.B402PaymentReceiver as `0x${string}`,
      abi: B402PaymentReceiverABI,
      functionName: "payBNB",
      args: [agentId, `/api/credit-report?agentId=${targetId}`],
      value: parseEther("0.001"),
    });
  }

  // Distribute Dividends state
  const {
    writeContract: writeDistribute,
    data: distributeHash,
    isPending: distributeIsPending,
    error: distributeError,
  } = useWriteContract();
  const { isLoading: distributeConfirming, isSuccess: distributeSuccess } =
    useWaitForTransactionReceipt({ hash: distributeHash });

  function handleDistributeDividends(classId: bigint, nonceId: bigint) {
    writeDistribute({
      address: ADDRESSES.SIBControllerV2 as `0x${string}`,
      abi: SIBControllerV2ABI,
      functionName: "distributeDividends",
      args: [classId, nonceId],
    });
  }

  // Fetch all agent data
  useEffect(() => {
    async function fetchAgent() {
      try {
        const [metadata, state, rating, revenue, owner, balance] =
          await Promise.all([
            viemClient.readContract({
              address: ADDRESSES.NFARegistry as `0x${string}`,
              abi: NFARegistryABI,
              functionName: "getAgentMetadata",
              args: [agentId],
            }),
            viemClient.readContract({
              address: ADDRESSES.NFARegistry as `0x${string}`,
              abi: NFARegistryABI,
              functionName: "getAgentState",
              args: [agentId],
            }),
            viemClient.readContract({
              address: ADDRESSES.NFARegistry as `0x${string}`,
              abi: NFARegistryABI,
              functionName: "creditRatings",
              args: [agentId],
            }),
            viemClient.readContract({
              address: ADDRESSES.NFARegistry as `0x${string}`,
              abi: NFARegistryABI,
              functionName: "getRevenueProfile",
              args: [agentId],
            }),
            viemClient.readContract({
              address: ADDRESSES.NFARegistry as `0x${string}`,
              abi: NFARegistryABI,
              functionName: "getAgentOwner",
              args: [agentId],
            }),
            viemClient.readContract({
              address: ADDRESSES.NFARegistry as `0x${string}`,
              abi: NFARegistryABI,
              functionName: "getAgentBalance",
              args: [agentId],
            }),
          ]);

        // v2: check for bond classes via getAgentClassIds
        let classIds: bigint[] = [];
        try {
          classIds = await viemClient.readContract({
            address: ADDRESSES.SIBBondManager as `0x${string}`,
            abi: SIBBondManagerV2ABI,
            functionName: "getAgentClassIds",
            args: [agentId],
          }) as bigint[];
        } catch {
          // no bond classes
        }

        const meta = metadata as unknown as readonly [string, string, string, string, bigint];
        const rev = revenue as unknown as readonly [bigint, bigint, bigint, bigint, `0x${string}`];
        const ratingNum = Number(rating);

        setAgentData({
          name: meta[0],
          description: meta[1],
          modelHash: meta[2],
          endpoint: meta[3],
          registeredAt: meta[4],
          state: Number(state),
          owner: owner as string,
          creditRating: RATING_LABELS[ratingNum] || "Unrated",
          ratingIndex: ratingNum,
          totalEarned: rev[0],
          totalPayments: rev[1],
          lastPaymentTime: rev[2],
          sharpeRatio: rev[3],
          balance: balance as bigint,
          hasBondClasses: classIds.length > 0,
        });

        // Fetch bond class details for each class
        if (classIds.length > 0) {
          const fetchedClasses: BondClassInfo[] = [];
          for (const cid of classIds) {
            try {
              const classData = await viemClient.readContract({
                address: ADDRESSES.SIBBondManager as `0x${string}`,
                abi: SIBBondManagerV2ABI,
                functionName: "bondClasses",
                args: [cid],
              });

              const bc = classData as [bigint, bigint, bigint, bigint, bigint, number, string, boolean];

              // Get active nonce to read price and total issued
              let totalIssued = 0n;
              let price = 0n;
              try {
                const activeNonce = await viemClient.readContract({
                  address: ADDRESSES.SIBControllerV2 as `0x${string}`,
                  abi: SIBControllerV2ABI,
                  functionName: "activeNonce",
                  args: [cid],
                });

                const nonceData = await viemClient.readContract({
                  address: ADDRESSES.SIBBondManager as `0x${string}`,
                  abi: SIBBondManagerV2ABI,
                  functionName: "bondNonces",
                  args: [cid, activeNonce as bigint],
                });

                const nd = nonceData as [bigint, bigint, bigint, bigint, boolean, boolean];
                totalIssued = nd[2];
                price = nd[3];
              } catch {
                // nonce read failed
              }

              fetchedClasses.push({
                classId: cid,
                couponRateBps: bc[1],
                maturityPeriod: bc[2],
                sharpeRatioAtIssue: bc[3],
                maxSupply: bc[4],
                tranche: Number(bc[5]),
                paymentToken: bc[6] as string,
                exists: bc[7],
                totalIssued,
                pricePerBond: price,
              });
            } catch {
              // skip unreadable class
            }
          }
          setBondClasses(fetchedClasses);
        }

        setLoading(false);
      } catch {
        setError(
          `Failed to load agent #${id}. It may not exist on-chain.`
        );
        setLoading(false);
      }
    }

    fetchAgent();
  }, [agentId, id, ipoSuccess, activateSuccess, fundSuccess, paymentSuccess, distributeSuccess]);

  function handleIPO() {
    const couponBps = BigInt(couponRate);
    const maturitySeconds = BigInt(Number(maturityDays) * 86400);
    const price = parseEther(pricePerBond);
    const supply = BigInt(maxSupply);
    const payToken = ipoPaymentToken as `0x${string}`;

    writeIPO({
      address: ADDRESSES.SIBControllerV2 as `0x${string}`,
      abi: SIBControllerV2ABI,
      functionName: "initiateIPO",
      args: [agentId, couponBps, maturitySeconds, price, supply, payToken],
    });
  }

  function handleActivate() {
    writeActivate({
      address: ADDRESSES.NFARegistry as `0x${string}`,
      abi: NFARegistryABI,
      functionName: "updateState",
      args: [agentId, 1],
    });
  }

  // Loading state
  if (loading) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-[rgb(var(--muted-foreground))]">
          Loading agent #{id}...
        </p>
      </div>
    );
  }

  // Error / not found
  if (error || !agentData) {
    return (
      <div className="py-20 text-center">
        <h2 className="text-lg font-semibold">Agent Not Found</h2>
        <p className="mt-2 text-sm text-[rgb(var(--muted-foreground))]">
          {error || `No agent with ID ${id} exists.`}
        </p>
        <Link
          href="/agents"
          className="mt-4 inline-block cursor-pointer text-sm text-gold transition-colors duration-200 hover:underline"
        >
          Back to Agents
        </Link>
      </div>
    );
  }

  const isOwner =
    isConnected &&
    walletAddress?.toLowerCase() === agentData.owner.toLowerCase();
  const showIPOForm =
    isConnected && isOwner && !agentData.hasBondClasses && agentData.state === 1;
  const showActivateButton =
    isConnected && isOwner && agentData.state === 0;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/agents"
          className="cursor-pointer text-[rgb(var(--muted-foreground))] transition-colors duration-200 hover:text-[rgb(var(--foreground))]"
        >
          Agents
        </Link>
        <span className="text-[rgb(var(--muted-foreground))]">/</span>
        <span className="text-gold">{agentData.name}</span>
      </div>

      {/* Lifecycle Progress Bar */}
      <LifecycleProgressBar
        state={agentData.state}
        hasBonds={agentData.hasBondClasses}
        hasCompute={false}
        hasRevenue={agentData.totalEarned > 0n}
        hasDividends={false}
      />

      {/* Agent Header */}
      <div className="card-glass rounded p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="font-heading text-xl font-bold tracking-tight">{agentData.name}</h1>
              <RatingBadge rating={agentData.creditRating} />
              <span
                className={`rounded-md px-2 py-1 text-xs font-medium ${
                  agentData.state === 1
                    ? "bg-[#5A8A6E]/10 text-sage"
                    : agentData.state === 2
                      ? "bg-[#B94137]/10 text-crimson"
                      : "bg-[rgb(var(--muted))]/50 text-[rgb(var(--muted-foreground))]"
                }`}
              >
                {STATE_LABELS[agentData.state] || "Unknown"}
              </span>
            </div>
            <p className="mt-2 text-sm text-[rgb(var(--muted-foreground))]">
              {agentData.description}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[rgb(var(--muted-foreground))]">
              <span>
                Owner:{" "}
                <span className="font-mono text-[rgb(var(--foreground))]">
                  {agentData.owner.slice(0, 6)}...{agentData.owner.slice(-4)}
                </span>
                {isOwner && (
                  <span className="ml-1 text-gold">(you)</span>
                )}
              </span>
              <span>
                Registered:{" "}
                {new Date(
                  Number(agentData.registeredAt) * 1000
                ).toLocaleDateString()}
              </span>
              {agentData.modelHash && (
                <span>
                  Model:{" "}
                  <span className="font-mono">
                    {agentData.modelHash.length > 20
                      ? `${agentData.modelHash.slice(0, 10)}...${agentData.modelHash.slice(-8)}`
                      : agentData.modelHash}
                  </span>
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <SharpeGauge
              sharpeRatio={agentData.sharpeRatio}
              creditRating={agentData.ratingIndex}
              size="md"
            />
          </div>
        </div>
      </div>

      {/* Credit Score Radar */}
      <CreditScoreRadar agentId={Number(id)} />

      {/* Activate Agent Button */}
      {showActivateButton && (
        <div className="card-glass rounded p-5">
          <h2 className="text-sm font-semibold">Agent is Registered but not Active</h2>
          <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
            Activate your agent to enable IPO and revenue features.
          </p>
          <button
            onClick={handleActivate}
            disabled={activateIsPending || activateConfirming}
            className="mt-3 cursor-pointer rounded bg-sage px-5 py-2 text-sm font-semibold text-[rgb(var(--primary-foreground))] transition-colors duration-200 hover:bg-[#4A7A5E] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {activateIsPending
              ? "Confirm in Wallet..."
              : activateConfirming
                ? "Activating..."
                : "Activate Agent"}
          </button>
          {activateSuccess && (
            <p className="mt-2 text-xs text-sage">
              Agent activated successfully.
            </p>
          )}
          {activateError && (
            <p className="mt-2 text-xs text-crimson">
              {activateError.message?.slice(0, 120) || "Transaction failed"}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue Profile */}
        <div className="card-glass rounded p-5">
          <h2 className="text-sm font-semibold text-[rgb(var(--muted-foreground))]">
            Revenue Profile
          </h2>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs text-[rgb(var(--muted-foreground))]">
                Total Earned
              </p>
              <p className="stat-value font-mono text-xl">
                {formatEther(agentData.totalEarned)} BNB
              </p>
            </div>
            <div>
              <p className="text-xs text-[rgb(var(--muted-foreground))]">
                Total Payments
              </p>
              <p className="stat-value font-mono text-xl">
                {agentData.totalPayments.toString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-[rgb(var(--muted-foreground))]">
                Last Payment
              </p>
              <p className="stat-value font-mono text-sm">
                {agentData.lastPaymentTime > 0n
                  ? new Date(
                      Number(agentData.lastPaymentTime) * 1000
                    ).toLocaleDateString()
                  : "Never"}
              </p>
            </div>
          </div>
        </div>

        {/* Agent Balance & Details */}
        <div className="card-glass rounded p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-[rgb(var(--muted-foreground))]">
            On-Chain Details
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-[rgb(var(--muted-foreground))]">
                Agent Balance
              </p>
              <p className="stat-value font-mono text-xl">
                {formatEther(agentData.balance)} BNB
              </p>
            </div>
            <div>
              <p className="text-xs text-[rgb(var(--muted-foreground))]">
                Agent ID
              </p>
              <p className="stat-value font-mono text-xl">#{id}</p>
            </div>
            {agentData.endpoint && (
              <div className="sm:col-span-2">
                <p className="text-xs text-[rgb(var(--muted-foreground))]">
                  Endpoint
                </p>
                <p className="stat-value mt-1 break-all font-mono text-sm">
                  {agentData.endpoint}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fund Agent -- owner only */}
      {isOwner && (
        <div className="card-glass rounded p-5">
          <h2 className="text-sm font-semibold">Fund Agent</h2>
          <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
            Deposit BNB into this agent&apos;s on-chain balance.
          </p>
          <div className="mt-3 flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs text-[rgb(var(--muted-foreground))]">
                Amount (BNB)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                placeholder="0.1"
                className="mt-1 w-full rounded border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-3 py-2 font-mono text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))]/50 focus:border-[#D4A853] focus:outline-none focus:ring-1 focus:ring-[#D4A853]"
              />
            </div>
            <button
              onClick={handleFund}
              disabled={fundIsPending || fundConfirming || !fundAmount || Number(fundAmount) <= 0}
              className="cursor-pointer rounded bg-sage px-5 py-2 text-sm font-semibold text-[rgb(var(--primary-foreground))] transition-colors duration-200 hover:bg-[#4A7A5E] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {fundIsPending
                ? "Confirm in Wallet..."
                : fundConfirming
                  ? "Funding..."
                  : "Fund"}
            </button>
          </div>
          {fundSuccess && (
            <p className="mt-2 text-xs text-sage">
              Agent funded successfully.
            </p>
          )}
          {fundError && (
            <p className="mt-2 text-xs text-crimson">
              {fundError.message?.slice(0, 120) || "Transaction failed"}
            </p>
          )}
        </div>
      )}

      {/* Pay for Credit Report -- anyone connected */}
      {isConnected && (
        <div className="card-glass rounded p-5">
          <h2 className="text-sm font-semibold">Credit Report Service</h2>
          <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
            Pay 0.001 BNB to receive an on-chain credit analysis of any Agent.
            Revenue from this service flows to bondholders as dividends.
          </p>
          <div className="mt-3 flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs text-[rgb(var(--muted-foreground))]">
                Target Agent ID
              </label>
              <input
                type="number"
                min="1"
                value={reportTargetId}
                onChange={(e) => setReportTargetId(e.target.value)}
                placeholder={id}
                className="mt-1 w-full rounded border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-3 py-2 font-mono text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))]/50 focus:border-[#D4A853] focus:outline-none focus:ring-1 focus:ring-[#D4A853]"
              />
            </div>
            <button
              onClick={handleCreditReportPayment}
              disabled={paymentIsPending || paymentConfirming}
              className="cursor-pointer rounded bg-gold px-5 py-2 text-sm font-semibold text-[rgb(var(--primary-foreground))] transition-colors duration-200 hover:bg-[#C49A48] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {paymentIsPending
                ? "Confirm in Wallet..."
                : paymentConfirming
                  ? "Processing..."
                  : reportLoading
                    ? "Generating..."
                    : "Pay 0.001 BNB"}
            </button>
          </div>
          {paymentError && (
            <p className="mt-2 text-xs text-crimson">
              {paymentError.message?.slice(0, 120) || "Transaction failed"}
            </p>
          )}

          {/* Credit Report Display */}
          {creditReport && !("error" in creditReport) && (
            <div className="mt-4 space-y-3 rounded border border-[rgb(var(--border))] bg-[rgb(var(--secondary))]/50 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">
                  Credit Report: {(creditReport as Record<string, unknown>).agentName as string}
                </h3>
                <span className="rounded-md bg-gold/10 px-3 py-1 text-sm font-bold text-gold">
                  {((creditReport as Record<string, unknown>).recommendation as string)}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-[rgb(var(--muted-foreground))]">Credit Rating</p>
                  <p className="stat-value font-mono text-lg">
                    {((creditReport as Record<string, unknown>).credit as Record<string, unknown>)?.rating as string}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[rgb(var(--muted-foreground))]">Stability Score</p>
                  <p className="stat-value font-mono text-lg">
                    {((creditReport as Record<string, unknown>).credit as Record<string, unknown>)?.stabilityScore as number}/100
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[rgb(var(--muted-foreground))]">Growth Trend</p>
                  <p className="stat-value font-mono text-lg">
                    {((creditReport as Record<string, unknown>).credit as Record<string, unknown>)?.growthTrend as string}
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-[rgb(var(--muted-foreground))]">Total Earned</p>
                  <p className="stat-value font-mono">
                    {((creditReport as Record<string, unknown>).financials as Record<string, unknown>)?.totalEarned as string} BNB
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[rgb(var(--muted-foreground))]">Sharpe Ratio</p>
                  <p className="stat-value font-mono">
                    {((creditReport as Record<string, unknown>).financials as Record<string, unknown>)?.sharpeRatio as string}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[rgb(var(--muted-foreground))]">Age</p>
                  <p className="stat-value font-mono">
                    {((creditReport as Record<string, unknown>).financials as Record<string, unknown>)?.ageDays as number} days
                  </p>
                </div>
              </div>
              <p className="text-xs text-[rgb(var(--muted-foreground))]">
                Generated {(creditReport as Record<string, unknown>).generatedAt as string} | Powered by on-chain data from NFARegistry
              </p>
            </div>
          )}
        </div>
      )}

      {/* Distribute Dividends -- owner only, when bond classes exist */}
      {isOwner && bondClasses.length > 0 && (
        <div className="card-glass rounded p-5">
          <h2 className="text-sm font-semibold">Distribute Dividends</h2>
          <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
            Distribute accumulated revenue from the revenue pool to bondholders.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {bondClasses.map((bc) => (
              <button
                key={bc.classId.toString()}
                onClick={() => {
                  const nonceId = 0n;
                  handleDistributeDividends(bc.classId, nonceId);
                }}
                disabled={distributeIsPending || distributeConfirming}
                className="cursor-pointer rounded bg-sage px-4 py-2 text-sm font-semibold text-[rgb(var(--primary-foreground))] transition-colors duration-200 hover:bg-[#4A7A5E] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {distributeIsPending || distributeConfirming
                  ? "Processing..."
                  : `Distribute Class #${bc.classId.toString()}`}
              </button>
            ))}
          </div>
          {distributeSuccess && (
            <p className="mt-2 text-xs text-sage">
              Dividends distributed successfully. Bondholders can now claim.
            </p>
          )}
          {distributeError && (
            <p className="mt-2 text-xs text-crimson">
              {distributeError.message?.slice(0, 120) || "Distribution failed (revenue pool may be empty)"}
            </p>
          )}
        </div>
      )}

      {/* Revenue Overview Chart -- real on-chain data */}
      <div className="card-glass rounded p-5">
        <h2 className="text-sm font-semibold text-[rgb(var(--muted-foreground))]">
          Revenue Overview
        </h2>
        <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
          On-chain revenue and balance for this agent
        </p>
        <div className="mt-4 h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={[
                {
                  label: "Total Earned",
                  value: Number(formatEther(agentData.totalEarned)),
                },
                {
                  label: "Agent Balance",
                  value: Number(formatEther(agentData.balance)),
                },
              ]}
            >
              <CartesianGrid
                stroke="rgba(212,168,83,0.08)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fill: "#8A8578", fontSize: 12 }}
                axisLine={{ stroke: "rgba(212,168,83,0.08)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#8A8578", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={50}
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
                cursor={{ fill: "rgba(212,168,83,0.05)" }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any) => `${Number(v).toFixed(4)} BNB`}
              />
              <Bar
                dataKey="value"
                fill="#D4A853"
                radius={[4, 4, 0, 0]}
                name="BNB"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TEE Status */}
      <TEEStatusPanel agentId={BigInt(agentId)} isOwner={isOwner} />

      {/* Data Assets + Compute Rentals */}
      <DataAssetsSection agentId={Number(id)} />
      <ComputeRentalsSection agentId={Number(id)} />

      {/* Bond Section -- Multi-class v2 */}
      <div className="card-glass rounded p-6">
        {agentData.hasBondClasses && bondClasses.length > 0 ? (
          <>
            <h2 className="text-lg font-semibold">Bond Series ({bondClasses.length})</h2>
            <p className="mt-1 text-sm text-[rgb(var(--muted-foreground))]">
              This agent has {bondClasses.length} active bond class{bondClasses.length > 1 ? "es" : ""}. Bonds are available for purchase.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {bondClasses.map((bc) => {
                const couponPct = (Number(bc.couponRateBps) / 100).toFixed(1);
                const matDays = Math.round(Number(bc.maturityPeriod) / 86400);
                const isBNB = !bc.paymentToken || bc.paymentToken.toLowerCase() === ZERO_ADDRESS;
                return (
                  <Link
                    key={bc.classId.toString()}
                    href={`/bonds/${bc.classId.toString()}`}
                    className="card-glass cursor-pointer rounded p-4 transition-colors duration-200"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[rgb(var(--muted-foreground))]">
                          Class #{bc.classId.toString()}
                        </span>
                        {bc.tranche === 1 && (
                          <span className="rounded-md bg-[#5A8A6E]/10 px-2 py-0.5 text-xs font-medium text-sage">Senior</span>
                        )}
                        {bc.tranche === 2 && (
                          <span className="rounded-md bg-[#B87333]/10 px-2 py-0.5 text-xs font-medium" style={{color: '#B87333'}}>Junior</span>
                        )}
                        {bc.tranche === 0 && (
                          <span className="rounded-md bg-[rgb(var(--muted))]/50 px-2 py-0.5 text-xs font-medium text-[rgb(var(--muted-foreground))]">Standard</span>
                        )}
                        {!isBNB && (
                          <span className="rounded-md bg-[#B87333]/10 px-2 py-0.5 text-xs font-medium" style={{color: '#B87333'}}>ERC-20</span>
                        )}
                      </div>
                      <span className="rounded-md bg-[#D4A853]/10 px-2 py-1 text-xs font-bold text-gold">
                        {couponPct}% APY
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-[rgb(var(--muted-foreground))]">Maturity</p>
                        <p className="stat-value font-mono">{matDays}d</p>
                      </div>
                      <div>
                        <p className="text-[rgb(var(--muted-foreground))]">Supply</p>
                        <p className="stat-value font-mono">{Number(bc.totalIssued)}/{Number(bc.maxSupply)}</p>
                      </div>
                      <div>
                        <p className="text-[rgb(var(--muted-foreground))]">Price</p>
                        <p className="stat-value font-mono">
                          {bc.pricePerBond > 0n ? parseFloat(formatEther(bc.pricePerBond)).toFixed(4) : "--"} {isBNB ? "BNB" : ""}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        ) : showIPOForm ? (
          <>
            <h2 className="text-lg font-semibold">Initiate IPO</h2>
            <p className="mt-1 text-sm text-[rgb(var(--muted-foreground))]">
              Launch a bond offering backed by this agent&apos;s revenue stream.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-[rgb(var(--muted-foreground))]">
                  Coupon Rate (basis points)
                </label>
                <input
                  type="number"
                  value={couponRate}
                  onChange={(e) => setCouponRate(e.target.value)}
                  placeholder="500 = 5%"
                  className="mt-1 w-full rounded border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-3 py-2 font-mono text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))]/50 focus:border-[#D4A853] focus:outline-none focus:ring-1 focus:ring-[#D4A853]"
                />
              </div>
              <div>
                <label className="block text-xs text-[rgb(var(--muted-foreground))]">
                  Maturity Period (days)
                </label>
                <input
                  type="number"
                  value={maturityDays}
                  onChange={(e) => setMaturityDays(e.target.value)}
                  placeholder="90"
                  className="mt-1 w-full rounded border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-3 py-2 font-mono text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))]/50 focus:border-[#D4A853] focus:outline-none focus:ring-1 focus:ring-[#D4A853]"
                />
              </div>
              <div>
                <label className="block text-xs text-[rgb(var(--muted-foreground))]">
                  Price Per Bond (BNB)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={pricePerBond}
                  onChange={(e) => setPricePerBond(e.target.value)}
                  placeholder="0.1"
                  className="mt-1 w-full rounded border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-3 py-2 font-mono text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))]/50 focus:border-[#D4A853] focus:outline-none focus:ring-1 focus:ring-[#D4A853]"
                />
              </div>
              <div>
                <label className="block text-xs text-[rgb(var(--muted-foreground))]">
                  Max Supply
                </label>
                <input
                  type="number"
                  value={maxSupply}
                  onChange={(e) => setMaxSupply(e.target.value)}
                  placeholder="1000"
                  className="mt-1 w-full rounded border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-3 py-2 font-mono text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))]/50 focus:border-[#D4A853] focus:outline-none focus:ring-1 focus:ring-[#D4A853]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-[rgb(var(--muted-foreground))]">
                  Payment Token
                </label>
                <div className="mt-1 flex items-center gap-3">
                  <button
                    onClick={() => setIpoPaymentToken(ZERO_ADDRESS)}
                    className={`cursor-pointer rounded px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                      ipoPaymentToken === ZERO_ADDRESS
                        ? "bg-gold/10 text-gold"
                        : "bg-[rgb(var(--secondary))] text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))]"
                    }`}
                  >
                    BNB (Native)
                  </button>
                  <input
                    type="text"
                    value={ipoPaymentToken === ZERO_ADDRESS ? "" : ipoPaymentToken}
                    onChange={(e) => setIpoPaymentToken(e.target.value || ZERO_ADDRESS)}
                    placeholder="0x... ERC-20 address"
                    className="flex-1 rounded border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-3 py-2 font-mono text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))]/50 focus:border-[#D4A853] focus:outline-none focus:ring-1 focus:ring-[#D4A853]"
                  />
                </div>
              </div>
            </div>
            <div className="mt-4">
              <button
                onClick={handleIPO}
                disabled={ipoIsPending || ipoConfirming}
                className="cursor-pointer rounded bg-gold px-6 py-2.5 text-sm font-semibold text-[rgb(var(--primary-foreground))] transition-colors duration-200 hover:bg-[#C49A48] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {ipoIsPending
                  ? "Confirm in Wallet..."
                  : ipoConfirming
                    ? "Processing..."
                    : "Launch IPO"}
              </button>
              {ipoSuccess && (
                <p className="mt-2 text-xs text-sage">
                  IPO initiated successfully.
                </p>
              )}
              {ipoError && (
                <p className="mt-2 text-xs text-crimson">
                  {ipoError.message?.slice(0, 120) || "Transaction failed"}
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold">Bond Status</h2>
            <p className="mt-2 text-sm text-[rgb(var(--muted-foreground))]">
              {!isConnected
                ? "Connect your wallet to interact with this agent."
                : !isOwner
                  ? "Only the agent owner can initiate an IPO."
                  : agentData.state !== 1
                    ? "Agent must be in Active state to initiate an IPO."
                    : "No bond offering for this agent yet."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
