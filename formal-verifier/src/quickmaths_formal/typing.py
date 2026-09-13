from __future__ import annotations

from dataclasses import dataclass
from typing import Any

_NUMERIC_ORDER = {"nat": 0, "int": 1, "rat": 2, "real": 3}
_NUMERIC_TYPES = set(_NUMERIC_ORDER)


class TypeCheckError(ValueError):
    pass


def function_type_parts(type_name: str) -> tuple[str, str] | None:
    if "->" not in type_name:
        return None
    parts = type_name.split("->")
    if len(parts) != 2 or any(part not in _NUMERIC_TYPES for part in parts):
        return None
    return parts[0], parts[1]


def set_element_type(type_name: str) -> str | None:
    if type_name.startswith("set[") and type_name.endswith("]"):
        inner = type_name[4:-1]
        return inner if inner in _NUMERIC_TYPES else None
    return None


@dataclass(frozen=True)
class TypeInfo:
    type: str
    exact: bool = True


def _promote(left: str, right: str) -> str:
    if left not in _NUMERIC_TYPES or right not in _NUMERIC_TYPES:
        raise TypeCheckError(f"cannot combine non-numeric types {left!r} and {right!r}")
    return max((left, right), key=lambda item: _NUMERIC_ORDER[item])


def _coercible(source: str, target: str) -> bool:
    return source in _NUMERIC_TYPES and target in _NUMERIC_TYPES and _NUMERIC_ORDER[source] <= _NUMERIC_ORDER[target]


def infer_expr_type(expr: dict[str, Any], variables: dict[str, str]) -> str:
    kind = expr["kind"]
    if kind == "int":
        return "nat" if expr["value"] >= 0 else "int"
    if kind == "rat":
        return "rat"
    if kind == "var":
        try:
            return variables[expr["id"]]
        except KeyError as exc:
            raise TypeCheckError(f"unknown variable {expr['id']!r}") from exc
    if kind == "neg":
        inner = infer_expr_type(expr["arg"], variables)
        if inner == "nat":
            return "int"
        if inner not in _NUMERIC_TYPES:
            raise TypeCheckError("negation requires a numeric expression")
        return inner
    if kind == "cast_real":
        inner = infer_expr_type(expr["arg"], variables)
        if inner != "nat":
            raise TypeCheckError("real(...) currently casts an explicitly natural-number expression to real")
        return "real"
    if kind == "factorial":
        inner = infer_expr_type(expr["arg"], variables)
        if inner != "nat":
            raise TypeCheckError("factorial(...) requires a natural-number expression")
        return "nat"
    if kind == "sqrt":
        inner = infer_expr_type(expr["arg"], variables)
        if not _coercible(inner, "real"):
            raise TypeCheckError("square root requires a real-coercible numeric expression")
        return "real"
    if kind == "abs":
        inner = infer_expr_type(expr["arg"], variables)
        if inner not in _NUMERIC_TYPES:
            raise TypeCheckError("absolute value requires a numeric expression")
        return inner
    if kind in {"exp", "log", "sin", "cos"}:
        inner = infer_expr_type(expr["arg"], variables)
        if not _coercible(inner, "real"):
            raise TypeCheckError(f"{kind} requires a real-coercible numeric expression")
        return "real"
    if kind == "pow":
        base = infer_expr_type(expr["base"], variables)
        if base not in _NUMERIC_TYPES:
            raise TypeCheckError("powers require a numeric base")
        return base
    if kind == "rpow":
        base = infer_expr_type(expr["base"], variables)
        exponent = infer_expr_type(expr["exponent"], variables)
        if not _coercible(base, "real") or not _coercible(exponent, "real"):
            raise TypeCheckError("real-exponent powers require real-coercible base and exponent")
        return "real"
    if kind == "pow_nat":
        base = infer_expr_type(expr["base"], variables)
        exponent = infer_expr_type(expr["exponent"], variables)
        if base not in _NUMERIC_TYPES:
            raise TypeCheckError("natural-exponent powers require a numeric base")
        if exponent != "nat":
            raise TypeCheckError("variable power exponents must have type nat")
        return base
    if kind == "apply":
        function_type = infer_expr_type(expr["function"], variables)
        parts = function_type_parts(function_type)
        if parts is None:
            raise TypeCheckError("function application requires a declared scalar->scalar function")
        domain, codomain = parts
        argument_type = infer_expr_type(expr["arg"], variables)
        if not _coercible(argument_type, domain):
            raise TypeCheckError(f"function argument of type {argument_type!r} cannot be coerced to {domain!r}")
        return codomain
    if kind == "if":
        check_prop_type(expr["condition"], variables)
        left = infer_expr_type(expr["then"], variables)
        right = infer_expr_type(expr["else"], variables)
        return _promote(left, right)
    if kind == "mod_nat":
        left = infer_expr_type(expr["left"], variables)
        right = infer_expr_type(expr["right"], variables)
        if left != "nat" or right != "nat":
            raise TypeCheckError("natural modulo requires natural-number operands")
        return "nat"
    if kind in {"add", "sub", "mul", "div"}:
        left = infer_expr_type(expr["left"], variables)
        right = infer_expr_type(expr["right"], variables)
        common = _promote(left, right)
        if kind == "div" and common in {"nat", "int"}:
            raise TypeCheckError(
                "division over only natural/integer operands is ambiguous; use a rational or real operand/type explicitly"
            )
        if kind == "sub" and common == "nat":
            # Lean's Nat subtraction is truncated. Keeping this type is deliberate;
            # callers that intend ordinary signed school subtraction must declare an
            # integer/rational/real variable instead.
            return "nat"
        return common
    raise TypeCheckError(f"unsupported expression kind {kind!r}")



def expr_coercible_to(expr: dict[str, Any], target: str, variables: dict[str, str]) -> bool:
    source = infer_expr_type(expr, variables)
    return source == target or _coercible(source, target)

def check_prop_type(prop: dict[str, Any], variables: dict[str, str]) -> None:
    kind = prop["kind"]
    if kind in {"true", "false"}:
        return
    if kind in {"eq", "ne", "lt", "le", "gt", "ge"}:
        left = infer_expr_type(prop["left"], variables)
        right = infer_expr_type(prop["right"], variables)
        if left in _NUMERIC_TYPES and right in _NUMERIC_TYPES:
            _promote(left, right)
        elif kind in {"eq", "ne"} and left == right and (set_element_type(left) is not None or function_type_parts(left) is not None):
            pass
        else:
            raise TypeCheckError(f"relation {kind!r} is not defined between {left!r} and {right!r}")
        return
    if kind == "mem":
        element = infer_expr_type(prop["left"], variables)
        set_type = infer_expr_type(prop["right"], variables)
        target = set_element_type(set_type)
        if target is None or not _coercible(element, target):
            raise TypeCheckError(f"membership requires an element compatible with {set_type!r}")
        return
    if kind == "subset":
        left = infer_expr_type(prop["left"], variables)
        right = infer_expr_type(prop["right"], variables)
        if set_element_type(left) is None or left != right:
            raise TypeCheckError("subset requires sets with the same element type")
        return
    if kind in {"and", "or", "implies", "iff"}:
        check_prop_type(prop["left"], variables)
        check_prop_type(prop["right"], variables)
        return
    if kind == "not":
        check_prop_type(prop["arg"], variables)
        return
    if kind in {"forall", "exists"}:
        binder = prop["binder"]
        nested = dict(variables)
        nested[binder["id"]] = binder["type"]
        check_prop_type(prop["body"], nested)
        return
    raise TypeCheckError(f"unsupported proposition kind {kind!r}")


def check_goal_type(goal: dict[str, Any], variables: dict[str, str]) -> None:
    if goal["kind"] == "proposition":
        check_prop_type(goal["proposition"], variables)
        return
    if goal["kind"] == "series_sum":
        variable = goal["variable"]
        if variables.get(variable) != "nat":
            raise TypeCheckError("series index variables must currently have type nat")
        expression_type = infer_expr_type(goal["expression"], variables)
        if not _coercible(expression_type, "real"):
            raise TypeCheckError("real series require a real-coercible term expression")
        if goal["result"]["kind"] == "finite":
            result_type = infer_expr_type(goal["result"]["value"], variables)
            if not _coercible(result_type, "real"):
                raise TypeCheckError("finite real series sums require a real-coercible result")
        return
    if goal["kind"] == "sequence_limit":
        variable = goal["variable"]
        if variables.get(variable) != "nat":
            raise TypeCheckError("sequence index variables must currently have type nat")
        expression_type = infer_expr_type(goal["expression"], variables)
        if not _coercible(expression_type, "real"):
            raise TypeCheckError("real sequence limits require a real-coercible sequence expression")
        result = goal["result"]
        if result["kind"] == "finite":
            result_type = infer_expr_type(result["value"], variables)
            if not _coercible(result_type, "real"):
                raise TypeCheckError("finite real sequence limits require a real-coercible result")
        return

    if goal["kind"] == "derivative":
        variable = goal["variable"]
        if variables.get(variable) != "real":
            raise TypeCheckError("derivative variables must currently have type real")
        expression_type = infer_expr_type(goal["expression"], variables)
        point_type = infer_expr_type(goal["point"], variables)
        result_type = infer_expr_type(goal["result"], variables)
        if not all(_coercible(item, "real") for item in (expression_type, point_type, result_type)):
            raise TypeCheckError("real derivatives require real-coercible expression, point, and result")
        return
    variable = goal["variable"]
    if variables.get(variable) != "real":
        raise TypeCheckError("limit variables must currently have type real")
    expression_type = infer_expr_type(goal["expression"], variables)
    point_type = infer_expr_type(goal["point"], variables)
    if not _coercible(expression_type, "real") or not _coercible(point_type, "real"):
        raise TypeCheckError("real limits require real-coercible expression and approach point")
    for guard in goal.get("domain", []):
        check_prop_type(guard, variables)
    result = goal["result"]
    if result["kind"] == "finite":
        result_type = infer_expr_type(result["value"], variables)
        if not _coercible(result_type, "real"):
            raise TypeCheckError("finite real limits require a real-coercible result")


def validate_request_types(request: dict[str, Any]) -> None:
    global_variables = {row["id"]: row["type"] for row in request["variables"]}
    scope_rows = {row["id"]: row for row in request["scopes"]}

    def variables_for_scope(scope: str) -> dict[str, str]:
        result = dict(global_variables)
        chain: list[dict[str, Any]] = []
        current: str | None = scope
        while current is not None:
            row = scope_rows[current]
            chain.append(row)
            current = row["parent"]
        for row in reversed(chain):
            for binder in row.get("binders", []):
                result[binder["id"]] = binder["type"]
        return result

    for assumption in request["assumptions"]:
        check_prop_type(assumption["claim"], variables_for_scope(assumption["scope"]))
    for step in request["steps"]:
        variables = variables_for_scope(step["scope"])
        check_goal_type(step["claim"], variables)
        for key in {"divisor", "argument", "radicand", "simplified", "term", "factor", "witness"}:
            parameter = step.get("parameters", {}).get(key)
            if isinstance(parameter, dict):
                infer_expr_type(parameter, variables)
    check_goal_type(request["goal"], global_variables)
