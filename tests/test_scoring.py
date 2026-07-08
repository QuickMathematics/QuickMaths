from quickmaths.models import Example, MasteryRules, ProblemTemplate, ProgressRecord, Reflection, ReviewResult, Skill, SkillTest
from quickmaths.scoring import apply_attempt_to_progress, apply_review_to_progress, compute_status, update_mastery


def _reflection(**overrides) -> Reflection:
    data = {
        "confidence_rating": 3,
        "difficulty_felt": "medium",
        "hints_used": "none",
        "guessed": "no",
        "wants_more_practice": "no",
    }
    data.update(overrides)
    return Reflection(**data)


def _skill() -> Skill:
    return Skill(
        id="S",
        name="Skill",
        domain="Math",
        subdomain="Test",
        description="test",
        prerequisites=[],
        mastery=MasteryRules(passing_score=0.8, minimum_confidence=3),
        theory="test",
        examples=[Example("p", "s")],
        test=SkillTest(1, False, [ProblemTemplate("Q", "fixed", "p", answer={"value": "s"}, grading={"method": "exact_text"})]),
    )


def test_mastery_update_clamps_to_range():
    assert update_mastery(98, 1.0, _reflection(confidence_rating=5, difficulty_felt="easy")) == 100
    assert update_mastery(2, 0.0, _reflection(confidence_rating=1, guessed="yes", hints_used="a_lot")) == 0


def test_confidence_and_guessing_affect_score():
    confident = update_mastery(50, 0.9, _reflection(confidence_rating=5, guessed="no"))
    guessed = update_mastery(50, 0.9, _reflection(confidence_rating=1, guessed="yes"))
    assert confident > guessed


def test_status_updates_correctly():
    skill = _skill()
    assert compute_status(skill, "ready", False, 1.0, _reflection(), 1) == "locked"
    assert compute_status(skill, "ready", True, 0.9, _reflection(), 1) == "proven"
    assert compute_status(skill, "ready", True, 0.9, _reflection(guessed="yes"), 1) == "learning"


def test_apply_attempt_to_progress_records_attempt():
    skill = _skill()
    previous = ProgressRecord(user_id="local_user", skill_id="S", status="ready", mastery_score=0)
    record = apply_attempt_to_progress(skill, previous, True, 0.9, _reflection(), "2026-07-07T00:00:00", [])
    assert record.status == "proven"
    assert record.attempt_count == 1


def test_pending_review_does_not_mark_skill_proven():
    skill = _skill()
    previous = ProgressRecord(user_id="local_user", skill_id="S", status="ready", mastery_score=40)
    record = apply_attempt_to_progress(skill, previous, True, 0.95, _reflection(), "2026-07-07T00:00:00", [], review_status="pending_review")
    assert record.status == "learning"
    assert record.mastery_score == previous.mastery_score


def test_pass_review_can_mark_skill_proven():
    skill = _skill()
    previous = ProgressRecord(user_id="local_user", skill_id="S", status="learning", mastery_score=60)
    review = ReviewResult("R", "A", None, "local_user", "human_tutor", "pass", 1.0, "high", {}, "Good.")
    record = apply_review_to_progress(skill, previous, review)
    assert record.status == "proven"


def test_pass_review_does_not_override_failed_final_answer():
    skill = _skill()
    previous = ProgressRecord(user_id="local_user", skill_id="S", status="learning", mastery_score=60)
    review = ReviewResult("R", "A", None, "local_user", "human_tutor", "pass", 1.0, "high", {}, "Good work.")
    record = apply_review_to_progress(skill, previous, review, final_answer_passed=False)
    assert record.status == "learning"


def test_fail_and_partial_review_keep_learning():
    skill = _skill()
    previous = ProgressRecord(user_id="local_user", skill_id="S", status="learning", mastery_score=60)
    fail = ReviewResult("R1", "A", None, "local_user", "human_tutor", "fail", 0.0, "high", {}, "No.")
    partial = ReviewResult("R2", "A", None, "local_user", "human_tutor", "partial", 0.6, "medium", {}, "Some.")
    assert apply_review_to_progress(skill, previous, fail).status == "learning"
    assert apply_review_to_progress(skill, previous, partial).status == "learning"
