from __future__ import annotations

from fractions import Fraction
from itertools import product
from typing import Any

import sympy as sp

from .contract import canonical_hash

_ALGEBRA_KINDS = {"int", "rat", "var", "neg", "add", "sub", "mul", "div", "pow"}


def exact_rational_value(expr: dict[str, Any]) -> Fraction | None:
    """Evaluate the exact variable-free rational fragment, or return ``None``.

    This deliberately does not invoke SymPy and does not approximate radicals.
    It is safe for deciding trivial pointwise guards that Lean will separately
    reconstruct with ``norm_num`` before a certificate can be issued.
    """
    kind = expr.get("kind")
    if kind == "int":
        return Fraction(int(expr["value"]), 1)
    if kind == "rat":
        return Fraction(int(expr["numerator"]), int(expr["denominator"]))
    if kind == "neg":
        value = exact_rational_value(expr.get("arg", {}))
        return -value if value is not None else None
    if kind == "abs":
        value = exact_rational_value(expr.get("arg", {}))
        return abs(value) if value is not None else None
    if kind in {"add", "sub", "mul", "div", "mod_nat"}:
        left = exact_rational_value(expr.get("left", {}))
        right = exact_rational_value(expr.get("right", {}))
        if left is None or right is None:
            return None
        if kind == "add":
            return left + right
        if kind == "sub":
            return left - right
        if kind == "mul":
            return left * right
        if kind == "mod_nat":
            if left.denominator != 1 or right.denominator != 1 or left < 0 or right <= 0:
                return None
            return Fraction(left.numerator % right.numerator, 1)
        return None if right == 0 else left / right
    if kind == "pow":
        exponent = expr.get("exponent")
        if not isinstance(exponent, int) or exponent < 0:
            return None
        base = exact_rational_value(expr.get("base", {}))
        return base ** exponent if base is not None else None
    return None


def structurally_nonnegative(expr: dict[str, Any]) -> bool:
    """Conservative syntax-only nonnegativity recognizer.

    Every recognized shape is intended to be dischargeable by Lean's
    ``positivity`` tactic.  This helper never numerically approximates a
    transcendental value.
    """
    value = exact_rational_value(expr)
    if value is not None:
        return value >= 0
    kind = expr.get("kind")
    if kind in {"abs", "sqrt", "exp"}:
        return True
    if kind == "neg":
        return structurally_nonpositive(expr.get("arg", {}))
    if kind == "pow":
        exponent = expr.get("exponent")
        if isinstance(exponent, int) and exponent % 2 == 0:
            return True
        return isinstance(exponent, int) and exponent > 0 and structurally_nonnegative(expr.get("base", {}))
    if kind == "add":
        return structurally_nonnegative(expr.get("left", {})) and structurally_nonnegative(expr.get("right", {}))
    if kind == "mul":
        left, right = expr.get("left", {}), expr.get("right", {})
        return (structurally_nonnegative(left) and structurally_nonnegative(right)) or (structurally_nonpositive(left) and structurally_nonpositive(right))
    return False


def structurally_nonpositive(expr: dict[str, Any]) -> bool:
    value = exact_rational_value(expr)
    if value is not None:
        return value <= 0
    kind = expr.get("kind")
    if kind == "neg":
        return structurally_nonnegative(expr.get("arg", {}))
    if kind == "add":
        return structurally_nonpositive(expr.get("left", {})) and structurally_nonpositive(expr.get("right", {}))
    if kind == "mul":
        left, right = expr.get("left", {}), expr.get("right", {})
        return (structurally_nonnegative(left) and structurally_nonpositive(right)) or (structurally_nonpositive(left) and structurally_nonnegative(right))
    return False


def structurally_positive(expr: dict[str, Any]) -> bool:
    value = exact_rational_value(expr)
    if value is not None:
        return value > 0
    kind = expr.get("kind")
    if kind == "exp":
        return True
    if kind == "neg":
        return structurally_negative(expr.get("arg", {}))
    if kind == "sqrt":
        return structurally_positive(expr.get("arg", {}))
    if kind == "abs":
        arg = expr.get("arg", {})
        return structurally_positive(arg) or structurally_negative(arg)
    if kind == "pow":
        exponent = expr.get("exponent")
        base = expr.get("base", {})
        if exponent == 0:
            return True
        if isinstance(exponent, int) and exponent > 0:
            if structurally_positive(base):
                return True
            if exponent % 2 == 0 and structurally_negative(base):
                return True
        return False
    if kind == "add":
        left, right = expr.get("left", {}), expr.get("right", {})
        return (structurally_positive(left) and structurally_nonnegative(right)) or (structurally_nonnegative(left) and structurally_positive(right))
    if kind == "mul":
        left, right = expr.get("left", {}), expr.get("right", {})
        return (structurally_positive(left) and structurally_positive(right)) or (structurally_negative(left) and structurally_negative(right))
    if kind == "div":
        left, right = expr.get("left", {}), expr.get("right", {})
        return (structurally_positive(left) and structurally_positive(right)) or (structurally_negative(left) and structurally_negative(right))
    return False


def structurally_negative(expr: dict[str, Any]) -> bool:
    value = exact_rational_value(expr)
    if value is not None:
        return value < 0
    kind = expr.get("kind")
    if kind == "neg":
        return structurally_positive(expr.get("arg", {}))
    if kind == "add":
        left, right = expr.get("left", {}), expr.get("right", {})
        return (structurally_negative(left) and structurally_nonpositive(right)) or (structurally_nonpositive(left) and structurally_negative(right))
    if kind == "mul":
        left, right = expr.get("left", {}), expr.get("right", {})
        return (structurally_negative(left) and structurally_positive(right)) or (structurally_positive(left) and structurally_negative(right))
    if kind == "div":
        left, right = expr.get("left", {}), expr.get("right", {})
        return (structurally_negative(left) and structurally_positive(right)) or (structurally_positive(left) and structurally_negative(right))
    return False


def structurally_nonzero(expr: dict[str, Any]) -> bool:
    value = exact_rational_value(expr)
    if value is not None:
        return value != 0
    if structurally_positive(expr) or structurally_negative(expr):
        return True
    if expr.get("kind") == "pow":
        exponent = expr.get("exponent")
        return isinstance(exponent, int) and exponent > 0 and structurally_nonzero(expr.get("base", {}))
    return False


def variables_for(request: dict[str, Any], scope: str = "root") -> dict[str, sp.Symbol]:
    declarations = list(request["variables"])
    scope_rows = {row["id"]: row for row in request.get("scopes", [])}
    if scope in scope_rows:
        chain: list[dict[str, Any]] = []
        current: str | None = scope
        while current is not None:
            row = scope_rows[current]
            chain.append(row)
            current = row.get("parent")
        for row in reversed(chain):
            declarations.extend(row.get("binders", []))

    result: dict[str, sp.Symbol] = {}
    for row in declarations:
        assumptions: dict[str, bool] = {}
        if row["type"] == "real":
            assumptions["real"] = True
        elif row["type"] == "int":
            assumptions["integer"] = True
        elif row["type"] == "nat":
            assumptions["integer"] = True
            assumptions["nonnegative"] = True
        elif row["type"] == "rat":
            assumptions["rational"] = True
        result[row["id"]] = sp.Symbol(row["id"], **assumptions)
    return result


def expr_to_sympy(expr: dict[str, Any], symbols: dict[str, sp.Symbol]) -> sp.Expr:
    kind = expr["kind"]
    if kind == "int":
        return sp.Integer(expr["value"])
    if kind == "rat":
        return sp.Rational(expr["numerator"], expr["denominator"])
    if kind == "var":
        return symbols[expr["id"]]
    if kind == "neg":
        return -expr_to_sympy(expr["arg"], symbols)
    if kind == "cast_real":
        return expr_to_sympy(expr["arg"], symbols)
    if kind == "sqrt":
        return sp.sqrt(expr_to_sympy(expr["arg"], symbols))
    if kind == "abs":
        return sp.Abs(expr_to_sympy(expr["arg"], symbols))
    if kind in {"exp", "log", "sin", "cos"}:
        function = {"exp": sp.exp, "log": sp.log, "sin": sp.sin, "cos": sp.cos}[kind]
        return function(expr_to_sympy(expr["arg"], symbols))
    if kind == "pow":
        return expr_to_sympy(expr["base"], symbols) ** expr["exponent"]
    if kind == "rpow":
        return expr_to_sympy(expr["base"], symbols) ** expr_to_sympy(expr["exponent"], symbols)
    if kind == "pow_nat":
        return expr_to_sympy(expr["base"], symbols) ** expr_to_sympy(expr["exponent"], symbols)
    if kind == "if":
        cond = prop_to_sympy(expr["condition"], symbols)
        return sp.Piecewise(
            (expr_to_sympy(expr["then"], symbols), cond),
            (expr_to_sympy(expr["else"], symbols), True),
        )
    left = expr_to_sympy(expr["left"], symbols)
    right = expr_to_sympy(expr["right"], symbols)
    if kind == "mod_nat":
        return sp.Mod(left, right)
    return {"add": left + right, "sub": left - right, "mul": left * right, "div": left / right}[kind]


def prop_to_sympy(prop: dict[str, Any], symbols: dict[str, sp.Symbol]):
    kind = prop["kind"]
    if kind == "true":
        return sp.true
    if kind == "false":
        return sp.false
    if kind in {"eq", "ne", "lt", "le", "gt", "ge"}:
        left = expr_to_sympy(prop["left"], symbols)
        right = expr_to_sympy(prop["right"], symbols)
        return {
            "eq": sp.Eq,
            "ne": sp.Ne,
            "lt": sp.Lt,
            "le": sp.Le,
            "gt": sp.Gt,
            "ge": sp.Ge,
        }[kind](left, right)
    if kind == "and":
        return sp.And(prop_to_sympy(prop["left"], symbols), prop_to_sympy(prop["right"], symbols))
    if kind == "or":
        return sp.Or(prop_to_sympy(prop["left"], symbols), prop_to_sympy(prop["right"], symbols))
    if kind == "implies":
        return sp.Implies(prop_to_sympy(prop["left"], symbols), prop_to_sympy(prop["right"], symbols))
    if kind == "iff":
        return sp.Equivalent(prop_to_sympy(prop["left"], symbols), prop_to_sympy(prop["right"], symbols))
    if kind == "not":
        return sp.Not(prop_to_sympy(prop["arg"], symbols))
    raise ValueError("quantified propositions are not evaluated by the candidate symbolic checker")


def expression_kinds(expr: dict[str, Any]) -> set[str]:
    kind = expr["kind"]
    result = {kind}
    if kind in {"int", "rat", "var"}:
        return result
    if kind in {"neg", "cast_real", "factorial", "sqrt", "abs", "exp", "log", "sin", "cos"}:
        return result | expression_kinds(expr["arg"])
    if kind == "pow":
        return result | expression_kinds(expr["base"])
    if kind == "rpow":
        return result | expression_kinds(expr["base"]) | expression_kinds(expr["exponent"])
    if kind == "pow_nat":
        return result | expression_kinds(expr["base"]) | expression_kinds(expr["exponent"])
    if kind == "if":
        return result | expression_kinds(expr["then"]) | expression_kinds(expr["else"])
    return result | expression_kinds(expr["left"]) | expression_kinds(expr["right"])


def is_algebraic_expr(expr: dict[str, Any]) -> bool:
    return expression_kinds(expr) <= _ALGEBRA_KINDS


def is_polynomial_identity(prop: dict[str, Any], symbols: dict[str, sp.Symbol]) -> bool:
    if prop.get("kind") != "eq" or not is_algebraic_expr(prop["left"]) or not is_algebraic_expr(prop["right"]):
        return False
    if "div" in expression_kinds(prop["left"]) | expression_kinds(prop["right"]):
        return False
    left = expr_to_sympy(prop["left"], symbols)
    right = expr_to_sympy(prop["right"], symbols)
    try:
        return sp.expand(left - right) == 0
    except Exception:
        return False


def is_rational_identity(prop: dict[str, Any], symbols: dict[str, sp.Symbol]) -> bool:
    if prop.get("kind") != "eq" or not is_algebraic_expr(prop["left"]) or not is_algebraic_expr(prop["right"]):
        return False
    left = expr_to_sympy(prop["left"], symbols)
    right = expr_to_sympy(prop["right"], symbols)
    try:
        numerator, _denominator = sp.fraction(sp.together(left - right))
        return sp.expand(numerator) == 0
    except Exception:
        return False



def equivalent_expr(left: dict[str, Any], right: dict[str, Any], symbols: dict[str, sp.Symbol]) -> bool:
    if not is_algebraic_expr(left) or not is_algebraic_expr(right):
        return canonical_hash(left) == canonical_hash(right)
    try:
        a = expr_to_sympy(left, symbols)
        b = expr_to_sympy(right, symbols)
        numerator, _denominator = sp.fraction(sp.together(a - b))
        return sp.expand(numerator) == 0
    except Exception:
        return False


def relation_prop(goal: dict[str, Any]) -> dict[str, Any] | None:
    if goal.get("kind") != "proposition":
        return None
    prop = goal.get("proposition")
    if isinstance(prop, dict) and prop.get("kind") in {"eq", "ne", "lt", "le", "gt", "ge"}:
        return prop
    return None

def same_goal(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return canonical_hash(left) == canonical_hash(right)


def _truth(value: Any) -> bool | None:
    simplified = sp.simplify(value)
    if simplified is sp.true or simplified == True:  # noqa: E712
        return True
    if simplified is sp.false or simplified == False:  # noqa: E712
        return False
    return None


def exact_counterexample(request: dict[str, Any], *, radius: int = 3, max_points: int = 4000) -> dict[str, str] | None:
    goal = request["goal"]
    if goal.get("kind") != "proposition" or goal["proposition"].get("kind") in {"forall", "exists"}:
        return None
    symbols = variables_for(request)
    ids = list(symbols)
    if not ids or len(ids) > 3:
        return None
    samples = [sp.Rational(value) for value in range(-radius, radius + 1)]
    checked = 0
    for values in product(samples, repeat=len(ids)):
        checked += 1
        if checked > max_points:
            break
        subs = {symbols[name]: value for name, value in zip(ids, values)}
        try:
            assumptions_ok = True
            for row in request["assumptions"]:
                if row["scope"] != "root":
                    continue
                truth = _truth(prop_to_sympy(row["claim"], symbols).subs(subs))
                if truth is not True:
                    assumptions_ok = False
                    break
            if not assumptions_ok:
                continue
            truth = _truth(prop_to_sympy(goal["proposition"], symbols).subs(subs))
            if truth is False:
                return {name: str(value) for name, value in zip(ids, values)}
        except Exception:
            continue
    return None



def _affine_margin(
    prop: dict[str, Any], symbols: dict[str, sp.Symbol]
) -> tuple[sp.Expr, str] | None:
    """Return an affine expression whose sign encodes a scalar relation.

    The returned relation is one of ``eq``, ``ge`` or ``gt`` and means
    ``margin = 0``, ``margin >= 0`` or ``margin > 0`` respectively.  ``ne``
    is intentionally excluded: arithmetic tactics can prove disequality via
    contradiction, but the planner does not synthesize that hidden subproof.
    """
    kind = prop.get("kind")
    if kind not in {"eq", "lt", "le", "gt", "ge"}:
        return None
    try:
        left = expr_to_sympy(prop["left"], symbols)
        right = expr_to_sympy(prop["right"], symbols)
    except Exception:
        return None
    if kind == "eq":
        margin, relation = left - right, "eq"
    elif kind == "le":
        margin, relation = right - left, "ge"
    elif kind == "lt":
        margin, relation = right - left, "gt"
    elif kind == "ge":
        margin, relation = left - right, "ge"
    else:
        margin, relation = left - right, "gt"
    variables = sorted(symbols.values(), key=lambda item: item.name)
    try:
        poly = sp.Poly(sp.expand(margin), *variables) if variables else None
        if poly is not None and poly.total_degree() > 1:
            return None
    except Exception:
        return None
    return sp.expand(margin), relation


def _affine_vector(expr: sp.Expr, variables: list[sp.Symbol]) -> tuple[sp.Rational, ...] | None:
    try:
        expanded = sp.Poly(sp.expand(expr), *variables) if variables else None
        if expanded is not None and expanded.total_degree() > 1:
            return None
        coefficients = [sp.expand(expr).coeff(variable) for variable in variables]
        constant = sp.expand(expr - sum(coef * variable for coef, variable in zip(coefficients, variables)))
        values = [*coefficients, constant]
        if any(value.free_symbols for value in values):
            return None
        return tuple(sp.Rational(value) for value in values)
    except Exception:
        return None


def _cone_represents(
    target: tuple[sp.Rational, ...],
    inequalities: list[tuple[tuple[sp.Rational, ...], bool]],
    equalities: list[tuple[sp.Rational, ...]],
    *,
    require_strict: bool,
) -> bool:
    """Conservatively check a Farkas-style linear combination certificate.

    Inequality coefficients are constrained nonnegative; equality coefficients
    are free.  For a strict target at least one strict premise must have a
    positive coefficient.  This is only used to decide whether *search* may
    propose ``linarith``; Lean remains the verifier of the final artifact.
    """
    from sympy.solvers.simplex import InfeasibleLPError, UnboundedLPError, lpmax, lpmin

    lambda_vars = list(sp.symbols(f"_qm_l0:{len(inequalities)}")) if inequalities else []
    mu_vars = list(sp.symbols(f"_qm_e0:{len(equalities)}")) if equalities else []
    constraints: list[Any] = [var >= 0 for var in lambda_vars]
    for index, wanted in enumerate(target):
        actual = sp.Integer(0)
        for variable, (vector, _strict) in zip(lambda_vars, inequalities):
            actual += variable * vector[index]
        for variable, vector in zip(mu_vars, equalities):
            actual += variable * vector[index]
        constraints.append(sp.Eq(actual, wanted))
    try:
        lpmin(sp.Integer(0), constraints)
    except (InfeasibleLPError, TypeError, ValueError):
        return False
    if not require_strict:
        return True
    strict_vars = [variable for variable, (_vector, strict) in zip(lambda_vars, inequalities) if strict]
    if not strict_vars:
        return False
    objective = sum(strict_vars, sp.Integer(0))
    try:
        maximum, _solution = lpmax(objective, constraints)
        return bool(maximum > 0)
    except UnboundedLPError:
        return True
    except (InfeasibleLPError, TypeError, ValueError):
        return False


def linear_entails(
    target_prop: dict[str, Any],
    context_props: list[dict[str, Any]],
    symbols: dict[str, sp.Symbol],
) -> bool:
    """Return True only when an exact affine certificate entails the target.

    This deliberately under-approximates Lean's ``linarith``.  A false negative
    merely means automatic search will not propose the tactic; a false positive
    would make the assistant claim a bogus candidate step before kernel replay,
    so the implementation is intentionally conservative.
    """
    target = _affine_margin(target_prop, symbols)
    if target is None:
        return False
    variables = sorted(symbols.values(), key=lambda item: item.name)
    target_vector = _affine_vector(target[0], variables)
    if target_vector is None:
        return False
    inequalities: list[tuple[tuple[sp.Rational, ...], bool]] = []
    equalities: list[tuple[sp.Rational, ...]] = []
    for prop in context_props:
        normalized = _affine_margin(prop, symbols)
        if normalized is None:
            continue
        vector = _affine_vector(normalized[0], variables)
        if vector is None:
            continue
        if normalized[1] == "eq":
            equalities.append(vector)
        else:
            inequalities.append((vector, normalized[1] == "gt"))

    # Arithmetic tactics may use true numeric inequalities without an explicit
    # hypothesis.  Model that conservatively as the single generator ``1 > 0``.
    # Its nonnegative multiples represent constant slack, and because it is
    # strict it can justify a strict target only when the target contains
    # genuinely positive slack.  For example, ``0 <= x`` entails ``0 < x + 2``
    # but still does *not* entail ``0 < x``.
    positive_unit = tuple([sp.Rational(0)] * len(variables) + [sp.Rational(1)])
    inequalities.append((positive_unit, True))

    relation = target[1]
    if relation == "eq":
        # Equality follows when both target >= 0 and -target >= 0 follow.
        return _cone_represents(target_vector, inequalities, equalities, require_strict=False) and _cone_represents(
            tuple(-value for value in target_vector), inequalities, equalities, require_strict=False
        )
    return _cone_represents(target_vector, inequalities, equalities, require_strict=(relation == "gt"))


def obvious_polynomial_relation(prop: dict[str, Any], symbols: dict[str, sp.Symbol]) -> bool:
    """Recognize a small class of unconditional polynomial truths.

    This gates planner use of ``nlinarith``.  It is not a replacement for Lean;
    it only prevents the search layer from inserting an arbitrary nonlinear
    tactic step for every polynomial-shaped goal.
    """
    kind = prop.get("kind")
    if kind not in {"eq", "lt", "le", "gt", "ge"}:
        return False
    try:
        left = expr_to_sympy(prop["left"], symbols)
        right = expr_to_sympy(prop["right"], symbols)
        if kind == "eq":
            expression = sp.expand(left - right)
            return expression == 0
        margin = {
            "le": right - left,
            "lt": right - left,
            "ge": left - right,
            "gt": left - right,
        }[kind]
        margin = sp.expand(margin)
        if kind in {"le", "ge"}:
            return margin.is_nonnegative is True or sp.ask(sp.Q.nonnegative(margin)) is True
        return margin.is_positive is True or sp.ask(sp.Q.positive(margin)) is True
    except Exception:
        return False

def sympy_to_expr(value: sp.Expr, reverse_symbols: dict[sp.Symbol, str]) -> dict[str, Any]:
    value = sp.factor(value)
    if isinstance(value, sp.Integer):
        return {"kind": "int", "value": int(value)}
    if isinstance(value, sp.Rational):
        if value.q == 1:
            return {"kind": "int", "value": int(value.p)}
        return {"kind": "rat", "numerator": int(value.p), "denominator": int(value.q)}
    if isinstance(value, sp.Symbol):
        return {"kind": "var", "id": reverse_symbols[value]}
    if isinstance(value, sp.Pow) and value.exp.is_Integer and int(value.exp) >= 0:
        return {"kind": "pow", "base": sympy_to_expr(value.base, reverse_symbols), "exponent": int(value.exp)}
    if isinstance(value, sp.Pow) and isinstance(value.exp, sp.Rational):
        exponent = sympy_to_expr(value.exp, reverse_symbols)
        return {"kind": "rpow", "base": sympy_to_expr(value.base, reverse_symbols), "exponent": exponent}
    if isinstance(value, sp.Add):
        args = list(value.as_ordered_terms())
        result = sympy_to_expr(args[0], reverse_symbols)
        for term in args[1:]:
            if term.could_extract_minus_sign():
                result = {"kind": "sub", "left": result, "right": sympy_to_expr(-term, reverse_symbols)}
            else:
                result = {"kind": "add", "left": result, "right": sympy_to_expr(term, reverse_symbols)}
        return result
    if isinstance(value, sp.Mul):
        numerator, denominator = sp.fraction(value)
        if denominator != 1:
            return {
                "kind": "div",
                "left": sympy_to_expr(numerator, reverse_symbols),
                "right": sympy_to_expr(denominator, reverse_symbols),
            }
        args = list(value.as_ordered_factors())
        if args and args[0] == -1:
            rest = sp.Mul(*args[1:]) if len(args) > 2 else args[1]
            return {"kind": "neg", "arg": sympy_to_expr(rest, reverse_symbols)}
        result = sympy_to_expr(args[0], reverse_symbols)
        for factor in args[1:]:
            result = {"kind": "mul", "left": result, "right": sympy_to_expr(factor, reverse_symbols)}
        return result
    raise ValueError(f"cannot convert symbolic expression {value!r} into the current typed AST")
