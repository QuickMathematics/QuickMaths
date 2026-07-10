from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from quickmaths.config import DEFAULT_TRACK_DIR, SUPPORTED_GRADING_METHODS
from quickmaths.content_loader import ContentError, load_curriculum
from quickmaths.grading import grade_answer
from quickmaths.graph_engine import GraphError, build_graph
from quickmaths.models import ProblemTemplate, Skill
from quickmaths.problem_generator import GenerationError, generate_problem

SUPPORTED_VARIABLE_TYPES = {"int", "decimal", "fraction", "choice"}
SUPPORTED_TEMPLATE_TYPES = {"generated", "fixed"}
SUPPORTED_ANSWER_MODES = {
    "final_only",
    "final_plus_optional_work",
    "final_plus_required_work",
    "structured_steps",
    "proof_required",
}
SUPPORTED_WORK_MODES = {"none", "optional", "required", "structured", "capture_only", "procedural_steps", "proof_obligations", "rubric_check"}
SUPPORTED_WORK_GRADING = {"not_graded", "tutor_review", "self_review"}
SUPPORTED_WORK_REVIEW = {"optional", "none", "auto", "tutor_required", "self_review"}
SUPPORTED_SCHEMA_VERSIONS = {"0.2"}
STABLE_REVIEW_ID = re.compile(r"^[A-Za-z][A-Za-z0-9_.:-]*$")


@dataclass(frozen=True)
class ValidationIssue:
    severity: str
    message: str
    skill_id: str | None = None
    question_id: str | None = None
    source_path: str | None = None


@dataclass
class ValidationReport:
    errors: list[ValidationIssue] = field(default_factory=list)
    warnings: list[ValidationIssue] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors

    def add_error(
        self,
        message: str,
        skill: Skill | None = None,
        question: ProblemTemplate | None = None,
        source_path: str | None = None,
    ) -> None:
        self.errors.append(_issue("error", message, skill, question, source_path))

    def add_warning(
        self,
        message: str,
        skill: Skill | None = None,
        question: ProblemTemplate | None = None,
        source_path: str | None = None,
    ) -> None:
        self.warnings.append(_issue("warning", message, skill, question, source_path))

    def lines(self) -> list[str]:
        lines: list[str] = []
        for issue in self.errors + self.warnings:
            parts = [issue.severity.upper()]
            if issue.skill_id:
                parts.append(issue.skill_id)
            if issue.question_id:
                parts.append(issue.question_id)
            if issue.source_path:
                parts.append(issue.source_path)
            lines.append(" | ".join(parts) + f": {issue.message}")
        if not lines:
            lines.append("OK: content validation passed")
        return lines


def validate_curriculum(track_dir: Path = DEFAULT_TRACK_DIR, dry_run_generated: bool = True, include_drafts: bool = False) -> ValidationReport:
    report = ValidationReport()
    try:
        track, skills, loader_warnings = load_curriculum(track_dir, include_drafts=include_drafts)
    except ContentError as exc:
        report.add_error(str(exc), source_path=str(track_dir))
        return report

    for warning in loader_warnings:
        report.add_warning(warning)

    if track.schema_version not in SUPPORTED_SCHEMA_VERSIONS:
        report.add_error(f"Unsupported track schema_version '{track.schema_version}'")
    for skill_id in track.skills:
        if skill_id in skills and skills[skill_id].draft:
            report.add_error(f"Draft skill '{skill_id}' should not be listed in track.yaml", skills[skill_id])

    try:
        build_graph(skills)
    except GraphError as exc:
        report.add_error(str(exc))

    _validate_track_skill_order(track.skills, skills, report)
    for skill in skills.values():
        _validate_skill(skill, skills, report, dry_run_generated)
    return report


def validate_default_content() -> list[str]:
    report = validate_curriculum()
    if report.errors:
        raise ContentError("\n".join(report.lines()))
    return [issue.message for issue in report.warnings]


def _validate_track_skill_order(track_skill_ids: list[str], skills: dict[str, Skill], report: ValidationReport) -> None:
    seen: set[str] = set()
    for skill_id in track_skill_ids:
        if skill_id in seen:
            report.add_error(f"track.yaml lists skill '{skill_id}' more than once")
        seen.add(skill_id)
    for skill_id, skill in skills.items():
        if skill_id not in seen and not skill.draft:
            report.add_warning(f"Skill '{skill_id}' exists as YAML but is not listed in track.yaml")


def _validate_skill(skill: Skill, skills: dict[str, Skill], report: ValidationReport, dry_run_generated: bool) -> None:
    if skill.schema_version not in SUPPORTED_SCHEMA_VERSIONS:
        report.add_error(f"Unsupported skill schema_version '{skill.schema_version}'", skill)
    if skill.deprecated and not skill.replacement_skill_id:
        report.add_warning("Deprecated skill should declare replacement_skill_id", skill)
    if skill.replacement_skill_id and skill.replacement_skill_id not in skills:
        report.add_warning(f"replacement_skill_id '{skill.replacement_skill_id}' is not a loaded skill", skill)
    if not skill.test.questions:
        report.add_error("Skill has no test questions", skill)
        return
    if skill.test.question_count < 1:
        report.add_error("test.question_count must be at least 1", skill)

    question_ids: set[str] = set()
    for question in skill.test.questions:
        if question.id in question_ids:
            report.add_error(f"Duplicate question id '{question.id}' in this skill", skill, question)
        question_ids.add(question.id)
        _validate_question(skill, question, report, dry_run_generated)

    for unlock_id in skill.unlocks:
        if unlock_id not in skills:
            report.add_warning(f"Unlock target '{unlock_id}' is not a loaded skill", skill)


def _validate_question(skill: Skill, question: ProblemTemplate, report: ValidationReport, dry_run_generated: bool) -> None:
    if question.type not in SUPPORTED_TEMPLATE_TYPES:
        report.add_error(f"Unsupported question type '{question.type}'", skill, question)
        return
    if not question.prompt_template.strip():
        report.add_error("Question prompt/prompt_template is required", skill, question)
    if not question.answer:
        report.add_error("Question answer block is required", skill, question)
    if "value" not in question.answer:
        report.add_error("answer.value is required", skill, question)
    method = question.grading.get("method")
    if method not in SUPPORTED_GRADING_METHODS:
        report.add_error(f"Unsupported grading method '{method}'", skill, question)
    if method == "equation_solution" and not question.answer.get("variable"):
        report.add_error("equation_solution answers must declare answer.variable", skill, question)
    if method == "numeric_with_tolerance" and "tolerance" not in question.grading:
        report.add_warning("numeric_with_tolerance should declare grading.tolerance", skill, question)
    if question.answer_mode not in SUPPORTED_ANSWER_MODES:
        report.add_error(f"Unsupported answer_mode '{question.answer_mode}'", skill, question)
    _validate_work_block(skill, question, report)

    if question.type == "generated":
        _validate_variables(skill, question, report)
        if question.max_attempts < 1:
            report.add_error("max_attempts must be at least 1", skill, question)

    if dry_run_generated and not any(issue.question_id == question.id and issue.severity == "error" for issue in report.errors):
        _dry_run_question(skill, question, report)


def _validate_variables(skill: Skill, question: ProblemTemplate, report: ValidationReport) -> None:
    for name, rule in question.variables.items():
        kind = rule.get("type")
        if kind not in SUPPORTED_VARIABLE_TYPES:
            report.add_error(f"Variable '{name}' has unsupported type '{kind}'", skill, question)
            continue
        try:
            if kind == "int":
                int(rule["min"])
                int(rule["max"])
                if int(rule["min"]) > int(rule["max"]):
                    report.add_error(f"Variable '{name}' min must be <= max", skill, question)
            elif kind == "decimal":
                float(rule["min"])
                float(rule["max"])
                if float(rule["min"]) > float(rule["max"]):
                    report.add_error(f"Variable '{name}' min must be <= max", skill, question)
            elif kind == "fraction":
                int(rule["numerator_min"])
                int(rule["numerator_max"])
                int(rule["denominator_min"])
                int(rule["denominator_max"])
                if int(rule["denominator_min"]) <= 0:
                    report.add_error(f"Variable '{name}' denominator_min must be positive", skill, question)
            elif kind == "choice" and not rule.get("values"):
                report.add_error(f"Variable '{name}' choice values must not be empty", skill, question)
        except KeyError as exc:
            report.add_error(f"Variable '{name}' is missing required field '{exc.args[0]}'", skill, question)
        except (TypeError, ValueError) as exc:
            report.add_error(f"Variable '{name}' has invalid bounds: {exc}", skill, question)


def _validate_work_block(skill: Skill, question: ProblemTemplate, report: ValidationReport) -> None:
    mode = question.work.get("mode", "none") if question.work else "none"
    grading = question.work.get("grading", "not_graded")
    if mode not in SUPPORTED_WORK_MODES:
        report.add_error(f"Unsupported work.mode '{mode}'", skill, question)
    if grading not in SUPPORTED_WORK_GRADING:
        report.add_error(f"Unsupported work.grading '{grading}'", skill, question)
    if question.answer_mode in {"final_plus_required_work", "structured_steps", "proof_required"} and mode == "none":
        report.add_error("answer_mode requires work, but work.mode is none", skill, question)
    review_policy = question.review_policy or {}
    work_review = review_policy.get("work_review", "optional")
    if work_review not in SUPPORTED_WORK_REVIEW:
        report.add_error(f"Unsupported review_policy.work_review '{work_review}'", skill, question)
    if review_policy.get("mastery_requires_review_pass") and work_review not in {"tutor_required", "self_review"}:
        report.add_error("mastery_requires_review_pass requires tutor_required or self_review", skill, question)
    if work_review == "auto" and mode not in {"procedural_steps", "none"}:
        report.add_error(f"review_policy.work_review auto has no checker for work.mode '{mode}'", skill, question)
    if mode in {"optional", "required", "structured", "capture_only", "procedural_steps", "proof_obligations", "rubric_check"} and not str(question.work.get("prompt", "")).strip():
        report.add_warning("work.prompt should be set when work is shown to learners", skill, question)
    if mode == "procedural_steps":
        _validate_procedural_work(skill, question, report)
    elif mode == "proof_obligations":
        _validate_proof_obligations(skill, question, report)
    elif mode == "rubric_check":
        _validate_rubric(skill, question, report)


def _validate_procedural_work(skill: Skill, question: ProblemTemplate, report: ValidationReport) -> None:
    line_type = question.work.get("line_type")
    if line_type not in {"expression", "equation", "inequality"}:
        report.add_error("work.line_type must be expression, equation, or inequality for procedural_steps", skill, question)
    try:
        if int(question.work.get("minimum_steps", 0)) < 0:
            report.add_error("work.minimum_steps must be non-negative", skill, question)
    except (TypeError, ValueError):
        report.add_error("work.minimum_steps must be an integer", skill, question)


def _validate_proof_obligations(skill: Skill, question: ProblemTemplate, report: ValidationReport) -> None:
    proof_policy = question.work.get("proof_policy")
    if not proof_policy:
        report.add_error("work.proof_policy is required for proof_obligations", skill, question)
        return
    strategies = proof_policy.get("accepted_strategies", [])
    if not strategies:
        report.add_error("proof_policy.accepted_strategies must not be empty", skill, question)
        return
    for strategy in strategies:
        ids: set[str] = set()
        dependency_edges: dict[str, list[str]] = {}
        for section in ("assumptions_required", "required_obligations"):
            for item in strategy.get(section, []):
                item_id = item.get("id")
                if not item_id:
                    report.add_error(f"{section} item is missing id", skill, question)
                    continue
                if not STABLE_REVIEW_ID.match(str(item_id)):
                    report.add_error(f"Proof obligation id '{item_id}' is not stable for stored review JSON", skill, question)
                if item_id in ids:
                    report.add_error(f"Duplicate proof obligation id '{item_id}'", skill, question)
                ids.add(item_id)
                dependency_edges[item_id] = list(item.get("depends_on", []))
        for item_id, dependencies in dependency_edges.items():
            for dependency in dependencies:
                if dependency not in ids:
                    report.add_error(f"Proof obligation '{item_id}' depends on unknown id '{dependency}'", skill, question)
        if _has_cycle(dependency_edges):
            report.add_error("Proof obligation dependency cycle detected", skill, question)


def _validate_rubric(skill: Skill, question: ProblemTemplate, report: ValidationReport) -> None:
    rubric = question.work.get("rubric")
    if not rubric or not rubric.get("criteria"):
        report.add_error("work.rubric.criteria is required for rubric_check", skill, question)
        return
    total = 0.0
    ids: set[str] = set()
    for criterion in rubric["criteria"]:
        criterion_id = criterion.get("id")
        if not criterion_id:
            report.add_error("Rubric criterion is missing id", skill, question)
        elif not STABLE_REVIEW_ID.match(str(criterion_id)):
            report.add_error(f"Rubric criterion id '{criterion_id}' is not stable for stored review JSON", skill, question)
        elif criterion_id in ids:
            report.add_error(f"Duplicate rubric criterion id '{criterion_id}'", skill, question)
        if criterion_id:
            ids.add(str(criterion_id))
        try:
            points = float(criterion.get("points", 0))
        except (TypeError, ValueError):
            report.add_error("Rubric criterion points must be numeric", skill, question)
            continue
        if points <= 0:
            report.add_error("Rubric criterion points must be positive", skill, question)
        total += points
    max_points = float(rubric.get("max_points", total))
    if abs(max_points - total) > 0.001:
        report.add_error("rubric.max_points must match total criterion points for now", skill, question)


def _has_cycle(edges: dict[str, list[str]]) -> bool:
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node: str) -> bool:
        if node in visiting:
            return True
        if node in visited:
            return False
        visiting.add(node)
        for dependency in edges.get(node, []):
            if visit(dependency):
                return True
        visiting.remove(node)
        visited.add(node)
        return False

    return any(visit(node) for node in edges)


def _dry_run_question(skill: Skill, question: ProblemTemplate, report: ValidationReport) -> None:
    try:
        instance = generate_problem(skill.id, question, seed=17)
    except GenerationError as exc:
        report.add_error(f"Could not generate sample problem: {exc}", skill, question)
        return
    result = grade_answer(instance, instance.expected_answer)
    if not result.is_correct:
        report.add_error(
            f"Generated expected answer does not grade as correct with method '{instance.grading_method}': {result.message}",
            skill,
            question,
        )


def _issue(
    severity: str,
    message: str,
    skill: Skill | None,
    question: ProblemTemplate | None,
    source_path: str | None,
) -> ValidationIssue:
    return ValidationIssue(
        severity=severity,
        message=message,
        skill_id=skill.id if skill else None,
        question_id=question.id if question else None,
        source_path=source_path or (skill.source_path if skill else None),
    )
