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
  const sharpeDisplay = (sharpeRatioAtIssue / 1e18).toFixed(3);

  return (
    <Link
      href={`/bonds/${classId}`}
      className="cursor-pointer rounded border bg-card p-4 transition-colors duration-150 hover:border-gold/30"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xs text-muted-foreground">class:{classId}</span>
            <h3 className="font-heading text-sm font-semibold">{agentName}</h3>
          </div>
        </div>
        <span className="font-mono text-xs font-medium text-gold">
          {couponPct}%
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3">
        <div>
          <p className="label-mono">maturity</p>
          <p className="mt-0.5 font-mono text-xs font-medium">{maturityDays}d</p>
        </div>
        <div>
          <p className="label-mono">sharpe</p>
          <p className="mt-0.5 font-mono text-xs font-medium">{sharpeDisplay}</p>
        </div>
        <div>
          <p className="label-mono">price</p>
          <p className="mt-0.5 font-mono text-xs font-medium">{priceDisplay} BNB</p>
        </div>
      </div>

      {/* Supply bar */}
      <div className="mt-3 border-t pt-3">
        <div className="flex items-center justify-between text-2xs">
          <span className="label-mono">supply</span>
          <span className="font-mono text-xs">
            {totalIssued} / {maxSupply}
          </span>
        </div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-gold transition-all duration-300"
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>
    </Link>
  );
}
