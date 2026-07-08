from __future__ import annotations

import csv
import json
from pathlib import Path

from quickmaths.config import DB_PATH, DEFAULT_USER_ID, EXPORT_DIR
from quickmaths.grading import coerce_user_response
from quickmaths.utils import display_math
from quickmaths.graph_engine import status_for_skill
from quickmaths.models import Attempt, ProgressRecord, Skill
from quickmaths.storage import connect, init_db, load_attempt_questions, load_progress
from quickmaths.utils import unique_preserving_order


PROGRESS_COLUMNS = [
    "user_id",
    "skill_id",
    "skill_name",
    "domain",
    "subdomain",
    "prerequisites",
    "status",
    "mastery_score",
    "last_test_score",
    "best_test_score",
    "confidence_rating",
    "difficulty_felt_latest",
    "hints_used_latest",
    "guessed_latest",
    "attempt_count",
    "last_attempt_at",
    "next_review_at",
    "mistake_tags",
    "notes",
    "next_recommended_action",
    "pending_review_count",
    "latest_review_status",
    "latest_review_verdict",
]

ATTEMPT_COLUMNS = [
    "attempt_id",
    "user_id",
    "skill_id",
    "skill_name",
    "completed_at",
    "score_raw",
    "score_total",
    "score_percent",
    "confidence_rating",
    "difficulty_felt",
    "hints_used",
    "guessed",
    "wants_more_practice",
    "notes",
    "review_status",
    "has_pending_review",
]

REVIEWS_COLUMNS = [
    "review_id",
    "attempt_id",
    "question_id",
    "reviewer_type",
    "verdict",
    "score",
    "reviewer_confidence",
    "created_at",
    "obligation_results_json",
    "obligation_statuses",
    "obligation_notes",
    "rubric_points",
    "rubric_notes",
    "feedback",
]


def export_progress_csv(skills: dict[str, Skill], path: Path | None = None, user_id: str = DEFAULT_USER_ID) -> Path:
    init_db(DB_PATH)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = path or EXPORT_DIR / "progress.csv"
    progress = load_progress(user_id)
    latest = _latest_reflections(user_id)
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=PROGRESS_COLUMNS)
        writer.writeheader()
        for skill in skills.values():
            record = progress.get(skill.id)
            status = status_for_skill(skill, progress)
            latest_row = latest.get(skill.id, {})
            writer.writerow(
                {
                    "user_id": user_id,
                    "skill_id": skill.id,
                    "skill_name": skill.name,
                    "domain": skill.domain,
                    "subdomain": skill.subdomain,
                    "prerequisites": ";".join(skill.prerequisites),
                    "status": status,
                    "mastery_score": record.mastery_score if record else 0,
                    "last_test_score": record.last_test_score if record else "",
                    "best_test_score": record.best_test_score if record else "",
                    "confidence_rating": record.confidence_rating if record else "",
                    "difficulty_felt_latest": latest_row.get("difficulty_felt", ""),
                    "hints_used_latest": latest_row.get("hints_used", ""),
                    "guessed_latest": latest_row.get("guessed", ""),
                    "attempt_count": record.attempt_count if record else 0,
                    "last_attempt_at": record.last_attempt_at if record else "",
                    "next_review_at": record.next_review_at if record else "",
                    "mistake_tags": ";".join(record.mistake_tags) if record else "",
                    "notes": record.notes if record else "",
                    "next_recommended_action": recommended_action(status),
                    "pending_review_count": _pending_review_count(skill.id, user_id),
                    "latest_review_status": latest_row.get("review_status", ""),
                    "latest_review_verdict": _latest_review_verdict(latest_row.get("id")),
                }
            )
    return path


def export_attempts_csv(skills: dict[str, Skill], path: Path | None = None, user_id: str = DEFAULT_USER_ID) -> Path:
    init_db(DB_PATH)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = path or EXPORT_DIR / "attempts.csv"
    with connect(DB_PATH) as conn:
        rows = conn.execute("SELECT * FROM attempts WHERE user_id = ? ORDER BY completed_at DESC", (user_id,)).fetchall()
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=ATTEMPT_COLUMNS)
        writer.writeheader()
        for row in rows:
            skill = skills.get(row["skill_id"])
            writer.writerow(
                {
                    "attempt_id": row["id"],
                    "user_id": row["user_id"],
                    "skill_id": row["skill_id"],
                    "skill_name": skill.name if skill else row["skill_id"],
                    "completed_at": row["completed_at"],
                    "score_raw": row["score_raw"],
                    "score_total": row["score_total"],
                    "score_percent": row["score_percent"],
                    "confidence_rating": row["confidence_rating"],
                    "difficulty_felt": row["difficulty_felt"],
                    "hints_used": row["hints_used"],
                    "guessed": row["guessed"],
                    "wants_more_practice": row["wants_more_practice"],
                    "notes": row["notes"],
                    "review_status": row["review_status"] or "graded",
                    "has_pending_review": row["has_pending_review"] or 0,
                }
            )
    return path


def export_reviews_csv(path: Path | None = None, user_id: str = DEFAULT_USER_ID) -> Path:
    init_db(DB_PATH)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = path or EXPORT_DIR / "reviews.csv"
    with connect(DB_PATH) as conn:
        rows = conn.execute("SELECT * FROM reviews WHERE user_id = ? ORDER BY created_at DESC", (user_id,)).fetchall()
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=REVIEWS_COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow(_review_export_row(dict(row)))
    return path


def _review_export_row(row: dict) -> dict:
    details = _json_dict(row.get("obligation_results_json"))
    return {
        "review_id": row["id"],
        "attempt_id": row["attempt_id"],
        "question_id": row["question_id"],
        "reviewer_type": row["reviewer_type"],
        "verdict": row["verdict"],
        "score": row["score"],
        "reviewer_confidence": row["reviewer_confidence"],
        "created_at": row["created_at"],
        "obligation_results_json": json.dumps(details, sort_keys=True),
        "obligation_statuses": _format_obligation_statuses(details),
        "obligation_notes": _format_obligation_notes(details),
        "rubric_points": _format_rubric_points(details),
        "rubric_notes": _format_rubric_notes(details),
        "feedback": row["feedback"],
    }


def build_tutor_summary(
    skill: Skill,
    attempt: Attempt,
    progress: ProgressRecord,
    prerequisite_progress: dict[str, str],
    review_rows: list[dict] | None = None,
) -> str:
    missed_tags = unique_preserving_order(
        tag
        for problem, result in zip(attempt.problem_instances, attempt.grading_results)
        if not result.is_correct
        for tag in problem.mistake_tags
    )
    lines = [
        "# Quick Maths Tutor Summary",
        "",
        "## Student Context",
        "The learner is using Quick Maths, an open-source mastery testing and prerequisite mapping app. Use this result sheet as evidence of current understanding.",
        "",
        "## Current Skill",
        f"Skill: {skill.name}",
        f"Skill ID: {skill.id}",
        f"Domain: {skill.domain}",
        f"Subdomain: {skill.subdomain}",
        f"Status: {progress.status}",
        f"Mastery Score: {progress.mastery_score}/100",
        "Mastery Note: mastery is an accumulated 0-100 progress score, not the latest test percent. Attempts and saved proof/work reviews move it gradually.",
        "",
        "## Test Result",
        f"Score: {attempt.raw_score}/{attempt.score_total}",
        f"Percent: {attempt.percent_score:.0%}",
        f"Confidence: {attempt.reflection.confidence_rating}/5",
        f"Difficulty Felt: {attempt.reflection.difficulty_felt}",
        f"Hints Used: {attempt.reflection.hints_used}",
        f"Guessed: {attempt.reflection.guessed}",
        f"Review Status: {attempt.review_status}",
        f"Has Pending Review: {attempt.has_pending_review}",
        "",
        "## Missed / Risk Areas",
    ]
    lines.extend([f"- {tag}" for tag in missed_tags] or ["- None flagged"])
    lines.extend(["", "## Relevant Prerequisites"])
    lines.extend([f"- {skill_id}: {status}" for skill_id, status in prerequisite_progress.items()] or ["- None"])
    lines.extend(
        [
            "",
            "## Learner Notes",
            attempt.reflection.notes or "No notes provided.",
            "",
        "## Per-Question Details",
        "Review the learner's work for reasoning quality. The app only autograded the final answer.",
    ]
    )
    for idx, (problem, answer, result) in enumerate(zip(attempt.problem_instances, attempt.user_answers, attempt.grading_results), 1):
        response = coerce_user_response(answer, problem)
        lines.extend(
            [
                f"### Question {idx}",
                f"Prompt: {display_math(problem.prompt)}",
                f"Expected final answer: {display_math(problem.expected_answer)}",
                f"User final answer: {response.final_answer}",
                "User work:",
                response.work or "No work submitted.",
                f"Work review status: {result.work_review_status}",
                f"Work check status: {result.work_check_result.status if result.work_check_result else 'not_required'}",
                f"Correct: {result.is_correct}",
                f"Potential mistake tags: {', '.join(problem.mistake_tags) or 'none'}",
                "Solution steps:",
            ]
        )
        lines.extend([f"- {display_math(step)}" for step in problem.solution_steps] or ["- No solution steps provided."])
        lines.append("")
    if review_rows:
        lines.append("## Saved Review Details")
        for row in review_rows:
            details = _json_dict(row.get("obligation_results_json"))
            lines.extend(
                [
                    f"### Review {row.get('id', row.get('review_id', ''))}",
                    f"Question ID: {row.get('question_id') or 'attempt'}",
                    f"Verdict: {row.get('verdict')}",
                    f"Score: {row.get('score')}",
                    f"Obligation statuses: {_format_obligation_statuses(details) or 'none'}",
                    f"Obligation notes: {_format_obligation_notes(details) or 'none'}",
                    f"Rubric points: {_format_rubric_points(details) or 'none'}",
                    f"Rubric notes: {_format_rubric_notes(details) or 'none'}",
                    f"Feedback: {row.get('feedback') or 'None'}",
                    "",
                ]
            )
    lines.extend(
        [
            "## Recommended Tutoring Instructions",
            "Please tutor me based on this result. Start with a brief diagnosis, then review the weakest concept. Ask one practice question at a time. Do not move on until I can solve several problems correctly without hints. After practice, tell me when to retest in Quick Maths.",
            "",
            "AI tutors can make mistakes. I should verify important explanations and check my work.",
        ]
    )
    return "\n".join(lines)


def build_tutor_review_packet(skill: Skill, attempt: Attempt) -> str:
    lines = [
        "# Quick Maths Tutor Review Packet",
        "",
        "You are reviewing a Quick Maths proof/work submission. The app autograded only what it can. Please judge the learner's work against the provided proof skeleton/rubric.",
        "",
        "## Skill",
        f"Skill: {skill.name}",
        f"Skill ID: {skill.id}",
        f"Domain: {skill.domain}",
        f"Subdomain: {skill.subdomain}",
        "",
        "## Attempt Context",
        f"Attempt ID: {attempt.attempt_id}",
        f"Completed At: {attempt.completed_at}",
        f"Score: {attempt.raw_score}/{attempt.score_total} ({attempt.percent_score:.0%})",
        f"Review Status: {attempt.review_status}",
        f"Confidence: {attempt.reflection.confidence_rating}/5",
        f"Difficulty Felt: {attempt.reflection.difficulty_felt}",
        f"Hints Used: {attempt.reflection.hints_used}",
        f"Guessed: {attempt.reflection.guessed}",
        f"Learner Notes: {attempt.reflection.notes or 'None'}",
        "",
        "## Requested Return Format",
        "Verdict: pass | partial | needs_revision | fail",
        "Score: 0-100",
        "Reviewer confidence: low | medium | high",
        "Obligations:",
        "- obligation_id: satisfied | flawed | missing | not_applicable",
        "Feedback:",
        "",
    ]
    for idx, (problem, answer, result) in enumerate(zip(attempt.problem_instances, attempt.user_answers, attempt.grading_results), 1):
        if not result.work_check_result or result.work_check_result.status != "pending_review":
            continue
        response = coerce_user_response(answer, problem)
        final_grade = result.final_answer_grade
        work_check = result.work_check_result
        lines.extend(
            [
                f"## Question {idx}",
                f"Question ID: {problem.template_id}",
                f"Prompt: {display_math(problem.prompt)}",
                f"Expected final answer: {display_math(problem.expected_answer)}",
                f"User final answer: {response.final_answer}",
                "User work/proof:",
                response.work or "No work submitted.",
                f"Final answer autograde: {final_grade.status if final_grade else result.is_correct}",
                f"Final answer score: {final_grade.score if final_grade else int(result.is_correct)}",
                f"Final answer grading method: {final_grade.method if final_grade else result.method}",
                f"Final answer messages: {'; '.join(final_grade.messages) if final_grade and final_grade.messages else 'None'}",
                f"Work check status: {work_check.status}",
                f"Work check mode: {work_check.mode}",
                f"Work review policy: {work_check.review_policy}",
                f"Work check score: {work_check.score if work_check.score is not None else 'Needs review'}",
                f"Work check messages: {'; '.join(work_check.messages) if work_check.messages else 'None'}",
                f"Detected obligations: {', '.join(work_check.detected_obligations) or 'none'}",
                f"Missing obligations: {', '.join(work_check.missing_obligations) or 'none'}",
                f"Flawed obligations: {', '.join(work_check.flawed_obligations) or 'none'}",
                "",
            ]
        )
        if problem.work.get("proof_policy"):
            lines.extend(["### Proof Skeleton / Obligations"])
            for strategy in problem.work["proof_policy"].get("accepted_strategies", []):
                lines.append(f"Strategy: {strategy.get('name', strategy.get('id'))}")
                for item in strategy.get("assumptions_required", []):
                    lines.append(f"- {item['id']}: {item.get('label', item['id'])}")
                for item in strategy.get("required_obligations", []):
                    lines.append(f"- {item['id']}: {item.get('label', item['id'])}")
            lines.append("")
        if problem.work.get("rubric"):
            lines.extend(["### Rubric"])
            rubric = problem.work["rubric"]
            lines.append(f"Max points: {rubric.get('max_points')}")
            for criterion in rubric.get("criteria", []):
                lines.append(f"- {criterion['id']} ({criterion.get('points')} pts): {criterion.get('label')}")
            lines.append("")
    return "\n".join(lines)


def write_tutor_review_packet(markdown: str, path: Path | None = None) -> Path:
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = path or EXPORT_DIR / "latest_review_packet.md"
    path.write_text(markdown, encoding="utf-8")
    return path


def write_tutor_summary(markdown: str, path: Path | None = None) -> Path:
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = path or EXPORT_DIR / "latest_tutor_summary.md"
    path.write_text(markdown, encoding="utf-8")
    return path


def _json_dict(value: object) -> dict:
    if isinstance(value, dict):
        return value
    if not value:
        return {}
    try:
        parsed = json.loads(str(value))
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _format_obligation_statuses(details: dict) -> str:
    parts = []
    for item_id, result in details.items():
        if isinstance(result, dict) and "status" in result:
            parts.append(f"{item_id}={result.get('status')}")
    return "; ".join(parts)


def _format_obligation_notes(details: dict) -> str:
    parts = []
    for item_id, result in details.items():
        note = result.get("note") if isinstance(result, dict) else None
        if note:
            parts.append(f"{item_id}: {note}")
    return "; ".join(parts)


def _format_rubric_points(details: dict) -> str:
    parts = []
    for item_id, result in details.items():
        if isinstance(result, dict) and "awarded_points" in result:
            awarded = result.get("awarded_points")
            maximum = result.get("max_points")
            parts.append(f"{item_id}={awarded}/{maximum}")
    return "; ".join(parts)


def _format_rubric_notes(details: dict) -> str:
    parts = []
    for item_id, result in details.items():
        note = result.get("note") if isinstance(result, dict) else None
        if note and isinstance(result, dict) and "awarded_points" in result:
            parts.append(f"{item_id}: {note}")
    return "; ".join(parts)


def recommended_action(status: str) -> str:
    if status == "rusty":
        return "Review and retest."
    if status == "learning":
        return "Practice weak areas, then retest."
    if status == "ready":
        return "Start mastery test."
    if status == "locked":
        return "Prove prerequisites first."
    if status in {"proven", "mastered"}:
        return "Maintain with scheduled review."
    return "Open skill."


def _latest_reflections(user_id: str = DEFAULT_USER_ID) -> dict[str, dict]:
    with connect(DB_PATH) as conn:
        rows = conn.execute(
            """
            SELECT a.*
            FROM attempts a
            JOIN (
                SELECT skill_id, MAX(completed_at) AS completed_at
                FROM attempts
                WHERE user_id = ?
                GROUP BY skill_id
            ) latest ON latest.skill_id = a.skill_id AND latest.completed_at = a.completed_at
            WHERE a.user_id = ?
            """,
            (user_id, user_id),
        ).fetchall()
    return {row["skill_id"]: dict(row) for row in rows}


def _pending_review_count(skill_id: str, user_id: str = DEFAULT_USER_ID) -> int:
    with connect(DB_PATH) as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS count FROM attempts WHERE user_id = ? AND skill_id = ? AND has_pending_review = 1",
            (user_id, skill_id),
        ).fetchone()
    return int(row["count"] if row else 0)


def _latest_review_verdict(attempt_id: str | None) -> str:
    if not attempt_id:
        return ""
    with connect(DB_PATH) as conn:
        row = conn.execute(
            "SELECT verdict FROM reviews WHERE attempt_id = ? ORDER BY created_at DESC LIMIT 1",
            (attempt_id,),
        ).fetchone()
    return row["verdict"] if row else ""
