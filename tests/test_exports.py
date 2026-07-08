import csv
from pathlib import Path

import quickmaths.exports as exports
from quickmaths.content_loader import load_curriculum
from quickmaths.exports import ATTEMPT_COLUMNS, PROGRESS_COLUMNS, REVIEWS_COLUMNS, build_tutor_review_packet, build_tutor_summary, export_progress_csv
from quickmaths.grading import grade_answer
from quickmaths.models import Attempt, GradingResult, ProblemInstance, ProgressRecord, Reflection, ReviewResult, UserResponse
from quickmaths.problem_generator import generate_test
from quickmaths.storage import save_review


def test_progress_csv_has_required_columns(tmp_path: Path):
    _, skills, _ = load_curriculum()
    path = export_progress_csv(skills, tmp_path / "progress.csv")
    with path.open(newline="", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        assert reader.fieldnames == PROGRESS_COLUMNS
    assert "pending_review_count" in PROGRESS_COLUMNS
    assert "review_status" in ATTEMPT_COLUMNS


def test_tutor_summary_includes_key_fields_and_question_details():
    _, skills, _ = load_curriculum()
    skill = skills["MATH_ALG_001"]
    problems = generate_test(skill, seed=8)[:1]
    attempt = Attempt(
        attempt_id="A",
        user_id="local_user",
        skill_id=skill.id,
        started_at="2026-07-07T00:00:00",
        completed_at="2026-07-07T00:01:00",
        seed=8,
        problem_instances=problems,
        user_answers=[UserResponse(final_answer="wrong", work="I subtracted on only one side.")],
        grading_results=[
            GradingResult(
                problems[0].template_id,
                "wrong",
                problems[0].expected_answer,
                False,
                "equation_solution",
                user_work="I subtracted on only one side.",
                work_review_status="submitted_for_tutor_review",
            )
        ],
        raw_score=0,
        percent_score=0,
        reflection=Reflection(2, "hard", "none", "maybe", "yes", notes="I missed inverse operations."),
        mastery_update={},
    )
    progress = ProgressRecord("local_user", skill.id, "learning", 12)
    summary = build_tutor_summary(skill, attempt, progress, {"MATH_PREALG_003": "proven"})
    assert "Quick Maths Tutor Summary" in summary
    assert "Expected final answer:" in summary
    assert "User final answer: wrong" in summary
    assert "User work:" in summary
    assert "I subtracted on only one side." in summary
    assert "mastery is an accumulated 0-100 progress score" in summary
    assert "Review the learner's work for reasoning quality" in summary
    assert "MATH_PREALG_003: proven" in summary


def test_tutor_summary_can_include_saved_review_details():
    _, skills, _ = load_curriculum()
    skill = skills["MATH_ARITH_001"]
    problems = generate_test(skill, seed=8)[:1]
    problem = problems[0]
    attempt = Attempt(
        attempt_id="A",
        user_id="local_user",
        skill_id=skill.id,
        started_at="2026-07-07T00:00:00",
        completed_at="2026-07-07T00:01:00",
        seed=8,
        problem_instances=problems,
        user_answers=[UserResponse(final_answer=problem.expected_answer, work="Justification.")],
        grading_results=[],
        raw_score=1,
        percent_score=1,
        reflection=Reflection(3, "medium", "none", "no", "no"),
        mastery_update={},
    )
    progress = ProgressRecord("local_user", skill.id, "proven", 82)
    summary = build_tutor_summary(
        skill,
        attempt,
        progress,
        {},
        review_rows=[
            {
                "id": "R",
                "question_id": problem.template_id,
                "verdict": "partial",
                "score": 0.75,
                "obligation_results_json": {
                    "show_steps": {"status": "flawed", "note": "Needs clearer intermediate reasoning."}
                },
                "feedback": "Good structure.",
            }
        ],
    )
    assert "Saved Review Details" in summary
    assert "show_steps=flawed" in summary
    assert "Needs clearer intermediate reasoning." in summary


def test_tutor_review_packet_contains_work_and_obligations():
    _, skills, _ = load_curriculum()
    skill = skills["MATH_ARITH_001"]
    problem = _proof_problem(skill.id)
    response = UserResponse(
        final_answer=problem.expected_answer,
        work=(
            "[state_given]\n"
            "[identify_rule]\n"
            "[show_steps]\n"
            "[conclude_answer]\n"
            "Justification text."
        ),
    )
    result = grade_answer(problem, response)
    attempt = Attempt(
        "A",
        "local_user",
        skill.id,
        "2026-07-08T00:00:00",
        "2026-07-08T00:01:00",
        3,
        [problem],
        [response],
        [result],
        1,
        1.0,
        Reflection(3, "medium", "none", "no", "no"),
        {},
        review_status="pending_review",
        has_pending_review=True,
    )
    packet = build_tutor_review_packet(skill, attempt)
    assert "Proof Skeleton / Obligations" in packet
    assert "identify_rule" in packet
    assert "Justification text" in packet
    assert "Attempt Context" in packet
    assert "Final answer autograde:" in packet
    assert "Detected obligations: state_given, identify_rule, show_steps, conclude_answer" in packet
    assert "Missing obligations:" in packet


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


def test_review_csv_export_includes_obligation_level_results(tmp_path: Path, monkeypatch):
    db_path = tmp_path / "quick_maths.sqlite"
    review = ReviewResult(
        "R",
        "A",
        "SQRT2_PROOF_001",
        "local_user",
        "human_tutor",
        "partial",
        0.75,
        "high",
        {
            "show_p_even": {"status": "flawed", "note": "Needs lemma."},
            "square_both_sides": {"status": "satisfied", "note": ""},
        },
        "Review feedback.",
    )
    save_review(review, db_path)
    monkeypatch.setattr(exports, "DB_PATH", db_path)

    path = exports.export_reviews_csv(tmp_path / "reviews.csv")
    with path.open(newline="", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        rows = list(reader)

    assert reader.fieldnames == REVIEWS_COLUMNS
    assert rows[0]["obligation_statuses"] == "show_p_even=flawed; square_both_sides=satisfied"
    assert rows[0]["obligation_notes"] == "show_p_even: Needs lemma."
