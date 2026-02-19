"use client";

import { useVaultBalance, useVaultTotalDeposits } from "@/hooks/useAutoCompound";
import { useClaimable } from "@/hooks/useDividend";

interface AutoCompoundDashboardProps {
  classId: number;
  nonceId: number;
}

export function AutoCompoundDashboard({ classId, nonceId }: AutoCompoundDashboardProps) {
  const { data: userBalance, isLoading: balLoading } = useVaultBalance(classId, nonceId);
  const { data: totalDeposits, isLoading: totalLoading } = useVaultTotalDeposits(classId, nonceId);
  const { data: claimable } = useClaimable(classId, nonceId);

  const isLoading = balLoading || totalLoading;

  if (isLoading) {
    return (
      <div className="card-glass rounded p-6">
        <p className="text-sm text-[rgb(var(--muted-foreground))]">Loading vault data...</p>
      </div>
    );
  }

  const shareOfVault =
    totalDeposits && totalDeposits > 0 && userBalance
      ? ((userBalance / totalDeposits) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="card-glass rounded p-6">
      <h3 className="mb-4 text-base font-semibold">
        Auto-Compound Vault
        <span className="ml-2 text-xs text-[rgb(var(--muted-foreground))]">
          Class #{classId} / Nonce #{nonceId}
        </span>
      </h3>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Your Deposited</p>
          <p className="stat-value text-lg">{userBalance ?? 0}</p>
        </div>
        <div>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Vault Total</p>
          <p className="stat-value text-lg">{totalDeposits ?? 0}</p>
        </div>
        <div>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Your Share</p>
          <p className="stat-value text-lg">{shareOfVault}%</p>
        </div>
        <div>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Claimable Dividends</p>
          <p className="stat-value text-lg text-gold">{claimable ?? "0"} BNB</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-6 flex gap-3">
        <button className="flex-1 rounded bg-[#D4A853]/10 py-2.5 text-sm font-semibold text-gold transition-colors hover:bg-[#D4A853]/20">
          Deposit
        </button>
        <button className="flex-1 rounded bg-[rgb(var(--secondary))] py-2.5 text-sm font-semibold text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--border))]">
          Withdraw
        </button>
        <button className="flex-1 rounded bg-[#5A8A6E]/10 py-2.5 text-sm font-semibold text-sage transition-colors hover:bg-[#5A8A6E]/20">
          Compound
        </button>
      </div>
    </div>
  );
}
