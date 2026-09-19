# PC + Android formal verifier rollout — prepared, not activated

The browser backend and eight lesson updates are prepared and tested locally.
The production lesson client and main app CSP are unchanged. Nothing from this
update has been published to main. Automatic approval review blocked activation.

## Prepared implementation

- Reuses the pinned Lean/Mathlib runtime, shared artifact cache and bounded OPFS
  module staging. Imported staging is released before timed proof execution.
- Runs the existing native parser, preflight, generator and certificate logic in
  the app's self-hosted Python runtime. SymPy 1.14.0 matches the native version.
- Adds a private browser kernel adapter. Preparation alone cannot certify a
  result; the live Lean result must pass the existing compiler and axiom checks.
- Preserves certificate format, exact request/statement/submission/source hashes,
  proof modes, allowed axioms and saved-evidence replay rules.
- Adds pinned packaging, isolated validation scripts and focused boundary tests.

## Lessons

One proof-bank question was added to each of these existing lessons:

| ID | Proof task |
|---|---|
| MATH_POLY_001 | Collecting like terms preserves an identity |
| MATH_POLY_002 | Expanding a product of binomials |
| MATH_POLY_003 | Checking a common-factor identity |
| MATH_POLY_004 | Checking a monic quadratic factorization |
| MATH_EXP_001 | Product law for natural-number powers |
| MATH_QUAD_002 | Completing-the-square identity |
| MATH_ALG_007 | Inequality reversal with an explicit assumption |
| MATH_RAT_001 | Rational cancellation retaining the domain restriction |

Original practice remains and all test lengths are preserved. The exporter
omits empty proof metadata and honors authored lengths for formal-enabled
lessons. Only these eight exported skills change. Their reference certificates
are reference-mode evidence, never learner assessment credit.

## Validation

- Browser Python generates exactly the native source for all 122 positive
  corpus requests. This is source-generation parity, not a new full kernel run.
- All 71 negative cases retain their rejection status and issue no certificate.
- Actual browser Lean certified one submitted positive and all eight new lesson
  references; its negative domain control remained rejected.
- 20 focused native verifier/export/grading tests, 30 JS certificate/workspace
  tests and two browser-host boundary tests passed.
- Export comparison confirms eight changed lessons and unchanged test lengths.

[Evidence](../../experiments/browser-lean/results/pc-android-rollout/).
No long phone suite was rerun. The final production UI connection still needs
its focused live smoke test after approval to apply it.

## Blocked activation step

The [review-only integration patch](2026-09-19-pc-android-formal-proposal.patch)
is prepared and passes `git apply --check`; it has NOT been applied. It connects
the tested backend to the lesson client and updates Studio and user/authoring
guides. Chrome/Edge on PC and Chrome on Android are its initial targets;
iPhone/iPad browser verification is deferred.

The revised design leaves `docs/index.html` and its CSP unchanged. Isolation and
its necessary WASM/worker policy apply only to a dedicated `/formal-runtime/`
app entry. First use reopens the saved test there. Proofs allow one minute;
initial download/setup can take longer. Idle workers are released.

Automatic approval review rejected the production connection as a CSP and
assessment trust-boundary change. Approval is needed to apply the final patch,
validate the learner flow, and publish the update to main. This report does not
claim that the new production route is online or assessment-enabled.
