from quickmaths_formal.protocol import handle_message


def rpc(**message):
    return handle_message(message)


def test_interactive_request_starts_with_visible_unestablished_goal():
    response = rpc(
        op="new_text_request",
        request_id="manual-ring",
        declarations=["x:real"],
        assumptions=[],
        goal="x + 0 = x",
    )
    assert response["ok"] is True
    result = response["result"]
    assert result["request"]["steps"] == []
    assert result["proof_state"]["status"] == "needs_justification"
    assert result["proof_state"]["goal_established"] is False
    assert result["proof_state"]["context"] == []


def test_interactive_ring_step_establishes_goal_candidate():
    initial = rpc(
        op="new_text_request",
        request_id="manual-ring",
        declarations=["x:real"],
        assumptions=[],
        goal="x + 0 = x",
    )["result"]["request"]
    response = rpc(
        op="append_text_step",
        request=initial,
        claim="x + 0 = x",
        rule="ring_identity",
    )
    assert response["ok"] is True
    result = response["result"]
    assert result["added_step"]["id"] == "user_step_1"
    assert result["proof_state"]["status"] == "ready_for_kernel"
    assert result["proof_state"]["goal_established"] is True


def test_interactive_guarded_cancellation_builds_obligation_then_discharges_it():
    initial = rpc(
        op="new_text_request",
        request_id="manual-cancel",
        declarations=["x:real"],
        assumptions=["x != 3"],
        goal="(x^2 - 9)/(x - 3) = x + 3",
    )["result"]["request"]
    guard = rpc(
        op="append_text_step",
        request=initial,
        claim="x - 3 != 0",
        rule="sub_ne_zero_from_ne",
        premises=["h1"],
    )
    assert guard["ok"] is True
    assert guard["result"]["proof_state"]["goal_established"] is False
    assert guard["result"]["proof_state"]["context"][0] == {"id": "h1", "scope": "root", "claim": "x ≠ 3"}

    final = rpc(
        op="append_text_step",
        request=guard["result"]["request"],
        claim="(x^2 - 9)/(x - 3) = x + 3",
        rule="field_identity",
        premises=["user_step_1"],
    )
    assert final["ok"] is True
    assert final["result"]["proof_state"]["status"] == "ready_for_kernel"
    assert [row["rule"] for row in final["result"]["request"]["steps"]] == [
        "sub_ne_zero_from_ne",
        "field_identity",
    ]


def test_interactive_text_parameters_are_parsed_as_typed_terms():
    initial = rpc(
        op="new_text_request",
        request_id="manual-add",
        declarations=["x:real"],
        assumptions=["x = 1"],
        goal="x + 2 = 3",
    )["result"]["request"]
    response = rpc(
        op="append_text_step",
        request=initial,
        claim="x + 2 = 1 + 2",
        rule="add_both_sides",
        premises=["h1"],
        parameters={"term": "2"},
    )
    assert response["ok"] is True
    assert response["result"]["added_step"]["parameters"]["term"] == {"kind": "int", "value": 2}


def test_reference_text_protocol_builds_exact_submitted_candidate_before_kernel_check():
    response = rpc(
        op="check_reference_text",
        declarations=["x:real"],
        assumptions=[],
        goal="x + 3 = 3 + x",
        allowed_rules=["ring_identity"],
        reference_steps=[{"claim": "x + 3 = 3 + x", "rule": "ring_identity", "premises": []}],
    )
    assert response["ok"] is True
    result = response["result"]
    assert result["proof_state"]["status"] == "ready_for_kernel"
    assert result["request"]["steps"][0]["id"] == "reference_step_1"
    assert result["verification"]["proof_mode"] == "reference"
    assert result["verification"]["status"] in {"verified", "verification_unavailable"}


def test_reference_text_protocol_rejects_malformed_step_list():
    response = rpc(
        op="check_reference_text",
        declarations=["x:real"],
        assumptions=[],
        goal="x = x",
        allowed_rules=["eq_refl"],
        reference_steps=["not a step"],
    )
    assert response["ok"] is False
    assert response["error"]["code"] == "ambiguous_input"


def test_interactive_limit_goal_roundtrips_into_calculus_search():
    response = rpc(
        op="new_text_request",
        request_id="limit-hole-text",
        declarations=["x:real"],
        assumptions=[],
        goal="As x approaches 3 from both sides, (x^2 - 9)/(x - 3) approaches 6.",
        allowed_rules=["rational_hole_limit"],
    )
    assert response["ok"] is True
    request = response["result"]["request"]
    assert request["goal"]["kind"] == "limit"
    suggestion = rpc(op="search", request=request)
    assert suggestion["ok"] is True
    assert suggestion["result"]["suggestions"][0]["rule"] == "rational_hole_limit"


def test_reference_limit_step_can_be_entered_in_canonical_text():
    goal = "As x approaches 0 from the right, 1/x approaches +infinity."
    response = rpc(
        op="check_reference_text",
        declarations=["x:real"], assumptions=[], goal=goal,
        allowed_rules=["inverse_one_sided_limit"],
        reference_steps=[{
            "claim": goal,
            "rule": "inverse_one_sided_limit",
            "premises": [],
            "parameters": {"direction": "right"},
        }],
    )
    assert response["ok"] is True
    assert response["result"]["proof_state"]["status"] == "ready_for_kernel"
    assert response["result"]["request"]["steps"][0]["claim"]["kind"] == "limit"
