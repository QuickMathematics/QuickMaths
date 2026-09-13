from __future__ import annotations

from typing import Any

_TYPE_NAMES = {"real": "real", "int": "integer", "rat": "rational", "nat": "natural number"}


def type_text(type_name: str) -> str:
    if type_name in _TYPE_NAMES:
        return _TYPE_NAMES[type_name]
    if type_name.startswith("set[") and type_name.endswith("]"):
        return f"set of {type_text(type_name[4:-1])}s"
    if "->" in type_name:
        left, right = type_name.split("->", 1)
        return f"function from {type_text(left)} to {type_text(right)}"
    return type_name


def expr_text(expr: dict[str, Any]) -> str:
    kind = expr["kind"]
    if kind == "int":
        return str(expr["value"])
    if kind == "rat":
        return f"{expr['numerator']}/{expr['denominator']}"
    if kind == "var":
        return expr["id"]
    if kind == "neg":
        return f"-{expr_text(expr['arg'])}"
    if kind == "apply":
        return f"{expr_text(expr['function'])}({expr_text(expr['arg'])})"
    if kind == "cast_real":
        return f"real({expr_text(expr['arg'])})"
    if kind == "factorial":
        return f"factorial({expr_text(expr['arg'])})"
    if kind == "sqrt":
        return f"√({expr_text(expr['arg'])})"
    if kind == "abs":
        return f"|{expr_text(expr['arg'])}|"
    if kind in {"exp", "log", "sin", "cos"}:
        return f"{kind}({expr_text(expr['arg'])})"
    if kind == "pow":
        return f"({expr_text(expr['base'])})^{expr['exponent']}"
    if kind == "rpow":
        return f"({expr_text(expr['base'])})^({expr_text(expr['exponent'])})"
    if kind == "pow_nat":
        return f"({expr_text(expr['base'])})^{expr_text(expr['exponent'])}"
    if kind == "if":
        return f"({expr_text(expr['then'])} if {prop_text(expr['condition'])}, otherwise {expr_text(expr['else'])})"
    op = {"add": "+", "sub": "-", "mul": "*", "div": "/", "mod_nat": "%"}[kind]
    return f"({expr_text(expr['left'])} {op} {expr_text(expr['right'])})"


def prop_text(prop: dict[str, Any]) -> str:
    kind = prop["kind"]
    if kind == "true":
        return "true"
    if kind == "false":
        return "false"
    if kind in {"eq", "ne", "lt", "le", "gt", "ge", "mem", "subset"}:
        op = {"eq": "=", "ne": "≠", "lt": "<", "le": "≤", "gt": ">", "ge": "≥", "mem": "∈", "subset": "⊆"}[kind]
        return f"{expr_text(prop['left'])} {op} {expr_text(prop['right'])}"
    if kind == "not":
        return f"not ({prop_text(prop['arg'])})"
    if kind in {"and", "or", "implies", "iff"}:
        word = {"and": "and", "or": "or", "implies": "implies", "iff": "if and only if"}[kind]
        return f"({prop_text(prop['left'])}) {word} ({prop_text(prop['right'])})"
    if kind in {"forall", "exists"}:
        binder = prop["binder"]
        prefix = "for every" if kind == "forall" else "there exists"
        return f"{prefix} {type_text(binder['type'])} {binder['id']} such that {prop_text(prop['body'])}"
    raise ValueError(f"unsupported proposition kind {kind!r}")


def goal_text(goal: dict[str, Any]) -> str:
    if goal["kind"] == "proposition":
        return prop_text(goal["proposition"])
    if goal["kind"] == "series_sum":
        term = expr_text(goal["expression"])
        if goal["result"]["kind"] == "not_summable":
            return f"The series from {goal['variable']} = 0 to infinity of {term} is not summable."
        if goal["result"]["kind"] == "summable":
            return f"The series from {goal['variable']} = 0 to infinity of {term} is summable."
        return f"The series from {goal['variable']} = 0 to infinity of {term} sums to {expr_text(goal['result']['value'])}."
    if goal["kind"] == "sequence_limit":
        result = goal["result"]
        if result["kind"] == "no_finite_limit":
            return f"As {goal['variable']} tends to infinity, {expr_text(goal['expression'])} does not converge to a finite real limit."
        target = {
            "positive_infinity": "+∞",
            "negative_infinity": "−∞",
            "exists_finite": "some finite real limit",
        }.get(result["kind"], expr_text(result["value"]) if result["kind"] == "finite" else result["kind"])
        return f"As {goal['variable']} tends to infinity, {expr_text(goal['expression'])} tends to {target}."

    if goal["kind"] == "derivative":
        return (
            f"The derivative of {expr_text(goal['expression'])} with respect to {goal['variable']} "
            f"at {expr_text(goal['point'])} is {expr_text(goal['result'])}."
        )
    direction = {"both": "from both sides", "left": "from the left", "right": "from the right"}[goal["direction"]]
    domain = ""
    if goal.get("domain"):
        domain = ", restricted by " + "; ".join(prop_text(item) for item in goal["domain"])
    result = goal["result"]
    target = {
        "positive_infinity": "+∞",
        "negative_infinity": "−∞",
        "no_common_limit": "no common finite two-sided limit",
    }.get(result["kind"], expr_text(result["value"]) if result["kind"] == "finite" else result["kind"])
    return (
        f"As {goal['variable']} approaches {expr_text(goal['point'])} {direction}{domain}, "
        f"{expr_text(goal['expression'])} approaches {target}."
    )


def request_preview(request: dict[str, Any]) -> str:
    variables = ", ".join(f"{row['id']} ({type_text(row['type'])})" for row in request["variables"])
    assumptions = [prop_text(row["claim"]) for row in request["assumptions"] if row["scope"] == "root"]
    parts = []
    if variables:
        parts.append(f"Variables: {variables}.")
    if assumptions:
        parts.append("Assume " + "; ".join(assumptions) + ".")
    parts.append("Goal: " + goal_text(request["goal"]))
    return " ".join(parts)
