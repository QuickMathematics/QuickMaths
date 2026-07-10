from quickmaths.math_syntax import (
    display_math,
    equations_equivalent_solution_set,
    expressions_equivalent,
    format_coefficient,
    format_linear_expression,
    format_school_expression,
    inequalities_equivalent_solution_set,
    parse_equation_solution,
    parse_expression,
)


def test_implicit_multiplication_and_exponents_are_equivalent():
    assert expressions_equivalent("2x + 6", "2*(x+3)") is True
    assert expressions_equivalent("x^2 + 2x + 1", "(x+1)^2") is True
    assert expressions_equivalent("x^2", "x**2") is True
    assert expressions_equivalent("x²", "x^2") is True


def test_equation_solution_and_solution_sets_parse():
    assert parse_equation_solution("x = 4", "x") == parse_equation_solution("4", "x")
    assert equations_equivalent_solution_set("2x + 3 = 11", "x = 4", "x") is True


def test_equation_solution_sets_distinguish_identities_and_contradictions():
    assert equations_equivalent_solution_set("2x + 3 = 2x + 3", "3 = 3", "x") is True
    assert equations_equivalent_solution_set("2x + 3 = 2x + 4", "3 = 4", "x") is True
    assert equations_equivalent_solution_set("3 = 3", "3 = 4", "x") is False


def test_inequality_solution_sets_accept_equivalent_school_notation():
    assert inequalities_equivalent_solution_set("2x + 6 < 16", "x < 5", "x") is True
    assert inequalities_equivalent_solution_set("-2x > -10", "x < 5", "x") is True
    assert inequalities_equivalent_solution_set("x ≤ 5", "x <= 5", "x") is True


def test_sqrt_forms_parse():
    assert parse_expression("sqrt(x)")
    assert parse_expression("√x")
    assert expressions_equivalent("√(x+1)", "sqrt(x+1)") is True


def test_pi_and_unicode_pi_compare_correctly():
    assert expressions_equivalent("pi", "π") is True
    assert expressions_equivalent("2pi", "2*pi") is True


def test_bad_parse_returns_uncertain_for_equivalence():
    assert expressions_equivalent("2x +", "2x") is None


def test_negative_coefficients_and_school_formatting():
    assert format_coefficient(1, "x") == "x"
    assert format_coefficient(-1, "x") == "-x"
    assert format_linear_expression(1, -3, "x") == "x - 3"
    assert format_linear_expression(-1, 3, "x") == "-x + 3"
    assert format_school_expression("4x + -3x") == "4x - 3x"
    assert format_school_expression("1x + -1x") == "x - x"


def test_display_math_formats_simple_exponents():
    assert display_math("x^2") == "x²"
    assert display_math("x**2") == "x²"
    assert display_math("a^10") == "a¹⁰"
    assert display_math("-5x^2 - 10x + 7x^2") == "-5x² - 10x + 7x²"
