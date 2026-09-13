# Checkpoint 14 — elementary oscillation and divergence classification

Date: 11 September 2026

## Scope

This checkpoint makes elementary nonconvergence a first-class sequence outcome instead of treating it as failed search.

### First-class no-finite-limit result

Sequence goals can now state that a real sequence **does not converge to any finite real limit**. The typed contract, JSON schema, learner-facing parser/renderer, preview, and Lean statement renderer all carry the new `no_finite_limit` result kind.

The canonical authoring sentence is:

`As n tends to infinity, (-1)^n does not converge to a finite real limit.`

Lean receives the exact proposition `¬ ∃ l : ℝ, Tendsto ... atTop (𝓝 l)`.

### Alternating oscillation

`sequence_elementary_divergence` recognizes exact rational affine transforms

`L + c * (-1)^n`

with `c != 0`. Python only recovers the exact offset/scale. Generated Lean assumes a finite limit, composes that alleged limit with the even and odd index maps, simplifies the two subsequences to the distinct constants `L+c` and `L-c`, and contradicts uniqueness of limits.

This covers `(-1)^n` itself and conservative algebraic rearrangements of the same affine family. It does not claim that arbitrary periodic-looking syntax diverges.

### Elementary geometric growth

For an exact rational base `r`, the same rule also recognizes:

- `r^n -> +infinity` when `r > 1`;
- `r^n` has no finite limit when `r > 1`;
- `r^n` has no finite limit when `r < -1`.

The positive branch uses mathlib's `tendsto_pow_atTop_atTop_of_one_lt`. The negative-base branch composes any alleged finite limit with `continuous_abs`, while `|r|^n` tends to `+infinity`, and invokes mathlib's incompatibility of `atTop` with a neighborhood limit.

Ratios in `(-1,1)` remain owned by the existing convergent-geometric rule. `r = 1` is constant and is rejected as divergent. `r = -1` is handled by the parity-subsequence oscillation proof.

## Conservative boundary

This is not a generic divergence oracle. The checkpoint does not yet classify arbitrary periodic sequences, trigonometric sequences such as `sin(n)`, sums of several oscillatory modes, symbolic geometric bases, or infinite series. Unsupported shapes remain unsupported rather than being guessed.

## Trust boundary

As before, a Python pattern match is only proof planning. The generated Lean artifact proves the parity subsequence facts or geometric growth facts and must pass the pinned Lean/mathlib kernel before any certificate can be issued.

## Coverage

Positive fixtures cover:

- `(-1)^n` has no finite limit;
- `3 + 2*(-1)^n` has no finite limit;
- `2^n -> +infinity`;
- `2^n` has no finite limit;
- `(-2)^n` has no finite limit.

Negative fixtures cover:

- the false claim `(-1)^n -> +infinity`;
- the false claim `(1/2)^n` has no finite limit;
- the false claim `1^n` has no finite limit.

The strict kernel-acceptance manifest includes all of these cases.

## Validation

Local validation for this checkpoint:

- focused sequence contract/rule suite: **62/62 tests passed**;
- complete formal verifier: **255/255 tests passed**;
- touched QuickMaths loader/bridge/example surfaces: **19/19 tests passed**;
- formal lesson/reference bridge: **32/32** reference proofs reach `ready_for_kernel`, **32/32** then stop at `verification_unavailable` with Lean absent, and **0** certificates are minted.

This container still has no Lean/Lake installation, so generated artifacts have not been kernel-compiled here. The kernel acceptance script is the required real-toolchain gate.

## Next small boundary

A coherent next slice is **broader periodic/subsequence divergence**: bounded exact periodic sequences with two distinct cycle values and a reusable subsequence-witness abstraction. Keep infinite-series convergence as a separate later checkpoint.
