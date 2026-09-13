# Browser Lean runtime sizing — 13 September 2026

**Outcome: the production-pinned source port builds, but the full curriculum is
not yet demonstrated as a viable browser verifier.** The unchanged-import closure
requires a 936.9 MB compressed payload. Its largest group timed out during import
initialization in both cold and cached Chromium runs, with 5.91 GB peak additional
private resident memory in the cold run. These results do not establish a smallest
working full-curriculum runtime, nor mobile readiness.

This update continues the [initial browser-local experiment](2026-09-13-browser-local-lean.md).
It changes only experimental tooling and documentation. The formal verifier,
certificate schema, trusted environment allowlist, grading policy, mathematical
coverage and curriculum remain unchanged. Experimental results have
`assessment_eligible: false` and `certificate: null`.

## Exact dependency inventory

The inventory renders the existing 122 positive acceptance requests through the
unchanged production normalizer and Lean generator, then follows the imports in
the pinned source headers. Nested comments, public/meta imports and `import all`
are handled; implicit `Init` is included. No module is unresolved.

| Existing fixtures | Transitive modules |
|---|---:|
| Guarded-cancellation family: 3 | 2,461 |
| Intermediate import group: 2 | 3,563 |
| Shared broad import group: 117 | 4,069 |

The union has 23 direct roots and 4,069 modules: 2,260 Mathlib, 695 Lean,
649 Init, 208 Std and 257 dependency modules. The complete sorted graph,
per-fixture roots, deduplicated closure groups and hashes are in
[the machine-readable inventory](../../experiments/browser-lean/results/production-corpus-closure.json).

This is the minimum transitive **module closure of the current generated
imports**, not a claim that every imported declaration is mathematically necessary.
Pruning unused generator imports or changing Lean's loader would need a separate
correctness audit. The installed native 64-bit artifacts total 3,248,171,864 bytes
when server/private parts and IR are included. That number is an inventory check,
not a browser download estimate or a measurement of WASM32 artifacts.

## Matched payload size

All 2,531 build jobs for the pinned Mathlib roots completed successfully with the
matched i386 compiler. Packaging the full unchanged-import closure produces
20,345 files in 283 compressed library chunks, plus two runtime objects:

| Artifact | Raw bytes |
|---|---:|
| Public `.olean` data | 599,206,640 |
| Private `.olean.private` data | 1,362,861,860 |
| Server `.olean.server` data | 44,435,536 |
| Interpreter `.ir` data | 227,805,436 |
| `.ir.sig` signatures | 569,660 |
| **Library total** | **2,234,879,132** |
| WASM runtime | 104,711,144 |
| JavaScript runtime | 146,538 |

Deterministic gzip level 9 yields **919,217,256 library bytes** and
**17,698,677 runtime bytes**, totaling **936,915,933 bytes** (936.9 MB / 893.5 MiB).
The required private/server parts are retained. Dropping them to reproduce the
older reference's smaller download would change the import semantics.
The [payload record](../../experiments/browser-lean/results/matched-payload-size.json)
contains runtime hashes and the generated manifest hash.

## Matched desktop results

The full 4,069-module group covers 117 of the existing 122 positive fixtures.
Chromium 140 loaded and verified every requested asset, but **both cold and
cached runs timed out during import initialization after 600 seconds**. Neither
run reached the first curriculum proof. A successful WASM instantiation is not
a ready verifier, and no warm proof latency can be reported for this group.

| Measurement | Cold | Cached, fresh worker |
|---|---:|---:|
| Runtime initialized, cumulative | 2.807 s | 2.629 s |
| Closure staged, cumulative | 27.544 s | 20.623 s |
| Import initialization | Exceeded 600 s | Exceeded 600 s |
| Ready to verify / warm verification | Unavailable | Unavailable |
| Additional private resident memory, peak | 5,912,387,584 B | 5,680,467,968 B |
| Additional private resident memory, failure-tail median | 5,472,051,200 B | 4,818,165,760 B |
| HTTP response body bytes | 943,036,706 | 6,120,773 |
| Verified cache payload | 936,915,933 B | 936,915,933 B |

The normal QuickMaths baseline was **129,871,872 private resident bytes**.
The experiment cache contained all 285 requested objects. Chromium reported
937,073,408 origin storage bytes including cache overhead; the entire benchmark
profile occupied 944,735,736 logical file bytes after both runs. The failure-tail
memory median is not a steady-state measurement of a working verifier. The worker
was terminated at the diagnostic deadline, and no final WASM heap measurement
was available from that busy worker.

As a diagnostic control, the same strict import header followed by `True.intro`
passed with the matched native i386 compiler: **23.64 seconds wall time**, exit 0,
no axioms, maximum RSS 2,455,532 KiB. This establishes that the compiled closure
is loadable; it does not establish browser correctness or a curriculum pass.
The native control briefly overlapped the cached browser diagnostic; the cold
browser run had no compiler build running. The [native control record](../../experiments/browser-lean/results/matched-native-import-control.json)
keeps this distinction explicit.

The smallest import group (2,461 modules, three fixtures) did complete its
`True.intro` import control with no axioms, but took **510.930 seconds for that
command** and **532.789 seconds from probe start to ready**. Its first curriculum
request, `guarded_cancellation.json`, then exceeded its unchanged **10-second**
budget. Diagnostics confirm that command reused the cached environment. A warm
environment therefore did not suffice for this first proof. Hot repeated-proof
latency remains unavailable because the timeout terminates the worker.

That subset run fetched 717,639,557 HTTP body bytes and retained **711,518,337
verified cache bytes in 221 objects**, selecting relevant chunks from the full
bundle rather than separately optimizing their boundaries. Its normal-app
baseline was 135,405,568 private resident bytes; additional memory peaked at
**4,165,107,712 bytes**, with a 3,902,570,496-byte failure-tail median. The last
diagnostic before the proof timeout reported a 1,488,453,632-byte WASM heap;
this is a last observation, not a measured heap peak. The browser profile held
714,040,736 logical file bytes.

**Aligned curriculum coverage: 0/122 successfully completed positive fixtures.**
The successful `True.intro` control is not one of those fixtures. The intermediate
two-fixture import group, aligned Firefox/WebKit runs and the 71 negative
acceptance requests were not executed after these failures. The earlier reference
matrix below is not evidence that the aligned build works on those engines.
The [matched browser evidence](../../experiments/browser-lean/results/matched-browser-evidence.json)
preserves failures and source-data hashes. The earlier harness omitted an outcome
record for an interrupted command; its diagnostics and timeout remain recorded.
The harness now retains interrupted proof names, source hashes and budgets too.

## Aligning the compiler

The browser compiler is built from production Lean base
`6a10ac8c22beadecabdbb0919c2b50214762f91d`; Mathlib is pinned to
`42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c`. The portability work derives from
the reference fork at `62b6a2291302d4bbeace37642a066b7510d0145c`, against its
upstream base `ecf55de08b9d855e749f80c491c6f294dd307e60`.

This remains a distinct patched compiler, not the official production binary.
The custom native build prints `4.34.0` with the correct full base commit; the
production toolchain label remains `leanprover/lean4:v4.34.0-rc2`. Its release
identity must not be silently substituted into a certificate.

The [reviewable source patch](../../experiments/browser-lean/lean-6a10-wasm.patch)
and build scripts record the changes. No `src/kernel` files are changed.
Notable fixes and deliberate boundaries:

- Preserve 64-bit name hashes across 32-bit pointer slots, including bootstrap
  sources. Without this, bootstrap aborted with `unknown parser category level`.
- Use an addressable 32-bit thread stack and correct boxed `UInt32` IO/EIO exit
  decoding. Printing a version was insufficient: the first build returned
  inconsistent exit statuses despite displaying valid output.
- Retain production's strict missing-artifact behavior and private import level
  for non-module generated requests. The reference's fallback to incomplete
  exported-only data is excluded from the matched build.
- Retain the production shell calling convention and accurate worktree Git
  identity. The vendored CMake Git helper initially read the common checkout's
  HEAD instead of the selected worktree's commit.
- Generate exports from the exact seven archives in the browser executable's
  link. Preserve runtime ABI, initializers, boxed interpreter wrappers and global
  data cells. Exclude unrelated Lake/Leanc executables and local symbols. Handle
  Emscripten's `__main_argc_argv` alias explicitly.
- Use Emscripten 4.0.22, a four-thread pool, shared memory, builtin big integers
  (`USE_GMP=OFF`), and the reference's compact export-binding mode. No forced use
  of the installed older GMP library is allowed.

Compact export bindings reduced generated JavaScript from approximately 46 MB
to 144 KB while preserving the compiler exports. This uses
`DECLARE_ASM_MODULE_EXPORTS=0` in a **classic worker's global scope**, without an
external minifier or function wrapper. The upstream setting warns that other
scoping/minification arrangements can break the bindings.

The build still reports five unavailable LibUV TCP/UDP entry points. They are not
implemented by this work and must not be described as supported browser IO.

## Smaller reference profile: measured results

These measurements use the older reference pins, **not** the matched full
curriculum. The explicit compatibility layer changes only two complete import
lines, checks both reference revision IDs and records each substitution.
The matched profile passes source through unchanged.

Repacking the exact reference-compatible algebra closure removes duplicate core
files and unrelated Real Analysis Game modules:

| Item | Bytes |
|---|---:|
| 3,169 modules, 9,507 files, unpacked library | 642,336,240 |
| 79 gzip library packs | 235,496,424 |
| Gzip JS and WASM | 17,352,327 |
| Total verified compressed payload | **252,848,751** |

This is approximately 33.7% below the previous 381,204,514-byte compressed
runtime-plus-layers inventory. Only three existing fixtures fit this older
profile; all three pass. The other **119 are explicitly unsupported**, not passed
or silently skipped as successes. The invalid control is rejected even though
the underlying IO call returns success: error diagnostics and `sorryAx` prevent
a successful experimental kernel result.

| Desktop engine | Ready, cold / cached new worker | Warm repeated proof, median cold / cached run | Peak additional private resident memory, cold / cached |
|---|---:|---:|---:|
| Chromium 140 | 27.4 / 15.2 s | 249 / 209 ms | 2.69 / 2.48 GB |
| Firefox 141 | 16.6 / 14.0 s | 686 / 540 ms | 3.48 / 3.11 GB |
| Desktop Playwright WebKit | 46.0 s / unavailable | 227 ms / unavailable | 5.44 GB / unavailable |

Chromium and Firefox retain 252,848,751 verified payload bytes in 81 Cache API
entries. Cold measured HTTP response bodies were 256,812,389 bytes including
experiment configuration and worker/glue overhead; the cached run transferred
3,963,638 bytes of that overhead. Cache payload bytes exclude browser metadata.
Browser profile directory sizes include unrelated baseline/browser files and
are recorded separately.

The tested WebKit automation build returned no usable Cache API entries after
writes. The loader records zero cached bytes and incomplete offline availability;
it does not claim success merely because `cache.put` resolved. Its successful
run used a 2 GiB initial WASM reservation. A 128 MiB trial timed out. These are
limitations of this measured desktop configuration, not physical Safari results.

The upstream slim binary is smaller but fails this same algebra profile with
`Maximum call stack size exceeded` during import warm-up. It is not a working
replacement for the full reference binary.

[Full per-run evidence and metrics](../../experiments/browser-lean/results/minimal-reference/metrics-table.md)
retain source JSON hashes, diagnostics, axiom audits, source hashes, unsupported
imports, cache state and separately labelled memory measurements.

## Measurement and trust boundaries

The baseline is the actual QuickMaths native curriculum mastery map with a fresh
profile. It stays open while the probe runs. A sampler totals USS (private resident
pages) across only the launched browser's descendant processes, then subtracts
the baseline. RSS, Windows private commit and WASM buffer length are different
quantities and are recorded separately. Sampling is at least every 0.5 seconds;
shorter peaks can be missed.

Downloads use a local loopback server without network throttling. Cold means a
fresh browser profile and empty experiment cache; a cached run creates a new
worker with the same verified Cache API payloads. These are engineering timings,
not mobile-network download predictions. Concurrent WSL compilation may affect
the reference latency measurements. Full JSON data avoids hiding that limitation.
Cached payload completeness is not a complete offline application guarantee:
the experimental HTML, worker and manifest are still fetched separately.

The asset loader hashes compressed chunks before decompressing them, checks
decoded sizes and entry bounds, and transfers bounded packs into the worker.
The source release archive and its individual library objects are pinned before
repacking. Later loader checks also execute the exact hash-checked JavaScript
from a blob in the classic worker and pthreads, and require confirmation that
the verified WASM buffer was consumed. They do not refetch executable JS after
checking a different copy. CSP permits these verified blobs and WASM compilation,
without general JavaScript `unsafe-eval`.

Import warm-up is timed separately as runtime initialization. Matched-profile
diagnostics allow up to ten minutes for an import group to expose real capacity
limits; this is not a production policy change. Actual corpus proof commands
retain each normalized request's `policy.max_seconds`. Timeouts terminate the
worker. Experimental results never enter the production mastery/certificate path.

## Devices and hosting

No physical Android or iPhone is exposed to this session. The connected-device
inventory showed no Android/ADB or iPhone device, and no device bridge tool was
available. Android Chrome and iPhone Safari measurements therefore remain
**unperformed**. Desktop WebKit and mobile user-agent emulation are not substitutes.

The runtime still requires shared memory and cross-origin isolation. This update
uses real COOP/COEP headers on the isolated local probe; the normal baseline app
has neither header. The prior investigation contains the scoped service-worker
isolation experiment relevant to GitHub Pages. No new Pages production deployment
or physical-device validation is claimed here. A non-threaded build is not a
simple flag change: the reference documents an undrained import work queue in
that configuration.
The four-pthread setting is a prewarmed pool, not a hard limit of four threads:
the reference host calls Lean's default task-manager initializer, which consults
hardware concurrency. A deliberately bounded task-worker count is a further
measurement variable, not an optimization demonstrated by these runs.
The aligned Chromium trials start with 128 MiB of shared WASM memory and permit
growth to 4 GiB. The inherited iOS detection caps the maximum at 2 GiB. These
configured limits are not measured device capacity or proof of Safari viability.

The compressed matched payload alone is close to GitHub Pages' published
**1 GB site limit**, before the normal app, manifests and other site files.
Uploading the preparation folder wholesale would also include duplicate raw
runtime binaries; those are local build artifacts, not required downloads.
No large runtime assets are committed or deployed by this update.
[GitHub's published limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
also list a 100 GB/month soft bandwidth allowance. Hosting capacity is therefore
a separate constraint even if import initialization is fixed.

## Changes in this update

- Exact corpus closure extraction, grouped inventory and source/archive provenance.
- Smaller reference packs and deliberate old-pin compatibility adapter.
- Production-base Lean port, native i386/WASM build and pinned dependency helpers,
  export manifest generation and strict artifact packaging.
- Browser initialization, cache, proof and private-memory measurement harness;
  full/slim/matched profiles and explicit unavailable/failure states.
- Focused adapter, export and unchanged certificate-gate regressions.
- Reproducible evidence, this Markdown update report and developer guide links.

Focused validation passed for import-adapter boundaries, source-header inventory
parsing, export-symbol selection and the unchanged certificate gate (including a
real native certificate positive control). Python/JavaScript syntax checks passed.
The compiler/Mathlib builds and browser runs above are reported separately from
those tooling regressions; a tooling test pass is not a browser curriculum pass.

No authoring syntax, Studio capability, lesson, grading mode or mathematical
coverage is added or advertised by this investigation.

## Remaining work before a production decision

The immediate bottleneck is strict import initialization, not network download
alone. Two bounded follow-ups are worth evaluating before changing architecture:

1. Trace import/extension loading and reduce duplicate filesystem/heap residency.
   The current host eagerly stages the complete selected closure in MEMFS.
2. Evaluate the reference's precomputed header-snapshot path using the **exact
   same WASM binary** that will load it. A native i386 snapshot is not a safe
   substitute: serialized function-table identities differ. Measure snapshot
   generation, peak memory, compressed size and all existing positive/negative
   acceptance cases before treating this as a successful optimization.

A separate audit could narrow the production generator's broad common imports
without changing mathematical coverage. The inventory here intentionally retains
them, so its minimum is a module-closure minimum, not a globally optimal proof
runtime. None of these possible optimizations is counted as completed or used to
justify production certificates. Physical Android/iPhone testing remains required
once a working candidate is available.

## Primary references

- [Pinned browser reference](https://github.com/cauli/lean4-wasm-in-browser/tree/017c835ecf0ac8c74745a867c65faeac0baf6654)
- [Pinned Lean browser fork](https://github.com/cauli/lean4/tree/62b6a2291302d4bbeace37642a066b7510d0145c)
- [Production Lean base](https://github.com/leanprover/lean4/tree/6a10ac8c22beadecabdbb0919c2b50214762f91d)
- [Production Mathlib](https://github.com/leanprover-community/mathlib4/tree/42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c)
- [Emscripten pthread requirements](https://emscripten.org/docs/porting/pthreads.html)
- [Pinned Emscripten export-binding setting](https://github.com/emscripten-core/emscripten/blob/4.0.22/src/settings.js)
