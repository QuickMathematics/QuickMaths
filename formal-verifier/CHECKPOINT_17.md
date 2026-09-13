# Checkpoint 17 — periodic divergence with common finite perturbations

Date: 11 September 2026

## Scope

This checkpoint generalizes the Checkpoint 16 perturbation theorem by one closure property:

> a supported oscillating periodic core still has no finite real limit after adding or subtracting one perturbation that the existing premise-free sequence-algebra engine proves converges to any finite target.

The old zero-tail theorem is now just the special case where that common finite target is `0`.

This does **not** add a new convergence engine, cited-tail assumptions, infinite series, or a general asymptotic-equivalence oracle.

## Recognized family

The divergence matcher accepts one top-level additive/subtractive split into:

- an oscillating core already supported by the residue/parity subsystem:
  - a nonconstant exact rational affine transform of `(-1)^n`; or
  - an exact rational-valued modulo-periodic expression with period `2`, `3`, or `4`;
- a tail whose finite limit can be reconstructed by `sequence_algebra` with no cited sublimits and with every guard discharged automatically.

Examples now include:

- `(-1)^n + (2 + 1 / real(n+1))`, whose common tail tends to `2`;
- the period-three core `0,1,2,...` plus `5 + 2 / real(n+2)`, whose common tail tends to `5`;
- a period-four core plus `sin(1) + (1/2)^n`, whose common tail tends to the symbolic finite constant `sin(1)`.

The finite target need not be rational. It is carried as an ordinary formal expression and is proved by the same compositional `Tendsto` machinery used for standalone finite sequence limits.

## Trust boundary and Lean reconstruction

Python performs only two untrusted recognition steps:

1. select two residue classes with different exact periodic values;
2. propose the tail's finite target structurally, then require the existing `sequence_algebra` matcher to reconstruct exactly that target with no premises and no unresolved guards.

Generated Lean then:

1. assumes the full sequence converges to some finite `l`;
2. independently proves the tail converges to its formal finite target `c`;
3. composes both facts with two arithmetic-progression subsequences;
4. simplifies the periodic core to exact values `a` and `b` on those subsequences;
5. proves the same subsequences converge to `a + c` and `b + c`;
6. uses uniqueness of neighborhood limits to force `l = a + c` and `l = b + c`;
7. derives `(a + c) != (b + c)` from the kernel-checked exact fact `a != b` via additive cancellation.

The recognizer never assumes that adding the same tail preserves divergence. The generated theorem explicitly transports the tail limit down both subsequences and closes the shifted-value inequality in Lean.

## Refusal boundary

The family remains premise-free and finite-target only. It intentionally rejects, for example:

- `(-1)^n + (2 + 2^n)`, because the added tail does not have a finite limit;
- the existing unsafe `1 / real(n)` school-form reciprocal, because the closed sequence-algebra primitive requires a positive natural shift;
- arbitrary tails whose convergence would require a cited sublimit or a new theorem family.

Such sequences may be classifiable by other arguments, but this checkpoint does not infer those arguments implicitly.

## Product example

The experimental lesson pack adds:

`a_n = (-1)^n + 2 + 1/(n+1)`.

The learner-facing explanation highlights that the common perturbation tends to `2`, so the even and odd subsequences tend to `3` and `1`; shifting both old residue limits by the same amount cannot make them equal.

## Validation

Final local validation for this checkpoint:

- focused sequence/contract/schema tests: **75/75 passed**;
- complete formal verifier: **266/266 passed**;
- touched QuickMaths loader/bridge/example surfaces: **19/19 passed**;
- formal lesson/reference bridge: **35/35** reference proofs reach the kernel boundary, **35/35** then stop at `verification_unavailable` with Lean absent, and **0** certificates are minted.

The strict kernel manifest adds three positive common-finite-tail fixtures and one shifted-growing-tail negative fixture. This container still has no Lean/Lake installation, so generated artifacts remain candidates until compiled by the pinned-toolchain kernel gate.

## Next small boundary

The next contained extension is **cited finite perturbation transport**: allow the periodic-divergence rule to consume an already proved finite tail limit from the proof state instead of requiring the tail proof to be closed and premise-free. After that, eventually periodic cores are a natural adjacent boundary.
