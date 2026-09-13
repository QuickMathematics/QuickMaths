# Browser-local Lean experiment

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
