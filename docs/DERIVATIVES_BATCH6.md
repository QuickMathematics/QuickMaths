# QuickMaths: Derivatives, Batch 6

> Integration note: these lessons now accompany the twenty foundation additions. The combined catalog has 116 native lessons (160 shipped), and native embedded media totals 983,771 bytes. The [integration report](releases/2026-09-21-derivatives-batch6-integration.md) records current checks. The original package handoff below describes its earlier baseline and authoring-environment limitations.

Four native Calculus lessons, authored against commit
`847572ef8b3b91c266e899387372f429c9bbc6eb`.

This delivery is separate from the twenty foundations lessons in Batches 1–5.
It does not include Lesson 25 (`MATH_CALC_007`, optimization). No repository commit
or live learner state was changed by this delivery.

## Contents and status

| Lesson | Focus |
|---|---|
| `MATH_CALC_003` | Derivative meaning, difference quotients, finite two-sided limits, local rates, tangents, and failure of differentiability. |
| `MATH_CALC_004` | Constant, constant-multiple, sum, difference, and positive-integer power rules; values, signs, units, and stationary-point interpretation. |
| `MATH_CALC_005` | Product and quotient rules, changing-area models, derivative data, original exclusions, and cancelled holes versus extensions. |
| `MATH_CALC_006` | Inner/outer structure, nested compositions, explicitly introduced square-root derivatives, matched derivative data, and combinations of rules. |

Each lesson contains ten worked examples, four applications, twenty ordinary
scenarios including a required rubric-reviewed capstone, and one formal exercise.
Every new assessment contains all 21 scenarios. There are 44 randomized templates
and 40 fixed scenarios overall, including the four formal questions. All prerequisite
IDs are already present in the reviewed baseline or in this batch; none depends on
Codex's unmerged Batches 1–5. Existing prerequisite locks are not rewritten.

The four formal references passed actual verifier preflight, method-policy checks,
and Lean-source generation. **No fresh Lean kernel certificates were produced in
the authoring environment. Kernel verification is a publication gate, not optional.**
The ordinary generator, graders, diagrams, review gates, and restoration were tested
against the actual deployed JavaScript modules. See `validation/summary.json`.

The HTML preview contains author answer keys. It is not an installable pack and has
no assessment authority. The review curriculum JSON is explicitly noncanonical;
never copy it into `docs/curriculum-data.json`.

## Applying alongside Codex's work

Use a clean review branch containing the latest other-agent changes. Export a real
learner backup before deploying any update. Record the integration task start using
the repository's existing workflow; this patch intentionally does not replace
`agent-task.json` or edit another agent's task record.

From the repository root:

```sh
git switch -c codex/derivatives-batch6
git apply --check /path/to/quickmaths-derivatives-batch6.patch
git apply /path/to/quickmaths-derivatives-batch6.patch
python scripts/register_derivatives_batch6.py
```

The last command is **dry-run only**. Review its diff, then:

```sh
python scripts/register_derivatives_batch6.py --apply
```

Registration adds the four track IDs and the final lesson as an additional exit. It
updates the ordinary-count and configured-assessment fixtures separately, preserving
existing entries and adding to their current totals rather than replacing them with
baseline numbers. It is idempotent and rejects partial registration or unfamiliar
fixture syntax. It writes `.before-derivatives-batch6` backups beside its two changed
files; inspect those backups, then remove them before committing. Do not commit them.

The patch also contains small context-sensitive updates to existing tests and a
Studio media fix. **A Git conflict is a request to merge, not permission to replace
a shared file wholesale.** In particular, preserve all Batches 1–5 IDs, their
ordinary-scenario counts, configured lengths, and new prerequisite relationships.
`repo-files/` contains only new files; it is not an overwrite copy of the checkout.
Do not run two agents' integration writes simultaneously in the same worktree.

## Canonical build and publication gates

Use the repository's documented Python environment and pinned Lean setup. Typical
commands, after all lesson sources are integrated:

```sh
python -m pip install -e ".[dev,media]" -e ./formal-verifier
python scripts/export_web_curriculum.py --media-report native-media-batch6.json
python -m pytest -q
npm --prefix docs test
python scripts/check_derivatives_batch6_references.py --output batch6-reference-verification.json
```

The reference-check command must report **VERIFIED for all four lessons**, with
fresh certificates and passing method policies. On Windows, first load the pinned
formal environment as described in `docs/FORMAL_LEARNING.md`. The new checker uses
the existing verifier and actual JavaScript method-policy checker. Its explicit
`--preflight-only` option is diagnostic and is **not** a publication pass.

Also run the existing formal certificate/replay integration checks relevant to the
release. Perform actual desktop and Android app checks: new and resumed tests,
formal-workspace entry, proof verification, review, Studio export, and backup/import.
No real-app browser or physical-device pass is claimed by this package. iOS support
is not added. An unavailable verifier must leave formal work pending rather than
award credit or record a wrong answer.

`docs/curriculum-data.json` is intentionally absent from the patch. It must be built
by the official Python exporter after merging all source changes. Do not publish the
review JSON. No taxonomy rebuild is needed: the Calculus branch already exists.

## Shared compatibility changes

The native catalog reaches 62 embedded assets when this batch is added to the
reviewed baseline. Studio previously counted the entire native asset catalog before
adding illustration-library figures to a one-lesson draft. It could therefore omit
valid teaching figures once unrelated assets pushed that count over 60.

The fix filters native assets to the selected lesson's actual media references,
including fallback sources and posters, before constructing its Studio draft.
Library additions and existing strict per-pack limits remain unchanged. A regression
uses eighty extra unrelated native assets and checks both existing trigonometry and
all four new lessons. No imported media limit or verification boundary is relaxed.
Cache references are updated in the normal and protected app entries.

Existing integration tests now compare the relevant lesson membership instead of
assuming no future lessons can exist. The historical Calculus bridge fixture removes
later dependents when reconstructing its pre-batch graph. Its original learning
objectives and mathematical checks are retained. The formal restoration test names
all fourteen pre-existing formal lessons explicitly and still exercises every current
formal lesson; it no longer rejects legitimate additions solely due to a fixed count.

## Media and rebuilding

Eight deterministic Matplotlib SVGs add **147,085 bytes**. On the reviewed baseline,
combined native media is **933,890 bytes**, leaving **66,110 bytes** under the default
1,000,000-byte budget. Batches 1–5 may consume that headroom. Use the new report on the
actual merged tree; an explicit native budget decision belongs to integration.
Do not silently enlarge untrusted portable-pack limits.

```sh
python scripts/build_derivative_batch6_figures.py
```

Question graphs are declarative and parameter-linked; they add no plotted image
attachments. Twelve graph-bearing scenarios cover secants, affine and constant
functions, corners, displaced values, polynomials, poles, and square-root domains.
No explanatory answer caption is reused as an assessment graph caption.

## Validation boundaries

Recorded author checks include 8,400 generated assessment instances (8,000 ordinary,
400 fixed-formal instances), independent derivative/formula oracles, distractor and
domain-restriction rejection, graph resolution/rendering, mandatory-capstone
retention, exact saved-draft restoration, and a synthetic Studio media regression.
The four formal mathematical statements are fixed; repeated runtime instances test
binding and selection, not 400 different theorems.

Twenty standalone Python source/registration tests passed. The actual Python loader
and generator parity test is included but was skipped because the complete QuickMaths
Python package was not installed in the authoring environment. The official export
and complete repository Python suite therefore remain required integration checks.

The broader Pages-artifact JavaScript run recorded 584 passes and the same nine
missing-repository-fixture/source failures as its unchanged baseline. Those are
not claimed as a green full-checkout run. All ten Batch 6 tests passed without skips.
Desktop and mobile layout checks concern the isolated HTML preview, not the live app.
