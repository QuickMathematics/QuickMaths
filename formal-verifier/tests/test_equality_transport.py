from quickmaths_formal.authoring import build_proposition_request
from quickmaths_formal.lean import render_request
from quickmaths_formal.search import build_auto_plan
from quickmaths_formal.state import build_proof_state


def test_equality_substitution_transports_function_predicate():
    request = build_proposition_request(
        request_id="subst",
        variables={"x": "real", "y": "real", "f": "real->real"},
        assumptions=["x = y", "f(x) = 0"],
        goal_text="f(y) = 0",
    )
    planned, suggestions, terminal = build_auto_plan(request)
    assert terminal["status"] == "goal_candidate_complete"
    assert suggestions[-1].rule == "eq_subst"
    assert build_proof_state(planned).status == "ready_for_kernel"
    assert "simpa only [h1] using h2" in render_request(planned)


def test_function_congruence_uses_argument_equality():
    request = build_proposition_request(
        request_id="congr",
        variables={"x": "real", "y": "real", "f": "real->real"},
        assumptions=["x = y"],
        goal_text="f(x) = f(y)",
    )
    planned, suggestions, terminal = build_auto_plan(request)
    assert terminal["status"] == "goal_candidate_complete"
    assert suggestions[-1].rule == "congr_arg"
    assert build_proof_state(planned).status == "ready_for_kernel"
    assert "congrArg f h1" in render_request(planned)


def test_substitution_works_inside_membership():
    request = build_proposition_request(
        request_id="set-subst",
        variables={"x": "real", "y": "real", "A": "set[real]"},
        assumptions=["x = y", "x in A"],
        goal_text="y in A",
    )
    planned, suggestions, terminal = build_auto_plan(request)
    assert terminal["status"] == "goal_candidate_complete"
    assert suggestions[-1].rule == "eq_subst"
