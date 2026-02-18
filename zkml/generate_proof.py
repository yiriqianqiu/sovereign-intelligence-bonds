"""
SIB zkML: EZKL proof generation pipeline.

Standard 8-step EZKL workflow:
  1. gen-settings     -- Generate circuit settings from ONNX
  2. calibrate-settings -- Calibrate quantization parameters
  3. compile-circuit  -- Compile ONNX to circuit
  4. get-srs          -- Download structured reference string
  5. setup            -- Generate proving/verification keys
  6. gen-witness      -- Generate witness from input data
  7. prove            -- Generate ZK proof
  8. verify           -- Verify proof locally

Outputs:
  - settings.json, circuit.ezkl, pk.key, vk.key
  - witness.json, proof.json
  - SharpeVerifier.sol (Solidity verifier contract)

Usage:
  python generate_proof.py                  # Full pipeline (setup + prove + verify)
  python generate_proof.py --verify-only    # Quick verify existing proof
  python generate_proof.py --prove-only     # Skip setup, just prove + verify
"""

import argparse
import asyncio
import inspect
import json
import os
import sys

try:
    import ezkl
except ImportError:
    print("EZKL not installed. Install with: pip install ezkl")
    print("Skipping proof generation. Use prover-service for Docker-based proving.")
    sys.exit(0)

import numpy as np


async def maybe_await(result):
    """Handle ezkl functions that may return either a value or a coroutine."""
    if inspect.isawaitable(result):
        return await result
    return result


def get_paths(base: str) -> dict:
    """Get all file paths relative to base directory."""
    return {
        "model": os.path.join(base, "sharpe_model.onnx"),
        "input": os.path.join(base, "input.json"),
        "norm_params": os.path.join(base, "norm_params.json"),
        "settings": os.path.join(base, "settings.json"),
        "calibration": os.path.join(base, "calibration.json"),
        "circuit": os.path.join(base, "circuit.ezkl"),
        "srs": os.path.join(base, "kzg.srs"),
        "pk": os.path.join(base, "pk.key"),
        "vk": os.path.join(base, "vk.key"),
        "witness": os.path.join(base, "witness.json"),
        "proof": os.path.join(base, "proof.json"),
        "verifier_dir": os.path.join(base, "..", "contracts", "contracts", "verifier"),
        "verifier_sol": os.path.join(base, "..", "contracts", "contracts", "verifier", "SharpeVerifier.sol"),
        "verifier_abi": os.path.join(base, "..", "contracts", "contracts", "verifier", "SharpeVerifier.abi"),
    }


async def run_setup(paths: dict) -> None:
    """Steps 1-5: Generate settings, calibrate, compile, get SRS, setup keys."""
    if not os.path.exists(paths["model"]):
        print("ERROR: sharpe_model.onnx not found. Run train_sharpe_model.py first.")
        sys.exit(1)

    # Step 1: Generate settings
    print("[1/8] Generating circuit settings...")
    py_run_args = ezkl.PyRunArgs()
    py_run_args.input_visibility = "public"
    py_run_args.output_visibility = "public"
    py_run_args.param_visibility = "fixed"
    await maybe_await(ezkl.gen_settings(paths["model"], paths["settings"], py_run_args=py_run_args))
    print("  -> settings.json generated")

    # Step 2: Calibrate settings
    print("[2/8] Calibrating settings...")
    cal_data = {"input_data": []}
    for _ in range(20):
        sample = np.random.normal(0.0, 1.0, 30).tolist()
        cal_data["input_data"].append(sample)
    with open(paths["calibration"], "w") as f:
        json.dump(cal_data, f)
    await maybe_await(ezkl.calibrate_settings(paths["calibration"], paths["model"], paths["settings"], "resources"))
    print("  -> settings calibrated")

    # Step 3: Compile circuit
    print("[3/8] Compiling circuit...")
    await maybe_await(ezkl.compile_circuit(paths["model"], paths["circuit"], paths["settings"]))
    print("  -> circuit.ezkl compiled")

    # Step 4: Get SRS
    print("[4/8] Getting SRS...")
    if os.path.exists(paths["srs"]):
        print("  -> kzg.srs already exists, skipping download")
    else:
        await maybe_await(ezkl.get_srs(settings_path=paths["settings"], srs_path=paths["srs"]))
        print("  -> kzg.srs downloaded")

    # Step 5: Setup keys
    print("[5/8] Running setup...")
    await maybe_await(ezkl.setup(
        model=paths["circuit"],
        vk_path=paths["vk"],
        pk_path=paths["pk"],
        srs_path=paths["srs"],
    ))
    print("  -> pk.key and vk.key generated")


async def run_prove(paths: dict) -> None:
    """Steps 6-7: Generate witness and proof."""
    if not os.path.exists(paths["input"]):
        print("ERROR: input.json not found. Run train_sharpe_model.py first.")
        sys.exit(1)

    for name in ["circuit", "pk", "srs"]:
        if not os.path.exists(paths[name]):
            print(f"ERROR: {os.path.basename(paths[name])} not found. Run full setup first.")
            sys.exit(1)

    # Step 6: Generate witness
    print("[6/8] Generating witness...")
    await maybe_await(ezkl.gen_witness(
        data=paths["input"],
        model=paths["circuit"],
        output=paths["witness"],
    ))
    print("  -> witness.json generated")

    # Step 7: Prove
    print("[7/8] Generating proof...")
    await maybe_await(ezkl.prove(
        witness=paths["witness"],
        model=paths["circuit"],
        pk_path=paths["pk"],
        proof_path=paths["proof"],
        srs_path=paths["srs"],
    ))
    print("  -> proof.json generated")


async def run_verify(paths: dict) -> bool:
    """Step 8: Verify proof."""
    for name in ["proof", "settings", "vk", "srs"]:
        if not os.path.exists(paths[name]):
            print(f"ERROR: {os.path.basename(paths[name])} not found.")
            sys.exit(1)

    print("[8/8] Verifying proof...")
    result = await maybe_await(ezkl.verify(
        proof_path=paths["proof"],
        settings_path=paths["settings"],
        vk_path=paths["vk"],
        srs_path=paths["srs"],
    ))
    if result:
        print("  -> Proof VERIFIED successfully")
    else:
        print("  -> Proof verification FAILED")
    return result


async def generate_verifier(paths: dict) -> None:
    """Generate Solidity verifier contract."""
    print("\n[Bonus] Generating Solidity verifier...")
    os.makedirs(paths["verifier_dir"], exist_ok=True)
    await maybe_await(ezkl.create_evm_verifier(
        vk_path=paths["vk"],
        settings_path=paths["settings"],
        sol_code_path=paths["verifier_sol"],
        abi_path=paths["verifier_abi"],
        srs_path=paths["srs"],
    ))
    print(f"  -> {paths['verifier_sol']}")


def print_proof_info(paths: dict) -> None:
    """Print proof file info and instances."""
    if not os.path.exists(paths["proof"]):
        return
    with open(paths["proof"], "r") as f:
        proof_data = json.load(f)
    print(f"\nProof file: {paths['proof']}")
    if "instances" in proof_data:
        print("Instances (public inputs/outputs):")
        for i, inst in enumerate(proof_data["instances"]):
            preview = f"{inst[:3]}..." if len(inst) > 3 else str(inst)
            print(f"  [{i}]: {preview}")


async def async_main():
    parser = argparse.ArgumentParser(description="SIB zkML EZKL Proof Pipeline")
    parser.add_argument("--verify-only", action="store_true", help="Only verify existing proof")
    parser.add_argument("--prove-only", action="store_true", help="Skip setup, only prove and verify")
    parser.add_argument("--no-verifier", action="store_true", help="Skip Solidity verifier generation")
    args = parser.parse_args()

    base = os.path.dirname(os.path.abspath(__file__))
    paths = get_paths(base)

    if args.verify_only:
        ok = await run_verify(paths)
        print_proof_info(paths)
        sys.exit(0 if ok else 1)

    if not args.prove_only:
        await run_setup(paths)

    await run_prove(paths)
    ok = await run_verify(paths)

    if not ok:
        sys.exit(1)

    if not args.no_verifier:
        await generate_verifier(paths)

    print_proof_info(paths)
    print("\nDone! Full EZKL pipeline completed.")
    print("Next: Deploy SharpeVerifier.sol and call submitSharpeProof() with proof data.")


def main():
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
