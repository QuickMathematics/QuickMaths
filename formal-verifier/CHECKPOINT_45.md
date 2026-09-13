# Checkpoint 45 — normalized geometric products in factorial ratio reconstruction

This checkpoint extends only the automatic quotient-limit reconstruction for the existing
`(p(n)/q(n))*r^n/factorial(n+k)` family. It does not add a new factorial theorem or Stirling
approximation.

## Added

Before applying the shifted-factorial ratio proof, multiplication/division is flattened and each
exact nonzero rational geometric factor `r^n` is folded into one exact rational base. This covers
forms such as:

- `p(n) * (1/2)^n * (1/3)^n / factorial(n+k)`;
- `(p(n)/q(n)) * (1/2)^n * (1/3)^n / factorial(n+k)`;
- `(1/2)^n / (1/3)^n / factorial(n+k)`.

The combined geometric base may have absolute value greater than one: factorial growth still makes
the successive norm quotient tend to zero. A zero geometric base is deliberately not normalized
through this automatic ratio path.

## Trust boundary

Python performs only exact rational multiplication/division and the already-established exact
polynomial normalization. The generated Lean artifact independently proves, for the original
geometric product/quotient `g(n)`, that `|g(n)| = |r|^n` using `abs_mul`, `abs_div`, `abs_pow`,
`mul_pow`, and `div_pow`. It then derives `|g(n+1)| / |g(n)| = |r|` and combines that checked
identity with the polynomial successor quotient(s) and `Nat.factorial_succ`. Existing kernel-checked
eventual nonzero certificates remain responsible for polynomial cancellation.

## Preserved boundaries

Factorial numerators, non-affine factorial arguments such as `factorial(2*n)`, non-polynomial
polynomial-quotient factors, zero geometric factors, and broader Stirling/factorial asymptotics stay
outside automatic reconstruction.

## Validation

Focused regressions cover geometric products, a geometric denominator with combined base `3/2`,
composition with a polynomial quotient and shifted factorial, zero-base refusal, and the public
`prove_text` protocol. No certificate is emitted without the pinned Lean/mathlib kernel.
