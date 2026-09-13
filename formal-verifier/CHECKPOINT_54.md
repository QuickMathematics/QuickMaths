# Checkpoint 54 — equal positive powers of shifted-factorial quotients

This checkpoint extends checkpoint 53 without adding any new factorial asymptotic theorem or Stirling approximation.

## Added

The automatic quotient-limit ratio reconstruction now accepts

`(p(n) / q(n)) * g(n) * (factorial(n+k) / factorial(n+m))^d`

and the equivalent split-power spelling

`(p(n) / q(n)) * g(n) * factorial(n+k)^d / factorial(n+m)^d`

for a fixed exact literal `1 <= d <= 64`. The polynomial/geometric conditions are unchanged from checkpoint 53.

Python records only the exact shifts and literal power. Lean still checks both `Nat.factorial_succ` recurrences, proves the base linear contribution `(n+k+1)/(n+m+1) -> 1`, and then derives its `d`-th power limit with `Filter.Tendsto.pow`. The submitted expression is related to the reconstructed model by exact algebra; no root approximation or Stirling estimate is trusted.

The strict ratio boundary is unchanged: the overall quotient-limit is still the normalized geometric absolute base `|r|`, so `|r| < 1` proves summability, `|r| > 1` proves non-summability, and `|r| = 1` stays inconclusive.

## Preserved boundaries

Unequal factorial powers such as `factorial(n+k)^2 / factorial(n+m)^3` remain unsupported automatically. Multiple factorial leaves in numerator position, non-affine factorial arguments such as `factorial(2*n)`, zero geometric bases, non-polynomial residual denominators, symbolic/zero powers, and general Stirling/factorial asymptotics remain outside this slice.

## Validation

Focused regressions cover split powers, whole-quotient powers, polynomial-quotient and multi-geometric composition, divergence for `|r| > 1`, the `|r| = 1` boundary, unequal-power refusal, non-affine factorial refusal, and the public `prove_text` path. No certificate is emitted without the pinned Lean/mathlib kernel.
