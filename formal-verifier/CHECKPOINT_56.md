# Checkpoint 56 — exact common factorial-power cancellation

This checkpoint extends checkpoint 55 only at the factorial-product normalization layer. It adds no new convergence theorem and no Stirling approximation.

## Added

Before the bounded powered shifted-factorial quotient matcher compares numerator and denominator power multisets, it now cancels exact common powers of the **same shifted factorial**. For example,

`factorial(n+1)^3 / (factorial(n+1) * factorial(n)^2)`

is recognized as the already-supported squared quotient family after one common `factorial(n+1)` power is cancelled.

The proof model deliberately retains each cancelled block as a neutral quotient

`factorial(n+k)^d / factorial(n+k)^d`

instead of deleting it from the generated proof. That means Lean still relates the learner's original submitted expression directly to the ratio model, proves the factorials nonzero, checks the exact `Nat.factorial_succ` recurrences, and verifies the neutral factor tends to `1`. Python is only doing exact integer multiplicity bookkeeping.

Multiple common shifts can cancel in one expression, and complete cancellation of a matched shifted-factorial power is also supported. The existing bounds remain in force: at most 8 normalized quotient factors and total matched power at most 64.

## Preserved boundaries

Cancellation does not license unmatched factorial growth. If, after same-shift cancellation, numerator and denominator factorial leaves still cannot be paired by equal positive literal powers, the automatic ratio reconstruction refuses the term. Non-affine factorial arguments, zero/symbolic powers, zero geometric bases, non-polynomial residual denominators, and broader factorial/Stirling asymptotics remain outside this slice.

## Validation

Focused regressions cover partial cancellation, multiple common shifts, full exact cancellation, unmatched-growth refusal, and the public `prove_text` path. The full verifier/app/browser formal gates remain green. No certificate is emitted without the pinned Lean/mathlib kernel.
