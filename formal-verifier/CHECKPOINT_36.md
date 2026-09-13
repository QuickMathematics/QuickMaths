# Checkpoint 36 — polynomial-geometric quotient-limit reconstruction

This checkpoint keeps the quotient-limit ratio test narrow while removing one
important authored-premise requirement.

## Added

For an exact term

`p(real(n)) * r^n`

where `p` is a nonzero rational-coefficient polynomial of degree at most 64 and
`r` is an exact nonzero rational, the ratio-test rule can now reconstruct

`abs(a_(n+1)) / abs(a_n) -> abs(r)`

without a cited sequence-limit premise.

Python only recognizes the exact shape, extracts exact coefficients, and reuses
the existing concrete eventual-nonzero threshold for `p`. The generated Lean
artifact independently rebuilds `p(x+1)` and `p(x)` as explicit `Polynomial ℝ`
values, checks their degree and leading coefficient, applies
`Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq`, passes the quotient
limit through `abs`, and combines it with the constant geometric norm `abs(r)`.
The existing shifted-polynomial tail certificate is used only to justify the
eventual cancellation needed to reconnect this model to the learner's exact
successive-term norm quotient.

## Deliberate boundary

This bite does **not** normalize polynomial quotients, several geometric factors,
or arbitrary rational functions for the ratio test. Those still require a cited
quotient-limit theorem. `r = 0` is excluded because the quotient statistic is not
eventually defined in the school-real sense, and `abs(r) = 1` remains
inconclusive. Non-polynomial prefactors remain outside automatic reconstruction.

## Validation

- focused ratio/series suite includes premise-free convergence and divergence,
  the `L = 1` boundary, a non-polynomial refusal, and a public-protocol case;
- the full formal-verifier Python suite passes in the Lean-less test runtime;
- no certificate is emitted without the pinned Lean/mathlib kernel.
