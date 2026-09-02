from __future__ import annotations

from decimal import Decimal

from quickmaths.math_syntax import (
    accepted_text_match,
    equation_solution_equal,
    finite_set_equal,
    inequality_solution_equal,
    interval_set_equal,
    numeric_equal,
    numeric_with_tolerance,
    rational_expression_equal,
    symbolic_equal,
)
from quickmaths.models import FinalAnswerGrade, GradingResult, ProblemInstance, UserResponse
from quickmaths.utils import normalize_spaces
from quickmaths.work_checker import check_work


def grade_attempt(instances: list[ProblemInstance], user_answers: list[str | UserResponse]) -> list[GradingResult]:
    results: list[GradingResult] = []
    for instance, answer in zip(instances, user_answers):
        results.append(grade_answer(instance, answer))
    return results


def grade_answer(instance: ProblemInstance, user_answer: str | UserResponse) -> GradingResult:
    response = coerce_user_response(user_answer, instance)
    method = instance.grading_method
    expected = instance.expected_answer
    user = response.final_answer or ""
    work_check = check_work(instance, response)
    work_status = _legacy_work_review_status(work_check.status)
    try:
        if method == "exact_text":
            correct = _normalize_text(expected) == _normalize_text(user)
        elif method == "exact_numeric":
            correct = numeric_equal(expected, user)
        elif method == "numeric_with_tolerance":
            tolerance = Decimal(str(instance.tolerance if instance.tolerance is not None else 0.001))
            correct = numeric_with_tolerance(expected, user, tolerance)
        elif method == "multiple_choice":
            correct = normalize_spaces(expected) == normalize_spaces(user)
        elif method == "symbolic_expression":
            correct = symbolic_equal(expected, user)
        elif method == "equation_solution":
            correct = equation_solution_equal(expected, user, instance.variable or "x")
        elif method == "inequality_solution":
            variable = str(instance.variable or instance.work.get("target_variable") or "x")
            correct = inequality_solution_equal(expected, user, variable)
        elif method == "finite_set":
            values = list(instance.answer_metadata.get("values", []))
            correct = finite_set_equal(values, user, str(instance.variable or instance.answer_metadata.get("variable") or "x"))
        elif method == "rational_expression":
            structured = response.structured_work_json or {}
            excluded_values = structured.get("excluded_values", "")
            correct = rational_expression_equal(
                expected,
                list(instance.answer_metadata.get("excluded_values", [])),
                user,
                excluded_values,
                variable=str(instance.variable or instance.answer_metadata.get("variable") or "x"),
                require_reduced_form=bool(instance.grading_metadata.get("require_reduced_form", False)),
            )
        elif method == "interval_set":
            correct = interval_set_equal(expected, user, str(instance.variable or instance.answer_metadata.get("variable") or "x"))
        elif method == "theorem_conclusion":
            accepted = instance.accepted_forms or [expected]
            correct = accepted_text_match(user, accepted)
        else:
            return GradingResult(
                instance.template_id,
                user,
                expected,
                False,
                method,
                f"Unsupported grading method: {method}",
                response.work,
                work_status,
                FinalAnswerGrade("uncertain", 0.0, method, [f"Unsupported grading method: {method}"]),
                work_check,
            )
    except Exception as exc:
        return GradingResult(
            instance.template_id,
            user,
            expected,
            False,
            method,
            f"Could not grade answer: {exc}",
            response.work,
            work_status,
            FinalAnswerGrade("uncertain", 0.0, method, [f"Could not grade answer: {exc}"]),
            work_check,
        )
    final_grade = FinalAnswerGrade("correct" if correct else "incorrect", 1.0 if correct else 0.0, method, [])
    return GradingResult(instance.template_id, user, expected, correct, method, "", response.work, work_status, final_grade, work_check)


def coerce_user_response(user_answer: str | UserResponse, instance: ProblemInstance | None = None) -> UserResponse:
    if isinstance(user_answer, UserResponse):
        return user_answer
    return UserResponse(
        question_id=instance.template_id if instance else "",
        final_answer=user_answer or "",
        answer_mode=instance.answer_mode if instance else "final_only",
    )


def work_mode(instance: ProblemInstance) -> str:
    if instance.work:
        mode = str(instance.work.get("mode", "none"))
        if mode in {"procedural_steps", "proof_obligations", "rubric_check", "capture_only", "rational_equation_steps", "sign_chart_steps"}:
            return mode
        return {"optional": "optional", "required": "required", "structured": "structured"}.get(mode, mode)
    if instance.answer_mode == "final_plus_optional_work":
        return "optional"
    if instance.answer_mode in {"final_plus_required_work", "structured_steps", "proof_required"}:
        return "required"
    return "none"


def work_review_status(instance: ProblemInstance, response: UserResponse) -> str:
    return _legacy_work_review_status(check_work(instance, response).status)


def required_work_missing(instances: list[ProblemInstance], responses: list[UserResponse]) -> list[int]:
    missing = []
    for index, (instance, response) in enumerate(zip(instances, responses), start=1):
        if check_work(instance, response).status == "incomplete":
            missing.append(index)
    return missing


def _normalize_text(value: str) -> str:
    return normalize_spaces(value).casefold()


def _legacy_work_review_status(status: str) -> str:
    if status == "incomplete":
        return "missing_required_work"
    if status == "pending_review":
        return "submitted_for_tutor_review"
    return "not_required"
