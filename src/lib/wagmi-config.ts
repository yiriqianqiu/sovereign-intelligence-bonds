import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { bscTestnet } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "Sovereign Intelligence Bonds",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "sib-demo-project-id",
  chains: [bscTestnet],
  ssr: true,
});
