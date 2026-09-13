from copy import deepcopy

from quickmaths_formal.contract import normalize_request
from quickmaths_formal.lean import render_request
from quickmaths_formal.state import build_proof_state
from quickmaths_formal.verifier import verify_request


def V(name):
    return {"kind": "var", "id": name}


def I(value):
    return {"kind": "int", "value": value}


def ADD(a, b):
    return {"kind": "add", "left": a, "right": b}


def SUB(a, b):
    return {"kind": "sub", "left": a, "right": b}


def MUL(a, b):
    return {"kind": "mul", "left": a, "right": b}


def DIV(a, b):
    return {"kind": "div", "left": a, "right": b}


def EQ(a, b):
    return {"kind": "eq", "left": a, "right": b}


def NE(a, b):
    return {"kind": "ne", "left": a, "right": b}


def goal(prop):
    return {"kind": "proposition", "proposition": prop}


def request(*, assumptions, steps, final, allowed):
    return {
        "version": "0.1",
        "request_id": "algebra-pilot",
        "variables": [{"id": "x", "type": "real"}],
        "scopes": [{"id": "root", "parent": None}],
        "assumptions": assumptions,
        "steps": steps,
        "goal": final,
        "policy": {
            "allowed_rules": allowed,
            "max_seconds": 10,
            "accepted_axioms": ["propext", "Classical.choice", "Quot.sound"],
        },
    }


def test_add_both_sides_accepts_simplified_target_and_renders_linarith():
    raw = request(
        assumptions=[{"id": "h", "scope": "root", "claim": EQ(V("x"), I(2))}],
        steps=[{
            "id": "add3", "scope": "root", "claim": goal(EQ(ADD(V("x"), I(3)), I(5))),
            "rule": "add_both_sides", "premises": ["h"], "parameters": {"term": I(3)},
        }],
        final=goal(EQ(ADD(V("x"), I(3)), I(5))),
        allowed=["add_both_sides"],
    )
    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "linarith [h]" in source


def test_invalid_same_operation_is_rejected_before_kernel():
    raw = request(
        assumptions=[{"id": "h", "scope": "root", "claim": EQ(V("x"), I(2))}],
        steps=[{
            "id": "bad", "scope": "root", "claim": goal(EQ(ADD(V("x"), I(3)), I(6))),
            "rule": "add_both_sides", "premises": ["h"], "parameters": {"term": I(3)},
        }],
        final=goal(EQ(ADD(V("x"), I(3)), I(6))),
        allowed=["add_both_sides"],
    )
    state = build_proof_state(raw)
    assert state.status == "refuted"
    assert any(row["code"] == "invalid_transformation" for row in state.obligations)
    assert state.counterexample is not None


def test_divide_both_sides_requires_explicit_nonzero_evidence():
    base_assumptions = [{"id": "h", "scope": "root", "claim": EQ(MUL(V("x"), I(2)), I(4))}]
    step = {
        "id": "divide", "scope": "root", "claim": goal(EQ(V("x"), I(2))),
        "rule": "divide_both_sides", "premises": ["h"], "parameters": {"term": I(2)},
    }
    raw = request(
        assumptions=base_assumptions,
        steps=[step],
        final=goal(EQ(V("x"), I(2))),
        allowed=["divide_both_sides"],
    )
    state = build_proof_state(raw)
    assert state.status == "needs_justification"
    assert any(row["code"] == "nonzero_required" for row in state.obligations)

    guarded = deepcopy(raw)
    guarded["assumptions"].append({"id": "htwo", "scope": "root", "claim": NE(I(2), I(0))})
    guarded["steps"][0]["premises"].append("htwo")
    guarded_state = build_proof_state(guarded)
    assert guarded_state.status == "ready_for_kernel"
    source = render_request(normalize_request(guarded))
    assert "congrArg (fun z => z / 2) h" in source
    assert "field_simp [htwo]" in source


def test_equality_symmetry_and_transitivity_form_a_checked_chain():
    raw = request(
        assumptions=[
            {"id": "hab", "scope": "root", "claim": EQ(V("x"), I(2))},
            {"id": "hbc", "scope": "root", "claim": EQ(I(2), ADD(I(1), I(1)))},
        ],
        steps=[
            {
                "id": "symm", "scope": "root", "claim": goal(EQ(I(2), V("x"))),
                "rule": "eq_symm", "premises": ["hab"], "parameters": {},
            },
            {
                "id": "chain", "scope": "root", "claim": goal(EQ(V("x"), ADD(I(1), I(1)))),
                "rule": "eq_trans", "premises": ["hab", "hbc"], "parameters": {},
            },
        ],
        final=goal(EQ(V("x"), ADD(I(1), I(1)))),
        allowed=["eq_symm", "eq_trans"],
    )
    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "exact hab.symm" in source
    assert "exact hab.trans hbc" in source


def test_multiplying_an_inequality_without_sign_rule_is_rejected():
    raw = request(
        assumptions=[{"id": "hlt", "scope": "root", "claim": {"kind": "lt", "left": V("x"), "right": I(2)}}],
        steps=[{
            "id": "mul", "scope": "root",
            "claim": goal({"kind": "lt", "left": MUL(V("x"), I(-1)), "right": I(-2)}),
            "rule": "multiply_both_sides", "premises": ["hlt"], "parameters": {"term": I(-1)},
        }],
        final=goal({"kind": "lt", "left": MUL(V("x"), I(-1)), "right": I(-2)}),
        allowed=["multiply_both_sides"],
    )
    state = build_proof_state(raw)
    assert state.status == "refuted"
    assert any(row["code"] == "multiplication_relation" for row in state.obligations)
    assert state.counterexample is not None


def test_positive_and_negative_inequality_scaling_track_direction_and_sign():
    positive = request(
        assumptions=[
            {"id": "hlt", "scope": "root", "claim": {"kind": "lt", "left": V("x"), "right": I(2)}},
            {"id": "hpos", "scope": "root", "claim": {"kind": "lt", "left": I(0), "right": I(3)}},
        ],
        steps=[{
            "id": "scale", "scope": "root",
            "claim": goal({"kind": "lt", "left": MUL(V("x"), I(3)), "right": I(6)}),
            "rule": "scale_inequality_positive", "premises": ["hlt", "hpos"], "parameters": {"factor": I(3)},
        }],
        final=goal({"kind": "lt", "left": MUL(V("x"), I(3)), "right": I(6)}),
        allowed=["scale_inequality_positive"],
    )
    pstate = build_proof_state(positive)
    assert pstate.status == "ready_for_kernel"
    psource = render_request(normalize_request(positive))
    assert "mul_lt_mul_of_pos_right hlt hpos" in psource

    negative = request(
        assumptions=[
            {"id": "hlt", "scope": "root", "claim": {"kind": "lt", "left": V("x"), "right": I(2)}},
            {"id": "hneg", "scope": "root", "claim": {"kind": "lt", "left": I(-1), "right": I(0)}},
        ],
        steps=[{
            "id": "scale", "scope": "root",
            "claim": goal({"kind": "gt", "left": MUL(V("x"), I(-1)), "right": I(-2)}),
            "rule": "scale_inequality_negative", "premises": ["hlt", "hneg"], "parameters": {"factor": I(-1)},
        }],
        final=goal({"kind": "gt", "left": MUL(V("x"), I(-1)), "right": I(-2)}),
        allowed=["scale_inequality_negative"],
    )
    nstate = build_proof_state(negative)
    assert nstate.status == "ready_for_kernel"
    nsource = render_request(normalize_request(negative))
    assert "mul_lt_mul_of_neg_right hlt hneg" in nsource


def test_negative_scaling_without_flip_is_rejected_even_with_sign_evidence():
    raw = request(
        assumptions=[
            {"id": "hlt", "scope": "root", "claim": {"kind": "lt", "left": V("x"), "right": I(2)}},
            {"id": "hneg", "scope": "root", "claim": {"kind": "lt", "left": I(-1), "right": I(0)}},
        ],
        steps=[{
            "id": "scale", "scope": "root",
            "claim": goal({"kind": "lt", "left": MUL(V("x"), I(-1)), "right": I(-2)}),
            "rule": "scale_inequality_negative", "premises": ["hlt", "hneg"], "parameters": {"factor": I(-1)},
        }],
        final=goal({"kind": "lt", "left": MUL(V("x"), I(-1)), "right": I(-2)}),
        allowed=["scale_inequality_negative"],
    )
    state = build_proof_state(raw)
    assert state.status in {"refuted", "needs_justification"}
    assert any(row["code"] == "inequality_direction" for row in state.obligations)
