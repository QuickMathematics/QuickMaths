import json
from fractions import Fraction
from copy import deepcopy
from pathlib import Path

import pytest

from quickmaths_formal.contract import ContractError, normalize_request
from quickmaths_formal.lean import _render_series_ratio_limit_test, render_request
from quickmaths_formal.parser import parse_expression_text, parse_goal_text, render_goal_text
from quickmaths_formal.protocol import handle_message
from quickmaths_formal.search import build_auto_request, search_proof
from quickmaths_formal.series import _ratio_limit_expression, match_geometric_series, match_p_series, match_series_ratio_test, match_series_ratio_limit_test, match_series_root_test
from quickmaths_formal.state import build_proof_state

FIXTURES = Path(__file__).parents[1] / "fixtures"


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_series_text_round_trip_and_goal_rendering():
    for text in [
        "The series from n = 0 to infinity of (1/2)^n sums to 2.",
        "The series from n = 0 to infinity of 2^n is not summable.",
        "The series from n = 0 to infinity of 1 / real(n + 1)^2 is summable.",
        "The series from n = 0 to infinity of 1 / real(n + 1)^(3/2) is summable.",
    ]:
        goal = parse_goal_text(text, {"n"})
        assert goal["kind"] == "series_sum"
        assert render_goal_text(goal) == text


def test_exact_geometric_series_finite_sum_matches_ratio_formula():
    for name, coefficient, ratio, target in [
        ("series_geometric_half_sum.json", 1, (1, 2), 2),
        ("series_geometric_scaled_negative_sum.json", 3, (-1, 2), 2),
    ]:
        raw = load(name)
        pattern = match_geometric_series(raw["goal"])
        assert pattern is not None
        assert pattern.coefficient == coefficient
        assert (pattern.ratio.numerator, pattern.ratio.denominator) == ratio
        assert pattern.target == target
        assert build_proof_state(raw).status == "ready_for_kernel"
        source = render_request(normalize_request(raw))
        assert "hasSum_geometric_of_abs_lt_one" in source
        assert ".mul_left" in source
        assert "convert! hscaled using 1" in source


def test_exact_geometric_series_nonsummability_uses_mathlib_iff():
    for name in ["series_geometric_two_not_summable.json", "series_geometric_negative_one_not_summable.json"]:
        raw = load(name)
        pattern = match_geometric_series(raw["goal"])
        assert pattern is not None and pattern.result_kind == "not_summable"
        assert build_proof_state(raw).status == "ready_for_kernel"
        source = render_request(normalize_request(raw))
        assert "summable_mul_left_iff" in source
        assert "summable_geometric_iff_norm_lt_one" in source
        assert "norm_num at hr" in source


def test_wrong_geometric_series_classifications_are_refused_before_kernel():
    for name in ["series_geometric_wrong_sum.json", "series_geometric_false_divergence.json", "series_geometric_false_finite.json"]:
        raw = load(name)
        assert match_geometric_series(raw["goal"]) is None
        state = build_proof_state(raw)
        assert state.status == "needs_justification"
        assert any(item["code"] == "series_geometric_shape" for item in state.obligations)


def test_search_and_public_protocol_select_geometric_series_without_certificate(monkeypatch):
    raw = load("series_geometric_half_sum.json")
    raw["steps"] = []
    result = search_proof(raw)
    assert any(row["rule"] == "series_geometric" for row in result["suggestions"])
    augmented, suggestion = build_auto_request(raw)
    assert suggestion is not None and suggestion.rule == "series_geometric"
    assert build_proof_state(augmented).status == "ready_for_kernel"

    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "series-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of (1/2)^n sums to 2.",
        "allowed_rules": ["series_geometric"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "series_geometric"
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None


def test_series_index_must_be_nat():
    raw = deepcopy(load("series_geometric_half_sum.json"))
    raw["variables"][0]["type"] = "real"
    with pytest.raises(ContractError, match="series index"):
        normalize_request(raw)


def test_series_finite_target_cannot_depend_on_bound_index():
    raw = deepcopy(load("series_geometric_half_sum.json"))
    raw["goal"]["result"]["value"] = {"kind": "var", "id": "n"}
    with pytest.raises(ContractError, match="bound series index"):
        normalize_request(raw)


def test_shifted_integer_p_series_matches_summability_criterion():
    for name, coefficient, shift, exponent in [
        ("series_p2_shift1_summable.json", 1, 1, 2),
        ("series_p3_scaled_shift2_summable.json", 3, 2, 3),
    ]:
        raw = load(name)
        pattern = match_p_series(raw["goal"])
        assert pattern is not None
        assert pattern.coefficient == coefficient
        assert pattern.shift == shift
        assert pattern.exponent == exponent
        assert pattern.result_kind == "summable"
        assert build_proof_state(raw).status == "ready_for_kernel"
        source = render_request(normalize_request(raw))
        assert "summable_one_div_nat_pow.mpr" in source
        assert f"summable_nat_add_iff {shift}" in source
        assert ".mul_left" in source


def test_shifted_integer_p_series_nonsummability_uses_reverse_criterion():
    for name, exponent in [
        ("series_p1_harmonic_not_summable.json", 1),
        ("series_p0_not_summable.json", 0),
    ]:
        raw = load(name)
        pattern = match_p_series(raw["goal"])
        assert pattern is not None and pattern.result_kind == "not_summable"
        assert pattern.exponent == exponent
        assert build_proof_state(raw).status == "ready_for_kernel"
        source = render_request(normalize_request(raw))
        assert "summable_mul_left_iff" in source
        assert "summable_one_div_nat_pow.mp" in source
        assert "norm_num at hp" in source


def test_wrong_or_out_of_boundary_p_series_claims_are_refused_before_kernel():
    for name in [
        "series_p2_false_not_summable.json",
        "series_p1_false_summable.json",
        "series_p2_zero_shift_unsupported.json",
    ]:
        raw = load(name)
        assert match_p_series(raw["goal"]) is None
        state = build_proof_state(raw)
        assert state.status == "needs_justification"
        assert any(item["code"] == "series_p_series_shape" for item in state.obligations)


def test_search_and_public_protocol_select_p_series_without_certificate(monkeypatch):
    raw = load("series_p2_shift1_summable.json")
    raw["steps"] = []
    result = search_proof(raw)
    assert any(row["rule"] == "series_p_series" for row in result["suggestions"])
    augmented, suggestion = build_auto_request(raw)
    assert suggestion is not None and suggestion.rule == "series_p_series"
    assert build_proof_state(augmented).status == "ready_for_kernel"

    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "p-series-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of 1 / real(n + 1)^2 is summable.",
        "allowed_rules": ["series_p_series"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "series_p_series"
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None



def test_shifted_real_exponent_p_series_matches_mathlib_real_criterion():
    raw = load("series_p_real_three_halves_shift1_summable.json")
    pattern = match_p_series(raw["goal"])
    assert pattern is not None
    assert pattern.coefficient == 1
    assert pattern.shift == 1
    assert pattern.exponent == Fraction(3, 2)
    assert pattern.real_exponent is True
    assert pattern.result_kind == "summable"
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "summable_one_div_nat_rpow.mpr" in source
    assert "summable_nat_add_iff 1" in source
    assert "(3 / 2 : ℝ)" in source


def test_shifted_real_exponent_p_series_nonsummability_uses_reverse_real_criterion():
    raw = load("series_p_real_half_scaled_shift2_not_summable.json")
    pattern = match_p_series(raw["goal"])
    assert pattern is not None
    assert pattern.coefficient == 2
    assert pattern.shift == 2
    assert pattern.exponent == Fraction(1, 2)
    assert pattern.real_exponent is True
    assert pattern.result_kind == "not_summable"
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "summable_one_div_nat_rpow.mp" in source
    assert "summable_mul_left_iff" in source
    assert "norm_num at hp" in source


def test_false_or_out_of_boundary_real_exponent_p_series_claims_are_refused():
    for name in [
        "series_p_real_three_halves_false_not_summable.json",
        "series_p_real_half_false_summable.json",
        "series_p_real_overflow_unsupported.json",
    ]:
        raw = load(name)
        assert match_p_series(raw["goal"]) is None
        state = build_proof_state(raw)
        assert state.status == "needs_justification"
        assert any(item["code"] == "series_p_series_shape" for item in state.obligations)


def test_public_protocol_parses_real_exponent_p_series_without_certificate(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "real-p-series-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of 1 / real(n + 1)^(3/2) is summable.",
        "allowed_rules": ["series_p_series"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["goal"]["expression"]["right"]["kind"] == "rpow"
    assert verification["resolved_request"]["steps"][-1]["rule"] == "series_p_series"
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None

def test_series_comparison_convergence_uses_cited_majorant_and_bound():
    raw = load("series_comparison_summable.json")
    pattern = __import__("quickmaths_formal.series", fromlist=["match_series_comparison"]).match_series_comparison(
        raw["goal"],
        [("comparison", raw["steps"][0]["claim"]), ("h1", {"kind": "proposition", "proposition": raw["assumptions"][0]["claim"]})],
    )
    assert pattern is not None
    assert pattern.result_kind == "summable"
    assert pattern.comparison_result_kind == "finite"
    assert pattern.comparison_premise_id == "comparison"
    assert pattern.evidence_premise_id == "h1"
    assert pattern.evidence_mode == "eventual"
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "comparison.summable" in source
    assert "of_norm_bounded_eventually_nat" in source
    assert "eventually_ge_atTop N" in source
    assert "hN k hk" in source


def test_series_comparison_divergence_uses_cited_nonsummable_minorant():
    raw = load("series_comparison_not_summable.json")
    pattern = __import__("quickmaths_formal.series", fromlist=["match_series_comparison"]).match_series_comparison(
        raw["goal"],
        [("comparison", raw["steps"][0]["claim"]), ("h1", {"kind": "proposition", "proposition": raw["assumptions"][0]["claim"]})],
    )
    assert pattern is not None and pattern.evidence_mode == "global"
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "intro htarget" in source
    assert "htarget.of_nonneg_of_le" in source
    assert "exact comparison hcomparison" in source


def test_series_comparison_requires_explicit_bound_in_correct_direction():
    for name in ["series_comparison_missing_evidence.json", "series_comparison_wrong_direction.json"]:
        raw = load(name)
        state = build_proof_state(raw)
        assert state.status == "needs_justification"
        assert any(item["code"] == "series_comparison_evidence" for item in state.obligations)


def test_search_reuses_existing_series_and_bound_for_comparison():
    raw = load("series_comparison_summable.json")
    raw["steps"] = raw["steps"][:1]
    result = search_proof(raw)
    rows = [row for row in result["suggestions"] if row["rule"] == "series_comparison"]
    assert len(rows) == 1
    assert set(rows[0]["premises"]) == {"comparison", "h1"}
    augmented, suggestion = build_auto_request(raw)
    assert suggestion is not None and suggestion.rule == "series_comparison"
    assert set(suggestion.premises) == {"comparison", "h1"}
    assert build_proof_state(augmented).status == "ready_for_kernel"


def test_ratio_test_eventual_bound_reaches_kernel_boundary():
    raw = load("series_ratio_eventual_linear_geometric_summable.json")
    rows = [("h1", {"kind": "proposition", "proposition": raw["assumptions"][0]["claim"]})]
    pattern = match_series_ratio_test(raw["goal"], rows)
    assert pattern is not None
    assert pattern.ratio_bound == Fraction(3, 4)
    assert pattern.evidence_mode == "eventual"
    assert pattern.evidence_premise_id == "h1"
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "summable_of_ratio_norm_eventually_le" in source
    assert "eventually_ge_atTop N" in source
    assert "Real.norm_eq_abs" in source


def test_ratio_test_global_bound_reaches_kernel_boundary():
    raw = load("series_ratio_global_geometric_summable.json")
    rows = [("h1", {"kind": "proposition", "proposition": raw["assumptions"][0]["claim"]})]
    pattern = match_series_ratio_test(raw["goal"], rows)
    assert pattern is not None
    assert pattern.ratio_bound == Fraction(1, 3)
    assert pattern.evidence_mode == "global"
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "Filter.Eventually.of_forall" in source


def test_ratio_test_refuses_missing_bad_or_reversed_bounds():
    for name in [
        "series_ratio_missing_evidence.json",
        "series_ratio_bound_one_unsupported.json",
        "series_ratio_wrong_direction.json",
    ]:
        raw = load(name)
        state = build_proof_state(raw)
        assert state.status == "needs_justification"
        assert any(item["code"] == "series_ratio_test_evidence" for item in state.obligations)


def test_search_selects_ratio_test_from_existing_bound():
    raw = load("series_ratio_eventual_linear_geometric_summable.json")
    raw["steps"] = []
    result = search_proof(raw)
    rows = [row for row in result["suggestions"] if row["rule"] == "series_ratio_test"]
    assert len(rows) == 1
    assert rows[0]["premises"] == ["h1"]
    augmented, suggestion = build_auto_request(raw)
    assert suggestion is not None and suggestion.rule == "series_ratio_test"
    assert suggestion.premises == ["h1"]
    assert build_proof_state(augmented).status == "ready_for_kernel"


def test_public_protocol_parses_ratio_test_evidence_without_certificate(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-test-rpc",
        "declarations": ["n:nat"],
        "assumptions": [
            "eventually k:nat, abs(real(k + 2) * (1/2)^(k + 1)) <= (3/4) * abs(real(k + 1) * (1/2)^k)"
        ],
        "goal": "The series from n = 0 to infinity of real(n + 1) * (1/2)^n is summable.",
        "allowed_rules": ["series_ratio_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "series_ratio_test"
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None


def test_ratio_limit_test_reconstructs_exact_geometric_quotient_and_requires_nonzero_evidence():
    raw = load("series_ratio_limit_geometric_summable.json")
    rows = [("h_nonzero", {"kind": "proposition", "proposition": raw["assumptions"][0]["claim"]})]
    pattern = match_series_ratio_limit_test(raw["goal"], rows)
    assert pattern is not None
    assert pattern.limit == Fraction(1, 2)
    assert pattern.limit_premise_id is None
    assert pattern.automatic_ratio_base == Fraction(-1, 2)
    assert pattern.nonzero_premise_id == "h_nonzero"
    assert pattern.nonzero_mode == "eventual"
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "summable_of_ratio_test_tendsto_lt_one" in source
    assert "have hratio" in source
    assert "have hnonzero" in source
    assert "eventually_ge_atTop N" in source


def test_ratio_limit_test_prefers_an_exact_cited_quotient_limit_when_available():
    raw = load("series_ratio_limit_geometric_summable.json")
    expr = raw["goal"]["expression"]
    ratio_expr = {
        "kind": "div",
        "left": {
            "kind": "abs",
            "arg": {
                "kind": "pow_nat",
                "base": expr["base"],
                "exponent": {
                    "kind": "add",
                    "left": {"kind": "var", "id": "n"},
                    "right": {"kind": "int", "value": 1},
                },
            },
        },
        "right": {"kind": "abs", "arg": expr},
    }
    ratio_claim = {
        "kind": "sequence_limit",
        "variable": "n",
        "expression": ratio_expr,
        "result": {"kind": "finite", "value": {"kind": "rat", "numerator": 1, "denominator": 2}},
    }
    rows = [
        ("ratio_limit", ratio_claim),
        ("h_nonzero", {"kind": "proposition", "proposition": raw["assumptions"][0]["claim"]}),
    ]
    pattern = match_series_ratio_limit_test(raw["goal"], rows)
    assert pattern is not None
    assert pattern.limit_premise_id == "ratio_limit"
    assert pattern.automatic_ratio_base is None
    assert pattern.limit == Fraction(1, 2)


def test_ratio_limit_test_reconstructs_global_nonzero_for_exact_geometric_terms():
    raw = load("series_ratio_limit_missing_nonzero.json")
    pattern = match_series_ratio_limit_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 2)
    assert pattern.limit_premise_id is None
    assert pattern.nonzero_premise_id is None
    assert pattern.automatic_nonzero_from == 0
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "have hnonzero" in source
    assert "Filter.eventually_ge_atTop 0" in source
    assert "pow_ne_zero n (by norm_num)" in source


def test_ratio_limit_test_reuses_polynomial_tail_certificate_for_eventual_nonzero():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (real(n)^2 - 1) * (1/2)^n is summable.",
        {"n"},
    )
    ratio_claim = {
        "kind": "sequence_limit",
        "variable": "n",
        "expression": _ratio_limit_expression(goal["expression"], "n"),
        "result": {"kind": "finite", "value": {"kind": "rat", "numerator": 1, "denominator": 2}},
    }
    pattern = match_series_ratio_limit_test(goal, [("ratio_limit", ratio_claim)])
    assert pattern is not None
    assert pattern.limit_premise_id == "ratio_limit"
    assert pattern.nonzero_premise_id is None
    assert pattern.automatic_nonzero_from == 2

    source = "\n".join(_render_series_ratio_limit_test(pattern, {
        "assumptions": [],
        "steps": [{"id": "ratio_limit"}],
    }))
    assert "Filter.eventually_ge_atTop 2" in source
    assert "hshiftIdentity" in source
    assert "mul_ne_zero" in source
    assert "hshiftPositive" in source


def test_ratio_limit_test_does_not_guess_recurring_zero_term_guard():
    n = {"kind": "var", "id": "n"}
    alternating = {
        "kind": "pow_nat",
        "base": {"kind": "neg", "arg": {"kind": "int", "value": 1}},
        "exponent": n,
    }
    target = {
        "kind": "mul",
        "left": {"kind": "add", "left": {"kind": "int", "value": 1}, "right": alternating},
        "right": {
            "kind": "pow_nat",
            "base": {"kind": "rat", "numerator": 1, "denominator": 2},
            "exponent": n,
        },
    }
    goal = {
        "kind": "series_sum",
        "variable": "n",
        "expression": target,
        "result": {"kind": "summable"},
    }
    ratio_claim = {
        "kind": "sequence_limit",
        "variable": "n",
        "expression": _ratio_limit_expression(target, "n"),
        "result": {"kind": "finite", "value": {"kind": "rat", "numerator": 1, "denominator": 2}},
    }
    assert match_series_ratio_limit_test(goal, [("ratio_limit", ratio_claim)]) is None


def test_ratio_limit_test_ignores_irrelevant_nonzero_evidence_when_guard_is_reconstructible():
    raw = load("series_ratio_limit_wrong_nonzero.json")
    pattern = match_series_ratio_limit_test(
        raw["goal"],
        [("h_nonzero", {"kind": "proposition", "proposition": raw["assumptions"][0]["claim"]})],
    )
    assert pattern is not None
    assert pattern.nonzero_premise_id is None
    assert pattern.automatic_nonzero_from == 0
    assert build_proof_state(raw).status == "ready_for_kernel"


def test_ratio_limit_test_still_refuses_missing_quotient_limit_for_non_geometric_terms():
    raw = load("series_ratio_limit_non_geometric_missing_limit.json")
    state = build_proof_state(raw)
    assert state.status == "needs_justification"
    assert any(item["code"] == "series_ratio_limit_test_evidence" for item in state.obligations)


def test_search_selects_premise_free_ratio_limit_test_when_nonzero_is_reconstructible():
    raw = load("series_ratio_limit_missing_nonzero.json")
    raw["steps"] = []
    result = search_proof(raw)
    rows = [row for row in result["suggestions"] if row["rule"] == "series_ratio_limit_test"]
    assert len(rows) == 1
    assert rows[0]["premises"] == []
    augmented, suggestion = build_auto_request(raw)
    assert suggestion is not None and suggestion.rule == "series_ratio_limit_test"
    assert suggestion.premises == []
    assert build_proof_state(augmented).status == "ready_for_kernel"


def test_search_selects_ratio_limit_test_from_explicit_nonzero_evidence():
    raw = load("series_ratio_limit_geometric_summable.json")
    raw["steps"] = []
    result = search_proof(raw)
    rows = [row for row in result["suggestions"] if row["rule"] == "series_ratio_limit_test"]
    assert len(rows) == 1
    assert rows[0]["premises"] == ["h_nonzero"]
    augmented, suggestion = build_auto_request(raw)
    assert suggestion is not None and suggestion.rule == "series_ratio_limit_test"
    assert suggestion.premises == ["h_nonzero"]
    assert build_proof_state(augmented).status == "ready_for_kernel"


def test_search_prefers_existing_exact_ratio_limit_step_when_present():
    raw = load("series_ratio_limit_geometric_summable.json")
    expr = raw["goal"]["expression"]
    raw["policy"]["allowed_rules"] = ["series_ratio_limit_test", "sequence_algebra"]
    raw["steps"] = [{
        "id": "ratio_limit",
        "scope": "root",
        "claim": {
            "kind": "sequence_limit",
            "variable": "n",
            "expression": {
                "kind": "div",
                "left": {
                    "kind": "abs",
                    "arg": {
                        "kind": "pow_nat",
                        "base": expr["base"],
                        "exponent": {
                            "kind": "add",
                            "left": {"kind": "var", "id": "n"},
                            "right": {"kind": "int", "value": 1},
                        },
                    },
                },
                "right": {"kind": "abs", "arg": expr},
            },
            "result": {"kind": "finite", "value": {"kind": "rat", "numerator": 1, "denominator": 2}},
        },
        "rule": "sequence_algebra",
        "premises": [],
        "parameters": {},
    }]
    result = search_proof(raw)
    rows = [row for row in result["suggestions"] if row["rule"] == "series_ratio_limit_test"]
    assert len(rows) == 1
    assert rows[0]["premises"] == ["ratio_limit", "h_nonzero"]


def test_public_protocol_runs_quotient_limit_ratio_test_with_reconstructed_nonzero_guard(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-limit-test-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of (1/2)^n is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "series_ratio_limit_test"
    assert verification["resolved_request"]["steps"][-1]["premises"] == []
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert "have hnonzero" in verification["lean_source"]
    assert "Filter.eventually_ge_atTop 0" in verification["lean_source"]


def test_ratio_limit_test_divergence_reconstructs_geometric_quotient_without_nonzero_evidence():
    raw = load("series_ratio_limit_geometric_divergent.json")
    pattern = match_series_ratio_limit_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.result_kind == "not_summable"
    assert pattern.limit == Fraction(2, 1)
    assert pattern.limit_premise_id is None
    assert pattern.automatic_ratio_base == Fraction(2, 1)
    assert pattern.nonzero_premise_id is None
    assert pattern.nonzero_mode is None
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "not_summable_of_ratio_test_tendsto_gt_one" in source
    assert "have hratio" in source
    assert "have hnonzero" not in source


def test_ratio_limit_test_divergence_accepts_exact_cited_limit_without_nonzero_premise():
    raw = load("series_ratio_limit_geometric_divergent.json")
    target = {
        "kind": "mul",
        "left": {
            "kind": "cast_real",
            "arg": {
                "kind": "add",
                "left": {"kind": "var", "id": "n"},
                "right": {"kind": "int", "value": 1},
            },
        },
        "right": {
            "kind": "pow_nat",
            "base": {"kind": "int", "value": 2},
            "exponent": {"kind": "var", "id": "n"},
        },
    }
    goal = deepcopy(raw["goal"])
    goal["expression"] = target
    ratio_claim = {
        "kind": "sequence_limit",
        "variable": "n",
        "expression": {
            "kind": "div",
            "left": {
                "kind": "abs",
                "arg": {
                    "kind": "mul",
                    "left": {
                        "kind": "cast_real",
                        "arg": {
                            "kind": "add",
                            "left": {"kind": "var", "id": "n"},
                            "right": {"kind": "int", "value": 2},
                        },
                    },
                    "right": {
                        "kind": "pow_nat",
                        "base": {"kind": "int", "value": 2},
                        "exponent": {
                            "kind": "add",
                            "left": {"kind": "var", "id": "n"},
                            "right": {"kind": "int", "value": 1},
                        },
                    },
                },
            },
            "right": {"kind": "abs", "arg": target},
        },
        "result": {"kind": "finite", "value": {"kind": "int", "value": 2}},
    }
    pattern = match_series_ratio_limit_test(goal, [("ratio_limit", ratio_claim)])
    assert pattern is not None
    assert pattern.result_kind == "not_summable"
    assert pattern.limit == 2
    assert pattern.limit_premise_id == "ratio_limit"
    assert pattern.automatic_ratio_base is None
    assert pattern.nonzero_premise_id is None


def test_ratio_limit_test_keeps_l_equal_one_inconclusive_and_refuses_false_divergence():
    for name in [
        "series_ratio_limit_boundary_one_inconclusive.json",
        "series_ratio_limit_lt_one_false_divergence.json",
    ]:
        raw = load(name)
        assert match_series_ratio_limit_test(raw["goal"], []) is None
        state = build_proof_state(raw)
        assert state.status == "needs_justification"
        assert any(item["code"] == "series_ratio_limit_test_evidence" for item in state.obligations)


def test_search_selects_ratio_limit_divergence_without_redundant_nonzero_premise():
    raw = load("series_ratio_limit_geometric_divergent.json")
    raw["steps"] = []
    result = search_proof(raw)
    rows = [row for row in result["suggestions"] if row["rule"] == "series_ratio_limit_test"]
    assert len(rows) == 1
    assert rows[0]["premises"] == []
    augmented, suggestion = build_auto_request(raw)
    assert suggestion is not None and suggestion.rule == "series_ratio_limit_test"
    assert suggestion.premises == []
    assert build_proof_state(augmented).status == "ready_for_kernel"


def test_public_protocol_runs_quotient_limit_ratio_divergence_without_certificate(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-limit-divergence-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of 2^n is not summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "series_ratio_limit_test"
    assert verification["resolved_request"]["steps"][-1]["premises"] == []
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None


def test_root_test_parser_routes_variable_real_exponent_to_rpow():
    expr = parse_expression_text("abs((1/2)^n)^(1 / real(n))", {"n"})
    assert expr["kind"] == "rpow"
    assert expr["base"]["kind"] == "abs"
    assert expr["exponent"]["kind"] == "div"
    assert expr["exponent"]["right"]["kind"] == "cast_real"


def test_root_test_reconstructs_exact_geometric_root_for_convergence():
    raw = load("series_root_geometric_summable.json")
    pattern = match_series_root_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.result_kind == "summable"
    assert pattern.limit == Fraction(1, 2)
    assert pattern.limit_premise_id is None
    assert pattern.automatic_root_base == Fraction(-1, 2)
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "Real.pow_rpow_inv_natCast" in source
    assert "Real.rpow_inv_natCast_pow" in source
    assert "Summable.of_norm_bounded_eventually_nat" in source
    assert "summable_geometric_of_lt_one" in source


def test_root_test_reconstructs_exact_geometric_root_for_divergence():
    raw = load("series_root_geometric_divergent.json")
    pattern = match_series_root_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.result_kind == "not_summable"
    assert pattern.limit == Fraction(2, 1)
    assert pattern.limit_premise_id is None
    assert pattern.automatic_root_base == Fraction(2, 1)
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "tendsto_atTop_zero.norm" in source
    assert "one_lt_pow₀" in source
    assert "Real.rpow_inv_natCast_pow" in source


def test_root_test_accepts_exact_cited_limit_for_non_geometric_target():
    raw = load("series_root_geometric_summable.json")
    target = {
        "kind": "mul",
        "left": {"kind": "cast_real", "arg": {"kind": "add", "left": {"kind": "var", "id": "n"}, "right": {"kind": "int", "value": 1}}},
        "right": {"kind": "pow_nat", "base": {"kind": "rat", "numerator": 1, "denominator": 2}, "exponent": {"kind": "var", "id": "n"}},
    }
    goal = deepcopy(raw["goal"])
    goal["expression"] = target
    root_claim = {
        "kind": "sequence_limit",
        "variable": "n",
        "expression": {
            "kind": "rpow",
            "base": {"kind": "abs", "arg": target},
            "exponent": {
                "kind": "div",
                "left": {"kind": "int", "value": 1},
                "right": {"kind": "cast_real", "arg": {"kind": "var", "id": "n"}},
            },
        },
        "result": {"kind": "finite", "value": {"kind": "rat", "numerator": 1, "denominator": 2}},
    }
    pattern = match_series_root_test(goal, [("root_limit", root_claim)])
    assert pattern is not None
    assert pattern.limit_premise_id == "root_limit"
    assert pattern.automatic_root_base is None


def test_root_test_keeps_l_equal_one_inconclusive_and_refuses_false_classifications():
    for name in [
        "series_root_boundary_one_inconclusive.json",
        "series_root_lt_one_false_divergence.json",
        "series_root_gt_one_false_convergence.json",
    ]:
        raw = load(name)
        assert match_series_root_test(raw["goal"], []) is None
        state = build_proof_state(raw)
        assert state.status == "needs_justification"
        assert any(item["code"] == "series_root_test_evidence" for item in state.obligations)


def test_search_selects_root_test_and_public_protocol_stays_uncertified(monkeypatch):
    raw = load("series_root_geometric_summable.json")
    raw["steps"] = []
    result = search_proof(raw)
    rows = [row for row in result["suggestions"] if row["rule"] == "series_root_test"]
    assert len(rows) == 1
    assert rows[0]["premises"] == []
    augmented, suggestion = build_auto_request(raw)
    assert suggestion is not None and suggestion.rule == "series_root_test"
    assert suggestion.premises == []
    assert build_proof_state(augmented).status == "ready_for_kernel"

    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "root-test-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of (1/2)^n is summable.",
        "allowed_rules": ["series_root_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "series_root_test"
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None


def test_root_test_auto_reconstructs_monomial_times_geometric_convergence():
    raw = load("series_root_monomial_geometric_summable.json")
    pattern = match_series_root_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.result_kind == "summable"
    assert pattern.limit == Fraction(1, 2)
    assert pattern.limit_premise_id is None
    assert pattern.automatic_root_base == Fraction(1, 2)
    assert pattern.automatic_root_coefficient == Fraction(3, 1)
    assert pattern.automatic_root_degree == 2
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "tendsto_inv_atTop_nhds_zero_nat" in source
    assert "tendsto_rpow_div_mul_add" in source
    assert "Real.rpow_natCast_mul" in source
    assert "Real.mul_rpow" in source


def test_root_test_auto_reconstructs_monomial_times_geometric_divergence():
    raw = load("series_root_monomial_geometric_divergent.json")
    pattern = match_series_root_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.result_kind == "not_summable"
    assert pattern.limit == Fraction(2, 1)
    assert pattern.automatic_root_coefficient == Fraction(1, 1)
    assert pattern.automatic_root_degree == 3
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "tendsto_rpow_div_mul_add" in source
    assert "tendsto_atTop_zero.norm" in source


def test_root_test_auto_reconstructs_general_polynomial_times_geometric_convergence():
    raw = load("series_root_polynomial_geometric_summable.json")
    pattern = match_series_root_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.result_kind == "summable"
    assert pattern.limit == Fraction(1, 2)
    assert pattern.limit_premise_id is None
    assert pattern.automatic_root_base == Fraction(-1, 2)
    assert pattern.automatic_root_coefficient == Fraction(1, 1)
    assert pattern.automatic_root_degree == 2
    assert pattern.automatic_root_polynomial_coefficients == (Fraction(1), Fraction(3), Fraction(1))
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq" in source
    assert "have hpolyRoot" in source
    assert "Real.mul_rpow" in source


def test_public_protocol_auto_reconstructs_polynomial_geometric_root_without_certificate(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "root-polynomial-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of (real(n)^2 + 3 * real(n) + 1) * (1/2)^n is summable.",
        "allowed_rules": ["series_root_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "series_root_test"
    assert verification["resolved_request"]["steps"][-1]["premises"] == []
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None


def test_root_test_auto_reconstructs_general_polynomial_times_geometric_divergence():
    raw = load("series_root_polynomial_geometric_divergent.json")
    pattern = match_series_root_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.result_kind == "not_summable"
    assert pattern.limit == Fraction(2, 1)
    assert pattern.automatic_root_degree == 3
    assert pattern.automatic_root_polynomial_coefficients == (Fraction(1), Fraction(1), Fraction(3), Fraction(1))
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq" in source
    assert "tendsto_atTop_zero.norm" in source


def test_root_test_polynomial_family_keeps_l_equal_one_inconclusive_and_nonpolynomials_outside_boundary():
    for name in [
        "series_root_monomial_boundary_one.json",
        "series_root_polynomial_boundary_one.json",
        "series_root_nonpolynomial_needs_limit.json",
    ]:
        raw = load(name)
        assert match_series_root_test(raw["goal"], []) is None
        state = build_proof_state(raw)
        assert state.status == "needs_justification"
        assert any(item["code"] == "series_root_test_evidence" for item in state.obligations)


def test_root_test_auto_reconstructs_polynomial_quotient_geometric_convergence():
    raw = load("series_root_polynomial_quotient_geometric_summable.json")
    pattern = match_series_root_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.result_kind == "summable"
    assert pattern.limit == Fraction(1, 2)
    assert pattern.limit_premise_id is None
    assert pattern.automatic_root_base == Fraction(1, 2)
    assert pattern.automatic_root_polynomial_coefficients == (Fraction(1), Fraction(0), Fraction(1))
    assert pattern.automatic_root_degree == 2
    assert pattern.automatic_root_denominator_polynomial_coefficients == (Fraction(1), Fraction(1))
    assert pattern.automatic_root_denominator_degree == 1
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "have hdenDefined" in source
    assert "rootPolyDen" in source
    assert "have hpolyRootDen" in source
    assert "have hquotRoot" in source
    assert "Real.div_rpow" in source
    assert "hpolyRoot.div hpolyRootDen" in source


def test_root_test_auto_reconstructs_polynomial_quotient_geometric_divergence():
    raw = load("series_root_polynomial_quotient_geometric_divergent.json")
    pattern = match_series_root_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.result_kind == "not_summable"
    assert pattern.limit == Fraction(2)
    assert pattern.automatic_root_polynomial_coefficients == (Fraction(1), Fraction(1))
    assert pattern.automatic_root_denominator_polynomial_coefficients == (Fraction(1), Fraction(0), Fraction(1))
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "hquotRootModel" in source
    assert "tendsto_atTop_zero.norm" in source


def test_root_test_reciprocal_polynomial_uses_constant_numerator_root():
    raw = load("series_root_reciprocal_polynomial_geometric_summable.json")
    pattern = match_series_root_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.automatic_root_polynomial_coefficients == (Fraction(1),)
    assert pattern.automatic_root_denominator_polynomial_coefficients == (Fraction(1), Fraction(1))
    source = render_request(normalize_request(raw))
    assert "have hconst :" in source
    assert "have hpolyRootDen" in source
    assert "have hquotRoot" in source


def test_public_protocol_auto_reconstructs_polynomial_quotient_geometric_root(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "root-polynomial-quotient-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n is summable.",
        "allowed_rules": ["series_root_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "series_root_test"
    assert verification["resolved_request"]["steps"][-1]["premises"] == []
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert "hquotRoot" in verification["lean_source"]


def test_root_test_polynomial_quotient_keeps_l_equal_one_and_nonpolynomial_denominator_inconclusive():
    for name in [
        "series_root_polynomial_quotient_boundary_one.json",
        "series_root_nonpolynomial_quotient_needs_limit.json",
    ]:
        raw = load(name)
        assert match_series_root_test(raw["goal"], []) is None
        state = build_proof_state(raw)
        assert state.status == "needs_justification"
        assert any(item["code"] == "series_root_test_evidence" for item in state.obligations)


def test_root_test_polynomial_quotient_auto_proves_eventual_affine_denominator_guard():
    raw = load("series_root_polynomial_quotient_domain_guard_needed.json")
    pattern = match_series_root_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 2)
    assert pattern.automatic_root_denominator_positive_on_nat is False
    assert pattern.automatic_root_school_denominator_nonzero_on_nat is False
    assert pattern.automatic_root_school_denominator_eventual_nonzero_from == 2
    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    assert not any(item["code"] == "denominator_nonzero" for item in state.obligations)
    source = render_request(normalize_request(raw))
    assert "have hschoolDenEventuallyDefined" in source
    assert "Filter.eventually_ge_atTop 2" in source
    assert "have hnreal : (2 : ℝ) ≤ (n : ℝ)" in source
    assert "nlinarith" in source


def test_root_test_eventual_affine_guard_handles_exact_rational_slope_and_offset():
    raw = load("series_root_polynomial_quotient_domain_guard_needed.json")
    nreal = {"kind": "cast_real", "arg": {"kind": "var", "id": "n"}}
    denominator = {
        "kind": "sub",
        "left": {"kind": "mul", "left": {"kind": "rat", "numerator": 3, "denominator": 2}, "right": nreal},
        "right": {"kind": "rat", "numerator": 7, "denominator": 3},
    }
    raw["goal"]["expression"]["right"] = denominator
    raw["steps"][0]["claim"] = deepcopy(raw["goal"])
    pattern = match_series_root_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.automatic_root_school_denominator_eventual_nonzero_from == 2
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "Filter.eventually_ge_atTop 2" in source
    assert "nlinarith" in source


def test_root_test_auto_proves_higher_degree_eventual_polynomial_denominator_guard():
    raw = load("series_root_polynomial_quotient_domain_guard_needed.json")
    nreal = {"kind": "cast_real", "arg": {"kind": "var", "id": "n"}}
    raw["goal"]["expression"]["right"] = {
        "kind": "sub",
        "left": {"kind": "pow", "base": nreal, "exponent": 2},
        "right": {"kind": "int", "value": 1},
    }
    raw["steps"][0]["claim"] = deepcopy(raw["goal"])
    pattern = match_series_root_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.automatic_root_school_denominator_eventual_nonzero_from == 2
    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    assert not any(item["code"] == "denominator_nonzero" for item in state.obligations)
    source = render_request(normalize_request(raw))
    assert "Filter.eventually_ge_atTop 2" in source
    assert "have hshiftNonneg" in source
    assert "have hshiftPositive" in source
    assert "have hshiftIdentity" in source
    assert ":= by ring" in source
    assert "positivity" in source


def test_root_test_eventual_polynomial_guard_handles_cubic_with_several_early_roots():
    raw = load("series_root_polynomial_quotient_domain_guard_needed.json")
    nreal = {"kind": "cast_real", "arg": {"kind": "var", "id": "n"}}
    n2 = {"kind": "pow", "base": nreal, "exponent": 2}
    n3 = {"kind": "pow", "base": nreal, "exponent": 3}
    denominator = {
        "kind": "sub",
        "left": {
            "kind": "add",
            "left": {
                "kind": "sub",
                "left": n3,
                "right": {"kind": "mul", "left": {"kind": "int", "value": 6}, "right": n2},
            },
            "right": {"kind": "mul", "left": {"kind": "int", "value": 11}, "right": nreal},
        },
        "right": {"kind": "int", "value": 6},
    }
    raw["goal"]["expression"]["right"] = denominator
    raw["steps"][0]["claim"] = deepcopy(raw["goal"])
    pattern = match_series_root_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.automatic_root_school_denominator_eventual_nonzero_from == 4
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "Filter.eventually_ge_atTop 4" in source
    assert "((6 : ℝ)" in source
    assert "^ 3" in source
    assert "hshiftIdentity" in source


def test_root_test_eventual_polynomial_guard_handles_negative_leading_coefficient():
    raw = load("series_root_polynomial_quotient_domain_guard_needed.json")
    nreal = {"kind": "cast_real", "arg": {"kind": "var", "id": "n"}}
    raw["goal"]["expression"]["right"] = {
        "kind": "sub",
        "left": {"kind": "int", "value": 1},
        "right": {"kind": "pow", "base": nreal, "exponent": 2},
    }
    raw["steps"][0]["claim"] = deepcopy(raw["goal"])
    pattern = match_series_root_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.automatic_root_school_denominator_eventual_nonzero_from == 2
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "have hshiftIdentity : (-" in source
    assert "hshiftPositive" in source


def test_root_test_eventual_polynomial_guard_handles_exact_rational_quadratic():
    raw = load("series_root_polynomial_quotient_domain_guard_needed.json")
    nreal = {"kind": "cast_real", "arg": {"kind": "var", "id": "n"}}
    denominator = {
        "kind": "add",
        "left": {
            "kind": "sub",
            "left": {
                "kind": "mul",
                "left": {"kind": "rat", "numerator": 1, "denominator": 2},
                "right": {"kind": "pow", "base": nreal, "exponent": 2},
            },
            "right": {
                "kind": "mul",
                "left": {"kind": "rat", "numerator": 7, "denominator": 3},
                "right": nreal,
            },
        },
        "right": {"kind": "int", "value": 1},
    }
    raw["goal"]["expression"]["right"] = denominator
    raw["steps"][0]["claim"] = deepcopy(raw["goal"])
    pattern = match_series_root_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.automatic_root_school_denominator_eventual_nonzero_from == 5
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "Filter.eventually_ge_atTop 5" in source
    assert "(11 : ℝ) / (6 : ℝ)" in source
    assert "(8 : ℝ) / (3 : ℝ)" in source


def test_root_test_does_not_treat_recurring_zero_denominator_as_eventually_nonzero():
    raw = load("series_root_polynomial_quotient_domain_guard_needed.json")
    raw["goal"]["expression"]["right"] = {
        "kind": "add",
        "left": {"kind": "int", "value": 1},
        "right": {
            "kind": "pow_nat",
            "base": {"kind": "neg", "arg": {"kind": "int", "value": 1}},
            "exponent": {"kind": "var", "id": "n"},
        },
    }
    raw["steps"][0]["claim"] = deepcopy(raw["goal"])
    assert match_series_root_test(raw["goal"], []) is None
    state = build_proof_state(raw)
    assert state.status == "needs_justification"
    assert any(item["code"] == "denominator_nonzero" for item in state.obligations)


def test_root_test_normalizes_product_of_exact_geometric_factors():
    raw = load("series_root_geometric_product_summable.json")
    pattern = match_series_root_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.result_kind == "summable"
    assert pattern.limit == Fraction(1, 6)
    assert pattern.automatic_root_base == Fraction(1, 6)
    assert pattern.automatic_root_polynomial_coefficients == (Fraction(1),)
    assert pattern.automatic_root_denominator_polynomial_coefficients == (Fraction(1),)
    assert pattern.automatic_root_geometric_expression is not None
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "have hgeomAbs" in source
    assert "← mul_pow" in source
    assert "have htermFactor" in source


def test_root_test_normalizes_product_of_exact_geometric_factors_for_divergence():
    raw = load("series_root_geometric_product_divergent.json")
    pattern = match_series_root_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.result_kind == "not_summable"
    assert pattern.limit == Fraction(3)
    assert pattern.automatic_root_base == Fraction(3)
    assert build_proof_state(raw).status == "ready_for_kernel"


def test_root_test_normalizes_geometric_factor_from_denominator_without_dropping_school_domain():
    raw = load("series_root_polynomial_quotient_denominator_geometric_summable.json")
    pattern = match_series_root_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 2)
    assert pattern.automatic_root_base == Fraction(1, 2)
    assert pattern.automatic_root_polynomial_coefficients == (Fraction(1), Fraction(0), Fraction(1))
    assert pattern.automatic_root_denominator_polynomial_coefficients == (Fraction(1), Fraction(1))
    assert pattern.automatic_root_school_denominator_positive_on_nat is True
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "have hschoolDenDefined" in source
    assert "have hgeomAbs" in source
    assert "1 / (2 ^ n)" in source
    assert "← div_pow" in source


def test_root_test_normalized_geometric_product_keeps_l_equal_one_inconclusive():
    raw = load("series_root_geometric_product_boundary_one.json")
    assert match_series_root_test(raw["goal"], []) is None
    state = build_proof_state(raw)
    assert state.status == "needs_justification"
    assert any(item["code"] == "series_root_test_evidence" for item in state.obligations)


def test_root_test_refuses_zero_geometric_denominator_instead_of_normalizing_total_division():
    raw = load("series_root_zero_geometric_denominator_needs_domain.json")
    assert match_series_root_test(raw["goal"], []) is None
    state = build_proof_state(raw)
    assert state.status == "needs_justification"
    assert any(item["code"] == "denominator_nonzero" for item in state.obligations)


def test_public_protocol_normalizes_multiple_geometric_factors_without_certificate(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "root-geometric-product-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of (1/2)^n * (1/3)^n is summable.",
        "allowed_rules": ["series_root_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "series_root_test"
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert "hgeomAbs" in verification["lean_source"]


def test_public_protocol_normalizes_geometric_denominator_without_certificate(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "root-geometric-denominator-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of (real(n)^2 + 1) / ((real(n) + 1) * 2^n) is summable.",
        "allowed_rules": ["series_root_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "series_root_test"
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert "hschoolDenDefined" in verification["lean_source"]


def test_root_test_auto_proves_exact_negative_geometric_denominator_nonzero():
    raw = load("series_root_polynomial_quotient_denominator_geometric_summable.json")
    expr = raw["goal"]["expression"]
    geom = expr["right"]["right"]
    geom["base"] = {"kind": "neg", "arg": {"kind": "int", "value": 2}}
    raw["steps"][0]["claim"] = deepcopy(raw["goal"])
    pattern = match_series_root_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 2)
    assert pattern.automatic_root_base == Fraction(-1, 2)
    assert pattern.automatic_root_school_denominator_positive_on_nat is False
    assert pattern.automatic_root_school_denominator_nonzero_on_nat is True
    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "have hschoolDenDefined" in source
    assert "≠ 0 := by" in source
    assert "pow_ne_zero n (by norm_num)" in source
    assert "mul_ne_zero" in source


def test_public_protocol_auto_proves_negative_geometric_denominator_nonzero(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "root-negative-geometric-denominator-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of (real(n)^2 + 1) / ((real(n) + 1) * (-2)^n) is summable.",
        "allowed_rules": ["series_root_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["obligations"] == []
    assert verification["certificate"] is None
    assert "pow_ne_zero n (by norm_num)" in verification["lean_source"]
    assert "hschoolDenDefined" in verification["lean_source"]


def test_public_protocol_auto_proves_eventual_affine_denominator_guard(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "root-eventual-affine-denominator-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of ((real(n)^2 + 1) * (1/2)^n) / (real(n) - 1) is summable.",
        "allowed_rules": ["series_root_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["obligations"] == []
    assert verification["certificate"] is None
    assert "hschoolDenEventuallyDefined" in verification["lean_source"]
    assert "Filter.eventually_ge_atTop 2" in verification["lean_source"]


def test_public_protocol_auto_proves_eventual_quadratic_denominator_guard(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "root-eventual-quadratic-denominator-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of ((real(n)^2 + 1) * (1/2)^n) / (real(n)^2 - 1) is summable.",
        "allowed_rules": ["series_root_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["obligations"] == []
    assert verification["certificate"] is None
    assert "hschoolDenEventuallyDefined" in verification["lean_source"]
    assert "Filter.eventually_ge_atTop 2" in verification["lean_source"]
    assert "hshiftIdentity" in verification["lean_source"]
    assert ":= by ring" in verification["lean_source"]


def test_root_test_auto_proves_negative_rational_geometric_denominator_nonzero():
    raw = load("series_root_polynomial_quotient_denominator_geometric_summable.json")
    geom = raw["goal"]["expression"]["right"]["right"]
    geom["base"] = {"kind": "rat", "numerator": -3, "denominator": 2}
    raw["steps"][0]["claim"] = deepcopy(raw["goal"])
    pattern = match_series_root_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.limit == Fraction(2, 3)
    assert pattern.automatic_root_base == Fraction(-2, 3)
    assert pattern.automatic_root_school_denominator_nonzero_on_nat is True
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "pow_ne_zero n (by norm_num)" in source


def test_root_test_composes_eventual_affine_guard_with_negative_geometric_factor():
    raw = load("series_root_polynomial_quotient_domain_guard_needed.json")
    expression = raw["goal"]["expression"]
    geometric = expression["left"]["right"]
    geometric["base"] = {"kind": "neg", "arg": {"kind": "int", "value": 2}}
    denominator = expression["right"]
    expression["right"] = {"kind": "mul", "left": denominator, "right": {
        "kind": "pow_nat",
        "base": {"kind": "neg", "arg": {"kind": "int", "value": 3}},
        "exponent": {"kind": "var", "id": "n"},
    }}
    raw["steps"][0]["claim"] = deepcopy(raw["goal"])
    pattern = match_series_root_test(raw["goal"], [])
    assert pattern is not None
    assert pattern.limit == Fraction(2, 3)
    assert pattern.automatic_root_school_denominator_nonzero_on_nat is False
    assert pattern.automatic_root_school_denominator_eventual_nonzero_from == 2
    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "have hschoolDenEventuallyDefined" in source
    assert "Filter.eventually_ge_atTop 2" in source
    assert "mul_ne_zero" in source
    assert "pow_ne_zero n (by norm_num)" in source


def test_ratio_limit_test_reconstructs_polynomial_geometric_quotient_limit_without_premises():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (real(n)^2 - 1) * (1/2)^n is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 2)
    assert pattern.limit_premise_id is None
    assert pattern.automatic_ratio_base == Fraction(1, 2)
    assert pattern.automatic_ratio_polynomial is not None
    assert pattern.automatic_ratio_polynomial_coefficients == (Fraction(-1), Fraction(0), Fraction(1))
    assert pattern.automatic_ratio_polynomial_degree == 2
    assert pattern.automatic_ratio_polynomial_nonzero_from == 2
    assert pattern.automatic_nonzero_from == 2

    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq ratioNextPoly ratioPoly" in source
    assert "have hpolyAbs" in source
    assert "[abs_div]" in source
    assert "Filter.eventually_ge_atTop 2" in source
    assert "summable_of_ratio_test_tendsto_lt_one" in source


def test_ratio_limit_test_reconstructs_polynomial_geometric_divergence_quotient_limit():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (real(n)^3 + 1) * 2^n is not summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 2
    assert pattern.limit_premise_id is None
    assert pattern.automatic_ratio_polynomial_degree == 3
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "have hpolyRaw" in source
    assert "have hratioDegreesEq" in source
    assert "not_summable_of_ratio_test_tendsto_gt_one" in source


def test_ratio_limit_polynomial_geometric_keeps_l_equal_one_inconclusive():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (real(n)^2 + 1) * (-1)^n is summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(goal, []) is None


def test_ratio_limit_polynomial_geometric_does_not_expand_to_nonpolynomial_prefactors():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of sqrt(real(n) + 1) * (1/2)^n is summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(goal, []) is None


def test_public_protocol_reconstructs_polynomial_geometric_ratio_limit(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-polynomial-geometric-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of (real(n)^2 - 1) * (1/2)^n is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    final_step = verification["resolved_request"]["steps"][-1]
    assert final_step["rule"] == "series_ratio_limit_test"
    assert final_step["premises"] == []
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert "Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq ratioNextPoly ratioPoly" in verification["lean_source"]
    assert "Filter.eventually_ge_atTop 2" in verification["lean_source"]


def test_ratio_limit_polynomial_geometric_accepts_reversed_negative_base_product():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (-1/2)^n * (real(n)^2 + 1) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 2)
    assert pattern.automatic_ratio_base == Fraction(-1, 2)
    assert pattern.automatic_ratio_polynomial_degree == 2
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "have hgeomAbs" in source
    assert "by norm_num" in source


def test_ratio_limit_normalizes_multiple_exact_geometric_factors():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (real(n)^2 + 1) * (1/2)^n * (1/3)^n is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 6)
    assert pattern.automatic_ratio_base == Fraction(1, 6)
    assert pattern.automatic_ratio_polynomial_degree == 2
    assert pattern.automatic_ratio_geometric_expression is not None
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "have hgeomAbs" in source
    assert "← mul_pow" in source
    assert "summable_of_ratio_test_tendsto_lt_one" in source


def test_ratio_limit_normalizes_signed_geometric_product_before_abs():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (1/2)^n * (real(n)^2 + 1) * (-1/3)^n is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.automatic_ratio_base == Fraction(-1, 6)
    assert pattern.limit == Fraction(1, 6)
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "norm_num [abs_mul, abs_div, abs_pow, ← mul_pow, ← div_pow]" in source


def test_ratio_limit_normalizes_exact_geometric_denominator_without_polynomial_quotient():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (real(n)^2 + 1) / 2^n is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.automatic_ratio_base == Fraction(1, 2)
    assert pattern.limit == Fraction(1, 2)
    assert pattern.automatic_ratio_polynomial_degree == 2
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "have hgeomAbs" in source
    assert "← div_pow" in source


def test_ratio_limit_multiple_geometric_factors_keeps_combined_l_equal_one_inconclusive():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (real(n)^2 + 1) * 2^n * (1/2)^n is summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(goal, []) is None


def test_ratio_limit_multiple_geometric_factors_rejects_zero_base():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (real(n)^2 + 1) * 0^n * (1/2)^n is summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(goal, []) is None


def test_public_protocol_reconstructs_normalized_multi_geometric_ratio_limit(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-multi-geometric-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of (real(n)^2 + 1) * (1/2)^n * (1/3)^n is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    final_step = verification["resolved_request"]["steps"][-1]
    assert final_step["rule"] == "series_ratio_limit_test"
    assert final_step["premises"] == []
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert "have hgeomAbs" in verification["lean_source"]
    assert "((1 : ℝ) / (6 : ℝ))" in verification["lean_source"]


def test_ratio_limit_reconstructs_polynomial_quotient_geometric_limit():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 2)
    assert pattern.automatic_ratio_polynomial_coefficients == (Fraction(1), Fraction(0), Fraction(1))
    assert pattern.automatic_ratio_denominator_polynomial_coefficients == (Fraction(1), Fraction(1))
    assert pattern.automatic_ratio_denominator_polynomial_degree == 1
    assert pattern.automatic_ratio_denominator_polynomial_nonzero_from == 0
    assert pattern.automatic_nonzero_from == 0
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "ratioDenPoly" in source
    assert "ratioDenNextPoly" in source
    assert "have hdenRaw" in source
    assert "have hpolyQuotientModel" in source
    assert "have hdenAt" in source
    assert "summable_of_ratio_test_tendsto_lt_one" in source


def test_ratio_limit_polynomial_quotient_reuses_eventual_denominator_certificate():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((real(n)^2 + 1) / (real(n) - 1)) * (1/2)^n is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 2)
    assert pattern.automatic_ratio_denominator_polynomial_nonzero_from == 2
    assert pattern.automatic_nonzero_from == 2
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "Filter.eventually_ge_atTop 2" in source
    assert "have hdenAt : ∀ m : ℕ, 2 ≤ m" in source
    assert "have hdenNext0" in source
    assert "hshiftIdentity" in source


def test_ratio_limit_polynomial_quotient_reconstructs_divergence():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((real(n)^3 + 1) / (real(n)^2 + 1)) * 2^n is not summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 2
    assert pattern.automatic_ratio_denominator_polynomial_degree == 2
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq ratioDenPoly ratioDenNextPoly" in source
    assert "not_summable_of_ratio_test_tendsto_gt_one" in source


def test_ratio_limit_polynomial_quotient_keeps_l_equal_one_inconclusive():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((real(n)^2 + 1) / (real(n) + 1)) * (-1)^n is summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(goal, []) is None


def test_ratio_limit_polynomial_quotient_does_not_absorb_nonpolynomial_denominator():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((real(n)^2 + 1) / sqrt(real(n) + 1)) * (1/2)^n is summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(goal, []) is None


def test_public_protocol_reconstructs_polynomial_quotient_ratio_limit(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-polynomial-quotient-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    final_step = verification["resolved_request"]["steps"][-1]
    assert final_step["rule"] == "series_ratio_limit_test"
    assert final_step["premises"] == []
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert "ratioDenPoly" in verification["lean_source"]
    assert "have hpolyQuotientModel" in verification["lean_source"]


def test_ratio_limit_polynomial_quotient_composes_with_multi_geometric_normalization():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n * (1/3)^n is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 6)
    assert pattern.automatic_ratio_base == Fraction(1, 6)
    assert pattern.automatic_ratio_denominator_polynomial_degree == 1
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "have hpolyQuotientModel" in source
    assert "norm_num [abs_mul, abs_div, abs_pow, ← mul_pow, ← div_pow]" in source


def test_ratio_limit_shifted_power_accepts_implicit_nat_index_coercion():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (n + 1)^3 * (1/2)^n is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 2)
    assert pattern.automatic_ratio_polynomial_coefficients == (
        Fraction(1), Fraction(3), Fraction(3), Fraction(1)
    )
    assert pattern.automatic_ratio_polynomial_degree == 3
    assert pattern.automatic_ratio_polynomial_nonzero_from == 0

    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq ratioNextPoly ratioPoly" in source
    assert "((n + 1) ^ 3" in source
    assert ": ℝ" in source


def test_ratio_limit_shifted_rational_power_quotient_accepts_plain_n_syntax():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((n + 1/2)^2 / (n + 3/2)^3) * (1/3)^n is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 3)
    assert pattern.automatic_ratio_polynomial_coefficients == (
        Fraction(1, 4), Fraction(1), Fraction(1)
    )
    assert pattern.automatic_ratio_denominator_polynomial_coefficients == (
        Fraction(27, 8), Fraction(27, 4), Fraction(9, 2), Fraction(1)
    )
    assert pattern.automatic_ratio_denominator_polynomial_nonzero_from == 0

    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "ratioDenPoly" in source
    assert "have hpolyQuotientModel" in source
    assert "have hshiftIdentity : (((n + (1 / 2 : ℝ))) : ℝ)" in source


def test_ratio_limit_shifted_rational_power_divergence_tracks_eventual_numerator_zero():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((n - 1/2)^2 / (n + 5/2)^2) * 2^n is not summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 2
    assert pattern.automatic_ratio_polynomial_coefficients == (
        Fraction(1, 4), Fraction(-1), Fraction(1)
    )
    assert pattern.automatic_ratio_polynomial_nonzero_from == 1
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "Filter.eventually_ge_atTop 1" in source
    assert "not_summable_of_ratio_test_tendsto_gt_one" in source


def test_public_protocol_accepts_shifted_rational_powers_without_real_wrapper(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-shifted-power-implicit-coercion",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of ((n + 1/2)^2 / (n + 3/2)^3) * (1/3)^n is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert verification["resolved_request"]["steps"][-1]["rule"] == "series_ratio_limit_test"
    assert verification["resolved_request"]["steps"][-1]["premises"] == []
    assert "ratioDenPoly" in verification["lean_source"]


def test_integer_only_shifted_quotient_remains_explicitly_ambiguous():
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-shifted-integer-quotient-ambiguous",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of ((n + 1)^3 / (n + 2)^2) * (1/2)^n is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert not response["ok"]
    assert response["error"]["code"] == "ambiguous_input"
    assert "division over only natural/integer operands is ambiguous" in response["error"]["message"]


def test_root_test_shifted_power_accepts_implicit_nat_index_coercion():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (n + 1)^3 * (1/2)^n is summable.",
        {"n"},
    )
    pattern = match_series_root_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 2)
    assert pattern.automatic_root_polynomial_coefficients == (
        Fraction(1), Fraction(3), Fraction(3), Fraction(1)
    )
    assert pattern.automatic_root_denominator_polynomial_coefficients == (Fraction(1),)


def test_root_test_shifted_rational_power_quotient_accepts_plain_n_syntax(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "root-shifted-power-implicit-coercion",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of ((n + 1/2)^2 / (n + 3/2)^3) * (1/3)^n is summable.",
        "allowed_rules": ["series_root_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    final_step = verification["resolved_request"]["steps"][-1]
    assert final_step["rule"] == "series_root_test"
    assert final_step["premises"] == []
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert "let rootPoly" in verification["lean_source"]
    assert "let rootPolyDen" in verification["lean_source"]
    assert "have hquotRoot" in verification["lean_source"]
    assert "(((n + (1 / 2 : ℝ)) ^ 2) : ℝ)" in verification["lean_source"]


def test_root_test_shifted_rational_power_divergence_accepts_plain_n_syntax():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((n - 1/2)^2 / (n + 5/2)^2) * 2^n is not summable.",
        {"n"},
    )
    pattern = match_series_root_test(goal, [])
    assert pattern is not None
    assert pattern.result_kind == "not_summable"
    assert pattern.limit == Fraction(2)
    assert pattern.automatic_root_polynomial_coefficients == (
        Fraction(1, 4), Fraction(-1), Fraction(1)
    )
    assert pattern.automatic_root_denominator_polynomial_coefficients == (
        Fraction(25, 4), Fraction(5), Fraction(1)
    )


def test_root_test_shifted_power_keeps_l_equal_one_inconclusive():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (n + 1)^2 * (-1)^n is summable.",
        {"n"},
    )
    assert match_series_root_test(goal, []) is None


def test_root_test_integer_only_shifted_quotient_remains_explicitly_ambiguous():
    response = handle_message({
        "op": "prove_text",
        "request_id": "root-shifted-integer-quotient-ambiguous",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of ((n + 1)^3 / (n + 2)^2) * (1/2)^n is summable.",
        "allowed_rules": ["series_root_test"],
    })
    assert not response["ok"]
    assert response["error"]["code"] == "ambiguous_input"
    assert "division over only natural/integer operands is ambiguous" in response["error"]["message"]



def test_ratio_limit_factorial_geometric_reconstructs_zero_without_stirling():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (1/2)^n / factorial(n) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 0
    assert pattern.automatic_ratio_base == Fraction(1, 2)
    assert pattern.automatic_ratio_factorial
    assert pattern.automatic_nonzero_from == 0

    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "Nat.factorial_succ" in source
    assert "Nat.factorial_ne_zero" in source
    assert "tendsto_const_nhds.div_atTop hden" in source
    assert "summable_of_ratio_test_tendsto_lt_one" in source
    assert "Stirling" not in source


def test_ratio_limit_factorial_geometric_accepts_nonzero_scale_and_negative_base():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of 3 * (-1/2)^n / factorial(n) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 0
    assert pattern.automatic_ratio_base == Fraction(-1, 2)
    assert pattern.automatic_ratio_factorial
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "(-1 : ℝ) / (2 : ℝ)" in source
    assert "Nat.factorial_succ" in source


def test_ratio_limit_shifted_factorial_geometric_reconstructs_zero_without_stirling():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (1/2)^n / factorial(n + 1) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 0
    assert pattern.automatic_ratio_base == Fraction(1, 2)
    assert pattern.automatic_ratio_factorial
    assert pattern.automatic_ratio_factorial_shift == 1

    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "(n : ℝ) + 2" in source
    assert "Nat.factorial_succ" in source
    assert "hargNext" in source
    assert "Stirling" not in source


def test_ratio_limit_shifted_factorial_accepts_commuted_shift_and_scale():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of 3 * (-1/2)^n / factorial(4 + n) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.automatic_ratio_base == Fraction(-1, 2)
    assert pattern.automatic_ratio_factorial_shift == 4
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "(n : ℝ) + 5" in source
    assert "(4 + n) = (n + 4)" in source
    assert "Nat.factorial_succ" in source


def test_ratio_limit_factorial_bite_stays_narrow_to_constant_shift_denominators():
    factorial_numerator = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n) * (1/2)^n is summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(factorial_numerator, []) is None

    doubled_index = parse_goal_text(
        "The series from n = 0 to infinity of (1/2)^n / factorial(2 * n) is summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(doubled_index, []) is None


def test_public_protocol_reconstructs_factorial_geometric_ratio_limit(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-factorial-geometric-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of (1/2)^n / factorial(n) is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    final_step = verification["resolved_request"]["steps"][-1]
    assert final_step["rule"] == "series_ratio_limit_test"
    assert final_step["premises"] == []
    assert "Nat.factorial_succ" in verification["lean_source"]
    assert "(𝓝 ((0 : ℝ) : ℝ))" in verification["lean_source"]


def test_factorial_expression_round_trips_in_series_text():
    text = "The series from n = 0 to infinity of (1/2)^n / factorial(n) is summable."
    goal = parse_goal_text(text, {"n"})
    assert goal["expression"]["right"] == {"kind": "factorial", "arg": {"kind": "var", "id": "n"}}
    assert render_goal_text(goal) == text


def test_shifted_factorial_expression_round_trips_in_series_text():
    text = "The series from n = 0 to infinity of (1/2)^n / factorial(n + 3) is summable."
    goal = parse_goal_text(text, {"n"})
    assert goal["expression"]["right"] == {
        "kind": "factorial",
        "arg": {
            "kind": "add",
            "left": {"kind": "var", "id": "n"},
            "right": {"kind": "int", "value": 3},
        },
    }
    assert render_goal_text(goal) == text


def test_public_protocol_reconstructs_shifted_factorial_geometric_ratio_limit(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-shifted-factorial-geometric-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of (1/3)^n / factorial(n + 2) is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    final_step = verification["resolved_request"]["steps"][-1]
    assert final_step["rule"] == "series_ratio_limit_test"
    assert final_step["premises"] == []
    assert "(n : ℝ) + 3" in verification["lean_source"]
    assert "Nat.factorial_succ" in verification["lean_source"]


def test_ratio_limit_polynomial_geometric_shifted_factorial_reconstructs_zero():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (n^2 + 1) * (1/2)^n / factorial(n + 2) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 0
    assert pattern.automatic_ratio_factorial
    assert pattern.automatic_ratio_factorial_shift == 2
    assert pattern.automatic_ratio_base == Fraction(1, 2)
    assert pattern.automatic_ratio_polynomial_degree == 2
    assert pattern.automatic_ratio_polynomial_nonzero_from == 0
    assert pattern.automatic_nonzero_from == 0

    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "ratioFactPoly" in source
    assert "Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq ratioFactNextPoly ratioFactPoly" in source
    assert "have hfactor" in source
    assert "Nat.factorial_succ" in source
    assert "summable_of_ratio_test_tendsto_lt_one" in source
    assert "Stirling" not in source


def test_ratio_limit_polynomial_factorial_reuses_eventual_nonzero_tail():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (n - 1) * (1/3)^n / factorial(n) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 0
    assert pattern.automatic_ratio_polynomial_degree == 1
    assert pattern.automatic_ratio_polynomial_nonzero_from == 2
    assert pattern.automatic_nonzero_from == 2
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "Filter.eventually_ge_atTop 2" in source
    assert "hshiftIdentity" in source
    assert "Nat.factorial_ne_zero" in source


def test_ratio_limit_polynomial_quotient_factorial_reconstructs_zero():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n / factorial(n + 2) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 0
    assert pattern.automatic_ratio_factorial
    assert pattern.automatic_ratio_factorial_shift == 2
    assert pattern.automatic_ratio_base == Fraction(1, 2)
    assert pattern.automatic_ratio_polynomial_degree == 2
    assert pattern.automatic_ratio_denominator_polynomial_degree == 1
    assert pattern.automatic_nonzero_from == 0

    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "ratioFactDenPoly" in source
    assert "ratioFactDenNextPoly" in source
    assert "have hpolyQuotientModel" in source
    assert "have hdenAt" in source
    assert "Nat.factorial_succ" in source
    assert "summable_of_ratio_test_tendsto_lt_one" in source
    assert "Stirling" not in source


def test_ratio_limit_polynomial_quotient_factorial_reuses_both_eventual_tails():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((real(n) - 2) / (real(n) - 1)) * (1/3)^n / factorial(n) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 0
    assert pattern.automatic_ratio_polynomial_nonzero_from == 3
    assert pattern.automatic_ratio_denominator_polynomial_nonzero_from == 2
    assert pattern.automatic_nonzero_from == 3

    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "Filter.eventually_ge_atTop 3" in source
    assert "have hnDenNext" in source
    assert "have hdenNext0" in source
    assert "hdenAt (n + 1) hnDenNext" in source
    assert "hshiftIdentity" in source


def test_ratio_limit_polynomial_quotient_factorial_allows_constant_numerator():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (1 / (real(n)^2 + 1)) * (1/2)^n / factorial(n) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.automatic_ratio_polynomial_degree == 0
    assert pattern.automatic_ratio_denominator_polynomial_degree == 2
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "ratioFactDenPoly" in source
    assert "|(1 : ℝ)| / |(1 : ℝ)|" in source


def test_ratio_limit_polynomial_factorial_bite_stays_narrow():
    nonpolynomial_quotient = parse_goal_text(
        "The series from n = 0 to infinity of ((real(n)^2 + 1) / sqrt(real(n) + 1)) * (1/2)^n / factorial(n) is summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(nonpolynomial_quotient, []) is None

    factorial_numerator = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n) * (n + 1) * (1/2)^n is summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(factorial_numerator, []) is None


def test_ratio_limit_factorial_normalizes_multiple_geometric_factors():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (n + 1) * (1/2)^n * (1/3)^n / factorial(n) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 0
    assert pattern.automatic_ratio_factorial
    assert pattern.automatic_ratio_base == Fraction(1, 6)
    assert pattern.automatic_ratio_geometric_expression["kind"] == "mul"
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "have hgeomAbs" in source
    assert "abs_mul" in source
    assert "← mul_pow" in source
    assert "Nat.factorial_succ" in source


def test_ratio_limit_factorial_normalizes_geometric_denominator_even_when_combined_base_gt_one():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (1/2)^n / (1/3)^n / factorial(n + 1) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 0
    assert pattern.automatic_ratio_base == Fraction(3, 2)
    assert pattern.automatic_ratio_polynomial_degree == 0
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "abs_div" in source
    assert "← div_pow" in source
    assert "have hgeomRatio" in source


def test_ratio_limit_polynomial_quotient_factorial_composes_geometric_normalization():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n * (1/3)^n / factorial(n + 2) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.automatic_ratio_base == Fraction(1, 6)
    assert pattern.automatic_ratio_denominator_polynomial_degree == 1
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "ratioFactDenPoly" in source
    assert "have hpolyQuotientModel" in source
    assert "have hgeomAbs" in source
    assert "have hgeomRatio" in source


def test_ratio_limit_factorial_geometric_normalization_rejects_zero_base():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (n + 1) * 0^n * (1/2)^n / factorial(n) is summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(goal, []) is None


def test_public_protocol_reconstructs_normalized_geometric_factorial_ratio_limit(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-factorial-geometric-normalization-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n * (1/3)^n / factorial(n + 2) is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    final_step = verification["resolved_request"]["steps"][-1]
    assert final_step["rule"] == "series_ratio_limit_test"
    assert final_step["premises"] == []
    assert "have hgeomAbs" in verification["lean_source"]
    assert "have hgeomRatio" in verification["lean_source"]
    assert "Nat.factorial_succ" in verification["lean_source"]


def test_public_protocol_reconstructs_polynomial_quotient_shifted_factorial_ratio_limit(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-polynomial-quotient-shifted-factorial-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n / factorial(n + 2) is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    final_step = verification["resolved_request"]["steps"][-1]
    assert final_step["rule"] == "series_ratio_limit_test"
    assert final_step["premises"] == []
    assert "ratioFactDenPoly" in verification["lean_source"]
    assert "have hpolyQuotientModel" in verification["lean_source"]
    assert "Nat.factorial_succ" in verification["lean_source"]
    assert "(𝓝 ((0 : ℝ) : ℝ))" in verification["lean_source"]


def test_public_protocol_reconstructs_polynomial_shifted_factorial_ratio_limit(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-polynomial-shifted-factorial-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of (n^2 + 1) * (1/2)^n / factorial(n + 2) is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    final_step = verification["resolved_request"]["steps"][-1]
    assert final_step["rule"] == "series_ratio_limit_test"
    assert final_step["premises"] == []
    assert "ratioFactPoly" in verification["lean_source"]
    assert "Nat.factorial_succ" in verification["lean_source"]
    assert "(𝓝 ((0 : ℝ) : ℝ))" in verification["lean_source"]


def test_ratio_limit_powered_factorial_geometric_reconstructs_zero():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (1/2)^n / factorial(n)^2 is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 0
    assert pattern.automatic_ratio_factorial
    assert pattern.automatic_ratio_factorial_shift == 0
    assert pattern.automatic_ratio_factorial_power == 2
    assert pattern.automatic_ratio_base == Fraction(1, 2)
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "hrecip.pow 2" in source
    assert "Nat.factorial_succ" in source
    assert "mul_pow" in source
    assert "((n : ℝ) + 1) ^ 2" in source


def test_ratio_limit_powered_shifted_factorial_composes_polynomial_quotient_and_geometric_normalization():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n * (1/3)^n / factorial(n + 2)^3 is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 0
    assert pattern.automatic_ratio_factorial_shift == 2
    assert pattern.automatic_ratio_factorial_power == 3
    assert pattern.automatic_ratio_base == Fraction(1, 6)
    assert pattern.automatic_ratio_denominator_polynomial_degree == 1
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "hfactorRecip.pow 3" in source
    assert "ratioFactDenPoly" in source
    assert "have hpolyQuotientModel" in source
    assert "have hgeomRatio" in source
    assert "Nat.factorial_succ" in source


def test_ratio_limit_powered_factorial_reuses_polynomial_tail_certificates():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((real(n) - 2) / (real(n) - 1)) * (1/3)^n / factorial(n)^2 is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.automatic_ratio_factorial_power == 2
    assert pattern.automatic_nonzero_from is not None
    assert pattern.automatic_nonzero_from >= 3
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "filter_upwards [Filter.eventually_ge_atTop" in source
    assert "have hdenNext0" in source
    assert "have hfactPow0" in source


def test_ratio_limit_powered_factorial_bite_rejects_zero_power_and_non_affine_argument():
    zero_power = parse_goal_text(
        "The series from n = 0 to infinity of (1/2)^n / factorial(n)^0 is summable.",
        {"n"},
    )
    non_affine = parse_goal_text(
        "The series from n = 0 to infinity of (1/2)^n / factorial(2 * n)^2 is summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(zero_power, []) is None
    assert match_series_ratio_limit_test(non_affine, []) is None


def test_ratio_limit_explicit_factorial_power_one_stays_supported():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (1/2)^n / factorial(n + 1)^1 is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.automatic_ratio_factorial_shift == 1
    assert pattern.automatic_ratio_factorial_power == 1
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "hrecip.pow 1" in source
    assert "Nat.factorial_succ" in source


def test_public_protocol_reconstructs_powered_shifted_factorial_ratio_limit(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-powered-shifted-factorial-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n * (1/3)^n / factorial(n + 2)^3 is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    final_step = verification["resolved_request"]["steps"][-1]
    assert final_step["rule"] == "series_ratio_limit_test"
    assert final_step["premises"] == []
    assert "hfactorRecip.pow 3" in verification["lean_source"]
    assert "ratioFactDenPoly" in verification["lean_source"]
    assert "Nat.factorial_succ" in verification["lean_source"]


def test_ratio_limit_multiple_shifted_factorials_reconstruct_zero():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (1/2)^n / (factorial(n) * factorial(n + 2)) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 0
    assert pattern.automatic_ratio_factorial
    assert pattern.automatic_ratio_factorial_factors == ((0, 1), (2, 1))
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "have hfactorTerm0" in source
    assert "have hfactorTerm1" in source
    assert "have hfactorProduct" in source
    assert "Nat.factorial_succ" in source
    assert "((n : ℝ) + 1) * ((n : ℝ) + 3)" in source


def test_ratio_limit_multiple_factorials_compose_powers_polynomial_quotient_and_geometric_normalization():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n * (1/3)^n / (factorial(n + 1) * factorial(n + 2)^2) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.automatic_ratio_factorial_factors == ((1, 1), (2, 2))
    assert pattern.automatic_ratio_base == Fraction(1, 6)
    assert pattern.automatic_ratio_polynomial_degree == 2
    assert pattern.automatic_ratio_denominator_polynomial_degree == 1
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "hfactorRecip1.pow 2" in source
    assert "ratioMultiFactPoly" in source
    assert "ratioMultiFactDenPoly" in source
    assert "have hpolyQuotientModel" in source
    assert "have hgeomRatio" in source


def test_ratio_limit_multiple_factorials_reuse_polynomial_tail_certificates():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((real(n) - 2) / (real(n) - 1)) * (1/3)^n / (factorial(n) * factorial(n + 4)) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.automatic_ratio_factorial_factors == ((0, 1), (4, 1))
    assert pattern.automatic_nonzero_from is not None
    assert pattern.automatic_nonzero_from >= 3
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "filter_upwards [Filter.eventually_ge_atTop" in source
    assert "have hdenNext0" in source
    assert "have hfact0" in source and "have hfact1" in source


def test_ratio_limit_multiple_factorial_bite_rejects_non_affine_denominators_but_exact_quotients_can_cancel():
    non_affine = parse_goal_text(
        "The series from n = 0 to infinity of (1/2)^n / (factorial(n) * factorial(2 * n)) is summable.",
        {"n"},
    )
    quotient_inside_denominator = parse_goal_text(
        "The series from n = 0 to infinity of (1/2)^n / (factorial(n) / factorial(n + 1)) is summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(non_affine, []) is None
    quotient_pattern = match_series_ratio_limit_test(quotient_inside_denominator, [])
    assert quotient_pattern is not None
    assert quotient_pattern.automatic_ratio_factorial_quotient_shifts == (1, 0)


def test_ratio_limit_multiple_factorial_source_budget_rejects_excess_total_power():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (1/2)^n / (factorial(n)^33 * factorial(n + 1)^32) is summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(goal, []) is None


def test_public_protocol_reconstructs_multiple_shifted_factorial_ratio_limit(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-multiple-shifted-factorial-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n * (1/3)^n / (factorial(n + 1) * factorial(n + 2)^2) is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    final_step = verification["resolved_request"]["steps"][-1]
    assert final_step["rule"] == "series_ratio_limit_test"
    assert final_step["premises"] == []
    assert "hfactorProduct" in verification["lean_source"]
    assert "ratioMultiFactDenPoly" in verification["lean_source"]
    assert "Nat.factorial_succ" in verification["lean_source"]


def test_ratio_limit_sequential_factorial_division_normalizes_to_product_denominator():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (1/2)^n / factorial(n) / factorial(n + 2) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 0
    assert pattern.automatic_ratio_factorial_factors == ((0, 1), (2, 1))
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "hfactorProduct" in source
    assert "Nat.factorial_succ" in source
    # The generated proof still targets the submitted left-associated term.
    assert "/ (Nat.factorial n)) / (Nat.factorial (n + 2))" in source


def test_ratio_limit_sequential_factorials_compose_with_polynomial_quotient_and_geometric_normalization():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n * (1/3)^n / factorial(n + 1) / factorial(n + 2)^2 is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.automatic_ratio_factorial_factors == ((1, 1), (2, 2))
    assert pattern.automatic_ratio_base == Fraction(1, 6)
    assert pattern.automatic_ratio_polynomial_degree == 2
    assert pattern.automatic_ratio_denominator_polynomial_degree == 1
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "ratioMultiFactPoly" in source
    assert "ratioMultiFactDenPoly" in source
    assert "hfactorRecip1.pow 2" in source


def test_ratio_limit_sequential_factorial_division_allows_nonfactorial_denominator_between_factorials():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (real(n)^2 + 1) * (1/2)^n / factorial(n) / (real(n) + 1) / factorial(n + 3) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.automatic_ratio_factorial_factors == ((0, 1), (3, 1))
    assert pattern.automatic_ratio_denominator_polynomial_degree == 1
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "ratioMultiFactDenPoly" in source
    assert "hfactorProduct" in source


def test_ratio_limit_sequential_single_factorial_commutes_with_polynomial_denominator_order():
    factorial_first = parse_goal_text(
        "The series from n = 0 to infinity of (real(n)^2 + 1) * (1/2)^n / factorial(n) / (real(n) + 1) is summable.",
        {"n"},
    )
    polynomial_first = parse_goal_text(
        "The series from n = 0 to infinity of (real(n)^2 + 1) * (1/2)^n / (real(n) + 1) / factorial(n) is summable.",
        {"n"},
    )
    first_pattern = match_series_ratio_limit_test(factorial_first, [])
    second_pattern = match_series_ratio_limit_test(polynomial_first, [])
    assert first_pattern is not None
    assert second_pattern is not None
    assert first_pattern.automatic_ratio_factorial_factors == ((0, 1),)
    assert second_pattern.automatic_ratio_factorial_factors == ((0, 1),)
    assert first_pattern.automatic_ratio_denominator_polynomial_degree == 1
    assert second_pattern.automatic_ratio_denominator_polynomial_degree == 1
    assert first_pattern.automatic_ratio_base == second_pattern.automatic_ratio_base == Fraction(1, 2)

    first_source = "\n".join(_render_series_ratio_limit_test(first_pattern, {"assumptions": [], "steps": []}))
    second_source = "\n".join(_render_series_ratio_limit_test(second_pattern, {"assumptions": [], "steps": []}))
    assert "hfactorProduct" in first_source
    assert "ratioMultiFactDenPoly" in first_source
    assert "/ (Nat.factorial n)) / ((((n : ℕ) : ℝ)) + 1)" in first_source
    assert "ratioFactDenPoly" in second_source


def test_ratio_limit_sequential_single_factorial_allows_constant_denominator_after_factorial():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (1/2)^n / factorial(n) / 2 is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.automatic_ratio_factorial_factors == ((0, 1),)
    assert pattern.automatic_ratio_denominator_polynomial_degree == 0
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "hfactorProduct" in source
    assert "ratioMultiFactDenPoly" in source


def test_ratio_limit_sequential_factorial_normalization_promotes_only_exact_one_up_one_down_quotients():
    quotient_inside_denominator = parse_goal_text(
        "The series from n = 0 to infinity of (1/2)^n / (factorial(n) / factorial(n + 1)) is summable.",
        {"n"},
    )
    factorial_in_numerator = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1) * (1/2)^n / factorial(n) is summable.",
        {"n"},
    )
    quotient_pattern = match_series_ratio_limit_test(quotient_inside_denominator, [])
    numerator_pattern = match_series_ratio_limit_test(factorial_in_numerator, [])
    assert quotient_pattern is not None
    assert numerator_pattern is not None
    assert quotient_pattern.automatic_ratio_factorial_quotient_shifts == (1, 0)
    assert numerator_pattern.automatic_ratio_factorial_quotient_shifts == (1, 0)


def test_public_protocol_reconstructs_single_factorial_before_polynomial_denominator(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-single-factorial-order-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of (real(n)^2 + 1) * (1/2)^n / factorial(n) / (real(n) + 1) is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    final_step = verification["resolved_request"]["steps"][-1]
    assert final_step["rule"] == "series_ratio_limit_test"
    assert final_step["premises"] == []
    assert "hfactorProduct" in verification["lean_source"]
    assert "ratioMultiFactDenPoly" in verification["lean_source"]


def test_ratio_limit_sequential_factorial_source_budget_is_preserved():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (1/2)^n / factorial(n)^33 / factorial(n + 1)^32 is summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(goal, []) is None


def test_public_protocol_reconstructs_sequential_factorial_denominator_division(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-sequential-factorial-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n / factorial(n + 1) / factorial(n + 3)^2 is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    final_step = verification["resolved_request"]["steps"][-1]
    assert final_step["rule"] == "series_ratio_limit_test"
    assert final_step["premises"] == []
    assert "hfactorProduct" in verification["lean_source"]
    assert "ratioMultiFactDenPoly" in verification["lean_source"]


def test_ratio_limit_shifted_factorial_numerator_over_denominator_is_reconstructed():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1) * (1/2)^n / factorial(n) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 2)
    assert pattern.automatic_ratio_factorial_quotient_shifts == (1, 0)
    assert pattern.automatic_ratio_factorial_quotient_coefficient == 1
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "hlin" in source
    assert source.count("Nat.factorial_succ") >= 2
    assert "((n : ℝ) + 2) / ((n : ℝ) + 1)" in source


def test_ratio_limit_shifted_factorial_denominator_larger_shift_is_reconstructed():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n) * (1/3)^n / factorial(n + 2) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 3)
    assert pattern.automatic_ratio_factorial_quotient_shifts == (0, 2)
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "(-2 : ℝ)" in source
    assert "((n : ℝ) + 1) / ((n : ℝ) + 3)" in source


def test_ratio_limit_nested_factorial_quotient_is_now_exactly_supported():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of (1/2)^n / (factorial(n) / factorial(n + 1)) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.automatic_ratio_factorial_quotient_shifts == (1, 0)
    assert pattern.limit == Fraction(1, 2)


def test_ratio_limit_shifted_factorial_quotient_supports_divergence():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 2) * 2^n / factorial(n) is not summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.result_kind == "not_summable"
    assert pattern.limit == 2
    assert pattern.automatic_ratio_factorial_quotient_shifts == (2, 0)
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "not_summable_of_ratio_test_tendsto_gt_one" in source


def test_ratio_limit_shifted_factorial_quotient_keeps_unit_boundary_inconclusive():
    summable = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1) * 1^n / factorial(n) is summable.",
        {"n"},
    )
    divergent = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1) * 1^n / factorial(n) is not summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(summable, []) is None
    assert match_series_ratio_limit_test(divergent, []) is None


def test_ratio_limit_shifted_factorial_quotient_scope_remains_narrow():
    powered = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1)^2 * (1/2)^n / factorial(n)^2 is summable.",
        {"n"},
    )
    non_affine = parse_goal_text(
        "The series from n = 0 to infinity of factorial(2 * n) * (1/2)^n / factorial(n) is summable.",
        {"n"},
    )
    polynomial_denominator_residual = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1) * (n + 1) * (1/2)^n / ((n + 2) * factorial(n)) is summable.",
        {"n"},
    )
    multiple_geometric = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1) * (n + 1) * (1/2)^n * (1/3)^n / factorial(n) is summable.",
        {"n"},
    )
    powered_pattern = match_series_ratio_limit_test(powered, [])
    assert powered_pattern is not None
    assert powered_pattern.automatic_ratio_factorial_quotient_power == 2
    assert match_series_ratio_limit_test(non_affine, []) is None
    denominator_pattern = match_series_ratio_limit_test(polynomial_denominator_residual, [])
    assert denominator_pattern is not None
    assert denominator_pattern.automatic_ratio_denominator_polynomial_degree == 1
    geometric_pattern = match_series_ratio_limit_test(multiple_geometric, [])
    assert geometric_pattern is not None
    assert geometric_pattern.limit == Fraction(1, 6)
    assert geometric_pattern.automatic_ratio_geometric_expression["kind"] == "mul"


def test_ratio_limit_polynomial_shifted_factorial_quotient_reconstructs_product_limit():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1) * (n + 1) * (1/2)^n / factorial(n) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 2)
    assert pattern.automatic_ratio_factorial_quotient_shifts == (1, 0)
    assert pattern.automatic_ratio_factorial_quotient_coefficient is None
    assert pattern.automatic_ratio_polynomial_degree == 1
    assert pattern.automatic_ratio_polynomial_nonzero_from == 0
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "ratioFactQuotPoly" in source
    assert "hpolyAbs" in source
    assert "hlin" in source
    assert source.count("Nat.factorial_succ") >= 2


def test_ratio_limit_polynomial_shifted_factorial_quotient_reuses_tail_certificate():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n) * (n - 1) * (1/3)^n / factorial(n + 2) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 3)
    assert pattern.automatic_ratio_polynomial_nonzero_from == 2
    assert pattern.automatic_nonzero_from == 2
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "Filter.eventually_ge_atTop 2" in source
    assert "hshiftIdentity" in source


def test_ratio_limit_polynomial_shifted_factorial_quotient_supports_divergence():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 2) * (n^3 + 1) * 2^n / factorial(n) is not summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 2
    assert pattern.automatic_ratio_polynomial_degree == 3
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "not_summable_of_ratio_test_tendsto_gt_one" in source


def test_ratio_limit_polynomial_shifted_factorial_quotient_keeps_unit_boundary_inconclusive():
    summable = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1) * (n + 1) * 1^n / factorial(n) is summable.",
        {"n"},
    )
    divergent = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1) * (n + 1) * 1^n / factorial(n) is not summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(summable, []) is None
    assert match_series_ratio_limit_test(divergent, []) is None


def test_public_protocol_reconstructs_polynomial_shifted_factorial_quotient(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-polynomial-factorial-quotient-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of factorial(n + 1) * (n + 1) * (1/2)^n / factorial(n) is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    final_step = verification["resolved_request"]["steps"][-1]
    assert final_step["rule"] == "series_ratio_limit_test"
    assert final_step["premises"] == []
    assert "ratioFactQuotPoly" in verification["lean_source"]



def test_ratio_limit_polynomial_quotient_shifted_factorial_quotient_reconstructs_all_factors():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1) * ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n / factorial(n) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 2)
    assert pattern.automatic_ratio_polynomial_degree == 2
    assert pattern.automatic_ratio_denominator_polynomial_degree == 1
    assert pattern.automatic_ratio_factorial_quotient_shifts == (1, 0)
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "ratioFactQuotPoly" in source
    assert "ratioFactQuotDenPoly" in source
    assert "hpolyQuotient" in source
    assert source.count("Nat.factorial_succ") >= 2


def test_ratio_limit_polynomial_quotient_shifted_factorial_quotient_reuses_denominator_tail_certificate():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n) * ((real(n)^2 + 1) / (real(n) - 1)) * (1/3)^n / factorial(n + 2) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 3)
    assert pattern.automatic_ratio_denominator_polynomial_nonzero_from == 2
    assert pattern.automatic_nonzero_from == 2
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "Filter.eventually_ge_atTop 2" in source
    assert "hpolyDenAt" in source
    assert "hpolyDenNext0" in source


def test_ratio_limit_polynomial_quotient_shifted_factorial_quotient_supports_divergence():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 2) * ((real(n)^3 + 1) / (real(n) + 1)) * 2^n / factorial(n) is not summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 2
    assert pattern.automatic_ratio_denominator_polynomial_degree == 1
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "not_summable_of_ratio_test_tendsto_gt_one" in source
    assert "ratioFactQuotDenPoly" in source


def test_ratio_limit_polynomial_quotient_shifted_factorial_quotient_keeps_unit_boundary_inconclusive():
    summable = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1) * ((real(n)^2 + 1) / (real(n) + 1)) * 1^n / factorial(n) is summable.",
        {"n"},
    )
    divergent = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1) * ((real(n)^2 + 1) / (real(n) + 1)) * 1^n / factorial(n) is not summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(summable, []) is None
    assert match_series_ratio_limit_test(divergent, []) is None


def test_public_protocol_reconstructs_polynomial_quotient_shifted_factorial_quotient(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-polynomial-quotient-factorial-quotient-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of factorial(n + 1) * ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n / factorial(n) is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    final_step = verification["resolved_request"]["steps"][-1]
    assert final_step["rule"] == "series_ratio_limit_test"
    assert final_step["premises"] == []
    assert "ratioFactQuotDenPoly" in verification["lean_source"]


def test_public_protocol_reconstructs_exact_shifted_factorial_quotient(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-factorial-quotient-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of factorial(n + 1) * (1/2)^n / factorial(n) is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    final_step = verification["resolved_request"]["steps"][-1]
    assert final_step["rule"] == "series_ratio_limit_test"
    assert final_step["premises"] == []
    assert verification["lean_source"].count("Nat.factorial_succ") >= 2


def test_ratio_limit_factorial_quotient_normalizes_multiple_geometric_factors():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1) * ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n * (1/3)^n / factorial(n) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 6)
    assert pattern.automatic_ratio_factorial_quotient_shifts == (1, 0)
    assert pattern.automatic_ratio_denominator_polynomial_degree == 1
    assert pattern.automatic_ratio_geometric_expression["kind"] == "mul"
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "have hgeomAbs" in source
    assert "have hgeomRatio" in source
    assert "abs_mul" in source
    assert "← mul_pow" in source
    assert source.count("Nat.factorial_succ") >= 2


def test_ratio_limit_factorial_quotient_normalizes_geometric_denominator_for_divergence():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 2) * ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n / (1/3)^n / factorial(n) is not summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(3, 2)
    assert pattern.automatic_ratio_geometric_expression["kind"] == "div"
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "abs_div" in source
    assert "← div_pow" in source
    assert "not_summable_of_ratio_test_tendsto_gt_one" in source


def test_ratio_limit_factorial_quotient_normalizes_multiple_geometric_factors_with_constant_polynomial():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1) * (1/2)^n * (1/3)^n / factorial(n) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 6)
    assert pattern.automatic_ratio_polynomial_degree == 0
    assert pattern.automatic_ratio_geometric_expression["kind"] == "mul"
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "ratioFactQuotPoly" in source
    assert "have hgeomAbs" in source


def test_ratio_limit_factorial_quotient_multiple_geometric_factors_keeps_unit_boundary_inconclusive():
    summable = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1) * (1/2)^n * 2^n / factorial(n) is summable.",
        {"n"},
    )
    divergent = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1) * (1/2)^n * 2^n / factorial(n) is not summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(summable, []) is None
    assert match_series_ratio_limit_test(divergent, []) is None


def test_ratio_limit_factorial_quotient_multiple_geometric_factors_rejects_zero_base():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1) * (1/2)^n * 0^n / factorial(n) is summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(goal, []) is None


def test_public_protocol_reconstructs_normalized_geometric_factorial_quotient(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-factorial-quotient-geometric-normalization-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of factorial(n + 1) * ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n * (1/3)^n / factorial(n) is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    final_step = verification["resolved_request"]["steps"][-1]
    assert final_step["rule"] == "series_ratio_limit_test"
    assert final_step["premises"] == []
    assert "ratioFactQuotDenPoly" in verification["lean_source"]
    assert "have hgeomAbs" in verification["lean_source"]
    assert "have hgeomRatio" in verification["lean_source"]


def test_ratio_limit_powered_factorial_quotient_reconstructs_equal_power():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1)^2 * (1/2)^n / factorial(n)^2 is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 2)
    assert pattern.automatic_ratio_factorial_quotient_shifts == (1, 0)
    assert pattern.automatic_ratio_factorial_quotient_power == 2
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "hlin.pow 2" in source
    assert "have hlinPow" in source
    assert "simp only [mul_pow]" in source
    assert source.count("Nat.factorial_succ") >= 2


def test_ratio_limit_powered_whole_factorial_quotient_spelling_is_normalized():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((factorial(n + 2) / factorial(n))^3) * (1/3)^n is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 3)
    assert pattern.automatic_ratio_factorial_quotient_shifts == (2, 0)
    assert pattern.automatic_ratio_factorial_quotient_power == 3
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "hlin.pow 3" in source
    assert "^ 3" in source


def test_ratio_limit_powered_factorial_quotient_composes_polynomial_quotient_and_geometric_normalization():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n * (1/3)^n * factorial(n + 2)^3 / factorial(n)^3 is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 6)
    assert pattern.automatic_ratio_factorial_quotient_power == 3
    assert pattern.automatic_ratio_denominator_polynomial_degree == 1
    assert pattern.automatic_ratio_geometric_expression["kind"] == "mul"
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "ratioFactQuotDenPoly" in source
    assert "have hgeomAbs" in source
    assert "hlin.pow 3" in source


def test_ratio_limit_powered_factorial_quotient_supports_divergence():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1)^4 * 2^n / factorial(n)^4 is not summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 2
    assert pattern.automatic_ratio_factorial_quotient_power == 4
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "hlin.pow 4" in source
    assert "not_summable_of_ratio_test_tendsto_gt_one" in source


def test_ratio_limit_powered_factorial_quotient_keeps_unit_and_large_imbalance_boundaries():
    unit = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1)^2 * 1^n / factorial(n)^2 is summable.",
        {"n"},
    )
    unequal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1)^2 * (1/2)^n / factorial(n)^3 is summable.",
        {"n"},
    )
    powered_non_affine = parse_goal_text(
        "The series from n = 0 to infinity of factorial(2 * n)^2 * (1/2)^n / factorial(n)^2 is summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(unit, []) is None
    unequal_pattern = match_series_ratio_limit_test(unequal, [])
    assert unequal_pattern is not None
    assert unequal_pattern.limit == 0
    assert unequal_pattern.automatic_ratio_factorial_unmatched_denominator_shift == 0
    assert match_series_ratio_limit_test(powered_non_affine, []) is None


def test_public_protocol_reconstructs_powered_factorial_quotient(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-powered-factorial-quotient-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n * factorial(n + 2)^2 / factorial(n)^2 is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    final_step = verification["resolved_request"]["steps"][-1]
    assert final_step["rule"] == "series_ratio_limit_test"
    assert final_step["premises"] == []
    assert "hlin.pow 2" in verification["lean_source"]
    assert "ratioFactQuotDenPoly" in verification["lean_source"]


def test_ratio_limit_multiple_powered_factorial_quotients_reconstruct_product():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((factorial(n + 1) / factorial(n))^2) * ((factorial(n + 3) / factorial(n + 2))^3) * (1/2)^n is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 2)
    assert pattern.automatic_ratio_factorial_quotient_factors == ((1, 0, 2), (3, 2, 3))
    assert pattern.automatic_ratio_factorial_quotient_shifts is None
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "hlinPowQ0" in source
    assert "hlinPowQ1" in source
    assert "have hfactorialProduct" in source
    assert source.count("Nat.factorial_succ") >= 4


def test_ratio_limit_multiple_powered_factorial_quotients_normalizes_split_power_spelling():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1)^2 * factorial(n + 3)^3 * (1/3)^n / (factorial(n)^2 * factorial(n + 2)^3) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 3)
    assert pattern.automatic_ratio_factorial_quotient_factors == ((1, 0, 2), (3, 2, 3))
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "hcurrentFactor" in source
    assert "div_pow" in source
    assert "hfactorRatioNonnegQ0" in source
    assert "hfactorRatioNonnegQ1" in source


def test_ratio_limit_multiple_powered_factorial_quotients_compose_polynomial_quotient_and_geometric_normalization():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n * (1/3)^n * ((factorial(n + 1) / factorial(n))^2) * ((factorial(n + 4) / factorial(n + 2))^3) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 6)
    assert pattern.automatic_ratio_factorial_quotient_factors == ((1, 0, 2), (4, 2, 3))
    assert pattern.automatic_ratio_denominator_polynomial_degree == 1
    assert pattern.automatic_ratio_geometric_expression["kind"] == "mul"
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "ratioMultiFactQuotDenPoly" in source
    assert "have hgeomAbs" in source
    assert "have hfactorialProduct" in source


def test_ratio_limit_multiple_powered_factorial_quotients_support_divergence():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((factorial(n + 2) / factorial(n))^2) * ((factorial(n + 4) / factorial(n + 1))^2) * 2^n is not summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 2
    assert len(pattern.automatic_ratio_factorial_quotient_factors) == 2
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "not_summable_of_ratio_test_tendsto_gt_one" in source


def test_ratio_limit_multiple_powered_factorial_quotients_keep_unit_and_large_imbalance_boundaries():
    unit = parse_goal_text(
        "The series from n = 0 to infinity of ((factorial(n + 1) / factorial(n))^2) * ((factorial(n + 3) / factorial(n + 2))^3) * 1^n is summable.",
        {"n"},
    )
    unequal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1)^2 * factorial(n + 3)^3 * (1/2)^n / (factorial(n)^2 * factorial(n + 2)^4) is summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(unit, []) is None
    unequal_pattern = match_series_ratio_limit_test(unequal, [])
    assert unequal_pattern is not None
    assert unequal_pattern.limit == 0
    assert unequal_pattern.automatic_ratio_factorial_unmatched_denominator_shift == 2


def test_ratio_limit_multiple_powered_factorial_quotients_enforce_source_size_caps():
    too_many = " * ".join(
        f"(factorial(n + {i + 1}) / factorial(n + {i}))" for i in range(9)
    )
    too_much_power = (
        "((factorial(n + 1) / factorial(n))^32) * "
        "((factorial(n + 3) / factorial(n + 2))^33) * (1/2)^n"
    )
    goal_many = parse_goal_text(
        f"The series from n = 0 to infinity of ({too_many}) * (1/2)^n is summable.",
        {"n"},
    )
    goal_power = parse_goal_text(
        f"The series from n = 0 to infinity of {too_much_power} is summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(goal_many, []) is None
    assert match_series_ratio_limit_test(goal_power, []) is None


def test_public_protocol_reconstructs_multiple_powered_factorial_quotients(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-multiple-powered-factorial-quotients-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n * factorial(n + 1)^2 * factorial(n + 3)^3 / factorial(n)^2 / factorial(n + 2)^3 is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    final_step = verification["resolved_request"]["steps"][-1]
    assert final_step["rule"] == "series_ratio_limit_test"
    assert final_step["premises"] == []
    assert "have hfactorialProduct" in verification["lean_source"]
    assert "ratioMultiFactQuotDenPoly" in verification["lean_source"]


def test_ratio_limit_factorial_quotient_cancels_common_power_before_pairing():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1)^3 * (1/2)^n / (factorial(n + 1) * factorial(n)^2) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 2)
    assert pattern.automatic_ratio_factorial_quotient_factors == (
        (1, 1, 1),
        (1, 0, 2),
    )
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "(((n : ℝ) + 2) / ((n : ℝ) + 2))" in source
    assert "hlinPowQ1" in source
    assert "have hfactorialProduct" in source


def test_ratio_limit_factorial_quotient_cancels_multiple_common_shifts_exactly():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1)^3 * factorial(n + 4)^2 * (1/3)^n / (factorial(n + 1) * factorial(n)^2 * factorial(n + 4) * factorial(n + 2)) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 3)
    factors = pattern.automatic_ratio_factorial_quotient_factors
    assert (1, 1, 1) in factors
    assert (4, 4, 1) in factors
    assert (4, 2, 1) in factors
    assert (1, 0, 2) in factors


def test_ratio_limit_factorial_quotient_full_common_power_cancellation_is_exact():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1)^3 * (1/2)^n / factorial(n + 1)^3 is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 2)
    assert pattern.automatic_ratio_factorial_quotient_shifts == (1, 1)
    assert pattern.automatic_ratio_factorial_quotient_power == 3
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "hlin.pow 3" in source


def test_ratio_limit_factorial_quotient_common_cancellation_does_not_hide_unmatched_growth():
    unmatched_numerator = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1)^3 * (1/2)^n / factorial(n + 1) is summable.",
        {"n"},
    )
    still_unequal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1)^3 * factorial(n + 3)^2 * (1/2)^n / (factorial(n + 1) * factorial(n)^2 * factorial(n + 2)^4) is summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(unmatched_numerator, []) is None
    assert match_series_ratio_limit_test(still_unequal, []) is None


def test_public_protocol_reconstructs_common_factorial_power_cancellation(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-factorial-common-power-cancellation-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of factorial(n + 1)^3 * (1/2)^n / (factorial(n + 1) * factorial(n)^2) is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    final_step = verification["resolved_request"]["steps"][-1]
    assert final_step["rule"] == "series_ratio_limit_test"
    assert final_step["premises"] == []
    assert "have hfactorialProduct" in verification["lean_source"]
    assert "hlinPowQ1" in verification["lean_source"]


def test_ratio_limit_factorial_quotient_splits_residual_power_across_denominator_shifts():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 3)^3 * (1/2)^n / (factorial(n + 1) * factorial(n)^2) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 2)
    assert pattern.automatic_ratio_factorial_quotient_factors == (
        (3, 0, 2),
        (3, 1, 1),
    )
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "hlinPowQ0" in source
    assert "hlinQ1" in source
    assert "have hfactorialProduct" in source


def test_ratio_limit_factorial_quotient_splits_multiple_numerator_shifts_against_one_denominator():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1) * factorial(n + 4)^2 * (1/3)^n / factorial(n)^3 is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 3)
    assert pattern.automatic_ratio_factorial_quotient_factors == (
        (1, 0, 1),
        (4, 0, 2),
    )


def test_ratio_limit_factorial_quotient_combines_common_cancellation_and_power_splitting():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1)^5 * (1/2)^n / (factorial(n + 1)^2 * factorial(n) * factorial(n + 2)^2) is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == Fraction(1, 2)
    assert pattern.automatic_ratio_factorial_quotient_factors == (
        (1, 1, 2),
        (1, 0, 1),
        (1, 2, 2),
    )
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "(((n : ℝ) + 2) / ((n : ℝ) + 2)) ^ 2" in source
    assert "hfactorialProduct" in source


def test_ratio_limit_factorial_power_splitting_preserves_total_power_boundary():
    unequal_total = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 2)^4 * (1/2)^n / (factorial(n) * factorial(n + 1)^2) is summable.",
        {"n"},
    )
    unmatched_after_cancel = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 1)^5 * (1/2)^n / (factorial(n + 1)^2 * factorial(n)^2) is summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(unequal_total, []) is None
    assert match_series_ratio_limit_test(unmatched_after_cancel, []) is None


def test_public_protocol_reconstructs_factorial_power_splitting(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "ratio-factorial-power-splitting-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of factorial(n + 3)^3 * (1/2)^n / (factorial(n + 1) * factorial(n)^2) is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    final_step = verification["resolved_request"]["steps"][-1]
    assert final_step["rule"] == "series_ratio_limit_test"
    assert final_step["premises"] == []
    assert "hlinPowQ0" in verification["lean_source"]
    assert "have hfactorialProduct" in verification["lean_source"]


def test_ratio_limit_one_extra_denominator_factorial_power_forces_zero():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 2)^2 * (1/2)^n / factorial(n)^3 is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 0
    assert pattern.automatic_ratio_factorial_quotient_factors == ((2, 0, 2),)
    assert pattern.automatic_ratio_factorial_unmatched_denominator_shift == 0
    assert pattern.automatic_ratio_factorial_unmatched_numerator_shift is None
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "have hresidualRecip" in source
    assert "Filter.atTop (𝓝 0)" in source
    assert "summable_of_ratio_test_tendsto_lt_one" in source


def test_ratio_limit_one_extra_numerator_factorial_power_proves_divergence():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 2)^3 * (1/2)^n / factorial(n)^2 is not summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit is None
    assert pattern.automatic_ratio_factorial_ratio_unbounded
    assert pattern.automatic_ratio_factorial_unmatched_numerator_shift == 2
    assert pattern.automatic_ratio_factorial_unmatched_denominator_shift is None
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "have hratioTop" in source
    assert "hfactorialBalanced.pos_mul_atTop" in source
    assert "not_summable_of_ratio_norm_eventually_ge" in source


def test_ratio_limit_factorial_imbalance_composes_with_polynomial_quotient_and_geometric_normalization():
    goal = parse_goal_text(
        "The series from n = 0 to infinity of ((real(n)^2 + 1) / (real(n) + 1)) * (1/2)^n * (1/3)^n * factorial(n + 3)^2 / factorial(n)^3 is summable.",
        {"n"},
    )
    pattern = match_series_ratio_limit_test(goal, [])
    assert pattern is not None
    assert pattern.limit == 0
    assert pattern.automatic_ratio_base == Fraction(1, 6)
    assert pattern.automatic_ratio_denominator_polynomial is not None
    assert pattern.automatic_ratio_factorial_unmatched_denominator_shift == 0
    source = "\n".join(_render_series_ratio_limit_test(pattern, {"assumptions": [], "steps": []}))
    assert "hpolyQuotient" in source
    assert "hgeomAbs" in source
    assert "hresidualRecip" in source


def test_ratio_limit_factorial_imbalance_larger_than_one_remains_unsupported():
    extra_denominator_two = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 2)^2 * (1/2)^n / factorial(n)^4 is summable.",
        {"n"},
    )
    extra_numerator_two = parse_goal_text(
        "The series from n = 0 to infinity of factorial(n + 2)^4 * (1/2)^n / factorial(n)^2 is not summable.",
        {"n"},
    )
    assert match_series_ratio_limit_test(extra_denominator_two, []) is None
    assert match_series_ratio_limit_test(extra_numerator_two, []) is None


def test_public_protocol_reconstructs_single_factorial_power_imbalance(monkeypatch):
    monkeypatch.setenv("PATH", "")
    convergent = handle_message({
        "op": "prove_text",
        "request_id": "ratio-factorial-extra-denominator-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of factorial(n + 2)^2 * (1/2)^n / factorial(n)^3 is summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert convergent["ok"]
    verification = convergent["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["resolved_request"]["steps"][-1]["premises"] == []
    assert "have hresidualRecip" in verification["lean_source"]

    divergent = handle_message({
        "op": "prove_text",
        "request_id": "ratio-factorial-extra-numerator-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "The series from n = 0 to infinity of factorial(n + 2)^3 * (1/2)^n / factorial(n)^2 is not summable.",
        "allowed_rules": ["series_ratio_limit_test"],
    })
    assert divergent["ok"]
    verification = divergent["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert "have hratioTop" in verification["lean_source"]
    assert "not_summable_of_ratio_norm_eventually_ge" in verification["lean_source"]
