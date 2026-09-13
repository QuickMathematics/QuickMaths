# Checkpoint 13 — automatic order-derived sequence estimates

Date: 11 September 2026

## Scope

This checkpoint reduces hand-authored order evidence for two existing sequence proof families without introducing a general inequality solver.

### Automatic squeeze bounds

`sequence_squeeze` still accepts explicit eventual or all-index inequalities, but it can now reconstruct the standard bounds

- `-1 <= sin(t) <= 1`,
- `-1 <= cos(t) <= 1`,

when the trigonometric numerator is divided by the same denominator `real(n + k)` with exact `k >= 1`.

Python only recognizes the conservative shape. Generated Lean proves denominator positivity, applies mathlib's global trigonometric bounds, transports them through positive division, and then invokes the ordinary squeeze theorem.

The existing `sin(real(n))/real(n+1)` lesson no longer supplies its two eventual inequalities. Its two bounding sequence limits remain explicit proof steps, while the order inequalities are kernel-reconstructed.

### Automatic monotone/bounded evidence

`sequence_monotone_bounded` can now reconstruct monotonicity and the matching global bound for exact real sequences of the forms

- `L - c * r^n` — monotone and bounded above by `L`;
- `L + c * r^n` — antitone and bounded below by `L`;

with exact rational constants satisfying `c > 0` and `0 <= r <= 1`.

Generated Lean uses `pow_le_pow_of_le_one` for exponent order, `pow_nonneg` for the global bound, and then the existing `ciSup`/`ciInf` monotone-convergence reconstruction. The rule still proves only existence of some finite limit; it does not invent a numeric value.

## Conservative boundary

This is deliberately not a symbolic inequality oracle.

The automatic squeeze recognizer does not generalize from `sin`/`cos` to arbitrary bounded functions, and it does not guess positivity of arbitrary denominators. Unsupported shapes still require explicit eventual evidence.

The automatic monotone recognizer does not accept ratios outside `[0,1]`, symbolic coefficients, arbitrary products/sums of geometric terms, or nonlinear monotonicity claims. Those continue to require cited evidence or a future dedicated rule.

## Trust boundary

Automatic evidence is planning metadata only. A successful shape match is not a proof and cannot produce a certificate by itself.

For every automatic estimate the generated Lean artifact reconstructs the actual inequality theorem. The ordinary verifier still requires the pinned Lean/mathlib environment before any certificate can be minted.

## Coverage

New positive fixtures cover:

- automatic `sin(n)/(n+1)` squeeze bounds with no inequality assumptions;
- the analogous `cos(n)/(n+1)` squeeze bounds;
- automatic monotone/bounded convergence for `1 - (1/2)^n`;
- automatic antitone/bounded convergence for `1 + 2*(1/3)^n`.

New negative fixtures cover:

- attempting the same automatic squeeze pattern with `exp`, which is not globally bounded by `[-1,1]`;
- a geometric monotone candidate with ratio `2`, outside the safe `[0,1]` branch.

Existing explicit-evidence squeeze and monotone proofs remain accepted.

## Validation

Local validation for this checkpoint:

- focused sequence suite: **48/48 tests passed**;
- complete formal verifier: **248/248 tests passed**;
- touched QuickMaths loader/bridge/example surfaces: **19/19 tests passed**;
- formal lesson/reference bridge: **31/31** reference proofs reach `ready_for_kernel`, **31/31** then stop at `verification_unavailable` with Lean absent, and **0** certificates are minted.

This container still has no Lean/Lake installation. The strict kernel-acceptance corpus now includes the new automatic positive fixtures and the new refusal-boundary fixtures, so a Lean-capable environment must compile/reject them as specified before a production gate can pass.

## Next small boundary

A coherent next slice is **oscillation and divergence classification for elementary sequences**: recognize a few kernel-reconstructible families such as `(-1)^n`, bounded nonconvergent periodic sequences, and simple polynomial/geometric divergence without mixing in infinite-series convergence yet.
