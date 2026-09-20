"""Declarative formal-proof metadata for QuickMaths lesson questions.

This module intentionally does not prove anything.  It provides the small,
versioned authoring contract shared by lesson loading and problem generation.
The isolated formal verifier remains the only component that may turn a
resolved specification into mathematical verification evidence.
"""
from __future__ import annotations

from copy import deepcopy
import re
from typing import Any

from quickmaths.utils import SafeExpressionError, render_template


FORMAL_PROOF_SPEC_VERSION = "0.1"
_MAX_TEXT = 2_000
_MAX_DECLARATIONS = 32
_MAX_ASSUMPTIONS = 64
_MAX_RULES = 64
_MAX_PUBLIC_PARAMETERS = 32
FORMAL_CAPABILITY_IDS = ("algebra", "limits", "derivatives", "sequences-series", "radicals")

_TOP_LEVEL_FIELDS = {
    "version",
    "statement",
    "parameter_contract",
    "allowed_rules",
    "assessment_policy",
    "reference_proof",
    "environment",
    "capabilities",
}
_STATEMENT_FIELDS = {"declarations", "assumptions", "goal"}
_PARAMETER_FIELDS = {"required_public"}
_ENVIRONMENT_FIELDS = {"backend", "toolchain", "library", "library_revision"}
_REFERENCE_FIELDS = {"mode", "steps"}
_REFERENCE_STEP_FIELDS = {"claim", "rule", "premises", "parameters", "scope"}
_MAX_REFERENCE_STEPS = 128
_MAX_PREMISES = 32


def normalize_proof_spec(value: Any) -> dict[str, Any]:
    """Validate and copy an opt-in lesson proof specification.

    Empty input means the question has no formal mode.  The contract is kept
    deliberately smaller than the verifier protocol: authors write ordinary
    school-style declarations and statements, while the verifier owns parsing,
    mathematical typing, scopes, domains and proof checking.
    """

    if value in (None, {}):
        return {}
    if not isinstance(value, dict):
        raise ValueError("proof_spec must be an object")
    _reject_unknown(value, _TOP_LEVEL_FIELDS, "proof_spec")

    version = value.get("version")
    if version != FORMAL_PROOF_SPEC_VERSION:
        raise ValueError(f"proof_spec.version must be {FORMAL_PROOF_SPEC_VERSION!r}")

    statement = value.get("statement")
    if not isinstance(statement, dict):
        raise ValueError("proof_spec.statement must be an object")
    _reject_unknown(statement, _STATEMENT_FIELDS, "proof_spec.statement")

    declarations = _text_list(statement.get("declarations", []), "proof_spec.statement.declarations", _MAX_DECLARATIONS)
    assumptions = _text_list(statement.get("assumptions", []), "proof_spec.statement.assumptions", _MAX_ASSUMPTIONS)
    goal = _text(statement.get("goal"), "proof_spec.statement.goal")

    parameter_contract = value.get("parameter_contract", {})
    if not isinstance(parameter_contract, dict):
        raise ValueError("proof_spec.parameter_contract must be an object")
    _reject_unknown(parameter_contract, _PARAMETER_FIELDS, "proof_spec.parameter_contract")
    required_public = _identifier_list(
        parameter_contract.get("required_public", []),
        "proof_spec.parameter_contract.required_public",
        _MAX_PUBLIC_PARAMETERS,
    )

    allowed_rules = _identifier_list(value.get("allowed_rules", []), "proof_spec.allowed_rules", _MAX_RULES)

    assessment_policy = value.get("assessment_policy", {})
    if not isinstance(assessment_policy, dict):
        raise ValueError("proof_spec.assessment_policy must be an object")

    reference_proof = _normalize_reference_proof(value.get("reference_proof", {}))

    environment = value.get("environment", {})
    if not isinstance(environment, dict):
        raise ValueError("proof_spec.environment must be an object")
    _reject_unknown(environment, _ENVIRONMENT_FIELDS, "proof_spec.environment")
    normalized_environment = {
        key: _text(item, f"proof_spec.environment.{key}")
        for key, item in environment.items()
    }

    capabilities = None
    if "capabilities" in value:
        capabilities = normalize_capabilities(
            value["capabilities"],
            statement={"declarations": declarations, "assumptions": assumptions, "goal": goal},
            allowed_rules=allowed_rules,
        )

    normalized = {
        "version": FORMAL_PROOF_SPEC_VERSION,
        "statement": {
            "declarations": declarations,
            "assumptions": assumptions,
            "goal": goal,
        },
        "parameter_contract": {"required_public": required_public},
        "allowed_rules": allowed_rules,
        "assessment_policy": deepcopy(assessment_policy),
        "reference_proof": reference_proof,
        "environment": normalized_environment,
    }
    if capabilities is not None:
        normalized["capabilities"] = capabilities
    return normalized


def infer_capabilities(statement: dict[str, Any] | None = None, allowed_rules: list[str] | None = None) -> list[str]:
    statement = statement or {}
    rules = allowed_rules or []
    statement_text = " ".join(
        item
        for item in [*(statement.get("declarations", []) or []), *(statement.get("assumptions", []) or []), statement.get("goal", "")]
        if isinstance(item, str)
    ).lower()
    inferred = ["algebra"]
    goal = str(statement.get("goal", "")).strip()
    if re.match(r"(?i)^as\s+[a-z][a-z0-9_]*\s+tends\s+to\s+infinity\b", goal) or re.match(r"(?i)^the\s+series\s+from\b", goal):
        inferred.append("sequences-series")
    elif re.match(r"(?i)^the\s+derivative\s+of\b", goal):
        inferred.append("derivatives")
    elif re.match(r"(?i)^(?:as\s+[a-z][a-z0-9_]*\s+approaches\b|the\s+limit\b)", goal):
        inferred.append("limits")
    rule_capabilities: set[str] = set()
    for rule in rules:
        if not isinstance(rule, str):
            continue
        lowered = rule.lower()
        if "sequence_" in lowered or "series_" in lowered:
            rule_capabilities.add("sequences-series")
        elif "derivative" in lowered:
            rule_capabilities.add("derivatives")
            if lowered == "derivative_from_limit": rule_capabilities.add("limits")
        elif any(token in lowered for token in ("limit", "continuity", "continuous", "ivt")):
            rule_capabilities.add("limits")
    for capability in ("derivatives", "limits", "sequences-series"):
        if capability in rule_capabilities and capability not in inferred:
            inferred.append(capability)
    if "sqrt" in statement_text or any(isinstance(rule, str) and any(token in rule.lower() for token in ("sqrt", "conjugate")) for rule in rules):
        inferred.append("radicals")
    return inferred


def normalize_capabilities(value: Any, *, statement: dict[str, Any] | None = None, allowed_rules: list[str] | None = None) -> list[str]:
    if not isinstance(value, list):
        raise ValueError("proof_spec.capabilities must be a list")
    if len(value) > len(FORMAL_CAPABILITY_IDS):
        raise ValueError("proof_spec.capabilities contains unsupported entries")
    if any(not isinstance(item, str) or item not in FORMAL_CAPABILITY_IDS for item in value):
        raise ValueError("proof_spec.capabilities contains an unsupported capability")
    if len(value) != len(set(value)):
        raise ValueError("proof_spec.capabilities must not contain duplicate items")
    missing = next((item for item in infer_capabilities(statement, allowed_rules) if item not in value), None)
    if missing:
        raise ValueError(f"proof_spec.capabilities must include inferred capability {missing!r}")
    return list(value)


def resolve_proof_spec(value: Any, public_values: dict[str, object]) -> dict[str, Any]:
    """Resolve a proof spec using only the learner-visible parameter snapshot.

    This is a meaning/security boundary.  A proof specification must never be
    rendered from hidden generator state merely because that state exists in a
    native template.  If an authored formal statement references a name that
    is not public, ``render_template`` raises rather than guessing.
    """

    spec = normalize_proof_spec(value)
    if not spec:
        return {}

    missing = [
        name
        for name in spec["parameter_contract"]["required_public"]
        if name not in public_values
    ]
    if missing:
        raise ValueError(f"proof_spec requires non-public parameter {missing[0]!r}")

    try:
        resolved = _render_nested(spec, public_values)
    except SafeExpressionError as exc:
        raise ValueError(f"proof_spec references a non-public or invalid parameter: {exc}") from exc

    # Rendering can change strings but cannot change the allowed structure.
    return normalize_proof_spec(resolved)



def _normalize_reference_proof(value: Any) -> dict[str, Any]:
    if value in (None, {}, []):
        return {}
    if isinstance(value, list):
        value = {"mode": "steps", "steps": value}
    if not isinstance(value, dict):
        raise ValueError("proof_spec.reference_proof must be an object or list")
    _reject_unknown(value, _REFERENCE_FIELDS, "proof_spec.reference_proof")
    raw_mode = value.get("mode", "steps")
    if raw_mode == "author_candidate":
        raw_mode = "steps"
    if raw_mode not in {"steps", "auto"}:
        raise ValueError("proof_spec.reference_proof.mode must be steps or auto")
    raw_steps = value.get("steps", [])
    if not isinstance(raw_steps, list) or len(raw_steps) > _MAX_REFERENCE_STEPS:
        raise ValueError(f"proof_spec.reference_proof.steps must be a list of at most {_MAX_REFERENCE_STEPS} items")
    if raw_mode == "auto" and raw_steps:
        raise ValueError("proof_spec.reference_proof auto mode cannot contain submitted steps")
    steps: list[dict[str, Any]] = []
    for index, row in enumerate(raw_steps, start=1):
        if not isinstance(row, dict):
            raise ValueError(f"proof_spec.reference_proof step {index} must be an object")
        _reject_unknown(row, _REFERENCE_STEP_FIELDS, f"proof_spec.reference_proof step {index}")
        claim = _text(row.get("claim"), f"proof_spec.reference_proof step {index}.claim")
        rule = _text(row.get("rule"), f"proof_spec.reference_proof step {index}.rule")
        premises = _text_list(row.get("premises", []), f"proof_spec.reference_proof step {index}.premises", _MAX_PREMISES)
        parameters = row.get("parameters", {})
        if not isinstance(parameters, dict):
            raise ValueError(f"proof_spec.reference_proof step {index}.parameters must be an object")
        normalized_parameters: dict[str, Any] = {}
        for key, item in parameters.items():
            parameter_key = _text(key, f"proof_spec.reference_proof step {index} parameter name")
            if not isinstance(item, (str, int, bool)) or isinstance(item, float):
                raise ValueError(f"proof_spec.reference_proof step {index} parameter {parameter_key!r} must be text, integer or boolean")
            normalized_parameters[parameter_key] = _text(item, f"proof_spec.reference_proof step {index} parameter {parameter_key}") if isinstance(item, str) else item
        scope = _text(row.get("scope", "root"), f"proof_spec.reference_proof step {index}.scope")
        steps.append({"claim": claim, "rule": rule, "premises": premises, "parameters": normalized_parameters, "scope": scope})
    return {"mode": raw_mode, "steps": steps}

def _render_nested(value: Any, public_values: dict[str, object]) -> Any:
    if isinstance(value, str):
        return render_template(value, public_values)
    if isinstance(value, list):
        return [_render_nested(item, public_values) for item in value]
    if isinstance(value, dict):
        return {key: _render_nested(item, public_values) for key, item in value.items()}
    return deepcopy(value)


def _reject_unknown(value: dict[str, Any], allowed: set[str], label: str) -> None:
    unknown = sorted(set(value) - allowed)
    if unknown:
        raise ValueError(f"unknown {label} field {unknown[0]!r}")


def _text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be non-empty text")
    text = value.strip()
    if len(text) > _MAX_TEXT:
        raise ValueError(f"{label} must contain at most {_MAX_TEXT} characters")
    return text


def _text_list(value: Any, label: str, maximum: int) -> list[str]:
    if not isinstance(value, list) or len(value) > maximum:
        raise ValueError(f"{label} must be a list of at most {maximum} items")
    return [_text(item, f"{label} item") for item in value]


def _identifier_list(value: Any, label: str, maximum: int) -> list[str]:
    items = _text_list(value, label, maximum)
    if len(items) != len(set(items)):
        raise ValueError(f"{label} must not contain duplicate items")
    return items
