from quickmaths.limit_work import validate_limit_work
from quickmaths.models import ProblemInstance, UserResponse
from quickmaths.work_checker import check_work


SPEC = {"variable": "x", "approach": "factor and cancel", "direction": "both", "original_expression": "(x² - 1)/(x - 1)", "restrictions": ["x ≠ 1"]}
DATA = {**SPEC, "steps": ["(x² - 1) / (x - 1)", "(x - 1)(x + 1)/(x - 1)", "x + 1"], "result_kind": "finite", "result_value": "2"}


def test_complete_capture_is_pending_review_not_proof():
    assert validate_limit_work(SPEC, DATA) is None


def test_missing_restriction_and_swapped_setup_are_rejected():
    assert "restriction" in validate_limit_work(SPEC, {**DATA, "restrictions": []}).lower()
    assert "first work step" in validate_limit_work(SPEC, {**DATA, "steps": ["(x - 1)/(x² - 1)"]}).lower()


def test_signed_infinity_kinds_remain_distinct():
    assert validate_limit_work(SPEC, {**DATA, "result_kind": "positive_infinity", "result_value": "+∞"}) is None
    assert validate_limit_work(SPEC, {**DATA, "result_kind": "negative_infinity", "result_value": "-∞"}) is None
    assert validate_limit_work(SPEC, {**DATA, "result_kind": "infinity", "result_value": "∞"})


def test_limit_steps_is_tutor_review_only_even_for_shape_valid_cancellation():
    problem = ProblemInstance(
        template_id="T", skill_id="S", seed=1, difficulty="medium", values={}, prompt="p",
        expected_answer="2", answer_type="text", grading_method="exact_text", solution_steps=[], mistake_tags=[],
        answer_mode="final_plus_required_work", work={"mode": "limit_steps", "limit": SPEC},
        review_policy={"work_review": "tutor_required", "mastery_requires_review_pass": True, "allow_self_review": False},
    )
    invalid_but_shape_valid = {**DATA, "steps": [DATA["steps"][0], "x + 1", "2"]}
    result = check_work(problem, UserResponse(final_answer="2", structured_work_json={"limit": invalid_but_shape_valid}))
    assert result.status == "pending_review"
    assert result.score is None
    assert "tutor" in result.messages[0].lower()
