# Formal learning: source integration and real Lean verification

## Source and environment

- Imported `QuickMaths-formal-learning-2026-09-13.zip` from QM_Dev_Depot commit `982d6ff` into the real QuickMaths checkout.
- Archive SHA-256: `7c16a7a645f5b6415c1d83ec5a1afca0f7f5320bf88a35dbb305784fc60cf0f0`.
- Preserved the task start in `agent-task.json` throughout integration.
- Pinned Lean/Lake: `leanprover/lean4:v4.34.0-rc2`.
- Pinned mathlib: `42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c`. Committed `lake-manifest.json` also locks transitive packages.
- Installed Elan 4.2.4 with release-digest verification. Toolchains, Python environment, cache and temporary files stay under the checkout on X:. Runtime binaries and mathlib build files are ignored by Git.

## Learner and author functionality

- Formal questions have a native proof workspace: claims, justifications, cited facts, editable steps, visible domain obligations and bounded progress checks.
- Only a fresh, complete, submitted proof accepted by Lean permits formal assessment. Reference proofs, assisted search, tutor feedback and imported certificate JSON cannot grant that authority.
- Editing withdraws verification. Offline edits persist; restored certificates require replay. Profile, draft, question and revision bindings reject stale responses.
- Tutors can inspect public proof state and select bounded guidance questions without receiving reference answers or assigning formal grades.
- Studio supports declarative proof specifications and reference checking. Native/portable schemas, Python generation, exports, backups and browser storage preserve the new fields.
- Added three optional Proof Lab lessons: cancellation with a missing condition, a linear consequence of two equations, and an inequality justified by a square.
- Updated the authoring guide, formal-learning guide, student/educator manuals, agent manifest and Studio help. Rebuilt and visually checked both downloadable guide PDFs. Advanced rule coverage and historical development checkpoints are retained in `formal-verifier/`.

## Integration repairs

- Added the missing Lean library root module and repaired the hand-authored corpus against the pinned mathlib API.
- Replaced blanket Mathlib imports in generated requests with a bounded set of required modules.
- Corrected real-number annotations, rational literals, function-application parentheses, derivative composition and conversion transparency.
- Repaired removable-hole and conjugate limits, continuity guards, polynomial-ratio limits, periodic subsequences, p-series theorem names, ratio bounds and root-test proof reconstruction. Checked the latest balanced/powered factorial ratios and single residual numerator/denominator factorial cases against Lean, repairing their recurrence rewrites and limit conversions.
- Retained domain restrictions, exact goals, source/certificate binding, forbidden-axiom checks and rejection of unsupported evidence.
- Verification now checks the actual installed Lean version, mathlib checkout and lockfile before issuing a certificate. Health checks use the configured project. Windows child processes retain the necessary Elan/system environment without inheriting arbitrary secrets or Lean search paths.
- Raised the default proof budget to 30 seconds within the existing bounded protocol; diagnostic kernel checks use explicit budgets. Timeout results remain unavailable, not incorrect answers.
- Fixed a blank test view when a formal export lacks its binding metadata; the question displays its unavailable-binding warning.
- Allowed only the designated `http://127.0.0.1:8765` companion endpoint in the site's connection policy. Arbitrary script execution remains prohibited.
- Made Windows test helpers portable, added real kernel/certificate/reference checks, and wired the pinned kernel gate into CI.
- Refreshed module cache keys for the integration.

## Executed validation

- Repeatable Windows setup script and `lake build QuickMathsFormal`: passed.
- Complete JSON fixture coverage: 122 positive proofs compiled with Lean; every result's axiom report passed the allowlist. Added 13 fixtures omitted by the package's original gate, three factorial examples previously covered only by inline unit tests, and a coverage check that rejects future unclassified fixtures.
- Representative individual requests: seven certificates issued through the production verifier, including the three factorial cases; all 71 authored rejection cases passed.
- All three Proof Lab references: kernel verified. Actual certificate replay passed; tampering with reference/submission mode was rejected.
- Real companion → JavaScript store → WebMCP → repair → assessment flow: passed with Lean available.
- Native Chromium UI: complete verification, missing-condition feedback, in-place repair, stale-badge withdrawal, offline-edit restoration and 390px layout passed. Security policy was active during this check.
- Engine unit suite: 510 passed, one optional test skipped. After final service/root-series changes, 218 relevant tests passed; the factorial repairs also passed all 200 series tests.
- Affected root Python tests: 102 passed. Formal JavaScript tests: 101 passed; final Studio/binding/workspace check: 51 passed.

## Operational limits

The companion is local tooling, not a new hosted service or a Lean runtime embedded in GitHub Pages. Run `scripts/setup-formal.ps1` once, dot-source `scripts/formal-env.ps1` in each terminal, then start `qm-formal --project-dir formal-verifier serve --port 8765`. See [the setup and user guide](../FORMAL_LEARNING.md).

The theorem language and automated search remain bounded and incomplete. Unsupported mathematics, timeouts and missing hypotheses remain unresolved; this update does not claim a complete general theorem prover. Existing ordinary lessons and tutor-reviewed work keep their previous grading paths.
