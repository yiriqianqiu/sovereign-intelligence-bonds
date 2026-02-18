"""
SIB Prover Service: FastAPI async proof generation with Celery backend.

Endpoints:
  POST /prove        -- Submit proof request (dispatches to Celery worker)
  GET  /prove/{id}   -- Query proof job status
  GET  /health       -- Health check with EZKL availability
"""

import logging
import os
import time
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from worker import celery_app, prove_task

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="SIB Prover Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Check EZKL availability at startup
EZKL_MODE = os.getenv("EZKL_MODE", "simulated")

try:
    import ezkl

    EZKL_VERSION = getattr(ezkl, "__version__", "unknown")
    EZKL_AVAILABLE = True
except ImportError:
    EZKL_VERSION = None
    EZKL_AVAILABLE = False


class ProofRequest(BaseModel):
    agent_id: str = Field(..., min_length=1, max_length=200)
    returns: list[float] = Field(..., min_length=1, max_length=365)


@app.get("/health")
async def health():
    ezkl_mode = "real" if (EZKL_MODE == "real" and EZKL_AVAILABLE) else "simulated"
    return {
        "status": "healthy",
        "service": "sib-prover",
        "version": "2.0.0",
        "ezkl_available": EZKL_AVAILABLE,
        "ezkl_version": EZKL_VERSION,
        "ezkl_mode": ezkl_mode,
        "celery_broker": os.getenv("CELERY_BROKER", "redis://localhost:6379/0"),
    }


@app.post("/prove")
async def submit_proof(req: ProofRequest):
    job_id = str(uuid.uuid4())[:12]
    logger.info("Submitting proof job %s for agent %s (%d returns)", job_id, req.agent_id, len(req.returns))

    try:
        task = prove_task.apply_async(
            args=[job_id, req.agent_id, req.returns],
            task_id=job_id,
        )
    except Exception as e:
        logger.error("Failed to dispatch Celery task: %s", e)
        raise HTTPException(status_code=503, detail=f"Worker unavailable: {e}")

    return {
        "job_id": job_id,
        "agent_id": req.agent_id,
        "status": "pending",
        "message": "Proof job dispatched to worker",
    }


@app.get("/prove/{job_id}")
async def get_proof_status(job_id: str):
    result = celery_app.AsyncResult(job_id)

    if result.state == "PENDING":
        return {
            "job_id": job_id,
            "status": "pending",
            "progress": 0,
            "message": "Job queued, waiting for worker...",
        }
    elif result.state == "PROCESSING":
        meta = result.info or {}
        return {
            "job_id": job_id,
            "status": "processing",
            "progress": meta.get("progress", 0),
            "message": meta.get("message", "Processing..."),
        }
    elif result.state == "SUCCESS":
        data = result.result or {}
        return {
            "job_id": job_id,
            "status": "completed",
            "progress": 100,
            "message": "Proof generation complete",
            "result": data,
        }
    elif result.state == "FAILURE":
        return {
            "job_id": job_id,
            "status": "failed",
            "progress": 0,
            "message": str(result.info) if result.info else "Unknown error",
        }
    else:
        # Custom states from update_state
        meta = result.info or {}
        return {
            "job_id": job_id,
            "status": result.state.lower(),
            "progress": meta.get("progress", 0),
            "message": meta.get("message", ""),
        }
