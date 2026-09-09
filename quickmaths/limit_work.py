"""Strict, tutor-reviewed capture for learner limit work.

This module deliberately does not attempt to prove limits.  ``None`` from
``validate_limit_work`` means the capture is complete enough for tutor review.
"""
from __future__ import annotations

import re
from typing import Any


LIMIT_WORK_MAX_TEXT = 2000
LIMIT_WORK_MAX_STEPS = 16
_FIELDS = {"variable", "approach", "direction", "original_expression", "restrictions"}
_DATA_FIELDS = _FIELDS | {"steps", "result_kind", "result_value"}
_KINDS = {"finite", "positive_infinity", "negative_infinity", "no_common_limit"}


def _text(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > LIMIT_WORK_MAX_TEXT:
        raise ValueError(f"{name} must be non-empty text of at most {LIMIT_WORK_MAX_TEXT} characters")
    return value.strip()


def _keys(value: Any, allowed: set[str]) -> None:
    if not isinstance(value, dict):
        raise ValueError("limit work must be an object")
    unknown = set(value) - allowed
    if unknown:
        raise ValueError(f"unknown limit-work field {sorted(unknown)[0]!r}")


def normalize_limit_spec(value: Any) -> dict[str, Any]:
    _keys(value, _FIELDS)
    direction = value.get("direction")
    if direction not in {"left", "right", "both"}:
        raise ValueError("limit direction must be left, right or both")
    restrictions = value.get("restrictions")
    if not isinstance(restrictions, list) or len(restrictions) > 16:
        raise ValueError("limit restrictions must be a list of at most 16 items")
    return {
        "variable": _text(value.get("variable"), "limit variable"),
        "approach": _text(value.get("approach"), "limit approach"),
        "direction": direction,
        "original_expression": _text(value.get("original_expression"), "original expression"),
        "restrictions": [_text(item, "limit restriction") for item in restrictions],
    }


def _normalize_data(value: Any) -> dict[str, Any]:
    _keys(value, _DATA_FIELDS)
    restrictions = value.get("restrictions")
    steps = value.get("steps")
    if not isinstance(restrictions, list) or len(restrictions) > 16:
        raise ValueError("limit restrictions must be a list of at most 16 items")
    if not isinstance(steps, list) or not 1 <= len(steps) <= LIMIT_WORK_MAX_STEPS:
        raise ValueError("limit work needs 1 to 16 steps")
    result = {key: _text(value.get(key), key.replace("_", " ")) for key in ("variable", "approach", "original_expression")}
    result["direction"] = value.get("direction")
    result["restrictions"] = [_text(item, "limit restriction") for item in restrictions]
    result["steps"] = [_text(item, "limit step") for item in steps]
    result["result_kind"] = value.get("result_kind")
    result_value = value.get("result_value", "")
    if result_value is None:
        result_value = ""
    if result_value != "":
        result_value = _text(result_value, "result value")
    result["result_value"] = result_value
    if result["result_kind"] == "finite" and not result_value:
        raise ValueError("A finite limit needs a non-empty result value")
    return result


def _compact(value: str) -> str:
    return re.sub(r"\s+", "", value)


def validate_limit_work(spec: Any, data: Any) -> str | None:
    try:
        authored = normalize_limit_spec(spec)
    except ValueError as error:
        return str(error)
    try:
        learner = _normalize_data(data)
    except ValueError as error:
        return str(error)
    for field in ("variable", "approach", "direction"):
        if learner[field] != authored[field]:
            return f"Limit {field} must match the authored setup."
    if _compact(learner["original_expression"]) != _compact(authored["original_expression"]):
        return "The original expression must match exactly modulo whitespace."
    if not learner["steps"] or _compact(learner["steps"][0]) != _compact(authored["original_expression"]):
        return "The first work step must restate the original expression before transformations."
    authored_restrictions = {_compact(item) for item in authored["restrictions"]}
    learner_restrictions = {_compact(item) for item in learner["restrictions"]}
    if not authored_restrictions.issubset(learner_restrictions):
        return "Every original restriction must be retained."
    if learner_restrictions - authored_restrictions:
        return "Extra restrictions require tutor review."
    if learner["result_kind"] not in _KINDS:
        return "Result kind must be finite, positive_infinity, negative_infinity, or no_common_limit."
    if learner["result_kind"] == "finite" and not learner["result_value"]:
        return "A finite limit needs a non-empty result value."
    return None
