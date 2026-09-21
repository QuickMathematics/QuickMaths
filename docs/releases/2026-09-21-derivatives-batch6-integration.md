# Derivatives Batch 6 integration — 21 September 2026

## Integrated lessons

Applied `X:/QM2/quickmaths-derivatives-batch6.zip` to the current repository after the twenty-lesson foundation expansion. New-file hashes were checked against the package manifest. Shared patches were merged individually; the noncanonical review curriculum and author preview were not installed.

| ID | Lesson |
|---|---|
| MATH_CALC_003 | Derivatives as local rates |
| MATH_CALC_004 | Power, constant and sum rules |
| MATH_CALC_005 | Product and quotient rules |
| MATH_CALC_006 | Chain rule and composite functions |

The four lessons add 40 worked examples, 16 applications, 80 ordinary assessment scenarios and four formal exercises. Each assessment has **21 questions**, retaining both the required tutor-reviewed conceptual capstone and formal exercise on every attempt. There are 44 randomized templates and 40 fixed templates, including four fixed formal tasks.

The catalog now contains **116 native browser lessons** (113 native YAML lessons plus three bridge lessons), **160 shipped lessons**, **1,761 configured native assessment questions** and **1,723 separately counted ordinary scenarios**. An exact comparison against the previous export confirms that all 112 existing lesson objects are unchanged. Earlier prerequisite locks, question counts, capstones and progress semantics are preserved.

## Audit and corrections

- Independently audited mathematical statements, answers, exclusions, prerequisite placement, conceptual capstones and diagram bindings. The lessons distinguish finite derivatives from corners, a function value from a rate, an original excluded input from its cancelled extension, and valid square-root derivative domains.
- The derivative-definition exercise requires the supported `derivative_definition` method: a finite two-sided difference-quotient limit followed by `derivative_from_limit`. Other formal exercises use the existing polynomial, quotient and recursive derivative rules. No verifier coverage, certificate semantics or rule permissions were changed.
- Narrowed the monomial graph to x in [-1,1] and y in [-8,8], keeping all generated coefficients/powers visible over the shown interval. Added 100-variant bounds checks. The square-root graph already fits: its endpoint radicand is r²+2a, at most 37; the existing upper y bound of 7 is valid and now tested explicitly.
- Made package source-reading utilities explicitly UTF-8 for Windows compatibility.
- Registered the four IDs and final exit without replacing the foundation batch. Kept ordinary-scenario and assessment-length fixtures separate. Updated shared integration fixtures to allow additions while retaining explicit historical membership, formal bindings and grading boundaries. Historical curriculum reconstruction removes later dependent lessons so its prerequisite graph remains valid.
- Retained the Studio media fix already implemented in the foundation update. The package adds a regression with eighty unrelated assets to ensure native copies include only their own figures and still respect imported-pack limits.
- Updated the protected and ordinary app cache entries, Studio guidance, authoring guide, student/educator guides and PDFs, media documentation and agent manifest. Original package handoff notes are retained in DERIVATIVES_BATCH6.md with a clearly labeled current integration note.

## Media

Eight authored Matplotlib SVGs add **147,085 bytes**. Twelve assessment scenarios use parameter-linked Cartesian diagrams. All sources, static media, accessible descriptions, mathematical display blocks and diagram bindings survive canonical export and Studio/draft checks.

The combined native media export has **103 embedded assets totaling 983,771 bytes**, leaving **16,229 bytes** under the existing 1,000,000-byte limit. No native or imported media limit was raised. Future illustrated content needs a fresh budget report before integration.

## Validation

- **147/147 focused JavaScript integration tests passed**: Batch 6, native compatibility, calculus bridge and challenge core.
- The additional focused integration run passed 62 of 63 initially; its new graph-bound assertion caught an unapplied range edit. After correcting the YAML and exporting again, **all 10 Batch 6 tests passed**, including the bounds assertion. The other 53 selected illustration, map, WebMCP, statistics and foundation tests had passed and were unaffected by the range-only correction.
- **45/45 selected Python tests passed**, covering the Batch 6 source/oracle/registration tests plus content loader, functions, calculus bridge and foundation compatibility. The actual Python generator test ran; it was not skipped.
- **8,400 generated assessment instances** exercise all 84 templates across 100 variants. Independent SymPy/formula oracles, misconception controls, domain exclusions, graph bindings, capstone retention, answer-string rejection, original-draft restoration and Studio media checks passed. Repeated fixed-formal instances test binding and selection, not thousands of different theorems.
- Strict content validation passed with no warnings. Registration is idempotent.
- **All four authored references passed the actual pinned Lean kernel and method-policy checks**, producing fresh reference certificates. Successful kernel times were approximately 12.2–12.8 seconds. The initial Elan-shim version check timed out; prepending the installed pinned toolchain directory resolved startup while retaining the normal provenance checks. The definition proof's first cold attempt timed out; its retry verified in 12,807 ms. The existing 60-second policy was not relaxed.
- **All four real HTTP companion → application-store submission checks passed** with fresh submitted-proof verification. The definition task additionally passed save/restore/replay. Restored data alone remained assessment-ineligible, and all four completed assessments still required the conceptual capstone's tutor review. No reference certificate was promoted into learner credit.
- Actual local Chromium app checks passed on desktop 1440×1000 and mobile 390×844 layouts: four lesson pages, eight teaching figures, 21 questions per assessment, all twelve graph scenarios, and four formal-workspace panels. No page errors or horizontal overflow occurred. Screenshots were reviewed. Mobile layout is emulation; this update does not claim physical Android/iPhone testing or a new WASM parity run.

The expensive complete Lean corpus and full application suites were not rerun. Checks were restricted to the new proofs and affected content, integration and trust paths.

## Reproduction

```powershell
python scripts/register_derivatives_batch6.py
python scripts/export_web_curriculum.py --media-report .bridge-runtime/derivatives-batch6-media.json
python -m quickmaths.cli validate-content --strict-warnings
python -m pytest tests/test_derivatives_batch6.py tests/test_register_derivatives_batch6.py -q
node --test docs/derivatives-batch6.test.js
. ./scripts/formal-env.ps1
# If the Elan shim stalls, prefer the already installed exact pinned binaries:
$env:PATH = 'X:/QuickMaths/.bridge-runtime/formal/elan/toolchains/leanprover--lean4---v4.34.0-rc2/bin;' + $env:PATH
python scripts/check_derivatives_batch6_references.py --output .bridge-runtime/derivatives-batch6-kernel.json
python scripts/check_derivatives_batch6_app.py
```

`--preflight-only` is diagnostic, not a publication pass. To check a single reference after a cold timeout, use `scripts/check_native_formal_references.py --skill MATH_CALC_003 --output <report.json>`; do not substitute a source-generation success for kernel acceptance.

Serve `docs/` locally on port 8899 and run `scripts/check_derivatives_batch6_browser.py` for isolated UI checks. It keeps screenshots and temporary browser work under F:/QuickMathsTests/derivatives-batch6, configurable through QM_BROWSER_TEST_DIR. Source figures can be rebuilt with `scripts/build_derivative_batch6_figures.py`; preserve the figure builder's plotting/font environment for byte-exact reproduction.

Machine-readable integration evidence is in [2026-09-21-derivatives-batch6-evidence.json](2026-09-21-derivatives-batch6-evidence.json). This report describes local validation, not hosted CI or deployment.
