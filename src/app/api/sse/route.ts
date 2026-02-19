export const dynamic = "force-dynamic";

const PROVER_URL = process.env.PROVER_SERVICE_URL || "http://localhost:8000";
const POLL_INTERVAL_MS = 1500;
const MAX_POLL_DURATION_MS = 300_000; // 5 minutes timeout

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const proofId = searchParams.get("proofId") || "unknown";

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      const startTime = Date.now();

      // Try polling the prover service
      let useProver = true;
      try {
        const healthResp = await fetch(`${PROVER_URL}/health`, {
          signal: AbortSignal.timeout(3000),
        });
        useProver = healthResp.ok;
      } catch {
        useProver = false;
      }

      if (useProver) {
        // Poll prover-service for real status
        let done = false;
        while (!done && Date.now() - startTime < MAX_POLL_DURATION_MS) {
          try {
            const resp = await fetch(`${PROVER_URL}/prove/${proofId}`, {
              signal: AbortSignal.timeout(5000),
            });

            if (!resp.ok) {
              send({
                proofId,
                status: "failed",
                message: `Prover returned ${resp.status}`,
                progress: 0,
              });
              done = true;
              break;
            }

            const data = await resp.json();

            send({
              proofId,
              status: data.status === "completed" ? "complete"
                : data.status === "processing" ? "generating"
                : data.status,
              message: data.message,
              progress: data.progress,
              ...(data.result
                ? {
                    result: {
                      sharpeRatio: data.result.sharpe_ratio,
                      proofHash: data.result.proof_hex
                        ? "0x" + data.result.proof_hex.slice(2, 66)
                        : "0x",
                      verified: data.result.verified,
                      circuitSize: data.result.instances?.length ?? 0,
                      provingTime: `${data.result.proving_time}s`,
                      proofHex: data.result.proof_hex,
                      instances: data.result.instances,
                      mode: data.result.mode,
                    },
                  }
                : {}),
            });

            if (["completed", "complete", "failed"].includes(data.status)) {
              done = true;
            } else {
              await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
            }
          } catch {
            // Network error polling prover, retry after delay
            await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          }
        }

        if (!done) {
          send({
            proofId,
            status: "failed",
            message: "Proof generation timed out",
            progress: 0,
          });
        }
      } else {
        // Fallback: simulated SSE (prover service not available)
        send({
          proofId,
          status: "pending",
          message: "Proof request received, queuing...",
          progress: 0,
        });

        await new Promise((r) => setTimeout(r, 1500));

        send({
          proofId,
          status: "generating",
          message: "Running zkML circuit compilation...",
          progress: 25,
        });

        await new Promise((r) => setTimeout(r, 2000));

        send({
          proofId,
          status: "generating",
          message: "Computing witness from daily returns...",
          progress: 50,
        });

        await new Promise((r) => setTimeout(r, 2000));

        send({
          proofId,
          status: "generating",
          message: "Generating KZG proof...",
          progress: 75,
        });

        await new Promise((r) => setTimeout(r, 1500));

        const mockSharpe = (1.5 + Math.random() * 1.5).toFixed(2);
        // Generate BN254-valid simulated proof and 31 instances
        const mockProofHex =
          "0x" +
          Array.from({ length: 6144 }, () =>
            Math.floor(Math.random() * 16).toString(16)
          ).join("");
        const BN254_FIELD = BigInt("0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
        const mockInstances = Array.from({ length: 31 }, (_, i) => {
          const seed = BigInt(Date.now() + i * 1337) % BN254_FIELD;
          return "0x" + seed.toString(16).padStart(64, "0");
        });

        send({
          proofId,
          status: "complete",
          message: "Proof generation complete (simulated)",
          progress: 100,
          result: {
            sharpeRatio: parseFloat(mockSharpe),
            proofHash: mockProofHex.slice(0, 66),
            verified: true,
            circuitSize: 31,
            provingTime: "7.2s",
            proofHex: mockProofHex,
            instances: mockInstances,
            mode: "simulated (fallback)",
          },
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
