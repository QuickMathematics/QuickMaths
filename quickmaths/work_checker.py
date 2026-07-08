from __future__ import annotations

import re

from quickmaths.math_syntax import equations_equivalent_solution_set, expressions_equivalent
from quickmaths.models import ProblemInstance, UserResponse, WorkCheckResult


def check_work(instance: ProblemInstance, response: UserResponse) -> WorkCheckResult:
    mode = work_mode(instance)
    review_policy = work_review_policy(instance)
    required = work_required(instance)
    work_text = response.work_text.strip()

    if mode == "none":
        return WorkCheckResult("not_required", "none", review_policy, score=None)
    if required and not work_text:
        return WorkCheckResult("incomplete", mode, review_policy, score=0.0, messages=["Required work was not submitted."])
    if mode == "capture_only":
        status = "pending_review" if review_policy in {"tutor_required", "self_review"} else "not_required"
        return WorkCheckResult(status, mode, review_policy, score=None)
    if mode == "procedural_steps":
        if review_policy not in {"auto", "optional", "none"}:
            return WorkCheckResult("pending_review", mode, review_policy, score=None)
        return _check_procedural_steps(instance, work_text)
    if mode == "proof_obligations":
        return _check_proof_obligations(instance, work_text, review_policy)
    if mode == "rubric_check":
        return _check_rubric(instance, work_text, review_policy)
    return WorkCheckResult("uncertain", mode, review_policy, messages=[f"Unsupported work mode '{mode}'."])


def work_mode(instance: ProblemInstance) -> str:
    mode = str(instance.work.get("mode", "none") if instance.work else "none")
    if mode in {"optional", "required", "structured"}:
        return "capture_only" if mode != "structured" else "procedural_steps"
    return mode


def work_required(instance: ProblemInstance) -> bool:
    raw_mode = str(instance.work.get("mode", "none") if instance.work else "none")
    return raw_mode in {"required", "structured", "procedural_steps", "proof_obligations", "rubric_check"} or instance.answer_mode in {
        "final_plus_required_work",
        "structured_steps",
        "proof_required",
    }


def work_review_policy(instance: ProblemInstance) -> str:
    return str(instance.review_policy.get("work_review", instance.work.get("grading", "optional") if instance.work else "optional"))


def mastery_requires_review_pass(instance: ProblemInstance) -> bool:
    return bool(instance.review_policy.get("mastery_requires_review_pass", False))


def review_required(instance: ProblemInstance) -> bool:
    return mastery_requires_review_pass(instance) or work_review_policy(instance) in {"tutor_required", "self_review"}


def _check_procedural_steps(instance: ProblemInstance, work_text: str) -> WorkCheckResult:
    lines = _work_lines(work_text)
    minimum_steps = int(instance.work.get("minimum_steps", 1))
    if len(lines) < minimum_steps:
        return WorkCheckResult(
            "incomplete",
            "procedural_steps",
            "auto",
            score=0.0,
            messages=[f"Expected at least {minimum_steps} non-empty work line(s)."],
        )
    line_type = instance.work.get("line_type", "expression")
    if line_type == "expression":
        return _check_expression_steps(instance, lines)
    if line_type == "equation":
        return _check_equation_steps(instance, lines)
    return WorkCheckResult("uncertain", "procedural_steps", "auto", messages=[f"Unsupported line_type '{line_type}'."])


def _check_expression_steps(instance: ProblemInstance, lines: list[str]) -> WorkCheckResult:
    for index, (previous, current) in enumerate(zip(lines, lines[1:]), start=2):
        equivalent = expressions_equivalent(previous, current)
        if equivalent is None:
            return WorkCheckResult("uncertain", "procedural_steps", "auto", failed_step_index=index)
        if not equivalent:
            return WorkCheckResult(
                "incorrect",
                "procedural_steps",
                "auto",
                score=0.0,
                messages=[f"Line {index} is not equivalent to the previous line."],
                failed_step_index=index,
            )
    if instance.work.get("require_final_answer_match", False):
        equivalent = expressions_equivalent(lines[-1], instance.expected_answer)
        if equivalent is None:
            return WorkCheckResult("uncertain", "procedural_steps", "auto", messages=["Could not compare final work line."])
        if not equivalent:
            return WorkCheckResult("incorrect", "procedural_steps", "auto", score=0.0, messages=["Final work line does not match expected answer."])
    return WorkCheckResult("correct", "procedural_steps", "auto", score=1.0, messages=["Procedural work is equivalent step to step."])


def _check_equation_steps(instance: ProblemInstance, lines: list[str]) -> WorkCheckResult:
    variable = str(instance.work.get("target_variable") or instance.variable or "x")
    for index, (previous, current) in enumerate(zip(lines, lines[1:]), start=2):
        equivalent = equations_equivalent_solution_set(previous, current, variable)
        if equivalent is None:
            return WorkCheckResult("uncertain", "procedural_steps", "auto", failed_step_index=index)
        if not equivalent:
            return WorkCheckResult(
                "incorrect",
                "procedural_steps",
                "auto",
                score=0.0,
                messages=[f"Line {index} does not preserve the solution set."],
                failed_step_index=index,
            )
    if instance.work.get("require_final_answer_match", False):
        final_equation = lines[-1] if "=" in lines[-1] else f"{variable} = {lines[-1]}"
        expected_equation = f"{variable} = {instance.expected_answer}"
        equivalent = equations_equivalent_solution_set(final_equation, expected_equation, variable)
        if equivalent is None:
            return WorkCheckResult("uncertain", "procedural_steps", "auto", messages=["Could not compare final equation."])
        if not equivalent:
            return WorkCheckResult("incorrect", "procedural_steps", "auto", score=0.0, messages=["Final work line does not match expected answer."])
    return WorkCheckResult("correct", "procedural_steps", "auto", score=1.0, messages=["Equation steps preserve the solution set."])


def _check_proof_obligations(instance: ProblemInstance, work_text: str, review_policy: str) -> WorkCheckResult:
    obligations = _proof_obligation_ids(instance)
    detected = [obligation for obligation in obligations if f"[{obligation}]" in work_text]
    missing = [obligation for obligation in obligations if obligation not in detected]
    status = "pending_review" if review_policy in {"tutor_required", "self_review"} else "uncertain"
    return WorkCheckResult(
        status,
        "proof_obligations",
        review_policy,
        score=None,
        messages=["Proof obligations require tutor/self review."],
        detected_obligations=detected,
        missing_obligations=missing,
    )


def _check_rubric(instance: ProblemInstance, work_text: str, review_policy: str) -> WorkCheckResult:
    status = "pending_review" if review_policy in {"tutor_required", "self_review"} else "uncertain"
    return WorkCheckResult(status, "rubric_check", review_policy, score=None, messages=["Rubric work requires review."])


def _proof_obligation_ids(instance: ProblemInstance) -> list[str]:
    policy = instance.work.get("proof_policy", {})
    obligations: list[str] = []
    for strategy in policy.get("accepted_strategies", []):
        for item in strategy.get("assumptions_required", []):
            obligations.append(item["id"])
        for item in strategy.get("required_obligations", []):
            obligations.append(item["id"])
    return obligations


def _work_lines(work_text: str) -> list[str]:
    return [line.strip() for line in re.split(r"[\r\n]+", work_text) if line.strip()]
