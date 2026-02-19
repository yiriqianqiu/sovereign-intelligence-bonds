import { parseAbi, keccak256, toHex } from "viem";
import { TappdClient } from "@phala/dstack-sdk";
import { config } from "./config.js";
import { publicClient, getWalletClient } from "./chain.js";
import { getTEEAccount } from "./wallet.js";
import { NFARegistryABI, TEERegistryABI } from "./abis.js";

const LOG_PREFIX = "[self-register]";

/**
 * Phase 1: Seed Period -- Hardware-anchored autonomous identity
 *
 * 1. TEE self-generates wallet (already done in wallet.ts)
 * 2. TEE registers NFA identity on-chain (BAP-578)
 * 3. Agent owner authorizes TEE wallet in TEERegistry
 * 4. TEE pushes Remote Attestation to prove hardware integrity
 */

export async function selfRegisterAgent(): Promise<number | null> {
  try {
    const account = await getTEEAccount();
    console.log(`${LOG_PREFIX} TEE wallet: ${account.address}`);

    // Check if agent already exists
    if (config.agentId > 0) {
      try {
        const owner = await publicClient.readContract({
          address: config.nfaRegistryAddress,
          abi: parseAbi(NFARegistryABI),
          functionName: "getAgentOwner",
          args: [BigInt(config.agentId)],
        });
        if (owner) {
          console.log(`${LOG_PREFIX} Agent #${config.agentId} already registered, owner: ${owner}`);
          return config.agentId;
        }
      } catch {
        // Agent doesn't exist, proceed with registration
      }
    }

    // Generate TDX attestation for identity proof
    console.log(`${LOG_PREFIX} Generating TDX attestation for identity registration...`);
    const client = new TappdClient(config.dstackSimulatorEndpoint);
    const quote = await client.tdxQuote("sib-agent-identity");
    const attestationHash = keccak256(quote.quote as `0x${string}`);

    // Register NFA on-chain
    console.log(`${LOG_PREFIX} Registering NFA identity on BSC...`);
    const walletClient = await getWalletClient();

    const txHash = await walletClient.writeContract({
      address: config.nfaRegistryAddress,
      abi: parseAbi(NFARegistryABI),
      functionName: "registerAgent",
      args: [
        config.agentName,
        config.agentDescription,
        config.agentModelHash,
        config.agentEndpoint,
      ],
    });

    console.log(`${LOG_PREFIX} Registration tx: ${txHash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`${LOG_PREFIX} NFA identity registered on-chain`);

    // Parse AgentRegistered event to get agentId
    // Event signature: AgentRegistered(uint256 indexed agentId, address indexed owner, string name)
    const agentRegisteredTopic = keccak256(toHex("AgentRegistered(uint256,address,string)"));
    const regLog = receipt.logs.find(
      (log) => log.topics[0] === agentRegisteredTopic
    );

    let agentId = config.agentId;
    if (regLog && regLog.topics[1]) {
      agentId = Number(BigInt(regLog.topics[1]));
      console.log(`${LOG_PREFIX} Assigned Agent ID: ${agentId}`);
    }

    // Activate agent
    console.log(`${LOG_PREFIX} Activating agent...`);
    const activateTx = await walletClient.writeContract({
      address: config.nfaRegistryAddress,
      abi: parseAbi(NFARegistryABI),
      functionName: "updateState",
      args: [BigInt(agentId), 1], // 1 = Active
    });
    await publicClient.waitForTransactionReceipt({ hash: activateTx });
    console.log(`${LOG_PREFIX} Agent #${agentId} activated`);

    // Authorize TEE wallet in TEERegistry (agent owner = TEE wallet at this point)
    console.log(`${LOG_PREFIX} Authorizing TEE wallet in TEERegistry...`);
    const authTx = await walletClient.writeContract({
      address: config.teeRegistryAddress,
      abi: parseAbi(TEERegistryABI),
      functionName: "authorizeTEEAgent",
      args: [BigInt(agentId), account.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: authTx });
    console.log(`${LOG_PREFIX} TEE wallet authorized for agent #${agentId}`);

    // Push initial attestation
    console.log(`${LOG_PREFIX} Pushing initial TDX attestation...`);
    const attestTx = await walletClient.writeContract({
      address: config.teeRegistryAddress,
      abi: parseAbi(TEERegistryABI),
      functionName: "pushTEEAttestation",
      args: [BigInt(agentId), attestationHash],
    });
    await publicClient.waitForTransactionReceipt({ hash: attestTx });
    console.log(`${LOG_PREFIX} TDX attestation pushed to chain`);

    console.log(`${LOG_PREFIX} === Phase 1 Complete: Agent #${agentId} born in TEE ===`);
    return agentId;
  } catch (error) {
    console.error(`${LOG_PREFIX} Self-registration failed:`, error);
    return null;
  }
}
