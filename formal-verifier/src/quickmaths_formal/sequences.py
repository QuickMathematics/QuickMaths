from __future__ import annotations

from dataclasses import dataclass
from fractions import Fraction
from typing import Any, Iterable

from .contract import canonical_hash
from .logic import same as same_logic, substitute_expr
from .symbolic import exact_rational_value, expr_to_sympy, structurally_negative, structurally_nonzero, structurally_positive


def _zero() -> dict[str, Any]:
    return {"kind": "int", "value": 0}


def _one() -> dict[str, Any]:
    return {"kind": "int", "value": 1}


def _same(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return canonical_hash(left) == canonical_hash(right)


def _variable_ids(expr: dict[str, Any]) -> set[str]:
    kind = expr.get("kind")
    if kind == "var":
        return {expr["id"]}
    if kind in {"int", "rat"}:
        return set()
    if kind in {"neg", "cast_real", "factorial", "sqrt", "abs", "exp", "log", "sin", "cos"}:
        return _variable_ids(expr.get("arg", {}))
    if kind == "pow":
        return _variable_ids(expr.get("base", {}))
    if kind == "rpow":
        return _variable_ids(expr.get("base", {})) | _variable_ids(expr.get("exponent", {}))
    if kind == "pow_nat":
        return _variable_ids(expr.get("base", {})) | _variable_ids(expr.get("exponent", {}))
    if kind == "apply":
        return _variable_ids(expr.get("function", {})) | _variable_ids(expr.get("arg", {}))
    if kind == "if":
        return _variable_ids(expr.get("then", {})) | _variable_ids(expr.get("else", {}))
    if kind in {"add", "sub", "mul", "div", "mod_nat"}:
        return _variable_ids(expr.get("left", {})) | _variable_ids(expr.get("right", {}))
    return set()


def _mentions(expr: dict[str, Any], variable: str) -> bool:
    return variable in _variable_ids(expr)


def _equivalent(left: dict[str, Any], right: dict[str, Any]) -> bool:
    if _same(left, right):
        return True
    names = _variable_ids(left) | _variable_ids(right)
    try:
        import sympy as sp

        symbols = {name: sp.Symbol(name, real=True) for name in names}
        return sp.simplify(expr_to_sympy(left, symbols) - expr_to_sympy(right, symbols)) == 0
    except Exception:
        return False


def _neg(expr: dict[str, Any]) -> dict[str, Any]:
    if expr == _zero():
        return _zero()
    return {"kind": "neg", "arg": expr}


def _binary(kind: str, left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    if kind == "add":
        if left == _zero():
            return right
        if right == _zero():
            return left
    if kind == "sub" and right == _zero():
        return left
    if kind == "mul":
        if left == _zero() or right == _zero():
            return _zero()
        if left == _one():
            return right
        if right == _one():
            return left
    return {"kind": kind, "left": left, "right": right}


@dataclass(frozen=True)
class SequenceGuard:
    relation: str
    expression: dict[str, Any]
    claim: dict[str, Any]
    code: str
    message: str


@dataclass(frozen=True)
class SequenceGuardEvidence:
    claim: dict[str, Any]
    conversion: str = "exact"


@dataclass(frozen=True)
class SequencePlanNode:
    kind: str
    expression: dict[str, Any]
    target: dict[str, Any]
    children: tuple["SequencePlanNode", ...] = ()
    premise_id: str | None = None
    shift: int | None = None


@dataclass(frozen=True)
class SequenceAlgebraPattern:
    variable: str
    expression: dict[str, Any]
    target: dict[str, Any]
    root: SequencePlanNode
    guards: tuple[SequenceGuard, ...]
    used_sequence_premises: tuple[str, ...]


@dataclass(frozen=True)
class NatAtTopPattern:
    variable: str
    expression: dict[str, Any]
    shift: int


def same_sequence_source(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return (
        left.get("kind") == "sequence_limit"
        and right.get("kind") == "sequence_limit"
        and left.get("variable") == right.get("variable")
    )


def _guard(relation: str, expr: dict[str, Any]) -> SequenceGuard:
    if relation == "nonzero":
        claim = {"kind": "ne", "left": expr, "right": _zero()}
        return SequenceGuard(
            relation,
            expr,
            claim,
            "sequence_denominator_nonzero",
            "Sequence division requires the denominator's finite limit to be nonzero, which makes the denominator eventually nonzero.",
        )
    if relation == "positive":
        claim = {"kind": "lt", "left": _zero(), "right": expr}
        return SequenceGuard(
            relation,
            expr,
            claim,
            "sequence_positive_target",
            "School-domain log/sqrt sequence composition requires the inner finite limit to be strictly positive, making the sequence eventually in-domain.",
        )
    if relation == "abs_lt_one":
        claim = {"kind": "lt", "left": {"kind": "abs", "arg": expr}, "right": _one()}
        return SequenceGuard(
            relation,
            expr,
            claim,
            "geometric_ratio_abs_lt_one",
            "A geometric sequence r^n converges to zero only on the supported branch |r| < 1.",
        )
    raise ValueError(f"unsupported sequence guard relation {relation!r}")


def sequence_guard_exact_status(guard: SequenceGuard) -> bool | None:
    value = exact_rational_value(guard.expression)
    if value is None:
        return None
    if guard.relation == "nonzero":
        return value != 0
    if guard.relation == "positive":
        return value > 0
    if guard.relation == "abs_lt_one":
        return abs(value) < 1
    return None


def sequence_guard_auto_tactic(guard: SequenceGuard) -> str | None:
    exact = sequence_guard_exact_status(guard)
    if exact is True:
        return "norm_num"
    if exact is False:
        return None
    if guard.relation == "nonzero" and structurally_nonzero(guard.expression):
        return "positivity"
    if guard.relation == "positive" and structurally_positive(guard.expression):
        return "positivity"
    return None


def sequence_guard_evidence_candidates(guard: SequenceGuard) -> tuple[SequenceGuardEvidence, ...]:
    candidates = [SequenceGuardEvidence(guard.claim, "exact")]
    if guard.relation == "nonzero":
        candidates.extend(
            [
                SequenceGuardEvidence({"kind": "lt", "left": _zero(), "right": guard.expression}, "positive_to_nonzero"),
                SequenceGuardEvidence({"kind": "lt", "left": guard.expression, "right": _zero()}, "negative_to_nonzero"),
            ]
        )
    return tuple(candidates)


def match_sequence_guard_evidence(guard: SequenceGuard, proposition: dict[str, Any]) -> SequenceGuardEvidence | None:
    for candidate in sequence_guard_evidence_candidates(guard):
        if same_logic(candidate.claim, proposition):
            return candidate
    return None


def _merge_guards(*groups: Iterable[SequenceGuard]) -> tuple[SequenceGuard, ...]:
    seen: set[str] = set()
    result: list[SequenceGuard] = []
    for group in groups:
        for guard in group:
            key = canonical_hash(guard.claim)
            if key not in seen:
                seen.add(key)
                result.append(guard)
    return tuple(result)


def _finite_premise_rows(
    goal: dict[str, Any], premise_rows: Iterable[tuple[str, dict[str, Any]]]
) -> list[tuple[str, dict[str, Any]]]:
    result = []
    for identifier, claim in premise_rows:
        if not same_sequence_source(goal, claim):
            continue
        if claim.get("result", {}).get("kind") != "finite":
            continue
        result.append((identifier, claim))
    return result


def _nat_shift(expr: dict[str, Any], variable: str) -> int | None:
    """Match real(n + k) / real(k + n), returning exact natural k."""
    if expr.get("kind") != "cast_real":
        return None
    inner = expr.get("arg", {})
    if inner == {"kind": "var", "id": variable}:
        return 0
    if inner.get("kind") != "add":
        return None
    left, right = inner.get("left", {}), inner.get("right", {})
    if left == {"kind": "var", "id": variable} and right.get("kind") == "int" and right.get("value", -1) >= 0:
        return int(right["value"])
    if right == {"kind": "var", "id": variable} and left.get("kind") == "int" and left.get("value", -1) >= 0:
        return int(left["value"])
    return None


def match_nat_at_top(goal: dict[str, Any]) -> NatAtTopPattern | None:
    if goal.get("kind") != "sequence_limit" or goal.get("result", {}).get("kind") != "positive_infinity":
        return None
    variable = goal.get("variable")
    if not isinstance(variable, str):
        return None
    shift = _nat_shift(goal.get("expression", {}), variable)
    if shift is None:
        return None
    return NatAtTopPattern(variable, goal["expression"], shift)


def match_sequence_algebra(
    goal: dict[str, Any],
    premise_rows: Iterable[tuple[str, dict[str, Any]]] = (),
) -> SequenceAlgebraPattern | None:
    """Build a finite convergence plan over the genuine `Nat.atTop` source.

    Leaves are constants, cited finite sequence limits, exact-ratio geometric
    sequences, and shifted reciprocal tails c / real(n + k), k >= 1.  Every
    other node is built compositionally from finite child limits.
    """
    if goal.get("kind") != "sequence_limit" or goal.get("result", {}).get("kind") != "finite":
        return None
    variable = goal.get("variable")
    if not isinstance(variable, str):
        return None
    finite_premises = _finite_premise_rows(goal, premise_rows)
    guards: list[SequenceGuard] = []
    used: list[str] = []

    def premise_leaf(expr: dict[str, Any]) -> SequencePlanNode | None:
        for identifier, claim in finite_premises:
            if _same(claim.get("expression", {}), expr):
                if identifier not in used:
                    used.append(identifier)
                return SequencePlanNode("premise", expr, claim["result"]["value"], premise_id=identifier)
        return None

    def walk(expr: dict[str, Any]) -> SequencePlanNode | None:
        leaf = premise_leaf(expr)
        if leaf is not None:
            return leaf

        # Any expression independent of the bound index is a constant sequence.
        if not _mentions(expr, variable):
            return SequencePlanNode("constant", expr, expr)

        # Geometric r^n, with r independent of n. The ratio guard is explicit.
        if expr.get("kind") == "pow_nat":
            exponent = expr.get("exponent", {})
            base = expr.get("base", {})
            if exponent == {"kind": "var", "id": variable} and not _mentions(base, variable):
                guards.append(_guard("abs_lt_one", base))
                return SequencePlanNode("geometric", expr, _zero())
            return None

        # c / real(n+k), k>=1 is everywhere school-defined and tends to zero.
        if expr.get("kind") == "div" and not _mentions(expr.get("left", {}), variable):
            shift = _nat_shift(expr.get("right", {}), variable)
            if shift is not None and shift >= 1:
                return SequencePlanNode("reciprocal_shift", expr, _zero(), shift=shift)

        kind = expr.get("kind")
        if kind == "neg":
            child = walk(expr.get("arg", {}))
            return None if child is None else SequencePlanNode("neg", expr, _neg(child.target), (child,))
        if kind in {"add", "sub", "mul", "div"}:
            left = walk(expr.get("left", {}))
            right = walk(expr.get("right", {}))
            if left is None or right is None:
                return None
            if kind == "div":
                guards.append(_guard("nonzero", right.target))
            return SequencePlanNode(kind, expr, _binary(kind, left.target, right.target), (left, right))
        if kind == "pow":
            exponent = expr.get("exponent")
            if not isinstance(exponent, int) or exponent < 0:
                return None
            child = walk(expr.get("base", {}))
            if child is None:
                return None
            target = _one() if exponent == 0 else (child.target if exponent == 1 else {"kind": "pow", "base": child.target, "exponent": exponent})
            return SequencePlanNode("pow", expr, target, (child,))
        if kind in {"abs", "exp", "sin", "cos", "log", "sqrt"}:
            child = walk(expr.get("arg", {}))
            if child is None:
                return None
            if kind in {"log", "sqrt"}:
                guards.append(_guard("positive", child.target))
            return SequencePlanNode(kind, expr, {"kind": kind, "arg": child.target}, (child,))
        return None

    root = walk(goal.get("expression", {}))
    if root is None or not _equivalent(root.target, goal["result"].get("value", {})):
        return None
    return SequenceAlgebraPattern(
        variable=variable,
        expression=goal["expression"],
        target=goal["result"]["value"],
        root=root,
        guards=_merge_guards(guards),
        used_sequence_premises=tuple(used),
    )


def sequence_algebra_status(
    pattern: SequenceAlgebraPattern,
    available_claims: Iterable[dict[str, Any]] = (),
) -> tuple[list[SequenceGuard], list[SequenceGuard]]:
    props = list(available_claims)
    missing: list[SequenceGuard] = []
    violated: list[SequenceGuard] = []
    for guard in pattern.guards:
        exact = sequence_guard_exact_status(guard)
        if exact is False:
            violated.append(guard)
            continue
        if sequence_guard_auto_tactic(guard) is not None:
            continue
        if not any(match_sequence_guard_evidence(guard, prop) is not None for prop in props):
            missing.append(guard)
    return missing, violated


@dataclass(frozen=True)
class SequenceBoundEvidence:
    premise_id: str | None
    conversion: str  # "eventually", "forall", or a kernel-reconstructed auto bound


@dataclass(frozen=True)
class SequenceSqueezePattern:
    variable: str
    expression: dict[str, Any]
    target: dict[str, Any]
    lower_expression: dict[str, Any]
    upper_expression: dict[str, Any]
    lower_limit_premise: str
    upper_limit_premise: str
    lower_bound: SequenceBoundEvidence
    upper_bound: SequenceBoundEvidence


@dataclass(frozen=True)
class SequenceGeometricOrderEvidence:
    offset: Fraction
    scale: Fraction
    ratio: Fraction


@dataclass(frozen=True)
class SequenceMonotoneBoundedPattern:
    variable: str
    expression: dict[str, Any]
    mode: str  # "monotone" or "antitone"
    monotonicity_premise: str | None
    boundedness_premise: str | None
    auto_geometric: SequenceGeometricOrderEvidence | None = None


@dataclass(frozen=True)
class SequenceRationalShiftPattern:
    variable: str
    expression: dict[str, Any]
    numerator_shift: int
    denominator_shift: int


@dataclass(frozen=True)
class SequenceAffineRatioPattern:
    variable: str
    expression: dict[str, Any]
    numerator_intercept: Fraction
    numerator_slope: Fraction
    denominator_intercept: Fraction
    denominator_slope: Fraction
    target: Fraction


@dataclass(frozen=True)
class SequenceQuadraticRatioPattern:
    variable: str
    expression: dict[str, Any]
    numerator_constant: Fraction
    numerator_linear: Fraction
    numerator_quadratic: Fraction
    denominator_constant: Fraction
    denominator_linear: Fraction
    denominator_quadratic: Fraction
    target: Fraction


@dataclass(frozen=True)
class SequencePolynomialDegreeRatioPattern:
    variable: str
    expression: dict[str, Any]
    numerator_coefficients: tuple[Fraction, ...]
    denominator_coefficients: tuple[Fraction, ...]
    numerator_degree: int
    denominator_degree: int
    leading_ratio: Fraction
    result_kind: str


@dataclass(frozen=True)
class SequenceElementaryDivergencePattern:
    variable: str
    expression: dict[str, Any]
    mode: str  # alternating_affine, periodic_residue, eventually_periodic_residue, periodic_finite_tail, geometric_pos_inf, geometric_no_finite_pos, geometric_no_finite_abs
    base: Fraction | None = None
    offset: Fraction | None = None
    scale: Fraction | None = None
    period: int | None = None
    residue_a: int | None = None
    residue_b: int | None = None
    value_a: Fraction | None = None
    value_b: Fraction | None = None
    periodic_core: dict[str, Any] | None = None
    finite_tail: SequenceAlgebraPattern | None = None
    eventual_cutoff: int | None = None


def _periodic_moduli_prop(prop: dict[str, Any], variable: str) -> set[int]:
    kind = prop.get("kind")
    if kind in {"true", "false"}:
        return set()
    if kind in {"eq", "ne", "lt", "le", "gt", "ge", "mem", "subset"}:
        return _periodic_moduli_expr(prop.get("left", {}), variable) | _periodic_moduli_expr(prop.get("right", {}), variable)
    if kind in {"and", "or", "implies", "iff"}:
        return _periodic_moduli_prop(prop.get("left", {}), variable) | _periodic_moduli_prop(prop.get("right", {}), variable)
    if kind == "not":
        return _periodic_moduli_prop(prop.get("arg", {}), variable)
    return set()


def _periodic_moduli_expr(expr: dict[str, Any], variable: str) -> set[int]:
    kind = expr.get("kind")
    if kind in {"int", "rat", "var"}:
        return set()
    if kind in {"neg", "cast_real", "factorial", "sqrt", "abs", "exp", "log", "sin", "cos"}:
        return _periodic_moduli_expr(expr.get("arg", {}), variable)
    if kind == "pow":
        return _periodic_moduli_expr(expr.get("base", {}), variable)
    if kind == "rpow":
        return _periodic_moduli_expr(expr.get("base", {}), variable) | _periodic_moduli_expr(expr.get("exponent", {}), variable)
    if kind == "pow_nat":
        return _periodic_moduli_expr(expr.get("base", {}), variable) | _periodic_moduli_expr(expr.get("exponent", {}), variable)
    if kind == "apply":
        return _periodic_moduli_expr(expr.get("function", {}), variable) | _periodic_moduli_expr(expr.get("arg", {}), variable)
    if kind == "if":
        return (
            _periodic_moduli_prop(expr.get("condition", {}), variable)
            | _periodic_moduli_expr(expr.get("then", {}), variable)
            | _periodic_moduli_expr(expr.get("else", {}), variable)
        )
    if kind == "mod_nat":
        left, right = expr.get("left", {}), expr.get("right", {})
        result = _periodic_moduli_expr(left, variable) | _periodic_moduli_expr(right, variable)
        if left == {"kind": "var", "id": variable} and right.get("kind") == "int":
            divisor = right.get("value")
            if isinstance(divisor, int) and not isinstance(divisor, bool) and divisor > 0:
                result.add(divisor)
        return result
    if kind in {"add", "sub", "mul", "div"}:
        return _periodic_moduli_expr(expr.get("left", {}), variable) | _periodic_moduli_expr(expr.get("right", {}), variable)
    return set()


def _periodic_scalar_value(expr: dict[str, Any], variable: str, period: int, residue: int) -> Fraction | None:
    constant = exact_rational_value(expr)
    if constant is not None:
        return constant
    kind = expr.get("kind")
    if kind == "var":
        return None
    if kind == "neg":
        child = _periodic_scalar_value(expr.get("arg", {}), variable, period, residue)
        return None if child is None else -child
    if kind in {"cast_real", "abs"}:
        child = _periodic_scalar_value(expr.get("arg", {}), variable, period, residue)
        if child is None:
            return None
        return child if kind == "cast_real" else abs(child)
    if kind in {"add", "sub", "mul", "div"}:
        left = _periodic_scalar_value(expr.get("left", {}), variable, period, residue)
        right = _periodic_scalar_value(expr.get("right", {}), variable, period, residue)
        if left is None or right is None:
            return None
        if kind == "add":
            return left + right
        if kind == "sub":
            return left - right
        if kind == "mul":
            return left * right
        return None if right == 0 else left / right
    if kind == "mod_nat":
        left, right = expr.get("left", {}), expr.get("right", {})
        if left == {"kind": "var", "id": variable} and right == {"kind": "int", "value": period}:
            return Fraction(residue, 1)
        left_value = _periodic_scalar_value(left, variable, period, residue)
        right_value = _periodic_scalar_value(right, variable, period, residue)
        if left_value is None or right_value is None:
            return None
        if left_value.denominator != 1 or right_value.denominator != 1 or left_value < 0 or right_value <= 0:
            return None
        return Fraction(left_value.numerator % right_value.numerator, 1)
    if kind == "pow":
        base = _periodic_scalar_value(expr.get("base", {}), variable, period, residue)
        exponent = expr.get("exponent")
        if base is None or not isinstance(exponent, int) or exponent < 0:
            return None
        return base ** exponent
    if kind == "pow_nat":
        base = _periodic_scalar_value(expr.get("base", {}), variable, period, residue)
        exponent = _periodic_scalar_value(expr.get("exponent", {}), variable, period, residue)
        if base is None or exponent is None or exponent.denominator != 1 or exponent < 0:
            return None
        return base ** exponent.numerator
    if kind == "if":
        truth = _periodic_prop_value(expr.get("condition", {}), variable, period, residue)
        if truth is None:
            return None
        branch = expr.get("then", {}) if truth else expr.get("else", {})
        return _periodic_scalar_value(branch, variable, period, residue)
    return None


def _periodic_prop_value(prop: dict[str, Any], variable: str, period: int, residue: int) -> bool | None:
    kind = prop.get("kind")
    if kind == "true":
        return True
    if kind == "false":
        return False
    if kind in {"eq", "ne", "lt", "le", "gt", "ge"}:
        left = _periodic_scalar_value(prop.get("left", {}), variable, period, residue)
        right = _periodic_scalar_value(prop.get("right", {}), variable, period, residue)
        if left is None or right is None:
            return None
        return {
            "eq": left == right,
            "ne": left != right,
            "lt": left < right,
            "le": left <= right,
            "gt": left > right,
            "ge": left >= right,
        }[kind]
    if kind == "not":
        value = _periodic_prop_value(prop.get("arg", {}), variable, period, residue)
        return None if value is None else not value
    if kind in {"and", "or", "implies", "iff"}:
        left = _periodic_prop_value(prop.get("left", {}), variable, period, residue)
        right = _periodic_prop_value(prop.get("right", {}), variable, period, residue)
        if left is None or right is None:
            return None
        if kind == "and":
            return left and right
        if kind == "or":
            return left or right
        if kind == "implies":
            return (not left) or right
        return left == right
    return None


def _periodic_residue_pattern(expr: dict[str, Any], variable: str) -> tuple[int, int, Fraction, int, Fraction] | None:
    moduli = _periodic_moduli_expr(expr, variable)
    if len(moduli) != 1:
        return None
    period = next(iter(moduli))
    if period not in {2, 3, 4}:
        return None
    values: list[Fraction] = []
    for residue in range(period):
        value = _periodic_scalar_value(expr, variable, period, residue)
        if value is None:
            return None
        values.append(value)
    for residue_a, value_a in enumerate(values):
        for residue_b in range(residue_a + 1, period):
            value_b = values[residue_b]
            if value_a != value_b:
                return period, residue_a, value_a, residue_b, value_b
    return None


def _oscillating_core_residues(
    expr: dict[str, Any], variable: str
) -> tuple[int, int, Fraction, int, Fraction] | None:
    """Return two distinct exact residue values for a supported periodic core."""
    periodic = _periodic_residue_pattern(expr, variable)
    if periodic is not None:
        return periodic
    alternating = _alternating_affine_coefficients(expr, variable)
    if alternating is None or alternating[1] == 0:
        return None
    offset, scale = alternating
    return 2, 0, offset + scale, 1, offset - scale


def _eventually_periodic_core_pattern(
    expr: dict[str, Any], variable: str
) -> tuple[dict[str, Any], int, int, int, Fraction, int, Fraction] | None:
    """Recognize a finite prefix followed permanently by a supported periodic core.

    Checkpoint 19 deliberately supports one transparent cutoff syntax only:
    ``if n < K then PREFIX else CORE`` with exact natural ``K``.  The prefix is
    semantically irrelevant to a Nat.atTop limit and may contain arbitrary
    well-typed sequence syntax.  ``CORE`` must already be one of the exact
    period-2/3/4 or alternating cores accepted by the existing residue matcher.
    """
    if expr.get("kind") != "if":
        return None
    condition = expr.get("condition", {})
    if condition.get("kind") != "lt":
        return None
    if condition.get("left") != {"kind": "var", "id": variable}:
        return None
    cutoff_expr = condition.get("right", {})
    if cutoff_expr.get("kind") != "int":
        return None
    cutoff = cutoff_expr.get("value")
    if not isinstance(cutoff, int) or isinstance(cutoff, bool) or cutoff < 0:
        return None
    core = expr.get("else", {})
    residues = _oscillating_core_residues(core, variable)
    if residues is None:
        return None
    period, residue_a, value_a, residue_b, value_b = residues
    return core, cutoff, period, residue_a, value_a, residue_b, value_b


def _closed_sequence_limit_target(expr: dict[str, Any], variable: str) -> dict[str, Any] | None:
    """Propose the finite target of a closed sequence-algebra expression.

    This mirrors only the premise-free leaves/combinators accepted by
    ``match_sequence_algebra``.  The proposal is never trusted on its own: the
    full algebra matcher and guard checker must subsequently reconstruct the
    same target with no cited premises.
    """
    if not _mentions(expr, variable):
        return expr

    if expr.get("kind") == "pow_nat":
        exponent = expr.get("exponent", {})
        base = expr.get("base", {})
        if exponent == {"kind": "var", "id": variable} and not _mentions(base, variable):
            return _zero()
        return None

    if expr.get("kind") == "div" and not _mentions(expr.get("left", {}), variable):
        shift = _nat_shift(expr.get("right", {}), variable)
        if shift is not None and shift >= 1:
            return _zero()

    kind = expr.get("kind")
    if kind == "neg":
        child = _closed_sequence_limit_target(expr.get("arg", {}), variable)
        return None if child is None else _neg(child)
    if kind in {"add", "sub", "mul", "div"}:
        left = _closed_sequence_limit_target(expr.get("left", {}), variable)
        right = _closed_sequence_limit_target(expr.get("right", {}), variable)
        if left is None or right is None:
            return None
        return _binary(kind, left, right)
    if kind == "pow":
        exponent = expr.get("exponent")
        if not isinstance(exponent, int) or exponent < 0:
            return None
        child = _closed_sequence_limit_target(expr.get("base", {}), variable)
        if child is None:
            return None
        if exponent == 0:
            return _one()
        if exponent == 1:
            return child
        return {"kind": "pow", "base": child, "exponent": exponent}
    if kind in {"abs", "exp", "sin", "cos", "log", "sqrt"}:
        child = _closed_sequence_limit_target(expr.get("arg", {}), variable)
        return None if child is None else {"kind": kind, "arg": child}
    return None


def _closed_finite_tail(expr: dict[str, Any], variable: str) -> SequenceAlgebraPattern | None:
    """Recognize a premise-free finite sequence-algebra proof for ``expr``.

    The target is proposed structurally, then independently checked by the
    existing sequence algebra matcher.  All guards must be discharged
    automatically and no cited sublimit may be required.
    """
    target = _closed_sequence_limit_target(expr, variable)
    if target is None:
        return None
    goal = {
        "kind": "sequence_limit",
        "variable": variable,
        "expression": expr,
        "result": {"kind": "finite", "value": target},
    }
    pattern = match_sequence_algebra(goal)
    if pattern is None or pattern.used_sequence_premises:
        return None
    missing, violated = sequence_algebra_status(pattern, ())
    if missing or violated:
        return None
    return pattern


def _cited_finite_tail(
    expr: dict[str, Any],
    variable: str,
    premise_rows: Iterable[tuple[str, dict[str, Any]]],
) -> SequenceAlgebraPattern | None:
    """Reuse one cited exact finite sequence limit as the perturbation proof.

    Scope and temporal ordering are enforced earlier by the proof contract: a
    premise row reaching this function is already an in-scope, earlier proof
    node.  This matcher deliberately requires the cited sequence expression to
    be structurally identical to the perturbation, so no untrusted algebraic
    rewrite is smuggled into the dependency edge.
    """
    for identifier, claim in premise_rows:
        if claim.get("kind") != "sequence_limit":
            continue
        if claim.get("variable") != variable or claim.get("result", {}).get("kind") != "finite":
            continue
        if not _same(claim.get("expression", {}), expr):
            continue
        pattern = match_sequence_algebra(claim, ((identifier, claim),))
        if pattern is None or pattern.used_sequence_premises != (identifier,):
            continue
        missing, violated = sequence_algebra_status(pattern, ())
        if missing or violated:
            continue
        return pattern
    return None


def _periodic_with_finite_tail_pattern(
    expression: dict[str, Any],
    variable: str,
    premise_rows: Iterable[tuple[str, dict[str, Any]]] = (),
) -> tuple[dict[str, Any], SequenceAlgebraPattern, int, int, Fraction, int, Fraction] | None:
    """Split one top-level additive expression into periodic core + finite tail.

    Subtraction is normalized to addition of a negated term.  The tail may
    converge to any finite target that the premise-free sequence-algebra engine
    can reconstruct, or it may be supplied by one exact cited earlier finite
    sequence-limit premise.  Since that same target is added to every
    residue-class subsequence, two distinct periodic limits remain distinct.
    """
    kind = expression.get("kind")
    if kind == "add":
        terms = [(expression.get("left", {}), expression.get("right", {})),
                 (expression.get("right", {}), expression.get("left", {}))]
    elif kind == "sub":
        left, right = expression.get("left", {}), expression.get("right", {})
        terms = [(left, _neg(right)), (_neg(right), left)]
    else:
        return None

    for core, tail in terms:
        residues = _oscillating_core_residues(core, variable)
        if residues is None:
            continue
        tail_pattern = _closed_finite_tail(tail, variable)
        if tail_pattern is None:
            tail_pattern = _cited_finite_tail(tail, variable, premise_rows)
        if tail_pattern is None:
            continue
        period, residue_a, value_a, residue_b, value_b = residues
        return core, tail_pattern, period, residue_a, value_a, residue_b, value_b
    return None


def _is_alternating_power(expr: dict[str, Any], variable: str) -> bool:
    if expr.get("kind") != "pow_nat":
        return False
    if expr.get("exponent") != {"kind": "var", "id": variable}:
        return False
    return exact_rational_value(expr.get("base", {})) == -1


def _alternating_affine_coefficients(expr: dict[str, Any], variable: str) -> tuple[Fraction, Fraction] | None:
    """Return ``(offset, scale)`` for ``offset + scale * (-1)^n``.

    This recognizer is exact and intentionally tiny.  It accepts rational
    arithmetic around the one alternating atom ``(-1)^n`` and rejects
    nonlinear products of two alternating terms.  Lean later proves the two
    incompatible subsequence limits; Python does not assert nonconvergence.
    """
    constant = exact_rational_value(expr)
    if constant is not None:
        return constant, Fraction(0)
    if _is_alternating_power(expr, variable):
        return Fraction(0), Fraction(1)
    kind = expr.get("kind")
    if kind == "neg":
        child = _alternating_affine_coefficients(expr.get("arg", {}), variable)
        return None if child is None else (-child[0], -child[1])
    if kind in {"add", "sub"}:
        left = _alternating_affine_coefficients(expr.get("left", {}), variable)
        right = _alternating_affine_coefficients(expr.get("right", {}), variable)
        if left is None or right is None:
            return None
        sign = 1 if kind == "add" else -1
        return left[0] + sign * right[0], left[1] + sign * right[1]
    if kind == "mul":
        left = _alternating_affine_coefficients(expr.get("left", {}), variable)
        right = _alternating_affine_coefficients(expr.get("right", {}), variable)
        if left is None or right is None or (left[1] != 0 and right[1] != 0):
            return None
        return left[0] * right[0], left[0] * right[1] + left[1] * right[0]
    if kind == "div":
        numerator = _alternating_affine_coefficients(expr.get("left", {}), variable)
        denominator = exact_rational_value(expr.get("right", {}))
        if numerator is None or denominator in {None, 0}:
            return None
        return numerator[0] / denominator, numerator[1] / denominator
    return None


def match_sequence_elementary_divergence(
    goal: dict[str, Any],
    premise_rows: Iterable[tuple[str, dict[str, Any]]] = (),
) -> SequenceElementaryDivergencePattern | None:
    """Recognize a small kernel-reconstructible divergence/oscillation family.

    Supported claims are:
    * ``offset + scale * (-1)^n`` has no finite limit when ``scale != 0``;
    * exact rational-valued modulo-periodic expressions of period 2, 3, or 4
      have no finite limit when two residue classes have different values;
    * a finite prefix followed by a supported exact periodic core has the same
      no-finite-limit classification because Nat.atTop ignores finitely many terms;
    * either supported periodic core plus one finite perturbation still has no
      finite limit when that perturbation is proved automatically or cited from
      one earlier exact sequence-limit premise;
    * exact ``r^n`` tends to ``+∞`` when ``r > 1``;
    * exact ``r^n`` has no finite limit when ``r > 1`` or ``r < -1``.

    The periodic branch is proved using two arithmetic-progression subsequences.
    The ``r < -1`` branch is proved through divergence of ``|r|^n``.
    """
    if goal.get("kind") != "sequence_limit":
        return None
    variable = goal.get("variable")
    if not isinstance(variable, str):
        return None
    expression = goal.get("expression", {})
    result_kind = goal.get("result", {}).get("kind")

    alternating = _alternating_affine_coefficients(expression, variable)
    if result_kind == "no_finite_limit" and alternating is not None and alternating[1] != 0:
        return SequenceElementaryDivergencePattern(
            variable, expression, "alternating_affine", offset=alternating[0], scale=alternating[1]
        )

    periodic = _periodic_residue_pattern(expression, variable)
    if result_kind == "no_finite_limit" and periodic is not None:
        period, residue_a, value_a, residue_b, value_b = periodic
        return SequenceElementaryDivergencePattern(
            variable,
            expression,
            "periodic_residue",
            period=period,
            residue_a=residue_a,
            residue_b=residue_b,
            value_a=value_a,
            value_b=value_b,
        )

    eventually_periodic = _eventually_periodic_core_pattern(expression, variable)
    if result_kind == "no_finite_limit" and eventually_periodic is not None:
        core, cutoff, period, residue_a, value_a, residue_b, value_b = eventually_periodic
        return SequenceElementaryDivergencePattern(
            variable,
            expression,
            "eventually_periodic_residue",
            period=period,
            residue_a=residue_a,
            residue_b=residue_b,
            value_a=value_a,
            value_b=value_b,
            periodic_core=core,
            eventual_cutoff=cutoff,
        )

    perturbed = _periodic_with_finite_tail_pattern(expression, variable, premise_rows)
    if result_kind == "no_finite_limit" and perturbed is not None:
        core, tail_pattern, period, residue_a, value_a, residue_b, value_b = perturbed
        return SequenceElementaryDivergencePattern(
            variable,
            expression,
            "periodic_finite_tail",
            period=period,
            residue_a=residue_a,
            residue_b=residue_b,
            value_a=value_a,
            value_b=value_b,
            periodic_core=core,
            finite_tail=tail_pattern,
        )

    if expression.get("kind") != "pow_nat" or expression.get("exponent") != {"kind": "var", "id": variable}:
        return None
    base = exact_rational_value(expression.get("base", {}))
    if base is None:
        return None
    if result_kind == "positive_infinity" and base > 1:
        return SequenceElementaryDivergencePattern(variable, expression, "geometric_pos_inf", base=base)
    if result_kind == "no_finite_limit" and base > 1:
        return SequenceElementaryDivergencePattern(variable, expression, "geometric_no_finite_pos", base=base)
    if result_kind == "no_finite_limit" and base < -1:
        return SequenceElementaryDivergencePattern(variable, expression, "geometric_no_finite_abs", base=base)
    return None


def _affine_real_coefficients(expr: dict[str, Any], variable: str) -> tuple[Fraction, Fraction] | None:
    """Return ``(intercept, slope)`` for an exact affine real expression.

    The recognizer is intentionally exact and conservative. It accepts rational
    constants, explicit ``real(n)`` or the bare bound index ``n`` in a
    real-coercible sequence/series context, and arithmetic that preserves degree
    at most one. Any product of two genuinely variable-dependent affine terms,
    nonconstant division, or nonlinear function is rejected.
    """
    constant = exact_rational_value(expr)
    if constant is not None:
        return constant, Fraction(0)

    if expr == {"kind": "var", "id": variable}:
        # Sequence/series goals are real-valued but the public text syntax often
        # leaves the Nat index unwrapped (for example ``n + 1/2``). Treat the
        # bound index as the same real affine indeterminate here; the
        # Lean renderer later checks the coercions in the generated identity.
        return Fraction(0), Fraction(1)

    if expr.get("kind") == "cast_real" and expr.get("arg") == {"kind": "var", "id": variable}:
        return Fraction(0), Fraction(1)

    kind = expr.get("kind")
    if kind == "neg":
        child = _affine_real_coefficients(expr.get("arg", {}), variable)
        return None if child is None else (-child[0], -child[1])

    if kind in {"add", "sub"}:
        left = _affine_real_coefficients(expr.get("left", {}), variable)
        right = _affine_real_coefficients(expr.get("right", {}), variable)
        if left is None or right is None:
            return None
        sign = 1 if kind == "add" else -1
        return left[0] + sign * right[0], left[1] + sign * right[1]

    if kind == "mul":
        left = _affine_real_coefficients(expr.get("left", {}), variable)
        right = _affine_real_coefficients(expr.get("right", {}), variable)
        if left is None or right is None or (left[1] != 0 and right[1] != 0):
            return None
        return left[0] * right[0], left[0] * right[1] + left[1] * right[0]

    if kind == "div":
        numerator = _affine_real_coefficients(expr.get("left", {}), variable)
        denominator = exact_rational_value(expr.get("right", {}))
        if numerator is None or denominator in {None, 0}:
            return None
        return numerator[0] / denominator, numerator[1] / denominator

    if kind == "pow" and expr.get("exponent") == 1:
        return _affine_real_coefficients(expr.get("base", {}), variable)
    return None


def _quadratic_real_coefficients(expr: dict[str, Any], variable: str) -> tuple[Fraction, Fraction, Fraction] | None:
    """Return exact ``(constant, linear, quadratic)`` coefficients.

    This is deliberately a degree-at-most-two recognizer, not a general CAS
    polynomial classifier.  It accepts exact rational arithmetic around
    ``real(n)`` and rejects any operation whose expanded degree would exceed
    two or whose denominator depends on the index.
    """
    constant = exact_rational_value(expr)
    if constant is not None:
        return constant, Fraction(0), Fraction(0)

    if expr.get("kind") == "cast_real" and expr.get("arg") == {"kind": "var", "id": variable}:
        return Fraction(0), Fraction(1), Fraction(0)

    kind = expr.get("kind")
    if kind == "neg":
        child = _quadratic_real_coefficients(expr.get("arg", {}), variable)
        return None if child is None else tuple(-value for value in child)

    if kind in {"add", "sub"}:
        left = _quadratic_real_coefficients(expr.get("left", {}), variable)
        right = _quadratic_real_coefficients(expr.get("right", {}), variable)
        if left is None or right is None:
            return None
        sign = 1 if kind == "add" else -1
        return tuple(left[index] + sign * right[index] for index in range(3))

    if kind == "mul":
        left = _quadratic_real_coefficients(expr.get("left", {}), variable)
        right = _quadratic_real_coefficients(expr.get("right", {}), variable)
        if left is None or right is None:
            return None
        expanded = [Fraction(0) for _ in range(5)]
        for i, left_value in enumerate(left):
            for j, right_value in enumerate(right):
                expanded[i + j] += left_value * right_value
        if expanded[3] != 0 or expanded[4] != 0:
            return None
        return expanded[0], expanded[1], expanded[2]

    if kind == "div":
        numerator = _quadratic_real_coefficients(expr.get("left", {}), variable)
        denominator = exact_rational_value(expr.get("right", {}))
        if numerator is None or denominator in {None, 0}:
            return None
        return tuple(value / denominator for value in numerator)

    if kind == "pow":
        exponent = expr.get("exponent")
        if exponent == 0:
            return Fraction(1), Fraction(0), Fraction(0)
        base = _quadratic_real_coefficients(expr.get("base", {}), variable)
        if base is None:
            return None
        if exponent == 1:
            return base
        if exponent == 2:
            expanded = [Fraction(0) for _ in range(5)]
            for i, left_value in enumerate(base):
                for j, right_value in enumerate(base):
                    expanded[i + j] += left_value * right_value
            if expanded[3] != 0 or expanded[4] != 0:
                return None
            return expanded[0], expanded[1], expanded[2]
    return None


MAX_SEQUENCE_POLYNOMIAL_DEGREE = 64


def _trim_polynomial(coefficients: list[Fraction]) -> tuple[Fraction, ...]:
    while len(coefficients) > 1 and coefficients[-1] == 0:
        coefficients.pop()
    return tuple(coefficients or [Fraction(0)])


def _add_polynomials(
    left: tuple[Fraction, ...],
    right: tuple[Fraction, ...],
    *,
    subtract: bool = False,
) -> tuple[Fraction, ...]:
    size = max(len(left), len(right))
    result = [Fraction(0) for _ in range(size)]
    sign = -1 if subtract else 1
    for index, value in enumerate(left):
        result[index] += value
    for index, value in enumerate(right):
        result[index] += sign * value
    return _trim_polynomial(result)


def _mul_polynomials(
    left: tuple[Fraction, ...],
    right: tuple[Fraction, ...],
) -> tuple[Fraction, ...] | None:
    if len(left) + len(right) - 2 > MAX_SEQUENCE_POLYNOMIAL_DEGREE:
        return None
    result = [Fraction(0) for _ in range(len(left) + len(right) - 1)]
    for i, left_value in enumerate(left):
        for j, right_value in enumerate(right):
            result[i + j] += left_value * right_value
    return _trim_polynomial(result)


def _pow_polynomial(base: tuple[Fraction, ...], exponent: int) -> tuple[Fraction, ...] | None:
    if exponent < 0:
        return None
    result: tuple[Fraction, ...] = (Fraction(1),)
    factor = base
    power = exponent
    while power:
        if power & 1:
            multiplied = _mul_polynomials(result, factor)
            if multiplied is None:
                return None
            result = multiplied
        power >>= 1
        if power:
            squared = _mul_polynomials(factor, factor)
            if squared is None:
                return None
            factor = squared
    return result


def _polynomial_real_coefficients(expr: dict[str, Any], variable: str) -> tuple[Fraction, ...] | None:
    """Normalize an exact real polynomial in the sequence/series index.

    The bound index may appear either explicitly as ``real(variable)`` or in
    ordinary student notation as bare ``variable`` inside a real-coercible
    sequence/series term. Coefficients are exact rationals and the accepted
    degree is bounded by the proof contract's power ceiling. Division is
    accepted only by a nonzero exact rational constant, so learner expressions
    never become rational functions inside this classifier. The generated Lean
    proof still checks every Nat-to-Real coercion explicitly.
    """
    constant = exact_rational_value(expr)
    if constant is not None:
        return (constant,)

    if expr == {"kind": "var", "id": variable}:
        # Sequence/series goals are real-valued but the public text syntax often
        # leaves the Nat index unwrapped (for example ``(n + 1/2)^2``).  Treat
        # the bound index as the same real polynomial indeterminate here; the
        # Lean renderer later checks the coercions in the generated identity.
        return Fraction(0), Fraction(1)

    if expr.get("kind") == "cast_real" and expr.get("arg") == {"kind": "var", "id": variable}:
        return Fraction(0), Fraction(1)

    kind = expr.get("kind")
    if kind == "neg":
        child = _polynomial_real_coefficients(expr.get("arg", {}), variable)
        return None if child is None else tuple(-value for value in child)

    if kind in {"add", "sub"}:
        left = _polynomial_real_coefficients(expr.get("left", {}), variable)
        right = _polynomial_real_coefficients(expr.get("right", {}), variable)
        if left is None or right is None:
            return None
        return _add_polynomials(left, right, subtract=kind == "sub")

    if kind == "mul":
        left = _polynomial_real_coefficients(expr.get("left", {}), variable)
        right = _polynomial_real_coefficients(expr.get("right", {}), variable)
        if left is None or right is None:
            return None
        return _mul_polynomials(left, right)

    if kind == "div":
        numerator = _polynomial_real_coefficients(expr.get("left", {}), variable)
        denominator = exact_rational_value(expr.get("right", {}))
        if numerator is None or denominator in {None, 0}:
            return None
        return _trim_polynomial([value / denominator for value in numerator])

    if kind == "pow":
        exponent = expr.get("exponent")
        if not isinstance(exponent, int) or isinstance(exponent, bool) or exponent < 0:
            return None
        base = _polynomial_real_coefficients(expr.get("base", {}), variable)
        if base is None:
            return None
        return _pow_polynomial(base, exponent)
    return None


def _polynomial_degree(coefficients: tuple[Fraction, ...]) -> int:
    for degree in range(len(coefficients) - 1, -1, -1):
        if coefficients[degree] != 0:
            return degree
    return -1


def _degree_le_two(coefficients: tuple[Fraction, Fraction, Fraction]) -> int:
    return _polynomial_degree(coefficients)


def match_sequence_polynomial_degree_ratio(goal: dict[str, Any]) -> SequencePolynomialDegreeRatioPattern | None:
    """Match general exact polynomial ratios over ``Nat.atTop``.

    Python only recovers exact rational coefficient vectors, degrees, and the
    claimed asymptotic branch.  Lean reconstructs actual ``Polynomial ℝ``
    values and delegates the limit to mathlib's general polynomial quotient
    theorems.

    The specialized affine and quadratic equal-degree rules keep ownership of
    degrees one and two; this fallback accepts equal degree only from degree
    three upward.  Unequal degrees are accepted at every supported degree.
    """
    if goal.get("kind") != "sequence_limit":
        return None
    variable = goal.get("variable")
    expression = goal.get("expression", {})
    if not isinstance(variable, str) or expression.get("kind") != "div":
        return None

    numerator = _polynomial_real_coefficients(expression.get("left", {}), variable)
    denominator = _polynomial_real_coefficients(expression.get("right", {}), variable)
    if numerator is None or denominator is None:
        return None
    numerator_degree = _polynomial_degree(numerator)
    denominator_degree = _polynomial_degree(denominator)
    if denominator_degree < 0:
        return None

    result = goal.get("result", {})
    if numerator_degree < denominator_degree:
        target = exact_rational_value(result.get("value", {})) if result.get("kind") == "finite" else None
        if target != 0:
            return None
        leading_ratio = (
            Fraction(0)
            if numerator_degree < 0
            else numerator[numerator_degree] / denominator[denominator_degree]
        )
        return SequencePolynomialDegreeRatioPattern(
            variable, expression, numerator, denominator, numerator_degree, denominator_degree, leading_ratio, "finite"
        )

    leading_ratio = numerator[numerator_degree] / denominator[denominator_degree]
    if numerator_degree == denominator_degree:
        if numerator_degree <= 2:
            return None
        target = exact_rational_value(result.get("value", {})) if result.get("kind") == "finite" else None
        if target != leading_ratio:
            return None
        return SequencePolynomialDegreeRatioPattern(
            variable, expression, numerator, denominator, numerator_degree, denominator_degree, leading_ratio, "finite"
        )

    expected_kind = "positive_infinity" if leading_ratio > 0 else "negative_infinity"
    if result.get("kind") != expected_kind:
        return None
    return SequencePolynomialDegreeRatioPattern(
        variable, expression, numerator, denominator, numerator_degree, denominator_degree, leading_ratio, expected_kind
    )


def _eventually_le_claim(
    sequence_variable: str,
    left: dict[str, Any],
    right: dict[str, Any],
) -> dict[str, Any]:
    threshold = "eventuallyN"
    index = "eventuallyK"
    index_expr = {"kind": "var", "id": index}
    left_at = substitute_expr(left, sequence_variable, index_expr)
    right_at = substitute_expr(right, sequence_variable, index_expr)
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
                    "right": index_expr,
                },
                "right": {"kind": "le", "left": left_at, "right": right_at},
            },
        },
    }


def _forall_le_claim(
    sequence_variable: str,
    left: dict[str, Any],
    right: dict[str, Any],
) -> dict[str, Any]:
    index = "boundK"
    index_expr = {"kind": "var", "id": index}
    return {
        "kind": "forall",
        "binder": {"id": index, "type": "nat"},
        "body": {
            "kind": "le",
            "left": substitute_expr(left, sequence_variable, index_expr),
            "right": substitute_expr(right, sequence_variable, index_expr),
        },
    }


def _trig_division_bound_kind(
    sequence_variable: str,
    left: dict[str, Any],
    right: dict[str, Any],
) -> str | None:
    """Recognize -1/d(n) <= trig(..)/d(n) <= 1/d(n), d(n)=real(n+k), k>=1.

    This classifier is intentionally narrow.  It only identifies a shape for
    which the Lean renderer can reconstruct the order proof from the standard
    global sin/cos bounds and denominator positivity.
    """
    if left.get("kind") != "div" or right.get("kind") != "div":
        return None
    left_den = left.get("right", {})
    right_den = right.get("right", {})
    if not _same(left_den, right_den):
        return None
    shift = _nat_shift(left_den, sequence_variable)
    if shift is None or shift < 1:
        return None
    left_num = left.get("left", {})
    right_num = right.get("left", {})
    if exact_rational_value(left_num) == -1 and right_num.get("kind") in {"sin", "cos"}:
        return f"auto_{right_num['kind']}_lower"
    if left_num.get("kind") in {"sin", "cos"} and exact_rational_value(right_num) == 1:
        return f"auto_{left_num['kind']}_upper"
    return None


def match_sequence_bound_evidence(
    proposition: dict[str, Any],
    sequence_variable: str,
    left: dict[str, Any],
    right: dict[str, Any],
) -> str | None:
    """Recognize a transparent eventual (or stronger all-index) inequality."""
    if same_logic(proposition, _eventually_le_claim(sequence_variable, left, right)):
        return "eventually"
    if same_logic(proposition, _forall_le_claim(sequence_variable, left, right)):
        return "forall"
    return None


def match_sequence_squeeze(
    goal: dict[str, Any],
    sequence_rows: Iterable[tuple[str, dict[str, Any]]],
    proposition_rows: Iterable[tuple[str, dict[str, Any]]],
) -> SequenceSqueezePattern | None:
    """Match the finite squeeze theorem over `Nat.atTop`.

    Lower and upper sequences must both converge to the exact claimed finite
    target (up to conservative algebraic equivalence).  The inequalities may
    hold eventually or for every natural index.
    """
    if goal.get("kind") != "sequence_limit" or goal.get("result", {}).get("kind") != "finite":
        return None
    variable = goal.get("variable")
    if not isinstance(variable, str):
        return None
    target = goal["result"]["value"]
    middle = goal.get("expression", {})
    finite = _finite_premise_rows(goal, sequence_rows)
    candidates = [
        (identifier, claim)
        for identifier, claim in finite
        if _equivalent(claim["result"]["value"], target)
    ]
    props = list(proposition_rows)
    for lower_id, lower in candidates:
        lower_expr = lower["expression"]
        lower_bound = next(
            (
                SequenceBoundEvidence(pid, conversion)
                for pid, prop in props
                if (conversion := match_sequence_bound_evidence(prop, variable, lower_expr, middle)) is not None
            ),
            None,
        )
        if lower_bound is None:
            auto = _trig_division_bound_kind(variable, lower_expr, middle)
            if auto is not None:
                lower_bound = SequenceBoundEvidence(None, auto)
        if lower_bound is None:
            continue
        for upper_id, upper in candidates:
            upper_expr = upper["expression"]
            upper_bound = next(
                (
                    SequenceBoundEvidence(pid, conversion)
                    for pid, prop in props
                    if (conversion := match_sequence_bound_evidence(prop, variable, middle, upper_expr)) is not None
                ),
                None,
            )
            if upper_bound is None:
                auto = _trig_division_bound_kind(variable, middle, upper_expr)
                if auto is not None:
                    upper_bound = SequenceBoundEvidence(None, auto)
            if upper_bound is None:
                continue
            return SequenceSqueezePattern(
                variable=variable,
                expression=middle,
                target=target,
                lower_expression=lower_expr,
                upper_expression=upper_expr,
                lower_limit_premise=lower_id,
                upper_limit_premise=upper_id,
                lower_bound=lower_bound,
                upper_bound=upper_bound,
            )
    return None


def _monotonicity_claim(expression: dict[str, Any], variable: str, mode: str) -> dict[str, Any]:
    left_id, right_id = "monoM", "monoN"
    m, n = {"kind": "var", "id": left_id}, {"kind": "var", "id": right_id}
    fm = substitute_expr(expression, variable, m)
    fn = substitute_expr(expression, variable, n)
    comparison = {"kind": "le", "left": fm if mode == "monotone" else fn, "right": fn if mode == "monotone" else fm}
    return {
        "kind": "forall",
        "binder": {"id": left_id, "type": "nat"},
        "body": {
            "kind": "forall",
            "binder": {"id": right_id, "type": "nat"},
            "body": {
                "kind": "implies",
                "left": {"kind": "le", "left": m, "right": n},
                "right": comparison,
            },
        },
    }


def _boundedness_claim(expression: dict[str, Any], variable: str, mode: str) -> dict[str, Any]:
    bound_id, index_id = "boundB", "boundN"
    bound = {"kind": "var", "id": bound_id}
    index = {"kind": "var", "id": index_id}
    value = substitute_expr(expression, variable, index)
    comparison = {"kind": "le", "left": value if mode == "monotone" else bound, "right": bound if mode == "monotone" else value}
    return {
        "kind": "exists",
        "binder": {"id": bound_id, "type": "real"},
        "body": {
            "kind": "forall",
            "binder": {"id": index_id, "type": "nat"},
            "body": comparison,
        },
    }


def _geometric_order_pattern(
    expression: dict[str, Any], variable: str
) -> tuple[str, SequenceGeometricOrderEvidence] | None:
    """Recognize L +/- c*r^n with exact 0 < c and 0 <= r <= 1.

    The minus branch is monotone and upper-bounded by L; the plus branch is
    antitone and lower-bounded by L.  Lean reconstructs both facts.
    """
    kind = expression.get("kind")
    if kind not in {"add", "sub"}:
        return None
    offset = exact_rational_value(expression.get("left", {}))
    if offset is None:
        return None
    tail = expression.get("right", {})
    scale = Fraction(1)
    power = tail
    if tail.get("kind") == "mul":
        left_value = exact_rational_value(tail.get("left", {}))
        right_value = exact_rational_value(tail.get("right", {}))
        if left_value is not None:
            scale = left_value
            power = tail.get("right", {})
        elif right_value is not None:
            scale = right_value
            power = tail.get("left", {})
        else:
            return None
    if scale <= 0 or power.get("kind") != "pow_nat":
        return None
    if power.get("exponent") != {"kind": "var", "id": variable}:
        return None
    ratio = exact_rational_value(power.get("base", {}))
    if ratio is None or ratio < 0 or ratio > 1:
        return None
    mode = "monotone" if kind == "sub" else "antitone"
    return mode, SequenceGeometricOrderEvidence(offset, scale, ratio)


def match_sequence_monotone_bounded(
    goal: dict[str, Any],
    proposition_rows: Iterable[tuple[str, dict[str, Any]]],
) -> SequenceMonotoneBoundedPattern | None:
    if goal.get("kind") != "sequence_limit" or goal.get("result", {}).get("kind") != "exists_finite":
        return None
    variable = goal.get("variable")
    expression = goal.get("expression", {})
    if not isinstance(variable, str):
        return None
    props = list(proposition_rows)
    for mode in ("monotone", "antitone"):
        mono = _monotonicity_claim(expression, variable, mode)
        bounded = _boundedness_claim(expression, variable, mode)
        mono_id = next((pid for pid, prop in props if same_logic(prop, mono)), None)
        if mono_id is None:
            continue
        bounded_id = next((pid for pid, prop in props if same_logic(prop, bounded)), None)
        if bounded_id is None:
            continue
        return SequenceMonotoneBoundedPattern(variable, expression, mode, mono_id, bounded_id)
    auto = _geometric_order_pattern(expression, variable)
    if auto is not None:
        mode, evidence = auto
        return SequenceMonotoneBoundedPattern(variable, expression, mode, None, None, evidence)
    return None


def match_sequence_quadratic_ratio(goal: dict[str, Any]) -> SequenceQuadraticRatioPattern | None:
    """Match exact quadratic-over-quadratic real sequences.

    Both numerator and denominator must have degree exactly two after exact
    rational normalization.  The claimed finite target must be exactly the
    ratio of quadratic coefficients.  Lower-degree and divergent degree
    comparisons intentionally remain outside this checkpoint.
    """
    if goal.get("kind") != "sequence_limit" or goal.get("result", {}).get("kind") != "finite":
        return None
    variable = goal.get("variable")
    expression = goal.get("expression", {})
    if not isinstance(variable, str) or expression.get("kind") != "div":
        return None

    numerator = _quadratic_real_coefficients(expression.get("left", {}), variable)
    denominator = _quadratic_real_coefficients(expression.get("right", {}), variable)
    if numerator is None or denominator is None:
        return None
    if numerator[2] == 0 or denominator[2] == 0:
        return None

    expected = numerator[2] / denominator[2]
    target = exact_rational_value(goal["result"].get("value", {}))
    if target is None or target != expected:
        return None
    return SequenceQuadraticRatioPattern(
        variable=variable,
        expression=expression,
        numerator_constant=numerator[0],
        numerator_linear=numerator[1],
        numerator_quadratic=numerator[2],
        denominator_constant=denominator[0],
        denominator_linear=denominator[1],
        denominator_quadratic=denominator[2],
        target=expected,
    )


def match_sequence_affine_ratio(goal: dict[str, Any]) -> SequenceAffineRatioPattern | None:
    """Match exact affine-over-affine real sequences.

    Supported shape is any conservatively recognized exact affine numerator
    divided by an exact affine denominator with nonzero leading coefficient.
    The only accepted target is the ratio of the two leading coefficients.
    Lean reconstructs the proof with mathlib's
    ``tendsto_add_mul_div_add_mul_atTop_nhds`` theorem.
    """
    if goal.get("kind") != "sequence_limit" or goal.get("result", {}).get("kind") != "finite":
        return None
    variable = goal.get("variable")
    expression = goal.get("expression", {})
    if not isinstance(variable, str) or expression.get("kind") != "div":
        return None

    numerator = _affine_real_coefficients(expression.get("left", {}), variable)
    denominator = _affine_real_coefficients(expression.get("right", {}), variable)
    if numerator is None or denominator is None or denominator[1] == 0:
        return None

    expected = numerator[1] / denominator[1]
    target = exact_rational_value(goal["result"].get("value", {}))
    if target is None or target != expected:
        return None
    return SequenceAffineRatioPattern(
        variable=variable,
        expression=expression,
        numerator_intercept=numerator[0],
        numerator_slope=numerator[1],
        denominator_intercept=denominator[0],
        denominator_slope=denominator[1],
        target=expected,
    )


def match_sequence_rational_shift(goal: dict[str, Any]) -> SequenceRationalShiftPattern | None:
    """Match `(real(n+a))/(real(n+b)) -> 1` for exact a>=0, b>=1."""
    if goal.get("kind") != "sequence_limit" or goal.get("result", {}).get("kind") != "finite":
        return None
    if not _equivalent(goal["result"].get("value", {}), _one()):
        return None
    expression = goal.get("expression", {})
    if expression.get("kind") != "div":
        return None
    variable = goal.get("variable")
    if not isinstance(variable, str):
        return None
    numerator_shift = _nat_shift(expression.get("left", {}), variable)
    denominator_shift = _nat_shift(expression.get("right", {}), variable)
    if numerator_shift is None or denominator_shift is None:
        return None
    if numerator_shift < 0 or denominator_shift < 1:
        return None
    return SequenceRationalShiftPattern(variable, expression, numerator_shift, denominator_shift)
