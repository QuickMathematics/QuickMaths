# Quick Maths Authoring Guide

This guide explains how to write Quick Maths curriculum YAML safely and efficiently. It is meant for authors who want to add a lot of content without having to change Python code each time.

Quick Maths is built around one main idea:

> A skill YAML file should contain enough structure for the app to generate questions, grade final answers, collect work, route proof/review cases, update mastery, and hand useful context to an AI or human tutor.

The current implementation is local-first and conservative. It can autograde final answers and some algebra work, but it does not pretend to fully understand every proof or every line of reasoning. For proof-heavy work, the app stores structured review data and blocks mastery until review is entered.

## Fast Authoring Loop

Use this loop whenever adding or editing content:

1. Create or edit one skill YAML file in `content/math/algebra_foundations/skills/`.
2. Add the skill ID to `content/math/algebra_foundations/track.yaml`.
3. Run strict validation:

   ```powershell
   python -m quickmaths.cli validate-content --strict-warnings
   ```

4. Open the dev Streamlit app:

   ```powershell
   streamlit run app/Quick_Maths_Dev.py
   ```

5. Open the `Author Preview` page.
6. Select the skill.
7. Generate 10 or more samples per generated template.
8. Check that:
   - Every generated sample renders cleanly.
   - Expected answers grade as correct.
   - No prompt shows ugly artifacts like `+ -`, `1x`, or `-1x`.
   - Work mode and review policy match the skill's intent.
9. Take the skill's Mastery Test once in the UI.
10. If the skill uses proof or rubric review, save a review and confirm mastery updates correctly.

For large content expansion, do not add 50 skills and then validate. Add one concept cluster at a time, use Author Preview, and keep the graph valid after every change.

## Repository Layout

Important author-facing files:

```text
content/math/algebra_foundations/track.yaml
content/math/algebra_foundations/skills/*.yaml
docs/AUTHORING_GUIDE.md
docs/DATA_FORMATS.md
data/exports/
```

Important implementation files for authors who want to verify behavior:

```text
quickmaths/content_loader.py      # YAML loading into dataclasses
quickmaths/models.py              # Data model fields
quickmaths/problem_generator.py   # Generated question rendering
quickmaths/grading.py             # Final answer grading
quickmaths/math_syntax.py         # School math notation normalization
quickmaths/work_checker.py        # Work/proof/rubric checking state
quickmaths/review.py              # Per-obligation and rubric review helpers
quickmaths/validation.py          # Content validation
quickmaths/author_preview.py      # Author Preview helper logic
app/dev_tools.py                  # Dev-only Author Preview Streamlit UI
app/dev_pages/01_Lessons_Dev.py   # Dev-only unlocked test launcher
app/Quick_Maths_Dev.py            # Dev entrypoint with Author Preview enabled
```

## Future Multi-Track Layout

The current default content lives under:

```text
content/math/algebra_foundations/
```

That is the first track, not the intended final shape of the project. As Quick Maths grows, use a layout like this:

```text
content/
  math/
    arithmetic_foundations/
    algebra_foundations/
    proof_foundations/
    calculus/
  physics/
    mechanics/
  chemistry/
    stoichiometry/
  programming/
    python_foundations/
```

Create a new track when:

- The prerequisite graph has a different starting point or audience.
- The skill cluster belongs to a different subject or major subdomain.
- The skills should be tested and navigated as a coherent map.
- Adding the skills to an existing track would make the map noisy or misleading.

Add to an existing track when:

- The new skill is a direct prerequisite, unlock, review skill, or application inside that track.
- The learner would naturally expect to see it on the same map.
- The same mastery sequence still applies.

For now, the app defaults to `content/math/algebra_foundations/`. Multi-track selection is a future app concern, but authors should organize new content with that layout in mind.

## Mental Model

Quick Maths separates these things:

- `final_answer`: the learner's final answer. This is what the app autogrades.
- `work`: the learner's shown work, proof, or explanation. This may be checked conservatively, stored for tutor review, or sent to a manual review flow.
- `answer_mode`: tells the UI whether work is optional, required, structured, or proof-like.
- `work.mode`: tells the work checker how to handle work.
- `review_policy`: tells mastery whether manual review is needed before proving the skill.

This separation is important. Do not put proof text into the final answer. Do not expect final-answer grading to judge reasoning quality. Put the short final result in `answer.value`; put reasoning expectations in `work`.

## Which Mode Should I Use?

Most authoring confusion comes from choosing `answer_mode`, `work.mode`, and `review_policy` together. Use this table as the default decision point.

| Authoring goal | `answer_mode` | `work.mode` | `review_policy.work_review` | `mastery_requires_review_pass` |
| --- | --- | --- | --- | --- |
| Simple arithmetic | `final_only` | `none` | `none` or `optional` | `false` |
| Algebra answer only | `final_only` | `none` | `optional` | `false` |
| Algebra with checked steps | `final_plus_required_work` | `procedural_steps` | `auto` | `false` |
| Optional explanation | `final_plus_optional_work` | `capture_only` | `optional` | `false` |
| Reviewed reasoning not safely autograded | `final_plus_required_work` | `proof_obligations` | `self_review` | `true` |
| Proof with tutor review | `final_plus_required_work` | `proof_obligations` | `tutor_required` | `true` |
| Open-ended project | `final_plus_required_work` | `rubric_check` | `tutor_required` | `true` |
| Self-study proof | `final_plus_required_work` | `proof_obligations` | `self_review` | `true` |

Rules of thumb:

- If the final answer alone is enough, use `final_only`.
- If the work should be checked automatically, use `procedural_steps` with `work_review: auto`.
- If reasoning quality matters and the app cannot safely autograde it, use `proof_obligations` or `rubric_check`.
- Do not use `proof_obligations` just to mean "show your work" for ordinary algebra. Use `procedural_steps` when equivalence or equation-preserving steps can be checked.
- If mastery should wait for review, set `mastery_requires_review_pass: true`.
- If the learner can practice without review blocking mastery, keep `mastery_requires_review_pass: false`.

## Track Files

A track file defines the curriculum map.

Current default track:

```yaml
id: TRACK_MATH_ALGEBRA_FOUNDATIONS
schema_version: 0.2
name: Algebra Foundations
domain: Math
description: Core algebra skills needed for higher math, physics, programming, and STEM.
entry_skills:
  - MATH_PREALG_002
exit_skills:
  - MATH_ALG_002
skills:
  - MATH_PREALG_002
  - MATH_PREALG_003
  - MATH_ALG_001
  - MATH_ALG_002
  - MATH_PROOF_001
```

Fields:

- `id`: stable track ID.
- `schema_version`: content schema version. Current supported version is `0.2`.
- `name`: human-readable track name.
- `domain`: broad subject.
- `description`: plain-language track description.
- `entry_skills`: starting nodes.
- `exit_skills`: terminal or milestone nodes.
- `skills`: ordered list of skill IDs included in this track.

Rules:

- Every skill listed in `track.yaml` must have a YAML file.
- Every skill YAML file should be listed in `track.yaml`.
- The prerequisite graph must be acyclic.
- Track order should roughly match the learning path, even though prerequisites are the true graph structure.

## Schema Versioning, Drafts, And Deprecation

Quick Maths content now has a lightweight schema/versioning policy.

Put the schema version at the track level:

```yaml
id: TRACK_MATH_ALGEBRA_FOUNDATIONS
schema_version: 0.2
name: Algebra Foundations
```

Skill files may also declare it when needed:

```yaml
id: MATH_ALG_014
schema_version: 0.2
name: Factoring quadratics
```

Current behavior:

- If omitted, `schema_version` defaults to `0.2`.
- Validation rejects unsupported schema versions.
- The app currently supports schema version `0.2`.

### Draft Skills

Use drafts for unfinished content that should not appear in the learner app.

Supported patterns:

```yaml
id: MATH_DRAFT_001
schema_version: 0.2
draft: true
name: Draft skill
```

or place draft files in:

```text
content/math/algebra_foundations/drafts/
```

Current behavior:

- Normal app loading ignores `draft: true` skills.
- Normal app loading ignores `drafts/`.
- Normal validation ignores drafts.
- To validate draft content, run:

  ```powershell
  python -m quickmaths.cli validate-content --include-drafts
  ```

Draft rules:

- Do not list draft skills in `track.yaml`.
- Do not use draft skills as prerequisites for live skills.
- Prefer `draft: true` when the file is temporarily in `skills/`.
- Prefer `drafts/` for larger unfinished batches.

### Deprecated Skills

Use deprecation when a skill should remain loadable for old progress data but should no longer be assigned as the preferred learning path.

```yaml
id: MATH_ALG_014
deprecated: true
replacement_skill_id: MATH_ALG_021
name: Old factoring skill
```

Policy:

- Do not reuse deprecated IDs.
- Keep the deprecated YAML file if old progress may reference it.
- Set `replacement_skill_id` whenever possible.
- Validation warns when `deprecated: true` has no replacement.
- Validation warns when `replacement_skill_id` does not point to a loaded skill.

## Skill File Naming

Skill files currently live here:

```text
content/math/algebra_foundations/skills/
```

Recommended filename pattern:

```text
SKILL_ID_short_readable_slug.yaml
```

Example:

```text
MATH_PREALG_002_combining_like_terms.yaml
```

The filename is for authors. The actual ID comes from the YAML `id` field.

## Skill IDs And Learner-Facing Names

Use stable IDs for internal references:

```yaml
id: MATH_PREALG_002
```

Use human-readable names for learners:

```yaml
name: Combining like terms
```

The UI should generally show names, not IDs. IDs are still used in:

- YAML prerequisites.
- YAML unlocks.
- Stored progress.
- Exports.
- Author Preview.
- Debugging.

ID conventions:

- Use uppercase stable IDs.
- Do not rename IDs after content has shipped unless you are willing to migrate progress data.
- Prefer a domain prefix, level prefix, and sequence number, such as `MATH_PREALG_002`.
- Keep question IDs stable too, such as `LIKE_TERMS_001`.

## Minimal Skill Skeleton

Use this as a starting point:

```yaml
id: MATH_PREALG_010
schema_version: 0.2
name: New skill name
domain: Math
subdomain: Algebra Foundations
description: One sentence explaining what the learner will be able to do.
prerequisites:
  - MATH_PREALG_002
tags:
  - algebra
  - expressions
unlocks:
  - MATH_PREALG_011
mastery:
  passing_score: 0.8
  minimum_confidence: 3
  review_after_days_if_mastered: 7
  review_after_days_if_learning: 2
theory: |
  Explain the core idea in direct language.

  Keep this concise but useful.
examples:
  - prompt: "Example problem"
    solution: "Final answer"
    explanation: "Short explanation of the method."
test:
  question_count: 5
  randomize_order: true
  questions:
    - id: QUESTION_001
      type: generated
      prompt_template: "Compute: {a} + {b}"
      variables:
        a:
          type: int
          min: 1
          max: 9
        b:
          type: int
          min: 1
          max: 9
      derived:
        c: "a + b"
      answer:
        type: numeric
        value: "{c}"
      grading:
        method: exact_numeric
      explanation_template: |
        Add {a} and {b}.
        The answer is {c}.
      mistake_tags:
        - arithmetic_error
```

## Top-Level Skill Fields

Required by the loader:

- `id`
- `name`
- `domain`
- `subdomain`
- `description`
- `prerequisites`
- `mastery`
- `theory`
- `test`

Expected in high-quality content:

- `schema_version`
- `tags`
- `unlocks`
- `examples`
- `applications`
- `node_type`
- `draft` only for unfinished content
- `deprecated` and `replacement_skill_id` only for retired content

### `description`

Write one sentence that says what the learner can do.

Good:

```yaml
description: Simplify expressions by collecting terms with the same variable part.
```

Weak:

```yaml
description: Like terms.
```

### `prerequisites`

This controls locking. A skill is ready only when all prerequisites are `proven` or `mastered`.

```yaml
prerequisites:
  - MATH_PREALG_003
```

Use prerequisites for genuine dependencies, not loose suggestions.

### `unlocks`

This is optional author metadata. The graph also computes unlocks from prerequisites, but explicit `unlocks` makes the YAML easier to read.

```yaml
unlocks:
  - MATH_ALG_001
```

### `tags`

Tags help with analysis, tutor summaries, and future filtering.

Use broad, reusable tags:

```yaml
tags:
  - algebra
  - equations
  - inverse_operations
```

Avoid one-off tags that will never repeat.

### `node_type`

Optional. Defaults to `concept`.

Possible authoring meanings:

- `concept`: a normal skill.
- `procedure`: a repeatable method.
- `proof`: a proof or reasoning skill.
- `application`: applied use of previous skills.

The code does not currently enforce a fixed node type list.

## Mastery Rules

Example:

```yaml
mastery:
  passing_score: 0.8
  minimum_confidence: 3
  review_after_days_if_mastered: 7
  review_after_days_if_learning: 2
```

Fields:

- `passing_score`: fraction from 0 to 1. A value of `0.8` means 80 percent.
- `minimum_confidence`: learner confidence threshold, currently 1 to 5 in the UI.
- `max_guessing_allowed`: model field exists, default `maybe`; current status logic mainly checks that the learner did not answer `guessed: yes`.
- `review_after_days_if_mastered`: used to schedule review.
- `review_after_days_if_learning`: used to schedule review while learning.

Status behavior:

- No progress and prerequisites met: `ready`.
- No progress and prerequisites unmet: `locked`.
- Passing score, enough confidence, and not guessed: `proven`.
- A second successful review/attempt can become `mastered`.
- Proven/mastered skills can become `rusty` after their review date.
- Pending manual review keeps the skill in `learning`.

## Theory And Examples

Theory is displayed on the lesson page. It should teach the idea, not just define it.

```yaml
theory: |
  Like terms have the same variable part. Add or subtract their coefficients and keep the variable part unchanged.

  In 3x + 5x, both terms are x-terms, so 3x + 5x = 8x.
```

Examples:

```yaml
examples:
  - prompt: "Simplify: 4x + 7x"
    solution: "11x"
    explanation: "Add the coefficients 4 and 7."
```

Authoring advice:

- Use at least two examples for major skills.
- Include one standard example and one common trap.
- Keep examples aligned with the generated tests.
- Do not rely on examples for grading. Tests define grading.

### Mini Style Guide For Theory

Theory sections should usually include five pieces:

1. Plain-language definition.
2. Why it matters.
3. Core method or decision rule.
4. One standard example.
5. One common mistake or trap.

Template:

```yaml
theory: |
  Plain-language definition of the idea.

  Why it matters: explain where this skill shows up next.

  Method:
  1. First move.
  2. Second move.
  3. Check the result.

  Example:
  Show one short worked example.

  Common mistake:
  Name the mistake and show how to avoid it.
```

Keep the tone direct and learner-facing. Avoid textbook filler. If the skill is small, the theory can be short, but it should still teach the idea and warn against the main trap.

## Applications

`applications` is optional metadata used in skill details when present.

Suggested shape:

```yaml
applications:
  - title: "Physics formulas"
    description: "Combining like terms helps simplify expressions before substituting values."
  - title: "Programming"
    description: "Symbolic simplification mirrors how expressions are reduced in code."
```

The code stores this as a list of mappings. Keep it simple and human-readable.

## Test Block

Every skill needs a `test` block:

```yaml
test:
  question_count: 5
  randomize_order: true
  questions:
    - id: QUESTION_001
      type: generated
      ...
```

Fields:

- `question_count`: number of problem instances in a mastery test.
- `randomize_order`: whether templates are shuffled before selection.
- `questions`: fixed or generated question templates.

Important behavior:

- If `question_count` is larger than the number of templates, templates repeat.
- For generated templates, each selected instance gets a fresh random seed.
- `randomize_order: true` shuffles templates, not the internals of a generated problem.

Recommended patterns:

- Use `question_count: 5` for small skills.
- Use 2 to 5 templates per skill at first.
- Let generated templates create variety.
- Prefer generated questions over long lists of fixed questions for procedural algebra.
- Use fixed questions for proof prompts, conceptual statements, or very specific theorem checks.

## Question Template Fields

Common fields:

```yaml
- id: LIKE_TERMS_001
  type: generated
  prompt_template: "Simplify: {a}x + {b}x"
  variables: {}
  derived: {}
  constraints: []
  answer: {}
  grading: {}
  explanation_template: ""
  solution_steps: []
  mistake_tags: []
  difficulty: medium
  options: []
  max_attempts: 100
  answer_mode: final_only
  work:
    mode: none
  review_policy:
    work_review: optional
    mastery_requires_review_pass: false
```

Only some of these are required for every question, but it is useful to understand all of them.

### `id`

Stable question/template ID.

Rules:

- Must be unique within the skill.
- Should not change after attempts exist.
- Use a readable prefix, such as `LIKE_TERMS_001`.

### `type`

Supported:

- `generated`
- `fixed`

If omitted, loader defaults to `generated`.

### `prompt` And `prompt_template`

For fixed questions, use either:

```yaml
prompt: "State the conclusion of the theorem."
```

Fixed questions do not need a `variables` block. Do not add a one-value `dummy` variable just to make a constant question generate; use `type: fixed`.

For generated questions, use:

```yaml
prompt_template: "Simplify: {a}x + {b}x"
```

The loader stores both as `prompt_template`. Generated templates replace `{...}` placeholders.

Placeholders may contain a safe expression such as `{a * d}`, but named `derived` values are preferred when the result is reused in prompts, answers, constraints, or explanations. Named values are easier to preview and diagnose:

```yaml
derived:
  left_cross: "a * d"
  right_cross: "c * b"
explanation_template: |
  {a} * {d} = {left_cross}.
  {c} * {b} = {right_cross}.
```

### `difficulty`

`difficulty` is currently stored on problem instances and surfaced in preview/export contexts more than it is used for adaptive sequencing. Still, authors should use a shared meaning now so the content is ready for future adaptive selection.

Recommended values:

- `easy`: isolates the new concept with minimal friction.
- `medium`: standard mastery case for the skill.
- `hard`: includes sign, fraction, term-order, or multi-step friction.
- `challenge`: combines this skill with prior skills or requires transfer.

Examples:

```yaml
difficulty: easy
```

```yaml
difficulty: hard
```

Guidelines:

- Every major procedural skill should eventually have easy, medium, and hard templates.
- Challenge questions should not be required for basic mastery unless the skill itself is advanced.
- Do not use `hard` just because numbers are larger. Use it when the reasoning burden is meaningfully higher.
- If a hard template depends on a prior skill, make sure that prior skill is a prerequisite.

## Generated Questions

Generated questions are the most important authoring tool. They let one YAML template create many problem instances.

Example:

```yaml
- id: LIKE_TERMS_001
  type: generated
  prompt_template: "Simplify: {a}x + {b}x"
  variables:
    a:
      type: int
      min: -9
      max: 9
      exclude: [0]
    b:
      type: int
      min: -9
      max: 9
      exclude: [0]
  derived:
    c: "a + b"
  constraints:
    - "c != 0"
  answer:
    type: expression
    value: "{c}x"
  grading:
    method: symbolic_expression
  explanation_template: |
    Combine the x coefficients: {a} + {b} = {c}.
    The simplified expression is {c}x.
```

Generation order:

1. Generate base `variables`.
2. Compute `derived` values using `safe_eval`.
3. Check every `constraint`.
4. Render `prompt_template`, `answer.value`, and `explanation_template`.
5. Grade the expected answer during validation/preview.

### Variable Types

Supported variable types:

- `int`
- `decimal`
- `fraction`
- `choice`

#### `int`

```yaml
a:
  type: int
  min: -9
  max: 9
  exclude: [0, 1, -1]
```

Rules:

- `min` and `max` are inclusive.
- `exclude` is optional.
- Use `exclude` to avoid degenerate cases like zero coefficients.

#### `decimal`

```yaml
a:
  type: decimal
  min: 0.5
  max: 5.0
  places: 1
```

Rules:

- `places` controls decimal precision.
- If `places: 1`, candidates move in tenths.
- Use this sparingly until there are more decimal-specific tests.

#### `fraction`

```yaml
a:
  type: fraction
  numerator_min: 1
  numerator_max: 5
  denominator_min: 2
  denominator_max: 9
  exclude_zero_numerator: true
```

Rules:

- Denominator must be positive.
- Fractions are rendered as `numerator/denominator`.
- Avoid huge ranges until preview samples are clean.

#### `choice`

```yaml
operation:
  type: choice
  values:
    - add
    - subtract
```

Use `choice` for discrete variants, labels, answer choices, or text fragments.

### Derived Values

Derived values are computed after variables:

```yaml
derived:
  c: "a + b"
  answer_value: "a * x + b"
```

The expression engine supports:

- arithmetic: `+`, `-`, `*`, `/`, `//`, `%`, `**`
- comparisons: `==`, `!=`, `<`, `<=`, `>`, `>=`
- boolean logic: `and`, `or`, `not`
- functions: `abs`, `min`, `max`, `round`
- generated variable names and earlier derived names

Keep derived expressions simple. If you need complex branching, split into multiple templates.

### Constraints

Constraints reject generated values:

```yaml
constraints:
  - "c != 0"
  - "x_total != 0"
```

Use constraints to avoid:

- zero answers when they hide the target skill.
- repeated answer choices.
- division by zero.
- coefficients of `1` or `-1` if the skill is not about that case.
- ambiguous or unsimplified expected answers.

If generation fails too often, increase `max_attempts` or simplify constraints.

```yaml
max_attempts: 250
```

Default is `100`.

### Do Not Overfit Generated Questions

Generated templates can accidentally train weird habits. If every two-step equation has a positive integer answer, learners may start assuming answers are always positive integers. If every simplification is already written in the same term order, learners may learn a pattern instead of the concept.

Build variation across:

- positive and negative answers.
- positive and negative coefficients.
- zero only when pedagogically intended.
- different term orderings.
- constants on either side of an equation when appropriate.
- variables on either side when appropriate.
- easy, medium, hard, and trap cases.
- integer, fraction, and decimal friction when the prerequisite path supports it.

Good generated content usually needs multiple templates, not one giant template. Use separate templates when:

- The explanation wording needs to change.
- One case is a trap case.
- One case is much harder.
- One variable range would make constraints too complicated.
- You need a clean distribution of positive, negative, and mixed cases.

Pedagogical distribution matters more than raw randomness. Author Preview helps catch rendering and grading bugs, but authors still need to decide whether the samples teach the right habits.

### Template Rendering

Placeholders use braces:

```yaml
"Solve: {a}x + {b} = {c}"
```

You can also put simple expressions inside braces:

```yaml
"Compute: {a + b}"
```

Rendering uses `quickmaths.utils.render_template()`, then runs `format_school_expression()`. That means many common ugly forms are cleaned up:

- `4x + -3` becomes `4x - 3`
- `1x` becomes `x`
- `-1x` becomes `-x`

Still use Author Preview. Formatting helpers are helpful, not magic.

## Answer Blocks

Every question needs an `answer` block:

```yaml
answer:
  type: expression
  value: "{c}x"
```

Common answer fields:

- `type`: author-facing answer type.
- `value`: expected final answer.
- `variable`: required for `equation_solution`.
- `accepted_forms`: allowed final text forms for theorem/conclusion questions.

The app mostly grades by `grading.method`, not by `answer.type`. Keep them aligned anyway.

## Grading Methods

Supported methods:

- `exact_text`
- `exact_numeric`
- `numeric_with_tolerance`
- `multiple_choice`
- `symbolic_expression`
- `equation_solution`
- `inequality_solution`
- `theorem_conclusion`

### `exact_text`

Use for short text answers where exact wording is expected.

```yaml
answer:
  type: text
  value: "commutative property"
grading:
  method: exact_text
```

Behavior:

- Normalizes whitespace.
- Case-insensitive.

Do not use for algebraic expressions.

### `exact_numeric`

Use for exact numeric answers.

```yaml
answer:
  type: numeric
  value: "{c}"
grading:
  method: exact_numeric
```

Behavior:

- Uses math syntax parsing.
- Fractions like `3/4` can compare to equivalent decimal/expression forms when parseable.

### `numeric_with_tolerance`

Use when rounding is expected.

```yaml
answer:
  type: numeric
  value: "3.1416"
grading:
  method: numeric_with_tolerance
  tolerance: 0.001
```

Always declare `tolerance`. Validation warns if it is missing.

### `multiple_choice`

Use when answer choices are shown.

```yaml
options:
  - id: A
    label: "2"
  - id: B
    label: "3"
answer:
  type: multiple_choice
  value: "B"
grading:
  method: multiple_choice
```

Current UI submits the option `id`, not the label.
Generated placeholders in option labels are rendered before the choices are displayed.

### `symbolic_expression`

Use for expressions where equivalent forms should count.

```yaml
answer:
  type: expression
  value: "2x + 6"
grading:
  method: symbolic_expression
```

Examples that can grade equivalent:

- `2x + 6`
- `2*(x+3)`
- `6 + 2x`

Do not use this for equations like `x = 4`; use `equation_solution`.

### `equation_solution`

Use for solving equations.

```yaml
answer:
  type: equation_solution
  variable: x
  value: "{x}"
grading:
  method: equation_solution
```

Learners may enter:

- `4`
- `x = 4`
- `4 = x`

The answer block must declare `variable`.

Fraction solutions use the same school-notation parser as symbolic expressions. Inputs such as `x = 3/5`, `3/5`, and `x = -3/5` are supported.

### `inequality_solution`

Use for equivalent one-variable inequalities when spacing, Unicode signs, or algebraically equivalent forms should count:

```yaml
answer:
  type: inequality
  value: "x < {bound}"
grading:
  method: inequality_solution
```

Examples such as `x < 5`, `2x < 10`, and `x<5` compare by their real solution sets. The current Algebra Foundations inequality content may continue using `exact_text` until authors intentionally migrate it.

### `theorem_conclusion`

Use for proof conclusions or theorem statements where a short accepted statement is enough for the final answer.

```yaml
answer:
  type: theorem_conclusion
  value: "sqrt(2) is irrational"
  accepted_forms:
    - "sqrt(2) is irrational"
    - "therefore sqrt(2) is irrational"
grading:
  method: theorem_conclusion
```

Preferred source of truth:

- Put `accepted_forms` under `answer`.
- Keep `grading` to `method: theorem_conclusion`.

The current code also accepts `grading.accepted_forms` as a fallback for older content. Avoid duplicating the list in new YAML unless you are maintaining legacy files and need both during a transition.

Use `sqrt(2)` in YAML. Avoid pasted square-root glyphs unless you have verified encoding in Author Preview.

## Learner Math Syntax

Learners should not need Python syntax.

Supported school-style notation includes:

- `2x` for implicit multiplication.
- `2(x + 3)` for implicit multiplication.
- `x^2` for exponents.
- `3/4` for fractions.
- `x = 4` for equation solutions.
- `sqrt(x)` for square roots.
- `sqrt(x+1)` for grouped square roots.
- `pi` and `e`.

Also normalized:

- Unicode minus to `-`.
- multiplication dot or times sign to `*`.
- division sign to `/`.
- `pi` and common pi symbol forms.

Authoring advice:

- In YAML, prefer ASCII: `sqrt(2)`, `x^2`, `3/4`.
- In expected answers, avoid unnecessary spaces that make text answers brittle.
- For symbolic math, let grading handle equivalent forms.
- For text theorem conclusions, list a few accepted forms.

## Answer Modes

Every question always collects a final answer. `answer_mode` controls whether work is also expected.

Supported values:

- `final_only`
- `final_plus_optional_work`
- `final_plus_required_work`
- `structured_steps`
- `proof_required`

Example:

```yaml
answer_mode: final_plus_required_work
```

Guidelines:

- Use `final_only` for ordinary short-answer questions.
- Use `final_plus_optional_work` when work is helpful but not required.
- Use `final_plus_required_work` for algebra where steps matter.
- Use `structured_steps` with `work.mode: procedural_steps`.
- Use `proof_required` or `final_plus_required_work` with `work.mode: proof_obligations` for proofs.

## Work Modes

The `work` block tells the app what to do with shown work.

Supported `work.mode` values:

- `none`
- `optional`
- `required`
- `structured`
- `capture_only`
- `procedural_steps`
- `proof_obligations`
- `rubric_check`

Older aliases:

- `optional` maps to captured work.
- `required` maps to captured work.
- `structured` maps to procedural steps.

Prefer the explicit newer modes for new content.

### `none`

No work field:

```yaml
work:
  mode: none
```

### `capture_only`

Collect work without checking it:

```yaml
answer_mode: final_plus_optional_work
work:
  mode: capture_only
  prompt: "Show your thinking if useful."
review_policy:
  work_review: optional
  mastery_requires_review_pass: false
```

If `work_review` is `tutor_required` or `self_review`, captured work becomes pending review.

### `procedural_steps`

Use for algebra steps that can be checked conservatively.

Expression example:

```yaml
answer_mode: final_plus_required_work
work:
  mode: procedural_steps
  prompt: "Show each simplification step."
  line_type: expression
  minimum_steps: 2
  require_final_answer_match: true
review_policy:
  work_review: auto
  mastery_requires_review_pass: false
```

Equation example:

```yaml
answer_mode: final_plus_required_work
work:
  mode: procedural_steps
  prompt: "Show each algebra step."
  line_type: equation
  target_variable: x
  minimum_steps: 2
  require_final_answer_match: true
review_policy:
  work_review: auto
  mastery_requires_review_pass: false
```

Inequality example:

```yaml
answer_mode: final_plus_required_work
work:
  mode: procedural_steps
  prompt: "Show each equivalent inequality step."
  line_type: inequality
  target_variable: x
  minimum_steps: 2
  require_final_answer_match: true
review_policy:
  work_review: auto
  mastery_requires_review_pass: false
```

Checker behavior:

- Expression steps must be equivalent line by line.
- Equation steps must preserve the solution set line by line.
- Inequality steps must preserve the real solution set line by line, including reversing the sign after multiplying or dividing by a negative number.
- If `require_final_answer_match: true`, the last work line must match the expected answer.
- Parse failures return `uncertain`.
- Incorrect transformations return `incorrect`.

Limitations:

- It checks equivalence, not pedagogy.
- It does not prove the learner used the intended method.
- It is not a full CAS tutoring engine.
- It should be used for straightforward algebraic transformations.

`target_variable` is recommended whenever the target is not `x`. If omitted, equation and inequality checking defaults to `answer.variable`, then to `x`. Classification questions whose work ends in an identity or contradiction may omit it and set `require_final_answer_match: false`.

### `proof_obligations`

Use for proof questions that need human or AI review.

```yaml
answer_mode: final_plus_required_work
work:
  mode: proof_obligations
  prompt: "Write the proof. You may use obligation tags like [square_both_sides] if helpful."
  proof_policy:
    scope: taught_strategy_only
    accepted_strategies:
      - id: contradiction_parity
        name: Contradiction using parity
        description: "Assume sqrt(2) is rational in lowest terms and derive a contradiction."
        assumptions_required:
          - id: assume_rational_lowest_terms
            label: "Assume sqrt(2) = p/q in lowest terms"
            required: true
        required_obligations:
          - id: square_both_sides
            label: "Derive p^2 = 2q^2"
            required: true
          - id: show_p_even
            label: "Show p is even"
            required: true
            depends_on:
              - square_both_sides
          - id: conclude_irrational
            label: "Conclude sqrt(2) is irrational"
            required: true
            depends_on:
              - show_p_even
        allowed_lemmas:
          - id: even_square_implies_even_base
            label: "If n^2 is even, then n is even"
review_policy:
  work_review: tutor_required
  mastery_requires_review_pass: true
  allow_self_review: true
```

How it works:

- The test page shows the proof skeleton.
- Learner work is required if `answer_mode` or `work.mode` makes it required.
- The app can detect obligation tags like `[square_both_sides]`, but it does not grade the proof automatically.
- The attempt becomes `pending_review`.
- Mastery stays blocked until review is saved.
- The Results page review form lets a reviewer mark each obligation:
  - `satisfied`
  - `flawed`
  - `missing`
  - `not_applicable`
- Review JSON is stored in the database and exported.

Proof obligation ID rules:

- Every obligation needs a stable `id`.
- IDs must be unique within a strategy.
- Dependencies must point to known obligation IDs.
- Dependency cycles are invalid.
- Use stable ASCII IDs such as `show_p_even`.

## Proof-Native Lessons

A proof-native lesson is a normal skill where the app still autogrades the short final answer, but the learner must also submit reviewed reasoning before the skill can become proven or mastered.

Use proof-native lessons when the reasoning cannot be safely checked by automatic equivalence or procedural-step checks. This is appropriate for formal proofs, open conceptual arguments, and special reasoning tasks that need human, AI tutor, or self-review. For ordinary arithmetic, algebra simplification, equation solving, slope calculation, and formula rearranging, prefer `procedural_steps` with `work_review: auto`.

The current proof-native pattern is:

```yaml
answer_mode: final_plus_required_work
work:
  mode: proof_obligations
  prompt: "Justify your final answer. Include these obligation tags in your work when each part is addressed: [state_given], [identify_rule], [show_steps], [conclude_answer]."
  grading: self_review
  proof_policy:
    scope: answer_justification
    accepted_strategies:
      - id: justify_answer
        name: Justify the final answer
        description: "Explain why the final answer follows from the problem using valid mathematical reasoning."
        assumptions_required:
          - id: state_given
            label: "State the given information, expression, equation, graph feature, or target."
            required: true
        required_obligations:
          - id: identify_rule
            label: "Identify the relevant rule, definition, operation, or relationship."
            required: true
          - id: show_steps
            label: "Show valid intermediate reasoning steps."
            required: true
            depends_on:
              - identify_rule
          - id: conclude_answer
            label: "Connect the reasoning to the final answer."
            required: true
            depends_on:
              - show_steps
review_policy:
  work_review: self_review
  mastery_requires_review_pass: true
  allow_self_review: true
```

What each part does:

- `answer_mode: final_plus_required_work` makes the Test page require a final answer and a work/proof field.
- `work.mode: proof_obligations` tells Quick Maths to treat the work as reviewed reasoning, not automatically graded algebra steps.
- `work.prompt` tells the learner what to write. If you want obligation detection to prefill review suggestions, tell learners to include tags like `[show_steps]`.
- `work.grading: self_review` documents the intended review style inside the work block.
- `proof_policy.accepted_strategies` defines the proof skeleton shown on the Test page and the obligation list shown on the Results review form.
- `review_policy.work_review: self_review` makes submitted work become pending review.
- `mastery_requires_review_pass: true` blocks mastery until the review is saved.
- `allow_self_review: true` signals that self-review is acceptable for this lesson style. The Results form still supports `ai_tutor`, `human_tutor`, and `self` reviewer types.

Learner flow:

1. The learner opens a test question.
2. The app always asks for the final answer.
3. The app shows the proof skeleton from `proof_policy`.
4. The learner submits a final answer plus reasoning.
5. The app autogrades only the final answer.
6. The proof work becomes `pending_review`.
7. The Results page asks for obligation-level review.
8. Mastery updates only after all pending review questions are reviewed.

Reviewer flow:

1. Open Results after a proof-native attempt.
2. For each pending question, choose reviewer type, verdict, score, confidence, and feedback.
3. Mark each proof obligation as `satisfied`, `flawed`, `missing`, or `not_applicable`.
4. Save review.
5. When the last pending question is reviewed, Quick Maths recomputes mastery using the review-aware scoring logic.

Use the generic obligation set for broad computational lessons:

- `state_given`: the learner names the starting expression, equation, data, graph feature, or target.
- `identify_rule`: the learner names or clearly uses the relevant operation, definition, theorem, or relationship.
- `show_steps`: the learner gives enough intermediate reasoning to audit the result.
- `conclude_answer`: the learner connects the reasoning to the final answer.

Use custom obligations for formal proof skills or high-value concepts. For example, an irrationality proof should not rely only on `show_steps`; it should have obligations such as `assume_rational_lowest_terms`, `square_both_sides`, `show_p_even`, and `contradiction_lowest_terms`.

Proof-native authoring rules:

- Keep `answer.value` short. It is the final answer, not the proof.
- Put reasoning expectations in `work.proof_policy`.
- Keep obligation IDs stable because saved reviews use them as JSON keys.
- Prefer `self_review` for practice tracks where the learner or AI tutor can review after the attempt.
- Prefer `tutor_required` for high-stakes proofs, projects, or content where mastery should require outside judgment.
- Do not use `work_review: auto` with `proof_obligations`; proof obligations are not automatically graded.
- Run Author Preview after adding proof-native blocks. It should show work mode, review policy, generated samples, and expected-answer grading status.

Common mistakes:

- Setting `mastery_requires_review_pass: true` while leaving `work_review: optional`; validation rejects this.
- Reusing the same obligation ID twice inside one strategy; validation rejects this.
- Adding `depends_on` references to missing obligation IDs; validation rejects this.
- Expecting the app to prove the proof correct automatically. The app only detects tags and stores review data.
- Putting a long proof in `answer.value`; that makes final-answer grading brittle and hides work from the review flow.

### `rubric_check`

Use for open work graded by points.

```yaml
answer_mode: final_plus_required_work
work:
  mode: rubric_check
  prompt: "Explain your reasoning."
  rubric:
    max_points: 5
    criteria:
      - id: clear_assumptions
        label: "States assumptions clearly"
        points: 2
      - id: valid_logical_flow
        label: "Uses valid logical implications"
        points: 3
review_policy:
  work_review: tutor_required
  mastery_requires_review_pass: true
```

How it works:

- The test page shows the rubric.
- The attempt becomes pending review if review is required.
- The Results page lets the reviewer enter awarded points and notes per criterion.
- The app suggests a score as `awarded_points / total_points`.

Rubric rules:

- Every criterion needs a stable `id`.
- Criterion IDs must be unique.
- Points must be positive.
- `rubric.max_points` must match the total criterion points.

## Review Policy

Example:

```yaml
review_policy:
  work_review: auto
  mastery_requires_review_pass: false
  allow_self_review: true
```

Supported `work_review` values:

- `optional`
- `none`
- `auto`
- `tutor_required`
- `self_review`

Use cases:

- `auto`: procedural work checker can check the work.
- `optional`: work can be stored, but does not block mastery.
- `none`: no review.
- `tutor_required`: attempt becomes pending review.
- `self_review`: attempt becomes pending self-review.

`mastery_requires_review_pass: true` means:

- The skill cannot become proven/mastered until review is saved.
- Pending review freezes mastery score.
- A passing review does not override a failed final answer.
- Final answer must still pass unless future YAML explicitly supports work-only grading.

## Review Result JSON

Proof obligation review is stored like this:

```json
{
  "assume_rational_lowest_terms": {
    "status": "satisfied",
    "note": "Stated clearly."
  },
  "square_both_sides": {
    "status": "satisfied",
    "note": ""
  },
  "show_p_even": {
    "status": "flawed",
    "note": "Used the even-square lemma but did not justify it."
  }
}
```

Rubric review is stored like this:

```json
{
  "clear_assumptions": {
    "awarded_points": 2,
    "max_points": 2,
    "note": ""
  },
  "valid_logical_flow": {
    "awarded_points": 2,
    "max_points": 3,
    "note": "One implication needed more justification."
  }
}
```

These IDs are why stable proof/rubric IDs matter.

## Multiple Choice Questions

Example:

```yaml
- id: PROPERTY_MC_001
  type: fixed
  prompt: "Which property says a(b + c) = ab + ac?"
  options:
    - id: A
      label: "Commutative property"
    - id: B
      label: "Distributive property"
    - id: C
      label: "Associative property"
  answer:
    type: multiple_choice
    value: "B"
  grading:
    method: multiple_choice
```

Current UI shows radio choices by option `id`. Keep IDs short and labels clear.

## Mistake Tags

Mistake tags are attached to question templates. If the learner misses that question, the tags can appear in summaries.

Example:

```yaml
mistake_tags:
  - inverse_operations
  - sign_error
  - arithmetic_error
```

Good tags:

- `sign_error`
- `coefficient_error`
- `distribution_error`
- `inverse_operations`
- `order_error`
- `arithmetic_error`
- `proof_structure`
- `contradiction_error`
- `parity_reasoning`

Bad tags:

- `forgot_that_one_we_talked_about`
- `bad`
- `hard_question`
- `mistake_123`

Use tags that can repeat across skills.

## Formatting Generated Math

The app formats rendered templates with `format_school_expression()`, which handles common linear-expression artifacts.

Still, authors should write templates carefully.

Avoid:

```yaml
prompt_template: "Simplify: {a}x + {b}x"
```

if `b` can be negative and you have not checked preview output.

This template is usually okay because formatting will turn `+ -3x` into `- 3x`, but Author Preview should still be your source of truth.

Safer pattern:

```yaml
variables:
  b:
    type: int
    min: 1
    max: 9
```

or split positive and negative cases into separate templates.

Author Preview warns on:

- `+ -`
- `1x`
- `-1x`

If a pattern is mathematically intentional, document it in the skill theory or use a more explicit prompt. The current page warns conservatively.

## Validation

Run:

```powershell
python -m quickmaths.cli validate-content --strict-warnings
```

To include unfinished draft skills:

```powershell
python -m quickmaths.cli validate-content --include-drafts
```

Validation checks:

- Track loads.
- Track schema version is supported.
- Skill YAML files load.
- Skill schema versions are supported.
- Required skill fields exist.
- Track references real skill IDs.
- Extra skill files are reported.
- Draft skills are ignored unless `--include-drafts` is used.
- Prerequisites exist.
- Prerequisite graph has no cycles.
- Deprecated skills declare useful replacement metadata.
- Skill has test questions.
- `test.question_count` is at least 1.
- Question IDs are unique per skill.
- Template type is supported.
- Prompt is present.
- Answer block exists.
- `answer.value` exists.
- Grading method is supported.
- `equation_solution` declares `answer.variable`.
- `numeric_with_tolerance` declares `grading.tolerance`.
- Answer mode is supported.
- Work mode is supported.
- Work grading is supported.
- Review policy is supported.
- `mastery_requires_review_pass` has a review-required policy.
- `auto` review is only used for supported automatic work checking.
- Work shown to learners has a prompt.
- Procedural work declares valid line type and target variable when needed.
- Proof obligations have stable IDs, valid dependencies, and no cycles.
- Rubric criteria have stable IDs and valid point totals.
- Generated questions can dry-run.
- Generated expected answers grade as correct.

Strict warnings means warnings fail the command. Use strict mode before committing content.

## Author Preview Page

Open the dev Streamlit app and use the `Author Preview` page:

```powershell
streamlit run app/Quick_Maths_Dev.py
```

The normal learner app, `app/Quick_Maths.py`, intentionally does not show authoring tools.

The dev app also includes `Lessons-Dev`, a testing launcher that can start a Mastery Test for any skill even if the prerequisite graph would normally lock it. Use this for authoring and QA only; use the normal app when you want learner progress to respect prerequisites.

It shows:

- Validation status.
- Strict validation details.
- Skill selector.
- Raw metadata:
  - `id`
  - `name`
  - `prerequisites`
  - `unlocks`
  - `question_count`
  - template count
  - generated template count
- Generated samples per template.
- Prompt.
- Variable values.
- Expected answer.
- Whether expected answer grades as correct.
- Grading method.
- Work mode.
- Review policy.
- Solution/explanation.
- Generation failures.
- Ugly prompt warnings.

Buttons:

- `Run Strict Validation`
- `Reload Content`
- `Reroll Samples`
- `Export Samples Markdown`
- `Download Current Preview Markdown`

Recommended workflow:

1. Select the skill.
2. Set samples per generated template to 10.
3. Reroll two or three times.
4. Export Markdown if you want to review samples outside the app.
5. Fix any generation failure immediately.
6. Fix any expected-answer grading failure immediately.
7. Treat ugly prompt warnings as content bugs unless there is a clear reason.

Exports are written under:

```text
data/exports/
```

## Common Authoring Patterns

### Combining Like Terms

```yaml
- id: LIKE_TERMS_001
  type: generated
  prompt_template: "Simplify: {a}x + {b}x"
  variables:
    a:
      type: int
      min: -9
      max: 9
      exclude: [0]
    b:
      type: int
      min: -9
      max: 9
      exclude: [0]
  derived:
    c: "a + b"
  constraints:
    - "c != 0"
  answer:
    type: expression
    value: "{c}x"
  grading:
    method: symbolic_expression
  explanation_template: |
    Combine the x coefficients: {a} + {b} = {c}.
    The simplified expression is {c}x.
  mistake_tags:
    - coefficient_error
    - sign_error
```

Why this works:

- Negative coefficients are allowed.
- Zero coefficients are excluded.
- `c != 0` avoids the special answer `0`.
- `symbolic_expression` accepts equivalent expressions.

### Two-Step Equations With Work

```yaml
- id: TWO_STEP_001
  type: generated
  prompt_template: "Solve for x: {a}x + {b} = {c}"
  answer_mode: final_plus_required_work
  variables:
    x:
      type: int
      min: -10
      max: 10
      exclude: [0]
    a:
      type: int
      min: -9
      max: 9
      exclude: [0, 1, -1]
    b:
      type: int
      min: -15
      max: 15
      exclude: [0]
  derived:
    c: "a * x + b"
  answer:
    type: equation_solution
    variable: x
    value: "{x}"
  grading:
    method: equation_solution
  work:
    mode: procedural_steps
    prompt: "Show each algebra step."
    line_type: equation
    target_variable: x
    minimum_steps: 2
    require_final_answer_match: true
  review_policy:
    work_review: auto
    mastery_requires_review_pass: false
```

Why this works:

- The final answer can be `x = 4` or `4`.
- Work is required.
- The work checker verifies equation steps preserve the solution set.
- Manual review is not required.

### Proof With Obligations

```yaml
- id: SQRT2_PROOF_001
  type: fixed
  prompt: "Prove that sqrt(2) is irrational using contradiction and parity."
  answer_mode: final_plus_required_work
  answer:
    type: theorem_conclusion
    value: "sqrt(2) is irrational"
    accepted_forms:
      - "sqrt(2) is irrational"
      - "therefore sqrt(2) is irrational"
  grading:
    method: theorem_conclusion
  work:
    mode: proof_obligations
    prompt: "Write the proof. You may use obligation tags like [square_both_sides] if helpful."
    proof_policy:
      scope: taught_strategy_only
      accepted_strategies:
        - id: contradiction_parity
          name: Contradiction using parity
          assumptions_required:
            - id: assume_rational_lowest_terms
              label: "Assume sqrt(2) = p/q in lowest terms"
              required: true
          required_obligations:
            - id: square_both_sides
              label: "Derive p^2 = 2q^2"
              required: true
            - id: show_p_even
              label: "Show p is even"
              required: true
              depends_on:
                - square_both_sides
            - id: conclude_irrational
              label: "Conclude sqrt(2) is irrational"
              required: true
              depends_on:
                - show_p_even
  review_policy:
    work_review: tutor_required
    mastery_requires_review_pass: true
    allow_self_review: true
```

Why this works:

- Final answer is short and autogradable.
- Proof text is stored separately.
- Manual review is required.
- Per-obligation review data can be saved.
- Mastery stays blocked until review is complete.

## Common Mistakes

### Mistake: Skill exists but is not on the map

Cause:

- Skill YAML exists but skill ID is missing from `track.yaml`.

Fix:

```yaml
skills:
  - YOUR_SKILL_ID
```

### Mistake: Skill is permanently locked

Causes:

- Prerequisite ID is wrong.
- Prerequisite skill is not in the track.
- Prerequisite graph has a cycle.
- Prerequisite was never proven by the learner.

Run validation and inspect the Home map.

### Mistake: Generated question fails sometimes

Causes:

- Constraints are too strict.
- Variable range has no valid candidates.
- Derived expression divides by zero.
- `max_attempts` too low.

Fix:

- Broaden ranges.
- Add safer constraints.
- Split into multiple simpler templates.
- Increase `max_attempts`.

### Mistake: Expected answer does not grade as correct

Causes:

- Wrong grading method.
- Expected answer format does not match method.
- Missing `answer.variable` for equation solutions.
- Symbolic expression is not parseable.
- The rendered expected answer is ugly or invalid.

Fix:

- Use Author Preview.
- Copy the generated expected answer into a test mentally.
- Match `answer.type` and `grading.method`.

### Mistake: Learner sees IDs in normal UI

Cause:

- Author put IDs in `name`, `description`, prompt, or labels.

Fix:

- Keep IDs internal.
- Use readable names and labels.

### Mistake: Proof question autogrades as correct but mastery does not advance

This is expected if:

```yaml
review_policy:
  work_review: tutor_required
  mastery_requires_review_pass: true
```

The final answer can pass, but proof work still needs review.

### Mistake: Work is required but learner can submit empty work

Check:

- `answer_mode` should be `final_plus_required_work`, `structured_steps`, or `proof_required`.
- `work.mode` should be `required`, `procedural_steps`, `proof_obligations`, or `rubric_check`.

## Content Quality Checklist

Before considering a skill ready:

- Skill ID is stable.
- Name is human-readable.
- Description says what the learner can do.
- Prerequisites are real dependencies.
- Unlocks are helpful and not misleading.
- Theory explains the concept in learner language.
- Examples cover normal and tricky cases.
- Test has enough generated variation.
- Every generated template passes Author Preview.
- Expected answers grade as correct.
- Prompt formatting is clean.
- Mistake tags are reusable.
- Work mode matches the skill.
- Review policy matches mastery expectations.
- Proof obligations or rubric criteria have stable IDs.
- Strict validation passes.

## Recommended Expansion Strategy

When building a large curriculum, work in layers:

1. Add the prerequisite skeleton first.
2. Add one or two sample skills per subdomain.
3. Validate the graph.
4. Add generated procedural skills.
5. Add proof/rubric skills only after the relevant review flow is tested.
6. Use Author Preview for every skill.
7. Run the full checks after each batch:

   ```powershell
   python -m pytest
   python -m compileall app quickmaths tests
   python -m quickmaths.cli validate-content --strict-warnings
   ```

The goal is not to make every YAML file clever. The goal is to make every YAML file predictable, previewable, and easy to debug.
