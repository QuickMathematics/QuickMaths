from quickmaths_formal.authoring import build_proposition_request
from quickmaths_formal.lean import render_request
from quickmaths_formal.planner import build_structured_plan
from quickmaths_formal.rules import preflight
from quickmaths_formal.state import build_proof_state


def test_planner_introduces_arbitrary_binder_for_universal_identity():
    request = build_proposition_request(
        request_id="forall-id",
        goal_text="forall z:real, z = z",
        variables={},
        allowed_rules=["eq_refl", "forall_intro"],
    )
    planned, added, conclusion = build_structured_plan(request)
    assert conclusion is not None
    assert [row["rule"] for row in added] == ["eq_refl", "forall_intro"]
    child = next(row for row in planned["scopes"] if row["id"] != "root")
    assert child["binders"] == [{"id": "z", "type": "real"}]
    assert not preflight(planned)
    state = build_proof_state(planned)
    assert state.status == "ready_for_kernel"

    source = render_request(planned)
    assert "∀ (z : ℝ), z = z" in source
    assert "intro z" in source
    assert "rfl" in source


def test_scope_binder_cannot_shadow_problem_variable():
    request = build_proposition_request(request_id="shadow", goal_text="x = x", variables={"x": "real"})
    request["scopes"].append({"id": "child", "parent": "root", "binders": [{"id": "x", "type": "real"}]})
    from quickmaths_formal.contract import ContractError, normalize_request
    try:
        normalize_request(request)
    except ContractError as exc:
        assert "shadow" in str(exc)
    else:
        raise AssertionError("expected binder shadowing to be rejected")


def test_planner_proves_bounded_interval_guard_with_scoped_arithmetic():
    request = build_proposition_request(
        request_id="forall-interval-positive",
        goal_text="for every t:real in [0, 1], 0 < t + 2",
        variables={},
        allowed_rules=["forall_intro", "imp_intro", "and_elim_left", "and_elim_right", "linarith"],
    )
    planned, added, conclusion = build_structured_plan(request)
    assert conclusion is not None
    assert [row["rule"] for row in added] == [
        "and_elim_left",
        "and_elim_right",
        "linarith",
        "imp_intro",
        "forall_intro",
    ]
    assert not preflight(planned)
    assert build_proof_state(planned).status == "ready_for_kernel"

    source = render_request(planned)
    assert "∀ (t : ℝ), ((0 ≤ t) ∧ (t ≤ 1)) → (0 < (t + 2))" in source
    assert "linarith" in source
