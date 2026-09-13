from quickmaths_formal.authoring import build_proposition_request
from quickmaths_formal.lean import render_request
from quickmaths_formal.search import build_auto_plan
from quickmaths_formal.state import build_proof_state


def test_planner_proves_disjunction_commutativity_by_isolated_cases():
    raw = build_proposition_request(
        request_id="or-comm",
        variables={"x": "real", "y": "real"},
        goal_text="((x = 0) or (y = 1)) implies ((y = 1) or (x = 0))",
    )
    planned, added, terminal = build_auto_plan(raw)
    assert terminal["status"] == "goal_candidate_complete"
    rules = [item.rule for item in added]
    assert "or_elim" in rules
    assert "or_intro_left" in rules
    assert "or_intro_right" in rules
    assert rules[-1] == "imp_intro"
    assert build_proof_state(planned).status == "ready_for_kernel"

    child_scopes = [row for row in planned["scopes"] if row["id"] != "root"]
    assert len(child_scopes) == 3  # outer implication + two case branches
    source = render_request(planned)
    assert "rcases" in source
    assert "_cases" in source
    assert "Or.inl" in source
    assert "Or.inr" in source


def test_case_branch_fact_cannot_be_used_after_or_elim_without_discharge():
    raw = build_proposition_request(
        request_id="or-comm",
        variables={"x": "real", "y": "real"},
        goal_text="((x = 0) or (y = 1)) implies ((y = 1) or (x = 0))",
    )
    planned, _added, _terminal = build_auto_plan(raw)
    # The only root-visible proof of the consequent is the discharged implication;
    # branch-local facts remain scoped and never become root assumptions/steps.
    root_ids = {row["id"] for row in planned["steps"] if row["scope"] == "root"}
    branch_ids = {row["id"] for row in planned["steps"] if row["scope"] != "root"}
    assert root_ids.isdisjoint(branch_ids)
    assert any(row["rule"] == "or_elim" and row["scope"] != "root" for row in planned["steps"])
