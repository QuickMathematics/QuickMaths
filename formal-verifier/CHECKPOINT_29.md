# Checkpoint 29 — automatic root limits for polynomial-geometric series

This checkpoint widens only the automatic evidence layer behind `series_root_test`.

## Supported automatic family

For a natural series index `n`, the verifier now recognizes exact products equivalent (up to product association/order) to

`p(real(n)) * r^n`

where:

- `p` is a nonzero polynomial with exact rational coefficients;
- `deg p <= 64`;
- `r` is an exact rational geometric base.

The reconstructed n-th-root limit is `abs(r)`. The root-test decision boundary is unchanged:

- `abs(r) < 1` may prove `summable`;
- `abs(r) > 1` may prove `not_summable`;
- `abs(r) = 1` is deliberately inconclusive.

Checkpoint 28's `c * real(n)^k * r^n` family is now just a special case. Expressions such as `(real(n) + 1) * (1/2)^n` and `(real(n)^2 + 3*real(n) + 1) * (-1/2)^n` no longer need a separately cited root-limit theorem.

## Kernel reconstruction

Python only normalizes the exact polynomial into its rational coefficient vector. It does not certify the asymptotic.

The generated Lean artifact:

1. rebuilds the exact `Polynomial ℝ` value `pPoly`;
2. rebuilds its leading monomial `rootLead = leadingCoeff(p) * X^deg(p)`;
3. uses `Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq` to prove `p(n) / (a*n^d) -> 1`;
4. takes absolute values and combines that limit with `1/real(n) -> 0` through `Filter.Tendsto.rpow`, obtaining the n-th root of the asymptotic ratio -> 1;
5. reconstructs the leading-monomial n-th root from `abs(a)^(1/n) -> 1` and `n^(d/n) -> 1`;
6. multiplies those pieces to prove `abs(p(n))^(1/n) -> 1`;
7. combines the polynomial root with the exact geometric root `abs(r)`.

The existing root-test proof then consumes that exact limit without changing the convergence/divergence criteria.

## Conservative boundary

The automatic matcher still rejects:

- the zero polynomial (handled by a separate trivial-series path rather than disguising it as a root-test case);
- non-polynomial factors such as `sqrt(real(n)+1)`;
- rational functions of `n`;
- symbolic/irrational geometric bases;
- products containing more than one independently encoded geometric `r^n` factor.

Those cases still require cited evidence or later dedicated reconstruction rules.

## Validation in this runtime

Lean/Lake is not installed here, so this checkpoint can only reach `ready_for_kernel` / `verification_unavailable`, never `verified`.

Validation completed here:

- `formal-verifier/tests`: **319/319 passed**;
- `tests/test_formal_examples.py`: **2/2 passed**;
- the two new polynomial-geometric positives reach `verification_unavailable` with no certificate because Lean is absent;
- the polynomial `L = 1` boundary returns `needs_justification`;
- the non-polynomial factor boundary returns `needs_justification`;
- generated Lean source contains the explicit `Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq` reconstruction.
