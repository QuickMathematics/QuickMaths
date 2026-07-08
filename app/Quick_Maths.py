from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.home import render_home

st.session_state["quick_maths_dev_mode"] = False
st.session_state["dev_allow_locked_test"] = False

render_home()
