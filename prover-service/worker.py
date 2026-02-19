"""
SIB Prover Worker: Celery task for async EZKL proof generation.

Supports two modes via EZKL_MODE env var:
  - "real"      : Full EZKL pipeline (requires ezkl + model artifacts)
  - "simulated" : Fast mock proof for development/demo (default)

Model artifacts are expected in MODEL_DIR (default: /app/model):
  - sharpe_model.onnx, settings.json, circuit.ezkl
  - pk.key, vk.key, kzg.srs
"""

import hashlib
import json
import logging
import math
import os
import tempfile
import time

import numpy as np
from celery import Celery

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

CELERY_BROKER = os.getenv("CELERY_BROKER", "redis://localhost:6379/0")
CELERY_BACKEND = os.getenv("CELERY_BACKEND", "redis://localhost:6379/1")
EZKL_MODE = os.getenv("EZKL_MODE", "simulated")
MODEL_DIR = os.getenv("MODEL_DIR", os.path.join(os.path.dirname(__file__), "..", "zkml"))

celery_app = Celery("sib-prover", broker=CELERY_BROKER, backend=CELERY_BACKEND)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    result_expires=3600,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
)

# Check EZKL availability
try:
    import ezkl

    EZKL_AVAILABLE = True
    logger.info("EZKL available (version: %s)", getattr(ezkl, "__version__", "unknown"))
except ImportError:
    EZKL_AVAILABLE = False
    logger.warning("EZKL not installed, using simulated mode regardless of EZKL_MODE setting")


def compute_sharpe(returns: list[float]) -> float:
    """Compute annualized Sharpe ratio from daily returns."""
    if len(returns) < 2:
        return 0.0
    arr = np.array(returns)
    mean_r = float(np.mean(arr))
    std_r = float(np.std(arr))
    if std_r < 1e-8:
        return 0.0
    return mean_r / std_r * math.sqrt(252)


def _run_real_ezkl(self, job_id: str, returns: list[float]) -> dict:
    """Run real EZKL proof generation pipeline."""
    import ezkl

    start_time = time.time()

    # Validate model artifacts exist
    model_path = os.path.join(MODEL_DIR, "sharpe_model.onnx")
    settings_path = os.path.join(MODEL_DIR, "settings.json")
    circuit_path = os.path.join(MODEL_DIR, "circuit.ezkl")
    pk_path = os.path.join(MODEL_DIR, "pk.key")
    vk_path = os.path.join(MODEL_DIR, "vk.key")
    srs_path = os.path.join(MODEL_DIR, "kzg.srs")

    required_files = {
        "model": model_path,
        "settings": settings_path,
        "circuit": circuit_path,
        "pk": pk_path,
        "vk": vk_path,
        "srs": srs_path,
    }
    missing = [name for name, path in required_files.items() if not os.path.exists(path)]
    if missing:
        raise FileNotFoundError(
            f"Missing EZKL artifacts: {', '.join(missing)}. "
            f"Run generate_proof.py first. MODEL_DIR={MODEL_DIR}"
        )

    # Normalize returns to model input format
    # Load normalization params if available
    norm_path = os.path.join(MODEL_DIR, "norm_params.json")
    if os.path.exists(norm_path):
        with open(norm_path, "r") as f:
            norm = json.load(f)
        x_mean = np.array(norm["x_mean"])
        x_std = np.array(norm["x_std"])
    else:
        x_mean = np.zeros(30)
        x_std = np.ones(30)

    # Pad or truncate returns to 30
    r = returns[:30] if len(returns) >= 30 else returns + [0.0] * (30 - len(returns))
    normalized = ((np.array(r, dtype=np.float32) - x_mean) / x_std).tolist()

    # Create temp directory for intermediate files
    with tempfile.TemporaryDirectory(prefix="sib_proof_") as tmpdir:
        input_path = os.path.join(tmpdir, "input.json")
        witness_path = os.path.join(tmpdir, "witness.json")
        proof_path = os.path.join(tmpdir, "proof.json")

        # Write input
        input_data = {"input_data": [normalized]}
        with open(input_path, "w") as f:
            json.dump(input_data, f)

        # Step 1: Generate witness
        self.update_state(
            state="PROCESSING",
            meta={"progress": 30, "message": "Generating witness from returns data..."},
        )
        logger.info("[%s] Generating witness...", job_id)
        ezkl.gen_witness(input_path, circuit_path, witness_path)

        # Step 2: Generate proof
        self.update_state(
            state="PROCESSING",
            meta={"progress": 60, "message": "Generating KZG proof..."},
        )
        logger.info("[%s] Generating proof...", job_id)
        ezkl.prove(witness_path, circuit_path, pk_path, proof_path, srs_path, "single")

        # Step 3: Verify proof
        self.update_state(
            state="PROCESSING",
            meta={"progress": 85, "message": "Verifying proof locally..."},
        )
        logger.info("[%s] Verifying proof...", job_id)
        verified = ezkl.verify(proof_path, settings_path, vk_path, srs_path)

        # Read proof data
        with open(proof_path, "r") as f:
            proof_data = json.load(f)

        # hex_proof is the 0x-prefixed hex string; "proof" is a byte array — use hex_proof
        proof_hex = proof_data.get("hex_proof", "")
        if not proof_hex:
            # Fallback: convert byte array to hex if hex_proof missing
            raw_bytes = proof_data.get("proof", [])
            if isinstance(raw_bytes, list):
                proof_hex = "0x" + bytes(raw_bytes).hex()
            else:
                proof_hex = str(raw_bytes)

        # Use pretty_public_inputs.inputs[0] for big-endian 0x-prefixed uint256 values
        # (raw instances[0] is little-endian, which would fail BN254 field check on-chain)
        ppi = proof_data.get("pretty_public_inputs", {})
        ppi_inputs = ppi.get("inputs", [[]])
        instances = ppi_inputs[0] if ppi_inputs else []

    proving_time = time.time() - start_time
    sharpe = compute_sharpe(returns)

    return {
        "sharpe_ratio": round(sharpe, 4),
        "proof_hex": proof_hex,
        "instances": instances,
        "verified": bool(verified),
        "proving_time": round(proving_time, 2),
        "mode": "real",
    }


def _run_simulated(self, job_id: str, returns: list[float]) -> dict:
    """Run simulated proof generation for development/demo."""
    start_time = time.time()

    # Step 1: Circuit compilation
    self.update_state(
        state="PROCESSING",
        meta={"progress": 25, "message": "Compiling zkML circuit..."},
    )
    time.sleep(1.0)

    # Step 2: Witness generation
    self.update_state(
        state="PROCESSING",
        meta={"progress": 50, "message": "Computing witness from daily returns..."},
    )
    time.sleep(0.8)

    # Step 3: Proof generation
    self.update_state(
        state="PROCESSING",
        meta={"progress": 75, "message": "Generating KZG proof..."},
    )
    time.sleep(0.8)

    # Step 4: Verification
    self.update_state(
        state="PROCESSING",
        meta={"progress": 90, "message": "Verifying proof locally..."},
    )
    time.sleep(0.4)

    sharpe = compute_sharpe(returns)
    proof_payload = json.dumps({"returns": returns[:10], "sharpe": sharpe, "ts": time.time()})
    # Generate simulated proof — long enough to look realistic (3072 bytes = 6144 hex chars)
    proof_seed = hashlib.sha256(proof_payload.encode()).digest()
    proof_hex = "0x" + (proof_seed * 96).hex()  # 32 * 96 = 3072 bytes

    # Generate 31 simulated instances (matching real EZKL: 30 inputs + 1 output)
    # Use BN254-valid field elements (< BN254_SCALAR_FIELD)
    BN254_FIELD = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001
    instances = []
    for i in range(31):
        h = hashlib.sha256(f"inst_{i}_{sharpe}_{time.time()}".encode()).digest()
        val = int.from_bytes(h, "big") % BN254_FIELD
        instances.append("0x" + val.to_bytes(32, "big").hex())

    proving_time = time.time() - start_time

    return {
        "sharpe_ratio": round(sharpe, 4),
        "proof_hex": proof_hex,
        "instances": instances,
        "verified": True,
        "proving_time": round(proving_time, 2),
        "mode": "simulated",
    }


@celery_app.task(bind=True, name="prove_task", max_retries=0, time_limit=300, soft_time_limit=270)
def prove_task(self, job_id: str, agent_id: str, returns: list[float]) -> dict:
    """
    Celery task for async proof generation.

    Dispatched by FastAPI POST /prove. Runs either real EZKL or simulated mode.
    Progress is reported via Celery custom states for SSE polling.
    """
    logger.info("[%s] Starting proof for agent %s (%d returns, mode=%s)",
                job_id, agent_id, len(returns), EZKL_MODE)

    self.update_state(
        state="PROCESSING",
        meta={"progress": 10, "message": "Initializing proof pipeline..."},
    )

    use_real = EZKL_MODE == "real" and EZKL_AVAILABLE

    try:
        if use_real:
            result = _run_real_ezkl(self, job_id, returns)
        else:
            result = _run_simulated(self, job_id, returns)
    except FileNotFoundError as e:
        logger.warning("[%s] Missing artifacts, falling back to simulated: %s", job_id, e)
        result = _run_simulated(self, job_id, returns)
        result["mode"] = "simulated (fallback)"
    except Exception as e:
        logger.error("[%s] Proof generation failed: %s", job_id, e, exc_info=True)
        raise

    result["job_id"] = job_id
    result["agent_id"] = agent_id

    logger.info("[%s] Proof complete: sharpe=%.4f verified=%s mode=%s time=%.2fs",
                job_id, result["sharpe_ratio"], result["verified"], result["mode"], result["proving_time"])

    return result
