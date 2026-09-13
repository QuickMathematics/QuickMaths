import pytest

from quickmaths_formal.contract import ContractError
from quickmaths_formal.parser import (
    parse_expression_text,
    parse_proposition_text,
    render_expression_text,
    render_proposition_text,
)


def test_parser_requires_declared_variables_and_preserves_exact_fractions():
    expr = parse_expression_text("(x^2 - 9) / (x - 3)", ["x"])
    assert expr["kind"] == "div"
    assert render_expression_text(expr) == "(x^2 - 9) / (x - 3)"
    half = parse_expression_text("1/2", [])
    assert half == {"kind": "rat", "numerator": 1, "denominator": 2}


def test_parser_never_silently_creates_unknown_identifier():
    with pytest.raises(ContractError, match="unknown identifier"):
        parse_expression_text("x + mystery", ["x"])


def test_parser_rejects_ambiguous_decimal_literal():
    with pytest.raises(ContractError, match="decimal literals are ambiguous"):
        parse_expression_text("0.1 + x", ["x"])


def test_parser_accepts_school_unicode_relations():
    prop = parse_proposition_text("x²".replace("²", "^2") + " ≥ 0", ["x"])
    assert prop["kind"] == "ge"
    assert render_proposition_text(prop) == "x^2 ≥ 0"


def test_parser_rejects_chained_comparisons_until_semantics_are_explicit():
    with pytest.raises(ContractError, match="chained comparisons"):
        parse_proposition_text("0 < x < 3", ["x"])


def test_parser_accepts_unicode_superscripts_and_absolute_value_preview_syntax():
    square = parse_expression_text("x² + 1", ["x"])
    assert render_expression_text(square) == "x^2 + 1"
    absolute = parse_expression_text("|x - 2|", ["x"])
    assert absolute["kind"] == "abs"
    assert render_expression_text(absolute) == "|x - 2|"


def test_parser_accepts_natural_language_quantifier_preview_roundtrip():
    prop = parse_proposition_text("for every z : real, z = z", [])
    assert prop["kind"] == "forall"
    rendered = render_proposition_text(prop)
    assert rendered == "for every z : real, z = z"
    assert parse_proposition_text(rendered, []) == prop

    exists = parse_proposition_text("there exists n : nat, n = n", [])
    assert exists["kind"] == "exists"
    assert parse_proposition_text(render_proposition_text(exists), []) == exists


def test_piecewise_expression_preview_is_parseable_again():
    expr = parse_expression_text("if x < 0 then -1 else 1", ["x"])
    assert expr["kind"] == "if"
    rendered = render_expression_text(expr)
    assert rendered == "if x < 0 then -1 else 1"
    assert parse_expression_text(rendered, ["x"]) == expr


def test_unmatched_or_nested_absolute_bars_are_rejected_explicitly():
    with pytest.raises(ContractError, match="unmatched absolute-value"):
        parse_expression_text("|x + 1", ["x"])
    with pytest.raises(ContractError, match="nested absolute-value"):
        parse_expression_text("||x||", ["x"])


def test_canonical_limit_preview_roundtrips_through_goal_parser():
    from quickmaths_formal.parser import parse_goal_text, render_goal_text

    text = "As x approaches 3 from both sides, (x^2 - 9)/(x - 3) approaches 6."
    goal = parse_goal_text(text, ["x"])
    assert goal["kind"] == "limit"
    assert goal["direction"] == "both"
    assert render_goal_text(goal) == "As x approaches 3 from both sides, (x^2 - 9) / (x - 3) approaches 6."
    assert parse_goal_text(render_goal_text(goal), ["x"]) == goal


def test_limit_preview_roundtrips_domain_and_infinite_results():
    from quickmaths_formal.parser import parse_goal_text, render_goal_text

    finite = parse_goal_text(
        "As x approaches 4 from both sides, with 0 <= x, (sqrt(x) - 2)/(x - 4) approaches 1/4.",
        ["x"],
    )
    assert finite["domain"][0]["kind"] == "le"
    assert parse_goal_text(render_goal_text(finite), ["x"]) == finite

    infinite = parse_goal_text("As x approaches 0 from the right, 1/x approaches +infinity.", ["x"])
    assert infinite["result"] == {"kind": "positive_infinity"}
    assert parse_goal_text(render_goal_text(infinite), ["x"]) == infinite


def test_canonical_polynomial_derivative_preview_roundtrips():
    from quickmaths_formal.parser import parse_goal_text, render_goal_text

    text = "The derivative of x^2 + 3*x with respect to x at a is 2*a + 3."
    goal = parse_goal_text(text, ["x", "a"])
    assert goal["kind"] == "derivative"
    assert goal["variable"] == "x"
    assert render_goal_text(goal) == "The derivative of x^2 + 3 * x with respect to x at a is 2 * a + 3."
    assert parse_goal_text(render_goal_text(goal), ["x", "a"]) == goal


def test_parser_roundtrips_builtin_transcendental_functions():
    for text, kind in [
        ("exp(x^2)", "exp"),
        ("log(x + 1)", "log"),
        ("sin(2*x)", "sin"),
        ("cos(x - 3)", "cos"),
    ]:
        expr = parse_expression_text(text, ["x"])
        assert expr["kind"] == kind
        assert parse_expression_text(render_expression_text(expr), ["x"]) == expr
