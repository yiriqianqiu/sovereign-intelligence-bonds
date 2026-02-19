"use client";

import { useState } from "react";
import { AutoCompoundDashboard } from "@/components/AutoCompoundDashboard";

export default function VaultPage() {
  const [classIdInput, setClassIdInput] = useState("");
  const [nonceIdInput, setNonceIdInput] = useState("");
  const [viewClassId, setViewClassId] = useState<number | null>(null);
  const [viewNonceId, setViewNonceId] = useState<number | null>(null);

  const handleViewPosition = () => {
    const cId = parseInt(classIdInput);
    const nId = parseInt(nonceIdInput);
    if (!isNaN(cId) && !isNaN(nId) && cId >= 0 && nId >= 0) {
      setViewClassId(cId);
      setViewNonceId(nId);
    }
  };

  const handleClear = () => {
    setViewClassId(null);
    setViewNonceId(null);
    setClassIdInput("");
    setNonceIdInput("");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-xl font-bold tracking-tight">Auto-Compound Vault</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Automatically reinvest dividend earnings
        </p>
      </div>

      {/* Description */}
      <div className="card-glass rounded p-6">
        <h2 className="text-base font-semibold">How it works</h2>
        <p className="mt-2 text-sm leading-relaxed text-[rgb(var(--muted-foreground))]">
          The Auto-Compound Vault accepts your ERC-3475 bond deposits and automatically
          reinvests accrued dividend payments back into the same bond class. This
          compounding effect maximizes your yield without requiring manual claims or
          re-purchases. Deposited bonds remain fully yours -- you can withdraw at any
          time.
        </p>
      </div>

      {/* Stats placeholder */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card-glass rounded p-4">
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Total Value Locked</p>
          <p className="stat-value font-mono text-2xl text-gold">--</p>
          <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
            Calculated per bond class
          </p>
        </div>
        <div className="card-glass rounded p-4">
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Auto-Compound Events</p>
          <p className="stat-value font-mono text-2xl">--</p>
          <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
            Pending on-chain indexing
          </p>
        </div>
      </div>

      {/* Manual Lookup Form */}
      <div className="card-glass rounded p-6">
        <h2 className="text-base font-semibold">View Vault Position</h2>
        <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
          Enter a bond class ID and nonce ID to view your vault position and
          auto-compound status.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-[rgb(var(--muted-foreground))]">
              Class ID
            </label>
            <input
              type="number"
              min="0"
              value={classIdInput}
              onChange={(e) => setClassIdInput(e.target.value)}
              placeholder="0"
              className="w-full rounded border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-3 py-2 font-mono text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))]/50 focus:border-[#D4A853] focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-[rgb(var(--muted-foreground))]">
              Nonce ID
            </label>
            <input
              type="number"
              min="0"
              value={nonceIdInput}
              onChange={(e) => setNonceIdInput(e.target.value)}
              placeholder="0"
              className="w-full rounded border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-3 py-2 font-mono text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))]/50 focus:border-[#D4A853] focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleViewPosition}
              className="cursor-pointer rounded bg-[#D4A853]/15 px-6 py-2 text-sm font-semibold text-gold transition-colors hover:bg-[#D4A853]/25"
            >
              View Position
            </button>
            {viewClassId !== null && (
              <button
                onClick={handleClear}
                className="cursor-pointer rounded bg-[rgb(var(--secondary))] px-4 py-2 text-sm font-medium text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--border))]"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Vault Dashboard */}
      {viewClassId !== null && viewNonceId !== null ? (
        <AutoCompoundDashboard classId={viewClassId} nonceId={viewNonceId} />
      ) : (
        <div className="py-8 text-center text-sm text-[rgb(var(--muted-foreground))]">
          Connect wallet and deposit bonds to see your vault positions
        </div>
      )}
    </div>
  );
}
