# Formal learning in QuickMaths

PC Chrome/Edge and Android Chrome now use the pinned browser-local Lean backend
through the protected `/formal-runtime/` app entry. No companion installation is
required for supported proofs. iPhone/iPad support is deferred. The separate
`/experiments/browser-lean/` test harness remains assessment-ineligible.

See the [rollout report](releases/2026-09-19-pc-android-formal-rollout.md) for
validation, lesson changes and the preserved certificate boundary.

## Optional desktop companion

Install the ordinary application and companion dependencies in an environment with package access:

```sh
python -m pip install -e . -e ./formal-verifier
```

On Windows, keep the pinned Lean, Python environment, temporary files and
mathlib cache on the repository's X: drive:

```powershell
.\scripts\setup-formal.ps1
. .\scripts\formal-env.ps1
```

Run the environment command in every new terminal before invoking `lake`,
`qm-formal`, or the validation scripts. The setup installs Lean
`leanprover/lean4:v4.34.0-rc2` and resolves the committed mathlib revision
`42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c`. Toolchains and download caches live
in `.bridge-runtime/formal`; Lake's installed packages and build outputs live
in `formal-verifier/.lake`. Both are ignored by Git and stay on X:.

Run the companion and static app in separate terminals, from the repository root:

```sh
qm-formal --project-dir formal-verifier serve --port 8765
```

```sh
python -m http.server 8080 --directory docs
```

Open `http://127.0.0.1:8080`. In Settings, load `examples/formal-proof-lab.lesson-set.json` and approve installation. The pack adds three independent Proof Lab lessons without replacing native content:

| Lesson | Learner experience |
| --- | --- |
| The missing condition | Inspect an unjustified cancellation, identify the nonzero obligation, and repair the argument. |
| Two equations, one conclusion | Derive a linear consequence from explicitly cited equations. |
| A square is a reason | Use a nonnegative square to develop a polynomial inequality argument. |

All three reference candidates passed the pinned Lean kernel during integration, using `python scripts/check_formal_references.py`. That script also replays a real certificate and rejects a tampered reference-to-submission promotion. Run the pinned companion's reference check in Studio after editing an exercise. Reference verification never grades a learner's submission; no pre-populated learner proof or green badge is shipped.

A formal question opens a proof workspace instead of the old answer/work form. State a claim, select a justification, and name the facts it uses. `h1`, `h2`, and so on are assumption IDs; earlier learner lines have visible step IDs. There is no Lean code editor in this path.

`Check my reasoning` checks bounded root prefixes through the existing verifier. `Verify complete proof` checks the exact exercise goal and complete submission. A prefix, a reference, an assisted search result, a candidate-ready flag and an AI opinion are all insufficient for formal assessment.

The one-line cancellation demonstration deliberately begins with an unjustified fraction simplification. The real companion exposes `(x - 3) ≠ 0`. After editing that line to establish the nonzero condition and adding a properly cited simplification, the candidate is ready for the kernel. Without Lean, it remains `verification_unavailable`; QuickMaths records no failed attempt or new mastery.

## The tutor contract

The registered tool set now includes `inspect_formal_proof` and `record_formal_guidance`. Both respect the current curriculum's Agent tutoring policy. Neither invokes the verifier or writes learner proof steps.

Inspection returns an allowlisted view: public goal, variable domains, assumptions, learner claims, scopes, premise IDs, freshly certified root-step IDs, unresolved obligations, verification availability and bounded question choices. It does not return an entire question, proof specification, request, certificate, generated Lean artifact or solver strategy. Reference solutions and answer fields are not included, even after submission.

The tool's `proof_revision` changes after an edit, an outcome change, a profile/session reset or restoration. Guidance chooses one `guidance_id` offered for that exact revision. For example:

> Before step 1 is justified, what establishes (x - 3) ≠ 0?

Free-form solutions, certificates, verdicts, supplied proof steps and obligation verdicts are rejected by the guidance tool. Selecting a question changes neither the proof nor its grade. The question appears in the native workspace. The learner can also request that same bounded question directly with **Give me a question**.

For formal exercises, the legacy `record_tutor_feedback` grading route is prohibited. Ordinary proof-obligation and rubric lessons keep their existing review workflow. A mixed lesson can review its ordinary questions without giving that review authority over its formal result.

The tutor must distinguish a preflight obligation from a kernel proof. No verified prefixes means no claim of established steps. Local subproof claims are not promoted to global facts. A timeout, unsupported operation or missing hypothesis is not proof that the theorem is false.

## Assessment and persistence

`docs/formal-learning.js` owns transient verification authority in a private runtime closure. The native UI and assessment store share that controller. Only a fresh successful companion check or replay can populate its complete-submission receipt. The existing client still checks exact request, statement, proof mode, source hash, allowed axioms, certificate digest and pinned environment.

Before checking or replaying a saved submission, the app freshly parses the authored theorem through the companion and compares immutable root domains, assumptions, goal and policy. Keeping an old request ID cannot hide a changed theorem.

The ordinary JavaScript and Python short-answer graders now return verification-required for `proof_spec` questions. Matching an answer string, inserting `status: verified`, adding a tutor review, or directly archiving consistently hashed certificate JSON cannot grant live formal assessment eligibility.

The complete learner proof must remain unchanged through submission and reflection. Both gates require the exact live receipt. Edits, including unsuccessful oversized edit attempts, withdraw authority. Requests are bound to the current profile, draft, question and revision; a late response is discarded after edit-and-undo or profile-away-and-back. Per-proof concurrency and a four-operation runtime cap bound application-side requests. Health and RPC timeouts prevent a hung companion from permanently locking the editor.

Backups, sync, assignment imports and Agent Bridge checkpoints carry data, not the private runtime closure. Restored certificates and formal assessment receipts are marked replay-required. Imported progress cannot hydrate verified-step badges. Historical mastery scores remain historical local records, not newly authenticated mathematical evidence. Historical formal results are labelled archived rather than displayed to the tutor as live correctness. Ordinary lessons remain usable when the companion is missing.

## Curated browser environment experiment

Formal lessons may declare optional `proof_spec.capabilities`: `algebra`,
`radicals`, `limits`, `derivatives`, and `sequences-series`. Lesson Studio exposes
this as loading guidance; leaving it blank preserves existing specifications.
The verifier derives its required imports from the normalized mathematical
request, independently of these author hints. Changing a label cannot authorize
another theorem, rule, artifact URL, or certificate.

The generator now uses versioned public-module import groups. Shared compressed
artifacts are addressed and checked by hash. The experimental browser loader
reuses cached bytes across groups and keeps at most one live worker; changing
groups or explicitly discarding the worker releases its runtime. A failed cache
write permits verified online use but does not establish offline availability.
Snapshots must match the exact WASM/JavaScript binary and import header.

This is a runtime experiment, not an enabled assessment backend. Browser results
remain `assessment_eligible: false` with `certificate: null`. Formal mastery still
uses the pinned native verifier and existing fresh-receipt/replay checks.

## Trust limits

The Lean kernel and permitted foundational axioms remain the mathematical authority. Python, JavaScript, parser reports, preflight and the tutor do not confer verification. No axiom allowlist, sorry/admit protection, Lean-injection restriction, source binding or environment pin was relaxed.

The local app origin and companion are trusted execution components. Digest consistency binds content; it does **not** authenticate a malicious process impersonating the companion or protect a browser owner who rewrites application code. This is not a remote high-stakes examination system. The reference-free tool interface is an access boundary for tutoring tools, not encryption of author data from someone with full filesystem/browser access.

Method-specific `assessment_policy` metadata is not implemented by this learner-assessment path. A nonempty policy explicitly blocks final assessment instead of being silently ignored. Leave it empty for the demo lessons. Method teaching in a prompt is not itself an automatically enforced proof-strategy requirement.

The human-facing editor currently focuses on ordered root claims and in-place repair. The existing engine retains quantifiers, scopes, induction and other deeper mathematics. Rich subproof construction, a polished fact picker, method-policy enforcement, smoother failed-check diagnostics and public-demo kernel acceptance are follow-on work, not claims of this slice.

## Validation and reproduction

```sh
npm --prefix docs test
python -m pytest -q tests
cd formal-verifier
python -m pytest -q
cd ..
python scripts/test_formal_learning_http.py --output-dir X:/QuickMaths/.bridge-runtime/formal/http
python scripts/render_formal_learning_preview.py --output-dir X:/QuickMaths/.bridge-runtime/formal/preview
python scripts/test_formal_workspace_browser.py --output-dir X:/QuickMaths/.bridge-runtime/formal/browser
```

On Windows, dot-source `scripts/formal-env.ps1` first. The browser smoke uses
the real local companion and a real Chromium executable when available; it is
not a substitute for checking every authored fixture theorem.

The HTTP script uses the real Python companion and actual JavaScript store/WebMCP modules, not a fake verifier response. With no toolchain, it expects an unavailable final result and no mastery. With the pinned toolchain installed, it requires the repaired complete proof to verify. Successful certificate/mode/replay/mastery unit-contract tests use explicitly labelled transport mocks and do not establish mathematical truth.

The preview script renders the actual workspace with real candidate/obligation data at desktop and mobile widths. It is an isolated layout check, not a native application interaction test. The full browser smoke script remains separate.

The source package's historical no-Lean validation deliberately ends at
`verification_unavailable`. The current integration checks additionally run
the pinned Lean corpus, generated acceptance artifacts, real certificate replay,
HTTP/store/WebMCP repair flow, and native browser verification with Lean.
See [the integration report](releases/2026-09-13-formal-kernel-integration.md)
for executed results and operational limits.

### Verification time allowance

New formal proof jobs and Studio reference checks allow up to **60 seconds**
per verification. On phones a proof can take tens of seconds; initial runtime
setup/download can take longer. The proof workspace displays this guidance.
Saved requests and certificates keep their original policy for exact replay;
this update does not silently rewrite old evidence or enable browser grading.

The reusable engineering workflow is documented in
[Formal proof optimization procedure](FORMAL_PROOF_OPTIMIZATION_PROCEDURE.md).

### PC and Android browser proof checking

Chrome/Edge on PC and Chrome on Android can check supported formal proofs locally.
Start a formal question to open the protected proof workspace; on first use it
reopens the saved test and enables isolation. Select **Start my proof** again
after the reload. Initial setup downloads shared verified assets (hundreds of
megabytes); use Wi-Fi. Cached environments are reused. Each proof check allows
up to a minute; initial setup can take longer. Your draft survives a failed check.

Only a fresh Lean certificate for the exact submitted proof can award formal
credit. Author reference checks remain separate from learner submissions. iPhone
and iPad browser support is deferred; drafts can still be saved. Existing imported
formal lessons use the same backend when their declared capabilities are supported.
The local desktop companion remains available through explicit client options.
