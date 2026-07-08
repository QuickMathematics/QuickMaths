from __future__ import annotations

from datetime import datetime

import streamlit as st

from quickmaths.config import FAVICON_PATH, PROVEN_STATUSES
from quickmaths.content_loader import load_curriculum
from quickmaths.exports import recommended_action
from quickmaths.graph_engine import build_graph, compute_unlocks, graph_rows, status_for_skill
from quickmaths.storage import init_db, load_progress, pending_review_counts, sync_skill_cache
from quickmaths.ui_components import analog_clock
from app.profiles import (
    current_session_seconds,
    format_duration,
    heartbeat_profile_time,
    logout_profile,
    render_profile_landing,
    selected_profile_id,
    selected_profile_name,
)


STATUS_COLORS = {
    "locked": "#8a8f98",
    "ready": "#2f74c0",
    "learning": "#c47a18",
    "proven": "#2f8f46",
    "mastered": "#176b34",
    "rusty": "#c43d3d",
    "unseen": "#8a8f98",
}

MASTERY_HELP = (
    "Mastery is an accumulated 0-100 progress score, not the percent from one test. "
    "Strong attempts and saved proof/work reviews raise it over time; pending review can keep mastery from advancing."
)
TEST_SCORE_HELP = (
    "This is the final-answer score for this attempt. It is one input to mastery, "
    "but required proof/work review may still need to be saved."
)


@st.cache_data(show_spinner=False)
def curriculum():
    track, skills, warnings = load_curriculum()
    build_graph(skills)
    return track, skills, warnings


def app_context():
    user_id = selected_profile_id()
    if not user_id:
        render_profile_landing()
        st.stop()
    track, skills, warnings = curriculum()
    init_db()
    sync_skill_cache(skills)
    progress = load_progress(user_id)
    return track, skills, warnings, progress


def set_page_config() -> None:
    page_icon = str(FAVICON_PATH) if FAVICON_PATH.exists() else "QM"
    st.set_page_config(page_title="Quick Maths", page_icon=page_icon, layout="wide")
    with st.sidebar:
        analog_clock(width=170, height=170, enabled=True)
    st.sidebar.title("Quick Maths")
    if selected_profile_id():
        st.sidebar.caption(f"Profile: {selected_profile_name()}")
        _render_sidebar_timers()
        if st.sidebar.button("Log Out", width="stretch"):
            logout_profile()
            st.rerun()
    st.markdown(
        """
        <style>
        .stButton > button { border-radius: 6px; }
        [data-testid="stMetricValue"] { font-size: 1.6rem; }
        .qm-legend { display:flex; flex-wrap:wrap; gap:8px; margin: 0.35rem 0 0.75rem; }
        .qm-legend-item { display:flex; align-items:center; gap:6px; font-size:0.9rem; }
        .qm-dot { width:12px; height:12px; border-radius:50%; display:inline-block; }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _render_sidebar_timers() -> None:
    def _body() -> None:
        st.sidebar.caption(f"Session today: {format_duration(current_session_seconds())}")
        st.sidebar.caption(f"Profile total: {format_duration(heartbeat_profile_time())}")

    if hasattr(st, "fragment"):

        @st.fragment(run_every=1)
        def _timer_fragment() -> None:
            _body()

        _timer_fragment()
    else:
        _body()


def status_label(status: str) -> str:
    return status.replace("_", " ").title()


def status_chip(status: str) -> str:
    color = STATUS_COLORS.get(status, "#8a8f98")
    return f"<span style='background:{color};color:white;border-radius:6px;padding:3px 8px;font-size:0.85rem'>{status_label(status)}</span>"


def status_legend() -> str:
    labels = ["locked", "ready", "learning", "proven", "mastered", "rusty"]
    items = [
        f"<span class='qm-legend-item'><span class='qm-dot' style='background:{STATUS_COLORS[status]}'></span>{status_label(status)}</span>"
        for status in labels
    ]
    return f"<div class='qm-legend'>{''.join(items)}</div>"


def skill_options(skills: dict) -> list[str]:
    return [skill.name for skill in skills.values()]


def skill_id_from_option(option: str) -> str:
    track, skills, _warnings = curriculum()
    for skill in skills.values():
        if skill.name == option:
            return skill.id
    return option


def skill_names(skill_ids: list[str], skills: dict) -> list[str]:
    return [skills[skill_id].name if skill_id in skills else skill_id for skill_id in skill_ids]


def recommended_rows(skills, progress):
    rows = graph_rows(skills, progress)
    pending_counts = pending_review_counts(selected_profile_id() or "")
    for row in rows:
        row["pending_review_count"] = pending_counts.get(str(row["id"]), 0)
    rank = {"rusty": 1, "learning": 2, "ready": 3, "locked": 5, "proven": 6, "mastered": 7}
    return sorted(rows, key=lambda row: (0 if row["pending_review_count"] else rank.get(str(row["status"]), 9), str(row["name"])))


def due_for_review(row: dict) -> bool:
    if not row.get("next_review_at"):
        return False
    try:
        return datetime.fromisoformat(str(row["next_review_at"])) <= datetime.utcnow()
    except ValueError:
        return False


def action_for_status(status: str) -> str:
    return recommended_action(status)


def start_test(skill_id: str, seed: int, instances) -> None:
    st.session_state["current_skill_id"] = skill_id
    st.session_state["selected_test_skill_id"] = skill_id
    st.session_state["test_seed"] = seed
    st.session_state["problem_instances"] = instances
    st.session_state["started_at"] = datetime.utcnow().isoformat()
    st.session_state.pop("pending_results", None)
    st.session_state.pop("saved_attempt_id", None)


def is_test_allowed(status: str) -> bool:
    return status in {"ready", "learning", "rusty", "proven", "mastered"}


def first_ready_skill_id(skills: dict, progress: dict) -> str | None:
    for skill in skills.values():
        if status_for_skill(skill, progress) == "ready":
            return skill.id
    return None


def selected_or_first_ready_skill_id(
    skills: dict,
    progress: dict,
    selected_skill_id: str | None,
    allow_locked: bool = False,
) -> str | None:
    if selected_skill_id in skills:
        if allow_locked:
            return selected_skill_id
        status = status_for_skill(skills[selected_skill_id], progress)
        if is_test_allowed(status):
            return selected_skill_id
    return first_ready_skill_id(skills, progress)


def unmet_prerequisites(skill, skills: dict, progress: dict) -> list[dict[str, str]]:
    unmet = []
    for prereq_id in skill.prerequisites:
        record = progress.get(prereq_id)
        status = record.status if record else status_for_skill(skills[prereq_id], progress) if prereq_id in skills else "missing"
        if status not in PROVEN_STATUSES:
            unmet.append(
                {
                    "id": prereq_id,
                    "name": skills[prereq_id].name if prereq_id in skills else prereq_id,
                    "status": status,
                }
            )
    return unmet


def locked_reason(skill, skills: dict, progress: dict) -> str:
    unmet = unmet_prerequisites(skill, skills, progress)
    if not unmet:
        return "This skill is not locked by prerequisites."
    names = ", ".join(item["name"] for item in unmet)
    return f"Locked because you still need to prove: {names}."


def graph_node_data(skills: dict, progress: dict) -> list[dict[str, object]]:
    rows = graph_rows(skills, progress)
    unlocks = compute_unlocks(skills)
    pending_counts = pending_review_counts(selected_profile_id() or "")
    by_id = {row["id"]: row for row in rows}
    data = []
    for skill in skills.values():
        row = by_id[skill.id]
        data.append(
            {
                "id": skill.id,
                "label": f"{skill.name}\n{skill.subdomain}",
                "name": skill.name,
                "subdomain": skill.subdomain,
                "description": skill.description,
                "status": row["status"],
                "mastery_score": row["mastery_score"],
                "latest_score": row["latest_score"],
                "confidence": row["confidence"],
                "prerequisites": list(skill.prerequisites),
                "unlocks": unlocks.get(skill.id, []),
                "applications": list(skill.applications),
                "pending_review_count": pending_counts.get(skill.id, 0),
                "next_recommended_action": "Complete tutor review." if pending_counts.get(skill.id, 0) else recommended_action(str(row["status"])),
            }
        )
    return data


def start_test_for_skill(skill_id: str) -> None:
    st.session_state["selected_test_skill_id"] = skill_id
    st.session_state["current_skill_id"] = skill_id
    st.session_state.pop("problem_instances", None)
    st.session_state.pop("pending_results", None)
    st.session_state.pop("saved_attempt_id", None)
    if hasattr(st, "switch_page"):
        st.switch_page("pages/03_Mastery_Test.py")
    else:
        st.info("Open the Mastery Test page. This skill is already selected.")


def open_skill_page(skill_id: str) -> None:
    st.session_state["current_skill_id"] = skill_id
    if hasattr(st, "switch_page"):
        st.switch_page("pages/02_Lessons.py")
    else:
        st.info("Open the Lessons page. This lesson is already selected.")
