# Security review — 6 September 2026

This pass examined imported lesson and workspace rendering, GitHub credential handling, OAuth callbacks, Depot publishing and federation, merge imports, browser Python isolation, the local Python math checker, and the local Git bridge. Verification used synthetic data, mocked credentials and network responses, and disposable local repositories. No exploit requests were sent to GitHub or other third-party services.

## Fixed findings

| Severity | Boundary | Finding and correction |
| --- | --- | --- |
| High | Local Python math checker | Learner expressions reached Python evaluation through SymPy. A mock file-opening function confirmed invocation from an answer. Both evaluated and unreduced math parsing now construct a restricted arithmetic tree without evaluating source code. Attribute access, imports, strings, comprehensions and arbitrary calls cannot execute. Input size, nesting, numeric literals and arithmetic growth are bounded. |
| High | Local Git checkpoint writes | A repository-controlled checkpoint symlink could redirect a write outside its temporary checkout. Git tree modes now reject symlinks, submodules and directories on both reads and writes, including Windows checkouts that materialize symlinks as text. Writes replace the file entry atomically, preserving unrelated hard-linked files. |
| High | Local Git storage privacy | The browser client reported every local Git repository as private without verification. The host now checks GitHub's repository metadata using its existing Git credential at connection and before every write. Public or unverifiable repositories stop writes. The credential remains on the host; the metadata request uses a fixed GitHub API endpoint and refuses redirects. The browser requires an explicit verified private status. |
| Medium | Community OAuth request handling | The broker buffered entire request bodies before enforcing its limit and measured characters rather than bytes. It now reads at most 12,000 UTF-8 bytes, cancels oversized streams, and rejects malformed UTF-8. Authorization-code exchanges also discard caller-supplied grant selectors and unrelated refresh fields. |

The math-checker issue affects local Python tooling, not the website's JavaScript answer checker or its separate browser Python worker. SymPy documents that [`parse_expr` evaluates input](https://docs.sympy.org/latest/modules/parsing.html); the replacement uses only its token transformations before interpreting a restricted tree itself.

## Verification

- 343 JavaScript and callback-worker tests passed.
- 146 Python tests passed, including real Git symlink fixtures, external hard-link preservation, privacy failures, expression injection and bounded arithmetic regressions.
- Desktop and mobile browser checks rendered injected HTML as text without executing it. Agent Bridge lifecycle and sync smoke checks passed against mocked GitHub storage.
- The community worker built successfully and its updated code was deployed.
- `npm audit` reported zero known vulnerabilities in the worker lockfile's 91 dependencies, which are development/build dependencies. This is not a Python dependency advisory audit.
- A scan of 200 tracked text files found no GitHub-token, private-key or AWS-access-key patterns. This was a current-file pattern scan, not a complete history or secret-detection service.

## Coverage limits and rollout

No additional exploit was confirmed in the inspected browser rendering, OAuth state/PKCE checks, publishing credential separation, JSON prototype protections or federation URL/hash validation. This is a focused code review and regression pass, not a guarantee that the application is vulnerability-free.

Browser Python runs still use a disposable worker with syntax, data, step and wall-time limits. The existing `memory_mb` field does not enforce an exact per-worker memory quota. This pass did not attempt destructive browser memory-exhaustion tests.

The callback worker deploys independently of GitHub Pages. The local Python fixes require the updated checkout/package and a restart of any existing local Git Bridge process. Browser module URLs were refreshed for the changed local Git client.
