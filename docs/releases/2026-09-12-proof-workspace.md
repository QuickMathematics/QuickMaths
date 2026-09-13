# QuickMaths local release: learner proof workspace

Release date: 12 September 2026. Development slice: the native proof workspace and its trust boundary.

## Source and scope

This is an update to the **complete supplied repository**, not a replacement prover or a standalone demo. The baseline is `QuickMaths-theorem-prover-checkpoint-58-factorial-power-imbalance.zip`, SHA-256:

```text
2ad25c1f4c42d02dc6530f5dba03259d72e7281a430cf3c7c9b4b2f08a36337f
```

The existing formal engine, checkpoint-58 mathematics, lesson system, Lesson Studio, Agent Bridge, WebMCP, sync and ordinary lessons remain in the repository. No GitHub authentication, remote push, or deployment was performed. The included patch applies to the supplied checkpoint-58 tree; the full ZIP already contains the changes.

This release does **not** complete the entire lesson → tutor → formal mastery loop. It completes a bounded implementation slice of that loop and fixes several trust and interoperability defects found along the way. Actual kernel execution and a full native-browser acceptance run remain release gates, not claimed achievements in this environment.

## What changed

### Learner workspace

Formal-spec questions now use a dedicated workspace in the ordinary QuickMaths lesson UI: theorem, explicit declarations/domains, assumptions, ordered reasoning, readable justifications, step IDs, local-scope labels, remaining obligations, and the companion's interpretation of the statement. It reuses the existing cream/pine visual language and stacks on narrow screens.

`Check my reasoning` is separate from `Verify complete proof`. Candidate-ready steps are not green. Imported or saved proof-state flags are not a source of live verification. The view shows unavailable verification without calling the learner's answer incorrect.

Each step can be edited in place. Its identity and later steps survive, so repairing an earlier argument exposes broken dependencies instead of silently deleting the rest of the proof. Typing immediately withdraws verification, persists a pending-edit marker and blocks checking until the edit is saved. An unfinished new step also withdraws the displayed final certificate. Draft edits do not need a running companion; parsing/saving a repaired step does.

### Bounded kernel progress checks

The additive `check_progress` RPC checks root-step prefixes through the existing `verify_request` path. Each successful prefix has its own exact request and a certificate with `proof_mode: progress`. The enclosing report also binds the entire original request, including its unresolved suffix. A prefix certificate is never a final assessment certificate.

Checks stop at the first unresolved prefix, verifier failure, time budget or count budget. The current cap is 12 prefix checks and a 10-second aggregate kernel budget, bounded further by the request policy. Parsing and symbolic preflight retain their existing resource behavior; this is not a comprehensive denial-of-service audit.

Child-scope steps are deliberately not promoted to global facts. Their existing discharge rules remain responsible for scope. A nested-subproof authoring interface and richer local kernel progress are later work.

### Trust fixes

* Missing, malformed, duplicate or unrelated axiom reports no longer become an empty audit. Certificate issuance requires one report for `QuickMathsGenerated.result` after successful Lean execution. Explicitly axiom-free reports are accepted. A lesson cannot expand the accepted foundation beyond `propext`, `Classical.choice` and `Quot.sound`.
* Fresh browser responses are checked for exact request, goal, assumptions/steps, source-artifact hash, certificate digest, proof mode and pinned environment. These are consistency checks, **not cryptographic authentication of a compromised local companion**.
* A retained request ID is not accepted as evidence that an imported draft still describes the lesson. Before the UI saves/checks a resumed proof or replays its certificate, it asks the companion to parse the current bound lesson again and compares the immutable root theorem, variables, assumptions and policy. Legitimate local subproof contexts remain local.
* Async results are tied to the active profile, attempt, question, problem binding, exact request, pending edit and displayed proof state. A late response is discarded after those change.
* Live prefix reports stay in memory; backups cannot supply them. Archived complete certificates need fresh replay before the active workspace shows a verified badge. Freshly checked display state replaces imported display text.
* Progress, reference and assisted certificates cannot be added through the learner assessment-evidence creation path. This does not yet redesign every legacy review/mastery path.
* Evidence storage now accepts a 40-character Git revision for mathlib instead of incorrectly requiring a 64-character SHA-256 proof digest. The supplied algebra/calculus example's backend identifiers were aligned with the service's `lean4` identifier.

## Validation performed

| Check | Result |
| --- | --- |
| Existing formal suite before this work | 474 passed |
| Updated formal suite | 498 passed, 1 skipped |
| Existing web suite before this work | 433 passed, 2 failed |
| Updated full web suite | 458 passed, the same 2 failed |
| Focused browser formal modules | 41 passed |
| Existing root Python application suite | 234 passed |
| Real HTTP service tests, included in the formal total | 9 passed |
| JavaScript syntax and `git diff --check` | Passed |
| Offline renderer, desktop and 390px mobile | Rendered; no horizontal overflow |

The two baseline web failures are in `docs/webmcp-tools.test.js`: the browser-shell test expects an absent `toggle-plan-view` control, and the agent-guide test expects 30 tools although the existing app exposes 31. They were observed before modifying the project and remain unchanged. The root Python suite reports existing `datetime.utcnow` deprecation warnings.

New regressions cover absent/malformed axiom evidence, policy weakening, scope escape, self/future citations, missing division guards, lost guard dependencies after editing, mismatched certificates, forged verified-step lists, imported display text, changed authored theorem/domain/context, certificate modes and profile/attempt/revision identity.

**Lean and Lake are not installed in this execution environment.** Mock successes exercise certificate/protocol checks only. The real-Lean prefix test is explicitly skipped. No new theorem is represented as kernel-verified on the strength of those mocks.

The native browser smoke script could not navigate even to localhost: Chromium administrator policy blocks URL navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`. That policy was not modified or bypassed. Offline `set_content` rendering used real candidate/obligation data and the actual workspace/CSS, with no fake green verification. It checks layout, not the whole application's event flow. The actual HTTP regression independently exercised construction → progress-unavailable → in-place repair → missing-guard rejection with no mocked verifier success.

## Run locally

From the extracted repository, using your usual Python environment:

```bash
python -m pip install -e "./formal-verifier[dev]"
qm-formal --project-dir ./formal-verifier serve --host 127.0.0.1 --port 8765
```

In another terminal:

```bash
python -m http.server 8000 --directory docs
```

Open `http://localhost:8000/`. The static app remains usable without the companion. Kernel verification additionally requires the existing pinned Lean/mathlib environment described in `formal-verifier/README.md`; it is not bundled in this source release.

To reach the workspace through existing authoring, open Lesson Studio, expand **Kernel-checked theorem proof**, enable its proof specification, and use **Load algebra example**. Save/import that lesson and start a learner attempt. The new workspace appears on its formal-spec question. This route is documented from the code but still needs the unrestricted native-browser acceptance run below.

For a cancellation repair scenario, author these public fields:

```text
Declarations: x:real
Assumptions: x != 3
Formal goal: (x^2 - 9)/(x - 3) = x + 3
Allowed rules, one per line:
sub_ne_zero_from_ne
field_identity
eq_refl
ring_identity
```

Try asserting the final equality with fraction simplification but no cited guard. The remaining obligation is `(x - 3) != 0`. Repair the first step to that nonzero claim, justify it using the unequal-quantities rule and assumption `h1`, then add the final fraction identity citing `user_step_1`. With no Lean, progress remains unavailable. With the pinned kernel, run the acceptance gates before treating this scenario as validated end to end.

The old short-answer/review UI is still separate. A matching short answer or a tutor review is not a formal certificate, and this release does not present legacy mastery as kernel-certified mastery.

## Acceptance commands and next slice

```bash
# Run from the repository root:
python -m pytest formal-verifier/tests
python -m pytest tests
npm --prefix docs test
node --test docs/formal-*.test.js

# A machine with Playwright and Chromium, without a blocking URL policy:
python scripts/test_formal_workspace_browser.py

# Only in the pinned Lean/mathlib environment:
cd formal-verifier
python scripts/kernel_acceptance.py
python -m pytest tests/test_progress.py -q
```

The next implementation slice should connect the exact public proof state to authorized, reference-free WebMCP tutoring and a verifier-gated formal assessment result. It must not route correctness through an AI review. Remaining work also includes native subproof construction, stronger publication gates, comprehensive archive/sync/assignment/Agent Bridge attack tests, actual executable/environment attestation, and a public-demo lesson pack with reference proofs checked by the real kernel.

Primary files for continuation: `docs/formal-proof-workspace.js`, `docs/formal-proof-trust.js`, `docs/formal-proof-client.js`, `docs/challenge.js`, `formal-verifier/src/quickmaths_formal/progress.py`, and their new regression tests. Keep the supplied engine and mathematics; do not restart from this workspace as a separate project.
