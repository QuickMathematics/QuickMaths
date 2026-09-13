import json
from copy import deepcopy
from pathlib import Path

from quickmaths_formal.contract import normalize_request
from quickmaths_formal.lean import render_request
from quickmaths_formal.protocol import handle_message
from quickmaths_formal.search import build_auto_request, search_proof
from quickmaths_formal.sequences import (
    match_nat_at_top,
    match_sequence_algebra,
    match_sequence_elementary_divergence,
    same_sequence_source,
    sequence_algebra_status,
)
from quickmaths_formal.state import build_proof_state

FIXTURES = Path(__file__).parents[1] / "fixtures"


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_shifted_reciprocal_sequence_is_a_primitive_finite_leaf():
    raw = load("sequence_reciprocal_shift.json")
    pattern = match_sequence_algebra(raw["goal"])
    assert pattern is not None
    assert pattern.root.kind == "reciprocal_shift"
    assert pattern.root.shift == 1
    assert not pattern.guards
    assert build_proof_state(raw).status == "ready_for_kernel"

    source = render_request(normalize_request(raw))
    assert "fun (n : ℕ)" in source
    assert "Filter.atTop" in source
    assert "tendsto_natCast_atTop_atTop" in source
    assert ".div_atTop" in source


def test_exact_geometric_ratio_is_kernel_guarded_with_norm_num():
    raw = load("sequence_geometric_half.json")
    pattern = match_sequence_algebra(raw["goal"])
    assert pattern is not None and pattern.root.kind == "geometric"
    missing, violated = sequence_algebra_status(pattern)
    assert not missing and not violated
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "sequence_guard_1" in source
    assert "by norm_num" in source
    assert "tendsto_pow_atTop_nhds_zero_of_abs_lt_one" in source


def test_symbolic_geometric_ratio_requires_and_uses_cited_bound():
    good = load("sequence_geometric_symbolic.json")
    assert build_proof_state(good).status == "ready_for_kernel"
    source = render_request(normalize_request(good))
    assert "(hr : |r| < 1)" in source
    assert "sequence_guard_1" in source
    assert ":= hr" in source

    missing = build_proof_state(load("sequence_geometric_missing_ratio.json"))
    assert missing.status == "needs_justification"
    assert any(item["code"] == "geometric_ratio_abs_lt_one" for item in missing.obligations)
    assert any(item.get("action") == "prove_geometric_ratio_bound" for item in missing.suggestions)


def test_bad_geometric_ratio_is_a_domain_violation_not_failed_search():
    state = build_proof_state(load("sequence_geometric_bad_ratio.json"))
    assert state.status == "needs_justification"
    assert any(item["code"] == "sequence_algebra_domain_violation" for item in state.obligations)


def test_compositional_sequence_combines_reciprocal_geometric_and_sine():
    raw = load("sequence_composed.json")
    pattern = match_sequence_algebra(raw["goal"])
    assert pattern is not None
    assert pattern.root.kind == "add"
    assert pattern.root.children[0].kind == "sin"
    assert pattern.root.children[1].kind == "geometric"
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "Real.sin" in source
    assert ".add " in source
    assert "ContinuousAt" in source


def test_previously_proved_sequence_limit_is_reused_as_an_opaque_leaf():
    raw = load("sequence_reuse_sublimit.json")
    pattern = match_sequence_algebra(raw["goal"], [(raw["steps"][0]["id"], raw["steps"][0]["claim"])])
    assert pattern is not None
    assert pattern.used_sequence_premises == ("reciprocal",)
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "reciprocal" in source
    assert "houter.tendsto.comp reciprocal" in source


def test_sequence_sublimit_source_requires_same_bound_index():
    raw = load("sequence_reuse_sublimit.json")
    premise = deepcopy(raw["steps"][0]["claim"])
    premise["variable"] = "m"
    assert not same_sequence_source(raw["goal"], premise)


def test_natural_cast_shift_has_explicit_at_top_rule():
    raw = load("sequence_nat_at_top.json")
    pattern = match_nat_at_top(raw["goal"])
    assert pattern is not None and pattern.shift == 2
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "tendsto_atTop_add_const_right" in source
    assert "tendsto_natCast_atTop_atTop" in source


def test_wrong_reciprocal_target_is_rejected_structurally():
    state = build_proof_state(load("sequence_wrong_reciprocal_target.json"))
    assert state.status == "needs_justification"
    assert any(item["code"] == "sequence_algebra_shape" for item in state.obligations)


def test_search_and_public_protocol_select_sequence_algebra_without_certificate(monkeypatch):
    raw = load("sequence_composed.json")
    raw["steps"] = []
    result = search_proof(raw)
    assert any(item["rule"] == "sequence_algebra" for item in result["suggestions"])
    augmented, suggestion = build_auto_request(raw)
    assert suggestion is not None and suggestion.rule == "sequence_algebra"
    assert build_proof_state(augmented).status == "ready_for_kernel"

    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "sequence-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "As n tends to infinity, sin(1 / real(n + 1)) + (1/2)^n tends to 0.",
        "allowed_rules": ["sequence_algebra"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "sequence_algebra"
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert "Filter.atTop" in verification["lean_source"]


def test_rational_shift_sequence_rewrites_to_vanishing_tail():
    from quickmaths_formal.sequences import match_sequence_rational_shift

    raw = load("sequence_rational_shift.json")
    pattern = match_sequence_rational_shift(raw["goal"])
    assert pattern is not None
    assert pattern.numerator_shift == 0 and pattern.denominator_shift == 1
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "htail" in source
    assert "tendsto_const_nhds.div_atTop hden" in source
    assert "hmain.congr'" in source
    assert "field_simp [hden0]" in source


def test_shifted_rational_family_supports_different_exact_offsets():
    from quickmaths_formal.sequences import match_sequence_rational_shift

    raw = load("sequence_rational_shift_offset.json")
    pattern = match_sequence_rational_shift(raw["goal"])
    assert pattern is not None
    assert (pattern.numerator_shift, pattern.denominator_shift) == (2, 5)
    assert build_proof_state(raw).status == "ready_for_kernel"


def test_rational_shift_wrong_target_is_rejected_before_kernel():
    state = build_proof_state(load("sequence_rational_shift_wrong_target.json"))
    assert state.status == "needs_justification"
    assert any(item["code"] == "sequence_rational_shift_shape" for item in state.obligations)


def test_eventual_squeeze_handles_oscillatory_numerator_without_its_own_limit():
    from quickmaths_formal.sequences import match_sequence_squeeze

    raw = load("sequence_squeeze_sin_over_shift.json")
    sequence_rows = [(step["id"], step["claim"]) for step in raw["steps"][:-1]]
    prop_rows = [(row["id"], row["claim"]) for row in raw["assumptions"]]
    pattern = match_sequence_squeeze(raw["goal"], sequence_rows, prop_rows)
    assert pattern is not None
    assert pattern.lower_bound.conversion == "eventually"
    assert pattern.upper_bound.conversion == "eventually"
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "eventually_ge_atTop" in source
    assert "tendsto_of_tendsto_of_tendsto_of_le_of_le'" in source
    assert "hLowerBound" in source and "hUpperBound" in source


def test_squeeze_accepts_stronger_all_index_bounds_too():
    from quickmaths_formal.parser import parse_proposition_text
    from quickmaths_formal.sequences import match_sequence_squeeze

    raw = load("sequence_squeeze_sin_over_shift.json")
    raw["assumptions"][0]["claim"] = parse_proposition_text(
        "for every k:nat, -1 / real(k + 1) <= sin(real(k)) / real(k + 1)", ["n"]
    )
    raw["assumptions"][1]["claim"] = parse_proposition_text(
        "for every k:nat, sin(real(k)) / real(k + 1) <= 1 / real(k + 1)", ["n"]
    )
    sequence_rows = [(step["id"], step["claim"]) for step in raw["steps"][:-1]]
    prop_rows = [(row["id"], row["claim"]) for row in raw["assumptions"]]
    pattern = match_sequence_squeeze(raw["goal"], sequence_rows, prop_rows)
    assert pattern is not None
    assert pattern.lower_bound.conversion == pattern.upper_bound.conversion == "forall"
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "Eventually.of_forall h1" in source
    assert "Eventually.of_forall h2" in source


def test_squeeze_auto_derives_missing_trig_bound():
    raw = load("sequence_squeeze_missing_upper.json")
    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "Real.sin_le_one" in source
    assert "div_le_div_iff_of_pos_right" in source


def test_squeeze_auto_derives_both_sin_and_cos_bounds_without_assumptions():
    from quickmaths_formal.sequences import match_sequence_squeeze

    for name, trig in [("sequence_squeeze_sin_auto.json", "sin"), ("sequence_squeeze_cos_auto.json", "cos")]:
        raw = load(name)
        sequence_rows = [(step["id"], step["claim"]) for step in raw["steps"][:-1]]
        pattern = match_sequence_squeeze(raw["goal"], sequence_rows, [])
        assert pattern is not None
        assert pattern.lower_bound.premise_id is None and pattern.upper_bound.premise_id is None
        assert pattern.lower_bound.conversion == f"auto_{trig}_lower"
        assert pattern.upper_bound.conversion == f"auto_{trig}_upper"
        assert build_proof_state(raw).status == "ready_for_kernel"
        source = render_request(normalize_request(raw))
        assert f"Real.neg_one_le_{trig}" in source
        assert f"Real.{trig}_le_one" in source


def test_squeeze_still_refuses_unsupported_automatic_bounds():
    state = build_proof_state(load("sequence_squeeze_auto_unsupported.json"))
    assert state.status == "needs_justification"
    assert any(item["code"] == "sequence_squeeze_evidence" for item in state.obligations)


def test_monotone_bounded_increasing_sequence_proves_only_existence_of_a_finite_limit():
    from quickmaths_formal.sequences import match_sequence_monotone_bounded

    raw = load("sequence_monotone_bounded_increasing.json")
    props = [(row["id"], row["claim"]) for row in raw["assumptions"]]
    pattern = match_sequence_monotone_bounded(raw["goal"], props)
    assert pattern is not None and pattern.mode == "monotone"
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "have hmono : Monotone f" in source
    assert "have hbdd : BddAbove (Set.range f)" in source
    assert "tendsto_atTop_ciSup hmono hbdd" in source
    assert "refine ⟨⨆ n, f n, ?_⟩" in source


def test_antitone_bounded_sequence_uses_ciInf_dual():
    from quickmaths_formal.sequences import match_sequence_monotone_bounded

    raw = load("sequence_monotone_bounded_decreasing.json")
    props = [(row["id"], row["claim"]) for row in raw["assumptions"]]
    pattern = match_sequence_monotone_bounded(raw["goal"], props)
    assert pattern is not None and pattern.mode == "antitone"
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "have hanti : Antitone f" in source
    assert "have hbdd : BddBelow (Set.range f)" in source
    assert "tendsto_atTop_ciInf hanti hbdd" in source
    assert "refine ⟨⨅ n, f n, ?_⟩" in source


def test_geometric_monotone_sequence_can_derive_missing_bound():
    raw = load("sequence_monotone_bounded_missing_bound.json")
    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "pow_le_pow_of_le_one" in source
    assert "pow_nonneg" in source


def test_monotone_bounded_auto_derives_increasing_and_decreasing_geometric_order():
    from quickmaths_formal.sequences import match_sequence_monotone_bounded

    increasing = load("sequence_monotone_bounded_auto_increasing.json")
    pattern = match_sequence_monotone_bounded(increasing["goal"], [])
    assert pattern is not None and pattern.mode == "monotone"
    assert pattern.auto_geometric is not None
    assert pattern.monotonicity_premise is None and pattern.boundedness_premise is None
    assert build_proof_state(increasing).status == "ready_for_kernel"
    assert "tendsto_atTop_ciSup" in render_request(normalize_request(increasing))

    decreasing = load("sequence_monotone_bounded_auto_decreasing.json")
    pattern = match_sequence_monotone_bounded(decreasing["goal"], [])
    assert pattern is not None and pattern.mode == "antitone"
    assert pattern.auto_geometric is not None
    assert build_proof_state(decreasing).status == "ready_for_kernel"
    assert "tendsto_atTop_ciInf" in render_request(normalize_request(decreasing))


def test_monotone_bounded_still_refuses_ratio_outside_unit_interval():
    state = build_proof_state(load("sequence_monotone_bounded_auto_bad_ratio.json"))
    assert state.status == "needs_justification"
    assert any(item["code"] == "sequence_monotone_bounded_evidence" for item in state.obligations)


def test_search_selects_rational_shift_and_monotone_bounded_rules():
    ratio = load("sequence_rational_shift.json")
    ratio["steps"] = []
    result = search_proof(ratio)
    assert any(item["rule"] == "sequence_rational_shift" for item in result["suggestions"])

    monotone = load("sequence_monotone_bounded_increasing.json")
    monotone["steps"] = []
    result = search_proof(monotone)
    suggestion = next(item for item in result["suggestions"] if item["rule"] == "sequence_monotone_bounded")
    assert suggestion["premises"] == ["h1", "h2"]


def test_search_uses_automatic_order_evidence_without_fake_premises():
    squeeze = load("sequence_squeeze_sin_auto.json")
    squeeze["steps"] = squeeze["steps"][:-1]
    result = search_proof(squeeze)
    suggestion = next(item for item in result["suggestions"] if item["rule"] == "sequence_squeeze")
    assert suggestion["premises"] == ["lower_limit", "upper_limit"]

    monotone = load("sequence_monotone_bounded_auto_increasing.json")
    monotone["steps"] = []
    result = search_proof(monotone)
    suggestion = next(item for item in result["suggestions"] if item["rule"] == "sequence_monotone_bounded")
    assert suggestion["premises"] == []


def test_public_protocol_auto_derives_geometric_order_without_assumptions(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "sequence-monotone-auto-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "As n tends to infinity, 1 - (1/2)^n tends to some finite limit.",
        "allowed_rules": ["sequence_monotone_bounded"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "sequence_monotone_bounded"
    assert verification["resolved_request"]["steps"][-1]["premises"] == []
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert "pow_le_pow_of_le_one" in verification["lean_source"]


def test_public_protocol_auto_proves_rational_shift_without_certificate(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "sequence-rational-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "As n tends to infinity, real(n) / real(n + 1) tends to 1.",
        "allowed_rules": ["sequence_rational_shift"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "sequence_rational_shift"
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None


def test_public_protocol_auto_proves_monotone_bounded_existence(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "sequence-monotone-rpc",
        "declarations": ["n:nat"],
        "assumptions": [
            "for every m:nat, for every k:nat, m <= k implies 1 - (1/2)^m <= 1 - (1/2)^k",
            "there exists B:real, for every k:nat, 1 - (1/2)^k <= B",
        ],
        "goal": "As n tends to infinity, 1 - (1/2)^n tends to some finite limit.",
        "allowed_rules": ["sequence_monotone_bounded"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "sequence_monotone_bounded"
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert "tendsto_atTop_ciSup" in verification["lean_source"]


def test_public_reference_protocol_preserves_eventual_squeeze_evidence(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "check_reference_text",
        "request_id": "sequence-squeeze-rpc",
        "declarations": ["n:nat"],
        "assumptions": [
            "eventually k:nat, -1 / real(k + 1) <= sin(real(k)) / real(k + 1)",
            "eventually k:nat, sin(real(k)) / real(k + 1) <= 1 / real(k + 1)",
        ],
        "goal": "As n tends to infinity, sin(real(n)) / real(n + 1) tends to 0.",
        "allowed_rules": ["sequence_algebra", "sequence_squeeze"],
        "reference_steps": [
            {"claim": "As n tends to infinity, -1 / real(n + 1) tends to 0.", "rule": "sequence_algebra"},
            {"claim": "As n tends to infinity, 1 / real(n + 1) tends to 0.", "rule": "sequence_algebra"},
            {
                "claim": "As n tends to infinity, sin(real(n)) / real(n + 1) tends to 0.",
                "rule": "sequence_squeeze",
                "premises": ["reference_step_1", "reference_step_2", "h1", "h2"],
            },
        ],
    })
    assert response["ok"]
    assert response["result"]["proof_state"]["status"] == "ready_for_kernel"
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert "eventually_ge_atTop" in verification["lean_source"]


def test_sequence_squeeze_missing_evidence_has_specific_repair_suggestion_outside_auto_family():
    state = build_proof_state(load("sequence_squeeze_auto_unsupported.json"))
    suggestion = next(item for item in state.suggestions if item["code"] == "sequence_squeeze_evidence")
    assert suggestion["action"] == "add_squeeze_evidence"
    assert "prove an upper sequence converges to the same target" in suggestion["evidence_hints"]


def test_sequence_monotone_missing_evidence_has_specific_repair_suggestion_outside_auto_family():
    state = build_proof_state(load("sequence_monotone_bounded_auto_bad_ratio.json"))
    suggestion = next(item for item in state.suggestions if item["code"] == "sequence_monotone_bounded_evidence")
    assert suggestion["action"] == "add_monotone_bounded_evidence"
    assert "provide a matching global upper or lower bound" in suggestion["evidence_hints"]


def test_affine_ratio_sequence_uses_leading_coefficient_limit_theorem():
    from fractions import Fraction
    from quickmaths_formal.sequences import match_sequence_affine_ratio

    raw = load("sequence_affine_ratio.json")
    pattern = match_sequence_affine_ratio(raw["goal"])
    assert pattern is not None
    assert pattern.numerator_intercept == Fraction(3)
    assert pattern.numerator_slope == Fraction(2)
    assert pattern.denominator_intercept == Fraction(7)
    assert pattern.denominator_slope == Fraction(5)
    assert pattern.target == Fraction(2, 5)
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "tendsto_add_mul_div_add_mul_atTop_nhds" in source
    assert "(by norm_num : (5 : ℝ) ≠ 0)" in source
    assert "hmain.congr'" in source


def test_affine_ratio_accepts_negative_and_rational_leading_coefficients():
    from fractions import Fraction
    from quickmaths_formal.sequences import match_sequence_affine_ratio

    negative = match_sequence_affine_ratio(load("sequence_affine_ratio_negative.json")["goal"])
    assert negative is not None
    assert negative.numerator_slope == Fraction(-2)
    assert negative.denominator_slope == Fraction(-5)
    assert negative.target == Fraction(2, 5)

    rational = match_sequence_affine_ratio(load("sequence_affine_ratio_rational.json")["goal"])
    assert rational is not None
    assert rational.numerator_slope == Fraction(1, 2)
    assert rational.denominator_slope == Fraction(3, 4)
    assert rational.target == Fraction(2, 3)
    assert build_proof_state(load("sequence_affine_ratio_rational.json")).status == "ready_for_kernel"


def test_affine_ratio_rejects_wrong_target_and_zero_denominator_leading_term():
    from quickmaths_formal.sequences import match_sequence_affine_ratio

    wrong = load("sequence_affine_ratio_wrong_target.json")
    assert match_sequence_affine_ratio(wrong["goal"]) is None
    state = build_proof_state(wrong)
    assert state.status == "needs_justification"
    assert any(item["code"] == "sequence_affine_ratio_shape" for item in state.obligations)

    zero = load("sequence_affine_ratio_zero_leading_denominator.json")
    assert match_sequence_affine_ratio(zero["goal"]) is None
    state = build_proof_state(zero)
    assert state.status == "needs_justification"
    assert any(item["code"] == "sequence_affine_ratio_shape" for item in state.obligations)


def test_search_and_public_protocol_select_affine_ratio_without_certificate(monkeypatch):
    from quickmaths_formal.search import search_proof

    raw = load("sequence_affine_ratio.json")
    raw["steps"] = []
    result = search_proof(raw)
    assert any(item["rule"] == "sequence_affine_ratio" for item in result["suggestions"])

    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "sequence-affine-ratio-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "As n tends to infinity, (2 * real(n) + 3) / (5 * real(n) + 7) tends to 2/5.",
        "allowed_rules": ["sequence_affine_ratio"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "sequence_affine_ratio"
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert "tendsto_add_mul_div_add_mul_atTop_nhds" in verification["lean_source"]


def test_quadratic_ratio_sequence_uses_vanishing_reciprocal_tails():
    from fractions import Fraction
    from quickmaths_formal.sequences import match_sequence_quadratic_ratio

    raw = load("sequence_quadratic_ratio.json")
    pattern = match_sequence_quadratic_ratio(raw["goal"])
    assert pattern is not None
    assert pattern.numerator_constant == Fraction(1)
    assert pattern.numerator_linear == Fraction(2)
    assert pattern.numerator_quadratic == Fraction(3)
    assert pattern.denominator_constant == Fraction(7)
    assert pattern.denominator_linear == Fraction(-4)
    assert pattern.denominator_quadratic == Fraction(5)
    assert pattern.target == Fraction(3, 5)
    assert build_proof_state(raw).status == "ready_for_kernel"

    source = render_request(normalize_request(raw))
    assert "tendsto_one_div_atTop_nhds_zero_nat" in source
    assert "hinv.mul hinv" in source
    assert "hnum.div hden" in source
    assert "eventually_gt_atTop (0 : ℕ)" in source
    assert "field_simp" in source


def test_quadratic_ratio_accepts_negative_factored_and_rational_coefficients():
    from fractions import Fraction
    from quickmaths_formal.sequences import match_sequence_quadratic_ratio

    negative = match_sequence_quadratic_ratio(load("sequence_quadratic_ratio_negative.json")["goal"])
    assert negative is not None
    assert negative.numerator_quadratic == Fraction(-2)
    assert negative.denominator_quadratic == Fraction(-5)
    assert negative.target == Fraction(2, 5)

    factored = match_sequence_quadratic_ratio(load("sequence_quadratic_ratio_factored.json")["goal"])
    assert factored is not None
    assert factored.numerator_constant == Fraction(-3)
    assert factored.numerator_linear == Fraction(-1)
    assert factored.numerator_quadratic == Fraction(2)
    assert factored.denominator_quadratic == Fraction(3, 2)
    assert factored.target == Fraction(4, 3)
    assert build_proof_state(load("sequence_quadratic_ratio_factored.json")).status == "ready_for_kernel"


def test_quadratic_ratio_rejects_wrong_target_and_lower_degree_cases():
    from quickmaths_formal.sequences import match_sequence_quadratic_ratio

    for name in ("sequence_quadratic_ratio_wrong_target.json", "sequence_quadratic_ratio_lower_degree.json"):
        raw = load(name)
        assert match_sequence_quadratic_ratio(raw["goal"]) is None
        state = build_proof_state(raw)
        assert state.status == "needs_justification"
        assert any(item["code"] == "sequence_quadratic_ratio_shape" for item in state.obligations)
        suggestion = next(item for item in state.suggestions if item["code"] == "sequence_quadratic_ratio_shape")
        assert suggestion["action"] == "use_supported_quadratic_asymptotic"


def test_search_and_public_protocol_select_quadratic_ratio_without_certificate(monkeypatch):
    raw = load("sequence_quadratic_ratio.json")
    raw["steps"] = []
    result = search_proof(raw)
    assert any(item["rule"] == "sequence_quadratic_ratio" for item in result["suggestions"])

    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "sequence-quadratic-ratio-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "As n tends to infinity, (3 * real(n)^2 + 2 * real(n) + 1) / (5 * real(n)^2 - 4 * real(n) + 7) tends to 3/5.",
        "allowed_rules": ["sequence_quadratic_ratio"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "sequence_quadratic_ratio"
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert "tendsto_one_div_atTop_nhds_zero_nat" in verification["lean_source"]


def test_polynomial_degree_ratio_lower_degree_tends_to_zero():
    from fractions import Fraction
    from quickmaths_formal.sequences import match_sequence_polynomial_degree_ratio

    raw = load("sequence_polynomial_degree_ratio_zero.json")
    pattern = match_sequence_polynomial_degree_ratio(raw["goal"])
    assert pattern is not None
    assert pattern.numerator_degree == 1
    assert pattern.denominator_degree == 2
    assert pattern.leading_ratio == Fraction(2, 5)
    assert pattern.result_kind == "finite"
    assert build_proof_state(raw).status == "ready_for_kernel"

    source = render_request(normalize_request(raw))
    assert "Polynomial.div_tendsto_atTop_zero_of_degree_lt" in source
    assert "compute_degree!" in source
    assert "Polynomial.eval" in source
    assert "(𝓝 0)" in source


def test_polynomial_degree_ratio_higher_degree_classifies_signed_infinity():
    from fractions import Fraction
    from quickmaths_formal.sequences import match_sequence_polynomial_degree_ratio

    positive = match_sequence_polynomial_degree_ratio(load("sequence_polynomial_degree_ratio_pos_inf.json")["goal"])
    assert positive is not None
    assert positive.numerator_degree == 2
    assert positive.denominator_degree == 1
    assert positive.leading_ratio == Fraction(2, 3)
    assert positive.result_kind == "positive_infinity"

    negative = match_sequence_polynomial_degree_ratio(load("sequence_polynomial_degree_ratio_neg_inf.json")["goal"])
    assert negative is not None
    assert negative.leading_ratio == Fraction(-2, 3)
    assert negative.result_kind == "negative_infinity"

    pos_source = render_request(normalize_request(load("sequence_polynomial_degree_ratio_pos_inf.json")))
    neg_source = render_request(normalize_request(load("sequence_polynomial_degree_ratio_neg_inf.json")))
    assert "Polynomial.div_tendsto_atTop_of_degree_gt'" in pos_source
    assert "Filter.atTop Filter.atTop" in pos_source
    assert "Polynomial.div_tendsto_atBot_of_degree_gt'" in neg_source
    assert "Filter.atTop Filter.atBot" in neg_source


def test_polynomial_degree_ratio_gap_two_uses_quadratic_growth():
    from quickmaths_formal.sequences import match_sequence_polynomial_degree_ratio

    raw = load("sequence_polynomial_degree_ratio_gap2_neg_inf.json")
    pattern = match_sequence_polynomial_degree_ratio(raw["goal"])
    assert pattern is not None
    assert pattern.numerator_degree == 2
    assert pattern.denominator_degree == 0
    assert pattern.result_kind == "negative_infinity"
    assert build_proof_state(raw).status == "ready_for_kernel"

    source = render_request(normalize_request(raw))
    assert "Polynomial.div_tendsto_atBot_of_degree_gt'" in source
    assert "compute_degree!" in source
    assert "qPoly.degree < pPoly.degree" in source


def test_polynomial_degree_ratio_rejects_wrong_target_sign_and_equal_degree():
    from quickmaths_formal.sequences import match_sequence_polynomial_degree_ratio

    for name in (
        "sequence_polynomial_degree_ratio_wrong_sign.json",
        "sequence_polynomial_degree_ratio_wrong_zero_target.json",
        "sequence_polynomial_degree_ratio_equal_degree.json",
    ):
        raw = load(name)
        assert match_sequence_polynomial_degree_ratio(raw["goal"]) is None
        state = build_proof_state(raw)
        assert state.status == "needs_justification"
        assert any(item["code"] == "sequence_polynomial_degree_ratio_shape" for item in state.obligations)
        suggestion = next(item for item in state.suggestions if item["code"] == "sequence_polynomial_degree_ratio_shape")
        assert suggestion["action"] == "use_supported_degree_comparison_asymptotic"


def test_search_and_public_protocol_select_degree_comparison_without_certificate(monkeypatch):
    raw = load("sequence_polynomial_degree_ratio_zero.json")
    raw["steps"] = []
    result = search_proof(raw)
    assert any(item["rule"] == "sequence_polynomial_degree_ratio" for item in result["suggestions"])

    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "sequence-degree-ratio-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "As n tends to infinity, (2 * real(n)^2 + 1) / (3 * real(n) + 4) tends to +infinity.",
        "allowed_rules": ["sequence_polynomial_degree_ratio"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "sequence_polynomial_degree_ratio"
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert "Polynomial.div_tendsto_atTop_of_degree_gt'" in verification["lean_source"]


def test_general_polynomial_ratio_equal_high_degree_uses_mathlib_polynomial():
    from fractions import Fraction
    from quickmaths_formal.sequences import match_sequence_polynomial_degree_ratio

    raw = load("sequence_polynomial_general_equal_degree.json")
    pattern = match_sequence_polynomial_degree_ratio(raw["goal"])
    assert pattern is not None
    assert pattern.numerator_degree == 5
    assert pattern.denominator_degree == 5
    assert pattern.leading_ratio == Fraction(3, 2)
    assert pattern.result_kind == "finite"
    assert build_proof_state(raw).status == "ready_for_kernel"

    source = render_request(normalize_request(raw))
    assert "Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq" in source
    assert "hpPolyLead" in source and "hqPolyLead" in source
    assert "compute_degree!" in source
    assert "tendsto_natCast_atTop_atTop" in source


def test_general_polynomial_ratio_expands_factored_high_degree_exactly():
    from fractions import Fraction
    from quickmaths_formal.sequences import match_sequence_polynomial_degree_ratio

    raw = load("sequence_polynomial_general_lower_degree.json")
    pattern = match_sequence_polynomial_degree_ratio(raw["goal"])
    assert pattern is not None
    assert pattern.numerator_degree == 3
    assert pattern.denominator_degree == 6
    assert pattern.numerator_coefficients == (Fraction(1), Fraction(3), Fraction(3), Fraction(1))
    assert pattern.denominator_coefficients[6] == 2
    assert build_proof_state(raw).status == "ready_for_kernel"

    source = render_request(normalize_request(raw))
    assert "Polynomial.X ^ 6" in source
    assert "Polynomial.div_tendsto_atTop_zero_of_degree_lt" in source


def test_general_polynomial_ratio_high_degree_signed_divergence():
    from fractions import Fraction
    from quickmaths_formal.sequences import match_sequence_polynomial_degree_ratio

    raw = load("sequence_polynomial_general_pos_inf.json")
    pattern = match_sequence_polynomial_degree_ratio(raw["goal"])
    assert pattern is not None
    assert pattern.numerator_degree == 7
    assert pattern.denominator_degree == 3
    assert pattern.leading_ratio == Fraction(2)
    assert pattern.result_kind == "positive_infinity"

    source = render_request(normalize_request(raw))
    assert "Polynomial.div_tendsto_atTop_of_degree_gt'" in source
    assert "Polynomial.X ^ 7" in source


def test_general_polynomial_ratio_rejects_wrong_target_zero_denominator_and_degree_overflow():
    from quickmaths_formal.sequences import match_sequence_polynomial_degree_ratio

    for name in (
        "sequence_polynomial_general_wrong_equal_target.json",
        "sequence_polynomial_general_zero_denominator.json",
        "sequence_polynomial_general_degree_overflow.json",
    ):
        raw = load(name)
        assert match_sequence_polynomial_degree_ratio(raw["goal"]) is None
        state = build_proof_state(raw)
        assert state.status == "needs_justification"
        assert any(item["code"] == "sequence_polynomial_degree_ratio_shape" for item in state.obligations)


def test_alternating_sequence_has_no_finite_limit_via_parity_subsequences():
    raw = load("sequence_alternating_no_finite.json")
    pattern = match_sequence_elementary_divergence(raw["goal"])
    assert pattern is not None and pattern.mode == "alternating_affine"
    assert pattern.offset == 0 and pattern.scale == 1
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "hevenIndex" in source and "hoddIndex" in source
    assert "tendsto_nhds_unique" in source
    assert "hdistinct" in source


def test_nonconstant_affine_transform_of_alternating_sequence_also_diverges():
    raw = load("sequence_alternating_affine_no_finite.json")
    pattern = match_sequence_elementary_divergence(raw["goal"])
    assert pattern is not None and pattern.mode == "alternating_affine"
    assert pattern.offset == 3 and pattern.scale == 2
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "(5 : ℝ)" in source and "(1 : ℝ)" in source


def test_positive_geometric_growth_is_classified_as_plus_infinity():
    raw = load("sequence_geometric_two_pos_inf.json")
    pattern = match_sequence_elementary_divergence(raw["goal"])
    assert pattern is not None and pattern.mode == "geometric_pos_inf"
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "tendsto_pow_atTop_atTop_of_one_lt" in source
    assert "Filter.atTop Filter.atTop" in source


def test_geometric_growth_can_be_classified_as_no_finite_limit_too():
    positive = load("sequence_geometric_two_no_finite.json")
    negative = load("sequence_geometric_negative_two_no_finite.json")
    assert match_sequence_elementary_divergence(positive["goal"]).mode == "geometric_no_finite_pos"
    assert match_sequence_elementary_divergence(negative["goal"]).mode == "geometric_no_finite_abs"
    assert build_proof_state(positive).status == "ready_for_kernel"
    assert build_proof_state(negative).status == "ready_for_kernel"
    source = render_request(normalize_request(negative))
    assert "continuous_abs.tendsto" in source
    assert "abs_pow" in source
    assert "not_tendsto_nhds_of_tendsto_atTop" in source


def test_false_elementary_divergence_classifications_are_rejected():
    for name in [
        "sequence_alternating_wrong_infinity.json",
        "sequence_geometric_half_wrong_no_finite.json",
        "sequence_geometric_one_wrong_no_finite.json",
    ]:
        raw = load(name)
        assert match_sequence_elementary_divergence(raw["goal"]) is None
        state = build_proof_state(raw)
        assert state.status == "needs_justification"
        assert any(item["code"] == "sequence_elementary_divergence_shape" for item in state.obligations)


def test_search_and_public_protocol_select_elementary_divergence(monkeypatch):
    raw = load("sequence_alternating_no_finite.json")
    raw["steps"] = []
    result = search_proof(raw)
    assert any(item["rule"] == "sequence_elementary_divergence" for item in result["suggestions"])
    augmented, suggestion = build_auto_request(raw)
    assert suggestion is not None and suggestion.rule == "sequence_elementary_divergence"
    assert build_proof_state(augmented).status == "ready_for_kernel"

    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "sequence-divergence-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "As n tends to infinity, (-1)^n does not converge to a finite real limit.",
        "allowed_rules": ["sequence_elementary_divergence"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "sequence_elementary_divergence"
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert "¬ ∃ l : ℝ" in verification["lean_source"]

def test_periodic_piecewise_sequences_use_distinct_residue_subsequences():
    cases = [
        ("sequence_periodic_mod2_piecewise_no_finite.json", 2, 0, 1, 7, -3),
        ("sequence_periodic_mod3_no_finite.json", 3, 0, 1, 0, 1),
        ("sequence_periodic_mod4_no_finite.json", 4, 0, 2, 1, 5),
    ]
    for name, period, residue_a, residue_b, value_a, value_b in cases:
        raw = load(name)
        pattern = match_sequence_elementary_divergence(raw["goal"])
        assert pattern is not None and pattern.mode == "periodic_residue"
        assert (pattern.period, pattern.residue_a, pattern.residue_b) == (period, residue_a, residue_b)
        assert (pattern.value_a, pattern.value_b) == (value_a, value_b)
        assert build_proof_state(raw).status == "ready_for_kernel"
        source = render_request(normalize_request(raw))
        assert f"{period} * k + {residue_a}" in source
        assert f"{period} * k + {residue_b}" in source
        assert "Nat.add_mod" in source and "Nat.mul_mod_right" in source
        assert "tendsto_nhds_unique" in source


def test_periodic_divergence_refuses_constant_large_period_and_nonperiodic_drift():
    for name in [
        "sequence_periodic_constant_wrong_no_finite.json",
        "sequence_periodic_mod5_unsupported.json",
        "sequence_periodic_with_drift_unsupported.json",
    ]:
        raw = load(name)
        assert match_sequence_elementary_divergence(raw["goal"]) is None
        state = build_proof_state(raw)
        assert state.status == "needs_justification"
        assert any(item["code"] == "sequence_elementary_divergence_shape" for item in state.obligations)


def test_public_protocol_selects_period_three_divergence(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "sequence-periodic-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "As n tends to infinity, if n % 3 = 0 then 0 else if n % 3 = 1 then 1 else 2 does not converge to a finite real limit.",
        "allowed_rules": ["sequence_elementary_divergence"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "sequence_elementary_divergence"
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert "3 * k + 1" in verification["lean_source"]



def test_periodic_oscillation_survives_premise_free_finite_tails():
    cases = [
        ("sequence_alternating_vanishing_reciprocal_no_finite.json", 2, 1, -1, "reciprocal_shift"),
        ("sequence_periodic_mod3_vanishing_reciprocal_no_finite.json", 3, 0, 1, "reciprocal_shift"),
        ("sequence_periodic_mod4_vanishing_geometric_no_finite.json", 4, 1, 5, "neg"),
    ]
    for name, period, value_a, value_b, tail_kind in cases:
        raw = load(name)
        pattern = match_sequence_elementary_divergence(raw["goal"])
        assert pattern is not None and pattern.mode == "periodic_finite_tail"
        assert pattern.period == period
        assert (pattern.value_a, pattern.value_b) == (value_a, value_b)
        assert pattern.finite_tail is not None
        assert pattern.finite_tail.root.kind == tail_kind
        assert not pattern.finite_tail.used_sequence_premises
        assert build_proof_state(raw).status == "ready_for_kernel"

        source = render_request(normalize_request(raw))
        assert "have htail" in source
        assert "have hATail" in source and "have hBTail" in source
        assert "have hAExpected" in source and "have hBExpected" in source
        assert "tendsto_nhds_unique" in source


def test_periodic_finite_tail_renderer_reuses_existing_sequence_algebra():
    reciprocal = render_request(normalize_request(load("sequence_alternating_vanishing_reciprocal_no_finite.json")))
    assert "div_atTop" in reciprocal
    assert "tendsto_natCast_atTop_atTop" in reciprocal

    geometric = render_request(normalize_request(load("sequence_periodic_mod4_vanishing_geometric_no_finite.json")))
    assert "tendsto_pow_atTop_nhds_zero_of_abs_lt_one" in geometric
    assert "finite_tail_sequence_guard_1" in geometric
    assert "Nat.add_mod" in geometric and "Nat.mul_mod_right" in geometric


def test_periodic_oscillation_accepts_common_nonzero_finite_tail_limits():
    cases = [
        ("sequence_alternating_finite_reciprocal_no_finite.json", {"kind": "int", "value": 2}),
        ("sequence_periodic_mod3_finite_reciprocal_no_finite.json", {"kind": "int", "value": 5}),
        ("sequence_periodic_mod4_finite_symbolic_no_finite.json", {"kind": "sin", "arg": {"kind": "int", "value": 1}}),
    ]
    for name, expected_target in cases:
        raw = load(name)
        pattern = match_sequence_elementary_divergence(raw["goal"])
        assert pattern is not None and pattern.mode == "periodic_finite_tail"
        assert pattern.finite_tail is not None
        assert pattern.finite_tail.target == expected_target
        assert not pattern.finite_tail.used_sequence_premises
        assert build_proof_state(raw).status == "ready_for_kernel"

        source = render_request(normalize_request(raw))
        assert "have htail" in source
        assert "have hshiftDistinct" in source
        assert "add_right_cancel" in source
        assert "tendsto_nhds_unique" in source


def test_periodic_finite_tail_renderer_shifts_both_residue_limits_by_same_target():
    source = render_request(normalize_request(load("sequence_alternating_finite_reciprocal_no_finite.json")))
    assert "(𝓝 (2 : ℝ))" in source
    assert "(1 : ℝ) + (2 : ℝ)" in source
    assert "(-1 : ℝ) + (2 : ℝ)" in source
    assert "hbaseDistinct" in source and "hshiftDistinct" in source

    symbolic = render_request(normalize_request(load("sequence_periodic_mod4_finite_symbolic_no_finite.json")))
    assert "Real.sin (1)" in symbolic
    assert "finite_tail_sequence_guard_1" in symbolic


def test_periodic_finite_tail_refuses_nonconvergent_or_undefined_tails():
    for name in [
        "sequence_alternating_growing_tail_unsupported.json",
        "sequence_alternating_finite_plus_growing_tail_unsupported.json",
        "sequence_alternating_unsafe_reciprocal_tail_unsupported.json",
    ]:
        raw = load(name)
        assert match_sequence_elementary_divergence(raw["goal"]) is None
        state = build_proof_state(raw)
        assert state.status == "needs_justification"
        assert any(item["code"] == "sequence_elementary_divergence_shape" for item in state.obligations)


def test_public_protocol_selects_alternating_plus_finite_tail(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "sequence-periodic-finite-tail-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "As n tends to infinity, (-1)^n + (2 + 1 / real(n + 1)) does not converge to a finite real limit.",
        "allowed_rules": ["sequence_elementary_divergence"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "sequence_elementary_divergence"
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert "have htail" in verification["lean_source"]
    assert "hshiftDistinct" in verification["lean_source"]


def test_periodic_divergence_reuses_cited_finite_tail_limit():
    raw = load("sequence_periodic_cited_finite_tail_no_finite.json")
    normalized = normalize_request(raw)
    tail_step, divergence_step = normalized["steps"]
    rows = [(tail_step["id"], tail_step["claim"])]

    pattern = match_sequence_elementary_divergence(normalized["goal"], rows)
    assert pattern is not None and pattern.mode == "periodic_finite_tail"
    assert pattern.finite_tail is not None
    assert pattern.finite_tail.used_sequence_premises == ("tail_limit",)
    assert pattern.finite_tail.target == {"kind": "int", "value": 1}
    assert build_proof_state(raw).status == "ready_for_kernel"

    source = render_request(normalized)
    assert "have htail" in source
    assert "exact tail_limit" in source
    assert "have hATail" in source and "have hBTail" in source
    assert "add_right_cancel" in source


def test_periodic_divergence_requires_exact_cited_tail_expression():
    missing = load("sequence_periodic_cited_finite_tail_missing.json")
    assert match_sequence_elementary_divergence(missing["goal"]) is None
    missing_state = build_proof_state(missing)
    assert missing_state.status == "needs_justification"
    assert any(item["code"] == "sequence_elementary_divergence_shape" for item in missing_state.obligations)

    wrong = normalize_request(load("sequence_periodic_cited_finite_tail_wrong_citation.json"))
    other = wrong["steps"][0]
    assert match_sequence_elementary_divergence(wrong["goal"], [(other["id"], other["claim"])]) is None
    wrong_state = build_proof_state(wrong)
    assert wrong_state.status == "needs_justification"
    assert any(item["code"] == "sequence_elementary_divergence_shape" for item in wrong_state.obligations)


def test_search_cites_existing_finite_tail_step_for_periodic_divergence():
    raw = load("sequence_periodic_cited_finite_tail_no_finite.json")
    raw["steps"] = raw["steps"][:1]
    result = search_proof(raw)
    candidates = [row for row in result["suggestions"] if row["rule"] == "sequence_elementary_divergence"]
    assert candidates
    assert candidates[0]["premises"] == ["tail_limit"]
    assert "cited finite limit" in candidates[0]["explanation"]


def test_eventually_periodic_prefix_is_ignored_at_nat_at_top():
    cases = [
        ("sequence_eventually_periodic_mod3_no_finite.json", 5, 3, 0, 1),
        ("sequence_eventually_alternating_no_finite.json", 4, 2, 0, 1),
    ]
    for name, cutoff, period, residue_a, residue_b in cases:
        raw = load(name)
        pattern = match_sequence_elementary_divergence(raw["goal"])
        assert pattern is not None and pattern.mode == "eventually_periodic_residue"
        assert pattern.eventual_cutoff == cutoff
        assert pattern.period == period
        assert (pattern.residue_a, pattern.residue_b) == (residue_a, residue_b)
        assert pattern.periodic_core is not None
        assert build_proof_state(raw).status == "ready_for_kernel"

        source = render_request(normalize_request(raw))
        assert f"eventually_ge_atTop {cutoff}" in source
        assert "have hcore" in source
        assert "hlim.congr'" in source
        assert "tendsto_nhds_unique" in source


def test_eventually_periodic_rule_refuses_constant_tail_and_unscoped_cutoff_syntax():
    for name in [
        "sequence_eventually_constant_wrong_no_finite.json",
        "sequence_eventually_periodic_le_cutoff_unsupported.json",
    ]:
        raw = load(name)
        assert match_sequence_elementary_divergence(raw["goal"]) is None
        state = build_proof_state(raw)
        assert state.status == "needs_justification"
        assert any(item["code"] == "sequence_elementary_divergence_shape" for item in state.obligations)


def test_public_protocol_selects_eventually_periodic_divergence(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "sequence-eventually-periodic-rpc",
        "declarations": ["n:nat"],
        "assumptions": [],
        "goal": "As n tends to infinity, if n < 5 then n else if n % 3 = 0 then 0 else if n % 3 = 1 then 1 else 2 does not converge to a finite real limit.",
        "allowed_rules": ["sequence_elementary_divergence"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["resolved_request"]["steps"][-1]["rule"] == "sequence_elementary_divergence"
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert "eventually_ge_atTop 5" in verification["lean_source"]
