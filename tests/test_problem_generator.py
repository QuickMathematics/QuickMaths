import pytest

from quickmaths.content_loader import load_curriculum
from quickmaths.models import ProblemTemplate
from quickmaths.problem_generator import GenerationError, generate_problem, generate_test


def test_generates_reproducibly_with_seed():
    _, skills, _ = load_curriculum()
    skill = skills["MATH_ALG_001"]
    first = generate_test(skill, seed=1234)
    second = generate_test(skill, seed=1234)
    assert [problem.prompt for problem in first] == [problem.prompt for problem in second]
    assert [problem.expected_answer for problem in first] == [problem.expected_answer for problem in second]


def test_generates_values_and_respects_excludes():
    _, skills, _ = load_curriculum()
    problem = generate_test(skills["MATH_ALG_001"], seed=55)[0]
    assert problem.prompt
    assert problem.expected_answer
    assert problem.values
    assert "0x" not in problem.prompt


def test_computes_derived_values_and_constraints():
    template = ProblemTemplate(
        id="T",
        type="generated",
        prompt_template="{a} + {b} = {c}",
        variables={
            "a": {"type": "int", "min": 1, "max": 1},
            "b": {"type": "int", "min": 2, "max": 2},
        },
        derived={"c": "a + b"},
        constraints=["c == 3"],
        answer={"type": "numeric", "value": "{c}"},
        grading={"method": "exact_numeric"},
    )
    problem = generate_problem("TEST", template, seed=1)
    assert problem.expected_answer == "3"


def test_fails_clearly_when_constraints_are_impossible():
    template = ProblemTemplate(
        id="BAD",
        type="generated",
        prompt_template="{a}",
        variables={"a": {"type": "int", "min": 1, "max": 1}},
        constraints=["a > 2"],
        answer={"type": "numeric", "value": "{a}"},
        grading={"method": "exact_numeric"},
    )
    with pytest.raises(GenerationError, match="could not generate"):
        generate_problem("TEST", template, seed=1, max_attempts=3)


def test_generated_prompts_avoid_plus_minus_when_formatting_helper_is_used():
    template = ProblemTemplate(
        id="FORMAT",
        type="generated",
        prompt_template="Simplify: {a}x + {b}x",
        variables={},
        derived={"a": "4", "b": "-3"},
        answer={"type": "expression", "value": "{a+b}x"},
        grading={"method": "symbolic_expression"},
    )
    problem = generate_problem("TEST", template, seed=1)
    assert "+ -" not in problem.prompt
    assert problem.prompt == "Simplify: 4x - 3x"
