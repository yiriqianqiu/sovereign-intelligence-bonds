import { createPublicClient, createWalletClient, http, type WalletClient, type Transport, type Chain, type Account } from "viem";
import { bscTestnet } from "viem/chains";
import { config } from "./config.js";
import { getTEEAccount } from "./wallet.js";

export const publicClient = createPublicClient({
  chain: bscTestnet,
  transport: http(config.bscRpcUrl),
});

let _walletClient: WalletClient<Transport, Chain, Account> | null = null;

export async function getWalletClient(): Promise<WalletClient<Transport, Chain, Account>> {
  if (_walletClient) return _walletClient;

  const account = await getTEEAccount();
  _walletClient = createWalletClient({
    account,
    chain: bscTestnet,
    transport: http(config.bscRpcUrl),
  });

  return _walletClient;
}
