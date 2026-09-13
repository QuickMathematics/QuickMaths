# Checkpoint 23 — exact real-exponent p-series

Date: 11 September 2026

## Scope

This checkpoint extends the existing shifted p-series rule from natural-number exponents to **exact rational real exponents**. It does not add ratio/root tests, conditional convergence, arbitrary symbolic exponents, decimal approximation, or a general real-power simplifier.

The supported family is

```text
a / real(n + k)^p
```

with:

- `n : nat`;
- exact nonzero rational coefficient `a`;
- exact natural shift `k >= 1`;
- exact integer or rational exponent `0 <= p <= 64`;
- a `summable` claim exactly when `p > 1`, or a `not_summable` claim exactly when `p <= 1`.

Learner text writes an exact rational exponent with ordinary fraction syntax, for example:

```text
real(n + 1)^(3/2)
```

The parser gives non-integer exact exponents their own `rpow` expression node. Integer powers and natural-index powers remain distinct AST nodes, so this change does not blur `x^2`, `r^n`, and real `x^(3/2)` semantics.

## Trust boundary

The new `rpow` node is type checked as a real expression: both base and exponent must be real-coercible. Outside a curated rule, school-real fractional-power reasoning requires a nonnegative base.

For the supported p-series family, `k >= 1` makes `real(n+k)` strictly positive for every natural index. The verifier therefore discharges the base/domain issue from the recognized family instead of asking the learner for a redundant quantified domain premise.

Only exact rational exponent syntax is accepted by this rule. No floating-point approximation is used to decide the `p > 1` threshold.

## Lean reconstruction

Integer exponents continue to use:

```lean
summable_one_div_nat_pow
```

Non-integer rational real exponents use the pinned mathlib theorem:

```lean
summable_one_div_nat_rpow
```

which states that the real p-series is summable exactly when `1 < p`.

The existing shift/scaling proof is reused:

- `summable_nat_add_iff k` transports between the unshifted and shifted p-series;
- `Summable.mul_left` handles a nonzero rational coefficient for convergence;
- `summable_mul_left_iff` removes that coefficient in the nonsummability contradiction.

The generated artifact contains the exact rational exponent as a Lean real; no numerical approximation is introduced.

## Acceptance corpus

Positive pre-kernel cases:

- `1 / real(n+1)^(3/2)` is summable;
- `2 / real(n+2)^(1/2)` is not summable.

Negative/boundary cases:

- falsely claiming the `p = 3/2` series is not summable;
- falsely claiming the `p = 1/2` series is summable;
- exact exponent `129/2`, which exceeds this checkpoint's configured `p <= 64` boundary.

The prior integer p-series fixtures remain unchanged and continue to use the natural-power theorem.

## Product integration

The formal lesson pack now includes a real-exponent p-series classification problem for

```text
1 / real(n + 1)^(3/2)
```

using the same `series_p_series` rule as the integer examples. This exercises the exact learner-text fraction syntax through YAML authoring, the QuickMaths bridge, parser, proof state, and generated Lean artifact.

## Validation

Final validation for this checkpoint:

- `19/19` focused series tests passed;
- `40/40` touched formal/app integration tests passed;
- `291/291` complete formal-verifier tests passed;
- both positive real-exponent fixtures reached `verification_unavailable` with Lean absent;
- all three false/out-of-boundary fixtures stopped at `needs_justification`;
- `41/41` authored formal references reached the verifier boundary and then `verification_unavailable`;
- `0` certificates were minted without the kernel.

The runtime still has no Lean/Lake. The theorem name used by the new artifacts was checked against the pinned mathlib revision `42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c`.

## Next boundary

A separate checkpoint should handle a small ratio-test or root-test family. Irrational/symbolic real p-series exponents should also remain separate because they require a different exact-number/assumption story than the rational exponent fragment added here.
