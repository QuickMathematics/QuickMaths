# Native Functions batch 1

Rebased on 21 September 2026 onto `QuickMathematics/QuickMaths` commit
`02098c478b7ee542b2594e34bad16218456ac58c`. This batch and the Calculus bridge
are supplied together in the combined compatibility-and-lessons patch. Do not
apply the older sequential patches as well.

## Scope

Four additive native lessons in **Mathematics → Algebra → Functions**. Existing
lesson IDs, native lesson content, learner progress, drafts and saved plan
coordinates are not replaced. The batch increases native Mathematics from 84 to
88 lessons and the shipped library from 128 to 132. The existing 118-lesson hosted
illustration library is unchanged; the new figures are ordinary embedded native
media.

| Stable ID | Lesson | Preparation |
| --- | --- | --- |
| `MATH_FUNC_002` | Domain and range of real functions | Function notation; interval notation; radicals; rational-expression restrictions; absolute value |
| `MATH_FUNC_003` | Transformations of functions and graphs | Domain and range; quadratic functions |
| `MATH_FUNC_004` | Composition of functions and composite domains | Domain and range; polynomial multiplication |
| `MATH_FUNC_005` | Inverse functions and domain restrictions | Transformations; composition; literal equations |

Transformations and composition form two connected paths into inverses. No
existing prerequisite relationships are rewritten. Each new dependency names an
existing native ID or another lesson in this batch. The combined graph is checked
for cycles, and the native Hard/Open path behavior is retained.

## Teaching and assessment coverage

Every lesson contains a substantial conceptual explanation, ten worked examples,
four applications, and twenty comprehensive assessment scenarios. Across the
batch there are **40 examples, 16 applications, 80 scenarios, and 12 SVG figures**.
Forty-six scenarios generate fresh values in the existing allowlisted browser
runtime; thirty-four are fixed conceptual, graph-reading or reasoning tasks.
There are nine procedural-work scenarios, thirteen optional-work scenarios, two
rubric tasks, and two structured proofs. Each lesson has exactly one required
reasoning review. A correct final answer alone cannot pass that review gate.

The assessments deliberately cover common false shortcuts: filling cancelled
holes, treating an open endpoint as attained, ignoring an interior extremum,
confusing range with codomain, reversing a horizontal shift, failing to reverse
endpoints under negative scales, interchanging composition order, dropping an
inner domain, confusing an inverse with a reciprocal, choosing the wrong square
root branch, and checking an inverse without its domain conditions.

Seven fixed assessment scenarios use authored figures. These figures are never
paired with changing numeric labels. All media has descriptive alternative text,
captions, responsive dimensions, and `fit: contain`. The twelve new SVG files use
227,599 bytes; the complete native embedded-media collection is 571,939 bytes,
below the existing 1 MB limit in the inspected build.

### Symbolic grading and required review

The combined patch fixes the browser's treatment of `abs`, `sin`, `cos`, `exp`
and natural `log` as function calls (with `ln` as a browser alias). In particular,
the incorrect absolute-value distribution `1-2*abs(x)-2*abs(3)` is rejected for
`1-2*abs(x+3)`. Signed, fractional and domain-aware probes supplement ordinary
symbolic sampling. This remains bounded numerical answer checking, not a
mathematical proof service. The conservative inverse-function parameter ranges
are retained. Proof-obligation and rubric questions keep their required reviews;
this rebase does not convert them into unverified Lean exercises.

## Maintained source and rebuild

The four `MATH_FUNC_002` through `MATH_FUNC_005` YAML files under
`content/math/algebra_foundations/skills/` are the maintained lesson sources.
Figures are under `skills/media/native-functions/`. The track includes all four
new IDs and adds the inverse lesson as an exit. The usual repository exporter
must generate the deployed curriculum from those sources.

From a complete writable checkout after applying the source patch:

```sh
python scripts/build_function_figures.py
python -m quickmaths.cli validate-content --strict-warnings
python scripts/export_web_curriculum.py
python -m pytest -q tests/test_functions_batch.py
node --test docs/functions-batch.test.js docs/challenge-core.test.js docs/native-geometry.test.js docs/lesson-illustrations.test.js docs/map-layout.test.js docs/statistics-batches.test.js docs/new-lesson-batches.test.js
```

Then run the complete repository suites and review the app before publishing.
The existing scenario counts, shipped-library assertions, field/branch reference,
and illustration coverage notes are updated in this patch. The native Geometry
asset assertion now excludes the new Functions assets from its Geometry-only
comparison; separate Functions checks verify every new asset.

## Validation and integration status

See `NATIVE_COMPATIBILITY_FIXES.md` for the current combined-patch validation and
migration behavior. The 80 assessment scenarios are exercised across 100 retakes
by `docs/functions-batch.test.js`, using independent answer calculations and
negative controls. Additional compatibility regressions cover the absolute-value
counterexample, saved questions, formal bindings and generated formal questions.

The combined source patch excludes `docs/curriculum-data.json`. Rebuild that file
with the official exporter in a complete checkout before publishing. The supplied
review JSON supports the partial-workspace checks but is not canonical output.
No repository publication, new Lean kernel verification, or successful interactive
browser smoke test is claimed by this package.
