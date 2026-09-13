# Checkpoint 38 — polynomial-quotient quotient limits for the ratio test

This checkpoint extends only the automatic quotient-limit reconstruction used
by `series_ratio_limit_test`. It does not add factorial/Stirling families,
symbolic bases, or general rational-function convergence automation.

## Added

The ratio-test matcher now accepts exact terms which normalize to

`(p(real(n)) / q(real(n))) * r^n`

where `p` and `q` are nonzero exact rational-coefficient polynomials of degree
at most 64 and `r` is the already-normalized nonzero exact rational geometric
base. Multiple exact geometric numerator/denominator factors still collapse into
`r` as in checkpoint 37.

For these terms the automatic quotient limit is `abs(r)`. Summability is used
only when `abs(r) < 1`, divergence only when `abs(r) > 1`, and `abs(r) = 1`
remains intentionally inconclusive.

## Trust boundary

Python performs only exact syntax normalization, exact rational polynomial
coefficient extraction, and bounded search for concrete eventual-nonzero tail
certificates. The generated Lean artifact independently reconstructs:

- `abs(p(n+1)) / abs(p(n)) -> 1` from explicit `Polynomial ℝ` values;
- `abs(q(n)) / abs(q(n+1)) -> 1` from explicit `Polynomial ℝ` values;
- the product of those two limits;
- the existing exact geometric normalization under absolute value;
- denominator and cancellation safety on a concrete tail, including a reusable
  `forall m >= N, q(m) != 0` fact instantiated at `n+1`.

The generic school-domain checker is relaxed only when the final automatic
ratio-test step itself reconstructs the relevant denominator as eventually
nonzero. Non-polynomial denominators therefore remain explicit obligations.

## Boundaries retained

- `L = 1` is still inconclusive.
- Zero geometric bases are still rejected by automatic quotient reconstruction.
- Non-polynomial numerator or denominator factors remain unsupported here.
- The degree-64 exact rational polynomial bound is unchanged.
- No kernel certificate is emitted when Lean/Lake is unavailable.

## Validation

Focused regressions cover a globally nonzero polynomial denominator, the
`real(n)-1` eventual-denominator case, `L > 1` divergence, the `L = 1`
boundary, a non-polynomial denominator refusal, and the public text protocol.
The complete formal-verifier suite passes 368 tests; the app-level formal test
surface passes 21 tests; and the browser formal evidence/client/integration
surface passes 14 tests.
