from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest


MODULE_PATH = Path(__file__).parents[1] / "docs" / "python-sandbox-supervisor.py"
SPEC = importlib.util.spec_from_file_location("quickmaths_browser_python_sandbox", MODULE_PATH)
assert SPEC and SPEC.loader
SANDBOX = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SANDBOX)


def program_spec(*, step_limit: int = 20_000) -> dict:
    return {
        "runtime": "python_subset_v1",
        "entrypoint": {
            "kind": "function",
            "name": "is_even",
            "parameters": [{"name": "number", "type": "int"}],
            "return_type": "bool",
        },
        "tests": [
            {"id": "even", "args": [8], "expected_return": True, "visibility": "example"},
            {"id": "odd", "args": [7], "expected_return": False, "visibility": "after_submission"},
            {"id": "zero", "args": [0], "expected_return": True, "visibility": "hidden"},
        ],
        "limits": {"wall_time_ms": 750, "step_limit": step_limit, "memory_mb": 32, "stdout_chars": 1000},
        "policy": {
            "allowed_builtins": ["abs", "len", "range"],
            "imports": [],
            "network": False,
            "storage": False,
            "clock": False,
            "randomness": False,
        },
    }


def grade(source: str, spec: dict | None = None) -> dict:
    return json.loads(SANDBOX.grade_payload(json.dumps({"source": source, "spec": spec or program_spec()})))


def test_sandbox_grades_a_declared_function_against_isolated_json_tests() -> None:
    result = grade("def is_even(number):\n    return number % 2 == 0")
    assert result["status"] == "passed"
    assert result["passed"] == result["total"] == 3


@pytest.mark.parametrize(
    "source, rejected",
    [
        ("import os\ndef is_even(number):\n    return True", "Import"),
        ("def is_even(number):\n    return eval('True')", "eval"),
        ("def is_even(number):\n    return number.__class__", "double-underscore"),
        ("class Escape:\n    pass\ndef is_even(number):\n    return True", "ClassDef"),
        ("open('learner-state.json')\ndef is_even(number):\n    return True", "top level"),
    ],
)
def test_sandbox_rejects_import_eval_dunder_class_and_top_level_execution(source: str, rejected: str) -> None:
    result = grade(source)
    assert result["status"] == "policy_error"
    assert rejected.lower() in result["messages"][0].lower()


def test_sandbox_step_limit_stops_infinite_learner_loops() -> None:
    result = grade("def is_even(number):\n    while True:\n        number += 1\n    return True", program_spec(step_limit=100))
    assert result["status"] == "timeout"
    assert any(test["status"] == "timeout" for test in result["tests"])


def test_hidden_failure_does_not_reveal_hidden_values() -> None:
    result = grade("def is_even(number):\n    return number > 1")
    hidden = next(test for test in result["tests"] if test["visibility"] == "hidden")
    assert hidden["status"] == "failed"
    assert "0" not in hidden["message"]
    assert "True" not in hidden["message"]

