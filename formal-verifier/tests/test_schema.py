import json
from pathlib import Path

import jsonschema

ROOT = Path(__file__).parents[2]
FIXTURES = Path(__file__).parents[1] / "fixtures"
SCHEMA = json.loads((ROOT / "schemas" / "formal-proof.schema.json").read_text(encoding="utf-8"))


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_formal_schema_is_valid_and_accepts_corpus_requests():
    jsonschema.Draft202012Validator.check_schema(SCHEMA)
    validator = jsonschema.Draft202012Validator(SCHEMA)
    for path in FIXTURES.glob("*.json"):
        assert not list(validator.iter_errors(json.loads(path.read_text(encoding="utf-8")))), path.name


def test_formal_schema_rejects_executable_or_unknown_step_fields():
    request = load("guarded_cancellation.json")
    request["steps"][0]["lean_source"] = "by sorry"
    errors = list(jsonschema.Draft202012Validator(SCHEMA).iter_errors(request))
    assert errors


def test_formal_schema_accepts_factorial_expression_node():
    request = load("series_geometric_half_sum.json")
    request["goal"]["expression"] = {
        "kind": "div",
        "left": request["goal"]["expression"],
        "right": {"kind": "factorial", "arg": {"kind": "var", "id": "n"}},
    }
    errors = list(jsonschema.Draft202012Validator(SCHEMA).iter_errors(request))
    assert not errors
