# Checkpoint 34 — higher-degree eventual polynomial denominator guards

This checkpoint changes only the school-domain side-condition layer around the existing exact polynomial-quotient-geometric root test. It does not add a new convergence theorem.

## Added

Exact rational-coefficient polynomial denominator factors through degree 64 can now be discharged when they are nonzero on a concrete `Nat.atTop` tail. The implementation deliberately avoids treating Python as a polynomial-root oracle.

For a nonconstant exact polynomial `p`, Python searches exact integer shifts `N` until the translated polynomial `p(N+x)` (or its negation, according to the leading sign) has a strictly positive constant coefficient and all remaining coefficients nonnegative. Those coefficients are only a proof candidate. Generated Lean then independently checks:

1. `N <= n` implies `0 <= real(n) - N`;
2. the shifted positive-coefficient expression is strictly positive via `positivity`;
3. the original polynomial equals that shifted expression (up to sign) via `ring`;
4. therefore the original denominator is nonzero for every `n >= N`.

Examples covered by the focused regression corpus:

- `real(n)^2 - 1` gets threshold `2`;
- `1 - real(n)^2` gets the same threshold, with the sign flipped before the positive expansion;
- `(real(n)-1)*(real(n)-2)*(real(n)-3)` gets threshold `4` when written as its exact cubic expansion;
- `(1/2)*real(n)^2 - (7/3)*real(n) + 1` gets threshold `5`.

Products with earlier globally/eventually nonzero factors still compose by taking the maximum threshold, so polynomial tails can be combined with exact nonzero geometric powers such as `(-3)^n`.

## Trust boundary

The threshold search is not accepted as mathematical evidence on its own. If Python proposes the wrong shift or wrong translated coefficients, the generated `ring`/`positivity` proof fails in Lean and no certificate can be minted. Coefficient arithmetic is exact `Fraction` arithmetic, and certificate size is capped to avoid pathological source growth.

The root-test criterion itself is unchanged: `L < 1` proves summability, `L > 1` proves non-summability, and `L = 1` remains inconclusive.

## Boundary

This still does not guess non-polynomial or recurring-zero denominators such as `1 + (-1)^n`. Zero geometric denominators remain rejected. The automatic shifted certificate is bounded to the existing exact polynomial fragment (degree <= 64) and a finite search/source-size budget; cases outside that proof-engineering budget remain explicit learner obligations rather than being assumed true.

Lean/Lake is unavailable in this runtime, so successful cases stop at `ready_for_kernel` / `verification_unavailable` and mint no certificate.

## Validation in this runtime

- formal verifier: **344/344 passed**;
- Python app formal examples: **2/2 passed**;
- browser formal client/integration: **11/11 passed**;
- public text-protocol regression for `real(n)^2 - 1` reaches the kernel boundary with no domain obligation;
- recurring-zero denominator regression remains `needs_justification`;
- certificates minted without Lean: **0**.
