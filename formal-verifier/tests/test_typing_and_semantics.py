import json
from copy import deepcopy
from pathlib import Path

import pytest

from quickmaths_formal.contract import ContractError, normalize_request
from quickmaths_formal.semantics import unmet_goal_requirements

FIXTURES = Path(__file__).parents[1] / "fixtures"


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_integer_division_is_rejected_as_ambiguous_school_semantics():
    request = load("guarded_cancellation.json")
    request["variables"][0]["type"] = "int"
    with pytest.raises(ContractError, match="division over only natural/integer operands is ambiguous"):
        normalize_request(request)


def test_limit_filter_discharges_puncture_denominator_guard():
    request = normalize_request(load("removable_hole_limit.json"))
    assert unmet_goal_requirements(request) == []


def test_square_root_domain_is_explicit_when_not_automatic():
    request = load("conjugate_identity.json")
    request["assumptions"] = []
    request["steps"][0]["premises"] = []
    normalized = normalize_request(request)
    rows = unmet_goal_requirements(normalized)
    assert any(row.code == "sqrt_domain" for row in rows)


def test_even_square_radicand_is_obviously_nonnegative():
    request = normalize_request(load("sqrt_square_nonnegative.json"))
    assert unmet_goal_requirements(request) == []


def test_iff_is_representable_in_typed_contract():
    request = load("guarded_cancellation.json")
    eq = deepcopy(request["goal"]["proposition"])
    request["goal"] = {"kind": "proposition", "proposition": {"kind": "iff", "left": eq, "right": eq}}
    request["steps"] = [{
        "id": "same",
        "scope": "root",
        "claim": request["goal"],
        "rule": "exact",
        "premises": [],
        "parameters": {},
    }]
    request["policy"]["allowed_rules"] = ["exact"]
    normalized = normalize_request(request)
    assert normalized["goal"]["proposition"]["kind"] == "iff"


def test_exact_rational_arithmetic_discharges_pointwise_domain_guards():
    request = load("quotient_derivative.json")
    request["variables"] = [{"id": "x", "type": "real"}]
    request["assumptions"] = []
    request["goal"]["point"] = {"kind": "int", "value": 2}
    request["goal"]["result"] = {"kind": "int", "value": -1}
    request["steps"] = []
    normalized = normalize_request(request)
    assert unmet_goal_requirements(normalized) == []


def test_log_domain_requires_strict_positive_argument_at_derivative_point():
    request = load("polynomial_derivative.json")
    request["goal"] = {
        "kind": "derivative",
        "variable": "x",
        "expression": {"kind": "log", "arg": {"kind": "var", "id": "x"}},
        "point": {"kind": "var", "id": "a"},
        "result": {"kind": "div", "left": {"kind": "int", "value": 1}, "right": {"kind": "var", "id": "a"}},
    }
    request["steps"] = []
    normalized = normalize_request(request)
    rows = unmet_goal_requirements(normalized)
    assert any(row.code == "log_domain" and row.claim["kind"] == "lt" for row in rows)


def test_exact_positive_log_argument_discharges_school_domain_guard():
    request = load("polynomial_derivative.json")
    request["variables"] = [{"id": "x", "type": "real"}]
    request["goal"] = {
        "kind": "derivative",
        "variable": "x",
        "expression": {"kind": "log", "arg": {"kind": "add", "left": {"kind": "var", "id": "x"}, "right": {"kind": "int", "value": 2}}},
        "point": {"kind": "int", "value": 1},
        "result": {"kind": "rat", "numerator": 1, "denominator": 3},
    }
    request["steps"] = []
    normalized = normalize_request(request)
    assert unmet_goal_requirements(normalized) == []


def test_factorial_requires_a_natural_number_argument():
    request = load("guarded_cancellation.json")
    request["goal"] = {
        "kind": "proposition",
        "proposition": {
            "kind": "eq",
            "left": {"kind": "factorial", "arg": {"kind": "var", "id": "x"}},
            "right": {"kind": "int", "value": 1},
        },
    }
    with pytest.raises(ContractError, match="factorial.*natural-number"):
        normalize_request(request)
