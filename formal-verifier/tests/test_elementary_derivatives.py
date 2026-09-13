import json
from copy import deepcopy
from pathlib import Path

from quickmaths_formal.capabilities import capability_matrix
from quickmaths_formal.contract import normalize_request
from quickmaths_formal.lean import render_request
from quickmaths_formal.search import search_proof
from quickmaths_formal.state import build_proof_state

FIXTURES = Path(__file__).parents[1] / "fixtures"


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _set_exact_point(raw, point, result):
    raw["variables"] = [{"id": "x", "type": "real"}]
    raw["assumptions"] = []
    raw["goal"]["point"] = point
    raw["goal"]["result"] = result
    raw["steps"][0]["claim"] = deepcopy(raw["goal"])
    raw["steps"][0]["premises"] = []
    return raw


def test_elementary_chain_rule_fixtures_are_ready_searchable_and_reconstructed():
    expected = {
        "exp_derivative.json": ("exp_derivative", ").exp", "Real.exp"),
        "sin_derivative.json": ("sin_derivative", ").sin", "Real.sin"),
        "cos_derivative.json": ("cos_derivative", ").cos", "Real.cos"),
    }
    for filename, (rule, proof_token, function_token) in expected.items():
        raw = load(filename)
        state = build_proof_state(raw)
        assert state.status == "ready_for_kernel", filename
        source = render_request(normalize_request(raw))
        assert proof_token in source, filename
        assert function_token in source, filename
        assert "sorry" not in source.casefold()
        assert "admit" not in source.casefold()

        raw["steps"] = []
        result = search_proof(raw)
        suggestion = next(item for item in result["suggestions"] if item["rule"] == rule)
        assert suggestion["premises"] == []


def test_log_derivative_requires_school_real_positive_domain_and_derives_mathlib_nonzero():
    raw = load("log_derivative.json")
    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert ").log" in source
    assert "ne_of_gt hpos" in source
    assert "field_simp" in source

    without_guard = load("log_derivative_missing_domain.json")
    state = build_proof_state(without_guard)
    assert state.status == "needs_justification"
    codes = {item["code"] for item in state.obligations}
    assert "log_derivative_positive" in codes
    assert "log_domain" in codes
    without_guard["steps"] = []
    result = search_proof(without_guard)
    assert all(item["rule"] != "log_derivative" for item in result.get("suggestions", []))


def test_exact_positive_log_guard_is_reconstructed_with_norm_num():
    raw = _set_exact_point(
        load("log_derivative.json"),
        {"kind": "int", "value": 3},
        {"kind": "rat", "numerator": 1, "denominator": 4},
    )
    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "derivative_step_argument_positive" in source
    assert "0 < ((3 + 1) : ℝ) := by norm_num" in source
    assert "derivative_step_argument_nonzero" in source

    raw["steps"] = []
    suggestion = next(item for item in search_proof(raw)["suggestions"] if item["rule"] == "log_derivative")
    assert suggestion["premises"] == []


def test_exact_negative_log_argument_stays_outside_school_domain_even_though_mathlib_log_is_totalized():
    raw = _set_exact_point(
        load("log_derivative.json"),
        {"kind": "int", "value": -2},
        {"kind": "int", "value": -1},
    )
    state = build_proof_state(raw)
    assert state.status == "needs_justification"
    codes = {item["code"] for item in state.obligations}
    assert "log_derivative_positive" in codes
    assert "log_domain" in codes

    raw["steps"] = []
    result = search_proof(raw)
    assert all(item["rule"] != "log_derivative" for item in result.get("suggestions", []))


def test_absolute_value_positive_and_negative_symbolic_branches_require_matching_sign_evidence():
    for filename, premise, proof_token in [
        ("abs_derivative_positive.json", "hpos", "hasDerivAt_abs_pos"),
        ("abs_derivative_negative.json", "hneg", "hasDerivAt_abs_neg"),
    ]:
        raw = load(filename)
        state = build_proof_state(raw)
        assert state.status == "ready_for_kernel", filename
        source = render_request(normalize_request(raw))
        assert proof_token in source, filename

        raw["steps"] = []
        suggestion = next(item for item in search_proof(raw)["suggestions"] if item["rule"] == "abs_derivative")
        assert suggestion["premises"] == [premise]


def test_absolute_value_exact_signs_are_reconstructed_but_kink_is_rejected():
    positive = _set_exact_point(
        load("abs_derivative_positive.json"),
        {"kind": "int", "value": 3},
        {"kind": "int", "value": 1},
    )
    assert build_proof_state(positive).status == "ready_for_kernel"
    source = render_request(normalize_request(positive))
    assert "argument_positive" in source and ":= by norm_num" in source
    assert "hasDerivAt_abs_pos" in source

    negative = _set_exact_point(
        load("abs_derivative_negative.json"),
        {"kind": "int", "value": 0},
        {"kind": "int", "value": -1},
    )
    assert build_proof_state(negative).status == "ready_for_kernel"
    source = render_request(normalize_request(negative))
    assert "argument_negative" in source and ":= by norm_num" in source
    assert "hasDerivAt_abs_neg" in source

    kink = load("abs_derivative_kink.json")
    state = build_proof_state(kink)
    assert state.status == "needs_justification"
    assert any(item["code"] == "abs_derivative_kink" for item in state.obligations)
    kink["steps"] = []
    assert all(item["rule"] != "abs_derivative" for item in search_proof(kink).get("suggestions", []))


def test_absolute_value_wrong_exact_branch_is_rejected_before_kernel():
    raw = _set_exact_point(
        load("abs_derivative_negative.json"),
        {"kind": "int", "value": 3},
        {"kind": "int", "value": -1},
    )
    state = build_proof_state(raw)
    assert state.status == "needs_justification"
    assert any(item["code"] == "abs_derivative_wrong_branch" for item in state.obligations)


def test_absolute_value_without_symbolic_sign_evidence_stays_unresolved():
    raw = load("abs_derivative_positive.json")
    raw["assumptions"] = []
    raw["steps"][0]["premises"] = []
    state = build_proof_state(raw)
    assert state.status == "needs_justification"
    assert any(item["code"] == "abs_derivative_sign" for item in state.obligations)

    raw["steps"] = []
    result = search_proof(raw)
    assert all(item["rule"] != "abs_derivative" for item in result.get("suggestions", []))


def test_wrong_elementary_formula_or_wrong_named_rule_is_rejected_locally():
    wrong_formula = load("exp_derivative.json")
    wrong_formula["goal"]["result"] = {"kind": "int", "value": 0}
    wrong_formula["steps"][0]["claim"] = deepcopy(wrong_formula["goal"])
    state = build_proof_state(wrong_formula)
    assert state.status == "needs_justification"
    assert any(item["code"] == "exp_derivative_shape" for item in state.obligations)

    wrong_rule = load("sin_derivative.json")
    wrong_rule["steps"][0]["rule"] = "cos_derivative"
    wrong_rule["policy"]["allowed_rules"] = ["cos_derivative"]
    state = build_proof_state(wrong_rule)
    assert state.status == "needs_justification"
    assert any(item["code"] == "cos_derivative_shape" for item in state.obligations)


def test_capabilities_advertise_only_the_new_curated_derivative_surface():
    matrix = capability_matrix()
    calculus = set(matrix["rule_groups"]["calculus"])
    assert {"abs_derivative", "exp_derivative", "log_derivative", "sin_derivative", "cos_derivative"} <= calculus
    expressions = set(matrix["expressions"])
    assert {"exp", "log", "sin", "cos"} <= expressions
    advertised = " ".join(matrix["advertised_families"]["calculus"])
    assert "absolute-value-of-polynomial" in advertised
    assert "exp/log/sin/cos" in advertised
    assert "recursive_derivative" in calculus
    assert "recursive compositional derivatives" in advertised
    assert not any("general recursive derivatives" in item for item in matrix["explicitly_not_yet_advertised"])


def test_missing_log_and_abs_guards_surface_actionable_sign_suggestions():
    log_state = build_proof_state(load("log_derivative_missing_domain.json"))
    positive_actions = [item for item in log_state.suggestions if item.get("action") == "prove_positive"]
    assert positive_actions
    assert any("positivity" in item.get("rule_hints", []) for item in positive_actions)

    absolute = load("abs_derivative_positive.json")
    absolute["assumptions"] = []
    absolute["steps"][0]["premises"] = []
    abs_state = build_proof_state(absolute)
    sign_actions = [item for item in abs_state.suggestions if item.get("action") == "prove_strict_sign"]
    assert sign_actions
    assert sign_actions[0]["claim_preview"].startswith("0 <")


def test_reference_text_protocol_accepts_new_log_rule_without_claiming_kernel_success(monkeypatch):
    from quickmaths_formal.protocol import handle_message

    monkeypatch.setenv("PATH", "")
    response = handle_message({
        "protocol_version": "0.1",
        "op": "check_reference_text",
        "request_id": "log-reference-text",
        "declarations": ["x:real", "a:real"],
        "assumptions": ["0 < a + 1"],
        "goal": "The derivative of log(x + 1) with respect to x at a is 1/(a + 1).",
        "allowed_rules": ["log_derivative"],
        "reference_steps": [{
            "claim": "The derivative of log(x + 1) with respect to x at a is 1/(a + 1).",
            "rule": "log_derivative",
            "premises": ["h1"],
        }],
        "max_seconds": 10,
    }, project_dir=FIXTURES.parent)
    assert response["ok"] is True
    result = response["result"]
    assert result["proof_state"]["status"] == "ready_for_kernel"
    assert result["verification"]["status"] == "verification_unavailable"
    assert result["verification"]["certificate"] is None
