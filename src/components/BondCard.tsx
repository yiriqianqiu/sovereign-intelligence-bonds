import Link from "next/link";
import { formatEther } from "viem";

interface BondCardProps {
  classId: number;
  agentId: number;
  agentName: string;
  couponRateBps: number;
  maturityPeriod: number;
  sharpeRatioAtIssue: number;
  maxSupply: number;
  totalIssued: number;
  pricePerBond: bigint;
}

export default function BondCard({
  classId,
  agentName,
  couponRateBps,
  maturityPeriod,
  sharpeRatioAtIssue,
  maxSupply,
  totalIssued,
  pricePerBond,
}: BondCardProps) {
  const maturityDays = Math.round(maturityPeriod / 86400);
  const couponPct = (couponRateBps / 100).toFixed(1);
  const fillPct = maxSupply > 0 ? (totalIssued / maxSupply) * 100 : 0;
  const priceDisplay = parseFloat(formatEther(pricePerBond));
  const sharpeDisplay = (sharpeRatioAtIssue / 1000).toFixed(3);

  return (
    <Link
      href={`/bonds/${classId}`}
      className="card-glass cursor-pointer rounded-xl p-5 transition-colors duration-200"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Class #{classId}</p>
          <h3 className="mt-0.5 text-base font-semibold">{agentName}</h3>
        </div>
        <span className="rounded-md bg-[#D4A853]/10 px-2.5 py-1 text-xs font-bold text-gold">
          {couponPct}% APY
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Maturity</p>
          <p className="stat-value font-mono text-sm">{maturityDays}d</p>
        </div>
        <div>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Sharpe at Issue</p>
          <p className="stat-value font-mono text-sm">{sharpeDisplay}</p>
        </div>
        <div>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Price</p>
          <p className="stat-value font-mono text-sm">{priceDisplay} BNB</p>
        </div>
      </div>

      {/* Supply bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[rgb(var(--muted-foreground))]">Supply</span>
          <span className="font-mono">
            {totalIssued.toLocaleString()} / {maxSupply.toLocaleString()}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[rgb(var(--secondary))]">
          <div
            className="h-full rounded-full bg-[#D4A853] transition-all duration-500"
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>
    </Link>
  );
}
