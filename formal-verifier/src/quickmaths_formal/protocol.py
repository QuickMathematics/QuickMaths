from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from typing import Any

from .authoring import build_text_request, parse_variable_declarations
from .capabilities import capability_matrix
from .contract import ContractError, normalize_request
from .interactive import append_text_step, close_text_subproof, new_text_request, open_text_subproof, replace_text_step
from .progress import check_progress
from .parser import parse_expression_text, parse_goal_text, parse_proposition_text, render_expression_text, render_goal_text, render_proposition_text
from .preview import request_preview
from .search import build_auto_request, search_proof
from .state import build_proof_state, proof_state_to_dict
from .verifier import prove_goal, replay_certificate, verify_request

PROTOCOL_VERSION = "0.1"


def _error(code: str, message: str) -> dict[str, Any]:
    return {"protocol_version": PROTOCOL_VERSION, "ok": False, "error": {"code": code, "message": message}}


def _variables(message: dict[str, Any]) -> list[str]:
    raw = message.get("variables", [])
    if not isinstance(raw, list) or any(not isinstance(item, str) for item in raw):
        raise ContractError("variables must be a list of declared variable names")
    return raw


def handle_message(message: Any, *, project_dir: str | Path | None = None) -> dict[str, Any]:
    if not isinstance(message, dict):
        return _error("invalid_message", "Protocol message must be an object.")
    if message.get("protocol_version", PROTOCOL_VERSION) != PROTOCOL_VERSION:
        return _error("protocol_version", f"protocol_version must be {PROTOCOL_VERSION!r}")
    operation = message.get("op")
    try:
        if operation == "capabilities":
            return {"protocol_version": PROTOCOL_VERSION, "ok": True, "result": capability_matrix()}
        if operation == "new_text_request":
            return {"protocol_version": PROTOCOL_VERSION, "ok": True, "result": new_text_request(message)}
        if operation == "append_text_step":
            return {"protocol_version": PROTOCOL_VERSION, "ok": True, "result": append_text_step(message)}
        if operation == "replace_text_step":
            return {"protocol_version": PROTOCOL_VERSION, "ok": True, "result": replace_text_step(message)}
        if operation == "open_text_subproof":
            return {"protocol_version": PROTOCOL_VERSION, "ok": True, "result": open_text_subproof(message)}
        if operation == "close_text_subproof":
            return {"protocol_version": PROTOCOL_VERSION, "ok": True, "result": close_text_subproof(message)}
        if operation == "check_progress":
            return {"protocol_version": PROTOCOL_VERSION, "ok": True, "result": check_progress(message.get("request"), project_dir=project_dir)}
        if operation == "check_reference_text":
            raw_steps = message.get("reference_steps", [])
            if not isinstance(raw_steps, list) or len(raw_steps) > 128 or any(not isinstance(item, dict) for item in raw_steps):
                raise ContractError("reference_steps must be a list of at most 128 step objects")
            started = new_text_request(message)
            request = started["request"]
            checked_steps: list[dict[str, Any]] = []
            for index, row in enumerate(raw_steps, start=1):
                result = append_text_step({
                    "request": request,
                    "claim": row.get("claim"),
                    "rule": row.get("rule"),
                    "premises": row.get("premises", []),
                    "parameters": row.get("parameters", {}),
                    "scope": row.get("scope", "root"),
                    "step_id": row.get("step_id", f"reference_step_{index}"),
                })
                request = result["request"]
                checked_steps.append({"step": result["added_step"], "proof_state": result["proof_state"]})
            state = proof_state_to_dict(build_proof_state(request))
            verification = asdict(verify_request(request, project_dir=project_dir, proof_mode="reference"))
            return {
                "protocol_version": PROTOCOL_VERSION,
                "ok": True,
                "result": {
                    "request": request,
                    "proof_state": state,
                    "checked_steps": checked_steps,
                    "verification": verification,
                },
            }
        if operation == "state":
            return {"protocol_version": PROTOCOL_VERSION, "ok": True, "result": proof_state_to_dict(build_proof_state(message.get("request")))}
        if operation == "suggest":
            state = build_proof_state(message.get("request"))
            return {"protocol_version": PROTOCOL_VERSION, "ok": True, "result": {"status": state.status, "suggestions": state.suggestions}}
        if operation == "search":
            return {"protocol_version": PROTOCOL_VERSION, "ok": True, "result": search_proof(message.get("request"))}
        if operation == "auto_check":
            augmented, suggestion = build_auto_request(message.get("request"))
            if suggestion is None:
                state = build_proof_state(augmented)
                return {"protocol_version": PROTOCOL_VERSION, "ok": True, "result": {"status": "no_candidate", "proof_state": proof_state_to_dict(state)}}
            result = verify_request(augmented, project_dir=project_dir, proof_mode="assisted")
            return {"protocol_version": PROTOCOL_VERSION, "ok": True, "result": {"suggestion": asdict(suggestion), "request": augmented, "verification": asdict(result)}}
        if operation == "prove":
            return {"protocol_version": PROTOCOL_VERSION, "ok": True, "result": asdict(prove_goal(message.get("request"), project_dir=project_dir))}
        if operation == "prove_text":
            declarations = message.get("declarations", [])
            assumptions = message.get("assumptions", [])
            rules = message.get("allowed_rules", [])
            if not isinstance(declarations, list) or any(not isinstance(item, str) for item in declarations):
                raise ContractError("declarations must be a list like ['x:real']")
            if not isinstance(assumptions, list) or any(not isinstance(item, str) for item in assumptions):
                raise ContractError("assumptions must be a list of proposition strings")
            if not isinstance(rules, list) or any(not isinstance(item, str) for item in rules):
                raise ContractError("allowed_rules must be a list of rule names")
            request = build_text_request(
                request_id=str(message.get("request_id", "rpc-proof")),
                variables=parse_variable_declarations(declarations),
                goal_text=str(message.get("goal", "")),
                assumptions=assumptions,
                allowed_rules=rules,
                max_seconds=int(message.get("max_seconds", 60)),
            )
            result = prove_goal(request, project_dir=project_dir)
            return {
                "protocol_version": PROTOCOL_VERSION,
                "ok": True,
                "result": {
                    "request": request,
                    "preview": request_preview(request),
                    "verification": asdict(result),
                },
            }
        if operation == "check":
            return {"protocol_version": PROTOCOL_VERSION, "ok": True, "result": asdict(verify_request(message.get("request"), project_dir=project_dir))}
        if operation == "replay":
            return {
                "protocol_version": PROTOCOL_VERSION,
                "ok": True,
                "result": asdict(replay_certificate(message.get("request"), message.get("certificate"), project_dir=project_dir)),
            }
        if operation == "preview":
            request = normalize_request(message.get("request"))
            return {"protocol_version": PROTOCOL_VERSION, "ok": True, "result": {"preview": request_preview(request)}}
        if operation == "parse_expression":
            expr = parse_expression_text(str(message.get("text", "")), _variables(message))
            return {"protocol_version": PROTOCOL_VERSION, "ok": True, "result": {"expression": expr, "preview": render_expression_text(expr)}}
        if operation == "parse_proposition":
            prop = parse_proposition_text(str(message.get("text", "")), _variables(message))
            return {"protocol_version": PROTOCOL_VERSION, "ok": True, "result": {"proposition": prop, "preview": render_proposition_text(prop)}}
        if operation == "parse_goal":
            goal = parse_goal_text(str(message.get("text", "")), _variables(message))
            return {"protocol_version": PROTOCOL_VERSION, "ok": True, "result": {"goal": goal, "preview": render_goal_text(goal)}}
    except ContractError as exc:
        return _error("ambiguous_input", str(exc))
    except Exception as exc:
        return _error("engine_error", str(exc))
    return _error("unknown_operation", f"Unsupported protocol operation {operation!r}.")
