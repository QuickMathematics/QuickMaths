import pytest

from quickmaths.content_loader import load_curriculum
from quickmaths.graph_engine import GraphError, build_graph, compute_unlocks, status_for_skill
from quickmaths.models import Example, MasteryRules, ProblemTemplate, Skill, SkillTest


def _skill(skill_id: str, prerequisites: list[str]) -> Skill:
    return Skill(
        id=skill_id,
        name=skill_id,
        domain="Math",
        subdomain="Test",
        description="test",
        prerequisites=prerequisites,
        mastery=MasteryRules(),
        theory="test",
        examples=[Example("p", "s")],
        test=SkillTest(1, False, [ProblemTemplate("Q", "fixed", "p", answer={"value": "s"}, grading={"method": "exact_text"})]),
    )


def test_builds_graph_and_computes_unlocks():
    _, skills, _ = load_curriculum()
    graph = build_graph(skills)
    assert graph.has_edge("MATH_PREALG_002", "MATH_ALG_001")
    assert "MATH_ALG_001" in compute_unlocks(skills)["MATH_PREALG_002"]


def test_detects_missing_prerequisites():
    with pytest.raises(GraphError, match="missing prerequisite"):
        build_graph({"A": _skill("A", ["MISSING"])})


def test_detects_cycles():
    with pytest.raises(GraphError, match="cycle"):
        build_graph({"A": _skill("A", ["B"]), "B": _skill("B", ["A"])})


def test_computes_locked_and_ready_statuses():
    _, skills, _ = load_curriculum()
    assert status_for_skill(skills["MATH_ARITH_001"], {}) == "ready"
    assert status_for_skill(skills["MATH_ALG_001"], {}) == "locked"
