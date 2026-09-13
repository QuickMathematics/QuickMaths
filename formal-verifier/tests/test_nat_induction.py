from quickmaths_formal.authoring import build_proposition_request
from quickmaths_formal.lean import render_request
from quickmaths_formal.search import build_auto_plan
from quickmaths_formal.state import build_proof_state


def test_planner_builds_scoped_nat_induction_when_forall_intro_is_not_allowed():
    request = build_proposition_request(
        request_id="nat-induction",
        variables={},
        goal_text="forall n:nat, n + 0 = n",
        allowed_rules=["nat_induction", "ring_identity", "eq_refl", "norm_num"],
    )
    planned, suggestions, terminal = build_auto_plan(request)
    assert terminal["status"] == "goal_candidate_complete"
    rules = [item.rule for item in suggestions]
    assert rules[-1] == "nat_induction"
    assert build_proof_state(planned).status == "ready_for_kernel"
    child = next(scope for scope in planned["scopes"] if scope["id"] != "root")
    assert child["binders"][0]["type"] == "nat"
    local = next(row for row in planned["assumptions"] if row["scope"] == child["id"])
    assert local["id"].startswith("auto_assumption")

    source = render_request(planned)
    assert "induction n with" in source
    assert "| zero =>" in source
    assert "| succ" in source


def test_induction_hypothesis_does_not_leak_to_parent_steps():
    from quickmaths_formal.contract import ContractError, normalize_request
    request = build_proposition_request(
        request_id="induction-leak",
        variables={},
        goal_text="forall n:nat, n = n",
    )
    request["scopes"].append({"id": "step", "parent": "root", "binders": [{"id": "k", "type": "nat"}]})
    request["assumptions"].append({
        "id": "ih", "scope": "step", "claim": {"kind": "eq", "left": {"kind": "var", "id": "k"}, "right": {"kind": "var", "id": "k"}},
    })
    request["steps"].append({
        "id": "bad", "scope": "root", "claim": {"kind": "proposition", "proposition": {"kind": "true"}},
        "rule": "true_intro", "premises": ["ih"], "parameters": {},
    })
    try:
        normalize_request(request)
    except ContractError as exc:
        assert "leaks premise" in str(exc)
    else:
        raise AssertionError("expected induction-hypothesis leakage to be rejected")
