import json
from copy import deepcopy
from pathlib import Path

from quickmaths_formal.calculus import (
    continuity_guard_auto_tactic,
    continuity_pattern_status,
    continuity_plan,
    match_continuity_limit,
    match_continuous_ivt_existence,
    select_continuous_ivt_orientation,
)
from quickmaths_formal.contract import normalize_request
from quickmaths_formal.lean import render_request
from quickmaths_formal.search import build_auto_request, search_proof
from quickmaths_formal.state import build_proof_state

FIXTURES = Path(__file__).parents[1] / "fixtures"


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_abs_limit_uses_continuity_even_at_derivative_kink():
    raw = load("continuity_abs_limit.json")
    pattern = match_continuity_limit(raw["goal"])
    assert pattern is not None
    assert pattern.guards == ()
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "ContinuousAt (fun (x : ℝ) => |x|) 0" in source
    assert "tendsto_nhdsWithin_of_tendsto_nhds" in source


def test_log_exp_limit_generates_positive_school_domain_guard():
    raw = load("continuity_log_exp_limit.json")
    pattern = match_continuity_limit(raw["goal"])
    assert pattern is not None and len(pattern.guards) == 1
    assert pattern.guards[0].relation == "positive"
    assert continuity_guard_auto_tactic(pattern.guards[0]) == "positivity"
    missing, violated = continuity_pattern_status(pattern)
    assert not missing and not violated
    source = render_request(normalize_request(raw))
    assert "Real.log ((Real.exp (x)))" in source
    assert "0 < ((Real.exp (2)) : ℝ) := by positivity" in source
    assert "≠ 0 := ne_of_gt" in source


def test_guarded_quotient_limit_uses_point_nonzero_guard():
    raw = load("continuity_guarded_quotient_limit.json")
    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "((0 ^ 2) + 1) : ℝ) ≠ 0 := by norm_num" in source
    assert "ContinuousAt" in source


def test_sqrt_square_limit_allows_school_domain_boundary_by_nonnegative_guard():
    raw = load("continuity_sqrt_square_limit.json")
    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "0 ≤ ((0 ^ 2) : ℝ) := by norm_num" in source
    assert "Real.sqrt ((x ^ 2))" in source



def test_one_sided_sqrt_limit_preserves_school_domain_filter():
    raw = load("continuity_sqrt_right_limit.json")
    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "nhdsWithin 0 { x | (0 ≤ x) ∧ (0 < x) }" in source
    assert "0 ≤ (0 : ℝ) := by norm_num" in source
    assert "ContinuousAt (fun (x : ℝ) => (Real.sqrt (x))) 0" in source

def test_wrong_direct_substitution_target_is_rejected_before_kernel():
    raw = load("continuity_wrong_value.json")
    state = build_proof_state(raw)
    assert state.status == "needs_justification"
    assert any(item["code"] == "continuity_limit_shape" for item in state.obligations)
    raw["steps"] = []
    result = search_proof(raw)
    assert all(item["rule"] != "continuity_limit" for item in result.get("suggestions", []))


def test_exact_bad_log_point_is_domain_violation_not_a_limit_proof():
    raw = load("continuity_log_zero_domain_violation.json")
    pattern = continuity_plan(raw["goal"]["expression"], "x", raw["goal"]["point"])
    assert pattern is not None
    missing, violated = continuity_pattern_status(pattern)
    assert not missing and violated
    state = build_proof_state(raw)
    assert state.status == "needs_justification"
    assert any(item["code"] in {"continuity_limit_shape", "log_domain"} for item in state.obligations)


def test_search_suggests_continuity_limit_without_claiming_verification():
    raw = load("continuity_log_exp_limit.json")
    raw["steps"] = []
    result = search_proof(raw)
    assert result["status"] == "candidate_found"
    suggestion = next(item for item in result["suggestions"] if item["rule"] == "continuity_limit")
    assert suggestion["premises"] == []
    augmented, picked = build_auto_request(raw)
    assert picked is not None and picked.rule == "continuity_limit"
    assert build_proof_state(augmented).status == "ready_for_kernel"


def test_continuous_ivt_handles_uniformly_guarded_quotient_and_reverse_bracket():
    raw = load("continuous_ivt_guarded_quotient.json")
    pattern = match_continuous_ivt_existence(raw["goal"])
    assert pattern is not None
    assert len(pattern.guards) == 1
    orientation, missing = select_continuous_ivt_orientation(pattern)
    assert orientation == "reverse" and not missing
    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "ContinuousOn" in source
    assert "interval_guard_1" in source and "by positivity" in source
    assert "intermediate_value_Icc'" in source
    assert "bracket_1" in source and "by norm_num" in source


def test_continuous_ivt_can_use_explicit_transcendental_endpoint_brackets():
    raw = load("continuous_ivt_exp_with_brackets.json")
    pattern = match_continuous_ivt_existence(raw["goal"])
    assert pattern is not None and pattern.guards == ()
    orientation, missing = select_continuous_ivt_orientation(
        pattern, [row["claim"] for row in raw["assumptions"]]
    )
    assert orientation == "forward" and not missing
    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "Real.exp (c)" in source
    assert "intermediate_value_Icc " in source
    assert "⟨hlow, hhigh⟩" in source


def test_continuous_ivt_missing_endpoint_brackets_stays_needs_justification():
    raw = load("continuous_ivt_missing_brackets.json")
    state = build_proof_state(raw)
    assert state.status == "needs_justification"
    assert any(item["code"] == "ivt_bracket_required" for item in state.obligations)
    raw["steps"] = []
    result = search_proof(raw)
    assert all(item["rule"] != "continuous_ivt_exists" for item in result.get("suggestions", []))


def test_continuity_planner_rejects_piecewise_and_arbitrary_apply_nodes():
    x = {"kind": "var", "id": "x"}
    point = {"kind": "int", "value": 0}
    piecewise = {
        "kind": "if",
        "condition": {"kind": "lt", "left": x, "right": point},
        "then": {"kind": "int", "value": -1},
        "else": {"kind": "int", "value": 1},
    }
    assert continuity_plan(piecewise, "x", point) is None
