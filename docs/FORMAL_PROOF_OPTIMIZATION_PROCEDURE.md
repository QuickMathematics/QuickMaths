# Reusable procedure: optimizing generated formal proofs

**Purpose:** apply measured proof simplification to other existing QuickMaths
formal families. Preserve mathematical coverage and kernel verification. This
is the procedure used for the September 2026 monomial optimization.

## 1. Preserve an exact baseline

Record the task start in `agent-task.json`. Save the original native generator,
corpus requests/sources, runtime provenance, environment IDs and module catalog.
Keep historical results immutable. Record the actual device, budget, import
time, proof time, failure status and cleanup result separately.

## 2. Find repeated mathematical work

Start with the slow physical-device cases. Read their generated Lean alongside
the generator. Identify proofs of the same fact, repeated normalization,
unnecessary intermediate models and broad executed tactic searches.

Warnings are clues, not a timing profile: unreachable tactics do not execute.
Do not merely disable linters or remove every reported simp argument globally.
Select one narrow family with a plausible cheaper kernel-checked argument.

## 3. Simplify the proof, keeping the original statement

For monomials, the old path built a polynomial and its identical leading
monomial, proved their quotient tends to one, and reconstructed the root limit.
The replacement uses coefficient and power limits directly. It still proves
the normalized expression equals the original submitted expression inside Lean,
including absolute values. Python normalization is not proof evidence.

Preserve domain/nonzero guards, allowed axioms, imports and certificate checks.
Do not substitute sources only in the browser. Native generation remains the
source of truth; mathematical assertions still pass through Lean's kernel.

## 4. Establish the affected surface cheaply

Render the complete positive inventory and compare exact sources. Separate
changed cases from byte-identical cases. Verify environment IDs/imports have
not changed before reusing packs. For this update only 2 of 122 sources changed.

Run the actual native kernel on changed positives and representative boundary
variants. Here those variants were negative/fractional coefficients, equivalent
noncanonical syntax and a monomial denominator with a finite-prefix zero.
Run the existing negative preflight inventory. Add focused regression checks.
Use a full suite only when the scope or failures justify it.

## 5. Build a source-only browser candidate

Use `experiments/browser-lean/prepare-source-variant.py BASELINE NEW_TARGET`.
It rejects an existing target or environment-ID drift, re-renders native
sources, assigns a new catalog identity and reuses immutable module packs.
Never overwrite a hardlinked catalog/artifact. If imports change, rebuild and
measure the closure deliberately instead of calling it a source-only update.

## 6. Compare actual browser executions

Use `benchmark.py` with the same runtime, environment, staging mode and budgets
for baseline/candidate. Select affected cases with `--fixture`; use one round
and `--timing slow` to avoid warm repeats. Record exact source hashes, compiler
exit status, accepted axioms, negative/sorry controls and host hashes.

Keep machine load comparable; do not run competing builds/benchmarks or edit
the harness during measurement. Separate initialization from proof latency.
Label single-run comparisons honestly; repeat only if variance makes the
decision uncertain. Retain changes with demonstrated benefit and valid proofs.

## 7. Retest only changed cases on the target phone

Stage the exact candidate and refresh deployment pins with `prepare-phone.py`.
Use a clearly experimental route, one environment, affected cases once each,
no warm repeats and no automatic rebuild/retry loop. Check pins before starting.
Run `test-phone.py --quick` for the current two-case deployment smoke check.

Export the phone result and verify its pins and source hashes against the
published candidate. Check success/axioms and staging cleanup, not only times.
Device measurements establish device results; desktop measurements do not.

## 8. Publish bounded claims

Record before/after timings, test scope, unchanged sources, provenance,
limitations and remaining work in an update Markdown file. Preserve historical
evidence at its original policy and source identity. Commit exact deployment
bytes, verify committed pins, push noninteractively and verify Pages.

Browser diagnostics remain assessment-ineligible with no certificate. A timeout
increase is a resource-policy change, not permission to weaken proof checking.
New checks now allow 60 seconds; old requests/certificates retain their policy.

## First physical result

The A17 retest passed both cases: summable **16.519 → 7.853 seconds** (52.5%
reduction), divergent **13.512 → 6.642 seconds** (50.8%). Runs occurred separately,
so these are observed comparisons, not controlled statistical estimates.
The new test took 61.27 seconds including initialization. It left zero temporary
directories and 335,581,215 bytes of total origin storage. Evidence:
[physical A17 result](../experiments/browser-lean/results/monomial-direct/physical-a17.json).
