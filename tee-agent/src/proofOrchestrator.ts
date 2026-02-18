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

interface JobStatusResponse {
  status: "pending" | "running" | "completed" | "failed";
  proof_hex?: string;
  instances?: string[];
  error?: string;
}

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120; // 10 minutes max

export async function requestProof(agentId: number): Promise<string | null> {
  try {
    console.log(`${LOG_PREFIX} Requesting Sharpe proof for agent ${agentId}`);

    // Step 1: Submit proof request to prover-service
    const proveRes = await axios.post<ProveResponse>(
      `${config.proverServiceUrl}/prove`,
      { agent_id: agentId }
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

      const { status, proof_hex, instances, error } = statusRes.data;

      if (status === "completed" && proof_hex && instances) {
        console.log(`${LOG_PREFIX} Proof ready (${instances.length} instances)`);

        // Step 3: Parse instances (handle 0x prefix for BigInt)
        const parsedInstances = instances.map((inst) => {
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
        console.error(`${LOG_PREFIX} Proof generation failed: ${error}`);
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
