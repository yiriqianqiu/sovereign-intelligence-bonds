"use client";

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import { useCreditScore, useCreditFactors, creditRatingLabel } from "@/hooks/useCreditModel";

interface CreditScoreRadarProps {
  agentId: number;
}

export function CreditScoreRadar({ agentId }: CreditScoreRadarProps) {
  const { data: score, isLoading: scoreLoading } = useCreditScore(agentId);
  const { data: factors, isLoading: factorsLoading } = useCreditFactors(agentId);

  if (scoreLoading || factorsLoading) {
    return (
      <div className="card-glass rounded p-6">
        <p className="text-sm text-[rgb(var(--muted-foreground))]">Loading credit data...</p>
      </div>
    );
  }

  // Normalize factors to 0-100 scale for radar display
  const sharpe = factors ? Math.min(parseFloat(factors.sharpeRatio) * 33.3, 100) : 0;
  const stability = factors ? Math.min(parseFloat(factors.revenueStability) * 100, 100) : 0;
  const frequency = factors ? Math.min(parseFloat(factors.paymentFrequency) * 100, 100) : 0;
  const age = factors ? Math.min(parseFloat(factors.agentAge) * 100, 100) : 0;
  const revenue = factors ? Math.min(parseFloat(factors.totalRevenue) * 100, 100) : 0;

  const chartData = [
    { dimension: "Sharpe", value: sharpe },
    { dimension: "Stability", value: stability },
    { dimension: "Frequency", value: frequency },
    { dimension: "Age", value: age },
    { dimension: "Revenue", value: revenue },
  ];

  const ratingLabel = score ? creditRatingLabel(score.rating) : "Unrated";
  const compositeScore = score?.score ?? 0;

  return (
    <div className="card-glass rounded p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Credit Score</h3>
        <div className="flex items-center gap-3">
          <span className="stat-value text-xl text-gold">{compositeScore}</span>
          <span className="rounded-md bg-[#D4A853]/10 px-2.5 py-1 text-xs font-bold text-gold">
            {ratingLabel}
          </span>
        </div>
      </div>

      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid stroke="rgb(50, 45, 40)" />
            <PolarAngleAxis
              dataKey="dimension"
              tick={{ fill: "rgb(148, 140, 128)", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <Radar
              dataKey="value"
              stroke="#5A8A6E"
              fill="#D4A853"
              fillOpacity={0.2}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Factor breakdown */}
      {factors && (
        <div className="mt-2 grid grid-cols-5 gap-2 text-center">
          {chartData.map((d) => (
            <div key={d.dimension}>
              <p className="text-xs text-[rgb(var(--muted-foreground))]">{d.dimension}</p>
              <p className="stat-value text-xs">{d.value.toFixed(0)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
