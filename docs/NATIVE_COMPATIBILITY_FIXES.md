# Native assessment compatibility and lesson integration

Prepared 21 September 2026 against upstream commit
`02098c478b7ee542b2594e34bad16218456ac58c`.

This source patch combines the eight previously delivered Functions and Calculus
bridge lessons with the compatibility repairs identified in the lesson audit.
It does not publish a deployment, change verifier rules or toolchain pins,
convert ordinary reviewed proofs into formal proofs, or modify learner files.
Apply this combined patch once instead of applying the two older lesson patches.

## Resolved question snapshots

App state version 18 creates question snapshot version 1. A draft stores its
complete resolved questions, their ordering and selection, an integrity checksum,
and its assessment variation. Restoration validates those saved questions instead
of regenerating their values from current templates. Responses stay with their
original question IDs. Changing selection, template ordering, parameter ranges or
new question defaults must not change existing givens or append current scenarios.
New random draws no longer depend on a template's shuffled index.

The checksum is an integrity check, not authentication against someone who edits
local storage and recomputes hashes. The app's existing local-origin trust model
is unchanged. Formal credit independently requires a fresh exact submitted-proof
receipt; the snapshot checksum cannot grant it.

A narrow migration handles the historical fixed-formal clone bug. It validates
that the old bank job binds exactly the saved question under its recorded bank
ID, including the mathematical statement, parameters, seed, policy and environment.
Only then does it rebuild the runtime question's job. Matching in-progress proof
requests are relabelled to the corrected binding without changing assumptions,
steps, scopes or pending edits. Verification is withdrawn and a fresh check is
required. Archived evidence is not rewritten. Changed theorem/binding data is
not accepted as this migration.

The old five-question expansion applies only to an explicitly pre-version-16,
ordinary, nonvisual five-question draft. Version-17 rotated drafts and version-1
snapshots never expand. A legacy answer-key repair is allowed only when the
canonical question's displayed prompt is identical to the saved prompt.

Invalid bounded snapshots and their responses are retained as inert recovery text,
not silently paired with replacement questions. The UI directs the learner to
export a backup from Settings. Both test submission and pending-result reflection
are blocked while recovery is needed. Existing storage-size limits still apply;
this mechanism is not unlimited retention or automatic repair of arbitrary corrupt
backups. It also cannot reconstruct original questions already overwritten and
resaved by a previous release. An earlier backup is necessary for that case.

## Formal generation and runtime identity

Fixed formal questions bind their job after obtaining their final runtime ID.
Their bank and template specifications must agree; a stale export fails closed.
Generated formal specifications resolve from the same exact named public givens
used by the prompt. Hidden derived values are unavailable to the specification.
The resolved specification, method policy, reference candidate and environment are
preserved, then bound to the generated question. Invalid formal generation cannot
fall back to a short-answer bank question. Ordinary answer strings never earn
formal credit. Valid unsigned 32-bit generator seeds survive normalization.

## Expression and rational-work compatibility

The browser answer parser recognizes `sqrt`, `abs`, `sin`, `cos`, `exp` and natural
`log`, with `ln` as a browser alias. Trigonometric inputs are radians. Unknown
multi-letter calls are rejected rather than interpreted as multiplied letter
variables. Write ambiguous products explicitly, for example `a*b*(x+1)` rather
than `ab(x+1)`. Ordinary single-letter implicit multiplication and `pi(x+1)` remain
supported. The fixed parser does not execute package code.

Function comparisons add fractional, sign-sensitive and bounded domain probes.
A learner expression that is undefined where the expected expression is defined
fails the comparison. These are finite numerical checks, not kernel proofs or a
general decision procedure for expression equivalence. Authored domains and
original exclusions must still be represented explicitly where assessed.

Native rational-equation draws now enrich their ordinary work contracts with the
original equation and its denominator zeros before cancellation. The bounded
univariate parser handles the shipped linear and quadratic denominator families;
other forms require explicit authored contracts or the existing bank fallback.
The historical work-rate sentence has an explicit, narrow extraction path. Legacy
compact contracts are validated against their saved equations without replacing
the saved question or working. This is not a general rational-proof checker.

## Lessons and integration

Added: `MATH_FUNC_002` through `MATH_FUNC_007`, `MATH_CALC_001`, and
`MATH_CALC_002`. The complete native Mathematics catalog becomes 92 lessons.
The addition includes 80 worked examples, 32 applications, 160 assessment scenarios
and 24 reproducible SVGs. All eight lessons retain one required reasoning review
and a 20-scenario assessment; the eight older native formal capstones retain the
upstream configured-length/rotation policy.

The new Calculus taxonomy entry and generated JavaScript module are included.
App, Bridge, curriculum and taxonomy-consumer cache URLs are advanced together.
Existing formal coverage and answer-string rejection tests are retained, with
only additive curriculum counts and explicit legacy-migration setup updated.
Static figures still accompany fixed assessments only; the proposed broad
pedagogical retrofits are not part of this compatibility repair.

In a complete checkout:

```sh
python scripts/build_learning_taxonomy.py
python -m quickmaths.cli validate-content --strict-warnings
python scripts/export_web_curriculum.py
python -m pytest -q
node --test docs/*.test.js
python -m pytest -q formal-verifier/tests
python formal-verifier/scripts/kernel_batch_check.py
python formal-verifier/scripts/kernel_acceptance.py
python scripts/test_formal_learning_http.py
python scripts/check_formal_references.py
```

Use the repository's pinned formal environment for kernel checks. Test a saved
pre-update draft and a new formal attempt in the actual supported app before
publishing. Figure rebuilds are optional unless the figures are edited:
`python scripts/build_function_figures.py` and
`python scripts/build_calculus_bridge_figures.py`.

## Evidence and limits of this delivery

The package's validation report and logs record the executed checks. The local
workspace used the actual Pages modules, the bundled Python verifier, selected
repository source reads, and the two original lesson archives. It was not a full
checkout. The included review curriculum was assembled for these checks and is
not claimed to be output from the canonical Python exporter. Do not publish that
review file as the deployment curriculum.

43 new compatibility tests pass. The runnable broader JavaScript selection has
574 passes, with two repository-dependent test files and three repository-only
fixture/document tests explicitly excluded. Twelve focused Python source/math
checks pass. The full native scan checks 124,300 generated instances and exact
restoration across all 92 lessons. Two ordinary slope-intercept bank fallbacks
remain and are recorded. Both lesson oracle suites cover 16,000 new instances.
All 24 supplied figures rebuild byte-identically in this environment.

Eight existing fixed formal references and 100 generated formal probe instances
pass native preflight and Lean source generation. No fresh Lean kernel run was
completed here. An unavailable kernel correctly issues no certificate. The actual
Chromium app navigation attempt was blocked by `ERR_BLOCKED_BY_ADMINISTRATOR`,
so no interactive desktop/mobile UI or physical-device pass is claimed.
