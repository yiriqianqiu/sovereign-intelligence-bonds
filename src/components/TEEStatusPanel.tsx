"use client";

import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseAbi } from "viem";
import { useTEEStatus } from "@/hooks/useTEEStatus";
import { ADDRESSES } from "@/lib/contract-addresses";

const TEERegistryWriteABI = parseAbi([
  "function authorizeTEEAgent(uint256 agentId, address teeWallet)",
  "function revokeTEEAgent(uint256 agentId)",
]);

interface TEEStatusPanelProps {
  agentId: bigint;
  isOwner: boolean;
}

export function TEEStatusPanel({ agentId, isOwner }: TEEStatusPanelProps) {
  const { teeWallet, quoteHash, attestedAt, isActive, isLoading, refetch } = useTEEStatus(agentId);
  const [newTEEWallet, setNewTEEWallet] = useState("");

  const { writeContract: authorize, data: authHash, isPending: authPending } = useWriteContract();
  const { isLoading: authConfirming, isSuccess: authSuccess } = useWaitForTransactionReceipt({ hash: authHash });

  const { writeContract: revoke, data: revokeHash, isPending: revokePending } = useWriteContract();
  const { isLoading: revokeConfirming, isSuccess: revokeSuccess } = useWaitForTransactionReceipt({ hash: revokeHash });

  // Refetch after successful tx
  if (authSuccess || revokeSuccess) {
    refetch();
  }

  const hasTEE = teeWallet && teeWallet !== "0x0000000000000000000000000000000000000000";

  const handleAuthorize = () => {
    if (!newTEEWallet.match(/^0x[a-fA-F0-9]{40}$/)) return;
    authorize({
      address: ADDRESSES.TEERegistry as `0x${string}`,
      abi: TEERegistryWriteABI,
      functionName: "authorizeTEEAgent",
      args: [agentId, newTEEWallet as `0x${string}`],
    });
  };

  const handleRevoke = () => {
    revoke({
      address: ADDRESSES.TEERegistry as `0x${string}`,
      abi: TEERegistryWriteABI,
      functionName: "revokeTEEAgent",
      args: [agentId],
    });
  };

  function formatTime(timestamp: bigint | undefined): string {
    if (!timestamp || timestamp === 0n) return "Never";
    const date = new Date(Number(timestamp) * 1000);
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    if (diffH < 1) return `${Math.floor(diffMs / 60000)}m ago`;
    if (diffH < 24) return `${diffH}h ago`;
    return `${Math.floor(diffH / 24)}d ago`;
  }

  function truncateHash(hash: string | undefined): string {
    if (!hash) return "--";
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
  }

  if (isLoading) {
    return (
      <div className="card-glass rounded p-6">
        <h2 className="text-lg font-semibold">TEE Status</h2>
        <p className="mt-2 text-sm text-[rgb(var(--muted-foreground))]">Loading TEE information...</p>
      </div>
    );
  }

  return (
    <div className="card-glass rounded p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">TEE Status</h2>
        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${isActive ? "bg-sage" : "bg-[rgb(var(--muted-foreground))]/30"}`} />
          <span className={`text-xs font-medium ${isActive ? "text-sage" : "text-[rgb(var(--muted-foreground))]"}`}>
            {isActive ? "Active" : hasTEE ? "Inactive" : "Not Configured"}
          </span>
        </div>
      </div>

      {hasTEE && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-[rgb(var(--muted-foreground))]">TEE Wallet</p>
            <p className="mt-0.5 font-mono text-sm">{truncateHash(teeWallet)}</p>
          </div>
          <div>
            <p className="text-xs text-[rgb(var(--muted-foreground))]">Last Attestation</p>
            <p className="mt-0.5 font-mono text-sm">{formatTime(attestedAt)}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-[rgb(var(--muted-foreground))]">TDX Quote Hash</p>
            <p className="mt-0.5 font-mono text-sm">{truncateHash(quoteHash)}</p>
          </div>
        </div>
      )}

      {!hasTEE && !isOwner && (
        <p className="mt-2 text-sm text-[rgb(var(--muted-foreground))]">
          No TEE agent is configured for this agent.
        </p>
      )}

      {isOwner && (
        <div className="mt-4 border-t border-[rgb(var(--border))] pt-4">
          {hasTEE ? (
            <div className="flex items-center justify-between">
              <p className="text-xs text-[rgb(var(--muted-foreground))]">
                TEE wallet is authorized. You can revoke access.
              </p>
              <button
                onClick={handleRevoke}
                disabled={revokePending || revokeConfirming}
                className="cursor-pointer rounded border border-crimson/30 px-4 py-1.5 text-xs font-medium text-crimson transition-colors hover:bg-crimson/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {revokePending ? "Confirm..." : revokeConfirming ? "Revoking..." : "Revoke TEE"}
              </button>
            </div>
          ) : (
            <div>
              <label className="block text-xs text-[rgb(var(--muted-foreground))]">
                Authorize TEE Wallet Address
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  type="text"
                  value={newTEEWallet}
                  onChange={(e) => setNewTEEWallet(e.target.value)}
                  placeholder="0x..."
                  className="flex-1 rounded border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-3 py-2 font-mono text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))]/50 focus:border-[#D4A853] focus:outline-none focus:ring-1 focus:ring-[#D4A853]"
                />
                <button
                  onClick={handleAuthorize}
                  disabled={authPending || authConfirming || !newTEEWallet.match(/^0x[a-fA-F0-9]{40}$/)}
                  className="cursor-pointer rounded bg-gold px-4 py-2 text-sm font-semibold text-[rgb(var(--primary-foreground))] transition-colors hover:bg-[#C49A48] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {authPending ? "Confirm..." : authConfirming ? "Processing..." : "Authorize"}
                </button>
              </div>
            </div>
          )}
          {(authSuccess || revokeSuccess) && (
            <p className="mt-2 text-xs text-sage">Transaction confirmed successfully.</p>
          )}
        </div>
      )}
    </div>
  );
}
