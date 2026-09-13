from __future__ import annotations

from dataclasses import dataclass
from fractions import Fraction
from math import comb
from typing import Any

from .contract import canonical_hash
from .logic import same as same_logic, substitute_expr
from .symbolic import exact_rational_value
from .sequences import _polynomial_degree, _polynomial_real_coefficients


@dataclass(frozen=True)
class GeometricSeriesPattern:
    variable: str
    expression: dict[str, Any]
    coefficient: Fraction
    ratio: Fraction
    result_kind: str
    target: Fraction | None = None


@dataclass(frozen=True)
class PSeriesPattern:
    variable: str
    expression: dict[str, Any]
    coefficient: Fraction
    shift: int
    exponent: Fraction
    real_exponent: bool
    result_kind: str


@dataclass(frozen=True)
class SeriesComparisonPattern:
    variable: str
    expression: dict[str, Any]
    comparison_expression: dict[str, Any]
    result_kind: str
    comparison_result_kind: str
    comparison_premise_id: str
    evidence_premise_id: str
    evidence_mode: str


@dataclass(frozen=True)
class SeriesRatioTestPattern:
    variable: str
    expression: dict[str, Any]
    ratio_bound: Fraction
    evidence_premise_id: str
    evidence_mode: str


@dataclass(frozen=True)
class SeriesRatioLimitPattern:
    variable: str
    expression: dict[str, Any]
    result_kind: str
    limit: Fraction | None
    limit_premise_id: str | None
    automatic_ratio_base: Fraction | None
    automatic_ratio_factorial: bool = False
    automatic_ratio_factorial_shift: int = 0
    automatic_ratio_factorial_power: int = 1
    automatic_ratio_factorial_factors: tuple[tuple[int, int], ...] = ()
    automatic_ratio_factorial_quotient_shifts: tuple[int, int] | None = None
    automatic_ratio_factorial_quotient_power: int = 1
    automatic_ratio_factorial_quotient_factors: tuple[tuple[int, int, int], ...] = ()
    automatic_ratio_factorial_unmatched_numerator_shift: int | None = None
    automatic_ratio_factorial_unmatched_denominator_shift: int | None = None
    automatic_ratio_factorial_ratio_unbounded: bool = False
    automatic_ratio_factorial_quotient_coefficient: Fraction | None = None
    automatic_ratio_geometric_expression: dict[str, Any] | None = None
    automatic_ratio_polynomial: dict[str, Any] | None = None
    automatic_ratio_polynomial_coefficients: tuple[Fraction, ...] | None = None
    automatic_ratio_polynomial_degree: int | None = None
    automatic_ratio_polynomial_leading_coefficient: Fraction | None = None
    automatic_ratio_polynomial_nonzero_from: int | None = None
    automatic_ratio_denominator_polynomial: dict[str, Any] | None = None
    automatic_ratio_denominator_polynomial_coefficients: tuple[Fraction, ...] | None = None
    automatic_ratio_denominator_polynomial_degree: int | None = None
    automatic_ratio_denominator_polynomial_leading_coefficient: Fraction | None = None
    automatic_ratio_denominator_polynomial_nonzero_from: int | None = None
    nonzero_premise_id: str | None = None
    nonzero_mode: str | None = None
    automatic_nonzero_from: int | None = None


@dataclass(frozen=True)
class SeriesRootTestPattern:
    variable: str
    expression: dict[str, Any]
    result_kind: str
    limit: Fraction
    limit_premise_id: str | None
    automatic_root_base: Fraction | None
    automatic_root_coefficient: Fraction | None = None
    automatic_root_degree: int | None = None
    automatic_root_polynomial: dict[str, Any] | None = None
    automatic_root_polynomial_coefficients: tuple[Fraction, ...] | None = None
    automatic_root_denominator_coefficient: Fraction | None = None
    automatic_root_denominator_degree: int | None = None
    automatic_root_denominator_polynomial: dict[str, Any] | None = None
    automatic_root_denominator_polynomial_coefficients: tuple[Fraction, ...] | None = None
    automatic_root_denominator_positive_on_nat: bool = False
    automatic_root_geometric_expression: dict[str, Any] | None = None
    automatic_root_school_denominator: dict[str, Any] | None = None
    automatic_root_school_denominator_positive_on_nat: bool = False
    automatic_root_school_denominator_nonzero_on_nat: bool = False
    automatic_root_school_denominator_eventual_nonzero_from: int | None = None


def _comparison_evidence_prop(
    target: dict[str, Any],
    comparison: dict[str, Any],
    variable: str,
    *,
    target_summable: bool,
    binder: str = "comparisonIndex",
) -> dict[str, Any]:
    bound = {"kind": "var", "id": binder}
    target_at = substitute_expr(target, variable, bound)
    comparison_at = substitute_expr(comparison, variable, bound)
    smaller, larger = (target_at, comparison_at) if target_summable else (comparison_at, target_at)
    return {
        "kind": "forall",
        "binder": {"id": binder, "type": "nat"},
        "body": {
            "kind": "and",
            "left": {"kind": "le", "left": {"kind": "int", "value": 0}, "right": smaller},
            "right": {"kind": "le", "left": smaller, "right": larger},
        },
    }


def _eventual_comparison_evidence_prop(
    target: dict[str, Any],
    comparison: dict[str, Any],
    variable: str,
    *,
    target_summable: bool,
) -> dict[str, Any]:
    threshold = "comparisonThreshold"
    index = "comparisonIndex"
    pointwise = _comparison_evidence_prop(
        target, comparison, variable, target_summable=target_summable, binder=index
    )["body"]
    return {
        "kind": "exists",
        "binder": {"id": threshold, "type": "nat"},
        "body": {
            "kind": "forall",
            "binder": {"id": index, "type": "nat"},
            "body": {
                "kind": "implies",
                "left": {
                    "kind": "le",
                    "left": {"kind": "var", "id": threshold},
                    "right": {"kind": "var", "id": index},
                },
                "right": pointwise,
            },
        },
    }


def match_series_comparison(
    goal: dict[str, Any],
    premise_rows: list[tuple[str, dict[str, Any]]],
) -> SeriesComparisonPattern | None:
    """Match one conservative nonnegative comparison-test step.

    The target must claim only ``summable`` or ``not_summable``.  The rule
    consumes two *cited* premises: a comparison-series theorem and a
    global or eventual pointwise bound.  No inequality is synthesized
    here; this function only checks that the supplied evidence is exactly the
    comparison theorem required by ``Summable.of_nonneg_of_le``.
    """
    if goal.get("kind") != "series_sum":
        return None
    variable = goal.get("variable")
    result_kind = goal.get("result", {}).get("kind")
    if not isinstance(variable, str) or result_kind not in {"summable", "not_summable"}:
        return None

    target = goal.get("expression", {})
    series_rows = [(pid, claim) for pid, claim in premise_rows if claim.get("kind") == "series_sum"]
    prop_rows = [
        (pid, claim["proposition"] if claim.get("kind") == "proposition" else claim)
        for pid, claim in premise_rows
        if claim.get("kind") == "proposition" or claim.get("kind") in {"forall", "exists", "and", "or", "implies", "iff", "not", "eq", "ne", "lt", "le", "gt", "ge", "true", "false"}
    ]

    for series_id, comparison_claim in series_rows:
        if comparison_claim.get("variable") != variable:
            continue
        comparison_result = comparison_claim.get("result", {}).get("kind")
        if result_kind == "summable":
            if comparison_result not in {"summable", "finite"}:
                continue
        elif comparison_result != "not_summable":
            continue
        comparison = comparison_claim.get("expression", {})
        expected_global = _comparison_evidence_prop(
            target, comparison, variable, target_summable=result_kind == "summable"
        )
        expected_eventual = _eventual_comparison_evidence_prop(
            target, comparison, variable, target_summable=result_kind == "summable"
        )
        for evidence_id, evidence in prop_rows:
            if same_logic(evidence, expected_global):
                mode = "global"
            elif same_logic(evidence, expected_eventual):
                mode = "eventual"
            else:
                continue
            return SeriesComparisonPattern(
                variable=variable,
                expression=target,
                comparison_expression=comparison,
                result_kind=result_kind,
                comparison_result_kind=comparison_result,
                comparison_premise_id=series_id,
                evidence_premise_id=evidence_id,
                evidence_mode=mode,
            )
    return None



def _canonicalize_add_constants(expr: dict[str, Any]) -> dict[str, Any]:
    kind = expr.get("kind")
    if kind == "add":
        parts: list[dict[str, Any]] = []
        def collect(node: dict[str, Any]) -> None:
            if node.get("kind") == "add":
                collect(node.get("left", {})); collect(node.get("right", {}))
            else:
                parts.append(_canonicalize_add_constants(node))
        collect(expr)
        constant = sum(int(part["value"]) for part in parts if part.get("kind") == "int")
        nonconst = [part for part in parts if part.get("kind") != "int"]
        if constant != 0 or not nonconst:
            nonconst.append({"kind": "int", "value": constant})
        result = nonconst[0]
        for part in nonconst[1:]:
            result = {"kind": "add", "left": result, "right": part}
        return result
    if kind in {"neg", "cast_real", "factorial", "sqrt", "abs", "exp", "log", "sin", "cos"}:
        return {**expr, "arg": _canonicalize_add_constants(expr.get("arg", {}))}
    if kind in {"pow", "pow_nat"}:
        result = {**expr, "base": _canonicalize_add_constants(expr.get("base", {}))}
        if kind == "pow_nat":
            result["exponent"] = _canonicalize_add_constants(expr.get("exponent", {}))
        return result
    if kind == "rpow":
        return {**expr, "base": _canonicalize_add_constants(expr.get("base", {})), "exponent": _canonicalize_add_constants(expr.get("exponent", {}))}
    if kind in {"sub", "mul", "div", "mod_nat"}:
        return {**expr, "left": _canonicalize_add_constants(expr.get("left", {})), "right": _canonicalize_add_constants(expr.get("right", {}))}
    if kind == "if":
        return {**expr, "then": _canonicalize_add_constants(expr.get("then", {})), "else": _canonicalize_add_constants(expr.get("else", {}))}
    if kind == "apply":
        return {**expr, "function": _canonicalize_add_constants(expr.get("function", {})), "arg": _canonicalize_add_constants(expr.get("arg", {}))}
    return expr


def _same_ratio_expr(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return canonical_hash(_canonicalize_add_constants(left)) == canonical_hash(_canonicalize_add_constants(right))


def _ratio_test_bound_body(
    target: dict[str, Any], variable: str, binder: str, body: dict[str, Any]
) -> Fraction | None:
    """Extract exact r from |a_(n+1)| <= r * |a_n| for one binder."""
    if body.get("kind") != "le":
        return None
    index = {"kind": "var", "id": binder}
    next_index = {"kind": "add", "left": index, "right": {"kind": "int", "value": 1}}
    current = substitute_expr(target, variable, index)
    nxt = substitute_expr(target, variable, next_index)
    expected_left = {"kind": "abs", "arg": nxt}
    if not _same_ratio_expr(body.get("left", {}), expected_left):
        return None
    right = body.get("right", {})
    if right.get("kind") != "mul":
        return None
    left_factor, right_factor = right.get("left", {}), right.get("right", {})
    expected_current = {"kind": "abs", "arg": current}
    if _same_ratio_expr(right_factor, expected_current):
        ratio = exact_rational_value(left_factor)
    elif _same_ratio_expr(left_factor, expected_current):
        ratio = exact_rational_value(right_factor)
    else:
        return None
    if ratio is None or ratio < 0 or ratio >= 1:
        return None
    return ratio


def _match_ratio_test_evidence(
    target: dict[str, Any], variable: str, evidence: dict[str, Any]
) -> tuple[str, Fraction] | None:
    if evidence.get("kind") == "forall":
        binder = evidence.get("binder", {})
        if binder.get("type") != "nat" or not isinstance(binder.get("id"), str):
            return None
        ratio = _ratio_test_bound_body(target, variable, binder["id"], evidence.get("body", {}))
        return None if ratio is None else ("global", ratio)

    if evidence.get("kind") != "exists":
        return None
    threshold = evidence.get("binder", {})
    outer = evidence.get("body", {})
    if threshold.get("type") != "nat" or not isinstance(threshold.get("id"), str) or outer.get("kind") != "forall":
        return None
    binder = outer.get("binder", {})
    implication = outer.get("body", {})
    if binder.get("type") != "nat" or not isinstance(binder.get("id"), str) or implication.get("kind") != "implies":
        return None
    expected_guard = {
        "kind": "le",
        "left": {"kind": "var", "id": threshold["id"]},
        "right": {"kind": "var", "id": binder["id"]},
    }
    if implication.get("left") != expected_guard:
        return None
    ratio = _ratio_test_bound_body(target, variable, binder["id"], implication.get("right", {}))
    return None if ratio is None else ("eventual", ratio)


def match_series_ratio_test(
    goal: dict[str, Any], premise_rows: list[tuple[str, dict[str, Any]]]
) -> SeriesRatioTestPattern | None:
    """Match a conservative ratio-test convergence step from cited bounds.

    This first slice accepts only a summability goal plus one cited global or
    eventual bound of the exact form ``|a_(n+1)| <= r * |a_n|`` with exact
    rational ``0 <= r < 1``.  No quotient-limit or inequality synthesis is
    performed here.
    """
    if goal.get("kind") != "series_sum" or goal.get("result", {}).get("kind") != "summable":
        return None
    variable = goal.get("variable")
    if not isinstance(variable, str):
        return None
    target = goal.get("expression", {})
    for premise_id, claim in premise_rows:
        evidence = claim.get("proposition") if claim.get("kind") == "proposition" else claim
        if evidence.get("kind") not in {"forall", "exists"}:
            continue
        matched = _match_ratio_test_evidence(target, variable, evidence)
        if matched is None:
            continue
        mode, ratio = matched
        return SeriesRatioTestPattern(variable, target, ratio, premise_id, mode)
    return None


def _ratio_limit_expression(target: dict[str, Any], variable: str) -> dict[str, Any]:
    index = {"kind": "var", "id": variable}
    next_index = {"kind": "add", "left": index, "right": {"kind": "int", "value": 1}}
    current = substitute_expr(target, variable, index)
    nxt = substitute_expr(target, variable, next_index)
    return {
        "kind": "div",
        "left": {"kind": "abs", "arg": nxt},
        "right": {"kind": "abs", "arg": current},
    }


def _nonzero_body(target: dict[str, Any], variable: str, binder: str, body: dict[str, Any]) -> bool:
    if body.get("kind") != "ne":
        return False
    index = {"kind": "var", "id": binder}
    expected = substitute_expr(target, variable, index)
    zero = {"kind": "int", "value": 0}
    left, right = body.get("left", {}), body.get("right", {})
    return (
        _same_ratio_expr(left, expected) and _same_ratio_expr(right, zero)
    ) or (
        _same_ratio_expr(left, zero) and _same_ratio_expr(right, expected)
    )


def _match_eventual_nonzero_evidence(
    target: dict[str, Any], variable: str, evidence: dict[str, Any]
) -> str | None:
    if evidence.get("kind") == "forall":
        binder = evidence.get("binder", {})
        if binder.get("type") != "nat" or not isinstance(binder.get("id"), str):
            return None
        return "global" if _nonzero_body(target, variable, binder["id"], evidence.get("body", {})) else None

    if evidence.get("kind") != "exists":
        return None
    threshold = evidence.get("binder", {})
    outer = evidence.get("body", {})
    if threshold.get("type") != "nat" or not isinstance(threshold.get("id"), str) or outer.get("kind") != "forall":
        return None
    binder = outer.get("binder", {})
    implication = outer.get("body", {})
    if binder.get("type") != "nat" or not isinstance(binder.get("id"), str) or implication.get("kind") != "implies":
        return None
    expected_guard = {
        "kind": "le",
        "left": {"kind": "var", "id": threshold["id"]},
        "right": {"kind": "var", "id": binder["id"]},
    }
    if implication.get("left") != expected_guard:
        return None
    return "eventual" if _nonzero_body(target, variable, binder["id"], implication.get("right", {})) else None


_MAX_FACTORIAL_SHIFT = 10_000


def _factorial_shift(arg: dict[str, Any], variable: str) -> int | None:
    """Return ``k`` for the exact natural expression ``n + k``.

    Addition is canonicalized first, so ``k + n`` and parenthesized sums of
    exact integer constants are accepted too.  The shift is deliberately
    bounded to keep generated numeral/source size predictable.  No
    subtraction, multiplication, symbolic shifts, or second copy of the
    bound index is guessed.
    """
    normalized = _canonicalize_add_constants(arg)
    if normalized == {"kind": "var", "id": variable}:
        return 0
    if normalized.get("kind") != "add":
        return None
    left, right = normalized.get("left", {}), normalized.get("right", {})
    if left != {"kind": "var", "id": variable} or right.get("kind") != "int":
        return None
    shift = right.get("value")
    if not isinstance(shift, int) or isinstance(shift, bool) or not 0 <= shift <= _MAX_FACTORIAL_SHIFT:
        return None
    return shift


_MAX_FACTORIAL_POWER = 64


def _factorial_power_shift(denominator: dict[str, Any], variable: str) -> tuple[int, int] | None:
    """Return ``(k, m)`` for ``factorial(n + k)^m`` with exact ``m >= 1``.

    The unpowered denominator is treated as exponent one. Literal powers are
    bounded by the same degree/source-size cap used elsewhere. No symbolic or
    zero power is admitted because this helper exists only to reconstruct the
    factorial decay in the quotient-limit ratio test.
    """
    power = 1
    factorial = denominator
    if denominator.get("kind") == "pow":
        exponent = denominator.get("exponent")
        if (
            not isinstance(exponent, int)
            or isinstance(exponent, bool)
            or not 1 <= exponent <= _MAX_FACTORIAL_POWER
        ):
            return None
        power = exponent
        factorial = denominator.get("base", {})
    if factorial.get("kind") != "factorial":
        return None
    shift = _factorial_shift(factorial.get("arg", {}), variable)
    if shift is None:
        return None
    return shift, power


_MAX_FACTORIAL_FACTORS = 8
_MAX_FACTORIAL_TOTAL_POWER = 64


def _factorial_product_terms(
    denominator: dict[str, Any], variable: str
) -> tuple[tuple[int, int, dict[str, Any]], ...] | None:
    """Return exact shifted-factorial leaves from a denominator product.

    Each leaf must be ``factorial(n+k)^m`` with the existing exact bounded
    shift and positive literal power restrictions. Multiplication is flattened
    but division and every non-factorial leaf are rejected. The factor count
    and total power are bounded so generated Lean source remains predictable.
    The returned factorial AST is the unpowered leaf and is used only to
    reconstruct the original syntax in the Lean artifact.
    """
    terms: list[tuple[int, int, dict[str, Any]]] = []

    def collect(node: dict[str, Any]) -> bool:
        if node.get("kind") == "mul":
            return collect(node.get("left", {})) and collect(node.get("right", {}))
        matched = _factorial_power_shift(node, variable)
        if matched is None:
            return False
        shift, power = matched
        factorial = node.get("base", {}) if node.get("kind") == "pow" else node
        terms.append((shift, power, factorial))
        return True

    if not collect(denominator) or not terms:
        return None
    if len(terms) > _MAX_FACTORIAL_FACTORS:
        return None
    if sum(power for _, power, _ in terms) > _MAX_FACTORIAL_TOTAL_POWER:
        return None
    return tuple(terms)



def _split_factorial_denominator(
    expr: dict[str, Any], variable: str
) -> tuple[dict[str, Any], tuple[tuple[int, int, dict[str, Any]], ...]] | None:
    """Peel supported factorial leaves from denominator position.

    Multiplication/division is flattened first, so sequential spellings such as
    ``a / factorial(n) / factorial(n + 2)`` become the same factorial metadata
    as ``a / (factorial(n) * factorial(n + 2))``. Non-factorial denominator
    factors are rebuilt into the residual expression and continue through the
    established polynomial/geometric normalizer.

    A factorial that lands in numerator position is *not* peeled. This keeps
    true factorial quotients such as ``a / (factorial(n) / factorial(n + 1))``
    outside the automatic path, because the residual numerator still contains
    a factorial.
    """
    numerator_factors, denominator_factors = _flatten_mul_div(expr)
    factorial_terms: list[tuple[int, int, dict[str, Any]]] = []
    residual_denominator: list[dict[str, Any]] = []

    for factor in denominator_factors:
        matched = _factorial_power_shift(factor, variable)
        if matched is None:
            residual_denominator.append(factor)
            continue
        shift, power = matched
        factorial = factor.get("base", {}) if factor.get("kind") == "pow" else factor
        factorial_terms.append((shift, power, factorial))

    if not factorial_terms:
        return None
    if len(factorial_terms) > _MAX_FACTORIAL_FACTORS:
        return None
    if sum(power for _, power, _ in factorial_terms) > _MAX_FACTORIAL_TOTAL_POWER:
        return None

    residual_numerator = _multiply_factors(numerator_factors)
    if residual_denominator:
        residual = {
            "kind": "div",
            "left": residual_numerator,
            "right": _multiply_factors(residual_denominator),
        }
    else:
        residual = residual_numerator
    return residual, tuple(factorial_terms)


def _factorial_quotient_power_leaf(
    factor: dict[str, Any], variable: str
) -> tuple[int, int, int] | None:
    """Return ``(k, m, d)`` for ``(factorial(n+k)/factorial(n+m))^d``.

    The outer power is a fixed positive literal bounded by the existing
    factorial-power source-size cap.  The numerator and denominator inside
    the quotient must each be one unpowered shifted factorial.  This helper
    exists only to normalize syntax for the exact factorial-quotient ratio
    family; it does not distribute arbitrary powers over arbitrary quotients.
    """
    power = 1
    quotient = factor
    if factor.get("kind") == "pow":
        exponent = factor.get("exponent")
        if (
            not isinstance(exponent, int)
            or isinstance(exponent, bool)
            or not 1 <= exponent <= _MAX_FACTORIAL_POWER
        ):
            return None
        power = exponent
        quotient = factor.get("base", {})
    if quotient.get("kind") != "div":
        return None
    numerator = quotient.get("left", {})
    denominator = quotient.get("right", {})
    if numerator.get("kind") != "factorial" or denominator.get("kind") != "factorial":
        return None
    numerator_shift = _factorial_shift(numerator.get("arg", {}), variable)
    denominator_shift = _factorial_shift(denominator.get("arg", {}), variable)
    if numerator_shift is None or denominator_shift is None:
        return None
    return numerator_shift, denominator_shift, power


def _split_shifted_factorial_quotient_balance(
    expr: dict[str, Any], variable: str
) -> tuple[
    dict[str, Any],
    tuple[tuple[int, int, int], ...],
    tuple[tuple[int, int], ...],
    tuple[tuple[int, int], ...],
] | None:
    """Normalize shifted-factorial powers into balanced quotients plus residue.

    Multiplication/division is flattened and exact powers of the same shifted
    factorial are cancelled first. Remaining numerator and denominator powers
    are paired deterministically into quotient chunks. Any unpaired powers are
    returned explicitly rather than silently discarded; callers decide whether
    a particular imbalance is mathematically supported.

    Common cancelled blocks remain as neutral quotient factors so Lean can
    still prove the learner's original expression rather than a Python-reduced
    surrogate. Source-size caps apply to both balanced and residual powers.
    """
    numerator_factors, denominator_factors = _flatten_mul_div(expr)
    numerator_factorials: list[tuple[int, int]] = []
    denominator_factorials: list[tuple[int, int]] = []
    residual_numerator: list[dict[str, Any]] = []
    residual_denominator: list[dict[str, Any]] = []

    def consume(
        factor: dict[str, Any], *, inverted: bool, residual: list[dict[str, Any]]
    ) -> None:
        direct = _factorial_power_shift(factor, variable)
        if direct is not None:
            (denominator_factorials if inverted else numerator_factorials).append(direct)
            return
        quotient_power = _factorial_quotient_power_leaf(factor, variable)
        if quotient_power is not None:
            numerator_shift, denominator_shift, power = quotient_power
            if inverted:
                numerator_factorials.append((denominator_shift, power))
                denominator_factorials.append((numerator_shift, power))
            else:
                numerator_factorials.append((numerator_shift, power))
                denominator_factorials.append((denominator_shift, power))
            return
        residual.append(factor)

    for factor in numerator_factors:
        consume(factor, inverted=False, residual=residual_numerator)
    for factor in denominator_factors:
        consume(factor, inverted=True, residual=residual_denominator)

    if not numerator_factorials or not denominator_factorials:
        return None
    if (
        len(numerator_factorials) > _MAX_FACTORIAL_FACTORS
        or len(denominator_factorials) > _MAX_FACTORIAL_FACTORS
    ):
        return None

    numerator_work = [[shift, power] for shift, power in numerator_factorials]
    denominator_work = [[shift, power] for shift, power in denominator_factorials]
    cancelled_factors: list[tuple[int, int, int]] = []
    common_shifts = sorted(
        {shift for shift, _ in numerator_factorials}
        & {shift for shift, _ in denominator_factorials}
    )
    for shift in common_shifts:
        numerator_total = sum(power for factor_shift, power in numerator_work if factor_shift == shift)
        denominator_total = sum(power for factor_shift, power in denominator_work if factor_shift == shift)
        cancelled_power = min(numerator_total, denominator_total)
        if cancelled_power <= 0:
            continue
        cancelled_factors.append((shift, shift, cancelled_power))

        remaining = cancelled_power
        for row in numerator_work:
            if row[0] != shift or remaining == 0:
                continue
            amount = min(row[1], remaining)
            row[1] -= amount
            remaining -= amount
        remaining = cancelled_power
        for row in denominator_work:
            if row[0] != shift or remaining == 0:
                continue
            amount = min(row[1], remaining)
            row[1] -= amount
            remaining -= amount

    numerator_totals: dict[int, int] = {}
    denominator_totals: dict[int, int] = {}
    for shift, power in numerator_work:
        if power > 0:
            numerator_totals[shift] = numerator_totals.get(shift, 0) + power
    for shift, power in denominator_work:
        if power > 0:
            denominator_totals[shift] = denominator_totals.get(shift, 0) + power

    numerator_residual = [[shift, power] for shift, power in sorted(numerator_totals.items())]
    denominator_residual = [[shift, power] for shift, power in sorted(denominator_totals.items())]
    split_factors: list[tuple[int, int, int]] = []
    numerator_index = 0
    denominator_index = 0
    while numerator_index < len(numerator_residual) and denominator_index < len(denominator_residual):
        numerator_shift, numerator_power = numerator_residual[numerator_index]
        denominator_shift, denominator_power = denominator_residual[denominator_index]
        matched_power = min(numerator_power, denominator_power)
        if matched_power <= 0:
            return None
        split_factors.append((numerator_shift, denominator_shift, matched_power))
        numerator_residual[numerator_index][1] -= matched_power
        denominator_residual[denominator_index][1] -= matched_power
        if numerator_residual[numerator_index][1] == 0:
            numerator_index += 1
        if denominator_residual[denominator_index][1] == 0:
            denominator_index += 1

    unmatched_numerator = tuple(
        (shift, power) for shift, power in numerator_residual[numerator_index:] if power > 0
    )
    unmatched_denominator = tuple(
        (shift, power) for shift, power in denominator_residual[denominator_index:] if power > 0
    )
    quotient_factors = tuple(cancelled_factors) + tuple(split_factors)
    total_power = (
        sum(power for _, _, power in quotient_factors)
        + sum(power for _, power in unmatched_numerator)
        + sum(power for _, power in unmatched_denominator)
    )
    if not quotient_factors:
        return None
    if len(quotient_factors) + len(unmatched_numerator) + len(unmatched_denominator) > _MAX_FACTORIAL_FACTORS:
        return None
    if total_power > _MAX_FACTORIAL_TOTAL_POWER:
        return None

    residual_num = _multiply_factors(residual_numerator)
    residual_den = _multiply_factors(residual_denominator)
    residual = (
        residual_num
        if residual_den == {"kind": "int", "value": 1}
        else {"kind": "div", "left": residual_num, "right": residual_den}
    )
    return residual, quotient_factors, unmatched_numerator, unmatched_denominator


def _split_shifted_factorial_quotients(
    expr: dict[str, Any], variable: str
) -> tuple[dict[str, Any], tuple[tuple[int, int, int], ...]] | None:
    """Peel a bounded product of balanced powered shifted-factorial quotients.

    Checkpoint 57 permits exact common-power cancellation and deterministic
    power splitting across shifts, but still rejects unmatched factorial growth.
    The lower-level balance helper retains any residue for later ratio-test
    families while this compatibility wrapper preserves the balanced contract.
    """
    split = _split_shifted_factorial_quotient_balance(expr, variable)
    if split is None:
        return None
    residual, quotient_factors, unmatched_numerator, unmatched_denominator = split
    if unmatched_numerator or unmatched_denominator:
        return None
    return residual, quotient_factors


def _split_single_shifted_factorial_quotient(
    expr: dict[str, Any], variable: str
) -> tuple[dict[str, Any], int, int, int] | None:
    """Peel exactly one equal-powered shifted-factorial quotient from ``expr``."""
    split = _split_shifted_factorial_quotients(expr, variable)
    if split is None:
        return None
    residual, factors = split
    if len(factors) != 1:
        return None
    numerator_shift, denominator_shift, power = factors[0]
    return residual, numerator_shift, denominator_shift, power


def _match_shifted_factorial_quotient_geometric_ratio(
    expr: dict[str, Any], variable: str
) -> tuple[Fraction, Fraction, int, int] | None:
    """Recognize the unpowered ``c * r^n * (n+k)!/(n+m)!`` slice.

    Powered equal factorial quotients are intentionally routed through the
    polynomial-normalized matcher below so checkpoint 50's smaller renderer
    remains unchanged.
    """
    split = _split_single_shifted_factorial_quotient(expr, variable)
    if split is None:
        return None
    residual, numerator_shift, denominator_shift, power = split
    if power != 1:
        return None
    matched_term = _term_coeff_ratio(residual, variable)
    if matched_term is None:
        return None
    coefficient, ratio = matched_term
    if coefficient == 0 or ratio == 0:
        return None
    return coefficient, ratio, numerator_shift, denominator_shift

def _match_polynomial_shifted_factorial_quotient_geometric_ratio(
    expr: dict[str, Any], variable: str
) -> tuple[
    Fraction, int, int, int, dict[str, Any], tuple[Fraction, ...], int, Fraction, int,
    dict[str, Any] | None, tuple[Fraction, ...] | None, int | None, Fraction | None, int | None,
    dict[str, Any],
] | None:
    """Recognize ``(p(n) / q(n)) * r^n * factorial(n+k) / factorial(n+m)``.

    Exactly one shifted factorial must occur on each side with the same fixed
    positive literal power. After peeling those leaves, the residual must normalize to one exact nonzero
    rational-polynomial quotient times one exact nonzero rational geometric
    power. The polynomial denominator is optional so the checkpoint-51
    numerator-only family remains on this same path.

    Python records exact coefficients, the geometric base, and concrete
    eventual-nonzero thresholds for ``p`` and (when present) ``q``. Lean
    reconstructs both polynomial successor ratios, the denominator reverse
    successor ratio, and the powered factorial quotient recurrence.
    """
    split = _split_single_shifted_factorial_quotient(expr, variable)
    if split is None:
        return None
    residual, numerator_shift, denominator_shift, quotient_power = split
    automatic = _match_polynomial_geometric_ratio(residual, variable)
    if automatic is None:
        return None
    (
        polynomial, coefficients, degree, leading, threshold,
        polynomial_denominator, den_coefficients, den_degree, den_leading, den_threshold,
        ratio, geometric_expression,
    ) = automatic
    # The constant-times-single-geometric case is still handled first by the
    # smaller matcher above.  This normalized path accepts degree-zero
    # polynomial residuals only when the geometric syntax is a genuine
    # product/quotient, and it accepts higher-degree polynomial quotients with
    # either single or normalized multiple geometric factors.
    is_single_geometric = (
        geometric_expression.get("kind") == "pow_nat"
        and geometric_expression.get("exponent") == {"kind": "var", "id": variable}
        and exact_rational_value(geometric_expression.get("base", {})) == ratio
    )
    if degree < 1 and polynomial_denominator is None and is_single_geometric and quotient_power == 1:
        return None
    if ratio == 0:
        return None
    return (
        ratio, numerator_shift, denominator_shift, quotient_power,
        polynomial, coefficients, degree, leading, threshold,
        polynomial_denominator, den_coefficients, den_degree, den_leading, den_threshold,
        geometric_expression,
    )



def _match_multiple_polynomial_shifted_factorial_quotients_geometric_ratio(
    expr: dict[str, Any], variable: str
) -> tuple[
    Fraction, tuple[tuple[int, int, int], ...], dict[str, Any], tuple[Fraction, ...], int, Fraction, int,
    dict[str, Any] | None, tuple[Fraction, ...] | None, int | None, Fraction | None, int | None,
    dict[str, Any],
] | None:
    """Recognize normalized products of powered shifted-factorial quotients.

    The residual expression must remain in the checkpoint-53 exact
    polynomial-quotient/geometric family.  This helper only activates when at
    least two matched factorial quotient factors remain after normalization;
    the existing single-quotient matchers retain their established paths.
    """
    split = _split_shifted_factorial_quotients(expr, variable)
    if split is None:
        return None
    residual, quotient_factors = split
    if len(quotient_factors) < 2:
        return None
    automatic = _match_polynomial_geometric_ratio(residual, variable)
    if automatic is None:
        return None
    (
        polynomial, coefficients, degree, leading, threshold,
        polynomial_denominator, den_coefficients, den_degree, den_leading, den_threshold,
        ratio, geometric_expression,
    ) = automatic
    if ratio == 0:
        return None
    return (
        ratio, quotient_factors, polynomial, coefficients, degree, leading, threshold,
        polynomial_denominator, den_coefficients, den_degree, den_leading, den_threshold,
        geometric_expression,
    )


def _match_unbalanced_polynomial_shifted_factorial_quotients_geometric_ratio(
    expr: dict[str, Any], variable: str
) -> tuple[
    Fraction, tuple[tuple[int, int, int], ...], str, int,
    dict[str, Any], tuple[Fraction, ...], int, Fraction, int,
    dict[str, Any] | None, tuple[Fraction, ...] | None, int | None, Fraction | None, int | None,
    dict[str, Any],
] | None:
    """Recognize one exact residual factorial power after quotient balancing.

    Checkpoint 58 deliberately admits only a *single* unmatched factorial power
    after checkpoint-57 common cancellation and deterministic splitting.  One
    extra denominator factorial contributes ``1 / (n+k+1) -> 0``; one extra
    numerator factorial contributes ``n+k+1 -> +∞``.  The residual nonfactorial
    term must stay inside the established exact polynomial-quotient/geometric
    family, so no Stirling or approximate growth oracle is introduced.
    """
    split = _split_shifted_factorial_quotient_balance(expr, variable)
    if split is None:
        return None
    residual, quotient_factors, unmatched_numerator, unmatched_denominator = split
    if not quotient_factors:
        return None
    if unmatched_numerator and unmatched_denominator:
        return None
    if unmatched_numerator:
        if len(unmatched_numerator) != 1 or unmatched_numerator[0][1] != 1:
            return None
        side = "numerator"
        unmatched_shift = unmatched_numerator[0][0]
    elif unmatched_denominator:
        if len(unmatched_denominator) != 1 or unmatched_denominator[0][1] != 1:
            return None
        side = "denominator"
        unmatched_shift = unmatched_denominator[0][0]
    else:
        return None

    automatic = _match_polynomial_geometric_ratio(residual, variable)
    if automatic is None:
        return None
    (
        polynomial, coefficients, degree, leading, threshold,
        polynomial_denominator, den_coefficients, den_degree, den_leading, den_threshold,
        ratio, geometric_expression,
    ) = automatic
    if ratio == 0:
        return None
    return (
        ratio, quotient_factors, side, unmatched_shift,
        polynomial, coefficients, degree, leading, threshold,
        polynomial_denominator, den_coefficients, den_degree, den_leading, den_threshold,
        geometric_expression,
    )


def _match_factorial_geometric_ratio(
    expr: dict[str, Any], variable: str
) -> tuple[Fraction, tuple[tuple[int, int], ...]] | None:
    """Recognize ``c * r^n`` over one or more shifted-factorial factors.

    The denominator may contain one or more bounded exact leaves
    ``factorial(n+k)^m`` anywhere in a flattened denominator product or
    sequential division chain. The numerator remains the established exact nonzero
    rational multiple of one exact rational geometric power. Python extracts
    only the exact base and factorial metadata; Lean reconstructs every
    factorial recurrence and the product of reciprocal tails.
    """
    split = _split_factorial_denominator(expr, variable)
    if split is None:
        return None
    residual, terms = split
    factors = tuple((shift, power) for shift, power, _ in terms)
    matched = _term_coeff_ratio(residual, variable)
    if matched is None:
        return None
    coefficient, ratio = matched
    if coefficient == 0 or ratio == 0:
        return None
    return ratio, factors



def _match_polynomial_factorial_geometric_ratio(
    expr: dict[str, Any], variable: str
) -> tuple[
    Fraction, tuple[tuple[int, int], ...], dict[str, Any], tuple[Fraction, ...], int, Fraction, int,
    dict[str, Any] | None, tuple[Fraction, ...] | None, int | None, Fraction | None, int | None,
    dict[str, Any],
] | None:
    """Recognize polynomial/geometric terms over shifted-factorial products.

    The denominator polynomial is optional, so this subsumes the earlier
    ``p(n) * r^n / factorial(n + k)`` family. The factorial denominator may be
    one bounded leaf or multiple leaves ``factorial(n+k_i)^m_i`` gathered from
    any denominator position in a product or sequential division spelling.
    Exact products/quotients of nonzero rational geometric powers are folded
    to one exact rational base, reusing the same normalization as the ordinary
    quotient-limit ratio path. Python extracts only exact polynomial/base/shift data and
    concrete tail thresholds; Lean reconstructs the numerator successor ratio,
    the reverse denominator successor ratio when present, and the powered
    factorial recurrence before proving the complete quotient limit is zero.
    """
    split = _split_factorial_denominator(expr, variable)
    if split is None:
        return None
    residual, terms = split
    factors = tuple((shift, power) for shift, power, _ in terms)
    automatic = _match_polynomial_geometric_ratio(residual, variable)
    if automatic is None:
        return None
    (
        polynomial, coefficients, degree, leading, threshold,
        polynomial_denominator, den_coefficients, den_degree, den_leading, den_threshold,
        ratio, geometric_expression,
    ) = automatic
    # Keep the original constant-times-single-geometric family on its smaller
    # matcher, but let this normalized path handle constant polynomial factors
    # when the geometric part is a genuine product/quotient.  The shared
    # normalizer has already proved syntactically that every geometric factor
    # is an exact nonzero rational power of the bound index.
    is_single_geometric = (
        geometric_expression.get("kind") == "pow_nat"
        and geometric_expression.get("exponent") == {"kind": "var", "id": variable}
        and exact_rational_value(geometric_expression.get("base", {})) == ratio
    )
    if polynomial_denominator is None and degree < 1 and is_single_geometric:
        return None
    if ratio == 0:
        return None
    return (
        ratio, factors, polynomial, coefficients, degree, leading, threshold,
        polynomial_denominator, den_coefficients, den_degree, den_leading, den_threshold,
        geometric_expression,
    )

def _match_polynomial_geometric_ratio(
    expr: dict[str, Any], variable: str
) -> tuple[
    dict[str, Any], tuple[Fraction, ...], int, Fraction, int,
    dict[str, Any] | None, tuple[Fraction, ...] | None, int | None, Fraction | None, int | None,
    Fraction, dict[str, Any]
] | None:
    """Recognize ``(p(real(n)) / q(real(n)))`` times an exact geometric product.

    Multiplication and division are flattened syntactically. Every factor
    ``r^n`` with exact nonzero rational ``r`` is folded into one exact base;
    denominator geometric factors contribute ``1 / r``. The remaining
    numerator and denominator factors must each form one nonzero exact
    rational-coefficient polynomial accepted by the shared degree-64
    normalizer. An absent polynomial denominator is represented by ``None`` so
    the established numerator-only Lean artifact stays unchanged.

    Python only extracts exact syntax/coefficient data and concrete tail
    thresholds. Lean reconstructs both successive polynomial quotient limits,
    checks the tail nonzero certificates, and independently verifies the
    geometric normalization under absolute value.
    """
    numerator_factors, denominator_factors = _flatten_mul_div(expr)
    ratio = Fraction(1)
    geometric_count = 0
    geometric_numerator: list[dict[str, Any]] = []
    geometric_denominator: list[dict[str, Any]] = []
    numerator_residual: list[dict[str, Any]] = []
    denominator_residual: list[dict[str, Any]] = []

    for factor in numerator_factors:
        factor_ratio = _pow_ratio(factor, variable)
        if factor_ratio is None:
            numerator_residual.append(factor)
            continue
        if factor_ratio == 0:
            return None
        ratio *= factor_ratio
        geometric_count += 1
        geometric_numerator.append(factor)

    for factor in denominator_factors:
        factor_ratio = _pow_ratio(factor, variable)
        if factor_ratio is None:
            denominator_residual.append(factor)
            continue
        if factor_ratio == 0:
            return None
        ratio /= factor_ratio
        geometric_count += 1
        geometric_denominator.append(factor)

    if geometric_count == 0:
        return None

    polynomial = _multiply_factors(numerator_residual)
    coefficients = _polynomial_real_coefficients(polynomial, variable)
    if coefficients is None:
        return None
    degree = _polynomial_degree(coefficients)
    if degree < 0 or degree > 64:
        return None
    leading = coefficients[degree]
    if leading == 0:
        return None
    threshold = _eventual_nonzero_on_nat_threshold(polynomial, variable)
    if threshold is None:
        return None

    denominator: dict[str, Any] | None = None
    denominator_coefficients: tuple[Fraction, ...] | None = None
    denominator_degree: int | None = None
    denominator_leading: Fraction | None = None
    denominator_threshold: int | None = None
    if denominator_residual:
        denominator = _multiply_factors(denominator_residual)
        denominator_coefficients = _polynomial_real_coefficients(denominator, variable)
        if denominator_coefficients is None:
            return None
        denominator_degree = _polynomial_degree(denominator_coefficients)
        if denominator_degree < 0 or denominator_degree > 64:
            return None
        denominator_leading = denominator_coefficients[denominator_degree]
        if denominator_leading == 0:
            return None
        denominator_threshold = _eventual_nonzero_on_nat_threshold(denominator, variable)
        if denominator_threshold is None:
            return None

    geometric_num_expr = _multiply_factors(geometric_numerator)
    geometric_den_expr = _multiply_factors(geometric_denominator)
    geometric_expression = (
        geometric_num_expr
        if geometric_den_expr == {"kind": "int", "value": 1}
        else {"kind": "div", "left": geometric_num_expr, "right": geometric_den_expr}
    )
    return (
        polynomial, coefficients, degree, leading, threshold,
        denominator, denominator_coefficients, denominator_degree, denominator_leading, denominator_threshold,
        ratio, geometric_expression,
    )


def match_series_ratio_limit_test(
    goal: dict[str, Any], premise_rows: list[tuple[str, dict[str, Any]]]
) -> SeriesRatioLimitPattern | None:
    """Match the quotient-limit form of the ratio test.

    For a ``summable`` goal, require an exact rational quotient limit
    ``0 <= L < 1`` plus either cited global/eventual evidence that the terms
    are eventually nonzero or an exact kernel-reconstructible tail certificate,
    mirroring mathlib's ``summable_of_ratio_test_tendsto_lt_one``.

    For a ``not_summable`` goal, require an exact rational quotient limit
    ``L > 1``.  Mathlib's ``not_summable_of_ratio_test_tendsto_gt_one``
    derives the necessary eventual nonzero behavior from the positive gap
    above one, so no redundant nonzero premise is required. Exact products and
    quotients of nonzero rational geometric factors may be folded to one base
    around an exact polynomial quotient ``p(n) / q(n)``; both polynomial
    factors receive independent kernel-reconstructed tail certificates.
    ``L = 1`` is intentionally
    inconclusive.
    """
    if goal.get("kind") != "series_sum":
        return None
    result_kind = goal.get("result", {}).get("kind")
    if result_kind not in {"summable", "not_summable"}:
        return None
    variable = goal.get("variable")
    if not isinstance(variable, str):
        return None
    target = goal.get("expression", {})
    expected_ratio = _ratio_limit_expression(target, variable)

    sequence_rows = [
        (pid, claim)
        for pid, claim in premise_rows
        if claim.get("kind") == "sequence_limit"
        and claim.get("variable") == variable
        and claim.get("result", {}).get("kind") == "finite"
    ]
    prop_rows = [
        (pid, claim.get("proposition") if claim.get("kind") == "proposition" else claim)
        for pid, claim in premise_rows
        if claim.get("kind") == "proposition" or claim.get("kind") in {"forall", "exists"}
    ]

    def supported_limit(value: Fraction) -> bool:
        if result_kind == "summable":
            return Fraction(0) <= value < 1
        return value > 1

    matched_limit: tuple[
        str | None, Fraction, Fraction | None, dict[str, Any] | None,
        dict[str, Any] | None, tuple[Fraction, ...] | None, int | None, Fraction | None, int | None,
        dict[str, Any] | None, tuple[Fraction, ...] | None, int | None, Fraction | None, int | None,
    ] | None = None
    for limit_id, limit_claim in sequence_rows:
        if not _same_ratio_expr(limit_claim.get("expression", {}), expected_ratio):
            continue
        limit = exact_rational_value(limit_claim.get("result", {}).get("value", {}))
        if limit is None or not supported_limit(limit):
            continue
        matched_limit = (limit_id, limit, None, None, None, None, None, None, None, None, None, None, None, None)
        break

    # Exact shifted-factorial quotient: one factorial in numerator position
    # and one in denominator position. Their successive quotient contributes
    # ``(n+k+1)/(n+m+1) -> 1``; the geometric factor contributes ``|r|``.
    # This first numerator slice is intentionally unpowered and otherwise
    # constant-geometric only.
    if matched_limit is None:
        factorial_quotient = _match_shifted_factorial_quotient_geometric_ratio(target, variable)
        if factorial_quotient is not None:
            coefficient, quotient_base, numerator_shift, denominator_shift = factorial_quotient
            quotient_limit = abs(quotient_base)
            if supported_limit(quotient_limit):
                return SeriesRatioLimitPattern(
                    variable=variable,
                    expression=target,
                    result_kind=result_kind,
                    limit=quotient_limit,
                    limit_premise_id=None,
                    automatic_ratio_base=quotient_base,
                    automatic_ratio_factorial_quotient_shifts=(numerator_shift, denominator_shift),
                    automatic_ratio_factorial_quotient_coefficient=coefficient,
                    automatic_nonzero_from=0,
                )

    # Polynomial-times-geometric exact shifted-factorial quotient. This keeps
    # checkpoint 50's one-up/one-down factorial cancellation, but composes it
    # with the already kernel-reconstructed polynomial successor ratio.
    if matched_limit is None:
        polynomial_factorial_quotient = _match_polynomial_shifted_factorial_quotient_geometric_ratio(target, variable)
        if polynomial_factorial_quotient is not None:
            (
                quotient_base, numerator_shift, denominator_shift, quotient_power, polynomial, coefficients,
                degree, leading, polynomial_nonzero_from, polynomial_denominator,
                denominator_coefficients, denominator_degree, denominator_leading,
                denominator_nonzero_from, geometric_expression,
            ) = polynomial_factorial_quotient
            quotient_limit = abs(quotient_base)
            if supported_limit(quotient_limit):
                return SeriesRatioLimitPattern(
                    variable=variable,
                    expression=target,
                    result_kind=result_kind,
                    limit=quotient_limit,
                    limit_premise_id=None,
                    automatic_ratio_base=quotient_base,
                    automatic_ratio_factorial_quotient_shifts=(numerator_shift, denominator_shift),
                    automatic_ratio_factorial_quotient_power=quotient_power,
                    automatic_ratio_geometric_expression=geometric_expression,
                    automatic_ratio_polynomial=polynomial,
                    automatic_ratio_polynomial_coefficients=coefficients,
                    automatic_ratio_polynomial_degree=degree,
                    automatic_ratio_polynomial_leading_coefficient=leading,
                    automatic_ratio_polynomial_nonzero_from=polynomial_nonzero_from,
                    automatic_ratio_denominator_polynomial=polynomial_denominator,
                    automatic_ratio_denominator_polynomial_coefficients=denominator_coefficients,
                    automatic_ratio_denominator_polynomial_degree=denominator_degree,
                    automatic_ratio_denominator_polynomial_leading_coefficient=denominator_leading,
                    automatic_ratio_denominator_polynomial_nonzero_from=denominator_nonzero_from,
                    automatic_nonzero_from=max(
                        polynomial_nonzero_from,
                        denominator_nonzero_from if denominator_nonzero_from is not None else 0,
                    ),
                )

    # Product of two or more equal-powered shifted-factorial quotients. Each
    # factorial quotient contributes a fixed powered linear ratio tending to
    # one. The residual exact polynomial/geometric family is unchanged.
    if matched_limit is None:
        multiple_factorial_quotients = _match_multiple_polynomial_shifted_factorial_quotients_geometric_ratio(
            target, variable
        )
        if multiple_factorial_quotients is not None:
            (
                quotient_base, quotient_factors, polynomial, coefficients, degree, leading,
                polynomial_nonzero_from, polynomial_denominator, denominator_coefficients,
                denominator_degree, denominator_leading, denominator_nonzero_from,
                geometric_expression,
            ) = multiple_factorial_quotients
            quotient_limit = abs(quotient_base)
            if supported_limit(quotient_limit):
                return SeriesRatioLimitPattern(
                    variable=variable,
                    expression=target,
                    result_kind=result_kind,
                    limit=quotient_limit,
                    limit_premise_id=None,
                    automatic_ratio_base=quotient_base,
                    automatic_ratio_factorial_quotient_factors=quotient_factors,
                    automatic_ratio_geometric_expression=geometric_expression,
                    automatic_ratio_polynomial=polynomial,
                    automatic_ratio_polynomial_coefficients=coefficients,
                    automatic_ratio_polynomial_degree=degree,
                    automatic_ratio_polynomial_leading_coefficient=leading,
                    automatic_ratio_polynomial_nonzero_from=polynomial_nonzero_from,
                    automatic_ratio_denominator_polynomial=polynomial_denominator,
                    automatic_ratio_denominator_polynomial_coefficients=denominator_coefficients,
                    automatic_ratio_denominator_polynomial_degree=denominator_degree,
                    automatic_ratio_denominator_polynomial_leading_coefficient=denominator_leading,
                    automatic_ratio_denominator_polynomial_nonzero_from=denominator_nonzero_from,
                    automatic_nonzero_from=max(
                        polynomial_nonzero_from,
                        denominator_nonzero_from if denominator_nonzero_from is not None else 0,
                    ),
                )

    # Checkpoint 58: after checkpoint-57 cancellation/splitting, allow one
    # exact residual factorial power.  A denominator residue forces the ratio
    # to zero; a numerator residue makes the ratio tend to +∞.  Both cases are
    # reconstructed from exact factorial recurrences, never from Stirling.
    if matched_limit is None:
        unbalanced_factorials = _match_unbalanced_polynomial_shifted_factorial_quotients_geometric_ratio(
            target, variable
        )
        if unbalanced_factorials is not None:
            (
                quotient_base, quotient_factors, unmatched_side, unmatched_shift,
                polynomial, coefficients, degree, leading, polynomial_nonzero_from,
                polynomial_denominator, denominator_coefficients, denominator_degree,
                denominator_leading, denominator_nonzero_from, geometric_expression,
            ) = unbalanced_factorials
            if unmatched_side == "denominator" and result_kind == "summable":
                return SeriesRatioLimitPattern(
                    variable=variable,
                    expression=target,
                    result_kind=result_kind,
                    limit=Fraction(0),
                    limit_premise_id=None,
                    automatic_ratio_base=quotient_base,
                    automatic_ratio_factorial_quotient_factors=quotient_factors,
                    automatic_ratio_factorial_unmatched_denominator_shift=unmatched_shift,
                    automatic_ratio_geometric_expression=geometric_expression,
                    automatic_ratio_polynomial=polynomial,
                    automatic_ratio_polynomial_coefficients=coefficients,
                    automatic_ratio_polynomial_degree=degree,
                    automatic_ratio_polynomial_leading_coefficient=leading,
                    automatic_ratio_polynomial_nonzero_from=polynomial_nonzero_from,
                    automatic_ratio_denominator_polynomial=polynomial_denominator,
                    automatic_ratio_denominator_polynomial_coefficients=denominator_coefficients,
                    automatic_ratio_denominator_polynomial_degree=denominator_degree,
                    automatic_ratio_denominator_polynomial_leading_coefficient=denominator_leading,
                    automatic_ratio_denominator_polynomial_nonzero_from=denominator_nonzero_from,
                    automatic_nonzero_from=max(
                        polynomial_nonzero_from,
                        denominator_nonzero_from if denominator_nonzero_from is not None else 0,
                    ),
                )
            if unmatched_side == "numerator" and result_kind == "not_summable":
                return SeriesRatioLimitPattern(
                    variable=variable,
                    expression=target,
                    result_kind=result_kind,
                    limit=None,
                    limit_premise_id=None,
                    automatic_ratio_base=quotient_base,
                    automatic_ratio_factorial_quotient_factors=quotient_factors,
                    automatic_ratio_factorial_unmatched_numerator_shift=unmatched_shift,
                    automatic_ratio_factorial_ratio_unbounded=True,
                    automatic_ratio_geometric_expression=geometric_expression,
                    automatic_ratio_polynomial=polynomial,
                    automatic_ratio_polynomial_coefficients=coefficients,
                    automatic_ratio_polynomial_degree=degree,
                    automatic_ratio_polynomial_leading_coefficient=leading,
                    automatic_ratio_polynomial_nonzero_from=polynomial_nonzero_from,
                    automatic_ratio_denominator_polynomial=polynomial_denominator,
                    automatic_ratio_denominator_polynomial_coefficients=denominator_coefficients,
                    automatic_ratio_denominator_polynomial_degree=denominator_degree,
                    automatic_ratio_denominator_polynomial_leading_coefficient=denominator_leading,
                    automatic_ratio_denominator_polynomial_nonzero_from=denominator_nonzero_from,
                    automatic_nonzero_from=max(
                        polynomial_nonzero_from,
                        denominator_nonzero_from if denominator_nonzero_from is not None else 0,
                    ),
                )

    # Factorial families. The original constant-times-single-geometric case
    # has successive norm quotient |r| / (n + k + 1); positive literal powers
    # of the shifted factorial replace that tail by |r| / (n + k + 1)^m. The
    # normalized path accepts exact polynomial quotients and products/quotients
    # of nonzero rational geometric powers and reconstructs the same decay to
    # zero. No Stirling approximation is involved.
    if matched_limit is None and result_kind == "summable":
        factorial_match = _match_factorial_geometric_ratio(target, variable)
        if factorial_match is not None:
            factorial_base, factorial_factors = factorial_match
            factorial_shift, factorial_power = factorial_factors[0]
            return SeriesRatioLimitPattern(
                variable=variable,
                expression=target,
                result_kind=result_kind,
                limit=Fraction(0),
                limit_premise_id=None,
                automatic_ratio_base=factorial_base,
                automatic_ratio_factorial=True,
                automatic_ratio_factorial_shift=factorial_shift,
                automatic_ratio_factorial_power=factorial_power,
                automatic_ratio_factorial_factors=factorial_factors,
                automatic_nonzero_from=0,
            )

        polynomial_factorial_match = _match_polynomial_factorial_geometric_ratio(target, variable)
        if polynomial_factorial_match is not None:
            (
                factorial_base, factorial_factors, polynomial, coefficients, degree, leading,
                polynomial_nonzero_from, denominator_polynomial, denominator_coefficients,
                denominator_degree, denominator_leading, denominator_nonzero_from,
                geometric_expression,
            ) = polynomial_factorial_match
            factorial_shift, factorial_power = factorial_factors[0]
            return SeriesRatioLimitPattern(
                variable=variable,
                expression=target,
                result_kind=result_kind,
                limit=Fraction(0),
                limit_premise_id=None,
                automatic_ratio_base=factorial_base,
                automatic_ratio_factorial=True,
                automatic_ratio_factorial_shift=factorial_shift,
                automatic_ratio_factorial_power=factorial_power,
                automatic_ratio_factorial_factors=factorial_factors,
                automatic_ratio_geometric_expression=geometric_expression,
                automatic_ratio_polynomial=polynomial,
                automatic_ratio_polynomial_coefficients=coefficients,
                automatic_ratio_polynomial_degree=degree,
                automatic_ratio_polynomial_leading_coefficient=leading,
                automatic_ratio_polynomial_nonzero_from=polynomial_nonzero_from,
                automatic_ratio_denominator_polynomial=denominator_polynomial,
                automatic_ratio_denominator_polynomial_coefficients=denominator_coefficients,
                automatic_ratio_denominator_polynomial_degree=denominator_degree,
                automatic_ratio_denominator_polynomial_leading_coefficient=denominator_leading,
                automatic_ratio_denominator_polynomial_nonzero_from=denominator_nonzero_from,
                automatic_nonzero_from=max(
                    polynomial_nonzero_from, denominator_nonzero_from or 0
                ),
            )

    # Narrow premise-free reconstruction for an exact nonzero rational
    # geometric term r^n: the norm quotient is identically |r|.  Broader
    # quotient limits still require a cited theorem.
    if matched_limit is None and target.get("kind") == "pow_nat":
        if target.get("exponent") == {"kind": "var", "id": variable}:
            base = exact_rational_value(target.get("base", {}))
            if base is not None and base != 0 and supported_limit(abs(base)):
                matched_limit = (None, abs(base), base, None, None, None, None, None, 0, None, None, None, None, None)

    # Automatic quotient-limit reconstruction for a polynomial prefactor
    # times/divided by one or more exact rational geometric factors. Python
    # only normalizes exact syntax, polynomial coefficients and a concrete tail
    # certificate. Lean reconstructs the quotient limit from explicit
    # Polynomial values and checks the geometric normalization under abs.
    if matched_limit is None:
        automatic = _match_polynomial_geometric_ratio(target, variable)
        if automatic is not None:
            (
                polynomial, coefficients, degree, leading, threshold,
                denominator, denominator_coefficients, denominator_degree, denominator_leading, denominator_threshold,
                base, geometric_expression,
            ) = automatic
            if supported_limit(abs(base)):
                matched_limit = (
                    None, abs(base), base, geometric_expression,
                    polynomial, coefficients, degree, leading, threshold,
                    denominator, denominator_coefficients, denominator_degree, denominator_leading, denominator_threshold,
                )

    if matched_limit is None:
        return None
    (
        limit_id, limit, automatic_base, automatic_geometric_expression, automatic_polynomial,
        automatic_coefficients, automatic_degree, automatic_leading, automatic_polynomial_nonzero_from,
        automatic_denominator, automatic_denominator_coefficients, automatic_denominator_degree,
        automatic_denominator_leading, automatic_denominator_nonzero_from,
    ) = matched_limit

    if result_kind == "not_summable":
        return SeriesRatioLimitPattern(
            variable=variable,
            expression=target,
            result_kind=result_kind,
            limit=limit,
            limit_premise_id=limit_id,
            automatic_ratio_base=automatic_base,
            automatic_ratio_geometric_expression=automatic_geometric_expression,
            automatic_ratio_polynomial=automatic_polynomial,
            automatic_ratio_polynomial_coefficients=automatic_coefficients,
            automatic_ratio_polynomial_degree=automatic_degree,
            automatic_ratio_polynomial_leading_coefficient=automatic_leading,
            automatic_ratio_polynomial_nonzero_from=automatic_polynomial_nonzero_from,
            automatic_ratio_denominator_polynomial=automatic_denominator,
            automatic_ratio_denominator_polynomial_coefficients=automatic_denominator_coefficients,
            automatic_ratio_denominator_polynomial_degree=automatic_denominator_degree,
            automatic_ratio_denominator_polynomial_leading_coefficient=automatic_denominator_leading,
            automatic_ratio_denominator_polynomial_nonzero_from=automatic_denominator_nonzero_from,
        )

    for nonzero_id, evidence in prop_rows:
        mode = _match_eventual_nonzero_evidence(target, variable, evidence)
        if mode is None:
            continue
        return SeriesRatioLimitPattern(
            variable=variable,
            expression=target,
            result_kind=result_kind,
            limit=limit,
            limit_premise_id=limit_id,
            automatic_ratio_base=automatic_base,
            automatic_ratio_geometric_expression=automatic_geometric_expression,
            automatic_ratio_polynomial=automatic_polynomial,
            automatic_ratio_polynomial_coefficients=automatic_coefficients,
            automatic_ratio_polynomial_degree=automatic_degree,
            automatic_ratio_polynomial_leading_coefficient=automatic_leading,
            automatic_ratio_polynomial_nonzero_from=automatic_polynomial_nonzero_from,
            automatic_ratio_denominator_polynomial=automatic_denominator,
            automatic_ratio_denominator_polynomial_coefficients=automatic_denominator_coefficients,
            automatic_ratio_denominator_polynomial_degree=automatic_denominator_degree,
            automatic_ratio_denominator_polynomial_leading_coefficient=automatic_denominator_leading,
            automatic_ratio_denominator_polynomial_nonzero_from=automatic_denominator_nonzero_from,
            nonzero_premise_id=nonzero_id,
            nonzero_mode=mode,
        )

    automatic_nonzero_from = _eventual_nonzero_on_nat_threshold(target, variable)
    if automatic_nonzero_from is not None:
        return SeriesRatioLimitPattern(
            variable=variable,
            expression=target,
            result_kind=result_kind,
            limit=limit,
            limit_premise_id=limit_id,
            automatic_ratio_base=automatic_base,
            automatic_ratio_geometric_expression=automatic_geometric_expression,
            automatic_ratio_polynomial=automatic_polynomial,
            automatic_ratio_polynomial_coefficients=automatic_coefficients,
            automatic_ratio_polynomial_degree=automatic_degree,
            automatic_ratio_polynomial_leading_coefficient=automatic_leading,
            automatic_ratio_polynomial_nonzero_from=automatic_polynomial_nonzero_from,
            automatic_ratio_denominator_polynomial=automatic_denominator,
            automatic_ratio_denominator_polynomial_coefficients=automatic_denominator_coefficients,
            automatic_ratio_denominator_polynomial_degree=automatic_denominator_degree,
            automatic_ratio_denominator_polynomial_leading_coefficient=automatic_denominator_leading,
            automatic_ratio_denominator_polynomial_nonzero_from=automatic_denominator_nonzero_from,
            automatic_nonzero_from=automatic_nonzero_from,
        )
    return None


def _root_limit_expression(target: dict[str, Any], variable: str) -> dict[str, Any]:
    index = {"kind": "var", "id": variable}
    return {
        "kind": "rpow",
        "base": {"kind": "abs", "arg": substitute_expr(target, variable, index)},
        "exponent": {
            "kind": "div",
            "left": {"kind": "int", "value": 1},
            "right": {"kind": "cast_real", "arg": index},
        },
    }


def _flatten_mul_div(
    expr: dict[str, Any], *, inverted: bool = False
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Flatten multiplication/division into numerator and denominator factors.

    This keeps the automatic root matcher syntactic and exact while accepting
    equivalent learner spellings such as ``(p / q) * r^n`` and
    ``p * r^n / q``.  Addition/subtraction are left untouched and are handled
    only by the exact polynomial normalizer.
    """
    kind = expr.get("kind")
    if kind == "mul":
        left_num, left_den = _flatten_mul_div(expr.get("left", {}), inverted=inverted)
        right_num, right_den = _flatten_mul_div(expr.get("right", {}), inverted=inverted)
        return left_num + right_num, left_den + right_den
    if kind == "div":
        left_num, left_den = _flatten_mul_div(expr.get("left", {}), inverted=inverted)
        right_num, right_den = _flatten_mul_div(expr.get("right", {}), inverted=not inverted)
        return left_num + right_num, left_den + right_den
    if inverted:
        return [], [expr]
    return [expr], []


def _multiply_factors(factors: list[dict[str, Any]]) -> dict[str, Any]:
    if not factors:
        return {"kind": "int", "value": 1}
    result = factors[0]
    for factor in factors[1:]:
        result = {"kind": "mul", "left": result, "right": factor}
    return result


def _syntactic_nonnegative_on_nat(expr: dict[str, Any], variable: str) -> bool:
    value = exact_rational_value(expr)
    if value is not None:
        return value >= 0
    if expr.get("kind") == "cast_real" and expr.get("arg") == {"kind": "var", "id": variable}:
        return True
    kind = expr.get("kind")
    if kind == "add":
        return _syntactic_nonnegative_on_nat(expr.get("left", {}), variable) and _syntactic_nonnegative_on_nat(expr.get("right", {}), variable)
    if kind == "mul":
        return _syntactic_nonnegative_on_nat(expr.get("left", {}), variable) and _syntactic_nonnegative_on_nat(expr.get("right", {}), variable)
    if kind == "pow":
        exponent = expr.get("exponent")
        return isinstance(exponent, int) and not isinstance(exponent, bool) and exponent >= 0 and _syntactic_nonnegative_on_nat(expr.get("base", {}), variable)
    if kind == "pow_nat":
        exponent = expr.get("exponent")
        base = exact_rational_value(expr.get("base", {}))
        return exponent == {"kind": "var", "id": variable} and base is not None and base >= 0
    return False


def _syntactic_positive_on_nat(expr: dict[str, Any], variable: str) -> bool:
    """Conservative syntax accepted for an automatic global denominator guard.

    This mirrors expressions that Lean's ``positivity`` tactic can reconstruct
    directly: positive exact constants, or sums/products/powers assembled from
    those constants and nonnegative natural casts.  Algebraically positive but
    syntactically harder polynomials keep an explicit learner obligation.
    """
    value = exact_rational_value(expr)
    if value is not None:
        return value > 0
    kind = expr.get("kind")
    if kind == "add":
        left, right = expr.get("left", {}), expr.get("right", {})
        return (
            _syntactic_positive_on_nat(left, variable) and _syntactic_nonnegative_on_nat(right, variable)
        ) or (
            _syntactic_nonnegative_on_nat(left, variable) and _syntactic_positive_on_nat(right, variable)
        )
    if kind == "mul":
        return _syntactic_positive_on_nat(expr.get("left", {}), variable) and _syntactic_positive_on_nat(expr.get("right", {}), variable)
    if kind == "pow":
        exponent = expr.get("exponent")
        if not isinstance(exponent, int) or isinstance(exponent, bool) or exponent < 0:
            return False
        if exponent == 0:
            return True
        return _syntactic_positive_on_nat(expr.get("base", {}), variable)
    if kind == "pow_nat":
        exponent = expr.get("exponent")
        base = exact_rational_value(expr.get("base", {}))
        return exponent == {"kind": "var", "id": variable} and base is not None and base > 0
    return False


def _syntactic_nonzero_on_nat(expr: dict[str, Any], variable: str) -> bool:
    """Conservative syntax with a uniform nonzero proof over natural indices.

    This is deliberately broader than ``_syntactic_positive_on_nat`` only in
    ways that have a tiny kernel reconstruction.  In particular, an exact
    nonzero rational base raised to ``n`` is nonzero even when the base is
    negative, via ``pow_ne_zero``.  Products/quotients preserve the property.
    Hard polynomial facts such as ``real(n) - 1 != 0`` are *not* inferred.
    """
    if _syntactic_positive_on_nat(expr, variable):
        return True
    value = exact_rational_value(expr)
    if value is not None:
        return value != 0
    kind = expr.get("kind")
    if kind == "factorial":
        return True
    if kind == "neg":
        return _syntactic_nonzero_on_nat(expr.get("arg", {}), variable)
    if kind in {"mul", "div"}:
        return (
            _syntactic_nonzero_on_nat(expr.get("left", {}), variable)
            and _syntactic_nonzero_on_nat(expr.get("right", {}), variable)
        )
    if kind == "pow":
        exponent = expr.get("exponent")
        if not isinstance(exponent, int) or isinstance(exponent, bool) or exponent < 0:
            return False
        if exponent == 0:
            return True
        return _syntactic_nonzero_on_nat(expr.get("base", {}), variable)
    if kind == "pow_nat":
        exponent = expr.get("exponent")
        base = exact_rational_value(expr.get("base", {}))
        return (
            exponent == {"kind": "var", "id": variable}
            and base is not None
            and base != 0
        )
    return False


def _linear_eventual_nonzero_threshold(expr: dict[str, Any], variable: str) -> int | None:
    """Return a Nat threshold after which an exact affine real polynomial is nonzero."""
    coefficients = _polynomial_real_coefficients(expr, variable)
    if coefficients is None or _polynomial_degree(coefficients) != 1:
        return None
    intercept, slope = coefficients[0], coefficients[1]
    if slope == 0:
        return None
    root = -intercept / slope
    # Fraction // uses mathematical floor, including for negative roots.
    return max(0, root.numerator // root.denominator + 1)


def _shift_polynomial_coefficients(
    coefficients: tuple[Fraction, ...], shift: int
) -> tuple[Fraction, ...]:
    """Exact coefficients of ``p(shift + x)`` from coefficients of ``p(x)``."""
    result = [Fraction(0) for _ in coefficients]
    for power, coefficient in enumerate(coefficients):
        if coefficient == 0:
            continue
        for shifted_power in range(power + 1):
            result[shifted_power] += (
                coefficient
                * comb(power, shifted_power)
                * (Fraction(shift) ** (power - shifted_power))
            )
    return tuple(result)


def _signed_shift_polynomial_certificate(
    expr: dict[str, Any], variable: str, shift: int
) -> tuple[int, tuple[Fraction, ...]] | None:
    """Return a one-sign exact expansion certifying a polynomial tail.

    The result is ``(sign, coefficients)`` where ``sign`` is ``1`` or ``-1``
    and ``coefficients`` are those of ``sign * p(shift + x)``.  A certificate
    is emitted only when the constant coefficient is strictly positive and all
    remaining coefficients are nonnegative.  Lean can then check the translated
    identity with ``ring`` and positivity from ``0 <= x``.
    """
    coefficients = _polynomial_real_coefficients(expr, variable)
    if coefficients is None:
        return None
    degree = _polynomial_degree(coefficients)
    if degree < 1 or degree > 64:
        return None
    leading = coefficients[degree]
    if leading == 0:
        return None
    sign = 1 if leading > 0 else -1
    shifted = _shift_polynomial_coefficients(coefficients, shift)
    signed = tuple(Fraction(sign) * coefficient for coefficient in shifted)
    if not signed or signed[0] <= 0 or any(coefficient < 0 for coefficient in signed):
        return None
    # Keep generated proof terms bounded.  This is a proof-engineering limit,
    # not a mathematical one; unsupported large certificates remain explicit.
    if any(
        coefficient.numerator.bit_length() > 4096
        or coefficient.denominator.bit_length() > 4096
        for coefficient in signed
    ):
        return None
    return sign, signed


def _polynomial_eventual_nonzero_threshold(expr: dict[str, Any], variable: str) -> int | None:
    """Find a concrete tail with a kernel-checkable shifted-polynomial sign proof.

    Python does *not* certify roots.  It searches exact integer shifts until
    ``p(N+x)`` (or its negation) has a strictly positive constant and all other
    coefficients nonnegative.  The renderer later makes Lean prove the shift
    identity with ``ring`` and the sign with ``positivity``.
    """
    coefficients = _polynomial_real_coefficients(expr, variable)
    if coefficients is None:
        return None
    degree = _polynomial_degree(coefficients)
    if degree < 2 or degree > 64:
        return None

    # Small thresholds first, then exponential growth.  Every nonzero real
    # polynomial has a one-sign translated coefficient vector sufficiently far
    # in the direction of its leading term, but we cap the search so pathological
    # authoring does not explode source size or CPU use.
    candidates = list(range(0, 17))
    candidates.extend(2**power for power in range(5, 31))
    seen: set[int] = set()
    for shift in candidates:
        if shift in seen:
            continue
        seen.add(shift)
        if _signed_shift_polynomial_certificate(expr, variable, shift) is not None:
            return shift
    return None


def _eventual_nonzero_on_nat_threshold(expr: dict[str, Any], variable: str) -> int | None:
    """Conservatively recognize denominators that are eventually nonzero.

    Global nonzero expressions use threshold 0.  Exact affine rational factors
    use their unique root, while higher-degree exact rational polynomials use a
    shifted one-sign certificate that Lean independently reconstructs. Negation,
    products, quotients and fixed natural powers compose by maximum threshold.
    """
    if _syntactic_nonzero_on_nat(expr, variable):
        return 0

    kind = expr.get("kind")
    if kind == "neg":
        return _eventual_nonzero_on_nat_threshold(expr.get("arg", {}), variable)
    if kind in {"mul", "div"}:
        left = _eventual_nonzero_on_nat_threshold(expr.get("left", {}), variable)
        right = _eventual_nonzero_on_nat_threshold(expr.get("right", {}), variable)
        if left is None or right is None:
            return None
        return max(left, right)
    if kind == "pow":
        exponent = expr.get("exponent")
        if not isinstance(exponent, int) or isinstance(exponent, bool) or exponent < 0:
            return None
        if exponent == 0:
            return 0
        return _eventual_nonzero_on_nat_threshold(expr.get("base", {}), variable)

    affine = _linear_eventual_nonzero_threshold(expr, variable)
    if affine is not None:
        return affine
    return _polynomial_eventual_nonzero_threshold(expr, variable)


def _match_polynomial_geometric_root(
    expr: dict[str, Any], variable: str
) -> tuple[
    dict[str, Any], tuple[Fraction, ...], int, Fraction,
    dict[str, Any], tuple[Fraction, ...], int, Fraction,
    Fraction, dict[str, Any], dict[str, Any],
] | None:
    """Recognize exact rational-polynomial prefactors times geometric products.

    After flattening multiplication/division, every factor ``r^n`` with exact
    rational ``r`` is folded into one exact rational base.  Geometric factors
    in a denominator contribute ``1 / r`` and therefore require ``r != 0``.
    The remaining numerator/denominator factors must be nonzero exact
    rational-coefficient polynomials accepted by the shared sequence
    normalizer (degree <= 64).

    This normalizes equivalent spellings such as ``(p / q) * r^n``,
    ``p / (q * s^n)``, and ``p * r^n * s^n / q`` without changing the school
    domain contract.  Lean still reconstructs both polynomial n-th-root limits
    and the exact geometric identity used to collapse the bases.
    """
    numerator_factors, denominator_factors = _flatten_mul_div(expr)
    school_denominator = _multiply_factors(denominator_factors)

    ratio = Fraction(1)
    geometric_count = 0
    geometric_numerator: list[dict[str, Any]] = []
    geometric_denominator: list[dict[str, Any]] = []

    def strip_geometric(
        factors: list[dict[str, Any]], *, denominator: bool
    ) -> list[dict[str, Any]] | None:
        nonlocal ratio, geometric_count
        residual: list[dict[str, Any]] = []
        for factor in factors:
            factor_ratio = _pow_ratio(factor, variable)
            if factor_ratio is None:
                residual.append(factor)
                continue
            geometric_count += 1
            if denominator:
                if factor_ratio == 0:
                    # A geometric zero in a denominator is not an honest
                    # school-real term on the tail; keep its domain obligation
                    # explicit instead of normalizing through total division.
                    return None
                ratio /= factor_ratio
                geometric_denominator.append(factor)
            else:
                ratio *= factor_ratio
                geometric_numerator.append(factor)
        return residual

    numerator_residual = strip_geometric(numerator_factors, denominator=False)
    denominator_residual = strip_geometric(denominator_factors, denominator=True)
    if numerator_residual is None or denominator_residual is None or geometric_count == 0:
        return None

    numerator = _multiply_factors(numerator_residual)
    denominator = _multiply_factors(denominator_residual)
    numerator_coefficients = _polynomial_real_coefficients(numerator, variable)
    denominator_coefficients = _polynomial_real_coefficients(denominator, variable)
    if numerator_coefficients is None or denominator_coefficients is None:
        return None

    numerator_degree = _polynomial_degree(numerator_coefficients)
    denominator_degree = _polynomial_degree(denominator_coefficients)
    if numerator_degree < 0 or denominator_degree < 0:
        return None
    numerator_leading = numerator_coefficients[numerator_degree]
    denominator_leading = denominator_coefficients[denominator_degree]
    if numerator_leading == 0 or denominator_leading == 0:
        return None

    geometric_num_expr = _multiply_factors(geometric_numerator)
    geometric_den_expr = _multiply_factors(geometric_denominator)
    geometric_expression = (
        geometric_num_expr
        if geometric_den_expr == {"kind": "int", "value": 1}
        else {"kind": "div", "left": geometric_num_expr, "right": geometric_den_expr}
    )

    return (
        numerator, numerator_coefficients, numerator_degree, numerator_leading,
        denominator, denominator_coefficients, denominator_degree, denominator_leading,
        ratio, geometric_expression, school_denominator,
    )

def match_series_root_test(
    goal: dict[str, Any], premise_rows: list[tuple[str, dict[str, Any]]]
) -> SeriesRootTestPattern | None:
    """Match the ordinary root test from an exact n-th-root limit.

    The root statistic is ``abs(a_n)^(1 / real(n))``.  Exact rational
    ``0 <= L < 1`` proves summability; exact rational ``L > 1`` proves
    non-summability; ``L = 1`` is intentionally inconclusive.  Automatic
    reconstruction is conservative: exact rational-polynomial prefactors
    multiplied or divided by one or more exact rational geometric factors are
    normalized to ``(p(real(n)) / q(real(n))) * r^n``.  Nonzero rational-
    coefficient ``p`` and ``q`` of degree at most 64 then have root limit
    ``abs(r)``.  Polynomial-times-geometric terms remain the ``q = 1`` special case.  The
    Python layer only recovers exact coefficients; Lean reconstructs the
    polynomial quotient asymptotic.
    """
    if goal.get("kind") != "series_sum":
        return None
    result_kind = goal.get("result", {}).get("kind")
    if result_kind not in {"summable", "not_summable"}:
        return None
    variable = goal.get("variable")
    if not isinstance(variable, str):
        return None
    target = goal.get("expression", {})
    expected_root = _root_limit_expression(target, variable)

    def supported_limit(value: Fraction) -> bool:
        if result_kind == "summable":
            return Fraction(0) <= value < 1
        return value > 1

    for premise_id, claim in premise_rows:
        if claim.get("kind") != "sequence_limit" or claim.get("variable") != variable:
            continue
        if claim.get("result", {}).get("kind") != "finite":
            continue
        if not _same_ratio_expr(claim.get("expression", {}), expected_root):
            continue
        limit = exact_rational_value(claim.get("result", {}).get("value", {}))
        if limit is None or not supported_limit(limit):
            continue
        return SeriesRootTestPattern(variable, target, result_kind, limit, premise_id, None)

    automatic = _match_polynomial_geometric_root(target, variable)
    if automatic is not None:
        (
            polynomial, coefficients, degree, leading,
            denominator, denominator_coefficients, denominator_degree, denominator_leading,
            base, geometric_expression, school_denominator,
        ) = automatic
        if supported_limit(abs(base)):
            return SeriesRootTestPattern(
                variable=variable,
                expression=target,
                result_kind=result_kind,
                limit=abs(base),
                limit_premise_id=None,
                automatic_root_base=base,
                automatic_root_coefficient=leading,
                automatic_root_degree=degree,
                automatic_root_polynomial=polynomial,
                automatic_root_polynomial_coefficients=coefficients,
                automatic_root_denominator_coefficient=denominator_leading,
                automatic_root_denominator_degree=denominator_degree,
                automatic_root_denominator_polynomial=denominator,
                automatic_root_denominator_polynomial_coefficients=denominator_coefficients,
                automatic_root_denominator_positive_on_nat=_syntactic_positive_on_nat(denominator, variable),
                automatic_root_geometric_expression=geometric_expression,
                automatic_root_school_denominator=school_denominator,
                automatic_root_school_denominator_positive_on_nat=_syntactic_positive_on_nat(school_denominator, variable),
                automatic_root_school_denominator_nonzero_on_nat=_syntactic_nonzero_on_nat(school_denominator, variable),
                automatic_root_school_denominator_eventual_nonzero_from=_eventual_nonzero_on_nat_threshold(school_denominator, variable),
            )
    return None

def _pow_ratio(expr: dict[str, Any], variable: str) -> Fraction | None:
    if expr.get("kind") != "pow_nat":
        return None
    if expr.get("exponent") != {"kind": "var", "id": variable}:
        return None
    return exact_rational_value(expr.get("base", {}))


def _term_coeff_ratio(expr: dict[str, Any], variable: str) -> tuple[Fraction, Fraction] | None:
    ratio = _pow_ratio(expr, variable)
    if ratio is not None:
        return Fraction(1), ratio
    if expr.get("kind") != "mul":
        return None
    left, right = expr.get("left", {}), expr.get("right", {})
    coefficient = exact_rational_value(left)
    ratio = _pow_ratio(right, variable)
    if coefficient is not None and ratio is not None:
        return coefficient, ratio
    coefficient = exact_rational_value(right)
    ratio = _pow_ratio(left, variable)
    if coefficient is not None and ratio is not None:
        return coefficient, ratio
    return None


def match_geometric_series(goal: dict[str, Any]) -> GeometricSeriesPattern | None:
    if goal.get("kind") != "series_sum":
        return None
    variable = goal.get("variable")
    if not isinstance(variable, str):
        return None
    matched = _term_coeff_ratio(goal.get("expression", {}), variable)
    if matched is None:
        return None
    coefficient, ratio = matched
    # Keep the first series slice deliberately nondegenerate.  The zero series
    # is mathematically trivial but does not exercise the geometric criterion.
    if coefficient == 0:
        return None

    result = goal.get("result", {})
    result_kind = result.get("kind")
    if result_kind == "finite":
        if abs(ratio) >= 1:
            return None
        target = exact_rational_value(result.get("value", {}))
        if target is None:
            return None
        expected = coefficient / (1 - ratio)
        if target != expected:
            return None
        return GeometricSeriesPattern(variable, goal["expression"], coefficient, ratio, result_kind, target)

    if result_kind == "not_summable":
        if abs(ratio) < 1:
            return None
        return GeometricSeriesPattern(variable, goal["expression"], coefficient, ratio, result_kind)
    return None


def _nat_shift(expr: dict[str, Any], variable: str) -> int | None:
    if expr == {"kind": "var", "id": variable}:
        return 0
    if expr.get("kind") != "add":
        return None
    left, right = expr.get("left", {}), expr.get("right", {})
    if left == {"kind": "var", "id": variable} and right.get("kind") == "int":
        return right.get("value")
    if right == {"kind": "var", "id": variable} and left.get("kind") == "int":
        return left.get("value")
    return None


def _p_series_coeff_shift_exponent(
    expr: dict[str, Any], variable: str
) -> tuple[Fraction, int, Fraction, bool] | None:
    if expr.get("kind") != "div":
        return None
    coefficient = exact_rational_value(expr.get("left", {}))
    if coefficient is None:
        return None
    denominator = expr.get("right", {})
    real_exponent = False
    if denominator.get("kind") == "pow":
        raw_exponent = denominator.get("exponent")
        if not isinstance(raw_exponent, int) or isinstance(raw_exponent, bool):
            return None
        exponent = Fraction(raw_exponent, 1)
        base = denominator.get("base", {})
    elif denominator.get("kind") == "rpow":
        exponent = exact_rational_value(denominator.get("exponent", {}))
        if exponent is None or exponent < 0 or exponent > 64:
            return None
        real_exponent = True
        base = denominator.get("base", {})
    else:
        exponent = Fraction(1, 1)
        base = denominator
    if base.get("kind") != "cast_real":
        return None
    shift = _nat_shift(base.get("arg", {}), variable)
    if shift is None or shift < 1:
        return None
    return coefficient, shift, exponent, real_exponent


def match_p_series(goal: dict[str, Any]) -> PSeriesPattern | None:
    if goal.get("kind") != "series_sum":
        return None
    variable = goal.get("variable")
    if not isinstance(variable, str):
        return None
    matched = _p_series_coeff_shift_exponent(goal.get("expression", {}), variable)
    if matched is None:
        return None
    coefficient, shift, exponent, real_exponent = matched
    if coefficient == 0:
        return None

    result_kind = goal.get("result", {}).get("kind")
    if result_kind == "summable" and exponent > 1:
        return PSeriesPattern(variable, goal["expression"], coefficient, shift, exponent, real_exponent, result_kind)
    if result_kind == "not_summable" and exponent <= 1:
        return PSeriesPattern(variable, goal["expression"], coefficient, shift, exponent, real_exponent, result_kind)
    return None
