import json
from pathlib import Path

from quickmaths_formal.verifier import verify_request

FIXTURES = Path(__file__).parents[1] / "fixtures"


def check(name):
    data = json.loads((FIXTURES / name).read_text(encoding="utf-8"))
    return verify_request(data, project_dir=FIXTURES.parent)


def test_missing_cancellation_restriction_is_an_obligation_not_false():
    result = check("missing_restriction.json")
    assert result.status == "needs_justification"
    assert result.obligations[0]["code"] == "nonzero_required"


def test_wrong_limit_direction_is_distinct_from_failed_search():
    result = check("wrong_limit_direction.json")
    assert result.status == "needs_justification"
    assert any(row["code"] == "wrong_direction" for row in result.obligations)


def test_ivt_does_not_smuggle_in_uniqueness():
    result = check("ivt_false_uniqueness_method.json")
    assert result.status == "needs_justification"
    assert any(row["code"] == "ivt_does_not_prove_uniqueness" for row in result.obligations)


def test_piecewise_jump_is_ready_for_kernel_but_not_falsely_verified_without_lean():
    result = check("piecewise_jump.json")
    assert result.status in {"verification_unavailable", "verified"}
    if result.status == "verification_unavailable":
        assert result.certificate is None
        assert "Lean" in result.message
