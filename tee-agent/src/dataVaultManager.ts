import { parseAbi } from "viem";
import { config } from "./config.js";
import { publicClient, getWalletClient } from "./chain.js";
import { GreenfieldDataVaultABI } from "./abis.js";

const LOG_PREFIX = "[data-vault]";

export async function registerDataAsset(
  agentId: number,
  bucketName: string,
  objectName: string,
  contentHash: `0x${string}`,
  dataType: number,
  size: bigint
): Promise<string> {
  console.log(`${LOG_PREFIX} Registering data asset: ${bucketName}/${objectName} for agent ${agentId}`);

  const walletClient = await getWalletClient();
  const txHash = await walletClient.writeContract({
    address: config.greenfieldVaultAddress,
    abi: parseAbi(GreenfieldDataVaultABI),
    functionName: "registerDataAsset",
    args: [BigInt(agentId), bucketName, objectName, contentHash, dataType, size],
  });

  console.log(`${LOG_PREFIX} Register asset tx: ${txHash}`);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`${LOG_PREFIX} Asset registered on-chain`);

  return txHash;
}

export async function verifyDataAsset(
  assetId: number
): Promise<string> {
  console.log(`${LOG_PREFIX} Verifying data asset #${assetId}`);

  const walletClient = await getWalletClient();
  const txHash = await walletClient.writeContract({
    address: config.greenfieldVaultAddress,
    abi: parseAbi(GreenfieldDataVaultABI),
    functionName: "verifyAsset",
    args: [BigInt(assetId)],
  });

  console.log(`${LOG_PREFIX} Verify asset tx: ${txHash}`);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`${LOG_PREFIX} Asset verified on-chain`);

  return txHash;
}

export async function getAgentAssets(agentId: number): Promise<bigint[]> {
  try {
    const assets = await publicClient.readContract({
      address: config.greenfieldVaultAddress,
      abi: parseAbi(GreenfieldDataVaultABI),
      functionName: "getAgentAssets",
      args: [BigInt(agentId)],
    }) as bigint[];

    return assets;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to get agent assets:`, error);
    return [];
  }
}
