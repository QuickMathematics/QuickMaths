# Checkpoint 02 — non-smooth and elementary derivatives

Date: 10 September 2026

## Scope

This checkpoint expands the curated derivative pilot without turning the prover into an unrestricted symbolic differentiator.

New formal expression nodes:

- `exp(e)`
- `log(e)`
- `sin(e)`
- `cos(e)`

New derivative rules:

- `abs_derivative` for `|p(x)|` when a strict sign selects a branch;
- `exp_derivative` for `exp(p(x))`;
- `log_derivative` for `log(p(x))` with a school-real `p(a) > 0` guard;
- `sin_derivative` for `sin(p(x))`;
- `cos_derivative` for `cos(p(x))`;

Here `p` is currently a real polynomial expression and the derivative is evaluated at a specified real point.

## Trust decisions

- Matching a derivative formula with SymPy is candidate recognition only. A successful certificate still requires the deterministic Lean `HasDerivAt` artifact to pass the pinned kernel.
- QuickMaths deliberately models school-real `log` as requiring a strictly positive argument. mathlib's totalized `Real.log` is not allowed to silently widen the classroom domain.
- Absolute-value differentiation requires a strict positive or negative branch fact. At an exact point where the inner polynomial is zero, the generic rule returns `needs_justification`; a later specialized rule may prove smoother compositions such as `|x^2|` separately.
- Exact rational sign/domain guards may be recognized locally, but the generated Lean artifact reconstructs them with `norm_num` before using the derivative theorem.
- Search never upgrades a missing sign/domain hypothesis into a proof.

## Integration

The built-ins now round-trip through the typed contract, parser, canonical preview, type checker, domain analysis, SymPy candidate adapter, proof search, local reasoner, Lean renderer, JSON Schema and capability matrix.

The hardened ordinary QuickMaths school-expression parser also accepts the same safe unary functions. This keeps normal answer grading aligned with formal lesson examples without allowing arbitrary function calls or Python execution.

`examples/MATH_FORMAL_002_verified_algebra_calculus.yaml` now contains reference lessons for absolute value, exponential, logarithm, sine and cosine derivatives. All nine formal example lessons round-trip through the lesson bridge and reference-proof protocol to `ready_for_kernel` in this local environment.

## Validation

- QuickMaths Python suite: **234 passed**.
- Formal verifier suite: **145 passed**.
- Python source compile check: passed.
- Real Lean kernel compilation: **not run locally** because this container does not have the pinned Lean/Lake environment. The verifier therefore continues to return `verification_unavailable`, never `verified`, here.

The kernel acceptance manifest now includes all new positive derivative fixtures plus negative absolute-value-kink and missing-log-domain fixtures.

## Suggested next slice

Generalize the derivative engine from “curated outer function + polynomial inner function” to a recursively compositional derivative plan. Do this in layers so every constructor carries its own domain obligations: arithmetic composition first, then nested elementary functions, then guarded quotients/square roots/absolute values. Keep each recursive proof node reconstructible as a `HasDerivAt` term rather than trusting a symbolic derivative expression.
