from __future__ import annotations

from quickmaths_formal.authoring import build_text_request
from quickmaths_formal.calculus import match_recursive_derivative
from quickmaths_formal.lean import render_request
from quickmaths_formal.search import build_auto_request, search_proof
from quickmaths_formal.state import build_proof_state


def request(goal: str, *, assumptions: list[str] | None = None):
    return build_text_request(
        request_id="recursive-derivative-test",
        variables={"x": "real", "a": "real"},
        goal_text=goal,
        assumptions=assumptions or [],
        allowed_rules=["recursive_derivative"],
    )


def auto(goal: str, *, assumptions: list[str] | None = None):
    raw = request(goal, assumptions=assumptions)
    augmented, suggestion = build_auto_request(raw)
    return raw, augmented, suggestion


def test_nested_sin_exp_chain_rule_is_planned_structurally():
    raw, augmented, suggestion = auto(
        "The derivative of sin(exp(x^2)) with respect to x at 1 is 2*exp(1)*cos(exp(1))."
    )
    assert match_recursive_derivative(raw["goal"])
    assert suggestion is not None and suggestion.rule == "recursive_derivative"
    assert suggestion.premises == []
    state = build_proof_state(augmented)
    assert state.status == "ready_for_kernel"
    source = render_request(augmented)
    assert ".fun_pow 2" in source
    assert ".exp" in source
    assert ".sin" in source


def test_nested_exp_quotient_uses_exact_nonzero_guard():
    raw, augmented, suggestion = auto(
        "The derivative of exp((x^2 + 1)/(x - 1)) with respect to x at 2 is -exp(5)."
    )
    assert suggestion is not None and suggestion.rule == "recursive_derivative"
    assert suggestion.premises == []
    source = render_request(augmented)
    assert "≠ 0 := by norm_num" in source
    assert ".fun_div" in source
    assert ".exp" in source


def test_nested_sqrt_of_quotient_accumulates_both_exact_guards():
    raw, augmented, suggestion = auto(
        "The derivative of sqrt((x^2 + 1)/(x + 1)) with respect to x at 1 is 1/4."
    )
    assert suggestion is not None and suggestion.rule == "recursive_derivative"
    pattern = match_recursive_derivative(raw["goal"])[0]
    relations = {guard.relation for guard in pattern.guards}
    assert relations == {"nonzero", "positive"}
    source = render_request(augmented)
    assert ".fun_div" in source
    assert ".sqrt" in source
    assert source.count(":= by norm_num") >= 2


def test_nested_log_abs_negative_branch_is_exact_and_guarded():
    raw, augmented, suggestion = auto(
        "The derivative of log(abs(x)) with respect to x at -2 is -(1/2)."
    )
    assert suggestion is not None and suggestion.rule == "recursive_derivative"
    pattern = match_recursive_derivative(raw["goal"])[0]
    assert {guard.relation for guard in pattern.guards} == {"positive", "negative"}
    source = render_request(augmented)
    assert "hasDerivAt_abs_neg" in source
    assert ".log" in source


def test_symbolic_absolute_value_branch_requires_cited_sign():
    raw = request(
        "The derivative of abs(sin(x)) with respect to x at a is cos(a).",
        assumptions=["0 < sin(a)"],
    )
    result = search_proof(raw)
    suggestion = next(item for item in result["suggestions"] if item["rule"] == "recursive_derivative")
    assert suggestion["premises"] == ["h1"]
    augmented, _ = build_auto_request(raw)
    source = render_request(augmented)
    assert "hasDerivAt_abs_pos h1" in source
    assert ".sin" in source


def test_symbolic_absolute_value_negative_branch_requires_matching_sign():
    raw = request(
        "The derivative of abs(sin(x)) with respect to x at a is -cos(a).",
        assumptions=["sin(a) < 0"],
    )
    result = search_proof(raw)
    suggestion = next(item for item in result["suggestions"] if item["rule"] == "recursive_derivative")
    assert suggestion["premises"] == ["h1"]


def test_missing_symbolic_abs_sign_is_not_suggested_and_surfaces_obligation():
    raw = request("The derivative of abs(sin(x)) with respect to x at a is cos(a).")
    result = search_proof(raw)
    assert all(item["rule"] != "recursive_derivative" for item in result["suggestions"])
    manual = {**raw, "steps": [{"id": "d", "scope": "root", "claim": raw["goal"], "rule": "recursive_derivative", "premises": [], "parameters": {}}]}
    state = build_proof_state(manual)
    assert state.status == "needs_justification"
    assert any(item["code"] == "recursive_derivative_positive" for item in state.obligations)


def test_exact_abs_kink_is_rejected_before_kernel():
    raw = request("The derivative of abs(x) with respect to x at 0 is 0.")
    manual = {**raw, "steps": [{"id": "d", "scope": "root", "claim": raw["goal"], "rule": "recursive_derivative", "premises": [], "parameters": {}}]}
    state = build_proof_state(manual)
    assert state.status == "needs_justification"
    assert any(item["code"] in {"recursive_derivative_shape", "recursive_derivative_domain_violation"} for item in state.obligations)
    assert all(item["rule"] != "recursive_derivative" for item in search_proof(raw)["suggestions"])


def test_wrong_recursive_derivative_formula_is_rejected_as_shape():
    raw = request(
        "The derivative of sin(exp(x^2)) with respect to x at 1 is exp(1)*cos(exp(1))."
    )
    assert not match_recursive_derivative(raw["goal"])
    manual = {**raw, "steps": [{"id": "d", "scope": "root", "claim": raw["goal"], "rule": "recursive_derivative", "premises": [], "parameters": {}}]}
    state = build_proof_state(manual)
    assert any(item["code"] == "recursive_derivative_shape" for item in state.obligations)


def test_piecewise_and_arbitrary_function_application_remain_outside_recursive_fragment():
    piecewise = request(
        "The derivative of if x < 0 then -x else x with respect to x at 1 is 1."
    )
    assert not match_recursive_derivative(piecewise["goal"])


def test_structural_positive_log_exp_guard_is_delegated_to_lean_positivity():
    raw, augmented, suggestion = auto(
        "The derivative of log(exp(x)) with respect to x at a is 1."
    )
    assert suggestion is not None and suggestion.rule == "recursive_derivative"
    assert suggestion.premises == []
    source = render_request(augmented)
    assert "0 < ((Real.exp (a)) : ℝ) := by positivity" in source
    assert ".exp" in source and ".log" in source
    assert build_proof_state(augmented).status == "ready_for_kernel"


def test_structural_positive_polynomial_guards_need_no_manual_assumption():
    raw, augmented, suggestion = auto(
        "The derivative of sqrt(x^2 + 1) with respect to x at a is a/sqrt(a^2 + 1)."
    )
    assert suggestion is not None and suggestion.rule == "recursive_derivative"
    assert suggestion.premises == []
    source = render_request(augmented)
    assert ":= by positivity" in source
    assert ".sqrt" in source


def test_unknown_sign_is_not_promoted_to_automatic_positivity():
    raw = request(
        "The derivative of sqrt(x) with respect to x at a is 1/(2*sqrt(a))."
    )
    result = search_proof(raw)
    assert all(item["rule"] != "recursive_derivative" for item in result["suggestions"])
    assert result["status"] == "needs_domain"


def test_sqrt_nonzero_helper_is_emitted_only_for_sqrt_nodes():
    _, sqrt_augmented, _ = auto(
        "The derivative of sqrt(x^2 + 1) with respect to x at a is a/sqrt(a^2 + 1)."
    )
    sqrt_source = render_request(sqrt_augmented)
    assert "_sqrt_nonzero" in sqrt_source

    _, log_augmented, _ = auto(
        "The derivative of log(exp(x)) with respect to x at a is 1."
    )
    log_source = render_request(log_augmented)
    assert "_sqrt_nonzero" not in log_source

    abs_raw = request(
        "The derivative of abs(sin(x)) with respect to x at a is cos(a).",
        assumptions=["0 < sin(a)"],
    )
    abs_augmented, _ = build_auto_request(abs_raw)
    assert "_sqrt_nonzero" not in render_request(abs_augmented)
