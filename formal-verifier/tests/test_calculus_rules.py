import json
from copy import deepcopy
from pathlib import Path

from quickmaths_formal.contract import normalize_request
from quickmaths_formal.lean import render_request
from quickmaths_formal.search import build_auto_request, search_proof
from quickmaths_formal.state import build_proof_state
from quickmaths_formal.verifier import verify_request

FIXTURES = Path(__file__).parents[1] / "fixtures"


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_conjugate_limit_is_locally_ready_and_preserves_domain_in_lean():
    raw = load("conjugate_limit.json")
    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "Real.sq_sqrt hx0" in source
    assert "x ≠ 4" in source
    assert "nhdsWithin 4" in source
    assert "hden : x - 4 ≠ 0" in source


def test_conjugate_limit_wrong_target_is_rejected_before_kernel():
    raw = load("conjugate_limit.json")
    raw["goal"]["result"]["value"] = {"kind": "rat", "numerator": 1, "denominator": 5}
    raw["steps"][0]["claim"] = deepcopy(raw["goal"])
    state = build_proof_state(raw)
    assert state.status == "needs_justification"
    assert any(item["code"] == "conjugate_limit_shape" for item in state.obligations)


def test_piecewise_jump_is_locally_ready_and_uses_one_sided_uniqueness():
    raw = load("piecewise_jump.json")
    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "nhdsLT_le_nhdsNE 0" in source
    assert "nhdsGT_le_nhdsNE 0" in source
    assert "tendsto_nhds_unique hl_left hleft" in source
    assert "tendsto_nhds_unique hl_right hright" in source


def test_equal_piecewise_branches_are_not_a_jump_rule():
    raw = load("piecewise_jump.json")
    raw["goal"]["expression"]["else"] = deepcopy(raw["goal"]["expression"]["then"])
    raw["steps"][0]["claim"] = deepcopy(raw["goal"])
    state = build_proof_state(raw)
    assert state.status == "needs_justification"
    assert any(item["code"] == "piecewise_jump_shape" for item in state.obligations)


def test_search_can_suggest_both_calculus_families_without_claiming_verification(monkeypatch):
    for name, rule in [("conjugate_limit.json", "conjugate_limit"), ("piecewise_jump.json", "piecewise_jump")]:
        raw = load(name)
        raw["steps"] = []
        result = search_proof(raw)
        assert result["status"] == "candidate_found"
        assert result["suggestions"][0]["rule"] == rule
        augmented, suggestion = build_auto_request(raw)
        assert suggestion is not None
        assert build_proof_state(augmented).status == "ready_for_kernel"
        monkeypatch.setenv("PATH", "")
        verified = verify_request(augmented, project_dir=FIXTURES.parent, proof_mode="assisted")
        assert verified.status == "verification_unavailable"
        assert verified.certificate is None


def test_ivt_polynomial_existence_is_ready_but_does_not_claim_uniqueness():
    raw = load("ivt_existence.json")
    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "intermediate_value_Icc" in source
    assert "ContinuousOn" in source
    assert "hmem.1" in source and "hmem.2" in source
    assert "unique" not in source.casefold()


def test_ivt_target_outside_endpoint_range_is_rejected_before_kernel():
    raw = load("ivt_existence.json")
    equation = raw["goal"]["proposition"]["body"]["right"]["right"]
    equation["right"] = {"kind": "int", "value": 5}
    raw["steps"][0]["claim"] = deepcopy(raw["goal"])
    state = build_proof_state(raw)
    assert state.status == "needs_justification"
    assert any(item["code"] == "ivt_exists_shape" for item in state.obligations)


def test_search_suggests_ivt_existence_without_upgrading_to_uniqueness():
    raw = load("ivt_existence.json")
    raw["steps"] = []
    result = search_proof(raw)
    assert result["status"] == "candidate_found"
    assert result["suggestions"][0]["rule"] == "ivt_exists"
    assert "existence" in result["suggestions"][0]["explanation"].casefold()


def test_polynomial_derivative_at_declared_point_is_ready_and_searchable():
    raw = load("polynomial_derivative.json")
    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    theorem_line = next(line for line in source.splitlines() if line.startswith("public theorem result"))
    assert theorem_line.startswith("public theorem result (a : ℝ) :")
    assert not theorem_line.startswith("public theorem result (x : ℝ)")
    assert "HasDerivAt" in source
    assert "hasDerivAt_id'" in source
    assert ".fun_pow 2" in source
    assert ".fun_mul" in source

    raw["steps"] = []
    result = search_proof(raw)
    assert result["status"] == "candidate_found"
    assert result["suggestions"][0]["rule"] == "polynomial_derivative"


def test_wrong_polynomial_derivative_is_rejected_before_kernel():
    raw = load("polynomial_derivative.json")
    wrong = {"kind": "int", "value": 5}
    raw["goal"]["result"] = wrong
    raw["steps"][0]["claim"]["result"] = wrong
    state = build_proof_state(raw)
    assert state.status == "needs_justification"
    assert any(item["code"] == "polynomial_derivative_shape" for item in state.obligations)


def test_quotient_derivative_requires_pointwise_denominator_guard_and_renders_fun_div():
    raw = load("quotient_derivative.json")
    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert ".fun_div" in source
    assert "hden" in source
    assert "field_simp [hden]" in source

    raw["assumptions"] = []
    raw["steps"][0]["premises"] = []
    state = build_proof_state(raw)
    assert state.status == "needs_justification"
    codes = {item["code"] for item in state.obligations}
    assert "denominator_nonzero_at_point" in codes or "denominator_nonzero" in codes


def test_search_suggests_quotient_derivative_only_when_point_guard_is_available():
    raw = load("quotient_derivative.json")
    raw["steps"] = []
    result = search_proof(raw)
    quotient = next(item for item in result["suggestions"] if item["rule"] == "quotient_derivative")
    assert quotient["premises"] == ["hden"]

    raw["assumptions"] = []
    result = search_proof(raw)
    assert all(item["rule"] != "quotient_derivative" for item in result.get("suggestions", []))


def test_sqrt_derivative_requires_strictly_positive_radicand_at_point():
    raw = load("sqrt_derivative.json")
    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert ".sqrt" in source
    assert "Real.sqrt_pos.2 hpos" in source
    assert "ne_of_gt hpos" in source

    raw["assumptions"][0]["claim"] = {
        "kind": "le",
        "left": {"kind": "int", "value": 0},
        "right": {"kind": "var", "id": "a"},
    }
    raw["steps"][0]["premises"] = ["hpos"]
    state = build_proof_state(raw)
    assert state.status == "needs_justification"
    assert any(item["code"] == "sqrt_derivative_positive" for item in state.obligations)


def test_search_suggests_sqrt_derivative_only_with_strict_positivity_evidence():
    raw = load("sqrt_derivative.json")
    raw["steps"] = []
    result = search_proof(raw)
    suggestion = next(item for item in result["suggestions"] if item["rule"] == "sqrt_derivative")
    assert suggestion["premises"] == ["hpos"]

    raw["assumptions"] = []
    result = search_proof(raw)
    assert all(item["rule"] != "sqrt_derivative" for item in result.get("suggestions", []))


def test_exact_arithmetic_quotient_guard_is_discharged_and_reconstructed():
    raw = load("quotient_derivative.json")
    raw["variables"] = [{"id": "x", "type": "real"}]
    raw["assumptions"] = []
    raw["goal"]["point"] = {"kind": "int", "value": 2}
    raw["goal"]["result"] = {"kind": "int", "value": -1}
    raw["steps"][0]["claim"] = deepcopy(raw["goal"])
    raw["steps"][0]["premises"] = []

    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "derivative_step_denominator_nonzero" in source
    assert "≠ 0 := by norm_num" in source

    raw["steps"] = []
    result = search_proof(raw)
    suggestion = next(item for item in result["suggestions"] if item["rule"] == "quotient_derivative")
    assert suggestion["premises"] == []


def test_exact_arithmetic_sqrt_guard_is_discharged_and_reconstructed():
    raw = load("sqrt_derivative.json")
    raw["variables"] = [{"id": "x", "type": "real"}]
    raw["assumptions"] = []
    raw["goal"]["expression"] = {
        "kind": "sqrt",
        "arg": {
            "kind": "add",
            "left": {"kind": "var", "id": "x"},
            "right": {"kind": "int", "value": 1},
        },
    }
    raw["goal"]["point"] = {"kind": "int", "value": 3}
    raw["goal"]["result"] = {
        "kind": "div",
        "left": {"kind": "int", "value": 1},
        "right": {
            "kind": "mul",
            "left": {"kind": "int", "value": 2},
            "right": {
                "kind": "sqrt",
                "arg": {
                    "kind": "add",
                    "left": {"kind": "int", "value": 3},
                    "right": {"kind": "int", "value": 1},
                },
            },
        },
    }
    raw["steps"][0]["claim"] = deepcopy(raw["goal"])
    raw["steps"][0]["premises"] = []

    state = build_proof_state(raw)
    assert state.status == "ready_for_kernel"
    source = render_request(normalize_request(raw))
    assert "derivative_step_radicand_positive" in source
    assert "0 < ((3 + 1) : ℝ) := by norm_num" in source

    raw["steps"] = []
    result = search_proof(raw)
    suggestion = next(item for item in result["suggestions"] if item["rule"] == "sqrt_derivative")
    assert suggestion["premises"] == []


def test_exact_negative_sqrt_radicand_is_not_auto_discharged():
    raw = load("sqrt_derivative.json")
    raw["variables"] = [{"id": "x", "type": "real"}]
    raw["assumptions"] = []
    raw["goal"]["expression"] = {
        "kind": "sqrt",
        "arg": {
            "kind": "sub",
            "left": {"kind": "var", "id": "x"},
            "right": {"kind": "int", "value": 4},
        },
    }
    raw["goal"]["point"] = {"kind": "int", "value": 3}
    raw["goal"]["result"] = {
        "kind": "div",
        "left": {"kind": "int", "value": 1},
        "right": {
            "kind": "mul",
            "left": {"kind": "int", "value": 2},
            "right": {
                "kind": "sqrt",
                "arg": {
                    "kind": "sub",
                    "left": {"kind": "int", "value": 3},
                    "right": {"kind": "int", "value": 4},
                },
            },
        },
    }
    raw["steps"][0]["claim"] = deepcopy(raw["goal"])
    raw["steps"][0]["premises"] = []

    state = build_proof_state(raw)
    assert state.status == "needs_justification"
    codes = {item["code"] for item in state.obligations}
    assert "sqrt_domain" in codes
    assert "sqrt_derivative_positive" in codes

    raw["steps"] = []
    result = search_proof(raw)
    assert all(item["rule"] != "sqrt_derivative" for item in result.get("suggestions", []))
