from __future__ import annotations

import uuid
from datetime import datetime

import streamlit as st

from app.page_helpers import TEST_SCORE_HELP, app_context, set_page_config
from app.profiles import selected_profile_id
from quickmaths.exports import build_tutor_review_packet, build_tutor_summary, write_tutor_review_packet, write_tutor_summary
from quickmaths.grading import coerce_user_response
from quickmaths.utils import display_math
from quickmaths.graph_engine import prerequisites_met
from quickmaths.models import Attempt, Reflection, ReviewResult
from quickmaths.review import (
    PROOF_REVIEW_STATUSES,
    REVIEW_VERDICTS,
    compute_review_score_from_obligations,
    compute_review_score_from_rubric,
    infer_verdict_from_obligations,
    infer_verdict_from_rubric,
    proof_obligations,
    rubric_criteria,
)
from quickmaths.scoring import apply_attempt_to_progress, apply_review_to_progress
from quickmaths.storage import load_progress, load_reviews, save_attempt, save_progress, save_review
from quickmaths.utils import unique_preserving_order

set_page_config()
track, skills, warnings, progress = app_context()
user_id = selected_profile_id() or "local_user"

pending = st.session_state.get("pending_results")
instances = st.session_state.get("problem_instances")
skill_id = st.session_state.get("current_skill_id")

st.title("Results")
if not pending or not instances or not skill_id:
    st.write("No submitted test is waiting for reflection.")
    if st.button("Open Mastery Test"):
        st.switch_page("pages/03_Mastery_Test.py")
    st.stop()

skill = skills[skill_id]
answers = pending["answers"]
results = pending["grading_results"]
raw_score = pending["raw_score"]
score_percent = raw_score / len(instances)

cols = st.columns(3)
cols[0].metric("Score", f"{raw_score}/{len(instances)}", help=TEST_SCORE_HELP)
cols[1].metric("Percent", f"{score_percent:.0%}", help=TEST_SCORE_HELP)
cols[2].metric("Lesson", skill.name, help="The skill this attempt is updating.")

for idx, (problem, answer, result) in enumerate(zip(instances, answers, results), start=1):
    response = coerce_user_response(answer, problem)
    with st.expander(f"Question {idx}: {'Correct' if result.is_correct else 'Needs work'}"):
        st.write(display_math(problem.prompt))
        st.write(f"Expected: {display_math(problem.expected_answer)}")
        st.write(f"Your final answer: {response.final_answer}")
        if response.work:
            st.write("Your work:")
            st.code(response.work, language="text")
        if result.work_review_status == "submitted_for_tutor_review":
            st.caption("Your work is stored for tutor review. The app only autograded the final answer.")
        if problem.mistake_tags and not result.is_correct:
            st.write("Potential mistake areas:", ", ".join(problem.mistake_tags))
        for step in problem.solution_steps:
            st.write(f"- {display_math(step)}")


def _pending_review_items(instances: list, results: list) -> list[tuple[int, object, object]]:
    return [
        (idx, problem, result)
        for idx, (problem, result) in enumerate(zip(instances, results), start=1)
        if result.work_check_result and result.work_check_result.status == "pending_review"
    ]


def _render_review_form(
    attempt_id: str,
    skill,
    progress: dict,
    final_answer_passed: bool,
    instances: list,
    results: list,
    attempt: Attempt | None = None,
    prerequisite_progress: dict | None = None,
) -> None:
    st.subheader("Enter Tutor / Self Review")
    if not final_answer_passed:
        st.caption("The review can be saved, but the final answer did not pass, so mastery will stay in Learning.")

    pending_items = _pending_review_items(instances, results)
    if not pending_items:
        st.caption("No questions require manual review.")
        return

    saved_reviews = load_reviews(attempt_id)
    saved_by_question = {row.get("question_id"): row for row in saved_reviews if row.get("question_id")}
    for idx, problem, result in pending_items:
        saved = saved_by_question.get(problem.template_id)
        if saved:
            st.success(f"Review saved for question {idx}.")
            _render_saved_review(saved)
            continue
        _render_question_review_form(
            attempt_id,
            skill,
            progress,
            final_answer_passed,
            idx,
            problem,
            result,
            pending_items,
            set(saved_by_question),
            attempt,
            prerequisite_progress or {},
        )


def _render_question_review_form(
    attempt_id: str,
    skill,
    progress: dict,
    final_answer_passed: bool,
    question_index: int,
    problem,
    result,
    pending_items: list[tuple[int, object, object]],
    saved_question_ids: set[str],
    attempt: Attempt | None,
    prerequisite_progress: dict,
) -> None:
    proof_items = proof_obligations(problem)
    rubric_items = rubric_criteria(problem)
    default_details = _default_review_details(problem, result, proof_items, rubric_items)
    if proof_items:
        suggested_score = compute_review_score_from_obligations(proof_items, default_details)
        suggested_verdict = infer_verdict_from_obligations(proof_items, default_details)
    elif rubric_items:
        suggested_score = compute_review_score_from_rubric(rubric_items, default_details)
        suggested_verdict = infer_verdict_from_rubric(rubric_items, default_details)
    else:
        suggested_score = 0.8
        suggested_verdict = "partial"

    form_key = f"review-form-{attempt_id}-{problem.template_id}"
    with st.form(form_key):
        st.markdown(f"### Question {question_index}")
        st.write(display_math(problem.prompt))
        st.caption(f"Suggested from entered/default item review: {suggested_verdict} at {suggested_score:.0%}. You can override it.")
        reviewer_type = st.selectbox("Reviewer", ["ai_tutor", "human_tutor", "self"], key=f"{form_key}-reviewer")
        verdict = st.selectbox("Overall verdict", REVIEW_VERDICTS, index=REVIEW_VERDICTS.index(suggested_verdict), key=f"{form_key}-verdict")
        score_percent = st.slider("Overall score", min_value=0, max_value=100, value=int(round(suggested_score * 100)), key=f"{form_key}-score")
        confidence = st.selectbox("Reviewer confidence", ["low", "medium", "high"], index=1, key=f"{form_key}-confidence")
        obligation_results = _render_review_items(form_key, proof_items, rubric_items, default_details)
        feedback = st.text_area("Feedback", key=f"{form_key}-feedback")
        save_review_result = st.form_submit_button("Save Review")

    if save_review_result:
        review = ReviewResult(
            review_id=str(uuid.uuid4()),
            attempt_id=attempt_id,
            question_id=problem.template_id,
            user_id=user_id,
            reviewer_type=reviewer_type,
            verdict=verdict,
            score=score_percent / 100,
            reviewer_confidence=confidence,
            obligation_results_json=obligation_results,
            feedback=feedback,
        )
        save_review(review)
        remaining = [
            pending_problem.template_id
            for _, pending_problem, _ in pending_items
            if pending_problem.template_id != problem.template_id and pending_problem.template_id not in saved_question_ids
        ]
        if remaining:
            st.info("Review saved. Mastery will update after all pending review questions are reviewed.")
        else:
            previous = progress.get(skill.id) or load_progress(user_id).get(skill.id)
            if previous:
                updated = apply_review_to_progress(skill, previous, review, final_answer_passed=final_answer_passed)
                save_progress(updated)
                _refresh_tutor_summary_with_reviews(skill, attempt, updated, prerequisite_progress, attempt_id)
            st.success("Review saved and mastery updated.")
        _render_saved_review(
            {
                "question_id": problem.template_id,
                "verdict": verdict,
                "score": score_percent / 100,
                "reviewer_confidence": confidence,
                "obligation_results_json": obligation_results,
                "feedback": feedback,
            }
        )


def _refresh_tutor_summary_with_reviews(skill, attempt: Attempt | None, progress_record, prerequisite_progress: dict, attempt_id: str) -> None:
    if not attempt:
        return
    summary = build_tutor_summary(skill, attempt, progress_record, prerequisite_progress, load_reviews(attempt_id))
    write_tutor_summary(summary)
    st.session_state["latest_tutor_summary"] = summary
    st.caption("Tutor summary refreshed with saved review details.")


def _render_review_items(form_key: str, proof_items: list[dict], rubric_items: list[dict], default_details: dict) -> dict:
    if proof_items:
        st.markdown("#### Obligation Results")
        details = {}
        for item in proof_items:
            item_id = item["id"]
            default = default_details.get(item_id, {})
            deps = f" Dependencies: {', '.join(item.get('depends_on', []))}." if item.get("depends_on") else ""
            st.write(f"**{item_id}** - {item.get('label', item_id)}")
            st.caption(("Required." if item.get("required", True) else "Optional.") + deps)
            default_status = str(default.get("status", "missing"))
            status = st.selectbox(
                "Status",
                PROOF_REVIEW_STATUSES,
                index=PROOF_REVIEW_STATUSES.index(default_status) if default_status in PROOF_REVIEW_STATUSES else 2,
                key=f"{form_key}-{item_id}-status",
            )
            note = st.text_input("Note", value=str(default.get("note", "")), key=f"{form_key}-{item_id}-note")
            details[item_id] = {"status": status, "note": note}
        return details

    if rubric_items:
        st.markdown("#### Rubric Results")
        details = {}
        for item in rubric_items:
            item_id = item["id"]
            max_points = float(item.get("max_points", 0))
            default = default_details.get(item_id, {})
            st.write(f"**{item_id}** - {item.get('label', item_id)}")
            awarded = st.number_input(
                "Awarded points",
                min_value=0.0,
                max_value=max_points,
                value=float(default.get("awarded_points", 0)),
                step=0.5,
                key=f"{form_key}-{item_id}-points",
            )
            note = st.text_input("Note", value=str(default.get("note", "")), key=f"{form_key}-{item_id}-note")
            details[item_id] = {"awarded_points": awarded, "max_points": max_points, "note": note}
        return details

    return {}


def _default_review_details(problem, result, proof_items: list[dict], rubric_items: list[dict]) -> dict:
    work_check = result.work_check_result
    if proof_items:
        detected = set(work_check.detected_obligations if work_check else [])
        missing = set(work_check.missing_obligations if work_check else [])
        details = {}
        for item in proof_items:
            item_id = item["id"]
            if item_id in detected:
                status = "satisfied"
            elif item_id in missing:
                status = "missing"
            else:
                status = "missing"
            details[item_id] = {"status": status, "note": ""}
        return details
    if rubric_items:
        return {item["id"]: {"awarded_points": 0.0, "max_points": float(item.get("max_points", 0)), "note": ""} for item in rubric_items}
    return {}


def _render_saved_review(review_row: dict) -> None:
    st.write(f"Verdict: {review_row.get('verdict')} ({float(review_row.get('score') or 0):.0%})")
    st.write(f"Reviewer confidence: {review_row.get('reviewer_confidence')}")
    if review_row.get("feedback"):
        st.write("Feedback:")
        st.write(review_row["feedback"])
    details = review_row.get("obligation_results_json") or {}
    st.json(details)


if st.session_state.get("saved_attempt_id"):
    attempt_id = st.session_state["saved_attempt_id"]
    st.success(f"Saved attempt {attempt_id}")
    if st.session_state.get("latest_review_packet"):
        st.subheader("Tutor Review Packet")
        st.text_area("Packet", st.session_state["latest_review_packet"], height=320)
        _render_review_form(
            attempt_id,
            skill,
            progress,
            score_percent >= skill.mastery.passing_score,
            instances,
            results,
            st.session_state.get("latest_attempt"),
            st.session_state.get("latest_prerequisite_progress", {}),
        )
    st.stop()

with st.form("reflection-form"):
    st.subheader("Reflection")
    confidence = st.slider("Confidence", min_value=1, max_value=5, value=3)
    difficulty = st.selectbox("Difficulty felt", ["easy", "medium", "hard", "brutal"], index=1)
    hints = st.selectbox("Hints used", ["none", "little", "some", "a_lot"])
    guessed = st.selectbox("Guessed", ["no", "maybe", "yes"])
    wants_more = st.selectbox("More practice", ["yes", "no"])
    confusing = st.text_area("Confusing parts", "")
    notes = st.text_area("Notes", "")
    save = st.form_submit_button("Save Result")

if save:
    completed_at = datetime.utcnow().isoformat()
    reflection = Reflection(
        confidence_rating=confidence,
        difficulty_felt=difficulty,
        hints_used=hints,
        guessed=guessed,
        wants_more_practice=wants_more,
        notes=notes,
        confusing_parts=confusing,
    )
    missed_tags = unique_preserving_order(
        tag for problem, result in zip(instances, results) if not result.is_correct for tag in problem.mistake_tags
    )
    previous_progress = load_progress(user_id)
    has_pending_review = any(result.work_check_result and result.work_check_result.status == "pending_review" for result in results)
    review_status = "pending_review" if has_pending_review else "graded"
    record = apply_attempt_to_progress(
        skill,
        previous_progress.get(skill.id),
        prerequisites_met(skill, previous_progress),
        score_percent,
        reflection,
        completed_at,
        missed_tags,
        review_status=review_status,
        user_id=user_id,
    )
    prerequisite_progress = {
        prereq: previous_progress.get(prereq).status if previous_progress.get(prereq) else "not proven"
        for prereq in skill.prerequisites
    }
    attempt_id = str(uuid.uuid4())
    attempt = Attempt(
        attempt_id=attempt_id,
        user_id=user_id,
        skill_id=skill.id,
        started_at=st.session_state.get("started_at", completed_at),
        completed_at=completed_at,
        seed=st.session_state.get("test_seed", 0),
        problem_instances=instances,
        user_answers=answers,
        grading_results=results,
        raw_score=raw_score,
        percent_score=score_percent,
        reflection=reflection,
        mastery_update={"status": record.status, "mastery_score": record.mastery_score},
        review_status=review_status,
        has_pending_review=has_pending_review,
    )
    summary = build_tutor_summary(skill, attempt, record, prerequisite_progress)
    summary_path = write_tutor_summary(summary)
    review_packet = ""
    if has_pending_review:
        review_packet = build_tutor_review_packet(skill, attempt)
        write_tutor_review_packet(review_packet)
    save_attempt(attempt)
    save_progress(record)
    st.session_state["saved_attempt_id"] = attempt_id
    st.session_state["latest_tutor_summary"] = summary
    st.session_state["latest_review_packet"] = review_packet
    st.session_state["latest_attempt"] = attempt
    st.session_state["latest_prerequisite_progress"] = prerequisite_progress
    st.success(f"Saved. Tutor summary: {summary_path}")
    st.text_area("AI tutor summary", summary, height=320)
    if review_packet:
        st.subheader("Tutor Review Packet")
        st.text_area("Packet", review_packet, height=320)
        _render_review_form(
            attempt_id,
            skill,
            {skill.id: record},
            score_percent >= skill.mastery.passing_score,
            instances,
            results,
            attempt,
            prerequisite_progress,
        )
