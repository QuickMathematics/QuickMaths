from __future__ import annotations

from typing import Any

from .authoring import build_text_request, parse_variable_declarations
from .contract import ContractError, normalize_request
from .logic import scope_variable_types
from .parser import parse_expression_text, parse_goal_text, parse_proposition_text
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
        max_seconds=int(message.get("max_seconds", 30)),
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
