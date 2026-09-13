from __future__ import annotations

from typing import Any

from .contract import canonical_hash
from .typing import infer_expr_type


def proposition_goal(prop: dict[str, Any]) -> dict[str, Any]:
    return {"kind": "proposition", "proposition": prop}


def proposition_of(goal: dict[str, Any]) -> dict[str, Any] | None:
    return goal.get("proposition") if goal.get("kind") == "proposition" else None


def _expr_free_vars(expr: dict[str, Any]) -> set[str]:
    kind = expr["kind"]
    if kind == "var":
        return {expr["id"]}
    if kind in {"int", "rat"}:
        return set()
    if kind in {"neg", "cast_real", "factorial", "sqrt", "abs", "exp", "log", "sin", "cos"}:
        return _expr_free_vars(expr["arg"])
    if kind == "pow":
        return _expr_free_vars(expr["base"])
    if kind == "rpow":
        return _expr_free_vars(expr["base"]) | _expr_free_vars(expr["exponent"])
    if kind == "pow_nat":
        return _expr_free_vars(expr["base"]) | _expr_free_vars(expr["exponent"])
    if kind == "apply":
        return _expr_free_vars(expr["function"]) | _expr_free_vars(expr["arg"])
    if kind == "if":
        return _prop_free_vars(expr["condition"]) | _expr_free_vars(expr["then"]) | _expr_free_vars(expr["else"])
    return _expr_free_vars(expr["left"]) | _expr_free_vars(expr["right"])


def _prop_free_vars(prop: dict[str, Any]) -> set[str]:
    kind = prop["kind"]
    if kind in {"true", "false"}:
        return set()
    if kind in {"eq", "ne", "lt", "le", "gt", "ge", "mem", "subset"}:
        return _expr_free_vars(prop["left"]) | _expr_free_vars(prop["right"])
    if kind in {"and", "or", "implies", "iff"}:
        return _prop_free_vars(prop["left"]) | _prop_free_vars(prop["right"])
    if kind == "not":
        return _prop_free_vars(prop["arg"])
    if kind in {"forall", "exists"}:
        result = _prop_free_vars(prop["body"])
        result.discard(prop["binder"]["id"])
        return result
    return set()


def _alpha_expr(expr: dict[str, Any], env: dict[str, str]) -> dict[str, Any]:
    kind = expr["kind"]
    if kind == "var":
        return {"kind": "var", "id": env.get(expr["id"], expr["id"])}
    if kind in {"int", "rat"}:
        return dict(expr)
    if kind in {"neg", "cast_real", "factorial", "sqrt", "abs", "exp", "log", "sin", "cos"}:
        return {"kind": kind, "arg": _alpha_expr(expr["arg"], env)}
    if kind == "pow":
        return {"kind": "pow", "base": _alpha_expr(expr["base"], env), "exponent": expr["exponent"]}
    if kind == "rpow":
        return {"kind": "rpow", "base": _alpha_expr(expr["base"], env), "exponent": _alpha_expr(expr["exponent"], env)}
    if kind == "pow_nat":
        return {"kind": "pow_nat", "base": _alpha_expr(expr["base"], env), "exponent": _alpha_expr(expr["exponent"], env)}
    if kind == "apply":
        return {"kind": "apply", "function": _alpha_expr(expr["function"], env), "arg": _alpha_expr(expr["arg"], env)}
    if kind == "if":
        return {
            "kind": "if",
            "condition": _alpha_prop(expr["condition"], env, [len(env)]),
            "then": _alpha_expr(expr["then"], env),
            "else": _alpha_expr(expr["else"], env),
        }
    return {"kind": kind, "left": _alpha_expr(expr["left"], env), "right": _alpha_expr(expr["right"], env)}


def _alpha_prop(prop: dict[str, Any], env: dict[str, str], counter: list[int]) -> dict[str, Any]:
    kind = prop["kind"]
    if kind in {"true", "false"}:
        return {"kind": kind}
    if kind in {"eq", "ne", "lt", "le", "gt", "ge", "mem", "subset"}:
        return {"kind": kind, "left": _alpha_expr(prop["left"], env), "right": _alpha_expr(prop["right"], env)}
    if kind in {"and", "or", "implies", "iff"}:
        return {
            "kind": kind,
            "left": _alpha_prop(prop["left"], env, counter),
            "right": _alpha_prop(prop["right"], env, counter),
        }
    if kind == "not":
        return {"kind": "not", "arg": _alpha_prop(prop["arg"], env, counter)}
    if kind in {"forall", "exists"}:
        token = f"#bound{counter[0]}"
        counter[0] += 1
        nested = dict(env)
        nested[prop["binder"]["id"]] = token
        return {
            "kind": kind,
            "binder": {"id": token, "type": prop["binder"]["type"]},
            "body": _alpha_prop(prop["body"], nested, counter),
        }
    raise ValueError(f"unsupported proposition kind {kind!r}")


def alpha_normalize(prop: dict[str, Any]) -> dict[str, Any]:
    return _alpha_prop(prop, {}, [0])


def same(left: dict[str, Any], right: dict[str, Any]) -> bool:
    prop_kinds = {"true", "false", "eq", "ne", "lt", "le", "gt", "ge", "mem", "subset", "and", "or", "implies", "iff", "not", "forall", "exists"}
    if left.get("kind") in prop_kinds and right.get("kind") in prop_kinds:
        try:
            return canonical_hash(alpha_normalize(left)) == canonical_hash(alpha_normalize(right))
        except (KeyError, ValueError):
            pass
    return canonical_hash(left) == canonical_hash(right)


def substitute_expr(expr: dict[str, Any], variable: str, replacement: dict[str, Any]) -> dict[str, Any]:
    kind = expr["kind"]
    if kind == "var":
        return replacement if expr["id"] == variable else expr
    if kind in {"int", "rat"}:
        return expr
    if kind in {"neg", "cast_real", "factorial", "sqrt", "abs", "exp", "log", "sin", "cos"}:
        return {"kind": kind, "arg": substitute_expr(expr["arg"], variable, replacement)}
    if kind == "pow":
        return {"kind": "pow", "base": substitute_expr(expr["base"], variable, replacement), "exponent": expr["exponent"]}
    if kind == "rpow":
        return {"kind": "rpow", "base": substitute_expr(expr["base"], variable, replacement), "exponent": substitute_expr(expr["exponent"], variable, replacement)}
    if kind == "pow_nat":
        return {"kind": "pow_nat", "base": substitute_expr(expr["base"], variable, replacement), "exponent": substitute_expr(expr["exponent"], variable, replacement)}
    if kind == "apply":
        return {"kind": "apply", "function": substitute_expr(expr["function"], variable, replacement), "arg": substitute_expr(expr["arg"], variable, replacement)}
    if kind == "if":
        return {
            "kind": "if",
            "condition": substitute_prop(expr["condition"], variable, replacement),
            "then": substitute_expr(expr["then"], variable, replacement),
            "else": substitute_expr(expr["else"], variable, replacement),
        }
    return {
        "kind": kind,
        "left": substitute_expr(expr["left"], variable, replacement),
        "right": substitute_expr(expr["right"], variable, replacement),
    }


def substitute_prop(prop: dict[str, Any], variable: str, replacement: dict[str, Any]) -> dict[str, Any]:
    kind = prop["kind"]
    if kind in {"true", "false"}:
        return prop
    if kind in {"eq", "ne", "lt", "le", "gt", "ge", "mem", "subset"}:
        return {
            "kind": kind,
            "left": substitute_expr(prop["left"], variable, replacement),
            "right": substitute_expr(prop["right"], variable, replacement),
        }
    if kind in {"and", "or", "implies", "iff"}:
        return {
            "kind": kind,
            "left": substitute_prop(prop["left"], variable, replacement),
            "right": substitute_prop(prop["right"], variable, replacement),
        }
    if kind == "not":
        return {"kind": "not", "arg": substitute_prop(prop["arg"], variable, replacement)}
    if kind in {"forall", "exists"}:
        binder = dict(prop["binder"])
        binder_id = binder["id"]
        if binder_id == variable:
            return prop
        body = prop["body"]
        replacement_free = _expr_free_vars(replacement)
        if binder_id in replacement_free and variable in _prop_free_vars(body):
            used = _prop_free_vars(body) | replacement_free | {variable, binder_id}
            index = 1
            fresh = f"{binder_id}_{index}"
            while fresh in used:
                index += 1
                fresh = f"{binder_id}_{index}"
            body = substitute_prop(body, binder_id, {"kind": "var", "id": fresh})
            binder["id"] = fresh
        return {
            "kind": kind,
            "binder": binder,
            "body": substitute_prop(body, variable, replacement),
        }
    raise ValueError(f"unsupported proposition kind {kind!r}")


def scope_variable_types(request: dict[str, Any], scope: str = "root") -> dict[str, str]:
    variables = {row["id"]: row["type"] for row in request["variables"]}
    scopes = {row["id"]: row for row in request["scopes"]}
    chain: list[dict[str, Any]] = []
    current: str | None = scope
    while current is not None:
        row = scopes[current]
        chain.append(row)
        current = row["parent"]
    for row in reversed(chain):
        for binder in row.get("binders", []):
            variables[binder["id"]] = binder["type"]
    return variables


def witness_type_compatible(
    request: dict[str, Any],
    binder_type: str,
    witness: dict[str, Any],
    *,
    scope: str = "root",
) -> bool:
    source = infer_expr_type(witness, scope_variable_types(request, scope))
    order = {"nat": 0, "int": 1, "rat": 2, "real": 3}
    return source in order and binder_type in order and order[source] <= order[binder_type]


def find_claim_id(request: dict[str, Any], prop: dict[str, Any], *, scope: str = "root") -> str | None:
    target = canonical_hash(prop)
    for row in request["assumptions"]:
        if row["scope"] == scope and canonical_hash(row["claim"]) == target:
            return row["id"]
    for row in request["steps"]:
        if row["scope"] == scope and row["claim"].get("kind") == "proposition" and canonical_hash(row["claim"]["proposition"]) == target:
            return row["id"]
    return None


def claim_rows(request: dict[str, Any], *, scope: str = "root") -> list[tuple[str, dict[str, Any]]]:
    result: list[tuple[str, dict[str, Any]]] = []
    for row in request["assumptions"]:
        if row["scope"] == scope:
            result.append((row["id"], row["claim"]))
    for row in request["steps"]:
        if row["scope"] == scope and row["claim"].get("kind") == "proposition":
            result.append((row["id"], row["claim"]["proposition"]))
    return result
