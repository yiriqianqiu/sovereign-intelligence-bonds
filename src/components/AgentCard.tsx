import Link from "next/link";
import { formatEther } from "viem";

type CreditRating = "Unrated" | "C" | "B" | "A" | "AA" | "AAA";

const STATE_LABELS = ["Registered", "Active", "Suspended", "Deregistered"];

function RatingBadge({ rating }: { rating: CreditRating }) {
  const colorMap: Record<string, string> = {
    AAA: "text-gold",
    AA: "text-gold",
    A: "text-sage",
    B: "text-sage",
    C: "text-crimson",
  };
  const color = colorMap[rating] || "text-muted-foreground";
  return (
    <span className={`font-mono text-xs font-medium ${color}`}>
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
      className="cursor-pointer rounded border bg-card p-4 transition-colors duration-150 hover:border-gold/30"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xs text-muted-foreground">#{id}</span>
            <h3 className="truncate font-heading text-sm font-semibold">{name}</h3>
          </div>
          <p className="mt-1 line-clamp-1 text-2xs text-muted-foreground">
            {description}
          </p>
        </div>
        <RatingBadge rating={creditRating} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3">
        <div>
          <p className="label-mono">sharpe</p>
          <p className="mt-0.5 font-mono text-xs font-medium">
            {sharpeRatio > 0 ? sharpeRatio.toFixed(3) : "--"}
          </p>
        </div>
        <div>
          <p className="label-mono">earned</p>
          <p className="mt-0.5 font-mono text-xs font-medium">{formatEther(totalEarned)}</p>
        </div>
        <div>
          <p className="label-mono">state</p>
          <p className="mt-0.5 font-mono text-xs font-medium">{STATE_LABELS[state] || "?"}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-2xs">
        <span className="text-muted-foreground">
          {totalPayments} payments
        </span>
        {hasIPO ? (
          <span className="text-sage">ipo:active</span>
        ) : (
          <span className="text-muted-foreground">ipo:none</span>
        )}
      </div>
    </Link>
  );
}
