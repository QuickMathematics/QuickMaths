# Formal verifier implementation checkpoint

Date: 10 September 2026

## Decision

**Continue with Lean 4 + mathlib and the isolated QuickMaths formalization layer. Do not attach a production `Verified` badge until the pinned Lean corpus is compiled and replayed by the real kernel.**

The implementation is now beyond the initial Phase 0 shape-only spike. It has a usable typed authoring/protocol surface, explicit mathematical domains, a proof-state engine, bounded candidate planning, an educational algebra rule set, selected calculus proofs, scoped natural-deduction interaction (cases, quantifiers, witnesses and induction), function/set reasoning, deterministic Lean generation, and certificate/replay plumbing.

## Formal environment

Pinned:

- mathlib `42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c`
- Lean `leanprover/lean4:v4.34.0-rc2`

This local ChatGPT container still does not contain `lean`/`lake`, and outbound Git/package fetching is restricted. Accordingly, generated Lean is reported as `verification_unavailable`, not `verified`. This is the largest remaining Phase 0/1 exit-gate item.

## Implemented mathematical behavior

The local boundary now checks or plans:

- ring and guarded field identities;
- explicit domain preservation for division and square root;
- equation transformations and proof chains;
- sign-aware inequality transforms;
- exact counterexamples for bounded free-variable algebra cases;
- conservative exact affine entailment checks before automatic linear-arithmetic proposals;
- implication/negation subproofs, conjunction/disjunction cases, contradiction and biconditionals;
- universal/existential introduction and elimination with capture-avoiding substitution and scope checks;
- natural-number induction with an isolated induction-hypothesis scope;
- function and set extensionality plus subset/membership reasoning;
- removable rational-hole limits;
- conjugate-hole limits with `x >= 0` and punctured denominator semantics;
- reciprocal left/right infinite limits;
- piecewise jump nonexistence via incompatible one-sided limits;
- polynomial, guarded polynomial-quotient and positive-domain square-root derivatives at specified real points;
- absolute-value-of-polynomial derivatives away from zero, with the sign branch made explicit;
- polynomial-inner `exp`, school-real positive-domain `log`, `sin` and `cos` chain-rule derivatives;
- recursive compositional pointwise derivatives across arithmetic, natural powers, guarded quotient/square-root/absolute-value nodes and nested `exp`/school-real `log`/`sin`/`cos`;
- exact rational evaluation of pointwise derivative/sign guards, with the corresponding Lean proof reconstructed using `norm_num` rather than trusted from Python;
- exact affine-over-affine sequence limits `(a + c*n)/(b + d*n) -> c/d` for rational coefficients with nonzero denominator leading coefficient, reconstructed with mathlib's dedicated Nat.atTop theorem;
- exact degree-two-over-degree-two sequence limits, including expanded/factored rational-coefficient syntax, reconstructed by normalizing with `n^2` and kernel-checking the vanishing `1/n` and `1/n^2` tails;
- elementary sequence divergence certificates for exact period-2/3/4 oscillations, with premise-free finite perturbations transported through residue-class subsequences by the ordinary sequence-algebra prover;
- conservative structural sign recognition for expressions such as `exp(t)` and `x^2 + 1`, reconstructed with Lean `positivity` before a certificate can exist.
- proof-producing structural continuity plans for finite direct-substitution limits, including explicit point-domain guards;
- broader IVT existence over exact intervals for structurally continuous expressions when interval-wide guards and endpoint brackets are reconstructible.

Important negative behavior includes missing denominator guards, wrong limit direction, invalid algebra transforms, sign errors in inequalities, incorrect conjugate targets, equal-branch misuse of the jump rule, leaked child assumptions, and attempts to infer IVT uniqueness from existence.

Search remains outside the trust boundary. Assisted plans are marked separately from learner-submitted derivations and are only certifiable after normal kernel verification.

## Integration surface

- `schemas/formal-proof.schema.json`: declarative structural contract;
- `qm-formal prove-text`: constrained school-notation entry point with explicit variable declarations;
- JSON protocol operations for parse/preview/state/suggest/search/prove/check/replay;
- loopback HTTP companion with origin allowlisting and request-size limits.

The current production `limit_steps` path remains tutor-reviewed exactly as before.

## Validation in this local checkout

- formal-verifier focused tests: 233 passed in Checkpoint 10;
- previous full QuickMaths Python baseline: 234 passed; for Checkpoint 10 the touched app surfaces pass 31/31 when run in proportional batches (2 formal examples, 9 content loader, 8 formal bridge, 12 problem generator); the authored formal lesson bridge also sends 29/29 reference proofs to `ready_for_kernel`, after which all 29 stop honestly at `verification_unavailable` with zero certificates in this no-Lean container;
- browser JavaScript suite was not rerun in checkpoint 04; the checkpoint changes are confined to Python formal-verifier/lesson surfaces.

## Next exit gates

1. Obtain the pinned Lean/mathlib environment and compile every supported fixture plus generated artifacts.
2. Repair any elaboration/library-name drift revealed by actual Lean.
3. Record cold/warm kernel latency, memory, artifact size and cache behavior.
4. Run certificate replay/tampering tests through the real kernel.
5. Expand the permanent mutation/property corpus around the now-implemented general proof interaction and keep search conservatively incomplete.
6. Extend sequence asymptotics one degree class at a time: next unequal-degree quadratic/polynomial ratios with explicit zero or signed-infinity semantics, then broader exact polynomial ratios; keep series and epsilon-delta/integration rules separate.
7. After independent translation review, wire an opt-in formal lesson mode without changing existing tutor-reviewed history.
