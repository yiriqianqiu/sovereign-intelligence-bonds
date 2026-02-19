import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { getTEEAccount } from "./wallet.js";
import { selfRegisterAgent } from "./selfRegister.js";
import { initiateIPO } from "./ipoManager.js";
import { requestProof } from "./proofOrchestrator.js";
import { startAttestationScheduler, stopAttestationScheduler } from "./attestation.js";
import { startDividendScheduler, stopDividendScheduler } from "./dividendScheduler.js";
import { deployCapitalToCompute } from "./computeManager.js";
import { registerDataAsset } from "./dataVaultManager.js";
import { forwardBNBPayment } from "./revenueEngine.js";

// Routes
import healthRouter from "./routes/health.js";
import statusRouter from "./routes/status.js";
import attestationRouter from "./routes/attestation.js";
import intelligenceRouter from "./routes/intelligence.js";

const app = express();
app.use(cors());
app.use(express.json());

// Register routes
app.use(healthRouter);
app.use(statusRouter);
app.use(attestationRouter);
app.use(intelligenceRouter);

/**
 * SIB TEE Agent -- Autonomous 4-Phase Lifecycle
 *
 * Human: deploys code to TEE (one-time)
 * TEE: does everything else
 * Blockchain: settles everything transparently
 *
 * Phase 1 (Seed):      TEE self-generates key -> registers NFA identity -> pushes attestation
 * Phase 2 (Fundraise): Submits zkML Sharpe proof -> self-issues ERC-3475 bond IPO
 * Phase 3 (Operate):   Serves API (credit reports) -> earns TEE-signed revenue -> on-chain
 * Phase 4 (Return):    Auto-distributes dividends to bondholders -> credit upgrade -> flywheel
 */
async function main() {
  console.log("=============================================");
  console.log("  SIB TEE Agent -- Autonomous Lifecycle");
  console.log("  Human = Capital | TEE = Honest | Chain = Fair");
  console.log("=============================================\n");

  // === Phase 0: TEE Key Generation ===
  const account = await getTEEAccount();
  console.log(`[phase-0] TEE wallet derived: ${account.address}`);
  console.log(`[phase-0] Key NEVER leaves hardware enclave\n`);

  // === Phase 1: Seed Period -- Self-Registration ===
  console.log("--- Phase 1: Seed Period ---");
  let agentId = config.agentId;

  if (agentId === 0) {
    console.log("[phase-1] No agent ID configured, self-registering...");
    const registeredId = await selfRegisterAgent();
    if (registeredId === null) {
      console.error("[phase-1] FATAL: Self-registration failed. Check BNB balance for gas.");
      process.exit(1);
    }
    agentId = registeredId;
    config.agentId = agentId; // Propagate to schedulers (attestation, dividends)
    console.log(`[phase-1] Agent #${agentId} born in TEE\n`);
  } else {
    console.log(`[phase-1] Agent #${agentId} already registered, skipping\n`);
  }

  // Register agent model data on Greenfield Data Vault
  try {
    const { keccak256, toHex } = await import("viem");
    const contentHash = keccak256(toHex(config.agentModelHash));
    await registerDataAsset(
      agentId,
      "sib-agent-models",
      `${config.agentName}-model`,
      contentHash,
      0, // dataType: 0 = model
      1024n,
    );
    console.log(`[phase-1] Model data registered on Greenfield Data Vault\n`);
  } catch {
    console.log(`[phase-1] Greenfield data vault registration skipped (not available)\n`);
  }

  // Start attestation scheduler (continuous, every 12h)
  startAttestationScheduler();

  // === Phase 2: Fundraise Period -- zkML Proof + IPO ===
  console.log("--- Phase 2: Fundraise Period ---");

  // Submit Sharpe proof (if prover service is available)
  try {
    console.log("[phase-2] Requesting zkML Sharpe ratio proof...");
    const proofTx = await requestProof(agentId);
    if (proofTx) {
      console.log(`[phase-2] Sharpe proof submitted: ${proofTx}`);
    } else {
      console.log("[phase-2] Sharpe proof skipped (prover service not available)");
    }
  } catch {
    console.log("[phase-2] Sharpe proof skipped (prover service not available)");
  }

  // Self-issue IPO
  const ipoTx = await initiateIPO(agentId, {
    couponRateBps: config.ipoCouponBps,
    maturityDays: config.ipoMaturityDays,
    pricePerBondBnb: config.ipoPriceBnb,
    maxSupply: config.ipoMaxSupply,
  });

  if (ipoTx) {
    console.log(`[phase-2] IPO launched for agent #${agentId}\n`);
  } else {
    console.log(`[phase-2] IPO already exists or failed, continuing\n`);
  }

  // === Phase 2.5: Deploy Capital into Compute ===
  console.log("--- Phase 2.5: Deploy Capital into Compute ---");
  console.log("[phase-2.5] IPO raised capital. Deploying into DePIN GPU compute...");

  const computeTx = await deployCapitalToCompute(agentId);
  if (computeTx) {
    console.log(`[phase-2.5] Compute acquired for agent #${agentId}: ${computeTx}\n`);
  } else {
    console.log(`[phase-2.5] Compute rental skipped or already active\n`);
  }

  // === Phase 3: Operate Period -- API Service + TEE-Signed Revenue ===
  console.log("--- Phase 3: Operate Period ---");
  console.log("[phase-3] HTTP API server starting...");
  console.log("[phase-3] All revenue will be TEE-signed (payBNBVerified)");
  console.log("[phase-3] Developer CANNOT forge revenue -- key in hardware\n");

  // Revenue forwarding endpoint -- allows programmatic b402 payments
  app.post("/api/revenue/forward", async (req, res) => {
    try {
      const { amountBnb, endpoint } = req.body as { amountBnb?: string; endpoint?: string };
      if (!amountBnb || !endpoint) {
        res.status(400).json({ error: "Missing amountBnb or endpoint" });
        return;
      }
      const txHash = await forwardBNBPayment({
        agentId,
        amountBnb,
        endpoint,
      });
      res.json({ txHash, agentId, amountBnb, endpoint });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // === Phase 4: Return Period -- Auto Dividends ===
  console.log("--- Phase 4: Return Period ---");
  console.log("[phase-4] Dividend scheduler starting...");
  startDividendScheduler();
  console.log("[phase-4] Revenue -> DividendVault -> bondholders (automatic)\n");

  // Start HTTP server (Phase 3: service endpoint)
  app.listen(config.port, () => {
    console.log("=============================================");
    console.log("  TEE Agent ONLINE -- All Phases Active");
    console.log("=============================================");
    console.log(`  Agent ID:      #${agentId}`);
    console.log(`  TEE Wallet:    ${account.address}`);
    console.log(`  API Server:    http://localhost:${config.port}`);
    console.log(`  Health:        http://localhost:${config.port}/health`);
    console.log(`  Intelligence:  http://localhost:${config.port}/api/intelligence/${agentId}`);
    console.log(`  Attestation:   http://localhost:${config.port}/attestation`);
    console.log("=============================================\n");
    console.log("Lifecycle: Register -> IPO -> Buy Compute -> Earn -> Prove -> Dividends -> Repeat");
    console.log("Waiting for API requests (revenue)...\n");
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log("\nShutting down TEE Agent...");
    stopAttestationScheduler();
    stopDividendScheduler();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
