# Checkpoint 37 — normalized geometric products in quotient-limit ratio tests

This checkpoint extends only the automatic quotient-limit reconstruction added
in checkpoint 36. It does not add polynomial-quotient ratio asymptotics.

## Added

The ratio-test matcher now flattens exact multiplication/division and folds each
nonzero rational geometric factor `r^n` into one exact rational base. Therefore
terms such as

`p(real(n)) * (1/2)^n * (1/3)^n`

are reconstructed with quotient limit `1/6`, and

`p(real(n)) / 2^n`

is reconstructed with quotient limit `1/2`. Signed factors are retained in the
exact combined base and the ratio-test statistic uses its absolute value.

The remaining non-geometric numerator factors must still normalize to one
nonzero rational-coefficient polynomial of degree at most 64. Any residual
non-geometric denominator is deliberately rejected, so polynomial quotients are
still outside this ratio-test automation.

## Trust boundary

Python only performs exact rational multiplication/division and exact polynomial
normalization. The generated Lean artifact:

- rebuilds the polynomial quotient `p(n+1)/p(n)` and proves its limit with
  `Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq`;
- proves the absolute value of the original geometric product/quotient equals
  `|r|^n` using `abs_mul`, `abs_div`, `abs_pow`, `mul_pow`, and `div_pow`;
- reuses the existing kernel-checkable eventual polynomial nonzero certificate
  for cancellation.

A zero geometric base is not normalized because the successive-term quotient is
not eventually defined in the intended school-real sense. Combined `|r| = 1`
remains intentionally inconclusive.

## Validation

Focused regressions cover multiple positive geometric factors, a signed product,
a geometric denominator, the combined `L = 1` boundary, a zero-base refusal,
and the public text protocol. No certificate is emitted without the pinned
Lean/mathlib kernel.
