from __future__ import annotations

from dataclasses import dataclass
from fractions import Fraction
from typing import Any

from .contract import canonical_hash
from .logic import same as same_logic, substitute_expr, substitute_prop
from .symbolic import equivalent_expr, exact_rational_value, expr_to_sympy, structurally_negative, structurally_nonzero, structurally_positive


@dataclass(frozen=True)
class ConjugateLimitPattern:
    variable: str
    root: dict[str, Any]
    point: dict[str, Any]
    target: dict[str, Any]


@dataclass(frozen=True)
class PiecewiseJumpPattern:
    variable: str
    point: dict[str, Any]
    left_value: dict[str, Any]
    right_value: dict[str, Any]


@dataclass(frozen=True)
class IVTExistencePattern:
    variable: str
    lower: dict[str, Any]
    upper: dict[str, Any]
    expression: dict[str, Any]
    target: dict[str, Any]
    reverse_values: bool = False


@dataclass(frozen=True)
class PolynomialDerivativePattern:
    variable: str
    expression: dict[str, Any]
    point: dict[str, Any]
    result: dict[str, Any]
    derivative_at_point: dict[str, Any]


@dataclass(frozen=True)
class QuotientDerivativePattern:
    variable: str
    numerator: dict[str, Any]
    denominator: dict[str, Any]
    point: dict[str, Any]
    result: dict[str, Any]
    numerator_derivative: dict[str, Any]
    denominator_derivative: dict[str, Any]
    denominator_at_point: dict[str, Any]
    derivative_at_point: dict[str, Any]


@dataclass(frozen=True)
class SqrtDerivativePattern:
    variable: str
    radicand: dict[str, Any]
    point: dict[str, Any]
    result: dict[str, Any]
    radicand_derivative: dict[str, Any]
    radicand_at_point: dict[str, Any]
    derivative_at_point: dict[str, Any]


@dataclass(frozen=True)
class ElementaryDerivativePattern:
    function: str
    variable: str
    argument: dict[str, Any]
    point: dict[str, Any]
    result: dict[str, Any]
    argument_derivative: dict[str, Any]
    argument_at_point: dict[str, Any]
    derivative_at_point: dict[str, Any]


@dataclass(frozen=True)
class AbsDerivativePattern:
    variable: str
    argument: dict[str, Any]
    point: dict[str, Any]
    result: dict[str, Any]
    argument_derivative: dict[str, Any]
    argument_at_point: dict[str, Any]
    positive_derivative_at_point: dict[str, Any]
    negative_derivative_at_point: dict[str, Any]
    matches_positive: bool
    matches_negative: bool


@dataclass(frozen=True)
class DerivativeGuard:
    """One pointwise side condition required by a recursive derivative plan.

    ``relation`` is intentionally one of ``nonzero``, ``positive`` or
    ``negative`` so the same data can drive preflight, proof search, and Lean
    reconstruction without re-inferring domain semantics in each layer.
    """

    relation: str
    expression: dict[str, Any]
    claim: dict[str, Any]
    code: str
    message: str


@dataclass(frozen=True)
class RecursiveDerivativePattern:
    variable: str
    expression: dict[str, Any]
    point: dict[str, Any]
    result: dict[str, Any]
    derivative_at_point: dict[str, Any]
    guards: tuple[DerivativeGuard, ...]


@dataclass(frozen=True)
class ContinuityGuard:
    """One school-domain side condition required for continuity.

    These guards are deliberately pointwise. For interval continuity, the
    planner is instantiated at the interval binder itself, so only guards
    that Lean can prove uniformly (for example ``0 < exp x`` or
    ``x^2 + 1 != 0``) are auto-advertised by the IVT rule.
    """

    relation: str
    expression: dict[str, Any]
    claim: dict[str, Any]
    code: str
    message: str


@dataclass(frozen=True)
class ContinuityPattern:
    variable: str
    expression: dict[str, Any]
    point: dict[str, Any]
    value_at_point: dict[str, Any]
    guards: tuple[ContinuityGuard, ...]


@dataclass(frozen=True)
class ContinuousIVTExistencePattern:
    variable: str
    lower: dict[str, Any]
    upper: dict[str, Any]
    expression: dict[str, Any]
    target: dict[str, Any]
    target_on_right: bool
    guards: tuple[ContinuityGuard, ...]
    forward_brackets: tuple[dict[str, Any], dict[str, Any]]
    reverse_brackets: tuple[dict[str, Any], dict[str, Any]]


@dataclass(frozen=True)
class IntervalGuardEvidence:
    """A universally quantified interval fact that can discharge one guard.

    ``conversion`` records the tiny trusted logical bridge needed after
    instantiation.  The proposition itself is still supplied as an ordinary
    proof premise and Lean performs the instantiation/conversion.
    """

    claim: dict[str, Any]
    conversion: str = "exact"


def _same(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return canonical_hash(left) == canonical_hash(right)


def _calculus_equivalent(left: dict[str, Any], right: dict[str, Any]) -> bool:
    """Compare derivative-value expressions as a candidate check, never as proof.

    SymPy is allowed to normalize commutative arithmetic around elementary
    functions here because the resulting candidate is reconstructed as an exact
    ``HasDerivAt`` term and kernel-checked before certification.
    """
    names = _variable_ids(left) | _variable_ids(right)
    try:
        import sympy as sp

        symbols = {name: sp.Symbol(name, real=True) for name in names}
        a = expr_to_sympy(left, symbols)
        b = expr_to_sympy(right, symbols)
        return sp.simplify(sp.together(a - b)) == 0
    except Exception:
        return _same(left, right)


def _number(expr: dict[str, Any]) -> Fraction | None:
    kind = expr.get("kind")
    if kind == "int":
        return Fraction(int(expr["value"]), 1)
    if kind == "rat":
        return Fraction(int(expr["numerator"]), int(expr["denominator"]))
    if kind == "neg":
        value = _number(expr.get("arg", {}))
        return -value if value is not None else None
    return None


def _var(identifier: str) -> dict[str, Any]:
    return {"kind": "var", "id": identifier}


def _zero() -> dict[str, Any]:
    return {"kind": "int", "value": 0}


def _one() -> dict[str, Any]:
    return {"kind": "int", "value": 1}


def _int(value: int) -> dict[str, Any]:
    return {"kind": "int", "value": value}


def _neg(expr: dict[str, Any]) -> dict[str, Any]:
    if expr == _zero():
        return _zero()
    if expr.get("kind") == "int":
        return _int(-int(expr["value"]))
    return {"kind": "neg", "arg": expr}


def _add(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    if left == _zero():
        return right
    if right == _zero():
        return left
    return {"kind": "add", "left": left, "right": right}


def _sub(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    if right == _zero():
        return left
    if left == _zero():
        return _neg(right)
    return {"kind": "sub", "left": left, "right": right}


def _mul(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    if left == _zero() or right == _zero():
        return _zero()
    if left == _one():
        return right
    if right == _one():
        return left
    return {"kind": "mul", "left": left, "right": right}


def _pow(base: dict[str, Any], exponent: int) -> dict[str, Any]:
    if exponent == 0:
        return _one()
    if exponent == 1:
        return base
    return {"kind": "pow", "base": base, "exponent": exponent}


def polynomial_derivative(expr: dict[str, Any], variable: str) -> dict[str, Any] | None:
    """Differentiate the exact polynomial fragment used by the first derivative rule.

    Other declared variables are treated as constants. Division, radicals,
    absolute values, piecewise expressions and function applications are
    deliberately rejected here because their differentiability/domain
    hypotheses need separate curated rules.
    """
    kind = expr.get("kind")
    if kind in {"int", "rat"}:
        return _zero()
    if kind == "var":
        return _one() if expr.get("id") == variable else _zero()
    if kind == "neg":
        inner = polynomial_derivative(expr.get("arg", {}), variable)
        return _neg(inner) if inner is not None else None
    if kind in {"add", "sub", "mul"}:
        left = expr.get("left", {})
        right = expr.get("right", {})
        dleft = polynomial_derivative(left, variable)
        dright = polynomial_derivative(right, variable)
        if dleft is None or dright is None:
            return None
        if kind == "add":
            return _add(dleft, dright)
        if kind == "sub":
            return _sub(dleft, dright)
        return _add(_mul(dleft, right), _mul(left, dright))
    if kind == "pow":
        exponent = expr.get("exponent")
        base = expr.get("base", {})
        if not isinstance(exponent, int) or exponent < 0:
            return None
        dbase = polynomial_derivative(base, variable)
        if dbase is None:
            return None
        if exponent == 0:
            return _zero()
        return _mul(_mul(_int(exponent), _pow(base, exponent - 1)), dbase)
    return None


def _variable_ids(expr: dict[str, Any]) -> set[str]:
    kind = expr.get("kind")
    if kind == "var":
        return {expr["id"]}
    if kind in {"int", "rat"}:
        return set()
    if kind in {"neg", "factorial", "sqrt", "abs", "exp", "log", "sin", "cos"}:
        return _variable_ids(expr.get("arg", {}))
    if kind == "pow":
        return _variable_ids(expr.get("base", {}))
    if kind == "apply":
        return _variable_ids(expr.get("function", {})) | _variable_ids(expr.get("arg", {}))
    if kind == "if":
        return _variable_ids(expr.get("then", {})) | _variable_ids(expr.get("else", {}))
    if kind in {"add", "sub", "mul", "div"}:
        return _variable_ids(expr.get("left", {})) | _variable_ids(expr.get("right", {}))
    return set()


def match_polynomial_derivative(goal: dict[str, Any]) -> PolynomialDerivativePattern | None:
    """Recognize an exact real polynomial derivative-at-a-point statement."""
    if goal.get("kind") != "derivative":
        return None
    variable = goal.get("variable")
    if not isinstance(variable, str):
        return None
    derivative = polynomial_derivative(goal.get("expression", {}), variable)
    if derivative is None:
        return None
    at_point = substitute_expr(derivative, variable, goal.get("point", {}))
    names = _variable_ids(at_point) | _variable_ids(goal.get("result", {}))
    try:
        import sympy as sp

        symbols = {name: sp.Symbol(name, real=True) for name in names}
        if not equivalent_expr(at_point, goal.get("result", {}), symbols):
            return None
    except Exception:
        if not _same(at_point, goal.get("result", {})):
            return None
    return PolynomialDerivativePattern(
        variable,
        goal["expression"],
        goal["point"],
        goal["result"],
        at_point,
    )


def match_quotient_derivative(goal: dict[str, Any]) -> QuotientDerivativePattern | None:
    """Recognize a quotient of two real polynomials differentiated at a point.

    Soundness still requires a separate proof that the denominator is nonzero
    at the evaluation point.  The matcher checks only the exact quotient-rule
    formula; preflight and Lean rendering enforce the side condition.
    """
    if goal.get("kind") != "derivative":
        return None
    variable = goal.get("variable")
    expression = goal.get("expression", {})
    if not isinstance(variable, str) or expression.get("kind") != "div":
        return None
    numerator = expression.get("left", {})
    denominator = expression.get("right", {})
    dnum = polynomial_derivative(numerator, variable)
    dden = polynomial_derivative(denominator, variable)
    if dnum is None or dden is None:
        return None
    point = goal.get("point", {})
    numerator_at = substitute_expr(numerator, variable, point)
    denominator_at = substitute_expr(denominator, variable, point)
    dnum_at = substitute_expr(dnum, variable, point)
    dden_at = substitute_expr(dden, variable, point)
    expected = {
        "kind": "div",
        "left": _sub(_mul(dnum_at, denominator_at), _mul(numerator_at, dden_at)),
        "right": _pow(denominator_at, 2),
    }
    names = _variable_ids(expected) | _variable_ids(goal.get("result", {}))
    try:
        import sympy as sp

        symbols = {name: sp.Symbol(name, real=True) for name in names}
        if not equivalent_expr(expected, goal.get("result", {}), symbols):
            return None
    except Exception:
        if not _same(expected, goal.get("result", {})):
            return None
    return QuotientDerivativePattern(
        variable, numerator, denominator, point, goal["result"],
        dnum, dden, denominator_at, expected,
    )


def quotient_denominator_is_exact_nonzero(pattern: QuotientDerivativePattern) -> bool:
    value = exact_rational_value(pattern.denominator_at_point)
    return value is not None and value != 0


def sqrt_radicand_is_exact_positive(pattern: SqrtDerivativePattern) -> bool:
    value = exact_rational_value(pattern.radicand_at_point)
    return value is not None and value > 0


def match_sqrt_derivative(goal: dict[str, Any]) -> SqrtDerivativePattern | None:
    """Recognize sqrt(p(x)) where p is polynomial and the derivative formula matches.

    This matcher deliberately does *not* decide the school-domain side condition.
    Preflight requires p(a) > 0, which is stronger than mathlib's total-real
    sqrt nonzero requirement and matches the intended classroom semantics.
    """
    if goal.get("kind") != "derivative":
        return None
    variable = goal.get("variable")
    expression = goal.get("expression", {})
    if not isinstance(variable, str) or expression.get("kind") != "sqrt":
        return None
    radicand = expression.get("arg", {})
    derivative = polynomial_derivative(radicand, variable)
    if derivative is None:
        return None
    point = goal.get("point", {})
    radicand_at = substitute_expr(radicand, variable, point)
    derivative_at = substitute_expr(derivative, variable, point)
    expected = {
        "kind": "div",
        "left": derivative_at,
        "right": {"kind": "mul", "left": _int(2), "right": {"kind": "sqrt", "arg": radicand_at}},
    }
    names = _variable_ids(expected) | _variable_ids(goal.get("result", {}))
    try:
        import sympy as sp

        symbols = {name: sp.Symbol(name, real=True) for name in names}
        if not equivalent_expr(expected, goal.get("result", {}), symbols):
            return None
    except Exception:
        if not _same(expected, goal.get("result", {})):
            return None
    return SqrtDerivativePattern(
        variable, radicand, point, goal["result"], derivative, radicand_at, expected
    )


def match_elementary_derivative(goal: dict[str, Any]) -> ElementaryDerivativePattern | None:
    """Recognize exp/log/sin/cos of a polynomial inner expression at a point.

    The rule is intentionally limited to polynomial inner functions for this
    checkpoint.  ``log`` domain evidence is handled separately by preflight;
    the matcher only checks the chain-rule derivative formula.
    """
    if goal.get("kind") != "derivative":
        return None
    variable = goal.get("variable")
    expression = goal.get("expression", {})
    function = expression.get("kind")
    if not isinstance(variable, str) or function not in {"exp", "log", "sin", "cos"}:
        return None
    argument = expression.get("arg", {})
    derivative = polynomial_derivative(argument, variable)
    if derivative is None:
        return None
    point = goal.get("point", {})
    argument_at = substitute_expr(argument, variable, point)
    derivative_at = substitute_expr(derivative, variable, point)
    if function == "exp":
        expected = _mul({"kind": "exp", "arg": argument_at}, derivative_at)
    elif function == "log":
        expected = {"kind": "div", "left": derivative_at, "right": argument_at}
    elif function == "sin":
        expected = _mul({"kind": "cos", "arg": argument_at}, derivative_at)
    else:
        expected = _mul(_neg({"kind": "sin", "arg": argument_at}), derivative_at)
    if not _calculus_equivalent(expected, goal.get("result", {})):
        return None
    return ElementaryDerivativePattern(
        function, variable, argument, point, goal["result"], derivative, argument_at, expected
    )


def elementary_argument_is_exact_positive(pattern: ElementaryDerivativePattern) -> bool:
    value = exact_rational_value(pattern.argument_at_point)
    return value is not None and value > 0


def match_abs_derivative(goal: dict[str, Any]) -> AbsDerivativePattern | None:
    """Recognize ``|p(x)|`` away from the kink, with explicit sign semantics.

    The candidate result determines which branch formula could apply.  Preflight
    then requires a strict positive/negative fact at the evaluation point (or
    exact rational arithmetic that reconstructs such a fact in Lean).
    """
    if goal.get("kind") != "derivative":
        return None
    variable = goal.get("variable")
    expression = goal.get("expression", {})
    if not isinstance(variable, str) or expression.get("kind") != "abs":
        return None
    argument = expression.get("arg", {})
    derivative = polynomial_derivative(argument, variable)
    if derivative is None:
        return None
    point = goal.get("point", {})
    argument_at = substitute_expr(argument, variable, point)
    derivative_at = substitute_expr(derivative, variable, point)
    positive_result = derivative_at
    negative_result = _neg(derivative_at)
    matches_positive = _calculus_equivalent(positive_result, goal.get("result", {}))
    matches_negative = _calculus_equivalent(negative_result, goal.get("result", {}))
    if not (matches_positive or matches_negative):
        return None
    return AbsDerivativePattern(
        variable, argument, point, goal["result"], derivative, argument_at,
        positive_result, negative_result, matches_positive, matches_negative,
    )


def abs_argument_exact_sign(pattern: AbsDerivativePattern) -> str | None:
    value = exact_rational_value(pattern.argument_at_point)
    if value is None or value == 0:
        return None
    return "positive" if value > 0 else "negative"


def _guard(relation: str, expression: dict[str, Any]) -> DerivativeGuard:
    if relation == "nonzero":
        claim = {"kind": "ne", "left": expression, "right": _zero()}
        code = "recursive_derivative_nonzero"
        message = "Recursive quotient differentiation needs the denominator to be nonzero at the evaluation point."
    elif relation == "positive":
        claim = {"kind": "lt", "left": _zero(), "right": expression}
        code = "recursive_derivative_positive"
        message = "This recursive derivative branch needs the expression to be strictly positive at the evaluation point."
    elif relation == "negative":
        claim = {"kind": "lt", "left": expression, "right": _zero()}
        code = "recursive_derivative_negative"
        message = "This recursive absolute-value branch needs the inner expression to be strictly negative at the evaluation point."
    else:
        raise ValueError(f"unsupported derivative guard relation {relation!r}")
    return DerivativeGuard(relation, expression, claim, code, message)


def derivative_guard_exact_status(guard: DerivativeGuard) -> bool | None:
    """Return True/False for exact rational guards, else None.

    This is only a planning/preflight decision.  A satisfied exact guard is
    reconstructed as a ``norm_num`` proof in Lean before certification.
    """
    value = exact_rational_value(guard.expression)
    if value is None:
        return None
    if guard.relation == "nonzero":
        return value != 0
    if guard.relation == "positive":
        return value > 0
    if guard.relation == "negative":
        return value < 0
    return None


def derivative_guard_auto_tactic(guard: DerivativeGuard) -> str | None:
    """Return a conservative Lean tactic for an automatically provable guard.

    Exact rational guards use ``norm_num``.  A small syntax-only class of
    universally signed expressions uses ``positivity``.  Anything else must be
    supplied as explicit proof evidence.
    """
    exact = derivative_guard_exact_status(guard)
    if exact is True:
        return "norm_num"
    if exact is False:
        return None
    if guard.relation == "positive" and structurally_positive(guard.expression):
        return "positivity"
    if guard.relation == "negative" and structurally_negative(guard.expression):
        return "positivity"
    if guard.relation == "nonzero" and structurally_nonzero(guard.expression):
        return "positivity"
    return None


def _merge_derivative_guards(*groups: tuple[DerivativeGuard, ...]) -> tuple[DerivativeGuard, ...]:
    seen: set[str] = set()
    result: list[DerivativeGuard] = []
    for group in groups:
        for guard in group:
            key = canonical_hash(guard.claim)
            if key not in seen:
                seen.add(key)
                result.append(guard)
    return tuple(result)


def _recursive_derivative_plans(
    expr: dict[str, Any], variable: str, point: dict[str, Any], *, max_plans: int = 32
) -> list[tuple[dict[str, Any], tuple[DerivativeGuard, ...]]]:
    """Differentiate a compositional expression at one point.

    The result is deliberately a list because ``abs`` has two locally valid
    branches.  We cap the branch count so a deeply nested absolute-value
    expression cannot explode proof search.  Unsupported constructs (piecewise
    and arbitrary function application) return no plans.
    """
    kind = expr.get("kind")

    if kind in {"int", "rat"}:
        return [(_zero(), ())]
    if kind == "var":
        return [(_one() if expr.get("id") == variable else _zero(), ())]
    if kind == "neg":
        return [(_neg(d), guards) for d, guards in _recursive_derivative_plans(expr.get("arg", {}), variable, point, max_plans=max_plans)]

    if kind in {"add", "sub", "mul", "div"}:
        left = expr.get("left", {})
        right = expr.get("right", {})
        left_at = substitute_expr(left, variable, point)
        right_at = substitute_expr(right, variable, point)
        left_plans = _recursive_derivative_plans(left, variable, point, max_plans=max_plans)
        right_plans = _recursive_derivative_plans(right, variable, point, max_plans=max_plans)
        plans: list[tuple[dict[str, Any], tuple[DerivativeGuard, ...]]] = []
        for dleft, left_guards in left_plans:
            for dright, right_guards in right_plans:
                guards = _merge_derivative_guards(left_guards, right_guards)
                if kind == "add":
                    derivative = _add(dleft, dright)
                elif kind == "sub":
                    derivative = _sub(dleft, dright)
                elif kind == "mul":
                    derivative = _add(_mul(dleft, right_at), _mul(left_at, dright))
                else:
                    derivative = {
                        "kind": "div",
                        "left": _sub(_mul(dleft, right_at), _mul(left_at, dright)),
                        "right": _pow(right_at, 2),
                    }
                    guards = _merge_derivative_guards(guards, (_guard("nonzero", right_at),))
                plans.append((derivative, guards))
                if len(plans) >= max_plans:
                    return plans
        return plans

    if kind == "pow":
        exponent = expr.get("exponent")
        if not isinstance(exponent, int) or exponent < 0:
            return []
        base = expr.get("base", {})
        base_at = substitute_expr(base, variable, point)
        plans = _recursive_derivative_plans(base, variable, point, max_plans=max_plans)
        if exponent == 0:
            return [(_zero(), guards) for _, guards in plans]
        return [(_mul(_mul(_int(exponent), _pow(base_at, exponent - 1)), dbase), guards) for dbase, guards in plans]

    if kind in {"sqrt", "abs", "exp", "log", "sin", "cos"}:
        arg = expr.get("arg", {})
        arg_at = substitute_expr(arg, variable, point)
        inner_plans = _recursive_derivative_plans(arg, variable, point, max_plans=max_plans)
        plans: list[tuple[dict[str, Any], tuple[DerivativeGuard, ...]]] = []
        for darg, inner_guards in inner_plans:
            if kind == "sqrt":
                derivative = {
                    "kind": "div",
                    "left": darg,
                    "right": _mul(_int(2), {"kind": "sqrt", "arg": arg_at}),
                }
                plans.append((derivative, _merge_derivative_guards(inner_guards, (_guard("positive", arg_at),))))
            elif kind == "exp":
                plans.append((_mul({"kind": "exp", "arg": arg_at}, darg), inner_guards))
            elif kind == "log":
                derivative = {"kind": "div", "left": darg, "right": arg_at}
                plans.append((derivative, _merge_derivative_guards(inner_guards, (_guard("positive", arg_at),))))
            elif kind == "sin":
                plans.append((_mul({"kind": "cos", "arg": arg_at}, darg), inner_guards))
            elif kind == "cos":
                plans.append((_mul(_neg({"kind": "sin", "arg": arg_at}), darg), inner_guards))
            else:
                plans.append((darg, _merge_derivative_guards(inner_guards, (_guard("positive", arg_at),))))
                if len(plans) < max_plans:
                    plans.append((_neg(darg), _merge_derivative_guards(inner_guards, (_guard("negative", arg_at),))))
            if len(plans) >= max_plans:
                return plans[:max_plans]
        return plans[:max_plans]

    return []


def match_recursive_derivative(goal: dict[str, Any], *, max_plans: int = 32) -> list[RecursiveDerivativePattern]:
    """Return recursive derivative plans whose value matches the claimed result.

    SymPy equivalence remains candidate selection only; every returned plan is
    later reconstructed structurally as a ``HasDerivAt`` proof and kernel
    checked.
    """
    if goal.get("kind") != "derivative":
        return []
    variable = goal.get("variable")
    if not isinstance(variable, str):
        return []
    expression = goal.get("expression", {})
    point = goal.get("point", {})
    result = goal.get("result", {})
    matches: list[RecursiveDerivativePattern] = []
    for derivative, guards in _recursive_derivative_plans(expression, variable, point, max_plans=max_plans):
        if _calculus_equivalent(derivative, result):
            matches.append(RecursiveDerivativePattern(variable, expression, point, result, derivative, guards))
    return matches


def recursive_derivative_pattern_status(
    pattern: RecursiveDerivativePattern, available_claims: list[dict[str, Any]] | tuple[dict[str, Any], ...] = ()
) -> tuple[list[DerivativeGuard], list[DerivativeGuard]]:
    """Return ``(missing, violated)`` guards for one recursive plan.

    ``available_claims`` contains bare propositions from cited premises. Exact
    rational guards are decided only for planning; successful exact guards are
    still reconstructed with ``norm_num`` in the generated Lean artifact.
    """
    available = {canonical_hash(item) for item in available_claims}
    missing: list[DerivativeGuard] = []
    violated: list[DerivativeGuard] = []
    for guard in pattern.guards:
        status = derivative_guard_exact_status(guard)
        if status is False:
            violated.append(guard)
            continue
        if derivative_guard_auto_tactic(guard) is not None:
            continue
        if canonical_hash(guard.claim) not in available:
            missing.append(guard)
    return missing, violated


def select_recursive_derivative_pattern(
    patterns: list[RecursiveDerivativePattern],
    available_claims: list[dict[str, Any]] | tuple[dict[str, Any], ...] = (),
) -> tuple[RecursiveDerivativePattern | None, list[DerivativeGuard], list[DerivativeGuard]]:
    if not patterns:
        return None, [], []
    ranked: list[tuple[tuple[int, int, int], RecursiveDerivativePattern, list[DerivativeGuard], list[DerivativeGuard]]] = []
    for pattern in patterns:
        missing, violated = recursive_derivative_pattern_status(pattern, available_claims)
        ranked.append(((1 if violated else 0, len(missing), len(pattern.guards)), pattern, missing, violated))
    _, pattern, missing, violated = min(ranked, key=lambda row: row[0])
    return pattern, missing, violated



def _continuity_guard(relation: str, expression: dict[str, Any]) -> ContinuityGuard:
    if relation == "nonzero":
        claim = {"kind": "ne", "left": expression, "right": _zero()}
        code = "continuity_nonzero"
        message = "Continuity of a quotient needs the denominator to be nonzero at this point."
    elif relation == "positive":
        claim = {"kind": "lt", "left": _zero(), "right": expression}
        code = "continuity_positive"
        message = "School-real logarithm continuity needs a strictly positive argument at this point."
    elif relation == "nonnegative":
        claim = {"kind": "le", "left": _zero(), "right": expression}
        code = "continuity_nonnegative"
        message = "School-real square-root continuity needs a nonnegative radicand at this point."
    else:
        raise ValueError(f"unsupported continuity guard relation {relation!r}")
    return ContinuityGuard(relation, expression, claim, code, message)


def continuity_guard_exact_status(guard: ContinuityGuard) -> bool | None:
    value = exact_rational_value(guard.expression)
    if value is None:
        return None
    if guard.relation == "nonzero":
        return value != 0
    if guard.relation == "positive":
        return value > 0
    if guard.relation == "nonnegative":
        return value >= 0
    return None


def continuity_guard_auto_tactic(guard: ContinuityGuard) -> str | None:
    """Return a conservative Lean tactic for a continuity side condition."""
    exact = continuity_guard_exact_status(guard)
    if exact is True:
        return "norm_num"
    if exact is False:
        return None
    if guard.relation == "positive" and structurally_positive(guard.expression):
        return "positivity"
    if guard.relation == "nonnegative" and structurally_nonnegative(guard.expression):
        return "positivity"
    if guard.relation == "nonzero" and structurally_nonzero(guard.expression):
        return "positivity"
    return None


def _merge_continuity_guards(*groups: tuple[ContinuityGuard, ...]) -> tuple[ContinuityGuard, ...]:
    seen: set[str] = set()
    result: list[ContinuityGuard] = []
    for group in groups:
        for guard in group:
            key = canonical_hash(guard.claim)
            if key not in seen:
                seen.add(key)
                result.append(guard)
    return tuple(result)


def continuity_plan(
    expression: dict[str, Any], variable: str, point: dict[str, Any]
) -> ContinuityPattern | None:
    """Build a bounded structural continuity plan at one real point.

    The plan is intentionally independent from derivative planning: absolute
    value is continuous at its kink, and square-root continuity needs only the
    school-domain nonnegative guard. Arbitrary function application and
    piecewise branches remain outside this first continuity engine.
    """

    def walk(expr: dict[str, Any]) -> tuple[ContinuityGuard, ...] | None:
        kind = expr.get("kind")
        if kind in {"int", "rat", "var"}:
            return ()
        if kind in {"neg", "factorial", "abs", "exp", "sin", "cos"}:
            return walk(expr.get("arg", {}))
        if kind == "pow":
            return walk(expr.get("base", {}))
        if kind in {"add", "sub", "mul", "div"}:
            left = walk(expr.get("left", {}))
            right = walk(expr.get("right", {}))
            if left is None or right is None:
                return None
            guards = _merge_continuity_guards(left, right)
            if kind == "div":
                denominator_at = substitute_expr(expr.get("right", {}), variable, point)
                guards = _merge_continuity_guards(
                    guards, (_continuity_guard("nonzero", denominator_at),)
                )
            return guards
        if kind in {"sqrt", "log"}:
            inner = walk(expr.get("arg", {}))
            if inner is None:
                return None
            argument_at = substitute_expr(expr.get("arg", {}), variable, point)
            relation = "nonnegative" if kind == "sqrt" else "positive"
            return _merge_continuity_guards(
                inner, (_continuity_guard(relation, argument_at),)
            )
        return None

    guards = walk(expression)
    if guards is None:
        return None
    return ContinuityPattern(
        variable=variable,
        expression=expression,
        point=point,
        value_at_point=substitute_expr(expression, variable, point),
        guards=guards,
    )


def continuity_pattern_status(
    pattern: ContinuityPattern,
    available_claims: list[dict[str, Any]] | tuple[dict[str, Any], ...] = (),
) -> tuple[list[ContinuityGuard], list[ContinuityGuard]]:
    available = {canonical_hash(item) for item in available_claims}
    missing: list[ContinuityGuard] = []
    violated: list[ContinuityGuard] = []
    for guard in pattern.guards:
        exact = continuity_guard_exact_status(guard)
        if exact is False:
            violated.append(guard)
            continue
        if continuity_guard_auto_tactic(guard) is not None:
            continue
        if canonical_hash(guard.claim) not in available:
            missing.append(guard)
    return missing, violated


def match_continuity_limit(goal: dict[str, Any]) -> ContinuityPattern | None:
    """Recognize finite limits that follow from continuity at the approach point."""
    if goal.get("kind") != "limit" or goal.get("result", {}).get("kind") != "finite":
        return None
    variable = goal.get("variable")
    if not isinstance(variable, str):
        return None
    pattern = continuity_plan(goal.get("expression", {}), variable, goal.get("point", {}))
    if pattern is None:
        return None
    if not _calculus_equivalent(pattern.value_at_point, goal["result"].get("value", {})):
        return None
    return pattern


def _extract_ivt_shape(goal: dict[str, Any]) -> tuple[str, dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], bool] | None:
    if goal.get("kind") != "proposition":
        return None
    proposition = goal.get("proposition", {})
    if proposition.get("kind") != "exists":
        return None
    binder = proposition.get("binder", {})
    variable = binder.get("id")
    if binder.get("type") != "real" or not isinstance(variable, str):
        return None
    body = proposition.get("body", {})
    if body.get("kind") != "and":
        return None
    lower_rel = body.get("left", {})
    tail = body.get("right", {})
    if lower_rel.get("kind") != "le" or tail.get("kind") != "and":
        return None
    upper_rel = tail.get("left", {})
    equation = tail.get("right", {})
    if upper_rel.get("kind") != "le" or equation.get("kind") != "eq":
        return None
    var = _var(variable)
    if not (_same(lower_rel.get("right", {}), var) and _same(upper_rel.get("left", {}), var)):
        return None
    lower = lower_rel.get("left", {})
    upper = upper_rel.get("right", {})
    lower_value = _number(lower)
    upper_value = _number(upper)
    if lower_value is None or upper_value is None or lower_value > upper_value:
        return None

    left, right = equation.get("left", {}), equation.get("right", {})
    if variable not in _variable_ids(left) and variable in _variable_ids(right):
        target, expression, target_on_right = left, right, False
    elif variable in _variable_ids(left) and variable not in _variable_ids(right):
        expression, target, target_on_right = left, right, True
    else:
        return None
    return variable, lower, upper, expression, target, target_on_right


def _relation_auto_tactic(prop: dict[str, Any]) -> str | None:
    kind = prop.get("kind")
    if kind not in {"eq", "ne", "lt", "le", "gt", "ge"}:
        return None
    left = exact_rational_value(prop.get("left", {}))
    right = exact_rational_value(prop.get("right", {}))
    if left is not None and right is not None:
        truth = {
            "eq": left == right,
            "ne": left != right,
            "lt": left < right,
            "le": left <= right,
            "gt": left > right,
            "ge": left >= right,
        }[kind]
        return "norm_num" if truth else None
    zero = _zero()
    if kind in {"le", "lt"} and prop.get("left") == zero:
        expr = prop.get("right", {})
        if kind == "le" and structurally_nonnegative(expr):
            return "positivity"
        if kind == "lt" and structurally_positive(expr):
            return "positivity"
    if kind in {"ge", "gt"} and prop.get("right") == zero:
        expr = prop.get("left", {})
        if kind == "ge" and structurally_nonnegative(expr):
            return "positivity"
        if kind == "gt" and structurally_positive(expr):
            return "positivity"
    return None


def _interval_membership_claim(variable: dict[str, Any], lower: dict[str, Any], upper: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "and",
        "left": {"kind": "le", "left": lower, "right": variable},
        "right": {"kind": "le", "left": variable, "right": upper},
    }


def interval_guard_evidence_candidates(
    pattern: ContinuousIVTExistencePattern, guard: ContinuityGuard, *, binder_id: str = "interval_x"
) -> tuple[IntervalGuardEvidence, ...]:
    """Return exact/stronger quantified facts accepted for an interval guard.

    The canonical authoring shape is::

        forall t:real, ((a <= t) and (t <= b)) implies GUARD(t)

    Binder names are alpha-normalized by ``same_logic`` so authored names do
    not need to match ``binder_id``.  A strict positive interval fact may also
    discharge nonzero/nonnegative guards through explicit Lean conversions.
    """
    point = _var(binder_id)
    interval = _interval_membership_claim(point, pattern.lower, pattern.upper)
    exact_guard = substitute_prop(guard.claim, pattern.variable, point)

    def quantified(conclusion: dict[str, Any], conversion: str) -> IntervalGuardEvidence:
        return IntervalGuardEvidence(
            {
                "kind": "forall",
                "binder": {"id": binder_id, "type": "real"},
                "body": {"kind": "implies", "left": interval, "right": conclusion},
            },
            conversion,
        )

    candidates = [quantified(exact_guard, "exact")]
    expression = substitute_expr(guard.expression, pattern.variable, point)
    if guard.relation == "nonzero":
        candidates.append(
            quantified({"kind": "lt", "left": _zero(), "right": expression}, "positive_to_nonzero")
        )
        candidates.append(
            quantified({"kind": "lt", "left": expression, "right": _zero()}, "negative_to_nonzero")
        )
    elif guard.relation == "nonnegative":
        candidates.append(
            quantified({"kind": "lt", "left": _zero(), "right": expression}, "positive_to_nonnegative")
        )
    return tuple(candidates)


def match_interval_guard_evidence(
    pattern: ContinuousIVTExistencePattern,
    guard: ContinuityGuard,
    proposition: dict[str, Any],
) -> IntervalGuardEvidence | None:
    for candidate in interval_guard_evidence_candidates(pattern, guard):
        if same_logic(candidate.claim, proposition):
            return candidate
    return None


def continuous_ivt_guard_status(
    pattern: ContinuousIVTExistencePattern,
    available_claims: list[dict[str, Any]] | tuple[dict[str, Any], ...] = (),
) -> tuple[list[ContinuityGuard], list[ContinuityGuard]]:
    """Return missing and pointwise-impossible interval continuity guards."""
    missing: list[ContinuityGuard] = []
    violated: list[ContinuityGuard] = []
    for guard in pattern.guards:
        exact = continuity_guard_exact_status(guard)
        if exact is False:
            violated.append(guard)
            continue
        if continuity_guard_auto_tactic(guard) is not None:
            continue
        if any(match_interval_guard_evidence(pattern, guard, prop) is not None for prop in available_claims):
            continue
        missing.append(guard)
    return missing, violated


def interval_guard_expected_claim(
    pattern: ContinuousIVTExistencePattern, guard: ContinuityGuard
) -> dict[str, Any]:
    """Canonical quantified claim shown when interval evidence is missing."""
    return interval_guard_evidence_candidates(pattern, guard)[0].claim


def match_continuous_ivt_existence(goal: dict[str, Any]) -> ContinuousIVTExistencePattern | None:
    """Recognize IVT existence goals for a structurally continuous expression.

    Unlike the older polynomial-only rule, endpoint bracketing and interval-wide
    school-domain guards may be supplied as explicit premises. Syntax-obvious
    guards can still be delegated to Lean via ``positivity``/``norm_num``.
    """
    extracted = _extract_ivt_shape(goal)
    if extracted is None:
        return None
    variable, lower, upper, expression, target, target_on_right = extracted
    symbolic_point = _var(variable)
    continuity = continuity_plan(expression, variable, symbolic_point)
    if continuity is None:
        return None
    lower_image = substitute_expr(expression, variable, lower)
    upper_image = substitute_expr(expression, variable, upper)
    forward = (
        {"kind": "le", "left": lower_image, "right": target},
        {"kind": "le", "left": target, "right": upper_image},
    )
    reverse = (
        {"kind": "le", "left": upper_image, "right": target},
        {"kind": "le", "left": target, "right": lower_image},
    )
    return ContinuousIVTExistencePattern(
        variable, lower, upper, expression, target, target_on_right,
        continuity.guards, forward, reverse,
    )


def select_continuous_ivt_orientation(
    pattern: ContinuousIVTExistencePattern,
    available_claims: list[dict[str, Any]] | tuple[dict[str, Any], ...] = (),
) -> tuple[str | None, list[dict[str, Any]]]:
    available = {canonical_hash(item) for item in available_claims}
    ranked: list[tuple[int, str, list[dict[str, Any]]]] = []
    for name, brackets in (("forward", pattern.forward_brackets), ("reverse", pattern.reverse_brackets)):
        missing = [
            prop for prop in brackets
            if _relation_auto_tactic(prop) is None and canonical_hash(prop) not in available
        ]
        ranked.append((len(missing), name, missing))
    count, name, missing = min(ranked, key=lambda row: row[0])
    return (name if count == 0 else None), missing


def ivt_bracket_auto_tactic(prop: dict[str, Any]) -> str | None:
    return _relation_auto_tactic(prop)


def _has_nonnegative_variable_domain(goal: dict[str, Any], variable: str) -> bool:
    expected = {"kind": "le", "left": _zero(), "right": _var(variable)}
    return any(_same(item, expected) for item in goal.get("domain", []))


def match_conjugate_limit(goal: dict[str, Any]) -> ConjugateLimitPattern | None:
    """Recognize the first trustworthy conjugate-hole family.

    Supported shape, over reals::

        lim x->c^2, x>=0, (sqrt x - c) / (x - c^2) = 1/(2c),  c > 0

    The recognizer is deliberately narrow.  Broader radical expressions should
    remain unsupported until their domain/branch semantics are specified.
    """
    if goal.get("kind") != "limit" or goal.get("direction") != "both":
        return None
    result = goal.get("result", {})
    if result.get("kind") != "finite":
        return None
    variable = goal.get("variable")
    if not isinstance(variable, str) or not _has_nonnegative_variable_domain(goal, variable):
        return None
    expression = goal.get("expression", {})
    if expression.get("kind") != "div":
        return None
    numerator = expression.get("left", {})
    denominator = expression.get("right", {})
    if numerator.get("kind") != "sub" or denominator.get("kind") != "sub":
        return None
    radical = numerator.get("left", {})
    root = numerator.get("right", {})
    if radical.get("kind") != "sqrt" or not _same(radical.get("arg", {}), _var(variable)):
        return None
    if not _same(denominator.get("left", {}), _var(variable)):
        return None
    point = goal.get("point", {})
    if not _same(denominator.get("right", {}), point):
        return None

    c = _number(root)
    p = _number(point)
    target = _number(result.get("value", {}))
    if c is None or p is None or target is None or c <= 0:
        return None
    if p != c * c or target != Fraction(1, 1) / (2 * c):
        return None
    return ConjugateLimitPattern(variable, root, point, result["value"])


def match_piecewise_jump(goal: dict[str, Any]) -> PiecewiseJumpPattern | None:
    """Recognize a two-sided jump with exact, unequal rational branch values."""
    if goal.get("kind") != "limit" or goal.get("direction") != "both":
        return None
    if goal.get("domain"):
        return None
    if goal.get("result", {}).get("kind") != "no_common_limit":
        return None
    variable = goal.get("variable")
    expression = goal.get("expression", {})
    if not isinstance(variable, str) or expression.get("kind") != "if":
        return None
    condition = expression.get("condition", {})
    point = goal.get("point", {})
    if not (
        condition.get("kind") == "lt"
        and _same(condition.get("left", {}), _var(variable))
        and _same(condition.get("right", {}), point)
    ):
        return None
    left = expression.get("then", {})
    right = expression.get("else", {})
    left_value = _number(left)
    right_value = _number(right)
    if left_value is None or right_value is None or left_value == right_value:
        return None
    return PiecewiseJumpPattern(variable, point, left, right)


def _poly_value(expr: dict[str, Any], variable: str, value: Fraction) -> Fraction | None:
    """Evaluate the deliberately small polynomial fragment used by the IVT rule."""
    kind = expr.get("kind")
    numeric = _number(expr)
    if numeric is not None:
        return numeric
    if kind == "var":
        return value if expr.get("id") == variable else None
    if kind == "neg":
        inner = _poly_value(expr.get("arg", {}), variable, value)
        return -inner if inner is not None else None
    if kind in {"add", "sub", "mul"}:
        left = _poly_value(expr.get("left", {}), variable, value)
        right = _poly_value(expr.get("right", {}), variable, value)
        if left is None or right is None:
            return None
        if kind == "add":
            return left + right
        if kind == "sub":
            return left - right
        return left * right
    if kind == "pow":
        base = _poly_value(expr.get("base", {}), variable, value)
        exponent = expr.get("exponent")
        if base is None or not isinstance(exponent, int) or exponent < 0:
            return None
        return base ** exponent
    return None


def match_ivt_existence(goal: dict[str, Any]) -> IVTExistencePattern | None:
    """Recognize a narrow, exact polynomial IVT existence goal.

    Supported logical shape::

        ∃ c : ℝ, a ≤ c ∧ c ≤ b ∧ p(c) = y

    where ``a``, ``b`` and ``y`` are exact rational constants, ``a ≤ b``, and
    ``p`` is a polynomial expression in ``c`` whose endpoint values bracket
    ``y``.  This makes continuity and the bracketing premise reconstructible
    in Lean without trusting an external CAS.  Uniqueness is deliberately not
    part of this rule.
    """
    if goal.get("kind") != "proposition":
        return None
    proposition = goal.get("proposition", {})
    if proposition.get("kind") != "exists":
        return None
    binder = proposition.get("binder", {})
    variable = binder.get("id")
    if binder.get("type") != "real" or not isinstance(variable, str):
        return None
    body = proposition.get("body", {})
    if body.get("kind") != "and":
        return None
    lower_rel = body.get("left", {})
    tail = body.get("right", {})
    if lower_rel.get("kind") != "le" or tail.get("kind") != "and":
        return None
    upper_rel = tail.get("left", {})
    equation = tail.get("right", {})
    if upper_rel.get("kind") != "le" or equation.get("kind") != "eq":
        return None
    var = _var(variable)
    if not (_same(lower_rel.get("right", {}), var) and _same(upper_rel.get("left", {}), var)):
        return None
    lower = lower_rel.get("left", {})
    upper = upper_rel.get("right", {})
    lower_value = _number(lower)
    upper_value = _number(upper)
    if lower_value is None or upper_value is None or lower_value > upper_value:
        return None

    left, right = equation.get("left", {}), equation.get("right", {})
    target = right
    expression = left
    target_value = _number(target)
    if target_value is None:
        target = left
        expression = right
        target_value = _number(target)
    if target_value is None:
        return None

    at_lower = _poly_value(expression, variable, lower_value)
    at_upper = _poly_value(expression, variable, upper_value)
    if at_lower is None or at_upper is None:
        return None
    if at_lower <= target_value <= at_upper:
        reverse = False
    elif at_upper <= target_value <= at_lower:
        reverse = True
    else:
        return None
    return IVTExistencePattern(variable, lower, upper, expression, target, reverse)
