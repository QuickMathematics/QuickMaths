# Checkpoint 03 — recursive compositional derivatives

Date: 10 September 2026

## Scope

This checkpoint replaces the previous "one curated outer function over a polynomial" ceiling with a bounded recursive derivative plan while keeping the older derivative rules as stable aliases for existing authored lessons.

The new `recursive_derivative` rule structurally differentiates pointwise real expressions built from:

- constants and declared variables;
- negation, addition, subtraction and multiplication;
- division with an explicit nonzero denominator guard at the evaluation point;
- natural-number powers;
- square roots with a strictly positive school-real radicand guard at the evaluation point;
- `exp`, school-real positive-domain `log`, `sin` and `cos`;
- absolute value with explicit strict-positive or strict-negative branch evidence.

Nested absolute values may create alternative proof plans, so recursive planning is capped at 32 branches. Piecewise expressions and arbitrary function application remain unsupported by this rule.

## Trust decisions

- The recursive planner computes a candidate derivative expression and a list of pointwise guards. It does not certify either.
- SymPy equivalence is still only used to recognize that the learner's claimed derivative matches one candidate plan. The successful path is structurally reconstructed as a composition of mathlib `HasDerivAt` lemmas.
- Domain and sign obligations are accumulated from every nested node. A quotient inside an exponential still contributes its denominator guard; a square root around that quotient adds its radicand guard.
- Exact rational guards may be discharged automatically, but the generated Lean artifact proves them with `norm_num`.
- A conservative syntax-only sign recognizer can delegate facts such as `0 < exp(t)` and `0 < x^2 + 1` to Lean `positivity`. Unknown signs are never promoted heuristically.
- School-real `log` remains stricter than mathlib's totalized `Real.log`: QuickMaths requires a positive argument at the point.
- Generic `abs` differentiation refuses the kink branch. For example, `abs(x)` at `0` is not accepted by this rule.
- Existing specialized polynomial, quotient, square-root, absolute-value and elementary-function derivative rules remain available for backward compatibility.

## Representative supported shapes

The acceptance corpus now includes examples equivalent to:

- `d/dx sin(exp(x^2))` at an exact point;
- `d/dx exp((x^2+1)/(x-1))` with an exact denominator guard;
- `d/dx sqrt((x^2+1)/(x+1))` with accumulated denominator and radicand guards;
- `d/dx log(abs(x))` on a selected absolute-value branch;
- `d/dx abs(sin(x))` with symbolic branch evidence;
- `d/dx log(exp(x))`, whose school-domain guard is reconstructed with `positivity`;
- `d/dx sqrt(x^2+1)`, whose strict-positive radicand is reconstructed with `positivity`.

Negative fixtures cover missing absolute-value sign evidence, the `abs` kink, and an incorrect nested derivative formula.

## Integration

`recursive_derivative` is wired through the calculus matcher, local reasoner, obligation preflight, bounded proof search, proof-state actions, capability report, Lean renderer, JSON fixtures and the kernel-acceptance manifest.

`examples/MATH_FORMAL_002_verified_algebra_calculus.yaml` now contains 14 formal example questions. Five recursive examples round-trip through lesson loading, proof-spec resolution, reference-proof RPC and proof-state construction. In this local environment all 14 formal examples reach `ready_for_kernel` and then honestly stop at `verification_unavailable` because Lean is not installed.

The Lean renderer was also hardened so nested built-ins are parenthesized as function applications (for example `Real.sin (Real.exp (...))`). Square-root-specific nonzero helpers are emitted only for actual square-root nodes rather than every positive guard.

## Validation

- Formal verifier Python suite: **159 passed**.
- QuickMaths Python suite: **234 passed** when run in bounded groups.
- Formal example end-to-end bridge: **14/14** reached `ready_for_kernel`; verification status was **14/14 `verification_unavailable`** as expected in this runtime.
- Python source compile check: passed.
- Real Lean kernel compilation: **not run locally** because the pinned Lean/Lake toolchain is absent. No certificate is minted in that state.

## Next slice

With pointwise derivative composition no longer the main calculus bottleneck, the next useful phase-6 slice should add proof-producing continuity reasoning and use it to broaden IVT/limit automation. That gives later sequence, epsilon-delta and integration rules a reusable continuity foundation instead of adding more isolated special cases.
