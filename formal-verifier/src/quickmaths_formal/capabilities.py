from __future__ import annotations

from typing import Any

from .contract import CONTRACT_VERSION
from .rules import SUPPORTED_RULES
from .verifier import LEAN_TOOLCHAIN, MATHLIB_REV, VERIFIER_VERSION

_RULE_GROUPS = {
    "logic": [
        "true_intro", "and_intro", "and_elim_left", "and_elim_right",
        "or_intro_left", "or_intro_right", "or_elim", "modus_ponens",
        "iff_intro", "iff_mp", "iff_mpr", "contradiction", "false_elim",
        "imp_intro", "not_intro", "forall_intro", "forall_elim",
        "exists_intro", "exists_elim", "nat_induction",
    ],
    "equality": ["eq_refl", "eq_symm", "eq_trans", "eq_subst", "congr_arg"],
    "functions_sets": ["function_ext", "set_ext", "subset_intro", "subset_elim"],
    "algebra": [
        "ring_identity", "field_identity", "guarded_cancel", "norm_num", "linarith",
        "nlinarith", "positivity", "add_both_sides", "subtract_both_sides",
        "multiply_both_sides", "divide_both_sides", "square_both_sides",
        "add_inequality", "scale_inequality_positive", "scale_inequality_negative",
        "sub_ne_zero_from_ne", "sqrt_square_nonnegative", "conjugate_identity",
    ],
    "series": ["series_geometric", "series_p_series", "series_comparison", "series_ratio_test", "series_ratio_limit_test", "series_root_test"],
    "calculus": ["inverse_one_sided_limit", "rational_hole_limit", "conjugate_limit", "piecewise_jump", "continuity_limit", "limit_algebra", "sequence_nat_at_top", "sequence_algebra", "sequence_affine_ratio", "sequence_quadratic_ratio", "sequence_polynomial_degree_ratio", "sequence_rational_shift", "sequence_squeeze", "sequence_monotone_bounded", "sequence_elementary_divergence", "ivt_exists", "continuous_ivt_exists", "polynomial_derivative", "quotient_derivative", "sqrt_derivative", "abs_derivative", "exp_derivative", "log_derivative", "sin_derivative", "cos_derivative", "recursive_derivative"],
}


def capability_matrix() -> dict[str, Any]:
    grouped = {name: [rule for rule in rules if rule in SUPPORTED_RULES] for name, rules in _RULE_GROUPS.items()}
    grouped_rules = {rule for rules in grouped.values() for rule in rules}
    uncategorized = sorted(SUPPORTED_RULES - grouped_rules)
    if uncategorized:
        grouped["other"] = uncategorized
    return {
        "contract_version": CONTRACT_VERSION,
        "verifier_version": VERIFIER_VERSION,
        "foundation": {
            "backend": "Lean 4 + mathlib",
            "lean_toolchain": LEAN_TOOLCHAIN,
            "mathlib_revision": MATHLIB_REV,
            "certificate_requires_kernel": True,
        },
        "types": ["nat", "int", "rat", "real", "set[scalar]", "scalar->scalar"],
        "expressions": [
            "exact integers/rationals", "variables", "explicit real(...) numeric casts", "arithmetic", "literal/natural-index powers and exact rational real-exponent powers", "natural factorial", "sqrt", "abs",
            "exp", "log", "sin", "cos", "piecewise if", "declared unary function application",
        ],
        "propositions": [
            "equality/inequality", "membership/subset", "and/or/not", "implication/iff",
            "forall/exists", "bounded interval universal authoring sugar",
        ],
        "rule_groups": grouped,
        "outcomes": [
            "verified", "needs_justification", "refuted", "ambiguous_input", "unsupported",
            "search_limit_reached", "verification_unavailable", "engine_error",
        ],
        "advertised_families": {
            "algebra": ["polynomial identities", "guarded rational identities", "equation/inequality transformations"],
            "logic": ["nested subproofs", "cases", "quantifiers", "natural-number induction"],
            "functions_sets": ["function extensionality", "set extensionality", "subset reasoning"],
            "series": ["exact rational geometric series a*r^n: kernel-backed finite sums for |r| < 1 and explicit non-summability for |r| >= 1", "shifted p-series a/real(n+k)^p with k >= 1 and exact integer/rational 0 <= p <= 64: kernel-backed summability iff p > 1", "conservative nonnegative comparison test using a cited comparison-series theorem plus cited global or eventual pointwise domination", "conservative ratio test using a cited global or eventual bound |a_(n+1)| <= r|a_n| with exact rational 0 <= r < 1", "quotient-limit ratio test using an exact sequence limit abs(a_(n+1))/abs(a_n) -> L: convergence for rational 0 <= L < 1 with cited global/eventual nonzero terms or exact kernel-reconstructible polynomial/geometric tail guards, non-summability for rational L > 1 without a separate nonzero premise, automatic quotient-limit reconstruction when exact multiplication/division normalization reduces the term to (p(real(n))/q(real(n)))*r^n with nonzero rational-coefficient p,q of degree <= 64 and one nonzero rational base r, and factorial families through checkpoint 52: bounded products/powers of shifted-factorial denominators compose with exact polynomial quotients and normalized rational geometric factors, with every factorial recurrence reconstructed from Nat.factorial_succ and no Stirling approximation; the bounded numerator slice through checkpoint 58 supports (p(n)/q(n))*g(n) times normalized shifted-factorial powers for nonzero exact rational-coefficient p,q of degree <= 64 (q optional), a nonempty product/quotient g(n) of nonzero exact rational geometric powers, at most 8 normalized factorial blocks, literal powers 1 <= d_i <= 64, and total normalized factorial power <= 64. Exact common same-shift powers are cancelled first and balanced residual powers may be split deterministically across shifts as in checkpoint 57; checkpoint 58 additionally admits exactly one unmatched residual factorial power. One extra denominator factorial contributes 1/(n+k+1) -> 0, so the quotient-limit ratio test proves summability regardless of the nonzero rational geometric base; one extra numerator factorial contributes n+k+1 -> +∞, so Lean proves the norm ratio tends to atTop and applies not_summable_of_ratio_norm_eventually_ge with an eventual ratio lower bound. Python folds geometric bases only for exact search metadata while Lean independently checks the original geometric absolute value, polynomial successor ratios, every Nat.factorial_succ recurrence, and the original submitted factorial product. Polynomial numerator and denominator zeros use the existing kernel-checkable eventual tail certificates; residual imbalance of magnitude two or more, zero geometric factors, and non-polynomial denominators remain unsupported", "root test using an exact sequence limit abs(a_n)^(1/real(n)) -> L: summability for rational 0 <= L < 1, non-summability for rational L > 1, and L = 1 intentionally inconclusive; exact products/quotients of rational geometric factors are normalized to one rational base r around a nonzero rational-polynomial prefactor p(real(n))/q(real(n)) (degree <= 64), reconstructing the root limit abs(r) automatically, with kernel-checked automatic denominator guards for a conservative global/eventual nonzero fragment, including exact nonzero rational geometric powers via pow_ne_zero and exact rational polynomial factors through degree 64 after a concrete Nat threshold, using Lean-checked shifted-polynomial sign certificates"],
            "calculus": ["removable rational holes", "selected conjugate limits", "one-sided reciprocal infinities", "selected piecewise jumps", "polynomial IVT existence on exact intervals", "polynomial derivatives at specified real points", "guarded polynomial-quotient derivatives", "positive-domain sqrt-of-polynomial derivatives", "absolute-value-of-polynomial derivatives away from zero", "exp/log/sin/cos derivatives with polynomial inner functions and school-real log guards", "recursive compositional derivatives over arithmetic, powers, exp/log/sin/cos, guarded quotient/sqrt/abs nodes", "finite one-sided/two-sided limits by structural continuity/direct substitution", "compositional finite-limit algebra over shared filters with reusable finite sublimits and guarded quotient/log/sqrt composition", "finite sequence convergence over Nat.atTop with compositional algebra, shifted reciprocal tails, exact/cited |r|<1 geometric tails, reusable finite sequence sublimits, exact shifted/affine/quadratic ratios, general exact rational-coefficient polynomial ratios through degree 64, squeeze proofs with cited or standard sin/cos-over-positive-shift bounds, and monotone/bounded finite-limit existence with automatic exact geometric order evidence", "elementary sequence divergence via parity oscillation, exact modulo-periodic residue classes of period 2-4, finite prefixes followed by those exact periodic cores, automatic or cited common finite perturbation transport, and exact geometric growth/no-finite-limit classification", "natural-to-real shifted sequences diverging to +infinity", "IVT existence for structurally continuous expressions with exact intervals, kernel-checked endpoint brackets, and cited quantified interval-domain evidence"],
        },
        "explicitly_not_yet_advertised": [
            "general integrals and derivatives with piecewise/arbitrary declared functions", "general epsilon-delta automation", "irrational/symbolic p-series exponents, conditional convergence, automatic inequality synthesis, general automatic quotient/root-limit synthesis beyond exact rational polynomial-quotient-geometric ratio/root limits, and general series convergence",
            "synthetic geometry", "linear algebra/matrices", "measure-theoretic probability",
        ],
    }
