from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

import sympy as sp

from .contract import canonical_hash, normalize_request
from .calculus import (
    abs_argument_exact_sign,
    continuity_guard_auto_tactic,
    continuity_pattern_status,
    continuous_ivt_guard_status,
    derivative_guard_auto_tactic,
    derivative_guard_exact_status,
    elementary_argument_is_exact_positive,
    ivt_bracket_auto_tactic,
    match_abs_derivative,
    match_conjugate_limit,
    match_continuity_limit,
    match_continuous_ivt_existence,
    match_elementary_derivative,
    match_interval_guard_evidence,
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
from .logic import claim_rows, substitute_prop, witness_type_compatible
from .limits import limit_algebra_status, limit_guard_auto_tactic, match_limit_algebra, match_limit_guard_evidence
from .series import match_geometric_series, match_p_series, match_series_comparison, match_series_ratio_test, match_series_ratio_limit_test, match_series_root_test
from .sequences import (
    match_nat_at_top, match_sequence_affine_ratio, match_sequence_algebra, match_sequence_elementary_divergence, match_sequence_guard_evidence,
    match_sequence_monotone_bounded, match_sequence_polynomial_degree_ratio, match_sequence_quadratic_ratio, match_sequence_rational_shift, match_sequence_squeeze,
    sequence_algebra_status, sequence_guard_auto_tactic,
)
from .planner import build_structured_plan
from .semantics import negative, nonnegative, nonzero, positive, requirements_for_goal, root_context, unmet_goal_requirements
from .symbolic import (
    exact_counterexample,
    expr_to_sympy,
    is_polynomial_identity,
    is_rational_identity,
    relation_prop,
    sympy_to_expr,
    variables_for,
)


@dataclass(frozen=True)
class ProofSuggestion:
    rule: str
    claim: dict[str, Any]
    premises: list[str] = field(default_factory=list)
    parameters: dict[str, Any] = field(default_factory=dict)
    confidence: str = "high"
    explanation: str = ""


def _allowed(request: dict[str, Any], rule: str) -> bool:
    allowed = request["policy"]["allowed_rules"]
    return not allowed or rule in allowed


def _root_claim_map(request: dict[str, Any]) -> dict[str, str]:
    result = {
        canonical_hash(row["claim"]): row["id"]
        for row in request["assumptions"]
        if row["scope"] == "root"
    }
    for step in request.get("steps", []):
        if step.get("scope") == "root" and step.get("claim", {}).get("kind") == "proposition":
            result[canonical_hash(step["claim"]["proposition"])] = step["id"]
    return result


def _root_claim_props(request: dict[str, Any]) -> list[dict[str, Any]]:
    result = [row["claim"] for row in request["assumptions"] if row["scope"] == "root"]
    result.extend(
        step["claim"]["proposition"]
        for step in request.get("steps", [])
        if step.get("scope") == "root" and step.get("claim", {}).get("kind") == "proposition"
    )
    return result


def _root_limit_rows(request: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    return [
        (step["id"], step["claim"])
        for step in request.get("steps", [])
        if step.get("scope") == "root" and step.get("claim", {}).get("kind") == "limit"
    ]


def _root_sequence_rows(request: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    return [
        (step["id"], step["claim"])
        for step in request.get("steps", [])
        if step.get("scope") == "root" and step.get("claim", {}).get("kind") == "sequence_limit"
    ]


def _root_series_rows(request: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    return [
        (step["id"], step["claim"])
        for step in request.get("steps", [])
        if step.get("scope") == "root" and step.get("claim", {}).get("kind") == "series_sum"
    ]


def _root_prop_rows(request: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    rows = [(row["id"], row["claim"]) for row in request["assumptions"] if row["scope"] == "root"]
    rows.extend(
        (step["id"], step["claim"]["proposition"])
        for step in request.get("steps", [])
        if step.get("scope") == "root" and step.get("claim", {}).get("kind") == "proposition"
    )
    return rows


def _is_one(expr: dict[str, Any]) -> bool:
    return expr == {"kind": "int", "value": 1}


def _is_zero(expr: dict[str, Any]) -> bool:
    return expr == {"kind": "int", "value": 0}


def _is_inverse_goal(goal: dict[str, Any]) -> bool:
    expression = goal.get("expression", {})
    return (
        goal.get("kind") == "limit"
        and expression.get("kind") == "div"
        and _is_one(expression.get("left", {}))
        and expression.get("right", {}).get("kind") == "var"
        and expression["right"].get("id") == goal.get("variable")
        and _is_zero(goal.get("point", {}))
    )


def _sqrt_square_pattern(prop: dict[str, Any]) -> dict[str, Any] | None:
    if prop.get("kind") != "eq":
        return None
    left = prop["left"]
    if left.get("kind") != "sqrt":
        return None
    arg = left.get("arg", {})
    if arg.get("kind") != "pow" or arg.get("exponent") != 2:
        return None
    base = arg.get("base")
    if base == prop["right"]:
        return base
    return None


def search_proof(raw_request: Any) -> dict[str, Any]:
    request = normalize_request(raw_request)
    suggestions: list[ProofSuggestion] = []
    claim_ids = _root_claim_map(request)
    root_claim_props = _root_claim_props(request)
    goal = request["goal"]
    domain_gaps = unmet_goal_requirements(request)

    # Before searching for a final proof, try exact declarative bridge steps that
    # discharge domain obligations from already stated school-style assumptions.
    if _allowed(request, "sub_ne_zero_from_ne"):
        for requirement in domain_gaps:
            claim = requirement.claim
            left = claim.get("left", {}) if claim.get("kind") == "ne" else {}
            right = claim.get("right", {}) if claim.get("kind") == "ne" else {}
            if left.get("kind") != "sub" or right != {"kind": "int", "value": 0}:
                continue
            source = {"kind": "ne", "left": left["left"], "right": left["right"]}
            source_id = claim_ids.get(canonical_hash(source))
            if source_id:
                suggestions.append(
                    ProofSuggestion(
                        "sub_ne_zero_from_ne",
                        {"kind": "proposition", "proposition": claim},
                        [source_id],
                        explanation="The stated excluded value directly gives the nonzero denominator needed by formal cancellation.",
                    )
                )

    goal_hash = canonical_hash(goal)
    for row in request["assumptions"]:
        wrapped = {"kind": "proposition", "proposition": row["claim"]}
        if row["scope"] == "root" and canonical_hash(wrapped) == goal_hash and _allowed(request, "exact"):
            suggestions.append(ProofSuggestion("exact", goal, [row["id"]], explanation="The goal is already available as a cited assumption."))
            break

    if goal["kind"] == "proposition":
        target_prop = goal["proposition"]
        rows = claim_rows(request, scope="root")
        row_hash = {canonical_hash(prop): identifier for identifier, prop in rows}

        if target_prop.get("kind") == "true" and _allowed(request, "true_intro"):
            suggestions.append(ProofSuggestion("true_intro", goal, explanation="True requires no premises."))

        if target_prop.get("kind") == "and" and _allowed(request, "and_intro"):
            left_id = row_hash.get(canonical_hash(target_prop["left"]))
            right_id = row_hash.get(canonical_hash(target_prop["right"]))
            if left_id and right_id:
                suggestions.append(ProofSuggestion("and_intro", goal, [left_id, right_id], explanation="Both conjuncts are already established."))

        if target_prop.get("kind") == "or":
            left_id = row_hash.get(canonical_hash(target_prop["left"]))
            right_id = row_hash.get(canonical_hash(target_prop["right"]))
            if left_id and _allowed(request, "or_intro_left"):
                suggestions.append(ProofSuggestion("or_intro_left", goal, [left_id], explanation="The left alternative is already established."))
            if right_id and _allowed(request, "or_intro_right"):
                suggestions.append(ProofSuggestion("or_intro_right", goal, [right_id], explanation="The right alternative is already established."))

        # Eliminate conjunctions, implications and biconditionals already in the
        # root context. These are exact structural operations, not heuristic CAS.
        target_hash = canonical_hash(target_prop)
        for identifier, source in rows:
            if source.get("kind") == "and":
                if canonical_hash(source["left"]) == target_hash and _allowed(request, "and_elim_left"):
                    suggestions.append(ProofSuggestion("and_elim_left", goal, [identifier], explanation="The goal is the left conjunct of an established conjunction."))
                if canonical_hash(source["right"]) == target_hash and _allowed(request, "and_elim_right"):
                    suggestions.append(ProofSuggestion("and_elim_right", goal, [identifier], explanation="The goal is the right conjunct of an established conjunction."))
            if source.get("kind") == "implies" and canonical_hash(source["right"]) == target_hash and _allowed(request, "modus_ponens"):
                antecedent_id = row_hash.get(canonical_hash(source["left"]))
                if antecedent_id:
                    suggestions.append(ProofSuggestion("modus_ponens", goal, [identifier, antecedent_id], explanation="The implication and its antecedent are established."))
            if source.get("kind") == "iff":
                if canonical_hash(source["right"]) == target_hash and _allowed(request, "iff_mp"):
                    left_id = row_hash.get(canonical_hash(source["left"]))
                    if left_id:
                        suggestions.append(ProofSuggestion("iff_mp", goal, [identifier, left_id], explanation="Use the forward direction of the established biconditional."))
                if canonical_hash(source["left"]) == target_hash and _allowed(request, "iff_mpr"):
                    right_id = row_hash.get(canonical_hash(source["right"]))
                    if right_id:
                        suggestions.append(ProofSuggestion("iff_mpr", goal, [identifier, right_id], explanation="Use the reverse direction of the established biconditional."))

        if target_prop.get("kind") == "iff" and _allowed(request, "iff_intro"):
            forward = {"kind": "implies", "left": target_prop["left"], "right": target_prop["right"]}
            backward = {"kind": "implies", "left": target_prop["right"], "right": target_prop["left"]}
            fwd_id = row_hash.get(canonical_hash(forward))
            bwd_id = row_hash.get(canonical_hash(backward))
            if fwd_id and bwd_id:
                suggestions.append(ProofSuggestion("iff_intro", goal, [fwd_id, bwd_id], explanation="Both directions of the biconditional are established."))

        false_id = row_hash.get(canonical_hash({"kind": "false"}))
        if false_id and _allowed(request, "false_elim"):
            suggestions.append(ProofSuggestion("false_elim", goal, [false_id], explanation="A contradiction has already established false, from which this proposition follows."))
        if target_prop.get("kind") == "false" and _allowed(request, "contradiction"):
            for identifier, source in rows:
                if source.get("kind") == "not":
                    positive_id = row_hash.get(canonical_hash(source["arg"]))
                    if positive_id:
                        suggestions.append(ProofSuggestion("contradiction", goal, [positive_id, identifier], explanation="The context contains a proposition and its negation."))
                        break

        # Bounded exact witness/instantiation discovery. Candidate terms are only
        # declared variables and tiny integers; the final proof is still rendered
        # and kernel-checked.
        witnesses = [{"kind": "var", "id": row["id"]} for row in request["variables"]]
        witnesses.extend({"kind": "int", "value": value} for value in range(-3, 4))
        if target_prop.get("kind") == "exists" and _allowed(request, "exists_intro"):
            binder = target_prop["binder"]
            for witness in witnesses:
                if not witness_type_compatible(request, binder["type"], witness):
                    continue
                body = substitute_prop(target_prop["body"], binder["id"], witness)
                body_id = row_hash.get(canonical_hash(body))
                if body_id:
                    suggestions.append(ProofSuggestion("exists_intro", goal, [body_id], {"witness": witness}, explanation="A concrete witness has an already-established instantiated body."))
                    break
        if _allowed(request, "forall_elim"):
            for universal_id, universal in rows:
                if universal.get("kind") != "forall":
                    continue
                binder = universal["binder"]
                for witness in witnesses:
                    if not witness_type_compatible(request, binder["type"], witness):
                        continue
                    instantiated = substitute_prop(universal["body"], binder["id"], witness)
                    if canonical_hash(instantiated) == target_hash:
                        suggestions.append(ProofSuggestion("forall_elim", goal, [universal_id], {"witness": witness}, explanation="Instantiate the universal statement at the matching term."))
                        break

        prop = relation_prop(goal)
        symbols = variables_for(request)
        if prop is not None and prop["kind"] == "eq":
            if _allowed(request, "ring_identity") and is_polynomial_identity(prop, symbols):
                suggestions.append(ProofSuggestion("ring_identity", goal, explanation="Polynomial normalization proves the equality; Lean will re-check the generated ring proof."))
            if _allowed(request, "field_identity") and is_rational_identity(prop, symbols):
                premises: list[str] = []
                missing: list[dict[str, Any]] = []
                for requirement in requirements_for_goal(goal):
                    if requirement.code != "denominator_nonzero":
                        continue
                    key = canonical_hash(requirement.claim)
                    if key in claim_ids:
                        premises.append(claim_ids[key])
                    else:
                        missing.append(requirement.claim)
                if not missing:
                    suggestions.append(
                        ProofSuggestion(
                            "field_identity",
                            goal,
                            premises,
                            explanation="Rational normalization proves the equality once every denominator guard is cited.",
                        )
                    )
            argument = _sqrt_square_pattern(prop)
            if argument is not None and _allowed(request, "sqrt_square_nonnegative"):
                key = canonical_hash(nonnegative(argument))
                if key in claim_ids:
                    suggestions.append(
                        ProofSuggestion(
                            "sqrt_square_nonnegative",
                            goal,
                            [claim_ids[key]],
                            {"argument": argument},
                            explanation="The square-root square identity is valid under the cited nonnegative hypothesis.",
                        )
                    )

    if goal.get("kind") == "proposition" and _allowed(request, "ivt_exists") and match_ivt_existence(goal) is not None:
        suggestions.append(
            ProofSuggestion(
                "ivt_exists",
                goal,
                explanation="The polynomial is continuous on the exact interval and its endpoint values bracket the target; IVT establishes existence, not uniqueness.",
            )
        )

    if goal.get("kind") == "proposition" and _allowed(request, "continuous_ivt_exists"):
        continuous_ivt = match_continuous_ivt_existence(goal)
        if continuous_ivt is not None:
            missing_guards, violated_guards = continuous_ivt_guard_status(continuous_ivt, root_claim_props)
            orientation, missing = select_continuous_ivt_orientation(continuous_ivt, root_claim_props)
            if not missing_guards and not violated_guards and orientation is not None and not missing:
                brackets = continuous_ivt.forward_brackets if orientation == "forward" else continuous_ivt.reverse_brackets
                premises: list[str] = []
                root_rows = claim_rows(request, scope="root")
                for guard in continuous_ivt.guards:
                    if continuity_guard_auto_tactic(guard) is not None:
                        continue
                    premise_id = next(
                        (identifier for identifier, prop in root_rows if match_interval_guard_evidence(continuous_ivt, guard, prop) is not None),
                        None,
                    )
                    if premise_id is not None and premise_id not in premises:
                        premises.append(premise_id)
                for bracket in brackets:
                    if ivt_bracket_auto_tactic(bracket) is not None:
                        continue
                    premise_id = next(
                        (identifier for identifier, prop in root_rows if canonical_hash(prop) == canonical_hash(bracket)),
                        None,
                    )
                    if premise_id is not None and premise_id not in premises:
                        premises.append(premise_id)
                suggestions.append(
                    ProofSuggestion(
                        "continuous_ivt_exists",
                        goal,
                        premises,
                        explanation=(
                            "A structural continuity plan is valid across the exact interval; interval-wide domain evidence and endpoint "
                            "brackets are cited explicitly when they are not automatically reconstructible, and Lean still applies IVT."
                        ),
                    )
                )

    if goal.get("kind") == "derivative" and _allowed(request, "polynomial_derivative") and match_polynomial_derivative(goal) is not None:
        suggestions.append(
            ProofSuggestion(
                "polynomial_derivative",
                goal,
                explanation="Exact polynomial differentiation matches the claimed derivative at this point; the generated HasDerivAt proof must still pass Lean.",
            )
        )

    if goal.get("kind") == "derivative" and _allowed(request, "quotient_derivative"):
        quotient = match_quotient_derivative(goal)
        if quotient is not None:
            guard = nonzero(quotient.denominator_at_point)
            guard_id = claim_ids.get(canonical_hash(guard))
            if quotient_denominator_is_exact_nonzero(quotient) or guard_id is not None:
                suggestions.append(
                    ProofSuggestion(
                        "quotient_derivative",
                        goal,
                        [] if guard_id is None else [guard_id],
                        explanation="The numerator and denominator are polynomial and the quotient-rule formula matches. A nonzero denominator at the evaluation point is mandatory before kernel checking.",
                    )
                )

    if goal.get("kind") == "derivative" and _allowed(request, "sqrt_derivative"):
        sqrt_pattern = match_sqrt_derivative(goal)
        if sqrt_pattern is not None:
            guard = positive(sqrt_pattern.radicand_at_point)
            guard_id = claim_ids.get(canonical_hash(guard))
            if sqrt_radicand_is_exact_positive(sqrt_pattern) or guard_id is not None:
                suggestions.append(
                    ProofSuggestion(
                        "sqrt_derivative",
                        goal,
                        [] if guard_id is None else [guard_id],
                        explanation="The radicand is polynomial and the chain-rule formula matches; strict positivity at the evaluation point is either exact arithmetic or explicit evidence, and the generated proof must still pass Lean.",
                    )
                )

    if goal.get("kind") == "derivative":
        elementary = match_elementary_derivative(goal)
        if elementary is not None:
            rule = f"{elementary.function}_derivative"
            if _allowed(request, rule):
                premises: list[str] = []
                eligible = True
                if elementary.function == "log":
                    guard = positive(elementary.argument_at_point)
                    guard_id = claim_ids.get(canonical_hash(guard))
                    eligible = elementary_argument_is_exact_positive(elementary) or guard_id is not None
                    if guard_id is not None:
                        premises = [guard_id]
                if eligible:
                    guard_note = (
                        " The logarithm argument is strictly positive at the evaluation point."
                        if elementary.function == "log" else ""
                    )
                    suggestions.append(ProofSuggestion(
                        rule, goal, premises,
                        explanation=f"The inner expression is polynomial and the {elementary.function} chain-rule derivative matches.{guard_note} Lean must still certify the generated HasDerivAt proof.",
                    ))

        if _allowed(request, "abs_derivative"):
            absolute = match_abs_derivative(goal)
            if absolute is not None:
                sign = abs_argument_exact_sign(absolute)
                premise_ids: list[str] | None = None
                if sign == "positive" and absolute.matches_positive:
                    premise_ids = []
                elif sign == "negative" and absolute.matches_negative:
                    premise_ids = []
                elif sign is None:
                    positive_id = claim_ids.get(canonical_hash(positive(absolute.argument_at_point)))
                    negative_id = claim_ids.get(canonical_hash(negative(absolute.argument_at_point)))
                    if absolute.matches_positive and positive_id is not None:
                        premise_ids = [positive_id]
                    elif absolute.matches_negative and negative_id is not None:
                        premise_ids = [negative_id]
                if premise_ids is not None:
                    suggestions.append(ProofSuggestion(
                        "abs_derivative", goal, premise_ids,
                        explanation="The polynomial inside the absolute value has a strict sign at the evaluation point, selecting a differentiable branch; Lean must still certify the composed derivative.",
                    ))

        if _allowed(request, "recursive_derivative"):
            recursive_patterns = match_recursive_derivative(goal)
            recursive, missing, violated = select_recursive_derivative_pattern(recursive_patterns, root_claim_props)
            if recursive is not None and not missing and not violated:
                recursive_premises: list[str] = []
                for guard in recursive.guards:
                    if derivative_guard_auto_tactic(guard) is not None:
                        continue
                    premise_id = claim_ids.get(canonical_hash(guard.claim))
                    if premise_id is not None and premise_id not in recursive_premises:
                        recursive_premises.append(premise_id)
                suggestions.append(ProofSuggestion(
                    "recursive_derivative", goal, recursive_premises,
                    explanation="A structural derivative plan covers the complete expression tree, and every quotient/log/sqrt/absolute-value point guard is either exact arithmetic or explicit evidence. Lean must still reconstruct and certify each composition step.",
                ))

    if goal["kind"] == "series_sum":
        if _allowed(request, "series_geometric"):
            geometric = match_geometric_series(goal)
            if geometric is not None:
                explanation = (
                    "The exact geometric term has |r| < 1 and the claimed sum is a/(1-r); Lean reconstructs mathlib's geometric HasSum theorem."
                    if geometric.result_kind == "finite"
                    else "The exact nonzero geometric term has |r| >= 1; Lean uses mathlib's summable-geometric iff criterion to refute summability."
                )
                suggestions.append(ProofSuggestion("series_geometric", goal, explanation=explanation))
        if _allowed(request, "series_p_series"):
            p_series = match_p_series(goal)
            if p_series is not None:
                suggestions.append(ProofSuggestion(
                    "series_p_series",
                    goal,
                    explanation="The exact shifted p-series with integer or rational real exponent is summable exactly when p > 1; Lean reconstructs the shift and scaling from mathlib's p-series theorem.",
                ))

        if _allowed(request, "series_comparison"):
            comparison = match_series_comparison(goal, [*_root_series_rows(request), *((pid, {"kind": "proposition", "proposition": prop}) for pid, prop in _root_prop_rows(request))])
            if comparison is not None:
                suggestions.append(ProofSuggestion(
                    "series_comparison",
                    goal,
                    [comparison.comparison_premise_id, comparison.evidence_premise_id],
                    explanation="A cited comparison-series theorem plus an explicit global/eventual nonnegative pointwise bound match the conservative comparison test; Lean transports summability or derives a contradiction from nonsummability.",
                ))

        if _allowed(request, "series_ratio_test"):
            ratio = match_series_ratio_test(goal, [
                (pid, {"kind": "proposition", "proposition": prop})
                for pid, prop in _root_prop_rows(request)
            ])
            if ratio is not None:
                suggestions.append(ProofSuggestion(
                    "series_ratio_test",
                    goal,
                    [ratio.evidence_premise_id],
                    explanation="A cited global/eventual successive-term absolute-value bound has exact ratio r < 1; Lean applies the kernel-backed ratio comparison with a geometric series.",
                ))

        if _allowed(request, "series_ratio_limit_test"):
            ratio_limit = match_series_ratio_limit_test(goal, [
                *_root_sequence_rows(request),
                *((pid, {"kind": "proposition", "proposition": prop}) for pid, prop in _root_prop_rows(request)),
            ])
            if ratio_limit is not None:
                premises = []
                if ratio_limit.limit_premise_id is not None:
                    premises.append(ratio_limit.limit_premise_id)
                if ratio_limit.nonzero_premise_id is not None:
                    premises.append(ratio_limit.nonzero_premise_id)
                explanation = (
                    "An exact limit of abs(a_(n+1))/abs(a_n) has rational L < 1 and the terms are cited or exactly reconstructed as eventually nonzero, so Lean applies the kernel-backed quotient-limit ratio test."
                    if ratio_limit.result_kind == "summable"
                    else "The absolute successive-term quotient has exact rational limit L > 1, so Lean applies mathlib's quotient-limit ratio divergence theorem; L = 1 remains inconclusive."
                )
                suggestions.append(ProofSuggestion(
                    "series_ratio_limit_test",
                    goal,
                    premises,
                    explanation=explanation,
                ))

        if _allowed(request, "series_root_test"):
            root_test = match_series_root_test(goal, _root_sequence_rows(request))
            if root_test is not None:
                premises = [root_test.limit_premise_id] if root_test.limit_premise_id is not None else []
                if root_test.limit_premise_id is None and root_test.automatic_root_polynomial_coefficients is not None:
                    family = (
                        "polynomial-quotient-geometric"
                        if root_test.automatic_root_denominator_polynomial_coefficients not in {None, (1,)}
                        else "polynomial-geometric"
                    )
                    source = f"The exact {family} term has automatic n-th-root limit |r| = {root_test.limit}. "
                else:
                    source = "The exact n-th-root limit is available. "
                explanation = source + (
                    "Because 0 <= L < 1, Lean converts the eventual root bound into geometric domination and proves summability."
                    if root_test.result_kind == "summable"
                    else "Because L > 1, the terms stay away from zero and the series cannot be summable; L = 1 remains inconclusive."
                )
                suggestions.append(ProofSuggestion(
                    "series_root_test",
                    goal,
                    premises,
                    explanation=explanation,
                ))

    if goal["kind"] == "sequence_limit":
        if _allowed(request, "sequence_nat_at_top") and match_nat_at_top(goal) is not None:
            suggestions.append(ProofSuggestion(
                "sequence_nat_at_top",
                goal,
                explanation="The sequence is an exact natural-to-real shift, so its Nat.atTop divergence is reconstructed from mathlib's nat-cast atTop theorem.",
            ))

        if _allowed(request, "sequence_elementary_divergence"):
            divergence = match_sequence_elementary_divergence(goal, _root_sequence_rows(request))
            if divergence is not None:
                if divergence.mode == "alternating_affine":
                    explanation = "Two explicit parity subsequences have different constant limits, so the sequence has no finite real limit."
                elif divergence.mode == "periodic_residue":
                    explanation = "Two arithmetic-progression subsequences from distinct residue classes are constant at different exact values, so the periodic sequence has no finite real limit."
                elif divergence.mode == "eventually_periodic_residue":
                    explanation = "After a finite prefix, the sequence is exactly periodic; Nat.atTop ignores that prefix, and two residue-class subsequences still have different exact limits."
                elif divergence.mode == "periodic_finite_tail":
                    if divergence.finite_tail is not None and divergence.finite_tail.used_sequence_premises:
                        explanation = "Two residue/parity subsequences retain different limits after reusing the cited finite limit of their common perturbation; the same cited limit shifts both residues and cannot make distinct base values equal."
                    else:
                        explanation = "Two residue/parity subsequences retain different limits because the common perturbation is independently proved to have one finite limit, shifting both residue limits by the same amount without making them equal."
                elif divergence.mode == "geometric_pos_inf":
                    explanation = "The exact positive geometric base is greater than one, so mathlib proves r^n tends to +infinity."
                else:
                    explanation = "The exact geometric sequence is incompatible with every finite real limit; Lean reconstructs either direct growth or growth of the absolute values."
                divergence_premises = list(divergence.finite_tail.used_sequence_premises) if divergence.finite_tail is not None else []
                suggestions.append(ProofSuggestion(
                    "sequence_elementary_divergence",
                    goal,
                    divergence_premises,
                    explanation=explanation,
                ))

        if goal.get("result", {}).get("kind") == "finite" and _allowed(request, "sequence_affine_ratio"):
            if match_sequence_affine_ratio(goal) is not None:
                suggestions.append(ProofSuggestion(
                    "sequence_affine_ratio",
                    goal,
                    explanation="An exact affine-over-affine sequence converges to the ratio of its leading coefficients; Lean applies mathlib's affine-ratio Nat.atTop theorem and checks the denominator leading coefficient is nonzero.",
                ))

        if goal.get("result", {}).get("kind") == "finite" and _allowed(request, "sequence_quadratic_ratio"):
            if match_sequence_quadratic_ratio(goal) is not None:
                suggestions.append(ProofSuggestion(
                    "sequence_quadratic_ratio",
                    goal,
                    explanation="An exact quadratic-over-quadratic sequence converges to the ratio of its quadratic coefficients; Lean normalizes by n^2 and checks the 1/n and 1/n^2 tails vanish.",
                ))

        if _allowed(request, "sequence_polynomial_degree_ratio"):
            degree_pattern = match_sequence_polynomial_degree_ratio(goal)
            if degree_pattern is not None:
                if degree_pattern.numerator_degree < degree_pattern.denominator_degree:
                    explanation = "The exact numerator degree is lower than the denominator degree, so mathlib Polynomial proves the quotient tends to 0."
                elif degree_pattern.numerator_degree == degree_pattern.denominator_degree:
                    explanation = "The exact polynomial degrees agree, so mathlib Polynomial proves the quotient tends to the exact ratio of leading coefficients."
                else:
                    explanation = "The exact numerator degree is higher than the denominator degree, so mathlib Polynomial proves signed divergence from the leading-coefficient ratio."
                suggestions.append(ProofSuggestion(
                    "sequence_polynomial_degree_ratio",
                    goal,
                    explanation=explanation,
                ))

        if goal.get("result", {}).get("kind") == "finite" and _allowed(request, "sequence_rational_shift"):
            if match_sequence_rational_shift(goal) is not None:
                suggestions.append(ProofSuggestion(
                    "sequence_rational_shift",
                    goal,
                    explanation="An exact shifted rational sequence is rewritten to 1 plus a reciprocal tail that vanishes over Nat.atTop; Lean reconstructs the algebra and convergence.",
                ))

        if goal.get("result", {}).get("kind") == "finite" and _allowed(request, "sequence_squeeze"):
            squeeze = match_sequence_squeeze(goal, _root_sequence_rows(request), _root_prop_rows(request))
            if squeeze is not None:
                suggestions.append(ProofSuggestion(
                    "sequence_squeeze",
                    goal,
                    [premise for premise in [
                        squeeze.lower_limit_premise,
                        squeeze.upper_limit_premise,
                        squeeze.lower_bound.premise_id,
                        squeeze.upper_bound.premise_id,
                    ] if premise is not None],
                    explanation="Two sequences converge to the same target and the requested sequence is bounded below/above by cited or automatically reconstructible inequalities, so the Nat.atTop squeeze theorem applies.",
                ))

        if goal.get("result", {}).get("kind") == "exists_finite" and _allowed(request, "sequence_monotone_bounded"):
            monotone = match_sequence_monotone_bounded(goal, _root_prop_rows(request))
            if monotone is not None:
                suggestions.append(ProofSuggestion(
                    "sequence_monotone_bounded",
                    goal,
                    [premise for premise in [monotone.monotonicity_premise, monotone.boundedness_premise] if premise is not None],
                    explanation="Matching monotonicity and boundedness evidence—cited or automatically reconstructed for a supported exact geometric approach—implies existence of a finite real sequence limit via ciSup/ciInf convergence.",
                ))

        if goal.get("result", {}).get("kind") == "finite" and _allowed(request, "sequence_algebra"):
            sequence_rows = _root_sequence_rows(request)
            pattern = match_sequence_algebra(goal, sequence_rows)
            if pattern is not None:
                prop_rows = _root_prop_rows(request)
                prop_claims = [prop for _, prop in prop_rows]
                missing, violated = sequence_algebra_status(pattern, prop_claims)
                if not missing and not violated:
                    premises = list(pattern.used_sequence_premises)
                    for guard in pattern.guards:
                        if sequence_guard_auto_tactic(guard) is not None:
                            continue
                        premise_id = next(
                            (pid for pid, prop in prop_rows if match_sequence_guard_evidence(guard, prop) is not None),
                            None,
                        )
                        if premise_id is not None and premise_id not in premises:
                            premises.append(premise_id)
                    suggestions.append(ProofSuggestion(
                        "sequence_algebra",
                        goal,
                        premises,
                        explanation=(
                            "A compositional Nat.atTop convergence plan builds this sequence limit. "
                            "Finite sublimits can be reused; shifted reciprocals and |r|<1 geometric tails are primitive leaves; quotient/log/sqrt target guards remain explicit and kernel-checked."
                        ),
                    ))

    if goal["kind"] == "limit":
        if goal.get("result", {}).get("kind") == "finite" and _allowed(request, "limit_algebra"):
            limit_rows = _root_limit_rows(request)
            pattern = match_limit_algebra(goal, limit_rows)
            if pattern is not None:
                prop_rows = _root_prop_rows(request)
                prop_claims = [prop for _, prop in prop_rows]
                missing, violated = limit_algebra_status(pattern, prop_claims)
                if not missing and not violated:
                    premises = list(pattern.used_limit_premises)
                    for guard in pattern.guards:
                        if limit_guard_auto_tactic(guard) is not None:
                            continue
                        premise_id = next(
                            (pid for pid, prop in prop_rows if match_limit_guard_evidence(guard, prop) is not None),
                            None,
                        )
                        if premise_id is not None and premise_id not in premises:
                            premises.append(premise_id)
                    suggestions.append(ProofSuggestion(
                        "limit_algebra",
                        goal,
                        premises,
                        explanation=(
                            "A compositional finite-limit plan builds this result over the shared approach filter. "
                            "Previously proved finite sublimits can be reused as leaves; quotient/log/sqrt target guards remain explicit and kernel-checked."
                        ),
                    ))

        if goal.get("result", {}).get("kind") == "finite" and _allowed(request, "continuity_limit"):
            continuity = match_continuity_limit(goal)
            if continuity is not None:
                missing, violated = continuity_pattern_status(continuity, root_claim_props)
                if not missing and not violated:
                    premises: list[str] = []
                    for guard in continuity.guards:
                        if continuity_guard_auto_tactic(guard) is not None:
                            continue
                        premise_id = claim_ids.get(canonical_hash(guard.claim))
                        if premise_id is not None and premise_id not in premises:
                            premises.append(premise_id)
                    suggestions.append(
                        ProofSuggestion(
                            "continuity_limit",
                            goal,
                            premises,
                            explanation="Direct substitution matches the claimed finite limit and a structural continuity plan covers the full expression; Lean must still prove every school-domain guard.",
                        )
                    )

        if _is_inverse_goal(goal) and goal["direction"] in {"left", "right"} and _allowed(request, "inverse_one_sided_limit"):
            expected = "positive_infinity" if goal["direction"] == "right" else "negative_infinity"
            if goal["result"]["kind"] == expected:
                suggestions.append(
                    ProofSuggestion(
                        "inverse_one_sided_limit",
                        goal,
                        parameters={"direction": goal["direction"]},
                        explanation="This is the standard one-sided reciprocal limit at zero.",
                    )
                )

        if _allowed(request, "conjugate_limit") and match_conjugate_limit(goal) is not None:
            suggestions.append(
                ProofSuggestion(
                    "conjugate_limit",
                    goal,
                    explanation="The goal matches the supported conjugate-hole family; the generated proof preserves x >= 0 and the punctured denominator guard.",
                )
            )

        if _allowed(request, "piecewise_jump") and match_piecewise_jump(goal) is not None:
            suggestions.append(
                ProofSuggestion(
                    "piecewise_jump",
                    goal,
                    explanation="The exact left and right branch values disagree, so a common two-sided finite limit would violate uniqueness.",
                )
            )

        # Detect removable rational holes exactly. SymPy is only a search aid:
        # the resulting candidate is still rendered to Lean and kernel-checked.
        if goal["result"]["kind"] == "finite" and goal["direction"] == "both" and _allowed(request, "rational_hole_limit"):
            symbols = variables_for(request)
            try:
                function = expr_to_sympy(goal["expression"], symbols)
                point = expr_to_sympy(goal["point"], symbols)
                target = expr_to_sympy(goal["result"]["value"], symbols)
                variable = symbols[goal["variable"]]
                actual = sp.limit(function, variable, point)
                simplified = sp.cancel(function)
                if sp.simplify(actual - target) == 0 and simplified != function:
                    reverse = {symbol: name for name, symbol in symbols.items()}
                    simplified_ast = sympy_to_expr(simplified, reverse)
                    suggestions.append(
                        ProofSuggestion(
                            "rational_hole_limit",
                            goal,
                            parameters={"simplified": simplified_ast},
                            explanation="Exact symbolic cancellation found a punctured-neighborhood formula with the claimed limit; Lean must still certify it.",
                        )
                    )
            except Exception:
                pass

    counterexample = None if suggestions or domain_gaps else exact_counterexample(request)
    status = "candidate_found" if suggestions else ("needs_domain" if domain_gaps else ("refuted_candidate" if counterexample else "no_candidate"))
    return {
        "request_id": request["request_id"],
        "suggestions": [asdict(item) for item in suggestions],
        "counterexample": counterexample,
        "domain_obligations": [asdict(item) for item in domain_gaps],
        "status": status,
    }


def build_auto_request(raw_request: Any) -> tuple[dict[str, Any], ProofSuggestion | None]:
    request = normalize_request(raw_request)
    result = search_proof(request)
    if not result["suggestions"]:
        return request, None
    suggestion = ProofSuggestion(**result["suggestions"][0])
    augmented = {
        **request,
        "steps": [
            *request["steps"],
            {
                "id": "auto_proof" if not request["steps"] else f"auto_proof_{len(request['steps']) + 1}",
                "scope": "root",
                "claim": suggestion.claim,
                "rule": suggestion.rule,
                "premises": suggestion.premises,
                "parameters": suggestion.parameters,
            },
        ],
    }
    return normalize_request(augmented), suggestion


def build_auto_plan(raw_request: Any, *, max_steps: int = 16) -> tuple[dict[str, Any], list[ProofSuggestion], dict[str, Any]]:
    """Build a bounded candidate proof plan without granting it authority.

    Proposition goals first use the recursive structured planner (including
    scoped implication/negation subproofs). Limits and any proposition family the
    structured planner cannot finish fall back to the incremental curated search.
    Every resulting request still passes ordinary preflight and Lean verification.
    """
    request = normalize_request(raw_request)
    if request["goal"]["kind"] == "proposition":
        planned, rows, conclusion = build_structured_plan(request, max_steps=max_steps)
        if conclusion is not None and canonical_hash(planned["goal"]) == canonical_hash(next(row["claim"] for row in planned["steps"] if row["id"] == conclusion)):
            added = [
                ProofSuggestion(
                    row["rule"], row["claim"], row["premises"], row["parameters"],
                    explanation="Bounded goal-directed candidate proof step.",
                )
                for row in rows
            ]
            return planned, added, {"status": "goal_candidate_complete", "suggestions": [], "counterexample": None, "domain_obligations": []}

    added: list[ProofSuggestion] = []
    seen: set[str] = set()

    for _ in range(max_steps):
        goal_hash = canonical_hash(request["goal"])
        if any(step["scope"] == "root" and canonical_hash(step["claim"]) == goal_hash for step in request["steps"]):
            return request, added, {"status": "goal_candidate_complete", "suggestions": [], "counterexample": None, "domain_obligations": []}

        result = search_proof(request)
        choices = []
        for raw in result["suggestions"]:
            suggestion = ProofSuggestion(**raw)
            signature = canonical_hash({
                "rule": suggestion.rule,
                "claim": suggestion.claim,
                "premises": suggestion.premises,
                "parameters": suggestion.parameters,
            })
            if signature not in seen:
                seen.add(signature)
                choices.append(suggestion)
        if not choices:
            return request, added, result

        suggestion = choices[0]
        identifier = f"auto_proof_{len(request['steps']) + 1}"
        augmented = {
            **request,
            "steps": [
                *request["steps"],
                {
                    "id": identifier,
                    "scope": "root",
                    "claim": suggestion.claim,
                    "rule": suggestion.rule,
                    "premises": suggestion.premises,
                    "parameters": suggestion.parameters,
                },
            ],
        }
        request = normalize_request(augmented)
        added.append(suggestion)

    return request, added, {"status": "search_limit_reached", "suggestions": [], "counterexample": None, "domain_obligations": []}
