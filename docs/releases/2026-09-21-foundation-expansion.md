# Foundation curriculum expansion — 21 September 2026

## Delivered scope

All twenty named lessons from the requested roadmap are integrated into the native Mathematics curriculum. The roadmap heading mentioned twenty-five, but the confirmed delivery scope is the twenty named lessons.

| Lesson ID | Title |
|---|---|
| MATH_ARITH_006 | Whole-number calculation and place value |
| MATH_ARITH_007 | Factors, multiples, primes, GCF and LCM |
| MATH_ARITH_008 | Adding and subtracting fractions and mixed numbers |
| MATH_ARITH_009 | Decimal operations, powers of ten and quotient scaling |
| MATH_ARITH_010 | Rounding, significant figures and bounds |
| MATH_ARITH_011 | Ratios, unit rates and proportional sharing |
| MATH_ARITH_012 | Percentages, reverse percentages and percentage points |
| MATH_ARITH_013 | Measurement, unit conversions and elapsed time |
| MATH_ARITH_014 | Scientific notation arithmetic and orders of magnitude |
| MATH_ALG_009 | Direct and inverse proportion |
| MATH_GEOM_005 | Angle relationships and parallel lines |
| MATH_GEOM_006 | Triangles, quadrilaterals, and polygons |
| MATH_GEOM_007 | Perimeter, area, and composite plane figures |
| MATH_GEOM_008 | Pythagoras and coordinate distance |
| MATH_GEOM_009 | Rigid transformations, symmetry, and congruence |
| MATH_GEOM_010 | Similarity, scale drawings, and scaling laws |
| MATH_GEOM_011 | Circle areas, sectors, annuli, and composite circular regions |
| MATH_GEOM_012 | Volume and surface area of prisms and cylinders |
| MATH_ALG_010 | Shifted and scaled absolute-value equations and inequalities |
| MATH_RAD_002 | Higher roots and rational exponents |

Together these add **200 worked examples, 80 applications, and 400 distinct assessment scenarios**. Each lesson has a 20-question assessment containing all twenty templates, including one required conceptual capstone on every attempt. Numerical variants are not counted as additional scenarios.

Native browser lessons increase from 92 to 112 (109 native YAML lessons plus three established bridge lessons). The shipped native/Depot catalog increases from 136 to 156. Configured native assessment questions increase from 1,277 to 1,677; the separately tracked ordinary scenario catalog increases from 1,243 to 1,643.

## Teaching, sequencing and reasoning

- Whole-number calculation supplies an additional beginner entry point and the fresh-profile first recommendation. All existing prerequisite arrays and saved-progress semantics remain unchanged.
- New prerequisite routes connect fractions, decimal operations, ratios, units, elementary geometry, area, similarity, tolerances and higher roots without imposing new locks on established learners.
- Seven existing lessons gain optional preparation/continuation links: integer operations, fraction basics, decimal/percent conversions, exponent laws, square roots, right-triangle trigonometry and laws of sines/cosines. Existing teaching, examples, questions and answer keys are preserved; comparison against the previous exported curriculum found only those seven theory changes.
- The circle-area lesson refers to the existing circles/arcs bridge as recommended reading, while its hard prerequisite is native plane area. This keeps the standalone Python native track valid without requiring a browser-only bridge entry.
- Topics include explicit assumptions, units, domain restrictions, misconceptions, wrong-answer alternatives and reviewed explanations. Geometry does not treat unmarked drawings as evidence. Higher-root material separates principal roots, real domains and all solutions of power equations.
- Every new capstone requires tutor review with self-review disabled. A correct final answer alone cannot grant the required review. No mandatory Lean exercises were added merely to assess elementary arithmetic; no unsupported geometric proof grading is claimed. Existing formal questions, certificate eligibility and verifier rules are unchanged.

## Visuals and app integration

- Added 41 reproducible source SVGs: place-value tables, arrays, fraction strips, decimal and ratio representations, measurement/scientific notation, angle relationships, shape properties, composite areas, coordinate distance, a Pythagorean square dissection, transformations, similarity, circles/solids, absolute-value intervals and higher-root domains. All are embedded with verified hashes and sizes.
- Structured mathematical blocks present selected calculations and derivations. Two direct/inverse proportion assessment graphs resolve from the same public givens as their randomized questions and survive draft restoration unchanged.
- Known native lesson IDs in theory become escaped internal links; unknown IDs remain text. Refreshed seven illustration compatibility fingerprints so the retrofitted lessons retain their established figures.
- Fixed native display validation to validate a generated, resolved Cartesian diagram through the existing bounded normalizer. Hidden parameters, unsafe expressions and excessive powers remain rejected.
- Fixed Studio native copying to select only the chosen lesson's assets before adding supplementary illustrations. Previously, the enlarged curriculum's asset total could trigger the portable-pack limit and suppress matching figures.
- Studio guidance now points authors to foundation examples. Copied lessons preserve mathematical displays, media and capstone review requirements; portable copies remain resolved data rather than executable generators.

The final native media export contains **95 assets, 836,686 bytes of raw embedded media**, leaving **163,314 bytes** under the existing 1,000,000-byte budget. Imported-pack limits and integrity checks are unchanged. This is the native embedded media total, not the complete application or Lean runtime download size.

## Guides and maintenance

Updated the authoring guide (`CUSTOM_LESSON_SETS.md`), student and educator guides and their PDFs, media guide, Studio help, agent manifest and cache versions. Added `FOUNDATIONS_ROADMAP.md`. Historical audit counts in the manifest are explicitly labeled as historical.

Canonical lessons are in `content/math/algebra_foundations/skills/`. Figure/content builders:

- `scripts/build_arithmetic_onramp_core.py`: whole numbers/fraction addition and four figures.
- `scripts/build_proportion_foundations.py`: direct/inverse proportion and its comparison figure.
- `scripts/build_native_math_arith_007.py` and `009.py` through `014.py`, with `native_number_foundations_common.py`: number lessons and fourteen figures.
- `scripts/build_native_plane_foundation_figures.py`: fourteen plane-geometry figures; YAML remains canonical for these six lessons.
- `scripts/build_native_final_foundations.py`: eight final-batch figures; YAML remains canonical for these four lessons.

Run `python scripts/export_web_curriculum.py --media-report .bridge-runtime/foundations-media.json` after source changes. Content-building scripts overwrite their owned YAML; update those builders alongside their generated lessons. Figure-only builders do not rewrite YAML. `preview_foundation_figures.py` creates local contact sheets; `check_foundations_browser.py` checks an isolated local app at port 8899. Both default to F:/QuickMathsTests/foundations, configurable via QM_BROWSER_TEST_DIR.

## Validation evidence

- Strict native content validation: passed with no warnings.
- Complete ordinary JavaScript suite: **616/616 passed**, about 12 seconds. After attaching the final dissection figure, reran its affected foundation, geometry and illustration suites: **14/14 passed**.
- Selected Python content, loader, display, oracle and compatibility tests: **48/48 passed**, about 36 seconds. After the last media attachment, source/export and retake tests: **3/3 passed**.
- Both runtimes exercise 100 seeded assessments per new lesson. Independent source oracles check generated mathematics; fixed-answer tables and plausible wrong-answer controls cover nonrandomized scenarios. Exact fraction, radical, finite-set, interval and endpoint syntax has cross-runtime checks.
- Checks retain complete scenario coverage and every-attempt capstones, detect prerequisite cycles, preserve old locks, retain exact question/draft state after template changes, reject self-review and preserve Studio/backup media and review metadata. Existing formal answer-string rejection checks remain intact.
- Headless Chromium checks all twenty lesson pages at desktop 1440×1000 and phone 390×844 layouts, decodes every attached teaching figure, exercises both parameterized assessment graphs, and checks page errors and horizontal overflow. Local screenshots/contact sheets were visually reviewed. This is mobile-layout emulation, not a new physical Android/iPhone test.
- No expensive Lean kernel/parity suite was rerun: the formal engine, certificate contract and formal curriculum were not changed.

This report records the local integration and validation. Publication and hosted CI verification are separate steps.
