# Formal CI integration fixes

- Generated proof batches now emit one `module` header and a deduplicated union of `public import` declarations before all proof bodies. Legacy plain imports are normalized into that header. Each fixture retains its separate namespace and `#print axioms` check; fixture line-range diagnostics are recalculated for the combined file.
- The MATH_ALG_007 content regression keeps required ordinary working and inequality-line assertions for ordinary questions. Formal questions are checked separately for their proof-workspace configuration, statement, allowed rule and reference proof. No curriculum content or grading semantics changed.
- Formal CI uploads `.lake/kernel-diagnostics/` as `generated-kernel-diagnostics` even when a later step or the generated batch gate fails. Artifacts include generated Lean source, fixture line ranges, Lean logs and the batch summary when produced; retention is 14 days.
- Adds regression coverage using two actual generated sources, checking the single header, imports, isolated namespaces and both axiom queries, plus legacy/public import deduplication.

Validation: 11 focused tests passed (`formal-verifier/tests/test_kernel_batch_check.py` and `tests/test_content_loader.py`). The actual two-proof Lean batch (`guarded_cancellation.json`, `polynomial_derivative.json`) passed compilation and both axiom audits. The full corpus and downstream CI gates were not rerun locally for this repair.
