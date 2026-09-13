# Checkpoint 04 — structural continuity, direct-substitution limits and broader IVT

Date: 10 September 2026

## Scope

This checkpoint adds a proof-producing continuity planner and consumes it in two new calculus rules: `continuity_limit` and `continuous_ivt_exists`. The goal is to reuse one explicit continuity/domain model instead of growing a catalog of unrelated limit and IVT special cases.

The structural continuity grammar covers constants/variables, negation, addition, subtraction, multiplication, division, natural powers, square roots, absolute value, `exp`, school-real `log`, `sin` and `cos`. Arbitrary function application and generic piecewise continuity remain unsupported.

## Trust decisions

- Continuity planning only proposes a candidate and the guards needed for that candidate. Lean remains the verifier.
- Division contributes a nonzero guard, square root contributes a nonnegative guard for continuity, and school-real logarithm contributes a strictly positive guard.
- Exact rational guards are reconstructed with `norm_num`; conservative syntax-obvious guards such as `x^2 + 1 ≠ 0` are reconstructed with `positivity`. Unknown guards are not guessed.
- `continuity_limit` first checks that the claimed finite limit matches direct substitution, then reconstructs `ContinuousAt` and obtains convergence on the requested neighborhood/filter from that proof.
- Absolute value is continuous at its kink. Thus `lim |x| = 0` at zero is supported even though the derivative engine correctly refuses to differentiate `|x|` at zero.
- `continuous_ivt_exists` proves existence only. It requires an exact interval, a structurally continuous function on that interval, and endpoint brackets for the target. It uses `intermediate_value_Icc`/`intermediate_value_Icc'` according to endpoint orientation.
- Interval-wide guards are currently accepted only when they can be reconstructed uniformly by the conservative automatic guard solver. Arbitrary quantified interval assumptions are deliberately deferred to a later checkpoint so they can be represented and scoped explicitly.

## Representative supported shapes

The acceptance corpus now includes examples equivalent to:

- `lim_{x→0} |x| = 0`;
- `lim_{x→2} log(exp(x)) = 2`;
- `lim_{x→0} 1/(x^2+1) = 1`;
- `lim_{x→0} sqrt(x^2) = 0`;
- the right-hand limit `sqrt(x) → 0` at zero with the school-real domain `x >= 0` preserved in the approach filter;
- an IVT existence proof for `1/(x^2+1) = 3/4` on `[0,1]`, with the denominator proved nonzero throughout the interval by Lean `positivity`;
- an IVT existence proof for `exp(x) = 1` on `[-1,1]` using explicit endpoint-bracket assumptions.

Negative fixtures cover an incorrect direct-substitution value, a logarithm school-domain violation, and an IVT request with missing endpoint brackets.

## Integration

Both rules are wired through the calculus matcher, local reasoner, preflight obligations, bounded proof search, proof-state blocker codes, capability reporting, deterministic Lean reconstruction, JSON fixtures and the real-kernel acceptance manifest.

`examples/MATH_FORMAL_002_verified_algebra_calculus.yaml` now contains 18 formal example questions. Four continuity-limit examples round-trip through lesson loading, proof-spec resolution, reference-proof RPC, formal text parsing and proof-state construction. All 18 examples reach `ready_for_kernel` in this environment.

## Validation

- Focused continuity-engine tests: **11 passed**.
- Formal verifier Python suite: **171 passed**.
- Full QuickMaths Python suite: **234 passed** in three bounded batches.
- Formal example bridge: **18/18** reached `ready_for_kernel`; verification status was **18/18 `verification_unavailable`** as expected because Lean is absent.
- Real Lean kernel compilation: **not run locally**. No certificate is minted in that state.

## Next slice

A natural continuation is first-class quantified interval-domain evidence. That would let IVT/continuity consume authored or learner-proved facts such as `∀ x ∈ [a,b], g(x) ≠ 0`, instead of limiting interval guards to facts `positivity` can reconstruct automatically. After that, the same continuity infrastructure can support more general limit algebra and sequence/epsilon-delta work.
