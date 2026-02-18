import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { getTEEAccount } from "./wallet.js";
import { startAttestationScheduler, stopAttestationScheduler } from "./attestation.js";
import { startDividendScheduler, stopDividendScheduler } from "./dividendScheduler.js";

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

async function main() {
  console.log("=== SIB TEE Agent ===");
  console.log(`Agent ID: ${config.agentId}`);
  console.log(`Chain ID: ${config.chainId}`);
  console.log(`RPC: ${config.bscRpcUrl}`);

  // Initialize TEE wallet
  const account = await getTEEAccount();
  console.log(`TEE Wallet: ${account.address}`);

  // Start background schedulers
  startAttestationScheduler();
  startDividendScheduler();

  // Start HTTP server
  app.listen(config.port, () => {
    console.log(`TEE Agent listening on port ${config.port}`);
    console.log(`Health: http://localhost:${config.port}/health`);
    console.log(`Status: http://localhost:${config.port}/status/${config.agentId}`);
    console.log(`Attestation: http://localhost:${config.port}/attestation`);
    console.log(`Intelligence: http://localhost:${config.port}/api/intelligence/${config.agentId}`);
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
