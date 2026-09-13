from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .contract import canonical_hash
from .calculus import (
    abs_argument_exact_sign,
    continuity_guard_auto_tactic,
    continuity_guard_exact_status,
    continuity_pattern_status,
    continuous_ivt_guard_status,
    interval_guard_expected_claim,
    elementary_argument_is_exact_positive,
    match_abs_derivative,
    match_conjugate_limit,
    match_continuity_limit,
    match_continuous_ivt_existence,
    match_elementary_derivative,
    match_ivt_existence,
    match_piecewise_jump,
    match_polynomial_derivative,
    match_quotient_derivative,
    quotient_denominator_is_exact_nonzero,
    match_recursive_derivative,
    match_sqrt_derivative,
    select_continuous_ivt_orientation,
    select_recursive_derivative_pattern,
    sqrt_radicand_is_exact_positive,
)
from .logic import proposition_of, same as same_logic, scope_variable_types, substitute_prop, witness_type_compatible
from .limits import limit_algebra_status, match_limit_algebra
from .series import match_geometric_series, match_p_series, match_series_comparison, match_series_ratio_test, match_series_ratio_limit_test, match_series_root_test
from .sequences import (
    match_nat_at_top, match_sequence_affine_ratio, match_sequence_algebra, match_sequence_elementary_divergence, match_sequence_monotone_bounded,
    match_sequence_polynomial_degree_ratio, match_sequence_quadratic_ratio, match_sequence_rational_shift,
    match_sequence_squeeze, sequence_algebra_status,
)
from .semantics import claim_available, negative, nonnegative, nonzero, positive, requirements_for_goal, root_context, unmet_goal_requirements
from .symbolic import equivalent_expr, exact_rational_value, is_polynomial_identity, is_rational_identity, relation_prop, variables_for
from .typing import function_type_parts, infer_expr_type, set_element_type

SUPPORTED_RULES = {
    "ring_identity",
    "field_identity",
    "guarded_cancel",
    "sqrt_square_nonnegative",
    "conjugate_identity",
    "inverse_one_sided_limit",
    "rational_hole_limit",
    "conjugate_limit",
    "piecewise_jump",
    "continuity_limit",
    "limit_algebra",
    "series_geometric",
    "series_p_series",
    "series_comparison",
    "series_ratio_test",
    "series_ratio_limit_test",
    "series_root_test",
    "sequence_algebra",
    "sequence_nat_at_top",
    "sequence_squeeze",
    "sequence_monotone_bounded",
    "sequence_elementary_divergence",
    "sequence_affine_ratio",
    "sequence_quadratic_ratio",
    "sequence_polynomial_degree_ratio",
    "sequence_rational_shift",
    "ivt_exists",
    "continuous_ivt_exists",
    "ivt_unique",
    "polynomial_derivative",
    "quotient_derivative",
    "sqrt_derivative",
    "abs_derivative",
    "exp_derivative",
    "log_derivative",
    "sin_derivative",
    "cos_derivative",
    "recursive_derivative",
    "norm_num",
    "linarith",
    "nlinarith",
    "positivity",
    "assumption",
    "exact",
    "eq_refl",
    "eq_symm",
    "eq_trans",
    "add_both_sides",
    "subtract_both_sides",
    "multiply_both_sides",
    "divide_both_sides",
    "square_both_sides",
    "add_inequality",
    "scale_inequality_positive",
    "scale_inequality_negative",
    "sub_ne_zero_from_ne",
    "true_intro",
    "and_intro",
    "and_elim_left",
    "and_elim_right",
    "or_intro_left",
    "or_intro_right",
    "modus_ponens",
    "iff_intro",
    "iff_mp",
    "iff_mpr",
    "contradiction",
    "false_elim",
    "exists_intro",
    "forall_elim",
    "imp_intro",
    "not_intro",
    "or_elim",
    "forall_intro",
    "exists_elim",
    "nat_induction",
    "function_ext",
    "set_ext",
    "subset_intro",
    "subset_elim",
    "eq_subst",
    "congr_arg",
}


@dataclass(frozen=True)
class Obligation:
    step_id: str
    code: str
    message: str
    expected_claim: dict[str, Any] | None = None


def _proof_claims(request: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for row in request["assumptions"]:
        result[row["id"]] = {"kind": "proposition", "proposition": row["claim"]}
    for row in request["steps"]:
        result[row["id"]] = row["claim"]
    return result


def _same(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return same_logic(left, right)


def _scope_ancestors(scope_parent: dict[str, str | None], scope: str) -> set[str]:
    result: set[str] = set()
    current: str | None = scope
    while current is not None:
        result.add(current)
        current = scope_parent[current]
    return result


def _premise_props(premises: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [item["proposition"] for item in premises if item.get("kind") == "proposition"]


def _require_cited_claim(
    obligations: list[Obligation],
    step: dict[str, Any],
    premises: list[dict[str, Any]],
    expected: dict[str, Any],
    *,
    code: str,
    message: str,
) -> None:
    wrapped = {"kind": "proposition", "proposition": expected}
    if not any(_same(item, wrapped) for item in premises):
        obligations.append(Obligation(step["id"], code, message, wrapped))


def _source_relation(step: dict[str, Any], premises: list[dict[str, Any]], obligations: list[Obligation]) -> tuple[dict[str, Any], dict[str, Any]] | None:
    target = relation_prop(step["claim"])
    relations = [relation_prop(item) for item in premises]
    relations = [item for item in relations if item is not None]
    if target is None or not relations:
        obligations.append(
            Obligation(step["id"], "relation_premise_required", "This transformation needs a cited equation/inequality and a relational claim.")
        )
        return None
    same_kind = [item for item in relations if item.get("kind") == target.get("kind")]
    return (same_kind[0] if same_kind else relations[0]), target


def _validate_same_operation(
    step: dict[str, Any],
    premises: list[dict[str, Any]],
    obligations: list[Obligation],
    symbols,
    operation: str,
) -> None:
    pair = _source_relation(step, premises, obligations)
    if pair is None:
        return
    source, target = pair
    if source["kind"] != target["kind"]:
        obligations.append(Obligation(step["id"], "relation_changed", "This operation must preserve the relation symbol."))
        return
    term = step["parameters"].get("term")
    if not isinstance(term, dict):
        obligations.append(Obligation(step["id"], "missing_term", f"{operation} requires the common term to be identified."))
        return
    left_expected = {"kind": operation, "left": source["left"], "right": term}
    right_expected = {"kind": operation, "left": source["right"], "right": term}
    if not equivalent_expr(left_expected, target["left"], symbols) or not equivalent_expr(right_expected, target["right"], symbols):
        obligations.append(
            Obligation(step["id"], "invalid_transformation", "The claimed line is not obtained by applying the same operation to both sides.")
        )


def preflight(request: dict[str, Any]) -> list[Obligation]:
    claims = _proof_claims(request)
    obligations: list[Obligation] = []
    scope_parent = {row["id"]: row["parent"] for row in request["scopes"]}
    assumption_rows = {row["id"]: row for row in request["assumptions"]}
    step_rows = {row["id"]: row for row in request["steps"]}
    node_scope = {**{key: row["scope"] for key, row in assumption_rows.items()}, **{key: row["scope"] for key, row in step_rows.items()}}

    for step in request["steps"]:
        symbols = variables_for(request, step["scope"])
        rule = step["rule"]
        if rule not in SUPPORTED_RULES:
            obligations.append(
                Obligation(step["id"], "unsupported_rule", f"Rule {rule!r} is not supported by the current registry.")
            )
            continue
        premises = [claims[p] for p in step["premises"]]
        premise_props = _premise_props(premises)

        if rule == "ring_identity":
            prop = relation_prop(step["claim"])
            if prop is None or prop.get("kind") != "eq" or not is_polynomial_identity(prop, symbols):
                obligations.append(Obligation(step["id"], "not_ring_identity", "The claimed equality is not a polynomial identity."))

        if rule in {"guarded_cancel", "field_identity"}:
            prop = relation_prop(step["claim"])
            if prop is None or prop.get("kind") != "eq" or not is_rational_identity(prop, symbols):
                obligations.append(Obligation(step["id"], "not_rational_identity", "The claimed equality does not hold as a rational identity on its guarded domain."))
            for requirement in requirements_for_goal(step["claim"], source=step["id"]):
                if requirement.code != "denominator_nonzero":
                    continue
                if not claim_available(requirement.claim, premise_props):
                    obligations.append(
                        Obligation(step["id"], "nonzero_required", "Rational simplification needs a cited proof for every denominator that may be zero.", {"kind": "proposition", "proposition": requirement.claim})
                    )
            if rule == "guarded_cancel":
                divisor = step["parameters"].get("divisor")
                if not isinstance(divisor, dict):
                    obligations.append(Obligation(step["id"], "missing_divisor", "Cancellation must identify the divisor being cancelled."))
                else:
                    _require_cited_claim(
                        obligations,
                        step,
                        premises,
                        nonzero(divisor),
                        code="nonzero_required",
                        message="Cancellation needs a cited proof that the cancelled divisor is nonzero in this scope.",
                    )

        if rule in {"sqrt_square_nonnegative", "conjugate_identity"}:
            key = "argument" if rule == "sqrt_square_nonnegative" else "radicand"
            argument = step["parameters"].get(key)
            if not isinstance(argument, dict):
                obligations.append(Obligation(step["id"], "missing_argument", "Square-root reasoning must identify its radicand/argument."))
            else:
                _require_cited_claim(
                    obligations,
                    step,
                    premises,
                    nonnegative(argument),
                    code="nonnegative_required",
                    message="Square-root reasoning needs a cited proof that the radicand/argument is nonnegative.",
                )

        if rule == "conjugate_limit":
            if match_conjugate_limit(step["claim"]) is None:
                obligations.append(Obligation(
                    step["id"],
                    "conjugate_limit_shape",
                    "The conjugate-limit rule currently supports (sqrt(x)-c)/(x-c^2) on x >= 0 at c^2 with c > 0 and target 1/(2c).",
                ))

        if rule == "piecewise_jump":
            if match_piecewise_jump(step["claim"]) is None:
                obligations.append(Obligation(
                    step["id"],
                    "piecewise_jump_shape",
                    "The jump rule currently requires a two-sided limit of if x < a then L else R with exact unequal rational branch values.",
                ))

        if rule == "inverse_one_sided_limit":
            claim = step["claim"]
            expected_direction = step["parameters"].get("direction")
            if claim.get("kind") != "limit" or expected_direction not in {"left", "right"} or claim.get("direction") != expected_direction:
                obligations.append(Obligation(step["id"], "wrong_direction", "The selected one-sided limit rule does not match the claimed approach direction."))
            else:
                expected_result = "positive_infinity" if expected_direction == "right" else "negative_infinity"
                if claim.get("result", {}).get("kind") != expected_result:
                    obligations.append(Obligation(step["id"], "wrong_infinity_sign", "The inverse function has opposite infinite behavior on the other side of zero."))

        if rule == "rational_hole_limit":
            claim = step["claim"]
            if claim.get("kind") != "limit" or claim.get("direction") != "both" or claim.get("result", {}).get("kind") != "finite":
                obligations.append(Obligation(step["id"], "limit_shape", "The removable-hole rule requires a finite two-sided punctured limit."))
            if not isinstance(step["parameters"].get("simplified"), dict):
                obligations.append(Obligation(step["id"], "missing_simplified_expression", "The removable-hole rule needs the expression valid on the punctured neighborhood."))

        if rule == "continuity_limit":
            pattern = match_continuity_limit(step["claim"])
            if pattern is None:
                obligations.append(Obligation(
                    step["id"],
                    "continuity_limit_shape",
                    "The continuity limit rule needs a finite real limit whose claimed value equals the expression evaluated at the approach point, using the supported continuous expression fragment.",
                ))
            else:
                missing, violated = continuity_pattern_status(pattern, premise_props)
                if violated:
                    first = violated[0]
                    obligations.append(Obligation(
                        step["id"],
                        "continuity_domain_violation",
                        first.message,
                        {"kind": "proposition", "proposition": first.claim},
                    ))
                else:
                    for guard in missing:
                        _require_cited_claim(
                            obligations, step, premises, guard.claim,
                            code=guard.code, message=guard.message,
                        )

        if rule == "limit_algebra":
            limit_rows = [(pid, claims[pid]) for pid in step["premises"] if claims[pid].get("kind") == "limit"]
            pattern = match_limit_algebra(step["claim"], limit_rows)
            if pattern is None:
                obligations.append(Obligation(
                    step["id"],
                    "limit_algebra_shape",
                    "The compositional limit rule needs a finite real limit built from supported arithmetic/unary nodes or cited finite sublimits over the exact same approach filter.",
                ))
            else:
                missing, violated = limit_algebra_status(pattern, premise_props)
                if violated:
                    first = violated[0]
                    obligations.append(Obligation(
                        step["id"],
                        "limit_algebra_domain_violation",
                        first.message,
                        {"kind": "proposition", "proposition": first.claim},
                    ))
                else:
                    for guard in missing:
                        obligations.append(Obligation(
                            step["id"],
                            guard.code,
                            guard.message,
                            {"kind": "proposition", "proposition": guard.claim},
                        ))
                # Extra cited facts are harmless, but a limit premise must never be
                # silently substituted for a different source filter/expression.
                # Matching above only consumes exact-source leaves.

        if rule == "series_geometric":
            if match_geometric_series(step["claim"]) is None:
                obligations.append(Obligation(
                    step["id"],
                    "series_geometric_shape",
                    "The geometric-series rule requires an exact nonzero rational coefficient times r^n, with the exact sum when |r| < 1 or an explicit not-summable claim when |r| >= 1.",
                ))

        if rule == "series_p_series":
            if match_p_series(step["claim"]) is None:
                obligations.append(Obligation(
                    step["id"],
                    "series_p_series_shape",
                    "The p-series rule requires an exact nonzero rational coefficient divided by real(n+k)^p, with k >= 1 and exact integer or rational p from 0 to 64; claim summable exactly when p > 1.",
                ))

        if rule == "series_comparison":
            premise_rows = [(pid, claims[pid]) for pid in step["premises"]]
            if match_series_comparison(step["claim"], premise_rows) is None:
                obligations.append(Obligation(
                    step["id"],
                    "series_comparison_evidence",
                    "The comparison-series rule requires two cited premises: a compatible summable/not-summable comparison series and a global or eventual nonnegative pointwise bound in the correct direction over the same natural index.",
                ))

        if rule == "series_ratio_test":
            premise_rows = [(pid, claims[pid]) for pid in step["premises"]]
            if match_series_ratio_test(step["claim"], premise_rows) is None:
                obligations.append(Obligation(
                    step["id"],
                    "series_ratio_test_evidence",
                    "The ratio-test rule requires one cited global or eventual bound |a_(n+1)| <= r*|a_n| with exact rational 0 <= r < 1 over the same natural series index.",
                ))

        if rule == "series_ratio_limit_test":
            premise_rows = [(pid, claims[pid]) for pid in step["premises"]]
            if match_series_ratio_limit_test(step["claim"], premise_rows) is None:
                obligations.append(Obligation(
                    step["id"],
                    "series_ratio_limit_test_evidence",
                    "The quotient-limit ratio test needs an exact finite sequence limit for abs(a_(n+1))/abs(a_n), unless exact multiplication/division normalization reduces the term to p(real(n))*r^n with nonzero rational-coefficient p (degree <= 64), one nonzero rational geometric base r, and a kernel-reconstructible polynomial tail. Products of exact rational geometric factors and nonzero rational geometric denominator factors may be folded into r; residual non-geometric denominators still require cited limit evidence. Use rational 0 <= L < 1 plus cited or exactly reconstructible eventual a_n != 0 for summability, or rational L > 1 for non-summability. L = 1 is intentionally inconclusive.",
                ))

        if rule == "series_root_test":
            premise_rows = [(pid, claims[pid]) for pid in step["premises"]]
            if match_series_root_test(step["claim"], premise_rows) is None:
                obligations.append(Obligation(
                    step["id"],
                    "series_root_test_evidence",
                    "The root test needs an exact finite sequence limit for abs(a_n)^(1/real(n)), unless exact multiplication/division normalization reduces the term to (p(real(n))/q(real(n)))*r^n with nonzero rational-coefficient polynomials of degree <= 64 and one exact rational geometric base r. Products of rational geometric factors and nonzero rational geometric factors in denominators are folded into r. School-domain denominator guards remain explicit unless the encountered denominator has a conservative automatic global or eventual Nat-nonzero proof; positive factors use positivity, exact nonzero rational geometric powers use pow_ne_zero, and exact rational polynomial factors through degree 64 may be proved nonzero after a concrete threshold by a shifted-polynomial identity that Lean checks with ring and positivity. Rational 0 <= L < 1 proves summability, rational L > 1 proves non-summability, and L = 1 is intentionally inconclusive.",
                ))

        if rule == "sequence_nat_at_top":
            if match_nat_at_top(step["claim"]) is None:
                obligations.append(Obligation(
                    step["id"],
                    "sequence_nat_at_top_shape",
                    "The natural-index divergence rule needs real(n + k) with exact k >= 0 tending to +infinity over Nat.atTop.",
                ))

        if rule == "sequence_algebra":
            sequence_rows = [(pid, claims[pid]) for pid in step["premises"] if claims[pid].get("kind") == "sequence_limit"]
            pattern = match_sequence_algebra(step["claim"], sequence_rows)
            if pattern is None:
                obligations.append(Obligation(
                    step["id"],
                    "sequence_algebra_shape",
                    "The compositional sequence rule needs a finite real sequence limit built from supported arithmetic/unary nodes, shifted reciprocal or geometric leaves, or cited finite sublimits over Nat.atTop.",
                ))
            else:
                missing, violated = sequence_algebra_status(pattern, premise_props)
                if violated:
                    first = violated[0]
                    obligations.append(Obligation(
                        step["id"],
                        "sequence_algebra_domain_violation",
                        first.message,
                        {"kind": "proposition", "proposition": first.claim},
                    ))
                else:
                    for guard in missing:
                        obligations.append(Obligation(
                            step["id"],
                            guard.code,
                            guard.message,
                            {"kind": "proposition", "proposition": guard.claim},
                        ))

        if rule == "sequence_squeeze":
            sequence_rows = [(pid, claims[pid]) for pid in step["premises"] if claims[pid].get("kind") == "sequence_limit"]
            proposition_rows = [(pid, claims[pid]["proposition"]) for pid in step["premises"] if claims[pid].get("kind") == "proposition"]
            if match_sequence_squeeze(step["claim"], sequence_rows, proposition_rows) is None:
                obligations.append(Obligation(
                    step["id"],
                    "sequence_squeeze_evidence",
                    "Squeeze needs lower and upper sequence limits to the claimed target plus eventual inequalities; supported standard trig-over-positive-shift bounds may be reconstructed automatically.",
                ))

        if rule == "sequence_monotone_bounded":
            proposition_rows = [(pid, claims[pid]["proposition"]) for pid in step["premises"] if claims[pid].get("kind") == "proposition"]
            if match_sequence_monotone_bounded(step["claim"], proposition_rows) is None:
                obligations.append(Obligation(
                    step["id"],
                    "sequence_monotone_bounded_evidence",
                    "Monotone convergence needs monotonicity and a matching global upper/lower bound; supported exact geometric approaches may reconstruct both automatically, and the rule proves existence rather than inventing a numeric limit.",
                ))

        if rule == "sequence_elementary_divergence":
            sequence_rows = [(pid, claims[pid]) for pid in step["premises"] if claims[pid].get("kind") == "sequence_limit"]
            if match_sequence_elementary_divergence(step["claim"], sequence_rows) is None:
                obligations.append(Obligation(
                    step["id"],
                    "sequence_elementary_divergence_shape",
                    "Elementary divergence supports nonconstant affine transforms of (-1)^n, exact rational-valued modulo-periodic sequences of period 2-4 with distinct residue values, a finite prefix followed by one of those exact periodic cores, those same oscillating cores plus one finite-convergent perturbation proved automatically or by an exact cited finite sequence-limit premise, exact r^n -> +infinity for r > 1, and no-finite-limit claims for exact r^n when r > 1 or r < -1.",
                ))

        if rule == "sequence_affine_ratio":
            if match_sequence_affine_ratio(step["claim"]) is None:
                obligations.append(Obligation(
                    step["id"],
                    "sequence_affine_ratio_shape",
                    "The affine-ratio rule requires an exact affine-over-affine real sequence with nonzero denominator leading coefficient and target equal to the ratio of leading coefficients.",
                ))

        if rule == "sequence_quadratic_ratio":
            if match_sequence_quadratic_ratio(step["claim"]) is None:
                obligations.append(Obligation(
                    step["id"],
                    "sequence_quadratic_ratio_shape",
                    "The quadratic-ratio rule requires exact degree-two real polynomials in real(n) on both sides, a nonzero quadratic denominator coefficient, and target equal to the ratio of quadratic coefficients.",
                ))

        if rule == "sequence_polynomial_degree_ratio":
            if match_sequence_polynomial_degree_ratio(step["claim"]) is None:
                obligations.append(Obligation(
                    step["id"],
                    "sequence_polynomial_degree_ratio_shape",
                    "The polynomial-ratio rule requires exact rational-coefficient polynomials in real(n) within the degree-64 contract bound: lower numerator degree must claim 0, equal degree 3 or above must claim the leading-coefficient ratio, and higher numerator degree must claim the infinity sign forced by that ratio.",
                ))

        if rule == "sequence_rational_shift":
            if match_sequence_rational_shift(step["claim"]) is None:
                obligations.append(Obligation(
                    step["id"],
                    "sequence_rational_shift_shape",
                    "The rational-shift rule supports exact (real(n+a))/(real(n+b)) -> 1 with natural a >= 0 and b >= 1.",
                ))

        if rule == "ivt_exists":
            if match_ivt_existence(step["claim"]) is None:
                obligations.append(Obligation(
                    step["id"],
                    "ivt_exists_shape",
                    "The IVT existence rule currently requires an exact real interval and a polynomial whose endpoint values bracket the exact target.",
                ))

        if rule == "continuous_ivt_exists":
            pattern = match_continuous_ivt_existence(step["claim"])
            if pattern is None:
                obligations.append(Obligation(
                    step["id"],
                    "continuous_ivt_shape",
                    "The continuity-powered IVT rule needs an exact real interval and an expression from the supported structural continuity fragment.",
                ))
            else:
                missing_guards, violated_guards = continuous_ivt_guard_status(pattern, premise_props)
                if violated_guards:
                    first = violated_guards[0]
                    obligations.append(Obligation(
                        step["id"],
                        "ivt_interval_domain_violation",
                        first.message.replace("at this point", "throughout this interval"),
                        {"kind": "proposition", "proposition": interval_guard_expected_claim(pattern, first)},
                    ))
                else:
                    for guard in missing_guards:
                        _require_cited_claim(
                            obligations, step, premises, interval_guard_expected_claim(pattern, guard),
                            code="ivt_interval_guard_required",
                            message=(
                                "IVT needs cited interval-wide domain evidence for every non-automatic continuity guard; "
                                "state it as a universal fact over the exact interval."
                            ),
                        )
                orientation, missing = select_continuous_ivt_orientation(pattern, premise_props)
                if orientation is None:
                    for index, claim in enumerate(missing, start=1):
                        _require_cited_claim(
                            obligations, step, premises, claim,
                            code="ivt_bracket_required",
                            message="IVT needs cited endpoint inequalities that bracket the requested target.",
                        )

        if rule == "ivt_unique":
            obligations.append(
                Obligation(step["id"], "ivt_does_not_prove_uniqueness", "IVT establishes existence under its hypotheses; uniqueness needs a separate argument such as strict monotonicity.")
            )

        if rule == "polynomial_derivative":
            if match_polynomial_derivative(step["claim"]) is None:
                obligations.append(Obligation(
                    step["id"],
                    "polynomial_derivative_shape",
                    "The polynomial derivative rule currently supports real polynomial expressions evaluated at an exact or declared real point; radicals, division, abs, piecewise expressions and function calls need separate rules.",
                ))

        if rule == "quotient_derivative":
            pattern = match_quotient_derivative(step["claim"])
            if pattern is None:
                obligations.append(Obligation(
                    step["id"],
                    "quotient_derivative_shape",
                    "The quotient derivative rule currently supports a quotient of real polynomials with the claimed quotient-rule derivative at the evaluation point.",
                ))
            elif not quotient_denominator_is_exact_nonzero(pattern):
                _require_cited_claim(
                    obligations,
                    step,
                    premises,
                    nonzero(pattern.denominator_at_point),
                    code="denominator_nonzero_at_point",
                    message="The quotient rule needs a cited proof that the denominator is nonzero at the evaluation point.",
                )

        if rule == "sqrt_derivative":
            pattern = match_sqrt_derivative(step["claim"])
            if pattern is None:
                obligations.append(Obligation(
                    step["id"],
                    "sqrt_derivative_shape",
                    "The square-root derivative rule currently supports sqrt(p(x)) for a real polynomial p with the claimed chain-rule derivative at the evaluation point.",
                ))
            elif not sqrt_radicand_is_exact_positive(pattern):
                _require_cited_claim(
                    obligations,
                    step,
                    premises,
                    positive(pattern.radicand_at_point),
                    code="sqrt_derivative_positive",
                    message="School-real square-root differentiation needs a cited proof that the radicand is strictly positive at the evaluation point.",
                )

        if rule in {"exp_derivative", "log_derivative", "sin_derivative", "cos_derivative"}:
            pattern = match_elementary_derivative(step["claim"])
            expected_function = rule.removesuffix("_derivative")
            if pattern is None or pattern.function != expected_function:
                obligations.append(Obligation(
                    step["id"],
                    f"{expected_function}_derivative_shape",
                    f"The {expected_function} derivative rule currently supports {expected_function}(p(x)) for a real polynomial p with the claimed chain-rule derivative at the evaluation point.",
                ))
            elif expected_function == "log" and not elementary_argument_is_exact_positive(pattern):
                _require_cited_claim(
                    obligations,
                    step,
                    premises,
                    positive(pattern.argument_at_point),
                    code="log_derivative_positive",
                    message="School-real logarithm differentiation needs a cited proof that the argument is strictly positive at the evaluation point.",
                )

        if rule == "abs_derivative":
            pattern = match_abs_derivative(step["claim"])
            if pattern is None:
                obligations.append(Obligation(
                    step["id"],
                    "abs_derivative_shape",
                    "The absolute-value derivative rule currently supports |p(x)| for a real polynomial p, with the claimed branch derivative at the evaluation point.",
                ))
            else:
                exact_value = exact_rational_value(pattern.argument_at_point)
                if exact_value == 0:
                    obligations.append(Obligation(
                        step["id"],
                        "abs_derivative_kink",
                        "Absolute value is not differentiable where the inner expression is zero unless a separate argument proves the composition is smoother than the generic |p(x)| rule.",
                    ))
                elif exact_value is not None:
                    branch = abs_argument_exact_sign(pattern)
                    branch_matches = pattern.matches_positive if branch == "positive" else pattern.matches_negative
                    if not branch_matches:
                        obligations.append(Obligation(
                            step["id"],
                            "abs_derivative_wrong_branch",
                            "The claimed derivative uses the wrong absolute-value branch for the exact sign of the inner expression at this point.",
                        ))
                else:
                    positive_claim = {"kind": "proposition", "proposition": positive(pattern.argument_at_point)}
                    negative_claim = {"kind": "proposition", "proposition": negative(pattern.argument_at_point)}
                    positive_ok = pattern.matches_positive and any(_same(item, positive_claim) for item in premises)
                    negative_ok = pattern.matches_negative and any(_same(item, negative_claim) for item in premises)
                    if not (positive_ok or negative_ok):
                        expected = positive_claim if pattern.matches_positive and not pattern.matches_negative else (negative_claim if pattern.matches_negative and not pattern.matches_positive else None)
                        obligations.append(Obligation(
                            step["id"],
                            "abs_derivative_sign",
                            "Differentiating an absolute value needs a cited strict sign for the inner expression at the evaluation point, matching the claimed derivative branch.",
                            expected,
                        ))

        if rule == "recursive_derivative":
            patterns = match_recursive_derivative(step["claim"])
            pattern, missing, violated = select_recursive_derivative_pattern(patterns, premise_props)
            if pattern is None:
                obligations.append(Obligation(
                    step["id"],
                    "recursive_derivative_shape",
                    "The recursive derivative planner supports compositions of arithmetic, natural powers, exp/log/sin/cos, guarded quotients, positive-domain square roots, and absolute-value branches away from kinks.",
                ))
            elif violated:
                first = violated[0]
                obligations.append(Obligation(
                    step["id"],
                    "recursive_derivative_domain_violation",
                    f"The claimed recursive derivative requires an impossible pointwise guard: {first.message}",
                    {"kind": "proposition", "proposition": first.claim},
                ))
            else:
                for guard in missing:
                    _require_cited_claim(
                        obligations, step, premises, guard.claim,
                        code=guard.code, message=guard.message,
                    )

        if rule == "sub_ne_zero_from_ne":
            if len(premises) != 1:
                obligations.append(Obligation(step["id"], "sub_ne_zero_arity", "Deriving a nonzero difference requires exactly one cited unequal-terms premise."))
            else:
                source = relation_prop(premises[0])
                target = relation_prop(step["claim"])
                zero = {"kind": "int", "value": 0}
                if source is None or target is None or source.get("kind") != "ne" or target.get("kind") != "ne":
                    obligations.append(Obligation(step["id"], "sub_ne_zero_shape", "This rule needs a ≠ b and proves a - b ≠ 0."))
                else:
                    expected = {"kind": "ne", "left": {"kind": "sub", "left": source["left"], "right": source["right"]}, "right": zero}
                    if not _same(target, expected):
                        obligations.append(Obligation(step["id"], "sub_ne_zero_shape", "The target must be the cited unequal terms subtracted in the same order, nonzero."))

        if rule in {"exact", "assumption"}:
            if len(step["premises"]) != 1:
                obligations.append(Obligation(step["id"], f"{rule}_arity", f"{rule.replace('_', ' ').title()} requires exactly one cited premise."))
            elif not _same(step["claim"], premises[0]):
                obligations.append(Obligation(step["id"], "claim_mismatch", "The cited premise does not have the exact claimed statement."))

        if rule == "eq_refl":
            prop = relation_prop(step["claim"])
            if prop is None or prop["kind"] != "eq" or not _same(prop["left"], prop["right"]):
                obligations.append(Obligation(step["id"], "not_reflexive", "Reflexivity can only prove an expression equal to itself."))

        if rule == "eq_symm":
            if len(premises) != 1:
                obligations.append(Obligation(step["id"], "symm_arity", "Symmetry needs exactly one equality premise."))
            else:
                source = relation_prop(premises[0])
                target = relation_prop(step["claim"])
                if source is None or target is None or source["kind"] != "eq" or target["kind"] != "eq" or not (_same(source["left"], target["right"]) and _same(source["right"], target["left"])):
                    obligations.append(Obligation(step["id"], "invalid_symmetry", "The target must reverse the two sides of the cited equality."))

        if rule == "eq_trans":
            if len(premises) != 2:
                obligations.append(Obligation(step["id"], "trans_arity", "Transitivity needs exactly two equality premises."))
            else:
                first, second = relation_prop(premises[0]), relation_prop(premises[1])
                target = relation_prop(step["claim"])
                if first is None or second is None or target is None or any(item["kind"] != "eq" for item in (first, second, target)) or not (_same(first["right"], second["left"]) and _same(target["left"], first["left"]) and _same(target["right"], second["right"])):
                    obligations.append(Obligation(step["id"], "invalid_transitivity", "Equality transitivity requires A=B and B=C to conclude A=C."))

        if rule == "add_both_sides":
            _validate_same_operation(step, premises, obligations, symbols, "add")
        if rule == "subtract_both_sides":
            _validate_same_operation(step, premises, obligations, symbols, "sub")
        if rule == "multiply_both_sides":
            pair = _source_relation(step, premises, obligations)
            if pair is not None:
                source, target = pair
                if source["kind"] != "eq" or target["kind"] != "eq":
                    obligations.append(Obligation(step["id"], "multiplication_relation", "Multiplying both sides by an unrestricted expression is currently supported only for equalities; inequalities need an explicit sign rule."))
                else:
                    term = step["parameters"].get("term")
                    if not isinstance(term, dict):
                        obligations.append(Obligation(step["id"], "missing_term", "Multiplication requires the common factor to be identified."))
                    else:
                        left_expected = {"kind": "mul", "left": source["left"], "right": term}
                        right_expected = {"kind": "mul", "left": source["right"], "right": term}
                        if not equivalent_expr(left_expected, target["left"], symbols) or not equivalent_expr(right_expected, target["right"], symbols):
                            obligations.append(Obligation(step["id"], "invalid_transformation", "The claimed line is not obtained by multiplying both sides by the identified factor."))
        if rule == "divide_both_sides":
            pair = _source_relation(step, premises, obligations)
            divisor = step["parameters"].get("term")
            if pair is not None and isinstance(divisor, dict):
                source, target = pair
                if source["kind"] != "eq" or target["kind"] != "eq":
                    obligations.append(Obligation(step["id"], "division_relation", "Dividing both sides is currently supported for equalities."))
                else:
                    left_expected = {"kind": "div", "left": source["left"], "right": divisor}
                    right_expected = {"kind": "div", "left": source["right"], "right": divisor}
                    if not equivalent_expr(left_expected, target["left"], symbols) or not equivalent_expr(right_expected, target["right"], symbols):
                        obligations.append(Obligation(step["id"], "invalid_transformation", "The claimed line is not obtained by dividing both sides by the identified term."))
                    _require_cited_claim(obligations, step, premises, nonzero(divisor), code="nonzero_required", message="Dividing both sides requires a cited proof that the divisor is nonzero.")
            elif not isinstance(divisor, dict):
                obligations.append(Obligation(step["id"], "missing_term", "Dividing both sides requires the divisor to be identified."))

        if rule == "square_both_sides":
            pair = _source_relation(step, premises, obligations)
            if pair is not None:
                source, target = pair
                if source["kind"] != "eq" or target["kind"] != "eq":
                    obligations.append(Obligation(step["id"], "square_relation", "Squaring both sides derives an equality from an equality."))
                else:
                    left_expected = {"kind": "pow", "base": source["left"], "exponent": 2}
                    right_expected = {"kind": "pow", "base": source["right"], "exponent": 2}
                    if not equivalent_expr(left_expected, target["left"], symbols) or not equivalent_expr(right_expected, target["right"], symbols):
                        obligations.append(Obligation(step["id"], "invalid_transformation", "The target must be the square of each side of the cited equality."))

        if rule in {"scale_inequality_positive", "scale_inequality_negative"}:
            factor = step["parameters"].get("factor")
            target = relation_prop(step["claim"])
            premise_relations = [relation_prop(item) for item in premises]
            premise_relations = [item for item in premise_relations if item is not None and item.get("kind") in {"lt", "le", "gt", "ge"}]
            if not isinstance(factor, dict):
                obligations.append(Obligation(step["id"], "missing_factor", "Scaling an inequality requires the common factor to be identified."))
            elif target is None or target.get("kind") not in {"lt", "le", "gt", "ge"} or not premise_relations:
                obligations.append(Obligation(step["id"], "inequality_premise_required", "Scaling an inequality needs a cited inequality and an inequality claim."))
            else:
                zero = {"kind": "int", "value": 0}
                sign_claim = (
                    {"kind": "lt", "left": zero, "right": factor}
                    if rule == "scale_inequality_positive"
                    else {"kind": "lt", "left": factor, "right": zero}
                )
                _require_cited_claim(
                    obligations,
                    step,
                    premises,
                    sign_claim,
                    code="sign_required",
                    message=(
                        "Multiplying an inequality without flipping it requires a cited positive factor."
                        if rule == "scale_inequality_positive"
                        else "Multiplying by a negative factor requires a cited negative factor and reverses the inequality."
                    ),
                )
                sign_hash = canonical_hash(sign_claim)
                source_candidates = [item for item in premise_relations if canonical_hash(item) != sign_hash]
                source = source_candidates[0] if source_candidates else premise_relations[0]
                expected_kind = source["kind"]
                if rule == "scale_inequality_negative":
                    expected_kind = {"lt": "gt", "le": "ge", "gt": "lt", "ge": "le"}[source["kind"]]
                if target["kind"] != expected_kind:
                    obligations.append(Obligation(step["id"], "inequality_direction", "The inequality direction does not match the sign of the scaling factor."))
                left_expected = {"kind": "mul", "left": source["left"], "right": factor}
                right_expected = {"kind": "mul", "left": source["right"], "right": factor}
                if not equivalent_expr(left_expected, target["left"], symbols) or not equivalent_expr(right_expected, target["right"], symbols):
                    obligations.append(Obligation(step["id"], "invalid_transformation", "The target must multiply both sides by the declared factor."))

        if rule == "add_inequality":
            pair = _source_relation(step, premises, obligations)
            term = step["parameters"].get("term")
            if pair is not None and isinstance(term, dict):
                source, target = pair
                if source["kind"] not in {"lt", "le", "gt", "ge"} or target["kind"] != source["kind"]:
                    obligations.append(Obligation(step["id"], "inequality_relation", "Adding the same term preserves the inequality direction."))
                else:
                    left_expected = {"kind": "add", "left": source["left"], "right": term}
                    right_expected = {"kind": "add", "left": source["right"], "right": term}
                    if not equivalent_expr(left_expected, target["left"], symbols) or not equivalent_expr(right_expected, target["right"], symbols):
                        obligations.append(Obligation(step["id"], "invalid_transformation", "The claimed inequality does not add the same term to both sides."))
            elif not isinstance(term, dict):
                obligations.append(Obligation(step["id"], "missing_term", "Adding to an inequality requires the common term to be identified."))

        if rule in {"scale_inequality_positive", "scale_inequality_negative"}:
            pair = _source_relation(step, premises, obligations)
            factor = step["parameters"].get("factor")
            if pair is not None and isinstance(factor, dict):
                source, target = pair
                if source["kind"] not in {"lt", "le", "gt", "ge"}:
                    obligations.append(Obligation(step["id"], "inequality_relation", "Scaling requires an inequality premise."))
                else:
                    expected_kind = source["kind"] if rule == "scale_inequality_positive" else {"lt":"gt","le":"ge","gt":"lt","ge":"le"}[source["kind"]]
                    if target["kind"] != expected_kind:
                        obligations.append(Obligation(step["id"], "inequality_direction", "The inequality direction does not match the sign of the scaling factor."))
                    left_expected = {"kind": "mul", "left": source["left"], "right": factor}
                    right_expected = {"kind": "mul", "left": source["right"], "right": factor}
                    if not equivalent_expr(left_expected, target["left"], symbols) or not equivalent_expr(right_expected, target["right"], symbols):
                        obligations.append(Obligation(step["id"], "invalid_transformation", "The claimed inequality does not multiply both sides by the identified factor."))
                    sign_claim = positive(factor) if rule == "scale_inequality_positive" else negative(factor)
                    _require_cited_claim(
                        obligations, step, premises, sign_claim,
                        code="factor_sign_required",
                        message="Scaling an inequality requires a cited proof of the factor's sign.",
                    )
            elif not isinstance(factor, dict):
                obligations.append(Obligation(step["id"], "missing_factor", "Scaling an inequality requires the factor to be identified."))

        if rule == "sub_ne_zero_from_ne":
            if len(premises) != 1:
                obligations.append(Obligation(step["id"], "sub_ne_arity", "A nonzero difference needs exactly one cited a ≠ b premise."))
            else:
                source = relation_prop(premises[0])
                target = relation_prop(step["claim"] )
                if source is None or target is None or source["kind"] != "ne" or target["kind"] != "ne":
                    obligations.append(Obligation(step["id"], "sub_ne_shape", "This rule requires a ≠ b and proves a - b ≠ 0."))
                else:
                    expected = {"kind":"ne","left":{"kind":"sub","left":source["left"],"right":source["right"]},"right":{"kind":"int","value":0}}
                    if canonical_hash(target) != canonical_hash(expected):
                        obligations.append(Obligation(step["id"], "sub_ne_shape", "The claimed nonzero difference does not match the cited unequal terms."))

        if rule == "true_intro":
            prop = proposition_of(step["claim"])
            if prop != {"kind": "true"} or premises:
                obligations.append(Obligation(step["id"], "true_intro_shape", "True introduction has no premises and concludes true."))

        if rule == "and_intro":
            target = proposition_of(step["claim"])
            props = _premise_props(premises)
            if target is None or target.get("kind") != "and" or len(props) != 2 or not (
                any(_same(item, target["left"]) for item in props) and any(_same(item, target["right"]) for item in props)
            ):
                obligations.append(Obligation(step["id"], "and_intro_shape", "Conjunction introduction needs proofs of both conjuncts."))

        if rule in {"and_elim_left", "and_elim_right"}:
            target = proposition_of(step["claim"])
            props = _premise_props(premises)
            side = "left" if rule.endswith("left") else "right"
            if len(props) != 1 or props[0].get("kind") != "and" or target is None or not _same(target, props[0][side]):
                obligations.append(Obligation(step["id"], "and_elim_shape", f"Conjunction elimination must conclude the {side} conjunct of the cited premise."))

        if rule in {"or_intro_left", "or_intro_right"}:
            target = proposition_of(step["claim"])
            props = _premise_props(premises)
            side = "left" if rule.endswith("left") else "right"
            if target is None or target.get("kind") != "or" or len(props) != 1 or not _same(props[0], target[side]):
                obligations.append(Obligation(step["id"], "or_intro_shape", f"Disjunction introduction needs a proof of the target's {side} alternative."))

        if rule == "modus_ponens":
            target = proposition_of(step["claim"])
            props = _premise_props(premises)
            implications = [item for item in props if item.get("kind") == "implies"]
            valid = False
            for implication in implications:
                if target is not None and _same(target, implication["right"]) and any(_same(item, implication["left"]) for item in props):
                    valid = True
                    break
            if not valid:
                obligations.append(Obligation(step["id"], "modus_ponens_shape", "Modus ponens needs P → Q and P to conclude Q."))

        if rule == "iff_intro":
            target = proposition_of(step["claim"])
            props = _premise_props(premises)
            if target is None or target.get("kind") != "iff" or len(props) != 2:
                obligations.append(Obligation(step["id"], "iff_intro_shape", "Biconditional introduction needs both directions."))
            else:
                forward = {"kind": "implies", "left": target["left"], "right": target["right"]}
                backward = {"kind": "implies", "left": target["right"], "right": target["left"]}
                if not any(_same(item, forward) for item in props) or not any(_same(item, backward) for item in props):
                    obligations.append(Obligation(step["id"], "iff_intro_shape", "Biconditional introduction needs proofs of P → Q and Q → P."))

        if rule in {"iff_mp", "iff_mpr"}:
            target = proposition_of(step["claim"])
            props = _premise_props(premises)
            iff_rows = [item for item in props if item.get("kind") == "iff"]
            valid = False
            for iff_prop in iff_rows:
                source = iff_prop["left"] if rule == "iff_mp" else iff_prop["right"]
                expected = iff_prop["right"] if rule == "iff_mp" else iff_prop["left"]
                if target is not None and _same(target, expected) and any(_same(item, source) for item in props):
                    valid = True
                    break
            if not valid:
                obligations.append(Obligation(step["id"], "iff_elim_shape", "Biconditional elimination needs the equivalence and the matching side."))

        if rule == "contradiction":
            target = proposition_of(step["claim"])
            props = _premise_props(premises)
            valid = target == {"kind": "false"} and any(
                item.get("kind") == "not" and any(_same(other, item["arg"]) for other in props) for item in props
            )
            if not valid:
                obligations.append(Obligation(step["id"], "contradiction_shape", "Contradiction needs P and not P and concludes false."))

        if rule == "false_elim":
            props = _premise_props(premises)
            if len(props) != 1 or props[0] != {"kind": "false"} or proposition_of(step["claim"]) is None:
                obligations.append(Obligation(step["id"], "false_elim_shape", "False elimination needs a proof of false and may conclude any proposition."))

        if rule == "exists_intro":
            target = proposition_of(step["claim"])
            props = _premise_props(premises)
            witness = step["parameters"].get("witness")
            if target is None or target.get("kind") != "exists" or len(props) != 1 or not isinstance(witness, dict):
                obligations.append(Obligation(step["id"], "exists_intro_shape", "Existential introduction needs a witness and a proof of the instantiated body."))
            elif not witness_type_compatible(request, target["binder"]["type"], witness, scope=step["scope"]):
                obligations.append(Obligation(step["id"], "witness_type", "The existential witness cannot be coerced to the binder type."))
            else:
                expected = substitute_prop(target["body"], target["binder"]["id"], witness)
                if not _same(props[0], expected):
                    obligations.append(Obligation(step["id"], "exists_intro_body", "The cited proof does not establish the existential body for this witness."))

        if rule == "forall_elim":
            target = proposition_of(step["claim"])
            props = _premise_props(premises)
            witness = step["parameters"].get("witness")
            universals = [item for item in props if item.get("kind") == "forall"]
            valid = False
            if target is not None and isinstance(witness, dict):
                for universal in universals:
                    if not witness_type_compatible(request, universal["binder"]["type"], witness, scope=step["scope"]):
                        continue
                    expected = substitute_prop(universal["body"], universal["binder"]["id"], witness)
                    if _same(target, expected):
                        valid = True
                        break
            if not valid:
                obligations.append(Obligation(step["id"], "forall_elim_shape", "Universal elimination needs ∀x, P(x), a well-typed term t, and concludes P(t)."))

        if rule in {"imp_intro", "not_intro"}:
            target = proposition_of(step["claim"])
            child_ids = [pid for pid in step["premises"] if node_scope.get(pid) != step["scope"]]
            child_scopes = {node_scope[pid] for pid in child_ids if scope_parent.get(node_scope[pid]) == step["scope"]}
            if len(child_scopes) != 1:
                obligations.append(Obligation(step["id"], "subproof_scope", "A discharge rule must cite exactly one direct child subproof scope."))
            else:
                child_scope = next(iter(child_scopes))
                local_assumptions = [row for row in request["assumptions"] if row["scope"] == child_scope]
                if len(local_assumptions) != 1:
                    obligations.append(Obligation(step["id"], "subproof_assumption", "An implication/negation subproof must introduce exactly one local assumption."))
                else:
                    local = local_assumptions[0]
                    if local["id"] not in step["premises"]:
                        obligations.append(Obligation(step["id"], "subproof_assumption", "The discharge step must cite the local assumption being discharged."))
                    if rule == "imp_intro":
                        if target is None or target.get("kind") != "implies" or not _same(local["claim"], target.get("left", {})):
                            obligations.append(Obligation(step["id"], "imp_intro_shape", "Implication introduction must assume exactly the antecedent of the claimed implication."))
                            expected = None
                        else:
                            expected = target["right"]
                    else:
                        if target is None or target.get("kind") != "not" or not _same(local["claim"], target.get("arg", {})):
                            obligations.append(Obligation(step["id"], "not_intro_shape", "Negation introduction must assume exactly the proposition being negated."))
                            expected = None
                        else:
                            expected = {"kind": "false"}
                    if expected is not None:
                        conclusion_found = False
                        for pid in child_ids:
                            if node_scope.get(pid) != child_scope:
                                continue
                            candidate = claims[pid]
                            candidate_prop = proposition_of(candidate)
                            if candidate_prop is not None and _same(candidate_prop, expected):
                                conclusion_found = True
                                break
                        if not conclusion_found:
                            message = "The child subproof must establish the implication consequent." if rule == "imp_intro" else "The child subproof must establish false under the temporary assumption."
                            obligations.append(Obligation(step["id"], "subproof_conclusion", message))

        if rule == "forall_intro":
            target = proposition_of(step["claim"])
            child_ids = [pid for pid in step["premises"] if node_scope.get(pid) != step["scope"]]
            child_scopes = {node_scope[pid] for pid in child_ids if scope_parent.get(node_scope[pid]) == step["scope"]}
            if target is None or target.get("kind") != "forall" or len(child_scopes) != 1:
                obligations.append(Obligation(step["id"], "forall_intro_shape", "Universal introduction needs one direct child scope for an arbitrary binder."))
            else:
                child_scope = next(iter(child_scopes))
                scope_row = next(row for row in request["scopes"] if row["id"] == child_scope)
                binders = scope_row.get("binders", [])
                locals_ = [row for row in request["assumptions"] if row["scope"] == child_scope]
                if binders != [target["binder"]] or locals_:
                    obligations.append(Obligation(step["id"], "forall_intro_binder", "The universal subproof must introduce exactly the quantified binder and no extra local assumptions."))
                conclusion = any(
                    node_scope.get(pid) == child_scope
                    and proposition_of(claims[pid]) is not None
                    and _same(proposition_of(claims[pid]), target["body"])
                    for pid in step["premises"]
                )
                if not conclusion:
                    obligations.append(Obligation(step["id"], "forall_intro_conclusion", "The arbitrary-binder subproof must establish the quantified body."))

        if rule == "exists_elim":
            target = proposition_of(step["claim"])
            ancestors = _scope_ancestors(scope_parent, step["scope"])
            existential_rows: list[tuple[str, dict[str, Any]]] = []
            for pid in step["premises"]:
                if node_scope.get(pid) not in ancestors:
                    continue
                candidate = proposition_of(claims[pid])
                if candidate is not None and candidate.get("kind") == "exists":
                    existential_rows.append((pid, candidate))
            child_scopes = {
                node_scope[pid]
                for pid in step["premises"]
                if node_scope.get(pid) != step["scope"] and scope_parent.get(node_scope.get(pid)) == step["scope"]
            }
            if target is None or len(existential_rows) != 1 or len(child_scopes) != 1:
                obligations.append(Obligation(step["id"], "exists_elim_shape", "Existential elimination needs one existential premise and one direct child witness scope."))
            else:
                _hex_id, existential = existential_rows[0]
                child_scope = next(iter(child_scopes))
                scope_row = next(row for row in request["scopes"] if row["id"] == child_scope)
                binders = scope_row.get("binders", [])
                locals_ = [row for row in request["assumptions"] if row["scope"] == child_scope]
                if len(binders) != 1 or binders[0]["type"] != existential["binder"]["type"] or len(locals_) != 1:
                    obligations.append(Obligation(step["id"], "exists_elim_witness", "The existential child scope must introduce one witness of the quantified type and one matching local hypothesis."))
                else:
                    local = locals_[0]
                    if local["id"] not in step["premises"]:
                        obligations.append(Obligation(step["id"], "exists_elim_assumption", "Existential elimination must cite the local witness hypothesis being discharged."))
                    replacement = {"kind": "var", "id": binders[0]["id"]}
                    expected_local = substitute_prop(existential["body"], existential["binder"]["id"], replacement)
                    if not _same(local["claim"], expected_local):
                        obligations.append(Obligation(step["id"], "exists_elim_assumption", "The local hypothesis must be the existential body instantiated with the introduced witness."))
                    conclusion = any(
                        node_scope.get(pid) == child_scope
                        and proposition_of(claims[pid]) is not None
                        and _same(proposition_of(claims[pid]), target)
                        for pid in step["premises"]
                    )
                    if not conclusion:
                        obligations.append(Obligation(step["id"], "exists_elim_conclusion", "The existential witness subproof must establish the parent conclusion without leaking the witness."))

        if rule == "nat_induction":
            target = proposition_of(step["claim"])
            if target is None or target.get("kind") != "forall" or target["binder"]["type"] != "nat":
                obligations.append(Obligation(step["id"], "induction_target", "Natural induction must conclude a universally quantified proposition over ℕ."))
            else:
                ancestors = _scope_ancestors(scope_parent, step["scope"])
                child_scopes = {
                    node_scope[pid]
                    for pid in step["premises"]
                    if node_scope.get(pid) != step["scope"] and scope_parent.get(node_scope.get(pid)) == step["scope"]
                }
                zero_body = substitute_prop(target["body"], target["binder"]["id"], {"kind": "int", "value": 0})
                base_ids = [
                    pid for pid in step["premises"]
                    if node_scope.get(pid) in ancestors
                    and proposition_of(claims[pid]) is not None
                    and _same(proposition_of(claims[pid]), zero_body)
                ]
                if not base_ids:
                    obligations.append(Obligation(step["id"], "induction_base", "Natural induction needs a proof of the base case P(0)."))
                if len(child_scopes) != 1:
                    obligations.append(Obligation(step["id"], "induction_step_scope", "Natural induction needs exactly one direct child scope for k and the induction hypothesis."))
                else:
                    child_scope = next(iter(child_scopes))
                    scope_row = next(row for row in request["scopes"] if row["id"] == child_scope)
                    binders = scope_row.get("binders", [])
                    locals_ = [row for row in request["assumptions"] if row["scope"] == child_scope]
                    if len(binders) != 1 or binders[0]["type"] != "nat" or len(locals_) != 1:
                        obligations.append(Obligation(step["id"], "induction_step_scope", "The induction step scope must introduce one arbitrary k : ℕ and exactly one induction hypothesis."))
                    else:
                        binder = binders[0]
                        local = locals_[0]
                        k_expr = {"kind": "var", "id": binder["id"]}
                        expected_ih = substitute_prop(target["body"], target["binder"]["id"], k_expr)
                        succ_expr = {"kind": "add", "left": k_expr, "right": {"kind": "int", "value": 1}}
                        expected_step = substitute_prop(target["body"], target["binder"]["id"], succ_expr)
                        if local["id"] not in step["premises"] or not _same(local["claim"], expected_ih):
                            obligations.append(Obligation(step["id"], "induction_hypothesis", "The child assumption must be exactly the induction hypothesis P(k)."))
                        conclusion = any(
                            node_scope.get(pid) == child_scope
                            and proposition_of(claims[pid]) is not None
                            and _same(proposition_of(claims[pid]), expected_step)
                            for pid in step["premises"]
                        )
                        if not conclusion:
                            obligations.append(Obligation(step["id"], "induction_successor", "The induction step must establish P(k + 1) from P(k)."))

        if rule == "or_elim":
            target = proposition_of(step["claim"])
            parent_props = []
            ancestors = _scope_ancestors(scope_parent, step["scope"])
            for pid in step["premises"]:
                if node_scope.get(pid) in ancestors:
                    candidate = proposition_of(claims[pid])
                    if candidate is not None:
                        parent_props.append((pid, candidate))
            disjunctions = [(pid, prop) for pid, prop in parent_props if prop.get("kind") == "or"]
            child_scopes = {
                node_scope[pid]
                for pid in step["premises"]
                if node_scope.get(pid) != step["scope"] and scope_parent.get(node_scope.get(pid)) == step["scope"]
            }
            if target is None or len(disjunctions) != 1 or len(child_scopes) != 2:
                obligations.append(Obligation(step["id"], "or_elim_shape", "Case elimination needs one P or Q premise and exactly two direct child case scopes."))
            else:
                _hor_id, disjunction = disjunctions[0]
                unmatched = {"left", "right"}
                for child_scope in child_scopes:
                    locals_ = [row for row in request["assumptions"] if row["scope"] == child_scope]
                    if len(locals_) != 1:
                        obligations.append(Obligation(step["id"], "case_assumption", "Each case branch must introduce exactly one local assumption."))
                        continue
                    local = locals_[0]
                    if local["id"] not in step["premises"]:
                        obligations.append(Obligation(step["id"], "case_assumption", "The case-elimination step must cite each branch assumption being discharged."))
                    side = next((name for name in list(unmatched) if _same(local["claim"], disjunction[name])), None)
                    if side is None:
                        obligations.append(Obligation(step["id"], "case_assumption", "Branch assumptions must match the two alternatives of the cited disjunction."))
                        continue
                    unmatched.remove(side)
                    conclusion = any(
                        node_scope.get(pid) == child_scope
                        and proposition_of(claims[pid]) is not None
                        and _same(proposition_of(claims[pid]), target)
                        for pid in step["premises"]
                    )
                    if not conclusion:
                        obligations.append(Obligation(step["id"], "case_conclusion", "Every branch must establish the same parent conclusion."))
                if unmatched:
                    obligations.append(Obligation(step["id"], "case_exhaustiveness", "The two case branches must cover both alternatives of the disjunction."))


        if rule == "eq_subst":
            target = proposition_of(step["claim"])
            premise_rows = [(pid, proposition_of(claims[pid])) for pid in step["premises"]]
            valid = False
            if target is not None and len(premise_rows) == 2:
                for eq_id, equality in premise_rows:
                    if equality is None or equality.get("kind") != "eq":
                        continue
                    source_rows = [(pid, prop) for pid, prop in premise_rows if pid != eq_id and prop is not None]
                    if len(source_rows) != 1:
                        continue
                    _source_id, source = source_rows[0]
                    for variable_side, replacement in ((equality["left"], equality["right"]), (equality["right"], equality["left"])):
                        if variable_side.get("kind") != "var":
                            continue
                        expected = substitute_prop(source, variable_side["id"], replacement)
                        if _same(target, expected):
                            valid = True
                            break
            if not valid:
                obligations.append(Obligation(step["id"], "eq_subst_shape", "Equality substitution needs x = t and a proposition P(x), and concludes the capture-safe instance P(t)."))

        if rule == "congr_arg":
            target = proposition_of(step["claim"])
            props = _premise_props(premises)
            valid = False
            if target is not None and target.get("kind") == "eq" and len(props) == 1 and props[0].get("kind") == "eq":
                source = props[0]
                left = target["left"]
                right = target["right"]
                if left.get("kind") == "apply" and right.get("kind") == "apply" and _same(left["function"], right["function"]):
                    valid = _same(left["arg"], source["left"]) and _same(right["arg"], source["right"])
            if not valid:
                obligations.append(Obligation(step["id"], "congr_arg_shape", "Function congruence needs x = y and concludes f(x) = f(y) for the same declared function."))

        if rule == "function_ext":
            target = proposition_of(step["claim"])
            props = _premise_props(premises)
            variables = scope_variable_types(request, step["scope"])
            valid = False
            if target is not None and target.get("kind") == "eq" and len(props) == 1 and props[0].get("kind") == "forall":
                left_type = infer_expr_type(target["left"], variables)
                right_type = infer_expr_type(target["right"], variables)
                parts = function_type_parts(left_type)
                universal = props[0]
                if parts is not None and left_type == right_type and universal["binder"]["type"] == parts[0]:
                    x = {"kind": "var", "id": universal["binder"]["id"]}
                    expected = {
                        "kind": "eq",
                        "left": {"kind": "apply", "function": target["left"], "arg": x},
                        "right": {"kind": "apply", "function": target["right"], "arg": x},
                    }
                    valid = _same(universal["body"], expected)
            if not valid:
                obligations.append(Obligation(step["id"], "function_ext_shape", "Function extensionality needs pointwise equality for every input."))

        if rule == "set_ext":
            target = proposition_of(step["claim"])
            props = _premise_props(premises)
            variables = scope_variable_types(request, step["scope"])
            valid = False
            if target is not None and target.get("kind") == "eq" and len(props) == 1 and props[0].get("kind") == "forall":
                left_type = infer_expr_type(target["left"], variables)
                right_type = infer_expr_type(target["right"], variables)
                element_type = set_element_type(left_type)
                universal = props[0]
                if element_type is not None and left_type == right_type and universal["binder"]["type"] == element_type:
                    x = {"kind": "var", "id": universal["binder"]["id"]}
                    expected = {
                        "kind": "iff",
                        "left": {"kind": "mem", "left": x, "right": target["left"]},
                        "right": {"kind": "mem", "left": x, "right": target["right"]},
                    }
                    valid = _same(universal["body"], expected)
            if not valid:
                obligations.append(Obligation(step["id"], "set_ext_shape", "Set extensionality needs membership equivalence for every element."))

        if rule == "subset_intro":
            target = proposition_of(step["claim"])
            props = _premise_props(premises)
            variables = scope_variable_types(request, step["scope"])
            valid = False
            if target is not None and target.get("kind") == "subset" and len(props) == 1 and props[0].get("kind") == "forall":
                set_type = infer_expr_type(target["left"], variables)
                element_type = set_element_type(set_type)
                universal = props[0]
                if element_type is not None and infer_expr_type(target["right"], variables) == set_type and universal["binder"]["type"] == element_type:
                    x = {"kind": "var", "id": universal["binder"]["id"]}
                    expected = {
                        "kind": "implies",
                        "left": {"kind": "mem", "left": x, "right": target["left"]},
                        "right": {"kind": "mem", "left": x, "right": target["right"]},
                    }
                    valid = _same(universal["body"], expected)
            if not valid:
                obligations.append(Obligation(step["id"], "subset_intro_shape", "Subset introduction needs a proof that every member of the left set belongs to the right set."))

        if rule == "subset_elim":
            target = proposition_of(step["claim"])
            props = _premise_props(premises)
            valid = False
            if target is not None and target.get("kind") == "mem":
                for subset in [item for item in props if item.get("kind") == "subset"]:
                    source = {"kind": "mem", "left": target["left"], "right": subset["left"]}
                    expected = {"kind": "mem", "left": target["left"], "right": subset["right"]}
                    if _same(target, expected) and any(_same(item, source) for item in props):
                        valid = True
                        break
            if not valid:
                obligations.append(Obligation(step["id"], "subset_elim_shape", "Subset elimination needs A ⊆ B and x ∈ A to conclude x ∈ B."))

    # Meaning boundary: classroom partial functions must carry their guards even
    # though Lean/mathlib may define a total operation outside that school domain.
    # Append these after step-specific obligations so the most actionable missing
    # justification stays first for existing callers.
    for requirement in unmet_goal_requirements(request):
        obligations.append(Obligation("goal", requirement.code, requirement.message, {"kind": "proposition", "proposition": requirement.claim}))


    goal_hash = canonical_hash(request["goal"])
    root_steps = [step for step in request["steps"] if step["scope"] == "root"]
    if not any(canonical_hash(step["claim"]) == goal_hash for step in root_steps):
        obligations.append(Obligation("goal", "final_goal_unestablished", "No submitted root proof step establishes the final goal."))
    return obligations
