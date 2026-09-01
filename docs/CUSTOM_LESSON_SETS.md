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

- Pack IDs start with `PACK_`; skill IDs start with `CUSTOM_`; subject IDs start with `SUBJECT_`.
- IDs use uppercase letters, numbers, and underscores. Never change a published ID if learner progress may already reference it.
- Use `SUBJECT_MATH` to append lessons to the built-in Mathematics curriculum. Its built-in theme is preserved.
- Reuse an installed custom subject ID to append another pack to that subject. Include the same subject name and theme in the source file so the file stays portable.
- Use a new subject ID to create a separate curriculum and visible subject option.
- Themes accept only the eleven six-digit hex colors shown above. Arbitrary CSS is rejected.
- Schema 1.0 files still load and are migrated into `SUBJECT_MATH`.

Limits: 2 MB per set, 10 installed sets, 50 skills per set, 100 fixed questions per skill, 20 examples, 20 applications, 20 solution steps, 12 tags per field, and 8 multiple-choice options.

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
  "problems": []
}
```

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
- `symbolic_expression`
- `equation_solution`
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
| Structure a proof | `proof_obligations` | Shows obligations and strategies, captures the proof, and waits for review. |
| Grade open reasoning | `rubric_check` | Shows rubric criteria, captures work, and waits for review. |

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

The repository’s original YAML engine remains richer because it runs trusted local Python. Every original authoring concern has an explicit web path:

| Original YAML capability | Web lesson-set path |
| --- | --- |
| Track metadata and graph | `track`, `skills`, `prerequisites`, subjects, and bridge references |
| Skill metadata, theory, examples, applications, tags | Same learner-facing fields in each skill |
| Mastery thresholds and review intervals | `mastery` block |
| Final answer block and accepted forms | Flattened `expected_answer`, `answer_type`, grader, tolerance, and `accepted_forms` |
| Fixed tests | Direct `problems` entries |
| Generated tests: variables, derived expressions, constraints, prompt/answer templates, retry limits | Run the trusted YAML generator during authoring, inspect samples, then export the generated results as fixed browser `problems`. Uploaded browser files never execute expressions. |
| Random order / question count | Supply a larger fixed bank; QuickMaths rotates through up to five questions per attempt. |
| Explanation templates | Pre-render into literal `solution_steps`. |
| Final-only, optional, or required work | `answer_mode` |
| Capture, procedural, proof, and rubric workflows | All five browser `work.mode` values above |
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
- add fixed questions with all seven graders;
- configure answer modes, capture/procedural/proof/rubric work, and review gates;
- open an existing JSON file, autosave an author draft locally, validate, download, install, and prepare a public Lesson Depot submission.

It is the preferred route for humans. This guide is the preferred route for agents and advanced source-control workflows.

## WebMCP workflow

Agents inside a compatible browser should use this sequence:

1. `get_agent_guide`
2. `list_subjects`
3. Author a schema 2.0 JSON string
4. `validate_lesson_set`
5. `stage_custom_lesson_set`
6. Tell the human to review the visible preview and click **Install**

Agents cannot call the final install action. They should recommend a full JSON progress backup before curriculum changes and never quote expected answers or solution steps into learner tutoring.

For community lessons, agents can call `search_lesson_depot` to inspect catalog metadata and `stage_depot_lesson` to download, hash-check, validate, and visibly stage a chosen package. The second tool still cannot install anything; the human reviews it in Settings and clicks **Install**.

## Publishing to the Lesson Depot

The public Depot uses this repository as its free backend. Lesson files and catalog hashes live in Git, automated checks run in GitHub Actions, pull requests provide moderation history, and GitHub Discussions provide votes and comments. QuickMaths never asks for a community GitHub token.

From Lesson Studio, choose **Publish to Lesson Depot** after validation. QuickMaths downloads the author file, copies a detailed Codex publishing prompt when clipboard access is available, and opens the submission form. A direct source contribution uses:

```text
docs/lesson-depot/lessons/<slug>/<version>/
  metadata.json
  lesson-set.json
```

Declare an open content license such as CC BY 4.0, preserve published IDs, run `python -m scripts.lesson_depot docs/lesson-depot --output docs/lesson-depot`, run `node scripts/validate_lesson_depot.mjs docs/lesson-depot` plus both test suites, and submit the generated catalog changes with the lesson. See [`lesson-depot/README.md`](lesson-depot/README.md) for the complete review flow.

Catalog metadata and community reactions are untrusted signals. Every installation independently verifies the catalog hash when supported and always runs the local lesson validator before showing the human confirmation. Public author files contain answer keys and solutions by design; do not paste them into learner tutoring conversations.

## Installation, progress, and backups

1. Download a full progress backup before changing installed content.
2. Use **Settings → Load lesson set**, use Lesson studio, or ask an agent to stage a set.
3. Review the subject, author, version, lesson count, question count, and prerequisite links.
4. Confirm installation.
5. Choose the subject in the left sidebar.

Installed lesson content, subject metadata/themes, per-profile subject and path choices, progress, drafts, attempts, reviews, and timers are included in full JSON backups. CSV files are analysis-only.

Import is rejected without changing state when a file has an unsupported version, duplicate IDs, missing or mislabelled prerequisite bridges, a cycle anywhere in the combined graph, mismatched question/skill IDs, unsupported grading/work/review modes, malformed choices/rubrics/proof obligations, executable content, or exceeded safety limits.
