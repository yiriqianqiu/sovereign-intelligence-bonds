import { Router, Request, Response } from "express";
import { formatEther } from "viem";
import { getTEEAccount } from "../wallet.js";
import { publicClient } from "../chain.js";
import { config } from "../config.js";

const router = Router();
const startTime = Date.now();

router.get("/health", async (_req: Request, res: Response) => {
  try {
    const account = await getTEEAccount();
    const balance = await publicClient.getBalance({ address: account.address });

    res.json({
      status: "ok",
      agentId: config.agentId,
      teeAddress: account.address,
      balanceBnb: formatEther(balance),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      chainId: config.chainId,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
