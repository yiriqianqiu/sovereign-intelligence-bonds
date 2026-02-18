"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground",
        // Credit rating variants
        aaa: "border-primary/30 bg-primary/15 text-primary font-mono",
        aa: "border-primary/25 bg-primary/10 text-primary font-mono",
        a: "border-success/30 bg-success/15 text-success font-mono",
        bbb: "border-muted-foreground/30 bg-muted/50 text-muted-foreground font-mono",
        bb: "border-muted-foreground/20 bg-muted/30 text-muted-foreground font-mono",
        b: "border-muted-foreground/20 bg-muted/30 text-muted-foreground font-mono",
        ccc: "border-destructive/30 bg-destructive/10 text-destructive font-mono",
        unrated:
          "border-border bg-transparent text-muted-foreground font-mono",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(badgeVariants({ variant }), className)}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";

// Helper to map numeric credit rating to badge variant
const CREDIT_RATING_LABELS = [
  "Unrated",
  "AAA",
  "AA",
  "A",
  "BBB",
  "BB",
  "B",
  "CCC",
] as const;

const CREDIT_RATING_VARIANTS: Record<string, BadgeProps["variant"]> = {
  AAA: "aaa",
  AA: "aa",
  A: "a",
  BBB: "bbb",
  BB: "bb",
  B: "b",
  CCC: "ccc",
  Unrated: "unrated",
};

export function CreditRatingBadge({
  rating,
  className,
}: {
  rating: number;
  className?: string;
}) {
  const label =
    CREDIT_RATING_LABELS[rating] ?? CREDIT_RATING_LABELS[0];
  const variant = CREDIT_RATING_VARIANTS[label] ?? "unrated";
  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}

export { Badge, badgeVariants };
