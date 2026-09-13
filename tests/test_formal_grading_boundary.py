"""The legacy Python/CAS grader must never assign formal proof credit."""
from dataclasses import replace

import pytest

from quickmaths.grading import grade_answer
from quickmaths.models import ProblemInstance, UserResponse


def problem():
    return ProblemInstance(
        template_id="FORMAL_GRADE", skill_id="FORMAL_SKILL", seed=1,
        difficulty="medium", values={}, prompt="Let x be real. Prove x=x.",
        expected_answer="proved", answer_type="text", grading_method="exact_text",
        solution_steps=["private reference"], mistake_tags=[],
        proof_spec={"version": "0.1", "statement": {"declarations": ["x:real"], "assumptions": [], "goal": "x = x"}},
    )


@pytest.mark.parametrize("method", ["exact_text", "theorem_conclusion", "symbolic_expression", "exact_numeric"])
def test_legacy_grader_cannot_certify_matching_answer_or_json_verdict(method):
    instance = replace(problem(), grading_method=method, expected_answer="1")
    result = grade_answer(instance, UserResponse(
        final_answer="1", work="Looks correct to an AI.",
        structured_work_json={"formal": {"verification": {"status": "verified", "certificate": {"proof_mode": "submitted"}}}},
    ))
    assert result.is_correct is False
    assert result.final_answer_grade.status == "uncertain"
    assert result.work_check_result.status == "verification_required"
    assert result.work_review_status == "formal_verification_required"
    assert result.expected_answer == ""
    assert "Lean" in result.message


def test_nonformal_question_is_unchanged():
    assert grade_answer(replace(problem(), proof_spec={}), "proved").is_correct
