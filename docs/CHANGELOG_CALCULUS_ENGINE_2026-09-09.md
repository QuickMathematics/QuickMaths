# QuickMaths calculus engine update — 9 September 2026

This release adds authoring and engine capabilities for the calculus sequence. It does not install the lesson-writing task's pending calculus batches or replace tutor review with an automated proof grader.

## 1. Declarative Cartesian question diagrams

- Native templates accept a `diagram` object; portable questions retain its resolved data.
- Supported elements: independently restricted curves, open/closed endpoints, isolated points, secant segments, asymptotes and labels.
- Numeric coordinates bind to public `{name}` givens in the same generation transaction as the prompt. Constant arithmetic in coordinates supports secants such as `from: ["{a}", "({a})**2"]`.
- Graph expressions use a bounded parser: arithmetic, x, literal integer powers through 8, sqrt and abs. No JavaScript, Python, HTML, network URL or imported plotting code executes.
- Explicit exclusions, undefined samples and denominator intervals containing zero break paths. Separately authored open and filled points represent removable holes and assigned boundary values.
- Graph descriptions are keyboard reachable; colors follow the lesson theme and drawings resize on phones.
- Saved visual drafts preserve the original prompt and diagram after template changes. Saved attempts, workspace backups, portable exports and Studio round trips preserve displays.
- Existing prompt-derived geometry diagrams remain supported.

## 2. Structured mathematical display

- `math_blocks` supports aligned piecewise rules, stacked fractions, directed limits, multi-line derivations and interval/set notation.
- Blocks can accompany lesson theory, examples, applications and questions.
- Each block requires an authored accessible description and copyable `linear_text`. Text is escaped, bounds are checked, and narrow displays can scroll horizontally.
- Native bindings use only public prompt givens. Unknown placeholder variables are rejected. Literal set notation remains text.
- Native generated and fixed explanations retain authored line breaks as separate solution steps. The native question bank was rebuilt to apply that correction; comparison confirmed its prompts, answers, templates and media are unchanged.

## 3. Typed limit-work capture and review

- Added `limit_steps` with authored original expression, variable, approach, direction and domain restrictions.
- Learners enter the setup, restrictions, steps, a result kind and an optional finite value. Finite limits, positive infinity, negative infinity and no common limit are separate values.
- Setup comparisons ignore whitespace only and require the first step to retain the original expression. Original restrictions must survive cancellation. Changed or extra restrictions prompt correction/review.
- Incomplete drafts autosave, restore and remain editable. Typed work is visible in results and available to tutor review with its original limit metadata.
- This mode forces required work, tutor review and a mastery gate; self-review is disabled.
- **Important limit:** these checks do not prove algebraic transformations, domain sufficiency, quotient-law hypotheses, continuity, IVT applicability or uniqueness. Shape-valid invalid reasoning remains pending review. Open arguments should continue using the established proof/rubric review modes. A domain-aware semantic limit proof grader is not part of this release.

## 4. Native media budget bridge

- The exporter retains the default native embedded budget of **1,000,000 raw bytes**.
- Added an explicit `--native-media-budget` option for native builds only. Imported-pack limits and media integrity checks remain separate.
- `--media-report` writes total bytes, remaining budget, asset count and deduplicated attribution by branch, subdomain and source folder.
- `--previous-media-report` adds growth compared with the previous batch's total.
- The current checked-in native curriculum uses **344,340 bytes across 30 embedded assets**, leaving **655,660 bytes** under the default cap. This is the local repository build, not the lesson-writing task's separate review curriculum.
- **Future work:** immutable hosted native chunks, lazy chunk delivery and an explicit verified offline download workflow. This release keeps embedded assets and makes no new offline availability promise.

## 5. Studio and documentation

- Studio now previews structured math and resolved Cartesian graphs, including the original native runtime generator preview.
- Optional advanced display-data editors validate JSON and keep invalid intermediate edits editable; invalid data cannot be exported/installed.
- Math displays are editable on lessons, examples, applications and questions. Graph data is editable on questions.
- Added guided limit setup fields and a `Limit argument · tutor review` option.
- Updated the main authoring guide's media, grading/work and Studio sections, so existing WebMCP guide topics include the new capabilities.
- Added `CALCULUS_ENGINE.md`, `MATH_DISPLAY.md`, and strict graph/math/limit schemas.
- Updated the agent manifest and learner/educator Markdown guides; rebuilt and visually checked both downloadable PDF guides.
- Refreshed the changed app, bridge, guide and curriculum cache revisions.
- Preserved the original task-start timestamp in `agent-task.json`.

## Validation

Focused checks covered:

- 100 seeded JavaScript question variants and 100 Python graph variants;
- quadratic secants, piecewise jumps with independent filled values, removable holes, restricted roots and a pole between sample positions;
- rejection of unsupported expressions, unknown keys and hidden-variable references;
- restoration after template-default changes; saved attempts and backup preservation;
- Studio import/edit/export round trips and mandatory limit review;
- malicious display text, endpoint symbols, literal sets and multi-line explanations;
- incomplete limit form autosave/reload;
- desktop and 390px mobile layouts, keyboard focus, light/dark diagram contrast and no page overflow;
- native export and media-report arithmetic;
- authoring guide retrieval through existing WebMCP topics;
- generated PDF pages with the new learner and educator sections.

No full app test-suite run was used. Focused JavaScript and Python tests, the native build, browser checks and diff checks passed.

## Principal implementation files

- Browser: `cartesian-diagrams.js`, `question-diagrams.js`, `math-display.js`, `math-display.css`, `limit-work.js`, `challenge-core.js`, `challenge.js`, `challenge.css`, `lesson-creator.js`.
- Python: `models.py`, `content_loader.py`, `problem_generator.py`, `lesson_display.py`, `limit_work.py`, `validation.py`, `work_checker.py`.
- Build/schema: `export_web_curriculum.py`, the guide PDF builders, `skill.schema.json`, and the new Cartesian, math-display and limit-work schemas.
- Documentation: `CUSTOM_LESSON_SETS.md`, `CALCULUS_ENGINE.md`, `MATH_DISPLAY.md`, `STUDENT_GUIDE.md`, `EDUCATOR_GUIDE.md`, both guide PDFs, and `agent-manifest.json`.
