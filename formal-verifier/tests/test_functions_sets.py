from quickmaths_formal.authoring import build_proposition_request
from quickmaths_formal.lean import render_request
from quickmaths_formal.parser import parse_expression_text, parse_proposition_text
from quickmaths_formal.search import build_auto_plan
from quickmaths_formal.state import build_proof_state


def test_safe_parser_and_type_checker_support_declared_function_application():
    request = build_proposition_request(
        request_id="function-parse",
        variables={"f": "real->real", "x": "real"},
        goal_text="f(x) = f(x)",
    )
    expr = request["goal"]["proposition"]["left"]
    assert expr["kind"] == "apply"
    assert "(f x)" in render_request({**request, "steps": [{
        "id": "h", "scope": "root", "claim": request["goal"], "rule": "eq_refl", "premises": [], "parameters": {}
    }]})


def test_function_extensionality_from_pointwise_equality():
    request = build_proposition_request(
        request_id="funext",
        variables={"f": "real->real", "g": "real->real"},
        assumptions=["forall x:real, f(x) = g(x)"],
        goal_text="f = g",
    )
    planned, suggestions, terminal = build_auto_plan(request)
    assert terminal["status"] == "goal_candidate_complete"
    assert suggestions[-1].rule == "function_ext"
    assert build_proof_state(planned).status == "ready_for_kernel"
    source = render_request(planned)
    assert "funext" in source
    assert "f : ℝ → ℝ" in source


def test_set_extensionality_and_subset_elimination():
    equality = build_proposition_request(
        request_id="setext",
        variables={"A": "set[real]", "B": "set[real]"},
        assumptions=["forall x:real, (x in A) iff (x in B)"],
        goal_text="A = B",
    )
    planned, suggestions, terminal = build_auto_plan(equality)
    assert terminal["status"] == "goal_candidate_complete"
    assert suggestions[-1].rule == "set_ext"
    assert build_proof_state(planned).status == "ready_for_kernel"
    assert "Set.ext" in render_request(planned)

    membership = build_proposition_request(
        request_id="subset-elim",
        variables={"A": "set[real]", "B": "set[real]", "x": "real"},
        assumptions=["A subset B", "x in A"],
        goal_text="x in B",
    )
    planned, suggestions, terminal = build_auto_plan(membership)
    assert terminal["status"] == "goal_candidate_complete"
    assert suggestions[-1].rule == "subset_elim"
    assert build_proof_state(planned).status == "ready_for_kernel"


def test_subset_introduction_from_elementwise_implication():
    request = build_proposition_request(
        request_id="subset-intro",
        variables={"A": "set[real]", "B": "set[real]"},
        assumptions=["forall x:real, (x in A) implies (x in B)"],
        goal_text="A subset B",
    )
    planned, suggestions, terminal = build_auto_plan(request)
    assert terminal["status"] == "goal_candidate_complete"
    assert suggestions[-1].rule == "subset_intro"
    assert build_proof_state(planned).status == "ready_for_kernel"
