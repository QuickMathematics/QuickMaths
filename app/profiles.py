from __future__ import annotations

from datetime import date
import time

import streamlit as st

from app.cloud_session import logout_cloud_storage, render_storage_landing_gate, storage_label, sync_to_google_drive
from quickmaths.config import LOGO_PATH
from quickmaths.storage import add_user_logged_seconds, create_user, get_user, get_user_logged_seconds, list_users


def selected_profile_id() -> str | None:
    user_id = st.session_state.get("selected_profile_id")
    if user_id and get_user(str(user_id)):
        return str(user_id)
    st.session_state.pop("selected_profile_id", None)
    st.session_state.pop("selected_profile_name", None)
    return None


def selected_profile_name() -> str:
    return str(st.session_state.get("selected_profile_name") or "No profile")


def select_profile(user: dict) -> None:
    st.session_state["selected_profile_id"] = user["id"]
    st.session_state["selected_profile_name"] = user["display_name"]
    st.session_state["profile_login_started_at"] = time.time()
    st.session_state["profile_time_last_heartbeat"] = time.time()
    st.session_state.pop("problem_instances", None)
    st.session_state.pop("pending_results", None)
    st.session_state.pop("saved_attempt_id", None)


def logout_profile() -> None:
    heartbeat_profile_time(force=True)
    for key in [
        "selected_profile_id",
        "selected_profile_name",
        "profile_login_started_at",
        "profile_time_last_heartbeat",
        "problem_instances",
        "pending_results",
        "saved_attempt_id",
        "current_skill_id",
        "selected_test_skill_id",
        "latest_tutor_summary",
        "latest_review_packet",
        "latest_attempt",
        "latest_prerequisite_progress",
    ]:
        st.session_state.pop(key, None)


def current_session_seconds() -> int:
    today = date.today().isoformat()
    if st.session_state.get("app_session_date") != today:
        st.session_state["app_session_date"] = today
        st.session_state["app_session_started_at"] = time.time()
    return max(0, int(time.time() - float(st.session_state["app_session_started_at"])))


def heartbeat_profile_time(force: bool = False, persist_interval: int = 30) -> int:
    user_id = selected_profile_id()
    if not user_id:
        return 0
    now = time.time()
    last_heartbeat = float(st.session_state.get("profile_time_last_heartbeat", now))
    elapsed = max(0, int(now - last_heartbeat))
    stored_total = get_user_logged_seconds(user_id)
    if elapsed and (force or elapsed >= persist_interval):
        st.session_state["profile_time_last_heartbeat"] = now
        total = add_user_logged_seconds(user_id, elapsed)
        sync_to_google_drive("Profile time saved to Google Drive")
        return total
    return stored_total + elapsed


def format_duration(seconds: int) -> str:
    clean_seconds = max(0, int(seconds))
    hours, remainder = divmod(clean_seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}h {minutes:02d}m"
    if minutes:
        return f"{minutes}m {secs:02d}s"
    return f"{secs}s"


def render_profile_landing() -> None:
    st.markdown(
        """
        <style>
        header { visibility: hidden; }
        [data-testid="stSidebar"] { display: none; }
        [data-testid="collapsedControl"] { display: none; }
        .block-container {
            max-width: 1120px;
            padding-top: 2rem;
        }
        .qm-profile-title {
            text-align: left;
            font-family: "Times New Roman", Times, serif;
            font-size: 3rem;
            font-weight: 700;
            line-height: 1.05;
            margin-top: 0.2rem;
        }
        .qm-profile-subtitle {
            text-align: left;
            color: #5d6572;
            font-size: 1.05rem;
            margin-top: 0.35rem;
            margin-bottom: 1.75rem;
        }
        .qm-profile-header-spacer {
            height: 0.35rem;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    logo_col, title_col = st.columns([0.7, 3.3], vertical_alignment="center")
    if LOGO_PATH.exists():
        logo_col.image(str(LOGO_PATH), width=150)
    with title_col:
        st.markdown("<div class='qm-profile-title'>Quick Maths</div>", unsafe_allow_html=True)
        st.markdown(
            "<div class='qm-profile-subtitle'>Choose a learner profile or create a new one.</div>",
            unsafe_allow_html=True,
        )
    st.markdown("<div class='qm-profile-header-spacer'></div>", unsafe_allow_html=True)

    if not render_storage_landing_gate():
        return
    storage_cols = st.columns([3, 1])
    storage_cols[0].caption(f"Storage: {storage_label()}")
    if storage_cols[1].button("Change storage", width="stretch"):
        logout_cloud_storage()
        st.rerun()

    users = list_users()
    if users:
        st.subheader("Profiles")
        columns = st.columns(3)
        for index, user in enumerate(users):
            column = columns[index % 3]
            with column.container(border=True):
                st.markdown(f"**{user['display_name']}**")
                if st.button("Open", key=f"profile-open-{user['id']}", width="stretch"):
                    select_profile(user)
                    st.rerun()

    st.divider()
    st.subheader("New Profile")
    with st.form("create-profile-form"):
        display_name = st.text_input("Profile name", placeholder="Learner name")
        create = st.form_submit_button("Create Profile")
    if create:
        try:
            user = create_user(display_name)
        except ValueError as exc:
            st.error(str(exc))
        else:
            select_profile(user)
            sync_to_google_drive("Profile created in Google Drive")
            st.rerun()
