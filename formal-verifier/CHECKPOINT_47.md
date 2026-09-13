# Checkpoint 47 — multiple shifted-factorial denominator ratio reconstruction

This checkpoint extends only the existing factorial quotient-limit ratio family from one shifted
factorial factor to a bounded product of shifted-factorial factors. It does not add Stirling
approximation or a new convergence theorem.

## Added

The automatic ratio path now recognizes

`(p(n)/q(n)) * g(n) / Π_i factorial(n+k_i)^m_i`

when the denominator is written as a product of at most eight exact shifted-factorial leaves,
`0 <= k_i <= 10000`, each `1 <= m_i <= 64`, with total literal factorial power at most 64. `p,q`
remain the existing exact nonzero rational-coefficient polynomials and `g(n)` remains the existing
product/quotient of exact nonzero rational geometric powers.

The successive factorial contribution is reconstructed as

`Π_i 1 / (n+k_i+1)^m_i -> 0`.

The established polynomial successor ratios still tend to one, and exact geometric normalization
still contributes the constant `abs(r)`, so the complete successive norm quotient tends to zero.

## Trust boundary

Python only flattens a multiplication-only factorial denominator and extracts exact shifts and
literal powers. The generated Lean artifact rebuilds every submitted factorial argument, rewrites
each successor with `Nat.factorial_succ`, checks powered recurrences with `mul_pow`, proves each
reciprocal-linear factor tends to zero, and combines those limits with `Filter.Tendsto.mul`.
Polynomial and geometric components continue to be reconstructed independently in Lean.

The multi-factor renderer is a separate branch; the already-tested single-factor and powered
single-factor proofs are left unchanged.

## Preserved boundaries

A denominator containing division between factorial factors, a non-factorial leaf, a non-affine
factorial argument such as `factorial(2*n)`, exponent zero, symbolic powers, more than eight
factorial leaves, or total literal factorial power above 64 is not classified by this automatic
path. Factorial numerators and broader factorial/Stirling asymptotics remain future work.

## Validation

Regressions cover two shifted factorials, mixed powers, composition with a polynomial quotient and
multiple geometric factors, reuse of polynomial tail certificates, public `prove_text` selection,
and conservative refusal of non-affine/non-product/over-budget denominators. No certificate is
emitted without the pinned Lean/mathlib kernel.
