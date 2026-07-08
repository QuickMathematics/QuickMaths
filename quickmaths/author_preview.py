from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable

from quickmaths.grading import grade_answer
from quickmaths.utils import display_math
from quickmaths.models import ProblemInstance, ProblemTemplate, Skill
from quickmaths.problem_generator import generate_problem


UGLY_PATTERN_RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("contains '+ -'", re.compile(r"\+\s+-")),
    ("contains '1x'", re.compile(r"(?<![\w.])1x\b")),
    ("contains '-1x'", re.compile(r"(?<![\w.])-1x\b")),
)


@dataclass(frozen=True)
class PreviewSample:
    template_id: str
    sample_number: int
    seed: int
    instance: ProblemInstance | None = None
    generation_error: str = ""
    expected_answer_correct: bool = False
    grading_message: str = ""
    ugly_warnings: list[str] = field(default_factory=list)


def generated_templates(skill: Skill) -> list[ProblemTemplate]:
    return [template for template in skill.test.questions if template.type == "generated"]


def skill_metadata(skill: Skill) -> dict[str, object]:
    return {
        "id": skill.id,
        "name": skill.name,
        "prerequisites": list(skill.prerequisites),
        "unlocks": list(skill.unlocks),
        "question_count": skill.test.question_count,
        "template_count": len(skill.test.questions),
        "generated_template_count": len(generated_templates(skill)),
    }


def generate_preview_samples(skill: Skill, sample_count: int = 10, base_seed: int = 1) -> list[PreviewSample]:
    samples: list[PreviewSample] = []
    for template_index, template in enumerate(generated_templates(skill), start=1):
        for sample_number in range(1, sample_count + 1):
            seed = base_seed + template_index * 1_000_003 + sample_number
            try:
                instance = generate_problem(skill.id, template, seed)
                grade = grade_answer(instance, instance.expected_answer)
                samples.append(
                    PreviewSample(
                        template_id=template.id,
                        sample_number=sample_number,
                        seed=seed,
                        instance=instance,
                        expected_answer_correct=grade.is_correct,
                        grading_message=grade.message,
                        ugly_warnings=find_ugly_math_patterns(instance.prompt),
                    )
                )
            except Exception as exc:
                samples.append(
                    PreviewSample(
                        template_id=template.id,
                        sample_number=sample_number,
                        seed=seed,
                        generation_error=f"{type(exc).__name__}: {exc}",
                    )
                )
    return samples


def find_ugly_math_patterns(text: str, allowed_patterns: Iterable[str] = ()) -> list[str]:
    allowed = set(allowed_patterns)
    warnings: list[str] = []
    for label, pattern in UGLY_PATTERN_RULES:
        if label not in allowed and pattern.search(text):
            warnings.append(label)
    return warnings


def samples_to_markdown(skill: Skill, samples: list[PreviewSample]) -> str:
    metadata = skill_metadata(skill)
    lines = [
        f"# Author Preview: {skill.name}",
        "",
        "## Metadata",
        f"- ID: {metadata['id']}",
        f"- Prerequisites: {_join_or_none(metadata['prerequisites'])}",
        f"- Unlocks: {_join_or_none(metadata['unlocks'])}",
        f"- Question count: {metadata['question_count']}",
        f"- Generated templates: {metadata['generated_template_count']}",
        "",
    ]
    current_template = None
    for sample in samples:
        if sample.template_id != current_template:
            current_template = sample.template_id
            lines.extend([f"## Template {sample.template_id}", ""])
        lines.extend([f"### Sample {sample.sample_number}", f"- Seed: {sample.seed}"])
        if sample.generation_error:
            lines.extend([f"- Generation failure: {sample.generation_error}", ""])
            continue
        instance = sample.instance
        if instance is None:
            lines.extend(["- Generation failure: missing generated instance", ""])
            continue
        lines.extend(
            [
                f"- Prompt: {display_math(instance.prompt)}",
                f"- Values: {instance.values}",
                f"- Expected answer: {display_math(instance.expected_answer)}",
                f"- Expected answer grades correct: {sample.expected_answer_correct}",
                f"- Grading method: {instance.grading_method}",
                f"- Work mode: {instance.work.get('mode', 'none') if instance.work else 'none'}",
                f"- Review policy: {instance.review_policy or {}}",
                f"- Ugly prompt warnings: {_join_or_none(sample.ugly_warnings)}",
                "- Solution / explanation:",
            ]
        )
        lines.extend([f"  - {display_math(step)}" for step in instance.solution_steps] or ["  - None"])
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def _join_or_none(values: object) -> str:
    if isinstance(values, list):
        return ", ".join(str(value) for value in values) if values else "none"
    return str(values)
