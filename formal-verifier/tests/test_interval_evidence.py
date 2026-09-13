import json
from copy import deepcopy
from pathlib import Path

from quickmaths_formal.authoring import build_text_request
from quickmaths_formal.calculus import (
    continuous_ivt_guard_status,
    interval_guard_evidence_candidates,
    match_continuous_ivt_existence,
    match_interval_guard_evidence,
)
from quickmaths_formal.contract import normalize_request
from quickmaths_formal.lean import render_request
from quickmaths_formal.parser import parse_proposition_text, render_proposition_text
from quickmaths_formal.search import search_proof
from quickmaths_formal.state import build_proof_state

FIXTURES = Path(__file__).parents[1] / "fixtures"


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_interval_quantifier_authoring_sugar_normalizes_to_forall_implication():
    prop = parse_proposition_text("for every t:real in [0, 1], t + 2 != 0", [])
    assert prop["kind"] == "forall"
    assert prop["binder"] == {"id": "t", "type": "real"}
    assert prop["body"]["kind"] == "implies"
    assert prop["body"]["left"]["kind"] == "and"
    assert prop["body"]["right"]["kind"] == "ne"
    # Canonical rendering remains ordinary logic, and round-trips exactly.
    rendered = render_proposition_text(prop)
    assert parse_proposition_text(rendered, []) == prop


def test_quantified_interval_guard_makes_ivt_kernel_ready_and_is_cited():
    raw = load("continuous_ivt_quantified_guard.json")
    pattern = match_continuous_ivt_existence(raw["goal"])
    assert pattern is not None and len(pattern.guards) == 1
    assert pattern.guards[0].relation == "nonzero"
    missing, violated = continuous_ivt_guard_status(pattern, [raw["assumptions"][0]["claim"]])
    assert not missing and not violated
    assert build_proof_state(raw).status == "ready_for_kernel"

    source = render_request(normalize_request(raw))
    assert "∀ (t : ℝ), ((0 ≤ t) ∧ (t ≤ 1)) → ((t + 2) ≠ 0)" in source
    assert "exact h1 c hmem" in source
    assert "intermediate_value_Icc'" in source


def test_search_adds_quantified_interval_guard_as_a_real_premise():
    raw = load("continuous_ivt_quantified_guard.json")
    raw["steps"] = []
    result = search_proof(raw)
    suggestion = next(item for item in result["suggestions"] if item["rule"] == "continuous_ivt_exists")
    assert suggestion["premises"] == ["h1"]


def test_missing_interval_guard_is_reported_as_quantified_evidence_not_witness_fact():
    raw = load("continuous_ivt_missing_interval_guard.json")
    state = build_proof_state(raw)
    assert state.status == "needs_justification"
    obligation = next(item for item in state.obligations if item["code"] == "ivt_interval_guard_required")
    expected = obligation["expected_claim"]["proposition"]
    assert expected["kind"] == "forall"
    assert expected["body"]["kind"] == "implies"
    assert expected["body"]["right"]["kind"] == "ne"
    assert all(item["code"] != "denominator_nonzero" for item in state.obligations)
    suggestion = next(item for item in state.suggestions if item["code"] == "ivt_interval_guard_required")
    assert suggestion["action"] == "prove_interval_guard"
    assert "forall_intro" in suggestion["rule_hints"]

    raw["steps"] = []
    result = search_proof(raw)
    assert all(item["rule"] != "continuous_ivt_exists" for item in result.get("suggestions", []))


def test_alpha_renamed_interval_binder_is_accepted():
    raw = load("continuous_ivt_quantified_guard.json")
    raw["assumptions"][0]["claim"] = parse_proposition_text(
        "forall y:real, ((0 <= y) and (y <= 1)) implies (y + 2 != 0)", []
    )
    pattern = match_continuous_ivt_existence(raw["goal"])
    guard = pattern.guards[0]
    matched = match_interval_guard_evidence(pattern, guard, raw["assumptions"][0]["claim"])
    assert matched is not None and matched.conversion == "exact"
    assert build_proof_state(raw).status == "ready_for_kernel"


def test_stronger_positive_interval_evidence_can_discharge_nonzero_guard():
    raw = load("continuous_ivt_quantified_guard.json")
    raw["assumptions"][0]["claim"] = parse_proposition_text(
        "for every t:real in [0, 1], 0 < t + 2", []
    )
    pattern = match_continuous_ivt_existence(raw["goal"])
    guard = pattern.guards[0]
    matched = match_interval_guard_evidence(pattern, guard, raw["assumptions"][0]["claim"])
    assert matched is not None and matched.conversion == "positive_to_nonzero"
    assert build_proof_state(raw).status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "exact ne_of_gt (h1 c hmem)" in source


def test_evidence_for_a_different_interval_is_not_silently_reused():
    raw = load("continuous_ivt_quantified_guard.json")
    raw["assumptions"][0]["claim"] = parse_proposition_text(
        "for every t:real in [0, 2], t + 2 != 0", []
    )
    state = build_proof_state(raw)
    assert state.status == "needs_justification"
    assert any(item["code"] == "ivt_interval_guard_required" for item in state.obligations)


def test_interval_guard_candidates_are_explicit_universal_propositions():
    raw = load("continuous_ivt_quantified_guard.json")
    pattern = match_continuous_ivt_existence(raw["goal"])
    candidates = interval_guard_evidence_candidates(pattern, pattern.guards[0])
    assert [item.conversion for item in candidates] == ["exact", "positive_to_nonzero", "negative_to_nonzero"]
    assert all(item.claim["kind"] == "forall" for item in candidates)
