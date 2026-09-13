# Checkpoint 53 — geometric normalization around shifted-factorial quotients

This checkpoint extends checkpoint 52 by reusing the exact rational geometric normalization already used by the ordinary ratio-test and factorial-denominator paths. It adds no new factorial asymptotic theorem and still uses no Stirling approximation.

## Added

The automatic quotient-limit ratio reconstruction now accepts

`(p(n) / q(n)) * g(n) * factorial(n+k) / factorial(n+m)`

where `p` and optional `q` are nonzero exact rational-coefficient polynomials of degree at most 64, `k,m` are fixed bounded nonnegative shifts, and `g(n)` is a nonempty product/quotient of exact nonzero rational geometric powers `r_i^n`.

Python folds those exact bases to one rational base `r` for search and classification. Lean does not trust that folding: it proves the absolute value of the original submitted geometric expression is `abs(r)^n` using `abs_mul`, `abs_div`, `abs_pow`, `mul_pow`, and `div_pow`, derives the successive geometric norm ratio `abs(r)`, and combines it with the already checked polynomial numerator/denominator successor ratios and shifted-factorial quotient recurrence.

The degree-zero residual case is supported too, so constant-geometric factorial quotients such as `factorial(n+1)*(1/2)^n*(1/3)^n/factorial(n)` use this normalized path without inventing a separate theorem family.

## Preserved boundaries

Zero geometric bases are rejected by the automatic path, the strict ratio boundary `L = 1` remains inconclusive, powered or multiple factorial numerators remain unsupported, non-affine factorial arguments such as `factorial(2*n)` remain unsupported, non-polynomial numerator/denominator factors still require cited limit evidence, and there is still no Stirling/general factorial asymptotic automation.

## Validation

Focused regressions cover geometric products, geometric denominator factors with combined base greater than one, degree-zero residuals, the `L = 1` boundary, zero-base refusal, and the public `prove_text` path. No certificate is emitted without the pinned Lean/mathlib kernel.
