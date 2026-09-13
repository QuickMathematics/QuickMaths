# Checkpoint 31 — normalize equivalent exact geometric root-test forms

This checkpoint stays inside the existing n-th-root test. It does **not** add a new convergence theorem.

## Added

Before polynomial-quotient root reconstruction, multiplication and division are flattened and every exact rational geometric factor `r^n` is folded into one exact rational base:

- `(1/2)^n * (1/3)^n` normalizes to base `1/6`;
- `(p(n) / q(n)) * r^n` keeps base `r`;
- `p(n) / (q(n) * 2^n)` normalizes to the same asymptotic family with base `1/2`;
- several numerator/denominator geometric factors combine by exact rational multiplication/division.

The residual prefactor must still be `p(real(n))/q(real(n))` with nonzero rational-coefficient polynomials of degree at most 64. Lean reconstructs the polynomial roots as before, proves the exact geometric-factor identity, and then combines the limits.

## Domain boundary

A geometric factor moved from a denominator is only inverted when its exact rational base is nonzero. A zero geometric denominator is not normalized through Lean's totalized division.

School-domain denominator requirements remain explicit. When the denominator as actually written is manifestly positive on natural indices (for example `(real(n)+1) * 2^n`), the generated artifact includes an explicit `positivity` proof and the requirement is discharged. Sign-ambiguous/nontrivial denominators still require evidence.

## Root-test boundary

`L = 1` remains inconclusive. For example `2^n * (1/2)^n` is recognized as geometric base `1`, but it is **not** classified as summable or nonsummable by the root test.

## Validation

Validation for this checkpoint: **333/333** formal-verifier tests pass, plus **11/11** browser/formal-client integration subtests across the two touched integration test files. Focused regression coverage includes geometric products, a geometric factor in a polynomial denominator, the `L = 1` boundary, a zero geometric denominator, a sign-ambiguous denominator guard, and public text-protocol routing. This runtime still has no Lean/Lake binary, so generated artifacts reach `verification_unavailable` rather than minting certificates.
