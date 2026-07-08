from __future__ import annotations

import streamlit as st

from app.page_helpers import app_context, recommended_rows, set_page_config, start_test_for_skill, status_chip
from app.profiles import selected_profile_id
from quickmaths.storage import recent_attempts


def render_home() -> None:
    set_page_config()
    track, skills, warnings, progress = app_context()

    st.title("Quick Maths")
    st.caption("Test your knowledge. Map your mastery. Tutor with AI.")

    if warnings:
        with st.expander("Content warnings"):
            for warning in warnings:
                st.warning(warning)

    rows = recommended_rows(skills, progress)
    ready = [row for row in rows if row["status"] == "ready"]
    learning = [row for row in rows if row["status"] == "learning"]
    rusty = [row for row in rows if row["status"] == "rusty"]
    proven = [row for row in rows if row["status"] == "proven"]
    mastered = [row for row in rows if row["status"] == "mastered"]

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Ready", len(ready), help="Skills with prerequisites met and no completed attempt yet.")
    col2.metric("Learning", len(learning), help="Skills started but not yet proven, including skills waiting on review.")
    col3.metric("Proven", len(proven), help="Skills that passed the mastery rules and prerequisite gate.")
    col4.metric("Mastered / Rusty", f"{len(mastered)} / {len(rusty)}", help="Mastered skills are strongly proven. Rusty skills are due for review.")

    st.subheader("Suggested Next Test")
    suggested = next((row for row in rows if row.get("pending_review_count") or row["status"] in {"rusty", "learning", "ready"}), None)
    if suggested:
        cols = st.columns([2.5, 1, 1])
        cols[0].markdown(f"**{suggested['name']}**")
        cols[1].markdown(status_chip(str(suggested["status"])), unsafe_allow_html=True)
        button_label = "Review" if suggested.get("pending_review_count") else "Take Test"
        if cols[2].button(button_label, key=f"suggested-test-{suggested['id']}"):
            if suggested.get("pending_review_count"):
                st.switch_page("pages/05_Exports.py")
            else:
                start_test_for_skill(str(suggested["id"]))
    else:
        st.write("No ready tests right now. Open the map to review proven skills or inspect locked prerequisites.")

    st.subheader("Recent Attempts")
    attempts = recent_attempts(5, selected_profile_id() or "")
    if attempts:
        st.dataframe(attempts, hide_index=True, width="stretch")
    else:
        st.write("No attempts yet.")
