# Experimental physical-phone deployment

The temporary route is `/QuickMaths/experiments/browser-lean/`. It is separate
from the learning app and cannot issue certificates or award mastery.

## What changed

- Published the exact native-EH/tail-call, two-pthread parity candidate and all
  105 content-addressed shared module packs. No snapshot substitution.
- Retained the original generated sources, compiler worker, corpus harness,
  proof budgets, axiom checks, and staged-file release behavior byte for byte.
- Added a phone launcher with one-environment or sequential all-environment
  runs, progress, stop/release, persisted partial diagnostics, and JSON export.
- Added a service-worker isolation shim scoped only to this experimental route.
  It reloads once to establish COOP/COEP on GitHub Pages. It does not register at
  the production application root.
- Added deployment SHA-256 checks for the catalog, worker, harness, compatibility
  module, and artifact loader. Existing compressed/raw artifact checks remain.
- Added a repeatable staging script and a focused Chromium test of the plain-HTTP
  hosted layout, real isolation shim, and algebra proof flow.

## How to test

Open the experimental URL in Android Chrome, keep the tab visible, select an
environment, and press **Download and run**. **All five** runs all 122 positive
cases three times, plus rejection controls and five warm repeats per environment.
Use **Export results** afterward. If Chrome kills the tab, reopen the page and
export the previously saved progress before starting again.

All runtime/packs total about 320 MiB compressed; the catalog adds about 15 MiB.
Artifacts are cached and shared between environments. Each completed environment
releases its worker. This is not a complete offline application: the launcher,
catalog, and scripts still require hosting. Android private process memory is
not exposed to this page; WASM capacity must not be reported as total memory.

The 71 negative preflight cases remain **native reference evidence**, not 71
phone kernel executions. Each phone environment separately runs the invalid
proof and `sorry` rejection controls. Every result stays assessment-ineligible
with a null certificate. No production certificate or grading code changed.

Candidate catalog identity:
`c85e57e95fdbc7f94aa05880ca492e72030735f9024e10fc1085a48581d0cc07`.
See the earlier parity report for exact Lean, Mathlib, and runtime provenance.

## Temporary deployment lifecycle

The files live beneath `docs/experiments/browser-lean/`, with an exact loader copy
in `docs/experiments/app/`. Removing those routes retires the deployment. Existing
browser caches can be cleared through Chrome site storage settings; doing so for
the whole QuickMaths origin also clears local application data, so export any
unsynced workspace first. Do not change application service-worker registrations
to remove this narrowly scoped experiment.
