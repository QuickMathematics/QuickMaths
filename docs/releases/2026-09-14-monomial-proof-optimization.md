# Monomial proof optimization — 14 September 2026

## Changes

- The native generator now proves monomial nth-root limits directly, using the
  coefficient and power limits. It avoids reconstructing two identical
  polynomials and their relative-limit/cancellation argument. Lean still proves
  equality with the original submitted expression, including absolute values.
- Exactly two of the 122 canonical generated sources change. Each loses 50
  lines. The other 120 are byte-for-byte unchanged. Imports, shared compressed
  packs, Lean/Mathlib pins, worker bytes and mathematical coverage are unchanged.
- The experimental phone page defaults to **2 optimized monomial cases · once
  each**, with no warm repeats, profiling pauses or failure retries. The previous
  twelve-case diagnostic remains available. Both modes retain the bounded
  diagnostic allowance and report the original ten-second budget separately.
- Added a source-only catalog preparation tool that retains immutable shared
  packs and rejects environment drift. Updated catalog identity and deployment
  pins, the student guide and experiment documentation.
- Added focused coefficient/normalization regressions and a two-case deployment
  check. Fixed an asynchronous-start race in the deployment test itself.
- Recorded the preceding A17 report and its storage outcome in the accompanying
  [success review](2026-09-14-a17-success-review.md).

No Studio schema or authoring syntax changes are required. Existing lesson packs,
certificates, production grading and browser assessment ineligibility remain
unchanged. This update does not suppress tactic warnings globally.

## Focused measurements

Actual desktop Chromium, same pinned WASM runtime and series module environment;
one canonical execution per fresh worker, no warm repeats:

| Case | Before | After | Reduction |
|---|---:|---:|---:|
| Monomial geometric, summable | 2.711 s | 1.438 s | 47.0% |
| Monomial geometric, divergent | 2.704 s | 1.532 s | 43.4% |

These are single-run desktop comparisons, not statistical or physical-phone
speedup claims. Both candidate proofs returned compiler status zero and only
`propext`, `Classical.choice`, and `Quot.sound`. Invalid and sorry controls remained
rejected. Exact source hashes and host provenance accompany the
[measurement files](../../experiments/browser-lean/results/monomial-direct/).

## Validation and limits

- Actual native kernel: both changed canonical positives certified; all 71
  negative preflight cases remained rejected.
- Four extra actual native kernel checks: negative coefficient, rational
  coefficient, a noncanonical expression normalizing to a monomial, and a
  monomial numerator/denominator with a zero at the finite prefix. All certified.
- Five focused existing root-test regressions passed; the general polynomial
  path remains in use for nonmonomials.
- Exact source comparison: all 122 deployed sources match the current native
  generator; only the two named sources differ from the baseline.
- The deployed directory served over plain HTTP with its real isolation shim
  passed both cases once, with zero environment errors, zero warm repeats and
  zero temporary staging directories afterward.

The full corpus was deliberately not rerun. Historical full-parity evidence
belongs to its original source revision; this is a focused incremental check.
Browser results remain assessment-ineligible and carry no certificate.

## Optional A17 retest

Open [the experimental runner](../experiments/browser-lean/?candidate=monomial-direct-v1),
leave **2 optimized monomial cases · once each** selected, run and export results.
Cached runtime/module downloads are reused. This checks physical-phone timing of
the two changed sources; no full suite is requested.
