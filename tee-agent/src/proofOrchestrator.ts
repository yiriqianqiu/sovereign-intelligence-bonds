import axios from "axios";
import { parseAbi } from "viem";
import { config } from "./config.js";
import { publicClient, getWalletClient } from "./chain.js";
import { SIBControllerV2ABI } from "./abis.js";

const LOG_PREFIX = "[proof]";

interface ProveResponse {
  job_id: string;
  status: string;
}

interface ProofResult {
  proof_hex: string;
  instances: string[];
  sharpe_ratio: number;
  verified: boolean;
  mode: string;
}

interface JobStatusResponse {
  status: "pending" | "processing" | "completed" | "failed";
  result?: ProofResult;
  message?: string;
}

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120; // 10 minutes max

export async function requestProof(agentId: number): Promise<string | null> {
  try {
    console.log(`${LOG_PREFIX} Requesting Sharpe proof for agent ${agentId}`);

    // Step 1: Submit proof request to prover-service
    // Generate synthetic daily returns for Sharpe ratio proof
    // In production, these would come from actual on-chain revenue data
    const dailyReturns = Array.from({ length: 30 }, (_, i) =>
      0.001 + Math.sin(i * 0.5) * 0.0005 + Math.random() * 0.0002
    );

    const proveRes = await axios.post<ProveResponse>(
      `${config.proverServiceUrl}/prove`,
      { agent_id: String(agentId), returns: dailyReturns }
    );

    const jobId = proveRes.data.job_id;
    console.log(`${LOG_PREFIX} Proof job submitted: ${jobId}`);

    // Step 2: Poll until complete
    let attempts = 0;
    while (attempts < MAX_POLL_ATTEMPTS) {
      await sleep(POLL_INTERVAL_MS);
      attempts++;

      const statusRes = await axios.get<JobStatusResponse>(
        `${config.proverServiceUrl}/prove/${jobId}`
      );

      const { status, result, message } = statusRes.data;

      if (status === "completed" && result?.proof_hex && result?.instances) {
        const { proof_hex, instances } = result;
        console.log(`${LOG_PREFIX} Proof ready (${instances.length} instances, mode=${result.mode})`);

        // Step 3: Parse instances — already big-endian 0x-prefixed uint256 hex from worker
        const parsedInstances = instances.map((inst: string) => {
          const cleaned = inst.startsWith("0x") ? inst : `0x${inst}`;
          return BigInt(cleaned);
        });

        // Step 4: Submit proof on-chain
        const proofBytes = proof_hex.startsWith("0x") ? proof_hex as `0x${string}` : `0x${proof_hex}` as `0x${string}`;

        const walletClient = await getWalletClient();
        const txHash = await walletClient.writeContract({
          address: config.sibControllerAddress,
          abi: parseAbi(SIBControllerV2ABI),
          functionName: "submitSharpeProof",
          args: [BigInt(agentId), proofBytes, parsedInstances],
        });

        console.log(`${LOG_PREFIX} Proof submitted on-chain, tx: ${txHash}`);
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(`${LOG_PREFIX} Proof confirmed on-chain`);

        return txHash;
      }

      if (status === "failed") {
        console.error(`${LOG_PREFIX} Proof generation failed: ${message}`);
        return null;
      }

      console.log(`${LOG_PREFIX} Polling job ${jobId}: ${status} (attempt ${attempts}/${MAX_POLL_ATTEMPTS})`);
    }

    console.error(`${LOG_PREFIX} Proof generation timed out after ${MAX_POLL_ATTEMPTS} attempts`);
    return null;
  } catch (error) {
    console.error(`${LOG_PREFIX} Proof orchestration failed:`, error);
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
