"""Kernel-check the shipped Proof Lab references and replay one real certificate."""
from copy import deepcopy
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "formal-verifier" / "src"))
from quickmaths_formal.protocol import handle_message
from quickmaths_formal.verifier import replay_certificate


def main():
    pack = json.loads((ROOT / "examples/formal-proof-lab.lesson-set.json").read_text(encoding="utf-8"))
    first = None
    for skill in pack["skills"]:
        for problem in skill["problems"]:
            spec = problem["proof_spec"]
            result = handle_message({
                "op": "check_reference_text", "request_id": problem["template_id"],
                **spec["statement"], "allowed_rules": spec["allowed_rules"],
                "reference_steps": spec["reference_proof"]["steps"], "max_seconds": 60,
            }, project_dir=ROOT / "formal-verifier")
            assert result["ok"], result
            checked = result["result"]
            verification = checked["verification"]
            assert verification["status"] == "verified", verification
            assert verification["certificate"]["proof_mode"] == "reference"
            print(f"PASS reference {problem['template_id']}", flush=True)
            first = first or checked
    replay = replay_certificate(first["request"], first["verification"]["certificate"], project_dir=ROOT / "formal-verifier")
    assert replay.status == "verified" and replay.proof_mode == "reference", replay
    tampered = deepcopy(first["verification"]["certificate"])
    tampered["proof_mode"] = "submitted"
    rejected = replay_certificate(first["request"], tampered, project_dir=ROOT / "formal-verifier")
    assert rejected.status != "verified" and rejected.certificate is None
    print("PASS real replay; tampered reference-to-submission promotion rejected", flush=True)


if __name__ == "__main__":
    main()
