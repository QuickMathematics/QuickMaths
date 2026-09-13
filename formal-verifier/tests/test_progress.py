"""Contract/regression tests. Mock success paths do NOT run Lean."""
from copy import deepcopy
import shutil

import pytest

from quickmaths_formal.contract import canonical_hash, normalize_request
from quickmaths_formal.interactive import append_text_step, new_text_request, replace_text_step
from quickmaths_formal.progress import check_progress
from quickmaths_formal.protocol import handle_message
from quickmaths_formal.verifier import VerificationResult


def cancellation():
    request = new_text_request({"declarations": ["x:real"], "assumptions": ["x != 3"],
                                "goal": "(x^2 - 9)/(x - 3) = x + 3"})["request"]
    request = append_text_step({"request": request, "claim": "x - 3 != 0", "rule": "sub_ne_zero_from_ne", "premises": ["h1"]})["request"]
    return append_text_step({"request": request, "claim": "(x^2 - 9)/(x - 3) = x + 3", "rule": "field_identity", "premises": ["user_step_1"]})["request"]


def test_progress_unavailable_never_promotes_candidates(monkeypatch):
    monkeypatch.setenv("PATH", "")
    result = check_progress(cancellation())
    assert result["status"] == "verification_unavailable"
    assert result["verified_step_ids"] == []
    assert result["blocked_step_id"] == "user_step_1"
    assert result["assessment_eligible"] is False
    assert "certificate" not in result["checked_prefixes"][0]


def test_progress_binds_exact_full_request_and_exact_prefixes(monkeypatch):
    import quickmaths_formal.progress as progress
    request = cancellation()
    seen = []
    def mock_verifier(prefix, **kwargs):
        seen.append(prefix)
        assert kwargs["proof_mode"] == "progress"
        return VerificationResult("verified", "MOCK ONLY", certificate={"request_hash": canonical_hash(prefix)})
    monkeypatch.setattr(progress, "verify_request", mock_verifier)
    result = check_progress(request)
    assert result["request_hash"] == canonical_hash(request)
    assert result["verified_step_ids"] == ["user_step_1", "user_step_2"]
    for i, prefix in enumerate(seen):
        assert prefix["goal"] == request["steps"][i]["claim"]
        assert prefix["steps"] == request["steps"][:i + 1]
        for key in ["variables", "assumptions", "scopes", "request_id"]:
            assert prefix[key] == request[key]
    assert "certificate" not in result  # Cannot be submitted as a final assessment.


def test_stops_after_unjustified_step_even_when_later_claim_matches_goal(monkeypatch):
    import quickmaths_formal.progress as progress
    calls = []
    def reject(prefix, **_):
        calls.append(prefix)
        return VerificationResult("needs_justification", "missing nonzero premise")
    monkeypatch.setattr(progress, "verify_request", reject)
    result = check_progress(cancellation())
    assert len(calls) == 1
    assert result["verified_step_ids"] == []


def test_true_status_without_certificate_cannot_promote_a_step(monkeypatch):
    import quickmaths_formal.progress as progress
    monkeypatch.setattr(progress, "verify_request", lambda *a, **k: VerificationResult("verified", "malformed"))
    result = check_progress(cancellation())
    assert result["verified_step_ids"] == []
    assert len(result["checked_prefixes"]) == 1


def test_budget_bounds_number_of_kernel_invocations(monkeypatch):
    import quickmaths_formal.progress as progress
    monkeypatch.setattr(progress, "MAX_PREFIX_CHECKS", 1)
    monkeypatch.setattr(progress, "verify_request", lambda *a, **k: VerificationResult("verified", "MOCK", certificate={"mock": True}))
    result = check_progress(cancellation())
    assert len(result["checked_prefixes"]) == 1
    assert result["status"] == "search_limit_reached"
    assert result["blocked_step_id"] == "user_step_2"


def test_local_subproof_is_not_promoted_to_a_global_fact(monkeypatch):
    request = cancellation()
    request["scopes"].append({"id": "sub", "parent": "root", "binders": []})
    request["steps"] = [{**request["steps"][0], "scope": "sub"}]
    result = check_progress(request)
    assert result["checked_prefixes"] == []
    assert result["verified_step_ids"] == []
    assert "Local subproofs" in result["message"]


def test_edit_preserves_theorem_and_later_steps_but_exposes_broken_dependency():
    request = cancellation()
    result = replace_text_step({"request": request, "step_id": "user_step_1", "claim": "x = x", "rule": "eq_refl"})
    assert result["request"]["goal"] == request["goal"]
    assert result["request"]["assumptions"] == request["assumptions"]
    assert result["request"]["steps"][1] == request["steps"][1]
    assert result["proof_state"]["kernel_ready"] is False
    assert any(row["code"] == "nonzero_required" for row in result["proof_state"]["obligations"])
    assert canonical_hash(request) != canonical_hash(result["request"])
    assert "verification" not in result


@pytest.mark.parametrize("changes", [
    {"premises": ["user_step_1"]}, {"premises": ["user_step_2"]},
    {"scope": "invented"}, {"step_id": "missing"},
    {"claim": "by sorry"}, {"parameters": {"lean_code": "by admit"}},
])
def test_edit_rejects_cycles_scope_changes_and_code_injection(changes):
    result = handle_message({"op": "replace_text_step", "request": cancellation(), "step_id": "user_step_1",
                             "claim": "x - 3 != 0", "rule": "sub_ne_zero_from_ne", "premises": ["h1"], **changes})
    assert result["ok"] is False


def test_edit_cannot_weaken_rule_policy():
    request = cancellation()
    request["policy"]["allowed_rules"] = ["sub_ne_zero_from_ne", "field_identity"]
    result = handle_message({"op": "replace_text_step", "request": request, "step_id": "user_step_1", "claim": "x = x", "rule": "eq_refl"})
    assert result["ok"] is False


def test_progress_reports_missing_division_guard_without_kernel(monkeypatch):
    monkeypatch.setenv("PATH", "")
    request = new_text_request({"declarations": ["x:real"], "goal": "(x^2-9)/(x-3) = x+3"})["request"]
    request = append_text_step({"request": request, "claim": "(x^2-9)/(x-3) = x+3", "rule": "field_identity"})["request"]
    result = handle_message({"op": "check_progress", "request": request})["result"]
    assert result["verified_step_ids"] == []
    assert result["status"] == "needs_justification"
    assert result["checked_prefixes"][0]["obligations"][0]["code"] == "nonzero_required"


@pytest.mark.skipif(shutil.which("lake") is None, reason="Pinned Lean/mathlib toolchain is not installed")
def test_real_lean_verifies_guarded_prefixes():
    result = check_progress(cancellation())
    assert result["verified_step_ids"] == ["user_step_1", "user_step_2"]
    assert result["assessment_eligible"] is False
