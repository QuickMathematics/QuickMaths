from quickmaths_formal.authoring import build_proposition_request, parse_variable_declarations
from quickmaths_formal.search import build_auto_plan
from quickmaths_formal.state import build_proof_state
from quickmaths_formal.verifier import prove_goal


def test_school_notation_domain_assumption_builds_two_step_cancellation_plan(monkeypatch):
    request = build_proposition_request(
        request_id="school-cancel",
        variables={"x": "real"},
        assumptions=["x != 3"],
        goal_text="(x^2 - 9)/(x - 3) = x + 3",
    )
    planned, suggestions, terminal = build_auto_plan(request)
    assert [row.rule for row in suggestions] == ["sub_ne_zero_from_ne", "field_identity"]
    assert terminal["status"] == "goal_candidate_complete"
    assert build_proof_state(planned).status == "ready_for_kernel"

    monkeypatch.setenv("PATH", "")
    result = prove_goal(request)
    assert result.status == "verification_unavailable"
    assert result.proof_mode == "assisted"
    assert len(result.resolved_request["steps"]) == 2
    assert "sub_ne_zero.mpr h1" in result.lean_source
    assert "field_simp [auto_proof_1]" in result.lean_source


def test_variable_declaration_parser_is_explicit():
    assert parse_variable_declarations(["x:real", "n:nat"]) == {"x": "real", "n": "nat"}


def test_variable_declaration_parser_supports_function_and_set_types():
    assert parse_variable_declarations(["f:real->real", "A:set[real]"]) == {
        "f": "real->real",
        "A": "set[real]",
    }
