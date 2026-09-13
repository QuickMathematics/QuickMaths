# Checkpoint 22 — conservative nonnegative series comparison

Date: 11 September 2026

## Scope

This checkpoint adds one deliberately evidence-driven comparison rule for nonnegative real series. It does **not** add a general inequality solver, ratio/root tests, alternating-series criteria, conditional convergence, or real-exponent p-series.

The rule proves only `summable` or `not_summable` goals and requires two cited inputs:

1. a previously proved comparison-series theorem over the same natural index; and
2. an explicit global or eventual nonnegative pointwise bound in the correct direction.

For convergence, the evidence must establish `0 <= target(k) <= comparison(k)` and the cited comparison series must be summable (an exact `HasSum` theorem also qualifies via `.summable`). For divergence, the evidence must establish `0 <= comparison(k) <= target(k)` and the cited comparison series must be explicitly nonsummable.

No comparison inequality is synthesized by Python. Missing, reversed, or mismatched evidence is rejected before kernel verification.

## Lean reconstruction

The exact pinned mathlib revision provides:

```lean
Summable.of_nonneg_of_le
```

for global nonnegative pointwise comparison, and:

```lean
Summable.of_norm_bounded_eventually_nat
```

for eventual domination on `Nat.atTop`.

The convergence direction applies the cited summable majorant theorem directly. The divergence direction assumes the target were summable, transports summability down to the cited nonsummable minorant, then closes the contradiction with that cited theorem. Eventual evidence is converted from QuickMaths' transparent `exists N, forall k >= N` proposition into a Lean `Filter.Eventually` bound.

## Acceptance corpus

Positive cases:

- `((1/2)^n)^2` is summable from an eventually cited bound by `(1/2)^n` plus the cited exact geometric sum;
- `real(n+1)` is not summable because it dominates the cited harmonic series.

Negative/boundary cases:

- the comparison series is cited but the inequality evidence is missing;
- the inequality is supplied in the wrong direction.

## Product integration

The formal lesson pack now includes a comparison-test convergence problem. Its reference proof first proves the geometric majorant, then invokes `series_comparison` with both `reference_step_1` and assumption `h1` as explicit premises. The assumption uses learner-facing `eventually k:nat, ...` syntax, exercising the public eventual-evidence contract end to end.

## Validation

Final packaged-state validation:

- `15/15` focused series tests passed;
- `34/34` touched formal/app integration tests passed;
- `287/287` complete formal-verifier tests passed;
- both positive comparison fixtures reached `verification_unavailable` with Lean absent;
- both negative comparison fixtures stopped at `needs_justification`;
- `40/40` authored formal references reached `ready_for_kernel` and then `verification_unavailable`;
- `0` certificates were minted without the kernel.

The runtime still has no Lean/Lake, so successful proof candidates must stop at `verification_unavailable` and must not mint certificates. The comparison theorem names used by generated artifacts were checked against the exact pinned mathlib revision `42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c`.

## Next boundary

The next series checkpoint should stay separate: either real-exponent p-series or a ratio/root-test slice. Automatic inequality derivation for comparison should also remain a distinct later checkpoint so the trust boundary stays explicit.
