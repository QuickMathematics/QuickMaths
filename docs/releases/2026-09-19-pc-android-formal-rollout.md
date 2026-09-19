# PC + Android formal verifier rollout

The browser backend is connected to the lesson client after explicit rollout
approval. Eight existing lessons gain formal exercises. The ordinary app CSP
remains unchanged; the protected `/formal-runtime/` entry enables scoped isolation.

## Implementation

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
No long phone suite was rerun. A focused Chromium smoke test exercised the
actual production client with a plain HTTP server, the scoped service worker,
first-use isolation reload, profile creation, and a real submitted lesson proof.
It passed with a verified submitted-mode certificate. The 30 focused JS tests
also passed after integration.

## Activation and documentation

- Connects the native browser backend to lesson proof checking and Studio.
- Keeps the separate experimental parity harness assessment-ineligible.
- Supports Chrome/Edge on PC and Chrome on Android; iPhone/iPad remain deferred.
- Reopens saved tests on the protected route. On first use, select Start my proof
  again after the isolation reload. Setup downloads hundreds of megabytes;
  proof execution allows one minute and idle workers are released.
- Fixes hash navigation so the shared app stays on the protected entry.
- Retains the development-only validation page as `formal-runtime/validation.html`.
- Updates authoring, student, educator and formal-learning guides, guide PDFs,
  Studio wording and the agent manifest.
- Preserves certificate hashes, modes, axiom checks and replay requirements.

The earlier proposal patch is retained as historical review material; it is
already integrated with the navigation/startup corrections above and must not
be applied again. No mathematical coverage or iPhone support was added.
