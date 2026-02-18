import { TappdClient } from "@phala/dstack-sdk";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256 } from "viem";
import { config } from "./config.js";

let _account: ReturnType<typeof privateKeyToAccount> | null = null;

export async function getTEEAccount() {
  if (_account) return _account;

  const client = new TappdClient(config.dstackSimulatorEndpoint);
  const derivation = await client.deriveKey("/sib-tee-agent", "sib-bond-manager-v1");

  // Hash the derived key to get a proper 32-byte private key
  const privateKey = keccak256(derivation.asUint8Array(32));
  _account = privateKeyToAccount(privateKey);

  console.log(`[wallet] TEE wallet address: ${_account.address}`);
  return _account;
}
