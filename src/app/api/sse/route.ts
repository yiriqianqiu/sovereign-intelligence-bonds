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
              status: data.status,
              message: data.message,
              progress: data.progress,
              ...(data.result
                ? {
                    result: {
                      sharpeRatio: data.result.sharpe_ratio,
                      proofHex: data.result.proof_hex,
                      instances: data.result.instances,
                      verified: data.result.verified,
                      provingTime: `${data.result.proving_time}s`,
                      mode: data.result.mode,
                    },
                  }
                : {}),
            });

            if (data.status === "completed" || data.status === "failed") {
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
          status: "processing",
          message: "Running zkML circuit compilation...",
          progress: 25,
        });

        await new Promise((r) => setTimeout(r, 2000));

        send({
          proofId,
          status: "processing",
          message: "Computing witness from daily returns...",
          progress: 50,
        });

        await new Promise((r) => setTimeout(r, 2000));

        send({
          proofId,
          status: "processing",
          message: "Generating KZG proof...",
          progress: 75,
        });

        await new Promise((r) => setTimeout(r, 1500));

        const mockSharpe = (1.5 + Math.random() * 1.5).toFixed(2);
        const mockProofHex =
          "0x" +
          Array.from({ length: 64 }, () =>
            Math.floor(Math.random() * 16).toString(16)
          ).join("");

        send({
          proofId,
          status: "completed",
          message: "Proof generation complete",
          progress: 100,
          result: {
            sharpeRatio: parseFloat(mockSharpe),
            proofHex: mockProofHex,
            instances: [],
            verified: true,
            provingTime: "7.2s",
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
