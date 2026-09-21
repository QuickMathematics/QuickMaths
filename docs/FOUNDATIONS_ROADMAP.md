# Native foundations: twenty-lesson expansion

This update implements the twenty named lessons in the proposed roadmap. The original heading said twenty-five, but no extra five lessons were specified or invented. Existing lessons keep their prerequisite locks and saved progress. Whole-number calculation is an additional beginner entry point.

| Batch | Lessons | Purpose |
|---|---|---|
| 1 | MATH_ARITH_006–009 | Whole numbers; factors and multiples; fraction addition/subtraction; decimal arithmetic |
| 2 | MATH_ARITH_010–012, MATH_ALG_009 | Estimation; ratios and rates; proportion; percentage problems |
| 3 | MATH_ARITH_013–014, MATH_GEOM_005–006 | Measurement; scientific notation; angle and polygon language |
| 4 | MATH_GEOM_007–010 | Plane measurement; Pythagoras; rigid transformations; similarity |
| 5 | MATH_GEOM_011–012, MATH_ALG_010, MATH_RAD_002 | Circular and solid measurement; absolute-value tolerances; higher roots |

## Teaching and assessment contract

Each new lesson has ten worked examples, four applications and twenty distinct assessment scenarios. Numerical variants are practice of a scenario, not additional learning objectives. All twenty templates appear in every new assessment; the reviewed conceptual capstone cannot rotate out. The capstone's final answer and its explanation have separate responsibilities: a correct number does not bypass tutor review. No certificate or formal-verification boundary changes.

Theorem proving is not required for arithmetic fluency or used to claim unsupported geometric proof grading. Definitions, domain restrictions, model assumptions, units and error analysis remain explicit learning objectives. Existing formal exercises elsewhere in the curriculum retain their verification requirements.

## Representations

Instructional SVG figures are generated locally and embedded with verified hashes and sizes. Place-value tables, fraction strips, arrays, ratio and geometry diagrams use explicit labels and alternative descriptions. Structured mathematical blocks preserve calculation steps. Direct and inverse proportion assessment graphs bind to the public question givens; saved drafts retain the resolved graph, not a rerolled picture. A diagram's appearance never supplies an unmarked geometric hypothesis.

Use exact fractions (for example `13/5`) when a prompt requests an improper fraction. Higher roots of negative values use the supported exact-answer pathway and reviewed domain reasoning; ordinary floating-point power syntax is not treated as a universal real odd-root operator. Precision questions distinguish numeric equality from the intended number of significant figures.

## Existing-lesson retrofits

Seven existing lessons receive separately identifiable optional preparation or continuation paragraphs: integers, fraction basics, decimal/percent conversion, exponent laws, square roots, right-triangle trigonometry and general triangle applications. Known native lesson IDs in theory become escaped internal navigation links. No old prerequisite list is modified.

## Maintenance

Canonical source is under `content/math/algebra_foundations/skills`. Rebuild native curriculum with `python scripts/export_web_curriculum.py`. The source figure builders are in `scripts/build_*foundations*.py` and `scripts/build_arithmetic_onramp_core.py`. Builder filenames and validation evidence are recorded in the release report. Native Studio copies retain reviewed capstones, figures and mathematical displays; portable copies contain resolved questions rather than executable generator code.

Focused content tests cover independent mathematical oracles, plausible wrong answers, one hundred generated variants, prerequisite cycles, original-draft restoration, capstone retention, review eligibility and Studio round trips. Existing catalog tests distinguish lesson count, ordinary scenario count and configured assessment length.
