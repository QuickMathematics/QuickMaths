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
