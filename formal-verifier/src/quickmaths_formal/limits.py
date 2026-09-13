from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from .contract import canonical_hash
from .logic import same as same_logic
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


def _equivalent(left: dict[str, Any], right: dict[str, Any]) -> bool:
    """Candidate-only equality check. Lean still checks the rendered proof."""
    if _same(left, right):
        return True
    names = _variable_ids(left) | _variable_ids(right)
    try:
        import sympy as sp

        symbols = {name: sp.Symbol(name, real=True) for name in names}
        a = expr_to_sympy(left, symbols)
        b = expr_to_sympy(right, symbols)
        return sp.simplify(sp.together(a - b)) == 0
    except Exception:
        return _same(left, right)


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
class LimitGuard:
    relation: str
    expression: dict[str, Any]
    claim: dict[str, Any]
    code: str
    message: str


@dataclass(frozen=True)
class LimitGuardEvidence:
    claim: dict[str, Any]
    conversion: str = "exact"


@dataclass(frozen=True)
class LimitPlanNode:
    kind: str
    expression: dict[str, Any]
    target: dict[str, Any]
    children: tuple["LimitPlanNode", ...] = ()
    premise_id: str | None = None


@dataclass(frozen=True)
class LimitAlgebraPattern:
    variable: str
    point: dict[str, Any]
    direction: str
    domain: tuple[dict[str, Any], ...]
    expression: dict[str, Any]
    target: dict[str, Any]
    root: LimitPlanNode
    guards: tuple[LimitGuard, ...]
    used_limit_premises: tuple[str, ...]


def same_limit_source(left: dict[str, Any], right: dict[str, Any]) -> bool:
    """Whether two limit goals use the exact same approach filter contract."""
    return (
        left.get("kind") == "limit"
        and right.get("kind") == "limit"
        and left.get("variable") == right.get("variable")
        and left.get("direction") == right.get("direction")
        and _same(left.get("point", {}), right.get("point", {}))
        and canonical_hash(left.get("domain", [])) == canonical_hash(right.get("domain", []))
    )


def _guard(relation: str, expr: dict[str, Any]) -> LimitGuard:
    if relation == "nonzero":
        claim = {"kind": "ne", "left": expr, "right": _zero()}
        return LimitGuard(
            relation,
            expr,
            claim,
            "limit_denominator_nonzero",
            "Limit division requires the denominator's finite limit to be nonzero.",
        )
    if relation == "positive":
        claim = {"kind": "lt", "left": _zero(), "right": expr}
        return LimitGuard(
            relation,
            expr,
            claim,
            "limit_positive_target",
            "School-domain log/sqrt composition requires the inner finite limit to be strictly positive so the expression is eventually in-domain.",
        )
    raise ValueError(f"unsupported limit guard relation {relation!r}")


def limit_guard_exact_status(guard: LimitGuard) -> bool | None:
    value = exact_rational_value(guard.expression)
    if value is None:
        return None
    if guard.relation == "nonzero":
        return value != 0
    if guard.relation == "positive":
        return value > 0
    return None


def limit_guard_auto_tactic(guard: LimitGuard) -> str | None:
    exact = limit_guard_exact_status(guard)
    if exact is True:
        return "norm_num"
    if exact is False:
        return None
    if guard.relation == "nonzero" and structurally_nonzero(guard.expression):
        return "positivity"
    if guard.relation == "positive" and structurally_positive(guard.expression):
        return "positivity"
    return None


def limit_guard_evidence_candidates(guard: LimitGuard) -> tuple[LimitGuardEvidence, ...]:
    candidates = [LimitGuardEvidence(guard.claim, "exact")]
    if guard.relation == "nonzero":
        candidates.extend(
            [
                LimitGuardEvidence({"kind": "lt", "left": _zero(), "right": guard.expression}, "positive_to_nonzero"),
                LimitGuardEvidence({"kind": "lt", "left": guard.expression, "right": _zero()}, "negative_to_nonzero"),
            ]
        )
    return tuple(candidates)


def match_limit_guard_evidence(guard: LimitGuard, proposition: dict[str, Any]) -> LimitGuardEvidence | None:
    for candidate in limit_guard_evidence_candidates(guard):
        if same_logic(candidate.claim, proposition):
            return candidate
    return None


def _merge_guards(*groups: Iterable[LimitGuard]) -> tuple[LimitGuard, ...]:
    seen: set[str] = set()
    result: list[LimitGuard] = []
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
    result: list[tuple[str, dict[str, Any]]] = []
    for identifier, claim in premise_rows:
        if not same_limit_source(goal, claim):
            continue
        if claim.get("result", {}).get("kind") != "finite":
            continue
        result.append((identifier, claim))
    return result


def match_limit_algebra(
    goal: dict[str, Any],
    premise_rows: Iterable[tuple[str, dict[str, Any]]] = (),
) -> LimitAlgebraPattern | None:
    """Build a compositional finite-limit proof plan over one shared source filter.

    Previously proved finite limits over that exact source filter may serve as
    opaque leaves.  This is what lets a removable-hole proof compose with
    ordinary limit algebra without pretending the hole expression is continuous
    at the approach point.
    """
    if goal.get("kind") != "limit" or goal.get("result", {}).get("kind") != "finite":
        return None
    variable = goal.get("variable")
    if not isinstance(variable, str):
        return None
    finite_premises = _finite_premise_rows(goal, premise_rows)
    guards: list[LimitGuard] = []
    used: list[str] = []

    def premise_leaf(expr: dict[str, Any]) -> LimitPlanNode | None:
        for identifier, claim in finite_premises:
            if _same(claim.get("expression", {}), expr):
                if identifier not in used:
                    used.append(identifier)
                return LimitPlanNode("premise", expr, claim["result"]["value"], premise_id=identifier)
        return None

    def walk(expr: dict[str, Any]) -> LimitPlanNode | None:
        leaf = premise_leaf(expr)
        if leaf is not None:
            return leaf
        kind = expr.get("kind")
        if kind in {"int", "rat"}:
            return LimitPlanNode("constant", expr, expr)
        if kind == "var":
            target = goal["point"] if expr.get("id") == variable else expr
            return LimitPlanNode("identity" if expr.get("id") == variable else "constant", expr, target)
        if kind == "neg":
            child = walk(expr.get("arg", {}))
            return None if child is None else LimitPlanNode("neg", expr, _neg(child.target), (child,))
        if kind in {"add", "sub", "mul", "div"}:
            left = walk(expr.get("left", {}))
            right = walk(expr.get("right", {}))
            if left is None or right is None:
                return None
            if kind == "div":
                guards.append(_guard("nonzero", right.target))
            return LimitPlanNode(kind, expr, _binary(kind, left.target, right.target), (left, right))
        if kind == "pow":
            exponent = expr.get("exponent")
            if not isinstance(exponent, int) or exponent < 0:
                return None
            child = walk(expr.get("base", {}))
            if child is None:
                return None
            target = _one() if exponent == 0 else ({"kind": "pow", "base": child.target, "exponent": exponent} if exponent != 1 else child.target)
            return LimitPlanNode("pow", expr, target, (child,))
        if kind in {"abs", "exp", "sin", "cos", "log", "sqrt"}:
            child = walk(expr.get("arg", {}))
            if child is None:
                return None
            if kind in {"log", "sqrt"}:
                # Strict positivity is deliberate.  It guarantees the school
                # partial function is eventually in-domain.  Boundary sqrt
                # limits remain handled by the domain-aware continuity rule.
                guards.append(_guard("positive", child.target))
            return LimitPlanNode(kind, expr, {"kind": kind, "arg": child.target}, (child,))
        return None

    root = walk(goal.get("expression", {}))
    if root is None or not _equivalent(root.target, goal["result"].get("value", {})):
        return None
    return LimitAlgebraPattern(
        variable=variable,
        point=goal["point"],
        direction=goal["direction"],
        domain=tuple(goal.get("domain", [])),
        expression=goal["expression"],
        target=goal["result"]["value"],
        root=root,
        guards=_merge_guards(guards),
        used_limit_premises=tuple(used),
    )


def limit_algebra_status(
    pattern: LimitAlgebraPattern,
    available_claims: Iterable[dict[str, Any]] = (),
) -> tuple[list[LimitGuard], list[LimitGuard]]:
    props = list(available_claims)
    missing: list[LimitGuard] = []
    violated: list[LimitGuard] = []
    for guard in pattern.guards:
        exact = limit_guard_exact_status(guard)
        if exact is False:
            violated.append(guard)
            continue
        if limit_guard_auto_tactic(guard) is not None:
            continue
        if not any(match_limit_guard_evidence(guard, prop) is not None for prop in props):
            missing.append(guard)
    return missing, violated
