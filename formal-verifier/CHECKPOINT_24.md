# Checkpoint 24 — conservative series ratio test

## Scope

This checkpoint adds one deliberately narrow infinite-series theorem family: convergence by a cited successive-term ratio bound.

The new `series_ratio_test` rule accepts only a `series_sum` goal whose result is `summable`, together with one cited proposition proving either globally or eventually that

```text
abs(a(k + 1)) <= r * abs(a(k))
```

for the exact target term `a`, where `r` is an exact rational satisfying `0 <= r < 1`.

No ratio inequality is synthesized. The rule does not divide by the current term, so zero terms do not create a hidden domain assumption. This is intentionally the bound form of the ratio test, not yet the quotient-limit form.

## Kernel reconstruction

Lean reconstructs the final proof with the pinned mathlib theorem

```lean
summable_of_ratio_norm_eventually_le
```

and converts real norms to absolute values with `Real.norm_eq_abs`.

Global evidence is lifted with `Filter.Eventually.of_forall`. Learner-facing `eventually k:nat, ...` evidence is the existing transparent threshold encoding `∃ N, ∀ k >= N, ...`; Lean opens that witness and uses `Filter.eventually_ge_atTop N`.

The exact theorem name/signature was checked against the pinned mathlib revision `42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c`.

## Positive coverage

The strict corpus adds:

- `series_ratio_eventual_linear_geometric_summable.json`: `(n+1)(1/2)^n`, using the true eventual ratio bound `3/4` from `n >= 1`;
- `series_ratio_global_geometric_summable.json`: `(1/3)^n`, using a global ratio bound `1/3`.

The first case is intentionally not an exact geometric series, so the new rule demonstrates convergence of a family not handled by the existing geometric-series matcher.

## Refusal boundary

The rule refuses before the kernel when:

- the ratio-bound evidence is missing;
- the supplied factor is `r = 1` rather than strictly below one;
- the inequality points in the wrong direction;
- the goal is not a summability classification;
- the evidence does not refer to the exact target term and natural index.

The quotient-limit ratio test `abs(a_(n+1))/abs(a_n) -> L < 1`, automatic inequality synthesis, root tests, and divergence ratio tests remain separate future work.

## Product integration

The formal lesson pack now contains `FORMAL_SERIES_RATIO_TEST_001`, asking whether

```text
real(n + 1) * (1/2)^n
```

is summable given the eventual `3/4` successive-term bound. Its reference proof cites assumption `h1` explicitly and invokes only `series_ratio_test`.

## Validation

Final validation for this checkpoint:

- `24/24` focused series tests passed;
- `45/45` touched formal/app integration tests passed;
- `296/296` complete formal-verifier tests passed;
- both positive ratio fixtures reached `verification_unavailable` with Lean absent;
- all three negative ratio fixtures stopped at `needs_justification`;
- `42/42` authored formal references reached `ready_for_kernel` and then `verification_unavailable`;
- `0` certificates were minted without Lean.

## Next boundary

The next contained extension is the quotient-limit form of the ratio test: reuse or reconstruct a finite sequence limit for `abs(a_(n+1))/abs(a_n) -> L`, require the mathematically necessary eventual nonzero condition, and derive summability for exact `L < 1` without weakening the school-domain trust boundary.
