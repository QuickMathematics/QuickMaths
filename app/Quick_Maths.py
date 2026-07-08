from __future__ import annotations

import streamlit as st

from app.home import render_home

st.session_state["quick_maths_dev_mode"] = False
st.session_state["dev_allow_locked_test"] = False

render_home()
