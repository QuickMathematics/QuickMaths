from pathlib import Path

import pytest

from quickmaths.grading import grade_answer, required_work_missing
from quickmaths.models import Attempt, ProblemInstance, Reflection, UserResponse
from quickmaths.storage import save_attempt


def _required_work_problem() -> ProblemInstance:
    return ProblemInstance(
        template_id="T",
        skill_id="S",
        seed=1,
        difficulty="medium",
        values={},
        prompt="Solve x + 1 = 5.",
        expected_answer="4",
        answer_type="equation_solution",
        grading_method="equation_solution",
        solution_steps=[],
        mistake_tags=[],
        variable="x",
        answer_mode="final_plus_required_work",
        work={"mode": "required", "prompt": "Show your inverse operation.", "grading": "tutor_review"},
    )


def test_required_work_blocks_submission_when_empty():
    problem = _required_work_problem()
    response = UserResponse(final_answer="x = 4", work="", answer_mode=problem.answer_mode)
    assert required_work_missing([problem], [response]) == [1]


def test_missing_required_work_is_not_saved(tmp_path: Path):
    problem = _required_work_problem()
    response = UserResponse(final_answer="x = 4", work="", answer_mode=problem.answer_mode)
    result = grade_answer(problem, response)
    attempt = Attempt(
        attempt_id="A",
        user_id="local_user",
        skill_id="S",
        started_at="2026-07-08T00:00:00",
        completed_at="2026-07-08T00:01:00",
        seed=1,
        problem_instances=[problem],
        user_answers=[response],
        grading_results=[result],
        raw_score=1,
        percent_score=1.0,
        reflection=Reflection(3, "medium", "none", "no", "no"),
        mastery_update={},
    )
    with pytest.raises(ValueError, match="missing required work"):
        save_attempt(attempt, tmp_path / "attempts.sqlite")
