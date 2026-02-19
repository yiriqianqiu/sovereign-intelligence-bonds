import { Router, Request, Response } from "express";
import { generatePreviewReport, generateFullReport } from "../intelligenceService.js";
import { verifyPaymentOnChain } from "../receiptSigner.js";

const router = Router();

const MIN_PAYMENT_BNB = "0.001";

// Free preview - basic intelligence (limited data)
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

// Paid full report - requires on-chain payment proof
// User must first pay via B402PaymentReceiver.payBNB on-chain,
// then submit the txHash here. TEE verifies the receipt before serving.
router.post("/api/intelligence/:agentId", async (req: Request, res: Response) => {
  try {
    const agentId = parseInt(req.params.agentId, 10);
    if (isNaN(agentId) || agentId < 0) {
      res.status(400).json({ error: "Invalid agentId" });
      return;
    }

    const { txHash } = req.body as { txHash?: string };
    if (!txHash) {
      res.status(402).json({
        error: "Payment required",
        minimumBnb: MIN_PAYMENT_BNB,
        message: `Pay via B402PaymentReceiver.payBNB first, then submit txHash`,
        paymentInstructions: {
          contract: "B402PaymentReceiver",
          method: "payBNB(uint256 agentId, string endpoint)",
          minimumBnb: MIN_PAYMENT_BNB,
          then: "POST /api/intelligence/:agentId with { txHash }",
        },
      });
      return;
    }

    // Verify payment on-chain: check tx receipt confirms real payment to B402
    const verified = await verifyPaymentOnChain(txHash, agentId, MIN_PAYMENT_BNB);
    if (!verified.valid) {
      res.status(402).json({
        error: "Payment verification failed",
        detail: verified.reason,
      });
      return;
    }

    console.log("[intelligence] Payment verified on-chain:", txHash);

    // Generate full report after verified payment
    const report = await generateFullReport(agentId);

    res.json({
      paymentTxHash: txHash,
      teeVerified: true,
      payerAddress: verified.payer,
      report,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
