"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Must match contract enum: 0=Unrated, 1=C, 2=B, 3=A, 4=AA, 5=AAA
const CREDIT_LABELS = [
  "Unrated",
  "C",
  "B",
  "A",
  "AA",
  "AAA",
] as const;

// Color stops for the gauge arc
const COLOR_CRIMSON = "#B94137";
const COLOR_COPPER = "#B87333";
const COLOR_SAGE = "#5A8A6E";
const COLOR_GOLD = "#D4A853";

function getGaugeColor(ratio: number): string {
  if (ratio < 0.5) return COLOR_CRIMSON;
  if (ratio < 1.0) return COLOR_COPPER;
  if (ratio < 1.5) return COLOR_SAGE;
  return COLOR_GOLD;
}

function getCreditLabel(rating: number): string {
  return CREDIT_LABELS[rating] ?? CREDIT_LABELS[0];
}

const SIZE_CONFIG = {
  sm: { width: 120, height: 75, strokeWidth: 8, fontSize: 18, labelSize: 10, radius: 45 },
  md: { width: 200, height: 120, strokeWidth: 12, fontSize: 28, labelSize: 13, radius: 70 },
  lg: { width: 280, height: 165, strokeWidth: 16, fontSize: 38, labelSize: 16, radius: 95 },
} as const;

export interface SharpeGaugeProps {
  sharpeRatio: bigint;
  creditRating?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function SharpeGauge({
  sharpeRatio,
  creditRating = 0,
  size = "md",
  className,
}: SharpeGaugeProps) {
  const config = SIZE_CONFIG[size];
  const { width, height, strokeWidth, fontSize, labelSize, radius } = config;

  // Convert bigint (scaled 1e18 in contract)
  const ratioFloat = Number(sharpeRatio) / 1e18;
  // Clamp to 0..3.0 for display
  const clampedRatio = Math.min(Math.max(ratioFloat, 0), 3.0);
  const displayValue = ratioFloat.toFixed(2);

  // Arc math: semi-circle from left to right (180 degrees)
  const cx = width / 2;
  const cy = height - 8;
  const startAngle = Math.PI; // left (180 deg)
  const endAngle = 0; // right (0 deg)
  const sweepAngle = Math.PI; // total sweep

  // Ratio of fill (0 to 1)
  const fillRatio = clampedRatio / 3.0;

  // Background arc path (full semi-circle)
  const bgStartX = cx + radius * Math.cos(startAngle);
  const bgStartY = cy - radius * Math.sin(startAngle);
  const bgEndX = cx + radius * Math.cos(endAngle);
  const bgEndY = cy - radius * Math.sin(endAngle);
  const bgPath = `M ${bgStartX} ${bgStartY} A ${radius} ${radius} 0 0 1 ${bgEndX} ${bgEndY}`;

  // Filled arc path
  const fillAngle = startAngle - fillRatio * sweepAngle;
  const fillEndX = cx + radius * Math.cos(fillAngle);
  const fillEndY = cy - radius * Math.sin(fillAngle);
  const largeArc = fillRatio > 0.5 ? 1 : 0;
  const fillPath =
    fillRatio > 0
      ? `M ${bgStartX} ${bgStartY} A ${radius} ${radius} 0 ${largeArc} 1 ${fillEndX} ${fillEndY}`
      : "";

  const gaugeColor = getGaugeColor(clampedRatio);
  const creditLabel = getCreditLabel(creditRating);

  // Gradient ID unique per instance
  const gradientId = React.useId();

  // Tick marks at 0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0
  const ticks = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0];
  const tickLength = strokeWidth * 0.5;

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Gradient that follows the arc */}
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={COLOR_CRIMSON} />
            <stop offset="33%" stopColor={COLOR_COPPER} />
            <stop offset="50%" stopColor={COLOR_SAGE} />
            <stop offset="100%" stopColor={COLOR_GOLD} />
          </linearGradient>
        </defs>

        {/* Background arc (track) */}
        <path
          d={bgPath}
          stroke="rgb(50 45 40)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
        />

        {/* Filled arc */}
        {fillRatio > 0 && (
          <path
            d={fillPath}
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
          />
        )}

        {/* Tick marks */}
        {ticks.map((tick) => {
          const tickRatio = tick / 3.0;
          const angle = startAngle - tickRatio * sweepAngle;
          const innerR = radius - strokeWidth / 2 - tickLength;
          const outerR = radius - strokeWidth / 2;
          const x1 = cx + innerR * Math.cos(angle);
          const y1 = cy - innerR * Math.sin(angle);
          const x2 = cx + outerR * Math.cos(angle);
          const y2 = cy - outerR * Math.sin(angle);
          return (
            <line
              key={tick}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgb(148 140 128)"
              strokeWidth={1}
            />
          );
        })}

        {/* Needle indicator dot */}
        {fillRatio > 0 && (
          <circle
            cx={fillEndX}
            cy={fillEndY}
            r={strokeWidth * 0.6}
            fill={gaugeColor}
            filter="drop-shadow(0 0 4px rgba(212, 168, 83, 0.4))"
          />
        )}

        {/* Center value */}
        <text
          x={cx}
          y={cy - radius * 0.3}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="'JetBrains Mono', monospace"
          fontWeight="600"
          fontSize={fontSize}
          fill={gaugeColor}
          letterSpacing="-0.02em"
        >
          {displayValue}
        </text>

        {/* Credit rating label */}
        <text
          x={cx}
          y={cy - radius * 0.3 + fontSize * 0.85}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="'Space Grotesk', sans-serif"
          fontWeight="500"
          fontSize={labelSize}
          fill="rgb(148 140 128)"
        >
          {creditLabel}
        </text>

        {/* Scale labels: 0 and 3.0 */}
        <text
          x={cx - radius - strokeWidth / 2}
          y={cy + labelSize + 2}
          textAnchor="middle"
          fontFamily="'JetBrains Mono', monospace"
          fontSize={labelSize * 0.8}
          fill="rgb(148 140 128)"
        >
          0
        </text>
        <text
          x={cx + radius + strokeWidth / 2}
          y={cy + labelSize + 2}
          textAnchor="middle"
          fontFamily="'JetBrains Mono', monospace"
          fontSize={labelSize * 0.8}
          fill="rgb(148 140 128)"
        >
          3.0
        </text>
      </svg>
    </div>
  );
}
