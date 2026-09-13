# Checkpoint 05 — quantified interval evidence for continuity and IVT

Date: 10 September 2026

## Scope

This checkpoint makes interval-wide school-domain facts first-class proof evidence. `continuous_ivt_exists` no longer requires every continuity guard to be syntax-obvious to `positivity`/`norm_num`; it can cite a universally quantified fact over the exact IVT interval and instantiate that fact inside the generated `ContinuousOn` proof.

The school-text parser accepts bounded universal sugar such as:

```text
for every t:real in [0, 1], t + 2 != 0
```

and normalizes it to the ordinary contract proposition:

```text
forall t:real, ((0 <= t) and (t <= 1)) implies (t + 2 != 0)
```

No new trusted proposition kind was introduced: interval evidence is represented using the existing typed `forall`, `and`, `implies`, inequality and equality constructors.

## Trust decisions

- Interval evidence must match the exact interval used by the IVT goal. Evidence about a different interval is not silently reused.
- Binder names are alpha-equivalent, so `t`, `y` or another fresh binder name do not affect meaning.
- A matching premise must be explicitly cited by the proof step. Merely existing somewhere outside the step premises is not enough for preflight/Lean reconstruction.
- Conservative stronger-to-weaker bridges are explicit: `0 < g(t)` may discharge `g(t) != 0` or `0 <= g(t)`; `g(t) < 0` may discharge `g(t) != 0`. Lean performs `ne_of_gt`, `le_of_lt` or the corresponding exact instantiation.
- Syntax-obvious interval guards still use generated Lean `positivity`/`norm_num`; quantified evidence is used only when needed.
- Missing interval evidence is reported as a universal interval obligation (`ivt_interval_guard_required`), not as a misleading witness-specific fact such as `g(c) != 0`.
- The feature changes only candidate/preflight/reconstruction behavior. Only a successful Lean run can issue `verified` and a certificate.
- Quantified interval facts are not restricted to authored assumptions: the structured planner can prove bounded universal guards using ordinary scoped `forall_intro`, `imp_intro`, conjunction elimination and arithmetic steps.

## Representative acceptance case

The corpus now includes the conditional IVT statement

```text
assume for every t:real in [0,1], t + 2 != 0
prove there exists c:real in [0,1] with 1/(c+2) = 2/5
```

The generated continuity proof contains the essential trust-preserving step:

```lean
have hguard : c + 2 ≠ 0 := by
  exact h1 c hmem
```

before `fun_prop` is allowed to establish continuity of the quotient.

A paired negative fixture omits the interval premise and must remain `needs_justification`.

The real-kernel manifest also includes a planner-produced bounded theorem:

```text
for every t:real in [0, 1], 0 < t + 2
```

The planner constructs this as a scoped `forall_intro` / `imp_intro` proof, extracts both interval bounds from the conjunction, and uses `linarith`. Its arithmetic gate models true positive numeric slack explicitly, so `0 <= t` can justify `0 < t + 2` without incorrectly treating `0 <= t` as evidence for `0 < t`.

## Integration

Quantified interval evidence is wired through:

- formal text parsing and canonical proposition rendering;
- structural IVT matching;
- goal-domain semantics;
- preflight obligations;
- proof-state actions/rule hints;
- bounded proof search and premise selection;
- deterministic Lean reconstruction;
- public `prove_text` protocol;
- real-kernel acceptance manifest;
- capabilities and roadmap documentation.

## Validation boundary

The Python suite can validate representation, matching, scope/premise use and deterministic Lean generation in this environment. Current checkpoint validation is **183/183 formal-verifier tests** plus a fresh **234/234 QuickMaths application tests** after the final scoped-arithmetic change. A pre-kernel dry gate also confirms that all **35 positive acceptance fixtures** reach `verification_unavailable` with Lean deliberately absent, while all **13 negative fixtures** stop at their documented rejection status. Real Lean kernel compilation remains the final acceptance gate and is not available locally; no certificate is issued when Lean/Lake is absent.

## Next slice

The next coherent analysis milestone is broader finite-limit algebra built from compositional `Tendsto` proofs, followed by sequence convergence. That should reuse the existing domain/continuity evidence model rather than adding another collection of isolated limit formulas.
