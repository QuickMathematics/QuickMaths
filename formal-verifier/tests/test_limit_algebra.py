import json
from copy import deepcopy
from pathlib import Path

from quickmaths_formal.contract import normalize_request
from quickmaths_formal.lean import render_request
from quickmaths_formal.protocol import handle_message
from quickmaths_formal.limits import (
    limit_algebra_status,
    match_limit_algebra,
    same_limit_source,
)
from quickmaths_formal.search import build_auto_request, search_proof
from quickmaths_formal.state import build_proof_state

FIXTURES = Path(__file__).parents[1] / "fixtures"


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_direct_limit_algebra_builds_arithmetic_tree_and_is_kernel_ready():
    raw = load("limit_algebra_basic.json")
    pattern = match_limit_algebra(raw["goal"])
    assert pattern is not None
    assert pattern.root.kind == "div"
    assert pattern.used_limit_premises == ()
    missing, violated = limit_algebra_status(pattern)
    assert not missing and not violated
    assert build_proof_state(raw).status == "ready_for_kernel"

    source = render_request(normalize_request(raw))
    assert "tendsto_id.mono_left nhdsWithin_le_nhds" in source
    assert ".mul " in source
    assert ".add " in source
    assert ".div " in source
    assert "≠ 0 := by norm_num" in source


def test_one_sided_limit_uses_the_same_compositional_engine():
    raw = load("limit_algebra_one_sided.json")
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "(𝓝[>] 0)" in source
    assert "Real.sin" in source
    assert "houter.tendsto.comp" in source


def test_previously_proved_removable_hole_is_an_opaque_limit_leaf():
    raw = load("limit_algebra_hole_composition.json")
    limit_rows = [(raw["steps"][0]["id"], raw["steps"][0]["claim"])]
    pattern = match_limit_algebra(raw["goal"], limit_rows)
    assert pattern is not None
    assert pattern.used_limit_premises == ("hole",)
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "convert! hole.add" in source


def test_sublimit_must_have_exact_same_source_filter():
    raw = load("limit_algebra_hole_composition.json")
    premise = deepcopy(raw["steps"][0]["claim"])
    premise["direction"] = "left"
    assert not same_limit_source(raw["goal"], premise)
    assert match_limit_algebra(raw["goal"], [("wrong_side", premise)]) is None

    premise = deepcopy(raw["steps"][0]["claim"])
    premise["domain"] = [{"kind": "lt", "left": {"kind": "int", "value": 0}, "right": {"kind": "var", "id": "x"}}]
    assert not same_limit_source(raw["goal"], premise)
    assert match_limit_algebra(raw["goal"], [("wrong_domain", premise)]) is None


def test_symbolic_denominator_accepts_cited_strict_sign_via_explicit_nonzero_bridge():
    raw = load("limit_algebra_symbolic_denominator.json")
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "(ha : 0 < a)" in source
    assert "≠ 0 := ne_of_gt ha" in source
    assert ".div " in source


def test_log_and_sqrt_positive_targets_record_eventual_school_domain():
    for name in ("limit_algebra_log_composition.json", "limit_algebra_sqrt_positive.json"):
        raw = load(name)
        assert build_proof_state(raw).status == "ready_for_kernel"
        source = render_request(normalize_request(raw))
        assert "eventually_positive" in source
        assert "tendsto_order.1" in source


def test_nonpositive_log_target_and_missing_hole_evidence_are_rejected():
    log_bad = build_proof_state(load("limit_algebra_log_nonpositive_target.json"))
    assert log_bad.status == "needs_justification"
    assert any(item["code"] == "limit_algebra_domain_violation" for item in log_bad.obligations)

    missing = build_proof_state(load("limit_algebra_missing_hole_premise.json"))
    assert missing.status == "needs_justification"
    assert any(item["code"] == "limit_algebra_shape" for item in missing.obligations)


def test_search_reuses_existing_sublimit_and_never_invents_wrong_filter_evidence():
    raw = load("limit_algebra_hole_composition.json")
    raw["steps"] = [raw["steps"][0]]
    result = search_proof(raw)
    suggestion = next(item for item in result["suggestions"] if item["rule"] == "limit_algebra")
    assert suggestion["premises"] == ["hole"]

    augmented, picked = build_auto_request(raw)
    assert picked is not None and picked.rule == "limit_algebra"
    assert build_proof_state(augmented).status == "ready_for_kernel"

    wrong = deepcopy(raw)
    wrong["steps"][0]["claim"]["direction"] = "left"
    result = search_proof(wrong)
    assert all(item["rule"] != "limit_algebra" for item in result["suggestions"])


def test_sqrt_boundary_is_left_to_domain_aware_continuity_rule():
    raw = load("continuity_sqrt_right_limit.json")
    assert match_limit_algebra(raw["goal"]) is not None
    pattern = match_limit_algebra(raw["goal"])
    assert pattern is not None
    missing, violated = limit_algebra_status(pattern)
    assert violated  # target of inner sqrt input is exactly zero, not strictly positive


def test_public_prove_text_builds_limit_algebra_without_forging_certificate(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "limit-algebra-rpc",
        "declarations": ["x:real"],
        "assumptions": [],
        "goal": "As x approaches 2 from both sides, (x^2 + 3*x - 1)/(x + 1) approaches 3.",
        "allowed_rules": ["limit_algebra"],
    })
    assert response["ok"]
    result = response["result"]
    verification = result["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "limit_algebra"
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert "tendsto_id.mono_left nhdsWithin_le_nhds" in verification["lean_source"]
    assert ".div " in verification["lean_source"]
