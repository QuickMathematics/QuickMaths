from __future__ import annotations

from datetime import datetime

import networkx as nx

from quickmaths.config import PROVEN_STATUSES
from quickmaths.models import ProgressRecord, Skill


class GraphError(ValueError):
    pass


def build_graph(skills: dict[str, Skill]) -> nx.DiGraph:
    graph = nx.DiGraph()
    for skill in skills.values():
        graph.add_node(skill.id, skill=skill)
    for skill in skills.values():
        for prerequisite in skill.prerequisites:
            if prerequisite not in skills:
                raise GraphError(f"{skill.id}: missing prerequisite '{prerequisite}'")
            graph.add_edge(prerequisite, skill.id)
    if not nx.is_directed_acyclic_graph(graph):
        cycles = list(nx.simple_cycles(graph))
        raise GraphError(f"Prerequisite graph contains a cycle: {cycles[0] if cycles else 'unknown'}")
    return graph


def compute_unlocks(skills: dict[str, Skill]) -> dict[str, list[str]]:
    unlocks = {skill_id: list(skill.unlocks) for skill_id, skill in skills.items()}
    for skill in skills.values():
        for prerequisite in skill.prerequisites:
            unlocks.setdefault(prerequisite, [])
            if skill.id not in unlocks[prerequisite]:
                unlocks[prerequisite].append(skill.id)
    return unlocks


def prerequisites_met(skill: Skill, progress: dict[str, ProgressRecord]) -> bool:
    return all(progress.get(prereq) and progress[prereq].status in PROVEN_STATUSES for prereq in skill.prerequisites)


def status_for_skill(skill: Skill, progress: dict[str, ProgressRecord]) -> str:
    record = progress.get(skill.id)
    if record:
        if record.next_review_at and record.status in PROVEN_STATUSES:
            try:
                if datetime.fromisoformat(record.next_review_at) < datetime.utcnow():
                    return "rusty"
            except ValueError:
                pass
        return record.status
    return "ready" if prerequisites_met(skill, progress) else "locked"


def graph_rows(skills: dict[str, Skill], progress: dict[str, ProgressRecord]) -> list[dict[str, object]]:
    unlocks = compute_unlocks(skills)
    rows = []
    for skill in skills.values():
        record = progress.get(skill.id)
        rows.append(
            {
                "id": skill.id,
                "name": skill.name,
                "domain": skill.domain,
                "subdomain": skill.subdomain,
                "description": skill.description,
                "prerequisites": skill.prerequisites,
                "unlocks": unlocks.get(skill.id, []),
                "status": status_for_skill(skill, progress),
                "mastery_score": record.mastery_score if record else 0,
                "latest_score": record.last_test_score if record else None,
                "confidence": record.confidence_rating if record else None,
                "next_review_at": record.next_review_at if record else None,
            }
        )
    return rows

