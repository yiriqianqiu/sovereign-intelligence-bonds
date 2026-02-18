"use client";

import * as React from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseAbi, formatEther } from "viem";

import { Button } from "@/components/ui/button";
import { DividendVaultV2ABI } from "@/lib/contracts";
import { ADDRESSES } from "@/lib/contract-addresses";

export interface DividendClaimButtonProps {
  classId: bigint;
  nonceId: bigint;
  claimable: bigint;
  onSuccess?: () => void;
  className?: string;
}

export function DividendClaimButton({
  classId,
  nonceId,
  claimable,
  onSuccess,
  className,
}: DividendClaimButtonProps) {
  const {
    writeContract,
    data: txHash,
    isPending: isWritePending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: txHash,
    });

  const handleClaim = () => {
    writeContract({
      address: ADDRESSES.DividendVaultV2 as `0x${string}`,
      abi: parseAbi(DividendVaultV2ABI),
      functionName: "claim",
      args: [classId, nonceId, "0x0000000000000000000000000000000000000000" as `0x${string}`],
    });
  };

  React.useEffect(() => {
    if (isConfirmed) {
      onSuccess?.();
      const timer = setTimeout(() => resetWrite(), 3000);
      return () => clearTimeout(timer);
    }
  }, [isConfirmed, onSuccess, resetWrite]);

  const isDisabled =
    claimable === 0n || isWritePending || isConfirming || isConfirmed;

  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Claimable</span>
          <span className="font-mono text-sm font-semibold text-primary">
            {formatEther(claimable)} BNB
          </span>
        </div>
        <Button
          size="sm"
          onClick={handleClaim}
          disabled={isDisabled}
          variant={isConfirmed ? "secondary" : "default"}
        >
          {isWritePending
            ? "Signing..."
            : isConfirming
            ? "Confirming..."
            : isConfirmed
            ? "Claimed"
            : "Claim"}
        </Button>
      </div>
      {writeError && (
        <p className="text-xs text-destructive mt-1">
          {writeError.message.length > 80
            ? writeError.message.slice(0, 80) + "..."
            : writeError.message}
        </p>
      )}
    </div>
  );
}
