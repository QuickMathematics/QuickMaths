from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .contract import ContractError, canonical_hash, normalize_request
from .lean import render_request
from .rules import Obligation, preflight
from .search import build_auto_plan, search_proof

VERIFIER_VERSION = "phase1.0"
MATHLIB_REV = "42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c"
LEAN_TOOLCHAIN = "leanprover/lean4:v4.34.0-rc2"
_AX_RE = re.compile(
    r"^['\"]?QuickMathsGenerated\.result['\"]? "
    r"(?:depends on axioms:\s*\[([^\]]*)\]|(does not depend on any axioms))\s*$",
    re.MULTILINE,
)


@dataclass(frozen=True)
class VerificationResult:
    status: str
    message: str
    request_hash: str = ""
    statement_hash: str = ""
    obligations: list[dict[str, Any]] = field(default_factory=list)
    lean_source: str = ""
    stdout: str = ""
    stderr: str = ""
    elapsed_ms: int | None = None
    certificate: dict[str, Any] | None = None
    proof_mode: str = "submitted"
    counterexample: dict[str, str] | None = None
    resolved_request: dict[str, Any] | None = None


def _obligation_dict(item: Obligation) -> dict[str, Any]:
    return asdict(item)


def _parse_axioms(output: str) -> list[str]:
    reports = list(_AX_RE.finditer(output))
    if len(reports) != 1:
        raise ValueError("Expected exactly one axiom audit for QuickMathsGenerated.result.")
    match = reports[0]
    if match.group(2) is not None:
        return []
    payload = match.group(1).strip()
    if not payload:
        return []
    axioms = [item.strip() for item in payload.split(",")]
    if any(not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.]*", item) for item in axioms):
        raise ValueError("Malformed axiom audit for QuickMathsGenerated.result.")
    return axioms


def _safe_environment() -> dict[str, str]:
    allowed = {"PATH", "HOME", "USERPROFILE", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL",
               "SYSTEMROOT", "WINDIR", "ELAN_HOME"}
    return {key: value for key, value in os.environ.items() if key.upper() in allowed}


def _lake_command(project_dir: Path) -> list[str] | None:
    lake = shutil.which("lake")
    if lake:
        return [lake, "env", "lean"]
    return None


def _environment_error(project: Path, command: list[str]) -> str | None:
    """Check the installed environment before claiming the pinned provenance.

    This detects missing/drifted installations, not a malicious local toolchain.
    Lake is required so that library search paths come from the pinned project.
    """
    try:
        if (project / "lean-toolchain").read_text(encoding="utf-8").strip() != LEAN_TOOLCHAIN:
            return "The project Lean toolchain does not match the pinned verifier environment."
        manifest = json.loads((project / "lake-manifest.json").read_text(encoding="utf-8"))
        mathlib = next((p for p in manifest["packages"] if p["name"] == "mathlib"), None)
        if not mathlib or mathlib.get("rev") != MATHLIB_REV:
            return "Mathlib's lockfile revision does not match the pinned verifier environment."
        env = _safe_environment()
        installed = subprocess.run(
            ["git", "-C", str(project / ".lake" / "packages" / "mathlib"), "rev-parse", "HEAD"],
            env=env, capture_output=True, text=True, encoding="utf-8", timeout=10, check=False,
        )
        if installed.returncode or installed.stdout.strip() != MATHLIB_REV:
            return "The installed mathlib checkout does not match its pinned revision."
        version = subprocess.run([*command, "--version"], cwd=project, env=env,
                                 capture_output=True, text=True, encoding="utf-8", timeout=10, check=False)
        expected = LEAN_TOOLCHAIN.rsplit(":v", 1)[1]
        if version.returncode or not re.search(r"\bversion " + re.escape(expected) + r"(?:,|\))", version.stdout):
            return "The installed Lean executable is unavailable or has a different version."
    except (OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired) as exc:
        return f"The pinned Lean environment is not ready: {exc}"
    return None


def _certificate(
    request: dict[str, Any],
    source: str,
    axioms: list[str],
    elapsed_ms: int,
    *,
    proof_mode: str,
) -> dict[str, Any]:
    source_hash = hashlib.sha256(source.encode("utf-8")).hexdigest()
    certificate = {
        "certificate_version": "0.2",
        "verifier_version": VERIFIER_VERSION,
        "verified_at": datetime.now(timezone.utc).isoformat(),
        "request_hash": canonical_hash(request),
        "statement_hash": canonical_hash(request["goal"]),
        "submission_hash": canonical_hash({"assumptions": request["assumptions"], "steps": request["steps"]}),
        "lean_source_hash": source_hash,
        "proof_artifact": source,
        "proof_mode": proof_mode,
        "axioms": axioms,
        "environment": {
            "lean_toolchain": LEAN_TOOLCHAIN,
            "mathlib_revision": MATHLIB_REV,
        },
        "elapsed_ms": elapsed_ms,
    }
    certificate["certificate_digest"] = canonical_hash(certificate)
    return certificate


def verify_request(
    raw_request: Any,
    *,
    project_dir: str | Path | None = None,
    proof_mode: str = "submitted",
) -> VerificationResult:
    try:
        request = normalize_request(raw_request)
    except ContractError as exc:
        return VerificationResult("ambiguous_input", str(exc), proof_mode=proof_mode)

    request_hash = canonical_hash(request)
    statement_hash = canonical_hash(request["goal"])
    obligations = preflight(request)
    unsupported = [item for item in obligations if item.code == "unsupported_rule"]
    if unsupported:
        return VerificationResult(
            "unsupported",
            unsupported[0].message,
            request_hash=request_hash,
            statement_hash=statement_hash,
            obligations=[_obligation_dict(item) for item in obligations],
            proof_mode=proof_mode,
            resolved_request=request,
        )

    semantic_codes = {"denominator_nonzero", "sqrt_domain", "nonzero_required", "nonnegative_required", "sign_required"}
    semantic_blockers = [item for item in obligations if item.code in semantic_codes]
    if semantic_blockers:
        return VerificationResult(
            "needs_justification",
            semantic_blockers[0].message,
            request_hash=request_hash,
            statement_hash=statement_hash,
            obligations=[_obligation_dict(item) for item in obligations],
            proof_mode=proof_mode,
            resolved_request=request,
        )

    from .symbolic import exact_counterexample
    counterexample = exact_counterexample(request)
    if counterexample is not None:
        return VerificationResult(
            "refuted",
            "An exact rational counterexample satisfies the assumptions and falsifies the stated claim.",
            request_hash=request_hash,
            statement_hash=statement_hash,
            proof_mode=proof_mode,
            counterexample=counterexample,
            resolved_request=request,
        )

    if obligations:
        return VerificationResult(
            "needs_justification",
            obligations[0].message,
            request_hash=request_hash,
            statement_hash=statement_hash,
            obligations=[_obligation_dict(item) for item in obligations],
            proof_mode=proof_mode,
            resolved_request=request,
        )

    try:
        source = render_request(request)
    except (ValueError, KeyError) as exc:
        return VerificationResult(
            "unsupported",
            str(exc),
            request_hash=request_hash,
            statement_hash=statement_hash,
            proof_mode=proof_mode,
            resolved_request=request,
        )

    project = Path(project_dir) if project_dir is not None else Path(__file__).resolve().parents[2]
    command = _lake_command(project)
    environment_error = _environment_error(project, command) if command else "Lean/Lake is not installed in this runtime."
    if environment_error:
        message = environment_error + " The exact Lean artifact was generated but not certified."
        if proof_mode == "assisted":
            message += " The generated proof is assistance and does not certify a learner-submitted derivation."
        return VerificationResult(
            "verification_unavailable",
            message,
            request_hash=request_hash,
            statement_hash=statement_hash,
            lean_source=source,
            proof_mode=proof_mode,
            resolved_request=request,
        )

    started = time.perf_counter()
    with tempfile.NamedTemporaryFile("w", suffix=".lean", encoding="utf-8", delete=False, dir=project) as handle:
        handle.write(source)
        artifact_path = Path(handle.name)
    try:
        completed = subprocess.run(
            [*command, str(artifact_path)],
            cwd=project,
            env=_safe_environment(),
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=request["policy"]["max_seconds"],
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        elapsed = int((time.perf_counter() - started) * 1000)
        return VerificationResult(
            "search_limit_reached",
            "Lean verification exceeded the configured time budget.",
            request_hash=request_hash,
            statement_hash=statement_hash,
            lean_source=source,
            stdout=exc.stdout.decode("utf-8", errors="replace") if isinstance(exc.stdout, bytes) else exc.stdout or "",
            stderr=exc.stderr.decode("utf-8", errors="replace") if isinstance(exc.stderr, bytes) else exc.stderr or "",
            elapsed_ms=elapsed,
            proof_mode=proof_mode,
            resolved_request=request,
        )
    except OSError as exc:
        return VerificationResult(
            "verification_unavailable", f"Lean could not start: {exc}",
            request_hash=request_hash, statement_hash=statement_hash, lean_source=source,
            proof_mode=proof_mode, resolved_request=request,
        )
    finally:
        artifact_path.unlink(missing_ok=True)

    elapsed = int((time.perf_counter() - started) * 1000)
    if completed.returncode != 0:
        return VerificationResult(
            "needs_justification",
            "Lean rejected the generated proof artifact.",
            request_hash=request_hash,
            statement_hash=statement_hash,
            lean_source=source,
            stdout=completed.stdout,
            stderr=completed.stderr,
            elapsed_ms=elapsed,
            proof_mode=proof_mode,
            resolved_request=request,
        )

    try:
        axioms = _parse_axioms(completed.stdout + "\n" + completed.stderr)
    except ValueError as exc:
        return VerificationResult(
            "needs_justification", f"Axiom audit failed: {exc}",
            request_hash=request_hash, statement_hash=statement_hash,
            lean_source=source, stdout=completed.stdout, stderr=completed.stderr,
            elapsed_ms=elapsed, proof_mode=proof_mode, resolved_request=request,
        )
    disallowed = sorted(set(axioms) - set(request["policy"]["accepted_axioms"]))
    if any("sorry" in axiom.casefold() or "admit" in axiom.casefold() for axiom in axioms) or disallowed:
        return VerificationResult(
            "needs_justification",
            f"Axiom audit rejected dependencies: {', '.join(disallowed or axioms)}",
            request_hash=request_hash,
            statement_hash=statement_hash,
            lean_source=source,
            stdout=completed.stdout,
            stderr=completed.stderr,
            elapsed_ms=elapsed,
            proof_mode=proof_mode,
            resolved_request=request,
        )

    certificate = _certificate(request, source, axioms, elapsed, proof_mode=proof_mode)
    message = "Lean kernel accepted the exact generated statement and proof artifact."
    if proof_mode == "assisted":
        message += " This verifies the goal using an assistant-generated proof; it does not certify that a learner supplied those steps."
    return VerificationResult(
        "verified",
        message,
        request_hash=request_hash,
        statement_hash=statement_hash,
        lean_source=source,
        stdout=completed.stdout,
        stderr=completed.stderr,
        elapsed_ms=elapsed,
        certificate=certificate,
        proof_mode=proof_mode,
        resolved_request=request,
    )


def prove_goal(raw_request: Any, *, project_dir: str | Path | None = None) -> VerificationResult:
    """Run bounded deterministic proof search, then verify the exact resulting plan.

    Search remains outside the trusted boundary. A generated plan only receives
    `verified` after the normal deterministic Lean artifact is kernel-checked.
    """
    try:
        request = normalize_request(raw_request)
    except ContractError as exc:
        return VerificationResult("ambiguous_input", str(exc), proof_mode="assisted")

    planned, suggestions, terminal = build_auto_plan(request)
    goal_hash = canonical_hash(planned["goal"])
    goal_candidate_complete = any(
        step["scope"] == "root" and canonical_hash(step["claim"]) == goal_hash
        for step in planned["steps"]
    )
    if goal_candidate_complete:
        return verify_request(planned, project_dir=project_dir, proof_mode="assisted")

    if terminal.get("counterexample"):
        return VerificationResult(
            "refuted",
            "An exact rational counterexample satisfies the stated assumptions and defeats the claim.",
            request_hash=canonical_hash(planned),
            statement_hash=canonical_hash(planned["goal"]),
            proof_mode="assisted",
            counterexample=terminal["counterexample"],
            resolved_request=planned,
        )

    obligations = preflight(planned)
    if obligations:
        return VerificationResult(
            "needs_justification",
            obligations[0].message,
            request_hash=canonical_hash(planned),
            statement_hash=canonical_hash(planned["goal"]),
            obligations=[_obligation_dict(item) for item in obligations],
            proof_mode="assisted",
            resolved_request=planned,
        )

    status = "search_limit_reached" if terminal.get("status") == "search_limit_reached" else "unsupported"
    message = (
        "Bounded proof search reached its configured planning limit without a complete candidate."
        if status == "search_limit_reached"
        else "No bounded proof strategy in the current rule registry established this goal."
    )
    return VerificationResult(
        status,
        message,
        request_hash=canonical_hash(planned),
        statement_hash=canonical_hash(planned["goal"]),
        proof_mode="assisted",
        resolved_request=planned,
    )


def replay_certificate(raw_request: Any, certificate: Any, *, project_dir: str | Path | None = None) -> VerificationResult:
    try:
        request = normalize_request(raw_request)
    except ContractError as exc:
        return VerificationResult("ambiguous_input", str(exc))
    if not isinstance(certificate, dict):
        return VerificationResult("engine_error", "Certificate must be an object.")
    if certificate.get("certificate_version") == "0.2":
        supplied_digest = certificate.get("certificate_digest")
        digest_payload = {key: value for key, value in certificate.items() if key != "certificate_digest"}
        if not isinstance(supplied_digest, str) or supplied_digest != canonical_hash(digest_payload):
            return VerificationResult("needs_justification", "Certificate record has been tampered with.")
    request_hash = canonical_hash(request)
    statement_hash = canonical_hash(request["goal"])
    if certificate.get("request_hash") != request_hash or certificate.get("statement_hash") != statement_hash:
        return VerificationResult(
            "needs_justification",
            "Certificate binding does not match this exact request/statement.",
            request_hash=request_hash,
            statement_hash=statement_hash,
        )
    source = certificate.get("proof_artifact")
    if not isinstance(source, str) or hashlib.sha256(source.encode("utf-8")).hexdigest() != certificate.get("lean_source_hash"):
        return VerificationResult(
            "needs_justification",
            "Certificate proof artifact is missing or has been tampered with.",
            request_hash=request_hash,
            statement_hash=statement_hash,
        )
    if certificate.get("environment") != {"lean_toolchain": LEAN_TOOLCHAIN, "mathlib_revision": MATHLIB_REV}:
        return VerificationResult(
            "unsupported",
            "Certificate was produced for a different formal environment.",
            request_hash=request_hash,
            statement_hash=statement_hash,
        )

    regenerated = render_request(request)
    if regenerated != source:
        return VerificationResult(
            "needs_justification",
            "Stored proof artifact does not match deterministic regeneration.",
            request_hash=request_hash,
            statement_hash=statement_hash,
        )
    proof_mode = certificate.get("proof_mode", "submitted")
    return verify_request(request, project_dir=project_dir, proof_mode=proof_mode)


def result_to_json(result: VerificationResult) -> str:
    return json.dumps(asdict(result), ensure_ascii=False, indent=2, sort_keys=True)
