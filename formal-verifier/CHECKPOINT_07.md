# Checkpoint 07 — first-class sequence convergence over `Nat.atTop`

Date: 10 September 2026

## Scope

This checkpoint adds sequences as a distinct theorem-prover statement kind rather than encoding `n → ∞` as a real point-limit. A `sequence_limit` binds a natural index and reconstructs Lean `Filter.Tendsto ... Filter.atTop ...` statements directly.

## Representation and trust boundary

- Sequence indices must be declared `nat`.
- `real(expr)` is an explicit natural-to-real cast. Natural arithmetic occurs before the coercion, so expressions such as `real(n - 1)` retain natural subtraction semantics instead of being reinterpreted as real subtraction.
- Variable exponents such as `r^n` use a natural-index power node; the exponent must type-check as `nat`.
- A finite sequence target may not depend on the bound index.
- Root assumptions may not contain the sequence index free. Index-dependent hypotheses must use an explicit quantifier.
- Search/local symbolic matching never certifies convergence. Supported plans reconstruct Lean `Tendsto` proofs and still require the kernel before a certificate can exist.

## Supported sequence proof families

`sequence_algebra` currently composes:

- constant sequences;
- exact matching previously proved finite sequence limits;
- shifted reciprocal tails `c / real(n+k) → 0` for fixed `k ≥ 1`;
- geometric tails `r^n → 0` under exact or cited `|r| < 1`;
- negation, addition, subtraction, multiplication and guarded division;
- literal natural powers;
- continuous composition through absolute value, exponential, sine, cosine, school-real logarithm and strictly-positive square root.

Division requires a nonzero denominator target. School-real logarithm and the compositional square-root branch require a strictly positive inner target. Exact guards compile to `norm_num`; cited guards remain explicit proof dependencies.

`sequence_nat_at_top` separately proves `real(n+k) → +∞`, making the source/target filter semantics visible rather than hiding them inside reciprocal rules.

## Representative corpus

Positive fixtures include `1/real(n+1) → 0`, `(1/2)^n → 0`, symbolic `r^n → 0` under `|r| < 1`, `sin(1/real(n+1)) + (1/2)^n → 0`, reuse of a previously proved reciprocal sublimit inside a larger expression, and `real(n+2) → +∞`. Negative fixtures cover a geometric ratio outside the unit interval, a missing symbolic ratio bound, and a wrong shifted-reciprocal target.

The formal lesson pack adds three learner-facing sequence examples and sends them through the same proof-spec/reference-proof RPC used by prior algebra and calculus content.

## Explicit boundary

This is not a general asymptotics engine. Arbitrary rational sequences such as `n/(n+1)`, squeeze/monotone convergence, oscillation/divergence classification, factorial/exponential comparisons, recurrence limits and infinite series remain future checkpoints. Unsupported cases stay unresolved rather than being simplified heuristically into a verdict.

## Validation

Final local validation:

- formal verifier: **208/208 tests passed**;
- ordinary QuickMaths application suite: **234/234 tests passed** in bounded batches;
- formal lesson/reference-proof bridge: **24/24** examples reached `ready_for_kernel`;
- with Lean deliberately unavailable, those **24/24** examples stopped at `verification_unavailable` and **0** carried certificates;
- strict pre-kernel acceptance dry gate: **47/47 positive fixtures** reached the kernel boundary and **18/18 negative fixtures** stopped at their documented rejection state;
- Python compile and JSON/YAML parse hygiene checks passed.

The runtime still has no pinned Lean/Lake installation, so this checkpoint does **not** claim kernel certification. The real acceptance gate remains `scripts/kernel_acceptance.py` in an environment containing the pinned Lean/mathlib cache.
