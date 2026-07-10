from pathlib import Path

import pytest

from quickmaths.content_loader import ContentError, load_curriculum, load_skills


def test_loads_valid_default_skills():
    track, skills, warnings = load_curriculum()
    assert track.id == "TRACK_MATH_ALGEBRA_FOUNDATIONS"
    assert track.schema_version == "0.2"
    assert "MATH_ALG_001" in skills
    assert len(track.skills) == 25
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
                    assert method in {"symbolic_expression", "exact_numeric"}
                elif line_type == "equation":
                    assert method in {"equation_solution", "multiple_choice", "symbolic_expression"}
                else:
                    assert method in {"exact_text", "inequality_solution"}
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


def test_rejects_invalid_yaml(tmp_path: Path):
    skill_dir = tmp_path / "skills"
    skill_dir.mkdir()
    (skill_dir / "bad.yaml").write_text("id: [", encoding="utf-8")
    with pytest.raises(ContentError, match="invalid YAML"):
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
