"""Narrow QuickMaths-to-formal-verifier protocol bridge.

The main application deliberately does not import the formal verifier package.
This module turns an already-resolved ``ProblemInstance.proof_spec`` into the
small JSON RPC message understood by the isolated companion verifier, while
binding the request to the exact generated problem snapshot.
"""
from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from typing import Any

from quickmaths.formal_spec import normalize_proof_spec
from quickmaths.models import ProblemInstance


FORMAL_PROTOCOL_VERSION = "0.1"
FORMAL_SERVICE_NAME = "quickmaths-formal"
_ALLOWED_OPERATIONS = {"new_text_request", "prove_text"}


class FormalBridgeError(ValueError):
    pass


def formal_problem_binding(instance: ProblemInstance) -> str:
    """Return a deterministic SHA-256 binding for the resolved formal problem."""

    spec = normalize_proof_spec(instance.proof_spec)
    if not spec:
        raise FormalBridgeError("problem has no proof_spec")
    payload = {
        "skill_id": instance.skill_id,
        "template_id": instance.template_id,
        "seed": instance.seed,
        "values": deepcopy(instance.values),
        "prompt": instance.prompt,
        "proof_spec": spec,
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def build_formal_job(
    instance: ProblemInstance,
    *,
    operation: str = "new_text_request",
    max_seconds: int = 60,
) -> dict[str, Any]:
    """Build an isolated-verifier job without performing verification.

    ``new_text_request`` starts an interactive learner proof. ``prove_text`` is
    suitable for bounded author/reference proof search. Neither operation is a
    certificate until the companion verifier returns kernel-checked evidence.
    """

    if operation not in _ALLOWED_OPERATIONS:
        raise FormalBridgeError(f"unsupported formal operation {operation!r}")
    if not isinstance(max_seconds, int) or isinstance(max_seconds, bool) or not 1 <= max_seconds <= 60:
        raise FormalBridgeError("max_seconds must be an integer from 1 to 60")

    spec = normalize_proof_spec(instance.proof_spec)
    if not spec:
        raise FormalBridgeError("problem has no proof_spec")
    statement = spec["statement"]
    binding = formal_problem_binding(instance)
    rpc = {
        "protocol_version": FORMAL_PROTOCOL_VERSION,
        "op": operation,
        "request_id": f"quickmaths:{binding}",
        "declarations": list(statement["declarations"]),
        "assumptions": list(statement["assumptions"]),
        "goal": statement["goal"],
        "allowed_rules": list(spec["allowed_rules"]),
        "max_seconds": max_seconds,
    }
    return {
        "version": "0.1",
        "problem_binding_sha256": binding,
        "skill_id": instance.skill_id,
        "template_id": instance.template_id,
        "seed": instance.seed,
        "environment_requirements": deepcopy(spec["environment"]),
        "rpc": rpc,
    }



def build_reference_proof_job(
    instance: ProblemInstance,
    *,
    max_seconds: int = 60,
) -> dict[str, Any]:
    """Build a verifier job for an author's reference proof candidate.

    Submitted reference steps are replayed exactly through the interactive text
    contract before the kernel check. ``auto`` mode requests bounded search and
    remains untrusted until the verifier returns a kernel certificate.
    """

    if not isinstance(max_seconds, int) or isinstance(max_seconds, bool) or not 1 <= max_seconds <= 60:
        raise FormalBridgeError("max_seconds must be an integer from 1 to 60")
    spec = normalize_proof_spec(instance.proof_spec)
    if not spec:
        raise FormalBridgeError("problem has no proof_spec")
    reference = spec.get("reference_proof") or {}
    if not reference:
        raise FormalBridgeError("problem has no reference_proof")
    if reference.get("mode") == "auto":
        return build_formal_job(instance, operation="prove_text", max_seconds=max_seconds)

    statement = spec["statement"]
    binding = formal_problem_binding(instance)
    return {
        "version": "0.1",
        "problem_binding_sha256": binding,
        "skill_id": instance.skill_id,
        "template_id": instance.template_id,
        "seed": instance.seed,
        "environment_requirements": deepcopy(spec["environment"]),
        "reference_mode": "steps",
        "rpc": {
            "protocol_version": FORMAL_PROTOCOL_VERSION,
            "op": "check_reference_text",
            "request_id": f"quickmaths:{binding}",
            "declarations": list(statement["declarations"]),
            "assumptions": list(statement["assumptions"]),
            "goal": statement["goal"],
            "allowed_rules": list(spec["allowed_rules"]),
            "reference_steps": deepcopy(reference.get("steps", [])),
            "max_seconds": max_seconds,
        },
    }

def formal_runtime_compatibility(instance: ProblemInstance, runtime_status: Any) -> dict[str, Any]:
    """Compare a verifier health response with the problem's pinned requirements."""

    spec = normalize_proof_spec(instance.proof_spec)
    if not spec:
        raise FormalBridgeError("problem has no proof_spec")
    if not isinstance(runtime_status, dict):
        return {"compatible": False, "available": False, "issues": ["Verifier health response is not an object."]}

    issues: list[str] = []
    if runtime_status.get("service") != FORMAL_SERVICE_NAME:
        issues.append("Verifier service identity does not match QuickMaths formal verifier.")
    if runtime_status.get("protocol_version") != FORMAL_PROTOCOL_VERSION:
        issues.append(f"Verifier protocol must be {FORMAL_PROTOCOL_VERSION}.")

    environment = runtime_status.get("environment")
    if not isinstance(environment, dict):
        environment = {}
        issues.append("Verifier did not report its formal environment.")

    requirements = spec["environment"]
    comparisons = {
        "backend": "backend",
        "toolchain": "lean_toolchain",
        "library": "library",
        "library_revision": "mathlib_revision",
    }
    for requirement_key, runtime_key in comparisons.items():
        expected = requirements.get(requirement_key)
        if expected and environment.get(runtime_key) != expected:
            issues.append(f"Verifier {requirement_key} does not match required value {expected!r}.")

    return {
        "compatible": not issues,
        "available": bool(runtime_status.get("lean_available")) and not issues,
        "issues": issues,
        "environment": deepcopy(environment),
    }
