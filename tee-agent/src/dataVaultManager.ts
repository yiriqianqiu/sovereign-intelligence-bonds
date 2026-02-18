import { parseAbi } from "viem";
import { config } from "./config.js";
import { publicClient, getWalletClient } from "./chain.js";
import { GreenfieldDataVaultABI } from "./abis.js";

const LOG_PREFIX = "[data-vault]";

export async function registerDataAsset(
  agentId: number,
  objectId: string,
  contentHash: `0x${string}`,
  size: bigint
): Promise<string> {
  console.log(`${LOG_PREFIX} Registering data asset: ${objectId} for agent ${agentId}`);

  const walletClient = await getWalletClient();
  const txHash = await walletClient.writeContract({
    address: config.greenfieldVaultAddress,
    abi: parseAbi(GreenfieldDataVaultABI),
    functionName: "registerDataAsset",
    args: [BigInt(agentId), objectId, contentHash, size],
  });

  console.log(`${LOG_PREFIX} Register asset tx: ${txHash}`);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`${LOG_PREFIX} Asset registered on-chain`);

  return txHash;
}

export async function verifyDataAsset(
  agentId: number,
  objectId: string
): Promise<string> {
  console.log(`${LOG_PREFIX} Verifying data asset: ${objectId} for agent ${agentId}`);

  const walletClient = await getWalletClient();
  const txHash = await walletClient.writeContract({
    address: config.greenfieldVaultAddress,
    abi: parseAbi(GreenfieldDataVaultABI),
    functionName: "verifyAsset",
    args: [BigInt(agentId), objectId],
  });

  console.log(`${LOG_PREFIX} Verify asset tx: ${txHash}`);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`${LOG_PREFIX} Asset verified on-chain`);

  return txHash;
}

export async function getAgentAssets(agentId: number): Promise<string[]> {
  try {
    const assets = await publicClient.readContract({
      address: config.greenfieldVaultAddress,
      abi: parseAbi(GreenfieldDataVaultABI),
      functionName: "getAgentAssets",
      args: [BigInt(agentId)],
    }) as string[];

    return assets;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to get agent assets:`, error);
    return [];
  }
}
