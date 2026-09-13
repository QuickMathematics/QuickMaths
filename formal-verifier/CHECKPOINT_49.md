# Checkpoint 49 — factorial / ordinary-denominator ordering normalization

This checkpoint removes one syntax-order limitation from the existing factorial quotient-limit ratio
family. It adds no new convergence theorem and no Stirling approximation.

## Added

A single supported shifted-factorial denominator leaf may now occur anywhere among ordinary
polynomial/geometric denominator factors after multiplication/division flattening. In particular,

`a_n / factorial(n+k)^m / q(n)`

and

`a_n / q(n) / factorial(n+k)^m`

normalize to the same factorial metadata and the same residual exact polynomial/geometric quotient.
This also covers exact constant denominator factors after the factorial.

## Trust boundary

Python only records which flattened denominator leaves are supported factorial factors and rebuilds
the remaining denominator expression. The submitted theorem is not canonicalized. If the factorial
is not the literal outer denominator, Lean uses the existing normalized factorial renderer, which
reconstructs the original left-associated expression, every factorial recurrence, the polynomial
successor ratios, and the geometric normalization before applying the ratio test.

True factorial quotients remain outside the automatic path. For example,

`a_n / (factorial(n) / factorial(n+1))`

places `factorial(n+1)` in numerator position after exact flattening and is therefore rejected.
Factorial numerators are rejected for the same reason.

## Preserved boundaries

The established source-size limits are unchanged: at most eight factorial denominator leaves, total
literal factorial power at most 64, exact fixed nonnegative shifts, no non-affine factorial arguments
such as `factorial(2*n)`, no zero/symbolic factorial powers, no factorial numerators, and no
Stirling/general factorial asymptotics.

## Validation

Regressions compare both denominator orderings, cover a constant denominator after one factorial,
exercise the public `prove_text` path, and preserve refusal of true factorial quotients/numerators.
No certificate is emitted without the pinned Lean/mathlib kernel.
