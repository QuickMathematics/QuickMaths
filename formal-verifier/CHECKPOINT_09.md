# Checkpoint 09 — exact affine sequence ratios

Date: 11 September 2026

## Scope

This checkpoint takes one deliberately small step past the shifted-ratio family from Checkpoint 08: exact affine-over-affine real sequences now have a dedicated kernel-backed rule.

The supported family is

`(a + c*real(n)) / (b + d*real(n)) -> c/d`

for exact rational coefficients with `d != 0`. Equivalent affine syntax such as `2*real(n)+3`, subtraction, negation, rational scalar multiplication, and division by exact nonzero constants is normalized by a conservative degree-at-most-one recognizer. Nonlinear products and nonconstant divisors are rejected.

## Trust boundary

The Python matcher only decides whether the submitted goal is in the advertised exact affine family and whether its target is exactly the ratio of leading coefficients. It does not certify convergence.

Generated Lean applies mathlib's existing theorem

`tendsto_add_mul_div_add_mul_atTop_nhds`

and supplies the nonzero denominator leading coefficient with `norm_num`. The generated artifact then relates the canonical affine form back to the learner's exact expression pointwise. The pinned mathlib revision used by this repo contains that theorem.

As in prior checkpoints, this local runtime still has no Lean/Lake installation, so successful local requests stop at `verification_unavailable` and never receive certificates.

## End-to-end integration

`sequence_affine_ratio` is wired through:

- exact sequence matching;
- preflight obligations and repair feedback;
- candidate reasoner;
- bounded search suggestions;
- semantic domain-requirement discharge for the bound index;
- deterministic Lean rendering;
- capability advertisement;
- public `prove_text` protocol;
- strict kernel-acceptance corpus;
- the experimental formal lesson pack.

The lesson corpus now includes `(2n+3)/(5n+7) -> 2/5`.

## Negative behavior

The rule rejects before the kernel when:

- the claimed target is not the exact leading-coefficient ratio;
- the denominator has zero leading coefficient;
- either side is nonlinear or otherwise outside the conservative affine grammar.

This is intentionally not a generic polynomial-ratio heuristic.

## Validation

Local validation for this checkpoint:

- formal verifier: **229/229 tests passed**;
- touched QuickMaths app surfaces: **31/31 tests passed** (`formal_examples`, content loading, problem generation and formal bridge);
- formal lesson/reference bridge: **28/28** reference proofs reached `ready_for_kernel`, and **28/28** then stopped honestly at `verification_unavailable` with no certificates;
- focused public protocol coverage confirms the rule is auto-selected and stops at `verification_unavailable` without Lean;
- `git diff --check` passes;
- generated Lean was inspected for integer, negative-leading, and rational-leading coefficient examples.

The real-kernel gate remains mandatory before any `Verified` badge. The pinned theorem dependency was checked directly in mathlib revision `42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c`, but the generated artifacts have not been elaborated in this container.

## Next small boundary

A sensible next checkpoint is **degree-aware polynomial-ratio asymptotics**, starting with exact quadratic-over-quadratic limits. That should stay separate from divergence classification so each extension has a tight matcher, explicit target semantics, and a small kernel acceptance corpus.
