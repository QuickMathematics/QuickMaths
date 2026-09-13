import pytest

from quickmaths_formal.contract import ContractError, normalize_request
from quickmaths_formal.lean import render_request
from quickmaths_formal.state import build_proof_state


def V(name):
    return {"kind": "var", "id": name}


def I(value):
    return {"kind": "int", "value": value}


def EQ(left, right):
    return {"kind": "eq", "left": left, "right": right}


def policy():
    return {"allowed_rules": [], "max_seconds": 10, "accepted_axioms": ["propext", "Classical.choice", "Quot.sound"]}


def test_implication_intro_discharges_exactly_one_child_assumption():
    p = EQ(V("x"), I(0))
    goal = {"kind": "implies", "left": p, "right": p}
    request = {
        "version": "0.1",
        "request_id": "p-implies-p",
        "variables": [{"id": "x", "type": "real"}],
        "scopes": [{"id": "root", "parent": None}, {"id": "sub", "parent": "root"}],
        "assumptions": [{"id": "hp", "scope": "sub", "claim": p}],
        "steps": [{
            "id": "himp", "scope": "root", "claim": {"kind": "proposition", "proposition": goal},
            "rule": "imp_intro", "premises": ["hp"], "parameters": {},
        }],
        "goal": {"kind": "proposition", "proposition": goal},
        "policy": policy(),
    }
    normalized = normalize_request(request)
    assert build_proof_state(normalized).status == "ready_for_kernel"
    source = render_request(normalized)
    assert "have himp" in source
    assert "intro hp" in source
    assert "exact hp" in source


def test_implication_intro_can_render_child_derivation_using_parent_context():
    p = EQ(V("x"), I(0))
    q = EQ(V("y"), I(1))
    p_to_q = {"kind": "implies", "left": p, "right": q}
    request = {
        "version": "0.1",
        "request_id": "nested-mp",
        "variables": [{"id": "x", "type": "real"}, {"id": "y", "type": "real"}],
        "scopes": [{"id": "root", "parent": None}, {"id": "sub", "parent": "root"}],
        "assumptions": [
            {"id": "hpq", "scope": "root", "claim": p_to_q},
            {"id": "hp", "scope": "sub", "claim": p},
        ],
        "steps": [
            {
                "id": "hq", "scope": "sub", "claim": {"kind": "proposition", "proposition": q},
                "rule": "modus_ponens", "premises": ["hpq", "hp"], "parameters": {},
            },
            {
                "id": "himp", "scope": "root", "claim": {"kind": "proposition", "proposition": p_to_q},
                "rule": "imp_intro", "premises": ["hp", "hq"], "parameters": {},
            },
        ],
        "goal": {"kind": "proposition", "proposition": p_to_q},
        "policy": policy(),
    }
    normalized = normalize_request(request)
    assert build_proof_state(normalized).status == "ready_for_kernel"
    source = render_request(normalized)
    assert "intro hp" in source
    assert "have hq" in source
    assert "exact hpq hp" in source
    assert "exact hq" in source


def test_not_intro_requires_false_in_the_child_scope():
    p = EQ(V("x"), I(0))
    q = EQ(V("y"), I(1))
    not_q = {"kind": "not", "arg": q}
    not_p = {"kind": "not", "arg": p}
    request = {
        "version": "0.1",
        "request_id": "not-intro",
        "variables": [{"id": "x", "type": "real"}, {"id": "y", "type": "real"}],
        "scopes": [{"id": "root", "parent": None}, {"id": "sub", "parent": "root"}],
        "assumptions": [
            {"id": "hq", "scope": "root", "claim": q},
            {"id": "hnq", "scope": "root", "claim": not_q},
            {"id": "hp", "scope": "sub", "claim": p},
        ],
        "steps": [
            {
                "id": "hf", "scope": "sub", "claim": {"kind": "proposition", "proposition": {"kind": "false"}},
                "rule": "contradiction", "premises": ["hq", "hnq"], "parameters": {},
            },
            {
                "id": "hnp", "scope": "root", "claim": {"kind": "proposition", "proposition": not_p},
                "rule": "not_intro", "premises": ["hp", "hf"], "parameters": {},
            },
        ],
        "goal": {"kind": "proposition", "proposition": not_p},
        "policy": policy(),
    }
    normalized = normalize_request(request)
    assert build_proof_state(normalized).status == "ready_for_kernel"
    source = render_request(normalized)
    assert "intro hp" in source
    assert "have hf : False" in source
    assert "exact hnq hq" in source


def test_ordinary_parent_step_still_cannot_leak_child_fact():
    p = EQ(V("x"), I(0))
    request = {
        "version": "0.1",
        "request_id": "leak",
        "variables": [{"id": "x", "type": "real"}],
        "scopes": [{"id": "root", "parent": None}, {"id": "sub", "parent": "root"}],
        "assumptions": [{"id": "hp", "scope": "sub", "claim": p}],
        "steps": [{
            "id": "bad", "scope": "root", "claim": {"kind": "proposition", "proposition": p},
            "rule": "exact", "premises": ["hp"], "parameters": {},
        }],
        "goal": {"kind": "proposition", "proposition": p},
        "policy": policy(),
    }
    with pytest.raises(ContractError, match="leaks premise"):
        normalize_request(request)
