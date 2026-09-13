from dataclasses import replace

import pytest

from quickmaths.formal_bridge import (
    FormalBridgeError,
    build_formal_job,
    build_reference_proof_job,
    formal_problem_binding,
    formal_runtime_compatibility,
)
from quickmaths.models import ProblemInstance


def _problem() -> ProblemInstance:
    return ProblemInstance(
        template_id="FORMAL_Q",
        skill_id="FORMAL_SKILL",
        seed=17,
        difficulty="medium",
        values={"a": "3"},
        prompt="For a = 3, prove the identity.",
        expected_answer="proved",
        answer_type="text",
        grading_method="exact_text",
        solution_steps=[],
        mistake_tags=[],
        proof_spec={
            "version": "0.1",
            "statement": {
                "declarations": ["x:real"],
                "assumptions": ["x != 3"],
                "goal": "x + 3 = 3 + x",
            },
            "allowed_rules": ["ring"],
            "environment": {
                "backend": "lean4",
                "toolchain": "leanprover/lean4:v4.34.0-rc2",
                "library": "mathlib",
                "library_revision": "abc123",
            },
        },
    )


def test_formal_job_binds_exact_problem_and_builds_text_rpc():
    problem = _problem()
    job = build_formal_job(problem)
    binding = formal_problem_binding(problem)
    assert job["problem_binding_sha256"] == binding
    assert job["rpc"]["request_id"] == f"quickmaths:{binding}"
    assert job["rpc"]["op"] == "new_text_request"
    assert job["rpc"]["declarations"] == ["x:real"]
    assert job["rpc"]["assumptions"] == ["x != 3"]
    assert job["rpc"]["goal"] == "x + 3 = 3 + x"
    assert job["rpc"]["allowed_rules"] == ["ring"]


def test_formal_binding_changes_when_resolved_question_changes():
    problem = _problem()
    edited_prompt = replace(problem, prompt="For a = 4, prove the identity.")
    edited_spec = replace(
        problem,
        proof_spec={
            **problem.proof_spec,
            "statement": {**problem.proof_spec["statement"], "goal": "x + 4 = 4 + x"},
        },
    )
    assert formal_problem_binding(problem) != formal_problem_binding(edited_prompt)
    assert formal_problem_binding(problem) != formal_problem_binding(edited_spec)


def test_bridge_rejects_nonformal_problem_and_bad_budget():
    problem = replace(_problem(), proof_spec={})
    with pytest.raises(FormalBridgeError, match="no proof_spec"):
        build_formal_job(problem)
    with pytest.raises(FormalBridgeError, match="max_seconds"):
        build_formal_job(_problem(), max_seconds=0)


def test_runtime_compatibility_checks_pinned_environment_without_claiming_availability():
    problem = _problem()
    status = {
        "service": "quickmaths-formal",
        "protocol_version": "0.1",
        "lean_available": False,
        "environment": {
            "backend": "lean4",
            "lean_toolchain": "leanprover/lean4:v4.34.0-rc2",
            "library": "mathlib",
            "mathlib_revision": "abc123",
        },
    }
    result = formal_runtime_compatibility(problem, status)
    assert result["compatible"] is True
    assert result["available"] is False
    assert result["issues"] == []


def test_runtime_compatibility_rejects_environment_drift():
    problem = _problem()
    status = {
        "service": "quickmaths-formal",
        "protocol_version": "0.1",
        "lean_available": True,
        "environment": {
            "backend": "lean4",
            "lean_toolchain": "different",
            "library": "mathlib",
            "mathlib_revision": "abc123",
        },
    }
    result = formal_runtime_compatibility(problem, status)
    assert result["compatible"] is False
    assert result["available"] is False
    assert any("toolchain" in issue for issue in result["issues"])


def test_reference_proof_job_preserves_authored_step_sequence():
    problem = _problem()
    problem = replace(problem, proof_spec={
        **problem.proof_spec,
        "allowed_rules": ["ring_identity"],
        "reference_proof": {
            "mode": "steps",
            "steps": [
                {"claim": "x + 3 = 3 + x", "rule": "ring_identity", "premises": []}
            ],
        },
    })
    job = build_reference_proof_job(problem)
    assert job["rpc"]["op"] == "check_reference_text"
    assert job["rpc"]["reference_steps"] == [{
        "claim": "x + 3 = 3 + x",
        "rule": "ring_identity",
        "premises": [],
        "parameters": {},
        "scope": "root",
    }]
    assert job["rpc"]["request_id"] == f"quickmaths:{formal_problem_binding(problem)}"


def test_reference_proof_auto_mode_routes_to_bounded_prover_search():
    problem = replace(_problem(), proof_spec={**_problem().proof_spec, "reference_proof": {"mode": "auto"}})
    job = build_reference_proof_job(problem, max_seconds=7)
    assert job["rpc"]["op"] == "prove_text"
    assert job["rpc"]["max_seconds"] == 7


def test_reference_proof_job_requires_candidate():
    with pytest.raises(FormalBridgeError, match="no reference_proof"):
        build_reference_proof_job(_problem())
