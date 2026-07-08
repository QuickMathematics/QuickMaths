from __future__ import annotations

import random

import streamlit as st

from app.page_helpers import app_context, selected_or_first_ready_skill_id, set_page_config, start_test
from quickmaths.grading import grade_attempt, required_work_missing
from quickmaths.utils import display_math
from quickmaths.models import UserResponse
from quickmaths.problem_generator import generate_test
from quickmaths.work_checker import work_mode, work_required

set_page_config()
track, skills, warnings, progress = app_context()

skill_id = selected_or_first_ready_skill_id(
    skills,
    progress,
    st.session_state.get("selected_test_skill_id"),
    allow_locked=bool(st.session_state.get("dev_allow_locked_test")),
)
if skill_id is None:
    st.title("Mastery Test")
    st.info("No skills are ready for testing yet. Open Quick Maths to inspect prerequisites.")
    st.stop()

skill = skills[skill_id]
st.session_state["selected_test_skill_id"] = skill_id

previous_skill_id = st.session_state.get("current_skill_id")
if "problem_instances" not in st.session_state or previous_skill_id != skill_id:
    seed = random.randint(1, 2_000_000_000)
    start_test(skill_id, seed, generate_test(skill, seed))
else:
    st.session_state["current_skill_id"] = skill_id

instances = st.session_state["problem_instances"]
st.title("Mastery Test")
st.subheader(skill.name)


def _render_proof_skeleton(work: dict) -> None:
    proof_policy = work.get("proof_policy", {})
    strategies = proof_policy.get("accepted_strategies", [])
    if not strategies:
        return
    with st.expander("Proof skeleton"):
        for strategy in strategies:
            st.write(strategy.get("name", strategy.get("id", "Proof strategy")))
            if strategy.get("description"):
                st.caption(strategy["description"])
            for item in strategy.get("assumptions_required", []):
                st.write(f"- {item.get('label', item.get('id'))}")
            for item in strategy.get("required_obligations", []):
                st.write(f"- {item.get('label', item.get('id'))}")


def _render_rubric(work: dict) -> None:
    rubric = work.get("rubric")
    if not rubric:
        return
    with st.expander("Rubric"):
        for criterion in rubric.get("criteria", []):
            st.write(f"- {criterion.get('label', criterion.get('id'))}: {criterion.get('points')} pts")


with st.form("test-form"):
    responses = []
    for idx, problem in enumerate(instances, start=1):
        st.markdown(f"**Question {idx}**")
        st.write(display_math(problem.prompt))
        if problem.grading_method == "multiple_choice" and problem.options:
            labels = [str(option["id"]) for option in problem.options]
            final_answer = st.radio("Final answer", labels, key=f"answer-{idx}")
        else:
            final_answer = st.text_input("Final answer", key=f"answer-{idx}")
        mode = work_mode(problem)
        work = ""
        if mode != "none":
            if mode == "proof_obligations":
                _render_proof_skeleton(problem.work)
            elif mode == "rubric_check":
                _render_rubric(problem.work)
            prompt = problem.work.get("prompt") or "Show your work"
            label = f"{prompt} {'(required)' if work_required(problem) else '(optional)'}"
            work = st.text_area(label, key=f"work-{idx}")
        responses.append(UserResponse(final_answer=final_answer, work=work, answer_mode=problem.answer_mode))
    submitted = st.form_submit_button("Submit Answers")

if submitted:
    missing_work = required_work_missing(instances, responses)
    if missing_work:
        st.error(f"Please add required work for question(s): {', '.join(str(index) for index in missing_work)}.")
    else:
        results = grade_attempt(instances, responses)
        st.session_state["pending_results"] = {
            "answers": responses,
            "grading_results": results,
            "raw_score": sum(1 for result in results if result.is_correct),
        }
        st.switch_page("pages/04_Results.py")
