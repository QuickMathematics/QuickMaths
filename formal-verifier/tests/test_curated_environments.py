import json
from pathlib import Path

import pytest

from quickmaths_formal.contract import normalize_request
from quickmaths_formal.environments import environment_for
from quickmaths_formal.lean import render_request


FIXTURES = Path(__file__).parents[1] / "fixtures"


def _fixture(name):
    return normalize_request(json.loads((FIXTURES / name).read_text(encoding="utf-8")))


def test_unknown_environment_capabilities_are_rejected():
    with pytest.raises(ValueError, match="Unknown formal capabilities"):
        environment_for(["algebra", "not-a-curated-capability"])


def test_environment_identity_is_independent_of_capability_order():
    first = environment_for(["sequences-series", "radicals", "algebra"])
    second = environment_for(["algebra", "radicals", "sequences-series"])
    assert first == second
    assert first["capabilities"] == ["algebra", "radicals", "sequences-series"]


def test_algebra_environment_is_narrow_and_excludes_radical_imports():
    environment = environment_for(["algebra"])
    assert environment["capabilities"] == ["algebra"]
    assert "radicals" not in environment["capabilities"]
    assert not any(module in {"Mathlib.Tactic", "Mathlib"} for module in environment["imports"])
    assert not any("Sqrt" in module or "sqrt" in module for module in environment["imports"])


def test_sequence_series_group_preserves_direct_compute_degree_import():
    environment = environment_for(["sequences-series"])
    assert "Mathlib.Tactic.ComputeDegree" in environment["imports"]


def test_generated_source_keeps_module_public_header_theorem_and_audit_name():
    source = render_request(_fixture("guarded_cancellation.json"))
    lines = source.splitlines()
    assert lines[0] == "module"
    assert all(line.startswith("public import ") for line in lines[1:] if line.startswith("public import "))
    assert "public theorem result" in source
    assert "#print axioms QuickMathsGenerated.result" in source
    assert "certificate" not in source.casefold()
    assert "sorry" not in source.casefold()


def test_environment_descriptor_does_not_mutate_source_or_certificate_contract():
    environment = environment_for(["algebra"])
    assert set(environment) == {"schema_version", "capabilities", "imports", "import_mode", "id", "source_digest"}
    assert environment["import_mode"] == "module-public"
    assert environment["id"].startswith("qm-formal-v1-")
    assert len(environment["source_digest"]) == 64
