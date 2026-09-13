import pytest

from quickmaths.formal_spec import normalize_proof_spec, resolve_proof_spec


BASE = {
    "version": "0.1",
    "statement": {
        "declarations": ["x:real"],
        "assumptions": ["x != {a}"],
        "goal": "x + {a} = {a} + x",
    },
    "parameter_contract": {"required_public": ["a"]},
    "allowed_rules": ["ring", "linarith"],
    "assessment_policy": {"require_submitted_steps": True},
    "reference_proof": {"mode": "author_candidate"},
    "environment": {"backend": "lean4", "library": "mathlib"},
}


def test_normalize_proof_spec_is_strict_and_copies_input():
    source = {**BASE, "statement": {**BASE["statement"]}}
    normalized = normalize_proof_spec(source)
    assert normalized["version"] == "0.1"
    assert normalized["statement"]["goal"] == BASE["statement"]["goal"]
    source["statement"]["goal"] = "false"
    assert normalized["statement"]["goal"] != "false"


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"version": "9"}, "version"),
        ({"mystery": True}, "unknown proof_spec field"),
        ({"statement": {"declarations": [], "assumptions": []}}, "goal"),
        ({"allowed_rules": ["ring", "ring"]}, "duplicate"),
    ],
)
def test_normalize_proof_spec_rejects_invalid_contract(change, message):
    candidate = {**BASE, **change}
    with pytest.raises(ValueError, match=message):
        normalize_proof_spec(candidate)


def test_resolve_proof_spec_uses_public_values_only():
    resolved = resolve_proof_spec(BASE, {"a": 3})
    assert resolved["statement"]["assumptions"] == ["x != 3"]
    assert resolved["statement"]["goal"] == "x + 3 = 3 + x"


def test_resolve_proof_spec_rejects_missing_required_public_parameter():
    with pytest.raises(ValueError, match="non-public parameter 'a'"):
        resolve_proof_spec(BASE, {})


def test_resolve_proof_spec_rejects_hidden_placeholder_even_without_contract_entry():
    candidate = {
        **BASE,
        "parameter_contract": {"required_public": []},
        "statement": {**BASE["statement"], "goal": "x = {secret}"},
    }
    with pytest.raises(ValueError, match="non-public or invalid parameter"):
        resolve_proof_spec(candidate, {"a": 3})


def test_reference_proof_steps_are_strict_declarative_data():
    candidate = {
        **BASE,
        "reference_proof": {
            "mode": "steps",
            "steps": [
                {
                    "claim": "x + {a} = {a} + x",
                    "rule": "ring_identity",
                    "premises": [],
                    "parameters": {"factor": "{a}"},
                }
            ],
        },
    }
    resolved = resolve_proof_spec(candidate, {"a": 3})
    assert resolved["reference_proof"]["steps"][0] == {
        "claim": "x + 3 = 3 + x",
        "rule": "ring_identity",
        "premises": [],
        "parameters": {"factor": "3"},
        "scope": "root",
    }


def test_reference_proof_rejects_executable_or_ambiguous_payloads():
    with pytest.raises(ValueError, match="unknown proof_spec.reference_proof step"):
        normalize_proof_spec({
            **BASE,
            "reference_proof": {"steps": [{"claim": "x = x", "rule": "eq_refl", "lean_code": "by exact rfl"}]},
        })
    with pytest.raises(ValueError, match="auto mode cannot contain submitted steps"):
        normalize_proof_spec({
            **BASE,
            "reference_proof": {"mode": "auto", "steps": [{"claim": "x = x", "rule": "eq_refl"}]},
        })
