import { Router, Request, Response } from "express";
import { generatePreviewReport, generateFullReport } from "../intelligenceService.js";
import { submitVerifiedRevenue } from "../receiptSigner.js";

const router = Router();

const MIN_PAYMENT_BNB = "0.001";

// Free preview - basic intelligence
router.get("/api/intelligence/:agentId", async (req: Request, res: Response) => {
  try {
    const agentId = parseInt(req.params.agentId, 10);
    if (isNaN(agentId) || agentId < 0) {
      res.status(400).json({ error: "Invalid agentId" });
      return;
    }

    const preview = await generatePreviewReport(agentId);
    res.json(preview);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Paid full report - requires BNB payment
router.post("/api/intelligence/:agentId", async (req: Request, res: Response) => {
  try {
    const agentId = parseInt(req.params.agentId, 10);
    if (isNaN(agentId) || agentId < 0) {
      res.status(400).json({ error: "Invalid agentId" });
      return;
    }

    const { amountBnb } = req.body as { amountBnb?: string };
    if (!amountBnb || parseFloat(amountBnb) < parseFloat(MIN_PAYMENT_BNB)) {
      res.status(402).json({
        error: "Payment required",
        minimumBnb: MIN_PAYMENT_BNB,
        message: `Full intelligence report requires a minimum payment of ${MIN_PAYMENT_BNB} BNB`,
        paymentInstructions: {
          method: "POST",
          body: { amountBnb: MIN_PAYMENT_BNB },
        },
      });
      return;
    }

    // Process payment via TEE-verified b402 (payBNBVerified)
    // TEE signs a receipt proving this revenue is from real API execution
    let txHash: string;
    try {
      const result = await submitVerifiedRevenue(agentId, amountBnb, "/api/intelligence");
      if (!result) {
        throw new Error("TEE receipt generation failed");
      }
      txHash = result.txHash;
      console.log("[intelligence] TEE-verified payment confirmed:", txHash);
    } catch (paymentError) {
      console.error("[intelligence] Payment failed:", paymentError);
      res.status(402).json({
        error: "Payment failed",
        minimumBnb: MIN_PAYMENT_BNB,
        details: paymentError instanceof Error ? paymentError.message : "Unknown payment error",
      });
      return;
    }

    // Generate full report after successful verified payment
    const report = await generateFullReport(agentId);

    res.json({
      paymentTxHash: txHash,
      teeVerified: true,
      report,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
