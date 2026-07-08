import json
from pathlib import Path

from quickmaths.grading import grade_answer
from quickmaths.models import Attempt, ProblemInstance, Reflection, ReviewResult, UserResponse
from quickmaths.storage import load_attempt_questions, load_reviews, save_attempt, save_review


def test_saves_final_answer_work_check_and_review_result(tmp_path: Path):
    db_path = tmp_path / "quick_maths.sqlite"
    problem = ProblemInstance(
        template_id="T",
        skill_id="S",
        seed=1,
        difficulty="medium",
        values={},
        prompt="Solve: 2x + 3 = 11",
        expected_answer="4",
        answer_type="equation_solution",
        grading_method="equation_solution",
        solution_steps=[],
        mistake_tags=[],
        variable="x",
        answer_mode="final_plus_required_work",
        work={"mode": "procedural_steps", "line_type": "equation", "target_variable": "x", "minimum_steps": 2},
        review_policy={"work_review": "auto"},
    )
    response = UserResponse(question_id="T", final_answer="x=4", work="2x + 3 = 11\n2x = 8\nx = 4")
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
        percent_score=1,
        reflection=Reflection(3, "medium", "none", "no", "no"),
        mastery_update={},
    )
    save_attempt(attempt, db_path)
    rows = load_attempt_questions("A", db_path)
    assert rows[0]["final_answer"] == "x=4"
    assert "2x = 8" in rows[0]["work_text"]
    assert rows[0]["work_check_status"] == "correct"

    obligation_results = {
        "square_both_sides": {"status": "satisfied", "note": "Stated clearly."},
        "show_p_even": {"status": "flawed", "note": "Lemma needs justification."},
    }
    review = ReviewResult("R", "A", "T", "local_user", "human_tutor", "pass", 1.0, "high", obligation_results, "Good.")
    save_review(review, db_path)
    reviews = load_reviews("A", db_path)
    assert reviews[0]["verdict"] == "pass"
    assert json.loads(reviews[0]["obligation_results_json"]) == obligation_results
