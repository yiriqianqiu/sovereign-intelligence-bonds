export const dynamic = "force-dynamic";

const PROVER_URL = process.env.PROVER_SERVICE_URL || "http://localhost:8000";

export async function POST(request: Request) {
  const body = await request.json();
  const { agentId, returns } = body;

  if (!agentId || !Array.isArray(returns) || returns.length === 0) {
    return Response.json(
      { error: "agentId and a non-empty returns array are required" },
      { status: 400 }
    );
  }

  if (returns.some((r: unknown) => typeof r !== "number" || isNaN(r as number))) {
    return Response.json(
      { error: "All returns must be valid numbers" },
      { status: 400 }
    );
  }

  try {
    const resp = await fetch(`${PROVER_URL}/prove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: agentId, returns }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return Response.json(
        { error: `Prover service error: ${err}` },
        { status: resp.status }
      );
    }

    const data = await resp.json();

    return Response.json({
      proofId: data.job_id,
      agentId: data.agent_id,
      status: data.status,
      message:
        data.message +
        ". Connect to /api/sse?proofId=" +
        data.job_id +
        " for status updates.",
    });
  } catch {
    // Prover service unavailable -- fallback to client-side ID
    const proofId = `proof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return Response.json({
      proofId,
      agentId,
      returnsCount: returns.length,
      status: "pending",
      message:
        "Prover service unavailable, using fallback. Connect to /api/sse?proofId=" +
        proofId +
        " for status updates.",
      fallback: true,
    });
  }
}
