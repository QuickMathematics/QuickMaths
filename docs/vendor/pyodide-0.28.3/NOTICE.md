# Vendored Pyodide runtime

QuickMaths distributes the browser runtime files in this directory from
`pyodide@0.28.3` so Python grading never downloads executable code from a
third-party CDN.

- Upstream project: https://github.com/pyodide/pyodide
- Package source: https://registry.npmjs.org/pyodide/-/pyodide-0.28.3.tgz
- License: Mozilla Public License 2.0 (MPL-2.0), https://www.mozilla.org/MPL/2.0/
- Integrity: SHA-256 values for every distributed runtime file are recorded in
  `integrity.json` and verified by the repository test suite.

The upstream `pyodide.mjs` file is distributed byte-for-byte as
`pyodide-esm.js`. Only the filename changed so minimal static servers return a
JavaScript MIME type. QuickMaths modifications and surrounding integration code
remain under the repository's MIT license; the vendored Pyodide files remain
under MPL-2.0.
