import json
from copy import deepcopy
from pathlib import Path

import pytest

from quickmaths_formal.contract import ContractError, canonical_hash, normalize_request

FIXTURES = Path(__file__).parents[1] / "fixtures"


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_contract_is_canonical_and_stable():
    request = normalize_request(load("guarded_cancellation.json"))
    assert request["version"] == "0.1"
    assert canonical_hash(request) == canonical_hash(deepcopy(request))


def test_rationals_are_reduced_and_sign_normalized():
    request = load("conjugate_limit.json")
    request["goal"]["result"]["value"] = {"kind": "rat", "numerator": -2, "denominator": -8}
    normalized = normalize_request(request)
    assert normalized["goal"]["result"]["value"] == {"kind": "rat", "numerator": 1, "denominator": 4}


def test_unknown_identifier_is_never_silently_created():
    request = load("guarded_cancellation.json")
    request["goal"]["proposition"]["right"] = {"kind": "var", "id": "mystery"}
    with pytest.raises(ContractError, match="unknown variable"):
        normalize_request(request)


def test_later_premise_is_rejected():
    request = load("guarded_cancellation.json")
    request["steps"][0]["premises"] = ["later"]
    request["steps"].append({
        "id": "later", "scope": "root", "claim": request["goal"], "rule": "exact", "premises": ["cancel"], "parameters": {}
    })
    request["policy"]["allowed_rules"].append("exact")
    with pytest.raises(ContractError, match="later or unknown premise"):
        normalize_request(request)


def test_child_scope_cannot_leak_into_parent():
    with pytest.raises(ContractError, match="leaks premise"):
        normalize_request(load("leaked_assumption.json"))


def test_piecewise_expression_and_quantifiers_are_representable():
    assert normalize_request(load("piecewise_jump.json"))["goal"]["kind"] == "limit"
    assert normalize_request(load("ivt_existence.json"))["goal"]["proposition"]["kind"] == "exists"


def test_derivative_bound_variable_cannot_leak_into_evaluation_point():
    request = load("polynomial_derivative.json")
    assert normalize_request(request)["goal"]["kind"] == "derivative"
    request["goal"]["point"] = {"kind": "var", "id": "x"}
    with pytest.raises(ContractError, match="evaluation point"):
        normalize_request(request)


def test_rule_expression_parameters_cross_the_same_identifier_sanitizer():
    request = load("guarded_cancellation.json")
    request["steps"][0]["parameters"]["divisor"] = {"kind": "var", "id": "x); exact False.elim (by contradiction); ("}
    with pytest.raises(ContractError, match="stable identifier"):
        normalize_request(request)


def test_unknown_rule_parameters_are_rejected_instead_of_reaching_lean_generation():
    request = load("guarded_cancellation.json")
    request["steps"][0]["parameters"]["lean_source"] = "sorry"
    with pytest.raises(ContractError, match="unknown parameter"):
        normalize_request(request)
