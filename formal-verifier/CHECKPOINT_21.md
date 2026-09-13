# Checkpoint 21 — shifted integer p-series

Date: 11 September 2026

## Scope

This checkpoint adds the second deliberately small infinite-series family after geometric series: exact shifted integer p-series. It does **not** add comparison tests, real-exponent powers, conditional convergence or a general series solver.

The accepted term family is

```text
a / real(n + k)^p
```

with:

- series index `n : nat`;
- exact nonzero rational coefficient `a`;
- exact integer shift `k >= 1`;
- literal natural exponent `0 <= p <= 64`.

The series contract gains an explicit `summable` result kind, separate from an exact finite `HasSum` target and from `not_summable`. This matters because most p-series do not have a school-level exact closed-form sum available in the current rational target language.

## Mathematics and Lean reconstruction

The pinned mathlib revision provides

```lean
summable_one_div_nat_pow :
  Summable (fun n : ℕ => 1 / (n : ℝ) ^ p) ↔ 1 < p
```

and `summable_nat_add_iff` transfers summability across a finite index shift. QuickMaths therefore reconstructs:

- `p > 1` → `Summable`;
- `p <= 1` → `¬ Summable`.

A nonzero rational coefficient is transported with `Summable.mul_left` in the convergent direction and removed with `summable_mul_left_iff` in the divergent direction. The learner never supplies the denominator guard: `k >= 1` makes `real(n+k)` pointwise positive, and the kernel-backed p-series plan owns that domain fact.

## Acceptance corpus

Positive cases:

- `1 / real(n+1)^2` is summable;
- `3 / real(n+2)^3` is summable;
- `1 / real(n+1)` is not summable;
- `2 / real(n+3)^0` is not summable.

Negative/boundary cases:

- claiming the `p=2` series is not summable;
- claiming the harmonic series is summable;
- using shift `k=0`, which is intentionally outside this first shifted family.

## Product integration

The formal lesson pack now includes a p-series convergence-classification problem for

```text
1 / real(n + 1)^2
```

using the public `series_p_series` rule. Learner-facing text round-trips through the same parser/preview contract as the geometric-series example.

## Validation

Final local validation in this checkpoint:

- `11/11` focused series tests passed before integration;
- `30/30` touched formal/app tests passed;
- `283/283` complete formal-verifier tests passed;
- `39/39` authored formal references reached the verifier boundary and reported `verification_unavailable` with Lean absent;
- `0` certificates were minted without the kernel.

The runtime still lacks Lean/Lake, so this checkpoint does not claim a local kernel compile. The theorem names and statements used by generated artifacts were checked against the exact pinned mathlib revision `42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c`.

## Next boundary

The next checkpoint should add a **conservative comparison test** as a separate rule, with explicit positivity/eventual-inequality evidence and cited comparison-series summability. Keeping that separate prevents p-series recognition from becoming an opaque general convergence heuristic.
