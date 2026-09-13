# Checkpoint 08 — sequence order convergence and rational asymptotics

Date: 10 September 2026

## Scope

This checkpoint deepens first-class `Nat.atTop` sequence reasoning with eventual inequalities, the squeeze theorem, bounded monotone convergence, and the first exact rational asymptotic family. The new rules consume explicit proof evidence and reconstruct Lean filter/order theorems; they do not promote symbolic estimates into certificates.

## Eventually means an ordinary quantified theorem

Learner-facing syntax such as

`eventually k:nat, L(k) <= A(k)`

is normalized into the existing logical AST as

`∃ N : nat, ∀ k : nat, N <= k -> L(k) <= A(k)`.

There is no opaque trusted `eventually` proposition. The Lean adapter turns a cited threshold theorem into `∀ᶠ k in Filter.atTop, ...` using `eventually_ge_atTop`.

## Sequence squeeze

`sequence_squeeze` proves a finite sequence limit only when it can cite all four ingredients:

1. a lower sequence converging to the claimed target;
2. an upper sequence converging to the same target;
3. an eventual (or stronger all-index) lower bound;
4. an eventual (or stronger all-index) upper bound.

The source sequence variable and target are matched structurally. The generated artifact applies mathlib's eventual squeeze theorem `tendsto_of_tendsto_of_tendsto_of_le_of_le'`.

The acceptance corpus includes `sin(real(n))/real(n+1) -> 0`, whose numerator does not converge. Its proof instead squeezes the sequence between `-1/real(n+1)` and `1/real(n+1)`.

## Bounded monotone convergence

Sequence goals now support the result kind `exists_finite`, rendered as

`∃ l : ℝ, Tendsto a Filter.atTop (𝓝 l)`.

This prevents the system from inventing a numeric limit when monotone convergence proves only existence. `sequence_monotone_bounded` accepts either:

- a monotonicity theorem plus a global upper bound, reconstructing a witness `⨆ n, a n` with `tendsto_atTop_ciSup`; or
- an antitone theorem plus a global lower bound, reconstructing `⨅ n, a n` with `tendsto_atTop_ciInf`.

The order and bound facts are ordinary cited quantified propositions. This checkpoint does not guess them from the sequence expression.

## Rational shift asymptotics

`sequence_rational_shift` handles the exact family

`real(n+a) / real(n+b) -> 1`

for fixed natural shifts `a >= 0` and `b >= 1`. The generated proof rewrites the ratio as `1 + (a-b)/(n+b)` and reduces convergence to a shifted reciprocal tail. This is intentionally a narrow, checkable first rational-asymptotic rule rather than polynomial-degree heuristics.

## Authoring and feedback

The authoring parser round-trips eventual bounds in school notation. Proof-state suggestions distinguish missing squeeze evidence, missing monotone/bounded evidence, and unsupported rational-asymptotic shapes instead of returning a generic repair message.

The formal lesson pack includes learner-facing examples for `n/(n+1)`, `(n+2)/(n+5)`, and squeeze convergence of `sin(n)/(n+1)`.

## Explicit boundary

This checkpoint does not yet infer eventual inequalities automatically, prove monotonicity/boundedness from arbitrary formulas, classify divergent/oscillating sequences, handle general ratios of higher-degree polynomials, or prove infinite-series convergence. `exists_finite` establishes existence, not a hidden numeric value. Unsupported cases stay unresolved.

## Validation

Final local validation:

- formal verifier: **225/225 tests passed**;
- ordinary QuickMaths application suite: **234/234 tests passed** in bounded batches;
- formal lesson/reference-proof bridge: **27/27** examples reached `ready_for_kernel`;
- with Lean deliberately unavailable, those **27/27** examples stopped at `verification_unavailable` and **0** carried certificates;
- strict pre-kernel acceptance dry gate: **52/52 positive fixtures** reached the kernel boundary and **21/21 negative fixtures** stopped at their documented rejection state;
- Python compile and JSON/YAML parse hygiene checks passed.

This runtime still has no pinned Lean/Lake installation, so this checkpoint does **not** claim kernel certification. The real acceptance gate remains `scripts/kernel_acceptance.py` in an environment containing the pinned Lean/mathlib cache.
