from quickmaths_formal.authoring import build_proposition_request
from quickmaths_formal.lean import render_request
from quickmaths_formal.search import build_auto_plan
from quickmaths_formal.state import build_proof_state


def test_goal_directed_planner_unpacks_existential_without_leaking_witness():
    request = build_proposition_request(
        request_id="exists-elim",
        variables={"x": "real"},
        assumptions=[
            "exists z:real, z = x",
            "forall y:real, (y = x) implies (x = 0)",
        ],
        goal_text="x = 0",
    )
    planned, suggestions, terminal = build_auto_plan(request)
    assert terminal["status"] == "goal_candidate_complete"
    rules = [item.rule for item in suggestions]
    assert rules[-1] == "exists_elim"
    assert "forall_elim" in rules
    assert "modus_ponens" in rules
    assert build_proof_state(planned).status == "ready_for_kernel"

    child = next(scope for scope in planned["scopes"] if scope["id"] != "root")
    assert len(child["binders"]) == 1
    witness_name = child["binders"][0]["id"]
    assert witness_name.startswith("auto_witness")
    # The parent theorem target is still x = 0; the local witness never appears there.
    assert witness_name not in str(planned["goal"])

    source = render_request(planned)
    assert "rcases" in source
    assert f"⟨{witness_name}," in source
    assert "exact" in source


def test_existential_witness_cannot_be_referenced_by_parent_claim():
    # Structural scope validation catches this before rule semantics or Lean rendering.
    from quickmaths_formal.contract import ContractError, normalize_request
    request = build_proposition_request(
        request_id="exists-leak",
        variables={"x": "real"},
        assumptions=["exists z:real, z = x"],
        goal_text="x = x",
    )
    request["scopes"].append({"id": "child", "parent": "root", "binders": [{"id": "w", "type": "real"}]})
    request["steps"].append({
        "id": "bad",
        "scope": "root",
        "claim": {"kind": "proposition", "proposition": {"kind": "eq", "left": {"kind": "var", "id": "w"}, "right": {"kind": "var", "id": "w"}}},
        "rule": "eq_refl",
        "premises": [],
        "parameters": {},
    })
    try:
        normalize_request(request)
    except ContractError as exc:
        assert "unknown variable" in str(exc)
    else:
        raise AssertionError("expected witness leakage to be rejected")
