import { parseAbi, parseEther, formatEther, zeroAddress } from "viem";
import { config } from "./config.js";
import { publicClient, getWalletClient } from "./chain.js";
import { SIBControllerV2ABI } from "./abis.js";

const LOG_PREFIX = "[dividend]";

const ZERO_ADDRESS = zeroAddress as `0x${string}`;

export async function checkAndDistributeDividends(): Promise<void> {
  try {
    const agentId = BigInt(config.agentId);
    const threshold = parseEther(config.dividendThresholdBnb.toString());

    // Read revenue pool balance for native BNB (address(0))
    const poolBalance = await publicClient.readContract({
      address: config.sibControllerAddress,
      abi: parseAbi(SIBControllerV2ABI),
      functionName: "revenuePool",
      args: [agentId, ZERO_ADDRESS],
    }) as bigint;

    console.log(`${LOG_PREFIX} Revenue pool for agent ${config.agentId}: ${formatEther(poolBalance)} BNB`);

    if (poolBalance < threshold) {
      console.log(`${LOG_PREFIX} Below threshold (${config.dividendThresholdBnb} BNB), skipping distribution`);
      return;
    }

    // Get agent bond classes
    const bondClasses = await publicClient.readContract({
      address: config.sibControllerAddress,
      abi: parseAbi(SIBControllerV2ABI),
      functionName: "getAgentBondClasses",
      args: [agentId],
    }) as bigint[];

    if (bondClasses.length === 0) {
      console.log(`${LOG_PREFIX} No bond classes found for agent ${config.agentId}`);
      return;
    }

    console.log(`${LOG_PREFIX} Found ${bondClasses.length} bond classes, distributing dividends...`);

    const walletClient = await getWalletClient();

    for (const classId of bondClasses) {
      try {
        // Get active nonce for this class
        const nonce = await publicClient.readContract({
          address: config.sibControllerAddress,
          abi: parseAbi(SIBControllerV2ABI),
          functionName: "activeNonce",
          args: [agentId, classId],
        }) as bigint;

        const txHash = await walletClient.writeContract({
          address: config.sibControllerAddress,
          abi: parseAbi(SIBControllerV2ABI),
          functionName: "distributeDividends",
          args: [agentId, classId, nonce],
        });

        console.log(`${LOG_PREFIX} Dividend distribution tx for class ${classId}, nonce ${nonce}: ${txHash}`);
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(`${LOG_PREFIX} Dividend distribution confirmed for class ${classId}`);
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to distribute for class ${classId}:`, error);
      }
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Dividend check failed:`, error);
  }
}

let dividendTimer: ReturnType<typeof setInterval> | null = null;

export function startDividendScheduler() {
  console.log(`${LOG_PREFIX} Starting dividend scheduler (interval: ${config.dividendCheckInterval}ms)`);

  // First check after a short delay
  setTimeout(() => checkAndDistributeDividends(), 15000);

  dividendTimer = setInterval(() => {
    checkAndDistributeDividends();
  }, config.dividendCheckInterval);
}

export function stopDividendScheduler() {
  if (dividendTimer) {
    clearInterval(dividendTimer);
    dividendTimer = null;
    console.log(`${LOG_PREFIX} Dividend scheduler stopped`);
  }
}
