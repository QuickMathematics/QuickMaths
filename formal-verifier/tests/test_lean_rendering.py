import json
from pathlib import Path

from quickmaths_formal.contract import normalize_request
from quickmaths_formal.lean import render_request

FIXTURES = Path(__file__).parents[1] / "fixtures"


def render(name):
    data = json.loads((FIXTURES / name).read_text(encoding="utf-8"))
    return render_request(normalize_request(data))


def test_guarded_cancellation_mentions_exact_nonzero_evidence():
    source = render("guarded_cancellation.json")
    assert "field_simp [hden]" in source
    assert "#print axioms QuickMathsGenerated.result" in source
    assert "sorry" not in source.casefold()
    assert "admit" not in source.casefold()


def test_limit_variable_is_bound_by_filter_not_a_spurious_theorem_parameter():
    source = render("removable_hole_limit.json")
    theorem_line = next(line for line in source.splitlines() if line.startswith("theorem result"))
    assert "theorem result : Filter.Tendsto" in theorem_line
    assert "𝓝[≠] 3" in source
    assert "sub_ne_zero.mpr hx" in source


def test_one_sided_inverse_uses_mathlib_checked_theorems():
    right = render("inverse_right_infinity.json")
    left = render("inverse_left_infinity.json")
    assert "tendsto_inv_nhdsGT_zero" in right and "Filter.atTop" in right
    assert "tendsto_inv_nhdsLT_zero" in left and "Filter.atBot" in left


def test_difference_quotient_preserves_h_nonzero():
    source = render("difference_quotient.json")
    assert "(hh : h ≠ 0)" in source
    assert "field_simp [hh]" in source
