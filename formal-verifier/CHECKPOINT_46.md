# Checkpoint 46 — powered shifted-factorial denominator ratio reconstruction

This checkpoint extends only the existing factorial quotient-limit ratio family from one shifted
factorial to a fixed positive literal power of that factorial. It does not add Stirling
approximation or a new convergence theorem.

## Added

The automatic ratio path now recognizes

`(p(n)/q(n)) * g(n) / factorial(n+k)^m`

where `p,q` are the existing exact nonzero rational-coefficient polynomials, `g(n)` is the existing
normalized product/quotient of exact nonzero rational geometric powers, `k >= 0` is the existing
bounded fixed shift, and `1 <= m <= 64` is a literal natural exponent. The unpowered denominator is
still exponent one.

The successive factorial contribution is reconstructed as

`1 / (n+k+1)^m -> 0`.

The polynomial successor ratios still tend to one, and the exact geometric normalization still
contributes the constant `abs(r)`, so the complete successive norm quotient tends to zero.

## Trust boundary

Python extracts only the exact shift and literal power. The generated Lean artifact rewrites
`factorial(n+k+1)` with `Nat.factorial_succ`, uses `mul_pow` to verify the powered recurrence, proves
the reciprocal tail tends to zero, and invokes `Filter.Tendsto.pow` for the fixed positive exponent.
Existing polynomial tail certificates and geometric absolute-value normalization remain unchanged.
No root approximation or Stirling estimate is trusted from Python.

## Preserved boundaries

Exponent zero is deliberately not classified as a factorial-decay case. Symbolic powers, powers
above the existing literal-power cap, factorial numerators, and non-affine factorial arguments such
as `factorial(2*n)^m` remain outside automatic reconstruction. Broader factorial/Stirling asymptotics
remain future work.

## Validation

Regressions cover a pure squared-factorial denominator, a shifted cubed-factorial denominator
composed with a polynomial quotient and multiple geometric factors, reuse of polynomial tail
certificates, explicit exponent one, zero-power/non-affine refusal, and the public `prove_text`
protocol. No certificate is emitted without the pinned Lean/mathlib kernel.
