# Checkpoint 06 — compositional finite-limit algebra

Date: 10 September 2026

## Scope

This checkpoint adds `limit_algebra`, a reusable finite-limit planner that constructs an explicit `Filter.Tendsto` proof tree instead of proving every limit by a single direct-continuity shortcut. It is designed to compose with the existing special-case limit rules: a removable-hole result can be proved first, then cited as one leaf inside a larger sum/product/composition limit.

Supported structural nodes are exact constants, the approach variable, free-variable constants, negation, addition, subtraction, multiplication, division, natural powers, absolute value, `exp`, school-real `log`, `sin`, `cos`, and strictly-positive `sqrt` composition.

## Trust decisions

- A cited finite sublimit may be reused only when its approach variable, point, direction and explicit domain filter are exactly the same as the outer limit. Left/right/two-sided or domain-restricted evidence is never silently transported to another filter.
- Reused sublimits are opaque leaves. The planner does not re-derive or reinterpret the proof that established them.
- Quotient composition requires the denominator's **target limit** to be nonzero. The generated Lean tree then uses `Filter.Tendsto.div`; Python does not claim eventual nonzeroness on its own.
- School-real `log` and compositional `sqrt` require the inner target limit to be strictly positive. Lean derives the eventual positive-domain fact from the inner `Tendsto` proof using `tendsto_order` before composing the outer continuous function.
- Exact rational guards generate `norm_num`; syntax-obvious structural guards generate `positivity`; stronger cited facts such as `0 < a` are converted explicitly to `a != 0` in Lean.
- `sqrt` at a zero boundary is deliberately outside `limit_algebra`'s strict-positive composition rule. Existing domain-aware `continuity_limit` handles cases such as the right-hand school-domain limit of `sqrt(x)` at zero.
- Literal malformed divisions such as an exact `1/0` target remain a contract/type error rather than being forced through a mathematical rule rejection.
- Arbitrary declared applications and generic piecewise expressions are not recursively assigned a limit rule. They may participate only when the exact matching expression has already been established by another finite-limit proof step and is cited as an opaque leaf.
- Infinite target algebra and sequences are not part of this checkpoint.

## Representative acceptance cases

The acceptance corpus includes:

- `(x^2 + 3*x - 1)/(x + 1) -> 3` as `x -> 2`, reconstructed from identity/constant/power/add/sub/div limit nodes;
- the right-hand limit `sin(x) + x^2 -> 0` at zero, preserving the same right-hand filter through every node;
- `(x^2 - 9)/(x - 3) + sin(x - 3) -> 6` at three, where the removable-hole limit is proved first by `rational_hole_limit` and then cited by `limit_algebra`;
- `(x+1)/a -> 1/a` at zero under `0 < a`, with an explicit `ne_of_gt` bridge before quotient composition;
- `log(exp(x)+1) -> log(2)` and `sqrt(x^2+1) -> 1`, including explicit eventual positive-domain evidence reconstructed from the inner convergence proof.

Paired negative cases cover a nonpositive logarithm target and an attempted removable-hole composition with the prerequisite hole limit omitted.

## Integration

`limit_algebra` is wired through:

- structural matching and candidate-value computation;
- explicit target-domain guard collection;
- proof-state/preflight obligations;
- bounded search and exact prior-sublimit selection;
- local candidate reasoning;
- deterministic Lean reconstruction;
- capability reporting;
- public `prove_text` assistance;
- lesson/reference-proof examples;
- real-kernel acceptance manifest.

The previous `continuity_limit` and specialized limit rules remain available and existing authored lessons keep their original rule policies.

## Kernel API basis

The generated proof tree uses standard mathlib `Filter.Tendsto` combinators (`add`, `sub`, `mul`, guarded `div`) and continuous-function composition. Identity limits are restricted from `nhds` to the requested `nhdsWithin` source with `mono_left nhdsWithin_le_nhds`. Domain-sensitive unary composition records eventual positivity from convergence before composing the outer function.

## Validation boundary

This runtime still does not contain the pinned Lean/Lake toolchain, so no checkpoint result is called kernel-certified here. Final local validation is **193/193 formal-verifier tests** plus **234/234 QuickMaths application tests** in bounded batches. The 21 authored formal lesson examples all resolve to `ready_for_kernel` and then stop honestly at `verification_unavailable` with no certificate. A pre-kernel dry run of the strict manifest confirms that all **41 positive fixtures** reach that kernel boundary and all **15 negative fixtures** stop at their documented rejection state. The strict real-kernel gate remains `scripts/kernel_acceptance.py` for an environment containing the pinned Lean/mathlib cache.

## Next slice

The next coherent analysis milestone should be sequence convergence over `Nat.atTop`, reusing the same proof-tree philosophy where possible. After that, infinite-limit algebra and selected epsilon-delta proofs can build on a clearer separation between finite `nhds` targets and `atTop`/`atBot` behavior.
