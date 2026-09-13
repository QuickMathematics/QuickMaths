from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from .contract import canonical_hash
from .logic import substitute_expr
from .symbolic import exact_rational_value, structurally_negative, structurally_nonnegative, structurally_nonzero, structurally_positive


@dataclass(frozen=True)
class DomainRequirement:
    claim: dict[str, Any]
    code: str
    message: str
    source: str = ""


def zero() -> dict[str, Any]:
    return {"kind": "int", "value": 0}


def nonzero(expr: dict[str, Any]) -> dict[str, Any]:
    return {"kind": "ne", "left": expr, "right": zero()}


def nonnegative(expr: dict[str, Any]) -> dict[str, Any]:
    return {"kind": "le", "left": zero(), "right": expr}


def positive(expr: dict[str, Any]) -> dict[str, Any]:
    return {"kind": "lt", "left": zero(), "right": expr}


def negative(expr: dict[str, Any]) -> dict[str, Any]:
    return {"kind": "lt", "left": expr, "right": zero()}


def _requirements_expr(expr: dict[str, Any], source: str) -> list[DomainRequirement]:
    kind = expr["kind"]
    if kind in {"int", "rat", "var"}:
        return []
    if kind in {"neg", "cast_real", "abs", "exp", "sin", "cos"}:
        return _requirements_expr(expr["arg"], source)
    if kind == "log":
        return [
            *_requirements_expr(expr["arg"], source),
            DomainRequirement(
                positive(expr["arg"]),
                "log_domain",
                "School-real logarithm reasoning requires the argument to be strictly positive.",
                source,
            ),
        ]
    if kind == "sqrt":
        return [
            *_requirements_expr(expr["arg"], source),
            DomainRequirement(
                nonnegative(expr["arg"]),
                "sqrt_domain",
                "School-real square root reasoning requires the radicand to be nonnegative.",
                source,
            ),
        ]
    if kind == "pow":
        return _requirements_expr(expr["base"], source)
    if kind == "rpow":
        return [
            *_requirements_expr(expr["base"], source),
            *_requirements_expr(expr["exponent"], source),
            DomainRequirement(
                nonnegative(expr["base"]),
                "rpow_domain",
                "School-real fractional-power reasoning requires a nonnegative base.",
                source,
            ),
        ]
    if kind == "pow_nat":
        return [*_requirements_expr(expr["base"], source), *_requirements_expr(expr["exponent"], source)]
    if kind == "apply":
        return [*_requirements_expr(expr["function"], source), *_requirements_expr(expr["arg"], source)]
    if kind == "if":
        return [
            *_requirements_prop(expr["condition"], source),
            *_requirements_expr(expr["then"], source),
            *_requirements_expr(expr["else"], source),
        ]
    if kind in {"add", "sub", "mul", "mod_nat"}:
        return [*_requirements_expr(expr["left"], source), *_requirements_expr(expr["right"], source)]
    if kind == "div":
        return [
            *_requirements_expr(expr["left"], source),
            *_requirements_expr(expr["right"], source),
            DomainRequirement(
                nonzero(expr["right"]),
                "denominator_nonzero",
                "Division requires the denominator to be nonzero on the intended domain.",
                source,
            ),
        ]
    return []


def _requirements_prop(prop: dict[str, Any], source: str) -> list[DomainRequirement]:
    kind = prop["kind"]
    if kind in {"true", "false"}:
        return []
    if kind in {"eq", "ne", "lt", "le", "gt", "ge", "mem", "subset"}:
        return [*_requirements_expr(prop["left"], source), *_requirements_expr(prop["right"], source)]
    if kind in {"and", "or", "implies", "iff"}:
        return [*_requirements_prop(prop["left"], source), *_requirements_prop(prop["right"], source)]
    if kind == "not":
        return _requirements_prop(prop["arg"], source)
    if kind in {"forall", "exists"}:
        return _requirements_prop(prop["body"], source)
    return []


def requirements_for_goal(goal: dict[str, Any], *, source: str = "goal") -> list[DomainRequirement]:
    if goal["kind"] == "proposition":
        return _dedupe(_requirements_prop(goal["proposition"], source))
    if goal["kind"] == "series_sum":
        rows = _requirements_expr(goal["expression"], source)
        if goal["result"]["kind"] == "finite":
            rows.extend(_requirements_expr(goal["result"]["value"], source))
        return _dedupe(rows)
    if goal["kind"] == "sequence_limit":
        rows = _requirements_expr(goal["expression"], source)
        if goal["result"]["kind"] == "finite":
            rows.extend(_requirements_expr(goal["result"]["value"], source))
        return _dedupe(rows)

    if goal["kind"] == "derivative":
        # A derivative goal binds its differentiation variable.  Domain
        # obligations therefore belong at the evaluation point, not at an
        # arbitrary/free value of that bound variable.  This is especially
        # important for quotient rules: HasDerivAt.fun_div needs g(a) ≠ 0,
        # not a global ∀ x, g(x) ≠ 0 hypothesis.
        expression_at_point = substitute_expr(goal["expression"], goal["variable"], goal["point"])
        rows = _requirements_expr(expression_at_point, source)
        rows.extend(_requirements_expr(goal["point"], source))
        # Do not independently reinterpret the derivative-value expression
        # here. Curated derivative rules validate the claimed formula and its
        # pointwise side conditions together (e.g. quotient denominators and
        # strict positivity for school-real square roots).
        return _dedupe(rows)
    rows = _requirements_expr(goal["expression"], source)
    rows.extend(_requirements_expr(goal["point"], source))
    if goal["result"]["kind"] == "finite":
        rows.extend(_requirements_expr(goal["result"]["value"], source))
    for guard in goal.get("domain", []):
        rows.extend(_requirements_prop(guard, source))
    return _dedupe(rows)


def _dedupe(items: Iterable[DomainRequirement]) -> list[DomainRequirement]:
    seen: set[str] = set()
    result: list[DomainRequirement] = []
    for item in items:
        key = canonical_hash(item.claim)
        if key not in seen:
            seen.add(key)
            result.append(item)
    return result


def _same_expr(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return canonical_hash(left) == canonical_hash(right)


def _is_var(expr: dict[str, Any], identifier: str) -> bool:
    return expr.get("kind") == "var" and expr.get("id") == identifier


def _is_sub_var_point(expr: dict[str, Any], variable: str, point: dict[str, Any]) -> bool:
    return (
        expr.get("kind") == "sub"
        and _is_var(expr.get("left", {}), variable)
        and _same_expr(expr.get("right", {}), point)
    )


def _limit_filter_implies(goal: dict[str, Any], claim: dict[str, Any]) -> bool:
    """Recognize guards guaranteed by the chosen punctured/directed limit filter."""
    if goal.get("kind") != "limit":
        return False
    if claim.get("kind") != "ne" or claim.get("right") != zero():
        return False
    left = claim.get("left", {})
    if _is_sub_var_point(left, goal["variable"], goal["point"]):
        return True
    # A denominator written simply as x is the same puncture when the
    # approach point is exactly zero.
    if _is_var(left, goal["variable"]) and goal["point"] == zero():
        return True
    return False


def _obviously_nonzero(expr: dict[str, Any]) -> bool:
    value = exact_rational_value(expr)
    if value is not None:
        return value != 0
    if expr.get("kind") == "neg":
        return _obviously_nonzero(expr.get("arg", {}))
    return False


def _obviously_nonnegative(expr: dict[str, Any]) -> bool:
    value = exact_rational_value(expr)
    if value is not None:
        return value >= 0
    kind = expr.get("kind")
    if kind in {"abs", "sqrt"}:
        return True
    if kind == "pow" and expr.get("exponent", 1) % 2 == 0:
        return True
    return False


def _obvious_claim(claim: dict[str, Any]) -> bool:
    kind = claim.get("kind")
    if kind in {"eq", "ne", "lt", "le", "gt", "ge"}:
        left = exact_rational_value(claim.get("left", {}))
        right = exact_rational_value(claim.get("right", {}))
        if left is not None and right is not None:
            return {
                "eq": left == right,
                "ne": left != right,
                "lt": left < right,
                "le": left <= right,
                "gt": left > right,
                "ge": left >= right,
            }[kind]
    if kind == "ne" and claim.get("right") == zero():
        return _obviously_nonzero(claim.get("left", {})) or structurally_nonzero(claim.get("left", {}))
    if kind == "le" and claim.get("left") == zero():
        return _obviously_nonnegative(claim.get("right", {})) or structurally_nonnegative(claim.get("right", {}))
    if kind == "lt" and claim.get("left") == zero():
        return structurally_positive(claim.get("right", {}))
    if kind == "lt" and claim.get("right") == zero():
        return structurally_negative(claim.get("left", {}))
    return False


def claim_available(claim: dict[str, Any], available: Iterable[dict[str, Any]], *, goal: dict[str, Any] | None = None) -> bool:
    if _obvious_claim(claim):
        return True
    rows = list(available)
    target = canonical_hash(claim)
    if any(canonical_hash(item) == target for item in rows):
        return True
    # Exact bridge used by school cancellation: a ≠ b entails a - b ≠ 0.
    # This is a semantic implication, not a CAS heuristic, so it is safe to use
    # when deciding whether an implication's antecedent supplies its domain guard.
    if claim.get("kind") == "le" and claim.get("left") == zero():
        strict = positive(claim.get("right", {}))
        if any(canonical_hash(item) == canonical_hash(strict) for item in rows):
            return True
    if claim.get("kind") == "ne" and claim.get("right") == zero():
        left = claim.get("left", {})
        # Strict sign evidence is a first-class safe bridge to nonzero.  This
        # mirrors the explicit Lean conversion used by guarded calculus rules.
        if any(canonical_hash(item) in {canonical_hash(positive(left)), canonical_hash(negative(left))} for item in rows):
            return True
        if left.get("kind") == "sub":
            source = {"kind": "ne", "left": left["left"], "right": left["right"]}
            if any(canonical_hash(item) == canonical_hash(source) for item in rows):
                return True
        if left.get("kind") == "pow" and isinstance(left.get("exponent"), int) and left["exponent"] > 0:
            source = nonzero(left.get("base", {}))
            if claim_available(source, rows):
                return True
    if goal is not None and _limit_filter_implies(goal, claim):
        return True
    return False


def root_context(request: dict[str, Any]) -> list[dict[str, Any]]:
    return [row["claim"] for row in request["assumptions"] if row["scope"] == "root"]


def _atomic_context(prop: dict[str, Any]) -> list[dict[str, Any]]:
    if prop.get("kind") == "and":
        return [*_atomic_context(prop["left"]), *_atomic_context(prop["right"])]
    if prop.get("kind") in {"eq", "ne", "lt", "le", "gt", "ge"}:
        return [prop]
    return []


def _unmet_prop_requirements(prop: dict[str, Any], available: list[dict[str, Any]]) -> list[DomainRequirement]:
    kind = prop["kind"]
    if kind in {"true", "false"}:
        return []
    if kind in {"eq", "ne", "lt", "le", "gt", "ge", "mem", "subset"}:
        return [item for item in _requirements_prop(prop, "goal") if not claim_available(item.claim, available)]
    if kind == "implies":
        left = _unmet_prop_requirements(prop["left"], available)
        nested = [*available, *_atomic_context(prop["left"])]
        right = _unmet_prop_requirements(prop["right"], nested)
        return _dedupe([*left, *right])
    if kind in {"and", "or", "iff"}:
        return _dedupe([*_unmet_prop_requirements(prop["left"], available), *_unmet_prop_requirements(prop["right"], available)])
    if kind == "not":
        return _unmet_prop_requirements(prop["arg"], available)
    if kind in {"forall", "exists"}:
        return _unmet_prop_requirements(prop["body"], available)
    return []


def _expr_mentions_bound(expr: dict[str, Any], variable: str) -> bool:
    kind = expr.get("kind")
    if kind == "var":
        return expr.get("id") == variable
    if kind in {"int", "rat"}:
        return False
    if kind in {"neg", "cast_real", "factorial", "sqrt", "abs", "exp", "log", "sin", "cos"}:
        return _expr_mentions_bound(expr.get("arg", {}), variable)
    if kind == "pow":
        return _expr_mentions_bound(expr.get("base", {}), variable)
    if kind == "rpow":
        return _expr_mentions_bound(expr.get("base", {}), variable) or _expr_mentions_bound(expr.get("exponent", {}), variable)
    if kind == "pow_nat":
        return _expr_mentions_bound(expr.get("base", {}), variable) or _expr_mentions_bound(expr.get("exponent", {}), variable)
    if kind == "apply":
        return _expr_mentions_bound(expr.get("function", {}), variable) or _expr_mentions_bound(expr.get("arg", {}), variable)
    if kind == "if":
        return _prop_mentions_bound(expr.get("condition", {}), variable) or _expr_mentions_bound(expr.get("then", {}), variable) or _expr_mentions_bound(expr.get("else", {}), variable)
    if kind in {"add", "sub", "mul", "div", "mod_nat"}:
        return _expr_mentions_bound(expr.get("left", {}), variable) or _expr_mentions_bound(expr.get("right", {}), variable)
    return False


def _prop_mentions_bound(prop: dict[str, Any], variable: str) -> bool:
    kind = prop.get("kind")
    if kind in {"true", "false"}:
        return False
    if kind in {"eq", "ne", "lt", "le", "gt", "ge", "mem", "subset"}:
        return _expr_mentions_bound(prop.get("left", {}), variable) or _expr_mentions_bound(prop.get("right", {}), variable)
    if kind in {"and", "or", "implies", "iff"}:
        return _prop_mentions_bound(prop.get("left", {}), variable) or _prop_mentions_bound(prop.get("right", {}), variable)
    if kind == "not":
        return _prop_mentions_bound(prop.get("arg", {}), variable)
    if kind in {"forall", "exists"}:
        if prop.get("binder", {}).get("id") == variable:
            return False
        return _prop_mentions_bound(prop.get("body", {}), variable)
    return False


def unmet_goal_requirements(request: dict[str, Any]) -> list[DomainRequirement]:
    goal = request["goal"]
    available = [*root_context(request)]
    available.extend(
        step["claim"]["proposition"]
        for step in request.get("steps", [])
        if step.get("scope") == "root" and step.get("claim", {}).get("kind") == "proposition"
    )
    if goal.get("kind") == "proposition":
        result = _unmet_prop_requirements(goal["proposition"], available)
        # IVT goals bind the witness inside the proposition, so pointwise
        # expression-domain requirements (for example ``g(c) != 0``) must be
        # interpreted over the interval containing that witness.  Replace those
        # raw pointwise blockers with first-class quantified interval evidence.
        # The import is local to keep the generic semantics layer independent
        # from the calculus matcher at module import time.
        from .calculus import (
            continuous_ivt_guard_status,
            interval_guard_expected_claim,
            match_continuous_ivt_existence,
        )

        pattern = match_continuous_ivt_existence(goal)
        if pattern is None:
            return result
        guard_hashes = {canonical_hash(guard.claim) for guard in pattern.guards}
        result = [item for item in result if canonical_hash(item.claim) not in guard_hashes]
        missing, violated = continuous_ivt_guard_status(pattern, available)
        for guard in violated:
            result.append(DomainRequirement(
                interval_guard_expected_claim(pattern, guard),
                "ivt_interval_domain_violation",
                guard.message.replace("at this point", "throughout this interval"),
                "goal",
            ))
        for guard in missing:
            result.append(DomainRequirement(
                interval_guard_expected_claim(pattern, guard),
                "ivt_interval_guard_required",
                "IVT needs interval-wide domain evidence for this expression before continuity can be used.",
                "goal",
            ))
        return _dedupe(result)
    available.extend(goal.get("domain", []))

    if goal.get("kind") == "series_sum":
        from .series import _eventual_nonzero_on_nat_threshold, match_p_series, match_series_ratio_limit_test, match_series_root_test

        claim_map: dict[str, dict[str, Any]] = {
            row["id"]: {"kind": "proposition", "proposition": row["claim"]}
            for row in request["assumptions"]
        }
        claim_map.update({row["id"]: row["claim"] for row in request.get("steps", [])})

        for step in request.get("steps", []):
            if (
                step.get("scope") == "root"
                and step.get("rule") == "series_ratio_limit_test"
                and canonical_hash(step.get("claim")) == canonical_hash(goal)
            ):
                premise_rows = [
                    (pid, claim_map[pid])
                    for pid in step.get("premises", [])
                    if pid in claim_map
                ]
                pattern = match_series_ratio_limit_test(goal, premise_rows)
                if pattern is not None and pattern.limit_premise_id is None:
                    automatic_guard_hashes: set[str] = set()
                    for requirement in requirements_for_goal(goal):
                        claim = requirement.claim
                        if (
                            requirement.code == "denominator_nonzero"
                            and claim.get("kind") == "ne"
                            and claim.get("right") == {"kind": "int", "value": 0}
                            and _eventual_nonzero_on_nat_threshold(claim.get("left", {}), goal["variable"]) is not None
                        ):
                            automatic_guard_hashes.add(canonical_hash(claim))
                    if automatic_guard_hashes:
                        return [
                            requirement for requirement in requirements_for_goal(goal)
                            if canonical_hash(requirement.claim) not in automatic_guard_hashes
                            and not claim_available(requirement.claim, available, goal=goal)
                        ]

        for step in request.get("steps", []):
            if (
                step.get("scope") == "root"
                and step.get("rule") == "series_root_test"
                and canonical_hash(step.get("claim")) == canonical_hash(goal)
            ):
                premise_rows = [
                    (pid, claim_map[pid])
                    for pid in step.get("premises", [])
                    if pid in claim_map and claim_map[pid].get("kind") == "sequence_limit"
                ]
                pattern = match_series_root_test(goal, premise_rows)
                if pattern is not None and pattern.limit_premise_id is None:
                    automatic_guard_hashes: set[str] = set()
                    if (
                        pattern.automatic_root_denominator_positive_on_nat
                        and pattern.automatic_root_denominator_polynomial is not None
                    ):
                        automatic_guard_hashes.add(
                            canonical_hash(nonzero(pattern.automatic_root_denominator_polynomial))
                        )
                    if (
                        pattern.automatic_root_school_denominator_eventual_nonzero_from is not None
                        and pattern.automatic_root_school_denominator is not None
                    ):
                        automatic_guard_hashes.add(
                            canonical_hash(nonzero(pattern.automatic_root_school_denominator))
                        )
                    if automatic_guard_hashes:
                        return [
                            requirement for requirement in requirements_for_goal(goal)
                            if canonical_hash(requirement.claim) not in automatic_guard_hashes
                            and not claim_available(requirement.claim, available, goal=goal)
                        ]

        for step in request.get("steps", []):
            if (
                step.get("scope") == "root"
                and step.get("rule") == "series_p_series"
                and canonical_hash(step.get("claim")) == canonical_hash(goal)
                and match_p_series(goal) is not None
            ):
                # The supported shifted p-series family requires k >= 1, so its
                # denominator is pointwise positive for every natural index.
                # Lean reconstructs this through the p-series theorem rather than
                # asking the learner for a quantified nonzero denominator premise.
                return [
                    requirement for requirement in requirements_for_goal(goal)
                    if not _prop_mentions_bound(requirement.claim, goal["variable"])
                    and not claim_available(requirement.claim, available, goal=goal)
                ]

    # A compositional finite-limit proof can justify eventual school-domain
    # validity from the *limits of subexpressions*.  For example, if g(x) → 2,
    # then f(x)/g(x) is eventually in-domain even though a raw syntactic scan
    # would ask for the impossible root assumption ``g(x) != 0`` about the
    # bound approach variable.  Only suppress expression-level requirements
    # when the final root limit_algebra step itself has a complete guarded plan.
    if goal.get("kind") == "limit":
        from .limits import limit_algebra_status, match_limit_algebra

        claim_map: dict[str, dict[str, Any]] = {
            row["id"]: {"kind": "proposition", "proposition": row["claim"]}
            for row in request["assumptions"]
        }
        claim_map.update({row["id"]: row["claim"] for row in request.get("steps", [])})
        for step in request.get("steps", []):
            if (
                step.get("scope") == "root"
                and step.get("rule") == "limit_algebra"
                and canonical_hash(step.get("claim")) == canonical_hash(goal)
            ):
                limit_rows = [
                    (pid, claim_map[pid])
                    for pid in step.get("premises", [])
                    if claim_map.get(pid, {}).get("kind") == "limit"
                ]
                premise_props = [
                    claim_map[pid]["proposition"]
                    for pid in step.get("premises", [])
                    if claim_map.get(pid, {}).get("kind") == "proposition"
                ]
                pattern = match_limit_algebra(goal, limit_rows)
                if pattern is not None:
                    missing, violated = limit_algebra_status(pattern, premise_props)
                    if not missing and not violated:
                        boundary_requirements: list[DomainRequirement] = []
                        boundary_requirements.extend(_requirements_expr(goal["point"], "goal"))
                        if goal["result"]["kind"] == "finite":
                            boundary_requirements.extend(_requirements_expr(goal["result"]["value"], "goal"))
                        for domain_prop in goal.get("domain", []):
                            boundary_requirements.extend(_requirements_prop(domain_prop, "goal"))
                        return [
                            requirement for requirement in _dedupe(boundary_requirements)
                            if not claim_available(requirement.claim, available, goal=goal)
                        ]

    if goal.get("kind") == "sequence_limit":
        from .sequences import (
            sequence_algebra_status, match_sequence_affine_ratio, match_sequence_algebra, match_sequence_elementary_divergence,
            match_sequence_monotone_bounded, match_sequence_polynomial_degree_ratio, match_sequence_quadratic_ratio, match_sequence_rational_shift, match_sequence_squeeze,
        )

        claim_map: dict[str, dict[str, Any]] = {
            row["id"]: {"kind": "proposition", "proposition": row["claim"]}
            for row in request["assumptions"]
        }
        claim_map.update({row["id"]: row["claim"] for row in request.get("steps", [])})
        for step in request.get("steps", []):
            if step.get("scope") != "root" or canonical_hash(step.get("claim")) != canonical_hash(goal):
                continue
            if step.get("rule") == "sequence_elementary_divergence":
                sequence_rows = [
                    (pid, claim_map[pid]) for pid in step.get("premises", [])
                    if claim_map.get(pid, {}).get("kind") == "sequence_limit"
                ]
                if match_sequence_elementary_divergence(goal, sequence_rows) is not None:
                    return [
                        requirement for requirement in requirements_for_goal(goal)
                        if not _prop_mentions_bound(requirement.claim, goal["variable"])
                        and not claim_available(requirement.claim, available, goal=goal)
                    ]
            if step.get("rule") == "sequence_affine_ratio" and match_sequence_affine_ratio(goal) is not None:
                return [
                    requirement for requirement in requirements_for_goal(goal)
                    if not _prop_mentions_bound(requirement.claim, goal["variable"])
                    and not claim_available(requirement.claim, available, goal=goal)
                ]
            if step.get("rule") == "sequence_quadratic_ratio" and match_sequence_quadratic_ratio(goal) is not None:
                return [
                    requirement for requirement in requirements_for_goal(goal)
                    if not _prop_mentions_bound(requirement.claim, goal["variable"])
                    and not claim_available(requirement.claim, available, goal=goal)
                ]
            if step.get("rule") == "sequence_polynomial_degree_ratio" and match_sequence_polynomial_degree_ratio(goal) is not None:
                return [
                    requirement for requirement in requirements_for_goal(goal)
                    if not _prop_mentions_bound(requirement.claim, goal["variable"])
                    and not claim_available(requirement.claim, available, goal=goal)
                ]
            if step.get("rule") == "sequence_rational_shift" and match_sequence_rational_shift(goal) is not None:
                return [
                    requirement for requirement in requirements_for_goal(goal)
                    if not _prop_mentions_bound(requirement.claim, goal["variable"])
                    and not claim_available(requirement.claim, available, goal=goal)
                ]
            if step.get("rule") == "sequence_squeeze":
                sequence_rows = [
                    (pid, claim_map[pid]) for pid in step.get("premises", [])
                    if claim_map.get(pid, {}).get("kind") == "sequence_limit"
                ]
                proposition_rows = [
                    (pid, claim_map[pid]["proposition"]) for pid in step.get("premises", [])
                    if claim_map.get(pid, {}).get("kind") == "proposition"
                ]
                if match_sequence_squeeze(goal, sequence_rows, proposition_rows) is not None:
                    return [
                        requirement for requirement in requirements_for_goal(goal)
                        if not _prop_mentions_bound(requirement.claim, goal["variable"])
                        and not claim_available(requirement.claim, available, goal=goal)
                    ]
            if step.get("rule") == "sequence_monotone_bounded":
                proposition_rows = [
                    (pid, claim_map[pid]["proposition"]) for pid in step.get("premises", [])
                    if claim_map.get(pid, {}).get("kind") == "proposition"
                ]
                if match_sequence_monotone_bounded(goal, proposition_rows) is not None:
                    return [
                        requirement for requirement in requirements_for_goal(goal)
                        if not _prop_mentions_bound(requirement.claim, goal["variable"])
                        and not claim_available(requirement.claim, available, goal=goal)
                    ]
            if step.get("rule") == "sequence_algebra":
                sequence_rows = [
                    (pid, claim_map[pid])
                    for pid in step.get("premises", [])
                    if claim_map.get(pid, {}).get("kind") == "sequence_limit"
                ]
                premise_props = [
                    claim_map[pid]["proposition"]
                    for pid in step.get("premises", [])
                    if claim_map.get(pid, {}).get("kind") == "proposition"
                ]
                pattern = match_sequence_algebra(goal, sequence_rows)
                if pattern is not None:
                    missing, violated = sequence_algebra_status(pattern, premise_props)
                    if not missing and not violated:
                        # Index-dependent school-domain requirements are discharged
                        # eventually by the sequence plan (e.g. a denominator whose
                        # finite target is nonzero). Constant parameter requirements
                        # remain ordinary root obligations.
                        return [
                            requirement for requirement in requirements_for_goal(goal)
                            if not _prop_mentions_bound(requirement.claim, goal["variable"])
                            and not claim_available(requirement.claim, available, goal=goal)
                        ]

    result: list[DomainRequirement] = []
    for requirement in requirements_for_goal(goal):
        if not claim_available(requirement.claim, available, goal=goal):
            result.append(requirement)
    return result
