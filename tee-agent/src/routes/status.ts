import { Router, Request, Response } from "express";
import { parseAbi } from "viem";
import { publicClient } from "../chain.js";
import { config } from "../config.js";
import { TEERegistryABI, SIBControllerV2ABI } from "../abis.js";
import { getComputeStatus } from "../computeManager.js";

const router = Router();

router.get("/status/:agentId", async (req: Request, res: Response) => {
  try {
    const agentId = BigInt(req.params.agentId);

    // Get TEE status from registry
    const teeStatus = await publicClient.readContract({
      address: config.teeRegistryAddress,
      abi: parseAbi(TEERegistryABI),
      functionName: "getTEEStatus",
      args: [agentId],
    }) as [string, string, bigint, boolean];

    // Get bond classes count
    const bondClasses = await publicClient.readContract({
      address: config.sibControllerAddress,
      abi: parseAbi(SIBControllerV2ABI),
      functionName: "getAgentBondClasses",
      args: [agentId],
    }) as bigint[];

    // Get compute status
    const compute = await getComputeStatus(Number(agentId));

    res.json({
      agentId: req.params.agentId,
      tee: {
        address: teeStatus[0],
        lastAttestation: teeStatus[1],
        lastAttestationTime: Number(teeStatus[2]),
        isActive: teeStatus[3],
      },
      bondClassesCount: bondClasses.length,
      bondClasses: bondClasses.map((c) => c.toString()),
      compute,
      lifecycle: "Register -> IPO -> Compute -> Earn -> Dividends",
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
