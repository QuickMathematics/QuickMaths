# Formal rule-library experiment — 2026-09-13

## Result

A narrow absolute-value derivative helper family has compiled successfully in
the pinned native Lean environment. This is evidence for the feasibility of
one focused replacement, not evidence for replacing the whole QuickMaths
Formal library or for any import, pack, or memory savings.

## Actual source and artifacts

The experimental source is
[`QmAbs.lean`](../../experiments/browser-lean/rules/QmAbs.lean).
It is explicitly not imported by the production generator. The source uses
only:

```lean
public import Mathlib.Analysis.Calculus.Deriv.Add
```

It defines generic sign-guarded helpers `abs_pos` and `abs_neg` using
`hasStrictDerivAt_id`, `hasStrictDerivAt_neg`, local neighborhood eventual
equality, and `abs_of_pos`/`abs_of_neg`. This avoids the broader
`Mathlib.Analysis.Calculus.Deriv.Abs` import in the experimental source.

The compiled outputs are:

| Artifact | Bytes |
|---|---:|
| `QmAbs.olean` | 13,416 |
| `QmAbs.ir` | 1,592 |
| `QmAbs.ir.sig` | 176 |
| `QmAbs.olean.private` | 16,656 |

The log at
[retained native evidence](../../experiments/browser-lean/results/parity/narrow-rule-native.json)
reports exactly `propext`, `Classical.choice`, and `Quot.sound` for both
helper theorem axiom lists.

## Boundaries

The native compile demonstrates only that this narrow helper source is
kernel-accepted with the stated public import. Browser packaging and actual
replacement of generated `hasDerivAt_abs_pos`/`hasDerivAt_abs_neg` calls have
not been tested. Production sources, renderer behavior, proof-source hashes,
assessment eligibility, and certificate/trust behavior are unchanged.

The broader rule-library proposal remains unproven. In particular, a
precompiled facade may still retain large serialized transitive closures, and
tactic/meta imports remain necessary wherever generated source invokes
`ring`, `field_simp`, `norm_num`, `linarith`, `positivity`, `fun_prop`, or
other tactics. Only a full browser/native parity run plus measured pack,
import, and private-memory comparisons can establish a practical benefit.

## Next step

Package `QmAbs` in an isolated browser experiment and verify the existing
positive, negative, warm-round, source-identity, and `#print axioms` gates.
Then investigate a similarly narrow P-series facade for the exact generated
uses of `Real.summable_one_div_nat_pow`, `Real.summable_one_div_nat_rpow`, and
`summable_nat_add_iff`. Keep both experiments outside production until those
checks complete.

## Detailed dependency analysis

## Current generated surface

The corpus mapping observed in the renderer is:

| Capability profile | Generated rule families |
|---|---|
| algebra | `and_elim_*`, `forall_intro`, `guarded_cancel`, `imp_intro`, `linarith`, plus algebra identities and logic/relations |
| algebra + radicals | `conjugate_identity`, `sqrt_square_nonnegative` |
| algebra + limits + radicals | `conjugate_limit`, `continuity_limit`, `continuous_ivt_exists`, `inverse_one_sided_limit`, `ivt_exists`, `limit_algebra`, `piecewise_jump`, `rational_hole_limit` |
| algebra + derivatives + radicals | `abs_derivative`, `cos_derivative`, `exp_derivative`, `log_derivative`, `polynomial_derivative`, `quotient_derivative`, `recursive_derivative`, `sin_derivative`, `sqrt_derivative` |
| algebra + radicals + sequences-series | sequence ratio/algebra/squeeze/monotone/polynomial/rational rules and `series_comparison`, `series_geometric`, `series_p_series`, `series_ratio_limit_test`, `series_ratio_test`, `series_root_test` |

Representative emitted declarations and tactics by capability are:

- Algebra emits `ring`, `field_simp`, `linarith`, `nlinarith`, `norm_num`,
  `positivity`, `congrArg`, `funext`, `Set.ext`, `rfl`, `.symm`, `.trans`,
  `False.elim`, and direct `exact` terms. The current profile imports
  `Mathlib.Basic.Real.Basic` and the FieldSimp, Ring, Linarith, NormNum, and
  Positivity tactic modules.
- Radicals use `Real.sqrt_sq_eq_abs`, `abs_of_nonneg`, `Real.sq_sqrt`,
  `Real.sqrt_pos.2`, `.sqrt`, `field_simp`, `nlinarith`, and `positivity`.
  The radical additions are `Mathlib.Analysis.Real.Sqrt` and
  `Mathlib.Tactic.NormNum.RealSqrt`; analysis profiles include radicals too.
- Limits use `Filter.Tendsto`, `ContinuousAt`, `ContinuousOn`, `fun_prop`,
  `tendsto_inv_nhdsGT_zero`, `tendsto_inv_nhdsLT_zero`,
  `tendsto_nhdsWithin_of_tendsto_nhds`, `.congr'`, and
  `intermediate_value_Icc`/`intermediate_value_Icc'`, with `simp`, `norm_num`,
  `ring`, `field_simp`, and `positivity`.
- Derivatives use `HasDerivAt`, `hasDerivAt_id'`, `hasDerivAt_const`, the
  `.add`, `.sub`, `.mul`, `.fun_div`, `.sqrt`, `.exp`, `.log`, `.sin`, and
  `.cos` derivative combinators, `hasDerivAt_abs_pos/neg`, `convert!`,
  `norm_num`, `field_simp`, `ring`, `ext`, and `positivity`.
- Sequences and series use `Filter.Tendsto`, `HasSum`, `Summable`,
  `tendsto_natCast_atTop_atTop`, `tendsto_const_nhds`,
  `tendsto_pow_atTop_nhds_zero_of_abs_lt_one`, `tendsto_atTop_ciSup`,
  `tendsto_atTop_ciInf`, `tendsto_of_tendsto_of_tendsto_of_le_of_le'`,
  `hasSum_geometric_of_abs_lt_one`, `summable_nat_add_iff`,
  `summable_mul_left_iff`, `summable_of_ratio_norm_eventually_le`,
  `Polynomial.degree`, `Polynomial.leadingCoeff`, `compute_degree!`, `omega`,
  `norm_num`, `ring`, `field_simp`, and `simp`.

## Visibility and dependency constraints

`render_request` emits a `module` declaration followed by `public import`
lines for the imports selected by `request_environment`. A public facade can
therefore expose a stable QuickMaths namespace, but a private-only import does
not expose its declarations to a downstream generated module. `open` changes
name resolution; it does not load dependencies. Public transitive imports may
also enlarge the visible dependency closure.

Generated proofs refer to named declarations and theorem methods in theorem
types and bodies. Precompiled `.olean`/IR artifacts do not erase those
declaration dependencies: every constant needed by the checked theorem must
remain available in the shipped closure. The current explicit module packs
also carry the corresponding `.olean`, `.ir`, and `.ir.sig` artifacts.

There is a second dependency class: `ring`, `field_simp`, `norm_num`,
`linarith`, `nlinarith`, `positivity`, `fun_prop`, `convert!`,
`compute_degree!`, `omega`, `simp`, and `ext` execute elaborator/meta code at
compile time. A library of precompiled theorem declarations does not remove
those tactic/meta modules while generated source still invokes the tactics.
The tactic IR and its supporting declarations must remain available until a
renderer branch is rewritten to use a theorem/API directly.

## Facade versus standalone verified library

A facade module is the low-risk first step: it centralizes public imports and
can provide stable helper theorem names. If it merely public-imports the same
Mathlib closure, it is packaging and namespace hygiene, not demonstrated
memory or import-time reduction.

A standalone verified library would compile generic QuickMaths lemmas once,
then make generated modules use `exact`/`simpa` (or small proof terms) against
those lemmas. This could remove many tactic imports from request modules, but
the library itself must be kernel-checked and its own dependency closure must
still be shipped. Each generated theorem still needs kernel checking and the
existing `#print axioms` audit. A future renderer migration would create a new
source version; that new source must again be identical on native and browser
paths, with fresh proof records and complete parity checks.

## Viable migration steps

1. Preserve the current profiles and enumerate exact declaration/tactic names
   per capability, as above.
2. Add `QuickMaths.Formal.*` public facade modules with exact helper theorem
   signatures, initially without changing generated proofs.
3. Migrate one low-risk branch per profile to direct verified helpers, such as
   `sqrt_square_nonnegative`, `inverse_one_sided_limit`, or a basic `HasSum`
   lemma; retain the current renderer fallback.
4. Produce an explicit facade artifact map, check for private-import leaks and
   duplicate declarations, and compare theorem source hashes and axiom output.
5. Run the full native/browser parity and negative-control gates, then measure
   cold import, worker/cache behavior, and labelled private memory. Do not
   infer savings from fewer source lines or a facade alone.
6. Migrate tactic-heavy polynomial-degree, factorial, and recursive-derivative
   branches last; their assumptions and meta dependencies have the highest
   risk.

## Risks

The main risks are theorem namespace/API drift, hidden typeclass or domain
assumptions, public/private import leakage, generated-theorem ABI changes,
tactic elaboration still being required, expanded facade closure, duplicate
names, invalidated browser snapshots, and native/browser divergence. No
rule-library import or memory savings have been measured. The separate worker
lifetime reductions in the main report do not establish library savings.

## Focused roots: `Deriv.Abs` and `PSeries`

The pinned curated import graph reports these direct source imports:

- `Mathlib.Analysis.Calculus.Deriv.Abs` imports
  `Mathlib.Analysis.Calculus.Deriv.Add` and
  `Mathlib.Analysis.InnerProductSpace.Calculus`.
- `Mathlib.Analysis.PSeries` imports
  `Mathlib.Analysis.SumOverResidueClass`,
  `Mathlib.Analysis.Asymptotics.SpecificAsymptotics`,
  `Mathlib.Analysis.Normed.Module.FiniteDimension`, and
  `Mathlib.Analysis.SpecialFunctions.Pow.NNReal`.

In the pinned import-cost report, the derivative profile attributes about
55.8 MiB raw to the exclusive `Deriv.Abs` root (350 exclusive modules), while
the sequences/series profile attributes about 66.8 MiB raw to the exclusive
`PSeries` root (343 exclusive modules). These are closure-attribution figures,
not predicted savings. At the current pack granularity, removing `Deriv.Abs`
removes no complete pack; removing `PSeries` removes one pack (about 2.9 MiB
compressed). This is evidence that root-level replacement and artifact-level
savings are different questions.

### Absolute-value derivatives

The generated surface names `hasDerivAt_abs_pos` and `hasDerivAt_abs_neg`,
then composes them with the inner proof via `.comp`; the ordinary polynomial
and recursive branches also use `hasDerivAt_id'`, `hasDerivAt_const`, and
`.fun_neg`. A plausible narrow replacement is to prove the two local helper
lemmas from the identity derivative (and its negation), an eventual
neighborhood sign fact, and `abs_of_pos` or `abs_of_neg`, using a
`HasDerivAt` eventual-equality/congruence theorem. The native QmAbs prototype above now verifies this local-neighborhood construction with Deriv.Add alone. Browser packaging and whole-corpus migration remain untested.

This route is semantically reasonable because the renderer already requires a
strict positive or negative point guard and never claims a derivative at zero.
It can avoid the named `Deriv.Abs` theorem only if the replacement proof does
not transitively import `InnerProductSpace.Calculus` and all other derivative
branches continue to resolve through their existing narrower roots. The
current profile's `removableOnRootRemoval = 0` means that deleting the import
line alone is not a demonstrated runtime or pack reduction.

That narrow construction has now been demonstrated natively in
[`QmAbs.lean`](../../experiments/browser-lean/rules/QmAbs.lean).
It uses only `public import Mathlib.Analysis.Calculus.Deriv.Add` and defines
generic sign-guarded `abs_pos` and `abs_neg` helpers through
`hasStrictDerivAt_id`, `hasStrictDerivAt_neg`, local eventual equality, and
`abs_of_pos`/`abs_of_neg`. The compiled artifacts are `QmAbs.olean` 13,416 B,
`QmAbs.ir` 1,592 B, `QmAbs.ir.sig` 176 B, and `QmAbs.olean.private` 16,656 B.
The accompanying log reports exactly `propext`, `Classical.choice`, and
`Quot.sound` for both helper theorem axiom lists. This establishes native
compilation of the narrow Abs family; browser packaging/replacement and any
production renderer change remain untested and unmade.

### P-series

The generated p-series branch directly names only the specialized criteria
`Real.summable_one_div_nat_pow` or `Real.summable_one_div_nat_rpow`, together
with `summable_nat_add_iff`; it then uses scalar `Summable` operations and
`norm_num`. The source module's four imports are broader implementation and
theorem dependencies of `Mathlib.Analysis.PSeries`, not four declarations that
the generated source individually requests.

The distinction matters for a precompiled library. Private or specialized
compile-time helpers used while proving the Mathlib p-series theorem are not
automatically part of the generated module's named API. However, the checked
helper theorem's declaration body still references every constant needed by
its proof, and the imported `.olean`/IR environment must provide that
serialized dependency closure. A facade that public-imports `PSeries` keeps the
root closure. A standalone QuickMaths theorem could hide the source-level
helper imports from generated modules only after it is itself kernel-checked
and packaged with the declarations required by its body; it cannot assume
that private imports disappear from the artifact closure.
