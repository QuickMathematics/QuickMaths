#!/usr/bin/env python3
"""Run the Phase 0/1 acceptance corpus against a real Lean kernel.

This script is intentionally stricter than the ordinary unit suite.  It is
expected to run only in an environment where the pinned Lean/mathlib toolchain
is installed.  Positive fixtures must produce fresh certificates.  Negative
fixtures must be rejected before certification for their documented reason.
"""
from __future__ import annotations

import json
import argparse
from concurrent.futures import ThreadPoolExecutor
import shutil
import sys
from pathlib import Path

from quickmaths_formal.verifier import MATHLIB_REV, LEAN_TOOLCHAIN, verify_request

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures"

# These exercises are part of the currently advertised kernel-backed corpus.
POSITIVE = (
    "guarded_cancellation.json",
    "difference_quotient.json",
    "sqrt_square_nonnegative.json",
    "conjugate_identity.json",
    "inverse_right_infinity.json",
    "inverse_left_infinity.json",
    "removable_hole_limit.json",
    "conjugate_limit.json",
    "piecewise_jump.json",
    "ivt_existence.json",
    "polynomial_derivative.json",
    "derivative_definition_square.json",
    "quotient_derivative.json",
    "sqrt_derivative.json",
    "abs_derivative_positive.json",
    "abs_derivative_negative.json",
    "exp_derivative.json",
    "log_derivative.json",
    "sin_derivative.json",
    "cos_derivative.json",
    "recursive_nested_sin_exp.json",
    "recursive_exp_quotient.json",
    "recursive_sqrt_quotient.json",
    "recursive_log_abs.json",
    "recursive_abs_sin_symbolic.json",
    "recursive_log_exp_auto_positive.json",
    "recursive_sqrt_square_plus_one.json",
    "continuity_abs_limit.json",
    "continuity_log_exp_limit.json",
    "continuity_guarded_quotient_limit.json",
    "continuity_sqrt_square_limit.json",
    "continuity_sqrt_right_limit.json",
    "continuous_ivt_guarded_quotient.json",
    "continuous_ivt_exp_with_brackets.json",
    "continuous_ivt_quantified_guard.json",
    "bounded_interval_positive.json",
    "limit_algebra_basic.json",
    "limit_algebra_one_sided.json",
    "limit_algebra_hole_composition.json",
    "limit_algebra_symbolic_denominator.json",
    "limit_algebra_log_composition.json",
    "limit_algebra_sqrt_positive.json",
    "sequence_reciprocal_shift.json",
    "sequence_geometric_half.json",
    "sequence_geometric_symbolic.json",
    "sequence_composed.json",
    "sequence_reuse_sublimit.json",
    "sequence_nat_at_top.json",
    "sequence_rational_shift.json",
    "sequence_rational_shift_offset.json",
    "sequence_affine_ratio.json",
    "sequence_affine_ratio_negative.json",
    "sequence_affine_ratio_rational.json",
    "sequence_quadratic_ratio.json",
    "sequence_quadratic_ratio_negative.json",
    "sequence_quadratic_ratio_factored.json",
    "sequence_polynomial_degree_ratio_zero.json",
    "sequence_polynomial_degree_ratio_pos_inf.json",
    "sequence_polynomial_degree_ratio_neg_inf.json",
    "sequence_polynomial_degree_ratio_gap2_neg_inf.json",
    "sequence_polynomial_general_equal_degree.json",
    "sequence_polynomial_general_lower_degree.json",
    "sequence_polynomial_general_pos_inf.json",
    "sequence_squeeze_sin_over_shift.json",
    "sequence_squeeze_sin_auto.json",
    "sequence_squeeze_cos_auto.json",
    "sequence_monotone_bounded_increasing.json",
    "sequence_monotone_bounded_decreasing.json",
    "sequence_monotone_bounded_auto_increasing.json",
    "sequence_monotone_bounded_auto_decreasing.json",
    "sequence_alternating_no_finite.json",
    "sequence_alternating_affine_no_finite.json",
    "sequence_periodic_mod2_piecewise_no_finite.json",
    "sequence_periodic_mod3_no_finite.json",
    "sequence_periodic_mod4_no_finite.json",
    "sequence_alternating_vanishing_reciprocal_no_finite.json",
    "sequence_periodic_mod3_vanishing_reciprocal_no_finite.json",
    "sequence_periodic_mod4_vanishing_geometric_no_finite.json",
    "sequence_alternating_finite_reciprocal_no_finite.json",
    "sequence_periodic_mod3_finite_reciprocal_no_finite.json",
    "sequence_periodic_mod4_finite_symbolic_no_finite.json",
    "sequence_periodic_cited_finite_tail_no_finite.json",
    "sequence_eventually_periodic_mod3_no_finite.json",
    "sequence_eventually_alternating_no_finite.json",
    "sequence_geometric_two_pos_inf.json",
    "sequence_geometric_two_no_finite.json",
    "sequence_geometric_negative_two_no_finite.json",
    "series_geometric_half_sum.json",
    "series_geometric_scaled_negative_sum.json",
    "series_geometric_two_not_summable.json",
    "series_geometric_negative_one_not_summable.json",
    "series_p2_shift1_summable.json",
    "series_p3_scaled_shift2_summable.json",
    "series_p1_harmonic_not_summable.json",
    "series_p0_not_summable.json",
    "series_p_real_three_halves_shift1_summable.json",
    "series_p_real_half_scaled_shift2_not_summable.json",
    "series_comparison_summable.json",
    "series_comparison_not_summable.json",
    "series_ratio_eventual_linear_geometric_summable.json",
    "series_ratio_global_geometric_summable.json",
    "series_ratio_limit_geometric_summable.json",
    "series_ratio_limit_geometric_divergent.json",
    "series_root_geometric_summable.json",
    "series_root_geometric_divergent.json",
    "series_root_monomial_geometric_summable.json",
    "series_root_monomial_geometric_divergent.json",
    "series_root_polynomial_geometric_summable.json",
    "series_root_polynomial_geometric_divergent.json",
)

# These cases must *not* reach a certificate.  Checking the exact status keeps
# a future refactor from turning a missing hypothesis into a false verdict, or
# from silently accepting a scope leak.
# Later engine checkpoints reconstruct the nonzero guard for exact geometric terms.
# These historical fixture names now describe valid positive cases; no assumption is waived.
POSITIVE += ("series_ratio_limit_missing_nonzero.json", "series_ratio_limit_wrong_nonzero.json",
    "sequence_monotone_bounded_missing_bound.json", "sequence_squeeze_missing_upper.json",
    "series_root_geometric_product_divergent.json", "series_root_geometric_product_summable.json",
    "series_root_polynomial_quotient_denominator_geometric_summable.json",
    "series_root_polynomial_quotient_domain_guard_needed.json",
    "series_root_polynomial_quotient_geometric_divergent.json",
    "series_root_polynomial_quotient_geometric_summable.json",
    "series_root_reciprocal_polynomial_geometric_summable.json",
    "series_ratio_limit_balanced_powered_shifted_factorials.json",
    "series_ratio_limit_extra_denominator_factorial.json",
    "series_ratio_limit_extra_numerator_factorial.json")

NEGATIVE = {
    "series_root_geometric_product_boundary_one.json": "needs_justification",
    "series_root_nonpolynomial_quotient_needs_limit.json": "needs_justification",
    "series_root_polynomial_quotient_boundary_one.json": "needs_justification",
    "series_root_zero_geometric_denominator_needs_domain.json": "needs_justification",
    "missing_restriction.json": "needs_justification",
    "wrong_limit_direction.json": "needs_justification",
    "leaked_assumption.json": "ambiguous_input",
    "ivt_false_uniqueness_method.json": "needs_justification",
    "abs_derivative_kink.json": "needs_justification",
    "log_derivative_missing_domain.json": "needs_justification",
    "recursive_abs_missing_sign.json": "needs_justification",
    "recursive_abs_kink.json": "needs_justification",
    "recursive_wrong_formula.json": "needs_justification",
    "continuity_wrong_value.json": "needs_justification",
    "continuity_log_zero_domain_violation.json": "needs_justification",
    "continuous_ivt_missing_brackets.json": "needs_justification",
    "continuous_ivt_missing_interval_guard.json": "needs_justification",
    "limit_algebra_log_nonpositive_target.json": "needs_justification",
    "limit_algebra_missing_hole_premise.json": "needs_justification",
    "sequence_geometric_bad_ratio.json": "needs_justification",
    "sequence_geometric_missing_ratio.json": "needs_justification",
    "sequence_wrong_reciprocal_target.json": "needs_justification",
    "sequence_rational_shift_wrong_target.json": "needs_justification",
    "sequence_affine_ratio_wrong_target.json": "needs_justification",
    "sequence_affine_ratio_zero_leading_denominator.json": "needs_justification",
    "sequence_quadratic_ratio_wrong_target.json": "needs_justification",
    "sequence_quadratic_ratio_lower_degree.json": "needs_justification",
    "sequence_polynomial_degree_ratio_wrong_sign.json": "needs_justification",
    "sequence_polynomial_degree_ratio_wrong_zero_target.json": "needs_justification",
    "sequence_polynomial_degree_ratio_equal_degree.json": "needs_justification",
    "sequence_polynomial_general_wrong_equal_target.json": "needs_justification",
    "sequence_polynomial_general_zero_denominator.json": "needs_justification",
    "sequence_polynomial_general_degree_overflow.json": "needs_justification",
    "sequence_squeeze_auto_unsupported.json": "needs_justification",
    "sequence_monotone_bounded_auto_bad_ratio.json": "needs_justification",
    "sequence_alternating_wrong_infinity.json": "needs_justification",
    "sequence_geometric_half_wrong_no_finite.json": "needs_justification",
    "sequence_geometric_one_wrong_no_finite.json": "needs_justification",
    "sequence_periodic_constant_wrong_no_finite.json": "needs_justification",
    "sequence_periodic_mod5_unsupported.json": "needs_justification",
    "sequence_periodic_with_drift_unsupported.json": "needs_justification",
    "sequence_alternating_growing_tail_unsupported.json": "needs_justification",
    "sequence_alternating_finite_plus_growing_tail_unsupported.json": "needs_justification",
    "sequence_alternating_unsafe_reciprocal_tail_unsupported.json": "needs_justification",
    "sequence_periodic_cited_finite_tail_missing.json": "needs_justification",
    "sequence_periodic_cited_finite_tail_wrong_citation.json": "needs_justification",
    "sequence_eventually_constant_wrong_no_finite.json": "needs_justification",
    "sequence_eventually_periodic_le_cutoff_unsupported.json": "needs_justification",
    "series_geometric_wrong_sum.json": "needs_justification",
    "series_geometric_false_divergence.json": "needs_justification",
    "series_geometric_false_finite.json": "needs_justification",
    "series_p2_false_not_summable.json": "needs_justification",
    "series_p1_false_summable.json": "needs_justification",
    "series_p2_zero_shift_unsupported.json": "needs_justification",
    "series_p_real_three_halves_false_not_summable.json": "needs_justification",
    "series_p_real_half_false_summable.json": "needs_justification",
    "series_p_real_overflow_unsupported.json": "needs_justification",
    "series_comparison_missing_evidence.json": "needs_justification",
    "series_comparison_wrong_direction.json": "needs_justification",
    "series_ratio_missing_evidence.json": "needs_justification",
    "series_ratio_bound_one_unsupported.json": "needs_justification",
    "series_ratio_wrong_direction.json": "needs_justification",
    "series_ratio_limit_non_geometric_missing_limit.json": "needs_justification",
    "series_ratio_limit_boundary_one_inconclusive.json": "needs_justification",
    "series_ratio_limit_lt_one_false_divergence.json": "needs_justification",
    "series_root_boundary_one_inconclusive.json": "needs_justification",
    "series_root_lt_one_false_divergence.json": "needs_justification",
    "series_root_gt_one_false_convergence.json": "needs_justification",
    "series_root_monomial_boundary_one.json": "needs_justification",
    "series_root_polynomial_boundary_one.json": "needs_justification",
    "series_root_nonpolynomial_needs_limit.json": "needs_justification",
}

EXPECTED_UNSUPPORTED: dict[str, str] = {}


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def require_kernel() -> None:
    if shutil.which("lake") is None:
        raise SystemExit(
            "kernel acceptance requires Lake/Lean; ordinary unit tests may run without it"
        )


def check_positive(name: str, max_seconds: int = 60) -> str | None:
    request = load_fixture(name)
    request.setdefault("policy", {})["max_seconds"] = max_seconds
    result = verify_request(request, project_dir=ROOT)
    if result.status != "verified" or not result.certificate:
        detail = result.stderr.strip() or result.stdout.strip() or result.message
        return f"{name}: expected verified, got {result.status}: {detail}"
    environment = result.certificate.get("environment", {})
    if environment.get("lean_toolchain") != LEAN_TOOLCHAIN:
        return f"{name}: certificate Lean toolchain drifted: {environment!r}"
    if environment.get("mathlib_revision") != MATHLIB_REV:
        return f"{name}: certificate mathlib revision drifted: {environment!r}"
    if not result.certificate.get("certificate_digest"):
        return f"{name}: verified result omitted certificate digest"
    return None


def check_rejection(name: str, expected: str) -> str | None:
    result = verify_request(load_fixture(name), project_dir=ROOT)
    if result.status != expected:
        return f"{name}: expected {expected}, got {result.status}: {result.message}"
    if result.certificate is not None:
        return f"{name}: rejected fixture unexpectedly carried a certificate"
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--jobs", type=int, choices=range(1, 5), default=1)
    parser.add_argument("--max-seconds", type=int, choices=range(1, 61), default=60)
    parser.add_argument("--fixture", action="append", help="Run only these positive fixtures.")
    args = parser.parse_args()
    classified = set(POSITIVE) | set(NEGATIVE) | set(EXPECTED_UNSUPPORTED)
    available = {path.name for path in (ROOT / "fixtures").glob("*.json")}
    if available != classified:
        parser.error(f"Fixture coverage drift: unclassified={sorted(available - classified)}, missing={sorted(classified - available)}")
    require_kernel()
    failures: list[str] = []
    print(f"Pinned Lean: {LEAN_TOOLCHAIN}")
    print(f"Pinned mathlib: {MATHLIB_REV}")

    positives = args.fixture or POSITIVE
    unknown = set(positives) - set(POSITIVE)
    if unknown:
        parser.error(f"Unknown positive fixtures: {sorted(unknown)}")
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        for name, error in zip(positives, pool.map(lambda name: check_positive(name, args.max_seconds), positives)):
            print(f"[{'FAIL' if error else 'PASS'}] kernel {name}", flush=True)
            if error:
                failures.append(error)
                print(error, flush=True)

    for group in (NEGATIVE, EXPECTED_UNSUPPORTED):
        for name, expected in group.items():
            error = check_rejection(name, expected)
            print(f"[{'FAIL' if error else 'PASS'}] {expected} {name}")
            if error:
                failures.append(error)

    if failures:
        print("\nKernel acceptance failures:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1

    print(
        f"\nKernel gate passed: {len(positives)} certified, "
        f"{len(NEGATIVE)} negative, {len(EXPECTED_UNSUPPORTED)} explicit boundary."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
