from pathlib import Path

import pytest

from quickmaths.content_loader import ContentError, load_curriculum, load_skills


def test_loads_valid_default_skills():
    track, skills, warnings = load_curriculum()
    assert track.id == "TRACK_MATH_ALGEBRA_FOUNDATIONS"
    assert track.schema_version == "0.2"
    assert "MATH_ALG_001" in skills
    assert len(track.skills) == 41
    assert skills["MATH_ALG_001"].test.question_count >= 1
    assert len(skills["MATH_ALG_001"].test.questions) >= skills["MATH_ALG_001"].test.question_count
    assert warnings == []


def test_default_content_uses_procedural_work_only_where_auto_checking_is_supported():
    _track, skills, _warnings = load_curriculum()
    for skill in skills.values():
        for question in skill.test.questions:
            method = question.grading.get("method")
            mode = question.work.get("mode")
            if mode == "procedural_steps":
                assert question.answer_mode == "final_plus_required_work"
                assert question.review_policy["work_review"] == "auto"
                assert question.review_policy["mastery_requires_review_pass"] is False
                line_type = question.work.get("line_type")
                assert line_type in {"expression", "equation", "inequality"}
                if line_type == "expression":
                    assert method in {"symbolic_expression", "exact_numeric", "multiple_choice"}
                elif line_type == "equation":
                    assert method in {"equation_solution", "multiple_choice", "symbolic_expression", "exact_numeric"}
                else:
                    assert method in {"exact_text", "inequality_solution"}
            elif mode == "capture_only":
                assert question.answer_mode == "final_plus_required_work"
                assert question.work.get("prompt", "").strip()
                assert question.review_policy["mastery_requires_review_pass"] is False
            else:
                assert question.answer_mode == "final_only"
                assert question.work["mode"] == "none"


def test_rewritten_content_watch_points_are_represented_in_schema():
    _track, skills, _warnings = load_curriculum()

    arithmetic = skills["MATH_ARITH_005"]
    fixed_ids = {
        question.id
        for question in arithmetic.test.questions
        if question.type == "fixed"
    }
    assert "CONVERT_ZERO_PERCENT_TO_DECIMAL_001" in fixed_ids
    assert "CONVERT_HUNDRED_PERCENT_TO_DECIMAL_001" in fixed_ids

    substitution = skills["MATH_PREALG_001"]
    for question in substitution.test.questions:
        if question.work.get("mode") == "procedural_steps":
            assert "substitut" in question.work.get("prompt", "").casefold()

    classification = skills["MATH_ALG_004"]
    assert all(question.grading.get("method") == "multiple_choice" for question in classification.test.questions)
    assert all(question.answer_mode == "final_plus_required_work" for question in classification.test.questions)

    inequalities = skills["MATH_ALG_006"]
    assert all(question.work.get("line_type") == "inequality" for question in inequalities.test.questions)

    sign_reversal = skills["MATH_ALG_007"]
    assert all(question.answer_mode == "final_plus_required_work" for question in sign_reversal.test.questions)
    assert all(question.work.get("line_type") == "inequality" for question in sign_reversal.test.questions)

    systems = skills["MATH_SYS_001"]
    assert all(question.answer_mode == "final_plus_required_work" for question in systems.test.questions)
    assert all(question.work.get("mode") in {"capture_only", "procedural_steps"} for question in systems.test.questions)
    assert all(question.work.get("mode") == "capture_only" for question in systems.test.questions if "CLASSIFY" in question.id)
    assert any(question.work.get("mode") == "procedural_steps" for question in systems.test.questions)
    systems_theory = systems.theory.casefold()
    assert all(term in systems_theory for term in ("substitution", "elimination", "check"))

    slope_intercept = skills["MATH_GRAPH_004"]
    assert "MATH_GRAPH_003" in slope_intercept.prerequisites

    writing_lines = skills["MATH_GRAPH_006"]
    assert "parallel lines have the same slope" in writing_lines.theory.casefold()

    coordinate_plane = skills["MATH_GRAPH_001"]
    assert all(")?." not in question.prompt_template for question in coordinate_plane.test.questions)

    expansion_ids = {
        "MATH_EXP_001", "MATH_EXP_002", "MATH_EXP_003", "MATH_FUNC_001",
        "MATH_SEQ_001", "MATH_SEQ_002", "MATH_POLY_001", "MATH_POLY_002",
        "MATH_POLY_003", "MATH_POLY_004", "MATH_QUAD_001", "MATH_QUAD_002",
        "MATH_QUAD_003", "MATH_QUAD_004", "MATH_QUAD_005", "MATH_RAD_001",
    }
    assert expansion_ids.issubset(skills)
    assert "MATH_QUAD_005" in _track.exit_skills
    assert "MATH_EXP_003" in _track.exit_skills


def test_rejects_invalid_yaml(tmp_path: Path):
    skill_dir = tmp_path / "skills"
    skill_dir.mkdir()
    (skill_dir / "bad.yaml").write_text("id: [", encoding="utf-8")
    with pytest.raises(ContentError, match="invalid YAML"):
        load_skills(tmp_path)


def test_rejects_duplicate_yaml_mapping_keys(tmp_path: Path):
    skill_dir = tmp_path / "skills"
    skill_dir.mkdir()
    duplicate_constraints = _skill_yaml("DUPLICATE_KEY", "Duplicate Key").replace(
        "      grading:\n        method: exact_numeric",
        "      constraints: [\"1 == 1\"]\n      constraints: [\"2 == 2\"]\n      grading:\n        method: exact_numeric",
        1,
    )
    (skill_dir / "duplicate-key.yaml").write_text(duplicate_constraints, encoding="utf-8")

    with pytest.raises(ContentError, match="duplicate key 'constraints'"):
        load_skills(tmp_path)


def test_detects_duplicate_ids(tmp_path: Path):
    skill_dir = tmp_path / "skills"
    skill_dir.mkdir()
    yaml_text = """
id: DUPLICATE
name: Duplicate
domain: Math
subdomain: Test
description: Test skill
prerequisites: []
mastery:
  passing_score: 0.8
  minimum_confidence: 3
theory: Test
examples: []
test:
  question_count: 1
  questions:
    - id: Q1
      type: fixed
      prompt: "2 + 2"
      answer:
        type: numeric
        value: "4"
      grading:
        method: exact_numeric
"""
    (skill_dir / "a.yaml").write_text(yaml_text, encoding="utf-8")
    (skill_dir / "b.yaml").write_text(yaml_text, encoding="utf-8")
    with pytest.raises(ContentError, match="duplicate skill id"):
        load_skills(tmp_path)


def test_draft_skills_are_ignored_unless_included(tmp_path: Path):
    skill_dir = tmp_path / "skills"
    skill_dir.mkdir()
    (tmp_path / "track.yaml").write_text(
        """
id: TRACK_TEST
schema_version: 0.2
name: Test
domain: Math
description: Test track
entry_skills: [LIVE]
exit_skills: [LIVE]
skills: [LIVE]
""",
        encoding="utf-8",
    )
    live = _skill_yaml("LIVE", "Live Skill")
    draft = _skill_yaml("DRAFT", "Draft Skill", draft=True)
    (skill_dir / "live.yaml").write_text(live, encoding="utf-8")
    (skill_dir / "draft.yaml").write_text(draft, encoding="utf-8")

    _track, skills, warnings = load_curriculum(tmp_path)
    assert "LIVE" in skills
    assert "DRAFT" not in skills
    assert warnings == []

    _track, skills_with_drafts, warnings = load_curriculum(tmp_path, include_drafts=True)
    assert skills_with_drafts["DRAFT"].draft
    assert warnings == []


def _skill_yaml(skill_id: str, name: str, draft: bool = False) -> str:
    draft_line = "draft: true\n" if draft else ""
    return f"""
id: {skill_id}
schema_version: 0.2
{draft_line}name: {name}
domain: Math
subdomain: Test
description: Test skill
prerequisites: []
mastery:
  passing_score: 0.8
  minimum_confidence: 3
theory: Test
examples:
  - prompt: "What is 2 + 2?"
    solution: "4"
test:
  question_count: 2
  randomize_order: false
  questions:
    - id: Q1
      type: fixed
      prompt: "2 + 2"
      answer:
        type: numeric
        value: "4"
      grading:
        method: exact_numeric
    - id: Q2
      type: fixed
      prompt: "3 + 3"
      answer:
        type: numeric
        value: "6"
      grading:
        method: exact_numeric
"""
