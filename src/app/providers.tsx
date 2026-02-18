"use client";

import { Web3Provider } from "./web3-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return <Web3Provider>{children}</Web3Provider>;
}
