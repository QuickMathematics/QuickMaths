from quickmaths.models import ProblemInstance, UserResponse
from quickmaths.content_loader import load_curriculum
from quickmaths.grading import grade_answer
from quickmaths.problem_generator import generate_test
from quickmaths.work_checker import check_work


def test_correct_expression_steps_pass():
    problem = _problem("2*x + 6", {"mode": "procedural_steps", "line_type": "expression", "minimum_steps": 2, "require_final_answer_match": True})
    result = check_work(problem, UserResponse(final_answer="2x+6", work="2(x + 3)\n2x + 6"))
    assert result.status == "correct"


def test_incorrect_expression_steps_fail():
    problem = _problem("2*x + 6", {"mode": "procedural_steps", "line_type": "expression", "minimum_steps": 2, "require_final_answer_match": True})
    result = check_work(problem, UserResponse(final_answer="2x+3", work="2(x + 3)\n2x + 3"))
    assert result.status == "incorrect"


def test_correct_equation_steps_pass():
    problem = _problem(
        "4",
        {
            "mode": "procedural_steps",
            "line_type": "equation",
            "target_variable": "x",
            "minimum_steps": 2,
            "require_final_answer_match": True,
        },
        variable="x",
        grading_method="equation_solution",
    )
    result = check_work(problem, UserResponse(final_answer="x=4", work="2x + 3 = 11\n2x = 8\nx = 4"))
    assert result.status == "correct"


def test_incorrect_equation_steps_fail():
    problem = _problem(
        "4",
        {
            "mode": "procedural_steps",
            "line_type": "equation",
            "target_variable": "x",
            "minimum_steps": 2,
            "require_final_answer_match": True,
        },
        variable="x",
        grading_method="equation_solution",
    )
    result = check_work(problem, UserResponse(final_answer="x=7", work="2x + 3 = 11\n2x = 14\nx = 7"))
    assert result.status == "incorrect"


def test_equation_steps_allow_divide_first_or_distribute_first():
    problem = _problem(
        "3",
        {
            "mode": "procedural_steps",
            "line_type": "equation",
            "target_variable": "x",
            "minimum_steps": 2,
            "require_final_answer_match": True,
        },
        variable="x",
        grading_method="equation_solution",
    )
    divide_first = check_work(problem, UserResponse(work="2(x + 1) = 8\nx + 1 = 4\nx = 3"))
    distribute_first = check_work(problem, UserResponse(work="2(x + 1) = 8\n2x + 2 = 8\n2x = 6\nx = 3"))

    assert divide_first.status == "correct"
    assert distribute_first.status == "correct"


def test_classification_equation_work_handles_identity_and_contradiction():
    problem = _problem(
        "infinitely many solutions",
        {
            "mode": "procedural_steps",
            "line_type": "equation",
            "minimum_steps": 2,
            "require_final_answer_match": False,
        },
        grading_method="multiple_choice",
    )

    identity = check_work(problem, UserResponse(work="2x + 3 = 2x + 3\n3 = 3"))
    wrong = check_work(problem, UserResponse(work="2x + 3 = 2x + 3\n3 = 4"))

    assert identity.status == "correct"
    assert wrong.status == "incorrect"


def test_inequality_steps_allow_sign_flip_when_dividing_by_negative():
    problem = _problem(
        "x < 5",
        {
            "mode": "procedural_steps",
            "line_type": "inequality",
            "minimum_steps": 2,
            "require_final_answer_match": True,
        },
        variable="x",
        grading_method="exact_text",
    )

    correct = check_work(problem, UserResponse(work="-2x > -10\nx < 5"))
    incorrect = check_work(problem, UserResponse(work="-2x > -10\nx > 5"))

    assert correct.status == "correct"
    assert incorrect.status == "incorrect"


def test_literal_equation_work_can_end_in_expression_answer():
    problem = _problem(
        "(c - b)/a",
        {
            "mode": "procedural_steps",
            "line_type": "equation",
            "target_variable": "x",
            "minimum_steps": 2,
            "require_final_answer_match": True,
        },
        variable="x",
        grading_method="symbolic_expression",
    )

    result = check_work(problem, UserResponse(work="a*x + b = c\na*x = c - b\nx = (c - b)/a"))

    assert result.status == "correct"


def test_parse_failure_returns_uncertain():
    problem = _problem("4", {"mode": "procedural_steps", "line_type": "equation", "target_variable": "x", "minimum_steps": 2}, variable="x")
    result = check_work(problem, UserResponse(final_answer="4", work="2x + 3 = 11\n2x + = 8"))
    assert result.status == "uncertain"


def test_grade_answer_checks_algebra_steps_through_submission_path():
    problem = _problem(
        "4",
        {
            "mode": "procedural_steps",
            "line_type": "equation",
            "target_variable": "x",
            "minimum_steps": 2,
            "require_final_answer_match": True,
        },
        variable="x",
        grading_method="equation_solution",
    )
    correct = grade_answer(problem, UserResponse(final_answer="x = 4", work="2x + 3 = 11\n2x = 8\nx = 4"))
    incorrect = grade_answer(problem, UserResponse(final_answer="x = 7", work="2x + 3 = 11\n2x = 14\nx = 7"))

    assert correct.is_correct
    assert correct.work_check_result is not None
    assert correct.work_check_result.status == "correct"
    assert not incorrect.is_correct
    assert incorrect.work_check_result is not None
    assert incorrect.work_check_result.status == "incorrect"


def test_combining_like_terms_auto_checks_expression_work_without_pending_review():
    _track, skills, _warnings = load_curriculum()
    problem = generate_test(skills["MATH_PREALG_002"], seed=5)[0]
    starting_expression = problem.prompt.split(":", 1)[1].strip()
    response = UserResponse(
        final_answer=problem.expected_answer,
        work=f"{starting_expression}\n{problem.expected_answer}",
    )

    result = grade_answer(problem, response)

    assert result.is_correct
    assert result.work_review_status == "not_required"
    assert result.work_check_result is not None
    assert result.work_check_result.mode == "procedural_steps"
    assert result.work_check_result.review_policy == "auto"
    assert result.work_check_result.status == "correct"


def test_proof_obligation_work_still_becomes_pending_review():
    problem = _problem(
        "done",
        {
            "mode": "proof_obligations",
            "prompt": "Write the proof.",
            "proof_policy": {
                "accepted_strategies": [
                    {
                        "id": "strategy",
                        "name": "Strategy",
                        "assumptions_required": [{"id": "state_given", "label": "State given", "required": True}],
                        "required_obligations": [{"id": "conclude_answer", "label": "Conclude", "required": True}],
                    }
                ]
            },
        },
        grading_method="theorem_conclusion",
    )
    problem = ProblemInstance(
        **{**problem.__dict__, "answer_mode": "final_plus_required_work", "review_policy": {"work_review": "tutor_required"}}
    )

    result = grade_answer(problem, UserResponse(final_answer="done", work="[state_given]\n[conclude_answer]"))

    assert result.is_correct
    assert result.work_review_status == "submitted_for_tutor_review"
    assert result.work_check_result is not None
    assert result.work_check_result.status == "pending_review"


def test_rational_equation_ledger_checks_restrictions_steps_classifications_and_original_checks():
    problem = ProblemInstance(
        template_id="RAT",
        skill_id="S",
        seed=1,
        difficulty="hard",
        values={},
        prompt="Solve over the real numbers: (x - 2)/(x - 5) = 0",
        expected_answer="{2}",
        answer_type="finite_set",
        grading_method="finite_set",
        solution_steps=[],
        mistake_tags=[],
        variable="x",
        answer_mode="final_plus_required_work",
        answer_metadata={"values": ["2"]},
        work={
            "mode": "rational_equation_steps",
            "target_variable": "x",
            "require_restrictions": True,
            "require_original_equation_check": True,
            "original_equation": "(x - 2)/(x - 5) = 0",
            "expected_restrictions": ["5"],
        },
        review_policy={"work_review": "auto"},
    )
    correct = UserResponse(
        final_answer="{2}",
        structured_work_json={
            "restrictions": ["5"],
            "steps": ["x - 2 = 0", "x = 2"],
            "candidates": [{"value": "2", "status": "valid", "original_check": "(2-2)/(2-5)=0"}],
        },
    )
    assert check_work(problem, correct).status == "correct"

    wrong = UserResponse(
        final_answer="{2}",
        structured_work_json={
            "restrictions": ["4"],
            "steps": ["x - 2 = 0", "x = 2"],
            "candidates": [{"value": "2", "status": "extraneous", "original_check": "checked"}],
        },
    )
    result = check_work(problem, wrong)
    assert result.status == "incorrect"
    assert any("restriction" in message for message in result.messages)
    assert any("classified" in message for message in result.messages)


def test_sign_chart_checker_validates_boundaries_signs_endpoints_and_selected_set():
    problem = ProblemInstance(
        template_id="SIGN",
        skill_id="S",
        seed=1,
        difficulty="hard",
        values={},
        prompt="Solve: (x - 2)/(x - 5) >= 0",
        expected_answer="(-inf, 2] U (5, inf)",
        answer_type="interval_set",
        grading_method="interval_set",
        solution_steps=[],
        mistake_tags=[],
        variable="x",
        answer_mode="final_plus_required_work",
        work={
            "mode": "sign_chart_steps",
            "target_variable": "x",
            "sign_chart": {
                "expression_kind": "rational",
                "expression": "(x - 2)/(x - 5)",
                "reduced_expression": "(x - 2)/(x - 5)",
                "relation": ">=",
                "critical_points": [
                    {"value": "2", "kind": "zero", "multiplicity": 1},
                    {"value": "5", "kind": "undefined", "multiplicity": 1},
                ],
                "require_test_values": True,
                "require_interval_signs": True,
                "require_endpoint_decisions": True,
                "require_final_answer_match": True,
            },
        },
        review_policy={"work_review": "auto"},
    )
    chart = {
        "critical_points": [{"value": "5", "kind": "undefined"}, {"value": "2", "kind": "zero"}],
        "intervals": [
            {"lower": "", "upper": "2", "test_value": "0", "sign": "positive", "selected": True},
            {"lower": "2", "upper": "5", "test_value": "3", "sign": "negative", "selected": False},
            {"lower": "5", "upper": "", "test_value": "6", "sign": "positive", "selected": True},
        ],
        "endpoints": [{"value": "2", "included": True}, {"value": "5", "included": False}],
    }
    correct_result = check_work(problem, UserResponse(final_answer="x <= 2 or x > 5", structured_work_json=chart))
    assert correct_result.status == "correct", correct_result

    bad_chart = {**chart, "intervals": [dict(row) for row in chart["intervals"]]}
    bad_chart["intervals"][1]["upper"] = "6"
    result = check_work(problem, UserResponse(final_answer="(-inf, 2] U (5, inf)", structured_work_json=bad_chart))
    assert result.status == "incorrect"
    assert result.details["intervals"][1]["ok"] is False


def _problem(expected: str, work: dict, variable: str | None = None, grading_method: str = "symbolic_expression") -> ProblemInstance:
    return ProblemInstance(
        template_id="T",
        skill_id="S",
        seed=1,
        difficulty="medium",
        values={},
        prompt="p",
        expected_answer=expected,
        answer_type="expression",
        grading_method=grading_method,
        solution_steps=[],
        mistake_tags=[],
        variable=variable,
        work=work,
        review_policy={"work_review": "auto"},
    )
