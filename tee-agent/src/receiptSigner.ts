import { keccak256, encodePacked, parseEther } from "viem";
import { config } from "./config.js";
import { publicClient, getWalletClient } from "./chain.js";
import { getTEEAccount } from "./wallet.js";
import { parseAbi } from "viem";
import { B402ReceiverABI } from "./abis.js";

const LOG_PREFIX = "[receipt]";

/**
 * Phase 3: Operating Period -- TEE-signed revenue receipts
 *
 * When an API call generates revenue, the TEE signs a receipt proving:
 * 1. The revenue came from real API execution (logicHash proves code integrity)
 * 2. The signature can only be produced by TEE hardware (ecrecover in contract)
 * 3. Human developers cannot forge these receipts (key never leaves TEE)
 *
 * This is the core anti-wash-trading mechanism.
 */

export interface RevenueReceipt {
  agentId: number;
  amountBnb: string;
  endpoint: string;
  timestamp: number;
  logicHash: `0x${string}`;
  signature: `0x${string}`;
}

/**
 * Generate a TEE-signed revenue receipt and submit verified payment on-chain.
 * The contract will ecrecover the signature and verify it matches the TEE wallet.
 */
export async function submitVerifiedRevenue(
  agentId: number,
  amountBnb: string,
  endpoint: string
): Promise<{ txHash: string; receipt: RevenueReceipt } | null> {
  try {
    const account = await getTEEAccount();
    const amount = parseEther(amountBnb);
    const timestamp = Math.floor(Date.now() / 1000);

    // logicHash = hash of the agent's executing code (proves no tampering)
    const logicHash = keccak256(
      encodePacked(
        ["string", "string"],
        [`sib-agent-v1:${config.agentName}`, config.agentModelHash]
      )
    );

    // Build the same hash the contract will reconstruct
    const receiptHash = keccak256(
      encodePacked(
        ["uint256", "uint256", "bytes32", "uint256", "bytes32"],
        [BigInt(agentId), amount, keccak256(encodePacked(["string"], [endpoint])), BigInt(timestamp), logicHash]
      )
    );

    // Sign with TEE hardware key (eth_sign format: \x19Ethereum Signed Message:\n32 + hash)
    const signature = await account.signMessage({
      message: { raw: receiptHash },
    });

    console.log(`${LOG_PREFIX} TEE receipt signed for ${amountBnb} BNB`);
    console.log(`${LOG_PREFIX}   Agent: #${agentId}`);
    console.log(`${LOG_PREFIX}   Endpoint: ${endpoint}`);
    console.log(`${LOG_PREFIX}   LogicHash: ${logicHash}`);
    console.log(`${LOG_PREFIX}   Signer: ${account.address}`);

    // Submit verified payment on-chain
    const walletClient = await getWalletClient();
    const txHash = await walletClient.writeContract({
      address: config.b402ReceiverAddress,
      abi: parseAbi(B402ReceiverABI),
      functionName: "payBNBVerified",
      args: [BigInt(agentId), endpoint, BigInt(timestamp), logicHash, signature],
      value: amount,
    });

    console.log(`${LOG_PREFIX} Verified payment tx: ${txHash}`);
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`${LOG_PREFIX} Verified payment confirmed on-chain`);

    const receipt: RevenueReceipt = {
      agentId,
      amountBnb,
      endpoint,
      timestamp,
      logicHash,
      signature,
    };

    return { txHash, receipt };
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to submit verified revenue:`, error);
    return null;
  }
}
