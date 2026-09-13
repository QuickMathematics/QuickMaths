from quickmaths_formal.authoring import build_proposition_request
from quickmaths_formal.search import build_auto_plan
from quickmaths_formal.state import build_proof_state


def test_affine_implication_uses_linarith_candidate_inside_scope():
    request = build_proposition_request(
        request_id="linear",
        variables={"x": "real", "y": "real"},
        goal_text="(x < y) implies (x + 1 < y + 1)",
    )
    planned, suggestions, terminal = build_auto_plan(request)
    assert terminal["status"] == "goal_candidate_complete"
    rules = [item.rule for item in suggestions]
    assert "linarith" in rules
    assert rules[-1] == "imp_intro"
    assert build_proof_state(planned).status == "ready_for_kernel"


def test_polynomial_nonnegativity_uses_nlinarith_not_linear_tactic():
    request = build_proposition_request(
        request_id="nonlinear",
        variables={"x": "real"},
        goal_text="x^2 >= 0",
    )
    planned, suggestions, terminal = build_auto_plan(request)
    assert terminal["status"] == "goal_candidate_complete"
    assert suggestions[-1].rule == "nlinarith"
