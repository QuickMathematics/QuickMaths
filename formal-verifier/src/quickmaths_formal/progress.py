"""Bounded kernel checks of root proof prefixes, never assessment certificates.

A prefix has its own exact target and certificate. The enclosing report is bound
separately to the WHOLE submitted request (including its unresolved suffix).
Child-scope steps are not promoted to global facts by this API.
"""
from __future__ import annotations

from pathlib import Path
import time
from typing import Any

from .contract import canonical_hash, normalize_request
from .state import build_proof_state, proof_state_to_dict
from .verifier import verify_request

MAX_PREFIX_CHECKS = 12
MAX_PROGRESS_SECONDS = 60


def check_progress(raw_request: Any, *, project_dir: str | Path | None = None) -> dict[str, Any]:
    request = normalize_request(raw_request)
    state = proof_state_to_dict(build_proof_state(request))
    report: dict[str, Any] = {
        "request_hash": canonical_hash(request),
        "proof_state": state,
        "status": "not_checked",
        "checked_prefixes": [],
        "verified_step_ids": [],
        "blocked_step_id": None,
        "message": "Add a justified step to begin checking your reasoning.",
        "assessment_eligible": False,
    }
    deadline = time.monotonic() + min(MAX_PROGRESS_SECONDS, request["policy"]["max_seconds"])
    for index, step in enumerate(request["steps"]):
        # The existing renderer checks local derivations inside their discharge
        # rule. Never extract a local conclusion and assert it at theorem scope.
        if step["scope"] != "root":
            continue
        remaining = int(deadline - time.monotonic())
        if remaining < 1 or len(report["checked_prefixes"]) >= MAX_PREFIX_CHECKS:
            report.update(status="search_limit_reached", blocked_step_id=step["id"],
                          message="The progress-check budget was reached. Unchecked steps remain unresolved.")
            break
        prefix = normalize_request({
            **request,
            "steps": request["steps"][:index + 1],
            "goal": step["claim"],
            "policy": {**request["policy"], "max_seconds": remaining},
        })
        result = verify_request(prefix, project_dir=project_dir, proof_mode="progress")
        if result.status == "verified" and result.certificate is None:
            from .verifier import VerificationResult
            result = VerificationResult("needs_justification", "The verifier returned no certificate for this prefix.")
        row = {
            "step_id": step["id"],
            "status": result.status,
            "message": result.message,
            "obligations": result.obligations,
            "request_hash": canonical_hash(prefix),
        }
        # Only the verifier may mint certificates. Retain the exact prefix so
        # a client can bind/replay it; this is NOT the original exercise proof.
        if result.status == "verified" and result.certificate is not None:
            row.update(request=prefix, certificate=result.certificate)
            report["verified_step_ids"].append(step["id"])
        report["checked_prefixes"].append(row)
        if result.status != "verified" or result.certificate is None:
            report.update(status=result.status, blocked_step_id=step["id"], message=result.message)
            break
        report.update(status="prefixes_verified",
                      message="Lean checked the listed root steps. Final assessment requires a separate check of the exact exercise goal.")
    if request["steps"] and not report["checked_prefixes"] and report["status"] == "not_checked":
        report.update(message="Local subproofs remain local. Finish their discharge step before checking them at the root.")
    return report
