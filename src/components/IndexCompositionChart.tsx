"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useIndex, useUserShares, useTotalShares } from "@/hooks/useIndexBond";

interface IndexCompositionChartProps {
  indexId: number;
}

const COLORS = ["#D4A853", "#5A8A6E", "#B87333", "#8A8578", "#B94137", "#6B8CA3", "#A67B5B", "#7A9B76"];

export function IndexCompositionChart({ indexId }: IndexCompositionChartProps) {
  const { data: index, isLoading: indexLoading } = useIndex(indexId);
  const { data: userShares } = useUserShares(indexId);
  const { data: totalShares } = useTotalShares(indexId);

  if (indexLoading || !index) {
    return (
      <div className="card-glass rounded-xl p-6">
        <p className="text-sm text-[rgb(var(--muted-foreground))]">Loading index data...</p>
      </div>
    );
  }

  const totalWeight = index.weights.reduce((sum, w) => sum + w, 0);
  const chartData = index.classIds.map((cid, i) => ({
    name: `Class #${cid}`,
    value: index.weights[i],
    pct: totalWeight > 0 ? ((index.weights[i] / totalWeight) * 100).toFixed(1) : "0",
  }));

  return (
    <div className="card-glass rounded-xl p-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold">{index.name}</h3>
          <p className="mt-0.5 text-xs text-[rgb(var(--muted-foreground))]">
            Index #{indexId} / {index.classIds.length} components
          </p>
        </div>
        {!index.active && (
          <span className="rounded-md bg-[rgb(var(--muted-foreground))]/10 px-2.5 py-1 text-xs font-bold text-[rgb(var(--muted-foreground))]">
            Inactive
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-6">
        {/* Donut chart */}
        <div className="h-48 w-48 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                dataKey="value"
                stroke="rgb(16, 14, 12)"
                strokeWidth={2}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgb(26, 23, 20)",
                  border: "1px solid rgb(50, 45, 40)",
                  borderRadius: "8px",
                  color: "rgb(245, 241, 235)",
                  fontSize: 12,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-2">
          {chartData.map((entry, i) => (
            <div key={entry.name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span>{entry.name}</span>
              </div>
              <span className="font-mono text-[rgb(var(--muted-foreground))]">{entry.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Shares info */}
      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-[rgb(var(--border))] pt-4">
        <div>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Total Shares</p>
          <p className="stat-value text-sm">{(totalShares ?? 0).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Your Shares</p>
          <p className="stat-value text-sm text-gold">{(userShares ?? 0).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}
