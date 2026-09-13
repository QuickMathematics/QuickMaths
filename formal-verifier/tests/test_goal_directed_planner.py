from quickmaths_formal.authoring import build_proposition_request
from quickmaths_formal.lean import render_request
from quickmaths_formal.search import build_auto_plan
from quickmaths_formal.state import build_proof_state
from quickmaths_formal.verifier import prove_goal


def request(goal, *, variables=None, assumptions=None):
    return build_proposition_request(
        request_id="planner",
        variables=variables or {"x": "real", "y": "real"},
        goal_text=goal,
        assumptions=assumptions or [],
    )


def test_planner_proves_identity_implication_with_a_scoped_assumption():
    raw = request("(x = 0) implies (x = 0)")
    planned, added, terminal = build_auto_plan(raw)
    assert terminal["status"] == "goal_candidate_complete"
    assert [item.rule for item in added] == ["imp_intro"]
    assert len(planned["scopes"]) == 2
    assert build_proof_state(planned).status == "ready_for_kernel"
    source = render_request(planned)
    assert "intro auto_assumption" in source


def test_planner_proves_conjunction_elimination_inside_implication():
    raw = request("((x = 0) and (y = 1)) implies (x = 0)")
    planned, added, terminal = build_auto_plan(raw)
    assert terminal["status"] == "goal_candidate_complete"
    assert [item.rule for item in added] == ["and_elim_left", "imp_intro"]
    assert build_proof_state(planned).status == "ready_for_kernel"


def test_planner_can_build_guarded_rational_algebra_inside_implication(monkeypatch):
    raw = request("(x != 3) implies ((x^2 - 9)/(x - 3) = x + 3)", variables={"x": "real"})
    planned, added, terminal = build_auto_plan(raw)
    assert terminal["status"] == "goal_candidate_complete"
    assert [item.rule for item in added] == ["sub_ne_zero_from_ne", "field_identity", "imp_intro"]
    assert build_proof_state(planned).status == "ready_for_kernel"
    source = render_request(planned)
    assert "sub_ne_zero.mpr" in source
    assert "field_simp" in source
    assert "intro auto_assumption" in source

    monkeypatch.setenv("PATH", "")
    result = prove_goal(raw)
    assert result.status == "verification_unavailable"
    assert result.certificate is None
    assert result.proof_mode == "assisted"


def test_planner_proves_biconditional_by_two_distinct_subproofs():
    raw = request("(x = 0) iff ((x = 0) and true)")
    planned, added, terminal = build_auto_plan(raw)
    assert terminal["status"] == "goal_candidate_complete"
    rules = [item.rule for item in added]
    assert rules.count("imp_intro") == 2
    assert "and_elim_left" in rules
    assert "true_intro" in rules
    assert "and_intro" in rules
    assert added[-1].rule == "iff_intro"
    assert build_proof_state(planned).status == "ready_for_kernel"
