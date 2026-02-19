"use client";

import { useTrancheGroup } from "@/hooks/useTranching";
import { useBondClass, useBondTotalSupply, useActiveNonce } from "@/hooks/useBonds";

interface TrancheComparisonProps {
  groupId: number;
}

function TrancheCard({
  label,
  riskLabel,
  couponBps,
  maxSupply,
  totalIssued,
  accentColor,
}: {
  label: string;
  riskLabel: string;
  couponBps: number;
  maxSupply: number;
  totalIssued: number;
  accentColor: string;
}) {
  const fillPct = maxSupply > 0 ? (totalIssued / maxSupply) * 100 : 0;
  const couponPct = (couponBps / 100).toFixed(1);

  return (
    <div className="card-glass rounded p-5">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{label}</h4>
        <span
          className="rounded-md px-2.5 py-1 text-xs font-bold"
          style={{ color: accentColor, backgroundColor: `${accentColor}15` }}
        >
          {couponPct}% APY
        </span>
      </div>
      <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">{riskLabel}</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Supply</p>
          <p className="stat-value font-mono text-sm">
            {totalIssued.toLocaleString()} / {maxSupply.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Fill Rate</p>
          <p className="stat-value font-mono text-sm">{fillPct.toFixed(1)}%</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--secondary))]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${fillPct}%`, backgroundColor: accentColor }}
        />
      </div>
    </div>
  );
}

export function TrancheComparison({ groupId }: TrancheComparisonProps) {
  const { data: group, isLoading } = useTrancheGroup(groupId);

  const { data: seniorClass } = useBondClass(group?.seniorClassId);
  const { data: juniorClass } = useBondClass(group?.juniorClassId);

  const { data: seniorNonceId } = useActiveNonce(group?.seniorClassId);
  const { data: juniorNonceId } = useActiveNonce(group?.juniorClassId);

  const { data: seniorSupply } = useBondTotalSupply(group?.seniorClassId, seniorNonceId);
  const { data: juniorSupply } = useBondTotalSupply(group?.juniorClassId, juniorNonceId);

  if (isLoading || !group) {
    return (
      <div className="card-glass rounded p-6">
        <p className="text-sm text-[rgb(var(--muted-foreground))]">Loading tranche data...</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-4 text-base font-semibold">
        Tranche Comparison
        <span className="ml-2 text-xs text-[rgb(var(--muted-foreground))]">Group #{groupId}</span>
      </h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TrancheCard
          label="Senior Tranche"
          riskLabel="Lower Risk / Fixed Income"
          couponBps={group.seniorCouponBps}
          maxSupply={seniorClass?.maxSupply ?? 0}
          totalIssued={seniorSupply ?? 0}
          accentColor="#5A8A6E"
        />
        <TrancheCard
          label="Junior Tranche"
          riskLabel="Higher Risk / Variable Income"
          couponBps={group.juniorCouponBps}
          maxSupply={juniorClass?.maxSupply ?? 0}
          totalIssued={juniorSupply ?? 0}
          accentColor="#B87333"
        />
      </div>
    </div>
  );
}
