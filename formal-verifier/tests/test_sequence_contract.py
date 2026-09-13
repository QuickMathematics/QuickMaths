import json
from copy import deepcopy
from pathlib import Path

import pytest

from quickmaths_formal.contract import ContractError, normalize_request
from quickmaths_formal.parser import parse_expression_text, parse_goal_text, render_goal_text
from quickmaths_formal.preview import goal_text
from quickmaths_formal.typing import TypeCheckError, validate_request_types


def base_request(goal):
    return {
        "version": "0.1",
        "request_id": "sequence-contract",
        "variables": [{"id": "n", "type": "nat"}],
        "scopes": [{"id": "root", "parent": None}],
        "assumptions": [],
        "steps": [],
        "goal": goal,
        "policy": {"allowed_rules": [], "max_seconds": 10, "accepted_axioms": ["propext", "Classical.choice", "Quot.sound"]},
    }


def test_sequence_text_round_trip_with_explicit_nat_to_real_cast():
    text = "As n tends to infinity, 1 / real(n + 1) tends to 0."
    goal = parse_goal_text(text, {"n"})
    assert goal["kind"] == "sequence_limit"
    assert goal["variable"] == "n"
    assert goal["expression"]["kind"] == "div"
    assert goal["expression"]["right"]["kind"] == "cast_real"
    normalized = normalize_request(base_request(goal))
    assert render_goal_text(normalized["goal"]) == text
    assert "n tends to infinity" in goal_text(normalized["goal"])


def test_variable_power_is_typed_as_natural_exponent_power():
    expr = parse_expression_text("(1/2)^n", {"n"})
    assert expr == {
        "kind": "pow_nat",
        "base": {"kind": "rat", "numerator": 1, "denominator": 2},
        "exponent": {"kind": "var", "id": "n"},
    }
    goal = {"kind": "sequence_limit", "variable": "n", "expression": expr, "result": {"kind": "finite", "value": {"kind": "int", "value": 0}}}
    assert normalize_request(base_request(goal))["goal"]["expression"]["kind"] == "pow_nat"


def test_sequence_index_must_be_nat():
    request = base_request(parse_goal_text("As n tends to infinity, real(n) tends to +infinity.", {"n"}))
    request["variables"][0]["type"] = "real"
    with pytest.raises(TypeCheckError, match="sequence index variables"):
        validate_request_types({**request, "goal": normalize_request({**request, "variables": [{"id":"n","type":"nat"}]})["goal"]})


def test_finite_sequence_target_cannot_depend_on_bound_index():
    goal = {
        "kind": "sequence_limit",
        "variable": "n",
        "expression": {"kind": "cast_real", "arg": {"kind": "var", "id": "n"}},
        "result": {"kind": "finite", "value": {"kind": "cast_real", "arg": {"kind": "var", "id": "n"}}},
    }
    with pytest.raises(ContractError, match="must not depend"):
        normalize_request(base_request(goal))


def test_root_assumption_cannot_treat_bound_sequence_index_as_free():
    request = base_request(parse_goal_text("As n tends to infinity, 1 / real(n + 1) tends to 0.", {"n"}))
    request["assumptions"] = [{
        "id": "h1", "scope": "root",
        "claim": {"kind": "lt", "left": {"kind": "int", "value": 0}, "right": {"kind": "var", "id": "n"}},
    }]
    with pytest.raises(ContractError, match="bound sequence index"):
        normalize_request(request)


def test_eventually_authoring_sugar_round_trips_to_explicit_exists_forall_threshold():
    from quickmaths_formal.logic import same
    from quickmaths_formal.parser import parse_proposition_text, render_proposition_text

    prop = parse_proposition_text(
        "eventually k:nat, real(k) / real(k + 1) <= 1",
        ["n"],
    )
    assert prop["kind"] == "exists" and prop["binder"]["type"] == "nat"
    assert prop["body"]["kind"] == "forall"
    assert prop["body"]["body"]["kind"] == "implies"
    rendered = render_proposition_text(prop)
    assert rendered.startswith("eventually k : nat,")
    assert same(prop, parse_proposition_text(rendered, ["n"]))


def test_sequence_can_state_existence_of_some_finite_limit_without_inventing_value():
    from quickmaths_formal.authoring import build_text_request
    from quickmaths_formal.lean import render_goal

    request = build_text_request(
        request_id="some-finite-limit",
        variables={"n": "nat"},
        goal_text="As n tends to infinity, (1/2)^n tends to some finite limit.",
    )
    assert request["goal"]["result"] == {"kind": "exists_finite"}
    lean = render_goal(request["goal"])
    assert lean.startswith("∃ l : ℝ, Filter.Tendsto")
    assert "Filter.atTop" in lean and "𝓝 l" in lean


def test_sequence_can_state_and_round_trip_no_finite_limit():
    from quickmaths_formal.lean import render_goal

    text = "As n tends to infinity, (-1)^n does not converge to a finite real limit."
    goal = parse_goal_text(text, {"n"})
    assert goal["result"] == {"kind": "no_finite_limit"}
    normalized = normalize_request(base_request(goal))
    assert render_goal_text(normalized["goal"]) == text
    assert "¬ ∃ l : ℝ" in render_goal(normalized["goal"])
    assert "does not converge" in goal_text(normalized["goal"])

def test_sequence_piecewise_periodic_modulo_round_trips_and_stays_nat_typed():
    text = "As n tends to infinity, if n % 3 = 0 then 0 else if n % 3 = 1 then 1 else 2 does not converge to a finite real limit."
    goal = parse_goal_text(text, {"n"})
    mod_expr = goal["expression"]["condition"]["left"]
    assert mod_expr == {
        "kind": "mod_nat",
        "left": {"kind": "var", "id": "n"},
        "right": {"kind": "int", "value": 3},
    }
    normalized = normalize_request(base_request(goal))
    validate_request_types(normalized)
    assert render_goal_text(normalized["goal"]) == text


def test_natural_modulo_rejects_real_operands():
    goal = parse_goal_text(
        "As n tends to infinity, if n % 3 = 0 then 0 else 1 does not converge to a finite real limit.",
        {"n"},
    )
    broken = deepcopy(base_request(goal))
    broken["goal"]["expression"]["condition"]["left"]["left"] = {
        "kind": "cast_real",
        "arg": {"kind": "var", "id": "n"},
    }
    with pytest.raises(ContractError, match="natural modulo requires natural-number operands"):
        normalize_request(broken)
