from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from kernel_batch_check import assemble_batch, load_fixture, normalize_request, render_request


def test_actual_generated_modules_merge_headers_and_keep_both_audits():
    names = ["guarded_cancellation.json", "polynomial_derivative.json"]
    sources = [(name, render_request(normalize_request(load_fixture(name)))) for name in names]
    source, ranges = assemble_batch(sources)
    lines = source.splitlines()
    assert lines[0] == "module"
    assert lines.count("module") == 1
    expected = {line for _, text in sources for line in text.splitlines() if line.startswith("public import ")}
    actual = [line for line in lines if line.startswith("public import ")]
    assert expected and set(actual) == expected
    assert len(actual) == len(expected)
    assert "QuickMathsGenerated" not in source
    for row in ranges:
        body = lines[row["start"] - 1:row["end"]]
        assert not any(line == "module" or line.startswith(("import ", "public import ")) for line in body)
        assert f"namespace {row['namespace']}" in body
        assert f"end {row['namespace']}" in body
        assert f"#print axioms {row['namespace']}.result" in body


def test_legacy_and_public_imports_are_deduplicated():
    source, _ = assemble_batch([
        ("old.json", "import Mathlib.Tactic.Ring\nnamespace QuickMathsGenerated\nend QuickMathsGenerated"),
        ("new.json", "module\npublic import Mathlib.Tactic.Ring\nnamespace QuickMathsGenerated\nend QuickMathsGenerated"),
    ])
    assert source.count("public import Mathlib.Tactic.Ring") == 1
    assert source.splitlines().count("module") == 1


def test_all_fixtures_are_classified_including_derivative_definition():
    from kernel_acceptance import POSITIVE, NEGATIVE, EXPECTED_UNSUPPORTED, ROOT
    assert "derivative_definition_square.json" in POSITIVE
    assert {p.name for p in (ROOT / "fixtures").glob("*.json")} == set(POSITIVE) | set(NEGATIVE) | set(EXPECTED_UNSUPPORTED)
