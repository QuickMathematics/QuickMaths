from __future__ import annotations

from typing import Any

from .authoring import build_text_request, parse_variable_declarations
from .contract import ContractError, normalize_request
from .logic import scope_variable_types
from .parser import parse_expression_text, parse_goal_text, parse_proposition_text
from .rules import preflight
from .state import build_proof_state, proof_state_to_dict

_EXPR_PARAMETER_KEYS = {
    "term",
    "divisor",
    "argument",
    "radicand",
    "witness",
    "simplified",
    "factor",
}


def _list_of_strings(value: Any, name: str) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        raise ContractError(f"{name} must be a list of identifiers/text values")
    return list(value)


def new_text_request(message: dict[str, Any]) -> dict[str, Any]:
    declarations = _list_of_strings(message.get("declarations", []), "declarations")
    assumptions = _list_of_strings(message.get("assumptions", []), "assumptions")
    rules = _list_of_strings(message.get("allowed_rules", []), "allowed_rules")
    goal = message.get("goal")
    if not isinstance(goal, str):
        raise ContractError("goal must be formal proposition or limit text")
    request = build_text_request(
        request_id=str(message.get("request_id", "interactive-proof")),
        variables=parse_variable_declarations(declarations),
        goal_text=goal,
        assumptions=assumptions,
        allowed_rules=rules,
        max_seconds=int(message.get("max_seconds", 60)),
    )
    return {
        "request": request,
        "proof_state": proof_state_to_dict(build_proof_state(request)),
    }


def _visible_variable_names(request: dict[str, Any], scope: str) -> list[str]:
    try:
        return list(scope_variable_types(request, scope))
    except KeyError as exc:
        raise ContractError(f"unknown proof scope {scope!r}") from exc


def _normalize_text_parameters(
    request: dict[str, Any], scope: str, parameters: Any
) -> dict[str, Any]:
    if parameters is None:
        return {}
    if not isinstance(parameters, dict):
        raise ContractError("step parameters must be an object")
    variables = _visible_variable_names(request, scope)
    result: dict[str, Any] = {}
    for key, value in parameters.items():
        if key in _EXPR_PARAMETER_KEYS and isinstance(value, str):
            result[key] = parse_expression_text(value, variables)
        else:
            result[key] = value
    return result


def _next_step_id(request: dict[str, Any]) -> str:
    used = {
        *(row["id"] for row in request["assumptions"]),
        *(row["id"] for row in request["steps"]),
        *(row["id"] for row in request["scopes"]),
    }
    index = 1
    while f"user_step_{index}" in used:
        index += 1
    return f"user_step_{index}"


def append_text_step(message: dict[str, Any]) -> dict[str, Any]:
    request = normalize_request(message.get("request"))
    scope = str(message.get("scope", "root"))
    variables = _visible_variable_names(request, scope)
    claim_text = message.get("claim")
    if not isinstance(claim_text, str):
        raise ContractError("step claim must be proposition text")
    rule = message.get("rule")
    if not isinstance(rule, str) or not rule.strip():
        raise ContractError("step rule must be a non-empty rule name")
    premises = _list_of_strings(message.get("premises", []), "premises")
    step_id = message.get("step_id")
    if step_id is None:
        step_id = _next_step_id(request)
    elif not isinstance(step_id, str):
        raise ContractError("step_id must be a stable identifier")
    parameters = _normalize_text_parameters(request, scope, message.get("parameters", {}))
    step = {
        "id": step_id,
        "scope": scope,
        "claim": parse_goal_text(claim_text, variables),
        "rule": rule.strip(),
        "premises": premises,
        "parameters": parameters,
    }
    augmented = normalize_request({**request, "steps": [*request["steps"], step]})
    return {
        "request": augmented,
        "added_step": step,
        "proof_state": proof_state_to_dict(build_proof_state(augmented)),
    }



def _next_id(request: dict[str, Any], prefix: str) -> str:
    used = {*(row["id"] for row in request["assumptions"]), *(row["id"] for row in request["steps"]), *(row["id"] for row in request["scopes"])}
    index = 1
    while f"{prefix}_{index}" in used:
        index += 1
    return f"{prefix}_{index}"


def _visible_node(request: dict[str, Any], node_id: str, scope: str) -> dict[str, Any]:
    parents = {row["id"]: row["parent"] for row in request["scopes"]}
    visible = set()
    current = scope
    while current is not None:
        visible.add(current)
        current = parents.get(current)
    for row in [*request["assumptions"], *request["steps"]]:
        if row["id"] == node_id:
            if row["scope"] not in visible:
                raise ContractError(f"premise {node_id!r} is not visible from scope {scope!r}")
            return row
    raise ContractError(f"unknown premise {node_id!r}")


def open_text_subproof(message: dict[str, Any]) -> dict[str, Any]:
    request = normalize_request(message.get("request"))
    parent_scope = message.get("parent_scope", "root")
    if not isinstance(parent_scope, str) or not parent_scope:
        raise ContractError("parent_scope must be a proof scope identifier")
    _visible_variable_names(request, parent_scope)
    kind = message.get("kind")
    if kind not in {"assumption", "arbitrary", "cases"}:
        raise ContractError("subproof kind must be assumption, arbitrary, or cases")
    declarations = _list_of_strings(message.get("declarations", []), "declarations")
    parsed = parse_variable_declarations(declarations)
    premise_id = message.get("premise_id")
    assumption_text = message.get("assumption")
    branches = []
    if kind == "cases":
        if not isinstance(premise_id, str) or declarations or assumption_text is not None:
            raise ContractError("cases subproofs require only a visible disjunction premise_id")
        source = _visible_node(request, premise_id, parent_scope)
        proposition = source["claim"].get("proposition") if source["claim"].get("kind") == "proposition" else source["claim"]
        if proposition.get("kind") != "or":
            raise ContractError("cases premise must be a visible disjunction")
        branches = [proposition["left"], proposition["right"]]
    else:
        if assumption_text is not None and not isinstance(assumption_text, str):
            raise ContractError("assumption must be proposition text")
        if kind == "assumption" and not assumption_text:
            raise ContractError("assumption subproofs require assumption text")
        if assumption_text:
            variables = list(scope_variable_types(request, parent_scope)) + list(parsed)
            branches = [parse_proposition_text(assumption_text, variables)]
    scopes = list(request["scopes"])
    assumptions = list(request["assumptions"])
    opened_scopes = []
    assumption_ids = []
    for branch in (branches if kind == "cases" else [branches[0]] if branches else [None]):
        scope_id = _next_id({**request, "scopes": scopes, "assumptions": assumptions}, "user_scope")
        scopes.append({"id": scope_id, "parent": parent_scope, "binders": [{"id": name, "type": type_name} for name, type_name in parsed.items()]})
        opened_scopes.append(scope_id)
        if branch is not None:
            assumption_id = _next_id({**request, "scopes": scopes, "assumptions": assumptions}, "user_assumption")
            assumptions.append({"id": assumption_id, "scope": scope_id, "claim": branch})
            assumption_ids.append(assumption_id)
    augmented = normalize_request({**request, "scopes": scopes, "assumptions": assumptions})
    return {"request": augmented, "proof_state": proof_state_to_dict(build_proof_state(augmented)), "opened_scope": opened_scopes[0], "opened_scopes": opened_scopes, "assumption_ids": assumption_ids}


def close_text_subproof(message: dict[str, Any]) -> dict[str, Any]:
    request = normalize_request(message.get("request"))
    scope = message.get("scope")
    if not isinstance(scope, str) or scope == "root":
        raise ContractError("scope must identify a non-root subproof")
    scope_rows = {row["id"]: row for row in request["scopes"]}
    if scope not in scope_rows:
        raise ContractError(f"unknown proof scope {scope!r}")
    parent = scope_rows[scope]["parent"]
    if parent is None:
        raise ContractError("root scope cannot be closed")
    rule = message.get("rule")
    if rule not in {"imp_intro", "not_intro", "or_elim", "forall_intro", "exists_elim", "nat_induction"}:
        raise ContractError("close_text_subproof only accepts native discharge rules")
    premises = _list_of_strings(message.get("premises", []), "premises")
    node_scope = {row["id"]: row["scope"] for row in [*request["assumptions"], *request["steps"]]}
    if not any(node_scope.get(premise) == scope for premise in premises):
        raise ContractError(f"close_text_subproof must cite a premise from selected scope {scope!r}")
    result = append_text_step({"request": request, "scope": parent, "claim": message.get("claim"), "rule": rule, "premises": premises, "parameters": message.get("parameters", {}), "step_id": message.get("step_id")})
    added_id = result["added_step"]["id"]
    obligations = [item for item in preflight(result["request"]) if item.step_id == added_id]
    if obligations:
        raise ContractError("invalid subproof discharge: " + "; ".join(item.message for item in obligations))
    return result
def replace_text_step(message: dict[str, Any]) -> dict[str, Any]:
    """Replace one claim in place; preserve IDs and recheck all dependent steps."""
    request = normalize_request(message.get("request"))
    step_id = message.get("step_id")
    index = next((i for i, row in enumerate(request["steps"]) if row["id"] == step_id), None)
    if index is None:
        raise ContractError("step_id must identify an existing proof step")
    previous = request["steps"][index]
    if message.get("scope", previous["scope"]) != previous["scope"]:
        raise ContractError("editing a step cannot change its proof scope")
    # Parsing against the preceding prefix forbids circular and forward citations.
    changed = append_text_step({
        **message, "request": {**request, "steps": request["steps"][:index]},
        "step_id": step_id, "scope": previous["scope"],
    })
    replaced = normalize_request({
        **request, "steps": [*changed["request"]["steps"], *request["steps"][index + 1:]],
    })
    return {
        "request": replaced,
        "replaced_step": changed["added_step"],
        "proof_state": proof_state_to_dict(build_proof_state(replaced)),
    }
