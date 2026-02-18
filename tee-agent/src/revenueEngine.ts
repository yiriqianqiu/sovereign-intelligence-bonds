import { parseAbi, parseEther } from "viem";
import { config } from "./config.js";
import { publicClient, getWalletClient } from "./chain.js";
import { X402ReceiverABI } from "./abis.js";

const LOG_PREFIX = "[revenue]";

export interface PayBNBRequest {
  agentId: number;
  amountBnb: string; // e.g. "0.01"
  endpoint: string;  // the service endpoint being paid for
}

export interface PayERC20Request {
  agentId: number;
  token: `0x${string}`;
  amount: string; // raw amount in wei
  endpoint: string;
}

export async function forwardBNBPayment(req: PayBNBRequest): Promise<string> {
  console.log(`${LOG_PREFIX} Forwarding ${req.amountBnb} BNB for agent ${req.agentId}, endpoint: ${req.endpoint}`);

  const walletClient = await getWalletClient();
  const txHash = await walletClient.writeContract({
    address: config.x402ReceiverAddress,
    abi: parseAbi(X402ReceiverABI),
    functionName: "payBNB",
    args: [BigInt(req.agentId), req.endpoint],
    value: parseEther(req.amountBnb),
  });

  console.log(`${LOG_PREFIX} BNB payment tx: ${txHash}`);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`${LOG_PREFIX} BNB payment confirmed`);

  return txHash;
}

export async function forwardERC20Payment(req: PayERC20Request): Promise<string> {
  console.log(`${LOG_PREFIX} Forwarding ERC20 payment for agent ${req.agentId}, token: ${req.token}, amount: ${req.amount}`);

  const walletClient = await getWalletClient();
  const txHash = await walletClient.writeContract({
    address: config.x402ReceiverAddress,
    abi: parseAbi(X402ReceiverABI),
    functionName: "payERC20",
    args: [BigInt(req.agentId), req.token, BigInt(req.amount), req.endpoint],
  });

  console.log(`${LOG_PREFIX} ERC20 payment tx: ${txHash}`);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`${LOG_PREFIX} ERC20 payment confirmed`);

  return txHash;
}
