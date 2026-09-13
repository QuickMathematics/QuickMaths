# Checkpoint 26 — quotient-limit ratio-test divergence

## Scope

This checkpoint completes the strict `L != 1` quotient-limit ratio-test split without adding a new proof family. The existing `series_ratio_limit_test` rule now handles both:

- `series_sum(..., summable)` when the exact absolute successive-term quotient tends to a rational `0 <= L < 1`, still with explicit global/eventual nonzero evidence; and
- `series_sum(..., not_summable)` when that quotient tends to an exact rational `L > 1`.

The boundary `L = 1` remains explicitly inconclusive.

## Kernel reconstruction

The convergence direction remains unchanged and delegates to the pinned theorem:

```lean
summable_of_ratio_test_tendsto_lt_one
```

The new divergence direction delegates to the pinned theorem:

```lean
not_summable_of_ratio_test_tendsto_gt_one
```

at mathlib revision `42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c`. Its signature needs only `1 < L` and the quotient-limit theorem. Mathlib derives eventual nonzero norms internally, so QuickMaths deliberately does **not** require a redundant nonzero premise in this direction.

## Evidence and automatic reconstruction

A non-geometric target still needs an exact earlier `sequence_limit` theorem for

```text
abs(a(n + 1)) / abs(a(n)) -> L
```

The narrow exact-geometric reconstruction from Checkpoint 25 is extended symmetrically: for exact rational `r^n`, the quotient is reconstructed as the constant `|r|`. Thus `|r| < 1` can exercise ratio-test convergence and `|r| > 1` can exercise ratio-test divergence. `|r| = 1` is not accepted by this rule.

## Refusal boundary

The rule rejects before the kernel when:

- the claimed quotient limit is exactly `1`;
- a `not_summable` claim has quotient limit below `1`;
- a `summable` claim has quotient limit at or above `1`;
- a non-geometric target lacks an exact cited quotient-limit theorem;
- the convergence direction lacks the explicit nonzero evidence required by mathlib.

Root tests, conditional convergence, symbolic/irrational p-series exponents, and broad quotient simplification remain outside this checkpoint.

## Product integration

The lesson pack adds `FORMAL_SERIES_RATIO_LIMIT_DIVERGENCE_001`, which asks learners to classify `sum 2^n` using only the quotient-limit ratio-test rule. The reference proof has no premises: QuickMaths reconstructs the constant quotient limit `L = 2`, then the kernel theorem proves non-summability.

## Validation

Final validation for this checkpoint:

- `35/35` focused series tests passed;
- `54/54` touched formal/app integration tests passed;
- `307/307` complete formal-verifier tests passed;
- `44/44` authored formal references reached `ready_for_kernel` and then `verification_unavailable` with Lean absent;
- `0` certificates were minted without Lean;
- the new `L > 1` fixture reached `verification_unavailable`;
- the `L = 1` and false `L < 1` divergence fixtures stopped at `needs_justification`.

## Next boundary

A clean next series bite is the root test, kept equally conservative: exact/cited root-limit evidence with the same strict `< 1` / `> 1` split and an explicit inconclusive boundary at `1`.
