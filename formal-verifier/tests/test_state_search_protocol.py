import json
from copy import deepcopy
from pathlib import Path

from quickmaths_formal.protocol import handle_message
from quickmaths_formal.search import build_auto_request, search_proof
from quickmaths_formal.state import build_proof_state
from quickmaths_formal.verifier import verify_request

FIXTURES = Path(__file__).parents[1] / "fixtures"


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def ring_without_steps():
    request = load("guarded_cancellation.json")
    request["assumptions"] = []
    request["goal"] = {
        "kind": "proposition",
        "proposition": {
            "kind": "eq",
            "left": {
                "kind": "pow",
                "base": {"kind": "add", "left": {"kind": "var", "id": "x"}, "right": {"kind": "int", "value": 1}},
                "exponent": 2,
            },
            "right": {
                "kind": "add",
                "left": {"kind": "add", "left": {"kind": "pow", "base": {"kind": "var", "id": "x"}, "exponent": 2}, "right": {"kind": "mul", "left": {"kind": "int", "value": 2}, "right": {"kind": "var", "id": "x"}}},
                "right": {"kind": "int", "value": 1},
            },
        },
    }
    request["steps"] = []
    request["policy"]["allowed_rules"] = ["ring_identity"]
    request["request_id"] = "ring-search"
    return request


def test_state_exposes_actionable_missing_nonzero_obligation():
    state = build_proof_state(load("missing_restriction.json"))
    assert state.status == "needs_justification"
    assert any(row["action"] == "prove_nonzero" for row in state.suggestions)
    preview = next(row["claim_preview"] for row in state.suggestions if row.get("claim_preview"))
    assert "3" in preview and "≠" in preview


def test_search_finds_ring_candidate_and_auto_request_becomes_kernel_ready():
    raw = ring_without_steps()
    result = search_proof(raw)
    assert result["status"] == "candidate_found"
    assert result["suggestions"][0]["rule"] == "ring_identity"
    augmented, suggestion = build_auto_request(raw)
    assert suggestion is not None
    state = build_proof_state(augmented)
    assert state.status == "ready_for_kernel"
    assert state.kernel_ready


def test_auto_candidate_never_becomes_verified_without_lean(monkeypatch):
    monkeypatch.setenv("PATH", "")
    augmented, _ = build_auto_request(ring_without_steps())
    result = verify_request(augmented, project_dir=FIXTURES.parent)
    assert result.status == "verification_unavailable"
    assert result.certificate is None


def test_exact_counterexample_can_refute_a_free_variable_theorem():
    request = ring_without_steps()
    request["goal"] = {
        "kind": "proposition",
        "proposition": {
            "kind": "eq",
            "left": {"kind": "pow", "base": {"kind": "var", "id": "x"}, "exponent": 2},
            "right": {"kind": "neg", "arg": {"kind": "int", "value": 1}},
        },
    }
    state = build_proof_state(request)
    assert state.status == "refuted"
    assert state.counterexample is not None
    assert "x" in state.counterexample


def test_protocol_parses_without_implicit_variables():
    response = handle_message({"op": "parse_proposition", "variables": ["x"], "text": "x != 3"})
    assert response["ok"]
    assert response["result"]["preview"] == "x ≠ 3"
    rejected = handle_message({"op": "parse_expression", "variables": ["x"], "text": "x + y"})
    assert not rejected["ok"]
    assert rejected["error"]["code"] == "ambiguous_input"


def test_prove_text_consumes_quantified_interval_evidence_without_forging_certificate(monkeypatch):
    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "op": "prove_text",
        "request_id": "interval-evidence-rpc",
        "declarations": [],
        "assumptions": ["for every t:real in [0, 1], t + 2 != 0"],
        "goal": "there exists c:real, (0 <= c) and ((c <= 1) and (1/(c+2) = 2/5))",
        "allowed_rules": ["continuous_ivt_exists"],
    })
    assert response["ok"]
    verification = response["result"]["verification"]
    assert verification["status"] == "verification_unavailable"
    assert verification["certificate"] is None
    assert "exact h1 c hmem" in verification["lean_source"]
