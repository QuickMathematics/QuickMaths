from quickmaths.content_loader import load_curriculum
from quickmaths.grading import grade_answer
from quickmaths.models import ProblemInstance, ProgressRecord, Reflection, ReviewResult, UserResponse
from quickmaths.scoring import apply_attempt_to_progress, apply_review_to_progress


def test_proof_submission_stays_pending_until_review_passes():
    _, skills, _ = load_curriculum()
    skill = skills["MATH_ARITH_001"]
    problem = _proof_problem(skill.id)
    response = UserResponse(
        final_answer=problem.expected_answer,
        work=(
            "[state_given]\n"
            "[identify_rule]\n"
            "[show_steps]\n"
            "[conclude_answer]"
        ),
    )

    grading = grade_answer(problem, response)
    assert grading.is_correct
    assert grading.work_check_result is not None
    assert grading.work_check_result.status == "pending_review"

    previous = ProgressRecord(user_id="local_user", skill_id=skill.id, status="ready", mastery_score=20)
    reflection = Reflection(3, "medium", "none", "no", "no")
    pending_record = apply_attempt_to_progress(
        skill,
        previous,
        True,
        1.0,
        reflection,
        "2026-07-08T00:00:00",
        [],
        review_status="pending_review",
    )
    assert pending_record.status == "learning"
    assert pending_record.mastery_score == previous.mastery_score

    review = ReviewResult(
        review_id="R",
        attempt_id="A",
        question_id=problem.template_id,
        user_id="local_user",
        reviewer_type="human_tutor",
        verdict="pass",
        score=1.0,
        reviewer_confidence="high",
        obligation_results_json={},
        feedback="Complete proof.",
    )
    reviewed_record = apply_review_to_progress(skill, pending_record, review, final_answer_passed=True)
    assert reviewed_record.status == "proven"


def test_review_pass_does_not_prove_skill_when_final_answer_failed():
    _, skills, _ = load_curriculum()
    skill = skills["MATH_ARITH_001"]
    previous = ProgressRecord(user_id="local_user", skill_id=skill.id, status="learning", mastery_score=50)
    review = ReviewResult(
        review_id="R",
        attempt_id="A",
        question_id="INTEGER_ADD_SAME_SIGN_001",
        user_id="local_user",
        reviewer_type="human_tutor",
        verdict="pass",
        score=1.0,
        reviewer_confidence="high",
        obligation_results_json={},
        feedback="Good reasoning, wrong conclusion.",
    )

    reviewed_record = apply_review_to_progress(skill, previous, review, final_answer_passed=False)
    assert reviewed_record.status == "learning"


def _proof_problem(skill_id: str) -> ProblemInstance:
    return ProblemInstance(
        template_id="PROOF_TEST",
        skill_id=skill_id,
        seed=1,
        difficulty="medium",
        values={},
        prompt="Prove the claim.",
        expected_answer="done",
        answer_type="theorem_conclusion",
        grading_method="theorem_conclusion",
        solution_steps=[],
        mistake_tags=[],
        answer_mode="final_plus_required_work",
        work={
            "mode": "proof_obligations",
            "prompt": "Write the proof.",
            "proof_policy": {
                "accepted_strategies": [
                    {
                        "id": "strategy",
                        "name": "Strategy",
                        "assumptions_required": [{"id": "state_given", "label": "State given", "required": True}],
                        "required_obligations": [
                            {"id": "identify_rule", "label": "Identify rule", "required": True},
                            {"id": "show_steps", "label": "Show steps", "required": True},
                            {"id": "conclude_answer", "label": "Conclude", "required": True},
                        ],
                    }
                ]
            },
        },
        review_policy={"work_review": "tutor_required", "mastery_requires_review_pass": True},
        accepted_forms=["done"],
    )
