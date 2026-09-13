# Checkpoint 18 — cited finite perturbation transport

Date: 11 September 2026

## Scope

This checkpoint extends the periodic-divergence perturbation theorem by one proof-state dependency:

> a supported oscillating periodic core still has no finite real limit after adding one perturbation whose finite limit was already proved by an earlier in-scope sequence-limit step and explicitly cited by the divergence step.

Checkpoint 17 remains the zero-premise fast path. This checkpoint does not add a new convergence engine, theorem synthesis, algebraic equivalence matching for cited tails, eventually-periodic cores, or series convergence.

## Exact dependency rule

The cited perturbation must satisfy all of the following:

- the cited claim is a `sequence_limit` over the same natural index variable;
- its result is finite;
- its sequence expression is structurally identical to the perturbation appearing in the final periodic-plus-tail expression;
- its proof node is explicitly listed in the divergence step's `premises`;
- ordinary contract checks have already established that the cited node is earlier and visible in the current scope.

The matcher intentionally does **not** use symbolic equivalence to rewrite the cited perturbation. If the learner proves a limit for a different-looking expression, an explicit equality/convergence transport theorem is still required rather than being guessed by Python.

## Product example

The new lesson proves

`real(n) / real(n + 1) -> 1`

with `sequence_rational_shift`, then cites that exact step to prove

`(-1)^n + real(n) / real(n + 1)`

has no finite real limit.

The divergence proof therefore depends on `reference_step_1`; it does not re-run the rational-shift asymptotic internally.

## Lean reconstruction

For a cited finite tail, the existing `SequenceAlgebraPattern` is reused with a single `premise` leaf. Generated Lean therefore emits the tail theorem as an exact dependency:

`have htail : ... := by exact tail_limit`

The rest of the proof is unchanged from the common-finite-tail theorem:

1. assume the full sequence tends to a finite `l`;
2. compose both the full-sequence limit and cited tail limit with two arithmetic-progression subsequences;
3. simplify the periodic core to distinct exact values `a` and `b`;
4. derive subsequence limits `a + c` and `b + c`;
5. use uniqueness of limits plus additive cancellation to contradict `a != b`.

The citation therefore moves an already kernel-checkable theorem through the proof graph; it does not turn the Python matcher into an authority on the tail limit.

## Refusal boundary

The divergence rule rejects the same final expression when the finite tail theorem is omitted. It also rejects a citation whose sequence expression is different from the actual perturbation, even if both cited and actual tails happen to converge.

This preserves a visible dependency edge between the theorem being reused and the theorem that consumes it.

## Validation

Final local validation for this checkpoint:

- focused sequence tests: **66/66 passed**;
- combined touched formal/app tests: **85/85 passed**;
- complete formal verifier: **269/269 passed**;
- formal lesson/reference bridge: **36/36** reference proofs reach `ready_for_kernel`, **36/36** then stop at `verification_unavailable` with Lean absent, and **0** certificates are minted.

The strict kernel manifest adds the cited-tail positive fixture plus missing-citation and wrong-citation negative fixtures. This container still has no Lean/Lake installation, so generated artifacts remain candidates until compiled by the pinned-toolchain kernel gate.

## Next small boundary

The next contained extension is **eventually periodic cores**: allow a sequence to have a finite prefix before entering one of the already-supported period-2/3/4 residue patterns, then discard that prefix using the `atTop` filter rather than requiring periodicity from index zero.
