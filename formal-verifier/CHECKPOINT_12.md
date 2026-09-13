# Checkpoint 12 — general exact polynomial sequence ratios

Date: 11 September 2026

## Scope

This checkpoint removes the degree-two ceiling from the general polynomial-ratio sequence rule while keeping the change bounded to exact rational-coefficient polynomials in `real(n)`.

`sequence_polynomial_degree_ratio` now conservatively normalizes polynomial syntax through degree 64 and supports:

- lower numerator degree -> finite limit exactly `0`;
- equal degree from degree 3 upward -> the exact ratio of leading coefficients;
- higher numerator degree -> `+infinity` or `-infinity` from the sign of the exact leading-coefficient ratio.

The existing affine and quadratic equal-degree rules remain first-choice rules for degrees one and two. They are not shadowed by the general fallback.

Accepted syntax includes exact rational constants, `real(n)`, addition/subtraction/negation, products, nonnegative integer powers, factorized expressions, and division by nonzero exact rational constants. Index-dependent denominators and non-polynomial functions remain outside the classifier. Expanded degree above 64 is rejected before proof generation.

## Trust boundary

Python performs exact rational coefficient recovery, bounded polynomial expansion, degree comparison, target classification, and proof planning only. It does not certify the asymptotic statement.

Generated Lean now rebuilds the normalized coefficients as explicit `Polynomial ℝ` values. Lean then:

1. uses `compute_degree!` to establish the exact polynomial degrees;
2. reconstructs exact leading coefficients when the selected theorem needs them;
3. applies mathlib's general polynomial quotient limit theorem over real `atTop`;
4. composes that theorem with `tendsto_natCast_atTop_atTop` for natural-index sequences;
5. proves by exact algebra that the polynomial evaluations are the learner's original numerator and denominator.

The pinned mathlib revision contains the required general results:

- `Polynomial.div_tendsto_atTop_zero_of_degree_lt`;
- `Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq`;
- `Polynomial.div_tendsto_atTop_of_degree_gt'`;
- `Polynomial.div_tendsto_atBot_of_degree_gt'`;
- the `compute_degree` tactic for explicit polynomial degree/coefficient goals.

No Python-side successful match becomes a certificate without the Lean kernel accepting the generated artifact.

## Coverage

New positive fixtures cover:

- equal degree five with finite target `3/2`;
- a factored cubic over a degree-six polynomial tending to `0`;
- degree seven over degree three tending to `+infinity`.

New negative fixtures cover:

- the wrong finite target for equal high degree;
- an identically zero denominator after exact polynomial cancellation;
- a contract-valid expression whose expanded polynomial degree is 65 and therefore exceeds this verifier boundary.

The experimental formal lesson pack adds

`(3n^5 - 2n^2 + 1)/(2n^5 + 7n - 4) -> 3/2`

through the same public declarative bridge.

## Validation

Local validation for this checkpoint:

- focused sequence suite: **42/42 tests passed**;
- complete formal verifier: **242/242 tests passed**;
- touched QuickMaths loader/bridge/example surfaces: **19/19 tests passed**;
- formal lesson/reference bridge: **31/31** reference proofs reach `ready_for_kernel`, **31/31** then stop at `verification_unavailable` with Lean absent, and **0** certificates are minted.

This container still has no Lean/Lake installation. The new generated artifacts are therefore not described as locally kernel-verified. The strict kernel-acceptance corpus now includes the high-degree positive and negative fixtures so a Lean-capable environment must compile them before a production gate can pass.

## Next small boundary

A coherent next slice is **automatic order-derived sequence estimates**: derive simple eventual bounds needed by squeeze/monotone arguments instead of requiring every inequality to be lesson-authored. Keep infinite series and general epsilon-delta reasoning outside that checkpoint.
