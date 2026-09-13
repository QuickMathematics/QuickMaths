"""Shipped lesson candidates exercise the real parser and rule obligations.

These are candidate-shape tests, not assertions of kernel-verified truth. The
pinned Lean run remains a separate acceptance requirement for publication.
"""
import json
from pathlib import Path

import pytest

from quickmaths_formal.interactive import append_text_step, new_text_request

PACK = json.loads((Path(__file__).resolve().parents[2] / "examples" / "formal-proof-lab.lesson-set.json").read_text())
PROBLEMS = [skill["problems"][0] for skill in PACK["skills"]]


@pytest.mark.parametrize("problem", PROBLEMS, ids=[problem["template_id"] for problem in PROBLEMS])
def test_demo_reference_is_an_explicit_candidate_with_no_outstanding_syntactic_obligation(problem):
    spec = problem["proof_spec"]
    session = new_text_request({**spec["statement"], "allowed_rules": spec["allowed_rules"], "max_seconds": 10,
                                "request_id": problem["template_id"]})
    for index, step in enumerate(spec["reference_proof"]["steps"], 1):
        session = append_text_step({"request": session["request"], **step, "step_id": f"reference_step_{index}"})
    assert session["proof_state"]["kernel_ready"], session["proof_state"]
    assert not session["proof_state"]["obligations"]
    assert "certificate" not in session


def test_demo_cancellation_with_the_guard_removed_stays_unestablished():
    spec = PROBLEMS[0]["proof_spec"]
    session = new_text_request({**spec["statement"], "allowed_rules": spec["allowed_rules"], "request_id": "missing_guard"})
    session = append_text_step({"request": session["request"], "claim": spec["statement"]["goal"], "rule": "field_identity", "premises": []})
    assert not session["proof_state"]["kernel_ready"]
    assert any(item["code"] == "nonzero_required" for item in session["proof_state"]["obligations"])
