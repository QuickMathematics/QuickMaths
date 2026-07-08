from quickmaths.content_loader import load_curriculum
from quickmaths.models import ProgressRecord
from app.page_helpers import (
    graph_node_data,
    locked_reason,
    selected_or_first_ready_skill_id,
    skill_options,
    unmet_prerequisites,
)


def test_locked_skill_cannot_be_selected_as_default_test():
    _, skills, _ = load_curriculum()
    selected = selected_or_first_ready_skill_id(skills, {}, "MATH_ALG_001")
    assert selected == "MATH_ARITH_001"


def test_dev_override_can_select_locked_skill_for_testing():
    _, skills, _ = load_curriculum()
    selected = selected_or_first_ready_skill_id(skills, {}, "MATH_ALG_001", allow_locked=True)
    assert selected == "MATH_ALG_001"


def test_first_ready_skill_is_selected_when_no_selected_skill_exists():
    _, skills, _ = load_curriculum()
    selected = selected_or_first_ready_skill_id(skills, {}, None)
    assert selected == "MATH_ARITH_001"


def test_unmet_prerequisite_helper_returns_locked_reason():
    _, skills, _ = load_curriculum()
    skill = skills["MATH_ALG_001"]
    unmet = unmet_prerequisites(skill, skills, {})
    assert unmet == [{"id": "MATH_PREALG_002", "name": "Combining like terms", "status": "locked"}]
    assert locked_reason(skill, skills, {}) == "Locked because you still need to prove: Combining like terms."


def test_graph_node_data_includes_status_mastery_prerequisites_and_unlocks():
    _, skills, _ = load_curriculum()
    progress = {
        "MATH_ARITH_001": ProgressRecord(
            user_id="local_user",
            skill_id="MATH_ARITH_001",
            status="proven",
            mastery_score=82,
            confidence_rating=4,
            last_test_score=0.9,
        )
    }
    nodes = {item["id"]: item for item in graph_node_data(skills, progress)}
    node = nodes["MATH_ARITH_001"]
    assert node["status"] == "proven"
    assert node["mastery_score"] == 82
    assert node["prerequisites"] == []
    assert "MATH_ARITH_002" in node["unlocks"]


def test_human_facing_skill_options_do_not_include_skill_ids():
    _, skills, _ = load_curriculum()
    options = skill_options(skills)
    assert "Combining like terms" in options
    assert all("MATH_" not in option for option in options)


def test_graph_node_label_uses_name_and_subdomain_not_skill_id():
    _, skills, _ = load_curriculum()
    nodes = {item["id"]: item for item in graph_node_data(skills, {})}
    label = nodes["MATH_PREALG_002"]["label"]
    assert label == "Combining like terms\nPre-Algebra"
    assert "MATH_" not in label
