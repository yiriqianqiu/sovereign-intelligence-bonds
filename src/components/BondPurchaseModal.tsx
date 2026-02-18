"use client";

import * as React from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseAbi, formatEther } from "viem";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SIBControllerV2ABI } from "@/lib/contracts";
import { ADDRESSES } from "@/lib/contract-addresses";

export interface BondPurchaseModalProps {
  classId: bigint;
  nonceId: bigint;
  pricePerBond: bigint;
  maxSupply: bigint;
  totalIssued: bigint;
  isOpen: boolean;
  onClose: () => void;
}

export function BondPurchaseModal({
  classId,
  nonceId,
  pricePerBond,
  maxSupply,
  totalIssued,
  isOpen,
  onClose,
}: BondPurchaseModalProps) {
  const [amount, setAmount] = React.useState("");
  const parsedAmount = React.useMemo(() => {
    const n = parseInt(amount, 10);
    return Number.isNaN(n) || n <= 0 ? 0 : n;
  }, [amount]);

  const totalCost = BigInt(parsedAmount) * pricePerBond;
  const remaining = maxSupply - totalIssued;
  const exceedsSupply = BigInt(parsedAmount) > remaining;

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

  const handlePurchase = () => {
    if (parsedAmount <= 0 || exceedsSupply) return;
    writeContract({
      address: ADDRESSES.SIBControllerV2 as `0x${string}`,
      abi: parseAbi(SIBControllerV2ABI),
      functionName: "purchaseBondsBNB",
      args: [classId, BigInt(parsedAmount)],
      value: totalCost,
    });
  };

  const handleClose = React.useCallback(() => {
    setAmount("");
    resetWrite();
    onClose();
  }, [resetWrite, onClose]);

  // Auto-close after confirmed
  React.useEffect(() => {
    if (isConfirmed) {
      const timer = setTimeout(handleClose, 2000);
      return () => clearTimeout(timer);
    }
  }, [isConfirmed, handleClose]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Purchase Bonds</DialogTitle>
          <DialogDescription>
            Class #{classId.toString()} / Nonce #{nonceId.toString()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Price info */}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Price per bond</span>
            <span className="font-mono text-foreground">
              {formatEther(pricePerBond)} BNB
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Available</span>
            <span className="font-mono text-foreground">
              {remaining.toString()} / {maxSupply.toString()}
            </span>
          </div>

          {/* Amount input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Amount
            </label>
            <Input
              type="number"
              placeholder="Number of bonds"
              min="1"
              max={remaining.toString()}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isWritePending || isConfirming || isConfirmed}
            />
            {exceedsSupply && parsedAmount > 0 && (
              <p className="text-xs text-destructive">
                Exceeds available supply ({remaining.toString()} remaining)
              </p>
            )}
          </div>

          {/* Total cost */}
          {parsedAmount > 0 && !exceedsSupply && (
            <div className="flex justify-between text-sm p-3 rounded-md bg-secondary/50 border border-border">
              <span className="text-muted-foreground">Total cost</span>
              <span className="font-mono font-semibold text-primary">
                {formatEther(totalCost)} BNB
              </span>
            </div>
          )}

          {/* Transaction states */}
          {isWritePending && (
            <p className="text-sm text-muted-foreground text-center">
              Confirm in your wallet...
            </p>
          )}
          {isConfirming && (
            <p className="text-sm text-primary text-center">
              Transaction confirming...
            </p>
          )}
          {isConfirmed && (
            <p className="text-sm text-success text-center font-medium">
              Purchase successful
            </p>
          )}
          {writeError && (
            <p className="text-sm text-destructive text-center">
              {writeError.message.length > 100
                ? writeError.message.slice(0, 100) + "..."
                : writeError.message}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={handleClose}>
            {isConfirmed ? "Close" : "Cancel"}
          </Button>
          <Button
            onClick={handlePurchase}
            disabled={
              parsedAmount <= 0 ||
              exceedsSupply ||
              isWritePending ||
              isConfirming ||
              isConfirmed
            }
          >
            {isWritePending
              ? "Signing..."
              : isConfirming
              ? "Confirming..."
              : "Purchase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
