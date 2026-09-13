# Checkpoint 20 — first-class geometric series

Date: 11 September 2026

## Scope

This checkpoint introduces the first infinite-series theorem family without opening general series automation.

A new `series_sum` goal is first-class in the typed contract. Its bound index must be `nat`, its summand is an ordinary typed expression, and a finite target may not depend on the bound index. The supported rule is deliberately narrow:

- exact nonzero rational coefficient `a`;
- exact rational common ratio `r`;
- summand exactly `a * r^n` (including the unscaled `r^n` form);
- the series starts at `n = 0`;
- if `|r| < 1`, the only accepted finite target is exactly `a / (1 - r)`;
- if `|r| >= 1`, the accepted classification is `not_summable`.

The zero-coefficient series, symbolic coefficients/ratios, shifted starting indices, comparison tests, p-series and conditional-convergence arguments are intentionally outside this rule for now. Unsupported inputs remain unresolved rather than receiving a guessed classification.

## Kernel reconstruction

For `|r| < 1`, generated Lean uses the pinned mathlib theorem `hasSum_geometric_of_abs_lt_one`, then scales the `HasSum` proof with `HasSum.mul_left` and normalizes the exact rational target.

For `|r| >= 1`, generated Lean assumes summability of the scaled series, removes the nonzero scalar with `summable_mul_left_iff`, and contradicts `summable_geometric_iff_norm_lt_one` by exact arithmetic.

The theorem names above were checked against the pinned formal environment:

- Lean `leanprover/lean4:v4.34.0-rc2`;
- mathlib `42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c`.

No raw learner Lean is accepted and no Python-side success is treated as a certificate.

## Acceptance corpus

Positive fixtures include:

- `sum (1/2)^n = 2`;
- `sum 3 * (-1/2)^n = 2`;
- `sum 2^n` is not summable;
- `sum (-1)^n` is not summable.

Negative fixtures include a wrong finite sum, a false divergence claim inside the convergence radius, and a false finite-sum claim outside it.

The formal lesson pack now includes one learner-facing geometric-series example using the public text bridge.

## Validation

Final packaged-state validation:

- focused series/contract/schema tests: 19 passed;
- touched formal/app integration tests: 38 passed;
- complete formal-verifier suite: 279 passed;
- authored lesson references: 38/38 reached `ready_for_kernel`, then 38/38 honestly stopped at `verification_unavailable` with Lean absent;
- certificates minted without Lean: 0.

## Next boundary

The next series slice should be comparison/p-series reasoning. It should remain separate from this geometric rule so convergence hypotheses, positivity requirements and exact comparison evidence stay visible rather than becoming a single opaque "series solver".
