export const dynamic = "force-dynamic";

import { createPublicClient, http, formatEther } from "viem";
import { bscTestnet } from "viem/chains";
import { NFARegistryV2ABI, SIBControllerV2ABI } from "@/lib/contracts";
import { ADDRESSES } from "@/lib/contract-addresses";

const client = createPublicClient({
  chain: bscTestnet,
  transport: http(),
});

const CREDIT_LABELS = ["Unrated", "C", "B", "A", "AA", "AAA"] as const;

type MetadataTuple = readonly [string, string, string, string, bigint];
type RevenueTuple = readonly [bigint, bigint, bigint, bigint, `0x${string}`, readonly bigint[], number];

function calculateStabilityScore(monthlyRevenue: readonly bigint[]): number {
  const values = monthlyRevenue.map(Number);
  const nonZero = values.filter((v) => v > 0);
  if (nonZero.length < 2) return 0;

  const mean = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
  if (mean === 0) return 0;

  const variance = nonZero.reduce((sum, v) => sum + (v - mean) ** 2, 0) / nonZero.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean; // coefficient of variation

  // Lower CV = more stable. CV < 0.3 = excellent, > 1.0 = poor
  return Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));
}

function calculateGrowthTrend(monthlyRevenue: readonly bigint[]): string {
  const values = monthlyRevenue.map(Number);
  const nonZero = values.filter((v) => v > 0);
  if (nonZero.length < 2) return "Insufficient Data";

  const recent = nonZero.slice(-3);
  const earlier = nonZero.slice(0, Math.max(1, nonZero.length - 3));

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;

  if (earlierAvg === 0) return "New";
  const growthRate = (recentAvg - earlierAvg) / earlierAvg;

  if (growthRate > 0.2) return "Strong Growth";
  if (growthRate > 0.05) return "Moderate Growth";
  if (growthRate > -0.05) return "Stable";
  if (growthRate > -0.2) return "Declining";
  return "Sharp Decline";
}

function generateRecommendation(
  creditRating: number,
  stabilityScore: number,
  sharpeRatio: number,
  totalEarned: bigint,
  growthTrend: string
): string {
  let score = 0;

  // Credit rating weight (0-30)
  score += creditRating * 6;

  // Stability weight (0-25)
  score += Math.round(stabilityScore * 0.25);

  // Sharpe ratio weight (0-25)
  const sharpeNorm = Math.min(sharpeRatio / 2, 1);
  score += Math.round(sharpeNorm * 25);

  // Revenue weight (0-10)
  const earnedBNB = Number(formatEther(totalEarned));
  score += Math.min(10, Math.round(earnedBNB * 10));

  // Growth trend weight (0-10)
  if (growthTrend === "Strong Growth") score += 10;
  else if (growthTrend === "Moderate Growth") score += 7;
  else if (growthTrend === "Stable") score += 5;
  else if (growthTrend === "Declining") score += 2;

  if (score >= 75) return "Strong Buy";
  if (score >= 60) return "Buy";
  if (score >= 40) return "Hold";
  if (score >= 25) return "Reduce";
  return "Sell";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentIdParam = searchParams.get("agentId");
    const txHash = searchParams.get("txHash");

    if (!agentIdParam) {
      return Response.json({ error: "agentId parameter required" }, { status: 400 });
    }

    if (!txHash) {
      return Response.json(
        { error: "Payment required", message: "txHash parameter required — pay via B402PaymentReceiver.payBNB first" },
        { status: 402 }
      );
    }

    // Verify the payment transaction on-chain
    try {
      const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
      if (!receipt || receipt.status !== "success") {
        return Response.json({ error: "Payment transaction failed or not found" }, { status: 402 });
      }
      // Verify it went to B402PaymentReceiver
      const b402Addr = (ADDRESSES.B402PaymentReceiver as string).toLowerCase();
      if (receipt.to?.toLowerCase() !== b402Addr) {
        return Response.json({ error: "Transaction is not a valid B402 payment" }, { status: 402 });
      }
    } catch {
      return Response.json({ error: "Could not verify payment transaction" }, { status: 402 });
    }

    const agentId = BigInt(agentIdParam);

    // Read on-chain data
    const [metadata, state, rating, revenue, balance] = await Promise.all([
      client.readContract({
        address: ADDRESSES.NFARegistry as `0x${string}`,
        abi: NFARegistryV2ABI,
        functionName: "getAgentMetadata",
        args: [agentId],
      }),
      client.readContract({
        address: ADDRESSES.NFARegistry as `0x${string}`,
        abi: NFARegistryV2ABI,
        functionName: "getAgentState",
        args: [agentId],
      }),
      client.readContract({
        address: ADDRESSES.NFARegistry as `0x${string}`,
        abi: NFARegistryV2ABI,
        functionName: "creditRatings",
        args: [agentId],
      }),
      client.readContract({
        address: ADDRESSES.NFARegistry as `0x${string}`,
        abi: NFARegistryV2ABI,
        functionName: "getRevenueProfile",
        args: [agentId],
      }),
      client.readContract({
        address: ADDRESSES.NFARegistry as `0x${string}`,
        abi: NFARegistryV2ABI,
        functionName: "getAgentBalance",
        args: [agentId],
      }),
    ]);

    const meta = metadata as unknown as MetadataTuple;
    const rev = revenue as unknown as RevenueTuple;
    const ratingNum = Number(rating);
    const stateNum = Number(state);

    const totalEarned = rev[0];
    const totalPayments = Number(rev[1]);
    const sharpeRatio = Number(formatEther(rev[3]));
    const monthlyRevenue = rev[5];

    const stabilityScore = calculateStabilityScore(monthlyRevenue);
    const growthTrend = calculateGrowthTrend(monthlyRevenue);
    const recommendation = generateRecommendation(
      ratingNum, stabilityScore, sharpeRatio, totalEarned, growthTrend
    );

    // Check bond classes
    let bondClassCount = 0;
    let hasIPO = false;
    try {
      hasIPO = (await client.readContract({
        address: ADDRESSES.SIBControllerV2 as `0x${string}`,
        abi: SIBControllerV2ABI,
        functionName: "hasIPO",
        args: [agentId],
      })) as boolean;

      if (hasIPO) {
        const classIds = (await client.readContract({
          address: ADDRESSES.SIBControllerV2 as `0x${string}`,
          abi: SIBControllerV2ABI,
          functionName: "getAgentBondClasses",
          args: [agentId],
        })) as bigint[];
        bondClassCount = classIds.length;
      }
    } catch {
      // no bond classes
    }

    // Calculate agent age in days
    const registeredAt = Number(meta[4]);
    const ageDays = Math.max(1, Math.round((Date.now() / 1000 - registeredAt) / 86400));

    // Monthly revenue formatted
    const monthlyRevenueFormatted = Array.from(monthlyRevenue).map((v, i) => ({
      month: i + 1,
      revenue: formatEther(v),
    }));

    const report = {
      agentId: Number(agentId),
      agentName: meta[0],
      description: meta[1],
      state: stateNum,
      stateLabel: ["Registered", "Active", "Suspended", "Deregistered"][stateNum] || "Unknown",
      generatedAt: new Date().toISOString(),

      // Financial Metrics
      financials: {
        totalEarned: formatEther(totalEarned),
        totalPayments,
        agentBalance: formatEther(balance as bigint),
        sharpeRatio: sharpeRatio.toFixed(4),
        ageDays,
        revenuePerDay: ageDays > 0 ? formatEther(totalEarned / BigInt(ageDays)) : "0",
      },

      // Credit Assessment
      credit: {
        rating: CREDIT_LABELS[ratingNum] || "Unrated",
        ratingIndex: ratingNum,
        stabilityScore,
        growthTrend,
      },

      // Bond Status
      bonds: {
        hasIPO,
        bondClassCount,
      },

      // Monthly Revenue Trend
      monthlyRevenue: monthlyRevenueFormatted,

      // Investment Recommendation
      recommendation,
    };

    return Response.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { error: "Failed to generate credit report", detail: message },
      { status: 500 }
    );
  }
}
