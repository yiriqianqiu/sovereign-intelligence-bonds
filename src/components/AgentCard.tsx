import Link from "next/link";
import { formatEther } from "viem";

type CreditRating = "Unrated" | "C" | "B" | "A" | "AA" | "AAA";

const STATE_LABELS = ["Registered", "Active", "Suspended", "Deregistered"];

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
    <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ${colorClass}`}>
      {rating}
    </span>
  );
}

interface AgentCardProps {
  id: number;
  name: string;
  description: string;
  creditRating: CreditRating;
  sharpeRatio: number;
  totalEarned: bigint;
  totalPayments: number;
  hasIPO: boolean;
  state: number;
}

export default function AgentCard({
  id,
  name,
  description,
  creditRating,
  sharpeRatio,
  totalEarned,
  totalPayments,
  hasIPO,
  state,
}: AgentCardProps) {
  return (
    <Link
      href={`/agents/${id}`}
      className="card-glass cursor-pointer rounded-xl p-5 transition-colors duration-200"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold">{name}</h3>
          <p className="mt-1 line-clamp-2 text-xs text-[rgb(var(--muted-foreground))]">
            {description}
          </p>
        </div>
        <RatingBadge rating={creditRating} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Sharpe Ratio</p>
          <p className="stat-value font-mono text-sm">
            {sharpeRatio > 0 ? sharpeRatio.toFixed(3) : "--"}
          </p>
        </div>
        <div>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Total Earned</p>
          <p className="stat-value font-mono text-sm">{formatEther(totalEarned)} BNB</p>
        </div>
        <div>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">State</p>
          <p className="stat-value font-mono text-sm">{STATE_LABELS[state] || "Unknown"}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-[rgb(var(--muted-foreground))]">
          {totalPayments} payments
        </span>
        {hasIPO ? (
          <span className="rounded-md bg-[#5A8A6E]/10 px-2.5 py-1 text-xs font-medium text-sage">
            IPO Active
          </span>
        ) : (
          <span className="rounded-md bg-[rgb(var(--muted))]/50 px-2.5 py-1 text-xs font-medium text-[rgb(var(--muted-foreground))]">
            No IPO
          </span>
        )}
      </div>
    </Link>
  );
}
