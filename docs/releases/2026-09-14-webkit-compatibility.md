# Browser Lean: focused WebKit compatibility check

## Outcome

The installed Windows Playwright WebKit engine (reported version 26.0) accepts
the exact deployed Lean WASM binary and runs an unchanged native-generated proof.
Its port lacks `navigator.storage`, preventing the phone runner's OPFS path.
This is **partial engine compatibility**, not an iPhone Safari pass or an iPhone
capacity measurement. No runtime, source adapter or grading policy was changed.

## Checks performed

1. Opened the actual GitHub Pages experimental route in WebKit. Its isolation
   service worker established `crossOriginIsolated`; shared memory, WASM
   exceptions, decompression, service workers and Web Locks were exposed.
2. Verified compressed and raw asset hashes, then compiled the exact 104,721,833
   byte Lean WASM module in WebKit. Raw SHA-256:
   `3038cfd8f81cf650b17967881339256e0bb1cbd1a407c1a7b7225fa8e367df8b`.
   Compilation succeeded in approximately 453 ms. This alone is not proof execution.
3. Used the existing MEMFS diagnostic harness to isolate engine behavior from
   the missing OPFS API. The unchanged two-thread runtime initialized and loaded
   the algebra environment's 2,455 modules. `guarded_cancellation.json` passed
   in 437 ms with compiler exit zero and allowed axioms. Its source hash matches
   the deployed native-generated source. All five built-in warm repeats passed;
   invalid and `sorry` controls were rejected. No full corpus suite was run.
4. The diagnostic ended with a storage-statistics error after successful proof
   execution because this port lacks `navigator.storage.estimate`. The complete
   report retains that error; it must not be presented as a successful full run.

Evidence: [API probe](../../experiments/browser-lean/results/webkit-compatibility/probe.json),
[binary compilation](../../experiments/browser-lean/results/webkit-compatibility/binary.json),
[engine smoke check](../../experiments/browser-lean/results/webkit-compatibility/engine-smoke.json).

## Interpretation and next compatibility step

The A17 remains our demonstrated low-memory capacity target. These WebKit
results justify continuing compatibility work without requiring an iPhone
capacity run as the next task. They do not establish that every 4 GiB iPhone
has the same per-tab limits as Android.

Safari supports [OPFS and synchronous worker access](https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/)
and [storage estimation](https://webkit.org/blog/14403/updates-to-storage-policy/).
Their absence here is not proof of an iOS limitation. Playwright documents that
its [WebKit build differs from shipped Safari](https://playwright.dev/docs/browsers).

The next end-to-end compatibility check should use Safari on macOS or Apple's
[iOS Simulator](https://developer.apple.com/documentation/safari-developer-tools/installing-xcode-and-simulators)
on a Mac, exercising actual OPFS worker handles, the Pages isolation shim,
cached artifacts, one proof and cleanup. A physical phone is not necessary to
start that check. No Mac/iOS simulator is available in this Windows workspace.

Safari 18.4 or later is the initial feature-based target: WebKit documents
[tail calls in 18.2](https://webkit.org/blog/16301/webkit-features-in-safari-18-2/)
and [the new WASM exception specification in 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/).
This is a compatibility hypothesis, not a tested minimum version.

## Changes and reproduction

- Added `experiments/browser-lean/check-webkit-compatibility.py` for the small
  Pages API probe and hash-verified binary compilation check. Run after loading
  `scripts/formal-env.ps1`; profiles/results stay under ignored workspace storage.
- Added an explicit unsupported-storage message to the experimental phone page
  instead of an opaque JavaScript TypeError. Four focused storage tests passed.
- Kept shared OPFS-backed module packs as the phone baseline. MEMFS was only an
  engine diagnostic; it is not a production fallback or a proposed architecture.
- All browser results remain assessment-ineligible and certificate-free.
