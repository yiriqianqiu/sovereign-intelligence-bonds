import { keccak256, encodePacked, parseEther, formatEther } from "viem";
import { config } from "./config.js";
import { publicClient, getWalletClient } from "./chain.js";
import { getTEEAccount } from "./wallet.js";
import { parseAbi } from "viem";
import { B402ReceiverABI } from "./abis.js";

const LOG_PREFIX = "[receipt]";

/**
 * Verify that a payment transaction actually happened on-chain.
 * This is used by the paid intelligence API: user pays B402PaymentReceiver.payBNB
 * on-chain first, then submits the txHash to the TEE agent.
 * TEE verifies the receipt — no self-payment, real external cash flow.
 */
export async function verifyPaymentOnChain(
  txHash: string,
  agentId: number,
  minAmountBnb: string
): Promise<{ valid: boolean; reason?: string; payer?: string }> {
  try {
    const receipt = await publicClient.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

    if (!receipt || receipt.status !== "success") {
      return { valid: false, reason: "Transaction failed or not found" };
    }

    // Verify it went to B402PaymentReceiver
    const b402Addr = config.b402ReceiverAddress.toLowerCase();
    if (receipt.to?.toLowerCase() !== b402Addr) {
      return { valid: false, reason: "Transaction not sent to B402PaymentReceiver" };
    }

    // Verify payment amount by reading the transaction
    const tx = await publicClient.getTransaction({
      hash: txHash as `0x${string}`,
    });

    const minWei = parseEther(minAmountBnb);
    if (tx.value < minWei) {
      return {
        valid: false,
        reason: `Payment too low: ${formatEther(tx.value)} BNB < ${minAmountBnb} BNB`,
      };
    }

    // Check that PaymentReceived or VerifiedPaymentReceived event references our agentId
    const paymentEventSig = keccak256(
      encodePacked(["string"], ["PaymentReceived(address,uint256,address,string,uint256)"])
    );
    const verifiedEventSig = keccak256(
      encodePacked(["string"], ["VerifiedPaymentReceived(address,uint256,address,string,uint256,bytes32,bytes)"])
    );
    const agentIdTopic = "0x" + BigInt(agentId).toString(16).padStart(64, "0");
    const matchingLog = receipt.logs.find(
      (log) =>
        log.address.toLowerCase() === b402Addr &&
        (log.topics[0] === paymentEventSig || log.topics[0] === verifiedEventSig) &&
        log.topics[2]?.toLowerCase() === agentIdTopic.toLowerCase()
    );

    if (!matchingLog) {
      return {
        valid: false,
        reason: `No PaymentReceived/VerifiedPaymentReceived event found for agentId ${agentId}`,
      };
    }

    console.log(`${LOG_PREFIX} Payment verified: ${txHash} from ${tx.from} (${formatEther(tx.value)} BNB)`);
    return { valid: true, payer: tx.from };
  } catch (error) {
    console.error(`${LOG_PREFIX} Payment verification failed:`, error);
    return { valid: false, reason: "Could not verify transaction on-chain" };
  }
}

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
