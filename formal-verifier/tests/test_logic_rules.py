from copy import deepcopy

from quickmaths_formal.contract import normalize_request
from quickmaths_formal.lean import render_request
from quickmaths_formal.parser import parse_proposition_text, render_proposition_text
from quickmaths_formal.search import build_auto_plan, search_proof
from quickmaths_formal.state import build_proof_state


def V(name):
    return {"kind": "var", "id": name}


def I(value):
    return {"kind": "int", "value": value}


def EQ(left, right):
    return {"kind": "eq", "left": left, "right": right}


def base(goal, assumptions=(), steps=()):
    return {
        "version": "0.1",
        "request_id": "logic",
        "variables": [{"id": "x", "type": "real"}, {"id": "y", "type": "real"}],
        "scopes": [{"id": "root", "parent": None}],
        "assumptions": [
            {"id": identifier, "scope": "root", "claim": claim}
            for identifier, claim in assumptions
        ],
        "steps": list(steps),
        "goal": {"kind": "proposition", "proposition": goal},
        "policy": {"allowed_rules": [], "max_seconds": 10, "accepted_axioms": ["propext", "Classical.choice", "Quot.sound"]},
    }


def step(identifier, claim, rule, premises=(), parameters=None):
    return {
        "id": identifier,
        "scope": "root",
        "claim": {"kind": "proposition", "proposition": claim},
        "rule": rule,
        "premises": list(premises),
        "parameters": parameters or {},
    }


def test_and_intro_and_elimination_are_exact_structural_rules():
    p = EQ(V("x"), I(0))
    q = EQ(V("y"), I(1))
    conjunction = {"kind": "and", "left": p, "right": q}
    request = base(
        conjunction,
        [("hp", p), ("hq", q)],
        [step("hpair", conjunction, "and_intro", ["hp", "hq"])],
    )
    assert build_proof_state(request).status == "ready_for_kernel"
    assert "exact ⟨hp, hq⟩" in render_request(normalize_request(request))

    eliminate = base(p, [("hpair", conjunction)], [step("hp", p, "and_elim_left", ["hpair"])])
    assert build_proof_state(eliminate).status == "ready_for_kernel"
    assert "exact hpair.1" in render_request(normalize_request(eliminate))


def test_modus_ponens_search_builds_a_complete_candidate_plan():
    p = EQ(V("x"), I(0))
    q = EQ(V("y"), I(1))
    implication = {"kind": "implies", "left": p, "right": q}
    request = base(q, [("himp", implication), ("hp", p)])
    result = search_proof(request)
    assert result["status"] == "candidate_found"
    assert result["suggestions"][0]["rule"] == "modus_ponens"
    planned, added, terminal = build_auto_plan(request)
    assert [item.rule for item in added] == ["modus_ponens"]
    assert terminal["status"] == "goal_candidate_complete"
    assert build_proof_state(planned).status == "ready_for_kernel"
    assert "exact himp hp" in render_request(planned)


def test_contradiction_and_false_elimination_do_not_leak_a_false_verdict():
    p = EQ(V("x"), I(0))
    not_p = {"kind": "not", "arg": p}
    q = EQ(V("y"), I(2))
    request = base(
        q,
        [("hp", p), ("hnp", not_p)],
        [
            step("hfalse", {"kind": "false"}, "contradiction", ["hp", "hnp"]),
            step("hq", q, "false_elim", ["hfalse"]),
        ],
    )
    assert build_proof_state(request).status == "ready_for_kernel"
    source = render_request(normalize_request(request))
    assert "exact hnp hp" in source
    assert "exact False.elim hfalse" in source


def test_exists_intro_checks_witness_instantiation():
    body = EQ(V("z"), V("x"))
    existential = {"kind": "exists", "binder": {"id": "z", "type": "real"}, "body": body}
    instantiated = EQ(V("x"), V("x"))
    request = base(
        existential,
        [("hxx", instantiated)],
        [step("hex", existential, "exists_intro", ["hxx"], {"witness": V("x")})],
    )
    assert build_proof_state(request).status == "ready_for_kernel"
    assert "exact ⟨x, hxx⟩" in render_request(normalize_request(request))

    bad = deepcopy(request)
    bad["steps"][0]["parameters"]["witness"] = V("y")
    assert build_proof_state(bad).status == "needs_justification"


def test_forall_elim_checks_instantiation_and_search_can_find_it():
    universal = {
        "kind": "forall",
        "binder": {"id": "z", "type": "real"},
        "body": EQ(V("z"), V("z")),
    }
    target = EQ(V("x"), V("x"))
    request = base(target, [("hall", universal)])
    result = search_proof(request)
    suggestion = next(item for item in result["suggestions"] if item["rule"] == "forall_elim")
    assert suggestion["parameters"]["witness"] == V("x")
    request["steps"] = [step("hx", target, "forall_elim", ["hall"], {"witness": V("x")})]
    assert build_proof_state(request).status == "ready_for_kernel"
    assert "exact hall x" in render_request(normalize_request(request))


def test_school_parser_handles_logic_constants_and_quantifiers_without_eval():
    parsed = parse_proposition_text("(x = 0) and not (y = 1)", ["x", "y"])
    assert parsed["kind"] == "and"
    assert parsed["right"]["kind"] == "not"
    quantified = parse_proposition_text("forall z:real, (z = z) implies true", ["x"])
    assert quantified["kind"] == "forall"
    assert quantified["body"]["kind"] == "implies"
    assert quantified["body"]["right"] == {"kind": "true"}
    assert "for every z : real" in render_proposition_text(quantified)
