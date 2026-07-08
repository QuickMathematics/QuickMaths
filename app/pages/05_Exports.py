from __future__ import annotations

import streamlit as st

from app.page_helpers import app_context, set_page_config
from app.profiles import selected_profile_id
from quickmaths.config import EXPORT_DIR
from quickmaths.exports import export_attempts_csv, export_progress_csv, export_reviews_csv
from quickmaths.tutor_prompts import DEFAULT_TUTOR_PROMPT

set_page_config()
track, skills, warnings, progress = app_context()
user_id = selected_profile_id() or "local_user"

st.title("Exports")
st.caption("Download progress data and copy tutor-ready summaries.")

cols = st.columns(3)
if cols[0].button("Export Progress CSV", width="stretch"):
    path = export_progress_csv(skills, user_id=user_id)
    st.success(str(path))
if cols[1].button("Export Attempts CSV", width="stretch"):
    path = export_attempts_csv(skills, user_id=user_id)
    st.success(str(path))
if cols[2].button("Export Reviews CSV", width="stretch"):
    path = export_reviews_csv(user_id=user_id)
    st.success(str(path))

progress_path = EXPORT_DIR / "progress.csv"
attempts_path = EXPORT_DIR / "attempts.csv"
summary_path = EXPORT_DIR / "latest_tutor_summary.md"
review_packet_path = EXPORT_DIR / "latest_review_packet.md"
reviews_path = EXPORT_DIR / "reviews.csv"

for path, mime in [
    (progress_path, "text/csv"),
    (attempts_path, "text/csv"),
    (reviews_path, "text/csv"),
    (summary_path, "text/markdown"),
    (review_packet_path, "text/markdown"),
]:
    if path.exists():
        st.download_button(path.name, path.read_text(encoding="utf-8"), file_name=path.name, mime=mime)

st.subheader("Tutor Setup Prompt")
st.text_area("Prompt", DEFAULT_TUTOR_PROMPT, height=520)

if summary_path.exists():
    st.subheader("Latest Attempt Summary")
    st.text_area("Summary", summary_path.read_text(encoding="utf-8"), height=320)

if review_packet_path.exists():
    st.subheader("Latest Pending Review Packet")
    st.text_area("Review packet", review_packet_path.read_text(encoding="utf-8"), height=320)
