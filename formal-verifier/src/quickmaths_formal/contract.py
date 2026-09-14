from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from typing import Any

CONTRACT_VERSION = "0.1"
MAX_DEPTH = 64
MAX_ITEMS = 128
MAX_TEXT = 256
_IDENTIFIER = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")
_TYPES = {"real", "int", "rat", "nat"}
_EXPR_KINDS = {"int", "rat", "var", "neg", "add", "sub", "mul", "div", "mod_nat", "pow", "rpow", "pow_nat", "cast_real", "factorial", "sqrt", "abs", "exp", "log", "sin", "cos", "if", "apply"}
_PROP_BINARY = {"eq", "ne", "lt", "le", "gt", "ge", "mem", "subset"}
_PROP_LOGIC_BINARY = {"and", "or", "implies", "iff"}
_PROP_ATOMIC = {"true", "false"}
_GOAL_KINDS = {"proposition", "limit", "derivative", "sequence_limit", "series_sum"}
_RESULT_KINDS = {"finite", "positive_infinity", "negative_infinity", "no_common_limit"}
_SEQUENCE_RESULT_KINDS = {"finite", "exists_finite", "positive_infinity", "negative_infinity", "no_finite_limit"}
_SERIES_RESULT_KINDS = {"finite", "summable", "not_summable"}
_DISCHARGE_RULES = {"imp_intro", "not_intro", "or_elim", "forall_intro", "exists_elim", "nat_induction"}


class ContractError(ValueError):
    pass


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def canonical_hash(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def _expect_object(value: Any, name: str, *, allowed: set[str] | None = None) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractError(f"{name} must be an object")
    if allowed is not None:
        unknown = sorted(set(value) - allowed)
        if unknown:
            raise ContractError(f"{name} contains unknown field {unknown[0]!r}")
    return value


def _expect_list(value: Any, name: str, *, max_items: int = MAX_ITEMS) -> list[Any]:
    if not isinstance(value, list):
        raise ContractError(f"{name} must be a list")
    if len(value) > max_items:
        raise ContractError(f"{name} may contain at most {max_items} items")
    return value


def _identifier(value: Any, name: str) -> str:
    if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value):
        raise ContractError(f"{name} must be a stable identifier")
    return value


def _short_text(value: Any, name: str, *, allow_empty: bool = False) -> str:
    if not isinstance(value, str) or len(value) > MAX_TEXT or (not allow_empty and not value.strip()):
        qualifier = "text" if allow_empty else "non-empty text"
        raise ContractError(f"{name} must be {qualifier} of at most {MAX_TEXT} characters")
    return value.strip()


def _normalize_type(value: Any, name: str) -> str:
    if not isinstance(value, str):
        raise ContractError(f"{name} must be a type name")
    text = value.strip().replace(" ", "")
    if text in _TYPES:
        return text
    match = re.fullmatch(r"set\[(real|int|rat|nat)\]", text)
    if match:
        return f"set[{match.group(1)}]"
    match = re.fullmatch(r"(real|int|rat|nat)->(real|int|rat|nat)", text)
    if match:
        return f"{match.group(1)}->{match.group(2)}"
    raise ContractError(
        f"{name} must be a scalar type, set[scalar], or scalar->scalar function type"
    )


def _normalize_expr(value: Any, variables: set[str], *, depth: int = 0) -> dict[str, Any]:
    if depth > MAX_DEPTH:
        raise ContractError("expression nesting limit exceeded")
    obj = _expect_object(value, "expression")
    kind = obj.get("kind")
    if kind not in _EXPR_KINDS:
        raise ContractError(f"unsupported expression kind {kind!r}")

    if kind == "int":
        _expect_object(obj, "integer expression", allowed={"kind", "value"})
        number = obj.get("value")
        if not isinstance(number, int) or isinstance(number, bool):
            raise ContractError("integer literal value must be an integer")
        return {"kind": "int", "value": number}

    if kind == "rat":
        _expect_object(obj, "rational expression", allowed={"kind", "numerator", "denominator"})
        numerator, denominator = obj.get("numerator"), obj.get("denominator")
        if not isinstance(numerator, int) or isinstance(numerator, bool):
            raise ContractError("rational numerator must be an integer")
        if not isinstance(denominator, int) or isinstance(denominator, bool) or denominator == 0:
            raise ContractError("rational denominator must be a nonzero integer")
        if denominator < 0:
            numerator, denominator = -numerator, -denominator
        from math import gcd
        divisor = gcd(abs(numerator), denominator)
        return {"kind": "rat", "numerator": numerator // divisor, "denominator": denominator // divisor}

    if kind == "var":
        _expect_object(obj, "variable expression", allowed={"kind", "id"})
        identifier = _identifier(obj.get("id"), "variable reference")
        if identifier not in variables:
            raise ContractError(f"unknown variable {identifier!r}")
        return {"kind": "var", "id": identifier}

    if kind in {"neg", "cast_real", "factorial", "sqrt", "abs", "exp", "log", "sin", "cos"}:
        _expect_object(obj, f"{kind} expression", allowed={"kind", "arg"})
        return {"kind": kind, "arg": _normalize_expr(obj.get("arg"), variables, depth=depth + 1)}

    if kind == "if":
        _expect_object(obj, "piecewise expression", allowed={"kind", "condition", "then", "else"})
        return {
            "kind": "if",
            "condition": _normalize_prop(obj.get("condition"), variables, depth=depth + 1),
            "then": _normalize_expr(obj.get("then"), variables, depth=depth + 1),
            "else": _normalize_expr(obj.get("else"), variables, depth=depth + 1),
        }

    if kind == "apply":
        _expect_object(obj, "function application", allowed={"kind", "function", "arg"})
        return {
            "kind": "apply",
            "function": _normalize_expr(obj.get("function"), variables, depth=depth + 1),
            "arg": _normalize_expr(obj.get("arg"), variables, depth=depth + 1),
        }

    if kind == "pow":
        _expect_object(obj, "power expression", allowed={"kind", "base", "exponent"})
        exponent = obj.get("exponent")
        if not isinstance(exponent, int) or isinstance(exponent, bool) or exponent < 0 or exponent > 64:
            raise ContractError("power exponent must be an integer from 0 to 64")
        return {
            "kind": "pow",
            "base": _normalize_expr(obj.get("base"), variables, depth=depth + 1),
            "exponent": exponent,
        }

    if kind == "rpow":
        _expect_object(obj, "real-exponent power expression", allowed={"kind", "base", "exponent"})
        return {
            "kind": "rpow",
            "base": _normalize_expr(obj.get("base"), variables, depth=depth + 1),
            "exponent": _normalize_expr(obj.get("exponent"), variables, depth=depth + 1),
        }

    if kind == "pow_nat":
        _expect_object(obj, "natural-exponent power expression", allowed={"kind", "base", "exponent"})
        return {
            "kind": "pow_nat",
            "base": _normalize_expr(obj.get("base"), variables, depth=depth + 1),
            "exponent": _normalize_expr(obj.get("exponent"), variables, depth=depth + 1),
        }

    _expect_object(obj, f"{kind} expression", allowed={"kind", "left", "right"})
    return {
        "kind": kind,
        "left": _normalize_expr(obj.get("left"), variables, depth=depth + 1),
        "right": _normalize_expr(obj.get("right"), variables, depth=depth + 1),
    }


def _normalize_prop(value: Any, variables: set[str], *, depth: int = 0) -> dict[str, Any]:
    if depth > MAX_DEPTH:
        raise ContractError("proposition nesting limit exceeded")
    obj = _expect_object(value, "proposition")
    kind = obj.get("kind")

    if kind in _PROP_ATOMIC:
        _expect_object(obj, f"{kind} proposition", allowed={"kind"})
        return {"kind": kind}

    if kind in _PROP_BINARY:
        _expect_object(obj, f"{kind} proposition", allowed={"kind", "left", "right"})
        return {
            "kind": kind,
            "left": _normalize_expr(obj.get("left"), variables, depth=depth + 1),
            "right": _normalize_expr(obj.get("right"), variables, depth=depth + 1),
        }

    if kind in _PROP_LOGIC_BINARY:
        _expect_object(obj, f"{kind} proposition", allowed={"kind", "left", "right"})
        return {
            "kind": kind,
            "left": _normalize_prop(obj.get("left"), variables, depth=depth + 1),
            "right": _normalize_prop(obj.get("right"), variables, depth=depth + 1),
        }

    if kind == "not":
        _expect_object(obj, "not proposition", allowed={"kind", "arg"})
        return {"kind": "not", "arg": _normalize_prop(obj.get("arg"), variables, depth=depth + 1)}

    if kind in {"forall", "exists"}:
        _expect_object(obj, f"{kind} proposition", allowed={"kind", "binder", "body"})
        binder = _expect_object(obj.get("binder"), "binder", allowed={"id", "type"})
        binder_id = _identifier(binder.get("id"), "binder id")
        if binder_id in variables:
            raise ContractError(f"binder {binder_id!r} shadows an existing variable")
        binder_type = _normalize_type(binder.get("type"), "binder type")
        nested = set(variables)
        nested.add(binder_id)
        return {
            "kind": kind,
            "binder": {"id": binder_id, "type": binder_type},
            "body": _normalize_prop(obj.get("body"), nested, depth=depth + 1),
        }

    raise ContractError(f"unsupported proposition kind {kind!r}")


def _normalize_goal(value: Any, variables: set[str]) -> dict[str, Any]:
    obj = _expect_object(value, "goal")
    kind = obj.get("kind")
    if kind not in _GOAL_KINDS:
        raise ContractError(f"unsupported goal kind {kind!r}")

    if kind == "proposition":
        _expect_object(obj, "proposition goal", allowed={"kind", "proposition"})
        return {"kind": "proposition", "proposition": _normalize_prop(obj.get("proposition"), variables)}

    if kind == "series_sum":
        _expect_object(obj, "series sum goal", allowed={"kind", "variable", "expression", "result"})
        variable = _identifier(obj.get("variable"), "series index variable")
        if variable not in variables:
            raise ContractError(f"unknown series index variable {variable!r}")
        result = _expect_object(obj.get("result"), "series result", allowed={"kind", "value"})
        result_kind = result.get("kind")
        if result_kind not in _SERIES_RESULT_KINDS:
            raise ContractError(f"unsupported series result kind {result_kind!r}")
        normalized_result: dict[str, Any] = {"kind": result_kind}
        if result_kind == "finite":
            normalized_result["value"] = _normalize_expr(result.get("value"), variables)
            if variable in _expr_variable_ids(normalized_result["value"]):
                raise ContractError("finite series sum must not depend on the bound series index")
        elif "value" in result:
            raise ContractError(f"series result kind {result_kind!r} must not provide a value")
        return {
            "kind": "series_sum",
            "variable": variable,
            "expression": _normalize_expr(obj.get("expression"), variables),
            "result": normalized_result,
        }

    if kind == "sequence_limit":
        _expect_object(
            obj,
            "sequence limit goal",
            allowed={"kind", "variable", "expression", "result"},
        )
        variable = _identifier(obj.get("variable"), "sequence index variable")
        if variable not in variables:
            raise ContractError(f"unknown sequence index variable {variable!r}")
        result = _expect_object(obj.get("result"), "sequence result", allowed={"kind", "value"})
        result_kind = result.get("kind")
        if result_kind not in _SEQUENCE_RESULT_KINDS:
            raise ContractError(f"unsupported sequence result kind {result_kind!r}")
        normalized_result: dict[str, Any] = {"kind": result_kind}
        if result_kind == "finite":
            normalized_result["value"] = _normalize_expr(result.get("value"), variables)
            if variable in _expr_variable_ids(normalized_result["value"]):
                raise ContractError("finite sequence limit must not depend on the bound sequence index")
        elif "value" in result:
            raise ContractError(f"sequence result kind {result_kind!r} must not provide a value")
        return {
            "kind": "sequence_limit",
            "variable": variable,
            "expression": _normalize_expr(obj.get("expression"), variables),
            "result": normalized_result,
        }

    if kind == "derivative":
        _expect_object(
            obj,
            "derivative goal",
            allowed={"kind", "variable", "expression", "point", "result"},
        )
        variable = _identifier(obj.get("variable"), "derivative variable")
        if variable not in variables:
            raise ContractError(f"unknown derivative variable {variable!r}")
        expression = _normalize_expr(obj.get("expression"), variables)
        point = _normalize_expr(obj.get("point"), variables)
        result = _normalize_expr(obj.get("result"), variables)
        if variable in _expr_variable_ids(point):
            raise ContractError("derivative evaluation point must not depend on the bound differentiation variable")
        if variable in _expr_variable_ids(result):
            raise ContractError(
                "derivative result at a point must not contain the bound differentiation variable; "
                "use a separate declared point variable for a general formula"
            )
        return {
            "kind": "derivative",
            "variable": variable,
            "expression": expression,
            "point": point,
            "result": result,
        }

    _expect_object(
        obj,
        "limit goal",
        allowed={"kind", "variable", "expression", "point", "direction", "domain", "result"},
    )
    variable = _identifier(obj.get("variable"), "limit variable")
    if variable not in variables:
        raise ContractError(f"unknown limit variable {variable!r}")
    direction = obj.get("direction")
    if direction not in {"left", "right", "both"}:
        raise ContractError("limit direction must be left, right or both")
    domain = [_normalize_prop(item, variables) for item in _expect_list(obj.get("domain", []), "limit domain", max_items=16)]
    result = _expect_object(obj.get("result"), "limit result", allowed={"kind", "value"})
    result_kind = result.get("kind")
    if result_kind not in _RESULT_KINDS:
        raise ContractError(f"unsupported limit result kind {result_kind!r}")
    normalized_result: dict[str, Any] = {"kind": result_kind}
    if result_kind == "finite":
        normalized_result["value"] = _normalize_expr(result.get("value"), variables)
    elif "value" in result:
        raise ContractError(f"limit result kind {result_kind!r} must not provide a value")
    expression = _normalize_expr(obj.get("expression"), variables)
    point = _normalize_expr(obj.get("point"), variables)
    if variable in _expr_variable_ids(point):
        raise ContractError("limit approach point must not depend on the bound limit variable")
    normalized = {
        "kind": "limit",
        "variable": variable,
        "expression": expression,
        "point": point,
        "direction": direction,
        "domain": domain,
        "result": normalized_result,
    }
    if result_kind == "finite" and variable in _expr_variable_ids(normalized_result["value"]):
        raise ContractError("finite limit result must not depend on the bound limit variable")
    return normalized



def _expr_variable_ids(expr: dict[str, Any]) -> set[str]:
    kind = expr["kind"]
    if kind == "var":
        return {expr["id"]}
    if kind in {"int", "rat"}:
        return set()
    if kind in {"neg", "cast_real", "factorial", "sqrt", "abs", "exp", "log", "sin", "cos"}:
        return _expr_variable_ids(expr["arg"])
    if kind == "pow":
        return _expr_variable_ids(expr["base"])
    if kind == "rpow":
        return _expr_variable_ids(expr["base"]) | _expr_variable_ids(expr["exponent"])
    if kind == "pow_nat":
        return _expr_variable_ids(expr["base"]) | _expr_variable_ids(expr["exponent"])
    if kind == "apply":
        return _expr_variable_ids(expr["function"]) | _expr_variable_ids(expr["arg"])
    if kind == "if":
        return _prop_variable_ids(expr["condition"]) | _expr_variable_ids(expr["then"]) | _expr_variable_ids(expr["else"])
    return _expr_variable_ids(expr["left"]) | _expr_variable_ids(expr["right"])


def _prop_variable_ids(prop: dict[str, Any]) -> set[str]:
    kind = prop["kind"]
    if kind in _PROP_ATOMIC:
        return set()
    if kind in _PROP_BINARY:
        return _expr_variable_ids(prop["left"]) | _expr_variable_ids(prop["right"])
    if kind in _PROP_LOGIC_BINARY:
        return _prop_variable_ids(prop["left"]) | _prop_variable_ids(prop["right"])
    if kind == "not":
        return _prop_variable_ids(prop["arg"])
    if kind in {"forall", "exists"}:
        result = _prop_variable_ids(prop["body"])
        result.discard(prop["binder"]["id"] )
        return result
    return set()

def _scope_ancestors(scopes: dict[str, str | None], scope: str) -> set[str]:
    result: set[str] = set()
    current: str | None = scope
    while current is not None:
        if current in result:
            raise ContractError("scope graph contains a cycle")
        result.add(current)
        current = scopes.get(current)
    return result



_EXPR_PARAMETER_KEYS = {
    "guarded_cancel": {"divisor"},
    "sqrt_square_nonnegative": {"argument"},
    "conjugate_identity": {"radicand"},
    "rational_hole_limit": {"simplified"},
    "add_both_sides": {"term"},
    "subtract_both_sides": {"term"},
    "multiply_both_sides": {"term"},
    "divide_both_sides": {"term"},
    "add_inequality": {"term"},
    "scale_inequality_positive": {"factor"},
    "scale_inequality_negative": {"factor"},
    "exists_intro": {"witness"},
    "forall_elim": {"witness"},
}
_STRING_PARAMETER_KEYS = {
    "inverse_one_sided_limit": {"direction"},
}

def _normalize_parameters(rule: str, value: Any, variables: set[str]) -> dict[str, Any]:
    raw = _expect_object(value, f"{rule} parameters")
    expr_keys = _EXPR_PARAMETER_KEYS.get(rule, set())
    string_keys = _STRING_PARAMETER_KEYS.get(rule, set())
    allowed = expr_keys | string_keys
    unknown = sorted(set(raw) - allowed)
    if unknown:
        raise ContractError(f"rule {rule!r} contains unknown parameter {unknown[0]!r}")
    result: dict[str, Any] = {}
    for key in expr_keys:
        if key in raw:
            result[key] = _normalize_expr(raw[key], variables)
    for key in string_keys:
        if key in raw:
            text = _short_text(raw[key], f"{rule} parameter {key}")
            if key == "direction" and text not in {"left", "right"}:
                raise ContractError("inverse one-sided limit direction must be left or right")
            result[key] = text
    return result

def normalize_request(value: Any) -> dict[str, Any]:
    request = _expect_object(
        deepcopy(value),
        "proof request",
        allowed={"version", "request_id", "variables", "scopes", "assumptions", "steps", "goal", "policy"},
    )
    if request.get("version") != CONTRACT_VERSION:
        raise ContractError(f"proof request version must be {CONTRACT_VERSION!r}")
    request_id = _short_text(request.get("request_id"), "request id")

    variable_rows = _expect_list(request.get("variables", []), "variables", max_items=32)
    variables: list[dict[str, str]] = []
    variable_ids: set[str] = set()
    for index, raw in enumerate(variable_rows):
        row = _expect_object(raw, f"variable {index + 1}", allowed={"id", "type"})
        identifier = _identifier(row.get("id"), f"variable {index + 1} id")
        if identifier in variable_ids:
            raise ContractError(f"duplicate variable {identifier!r}")
        variable_ids.add(identifier)
        variables.append({"id": identifier, "type": _normalize_type(row.get("type"), f"variable {identifier} type")})

    raw_scopes = _expect_list(request.get("scopes", [{"id": "root", "parent": None}]), "scopes", max_items=32)
    scopes: list[dict[str, Any]] = []
    scope_map: dict[str, str | None] = {}
    scope_binders: dict[str, list[dict[str, str]]] = {}
    binder_ids: set[str] = set()
    for index, raw in enumerate(raw_scopes):
        row = _expect_object(raw, f"scope {index + 1}", allowed={"id", "parent", "binders"})
        identifier = _identifier(row.get("id"), f"scope {index + 1} id")
        parent = row.get("parent")
        if parent is not None:
            parent = _identifier(parent, f"scope {identifier} parent")
        if identifier in scope_map:
            raise ContractError(f"duplicate scope {identifier!r}")
        binders: list[dict[str, str]] = []
        for binder_index, binder_raw in enumerate(_expect_list(row.get("binders", []), f"scope {identifier} binders", max_items=8)):
            binder = _expect_object(binder_raw, f"scope {identifier} binder {binder_index + 1}", allowed={"id", "type"})
            binder_id = _identifier(binder.get("id"), f"scope {identifier} binder id")
            if binder_id in variable_ids or binder_id in binder_ids:
                raise ContractError(f"scope binder {binder_id!r} must be globally unique and must not shadow a problem variable")
            binder_ids.add(binder_id)
            binders.append({"id": binder_id, "type": _normalize_type(binder.get("type"), f"scope binder {binder_id} type")})
        scope_map[identifier] = parent
        scope_binders[identifier] = binders
        scopes.append({"id": identifier, "parent": parent, "binders": binders})
    if "root" not in scope_map or scope_map["root"] is not None:
        raise ContractError("scopes must contain root with parent null")
    for identifier, parent in scope_map.items():
        if parent is not None and parent not in scope_map:
            raise ContractError(f"scope {identifier!r} has unknown parent {parent!r}")
        _scope_ancestors(scope_map, identifier)

    def variables_for_scope(scope: str) -> set[str]:
        result = set(variable_ids)
        current: str | None = scope
        while current is not None:
            result.update(row["id"] for row in scope_binders.get(current, []))
            current = scope_map[current]
        return result

    assumptions: list[dict[str, Any]] = []
    known: dict[str, tuple[str, dict[str, Any]]] = {}
    for index, raw in enumerate(_expect_list(request.get("assumptions", []), "assumptions", max_items=64)):
        row = _expect_object(raw, f"assumption {index + 1}", allowed={"id", "scope", "claim"})
        identifier = _identifier(row.get("id"), f"assumption {index + 1} id")
        scope = _identifier(row.get("scope", "root"), f"assumption {identifier} scope")
        if scope not in scope_map:
            raise ContractError(f"assumption {identifier!r} uses unknown scope {scope!r}")
        if identifier in known:
            raise ContractError(f"duplicate proof node {identifier!r}")
        claim = _normalize_prop(row.get("claim"), variables_for_scope(scope))
        assumptions.append({"id": identifier, "scope": scope, "claim": claim})
        known[identifier] = (scope, claim)

    policy_raw = _expect_object(
        request.get("policy", {}),
        "policy",
        allowed={"allowed_rules", "max_seconds", "accepted_axioms"},
    )
    allowed_rules = [_short_text(item, "allowed rule") for item in _expect_list(policy_raw.get("allowed_rules", []), "allowed rules", max_items=64)]
    max_seconds = policy_raw.get("max_seconds", 60)
    if not isinstance(max_seconds, int) or isinstance(max_seconds, bool) or not 1 <= max_seconds <= 60:
        raise ContractError("policy max_seconds must be an integer from 1 to 60")
    accepted_axioms = [_short_text(item, "accepted axiom") for item in _expect_list(policy_raw.get("accepted_axioms", ["propext", "Classical.choice", "Quot.sound"]), "accepted axioms", max_items=16)]
    if set(accepted_axioms) - {"propext", "Classical.choice", "Quot.sound"}:
        raise ContractError("accepted_axioms may only restrict the trusted foundation, never extend it")
    policy = {
        "allowed_rules": allowed_rules,
        "max_seconds": max_seconds,
        "accepted_axioms": accepted_axioms,
    }

    steps: list[dict[str, Any]] = []
    for index, raw in enumerate(_expect_list(request.get("steps", []), "steps", max_items=MAX_ITEMS)):
        row = _expect_object(raw, f"step {index + 1}", allowed={"id", "scope", "claim", "rule", "premises", "parameters"})
        identifier = _identifier(row.get("id"), f"step {index + 1} id")
        if identifier in known:
            raise ContractError(f"duplicate proof node {identifier!r}")
        scope = _identifier(row.get("scope", "root"), f"step {identifier} scope")
        if scope not in scope_map:
            raise ContractError(f"step {identifier!r} uses unknown scope {scope!r}")
        rule = _short_text(row.get("rule"), f"step {identifier} rule")
        if allowed_rules and rule not in allowed_rules:
            raise ContractError(f"step {identifier!r} uses rule {rule!r} outside policy")
        premises = [_identifier(item, f"step {identifier} premise") for item in _expect_list(row.get("premises", []), f"step {identifier} premises", max_items=32)]
        ancestors = _scope_ancestors(scope_map, scope)
        for premise in premises:
            if premise not in known:
                raise ContractError(f"step {identifier!r} references later or unknown premise {premise!r}")
            premise_scope, _ = known[premise]
            if premise_scope not in ancestors:
                direct_child_discharge = rule in _DISCHARGE_RULES and scope_map.get(premise_scope) == scope
                if not direct_child_discharge:
                    raise ContractError(f"step {identifier!r} leaks premise {premise!r} from scope {premise_scope!r}")
        scoped_variables = variables_for_scope(scope)
        params = _normalize_parameters(rule, row.get("parameters", {}), scoped_variables)
        claim_raw = row.get("claim")
        if not isinstance(claim_raw, dict):
            raise ContractError(f"step {identifier} claim must be an object")
        claim = _normalize_goal(claim_raw, scoped_variables) if claim_raw.get("kind") in _GOAL_KINDS else {
            "kind": "proposition",
            "proposition": _normalize_prop(claim_raw, scoped_variables),
        }
        normalized = {
            "id": identifier,
            "scope": scope,
            "claim": claim,
            "rule": rule,
            "premises": premises,
            "parameters": params,
        }
        steps.append(normalized)
        known[identifier] = (scope, claim)

    goal = _normalize_goal(request.get("goal"), variable_ids)
    if goal["kind"] in {"limit", "derivative", "sequence_limit", "series_sum"}:
        bound = goal["variable"]
        for row in assumptions:
            if row["scope"] == "root" and bound in _prop_variable_ids(row["claim"]):
                if goal["kind"] == "limit":
                    raise ContractError(
                        f"root assumption {row['id']!r} refers to the limit variable {bound!r}; "
                        "put pointwise approach restrictions in goal.domain instead"
                    )
                if goal["kind"] == "sequence_limit":
                    raise ContractError(
                        f"root assumption {row['id']!r} refers to the bound sequence index {bound!r}; "
                        "state sequence-wide evidence with an explicit quantifier instead"
                    )
                if goal["kind"] == "series_sum":
                    raise ContractError(
                        f"root assumption {row['id']!r} refers to the bound series index {bound!r}; "
                        "state termwise series evidence with an explicit quantifier instead"
                    )
                raise ContractError(
                    f"root assumption {row['id']!r} refers to the bound differentiation variable {bound!r}; "
                    "state hypotheses about the evaluation point using a separate declared variable"
                )
    normalized_request = {
        "version": CONTRACT_VERSION,
        "request_id": request_id,
        "variables": variables,
        "scopes": scopes,
        "assumptions": assumptions,
        "steps": steps,
        "goal": goal,
        "policy": policy,
    }
    # Structural normalization and mathematical typing are deliberately separate:
    # the former protects the parser boundary, while this pass rejects expressions
    # whose numeric meaning would otherwise be ambiguous (notably integer division).
    from .typing import TypeCheckError, validate_request_types

    try:
        validate_request_types(normalized_request)
    except TypeCheckError as exc:
        raise ContractError(str(exc)) from exc
    return normalized_request
