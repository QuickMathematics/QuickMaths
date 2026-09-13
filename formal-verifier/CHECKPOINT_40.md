# Checkpoint 40 — root-test parity for bare-index shifted powers

This checkpoint does **not** add a new asymptotic theorem or a second polynomial normalizer. Inspection of checkpoint 39 showed that the shared exact rational-polynomial normalizer already feeds both the quotient-limit ratio test and the n-th-root test. The root path therefore already accepts bare bound `n` anywhere the surrounding series term forces the polynomial factor into the real domain.

This checkpoint pins that behavior with root-specific regressions instead of duplicating implementation.

## Root forms now explicitly covered

- `(n + 1)^3 * (1/2)^n` reconstructs the root limit `1/2`;
- `((n + 1/2)^2 / (n + 3/2)^3) * (1/3)^n` reconstructs the root limit `1/3`;
- `((n - 1/2)^2 / (n + 5/2)^2) * 2^n` reconstructs the `L > 1` non-summability branch;
- the public text protocol selects `series_root_test` for the shifted rational quotient with no cited root-limit premise.

The generated Lean artifact still rebuilds explicit `Polynomial ℝ` values and inserts/checks the Nat-to-Real coercions. In particular, the public-protocol regression checks that the kernel artifact contains the typed shifted expressions, both polynomial root reconstructions, and the quotient-root combination.

## Boundaries retained

The strict root-test boundary is unchanged: combined absolute geometric base `1` is inconclusive, so `(n + 1)^2 * (-1)^n` is not classified by this rule. Pure integer/integer division remains deliberately ambiguous; for example `((n+1)^3/(n+2)^2)*(1/2)^n` still requires an explicit real/rational cue instead of silently reinterpreting school integer division.

## Validation

This is a parity/regression checkpoint. The completed gate demonstrates that checkpoint 39's syntax improvement is genuinely shared by the root-test path rather than ratio-test-specific:

- 378/378 formal-verifier tests pass;
- 21/21 app-level formal tests pass;
- 16/16 browser formal evidence/client/integration tests pass.

Lean/Lake is unavailable in this runtime, so successful generated proofs stop at `verification_unavailable` and no certificate is fabricated.
