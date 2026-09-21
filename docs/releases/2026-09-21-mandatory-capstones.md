# Preserve every-attempt capstones

Composition (MATH_FUNC_004), Rates and difference quotients (MATH_FUNC_007), Limits (MATH_CALC_001), and Continuity/IVT (MATH_CALC_002) now set `test.question_count: 21`. Canonical export includes all 21 templates on every new attempt, keeping the original reviewed capstone alongside the formal exercise. No selector, grading, certificate or review policy changed. Saved drafts remain original snapshots; this does not inject questions into an already-started assessment.

Updated source/export expectations, catalog inventory, student/educator guides and PDFs, and manifest. Regression checks cover 100 assessment indices per lesson, retaining both required question types. Separate full-assessment checks reject answer strings for unverified formal work. Legacy ordinary review/restore tests use explicit ordinary-only fixtures rather than minting formal certificates.

Validation: 19 focused JavaScript tests, 12 Python source/export tests and strict content validation passed. No long Lean suite was rerun: proof statements and verifier implementation are unchanged.
