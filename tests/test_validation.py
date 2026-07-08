from pathlib import Path

from quickmaths.cli import main
from quickmaths.validation import validate_curriculum


def test_default_content_passes_validation():
    report = validate_curriculum()
    assert report.ok
    assert report.warnings == []


def test_validation_detects_duplicate_question_ids(tmp_path: Path):
    _write_track(tmp_path, _skill_yaml())
    skill_path = tmp_path / "skills" / "S.yaml"
    text = skill_path.read_text(encoding="utf-8")
    skill_path.write_text(text.replace("id: Q2", "id: Q1"), encoding="utf-8")
    report = validate_curriculum(tmp_path)
    assert not report.ok
    assert any("Duplicate question id" in issue.message for issue in report.errors)


def test_validation_detects_impossible_generated_constraints(tmp_path: Path):
    _write_track(tmp_path, _skill_yaml(constraint="a > 5"))
    report = validate_curriculum(tmp_path)
    assert not report.ok
    assert any("Could not generate sample problem" in issue.message for issue in report.errors)


def test_validation_detects_unsupported_variable_type(tmp_path: Path):
    _write_track(tmp_path, _skill_yaml(variable_type="matrix"))
    report = validate_curriculum(tmp_path)
    assert not report.ok
    assert any("unsupported type 'matrix'" in issue.message for issue in report.errors)


def test_validate_content_cli_returns_success_for_default_content():
    assert main(["validate-content"]) == 0


def test_validation_detects_bad_proof_dependencies(tmp_path: Path):
    _write_track(tmp_path, _proof_skill_yaml(depends_on="missing_obligation"))
    report = validate_curriculum(tmp_path)
    assert not report.ok
    assert any("depends on unknown id" in issue.message for issue in report.errors)


def test_validation_detects_mastery_review_policy_mismatch(tmp_path: Path):
    _write_track(tmp_path, _proof_skill_yaml(work_review="optional"))
    report = validate_curriculum(tmp_path)
    assert not report.ok
    assert any("mastery_requires_review_pass" in issue.message for issue in report.errors)


def test_validation_detects_unsupported_schema_version(tmp_path: Path):
    _write_track(tmp_path, _skill_yaml())
    track_path = tmp_path / "track.yaml"
    track_path.write_text(track_path.read_text(encoding="utf-8").replace("id: TRACK_TEST", "id: TRACK_TEST\nschema_version: 9.9"), encoding="utf-8")
    report = validate_curriculum(tmp_path)
    assert not report.ok
    assert any("Unsupported track schema_version" in issue.message for issue in report.errors)


def test_validation_warns_deprecated_skill_without_replacement(tmp_path: Path):
    _write_track(tmp_path, _skill_yaml())
    skill_path = tmp_path / "skills" / "S.yaml"
    skill_path.write_text(skill_path.read_text(encoding="utf-8").replace("id: S", "id: S\ndeprecated: true"), encoding="utf-8")
    report = validate_curriculum(tmp_path)
    assert report.ok
    assert any("Deprecated skill should declare replacement_skill_id" in issue.message for issue in report.warnings)


def test_validation_can_include_untracked_drafts_without_warning(tmp_path: Path):
    _write_track(tmp_path, _skill_yaml())
    draft_dir = tmp_path / "drafts"
    draft_dir.mkdir()
    draft_yaml = _skill_yaml().replace("id: S", "id: DRAFT\ndraft: true")
    draft_dir.joinpath("DRAFT.yaml").write_text(draft_yaml, encoding="utf-8")
    report = validate_curriculum(tmp_path, include_drafts=True)
    assert report.ok
    assert not any("not listed in track.yaml" in issue.message for issue in report.warnings)


def _write_track(track_dir: Path, skill_yaml: str) -> None:
    skill_dir = track_dir / "skills"
    skill_dir.mkdir(parents=True)
    (track_dir / "track.yaml").write_text(
        """
id: TRACK_TEST
name: Test Track
domain: Math
description: Test
entry_skills:
  - S
exit_skills:
  - S
skills:
  - S
""",
        encoding="utf-8",
    )
    (skill_dir / "S.yaml").write_text(skill_yaml, encoding="utf-8")


def _skill_yaml(variable_type: str = "int", constraint: str = "a <= 2") -> str:
    return f"""
id: S
name: Test Skill
domain: Math
subdomain: Test
description: Test skill
prerequisites: []
mastery:
  passing_score: 0.8
  minimum_confidence: 3
theory: Test theory
examples:
  - prompt: "What is 1 + 1?"
    solution: "2"
test:
  question_count: 2
  randomize_order: false
  questions:
    - id: Q1
      type: generated
      prompt_template: "Compute: {{a}}"
      variables:
        a:
          type: {variable_type}
          min: 1
          max: 2
      constraints:
        - "{constraint}"
      answer:
        type: numeric
        value: "{{a}}"
      grading:
        method: exact_numeric
    - id: Q2
      type: fixed
      prompt: "Compute: 2"
      answer:
        type: numeric
        value: "2"
      grading:
        method: exact_numeric
"""


def _proof_skill_yaml(depends_on: str = "assume", work_review: str = "tutor_required") -> str:
    return f"""
id: S
name: Proof Skill
domain: Math
subdomain: Proof
description: Test proof
prerequisites: []
mastery:
  passing_score: 0.8
  minimum_confidence: 3
theory: Test theory
examples:
  - prompt: "Proof?"
    solution: "Proof."
test:
  question_count: 1
  randomize_order: false
  questions:
    - id: P1
      type: fixed
      prompt: "Prove something."
      answer_mode: final_plus_required_work
      answer:
        type: theorem_conclusion
        value: "done"
        accepted_forms: ["done"]
      grading:
        method: theorem_conclusion
        accepted_forms: ["done"]
      work:
        mode: proof_obligations
        prompt: "Write proof."
        proof_policy:
          accepted_strategies:
            - id: strategy
              name: Strategy
              assumptions_required:
                - id: assume
                  label: "Assume"
                  required: true
              required_obligations:
                - id: conclude
                  label: "Conclude"
                  required: true
                  depends_on:
                    - {depends_on}
      review_policy:
        work_review: {work_review}
        mastery_requires_review_pass: true
"""
