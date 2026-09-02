from __future__ import annotations

import random
from copy import deepcopy
from fractions import Fraction

from quickmaths.math_syntax import equation_text_from_prompt, rational_equation_restrictions
from quickmaths.models import ProblemInstance, ProblemTemplate, Skill
from quickmaths.utils import SafeExpressionError, render_template, safe_eval, stringify_value


class GenerationError(ValueError):
    pass


def generate_test(skill: Skill, seed: int | None = None) -> list[ProblemInstance]:
    seed = seed if seed is not None else random.randint(1, 2_000_000_000)
    rng = random.Random(seed)
    templates = list(skill.test.questions)
    if not templates:
        raise GenerationError(f"{skill.id}: skill has no test questions")
    if skill.test.randomize_order:
        rng.shuffle(templates)
    selected = []
    while len(selected) < skill.test.question_count:
        selected.append(templates[len(selected) % len(templates)])
    instances: list[ProblemInstance] = []
    for template in selected:
        problem_seed = rng.randint(1, 2_000_000_000)
        instances.append(generate_problem(skill.id, template, problem_seed))
    return instances


def generate_problem(skill_id: str, template: ProblemTemplate, seed: int, max_attempts: int | None = None) -> ProblemInstance:
    if template.type == "fixed":
        return _fixed_problem(skill_id, template, seed)
    max_attempts = max_attempts or template.max_attempts
    rng = random.Random(seed)
    for _ in range(max_attempts):
        values = _generate_values(template.variables, rng)
        try:
            for name, expression in template.derived.items():
                values[name] = safe_eval(expression, values)
            if not all(bool(safe_eval(constraint, values)) for constraint in template.constraints):
                continue
            return _build_instance(skill_id, template, seed, values)
        except (SafeExpressionError, ZeroDivisionError):
            continue
    raise GenerationError(f"{skill_id}/{template.id}: could not generate a valid problem after {max_attempts} attempts")


def _generate_values(rules: dict[str, dict], rng: random.Random) -> dict[str, object]:
    values: dict[str, object] = {}
    for name, rule in rules.items():
        kind = rule.get("type")
        exclude = set(rule.get("exclude", []))
        if kind == "int":
            candidates = [value for value in range(int(rule["min"]), int(rule["max"]) + 1) if value not in exclude]
            if not candidates:
                raise GenerationError(f"Variable '{name}' has no valid integer candidates")
            values[name] = rng.choice(candidates)
        elif kind == "decimal":
            places = int(rule.get("places", 1))
            scale = 10**places
            low = int(round(float(rule["min"]) * scale))
            high = int(round(float(rule["max"]) * scale))
            candidates = [value / scale for value in range(low, high + 1) if value / scale not in exclude]
            if not candidates:
                raise GenerationError(f"Variable '{name}' has no valid decimal candidates")
            values[name] = rng.choice(candidates)
        elif kind == "fraction":
            candidates: list[Fraction] = []
            for numerator in range(int(rule["numerator_min"]), int(rule["numerator_max"]) + 1):
                if rule.get("exclude_zero_numerator") and numerator == 0:
                    continue
                for denominator in range(int(rule["denominator_min"]), int(rule["denominator_max"]) + 1):
                    if denominator == 0:
                        continue
                    fraction = Fraction(numerator, denominator) if rule.get("simplify", True) else Fraction(numerator, denominator)
                    if stringify_value(fraction) not in exclude and fraction not in exclude:
                        candidates.append(fraction)
            if not candidates:
                raise GenerationError(f"Variable '{name}' has no valid fraction candidates")
            values[name] = rng.choice(candidates)
        elif kind == "choice":
            candidates = [value for value in rule.get("values", []) if value not in exclude]
            if not candidates:
                raise GenerationError(f"Variable '{name}' has no valid choices")
            values[name] = rng.choice(candidates)
        else:
            raise GenerationError(f"Variable '{name}' has unsupported type '{kind}'")
    return values


def _build_instance(skill_id: str, template: ProblemTemplate, seed: int, values: dict[str, object]) -> ProblemInstance:
    answer = _render_nested(template.answer, values)
    expected = _expected_answer_text(answer)
    prompt = render_template(template.prompt_template, values)
    work = _enrich_structured_work(_render_nested(template.work, values), prompt)
    solution_steps = [render_template(str(step), values) for step in template.solution_steps]
    if template.explanation_template:
        solution_steps = [line.strip() for line in render_template(template.explanation_template, values).splitlines() if line.strip()]
    return ProblemInstance(
        template_id=template.id,
        skill_id=skill_id,
        seed=seed,
        difficulty=template.difficulty,
        values={key: stringify_value(value) for key, value in values.items()},
        prompt=prompt,
        expected_answer=expected,
        answer_type=answer.get("type", "text"),
        grading_method=template.grading.get("method", "exact_text"),
        solution_steps=solution_steps,
        mistake_tags=list(template.mistake_tags),
        variable=answer.get("variable"),
        tolerance=template.grading.get("tolerance"),
        options=_render_options(template.options, values),
        answer_mode=template.answer_mode,
        work=work,
        review_policy=_render_nested(template.review_policy, values),
        accepted_forms=list(answer.get("accepted_forms", template.grading.get("accepted_forms", []))),
        answer_metadata=deepcopy(answer),
        grading_metadata=deepcopy(template.grading),
    )


def _fixed_problem(skill_id: str, template: ProblemTemplate, seed: int) -> ProblemInstance:
    answer = _render_nested(template.answer, {})
    work = _enrich_structured_work(_render_nested(template.work, {}), template.prompt_template)
    return ProblemInstance(
        template_id=template.id,
        skill_id=skill_id,
        seed=seed,
        difficulty=template.difficulty,
        values={},
        prompt=template.prompt_template,
        expected_answer=_expected_answer_text(answer),
        answer_type=answer.get("type", "text"),
        grading_method=template.grading.get("method", "exact_text"),
        solution_steps=template.solution_steps or ([template.explanation_template] if template.explanation_template else []),
        mistake_tags=list(template.mistake_tags),
        variable=answer.get("variable"),
        tolerance=template.grading.get("tolerance"),
        options=deepcopy(template.options),
        answer_mode=template.answer_mode,
        work=work,
        review_policy=_render_nested(template.review_policy, {}),
        accepted_forms=list(answer.get("accepted_forms", template.grading.get("accepted_forms", []))),
        answer_metadata=deepcopy(answer),
        grading_metadata=deepcopy(template.grading),
    )


def _render_options(options: list[dict], values: dict[str, object]) -> list[dict]:
    rendered_options = deepcopy(options)
    for option in rendered_options:
        if "label" in option:
            option["label"] = render_template(str(option["label"]), values)
    return rendered_options


def _enrich_structured_work(work: dict, prompt: str) -> dict:
    """Attach deterministic native-only metadata used by structured checkers."""
    enriched = deepcopy(work)
    if enriched.get("mode") != "rational_equation_steps":
        return enriched
    variable = str(enriched.get("target_variable") or "x")
    enriched.setdefault("original_equation", equation_text_from_prompt(prompt))
    try:
        restrictions = rational_equation_restrictions(prompt, variable)
        if getattr(restrictions, "is_FiniteSet", False):
            enriched.setdefault("expected_restrictions", [str(value) for value in sorted(restrictions, key=str)])
    except Exception:
        # Authoring validation reports malformed equations. Generation remains
        # compatible with older fixed packs that only request captured work.
        pass
    return enriched


def _render_nested(value, values: dict[str, object]):
    """Render trusted native template placeholders at any metadata depth."""
    if isinstance(value, str):
        return render_template(value, values)
    if isinstance(value, list):
        return [_render_nested(item, values) for item in value]
    if isinstance(value, dict):
        return {key: _render_nested(item, values) for key, item in value.items()}
    return deepcopy(value)


def _expected_answer_text(answer: dict) -> str:
    if "value" in answer:
        return str(answer.get("value", ""))
    if answer.get("type") == "finite_set":
        return "{" + ", ".join(str(value) for value in answer.get("values", [])) + "}"
    return ""
