from __future__ import annotations

import streamlit as st

from app.page_helpers import (
    app_context,
    is_test_allowed,
    locked_reason,
    MASTERY_HELP,
    set_page_config,
    skill_id_from_option,
    skill_names,
    skill_options,
    start_test_for_skill,
    status_chip,
    status_label,
    unmet_prerequisites,
)
from quickmaths.graph_engine import compute_unlocks, status_for_skill
from quickmaths.utils import display_math

set_page_config()
track, skills, warnings, progress = app_context()
unlocks = compute_unlocks(skills)

st.title("Lessons")
st.caption("Read the core idea, inspect examples, and start a mastery test when the prerequisites are ready.")

current = st.session_state.get("current_skill_id", next(iter(skills)))
options = skill_options(skills)
default_index = next((idx for idx, skill in enumerate(skills.values()) if skill.id == current), 0)
selected = st.selectbox("Choose a lesson", options, index=default_index)
skill_id = skill_id_from_option(selected)
skill = skills[skill_id]
st.session_state["current_skill_id"] = skill_id
status = status_for_skill(skill, progress)

cols = st.columns([3, 1])
cols[0].subheader(skill.name)
cols[0].write(skill.description)
cols[1].markdown(status_chip(status), unsafe_allow_html=True)
record = progress.get(skill.id)
cols[1].metric("Mastery", f"{record.mastery_score if record else 0}/100", help=MASTERY_HELP)

st.write("Prerequisites:", ", ".join(skill_names(skill.prerequisites, skills)) or "None")
st.write("Unlocks:", ", ".join(skill_names(unlocks.get(skill.id, []), skills)) or "None")
if skill.applications:
    st.write("Why this matters:")
    for app in skill.applications:
        label = app.get("title") or app.get("subject") or "Application"
        description = app.get("description", "")
        st.write(f"- {label}: {description}")

if status == "locked":
    st.warning(locked_reason(skill, skills, progress))
    for item in unmet_prerequisites(skill, skills, progress):
        st.write(f"- {item['name']}: {status_label(item['status'])}")

if st.button("Take Test", disabled=not is_test_allowed(status)):
    start_test_for_skill(skill.id)

st.divider()
st.markdown(display_math(skill.theory))

st.subheader("Examples")
for example in skill.examples:
    with st.expander(display_math(example.prompt)):
        st.write(f"Solution: {display_math(example.solution)}")
        st.write(display_math(example.explanation))
