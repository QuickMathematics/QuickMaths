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


def test_inline_template_expressions_and_derived_prompt_values_render():
    template = ProblemTemplate(
        id="INLINE",
        type="generated",
        prompt_template="Compare {a * d} with {right_cross}",
        variables={
            "a": {"type": "int", "min": 2, "max": 2},
            "d": {"type": "int", "min": 3, "max": 3},
        },
        derived={"right_cross": "a + d"},
        constraints=["a * d > right_cross"],
        answer={"type": "numeric", "value": "{a * d}"},
        grading={"method": "exact_numeric"},
    )

    problem = generate_problem("TEST", template, seed=1)

    assert problem.prompt == "Compare 6 with 5"
    assert problem.expected_answer == "6"


def test_fixed_question_needs_no_dummy_variables():
    template = ProblemTemplate(
        id="FIXED",
        type="fixed",
        prompt_template="Convert 100% to a decimal.",
        answer={"type": "numeric", "value": "1"},
        grading={"method": "exact_numeric"},
    )

    problem = generate_problem("TEST", template, seed=1)

    assert problem.values == {}
    assert problem.expected_answer == "1"


def test_generated_multiple_choice_labels_are_rendered():
    template = ProblemTemplate(
        id="OPTIONS",
        type="generated",
        prompt_template="Choose.",
        variables={"a": {"type": "int", "min": 1, "max": 1}},
        options=[{"id": "A", "label": "{a}/2"}, {"id": "B", "label": "{a + 1}/2"}],
        answer={"type": "multiple_choice", "value": "A"},
        grading={"method": "multiple_choice"},
    )

    problem = generate_problem("TEST", template, seed=1)

    assert [option["label"] for option in problem.options] == ["1/2", "2/2"]


def test_variables_on_both_sides_constraint_runs_after_all_derived_values():
    _, skills, _ = load_curriculum()
    template = next(
        question
        for question in skills["MATH_ALG_003"].test.questions
        if question.id == "VAR_BOTH_SIDES_DISTRIBUTE_BOTH_001"
    )

    for seed in range(1, 6):
        problem = generate_problem("MATH_ALG_003", template, seed)
        values = {key: int(value) for key, value in problem.values.items()}
        assert values["constant_difference"] == values["variable_difference"] * values["x"]


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
