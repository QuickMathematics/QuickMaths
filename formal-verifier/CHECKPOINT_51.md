# Checkpoint 51 — polynomial × geometric shifted-factorial quotient

This checkpoint composes the first exact factorial-numerator cancellation from checkpoint 50 with the already kernel-reconstructed polynomial successor asymptotic. It does not use Stirling.

## Added

The quotient-limit ratio test can now reconstruct terms of the exact form

`p(n) * r^n * factorial(n+k) / factorial(n+m)`

where `p` is one nonzero exact rational-coefficient polynomial of degree at most 64, `r` is one exact nonzero rational geometric base, and `k,m` are fixed bounded nonnegative shifts. The constant-polynomial case remains on checkpoint 50's smaller renderer.

Lean reconstructs two independent factors:

- `abs(p(n+1)) / abs(p(n)) -> 1` from explicit `Polynomial ℝ` values with equal degree and leading coefficient;
- `(n+k+1)/(n+m+1) -> 1` from two named `Nat.factorial_succ` recurrences and a reciprocal tail.

The geometric factor contributes the constant `abs(r)`, so the full quotient limit remains `abs(r)`. Consequently `abs(r) < 1` proves summability, `abs(r) > 1` proves non-summability, and `abs(r) = 1` stays explicitly inconclusive.

## Trust boundary

Python records only exact polynomial coefficients, the exact rational base, the two factorial shifts, and a concrete eventual-nonzero threshold for `p`. Lean rebuilds `p(x)` and `p(x+1)`, checks their polynomial asymptotic, proves the submitted factorial recurrences, and checks the cancellation of the original term with `field_simp`/`ring`. If `p` has early natural roots, the existing shifted-polynomial sign certificate supplies the eventual nonzero proof rather than treating the polynomial as globally nonzero.

## Preserved boundaries

This slice intentionally does not absorb a nonconstant polynomial denominator around the factorial quotient, multiple geometric factors, powered or multiple factorial numerators, non-affine factorial arguments such as `factorial(2*n)`, symbolic shifts, or general Stirling asymptotics. The public nat-only inner-division ambiguity from checkpoint 50 is unchanged.

## Validation

Regressions cover summability, divergence, an early polynomial zero with an explicit tail threshold, the `abs(r) = 1` boundary, refusal of polynomial-denominator/multi-geometric residuals, and the public `prove_text` path. No certificate is emitted without the pinned Lean/mathlib kernel.
