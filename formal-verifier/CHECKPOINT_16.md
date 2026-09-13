# Checkpoint 16 — periodic divergence with vanishing perturbations

Date: 11 September 2026

## Scope

This checkpoint extends the residue/parity subsequence divergence architecture from Checkpoint 15 by one deliberately narrow closure property:

> a supported oscillating periodic core still has no finite real limit after adding or subtracting one perturbation that the existing premise-free sequence-algebra engine proves tends to zero.

It does **not** add a second convergence engine or a general asymptotic-equivalence oracle.

## Recognized family

The divergence matcher now accepts one top-level additive/subtractive split into:

- an oscillating core already supported by the previous checkpoint:
  - an exact nonconstant affine transform of `(-1)^n`; or
  - an exact rational-valued modulo-periodic expression with period `2`, `3`, or `4`;
- a tail whose limit to `0` can be reconstructed by the existing `sequence_algebra` planner with no cited sublimits and with every guard discharged automatically.

This immediately covers examples such as:

- `(-1)^n + 1 / real(n + 1)`;
- the period-three sequence `0,1,2,...` plus `2 / real(n + 2)`;
- a period-four core minus `(1/2)^n`.

Because the tail proof is delegated back to the existing finite sequence engine, the family also inherits its safe closed forms (exact reciprocal shifts, exact geometric tails with `|r| < 1`, and finite arithmetic/composition built from those when all guards are automatic).

## Kernel reconstruction

Python only recognizes the split and selects two residue classes whose periodic values differ.

Generated Lean then:

1. assumes the full sequence tends to a finite real `l`;
2. independently proves the perturbation tends to `0` using the ordinary `sequence_algebra` reconstruction;
3. composes both the alleged full limit and the tail limit with two arithmetic-progression subsequences;
4. simplifies the periodic core on each subsequence;
5. proves the same subsequence tends to its exact periodic value by adding the zero tail;
6. uses uniqueness of neighborhood limits to force `l` to equal two distinct exact values;
7. closes the contradiction by exact arithmetic.

Thus the local recognizer never upgrades “the tail looks small” into a theorem. The same Lean `Tendsto` machinery used for standalone sequence limits proves that tail convergence inside the divergence certificate.

## Refusal boundary

The new family intentionally rejects cases where the perturbation is not independently known to vanish. Examples in the negative corpus include:

- `(-1)^n + 2^n`;
- `(-1)^n + 1 / real(n)`, where the school-form expression is not defined at the initial natural index and the existing reciprocal-shift primitive deliberately requires shift `>= 1`.

These sequences may be classifiable by other future arguments, but this rule does not guess them from growth intuition.

## Product example

The experimental lesson pack adds

`a_n = (-1)^n + 1/(n+1)`.

The learner-facing explanation emphasizes that the perturbation tends to zero while the even and odd subsequences retain limits `1` and `-1`.

## Validation

Local validation for this checkpoint:

- focused sequence/contract/schema tests: **73/73 passed**;
- complete formal verifier: **264/264 passed**;
- touched QuickMaths loader/bridge/example surfaces: **19/19 passed**;
- formal lesson/reference bridge: **34/34** reference proofs reach `ready_for_kernel`, **34/34** then stop at `verification_unavailable` with Lean absent, and **0** certificates are minted.

The strict kernel manifest now includes three positive vanishing-perturbation fixtures and two negative boundary fixtures. This container still has no Lean/Lake installation, so those generated artifacts must be compiled by the pinned-toolchain kernel gate before production certification.

## Next small boundary

A natural next slice is **common finite perturbation transport**: if an oscillating core has distinct residue limits and a separately proved perturbation tends to the same finite constant along the whole sequence, both residue limits shift by that constant and remain distinct. That generalizes the current zero-tail theorem without opening infinite series yet.
