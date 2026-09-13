# Checkpoint 50 — exact shifted-factorial numerator cancellation

This checkpoint adds the first deliberately bounded factorial-numerator family. It does not use
Stirling or any approximate factorial asymptotic.

## Added

The quotient-limit ratio test can now reconstruct terms of the exact form

`c * r^n * factorial(n+k) / factorial(n+m)`

with nonzero exact rational `c,r` and fixed bounded nonnegative shifts `k,m`. Multiplication/division
flattening also recognizes the equivalent typed-AST placement produced by dividing by a factorial
quotient. The factorials are unpowered in this first numerator slice, and no additional polynomial
prefactor is admitted.

The successive factorial quotient is checked directly in Lean:

`((n+k+1)!/(n+m+1)!) / ((n+k)!/(n+m)!) = (n+k+1)/(n+m+1)`.

The linear ratio tends to `1`, so the complete successive norm quotient tends to `abs(r)`. Therefore
`abs(r) < 1` proves summability, `abs(r) > 1` proves non-summability, and `abs(r) = 1` remains
explicitly inconclusive.

## Trust boundary

Python records only the exact coefficient/base and the two fixed factorial shifts. The generated Lean
artifact separately proves the numerator and denominator `Nat.factorial_succ` recurrences, proves the
linear factors nonzero/positive, cancels the original submitted expression with `field_simp`/`ring`,
and derives `(n+k+1)/(n+m+1) -> 1` from a reciprocal tail.

The public typed text protocol still rejects a nested *natural-only* division such as
`factorial(n)/factorial(n+1)` as ambiguous division. The direct real-valued series spelling
`factorial(n+k) * r^n / factorial(n+m)` is supported end-to-end. The lower-level normalized AST
matcher also handles equivalent quotient placement once types are already explicit.

## Preserved boundaries

Powered factorial numerators, multiple numerator factorials, non-affine factorial arguments such as
`factorial(2*n)`, extra polynomial factors around the factorial quotient, symbolic shifts, and general
factorial/Stirling asymptotics remain outside this checkpoint. The `L = 1` ratio-test boundary remains
inconclusive.

## Validation

Regressions cover both shift directions, a nested typed-AST quotient placement, `abs(r) > 1`
divergence, the `abs(r) = 1` boundary, narrow-scope refusals, and the public `prove_text` path. No
certificate is emitted without the pinned Lean/mathlib kernel.
