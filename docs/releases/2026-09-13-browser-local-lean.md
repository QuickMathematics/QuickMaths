# Browser-local Lean: implementation and measured feasibility

Date: 13 September 2026. This update adds an isolated, reproducible browser
experiment. It does not change production verification, certificate acceptance,
mastery storage, the Studio, or the app's offline service worker.

## Decision

**Browser-local verification is technically viable for the demonstrated
QuickMaths algebra proof path. A mandatory local companion or hosted verifier
is not justified by a supposed inability to run Lean in a browser.**

The actual QuickMaths guarded-cancellation and difference-quotient proofs passed
the reference Lean kernel in Chromium, Firefox and desktop WebKit. Their theorem
bodies and hypotheses were unchanged; two import substitutions accommodated the
older Mathlib distribution. A service-worker isolation shim worked on a local
server that supplied no COOP/COEP headers.

This is not yet a production-ready mobile verifier. The reference revisions do
not match our certificate pins, its distributed Mathlib closure misses ten of our
direct imports, and this broad bundle consumes substantial memory. The next work
should be a matching, smaller browser artifact build and physical-phone testing,
not a redesign around mandatory remote verification.

## Exact environment and prototype

Primary reference: [cauli/lean4-wasm-in-browser](https://github.com/cauli/lean4-wasm-in-browser),
checked out at `017c835ecf0ac8c74745a867c65faeac0baf6654`.

| Component | Browser reference | QuickMaths production |
|---|---|---|
| Lean | fork `62b6a2291302d4bbeace37642a066b7510d0145c`, based on upstream `ecf55de08b9d855e749f80c491c6f294dd307e60` | `leanprover/lean4:v4.34.0-rc2`, commit `6a10ac8c22beadecabdbb0919c2b50214762f91d` |
| Mathlib | `de3a9cf33016bbb6d15880d7680643f7ca2d25ba` | `42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c` |
| Emscripten | 4.0.22 | native toolchain |

The [experiment](../../experiments/browser-lean/README.md) verifies pinned release
archive/runtime hashes, stages compiled `.olean`, `.ir` and `.ir.sig` files in
the worker filesystem, and calls the reference's `_lean_wasm_compile` export.
Production `normalize_request` and `render_request` generate its fixture sources.
It attempts those exact sources before the explicitly labelled import adapter.
There is no network proof execution and no arbitrary learner-code interface.

The successful adapter changes only:

```text
Mathlib.Basic.Real.Basic  → Mathlib.Data.Real.Basic
Mathlib.Tactic.Positivity → Mathlib.Tactic.Positivity.Basic
```

This establishes compatibility for those two proofs, not equivalence of entire
Mathlib releases. The conjugate identity still fails because the packaged
`Mathlib.Analysis.SpecialFunctions.Sqrt` module is absent. The generated
polynomial-derivative path also needs absent modules, beginning with
`Mathlib.Analysis.Calculus.Deriv.Abs`.

## Modules and closure

The 122 positive native fixtures produce these 23 direct roots:

```text
Mathlib.Basic.Real.Basic
Mathlib.Topology.Defs.Filter
Mathlib.Tactic.FieldSimp
Mathlib.Tactic.Ring
Mathlib.Tactic.Linarith
Mathlib.Tactic.NormNum
Mathlib.Tactic.Positivity
Mathlib.Analysis.Calculus.Deriv.Abs
Mathlib.Analysis.SpecialFunctions.ExpDeriv
Mathlib.Analysis.SpecialFunctions.Log.Deriv
Mathlib.Analysis.SpecialFunctions.Sqrt
Mathlib.Analysis.SpecialFunctions.Pow.Real
Mathlib.Analysis.SpecialFunctions.Trigonometric.Deriv
Mathlib.Analysis.SpecificLimits.Normed
Mathlib.Analysis.PSeries
Mathlib.Analysis.Polynomial.Basic
Mathlib.Topology.Order.IntermediateValue
Mathlib.Tactic.FunProp
Mathlib.Tactic.Convert
Mathlib.Tactic.GCongr
Mathlib.Tactic.FinCases
Mathlib.Tactic.Continuity
Mathlib.Tactic.NormNum.RealSqrt
```

Cancellation uses the first seven. The other generated analysis cases currently
use a broad common import set; narrowing that set by actual tactic/theorem use
is a concrete optimization opportunity, subject to kernel regression checks.

The [complete sorted native module inventories](../../experiments/browser-lean/results/native-closures.json)
include implicit `Init` and resolve every source module against the pinned
packages/toolchain. Comments are stripped before ordinary/public/meta imports
(including `import all`) are traversed. [The closure script](../../experiments/browser-lean/closure.py)
reproduces the inventory.

| Current native closure | Modules | `.olean` bytes | `.ir` bytes | `.ir.sig` bytes |
|---|---:|---:|---:|---:|
| Cancellation | 2,461 | 469,906,184 | 304,187,792 | 433,136 |
| All positive fixtures | 4,069 | 868,058,368 | 360,863,008 | 716,144 |

These are exact source dependency inventories for the installed **native**
revision, not portable WASM artifacts or a browser-size estimate. The matching
WASM32 compiler/library build is still required; copying the native 64-bit
`.olean` files is invalid. Exact compressed bytes for that future matched build
cannot be claimed before it exists.

The extracted reference Real Analysis closure contains 4,303 modules. It includes
all 629 modules in the separately packaged core layer: loading both stages
transfers 4,932 module entries, **not 4,932 unique modules**. The reference
manifest gives the exact packaged files, but not an import-edge graph that would
justify treating every module as necessary for our two demonstrated proofs.

Thirteen direct roots are available; these ten are absent:

```text
Mathlib.Basic.Real.Basic
Mathlib.Tactic.Positivity
Mathlib.Analysis.Calculus.Deriv.Abs
Mathlib.Analysis.PSeries
Mathlib.Analysis.Polynomial.Basic
Mathlib.Analysis.SpecialFunctions.ExpDeriv
Mathlib.Analysis.SpecialFunctions.Log.Deriv
Mathlib.Analysis.SpecialFunctions.Sqrt
Mathlib.Analysis.SpecialFunctions.Trigonometric.Deriv
Mathlib.Tactic.NormNum.RealSqrt
```

## Download sizes

Measured from the verified release files, in bytes. Gzip figures for JS/WASM
were computed locally with gzip level 9; they are not assumed CDN behavior.

| Asset | Raw/unpacked bytes | Compressed bytes |
|---|---:|---:|
| Full `lean.js` | 148,402 | 38,385 gzip |
| Full `lean.wasm` | 100,838,905 | 17,313,942 gzip |
| Core packs | 79,760,876 | 32,184,975 packaged gzip |
| Real Analysis packs | 849,175,216 | 331,667,212 packaged gzip |
| Slim `lean.js` | 3,430,113 | 338,894 gzip |
| Slim `lean.wasm` | 70,444,966 | 13,734,980 gzip |

The measured two-stage full-runtime payload is **464,839,494 bytes** before
small manifests/harness files, because the local server serves JS/WASM raw.
With explicit gzip delivery for those two runtime files, the same content would
be **381,204,514 bytes (363.5 MiB)**. This is a calculated transfer size, not a
measurement of compression on GitHub Pages.

The core layer duplicates files already in the Real Analysis layer. A repackaged
single delivery could remove that 32.2 MB compressed duplication, reducing this
broad distribution to about **349.0 MB** including gzipped runtime files.
Further pruning requires a dependency/export closure build, not simply deleting
files until a single example happens to pass.

The 1.083 GB static archive downloaded during setup includes unrelated Manifold
worlds. It is not a necessary QuickMaths website payload. Snapshots were not
used: Init already initialized quickly in these tests, and the reference's
241 MB Init snapshot would add another substantial asset.

## Actual desktop measurements

Fresh browser contexts, loopback HTTP, installed Playwright engines on Windows.
The server itself supplied **no isolation headers**; the scoped service worker
enabled isolation after its initial registration/reload. Times below start from
the controlled navigation. They exclude setup-archive download and do not model
WAN bandwidth. These are bounded feasibility samples, not a statistical benchmark.

| Measurement | Chromium 140 | Firefox | Desktop WebKit |
|---|---:|---:|---:|
| Runtime downloaded, verified and initialized, cumulative | 2.64 s | 3.87 s | 47.19 s |
| Core pack staging | 0.71 s | 0.73 s | 0.61 s |
| First Init proof | 0.56 s | 0.81 s | 0.46 s |
| Real Analysis pack staging | 7.34 s | 7.23 s | 5.86 s |
| First adapted cancellation compile/import | 2.20 s | 6.11 s | 2.14 s |
| Three warm cancellation checks | 192 / 124 / 125 ms | 590 / 523 / 523 ms | 264 / 218 / 233 ms |
| Warm difference-quotient check | 139 ms | 625 ms | 269 ms |

Chromium reached the first Mathlib proof at about 13.6 seconds from controlled
navigation. A same-context cached reload still took about 13.5 seconds to that
proof: HTTP caching does not retain the worker's imported Lean environment
across navigation. Keeping a worker alive during normal app navigation matters.
WebKit's runtime initialization varied between about 27 and 47 seconds in the
core/full runs, so its cold-load result should not be generalized from one sample.

At an ideal 25 Mbit/s, the calculated 381 MB compressed payload alone takes
about 122 seconds to transfer; at 100 Mbit/s, about 30 seconds. Those are simple
bandwidth calculations, not phone measurements. The localhost timings must not
be presented as first-visit internet latency.

The shared WASM memory buffer reached **2,551,775,232 bytes (2.38 GiB)** on all
three engines. This is logical linear-memory capacity, not resident RAM. The
sampled browser process-tree RSS peaked around 5.01 GB in Chromium's cached run,
5.69 GB in Firefox and 9.58 GB in WebKit. Summing RSS across processes can count
shared pages repeatedly; private committed totals are also recorded separately.
These observations establish a serious memory concern, not an exact minimum RAM
requirement. The first Chromium sampler missed its `headless_shell` executable;
that result is explicitly unavailable and the corrected cached-run sample is used.

Raw [measurement JSON](../../experiments/browser-lean/results/) includes diagnostics,
source hashes, timings, axiom audits and memory methodology. False-proof controls
were rejected on every engine. Desktop WebKit is **not** a physical iPhone test.
Android Chrome, iOS Safari, low-memory devices, background suspension, storage
eviction and long-running repeated-proof memory behavior remain unmeasured.

## Workers, headers, CSP and GitHub Pages

The actual runtime has one persistent host Web Worker and an Emscripten pool of
four pthread workers. Its shared `WebAssembly.Memory` requires a secure context,
`SharedArrayBuffer` and cross-origin isolation. Real headers are normally
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`; worker script responses need the
compatible policy too. Cross-origin assets must satisfy CORS/CORP deliberately.
[Emscripten documents these requirements](https://emscripten.org/docs/porting/pthreads.html).

The plain local-server control failed before runtime execution, as expected.
The same headerless server with our experiment-scoped service worker ran the
actual Mathlib proof on all three desktop engines. This tests the mechanism used
by [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker), which targets
hosts such as GitHub Pages. It does **not** constitute a deployed Pages test.

GitHub Pages is therefore a plausible static host with a scoped isolation shim;
missing configurable headers are not an automatic dead end. A viable candidate
would use a dedicated same-origin verifier page under its own service-worker
scope, retaining the existing app worker. The worker is owned by that isolated
page. Any opener/iframe messaging design must then be tested with COOP, origin
checks, fresh request nonces and source binding; our prototype does not establish
that an iframe embedded in today's nonisolated app can simply use shared memory.

The selected 465 MB raw-runtime/packed-library set fits below the current
[GitHub Pages 1 GB published-site limit](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
before adding the rest of the site. The complete upstream static archive does
not. Pages also has a soft 100 GB/month bandwidth limit, so a several-hundred-MB
first download has practical consequences. Prefer a build/deployment artifact
over committing runtime binaries into the source repository. External asset
hosting, if later useful, is distinct from hosted **verification**.

A Chromium core run and both adapted Mathlib proofs also passed with `script-src 'self' 'wasm-unsafe-eval'`,
`worker-src 'self' blob:` and `connect-src 'self'`, without general JS
`unsafe-eval`. The current app CSP must not be weakened globally by assumption.
Only the tested proof paths are established under this CSP; the generated glue has
dynamic-linking eval paths, so the full production closure needs its own CSP test.

## Slim and genuinely nonthreaded builds

Slim is a smaller export/library variant, **not a nonthreaded runtime**. The
reference uses it for Init-oriented iOS paths and disallows its heavy course
layers. Its smaller binary does not prove our Mathlib closure fits on a phone.

The pinned [Lean fork build configuration](https://github.com/cauli/lean4/blob/62b6a2291302d4bbeace37642a066b7510d0145c/src/CMakeLists.txt)
explains a substantive blocker: asynchronous constant realization accumulated
work during single-threaded Init imports, and promises require a functioning
task manager. The Emscripten build uses `-pthread`; the default Lean multithread
runtime is enabled and the linked worker pool is four. Merely setting the pool
to zero or changing `shared: true` to false does not create a working fallback.

A genuine alternative requires a sequential task/promise scheduler or equivalent
correct eager realization, then a separate non-pthread build, unshared memory,
matching WASM32 library artifacts and kernel regression coverage. That is runtime
engineering, not a loader toggle. No new single-thread binary was built in this
investigation. Since the header shim already works on desktop, memory/closure
reduction and matching pins are more immediate than removing threads solely for
Pages hosting.

## Trust and certificate contract

Production files and pins remain untouched. Every experimental result has
`assessment_eligible: false` and `certificate: null`.

The reference returns an IO-success tag even when Lean reports an elaboration
error. Our false theorem returned that tag, emitted an error and depended on
`sorryAx`. The adapter therefore checks diagnostics and exactly one axiom audit;
it never equates the runtime's success flag with proof success. The reference
also reports a private generated declaration name; the diagnostic parser
recognizes that exact namespace pattern, while production's parser is unchanged.

A fresh native certificate was accepted by the unchanged production gate.
Replacing its environment with the reference browser pins and recomputing its
digest was rejected. A missing certificate was rejected too. Browser results
must never claim the native pins just to pass this gate.

A production browser implementation must retain trusted normalization/preflight,
the allowlisted generator, exact request/goal/submission/source/mode binding,
allowed-axiom audit, artifact hashes, request budgets, cancellation and fresh
response handling. Our current generator is Python: an offline build-time fixture
is sufficient for this experiment, but arbitrary app requests need a trusted
browser port or deliberately packaged Python runtime. Neither raw lesson-supplied
Lean nor imported certificate JSON may bypass those checks. Hashes identify
artifacts; they do not authenticate a compromised client or prove mathematics.

The upstream environment cache and generated declaration isolation also require
an adversarial regression before enabling mastery: no declaration, assumption or
success from an earlier request may satisfy a later request accidentally. Repeated
valid checks plus the invalid control are useful evidence, not a complete audit
of that cache or the fork's kernel changes.

## Recommended next implementation gates

1. Rebase/audit the required WASM runtime changes onto our pinned Lean revision
   and build the pinned Mathlib closure for WASM32. Preserve the current contract;
   any eventual environment version change must be explicit and reviewed.
2. Separate per-proof imports, package immutable hashed closure chunks, remove
   core duplication, and measure the actual resulting compressed bytes and memory.
   Export/tactic pruning must pass the supported positive and negative fixtures.
3. Port the trusted request/generator pipeline and add a worker transport adapter
   behind the existing verifier interface. Enforce per-request limits; terminate
   and recreate the worker on cancellation, timeout or runtime failure.
4. Deploy a small Pages fixture under a separate scope and verify first-load
   reload, worker control, update/integrity behavior and actual app communication.
5. Test physical Android and iPhone devices with the complete required closure.
   Establish a memory/download budget and an honest unavailable state before
   making browser verification the default.

## Files and checks in this update

Added the experiment preparation, browser harness, isolated worker adapter,
service-worker shim, measurement runner, exact dependency inventory, pinned
provenance, upstream license, certificate regression and this report. All heavy
downloads remain ignored on X:. No site feature is advertised as implemented in
Studio or authoring/user guides; a developer guide link points to this experiment.

Validation was limited to the relevant browser matrix and controls, one fresh
native certificate for contract regression, and script/syntax checks. The first
native control hit its fixture's 10-second import budget; the supported 60-second
diagnostic request succeeded. No production timeout or trust policy changed.
The full app test suite was not rerun for this isolated investigation.
