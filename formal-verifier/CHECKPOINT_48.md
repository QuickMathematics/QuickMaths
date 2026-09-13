# Checkpoint 48 — sequential shifted-factorial denominator normalization

This checkpoint changes only syntax normalization for the existing multiple-factorial quotient-limit
ratio family. It adds no new convergence theorem and no Stirling approximation.

## Added

The automatic ratio path now treats left-associated denominator division such as

`a_n / factorial(n) / factorial(n+2)^2`

as the same factorial denominator metadata as

`a_n / (factorial(n) * factorial(n+2)^2)`.

The normalizer first flattens multiplication/division into numerator and denominator positions, peels
only supported exact shifted-factorial denominator leaves, and rebuilds every remaining factor as the
residual polynomial/geometric expression. This means the syntax composes with the existing exact
polynomial quotient and geometric normalization even when an ordinary denominator factor appears
between two factorial divisions.

## Trust boundary

Only syntax metadata is normalized in Python. The generated Lean theorem still targets the learner's
original left-associated expression. Every factorial recurrence is reconstructed from the original AST
with `Nat.factorial_succ`, and the established multi-factor proof checks the same reciprocal-linear
tails as before.

A factorial that is moved into numerator position by division is never peeled. In particular,

`a_n / (factorial(n) / factorial(n+1))`

remains unsupported automatically because flattening places `factorial(n+1)` in the residual
numerator. Factorial numerators therefore do not become supported as a side effect.

## Preserved boundaries

The existing limits remain unchanged: at most eight factorial denominator leaves, total literal
factorial power at most 64, exact fixed nonnegative shifts, no non-affine factorial arguments such as
`factorial(2*n)`, no factorial numerators, and no Stirling/general factorial asymptotics. A noncanonical
ordering containing only one factorial denominator leaf followed by another ordinary denominator is
also left unsupported in this checkpoint so the established single-factor renderer remains untouched.

## Validation

Regressions cover sequential two-factor division, mixed powers, composition with polynomial quotients
and geometric normalization, an ordinary denominator between factorial divisions, public `prove_text`
selection, preservation of the source-size budget, and refusal of true factorial quotients/numerators.
No certificate is emitted without the pinned Lean/mathlib kernel.
