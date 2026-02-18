import { Router, Request, Response } from "express";
import { getCurrentQuote, getTEEStatus } from "../attestation.js";
import { config } from "../config.js";

const router = Router();

router.get("/attestation", async (_req: Request, res: Response) => {
  try {
    const [quote, teeStatus] = await Promise.all([
      getCurrentQuote(),
      getTEEStatus(),
    ]);

    const statusData = teeStatus
      ? {
          address: (teeStatus as any)[0],
          lastAttestation: (teeStatus as any)[1],
          lastAttestationTime: Number((teeStatus as any)[2]),
          isActive: (teeStatus as any)[3],
        }
      : null;

    res.json({
      agentId: config.agentId,
      currentQuote: quote ? `${quote.slice(0, 66)}...` : null,
      currentQuoteLength: quote ? quote.length : 0,
      onChainStatus: statusData,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
