import hashlib
import json
import subprocess
from copy import deepcopy
from pathlib import Path

from quickmaths_formal.contract import canonical_hash, normalize_request
from quickmaths_formal.lean import render_request
from quickmaths_formal import verifier as verifier_module
from quickmaths_formal.verifier import LEAN_TOOLCHAIN, MATHLIB_REV, replay_certificate, verify_request

FIXTURES = Path(__file__).parents[1] / "fixtures"


def load(name="guarded_cancellation.json"):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def fake_lean(monkeypatch, output: str, code: int = 0):
    """Mock the process boundary without requiring a POSIX executable."""
    monkeypatch.setattr(verifier_module, "_lake_command", lambda project: ["lake", "env", "lean"])
    if hasattr(verifier_module, "_environment_error"):
        monkeypatch.setattr(verifier_module, "_environment_error", lambda project, command: None)

    def run(command, **kwargs):
        return subprocess.CompletedProcess(command, code, stdout=output, stderr="")

    monkeypatch.setattr(verifier_module.subprocess, "run", run)


def test_unavailable_verifier_never_claims_mathematical_success(monkeypatch):
    monkeypatch.setenv("PATH", "")
    result = verify_request(load(), project_dir=FIXTURES.parent)
    assert result.status == "verification_unavailable"
    assert result.certificate is None
    assert "theorem result" in result.lean_source


def test_success_path_emits_certificate_bound_to_exact_request(tmp_path, monkeypatch):
    fake_lean(monkeypatch, "'QuickMathsGenerated.result' depends on axioms: [propext, Classical.choice, Quot.sound]")
    result = verify_request(load(), project_dir=tmp_path)
    assert result.status == "verified"
    assert result.certificate["request_hash"] == result.request_hash
    assert result.certificate["statement_hash"] == result.statement_hash
    assert result.certificate["environment"]["mathlib_revision"] == MATHLIB_REV
    assert len(result.certificate["certificate_digest"]) == 64


def test_axiom_audit_rejects_sorry_even_if_worker_exits_zero(tmp_path, monkeypatch):
    fake_lean(monkeypatch, "'QuickMathsGenerated.result' depends on axioms: [propext, sorryAx]")
    result = verify_request(load(), project_dir=tmp_path)
    assert result.status == "needs_justification"
    assert result.certificate is None
    assert "Axiom audit" in result.message


def archived_certificate(raw):
    request = normalize_request(raw)
    source = render_request(request)
    return {
        "certificate_version": "0.1",
        "verifier_version": "phase0.1",
        "request_hash": canonical_hash(request),
        "statement_hash": canonical_hash(request["goal"]),
        "submission_hash": canonical_hash({"assumptions": request["assumptions"], "steps": request["steps"]}),
        "lean_source_hash": hashlib.sha256(source.encode()).hexdigest(),
        "proof_artifact": source,
        "axioms": [],
        "environment": {"lean_toolchain": LEAN_TOOLCHAIN, "mathlib_revision": MATHLIB_REV},
    }


def test_certificate_cannot_be_reattached_after_statement_edit(monkeypatch):
    monkeypatch.setenv("PATH", "")
    raw = load()
    certificate = archived_certificate(raw)
    edited = deepcopy(raw)
    edited["goal"]["proposition"]["right"] = {"kind": "add", "left": {"kind": "var", "id": "x"}, "right": {"kind": "int", "value": 4}}
    result = replay_certificate(edited, certificate, project_dir=FIXTURES.parent)
    assert result.status == "needs_justification"
    assert "does not match" in result.message


def test_certificate_artifact_tamper_is_rejected(monkeypatch):
    monkeypatch.setenv("PATH", "")
    raw = load()
    certificate = archived_certificate(raw)
    certificate["proof_artifact"] += "\n-- tampered"
    result = replay_certificate(raw, certificate, project_dir=FIXTURES.parent)
    assert result.status == "needs_justification"
    assert "tampered" in result.message


def test_certificate_record_digest_rejects_provenance_tamper(tmp_path, monkeypatch):
    fake_lean(monkeypatch, "'QuickMathsGenerated.result' depends on axioms: [propext, Classical.choice, Quot.sound]")
    raw = load()
    result = verify_request(raw, project_dir=tmp_path)
    certificate = deepcopy(result.certificate)
    certificate["proof_mode"] = "assisted"
    replayed = replay_certificate(raw, certificate, project_dir=tmp_path)
    assert replayed.status == "needs_justification"
    assert "record has been tampered" in replayed.message


# These fake executables exercise the audit protocol, not mathematical validity.
import pytest


@pytest.mark.parametrize("output", [
    "", "success", "'Other.result' depends on axioms: []",
    "'QuickMathsGenerated.result' depends on axioms: [propext,]",
    "'QuickMathsGenerated.result' depends on axioms: []\n'QuickMathsGenerated.result' depends on axioms: [sorryAx]",
    "'QuickMathsGenerated.result' depends on axioms: [hidden.axiom]",
])
def test_missing_malformed_duplicate_or_untrusted_audit_fails_closed(tmp_path, monkeypatch, output):
    fake_lean(monkeypatch, output)
    result = verify_request(load(), project_dir=tmp_path)
    assert result.status == "needs_justification"
    assert result.certificate is None
    assert "Axiom audit" in result.message


def test_explicit_no_axioms_report_is_not_confused_with_missing_report(tmp_path, monkeypatch):
    fake_lean(monkeypatch, "'QuickMathsGenerated.result' does not depend on any axioms")
    result = verify_request(load(), project_dir=tmp_path)
    assert result.status == "verified"
    assert result.certificate["axioms"] == []


def test_lesson_policy_cannot_whitelist_an_extra_axiom():
    request = load()
    request["policy"]["accepted_axioms"].append("hidden.axiom")
    result = verify_request(request)
    assert result.status == "ambiguous_input"
    assert result.certificate is None
