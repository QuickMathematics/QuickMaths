from __future__ import annotations

from typing import Any

import streamlit as st

from app.page_helpers import (
    STATUS_COLORS,
    MASTERY_HELP,
    TEST_SCORE_HELP,
    action_for_status,
    graph_node_data,
    is_test_allowed,
    locked_reason,
    open_skill_page,
    start_test_for_skill,
    status_chip,
    status_legend,
    status_label,
    unmet_prerequisites,
)
from quickmaths.graph_engine import compute_unlocks


def render_knowledge_map(
    skills: dict,
    progress: dict,
    key: str = "home-map",
    height: int = 640,
    width: int = 2200,
) -> str | None:
    st.markdown(status_legend(), unsafe_allow_html=True)
    try:
        from streamlit_agraph import Config, Edge, Node, agraph
    except ImportError:
        st.warning("Interactive map component is unavailable. Use the skill buttons below to inspect nodes.")
        return _render_button_fallback(skills, progress, key)

    node_data = graph_node_data(skills, progress)
    nodes = [
        Node(
            id=str(item["id"]),
            label=str(item["label"]),
            title=f"{item['name']} - {item['subdomain']} - {status_label(str(item['status']))}",
            color=STATUS_COLORS.get(str(item["status"]), "#8a8f98"),
            shape="box",
            size=24,
            font={"size": 16, "face": "Arial", "color": "#ffffff"},
            margin=14,
        )
        for item in node_data
    ]
    edges = [
        Edge(source=prerequisite, target=skill.id, color="#8a8f98", arrows="to", smooth=True)
        for skill in skills.values()
        for prerequisite in skill.prerequisites
    ]
    config = Config(
        height=height,
        width=width,
        directed=True,
        hierarchical=True,
        physics=False,
        nodeHighlightBehavior=True,
        highlightColor="#f2a900",
        collapsible=False,
        direction="LR",
        sortMethod="directed",
        levelSeparation=360,
        nodeSpacing=320,
        treeSpacing=460,
    )
    selected = agraph(nodes=nodes, edges=edges, config=config)
    selected_id = _selected_node_id(selected)
    if selected_id in skills:
        st.session_state["selected_map_skill_id"] = selected_id
    return selected_id


def render_fullscreen_knowledge_map(skills: dict, progress: dict) -> None:
    st.markdown(
        """
        <style>
        header { visibility: hidden; }
        [data-testid="stSidebar"] { display: none; }
        [data-testid="collapsedControl"] { display: none; }
        .block-container {
            max-width: none;
            padding: 0.35rem 0.75rem 0.75rem;
        }
        .qm-fullscreen-title {
            font-size: 1.35rem;
            font-weight: 700;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )
    top_left, top_right = st.columns([6, 1])
    top_left.markdown("<div class='qm-fullscreen-title'>Quick Maths Map</div>", unsafe_allow_html=True)
    if top_right.button("Exit", key="exit-map-fullscreen", width="stretch"):
        target = "Quick_Maths_Dev.py" if st.session_state.get("quick_maths_dev_mode") else "Quick_Maths.py"
        st.switch_page(target)

    clicked_id = render_knowledge_map(skills, progress, key="fullscreen-map", height=900, width=4200)
    selected_id = clicked_id or st.session_state.get("selected_map_skill_id")
    if clicked_id in skills:
        render_selected_skill_details(clicked_id, skills, progress)
    elif selected_id in skills:
        with st.expander("Selected skill", expanded=False):
            render_details_panel(selected_id, skills, progress)


def render_selected_skill_details(skill_id: str, skills: dict, progress: dict) -> None:
    skill = skills[skill_id]
    if hasattr(st, "dialog"):

        @st.dialog(skill.name)
        def _dialog() -> None:
            _render_details_body(skill_id, skills, progress)

        _dialog()
    else:
        st.subheader("Skill Details")
        _render_details_body(skill_id, skills, progress)


def render_details_panel(skill_id: str, skills: dict, progress: dict) -> None:
    _render_details_body(skill_id, skills, progress)


def _render_details_body(skill_id: str, skills: dict, progress: dict) -> None:
    skill = skills[skill_id]
    nodes = {item["id"]: item for item in graph_node_data(skills, progress)}
    node = nodes[skill_id]
    status = str(node["status"])
    record = progress.get(skill_id)
    unlocks = compute_unlocks(skills).get(skill_id, [])

    st.markdown(status_chip(status), unsafe_allow_html=True)
    st.caption(skill.subdomain)
    st.write(skill.description)

    cols = st.columns(3)
    cols[0].metric("Mastery", f"{node['mastery_score']}/100", help=MASTERY_HELP)
    cols[1].metric("Latest Score", "" if node["latest_score"] is None else f"{float(node['latest_score']):.0%}", help=TEST_SCORE_HELP)
    cols[2].metric("Confidence", "" if node["confidence"] is None else f"{node['confidence']}/5", help="The learner's self-rated confidence from the latest saved attempt.")
    if node.get("pending_review_count"):
        st.warning(f"{node['pending_review_count']} attempt(s) pending tutor/self review.")

    st.write("Prerequisites:", ", ".join(_names(skill.prerequisites, skills)) or "None")
    st.write("Unlocks:", ", ".join(_names(unlocks, skills)) or "None")

    if skill.applications:
        st.write("Why this matters:")
        for application in skill.applications:
            label = application.get("title") or application.get("subject") or "Application"
            description = application.get("description", "")
            st.write(f"- {label}: {description}")

    st.write("Next recommended action:", node.get("next_recommended_action") or action_for_status(status))

    if status == "locked":
        st.warning(locked_reason(skill, skills, progress))
        unmet = unmet_prerequisites(skill, skills, progress)
        if unmet:
            st.write("Why locked?")
            for item in unmet:
                st.write(f"- {item['name']}: {status_label(item['status'])}")

    cols = st.columns(2)
    if cols[0].button("Take Test", disabled=not is_test_allowed(status), key=f"take-test-{skill_id}"):
        start_test_for_skill(skill_id)
    if cols[1].button("Open Lesson", key=f"open-skill-{skill_id}"):
        open_skill_page(skill_id)


def _render_button_fallback(skills: dict, progress: dict, key: str) -> str | None:
    selected = None
    for skill in skills.values():
        node = next(item for item in graph_node_data(skills, progress) if item["id"] == skill.id)
        if st.button(f"{skill.name} - {status_label(str(node['status']))}", key=f"{key}-{skill.id}"):
            selected = skill.id
    return selected


def _selected_node_id(selected: Any) -> str | None:
    if isinstance(selected, str):
        return selected
    if isinstance(selected, dict):
        value = selected.get("id") or selected.get("node")
        return str(value) if value is not None else None
    if isinstance(selected, list) and selected:
        return _selected_node_id(selected[0])
    return None


def _names(skill_ids: list[str], skills: dict) -> list[str]:
    return [skills[skill_id].name if skill_id in skills else skill_id for skill_id in skill_ids]
