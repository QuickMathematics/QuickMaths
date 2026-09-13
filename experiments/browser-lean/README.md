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
