import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  walletConnectWallet,
  trustWallet,
  binanceWallet,
  injectedWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { bscTestnet } from "wagmi/chains";

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || "sib-demo-project-id";

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [
        metaMaskWallet,
        binanceWallet,
        trustWallet,
      ],
    },
    {
      groupName: "More",
      wallets: [
        walletConnectWallet,
        injectedWallet,
      ],
    },
  ],
  {
    appName: "Sovereign Intelligence Bonds",
    projectId,
  }
);

export const config = createConfig({
  connectors,
  chains: [bscTestnet],
  transports: {
    [bscTestnet.id]: http(),
  },
  ssr: true,
});
