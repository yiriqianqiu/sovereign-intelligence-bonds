"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { parseAbi, parseEther, formatEther } from "viem";
import { ADDRESSES } from "@/lib/contract-addresses";
import { NFARegistryABI, SIBControllerV2ABI } from "@/lib/contracts";
import { creditRatingLabel } from "@/hooks/useAgentRevenue";

interface ProofResult {
  sharpeRatio: number;
  proofHash: string;
  verified: boolean;
  circuitSize: number;
  provingTime: string;
}

interface ProofState {
  proofId: string | null;
  status: "idle" | "pending" | "generating" | "complete" | "failed";
  progress: number;
  message: string;
  result: ProofResult | null;
}

interface AgentOption {
  id: number;
  name: string;
  creditRating: number;
}

export default function ZkProofPage() {
  const { isConnected } = useAccount();
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [returnsInput, setReturnsInput] = useState("");
  const [proof, setProof] = useState<ProofState>({
    proofId: null,
    status: "idle",
    progress: 0,
    message: "",
    result: null,
  });
  const eventSourceRef = useRef<(() => void) | null>(null);

  // Read total agent count from chain
  const { data: totalSupply } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: parseAbi(NFARegistryABI),
    functionName: "totalSupply",
  });

  // Load agent list from chain
  useEffect(() => {
    if (totalSupply === undefined) return;
    const count = Number(totalSupply);
    if (count === 0) {
      setAgentsLoading(false);
      return;
    }

    const loadAgents = async () => {
      const { publicClient } = await import("@/lib/chain-reader");
      const agents: AgentOption[] = [];
      const abi = parseAbi(NFARegistryABI);

      for (let i = 0; i < count; i++) {
        try {
          const agentId = await publicClient.readContract({
            address: ADDRESSES.NFARegistry as `0x${string}`,
            abi,
            functionName: "tokenByIndex",
            args: [BigInt(i)],
          });
          const [metadata, rating] = await Promise.all([
            publicClient.readContract({
              address: ADDRESSES.NFARegistry as `0x${string}`,
              abi,
              functionName: "getAgentMetadata",
              args: [agentId as bigint],
            }),
            publicClient.readContract({
              address: ADDRESSES.NFARegistry as `0x${string}`,
              abi,
              functionName: "creditRatings",
              args: [agentId as bigint],
            }),
          ]);
          const md = metadata as { name: string };
          agents.push({
            id: Number(agentId),
            name: md.name,
            creditRating: Number(rating),
          });
        } catch {
          // skip agents that fail to load
        }
      }
      setAgentOptions(agents);
      setAgentsLoading(false);
    };

    loadAgents();
  }, [totalSupply]);

  // Read current credit rating for selected agent
  const { data: currentRating, refetch: refetchRating } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: parseAbi(NFARegistryABI),
    functionName: "creditRatings",
    args: selectedAgent !== null ? [BigInt(selectedAgent)] : undefined,
    query: { enabled: selectedAgent !== null },
  });

  // Read current revenue profile for selected agent
  const { data: revenueProfile, refetch: refetchRevenue } = useReadContract({
    address: ADDRESSES.NFARegistry as `0x${string}`,
    abi: parseAbi(NFARegistryABI),
    functionName: "getRevenueProfile",
    args: selectedAgent !== null ? [BigInt(selectedAgent)] : undefined,
    query: { enabled: selectedAgent !== null },
  });

  // Write: submit Sharpe proof on-chain
  const {
    writeContract,
    data: txHash,
    isPending: isWritePending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  // Wait for tx confirmation
  const {
    isLoading: isTxConfirming,
    isSuccess: isTxSuccess,
    error: txError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Refetch credit rating after successful tx
  useEffect(() => {
    if (isTxSuccess) {
      refetchRating();
      refetchRevenue();
    }
  }, [isTxSuccess, refetchRating, refetchRevenue]);

  const cleanupSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current();
      eventSourceRef.current = null;
    }
  }, []);

  const connectSSE = useCallback(
    (proofId: string) => {
      cleanupSSE();
      const abortController = new AbortController();

      const run = async () => {
        try {
          const response = await fetch(`/api/sse?proofId=${proofId}`, {
            signal: abortController.signal,
          });
          if (!response.body) return;

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  setProof((prev) => ({
                    ...prev,
                    status: data.status,
                    progress: data.progress ?? prev.progress,
                    message: data.message ?? prev.message,
                    result: data.result ?? prev.result,
                  }));
                } catch {
                  // skip malformed events
                }
              }
            }
          }
        } catch (err) {
          if ((err as Error).name !== "AbortError") {
            setProof((prev) => ({
              ...prev,
              status: "failed",
              message: "Connection lost",
            }));
          }
        }
      };

      run();
      eventSourceRef.current = () => abortController.abort();
    },
    [cleanupSSE]
  );

  useEffect(() => {
    return () => cleanupSSE();
  }, [cleanupSSE]);

  const parseReturns = (input: string): number[] | null => {
    const parts = input
      .split(/[,\s\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const nums = parts.map(Number);
    if (nums.some(isNaN)) return null;
    return nums;
  };

  const handleGenerateProof = async () => {
    const returns = parseReturns(returnsInput);
    if (!returns || returns.length === 0) return;
    if (selectedAgent === null) return;

    resetWrite();
    setProof({
      proofId: null,
      status: "pending",
      progress: 0,
      message: "Submitting proof request...",
      result: null,
    });

    try {
      const res = await fetch("/api/prove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: String(selectedAgent), returns }),
      });
      const data = await res.json();

      if (!res.ok) {
        setProof((prev) => ({
          ...prev,
          status: "failed",
          message: data.error || "Request failed",
        }));
        return;
      }

      setProof((prev) => ({
        ...prev,
        proofId: data.proofId,
        status: "pending",
        message: "Proof queued, connecting to status stream...",
      }));

      connectSSE(data.proofId);
    } catch {
      setProof((prev) => ({
        ...prev,
        status: "failed",
        message: "Network error",
      }));
    }
  };

  const handleSubmitOnChain = () => {
    if (selectedAgent === null || !proof.result) return;

    // For demo: dummy proof bytes (64 bytes of zeros) and Sharpe ratio as instance
    const dummyProof = ("0x" + "00".repeat(64)) as `0x${string}`;
    const sharpeWei = parseEther(proof.result.sharpeRatio.toString());

    writeContract({
      address: ADDRESSES.SIBControllerV2 as `0x${string}`,
      abi: parseAbi(SIBControllerV2ABI),
      functionName: "submitSharpeProof",
      args: [BigInt(selectedAgent), dummyProof, [sharpeWei]],
    });
  };

  const parsedReturns = parseReturns(returnsInput);
  const returnsValid = parsedReturns !== null && parsedReturns.length > 0;
  const canGenerate =
    selectedAgent !== null &&
    returnsValid &&
    proof.status !== "pending" &&
    proof.status !== "generating";

  const statusColor =
    proof.status === "complete"
      ? "text-sage"
      : proof.status === "failed"
      ? "text-crimson"
      : proof.status === "generating"
      ? "text-gold"
      : "text-muted-foreground";

  const currentSharpe =
    revenueProfile
      ? formatEther((revenueProfile as { sharpeRatio: bigint }).sharpeRatio)
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">zkML Proof Panel</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate verifiable Sharpe ratio proofs using EZKL and submit them on-chain.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input Section */}
        <div className="card-glass rounded-lg p-6 space-y-5">
          <h2 className="text-lg font-semibold">Proof Input</h2>

          {/* Agent Select */}
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Select Agent
            </label>
            <select
              value={selectedAgent ?? ""}
              onChange={(e) =>
                setSelectedAgent(e.target.value ? Number(e.target.value) : null)
              }
              disabled={agentsLoading}
              className="w-full cursor-pointer rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-gold"
            >
              <option value="">
                {agentsLoading
                  ? "Loading agents from chain..."
                  : agentOptions.length === 0
                  ? "No agents registered"
                  : "-- Select an agent --"}
              </option>
              {agentOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  #{a.id} {a.name} ({creditRatingLabel(a.creditRating)})
                </option>
              ))}
            </select>
          </div>

          {/* Current On-Chain Stats */}
          {selectedAgent !== null && currentRating !== undefined && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-secondary/50 px-3 py-2">
                <p className="text-xs text-muted-foreground">Current Rating</p>
                <p className="font-mono text-sm text-gold">
                  {creditRatingLabel(Number(currentRating))}
                </p>
              </div>
              <div className="rounded-lg bg-secondary/50 px-3 py-2">
                <p className="text-xs text-muted-foreground">On-Chain Sharpe</p>
                <p className="font-mono text-sm text-foreground">
                  {currentSharpe ? Number(currentSharpe).toFixed(4) : "0.0000"}
                </p>
              </div>
            </div>
          )}

          {/* Returns Input */}
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Daily Returns (comma-separated)
            </label>
            <textarea
              value={returnsInput}
              onChange={(e) => setReturnsInput(e.target.value)}
              rows={5}
              placeholder="0.02, -0.01, 0.03, 0.015, -0.005, 0.01, 0.025, -0.008, 0.02, 0.012, 0.018, -0.003, 0.007, 0.022, -0.01, 0.015, 0.009, -0.002, 0.03, 0.011, -0.006, 0.02, 0.014, 0.008, -0.004, 0.019, 0.013, -0.007, 0.025, 0.016"
              className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 font-mono text-sm text-foreground outline-none transition-colors focus:border-gold resize-none"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {parsedReturns
                ? `${parsedReturns.length} values parsed`
                : returnsInput.trim()
                ? "Invalid input -- use comma-separated numbers"
                : "Enter at least 1 daily return value"}
            </p>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerateProof}
            disabled={!canGenerate}
            className="w-full cursor-pointer rounded-lg px-4 py-2 font-medium transition-colors duration-200 bg-gold text-background hover:bg-gold/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {proof.status === "pending" || proof.status === "generating"
              ? "Generating..."
              : "Generate Proof"}
          </button>
        </div>

        {/* Status & Result Section */}
        <div className="space-y-6">
          {/* Status */}
          <div className="card-glass rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold">Proof Status</h2>

            {proof.status === "idle" ? (
              <p className="text-sm text-muted-foreground">
                No proof in progress. Configure inputs and click Generate Proof.
              </p>
            ) : (
              <>
                {/* Progress Bar */}
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className={statusColor}>
                      {proof.status.charAt(0).toUpperCase() +
                        proof.status.slice(1)}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {proof.progress}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-gold transition-all duration-500"
                      style={{ width: `${proof.progress}%` }}
                    />
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">{proof.message}</p>

                {proof.proofId && (
                  <p className="text-xs text-muted-foreground">
                    Proof ID:{" "}
                    <span className="font-mono text-foreground">
                      {proof.proofId}
                    </span>
                  </p>
                )}
              </>
            )}
          </div>

          {/* Result */}
          {proof.result && (
            <div className="card-glass glow-gold rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold">Proof Result</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Sharpe Ratio
                  </p>
                  <p className="mt-1 stat-value font-mono text-2xl text-gold">
                    {proof.result.sharpeRatio.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Verification
                  </p>
                  <p
                    className={`mt-1 stat-value font-mono text-2xl ${
                      proof.result.verified ? "text-sage" : "text-crimson"
                    }`}
                  >
                    {proof.result.verified ? "Verified" : "Failed"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Circuit Size
                  </p>
                  <p className="mt-1 stat-value font-mono text-lg text-foreground">
                    {proof.result.circuitSize.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Proving Time
                  </p>
                  <p className="mt-1 stat-value font-mono text-lg text-foreground">
                    {proof.result.provingTime}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Proof Hash
                </p>
                <p className="break-all rounded bg-secondary px-3 py-2 font-mono text-xs text-foreground">
                  {proof.result.proofHash}
                </p>
              </div>

              {/* Submit On-Chain Button */}
              {isConnected ? (
                <div className="space-y-2">
                  <button
                    onClick={handleSubmitOnChain}
                    disabled={isWritePending || isTxConfirming}
                    className="w-full cursor-pointer rounded-lg px-4 py-2 font-medium transition-colors duration-200 bg-gold text-background hover:bg-gold/90 disabled:opacity-50"
                  >
                    {isWritePending
                      ? "Confirm in Wallet..."
                      : isTxConfirming
                      ? "Confirming Transaction..."
                      : isTxSuccess
                      ? "Submitted Successfully"
                      : "Submit On-Chain"}
                  </button>

                  {/* Tx Status */}
                  {txHash && (
                    <p className="text-xs text-muted-foreground">
                      Tx:{" "}
                      <a
                        href={`https://testnet.bscscan.com/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-gold hover:underline"
                      >
                        {txHash.slice(0, 10)}...{txHash.slice(-8)}
                      </a>
                    </p>
                  )}

                  {isTxSuccess && (
                    <p className="text-sm text-sage">
                      Sharpe proof submitted on-chain. Credit rating updated to{" "}
                      <span className="font-mono font-semibold">
                        {currentRating !== undefined
                          ? creditRatingLabel(Number(currentRating))
                          : "..."}
                      </span>
                    </p>
                  )}

                  {(writeError || txError) && (
                    <p className="text-sm text-crimson">
                      {(writeError || txError)?.message?.slice(0, 120) ||
                        "Transaction failed"}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Connect your wallet to submit proofs on-chain.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
