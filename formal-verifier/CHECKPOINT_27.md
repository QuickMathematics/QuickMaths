# Checkpoint 27 — n-th-root series test

This checkpoint adds one bounded theorem family to the first-class `series_sum` goal: the ordinary n-th-root test.

## Supported shape

For a real series term `a(n)`, the rule `series_root_test` recognizes an exact finite sequence-limit theorem

`abs(a(n))^(1 / real(n)) -> L`.

The classification boundary is deliberately strict:

- exact rational `0 <= L < 1` proves `summable`;
- exact rational `L > 1` proves `not_summable`;
- `L = 1` is intentionally inconclusive.

A cited root-limit theorem may be used for an arbitrary supported real term. The only premise-free root-limit reconstruction is the transparent exact geometric family `r^n`, whose n-th-root statistic is eventually `abs(r)`.

## Kernel reconstruction

The project is still pinned to Lean `v4.34.0-rc2` and mathlib revision `42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c`.

For `L < 1`, Lean chooses the exact midpoint `q = (L + 1) / 2`, obtains the eventual bound `abs(a(n))^(1/n) <= q`, raises both sides to the natural power `n`, and recovers `abs(a(n))` using mathlib's `Real.rpow_inv_natCast_pow`. This yields eventual domination by the summable geometric series `q^n`, discharged through `Summable.of_norm_bounded_eventually_nat`.

For `L > 1`, Lean chooses the same midpoint `q`, now with `1 < q < L`. Eventually `q <= abs(a(n))^(1/n)`, hence `q^n <= abs(a(n))`; for every positive index `q^n > 1`. This contradicts `Summable.tendsto_atTop_zero`, so the series is not summable.

The finite index `n = 0` is ignored with `eventually_ge_atTop 1`, so no artificial `1/0` root convention affects the theorem.

## Conservative boundary

This checkpoint does not add limsup/liminf root tests, automatic root-limit synthesis for polynomial-times-geometric or factorial terms, conditional-convergence reasoning, or any special decision at `L = 1`.

## Validation targets

The strict acceptance corpus adds two positive root-test fixtures and three negative/boundary fixtures. The authored lesson pack adds one root-test problem that disables the direct geometric-series method so the public reference proof exercises `series_root_test` itself.

## Validation

Final local validation in this Lean-less execution environment:

- focused series test module: 41/41 passed;
- schema + series + touched app integration batch: 62/62 passed;
- complete `formal-verifier/tests` suite: 313/313 passed;
- touched app integration tests: 19/19 passed;
- authored formal lesson references: 45/45 reached `ready_for_kernel`, then 45/45 returned `verification_unavailable`;
- certificates minted without Lean: 0;
- strict root positives: 2/2 reached `verification_unavailable`;
- strict root negatives/boundaries: 3/3 stopped at `needs_justification`.

Lean/Lake is not installed in this container, so no claim is upgraded from `ready_for_kernel` to `verified` here. The generated proof uses theorem names/signatures checked against the pinned mathlib revision, including `Real.pow_rpow_inv_natCast` and `Real.rpow_inv_natCast_pow`.
