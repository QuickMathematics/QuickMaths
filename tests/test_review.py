from quickmaths.review import (
    compute_review_score_from_obligations,
    compute_review_score_from_rubric,
    infer_verdict_from_obligations,
    infer_verdict_from_rubric,
)


OBLIGATIONS = [
    {"id": "assume", "required": True},
    {"id": "derive", "required": True},
    {"id": "conclude", "required": True},
]


def test_all_required_obligations_satisfied_suggests_pass():
    results = {item["id"]: {"status": "satisfied", "note": ""} for item in OBLIGATIONS}
    assert compute_review_score_from_obligations(OBLIGATIONS, results) == 1.0
    assert infer_verdict_from_obligations(OBLIGATIONS, results) == "pass"


def test_one_flawed_required_obligation_suggests_partial_or_revision():
    results = {
        "assume": {"status": "satisfied"},
        "derive": {"status": "flawed"},
        "conclude": {"status": "satisfied"},
    }
    assert compute_review_score_from_obligations(OBLIGATIONS, results) < 1.0
    assert infer_verdict_from_obligations(OBLIGATIONS, results) in {"partial", "needs_revision"}


def test_missing_required_obligations_suggest_fail_or_revision():
    results = {
        "assume": {"status": "satisfied"},
        "derive": {"status": "missing"},
        "conclude": {"status": "missing"},
    }
    assert infer_verdict_from_obligations(OBLIGATIONS, results) in {"fail", "needs_revision"}


def test_rubric_score_computes_from_awarded_points():
    criteria = [
        {"id": "clear_assumptions", "max_points": 2},
        {"id": "valid_logical_flow", "max_points": 3},
    ]
    results = {
        "clear_assumptions": {"awarded_points": 2, "max_points": 2},
        "valid_logical_flow": {"awarded_points": 2, "max_points": 3},
    }
    assert compute_review_score_from_rubric(criteria, results) == 0.8
    assert infer_verdict_from_rubric(criteria, results) == "pass"
