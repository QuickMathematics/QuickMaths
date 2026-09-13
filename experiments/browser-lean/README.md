# Browser-local Lean experiment

## Temporary phone test

Open <https://quickmathematics.github.io/QuickMaths/experiments/browser-lean/>
in Android Chrome. This isolated route hosts the production-pinned parity
candidate, not the older reference runtime described below. Choose **All five**
and **Download and run**, then **Export results**. It never issues certificates.
See `docs/releases/2026-09-13-browser-lean-phone-deployment.md` for download sizes,
test interpretation, and deployment lifecycle.

This is an isolated feasibility harness, **not a production verifier**. It loads
real hash-pinned cauli Lean WASM and compiled Mathlib artifacts into a persistent
worker. No hosted verification service is involved. It cannot award mastery or
issue certificates: the reference's Lean and Mathlib revisions differ from the
QuickMaths production pins.

## Reproduce on this Windows checkout

Keep runtime, downloads and browser profiles on X:. Use the existing formal
environment and install `playwright` and `psutil` there if absent. Browser engine
executables may be read from the already installed Playwright cache; the runner
does not install browsers or write profiles there.

```powershell
. ./scripts/formal-env.ps1
python experiments/browser-lean/prepare.py --download
python experiments/browser-lean/run.py --plain --shim
python experiments/browser-lean/run.py --browser firefox --plain --shim
python experiments/browser-lean/run.py --browser webkit --plain --shim
```

Preparation initially downloads about 1.37 GB of pinned archives, verifies their
SHA-256 values, and extracts only the selected runtime/core/Real Analysis packs.
This setup download is not the browser payload. `prepare.py` without `--download`
reuses extracted files. `provenance.json` records the exact upstream revision,
archive hashes, runtime hashes and LF-normalized worker hash. Worker source is
Apache-2.0; see `UPSTREAM-LICENSE`. The only upstream-worker modification records
the WASM memory buffer's logical size for diagnostics.

Useful variants:

- No flags: real HTTP isolation headers.
- `--plain --core-only`: expected failure without isolation.
- `--plain --shim --core-only`: scoped service-worker isolation and Init proof.
- `--plain --shim --csp --core-only`: restrictive CSP, with `wasm-unsafe-eval`
  but without general JS `unsafe-eval`.
- `--plain --shim --cached`: load once, then measure a reload with HTTP cache.

Results and all heavy assets stay in ignored `.bridge-runtime/lean-browser/`.
The server binds loopback only. Never register this experiment's service worker
at the QuickMaths application root: it must not replace the app's offline worker.
The shim is a minimal experiment, not a production cache/update implementation.

## Scope and interpretation

The harness uses normalized production requests and the unchanged Python Lean
generator. It tries the original output first, then explicitly substitutes two
imports for the older browser Mathlib. Goals, hypotheses and tactic bodies are
unchanged. Successful experimental audits require exactly one result audit,
no error diagnostics, and only the existing allowed axioms. An IO-success return
alone is insufficient: the invalid control returns IO success while emitting an
error and `sorryAx`.

Cold import investigations allow up to five minutes per command, whereas warm
checks allow 30 seconds. These are diagnostic budgets, not changes to production
request policies. Results never become certificates, including when they finish
within a request's own budget. A production implementation must enforce each
request's `policy.max_seconds`, bind responses to request/source/environment,
and port the existing normalization/preflight/generation without opening a raw
Lean-code submission interface.

`test-contract.mjs` uses a fresh native certificate stored in the ignored
`native-certificate.json` as a positive control. It confirms the existing
certificate gate rejects a rehashed browser-environment substitution and a
missing certificate. That test requires native Lean; the browser measurements
do not. No production source or certificate contract is changed by this work.

For measurements, limitations, missing imports, deployment considerations and
the remaining work, see [the investigation report](../../docs/releases/2026-09-13-browser-local-lean.md).

## Production-viability follow-up

The browser path remains an engineering experiment, not a production verifier.
The old-pin reference supports only 3/122 fixtures; do not confuse its compact
[benchmark metrics](results/minimal-reference/metrics-table.md) with the aligned
build. The [sizing report](../../docs/releases/2026-09-13-browser-lean-runtime-sizing.md)
records the aligned build results and limitations, and the
[production closure inventory](results/production-corpus-closure.json) covers all 122 fixtures.

The reproducible closure and viability flow is:

```powershell
python experiments/browser-lean/corpus-closure.py --compact --output .bridge-runtime/lean-browser-next/corpus-closure-compact.json
python experiments/browser-lean/reference-sources.py
python experiments/browser-lean/library-provenance.py
python experiments/browser-lean/reference-minimal.py
python experiments/browser-lean/prepare-viability.py --variant full
python experiments/browser-lean/benchmark.py --browser chromium --initial-mb 128 --assets assets --label minimal-reference
# Optional negative trial of the smaller upstream binary:
python experiments/browser-lean/prepare-viability.py --variant slim
python experiments/browser-lean/benchmark.py --browser chromium --initial-mb 128 --assets assets --label minimal-slim --repeat 1
```

`reference-core.tar` must be made from the pinned cauli checkout, preserving
the exact core source boundary:

```bash
git archive 62b6a2291302d4bbeace37642a066b7510d0145c \
  src/Init src/Init.lean src/Lean src/Lean.lean src/Std src/Std.lean \
  -o /mnt/x/QuickMaths/.bridge-runtime/lean-browser-next/reference-core.tar
```

Keep generated archives, extracted packs and profiles in the ignored X:
workspace folder; the matching-build helpers use the F-backed
`/home/devcontainers/quickmaths-browser-build` workspace. The concise matching
build sequence is `build-matched.sh` for the pinned Lean/WASM build,
`build-native32.sh` for the native 32-bit validation, and `build-mathlib.py`
for the matching Mathlib build. The aligned Lean WASM, native32 compiler and all
2,531 Mathlib build jobs completed. The full 4,069-module payload is 936,915,933
compressed bytes including the runtime. A successful build is not a browser
full-corpus pass.

For a clean matching build, check out Lean at `6a10ac8c22beadecabdbb0919c2b50214762f91d`
into `lean-upstream`, apply `lean-6a10-wasm.patch`, and check out Mathlib at
`42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c` into `mathlib`. Install Emscripten
4.0.22 under `emsdk` and CMake 3.31.6 under `cmake-3.31.6-linux-x86_64`.
The Ubuntu build needs multilib C/C++, i386 libuv/OpenSSL development packages,
Python and Git. GMP stays disabled. From that build root:

```bash
scripts=/mnt/x/QuickMaths/experiments/browser-lean
bash "$scripts/build-matched.sh" "$PWD" stage0
bash "$scripts/build-native32.sh" "$PWD"
python3 "$scripts/prepare-matched-deps.py" "$PWD/mathlib"
python3 "$scripts/build-mathlib.py" "$PWD" "$scripts/results/production-corpus-closure.json"
bash "$scripts/build-matched.sh" "$PWD" stage1
python3 "$scripts/build-provenance.py" "$PWD"
python3 "$scripts/prepare-matched.py" "$PWD" --scope full
```

`prepare-matched.py` also needs the normalized fixture manifest produced by the
reference preparation above. It retains the production-generated sources and
request budgets. It rebuilds the pack manifest and hashes from the matched
32-bit artifacts; no native 64-bit binary cache is reused. `port-bootstrap.py`,
`port-uint32.py` and `strict-imports.py` document intermediate repair steps already
included in the final patch; do not apply those transformations twice.

Run each recorded import group in a fresh worker. For example, in the Windows
formal Python environment:

```powershell
python experiments/browser-lean/benchmark.py --browser chromium --assets assets-matched-full --group closure-fe493671a4bbacd7 --label matched-broad --initial-mb 128 --repeat 2 --timeout 900
```

The other groups are `closure-9311bf99cb80d8c7` (3 fixtures) and
`closure-b7248ed5a4a76779` (2 fixtures). Group selection skips unrelated packs
and files without changing any fixture's imports. Keep result labels distinct.

The matched environment accepts the original generated source unchanged and
does not issue certificates. `compatibility.js` contains only the two scoped
old-import aliases needed by the old browser Mathlib layer. Emscripten's
`DECLARE_ASM_MODULE_EXPORTS=0` build requires classic-worker global scope and
no external minifier. The runtime uses a host worker and a four-pthread pool,
with cross-origin isolation (COI).

The release-sizing follow-up is recorded in
[browser Lean runtime sizing](../../docs/releases/2026-09-13-browser-lean-runtime-sizing.md).

## Curated public environments

The current generator emits `module` and capability-scoped `public import`
headers. The older reference/private measurements above belong to commit
`08bdeee0e28f68e81f4441c6a6b850f95cdd6ac3`; use that checkout to reproduce their
original generated sources. Do not compare an old source header against new
artifacts or overwrite the historical evidence.

For the curated JS-EH build, apply **`lean-6a10-curated-full.patch` instead of the old
patches** to the pinned clean Lean source, then follow the matching 32-bit build
steps above. It includes the module-aware environment cache and strict explicit
artifact map. `port-curated.py` and `port-artifact-map.py` document incremental
transformations already in that patch, not additional clean-build steps.
`port-environment-snapshot.py` similarly documents the versioned environment-only
snapshot API, which avoids retaining CLI command/task trees.
`exports.py` now includes runtime/meta initializer phases, which public modules
need. No kernel source or certificate schema is changed.

Reproducibility correction: `lean-6a10-curated.patch` captured only unstaged
changes on top of an already-staged port. It is retained as historical evidence,
but is not a clean-checkout patch. The full patch records staged and unstaged
changes from the pinned HEAD, with binary/full-index bootstrap patches. The
native-EH variant uses the separately recorded full `lean-6a10-native-eh.patch`.

`prepare-curated.py` requires the build's source diff to match the reviewed
patch exactly. It applies `optimize-dlsym.py` to the generated JavaScript:
ordinary symbol lookups no longer enumerate the entire export table. The
slow path still records the original symbol index when installing a new
function-table entry. `test-dlsym.py` checks equivalence against the original
pinned hook, including late-added exports and initializer lookup.

In the Windows formal Python environment:

```powershell
python experiments/browser-lean/curated-corpus.py
```

In the F-backed Linux build environment:

```bash
scripts=/mnt/x/QuickMaths/experiments/browser-lean
bash "$scripts/install-snapshot-node.sh" "$PWD"
python3 "$scripts/prepare-curated.py" "$PWD"
python3 "$scripts/prepare-curated.py" "$PWD" --snapshots
```

The build emits five source-versioned environments below the ignored
`.bridge-runtime/curated-formal/` directory. Module packs group files by shared
environment membership and use content hashes, so moving to another environment
downloads only missing packs. Explicit Lake-style artifact maps select public
oleans and required IR; Lean's missing-part checks remain strict. Snapshot
provenance binds its header, setup map, driver, WASM and JavaScript hashes.
The final builder also includes the selected artifact bytes/layout in the
snapshot cache key. Earlier measured cache entries lack that key and are
deliberately rebuilt once; their original measurement identities are retained.
Snapshots are generated by that exact WASM binary through Node, never by the
native i386 compiler. A failed snapshot is recorded as unavailable and retried
on the next requested build.

The `qm-environment-v1` snapshot contains only an imported environment and its
regular initializer indices. It does not contain a question, learner proof,
certificate, or CLI command/task tree. The build driver uses Node 24.21.0 with
an 8 MiB JavaScript stack; browser measurements use normal browser stack limits.
Compressed snapshot bytes are verified before streaming into the worker and
decompressing into its filesystem. The temporary file is released after restore;
the restored region lives until worker disposal.

```powershell
python experiments/browser-lean/benchmark.py --suite curated --mode modules --group all --label curated-validated-modules --repeat 1 --timeout 900
python experiments/browser-lean/benchmark.py --suite curated --mode snapshot --group all --label curated-validated-snapshots --repeat 2 --timeout 900
python experiments/browser-lean/summarize-curated.py
```

`all` traverses environments in one browser context, retaining the shared cache
and discarding workers between runs. Results distinguish cold, cached-new-worker,
and new-environment/shared-cache runs. Source hashes and original proof budgets
are retained. Each environment reports the entire corpus: canonical-header cases
go to its kernel, other cases explicitly require their own environment, and
negative requests retain their separately executed production-preflight evidence.
Those route/preflight outcomes are **not** kernel passes. Initialization failures
mark remaining kernel cases blocked, never passed. False and `sorry` kernel
controls accompany environments that initialize. All browser results remain
ineligible for assessment with null certificates.

A JavaScript/WASM trap terminates that worker before the next corpus case.
Import and rejection controls run again in each replacement worker. Earlier
diagnostics that reused a trapped worker are excluded from the retained final
evidence. The report records the first ready time separately from subsequent
worker recreations. Localhost delivery timings are not internet download times.

## Native-WASM exception and tail-call parity

The unchanged 122-source corpus now passes Chromium with native WASM exception
handling and tail-call code generation. The original passing harness and its
three-round evidence are preserved in commit `aba0d2a`. This is corpus
conformance, not universal semantic equivalence or assessment approval.
The 71 invalid requests are freshly rejected by the existing native preflight;
they produce no Lean source and are not counted as browser kernel executions.
Every browser environment also runs false-proof and `sorry` kernel controls.

From the F-backed build workspace:

```bash
scripts=/mnt/x/QuickMaths/experiments/browser-lean
bash "$scripts/build-native-eh.sh" "$PWD" eh-tail
python3 "$scripts/prepare-runtime-variant.py" "$PWD" \
  --name native-eh-tail --source lean-upstream-eh-tail \
  --runtime build-matched32-eh-tail --patch lean-6a10-native-eh-tail.patch
```

From X:\QuickMaths in the formal Python environment:

```powershell
. ./scripts/formal-env.ps1
python experiments/browser-lean/benchmark.py --suite curated --mode modules --group all --assets assets-native-eh-tail --label native-eh-tail-parity --corpus-rounds 3 --repeat 1 --timeout 900
python experiments/browser-lean/check-browser-parity.py .bridge-runtime/curated-formal/assets-native-eh-tail .bridge-runtime/curated-formal/chromium-native-eh-tail-parity-128.json
```

`--repeat` creates new workers; `--corpus-rounds` repeats every canonical proof
inside the same worker. Five additional warm proofs use the slowest successful
fixture. The gate checks original source hashes, actual compiler exit codes,
axioms, fresh production preflight, complete rounds, host-source stability and
null certificates. Diagnostic fixture runs cannot pass it.

## Memory attribution and staged-file lifetime experiment

Keep the passing worker immutable. `prepare-memory-profile.py` creates a
separate instrumented directory, sharing identical content-addressed runtime
and module files. `--memory-profile` records logical MEMFS bytes and linear
WASM capacity, with 2.5-second idle holds for external private-page sampling.
Capacity is not live allocator usage; process USS is recorded independently.

`prepare-pool-variant.py` records an exact post-link JavaScript change to the
prestarted pthread pool. The Lean task-manager setting stays at two. A zero
pool failed guarded IVT cases and must not be selected as a verified environment.
`--release-staged all` unlinks staged module files only after the canonical
header has imported successfully; it leaves verified persistent cache entries
and the imported environment intact. JavaScript collection need not happen
immediately. Any new header requires a new worker and full staging.

```powershell
python experiments/browser-lean/prepare-pool-variant.py .bridge-runtime/curated-formal/assets-native-eh-tail .bridge-runtime/curated-formal/assets-native-eh-tail-pool2 --size 2
python experiments/browser-lean/prepare-memory-profile.py .bridge-runtime/curated-formal/assets-native-eh-tail-pool2 .bridge-runtime/curated-formal/assets-native-eh-tail-pool2-release --release-staged
python experiments/browser-lean/benchmark.py --suite curated --assets assets-native-eh-tail-pool2-release --mode modules --group all --corpus-rounds 3 --memory-profile --release-staged all --label pool2-release-parity --repeat 1 --timeout 900
python experiments/browser-lean/check-browser-parity.py .bridge-runtime/curated-formal/assets-native-eh-tail-pool2-release .bridge-runtime/curated-formal/chromium-pool2-release-parity-128.json
python experiments/browser-lean/import-costs.py
```

See the [update report](../../docs/releases/2026-09-13-browser-lean-parity.md),
[per-import costs](../../docs/releases/2026-09-13-formal-import-costs.md) and
[narrow rule-library experiment](../../docs/releases/2026-09-13-formal-rule-library.md).
Shared module packs remain the baseline. No browser experiment can issue a
certificate, and these results do not establish physical Android/iPhone or
GitHub Pages deployment compatibility.
