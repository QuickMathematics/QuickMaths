# Checkpoint 19 — eventually periodic cores

Date: 11 September 2026

## Scope

This checkpoint adds one conservative divergence family: a finite nonperiodic prefix followed permanently by an already-supported exact periodic core. It does not widen the supported period set, add arbitrary eventual predicates, or add infinite-series reasoning.

The accepted wrapper is deliberately explicit:

```text
if n < K then PREFIX else CORE
```

where `K` is an exact natural literal and `CORE` is either a nonconstant exact affine transform of `(-1)^n` or an exact rational-valued modulo-periodic expression of period 2, 3, or 4. `PREFIX` may be any well-typed expression because convergence over `Nat.atTop` ignores finitely many initial terms.

## Proof reconstruction

For a claimed finite limit `l`, Lean first reconstructs eventual equality between the full sequence and `CORE` using `eventually_ge_atTop K`. The assumed limit is transported to the permanent core with `Tendsto.congr'`. From there the existing residue-class proof is reused unchanged: two arithmetic-progression subsequences tend to `atTop`, simplify to distinct exact constants, and contradict uniqueness of finite limits.

No prefix value is trusted or algebraically analyzed. Python only recognizes the safe cutoff shape and the existing periodic core family.

## Acceptance corpus

Positive cases include:

- an arbitrary five-term prefix followed by `0,1,2,0,1,2,...`;
- a four-term prefix followed by `(-1)^n`.

Negative/boundary cases include:

- a sequence that oscillates only in its finite prefix and is eventually constant;
- `n <= K` cutoff syntax, which remains outside this checkpoint's intentionally narrow recognizer even though it is mathematically equivalent to a shifted strict cutoff.

## Validation

- focused sequence tests: **69 passed**;
- complete formal-verifier tests: **272 passed**;
- touched application tests: **19 passed**;
- authored formal lesson references: **37/37** reached `verification_unavailable` with Lean absent and **0 certificates** minted.

## Boundary

Still unsupported here: arbitrary eventually-periodic predicates, periods above 4, eventual periodicity requiring a cited equality theorem, and periodic cores with a separate finite perturbation inside the cutoff wrapper. The next analysis boundary is infinite-series convergence.
