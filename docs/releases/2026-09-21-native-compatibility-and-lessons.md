# Audited compatibility fixes and eight native lessons

## Source and audit

Integrated `X:/QM2/quickmaths-fixes-and-lessons-02098c4.zip`, based on commit `02098c478b7ee542b2594e34bad16218456ac58c`, on `codex/native-compatibility-and-lessons`.
All packaged SHA-256 checks passed, extraction paths were checked, and the patch applied cleanly to its stated base. Package validation claims were treated separately from checks run in this checkout. The review-only curriculum was not installed: the canonical exporter rebuilt `docs/curriculum-data.json`.

## Added curriculum

Eight lessons: domain and range; transformations; composition; inverse functions; piecewise functions; average rates and difference quotients; limits; continuity and IVT. They add 160 assessment scenarios, 80 worked examples, 32 applications and 24 SVG figures. Native Mathematics now has 92 lessons. All 84 previously exported lesson objects compare unchanged with the base commit.

The independent lesson audit checked formulas, domains, fixed answers, prerequisites, review gates, static figures versus randomized givens and SVG safety. No blocking lesson defect was found. All media references resolve; the new SVGs contain no scripts, event handlers, external resources or foreignObject content. Each new lesson has one capstone requiring tutor review; none silently becomes kernel-certified mathematics.

## Runtime changes from the pack

- Versioned, checksummed question snapshots preserve resolved givens, question selection/order and responses through reload, backup and sync. New random draws depend on stable scenario identity rather than shuffled position.
- Invalid bounded snapshots remain inert recovery data in backups. Submission and reflection cannot award new mastery while recovery is needed. The old five-question migration is restricted to its historical state versions.
- Fixed formal questions bind their final runtime IDs. A narrowly checked legacy migration retains learner steps, scopes and unsaved edits while discarding verification authority. Generated formal questions retain public-parameter specifications, method policy and bound jobs; invalid formal generation cannot fall back to ordinary grading.
- Ordinary expression grading recognizes abs, sin, cos, exp and natural log/ln and uses additional sign/domain/fractional samples. It remains bounded numerical comparison, not theorem proving.
- Native rational-equation work contracts retain original denominator exclusions, including cancelled holes and the existing work-rate story.
- Curriculum, taxonomy, application and Bridge cache references are updated together.

## Additional repairs found during integration

The source validator crashed on the six new web-format proof-obligation capstones: it expected structured strategy objects instead of descriptive strategy strings and a separate obligation list. The native work checker had the same mismatch. Both now support the web representation while retaining the legacy representation, stable obligation IDs and pending tutor review. Empty obligations and mixed strategy formats fail validation.

The two rubric capstones used `weight`, while native validation only recognized `points`. Validation now accepts the weight alias and still rejects nonpositive weights. Existing content tests were updated for the actual expanded track, optional captured work and explicitly reviewed capstones. No content was converted to ordinary grading to satisfy tests.

Updated authoring, student and educator guides (including PDFs), Studio help and the agent manifest. Added a repeatable real-browser compatibility smoke test.

## Validation performed here

- Strict native content validation passed.
- Canonical taxonomy and curriculum export passed. Embedded native media totals 786,805 bytes of the unchanged 1,000,000-byte budget (213,195 bytes remain).
- The complete JavaScript suite passed: 604 tests. This single broader run was warranted by changes to shared grading and persisted-state migration; no long Lean corpus suite was rerun.
- 47 focused Python tests passed across lesson mathematics/source checks, content loading, validation and work checking, including regressions for the schema repairs.
- Real Chromium + pinned browser Lean verified an older migrated proof without changing its steps, withdrew live assessment authority on reload, and verified/submitted a freshly generated native fixed formal question. Unsaved edits were preserved and explicitly cancelled in the synthetic test before verification.
- Desktop and 390px phone viewport checks loaded and rendered the new Limits lesson and its figures under the app's existing CSP. No CSP relaxation was introduced. This is viewport testing, not a physical-phone test.

Evidence is in `2026-09-21-native-compatibility-evidence.json`. Reproduce browser checks with `scripts/test_browser_native_compatibility.py`; set `QM_BROWSER_TEST_DIR` to a drive with adequate temporary browser storage. This run used F: because X: has little free space.

## Limits

Snapshot hashes detect accidental corruption; they are not authentication against an owner editing storage. Original questions already overwritten by an older release cannot be reconstructed without an earlier backup. Recovery retention remains bounded by existing storage limits. Mathematical coverage, Lean pins and certificate/trust contracts are unchanged. Full hosted CI and physical-device checks were not run for this local integration.
