from quickmaths.grading import grade_answer
from quickmaths.models import ProblemInstance


def _problem(expected: str, method: str, variable: str | None = None) -> ProblemInstance:
    return ProblemInstance(
        template_id="T",
        skill_id="S",
        seed=1,
        difficulty="medium",
        values={},
        prompt="p",
        expected_answer=expected,
        answer_type="text",
        grading_method=method,
        solution_steps=[],
        mistake_tags=[],
        variable=variable,
    )


def test_exact_numeric_accepts_equivalent_forms():
    assert grade_answer(_problem("6", "exact_numeric"), "6.0").is_correct


def test_symbolic_grading_accepts_equivalent_expressions():
    assert grade_answer(_problem("2*x + 6", "symbolic_expression"), "2(x+3)").is_correct
    assert grade_answer(_problem("2*x + 6", "symbolic_expression"), "6 + 2x").is_correct
    assert grade_answer(_problem("2*x + 6", "symbolic_expression"), "2x + 6").is_correct


def test_symbolic_grading_rejects_non_equivalent_expressions():
    assert not grade_answer(_problem("2*x + 6", "symbolic_expression"), "2*x + 7").is_correct


def test_equation_solution_accepts_variable_or_plain_value():
    problem = _problem("6", "equation_solution", variable="x")
    assert grade_answer(problem, "x=6").is_correct
    assert grade_answer(problem, "6").is_correct


def test_equation_solution_accepts_school_style_equation_answer():
    problem = _problem("4", "equation_solution", variable="x")
    assert grade_answer(problem, "x = 4").is_correct


def test_equation_solution_accepts_positive_and_negative_fractions():
    assert grade_answer(_problem("3/5", "equation_solution", variable="x"), "x = 3/5").is_correct
    assert grade_answer(_problem("-3/5", "equation_solution", variable="x"), "x = -3/5").is_correct


def test_inequality_solution_grading_normalizes_equivalent_forms():
    problem = _problem("x < 5", "inequality_solution", variable="x")
    assert grade_answer(problem, "2x < 10").is_correct
    assert not grade_answer(problem, "x > 5").is_correct


def test_symbolic_grading_accepts_caret_exponents():
    assert grade_answer(_problem("x**2 + 2*x + 1", "symbolic_expression"), "(x + 1)^2").is_correct
