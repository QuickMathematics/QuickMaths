# Checkpoint 11 — unequal-degree polynomial sequence ratios

Date: 11 September 2026

## Scope

This checkpoint adds exact degree comparison for rational sequences whose numerator and denominator are conservatively recognized real polynomials in `real(n)` of degree at most two.

The new `sequence_polynomial_degree_ratio` rule accepts only unequal degrees:

- `deg numerator < deg denominator` with claimed finite limit exactly `0`;
- `deg numerator > deg denominator` with claimed `+infinity` when the exact leading-coefficient ratio is positive;
- `deg numerator > deg denominator` with claimed `-infinity` when that ratio is negative.

Equal-degree affine and quadratic cases remain owned by the existing `sequence_affine_ratio` and `sequence_quadratic_ratio` rules.

## Trust boundary

Python performs only exact rational polynomial normalization, degree comparison, target/sign classification and proof planning. It does not certify the asymptotic result.

For a lower-degree numerator, generated Lean divides both polynomials by the denominator's leading power, reconstructs the `1/n` and `1/n^2` tails, proves the normalized numerator tends to zero and the normalized denominator tends to its nonzero leading coefficient, then uses `Tendsto.div`.

For a higher-degree numerator, generated Lean separately normalizes numerator and denominator to their leading coefficients. Their quotient tends to the exact nonzero leading ratio. The remaining positive power `n^(deg numerator - deg denominator)` tends to `Filter.atTop`; `Filter.Tendsto.pos_mul_atTop` or `Filter.Tendsto.neg_mul_atTop` then determines the signed infinite result. Eventual algebra reconnects that normalized expression to the learner's original ratio.

The pinned mathlib also contains general polynomial quotient asymptotic theorems, including `Polynomial.div_tendsto_atTop_zero_of_degree_lt`, `Polynomial.div_tendsto_atTop_of_degree_gt`, and `Polynomial.div_tendsto_atBot_of_degree_gt`. This checkpoint deliberately keeps QuickMaths' parser/matcher at degree at most two rather than silently advertising arbitrary polynomial syntax.

## Coverage

Positive fixtures cover:

- linear over quadratic -> `0`;
- positive quadratic over linear -> `+infinity`;
- negative-leading quadratic over linear -> `-infinity`;
- degree-gap-two quadratic over a negative constant -> `-infinity`.

Negative fixtures cover:

- the wrong infinity sign;
- a nonzero finite target when the correct limit is zero;
- equal-degree input incorrectly sent to the degree-comparison rule.

The experimental formal lesson pack adds `(2n+1)/(5n^2+3) -> 0` through the same public declarative bridge.

## Validation

Local validation for this checkpoint:

- focused sequence suite: **38/38 tests passed**;
- complete formal verifier: **238/238 tests passed**;
- touched QuickMaths app surfaces: **31/31 tests passed**;
- formal lesson/reference bridge: **30/30** reference proofs reach `ready_for_kernel`, **30/30** then stop at `verification_unavailable` with Lean absent, and **0** certificates are minted.

This container still has no Lean/Lake installation. Generated artifacts are therefore not called verified locally; the strict kernel-acceptance script has been extended so these cases must compile and certify in the pinned environment before a production gate can pass.

## Next small boundary

A coherent next slice is **general exact polynomial-ratio asymptotics beyond degree two**, ideally by translating the conservative coefficient form into mathlib `Polynomial` values and delegating degree/leading-coefficient behavior to mathlib's general quotient theorems. Keep series and unrelated analysis out of that checkpoint.
