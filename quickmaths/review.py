from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from quickmaths.models import ProblemInstance

PROOF_REVIEW_STATUSES = ["satisfied", "flawed", "missing", "not_applicable"]
REVIEW_VERDICTS = ["pass", "partial", "needs_revision", "fail"]


def proof_obligations(instance: ProblemInstance) -> list[dict[str, Any]]:
    policy = instance.work.get("proof_policy", {})
    obligations: list[dict[str, Any]] = []
    for strategy in policy.get("accepted_strategies", []):
        strategy_id = strategy.get("id", strategy.get("name", "strategy"))
        for section in ("assumptions_required", "required_obligations"):
            for item in strategy.get(section, []):
                obligations.append(
                    {
                        "id": item["id"],
                        "label": item.get("label", item["id"]),
                        "required": bool(item.get("required", True)),
                        "depends_on": list(item.get("depends_on", [])),
                        "section": section,
                        "strategy_id": strategy_id,
                    }
                )
    return obligations


def rubric_criteria(instance: ProblemInstance) -> list[dict[str, Any]]:
    rubric = instance.work.get("rubric", {})
    criteria: list[dict[str, Any]] = []
    for criterion in rubric.get("criteria", []):
        points = float(criterion.get("points", 0))
        criteria.append(
            {
                "id": criterion["id"],
                "label": criterion.get("label", criterion["id"]),
                "max_points": points,
            }
        )
    return criteria


def compute_review_score_from_obligations(
    obligations_or_instance: ProblemInstance | Iterable[Mapping[str, Any]],
    obligation_results: Mapping[str, Mapping[str, Any]],
) -> float:
    obligations = _coerce_obligations(obligations_or_instance)
    applicable_required = [
        item
        for item in obligations
        if item.get("required", True)
        and str(obligation_results.get(str(item["id"]), {}).get("status", "missing")) != "not_applicable"
    ]
    if not applicable_required:
        return 1.0
    earned = 0.0
    for item in applicable_required:
        status = str(obligation_results.get(str(item["id"]), {}).get("status", "missing"))
        if status == "satisfied":
            earned += 1.0
        elif status == "flawed":
            earned += 0.5
    return round(earned / len(applicable_required), 4)


def infer_verdict_from_obligations(
    obligations_or_instance: ProblemInstance | Iterable[Mapping[str, Any]],
    obligation_results: Mapping[str, Mapping[str, Any]],
) -> str:
    obligations = _coerce_obligations(obligations_or_instance)
    required = [item for item in obligations if item.get("required", True)]
    if not required:
        return "pass"
    statuses = [str(obligation_results.get(str(item["id"]), {}).get("status", "missing")) for item in required]
    active_statuses = [status for status in statuses if status != "not_applicable"]
    if not active_statuses or all(status == "satisfied" for status in active_statuses):
        return "pass"

    score = compute_review_score_from_obligations(obligations, obligation_results)
    missing_count = active_statuses.count("missing")
    if score < 0.4 or missing_count >= max(2, len(active_statuses) // 2):
        return "fail"
    if score < 0.7:
        return "needs_revision"
    return "partial"


def compute_review_score_from_rubric(
    criteria_or_instance: ProblemInstance | Iterable[Mapping[str, Any]],
    rubric_results: Mapping[str, Mapping[str, Any]],
) -> float:
    criteria = _coerce_rubric(criteria_or_instance)
    total = sum(float(item.get("max_points", 0)) for item in criteria)
    if total <= 0:
        return 0.0
    awarded = 0.0
    for item in criteria:
        criterion_id = str(item["id"])
        max_points = float(item.get("max_points", 0))
        value = float(rubric_results.get(criterion_id, {}).get("awarded_points", 0))
        awarded += max(0.0, min(max_points, value))
    return round(awarded / total, 4)


def infer_verdict_from_rubric(
    criteria_or_instance: ProblemInstance | Iterable[Mapping[str, Any]],
    rubric_results: Mapping[str, Mapping[str, Any]],
) -> str:
    score = compute_review_score_from_rubric(criteria_or_instance, rubric_results)
    if score >= 0.8:
        return "pass"
    if score >= 0.6:
        return "partial"
    if score >= 0.35:
        return "needs_revision"
    return "fail"


def _coerce_obligations(source: ProblemInstance | Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    if isinstance(source, ProblemInstance):
        return proof_obligations(source)
    return [dict(item) for item in source]


def _coerce_rubric(source: ProblemInstance | Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    if isinstance(source, ProblemInstance):
        return rubric_criteria(source)
    return [dict(item) for item in source]
