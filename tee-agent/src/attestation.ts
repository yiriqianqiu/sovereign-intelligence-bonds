import { TappdClient } from "@phala/dstack-sdk";
import { keccak256, parseAbi } from "viem";
import { config } from "./config.js";
import { publicClient, getWalletClient } from "./chain.js";
import { TEERegistryABI } from "./abis.js";

const LOG_PREFIX = "[attestation]";

export async function pushAttestation(): Promise<string | null> {
  try {
    console.log(`${LOG_PREFIX} Generating TDX quote...`);

    const client = new TappdClient(config.dstackSimulatorEndpoint);
    const quote = await client.tdxQuote("sib-attestation");
    const attestationHash = keccak256(quote.quote);

    console.log(`${LOG_PREFIX} Attestation hash: ${attestationHash}`);

    const walletClient = await getWalletClient();
    const txHash = await walletClient.writeContract({
      address: config.teeRegistryAddress,
      abi: parseAbi(TEERegistryABI),
      functionName: "pushTEEAttestation",
      args: [BigInt(config.agentId), attestationHash],
    });

    console.log(`${LOG_PREFIX} Attestation pushed, tx: ${txHash}`);

    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`${LOG_PREFIX} Attestation confirmed on-chain`);

    return txHash;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to push attestation:`, error);
    return null;
  }
}

export async function getTEEStatus() {
  try {
    const result = await publicClient.readContract({
      address: config.teeRegistryAddress,
      abi: parseAbi(TEERegistryABI),
      functionName: "getTEEStatus",
      args: [BigInt(config.agentId)],
    });
    return result;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to get TEE status:`, error);
    return null;
  }
}

export async function getCurrentQuote(): Promise<string | null> {
  try {
    const client = new TappdClient(config.dstackSimulatorEndpoint);
    const quote = await client.tdxQuote("sib-attestation");
    return quote.quote;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to get TDX quote:`, error);
    return null;
  }
}

let attestationTimer: ReturnType<typeof setInterval> | null = null;

export function startAttestationScheduler() {
  console.log(`${LOG_PREFIX} Starting attestation scheduler (interval: ${config.attestationInterval}ms)`);

  // Push initial attestation after a short delay
  setTimeout(() => pushAttestation(), 5000);

  attestationTimer = setInterval(() => {
    pushAttestation();
  }, config.attestationInterval);
}

export function stopAttestationScheduler() {
  if (attestationTimer) {
    clearInterval(attestationTimer);
    attestationTimer = null;
    console.log(`${LOG_PREFIX} Attestation scheduler stopped`);
  }
}
