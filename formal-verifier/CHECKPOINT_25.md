# Checkpoint 25 — quotient-limit ratio test

## Scope

This checkpoint adds the quotient-limit form of the ratio test without weakening the explicit-evidence trust boundary introduced in Checkpoint 24.

The new `series_ratio_limit_test` rule proves only `series_sum(..., summable)` goals. For a target term `a(n)` it accepts:

1. a cited finite sequence-limit theorem for the exact quotient

```text
abs(a(n + 1)) / abs(a(n)) -> L
```

with exact rational `0 <= L < 1`; and
2. a cited global or eventual proof that `a(n) != 0`.

The nonzero requirement is not inferred from the quotient expression. This mirrors the actual mathlib theorem and prevents a zero denominator from being hidden by school-style quotient notation.

## Kernel reconstruction

The final Lean step uses the pinned theorem

```lean
summable_of_ratio_test_tendsto_lt_one
```

whose signature at mathlib revision `42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c` requires:

- `L < 1`;
- `∀ᶠ n in atTop, a n ≠ 0`;
- `Tendsto (fun n => ‖a (n+1)‖ / ‖a n‖) atTop (𝓝 L)`.

A cited learner theorem written with `abs` is transported with `Real.norm_eq_abs`. Global nonzero evidence is lifted with `Eventually.of_forall`; learner-facing `eventually k:nat, ...` evidence is opened as a threshold witness and converted with `eventually_ge_atTop`.

## Narrow automatic quotient reconstruction

To keep the rule executable end to end before general quotient simplification exists, one premise-free quotient-limit family is allowed: exact nonzero rational geometric terms `r^n` with `|r| < 1`. Lean proves their norm quotient is identically `|r|`, then applies the same ratio-limit theorem.

This automatic case is intentionally tiny. A non-geometric series with eventual nonzero terms but no cited quotient-limit theorem is still rejected.

## Reuse of earlier sequence theorems

When an exact earlier `sequence_limit` step for the quotient is available, proof search prefers that cited theorem and includes both its step ID and the nonzero-evidence ID in the final ratio-test premises. This creates the intended bridge between the existing sequence-limit subsystem and the new series rule without re-solving an already proved limit.

## Refusal boundary

The rule rejects before the kernel when:

- eventual/global nonzero evidence is missing or refers to a different term;
- the cited sequence theorem is not the exact absolute quotient of the target series;
- the cited limit is not an exact rational in `[0,1)`;
- a non-geometric target has no cited quotient-limit theorem;
- the goal asks for non-summability or an exact sum rather than summability.

Ratio-test divergence (`L > 1`), root tests, general automatic quotient simplification, and conditional convergence remain separate future work.

## Product integration

The lesson pack adds `FORMAL_SERIES_RATIO_LIMIT_001`. It asks for convergence of `(1/2)^n` using the quotient-limit ratio method and explicitly supplies eventual nonzero evidence. The direct geometric-series rule is not allowed for that lesson, so the public reference proof exercises `series_ratio_limit_test` itself.

## Validation

Final validation for this checkpoint:

- `30/30` focused series tests passed;
- `51/51` touched formal/app integration tests passed;
- `302/302` complete formal-verifier tests passed;
- `43/43` authored formal references reached `ready_for_kernel` and then `verification_unavailable` with Lean absent;
- `0` certificates were minted without Lean;
- the positive quotient-limit fixture reached `verification_unavailable`;
- all three quotient-limit refusal fixtures stopped at `needs_justification`.

## Next boundary

A natural next bite is the divergence side of the ratio test (`L > 1`), which mathlib also exposes directly. Keep the `L = 1` inconclusive boundary explicit rather than guessing, and leave root-test automation for a later checkpoint.
