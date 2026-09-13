from __future__ import annotations

from typing import Any
import re

from .contract import ContractError, normalize_request
from .parser import parse_goal_text, parse_proposition_text

_SCALAR_TYPES = {"real", "int", "rat", "nat"}


def _authoring_type(value: str) -> str | None:
    text = value.strip().replace(" ", "")
    if text in _SCALAR_TYPES:
        return text
    if re.fullmatch(r"set\[(real|int|rat|nat)\]", text):
        return text
    if re.fullmatch(r"(real|int|rat|nat)->(real|int|rat|nat)", text):
        return text
    return None


def parse_variable_declarations(items: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for item in items:
        if not isinstance(item, str) or ":" not in item:
            raise ContractError("variable declarations must use name:type, for example x:real")
        name, type_name = (part.strip() for part in item.split(":", 1))
        if not name or not name.replace("_", "a").isalnum() or not (name[0].isalpha()):
            raise ContractError(f"invalid variable name {name!r}")
        normalized_type = _authoring_type(type_name)
        if normalized_type is None:
            raise ContractError(
                f"variable {name!r} type must be a scalar, set[scalar], or scalar->scalar function type"
            )
        if name in result:
            raise ContractError(f"duplicate variable declaration {name!r}")
        result[name] = normalized_type
    return result


def build_text_request(
    *,
    request_id: str,
    variables: dict[str, str],
    goal_text: str,
    assumptions: list[str] | None = None,
    allowed_rules: list[str] | None = None,
    max_seconds: int = 30,
) -> dict[str, Any]:
    """Build a typed request from school-style proposition *or limit* text."""
    names = list(variables)
    assumption_rows = []
    for index, text in enumerate(assumptions or [], start=1):
        assumption_rows.append(
            {
                "id": f"h{index}",
                "scope": "root",
                "claim": parse_proposition_text(text, names),
            }
        )
    raw = {
        "version": "0.1",
        "request_id": request_id,
        "variables": [{"id": name, "type": type_name} for name, type_name in variables.items()],
        "scopes": [{"id": "root", "parent": None}],
        "assumptions": assumption_rows,
        "steps": [],
        "goal": parse_goal_text(goal_text, names),
        "policy": {
            "allowed_rules": list(allowed_rules or []),
            "max_seconds": max_seconds,
            "accepted_axioms": ["propext", "Classical.choice", "Quot.sound"],
        },
    }
    return normalize_request(raw)


def build_proposition_request(
    *,
    request_id: str,
    variables: dict[str, str],
    goal_text: str,
    assumptions: list[str] | None = None,
    allowed_rules: list[str] | None = None,
    max_seconds: int = 30,
) -> dict[str, Any]:
    """Compatibility wrapper for callers that still name proposition requests."""
    request = build_text_request(
        request_id=request_id, variables=variables, goal_text=goal_text,
        assumptions=assumptions, allowed_rules=allowed_rules, max_seconds=max_seconds,
    )
    if request["goal"]["kind"] != "proposition":
        raise ContractError("build_proposition_request requires a proposition goal")
    return request
