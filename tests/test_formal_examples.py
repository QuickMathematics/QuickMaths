from pathlib import Path

from quickmaths.content_loader import load_skill_file
from quickmaths.formal_bridge import build_formal_job, build_reference_proof_job, formal_problem_binding
from quickmaths.problem_generator import generate_test

EXAMPLE = Path("examples/MATH_FORMAL_002_verified_algebra_calculus.yaml")


def test_formal_example_skill_round_trips_into_bound_verifier_jobs():
    skill = load_skill_file(EXAMPLE)
    instances = generate_test(skill, seed=20260909)
    assert [item.template_id for item in instances] == [
        "FORMAL_GUARDED_CANCEL_001",
        "FORMAL_REMOVABLE_HOLE_001",
        "FORMAL_POLYNOMIAL_DERIVATIVE_001",
        "FORMAL_QUOTIENT_DERIVATIVE_001",
        "FORMAL_ABS_DERIVATIVE_001",
        "FORMAL_EXP_DERIVATIVE_001",
        "FORMAL_LOG_DERIVATIVE_001",
        "FORMAL_SIN_DERIVATIVE_001",
        "FORMAL_COS_DERIVATIVE_001",
        "FORMAL_RECURSIVE_SIN_EXP_001",
        "FORMAL_RECURSIVE_EXP_QUOTIENT_001",
        "FORMAL_RECURSIVE_SQRT_QUOTIENT_001",
        "FORMAL_RECURSIVE_LOG_ABS_001",
        "FORMAL_RECURSIVE_ABS_SIN_001",
        "FORMAL_CONTINUITY_ABS_LIMIT_001",
        "FORMAL_CONTINUITY_LOG_EXP_LIMIT_001",
        "FORMAL_CONTINUITY_QUOTIENT_LIMIT_001",
        "FORMAL_CONTINUITY_SQRT_RIGHT_LIMIT_001",
        "FORMAL_LIMIT_ALGEBRA_BASIC_001",
        "FORMAL_LIMIT_ALGEBRA_ONE_SIDED_001",
        "FORMAL_LIMIT_ALGEBRA_HOLE_COMPOSE_001",
        "FORMAL_SEQUENCE_RECIPROCAL_001",
        "FORMAL_SEQUENCE_GEOMETRIC_001",
        "FORMAL_SEQUENCE_COMPOSED_001",
        "FORMAL_SEQUENCE_RATIONAL_SHIFT_001",
        "FORMAL_SEQUENCE_RATIONAL_SHIFT_OFFSET_001",
        "FORMAL_SEQUENCE_AFFINE_RATIO_001",
        "FORMAL_SEQUENCE_QUADRATIC_RATIO_001",
        "FORMAL_SEQUENCE_DEGREE_RATIO_ZERO_001",
        "FORMAL_SEQUENCE_GENERAL_POLYNOMIAL_RATIO_001",
        "FORMAL_SEQUENCE_SQUEEZE_001",
        "FORMAL_SEQUENCE_ALTERNATING_DIVERGENCE_001",
        "FORMAL_SEQUENCE_PERIODIC_MOD3_DIVERGENCE_001",
        "FORMAL_SEQUENCE_PERIODIC_VANISHING_TAIL_001",
        "FORMAL_SEQUENCE_PERIODIC_FINITE_TAIL_001",
        "FORMAL_SEQUENCE_PERIODIC_CITED_FINITE_TAIL_001",
        "FORMAL_SEQUENCE_EVENTUALLY_PERIODIC_DIVERGENCE_001",
        "FORMAL_SERIES_GEOMETRIC_001",
        "FORMAL_SERIES_P2_001",
        "FORMAL_SERIES_P_REAL_001",
        "FORMAL_SERIES_COMPARISON_001",
        "FORMAL_SERIES_RATIO_TEST_001",
        "FORMAL_SERIES_RATIO_LIMIT_001",
        "FORMAL_SERIES_RATIO_LIMIT_DIVERGENCE_001",
        "FORMAL_SERIES_ROOT_TEST_001",
        "FORMAL_SERIES_ROOT_POLY_GEOM_001",
    ]

    for problem in instances:
        assert problem.proof_spec["version"] == "0.1"
        job = build_formal_job(problem)
        assert job["problem_binding_sha256"] == formal_problem_binding(problem)
        assert len(job["problem_binding_sha256"]) == 64
        assert job["rpc"]["op"] == "new_text_request"
        assert job["rpc"]["goal"] == problem.proof_spec["statement"]["goal"]
        assert job["environment_requirements"] == problem.proof_spec["environment"]


def test_formal_example_reference_proofs_use_declarative_verifier_protocol():
    skill = load_skill_file(EXAMPLE)
    (
        algebra, limit, derivative, quotient, absolute, exponential, logarithm, sine, cosine,
        nested_sin_exp, exp_quotient, sqrt_quotient, log_abs, abs_sin,
        continuity_abs, continuity_log_exp, continuity_quotient, continuity_sqrt_right,
        limit_algebra_basic, limit_algebra_one_sided, limit_algebra_hole_compose,
        sequence_reciprocal, sequence_geometric, sequence_composed,
        sequence_rational, sequence_rational_offset, sequence_affine_ratio, sequence_quadratic_ratio, sequence_degree_ratio, sequence_general_polynomial_ratio, sequence_squeeze, sequence_alternating_divergence, sequence_periodic_mod3_divergence, sequence_periodic_vanishing_tail, sequence_periodic_finite_tail, sequence_periodic_cited_finite_tail, sequence_eventually_periodic_divergence, series_geometric, series_p2, series_p_real, series_comparison, series_ratio_test, series_ratio_limit, series_ratio_limit_divergence, series_root_test, series_root_poly_geom,
    ) = generate_test(skill, seed=20260909)

    series_job = build_reference_proof_job(series_geometric)
    assert series_job["rpc"]["op"] == "check_reference_text"
    assert series_job["rpc"]["goal"] == "The series from n = 0 to infinity of (1/2)^n sums to 2."
    assert series_job["rpc"]["reference_steps"][-1]["rule"] == "series_geometric"

    p_series_job = build_reference_proof_job(series_p2)
    assert p_series_job["rpc"]["goal"] == "The series from n = 0 to infinity of 1 / real(n + 1)^2 is summable."
    assert p_series_job["rpc"]["reference_steps"][-1]["rule"] == "series_p_series"

    real_p_series_job = build_reference_proof_job(series_p_real)
    assert real_p_series_job["rpc"]["goal"] == "The series from n = 0 to infinity of 1 / real(n + 1)^(3/2) is summable."
    assert real_p_series_job["rpc"]["reference_steps"][-1]["rule"] == "series_p_series"

    comparison_job = build_reference_proof_job(series_comparison)
    assert comparison_job["rpc"]["goal"] == "The series from n = 0 to infinity of ((1/2)^n)^2 is summable."
    assert [row["rule"] for row in comparison_job["rpc"]["reference_steps"]] == ["series_geometric", "series_comparison"]
    assert set(comparison_job["rpc"]["reference_steps"][-1]["premises"]) == {"reference_step_1", "h1"}

    ratio_job = build_reference_proof_job(series_ratio_test)
    assert ratio_job["rpc"]["goal"] == "The series from n = 0 to infinity of real(n + 1) * (1/2)^n is summable."
    assert ratio_job["rpc"]["reference_steps"][-1]["rule"] == "series_ratio_test"
    assert ratio_job["rpc"]["reference_steps"][-1]["premises"] == ["h1"]

    ratio_limit_job = build_reference_proof_job(series_ratio_limit)
    assert ratio_limit_job["rpc"]["goal"] == "The series from n = 0 to infinity of (1/2)^n is summable."
    assert ratio_limit_job["rpc"]["reference_steps"][-1]["rule"] == "series_ratio_limit_test"
    assert ratio_limit_job["rpc"]["reference_steps"][-1]["premises"] == ["h1"]

    ratio_limit_divergence_job = build_reference_proof_job(series_ratio_limit_divergence)
    assert ratio_limit_divergence_job["rpc"]["goal"] == "The series from n = 0 to infinity of 2^n is not summable."
    assert ratio_limit_divergence_job["rpc"]["reference_steps"][-1]["rule"] == "series_ratio_limit_test"
    assert ratio_limit_divergence_job["rpc"]["reference_steps"][-1]["premises"] == []

    root_test_job = build_reference_proof_job(series_root_test)
    assert root_test_job["rpc"]["goal"] == "The series from n = 0 to infinity of (1/2)^n is summable."
    assert root_test_job["rpc"]["reference_steps"][-1]["rule"] == "series_root_test"
    assert root_test_job["rpc"]["reference_steps"][-1]["premises"] == []

    root_poly_job = build_reference_proof_job(series_root_poly_geom)
    assert root_poly_job["rpc"]["goal"] == "The series from n = 0 to infinity of 3 * real(n)^2 * (1/2)^n is summable."
    assert root_poly_job["rpc"]["reference_steps"][-1]["rule"] == "series_root_test"
    assert root_poly_job["rpc"]["reference_steps"][-1]["premises"] == []

    algebra_job = build_reference_proof_job(algebra)
    assert algebra_job["rpc"]["op"] == "check_reference_text"
    assert [row["rule"] for row in algebra_job["rpc"]["reference_steps"]] == [
        "sub_ne_zero_from_ne",
        "field_identity",
    ]

    limit_job = build_reference_proof_job(limit)
    assert limit_job["rpc"]["op"] == "check_reference_text"
    assert limit_job["rpc"]["goal"].startswith("As x approaches 3 from both sides")
    assert limit_job["rpc"]["reference_steps"][0]["parameters"]["simplified"] == "x + 3"

    derivative_job = build_reference_proof_job(derivative)
    assert derivative_job["rpc"]["op"] == "check_reference_text"
    assert derivative_job["rpc"]["goal"].startswith("The derivative of x^2 + 3*x")
    assert derivative_job["rpc"]["reference_steps"][0]["rule"] == "polynomial_derivative"

    quotient_job = build_reference_proof_job(quotient)
    assert quotient_job["rpc"]["op"] == "check_reference_text"
    assert quotient_job["rpc"]["goal"].startswith("The derivative of (x^2 + 1)/(x - 1)")
    assert [row["rule"] for row in quotient_job["rpc"]["reference_steps"]] == [
        "sub_ne_zero_from_ne",
        "quotient_derivative",
    ]

    expected_new = [
        (absolute, "abs_derivative", "|x - 1|"),
        (exponential, "exp_derivative", "exp(x^2)"),
        (logarithm, "log_derivative", "log(x + 1)"),
        (sine, "sin_derivative", "sin(2*x)"),
        (cosine, "cos_derivative", "cos(x^2)"),
    ]
    for problem, rule, goal_fragment in expected_new:
        job = build_reference_proof_job(problem)
        assert job["rpc"]["op"] == "check_reference_text"
        assert goal_fragment in job["rpc"]["goal"]
        assert job["rpc"]["reference_steps"][-1]["rule"] == rule

    recursive = [
        (nested_sin_exp, "sin(exp(x^2))", []),
        (exp_quotient, "exp((x^2 + 1)/(x - 1))", []),
        (sqrt_quotient, "sqrt((x^2 + 1)/(x + 1))", []),
        (log_abs, "log(abs(x))", []),
        (abs_sin, "abs(sin(x))", ["h1"]),
    ]
    for problem, goal_fragment, premises in recursive:
        job = build_reference_proof_job(problem)
        assert job["rpc"]["op"] == "check_reference_text"
        assert goal_fragment in job["rpc"]["goal"]
        final_step = job["rpc"]["reference_steps"][-1]
        assert final_step["rule"] == "recursive_derivative"
        assert final_step["premises"] == premises

    continuity = [
        (continuity_abs, "abs(x)", "0"),
        (continuity_log_exp, "log(exp(x))", "2"),
        (continuity_quotient, "1/(x^2 + 1)", "1"),
        (continuity_sqrt_right, "sqrt(x)", "0"),
    ]
    for problem, goal_fragment, result_fragment in continuity:
        job = build_reference_proof_job(problem)
        assert job["rpc"]["op"] == "check_reference_text"
        assert goal_fragment in job["rpc"]["goal"]
        assert f"approaches {result_fragment}" in job["rpc"]["goal"]
        final_step = job["rpc"]["reference_steps"][-1]
        assert final_step["rule"] == "continuity_limit"
        assert final_step["premises"] == []
    limit_algebra = [
        (limit_algebra_basic, "(x^2 + 3*x - 1)/(x + 1)", []),
        (limit_algebra_one_sided, "sin(x) + x^2", []),
    ]
    for problem, goal_fragment, premises in limit_algebra:
        job = build_reference_proof_job(problem)
        assert job["rpc"]["op"] == "check_reference_text"
        assert goal_fragment in job["rpc"]["goal"]
        final_step = job["rpc"]["reference_steps"][-1]
        assert final_step["rule"] == "limit_algebra"
        assert final_step["premises"] == premises

    hole_job = build_reference_proof_job(limit_algebra_hole_compose)
    assert [row["rule"] for row in hole_job["rpc"]["reference_steps"]] == [
        "rational_hole_limit",
        "limit_algebra",
    ]
    assert hole_job["rpc"]["reference_steps"][1]["premises"] == ["reference_step_1"]
    sequence_cases = [
        (sequence_reciprocal, "1 / real(n + 1)"),
        (sequence_geometric, "(1/2)^n"),
        (sequence_composed, "sin(1 / real(n + 1)) + (1/2)^n"),
    ]
    for problem, goal_fragment in sequence_cases:
        job = build_reference_proof_job(problem)
        assert job["rpc"]["op"] == "check_reference_text"
        assert goal_fragment in job["rpc"]["goal"]
        final_step = job["rpc"]["reference_steps"][-1]
        assert final_step["rule"] == "sequence_algebra"
        assert final_step["premises"] == []
    rational_cases = [
        (sequence_rational, "real(n) / real(n + 1)"),
        (sequence_rational_offset, "real(n + 2) / real(n + 5)"),
    ]
    for problem, goal_fragment in rational_cases:
        job = build_reference_proof_job(problem)
        assert job["rpc"]["op"] == "check_reference_text"
        assert goal_fragment in job["rpc"]["goal"]
        final_step = job["rpc"]["reference_steps"][-1]
        assert final_step["rule"] == "sequence_rational_shift"
        assert final_step["premises"] == []

    affine_job = build_reference_proof_job(sequence_affine_ratio)
    assert affine_job["rpc"]["op"] == "check_reference_text"
    assert "(2 * real(n) + 3) / (5 * real(n) + 7)" in affine_job["rpc"]["goal"]
    assert affine_job["rpc"]["reference_steps"][-1]["rule"] == "sequence_affine_ratio"
    assert affine_job["rpc"]["reference_steps"][-1]["premises"] == []

    quadratic_job = build_reference_proof_job(sequence_quadratic_ratio)
    assert quadratic_job["rpc"]["op"] == "check_reference_text"
    assert "3 * real(n)^2 + 2 * real(n) + 1" in quadratic_job["rpc"]["goal"]
    assert quadratic_job["rpc"]["reference_steps"][-1]["rule"] == "sequence_quadratic_ratio"
    assert quadratic_job["rpc"]["reference_steps"][-1]["premises"] == []

    degree_job = build_reference_proof_job(sequence_degree_ratio)
    assert degree_job["rpc"]["op"] == "check_reference_text"
    assert "(2 * real(n) + 1) / (5 * real(n)^2 + 3)" in degree_job["rpc"]["goal"]
    assert degree_job["rpc"]["reference_steps"][-1]["rule"] == "sequence_polynomial_degree_ratio"
    assert degree_job["rpc"]["reference_steps"][-1]["premises"] == []

    general_polynomial_job = build_reference_proof_job(sequence_general_polynomial_ratio)
    assert general_polynomial_job["rpc"]["op"] == "check_reference_text"
    assert "3 * real(n)^5 - 2 * real(n)^2 + 1" in general_polynomial_job["rpc"]["goal"]
    assert general_polynomial_job["rpc"]["reference_steps"][-1]["rule"] == "sequence_polynomial_degree_ratio"
    assert general_polynomial_job["rpc"]["reference_steps"][-1]["premises"] == []

    squeeze_job = build_reference_proof_job(sequence_squeeze)
    assert squeeze_job["rpc"]["op"] == "check_reference_text"
    assert squeeze_job["rpc"]["assumptions"] == []
    assert [row["rule"] for row in squeeze_job["rpc"]["reference_steps"]] == [
        "sequence_algebra",
        "sequence_algebra",
        "sequence_squeeze",
    ]
    assert squeeze_job["rpc"]["reference_steps"][-1]["premises"] == [
        "reference_step_1",
        "reference_step_2",
    ]

    divergence_job = build_reference_proof_job(sequence_alternating_divergence)
    assert divergence_job["rpc"]["op"] == "check_reference_text"
    assert "(-1)^n does not converge" in divergence_job["rpc"]["goal"]
    assert divergence_job["rpc"]["reference_steps"][-1]["rule"] == "sequence_elementary_divergence"
    assert divergence_job["rpc"]["reference_steps"][-1]["premises"] == []

    periodic_job = build_reference_proof_job(sequence_periodic_mod3_divergence)
    assert periodic_job["rpc"]["op"] == "check_reference_text"
    assert "n % 3 = 0" in periodic_job["rpc"]["goal"]
    assert periodic_job["rpc"]["reference_steps"][-1]["rule"] == "sequence_elementary_divergence"
    assert periodic_job["rpc"]["reference_steps"][-1]["premises"] == []

    perturbed_job = build_reference_proof_job(sequence_periodic_vanishing_tail)
    assert perturbed_job["rpc"]["op"] == "check_reference_text"
    assert "(-1)^n + 1 / real(n + 1)" in perturbed_job["rpc"]["goal"]
    assert perturbed_job["rpc"]["reference_steps"][-1]["rule"] == "sequence_elementary_divergence"
    assert perturbed_job["rpc"]["reference_steps"][-1]["premises"] == []


    finite_tail_job = build_reference_proof_job(sequence_periodic_finite_tail)
    assert finite_tail_job["rpc"]["op"] == "check_reference_text"
    assert "(-1)^n + (2 + 1 / real(n + 1))" in finite_tail_job["rpc"]["goal"]
    assert finite_tail_job["rpc"]["reference_steps"][-1]["rule"] == "sequence_elementary_divergence"
    assert finite_tail_job["rpc"]["reference_steps"][-1]["premises"] == []

    cited_tail_job = build_reference_proof_job(sequence_periodic_cited_finite_tail)
    assert cited_tail_job["rpc"]["op"] == "check_reference_text"
    assert "real(n) / real(n + 1)" in cited_tail_job["rpc"]["goal"]
    assert [row["rule"] for row in cited_tail_job["rpc"]["reference_steps"]] == [
        "sequence_rational_shift",
        "sequence_elementary_divergence",
    ]
    assert cited_tail_job["rpc"]["reference_steps"][-1]["premises"] == ["reference_step_1"]

    eventually_periodic_job = build_reference_proof_job(sequence_eventually_periodic_divergence)
    assert eventually_periodic_job["rpc"]["op"] == "check_reference_text"
    assert "if n < 5 then n else" in eventually_periodic_job["rpc"]["goal"]
    assert eventually_periodic_job["rpc"]["reference_steps"][-1]["rule"] == "sequence_elementary_divergence"
    assert eventually_periodic_job["rpc"]["reference_steps"][-1]["premises"] == []
