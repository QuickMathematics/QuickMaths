# QuickMaths local release: formal learning and proof-state tutoring

> Historical source-package notes and early integration checks. The completed
> real-repository integration, kernel results and Windows setup are recorded in
> [the current integration report](docs/releases/2026-09-13-formal-kernel-integration.md).
> Its results supersede the unaccepted/pending gates below.

**Release:** 13 September 2026. **Delivery:** complete local source update, not deployed.

## Baseline and preservation

Built on the supplied `QuickMaths-proof-workspace-2026-09-12.zip`, SHA-256 `767d8680d7ef2eb079b87f1689b6b9c8af215c86391e9c7d2a58a671a004f4ba`. This preserves the checkpoint-58 engine and earlier learner-workspace integration. The prior release notes are retained in `docs/releases/2026-09-12-proof-workspace.md`.

The source-package preparation had no GitHub access, push, merge or deployment. Its Lean/mathlib pins are preserved by the subsequent integration. No toy checker, new axiom, raw Lean input route, or relaxed certificate rule replaces the verifier.

## Implemented

**One private runtime verification owner.** `docs/formal-learning.js` coordinates the UI, public proof-state projection, complete-certificate archive and assessment gates. Live authority cannot be hydrated from backups, imported flags, raw certificate JSON or tutor feedback. Relevant edits invalidate it, including failed oversized saves. Responses arriving after edit-and-undo or profile-away-and-back are discarded. Hung requests time out and leave operations retryable.

**Reference-free proof-state tutoring.** Authorized `inspect_formal_proof` exposes only public theorem data, learner claims/scopes/premises, current verified root steps, remaining obligations and bounded question choices. `record_formal_guidance` records one offered question for the exact proof revision. It accepts no free-form solution, verdict, certificate or supplied proof steps, and never changes grades. Questions appear in the native workspace. The learner also has a direct Give me a question control.

**Verifier-gated assessment and mastery.** Formal questions bypass the old short-answer grader. Both submission and reflection require a fresh complete submitted-proof receipt matching the exact draft. Prefix/reference/assisted certificates cannot pass the exercise. Ordinary lessons and ordinary rubric reviews remain available, including within mixed lessons. The Python legacy grader also refuses formal credit rather than treating a matching conclusion as a proof.

**Safe archive semantics.** Restored formal results and certificates are historical records requiring replay, not live correctness. Legacy tutor reviews cannot regrade a formal result. Imported proof-state flags cannot make verified-step badges. Oversized formal declarations, assumptions, rules and premises are rejected instead of silently truncated. Malformed archived display collections do not crash the workspace or tutor.

**Three Proof Lab lessons.** `examples/formal-proof-lab.lesson-set.json` installs The missing condition, Two equations, one conclusion, and A square is a reason. Each has lesson text, a worked example different from the assessment, a formal exercise, a pinned environment and an explicit reference candidate. These candidates pass real parsing/preflight; they are not advertised as kernel-verified before an actual Lean run.

**Native UI and documentation.** Formal questions no longer ask for a redundant final answer or manual rubric. Historical results display the submitted reasoning instead of raw internal JSON. Archive labels distinguish history from live verification. Studio explains the formal-grading boundary and unsupported method-policy gate. Agent manifest and cache keys are updated. The two stale web tests from the prior archive were reconciled with the actual Plan UI and registered tool/manifest contract.

## Executed validation

| Check | Result |
| --- | --- |
| Complete web suite | 520 passed, 0 failed |
| Formal engine suite | 502 passed, 1 skipped |
| Root Python suite | 239 passed |
| Historical no-Lean HTTP + store + WebMCP repair flow | Passed; final status correctly remained `verification_unavailable` |
| Real candidate contracts for all three demo references | Passed; no kernel certificate claimed |
| Actual isolated workspace rendering at 1440px and 390px | Passed, no horizontal overflow |
| JavaScript syntax and patch whitespace checks | Passed |
| Pinned `QuickMathsFormal` Lean corpus build | Passed |
| Real companion HTTP + store/WebMCP flow with Lean | Passed |
| Full native-browser interaction | Not yet accepted; browser smoke remains a separate gate |
| All fixture theorem kernel acceptance | Not claimed; only the pinned corpus/integration checks are recorded |

The HTTP flow constructs the cancellation error, obtains the precise nonzero obligation, records bounded guidance, rejects stale guidance after editing, repairs the argument and checks it. The historical no-Lean run correctly remained `verification_unavailable` with no mastery; the current pinned integration run also passes with Lean. Success-path certificate/replay/mastery contract tests use explicit transport mocks; those are not mathematical proof evidence.

The source package's earlier no-Lean run remains historical evidence for the
`verification_unavailable` path, not kernel evidence. The current real
integration run uses the pinned Lean environment and passes the repaired HTTP
flow. Native browser interaction and complete fixture-kernel coverage remain
unclaimed acceptance gates. Offline `set_content` rendering uses the actual
component and real candidate/obligation data; it is not a substitute for full
application-event testing. Existing Python `datetime.utcnow` deprecation
warnings remain.

## Run and continue

See `docs/FORMAL_LEARNING.md` for setup, demo import, the tutor/assessment contract, validation commands and precise trust limits. The patch applies from the root of the prior full-workspace archive. The new full ZIP already contains every source change; do not apply the patch again after extracting that ZIP.

On Windows, run `scripts/setup-formal.ps1` once and dot-source
`scripts/formal-env.ps1` in each terminal before `lake`, `qm-formal`, or the
validation scripts. The exact pinned Lean corpus and real HTTP integration are
complete; remaining gates are Studio reference checks, broader fixture-kernel
coverage, and full native-browser smoke in an environment permitting the
required localhost/Chromium process flow. This delivery does not claim those
remaining gates are complete.

Method-specific assessment policies currently block final credit rather than being ignored. Rich learner subproof construction and stronger deployment authentication remain follow-on work. The local origin and companion are trusted components; hash consistency is not cryptographic authentication of a malicious local process or an anti-cheating system. Historical local mastery is preserved as history, not newly authenticated certificate authority.
