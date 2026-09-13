# A general proof assistant for QuickMaths

**Status:** Active implementation roadmap. The isolated `formal-verifier/` now implements substantial phases 0–5 and an expanding phase-6 calculus surface, including recursive compositional derivatives, structural continuity limits and broader IVT-existence proofs; this document remains the target architecture and exit-gate checklist.

**Date:** 9 September 2026; implementation status updated 10 September 2026.

**Baseline:** Originally drafted against QuickMaths commit `47b97d2`. Current implementation preserves ordinary tutor-reviewed lesson behavior while formal verification remains opt-in.

## Local integration update: 13 September 2026

The existing engine now has a native learner workspace, reference-free revision-bound WebMCP proof-state tutoring, and a private fresh-certificate gate through submission and mastery. Ordinary grading and tutor verdicts cannot pass formal questions. Restored evidence remains archived until replay. The Proof Lab package provides three candidate lessons. See [FORMAL_LEARNING.md](FORMAL_LEARNING.md) and the repository's `LOCAL_RELEASE.md` for implementation, tests and remaining gates.

This does not claim actual Lean execution in the current environment. Rich subproof authoring, method-specific assessment policies, stronger deployment authentication and public-demo kernel acceptance remain unfinished. The roadmap below preserves the broader target; it is not a claim that every listed phase is complete.

## 1. The target and its limits

Build an educational proof assistant in which a learner can state a mathematical claim, construct an argument, see the remaining obligations, and receive a reproducible certificate when the entire argument is verified. It should eventually cover ordinary school and university mathematics without requiring learners to write a proof-assistant programming language.

There are three different meanings of “complete”:

| Meaning | Our commitment |
| --- | --- |
| Every accepted proof is complete: no missing steps, unsupported hypotheses or unproved obligations | Required, relative to a documented foundation and interpretation |
| The language can express broad mathematics and users can supply sophisticated proofs | Long-term goal using an established proof assistant |
| Automation always terminates and correctly proves or disproves every mathematical statement | Impossible in general |

Undecidability rules out the universal terminating solver. Incompleteness also limits what an effectively axiomatized, consistent theory strong enough for arithmetic can establish. First-order logic's completeness theorem does not make arbitrary mathematical theories decidable. A timeout or an unsuccessful search must therefore remain “not established,” never “false.” [Stanford lecture on first-order theories, decidability and incompleteness](https://theory.stanford.edu/~arbrad/slides/cs156-old/lec3-4.pdf).

“Future proof” means stable mathematical contracts, replaceable automation, reproducible old results, and a controlled way to extend the supported theories. It cannot mean zero maintenance or unlimited automatic reasoning.

**Recommended product:** QuickMaths owns the educational experience and formalization layer; Lean 4 and mathlib supply the initial formal foundation. Start with a narrow, trustworthy algebra/calculus assistant, while choosing representations that also accommodate quantifiers, induction, sets and functions.

## 2. Build on a kernel; do not start by inventing one

Lean tactics construct proof terms that the kernel checks. This separates potentially complicated proof search from the smaller mechanism that establishes whether the resulting proof has the required type. [Lean tactic proofs](https://lean-lang.org/doc/reference/latest/Tactic-Proofs/).

The initial feasibility study should compare two real candidates:

| Candidate | Why investigate it | Decision criterion |
| --- | --- | --- |
| Lean 4 + mathlib | Proposed default; reuse formal mathematics and expose curated proof operations through an adapter | Can we faithfully express our domains, reconstruct student steps, and deliver useful feedback at acceptable cost? |
| Isabelle/HOL | Alternative if its proof automation and library fit our chosen exercises better | Run the same representative claims; compare integration effort and proof reconstruction |
| A new custom kernel | Control over everything, but also responsibility for logic, implementation correctness, libraries and tooling | Reject for this product unless building a new proof foundation becomes the project's primary purpose |

Isabelle's Sledgehammer provides a useful architectural precedent: outside provers search for results, then proofs are reconstructed within Isabelle. A solver's answer alone is not the certificate. [Official Sledgehammer guide](https://isabelle.in.tum.de/doc/sledgehammer.pdf).

Select one backend after the spike. Do not fund multiple production backends prematurely. Keep a narrow adapter boundary, while preserving backend-specific proof artifacts; mathematical proofs are not automatically portable between foundations.

## 3. Architecture and trust boundaries

```mermaid
flowchart TD
    A[Learner steps and authored problem] --> B[Parse and resolve mathematical meaning]
    B --> C[Typed statement, domains and scoped assumptions]
    C --> D[Proof obligations and step dependencies]
    D --> E[Curated rules and bounded proof search]
    E --> F[Candidate proof artifact]
    F --> G[Fresh kernel verification and axiom audit]
    G --> H[Certificate bound to this statement and submission]
    H --> I[Mathematical status and separate lesson rubric]
    D --> J[Remaining goals and explanations]
```

The proof kernel is necessary but insufficient for product correctness. A perfectly checked proof of the wrong translation is still the wrong answer to the lesson. There are three assurance boundaries:

1. **Meaning:** the displayed question, parsed statement and domain really match.
2. **Mathematics:** the proof establishes that exact statement under the stated assumptions.
3. **Education:** the submitted work meets the lesson's method and explanation requirements.

The first version needs independently reviewed translation fixtures, a canonical statement preview, and explicit mappings from learner steps to verified obligations. Later, prove correctness of particularly critical translation passes where practical.

### Components to implement

| Component | Responsibility | Must not do |
| --- | --- | --- |
| Mathematical editor | Accessible expressions, statements, justifications and nested subproofs | Silently reinterpret ambiguous text |
| Typed mathematical representation | Exact values, types, binders, domains and source locations | Treat a rendered string as authoritative semantics |
| Obligation manager | Track claims, dependencies, local assumptions and remaining goals | Reuse a temporary assumption outside its scope |
| Rule registry | Map named educational rules to checked formal lemmas | Accept a package's claim that its rule is sound |
| Backend adapter | Translate the typed representation into the selected foundation | Inject arbitrary package code |
| Search worker | Try deterministic tactics, then optional candidate generators | Assign verified status itself |
| Verifier | Check proof, exact target, environment and permitted dependencies | Trust a success flag from a worker |
| Feedback mapper | Explain a failed obligation in learner language | Turn a timeout into an incorrect-answer verdict |
| Evidence store | Preserve submissions, certificates and compatible environments | Reattach an old certificate to edited content |

## 4. Mathematical representation

Use a versioned typed tree, not increasingly elaborate regular expressions. The initial expression language should remain small, but its statement model must support extension.

- Exact integers and rationals; decimals acquire an explicit exact or approximate interpretation.
- Types such as natural numbers, integers, rationals, reals, sets and functions. Complex numbers and matrices arrive as explicit extensions.
- Variables with stable IDs and scoped binders, not names alone.
- Expressions, equality, inequality, implication, equivalence, conjunction, disjunction, negation and quantifiers.
- Definitions distinguished from hypotheses, established facts and goals.
- Domains and definedness obligations attached to expressions and transformations.
- Source spans linking formal obligations to the original learner input.
- Canonical serialization with a version, deterministic content hashes and explicit migrations.

Do not let an unknown identifier silently become a new variable or function. Distinguish equality from approximation, multiplication from function application, and real from integer division. Ask for clarification when a parse has materially different meanings.

The rendered canonical statement should be available before checking: “For every real x other than 3…” is easier to inspect than a hidden AST. Natural-language input can propose this representation; the confirmed representation is what gets proved.

### Domains are first-class

School expressions are often partial functions. Formal libraries can define operations outside their familiar school domains. Our adapter must introduce the intended guards, rather than assume library evaluation automatically models classroom meaning. For example, mathlib explicitly documents a total real square-root function with a convention on negative inputs. [Mathlib square-root definitions](https://leanprover-community.github.io/mathlib4_docs/Mathlib/Analysis/Real/Sqrt.html).

The following distinctions must survive simplification:

- `(x²-9)/(x-3)` requires `x != 3`, even after cancellation.
- `sqrt(x²) = abs(x)`; replacing it by `x` needs a nonnegative assumption.
- Squaring an equation may introduce candidates; it is not automatically an equivalence.
- Dividing an inequality requires a nonzero divisor and knowledge of its sign.
- Adding a domain restriction can weaken a claim. It is not automatically a valid proof of the original goal.
- Equality everywhere, equality on a specified set, and equality sufficiently near a point are different claims.

Track the original expression's domain separately from the simplified expression's own domain. A transformation carries the relationship between them as evidence.

## 5. Proof state and step checking

Represent an argument as a dependency graph with nested scopes. Each node records:

1. The claim and local context.
2. The cited premises or previously established nodes.
3. The proposed rule and its instantiated parameters.
4. Generated side conditions and unresolved subgoals.
5. The resulting evidence, if established.

A rule such as cancellation generates a nonzero obligation. A proof by cases generates an exhaustiveness obligation. An induction creates a base case and a properly scoped induction hypothesis. Introducing an existential statement needs a witness; using one requires correct elimination scope.

Reject circular dependencies, references to later unproved facts, and use of the final goal as an assumption. Final verification composes the whole argument, not merely independent local comparisons.

Automatic gap filling must be visible. There are two different modes:

- **Proof assistance:** the app may offer and insert an explicitly marked missing argument.
- **Assessment:** the rubric determines which routine steps can be implicit; substantive missing work remains missing even if the solver knows the answer.

A backend proof of the answer does not establish that the learner's submitted derivation is valid. Store that distinction in the evidence.

## 6. Calculus semantics and first worked example

Build the calculus adapter around neighborhoods and directed approach semantics, rather than repeated numeric substitution. Represent the variable, approach point, direction, domain, original expression and result kind separately.

Supported result kinds should include finite real value, positive infinity, negative infinity, and no common two-sided limit. Nonexistence needs a proof, for example incompatible one-sided limits; failure to find a limit is not evidence of nonexistence.

Require an appropriate accumulation condition on the approach domain. An empty neighborhood or isolated point must not produce a vacuous classroom limit. Preserve the distinction between `f(a)` and the limit near `a`.

### Worked acceptance case

Goal: prove that `(x²-9)/(x-3)` approaches `6` as `x` approaches `3` through real inputs other than `3`.

| Student operation | Formal obligation |
| --- | --- |
| Factor the numerator | Prove the polynomial identity `x²-9 = (x-3)(x+3)` |
| Cancel `x-3` | Establish its nonzero value on the punctured domain |
| Replace the quotient by `x+3` near 3 | Prove equality on the relevant punctured neighborhood |
| Evaluate the limit of `x+3` | Establish the applicable continuity/limit facts |
| Conclude 6 | Transfer the limit using the neighborhood equality |

The certificate must not claim that the original quotient is defined at 3. Removing the punctured-domain justification must leave an obligation unresolved.

### Further calculus obligations

- A quotient law needs a nonzero limiting denominator, not merely a denominator nonzero at sampled inputs.
- Conjugate multiplication needs its own definedness and nonzero conditions.
- Difference quotients preserve `h != 0` and the domain of both function arguments.
- Epsilon-delta proofs enforce quantifier order and permitted dependencies of delta.
- Directed infinite limits require sign and eventual-bound arguments.
- Piecewise limits distinguish a boundary's assigned value from either approaching branch.
- IVT requires the relevant continuity and interval hypotheses. Existence does not establish uniqueness; a separate argument is needed.
- Derivative rules need differentiability hypotheses. Integral and convergence results need their own conditions rather than generic symbolic equivalence.

Start with supported rule families and explicit remaining obligations. Preserve tutor review for arguments outside that coverage.

## 7. Automation without confusing search with proof

Use the cheapest sufficient strategy first:

1. Reuse evidence with an identical statement, context, submission scope and environment.
2. Apply the learner's selected rule and establish simple side conditions.
3. Run bounded normalization and curated arithmetic/algebra tactics.
4. Search a relevant, versioned set of lemmas.
5. Optionally call external solvers or an AI assistant for candidate arguments.
6. Independently verify any resulting proof before accepting it.

CAS simplification, numeric sampling and language-model confidence are not proof certificates. A counterexample proposed numerically must itself be checked against the exact domain and claim before the app reports a refutation.

External SAT/SMT/CAS integrations need proof reconstruction or an appropriately verified certificate checker. Without that bridge, their output remains a hint. Keep optional AI suggestions out of the trusted boundary and make their cost bounded and controllable.

Expose separate outcomes:

| Outcome | Meaning |
| --- | --- |
| Verified | The exact claim and required submitted argument have accepted evidence |
| Needs justification | A particular premise, side condition or step is missing |
| Refuted | A checked contradiction or counterexample defeats the specified claim |
| Ambiguous input | Meaning must be resolved before checking |
| Unsupported | The current interface or theory adapter cannot handle this construct |
| Search limit reached | No conclusion within the configured budget |
| Verification unavailable | The required worker is offline or unavailable |
| Engine error | The implementation failed; no mathematical verdict |

These are distinct from the lesson grade. A mathematically valid shortcut may fail an authored “use induction” requirement, while a sound partial argument can earn partial credit without being called a complete proof.

## 8. Kernel, dependency and execution security

Adopt an explicit axiom policy. Reject `sorry`, `admit`, unapproved new axioms and transitive dependencies that introduce them. Lean tracks axiom dependencies, but accepting an axiom does not prove that it is consistent. “Verified” always means relative to the published foundation and permitted assumptions. [Lean axioms and dependency auditing](https://lean-lang.org/doc/reference/latest/Axioms/).

Separate malicious-code containment from mathematical checking:

- Packages submit declarative data, not Lean source, tactics, macros, imports or executable files.
- Generate backend requests using typed constructors and a curated rule registry.
- Run search workers without network access, user files, GitHub credentials or repository write permission.
- Enforce CPU, memory, output, nesting, queue and proof-size budgets.
- Verify artifacts in a fresh process against an approved, immutable environment.
- Treat deserializers, compiled dependencies and native execution paths as security-sensitive.
- Exclude compiled-evaluation shortcuts such as `native_decide` from the initial accepted pipeline unless their exact trust requirements have been audited.
- Pin dependency versions and hashes. Updates require controlled rebuilds, regression checks and an axiom-dependency comparison.

Lean's distribution includes tools for reproducible builds and replaying elaborated artifacts through the kernel; evaluate these in the spike instead of inventing a success-message parser. [Lean build tools and distribution](https://lean-lang.org/doc/reference/latest/Build-Tools-and-Distribution/).

A second independently implemented checker is a later assurance improvement, not a substitute for validating the original mathematical translation.

## 9. Runtime and offline design

QuickMaths is currently delivered as a static site. The first integration should use a local command-line verifier for development. Once the proof contract works, add a small isolated service for phone access or a user-run companion service.

Do not commit to running the full selected prover and library inside every browser before measuring download size, startup, memory and supported runtime behavior. Browser execution can be a later option if the measurements justify it.

| Situation | Honest app behavior |
| --- | --- |
| Existing ordinary lesson or symbolic exercise | Current local behavior continues |
| Formal exercise while verifier is available | Submit a bounded job; show progress without blocking navigation |
| Formal exercise offline without a local verifier | Save the draft and mark verification pending |
| Previously checked unchanged attempt | Display its preserved verification provenance |
| Edited previously checked attempt | Preserve history; require verification of the new submission |

Start with one worker and a queue, cancellation, deduplication and limited concurrency. Add capacity only when measured demand requires it. A slow proof job must not freeze lessons, diagrams or syncing.

The proof runtime is a separate design question from native image delivery. This plan does not reintroduce hosted media chunks.

## 10. Certificates, persistence and sync

Each accepted result must bind together:

- Canonical statement and hypotheses, including domain semantics.
- Exact learner submission and the steps whose correctness was checked.
- Resolved question parameters and immutable authored specification.
- Translator, schema, rule policy, backend toolchain and library versions.
- Proof artifact and its dependency closure, with content hashes.
- Axiom audit and the verifier's result.

Keep enough material to replay the result: a digest alone is not a proof archive. Separate shared immutable environments from per-attempt evidence to avoid duplicating a library in every backup. Offer a self-contained proof export for long-term independent checking; normal backups must clearly report whether they include artifacts or references requiring an environment archive.

A signed service receipt authenticates who issued a result. It does not replace mathematical verification. Label remote verification and local independent replay accurately.

Sync treats certificates as immutable evidence attached to exact content. It must never merge a `verified: true` flag onto a different submission. Recompute content bindings after a merge. Agent overwrite priority and device conflict resolution cannot change mathematical authority.

Keep old attempts readable when a schema or backend changes. Retain the original result and environment provenance; any replay under a new environment produces a new verification record. Unsupported archives show a compatibility warning rather than becoming silently accepted or deleted.

## 11. Lesson packages, Studio and guides

Introduce an opt-in formal-proof specification, independent of diagrams and mathematical display blocks. These are proposed fields, not currently supported syntax:

| Proposed field | Purpose |
| --- | --- |
| `proof_spec.version` | Identify the formal contract |
| `statement` | Typed goal, variables, definitions, domains and assumptions |
| `parameter_contract` | Public givens and constraints for generated variants |
| `allowed_rules` | Mathematical operations exposed to the learner |
| `assessment_policy` | Required method, permitted implicit steps and review behavior |
| `reference_proof` | Author's candidate evidence, independently checked before publication |
| `environment` | Pinned formal library and adapter compatibility |

Where possible, prove a parameterized theorem once and instantiate it for each generated question. Check that each draw satisfies its parameter contract. This verifies a template's reference solution; it does not pre-approve a learner's future submission.

Questions, diagrams and formal statements must resolve from one public-parameter snapshot. Restored drafts retain the original snapshot and specification. A later template edit must not change the goal underneath an existing proof.

Studio should provide guided editors for the goal, domain, hypotheses and proof steps; a formal-statement preview; an obligation inspector; reference-proof checking; variant previews; and separate mathematical and pedagogical status. Raw proof-language editing is not required for ordinary authors.

Update the authoring guide, learner guide, tutor guide, manifest capabilities and source/export schemas when each feature actually ships. Document supported theories, unsupported constructs, offline behavior, assumptions, proof badges and common domain mistakes. Keep example packs executable as acceptance fixtures.

Existing `limit_steps` lessons retain tutor review unless explicitly migrated and verified. Do not convert historical tutor approval into kernel certification. Old text-only lessons and packs must continue to work.

## 12. Implementation touchpoints

| Existing area | Planned change |
| --- | --- |
| `docs/limit-work.js`, `quickmaths/limit_work.py` | Reuse the structured interface; add an explicit formal mode instead of changing reviewed-mode guarantees |
| `quickmaths/work_checker.py`, `quickmaths/math_syntax.py` | Keep current grading; introduce a separate formal adapter and domain contract |
| `docs/challenge-core.js` | Manage formal job states, immutable snapshots and evidence bindings |
| `docs/lesson-creator.js` | Add guided specification and reference-proof validation |
| `schemas/` and native models/exporter | Version and round-trip typed proof specifications |
| Storage and merge paths | Preserve evidence history; invalidate mismatched active certificates |
| New verifier package/service | Own pinned toolchain, rule library, worker isolation and protocol |

Keep the mathematical backend out of the main UI bundle. Share fixtures across JavaScript and Python rather than maintaining two independent interpretations without parity checks. The exact module boundaries should be selected after the feasibility prototype.

## 13. Delivery phases and exit gates

Each phase produces a usable result. Broad expressive foundations do not require exposing every advanced construct in the first editor.

| Phase | Deliverable | Exit gate |
| --- | --- | --- |
| 0: Feasibility | Standalone verifier for 10–20 representative claims; backend comparison; resource measurements | Faithful domains, checked artifacts and rejection of deliberately unsound examples |
| 1: Proof contract | Typed statements, scopes, domains, versioning and canonical previews | Expert-reviewed translation fixtures; no ambiguous interpretation accepted silently |
| 2: Verification pipeline | Pinned environment, bounded worker, independent replay, certificate protocol | Altered goals, artifacts and axiom dependencies rejected; failures have honest statuses |
| 3: Algebra pilot | Identities, rational cancellation, simple inequalities and step feedback in QuickMaths | Real lesson round trips, one phone workflow, offline pending state and sync invalidation work |
| 4: Calculus pilot | Rational/conjugate limits, directed approaches, selected infinity and piecewise cases | Domain, denominator, direction and discontinuity negative cases rejected |
| 5: General proof interaction | Quantifiers, subproofs, cases, contradiction, witnesses and induction | Scope leakage, circular arguments and missing cases detected |
| 6: Wider analysis | Selected epsilon-delta proofs, derivatives, sequences, continuity and integration rules | Each advertised family has checked rules, usable feedback and an explicit boundary |
| 7: Additional theory packs | Geometry, linear algebra, discrete mathematics and appropriately scoped probability | Each pack declares its foundation, mappings, rules and tested coverage |
| 8: Advanced assistance | Optional natural-language translation, lemma discovery and stronger search | Suggestions remain untrusted; exact goals and complete certificates remain mandatory |

Foundational binder and scope support belongs in phase 1 even though its full learner interface arrives in phase 5. Otherwise calculus quantifiers would force a redesign.

**Current phase-6 derivative checkpoint (10 September 2026):** the implementation now has a recursive structural derivative planner and Lean reconstructor for constants/variables, arithmetic composition, natural powers, guarded quotients, positive-domain square roots, strict-sign absolute values, and nested `exp`/school-real `log`/`sin`/`cos`. Pointwise guards accumulate through the expression tree instead of being hidden inside a symbolic differentiator. Exact rational guards are reconstructed with `norm_num`, while a conservative syntax-only class of universally signed expressions is reconstructed with `positivity`; unknown signs still become explicit obligations. Piecewise derivatives, arbitrary declared functions, unsupported special functions, and integration remain outside this rule.

**Current phase-6 continuity/IVT checkpoint (10 September 2026):** finite direct-substitution limits can now be proved from a structural `ContinuousAt` plan over the safe expression grammar, with explicit point-domain guards for division, square roots and school-real logarithms. The same planner drives `ContinuousOn` reconstruction for IVT existence on exact intervals. Interval-wide guards may be reconstructed automatically (for example `x^2 + 1 ≠ 0` via Lean `positivity`) or supplied as first-class quantified evidence such as `∀ t ∈ [a,b], g(t) ≠ 0`; proof state exposes a universal interval obligation, proof search cites the matching quantified premise, and Lean instantiates it inside the `ContinuousOn` proof. The structured planner can also construct simple bounded universal guard theorems itself by introducing the binder and interval hypothesis, extracting conjunction bounds, and using a conservatively gated arithmetic step. Conservative stronger facts such as strict positivity may discharge nonzero/nonnegative guards through explicit Lean conversions. Absolute-value continuity works at kinks even though the derivative rule correctly rejects them. A compositional finite-limit algebra rule now sits above this continuity layer: it builds explicit `Tendsto` trees for arithmetic, powers and supported continuous unary functions, can cite an already-proved finite sublimit as an opaque leaf only when point/direction/domain filters match exactly, and reconstructs quotient/log/sqrt target guards in Lean. General sequence inequalities/squeeze arguments, series convergence, infinite-limit algebra and general epsilon-delta reasoning remain future analysis work.


**Current phase-6 finite-limit algebra checkpoint (10 September 2026):** `limit_algebra` now proves finite one-sided/two-sided limits compositionally instead of reducing every supported goal to direct substitution. Leaves are constants, the approach variable, free-variable constants, or explicitly cited prior finite-limit steps over the exact same source filter. Internal nodes reconstruct negation, addition, subtraction, multiplication, division, natural powers, absolute value, exponential, school-real logarithm, sine, cosine and strictly-positive square root composition. Division requires a nonzero *target limit* for the denominator; school-real `log` and compositional `sqrt` require a strictly positive inner target, from which Lean derives eventual in-domain behavior via `tendsto_order`. Exact rational and syntax-obvious guards still compile to `norm_num`/`positivity`, and stronger cited signs are explicitly converted to nonzero evidence. This rule deliberately does not reuse a left/right/domain-restricted sublimit for a different approach filter, does not handle infinite targets, and leaves square-root boundary cases such as `sqrt(x) → 0⁺` to the domain-aware continuity rule.

**Current phase-6 sequence checkpoint (11 September 2026):** sequence convergence is represented as its own `sequence_limit` goal over a bound natural index and the source filter `Nat.atTop`; it is not encoded as a fake real-variable limit at infinity. The expression language has an explicit `real(n)` cast from natural expressions and a natural-index power node, so Lean reconstruction preserves natural arithmetic before coercion. `sequence_algebra` builds finite sequence `Tendsto` trees from constants, cited exact-source sequence sublimits, shifted reciprocal tails such as `c / real(n+k)` with `k ≥ 1`, geometric tails `r^n` under explicit `|r| < 1` evidence, arithmetic operations and supported continuous unary composition. Exact shifted, affine and quadratic ratios have dedicated small proofs, while the general polynomial-ratio fallback reconstructs exact `Polynomial ℝ` values for rational-coefficient polynomials through degree 64 and delegates lower/equal/higher-degree asymptotics to mathlib. Learner-facing `eventually k:nat, P(k)` remains transparent as `∃ N, ∀ k ≥ N, P(k)`. `sequence_squeeze` still accepts cited eventual/all-index inequalities, but can now reconstruct the standard `-1 ≤ sin/cos ≤ 1` bounds after division by an everywhere-positive shifted natural denominator `real(n+k)`, `k ≥ 1`. The `exists_finite` result expresses `∃ l : ℝ, Tendsto a atTop (𝓝 l)`; `sequence_monotone_bounded` proves bounded monotone/antitone convergence via `ciSup`/`ciInf` and can now derive monotonicity plus the matching bound for exact geometric approaches `L - c*r^n` and `L + c*r^n` when `c > 0` and `0 ≤ r ≤ 1`. Quotient/log/sqrt target guards remain explicit. A separate `sequence_nat_at_top` rule proves `real(n+k) → +∞`. Root assumptions may not accidentally mention the bound index free; index-dependent hypotheses must be quantified. Broader nonlinear order estimates and general epsilon-delta automation remain explicit future work rather than guessed by symbolic simplification.

**Current phase-6 infinite-series checkpoint (12 September 2026):** `series_sum` is a first-class natural-index goal with separate result kinds for an exact finite sum, summability, and explicit non-summability. Exact rational geometric terms `a*r^n` support kernel-reconstructed sums when `|r| < 1` and non-summability when `|r| >= 1`. Shifted p-series `a / real(n+k)^p` with `k >= 1` support exact integer or rational real exponents `0 <= p <= 64`, classified by the pinned mathlib criterion `p > 1`. A conservative comparison rule transports cited summability/nonsummability through cited global or eventual nonnegative domination. Checkpoint 24 added the bound form of the ratio test from cited `abs(a(k+1)) <= r * abs(a(k))`, `0 <= r < 1`. Checkpoints 25-26 add the quotient-limit form: an exact finite sequence theorem `abs(a(k+1))/abs(a(k)) -> L` with rational `0 <= L < 1` plus global/eventual `a(k) != 0` proves summability via `summable_of_ratio_test_tendsto_lt_one`, while rational `L > 1` proves non-summability via `not_summable_of_ratio_test_tendsto_gt_one` without a separate nonzero premise. Checkpoint 27 adds the n-th-root test from an exact finite sequence theorem `abs(a(k))^(1/real(k)) -> L`: rational `0 <= L < 1` is converted in Lean to an eventual geometric majorant, rational `L > 1` proves the terms fail to tend to zero, and `L = 1` remains explicitly inconclusive. Exact geometric `r^n` can reconstruct its constant quotient. Checkpoint 28 widens only the root side: exact monomial-geometric terms `c*real(n)^k*r^n` with nonzero rational `c`, rational `r`, and `0 <= k <= 64` reconstruct the n-th-root limit `abs(r)`. Checkpoint 29 generalizes that reconstruction to exact `p(real(n))*r^n` with any nonzero rational-coefficient polynomial `p` of degree at most 64, using explicit `Polynomial ℝ` leading-term asymptotics in Lean. Checkpoint 30 extends the same root reconstruction to exact `(p(real(n))/q(real(n)))*r^n` with nonzero rational-coefficient numerator and denominator polynomials of degree at most 64: Lean proves the numerator and denominator n-th roots tend to `1`, combines them with `Real.div_rpow`, and then attaches the exact geometric root `abs(r)`. School-domain denominator obligations remain explicit unless the denominator lies in a conservative syntax fragment that is manifestly positive for every natural index; that case is re-proved in the generated artifact with `positivity`. Checkpoint 31 adds a small syntax-normalization layer before that reconstruction: products such as `(1/2)^n*(1/3)^n` are folded to a single exact base `(1/6)^n`, and nonzero rational geometric factors in a denominator contribute their exact reciprocal base, so `p(n)/(q(n)*2^n)` is treated as the same root-asymptotic family as `(p(n)/q(n))*(1/2)^n`. Zero geometric denominators are rejected rather than normalized through Lean's total division. Checkpoint 32 extends global denominator reconstruction from positivity to exact nonzero rational geometric powers, including alternating factors such as `(-2)^n`, via `pow_ne_zero`. Checkpoint 33 adds a deliberately narrow eventual-domain layer for exact affine rational denominator factors: for example `real(n)-1` is proved nonzero on the `Nat.atTop` tail `n >= 2`, and products with globally nonzero supported factors compose by taking the maximum threshold. Checkpoint 34 extends that same tail-domain mechanism to exact rational-coefficient polynomial denominator factors through degree 64 without trusting Python as a root oracle: Python searches for a concrete shift `N` where the exact coefficients of `p(N+x)` (or its negation) are all nonnegative with a strictly positive constant term, while Lean checks the shift identity with `ring` and proves the resulting strict sign with `positivity`. This is used only for asymptotic summability/non-summability classification; non-polynomial recurring-zero denominator shapes are still not guessed. The `L = 1` root-test boundary remains intentionally inconclusive. Checkpoint 41 adds one deliberately small factorial slice: exact nonzero rational `c*r^n/factorial(n)` is parsed with a first-class natural `factorial(...)` expression and the quotient-limit ratio test reconstructs `abs(a_(n+1))/abs(a_n) = abs(r)/(n+1) -> 0` directly from `Nat.factorial_succ` and the reciprocal tail, with no Stirling approximation. Checkpoint 42 extends only that exact recurrence family to fixed nonnegative integer shifts `c*r^n/factorial(n+k)`: the parser accepts either `n+k` or `k+n`, Python extracts a bounded exact shift, and Lean explicitly rewrites the successor factorial before proving `abs(r)/(n+k+1) -> 0`. Checkpoint 43 adds an exact nonzero rational-coefficient polynomial prefactor `p(n)`: Lean rebuilds `p(x+1)` and `p(x)` as explicit `Polynomial ℝ` values, proves the successive absolute polynomial quotient tends to `1`, combines that with the shifted-factorial factor tending to `0`, and reuses the existing eventual polynomial nonzero certificate for cancellation. Checkpoint 44 extends the same proof composition to `(p(n)/q(n))*r^n/factorial(n+k)` for exact nonzero rational-coefficient `p,q` of degree at most 64: Lean additionally rebuilds `q(x)` and `q(x+1)`, proves `abs(q(n))/abs(q(n+1)) -> 1`, and checks both current and successor denominator values are nonzero on the reconstructed tail before simplifying the term quotient. Checkpoint 45 folds exact products/quotients of nonzero rational geometric powers inside the same factorial family, so terms such as `(p(n)/q(n))*(1/2)^n*(1/3)^n/factorial(n+k)` use the combined exact base for the decay model; Lean still checks the original geometric syntax by proving its absolute value equals `abs(r)^n` using `abs_mul`/`abs_div` and `mul_pow`/`div_pow`. Zero geometric factors are not normalized. Checkpoint 46 adds positive literal powers `factorial(n+k)^m`, checkpoint 47 adds bounded products of shifted-factorial denominator leaves, checkpoint 48 normalizes left-associated sequential factorial division, and checkpoint 49 removes the remaining ordering restriction between a single factorial denominator and ordinary polynomial/constant denominator factors. Checkpoint 50 adds the first exact factorial-numerator family, restricted to one unpowered `factorial(n+k)` upstairs and one unpowered `factorial(n+m)` downstairs around an otherwise exact constant-geometric term `c*r^n`: Lean checks both successor recurrences and reconstructs the factorial contribution `(n+k+1)/(n+m+1) -> 1`, so the overall ratio limit is `abs(r)`. Checkpoint 51 composes that exact cancellation with one nonzero rational-coefficient polynomial prefactor `p(n)` of degree at most 64: the generated artifact rebuilds `p(x+1)` and `p(x)` as explicit `Polynomial ℝ` values, proves the successive absolute polynomial quotient tends to `1`, and reuses the existing kernel-checkable eventual-nonzero tail certificate when the polynomial has early natural roots. Checkpoint 52 adds one nonzero rational-coefficient polynomial denominator `q(n)` of degree at most 64 around the same shifted-factorial quotient: Lean rebuilds `q(x)` and `q(x+1)`, proves `abs(q(n))/abs(q(n+1)) -> 1`, and checks both current and successor denominator values are nonzero on the reconstructed tail before simplifying the submitted ratio. Checkpoint 53 reuses the exact geometric normalization from the ordinary ratio/factorial-denominator paths around that factorial quotient: products and quotients of nonzero rational powers such as `(1/2)^n*(1/3)^n` and `(1/2)^n/(1/3)^n` are folded to one exact base for search, while Lean proves the absolute value of the original submitted geometric expression is `abs(r)^n` with `abs_mul`/`abs_div` and `mul_pow`/`div_pow` before combining it with the polynomial and factorial-quotient factors. Checkpoint 54 raises that exact shifted-factorial quotient to one fixed positive literal power `d <= 64`, accepting both `factorial(n+k)^d / factorial(n+m)^d` and `(factorial(n+k)/factorial(n+m))^d`; Lean proves the base linear factorial ratio tends to `1` and uses `Filter.Tendsto.pow` to reconstruct its `d`-th power. Checkpoint 55 generalizes only the exact recurrence composition to a bounded product of such powered shifted-factorial quotients: at most 8 matched factors and total matched power at most 64. Checkpoint 56 performs exact cancellation of common powers of the same shifted factorial before that matching step. For example `factorial(n+1)^3 / (factorial(n+1) * factorial(n)^2)` is normalized to one neutral common quotient plus `(factorial(n+1)/factorial(n))^2`; Lean still proves the original submitted expression rather than trusting a rewritten theorem. Checkpoint 57 then permits exact residual power splitting after same-shift cancellation: the remaining total numerator and denominator factorial powers must agree, but one power block may be partitioned across several shifted factorials, e.g. `factorial(n+3)^3 / (factorial(n+1) * factorial(n)^2)` becomes quotient factors of powers `1` and `2`. Python only partitions exact integer multiplicities; any residual total-power mismatch remains unsupported. Lean checks every `Nat.factorial_succ` recurrence, proves each split powered linear ratio tends to `1`, multiplies those limits, and then combines them with the already checked polynomial/geometric quotient model while proving the original submitted expression. These checkpoints change only exact syntax/recurrence composition and use no Stirling approximation. Unmatched factorial growth, non-affine factorial arguments, zero geometric factors in this automatic path, non-polynomial denominators, broader factorial/Stirling families, conditional convergence, irrational/symbolic exponents, and general inequality/limit automation remain future work.


Do not label an entire branch “supported” after checking a few examples. Publish a capability matrix by statement kind and proof rule. Synthetic geometry, coordinate geometry, finite probability and measure-theoretic probability require different interfaces and assumptions.

## 14. Validation proportional to the actual risk

The user preference for focused checks remains appropriate. UI wording changes do not require every proof test. Changes to domain translation, the rule registry or the verifier's acceptance boundary do require broader relevant mathematical checks because a false positive can affect every lesson.

The permanent acceptance corpus should include:

| Family | Positive examples | Required negative or incomplete examples |
| --- | --- | --- |
| Algebra | Polynomial identities; guarded cancellation | Division by zero; lost restriction; square-root sign error |
| Equations and inequalities | Valid implications and equivalences | Extraneous roots; inequality divided by unknown sign |
| Limits | Rational hole; conjugate near 4; valid directed limit | Confusing value with limit; invalid quotient law; incompatible sides |
| Quantifiers | Correct witness and epsilon-delta dependency | Witness depending on a later universal variable |
| Proof structure | Complete induction and exhaustive cases | Missing base case; leaked assumption; circular proof |
| Analysis | Valid IVT existence statement | Missing continuity; unjustified uniqueness |
| Persistence | Restore an original draft after template changes | Reuse certificate after editing goal, domain or learner steps |
| Security | Approved artifacts and environment | Hidden admitted lemma, injected source, oversized expressions, tampered dependencies |

Run at least 100 seeded variants for each parameterized calculus acceptance fixture, including boundary and invalid-parameter cases. Seeded tests supplement universal reference proofs; they do not establish them.

Use mutation tests that deliberately remove hypotheses and alter quantifiers. Some mutations produce another true theorem, so reviewers must classify expected outcomes rather than assuming every edit should fail. Exact numerical counterexamples are useful fixtures; floating-point agreement is not an oracle for proof soundness.

Have a formal-methods reviewer and a mathematics educator independently inspect the canonical translations of the initial corpus. UI tests cover mobile, keyboard navigation, screen-reader descriptions and round trips; performance tests measure cold and warm verification separately.

## 15. Effort, staffing and operating cost

These are provisional engineering estimates, not measured delivery promises or estimates of AI runtime. They assume reuse of Lean/mathlib, a deliberately narrow first release, and access to someone experienced in formalization. Re-estimate after phase 0; unfamiliarity with the backend can multiply the effort.

| Scope | Planning allowance |
| --- | --- |
| Feasibility spike | Roughly 1–3 person-weeks |
| Credible narrow integrated pilot | Roughly 2–4 person-months total, including the spike |
| Polished algebra and selected calculus product | Roughly 6–12 person-months cumulative |
| Broad educational proof assistant across several branches | Roughly 18–36+ person-months cumulative, then continuing theory and UX work |
| Automatically solve arbitrary mathematics | No attainable fixed project estimate |

These ranges have substantial uncertainty, potentially a factor of two or more. Human review, unsupported library bridges, and feedback quality dominate once a basic proof compiles. Adding engineers does not linearly shorten the critical semantics and integration work.

The useful team is one formal-methods engineer, one QuickMaths/frontend engineer, and a mathematics educator contributing fixtures and review. A solo developer can start with the command-line spike and selected exercises; broad coverage should remain a sequence of releases.

Use Luna tasks for bounded work such as fixture conversion, schema plumbing, documentation, routine UI components and evidence-display tests. Give those tasks frozen interfaces and separate files. Reserve mathematical semantics, proof-library design, security boundaries and final integration review for experienced reasoning and human mathematical review. AI throughput does not replace a soundness argument.

Measure worker startup time, warm check latency, memory, proof size, queue delay and cache hit rate before choosing hosting. A reasonable provisional UX target is a few seconds for routine warm checks, with longer searches asynchronous and explicitly bounded. These are targets to test, not claims about present performance.

Start without paid AI proof search. Infrastructure cost is approximately worker-hours plus storage and operations; collect real workload data before quoting a monthly price. Avoid an always-on distributed platform until concurrency actually warrants it.

## 16. Largest risks and controls

| Risk | Control | Gate owner |
| --- | --- | --- |
| Checked proof of the wrong statement | Canonical preview, reviewed semantics, translation fixtures | Formal-methods engineer + educator |
| Lost domains or hidden assumptions | Explicit domain obligations and scoped dependency graph | Formal-methods engineer |
| Valid mathematics but misleading grading | Separate proof evidence from method rubric | Educator + product engineer |
| Untrusted package executes code | Declarative input and isolated curated workers | Security/backend reviewer |
| Upgrade breaks old proofs | Pinned archives, explicit migrations and replay records | Backend maintainer |
| Automation stalls | Budgets, cancellation, honest pending/unsupported states | Product engineer |
| App complexity grows too quickly | Phase gates and narrow advertised capabilities | Project owner |
| Formally valid but vacuous exercise | Check intended assumptions, nonempty approach domains and authored witnesses where possible; flag contradictions | Educator + formal-methods engineer |

A general consistency checker for arbitrary assumptions is not available. The app can detect supported contradictions and require author review of remaining assumptions without pretending that this proves their consistency.

## 17. Concrete first work order

The next authorized implementation should be a bounded spike, not the whole roadmap:

1. Create an isolated development package on X: or F:, with a pinned Lean/mathlib environment and no changes to production grading.
2. Formalize a corpus covering guarded rational cancellation, a removable-hole limit, conjugate simplification, a restricted square root, a piecewise jump, opposite one-sided infinities, a difference quotient, and IVT existence.
3. Add paired invalid/incomplete arguments: missing restrictions, wrong direction, false uniqueness and a leaked assumption.
4. Accept typed requests through a local command-line protocol; emit proof artifacts, axiom audits and exact statement bindings.
5. Replay one artifact in a clean verifier; demonstrate that tampering with the statement or dependencies fails.
6. Measure setup effort, cold/warm latency, memory, artifact size and quality of explanations for failed obligations.
7. Deliver a short decision report: backend choice, supported rule families, unresolved semantic gaps and a revised pilot estimate.

**Go forward if:** the spike checks the intended mathematics, explains concrete missing obligations, preserves domains and produces reproducible evidence at a practical cost. **Narrow or reconsider if:** it merely proves final answers, relies on unchecked assumptions, or cannot distinguish unsupported reasoning from false claims.

## 18. Changes made by this planning update

- Added this architecture, delivery plan, acceptance corpus and first work order.
- Recorded the planning task start in `agent-task.json`.
- No engine, runtime dependencies, lesson behavior, Studio controls or verification claims changed. Implementation releases must update their guides and manifest alongside the features they actually deliver.
