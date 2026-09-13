# Checkpoint 33 — eventual denominator guards for the root test

This checkpoint changes only the school-domain side-condition layer around the existing exact polynomial-quotient-geometric root test. It does not add a new convergence theorem.

## Added

A denominator may now be discharged when QuickMaths can reconstruct that it is nonzero **eventually** on `Nat.atTop`, even if it vanishes at finitely many initial indices. The new primitive is deliberately small: an exact affine rational polynomial in `real(n)`. For `a*real(n)+b` with exact rational `a != 0`, Python computes the first natural threshold strictly beyond the unique rational root `-b/a`; Lean then proves the denominator is nonzero from that threshold onward.

Examples:

- `real(n)-1` gets threshold `2`;
- `(3/2)*real(n)-7/3` gets threshold `2`;
- `(real(n)-1) * (-3)^n` also gets threshold `2`, combining the affine tail proof with the existing `pow_ne_zero` proof.

The generated artifact records an explicit fact of the form

`have hschoolDenEventuallyDefined : forall eventually n in Filter.atTop, denominator(n) != 0 := ...`

using `Filter.eventually_ge_atTop`, `exact_mod_cast`, and `nlinarith`. Global guards from earlier checkpoints remain unchanged.

## Boundary

This does **not** become a general polynomial root finder. Higher-degree denominators are not newly classified by this checkpoint, and expressions with recurring zeros such as `1 + (-1)^n` remain unsupported for automatic root-limit reconstruction. A zero geometric denominator is still rejected. The strict root-test boundary is unchanged: `L < 1` proves summability, `L > 1` proves non-summability, and `L = 1` remains inconclusive.

For `series_sum` summability/non-summability goals, this eventual-domain evidence reflects the standard fact that convergence is a tail property. Exact finite-sum claims continue to require their ordinary pointwise domain semantics.

## Validation in this runtime

Lean/Lake is still unavailable here, so successful cases stop at `ready_for_kernel` / `verification_unavailable` and mint no certificate.

- formal verifier: **340/340 passed**;
- Python app formal examples: **2/2 passed**;
- browser formal client/integration: **11/11 passed**;
- public text-protocol regression for `(real(n)-1)` reaches the kernel boundary with no domain obligation;
- recurring-zero denominator regression remains `needs_justification`;
- certificates minted without Lean: **0**.
