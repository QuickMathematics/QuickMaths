from __future__ import annotations

import re

from sympy import FiniteSet, Interval, N, S, Union, simplify

from quickmaths.math_syntax import (
    equation_solution_set,
    equation_text_from_prompt,
    equations_equivalent_solution_set,
    expressions_equivalent,
    finite_set_equal,
    interval_set_equal,
    inequalities_equivalent_solution_set,
    parse_finite_set,
    parse_expression,
    parse_interval_set,
    rational_equation_restrictions,
)
from quickmaths.models import ProblemInstance, UserResponse, WorkCheckResult


def check_work(instance: ProblemInstance, response: UserResponse) -> WorkCheckResult:
    mode = work_mode(instance)
    review_policy = work_review_policy(instance)
    required = work_required(instance)
    work_text = response.work_text.strip()
    structured = response.structured_work_json or {}

    if mode == "none":
        return WorkCheckResult("not_required", "none", review_policy, score=None)
    if required and not work_text and not structured:
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
    if mode == "rational_equation_steps":
        return _check_rational_equation_steps(instance, response)
    if mode == "sign_chart_steps":
        return _check_sign_chart_steps(instance, response)
    return WorkCheckResult("uncertain", mode, review_policy, messages=[f"Unsupported work mode '{mode}'."])


def work_mode(instance: ProblemInstance) -> str:
    mode = str(instance.work.get("mode", "none") if instance.work else "none")
    if mode in {"optional", "required", "structured"}:
        return "capture_only" if mode != "structured" else "procedural_steps"
    return mode


def work_required(instance: ProblemInstance) -> bool:
    raw_mode = str(instance.work.get("mode", "none") if instance.work else "none")
    return raw_mode in {"required", "structured", "procedural_steps", "proof_obligations", "rubric_check", "rational_equation_steps", "sign_chart_steps"} or instance.answer_mode in {
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
    if line_type == "inequality":
        return _check_inequality_steps(instance, lines)
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


def _check_inequality_steps(instance: ProblemInstance, lines: list[str]) -> WorkCheckResult:
    variable = str(instance.work.get("target_variable") or instance.variable or "x")
    for index, (previous, current) in enumerate(zip(lines, lines[1:]), start=2):
        equivalent = inequalities_equivalent_solution_set(previous, current, variable)
        if equivalent is None:
            return WorkCheckResult("uncertain", "procedural_steps", "auto", failed_step_index=index)
        if not equivalent:
            return WorkCheckResult(
                "incorrect",
                "procedural_steps",
                "auto",
                score=0.0,
                messages=[f"Line {index} does not preserve the inequality solution set."],
                failed_step_index=index,
            )
    if instance.work.get("require_final_answer_match", False):
        equivalent = inequalities_equivalent_solution_set(lines[-1], instance.expected_answer, variable)
        if equivalent is None:
            return WorkCheckResult("uncertain", "procedural_steps", "auto", messages=["Could not compare final inequality."])
        if not equivalent:
            return WorkCheckResult("incorrect", "procedural_steps", "auto", score=0.0, messages=["Final work line does not match expected answer."])
    return WorkCheckResult(
        "correct",
        "procedural_steps",
        "auto",
        score=1.0,
        messages=["Inequality steps preserve the solution set."],
    )


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


def _check_rational_equation_steps(instance: ProblemInstance, response: UserResponse) -> WorkCheckResult:
    data = response.structured_work_json or {}
    messages: list[str] = []
    restrictions = data.get("restrictions", [])
    steps = data.get("steps", [])
    candidates = data.get("candidates", [])
    if isinstance(restrictions, str):
        restrictions = [item.strip() for item in re.split(r"[,;\n]+", restrictions) if item.strip()]
    if isinstance(steps, str):
        steps = _work_lines(steps)
    if not isinstance(candidates, list):
        candidates = []
    variable = str(instance.variable or instance.work.get("target_variable") or "x")
    expected_values = list(instance.answer_metadata.get("values", []))
    expected_set = parse_finite_set(expected_values, variable)
    expected_restrictions = instance.work.get("expected_restrictions")
    if expected_restrictions is None:
        try:
            expected_restriction_set = rational_equation_restrictions(instance.prompt, variable)
            expected_restrictions = [str(item) for item in expected_restriction_set]
        except Exception:
            expected_restriction_set = None
    else:
        expected_restriction_set = parse_finite_set(list(expected_restrictions), variable)
    try:
        submitted_restriction_set = parse_finite_set(list(restrictions), variable)
    except Exception:
        submitted_restriction_set = None
        messages.append("One or more denominator restrictions could not be parsed.")
    if instance.work.get("require_restrictions", False):
        if not restrictions:
            messages.append("List every value excluded by an original denominator.")
        elif expected_restriction_set is not None and submitted_restriction_set != expected_restriction_set:
            messages.append("The original denominator restriction set is incomplete or contains an extra value.")
    minimum_steps = max(1, int(instance.work.get("minimum_steps", 1)))
    if len(steps) < minimum_steps:
        messages.append(f"Show at least {minimum_steps} denominator-clearing or solving step(s).")

    original_text = str(instance.work.get("original_equation") or equation_text_from_prompt(instance.prompt))
    try:
        original_solution_set = equation_solution_set(original_text, variable)
    except Exception:
        original_solution_set = expected_set
    restriction_set = expected_restriction_set if expected_restriction_set is not None else (submitted_restriction_set or S.EmptySet)
    discovered_candidates = S.EmptySet
    step_details: list[dict] = []
    for index, step in enumerate(steps, start=1):
        detail = {"row": index, "status": "correct", "message": ""}
        try:
            solutions = equation_solution_set(str(step), variable)
            allowed = solutions - restriction_set
            if allowed != expected_set:
                detail.update(status="incorrect", message="This step does not preserve the allowed solution set.")
                messages.append(f"Algebra step {index} does not preserve the equation under the original restrictions.")
            if getattr(solutions, "is_FiniteSet", False):
                discovered_candidates = Union(discovered_candidates, solutions)
        except Exception:
            detail.update(status="unparseable", message="Enter one equation per line.")
            messages.append(f"Algebra step {index} could not be parsed as one equation.")
        step_details.append(detail)
    allowed_statuses = {"valid", "excluded", "extraneous", "repeated", "non_real"}
    malformed = [index + 1 for index, row in enumerate(candidates) if not isinstance(row, dict) or not str(row.get("value", "")).strip() or row.get("status") not in allowed_statuses]
    if malformed:
        messages.append(f"Candidate row(s) {', '.join(map(str, malformed))} need a value and classification.")
    valid_values = [str(row.get("value", "")).strip() for row in candidates if isinstance(row, dict) and row.get("status") == "valid"]
    try:
        if not finite_set_equal(expected_values, ",".join(valid_values), variable):
            messages.append("The candidates classified as valid do not match the final solution set.")
    except Exception:
        messages.append("One or more candidate values could not be parsed.")
    candidate_details: list[dict] = []
    parsed_candidate_values = []
    for index, row in enumerate(candidates, start=1):
        if not isinstance(row, dict) or not str(row.get("value", "")).strip():
            continue
        value_text = str(row.get("value", "")).strip()
        detail = {"row": index, "value": value_text, "status": "correct", "expected_classification": ""}
        try:
            value = simplify(parse_expression(value_text, [variable]))
            repeated = any(simplify(value - previous) == 0 for previous in parsed_candidate_values)
            if repeated:
                expected_status = "repeated"
            elif value.is_real is False:
                expected_status = "non_real"
            elif value in restriction_set:
                expected_status = "excluded"
            elif value in original_solution_set:
                expected_status = "valid"
            else:
                expected_status = "extraneous"
            parsed_candidate_values.append(value)
            detail["expected_classification"] = expected_status
            if row.get("status") != expected_status:
                detail["status"] = "incorrect"
                messages.append(f"Candidate row {index} should be classified as {expected_status.replace('_', '-')}.")
        except Exception:
            detail["status"] = "unparseable"
            messages.append(f"Candidate row {index} could not be parsed.")
        candidate_details.append(detail)
    if getattr(discovered_candidates, "is_FiniteSet", False):
        supplied_set = FiniteSet(*parsed_candidate_values)
        if discovered_candidates - supplied_set != S.EmptySet:
            messages.append("The candidate ledger is missing a value produced by the algebra steps.")
    if instance.work.get("require_original_equation_check", False):
        unchecked = [str(row.get("value", "")) for row in candidates if isinstance(row, dict) and row.get("status") in {"valid", "extraneous"} and not str(row.get("original_check", "")).strip()]
        if unchecked:
            messages.append("Check each valid or extraneous candidate in the original equation.")
    details = {
        "restrictions": restrictions,
        "expected_restrictions": [str(item) for item in restriction_set] if getattr(restriction_set, "is_FiniteSet", False) else [],
        "steps": step_details,
        "candidates": candidate_details,
        "candidate_count": len(candidates),
        "valid_values": valid_values,
    }
    if messages:
        return WorkCheckResult("incomplete" if not candidates else "incorrect", "rational_equation_steps", "auto", score=0.0, messages=messages, details=details)
    return WorkCheckResult("correct", "rational_equation_steps", "auto", score=1.0, messages=["Restrictions, candidate checks, and classifications are complete."], details=details)


def _check_sign_chart_steps(instance: ProblemInstance, response: UserResponse) -> WorkCheckResult:
    data = response.structured_work_json or {}
    chart = instance.work.get("sign_chart", {})
    messages: list[str] = []
    row_details: list[dict] = []
    expected_points = list(chart.get("critical_points", []))
    variable = str(instance.work.get("target_variable") or instance.variable or "x")
    try:
        expected_points = sorted(expected_points, key=lambda item: float(N(parse_expression(str(item.get("value", "")), [variable]))))
    except Exception:
        return WorkCheckResult("uncertain", "sign_chart_steps", "auto", messages=["The authored critical points could not be ordered."])
    actual_points = data.get("critical_points", []) if isinstance(data.get("critical_points", []), list) else []
    if len(actual_points) != len(expected_points):
        messages.append(f"Expected {len(expected_points)} critical point(s), but received {len(actual_points)}.")
    else:
        unmatched = list(actual_points)
        matched_values = []
        for expected in expected_points:
            match_index = next((index for index, actual in enumerate(unmatched) if isinstance(actual, dict) and expressions_equivalent(str(expected.get("value", "")), str(actual.get("value", ""))) is True), None)
            if match_index is None:
                messages.append(f"Missing critical point {expected.get('value')}.")
                continue
            actual = unmatched.pop(match_index)
            matched_values.append(str(actual.get("value", "")))
            if str(actual.get("kind", "")) != str(expected.get("kind", "")):
                messages.append(f"Critical point {expected.get('value')} is classified incorrectly.")
        try:
            if len(parse_finite_set(matched_values, variable)) != len(matched_values):
                messages.append("Critical points must not be duplicated.")
        except Exception:
            messages.append("One or more critical points could not be parsed.")
    factorization = str(data.get("factorization", "")).strip()
    if chart.get("require_factorization", False):
        expected_factorization = str(chart.get("expected_factorization", chart.get("expression", "")))
        if not factorization or expressions_equivalent(expected_factorization, factorization) is not True:
            messages.append("The factorization is missing or not equivalent to the authored expression.")
    intervals = data.get("intervals", []) if isinstance(data.get("intervals", []), list) else []
    if chart.get("require_interval_signs", False) and len(intervals) != len(expected_points) + 1:
        messages.append(f"A complete chart needs {len(expected_points) + 1} interval row(s).")
    expression = str(chart.get("reduced_expression", chart.get("expression", "")))
    parsed_chart_expression = parse_expression(expression, [variable])
    chart_symbol = next((symbol for symbol in parsed_chart_expression.free_symbols if symbol.name == variable), None)
    relation = str(chart.get("relation", ">"))
    point_values = [parse_expression(str(point.get("value", "")), [variable]) for point in expected_points]
    expected_bounds = [(None if index == 0 else point_values[index - 1], None if index == len(point_values) else point_values[index]) for index in range(len(point_values) + 1)]
    selected_set = S.EmptySet
    for index, row in enumerate(intervals, start=1):
        detail = {"row": index, "ok": True, "messages": []}
        if not isinstance(row, dict):
            detail["ok"] = False
            detail["messages"].append("Malformed interval row.")
            row_details.append(detail)
            continue
        lower, upper = expected_bounds[index - 1] if index <= len(expected_bounds) else (None, None)
        if not _sign_chart_bound_matches(row.get("lower"), lower, variable, "lower") or not _sign_chart_bound_matches(row.get("upper"), upper, variable, "upper"):
            detail["ok"] = False
            detail["messages"].append("The interval boundaries do not match the ordered critical points.")
        test_value = str(row.get("test_value", "")).strip()
        sign = str(row.get("sign", "")).strip().lower()
        if chart.get("require_test_values", False) and not test_value:
            detail["ok"] = False
            detail["messages"].append("Choose a test value.")
        elif test_value:
            try:
                test_expression = parse_expression(test_value, [variable])
                test_numeric = float(N(test_expression))
                lower_numeric = float(N(lower)) if lower is not None else float("-inf")
                upper_numeric = float(N(upper)) if upper is not None else float("inf")
                if not lower_numeric < test_numeric < upper_numeric:
                    detail["ok"] = False
                    detail["messages"].append("The test value is not strictly inside this interval.")
                safe_test = _sign_chart_test_value(lower, upper)
                safe_value = parsed_chart_expression.subs({chart_symbol: safe_test}) if chart_symbol is not None else parsed_chart_expression
                safe_numeric = float(N(safe_value))
                expected_sign = "positive" if safe_numeric > 0 else "negative" if safe_numeric < 0 else "zero"
                if sign != expected_sign:
                    detail["ok"] = False
                    detail["messages"].append(f"The expression is {expected_sign} at {test_value}.")
                should_select = _relation_accepts_sign(relation, expected_sign)
                if bool(row.get("selected", False)) != should_select:
                    detail["ok"] = False
                    detail["messages"].append("The interval selection does not match the relation.")
                if bool(row.get("selected", False)):
                    selected_set = Union(selected_set, Interval(lower if lower is not None else S.NegativeInfinity, upper if upper is not None else S.Infinity, left_open=True, right_open=True))
            except Exception:
                detail["ok"] = False
                detail["messages"].append("The test value or expression could not be evaluated.")
        if not detail["ok"]:
            messages.append(f"Interval row {index} needs correction.")
        row_details.append(detail)
    endpoints = data.get("endpoints", []) if isinstance(data.get("endpoints", []), list) else []
    if chart.get("require_endpoint_decisions", False):
        for expected in expected_points:
            endpoint = next((item for item in endpoints if isinstance(item, dict) and expressions_equivalent(str(expected.get("value", "")), str(item.get("value", ""))) is True), None)
            expected_included = str(expected.get("kind")) == "zero" and relation in {">=", "<="}
            if endpoint is None or bool(endpoint.get("included", False)) != expected_included:
                messages.append(f"Endpoint decision for {expected.get('value')} is incorrect.")
            elif expected_included:
                selected_set = Union(selected_set, FiniteSet(parse_expression(str(expected.get("value", "")), [variable])))
    try:
        authored_set = parse_interval_set(instance.expected_answer, variable)
        if selected_set != authored_set:
            messages.append("The selected intervals and included endpoints do not form the authored solution set.")
    except Exception:
        messages.append("The selected sign-chart rows could not be converted to a solution set.")
    if chart.get("require_final_answer_match", False):
        try:
            if not interval_set_equal(instance.expected_answer, response.final_answer, variable):
                messages.append("The final interval set does not match the sign chart solution.")
        except Exception:
            messages.append("The final interval answer could not be parsed.")
    details = {"intervals": row_details, "critical_points": actual_points, "endpoints": endpoints, "selected_set": str(selected_set)}
    if messages:
        return WorkCheckResult("incorrect", "sign_chart_steps", "auto", score=0.0, messages=messages, details=details)
    return WorkCheckResult("correct", "sign_chart_steps", "auto", score=1.0, messages=["The critical points, signs, endpoints, and final set agree."], details=details)


def _relation_accepts_sign(relation: str, sign: str) -> bool:
    return sign == "positive" if relation in {">", ">="} else sign == "negative"


def _sign_chart_bound_matches(actual, expected, variable: str, side: str) -> bool:
    text = str(actual or "").strip()
    if expected is None:
        aliases = {"-inf", "-infinity"} if side == "lower" else {"inf", "+inf", "infinity", "+infinity"}
        return not text or text.casefold() in aliases
    return expressions_equivalent(text, str(expected), [variable]) is True


def _sign_chart_test_value(lower, upper):
    if lower is None and upper is None:
        return S.Zero
    if lower is None:
        return simplify(upper - 1)
    if upper is None:
        return simplify(lower + 1)
    return simplify((lower + upper) / 2)


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
