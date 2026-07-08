from __future__ import annotations

import streamlit as st

from app.dev_tools import render_author_preview
from app.home import render_home

st.session_state["quick_maths_dev_mode"] = True

pages = [
    st.Page(render_home, title="Quick Maths"),
    st.Page("pages/01_Knowledge_Map.py", title="Knowledge Map"),
    st.Page("pages/02_Lessons.py", title="Lessons"),
    st.Page("dev_pages/01_Lessons_Dev.py", title="Lessons-Dev"),
    st.Page("pages/03_Mastery_Test.py", title="Mastery Test"),
    st.Page("pages/04_Results.py", title="Results"),
    st.Page("pages/05_Exports.py", title="Exports"),
    st.Page(render_author_preview, title="Author Preview"),
]

st.navigation(pages).run()
