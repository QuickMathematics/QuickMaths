from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

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
