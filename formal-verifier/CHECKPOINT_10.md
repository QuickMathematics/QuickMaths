# Checkpoint 10 — exact quadratic sequence ratios

Date: 11 September 2026

## Scope

This checkpoint adds one degree-aware sequence family beyond the affine ratios from Checkpoint 09:

`(a + b*real(n) + c*real(n)^2) / (d + e*real(n) + f*real(n)^2) -> c/f`

for exact rational coefficients with `c != 0` and `f != 0`. Both numerator and denominator must have degree exactly two after exact normalization. Expanded, reordered, negated, rationally scaled, and factored degree-two syntax is accepted conservatively. Lower-degree or degree-greater-than-two expressions stay outside this rule.

## Trust boundary

The Python matcher only recognizes the exact degree-two shape and checks the claimed target is exactly the ratio of quadratic coefficients. It does not certify the convergence theorem.

Generated Lean normalizes the ratio by `n^2`, reconstructs

- `1 / real(n) -> 0`,
- `(1 / real(n))^2 -> 0`,
- the resulting numerator and denominator finite limits, and
- division by the nonzero denominator leading coefficient,

then proves eventual pointwise equality back to the learner's original expression for positive natural indices. The certificate remains impossible unless the pinned Lean kernel accepts the generated artifact.

The pinned mathlib revision also contains the general equal-degree polynomial quotient theorem `Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq`; this checkpoint deliberately keeps QuickMaths' advertised matcher at degree exactly two rather than silently broadening to arbitrary polynomials.

## End-to-end integration

`sequence_quadratic_ratio` is wired through:

- exact degree-at-most-two coefficient normalization;
- proof-state obligations and repair feedback;
- candidate reasoner;
- bounded search suggestions;
- semantic domain-requirement handling for the bound natural index;
- deterministic Lean rendering;
- capability advertisement;
- public `prove_text`;
- strict kernel-acceptance fixtures;
- the experimental formal lesson pack.

The lesson corpus now includes `(3n^2+2n+1)/(5n^2-4n+7) -> 3/5`.

## Negative behavior

The rule rejects before the kernel when:

- the target is not the exact quadratic-coefficient ratio;
- either numerator or denominator is not degree exactly two;
- an index-dependent denominator occurs inside a polynomial component;
- an operation expands beyond degree two or is outside the conservative grammar.

In particular, a linear-over-quadratic sequence tending to zero is mathematically valid but intentionally **not** accepted by this equal-degree rule. That belongs to the next degree-comparison checkpoint.

## Validation

Local validation for this checkpoint:

- formal verifier: **233/233 tests passed**;
- focused sequence suite: **33/33 tests passed**;
- touched QuickMaths app surfaces: **31/31 tests passed** in proportional batches (2 formal examples, 9 content loader, 8 formal bridge, 12 problem generator);
- positive fixtures cover ordinary, negative-leading, and factored/rational-coefficient quadratics;
- negative fixtures cover a wrong target and a lower-degree numerator;
- public protocol coverage confirms automatic selection and the honest `verification_unavailable` outcome when Lean is absent;
- formal lesson/reference bridge: **29/29** references reach `ready_for_kernel`, **29/29** then stop at `verification_unavailable`, and **0** certificates are minted.

This container still has no Lean/Lake installation, so no local result is called `verified` and no certificate is minted. The generated quadratic artifacts still require the real kernel gate.

## Next small boundary

The next coherent slice is **unequal-degree polynomial-ratio sequence behavior**. Start with exact degree comparisons for the same degree-at-most-two grammar: numerator degree lower than denominator should converge to `0`; numerator degree higher than denominator should classify signed `+infinity`/`-infinity` only when the leading-coefficient sign makes that conclusion unambiguous. Keep infinite series out of that checkpoint.
