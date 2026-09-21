# Native Calculus bridge: batch 2

Rebased on 21 September 2026 onto `02098c4` and included together with Functions
batch 1 in the combined compatibility-and-lessons patch. This native-source addition It adds two
Algebra lessons and the first two lessons in the Calculus branch, without
changing any existing lesson ID, authored content, or prerequisite edge.

| ID | Branch | Lesson | Generated / fixed scenarios |
| --- | --- | --- | ---: |
| `MATH_FUNC_006` | Algebra | Piecewise functions and boundary values | 8 / 12 |
| `MATH_FUNC_007` | Algebra | Average rates of change and difference quotients | 11 / 9 |
| `MATH_CALC_001` | Calculus | Limits from graphs, tables, and formulas | 12 / 8 |
| `MATH_CALC_002` | Calculus | Continuity and the intermediate value theorem | 10 / 10 |

Each lesson has ten worked examples, four applications, twenty assessment
scenarios, three distinct teaching figures used where appropriate, and one
required proof review. Totals: 40 examples, 16 applications, 80 scenarios,
41 generated templates, 39 fixed templates, twelve Matplotlib SVGs, and four
review-gated arguments.

## Prerequisite design

Piecewise functions follows domain/range, inverse functions, and equations with
variables on both sides. The inverse prerequisite supports the explicit
one-to-one/inverse question rather than assuming it is familiar. Average rates
follows domain/range, two-point slope, and polynomial multiplication. The two
paths meet in Limits, with quadratic factoring as an additional prerequisite.
Continuity then follows Limits. Existing prerequisite relations are not revised.

The new `Calculus` entry in `docs/learning-taxonomy.json` is a curriculum
classification, not a new execution capability. The generated taxonomy module
is kept in sync. Native Mathematics becomes 92 lessons after both batches are
integrated; the combined shipped library becomes 136 lessons across 15 broad
branches. The native YAML track contains 89 lessons, with three native
Mathematics geometry-bridge lessons supplied by the existing geography source.

## Teaching and assessment decisions

Piecewise lessons test branch selection before substitution, equality at
endpoints, nonconflicting versus conflicting overlaps, actual range unions,
branch-filtered solution sets, and marginal versus total charges. Counts in the
price example remain discrete.

Average-rate lessons distinguish differences from averages, corresponding
subtraction order, table spacing, units, secants, displacement from distance,
and constant offsets that disappear in a quotient. Symbolic questions include
two-variable difference quotients, fixed-input quotients, a cubic expansion,
and a reciprocal with its original restrictions intact.

Limit lessons distinguish point value, side limit, and two-sided limit. They
include direct substitution under valid conditions, factorization, conjugates,
and quotients of nearby function values. Finite tables are evidence rather
than proof. The directions `+inf`, `-inf`, and DNE are distinct answer categories;
unbounded behavior is not represented as a finite real function value. The
square-root endpoint question explicitly requests a right-hand limit.

Continuity lessons check point existence, common finite limit, and equality.
They separate removable holes, jumps, and infinite behavior; preserve original
domain exclusions; and state endpoint continuity relative to allowed inputs.
IVT questions require continuity over the whole interval and distinguish
existence from uniqueness. Bisection retains an interval using actual endpoint
signs; a midpoint is not automatically an exact root.

The four proof gates require complete branch filtering, domain-preserving
quotient algebra, local equality in a limit argument, and an IVT proof with all
hypotheses. The engine stores these arguments and waits for a permitted review;
it does not pretend that a correct short answer automatically verifies a proof.

## Media and native generation

Run `python scripts/build_calculus_bridge_figures.py`; add
`--preview-dir tmp/calculus-bridge` for visual review. The figures are
reproducible SVGs with accessible descriptions and 800-by-500 display metadata.
The build uses ordinary Matplotlib output and no imported plotting execution.

Assessment pictures attach only to fixed scenarios. Randomized prompts never
receive a diagram with incompatible fixed labels. Assessment captions and diagram
annotations give only the stated graph information, not the conclusion being
assessed. Teaching captions retain the explanatory conclusions outside tests. The current assets total
786,805 embedded bytes, below the existing 1 MB native budget. Hosted
illustration-library counts are unchanged.

## Regression coverage

`docs/calculus-bridge-batch.test.js` tests all 80 scenarios across 100 seeded
retakes per lesson: 8,000 question instances, independent mathematical oracles,
answer-key self-consistency, distractors, generated-value diversity, procedural
work, infinity/endpoint/domain traps, review gates, Hard/Open paths, previous
learner state, and restored illustrated questions.

`tests/test_calculus_bridge_batch.py` checks duplicate-free source, source/preview
agreement, graph and taxonomy consistency, coverage, placeholders, safe native
arithmetic, exact symbolic identities and limits, branch-filtering families,
and media integrity. The existing Batch 1 source tests remain included.

Existing regression-test totals are updated for four additional lessons and 80
additional scenarios. The historical Batch 1 upgrade fixture removes later
transitive dependents when reconstructing the pre-Batch-1 graph; otherwise it
would manufacture dangling prerequisite edges. Its preservation assertions are
retained. The Geometry media test excludes the new non-Geometry asset namespace.

## Integration boundary

This delivery is authored and tested against the actual deployed browser engine,
but it is not a repository publication. The patch contains native YAML, media,
taxonomy, tests, and documentation. It deliberately excludes the large
`docs/curriculum-data.json` deployment artifact. The archive's JSON copy is a
review preview assembled using the browser generator, not output claimed from
the canonical Python exporter.

Apply the single combined patch once, then regenerate both the taxonomy and the canonical curriculum,
run strict native validation and the complete repository suites, then review the
actual app before publishing. The standalone review page has desktop/mobile
layout checks; it is not a substitute for app UI review. Interactive app
navigation in this environment returned `ERR_BLOCKED_BY_ADMINISTRATOR`.

See `NATIVE_COMPATIBILITY_FIXES.md` for current validation and engine repairs.
Earlier requests for Cartesian graphs, structured notation and formal methods
have since been implemented upstream. They are not outstanding requirements of
this delivery. The eight lessons retain their authored reviewed capstones;
selective formal-proof and graph retrofits remain a separate content task.
