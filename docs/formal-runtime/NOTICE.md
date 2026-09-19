# Bundled browser verifier dependencies

The native verifier source archive is generated from this repository by
`scripts/build-browser-formal.py`. The script pins its bytes in `pins.js`.

Python uses the existing self-hosted Pyodide 0.28.3 distribution; see
`../vendor/pyodide-0.28.3/NOTICE.md`. The additional mpmath 1.3.0 wheel is from
that distribution and verified against its existing lockfile hash.

SymPy 1.14.0 is the pure-Python PyPI wheel, matching the native verifier's
installed version. Its license and attribution are included inside the wheel.
Its exact SHA-256 is pinned in `pins.js`. Python modules are not supplied by
lessons; only bounded JSON requests reach the bundled protocol.

Lean/Mathlib runtime and module packs are reused from the already deployed
curated environment. See ../experiments/browser-lean/UPSTREAM-LICENSE and the
runtime provenance under ../experiments/browser-lean/assets/.
