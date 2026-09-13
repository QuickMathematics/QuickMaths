# Checkpoint 28 — automatic root limits for monomial-geometric series

This checkpoint widens only the automatic evidence layer behind `series_root_test`.

## Supported automatic family

For a natural series index `n`, the verifier now recognizes exact products equivalent (up to product association/order) to

`c * real(n)^k * r^n`

with:

- exact rational nonzero coefficient `c`;
- exact rational geometric base `r`;
- natural exponent `0 <= k <= 64`.

The reconstructed n-th-root limit is `abs(r)`.  The existing root-test boundary is unchanged:

- `abs(r) < 1` can prove `summable`;
- `abs(r) > 1` can prove `not_summable`;
- `abs(r) = 1` is intentionally inconclusive.

Pure geometric `r^n` remains the degree-zero special case.  Broader polynomial factors such as `(real(n) + 1) * r^n` are deliberately not synthesized and still require a cited exact root-limit theorem.

## Kernel reconstruction

The generated Lean proof decomposes the root statistic into three factors:

1. `abs(c)^(1/n) -> 1`, using `tendsto_inv_atTop_nhds_zero_nat` and `Filter.Tendsto.rpow`;
2. `(real(n)^k)^(1/n) -> 1`, rewritten through `Real.rpow_natCast_mul` and discharged by the pinned `tendsto_rpow_div_mul_add` theorem;
3. `(abs(r)^n)^(1/n) = abs(r)` eventually for `n > 0`, using `Real.pow_rpow_inv_natCast`.

`Real.mul_rpow` reconstructs the root of the absolute product.  The resulting exact root limit is then consumed by the unchanged Checkpoint 27 root-test proof: eventual geometric domination for `L < 1`, or contradiction with termwise convergence to zero for `L > 1`.

All theorem names/signatures above were checked against the pinned mathlib revision `42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c`.

## Conservative boundary

This checkpoint does not add general polynomial-root asymptotics, shifted-polynomial root synthesis, factorial/Stirling root automation, limsup root tests, or any special decision at `L = 1`.

## Validation

Final local validation in this Lean-less execution environment:

- focused series tests: 44/44 passed;
- complete `formal-verifier/tests` suite: 316/316 passed;
- touched app integration tests: 19/19 passed;
- authored formal lesson references: 46/46 returned `verification_unavailable` after reaching the kernel boundary;
- certificates minted without Lean: 0;
- new strict positives: 2/2 returned `verification_unavailable`;
- new strict negatives/boundaries: 2/2 stopped at `needs_justification`.

Lean/Lake is not installed in this container, so no claim is upgraded from `ready_for_kernel` to `verified` here.
