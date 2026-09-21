from pathlib import Path

from quickmaths.content_loader import load_skill_file
from quickmaths.grading import grade_answer
from quickmaths.problem_generator import generate_problem

ROOT = Path(__file__).resolve().parents[1]
SKILLS = {
    "MATH_ARITH_007": ROOT / "content/math/algebra_foundations/skills/MATH_ARITH_007_factors_multiples_primes_gcf_and_lcm.yaml",
    "MATH_ARITH_012": ROOT / "content/math/algebra_foundations/skills/MATH_ARITH_012_percentages_reverse_percentages_and_percentage_points.yaml",
    "MATH_ARITH_013": ROOT / "content/math/algebra_foundations/skills/MATH_ARITH_013_measurement_unit_conversions_and_elapsed_time.yaml",
}


def _questions(skill_id):
    skill = load_skill_file(SKILLS[skill_id])
    return skill, {q.id: q for q in skill.test.questions}


def _assert_numeric_oracle(skill, question, oracle, seeds=100):
    for seed in range(1, seeds + 1):
        instance = generate_problem(skill.id, question, seed)
        expected = str(oracle(instance))
        assert instance.expected_answer == expected, (question.id, seed, instance.prompt, expected, instance.expected_answer)
        assert grade_answer(instance, expected).is_correct
        wrong = str(oracle(instance) + 1)
        assert not grade_answer(instance, wrong).is_correct, (question.id, seed, wrong)


def _assert_fixed_numeric_oracle(skill, question, expected):
    instance = generate_problem(skill.id, question, 1)
    assert instance.expected_answer == str(expected), (question.id, instance.prompt)
    assert grade_answer(instance, str(expected)).is_correct
    assert not grade_answer(instance, str(expected + 1)).is_correct


def _assert_choice_oracle(skill, question, expected):
    instance = generate_problem(skill.id, question, 1)
    assert instance.expected_answer == expected, (question.id, instance.prompt)
    assert grade_answer(instance, expected).is_correct
    wrong = next(option["id"] for option in instance.options if option["id"] != expected)
    assert not grade_answer(instance, wrong).is_correct


def test_arith007_repaired_generated_oracles_and_choices():
    skill, qs = _questions("MATH_ARITH_007")
    _assert_numeric_oracle(skill, qs["ARITH007_PRIME_DIGIT_SUM"], lambda i: (9 + int(i.values["a"])) % 3)
    _assert_numeric_oracle(skill, qs["ARITH007_LCM_PRIMES"], lambda i: 2 ** int(i.values["a"]) * 3 ** int(i.values["b"]))
    _assert_fixed_numeric_oracle(skill, qs["ARITH007_GCF_LIST"], 6)
    _assert_fixed_numeric_oracle(skill, qs["ARITH007_GCF_PACK"], 42)
    _assert_fixed_numeric_oracle(skill, qs["ARITH007_FACTOR_PAIR"], 6)
    _assert_choice_oracle(skill, qs["ARITH007_COMMON_MULTIPLE"], "B")


def test_arith012_repaired_generated_oracles_and_choices():
    skill, qs = _questions("MATH_ARITH_012")
    _assert_numeric_oracle(skill, qs["ARITH012_PERCENT_OF_VAR"], lambda i: int(i.values["whole"]))
    _assert_fixed_numeric_oracle(skill, qs["ARITH012_PART_PERCENT_VAR"], 100)
    _assert_fixed_numeric_oracle(skill, qs["ARITH012_FORWARD_DOWN"], 216)
    _assert_fixed_numeric_oracle(skill, qs["ARITH012_REVERSE_DOWN"], 100)
    _assert_choice_oracle(skill, qs["ARITH012_DISCOUNT_VAR"], "B")


def test_arith013_repaired_measurement_oracles():
    skill, qs = _questions("MATH_ARITH_013")
    _assert_fixed_numeric_oracle(skill, qs["ARITH013_RECT_AREA"], 26)
    _assert_fixed_numeric_oracle(skill, qs["ARITH013_RECT_PERIMETER"], 135)
    _assert_choice_oracle(skill, qs["ARITH013_CROSS_HOUR"], "C")
