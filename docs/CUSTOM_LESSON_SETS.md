# Agent Lesson Authoring Guide

This is the machine-oriented guide for creating portable QuickMaths subjects and lesson sets. Human authors can use **Lesson studio** inside the app instead: it provides forms, tooltips, a short tutorial, live validation, color pickers, and buttons for every browser-supported feature.

Lesson sets are declarative JSON. QuickMaths never executes uploaded code, HTML, CSS, URLs, generators, or scripts. The browser validates the entire prerequisite graph before installing anything, and an agent may only **stage** a set: a human must click **Install**.

Start with [`lesson-set-example.json`](lesson-set-example.json), or ask an agent to call `get_agent_guide` and `validate_lesson_set`.

## Envelope and subject

Schema 2.0 adds subjects, themes, and cross-subject prerequisite bridges:

```json
{
  "format": "quickmaths.lesson-set",
  "schema_version": "2.0",
  "id": "PACK_CELL_BIOLOGY",
  "name": "Cell Biology",
  "description": "A first biology curriculum.",
  "author": "Your name",
  "version": "1.0.0",
  "subject": {
    "id": "SUBJECT_BIOLOGY",
    "name": "Biology",
    "short_name": "Bio",
    "icon": "🧬",
    "description": "Life from cells to systems.",
    "theme": {
      "paper": "#eef6f1",
      "paperDeep": "#dcebe2",
      "paperLight": "#ffffff",
      "ink": "#18231d",
      "muted": "#607067",
      "line": "#c7d8ce",
      "primary": "#225c48",
      "primaryAlt": "#33765e",
      "tint": "#bfe2ce",
      "highlight": "#e4ef9b",
      "accent": "#e06b54"
    }
  },
  "track": { "skills": ["CUSTOM_BIO_CELL_001"] },
  "skills": []
}
```

- Pack IDs start with `PACK_`; new skill IDs in the default `add` mode start with `CUSTOM_`; subject IDs start with `SUBJECT_`.
- IDs use uppercase letters, numbers, and underscores. Never change a published ID if learner progress may already reference it.
- Use `SUBJECT_MATH` to append lessons to the built-in Mathematics curriculum. Its built-in theme is preserved.
- Reuse an installed custom subject ID to append another pack to that subject. Include the same subject name and theme in the source file so the file stays portable.
- Use a new subject ID to create a separate curriculum and visible subject option.
- Themes accept only the eleven six-digit hex colors shown above. Arbitrary CSS is rejected.
- Schema 1.0 files still load and are migrated into `SUBJECT_MATH`.

Limits: 2 MB per set, 10 installed sets, 50 skills per set, 100 fixed questions per skill, 20 examples, 20 applications, 20 solution steps, 12 tags per field, and 8 multiple-choice options.

## Improving a native QuickMaths lesson

Schema 2.0 also supports a reversible `override` mode for improving a built-in lesson. This is not a new map node: it temporarily replaces the native lesson content under the **same lesson ID**, so completed attempts, mastery, and reviews stay attached. Any unfinished test for an affected lesson restarts at installation or restoration; this prevents answers from one question-bank version crossing into another.

In Lesson Studio, choose **Edit a native lesson**, select the lesson, and click **Open editable copy**. The Studio locks the lesson ID, copies every authoring field, validates the result, and labels the install as a native improvement. In Settings, **Restore original** removes the improvement while preserving completed learner progress.

An agent has the same safe pipeline:

1. Call `open_lesson_creator` with `skill_id` when the human wants to edit visibly in Lesson Studio; or author an override file directly.
2. Keep the exact native lesson ID, its original subject, and every required problem field.
3. Call `validate_lesson_set`, then `stage_custom_lesson_set`.
4. Ask the human to review the staged improvement and click **Install improvement**. The agent cannot install or restore it silently.

The override envelope differs only in `mode` and its IDs:

```json
{
  "format": "quickmaths.lesson-set",
  "schema_version": "2.0",
  "mode": "override",
  "id": "PACK_IMPROVE_MATH_ARITH_001",
  "name": "Improved integer operations",
  "description": "A clearer native lesson with stronger examples.",
  "author": "Your name",
  "version": "1.0.0",
  "subject": {
    "id": "SUBJECT_MATH",
    "name": "Mathematics",
    "short_name": "Maths",
    "icon": "Σ",
    "description": "The built-in Mathematics curriculum."
  },
  "track": { "skills": ["MATH_ARITH_001"] },
  "skills": [
    {
      "id": "MATH_ARITH_001",
      "name": "Integer operations",
      "domain": "Mathematics",
      "subdomain": "Arithmetic",
      "description": "Revised learner-facing description.",
      "prerequisites": [],
      "unlocks": ["MATH_ARITH_002"],
      "tags": ["integers"],
      "mastery": {
        "passing_score": 0.8,
        "minimum_confidence": 3,
        "max_guessing_allowed": "maybe",
        "review_after_days_if_mastered": 7,
        "review_after_days_if_learning": 2
      },
      "theory": "Revised plain-text theory.",
      "examples": [],
      "applications": [],
      "question_count": 1,
      "problems": [
        {
          "template_id": "INTEGER_ADD_REVISED_001",
          "skill_id": "MATH_ARITH_001",
          "difficulty": "easy",
          "prompt": "Compute -6 + 4.",
          "expected_answer": "-2",
          "answer_type": "integer",
          "grading_method": "exact_numeric",
          "solution_steps": ["The signs differ, so subtract 4 from 6 and keep the negative sign."],
          "mistake_tags": ["signed_addition"],
          "answer_mode": "final_only",
          "work": { "mode": "none" },
          "review_policy": { "work_review": "none", "mastery_requires_review_pass": false }
        }
      ]
    }
  ]
}
```

Guardrails are strict: override mode accepts only IDs from the built-in curriculum, rejects a changed subject, rejects two installed improvements targeting the same native lesson, and never changes the total lesson count. New/custom lessons still use `mode: "add"` (or omit `mode`) and must use `CUSTOM_` IDs. To revise an already installed improvement, download its source, restore the original in Settings, then validate and install the replacement. Native improvements apply browser-wide and are not silently embedded into portable curricula; Curriculum Designer blocks export until installed improvements are restored.

Lesson files contain private answer-key fields. Even while helping an author, an agent must not return `expected_answer` or `solution_steps` through learner-facing tool results or tutoring conversation.

## Track and skills

`track.skills` lists every skill in the set exactly once and determines display order. `entry_skills` and `exit_skills` are optional and derived when omitted.

Each skill supports:

```json
{
  "id": "CUSTOM_BIO_CELL_001",
  "name": "Cell structure",
  "domain": "Biology",
  "subdomain": "Cells",
  "description": "Identify organelles and connect structure to function.",
  "prerequisites": [],
  "unlocks": [],
  "tags": ["cell", "organelle"],
  "mastery": {
    "passing_score": 0.8,
    "minimum_confidence": 3,
    "max_guessing_allowed": "maybe",
    "review_after_days_if_mastered": 7,
    "review_after_days_if_learning": 2
  },
  "theory": "Plain-text lesson content.",
  "examples": [
    { "prompt": "Example prompt", "solution": "Example result", "explanation": "Why it works" }
  ],
  "applications": [
    { "title": "Medicine", "description": "How the idea travels into another context." }
  ],
  "question_count": 10,
  "problems": []
}
```

`question_count` is the number of questions in one mastery attempt. It must be a whole number from 1 through the number of entries in `problems`; when omitted, QuickMaths uses the complete bank. Supplying a larger bank than `question_count` gives comprehensive retakes fresh variants without making one attempt endless. The Lesson Studio uses the complete bank for new lessons and preserves the original assessment length when improving a native lesson.

`unlocks` is optional and may contain only skills from the same pack. QuickMaths also derives unlock relationships from prerequisites, including cross-subject links.

## Cross-subject prerequisite bridges

A prerequisite may be a globally unique skill ID:

```json
"prerequisites": ["MATH_ARITH_005", "CUSTOM_CHEM_MOLES_001"]
```

Or use an explicit bridge reference, which also verifies that the referenced skill belongs to the subject you intended:

```json
"prerequisites": [
  { "subject_id": "SUBJECT_MATH", "skill_id": "MATH_ARITH_005" },
  { "subject_id": "SUBJECT_CHEMISTRY", "skill_id": "CUSTOM_CHEM_MOLES_001" }
]
```

The referenced skill must already be built in, appear in the same file, or belong to an installed pack. Install dependency packs before dependent packs. Missing references, incorrect subject references, and cycles anywhere in the combined multi-subject graph are rejected.

Each learner chooses graph behavior in the sidebar:

- **Hard path**: unmet prerequisites lock mastery tests. Lessons remain readable.
- **Open path**: every lesson and test is available; prerequisite lines and cross-subject bridges become recommended preparation.

The file does not force a learner’s mode. The choice belongs to each learner profile and is included in progress backups.

## Fixed mastery questions

Browser lesson sets contain pre-rendered fixed questions:

```json
{
  "template_id": "CUSTOM_BIO_CELL_Q01",
  "skill_id": "CUSTOM_BIO_CELL_001",
  "difficulty": "medium",
  "prompt": "Which organelle produces most cellular ATP?",
  "expected_answer": "B",
  "answer_type": "choice",
  "grading_method": "multiple_choice",
  "options": [
    { "id": "A", "label": "Golgi apparatus" },
    { "id": "B", "label": "Mitochondrion" }
  ],
  "solution_steps": ["Mitochondria carry out aerobic respiration and generate most ATP."],
  "mistake_tags": ["organelle_function"],
  "answer_mode": "final_only",
  "work": { "mode": "none" },
  "review_policy": { "work_review": "none", "mastery_requires_review_pass": false }
}
```

Supported graders:

- `exact_numeric`
- `numeric_with_tolerance` plus numeric `tolerance`
- `multiple_choice` with 2–8 unique `{ "id", "label" }` options
- `python_program` for a learner-authored pure Python function tested inside a disposable, capability-restricted Worker
- `symbolic_expression`
- `equation_solution`
- `inequality_solution` for equivalent one-variable linear solution sets (including reversed signs and strict versus inclusive boundaries)
- `finite_set` for order-independent exact solution members; duplicates are ignored and empty-set aliases are accepted
- `rational_expression` for an equivalent formula **and** the exact original excluded values, with optional reduced-form enforcement
- `interval_set` for normalized intervals, unions, singletons, empty/all-real sets, or equivalent inequalities
- `exact_text`
- `theorem_conclusion`

Use `accepted_forms` for alternate symbolic, equation, text, or theorem conclusions. `solution_steps` is required, is private answer-key data, and is shown only after submission.

## Answer and shown-work modes

Supported `answer_mode` values are `final_only`, `final_plus_optional_work`, and `final_plus_required_work`.

| Goal | `work.mode` | What QuickMaths does |
| --- | --- | --- |
| Final answer only | `none` | No work field is required. |
| Save an explanation | `capture_only` | Requires/stores text when the answer mode requires work. |
| Check algebraic steps | `procedural_steps` | Checks line count, notation, equivalence/equation consistency, and optional final-line match. |
| Solve a rational equation | `rational_equation_steps` | Shows structured restrictions, algebra steps, candidate classification, and original-equation checks. |
| Build a sign chart | `sign_chart_steps` | Shows structured critical-point, interval-test, sign, selection, endpoint, and final-set fields. |
| Trace program state | `code_trace_steps` | Shows formatted Python plus an authored variable/output table and checks every checkpoint without executing package code. |
| Structure a proof | `proof_obligations` | Shows obligations and strategies, captures the proof, and waits for review. |
| Grade open reasoning | `rubric_check` | Shows rubric criteria, captures work, and waits for review. |

### Finite sets, rational expressions, and interval sets

Native YAML uses these answer blocks:

```yaml
answer:
  type: finite_set
  values: ["-2", "5"]
grading:
  method: finite_set
```

The learner may enter `{5, -2}`, `x = -2 or x = 5`, or the same members in another order. Use `values: []` for the empty set. Browser lesson packs store the same information in `answer_metadata.values`; `expected_answer` should be a readable copy such as `{-2, 5}`.

```yaml
answer:
  type: rational_expression
  value: "(x + 4)/(x - 3)"
  excluded_values: ["-2", "3"]
grading:
  method: rational_expression
  require_reduced_form: true
```

This is intentionally stricter than symbolic equivalence: the formula must be equivalent, every original denominator zero must remain excluded, and no extra exclusion may be invented. A canceled factor therefore remains a hole in the domain. In browser lesson packs put `value`, `variable`, and `excluded_values` in `answer_metadata`, and put `require_reduced_form` in `grading_metadata`. The learner sees a separate excluded-values field; they never edit metadata or JSON.

```yaml
answer:
  type: interval_set
  variable: x
  value: "(-inf, -2] U (5, inf)"
grading:
  method: interval_set
```

The interval grader normalizes union order and merges intervals correctly. It accepts `U` or `∪`, `[3,3]` for a singleton, empty/all-real aliases, and equivalent input such as `x <= -2 or x > 5`, `-1 < x <= 4`, or `x != 5`. Infinity must always use an open endpoint. Endpoints may contain exact constants such as fractions, `sqrt(2)`, `pi`, and `e`.

### Rational-equation structured work

Use this mode when the reasoning itself must preserve restrictions and classify candidates:

```yaml
answer_mode: final_plus_required_work
answer:
  type: finite_set
  values: ["4"]
grading:
  method: finite_set
work:
  mode: rational_equation_steps
  prompt: State restrictions, clear denominators, solve, and check every candidate.
  target_variable: x
  original_equation: "1/(x - 1) = 1/3"
  expected_restrictions: ["1"]
  require_restrictions: true
  require_original_equation_check: true
review_policy:
  work_review: auto
```

The learner UI collects:

- original denominator restrictions;
- one algebra step per line;
- candidate values classified as `valid`, `excluded`, `extraneous`, `repeated`, or `non_real`;
- an original-equation check for each valid or extraneous candidate.

QuickMaths compares the submitted restrictions with `expected_restrictions`, checks that every algebra row is an equation, classifies candidates against `original_equation`, and compares candidates marked `valid` with the finite-set final answer. Trusted native YAML may omit `original_equation` and `expected_restrictions` because generation derives both from the rendered prompt; fixed browser/Depot packs must include them when the corresponding checks are required. Lesson Studio provides friendly fields for both. The learner's structured object persists inside the ordinary draft/attempt/backup pipeline as `structuredWorkJson`; authors and learners do not need to write that JSON manually.

### Sign-chart structured work

Use a sign chart when a polynomial or rational inequality is determined by critical points and interval signs:

```yaml
answer_mode: final_plus_required_work
answer:
  type: interval_set
  variable: x
  value: "(-inf, -1) U [2, inf)"
grading:
  method: interval_set
work:
  mode: sign_chart_steps
  target_variable: x
  sign_chart:
    expression_kind: rational
    expression: "(x - 2)/(x + 1)"
    relation: ">="
    expected_factorization: "(x - 2)/(x + 1)"
    reduced_expression: "(x - 2)/(x + 1)"
    require_factorization: false
    critical_points:
      - { value: "-1", kind: undefined, multiplicity: 1, factor: "x + 1" }
      - { value: "2", kind: zero, multiplicity: 1, factor: "x - 2" }
    require_test_values: true
    require_interval_signs: true
    require_endpoint_decisions: true
    require_final_answer_match: true
review_policy:
  work_review: auto
```

`kind` must be `zero`, `undefined`, or `hole`. A zero may be included only for an inclusive relation; a pole or hole is never included. Multiplicity records whether a factor changes sign at that point. The learner editor asks for every critical point, a test value and sign in each interval, which intervals belong in the solution, endpoint decisions, and the final interval set. Interval boundaries are derived and sorted from the critical points. QuickMaths independently computes the sign in each interval, verifies that every learner test value lies strictly inside its row, checks endpoint inclusion, reconstructs the selected set, and compares it with the final authored interval set.

Native templates may place placeholders anywhere inside `work.sign_chart`; the exporter renders that nested metadata recursively. Uploaded packs remain fixed data and never execute arbitrary template expressions.

### Formatted prompt code

Keep `prompt` as the complete plain-text accessibility fallback. Add optional `prompt_blocks` when indentation or line breaks matter:

```json
{
  "prompt": "Trace the program and state what it prints.",
  "prompt_blocks": [
    { "type": "text", "text": "Trace the program and state what it prints." },
    { "type": "code", "language": "python", "text": "x = 2\ny = x + 3\nprint(y)" }
  ]
}
```

Only `text` and `code` blocks are accepted. QuickMaths escapes every character, labels the language, preserves whitespace, and uses horizontal scrolling; it never interprets lesson HTML. A problem may contain at most 12 blocks and 12,000 characters across the blocks. Lesson Studio exposes this as **Formatted code block** beneath the ordinary prompt.

### Structured code traces

`code_trace_steps` checks an authored state model. It displays code but does not execute code from the package:

```json
{
  "answer_mode": "final_plus_required_work",
  "work_required": true,
  "work": {
    "mode": "code_trace_steps",
    "prompt": "Complete every execution checkpoint.",
    "trace_spec": {
      "language": "python",
      "display_code": "x = 2\ny = x + 3\nx = 9\nprint(y)",
      "columns": ["step", "x", "y", "output"],
      "expected_rows": [
        { "step": 1, "x": 2, "y": null, "output": "" },
        { "step": 2, "x": 2, "y": 5, "output": "" },
        { "step": 3, "x": 9, "y": 5, "output": "" },
        { "step": 4, "x": 9, "y": 5, "output": 5 }
      ],
      "comparison": {
        "trim_strings": true,
        "numeric_equivalence": true,
        "blank_equals_null": true
      }
    }
  },
  "review_policy": { "work_review": "auto" }
}
```

`step` is mandatory and stable; other columns are author-chosen simple strings, numbers, booleans, or null. The learner gets ordinary table cells. Submission reports missing rows, duplicate/unexpected step labels, wrong variable values, and wrong output separately. The trace is saved in the same draft, attempt, backup, and tutor-review pipeline as other structured work. In Lesson Studio, enter one column per line and one expected row per line using `|` between cells—authors and learners never have to hand-write the response JSON.

### Sandboxed Python function grading

Use `python_program` only for a deterministic pure-function task:

```json
{
  "prompt": "Implement is_even(number).",
  "expected_answer": "All declared Python tests pass.",
  "answer_type": "code",
  "grading_method": "python_program",
  "program_spec": {
    "runtime": "python_subset_v1",
    "entrypoint": {
      "kind": "function",
      "name": "is_even",
      "parameters": [{ "name": "number", "type": "int" }],
      "return_type": "bool"
    },
    "tests": [
      { "id": "even", "args": [8], "expected_return": true, "visibility": "example" },
      { "id": "odd", "args": [7], "expected_return": false, "visibility": "after_submission" },
      { "id": "zero", "args": [0], "expected_return": true, "visibility": "hidden" }
    ],
    "limits": {
      "wall_time_ms": 1500,
      "step_limit": 20000,
      "memory_mb": 32,
      "stdout_chars": 1000
    },
    "policy": {
      "allowed_builtins": [],
      "imports": [],
      "network": false,
      "storage": false,
      "clock": false,
      "randomness": false
    }
  }
}
```

Supported parameter types are `json`, `bool`, `int`, `float`, `str`, `list`, and `dict`; the return type may also be `none`. Tests contain JSON data only—never expressions, callbacks, source code, URLs, or a package-authored test harness. Include at least one `example` test. `after_submission` results appear only after submission; `hidden` cases never reveal their arguments or expected values in learner-facing results or WebMCP.

The first run loads the self-hosted, integrity-pinned Pyodide 0.28.3 runtime in a module Worker. No executable runtime script or package is fetched from a third-party CDN, and runtime package installation is unavailable. QuickMaths strictly validates the complete payload, parses learner source with a trusted AST supervisor, permits only top-level function definitions and an explicit syntax subset, creates a fresh restricted namespace for every test, and exposes only the authored subset of safe builtins. It rejects imports, classes, decorators, annotations, exception handlers, dynamic evaluation, private/dunder names, unapproved methods, files, process APIs, network, browser APIs, storage, clocks, and randomness. Source and payload bytes, test count, argument depth/size, AST size/depth, repetition and range size, exponent size, integer size, execution steps, aggregate captured output, return size, and wall time are bounded. Every grading run owns one disposable Worker; timeout, cancellation, success, and failure all terminate it, and late messages are ignored. `memory_mb` is a validated forward-compatible contract field, while current browser enforcement relies on the disposable Worker plus structural/data/result bounds rather than claiming a precise per-Worker memory quota.

WebMCP cannot execute learner or agent-authored Python. It may validate or stage a package for visible human review, but the human must install it and the learner must press **Run sandboxed tests** for every run. Learner source and the bounded grade summary persist in the profile, backup, and optional complete-workspace sync; captured stdout is discarded. Runtime-startup failures block assessment submission and never become learner mistakes.

Allowed builtins are: `abs`, `all`, `any`, `bool`, `dict`, `enumerate`, `float`, `int`, `len`, `list`, `max`, `min`, `range`, `round`, `set`, `sorted`, `str`, `sum`, `tuple`, and `zip`. Grant only what the problem needs. The supported value-method allowlist covers ordinary string, list, and dictionary transformations documented in Lesson Studio. Programs that need imports, files, exceptions, classes, command-line input, real time, or randomness remain capture/rubric tasks; do not pretend the subset runs them.

### Checked maths steps are not formal proofs

The Advanced Algebra curriculum primarily uses `procedural_steps`. The learner writes one equivalent equation, inequality, or expression per line, and QuickMaths conservatively checks each transition plus the final-line match. Use `line_type: "equation"` for `=` steps and `line_type: "inequality"` for `<`, `<=`, `>`, or `>=` steps; inequality mode checks the complete one-variable solution set, including sign reversals. That workflow can finish automatically.

`proof_obligations` is a different system. A proof question has two deliberately separate judgments:

1. The short final conclusion is graded with the selected final-answer grader and `accepted_forms`.
2. The proof text is required and stored with the exact obligation checklist shown to the learner.
3. QuickMaths checks that a meaningful submission exists, but never treats a correct conclusion or matching keywords as proof validity.
4. A self, human, or WebMCP tutor records `satisfied`, `flawed`, `missing`, or (for optional items) `not_applicable` for every obligation, with an evidence note. Rubrics receive awarded points and a note for every weighted criterion.
5. QuickMaths derives the review score and verdict from those item-level results. Pending review initially freezes mastery; a completed pass/partial/revision/fail resolution applies +12/+3/0/−6 mastery points, and replacing a review replaces that delta instead of stacking it. A required review must pass before the skill can become Proven.

Author obligations as concrete logical milestones—such as “Derives p² = 2q²” and “Explains the contradiction with lowest terms”—rather than vague instructions such as “Shows good reasoning.” Accepted strategies are legitimate routes the learner may take, not phrases they must reproduce.

Procedural example:

```json
{
  "answer_mode": "final_plus_required_work",
  "work": {
    "mode": "procedural_steps",
    "prompt": "Show one equivalent equation per line.",
    "line_type": "equation",
    "target_variable": "x",
    "minimum_steps": 2,
    "require_final_answer_match": true
  },
  "review_policy": {
    "work_review": "auto",
    "mastery_requires_review_pass": false,
    "allow_self_review": true
  }
}
```

Proof example:

```json
{
  "answer_mode": "final_plus_required_work",
  "work": {
    "mode": "proof_obligations",
    "prompt": "Write a concise proof.",
    "proof_policy": {
      "obligations": ["State the claim", "Justify each inference", "Close the argument"],
      "accepted_strategies": ["direct proof", "contradiction"]
    }
  },
  "review_policy": {
    "work_review": "tutor_required",
    "mastery_requires_review_pass": true,
    "allow_self_review": false
  }
}
```

Rubric example:

```json
{
  "work": {
    "mode": "rubric_check",
    "prompt": "Explain your model and conclusion.",
    "rubric": {
      "criteria": [
        { "id": "model", "description": "Chooses a defensible model", "weight": 2 },
        { "id": "reasoning", "description": "Connects evidence to the conclusion", "weight": 1 }
      ]
    }
  },
  "review_policy": {
    "work_review": "self_review",
    "mastery_requires_review_pass": true,
    "allow_self_review": true
  }
}
```

Supported `work_review` values are `none`, `optional`, `auto`, `self_review`, and `tutor_required`. Proof and rubric modes always enter a pending-review state; QuickMaths does not pretend to semantically autograde open reasoning.

## How the original advanced YAML maps to the web format

The repository’s trusted built-in Mathematics YAML is exported as browser-safe runtime templates, preserving fresh generated values and comprehensive scenario coverage without executing arbitrary code. Uploaded lesson sets deliberately use the fixed-data web format below. Every original authoring concern has an explicit browser path:

| Original YAML capability | Web lesson-set path |
| --- | --- |
| Track metadata and graph | `track`, `skills`, `prerequisites`, subjects, and bridge references |
| Skill metadata, theory, examples, applications, tags | Same learner-facing fields in each skill |
| Mastery thresholds and review intervals | `mastery` block |
| Final answer block and accepted forms | Flattened `expected_answer`, `answer_type`, grader, tolerance, and `accepted_forms` |
| Fixed tests | Direct `problems` entries |
| Generated tests: variables, derived expressions, constraints, prompt/answer templates, retry limits | Trusted built-in Mathematics templates run through the allowlisted browser generator and can be rerolled/audited in Lesson Studio. Uploaded browser files never execute expressions; author them as explicit fixed `problems`. |
| Random order / question count | Native Mathematics shuffles every authored scenario and draws fresh values. For uploaded sets, set `question_count` and optionally supply a larger fixed bank; QuickMaths rotates through a complete configured set. |
| Explanation templates | Pre-render into literal `solution_steps`. |
| Final-only, optional, or required work | `answer_mode` |
| Capture, procedural, rational-equation, sign-chart, code-trace, proof, and rubric workflows | All eight browser `work.mode` values above |
| Review policy and mastery gate | `review_policy` block |
| Draft skills | Keep them in Lesson studio or outside an installed pack; installed packs accept live skills only. |
| Deprecated/replacement skills | Publish a new stable skill ID and keep the old source file for backup compatibility. Browser packs do not silently redirect progress. |

The security boundary is intentional: variables, derived expressions, constraints, and arbitrary generator/grader code are trusted-author build features, not uploaded runtime features. An agent should generate explicit fixed questions or use the repository’s validated Python export pipeline.

## Human Lesson Creator

Open **Lesson studio** in the left sidebar. It can:

- extend an installed subject or create a themed subject;
- create, remove, and switch between multiple lessons;
- select prerequisites across every subject;
- add theory, examples, applications, tags, mastery thresholds, and review timing;
- add fixed questions with every supported grader;
- configure answer modes, capture/procedural/proof/rubric work, and review gates;
- add escaped formatted code blocks, structured trace tables, and declarative sandboxed Python function tests;
- preview the exact answer box, proof checklist, rubric, and review path the learner will see;
- start advanced question types from editable examples with plain-language explanations;
- open an existing JSON file, autosave an author draft locally, validate, download, install, and prepare a public Lesson Depot submission.

It is the preferred route for humans. This guide is the preferred route for agents and advanced source-control workflows.

### Proofs and rubrics in Lesson Studio

There is no special student proof syntax. Choose **Structured proof** under **How the learner answers**, then write one proof obligation per line. Each line becomes a visible checklist item above a required plain-text response box. Accepted proof approaches are suggestions, not exact phrases the learner must type. QuickMaths checks that a response was supplied, saves it with the attempt, and keeps the lesson in Learning until a permitted self, human, or agent review passes it.

Choose **Rubric-reviewed response** for essays, investigations, interpretations, and other open reasoning. Write one observable criterion per line. The learner sees those criteria before answering, and the saved response waits for review in the same way as a proof. The local final-answer grader still checks the separate short answer field; it does not pretend to semantically grade the proof or long response.

## WebMCP workflow

Agents inside a compatible browser should use this sequence:

1. `get_lesson_authoring_guide` with the relevant section (normally `summary`, then `grading_and_work`)
2. `list_subjects`
3. Author a schema 2.0 JSON string
4. `validate_lesson_set`
5. `stage_custom_lesson_set`
6. Tell the human to review the visible preview and click **Install**

`get_lesson_authoring_guide` returns this bundled guide by topic, so an agent does not need a separate network fetch or the entire operating manifest for a small authoring task. Agents cannot call the final install action. They should recommend a full JSON progress backup before curriculum changes and never quote expected answers or solution steps into learner tutoring.

For community lessons, agents can call `search_lesson_depot` to inspect catalog metadata and `stage_depot_lesson` to download, hash-check, validate, and visibly stage a chosen package. `stage_depot_lessons` preflights an ordered group so a later pack may depend on an earlier pack in the same batch, and it rejects aggregate capacity problems before opening the review queue. Neither tool can install anything; the human reviews every item in Settings and clicks **Install** or **Skip** separately.

## Publishing to the Lesson Depot

The public Depot uses this repository as its free backend. Lesson files and catalog hashes live in Git, automated checks run in GitHub Actions, pull requests provide moderation history, and GitHub Discussions provide votes and comments. Browsing and installation require no sign-in. To vote or comment inside QuickMaths, a user can authorize the separate least-privilege QuickMaths Community GitHub App; no personal access token is requested, and its user token never enters Workspace Storage checkpoints or backups.

From Lesson Studio, choose **Publish to Lesson Depot** after validation. QuickMaths downloads the author file, copies a detailed Codex publishing prompt when clipboard access is available, and opens the submission form. A direct source contribution uses:

```text
docs/lesson-depot/lessons/<slug>/<version>/
  metadata.json
  lesson-set.json
```

Declare an open content license such as CC BY 4.0, preserve published IDs, run `python -m scripts.lesson_depot docs/lesson-depot --output docs/lesson-depot`, run `node scripts/validate_lesson_depot.mjs docs/lesson-depot` plus both test suites, and submit the generated catalog changes with the lesson. See [`lesson-depot/README.md`](lesson-depot/README.md) for the complete review flow.

Catalog metadata and community reactions are untrusted signals. Every installation independently verifies the catalog hash and always runs the local lesson validator before showing the human confirmation. If WebCrypto is unavailable, hash verification fails closed and the installation stops. Bounded readers reject or cancel lesson files above 2 MB before parsing. Public author files contain answer keys and solutions by design; do not paste them into learner tutoring conversations.

Portable curriculum imports compare the complete normalized package content, including prerequisites, theory, questions, expected answers, work rules, and review policy. Reusing only a matching package ID or version is not sufficient. Every enabled external package must be embedded in the curriculum so the same file cannot silently resolve to different locally installed content on another device.

## Installation, progress, and backups

1. Download a full progress backup before changing installed content.
2. Use **Settings → Load lesson set**, use Lesson studio, or ask an agent to stage a set.
3. Review the subject, author, version, lesson count, question count, and prerequisite links.
4. Confirm installation.
5. Choose the subject in the left sidebar.

Installed lesson content, subject metadata/themes, per-profile subject and path choices, progress, drafts, attempts, reviews, and timers are included in full JSON backups. CSV files are analysis-only.

Import is rejected without changing state when a file has an unsupported version, duplicate IDs, missing or mislabelled prerequisite bridges, a cycle anywhere in the combined graph, mismatched question/skill IDs, unsupported grading/work/review modes, malformed choices/rubrics/proof obligations, executable content, or exceeded safety limits.

Built-in Mathematics lessons use trusted runtime templates shipped with QuickMaths, so each retake draws fresh values while still covering every authored scenario. Uploaded, Depot, and Studio-authored lesson sets are deliberately fixed-data packages: they may contain large validated question banks, but they cannot ship or execute generator code. When editing a native Mathematics lesson, Lesson Studio includes a rerollable author preview and downloadable audit of the original runtime generator before you install a fixed reversible override.
