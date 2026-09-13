# Browser Lean parity and memory update — 2026-09-13

**All 17 Chromium failures are fixed.** Both the original corrected runtime and
the smaller worker-lifetime candidate pass 122/122 positives, three times per
environment, with all 71 production-preflight negatives still rejected.
The smaller candidate lowers measured steady incremental private memory from
roughly 2.1–2.6 GiB to 1.4–1.6 GiB. Import peaks remain about 2.0–2.5 GiB, so
this is not yet a demonstrated mobile deployment.

## Scope

This note records the current browser-parity investigation for the curated
formal experiment. It does not change the production verifier, certificate or
trust contract. Existing generated sources, native pins, shared module packs,
and the negative preflight corpus remain unchanged. The 71 fresh negative
requests are rejected by unchanged native production preflight and are not sent
through the browser kernel experiment.

All browser results are diagnostic only: they issue no certificates and are not
assessment-eligible.

## Failure investigation

The isolated native-WASM-exception runtime passed 115/122 positive fixtures.
It fixes all five previously observed derivative failures. Seven series cases
still failed with `Maximum call stack size exceeded`. A native-EH-symbols
diagnostic shows that a proof can pass cold and fail warm inside Lean.Meta type
inference recursion, so a single cold success is not parity evidence.

The native-EH plus `-mtail-call` variant completed the full parity gate. The
earlier 115/122 native-EH-only result and its seven warm series failures were
diagnostic evidence for the runtime remedy, not the final parity result.
Priority-2 work began only after that parity gate passed.

Symbolized stacks located the remaining native-EH failures in compiled
`Lean.Meta` type inference, including `lean_infer_type`, `inferAppType`, and
`inferForallType`. Native EH removed the JS exception trampoline pressure;
tail-call code generation addressed the remaining compiled recursion. See
[Emscripten's exception model](https://emscripten.org/docs/porting/exceptions.html)
and [V8's WASM tail-call implementation](https://v8.dev/blog/wasm-tail-call).
No
browser stack-limit override or proof-budget increase was used.

## Reproducibility correction

The earlier curated patch captured only unstaged changes on top of an already
staged port and therefore was not a clean-checkout reproduction artifact. The
full HEAD delta is now recorded with binary and full-index data and is applied
to clean isolated worktrees. The curated builder uses
`lean-6a10-curated-full.patch`; the native-EH variants use the separately
recorded full `lean-6a10-native-eh.patch` and
`lean-6a10-native-eh-tail.patch`. Existing source trees and binaries
are not substituted or silently repaired during variant preparation.

The shared module packs remain the baseline packs. Variant preparation verifies
the corpus and negative manifests, reuses those packs byte-for-byte, and swaps
only the measured runtime plus its independently hashed worker/provenance
metadata.

## Harness and parity gate

The worker now checks the actual wasm32 compiler return path: the boxed `IO
UInt32` result is decoded before `success` is reported. JavaScript host
exceptions are recorded separately, with stack text and fatal-runtime
classification, rather than being treated as an ordinary compiler rejection.
Verified WASM and JavaScript bytes must be consumed by the worker.

The parity gate is deliberately stricter than success-at-least-once. It
requires all five curated environments, all 122 positive cases, all 71
negative preflight rows, complete unchanged source hashes, no host exceptions or
fatal runtime errors, no source substitution, and full-corpus warm rounds in
the same environment. Invalid and `sorry` controls must still fail as expected,
and every result must retain `assessment_eligible: false` and
`certificate: null`.

## Final parity result — passed

**Passed.** The fail-closed gate recorded in
`experiments/browser-lean/results/parity/gate.json` reports 122/122 positive
fixtures, 366 positive kernel executions, 25 warm repeats, 71 freshly
re-executed native preflight negatives, and 10 browser controls. The five
curated profiles completed three corpus rounds; the gate also found no host
exceptions or fatal runtime errors.

The parity candidate uses native WASM exception handling (`-fwasm-exceptions`)
plus tail-call code generation (`-mtail-call`). This is the runtime remedy for
the prior JS-emulated exception/invoke recursion behavior that produced
cold-versus-warm failures; the result is established by the complete warm
gate, not by a mechanism claim alone.

The proof inputs remained exact and unchanged: the gate verifies the final
host-source hashes, each proof record's `sourceHash` against the corpus source,
the absence of `sourceForExperiment` substitutions. Preparation verifies
byte-for-byte reuse of shared module packs, and the browser verifies their
hashes before use. The native Lean/Mathlib pins, production verifier,
certificate schema, and trust code are unchanged. Browser records remain
`assessment_eligible: false` with `certificate: null`.

The reduced candidate independently passed the same gate:
[reduced evidence](../../experiments/browser-lean/results/parity/reduced/gate.json).
It retains the exact WASM binary, all 105 module packs and all generated sources.
Its two changes are an explicitly recorded JavaScript pool setting from four
prestarted pthreads to two, and release of staged `.olean`, `.ir` and `.ir.sig`
files after the canonical header imports successfully. The imported Lean
environment and persistent verified cache remain intact.

Zero prestarted workers was rejected: three guarded IVT fixtures timed out.
The same guarded-quotient fixture passed with two workers, including warm
reuse. Sampling confirms that limits/series can start a background pthread.
Idle worker counts during a simple proof are not evidence that threads can be
removed. The Lean task-manager setting remains two.

## Memory attribution

Measurements use HeadlessChrome 140.0.7339.16 on Windows, with a real QuickMaths
mastery-map tab as baseline (about 124–126 MiB private resident memory).
All table values below are **incremental private resident MiB (USS)**, summed
over the owned browser processes. RSS, private commit, exact staged bytes and
linear-memory capacity are retained separately. Linear capacity is not live
allocator usage. Stable phases include labelled 2.5-second sampling holds;
ordinary proof timings exclude those holds.

| Environment | Staged files MiB | Baseline steady MiB, first/cached worker | Reduced steady MiB | Reduced import/proof peak MiB |
|---|---:|---:|---:|---:|
| Algebra | 486 | 2,357 / 2,153 | 1,450 | 2,054 |
| Radicals | 566 | 2,369 / 2,321 | 1,471 | 2,082 |
| Limits | 670 | 2,566 / 2,504 | 1,528 | 2,325 |
| Derivatives | 790 | 2,699 / 2,700 | 1,632 | 2,608 |
| Sequences/series | 755 | 2,619 / 2,613 | 1,603 | 2,457 |

Before staging any Mathlib files, the four-pthread runtime consumed about
1,009–1,029 MiB incremental private memory. Two pthreads reduced that phase
to 708–724 MiB. Each runtime instance has 106,300 WASM exports, 106,298 dynamic
linker GOT entries and a 125,411-slot function table. These counts identify a
large runtime/linker surface; they do not assign precise bytes to each object
or separate V8 code memory from its other allocations.

Staging then adds 509–828 million logical bytes of module files. Importing
allocates Lean's environment inside a growing linear memory (roughly
647–1,033 MiB capacity across the profiles), while the staging buffers still
exist. Releasing those duplicate files reduces steady memory, but collection
is not immediate and it does not remove the import peak. A small setup JSON
remains. Discarding each worker returned private resident usage to within
about 5 MiB of the original app baseline, while the verified cache persisted.

The baseline used one corpus round per worker and two worker launches per
environment; the reduced run used three rounds per worker. These are measured
stress-run comparisons, not a claim of deterministic garbage-collection
timing. Raw phase evidence:
[baseline](../../experiments/browser-lean/results/parity/memory-baseline.json),
[reduced](../../experiments/browser-lean/results/parity/memory-reduced.json).

## Download, cache and latency

| Environment | Shared module packs, gzip MiB | Including runtime, gzip MiB | Ready in seconds, excluding profiling holds | Median corpus proof ms | Slowest-fixture warm repeats ms |
|---|---:|---:|---:|---:|---:|
| Algebra | 179.94 | 194.96 | 10.30 | 93 | 77–100 |
| Radicals | 212.25 | 227.27 | 9.83 | 127 | 136–161 |
| Limits | 255.08 | 270.10 | 11.55 | 145 | 343–360 |
| Derivatives | 304.79 | 319.81 | 13.33 | 159 | 704–720 |
| Sequences/series | 289.85 | 304.87 | 12.57 | 274 | 3,684–3,945 |

Delivery was localhost with isolation headers. Algebra was cold; later
environments reused the same content-addressed cache. These are not internet
download timings. Separately, cached-new-worker baseline initialization was
9.22–13.42 seconds across the five profiles. Caching avoids transfer; it does
not avoid decompression, validation and import into a new worker.

The runtime is 15,748,801 compressed bytes; the union of all module packs is
319,746,628 compressed bytes. Together they occupy about 319.95 MiB of verified
cache bodies. The measured complete browser profile used 322.40 MiB of logical
disk files, including browser metadata. Switching from derivatives to series
needed only one additional 152,355-byte pack. Pack contents and sharing are
unchanged; snapshots were not used or optimized.

## Import costs and the rule-library decision

The [direct-import report](2026-09-13-formal-import-costs.md) covers every root
of every curated environment, verifies its transitive union, and separates
overlapping inclusive cost, exclusive marginal modules, and removable whole
packs. It also names the largest artifact modules for each root. These are
costs of the current generated imports, not a proof of a globally minimal
environment or a per-declaration byte profiler.

All profiles share a 2,455-module, 509,331,120-byte algebra foundation. The
largest exclusive additions include `Mathlib.Analysis.Calculus.Deriv.Abs`
(about 55.8 MiB raw) and `Mathlib.Analysis.PSeries` (about 66.8 MiB raw).
The generated names driving those roots are respectively
`hasDerivAt_abs_pos`/`hasDerivAt_abs_neg` and
`Real.summable_one_div_nat_pow`/`Real.summable_one_div_nat_rpow`.
The former root brings in inner-product-space calculus; the latter includes
condensation, asymptotics and finite-dimensional dependencies. Broad tactic
roots overlap heavily with the mathematical imports: removing one often has
zero marginal module cost. Current pack boundaries can also prevent a raw
module reduction from saving any complete cached pack.

A narrow precompiled library is **demonstrated for one family, not yet for the
whole curriculum**. The generic positive/negative absolute-value derivative
helpers in [QmAbs.lean](../../experiments/browser-lean/rules/QmAbs.lean) compiled
with `Deriv.Add` alone and the existing three-axiom allowlist. Their public
olean/IR/signature artifacts total 15,184 bytes. The production generator does
not use them, and they have not been packaged for browser verification.

A facade that merely imports the same Mathlib modules does not establish a
smaller closure. Where generated proofs still call `ring`, `field_simp`,
`linarith`, `norm_num`, `positivity`, `fun_prop` or other tactics, their meta
implementation remains necessary. Replacing those calls requires generic
kernel-checked rule APIs and a full native/browser migration check, including
domain guards, axiom audits, serialized dependencies and negative requests.
See the [rule-library analysis](2026-09-13-formal-rule-library.md) for the
per-capability declaration/tactic inventory and limitations.

## Exact provenance and remaining gates

- Lean: `6a10ac8c22beadecabdbb0919c2b50214762f91d` (`v4.34.0-rc2`).
- Mathlib: `42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c`.
- Emscripten: 4.0.22; CMake: 3.31.6; native-EH/tail-call full source patch retained.
- WASM SHA-256: `3038cfd8f81cf650b17967881339256e0bb1cbd1a407c1a7b7225fa8e367df8b`.
- Reduced catalog identity: `c85e57e95fdbc7f94aa05880ca492e72030735f9024e10fc1085a48581d0cc07`.

[Runtime provenance](../../experiments/browser-lean/results/parity/reduced/runtime-provenance.json)
records the exact JS transform, worker hash, source patch, compiler flags,
exports and symbol map. The passing original harness is preserved in commit
`aba0d2a`; reduced results have their own complete host-source hashes.

No physical Android Chrome or iPhone Safari device was available through this
session. No current runtime deployment on GitHub Pages was tested. Shared
WASM memory still requires cross-origin isolation; reducing the pthread pool
does not remove that requirement. The Pages service-worker/header deployment
path remains a separate acceptance gate, including CSP, cold navigation,
updates and cache eviction. Tail calls also require a supporting engine;
WebKit introduced them in [Safari 18.2](https://webkit.org/blog/16301/webkit-features-in-safari-18-2/).
None of this constitutes physical-device
compatibility evidence.

The next capacity work should reduce **peak import lifetime** and investigate
the runtime's large linker/export surface, then package and test narrow rule
families. Steady-state reductions alone do not make the current 2.0–2.5 GiB
peaks suitable for every phone. Browser results remain assessment-ineligible
until provenance review, deployment behavior and physical-device tests pass.

## Reproduction

All runtime/build outputs belong under the F-backed build workspace and ignored
X: experiment directories. From the F-backed Linux build environment, with the
pinned Lean and Mathlib checkouts and Emscripten 4.0.22/CMake 3.31.6 installed:

```bash
scripts=/mnt/x/QuickMaths/experiments/browser-lean
bash "$scripts/build-native-eh.sh" "$PWD" eh-tail
python3 "$scripts/prepare-runtime-variant.py" "$PWD" \
  --name native-eh-tail --source lean-upstream-eh-tail \
  --runtime build-matched32-eh-tail --patch lean-6a10-native-eh-tail.patch
```

From X:\QuickMaths in the Windows formal Python environment, run the complete
modules corpus with three warm corpus rounds per environment,
then apply the parity checker to the resulting JSON:

```powershell
. ./scripts/formal-env.ps1
python experiments/browser-lean/benchmark.py --suite curated --mode modules --group all --assets assets-native-eh-tail --label native-eh-tail-parity --corpus-rounds 3 --repeat 1 --timeout 900
python experiments/browser-lean/check-browser-parity.py .bridge-runtime/curated-formal/assets-native-eh-tail .bridge-runtime/curated-formal/chromium-native-eh-tail-parity-128.json
```

Use the exact generated result filename and asset directory for the chosen
variant. Reduced-worker preparation and the matching benchmark command are in
the [experiment README](../../experiments/browser-lean/README.md).

## Changes and validation delivered

- Complete reproducible source patches and isolated native-EH/tail-call builds.
- Correct compiler-status decoding, exception reporting and failed-worker disposal.
- Full-corpus same-worker repetition, source/provenance binding, fresh negative
  preflight and tampered-evidence rejection checks.
- Separate memory instrumentation, exact staged-byte accounting, worker-pool
  variants and staged-file release, with both passing and rejected experiments retained.
- Complete direct-root cost report and a native-checked narrow Abs rule prototype.
- Updated experiment/verifier READMEs, authoring guidance and student/educator
  guides. Studio's existing capability field remains the interface; no new
  UI control or schema field is needed for these experimental runtime changes.
- A fresh real native certificate still passes the trust validator; rehashed
  browser-environment and certificate-free results are rejected. The existing
  dlsym tests and five evidence-tampering checks pass. Unrelated app tests were
  not rerun.

Primary implementation references: [Emscripten exceptions](https://emscripten.org/docs/porting/exceptions.html),
[V8 WASM tail calls](https://v8.dev/blog/wasm-tail-call),
[WebKit Safari 18.2](https://webkit.org/blog/16301/webkit-features-in-safari-18-2/),
and the [Lean module system](https://lean-lang.org/doc/reference/latest/Source-Files-and-Modules/).

## Interpretation and user impact

The experiment tests whether native WASM exception handling and tail-call
codegen remove a JS `invoke_*` recursion failure. It does not alter the
mathematical rule registry, native environment pins, certificate schema, or
trust checks. A browser proof that passes, including a cold-only pass, remains
diagnostic and cannot grant learner credit.

Authors and users should continue to rely on the native verifier for formal
assessment. Browser assets may be shared across curated environments through
content-addressed packs, but runtime hashes, source/profile identities, worker
hashes, and warm-round evidence must remain distinct. Historical browser
measurements remain historical and are not evidence for this current parity
variant.
