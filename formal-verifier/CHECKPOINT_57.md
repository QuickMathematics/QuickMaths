# Checkpoint 57 — exact factorial-power splitting after cancellation

This checkpoint extends checkpoint 56 only at the factorial multiplicity-normalization layer. It adds no new convergence theorem and no Stirling approximation.

## Added

After exact same-shift factorial powers are cancelled, the bounded shifted-factorial quotient matcher now requires the remaining **total** numerator and denominator factorial powers to agree, but no longer requires the original power leaves to match one-for-one.

For example,

`factorial(n+3)^3 / (factorial(n+1) * factorial(n)^2)`

is partitioned exactly into the already-supported quotient factors

`(factorial(n+3) / factorial(n+1)) * (factorial(n+3) / factorial(n))^2`.

The partition is deterministic exact integer bookkeeping. It also works in the opposite direction, such as several numerator shifts matching one denominator power, and composes with checkpoint 56 same-shift cancellation.

The generated Lean theorem still targets the learner's original expression. The split factors exist only as proof metadata: Lean proves the original factorial products equal the ratio model using exact factorial nonzero facts, `Nat.factorial_succ`, `field_simp`, and ring normalization, then proves each powered linear quotient tends to `1` and multiplies those limits.

## Preserved boundaries

The residual numerator and denominator **total factorial powers must be exactly equal** after same-shift cancellation. Any total-power mismatch is rejected. Existing caps remain unchanged: at most 8 normalized quotient factors and total matched power at most 64. Non-affine factorial arguments, zero/symbolic powers, zero geometric factors, non-polynomial residual denominators, and broader factorial/Stirling asymptotics remain outside this slice.

## Validation

Focused regressions cover one-to-many power splitting, many-to-one splitting, composition with common-power cancellation, residual total-power mismatch, and the public `prove_text` path. The full verifier/app/browser formal gates remain green. No certificate is emitted without the pinned Lean/mathlib kernel.
