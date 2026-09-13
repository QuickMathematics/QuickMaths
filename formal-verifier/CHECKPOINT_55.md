# Checkpoint 55 — products of powered shifted-factorial quotients

This checkpoint extends checkpoint 54 without adding any new factorial asymptotic theorem or Stirling approximation.

## Added

The automatic quotient-limit ratio reconstruction now accepts a bounded product

`(p(n) / q(n)) * g(n) * Π_i (factorial(n+k_i) / factorial(n+m_i))^d_i`

where each shift is an exact bounded nonnegative integer, every literal power satisfies `1 <= d_i <= 64`, at most 8 factorial-quotient factors are present, and the total matched power is at most 64. The established checkpoint-53 polynomial/geometric conditions remain unchanged.

Both whole-quotient powers and split numerator/denominator powers normalize into the same exact metadata. The numerator and denominator factorial power multisets must match exactly; unequal growth is not guessed.

Python records only the exact triples `(k_i, m_i, d_i)`. For every factor Lean independently checks both `Nat.factorial_succ` recurrences, proves

`((n+k_i+1)/(n+m_i+1))^d_i -> 1`

using the exact linear ratio and `Filter.Tendsto.pow`, multiplies those limits, and then combines them with the existing polynomial-quotient and original-geometric-expression ratio reconstruction. The submitted expression is related to the model by exact algebra and nonzero certificates; no Stirling estimate or numerical root approximation is trusted.

The strict ratio boundary is unchanged: the overall quotient limit remains the normalized exact geometric absolute base `|r|`, so `|r| < 1` proves summability, `|r| > 1` proves non-summability, and `|r| = 1` remains inconclusive.

## Preserved boundaries

Factorial numerator and denominator power multisets that do not match remain unsupported automatically. Non-affine factorial arguments such as `factorial(2*n)`, zero geometric bases, non-polynomial residual denominators, symbolic/zero powers, more than 8 quotient factors, total matched factorial power above 64, and general Stirling/factorial asymptotics remain outside this slice.

The lower-level parser can represent a whole nat-only quotient power such as `(factorial(n+1)/factorial(n))^2`; the public protocol still preserves its existing ambiguity rule for inner natural-number division, so split-power spellings remain the reliable public form when no surrounding real-valued operation disambiguates `/`.

## Validation

Focused regressions cover products of whole quotient powers, split-power normalization, polynomial-quotient and multi-geometric composition, divergence for `|r| > 1`, the `|r| = 1` boundary, unequal-power refusal, factor-count/total-power caps, and the public `prove_text` path. No certificate is emitted without the pinned Lean/mathlib kernel.
