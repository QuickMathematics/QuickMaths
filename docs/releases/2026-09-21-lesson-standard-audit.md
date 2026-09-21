# Lesson standards audit — September 21, 2026

## Scope and outcome

Audited the shipped catalog: 92 native Mathematics lessons, 15 Geography lessons, 25 Programming Fundamentals lessons, three Python Extensions lessons and Estimation Lab: **136 lessons total**. The machine-readable per-lesson inventory is [here](2026-09-21-lesson-standard-inventory.json).

The structural pass checks normalized taxonomy, teaching/question presence, formal answer-string rejection and effective illustrations (embedded or fingerprint-matched hosted library). Every lesson has illustration coverage. Hosted illustrations are not a promise of offline availability. This is not a claim that every ordinary generated variant was manually re-proved.

## Content changes

Added six fixed formal exercises, bringing native lessons with formal assessment from eight to fourteen:

| Lesson | New verified statement | Important boundary |
|---|---|---|
| MATH_FUNC_004 | Polynomial composition expansion | This example has no domain exclusions |
| MATH_FUNC_007 | Square difference quotient simplifies to 2x+h | h != 0 remains required; not a derivative proof |
| MATH_RAD_001 | sqrt(x²)=x | Explicit 0 <= x hypothesis |
| MATH_SYS_001 | Sum/difference system has x=3 and y=2 | Both conclusions proved and combined |
| MATH_CALC_001 | Punctured rational limit at 3 equals 6 | Does not assert the function is defined at 3 |
| MATH_CALC_002 | IVT gives a real c in [0,2] with c²=2 | No claim of uniqueness |

Existing numerical questions, conceptual capstones and review requirements remain intact. Follow-up correction: Composition, Rates and difference quotients, Limits, and Continuity/IVT now use 21 questions, preserving both the original capstone and the formal exercise in every new attempt. Other lessons retain their existing lengths and rotation. Geography, programming and estimation retain their appropriate assessment types; no blanket Lean conversion or mandatory capstone was imposed. Pack question counts are catalog sizes, not a requirement that every assessment contain the whole catalog.

## Authoring and tooling

- Added `scripts/audit_lesson_standards.mjs` to regenerate the full inventory.
- Added `scripts/check_native_formal_references.py` to verify selected published native references with the actual pinned kernel.
- Updated source/export and runtime tests to distinguish ordinary questions from formal proof work while retaining ordinary mathematical oracles.
- Added readable IVT and nonnegative square-root rule names in the proof workspace.
- Marked the old experimental algebra/calculus example as historical; its unsupported method policies are not silently removed.
- Updated authoring, student and educator guides, their PDF editions, and the agent manifest.

## Validation

All six new references passed the actual native Lean verifier. [Certificate evidence](2026-09-21-lesson-standard-evidence.json) records the exact statements and generated-source bindings. The radical hypothesis was corrected to the supported explicit guard before passing. One initial cold-start timeout was retried successfully; successful expensive cases were not rerun.

58 focused JavaScript tests, 21 focused Python tests and three targeted assessment-policy tests passed. Strict content validation passed. Existing ordinary-question oracles continue to exercise the two new lesson batches; formal questions explicitly cannot earn credit by submitting their expected-answer string.

No verifier rules, runtime pins, mathematical coverage, certificate contract or eligibility checks changed. This update did not rerun browser Lean or physical-device verification of the six additions. Native reference verification does not establish learner credit; the app still requires verification of the learner's submitted steps. Hosted CI remains a post-publish check.
