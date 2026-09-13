# Checkpoint 30 — automatic root limits for polynomial-quotient-geometric series

This checkpoint widens only the automatic evidence layer behind `series_root_test` and the matching school-domain proof for a conservative denominator fragment.

## Supported automatic family

For a natural series index `n`, the verifier now recognizes multiplicative/division arrangements equivalent to

`(p(real(n)) / q(real(n))) * r^n`

where:

- `p` and `q` are nonzero exact rational-coefficient polynomials;
- `deg p <= 64` and `deg q <= 64`;
- `r` is an exact rational geometric base;
- exactly one independently encoded geometric factor occurs.

The multiplication/division flattener accepts spellings such as `(p / q) * r^n` and `p * r^n / q`. Checkpoint 29's polynomial-geometric family is the `q = 1` special case.

The reconstructed n-th-root limit remains `abs(r)`:

- `abs(r) < 1` may prove `summable`;
- `abs(r) > 1` may prove `not_summable`;
- `abs(r) = 1` remains deliberately inconclusive.

## Kernel reconstruction

Python recovers only exact coefficient vectors, degrees, leading coefficients, and the rational geometric base.

The generated Lean artifact separately proves

`abs(p(n))^(1/real(n)) -> 1`

and

`abs(q(n))^(1/real(n)) -> 1`

using the same explicit `Polynomial ℝ` leading-term construction introduced in Checkpoint 29. It then:

1. combines those two limits with `Filter.Tendsto.div`;
2. rewrites the root of the absolute quotient with pinned mathlib's `Real.div_rpow` theorem;
3. proves the geometric n-th root tends to `abs(r)`;
4. multiplies the quotient root and geometric root;
5. hands the exact root limit to the unchanged strict root-test convergence/divergence proof.

The pinned `Real.div_rpow` signature requires nonnegative numerator and denominator bases, which are supplied by absolute values.

## School-domain denominator semantics

Lean's field division is total, but QuickMaths keeps the classroom meaning that a denominator must be nonzero.

This checkpoint therefore does **not** suppress denominator obligations in general.

A narrow automatic guard is allowed only when the original denominator syntax is manifestly positive for every natural index using exact positive constants, natural casts, addition, multiplication, and natural powers. Examples include:

- `real(n) + 1`;
- `real(n)^2 + 1`.

For that fragment, the generated Lean proof contains an explicit

`have hdenDefined : ∀ n : ℕ, 0 < q(n) := by ... positivity`

before the root reconstruction. The semantic preflight suppresses only the matching `q(n) != 0` school-domain obligation.

Denominators such as `real(n) - 1` remain blocked by an explicit `denominator_nonzero` obligation even though the asymptotic root matcher itself can identify the quotient shape. This avoids certifying an expression that is undefined at a classroom-domain index.

## Conservative boundary

The automatic matcher still rejects or leaves evidence obligations for:

- `L = 1` root-test cases;
- zero numerator or denominator polynomials;
- non-polynomial numerator/denominator factors such as `sqrt(real(n)+1)`;
- symbolic or irrational geometric bases;
- more than one independently encoded geometric factor;
- geometric factors encoded in the denominator (left for a later normalization bite);
- denominator polynomials whose global nonzero school-domain condition is not automatically reconstructed.

## Validation in this runtime

Lean/Lake is still unavailable in this local execution environment, so successful automatic cases reach `ready_for_kernel` / `verification_unavailable` rather than `verified`.

Validation completed here:

- `formal-verifier/tests`: **325/325 passed**;
- `tests/test_formal_examples.py`: **2/2 passed**;
- polynomial-quotient convergence and divergence fixtures reach the kernel boundary;
- reciprocal-polynomial numerators exercise the constant-polynomial root path;
- `L = 1` remains `needs_justification`;
- a non-polynomial denominator remains `needs_justification`;
- `real(n)-1` keeps an explicit `denominator_nonzero` obligation;
- generated Lean source contains both explicit polynomial root reconstructions, `Filter.Tendsto.div`, `Real.div_rpow`, and the kernel-checked automatic positivity guard where applicable;
- certificates minted without Lean: **0**.
