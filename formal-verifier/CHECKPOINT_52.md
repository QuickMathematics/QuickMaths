# Checkpoint 52 — polynomial quotient × geometric shifted-factorial quotient

This checkpoint extends checkpoint 51 by allowing one exact rational-coefficient polynomial denominator around the same exact shifted-factorial quotient. It still uses only ratio-test reconstruction and exact factorial recurrences; there is no Stirling approximation.

## Added

The quotient-limit ratio test can now reconstruct terms of the exact form

`(p(n) / q(n)) * r^n * factorial(n+k) / factorial(n+m)`

where `p` is one nonzero exact rational-coefficient polynomial of degree at most 64, `q` is either absent or one nonzero exact rational-coefficient polynomial of degree at most 64, `r` is one exact nonzero rational geometric base, and `k,m` are fixed bounded nonnegative shifts.

Lean reconstructs three asymptotic factors before applying the ratio test:

- `abs(p(n+1)) / abs(p(n)) -> 1`;
- `abs(q(n)) / abs(q(n+1)) -> 1` when `q` is present;
- `(n+k+1)/(n+m+1) -> 1` from two named `Nat.factorial_succ` recurrences.

The geometric factor contributes `abs(r)`, so the complete quotient limit is still `abs(r)`. The standard strict boundary is preserved: `< 1` proves summability, `> 1` proves non-summability, and `= 1` remains inconclusive.

## Trust boundary

Python records only exact polynomial coefficients, the exact rational base, the two factorial shifts, and concrete eventual-nonzero thresholds. Lean rebuilds `p(x)`, `p(x+1)`, `q(x)`, and `q(x+1)` as explicit `Polynomial ℝ` values, proves the two polynomial quotient limits, verifies both factorial recurrences, and checks the submitted term quotient with `field_simp`/`ring`. If `q` has early natural roots, the existing shifted-polynomial sign certificate proves both `q(n) != 0` and `q(n+1) != 0` on a concrete tail before division is simplified.

## Preserved boundaries

This slice intentionally does not absorb multiple geometric factors around the factorial quotient, powered or multiple factorial numerators, non-affine factorial arguments such as `factorial(2*n)`, symbolic shifts, non-polynomial denominators, or general Stirling asymptotics. The public nat-only inner-division ambiguity remains unchanged.

## Validation

Regressions cover summability, divergence, an early denominator root with current/successor tail certificates, the `abs(r) = 1` boundary, and the public `prove_text` path. No certificate is emitted without the pinned Lean/mathlib kernel.
