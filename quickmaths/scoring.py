from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timedelta

from quickmaths.config import DEFAULT_USER_ID
from quickmaths.models import ProgressRecord, Reflection, ReviewResult, Skill


def update_mastery(current_mastery: float, score_percent: float, reflection: Reflection) -> float:
    new_mastery = current_mastery
    if score_percent >= 0.90:
        new_mastery += 15
    elif score_percent >= 0.80:
        new_mastery += 10
    elif score_percent >= 0.70:
        new_mastery += 4
    elif score_percent >= 0.60:
        new_mastery += 1
    else:
        new_mastery -= 10

    new_mastery += (reflection.confidence_rating - 3) * 3

    if reflection.difficulty_felt == "easy":
        new_mastery += 3
    elif reflection.difficulty_felt == "hard":
        new_mastery -= 4
    elif reflection.difficulty_felt == "brutal":
        new_mastery -= 8

    if reflection.hints_used == "little":
        new_mastery -= 2
    elif reflection.hints_used == "some":
        new_mastery -= 5
    elif reflection.hints_used == "a_lot":
        new_mastery -= 10

    if reflection.guessed == "maybe":
        new_mastery -= 4
    elif reflection.guessed == "yes":
        new_mastery -= 10

    return max(0.0, min(100.0, round(new_mastery, 2)))


def compute_status(
    skill: Skill,
    previous_status: str,
    prerequisites_met: bool,
    score_percent: float | None,
    reflection: Reflection | None,
    attempt_count: int,
) -> str:
    if not prerequisites_met:
        return "locked"
    if attempt_count == 0 or score_percent is None or reflection is None:
        return "ready"
    passed = (
        score_percent >= skill.mastery.passing_score
        and reflection.confidence_rating >= skill.mastery.minimum_confidence
        and reflection.guessed != "yes"
    )
    if passed:
        return "mastered" if previous_status == "proven" else "proven"
    return "learning"


def next_review_at(status: str, score_percent: float, confidence_rating: int, now: datetime | None = None) -> str:
    now = now or datetime.utcnow()
    if score_percent < 0.70 or confidence_rating <= 2:
        days = 1
    elif status == "learning":
        days = 2
    elif status == "mastered":
        days = 21
    elif status == "proven":
        days = 7
    else:
        days = 3
    return (now + timedelta(days=days)).isoformat()


def apply_attempt_to_progress(
    skill: Skill,
    previous: ProgressRecord | None,
    prerequisites_met: bool,
    score_percent: float,
    reflection: Reflection,
    completed_at: str,
    mistake_tags: list[str],
    review_status: str = "graded",
    user_id: str = DEFAULT_USER_ID,
) -> ProgressRecord:
    previous = previous or ProgressRecord(user_id=user_id, skill_id=skill.id, status="ready", mastery_score=0)
    attempt_count = previous.attempt_count + 1
    if review_status == "pending_review":
        mastery = previous.mastery_score
        status = "learning"
    else:
        mastery = update_mastery(previous.mastery_score, score_percent, reflection)
        status = compute_status(skill, previous.status, prerequisites_met, score_percent, reflection, attempt_count)
    best = max(previous.best_test_score or 0.0, score_percent)
    return replace(
        previous,
        status=status,  # type: ignore[arg-type]
        mastery_score=mastery,
        confidence_rating=reflection.confidence_rating,
        last_test_score=score_percent,
        best_test_score=best,
        attempt_count=attempt_count,
        last_attempt_at=completed_at,
        next_review_at=next_review_at(status, score_percent, reflection.confidence_rating),
        mistake_tags=mistake_tags,
        notes=reflection.notes,
        updated_at=datetime.utcnow().isoformat(),
    )


def review_score(verdict: str) -> float:
    return {
        "pass": 1.0,
        "partial": 0.6,
        "needs_revision": 0.35,
        "fail": 0.0,
    }.get(verdict, 0.0)


def apply_review_to_progress(
    skill: Skill,
    previous: ProgressRecord,
    review: ReviewResult,
    prerequisites_met: bool = True,
    final_answer_passed: bool = True,
) -> ProgressRecord:
    score = review.score if review.score is not None else review_score(review.verdict)
    mastery_delta = {
        "pass": 12,
        "partial": 3,
        "needs_revision": 0,
        "fail": -6,
    }.get(review.verdict, 0)
    mastery = max(0.0, min(100.0, previous.mastery_score + mastery_delta))
    if not prerequisites_met:
        status = "locked"
    elif review.verdict == "pass" and score >= 0.8 and final_answer_passed:
        status = "mastered" if previous.status == "proven" else "proven"
    else:
        status = "learning"
    return replace(
        previous,
        status=status,  # type: ignore[arg-type]
        mastery_score=round(mastery, 2),
        next_review_at=next_review_at(status, score, previous.confidence_rating or 3),
        updated_at=datetime.utcnow().isoformat(),
    )
