# QuickMaths custom lesson sets

Custom lesson sets are portable JSON files that add lessons and mastery tests to the built-in Algebra Foundations map. They are declarative data: QuickMaths does not run code, generators, HTML, or scripts from a lesson set.

Start with [`lesson-set-example.json`](lesson-set-example.json). Copy it, change the metadata and content, validate it by choosing **Save & load → Load lesson set**, and keep the original file as your editable source.

## File envelope

Every file needs these top-level fields:

```json
{
  "format": "quickmaths.lesson-set",
  "schema_version": "1.0",
  "id": "PACK_YOUR_TOPIC",
  "name": "Your topic",
  "description": "What the set teaches.",
  "author": "Your name",
  "version": "1.0.0",
  "track": { "skills": ["CUSTOM_YOUR_TOPIC_001"] },
  "skills": []
}
```

- Pack IDs must start with `PACK_`.
- Skill IDs must start with `CUSTOM_`.
- IDs use uppercase letters, numbers, and underscores only.
- A pack can contain up to 50 skills and 100 problems per skill, with a maximum file size of 2 MB.
- `track.skills` lists every skill exactly once in the order it should appear.
- `entry_skills` and `exit_skills` are optional; QuickMaths derives them when omitted.

## Skills

Each skill needs:

- `id`, `name`, `description`, and `theory`
- optional `domain`, `subdomain`, `tags`, `examples`, and `applications`
- `prerequisites`: custom IDs from the same pack or built-in QuickMaths skill IDs
- optional `unlocks`: only custom IDs from the same pack
- one or more `problems`

Prerequisites must exist and cannot form a cycle. Referencing a built-in skill integrates the custom lesson into the main mastery tree; the custom test remains locked until that built-in prerequisite is proven.

Examples use `prompt`, `solution`, and `explanation`. Applications use `title` and `description`.

## Problems

Every problem needs an uppercase `template_id` that is unique within the lesson-set file, matching `skill_id`, `prompt`, `expected_answer`, `grading_method`, and at least one `solution_steps` entry.

Supported grading methods:

- `exact_numeric`
- `numeric_with_tolerance` with optional numeric `tolerance`
- `multiple_choice` with 2–8 `{ "id", "label" }` options
- `symbolic_expression`
- `equation_solution`
- `exact_text`
- `theorem_conclusion` with optional `accepted_forms`

Use `answer_mode: "final_only"` and `work: { "mode": "none" }` for a final answer only.

For required shown work:

```json
{
  "answer_mode": "final_plus_required_work",
  "work": {
    "mode": "procedural_steps",
    "prompt": "Show one equivalent expression per line.",
    "minimum_steps": 2,
    "require_final_answer_match": true
  }
}
```

QuickMaths checks the line count, mathematical notation, consecutive single-variable equation/expression consistency, and final-line match. Keep procedural prompts compatible with those checks.

## Import, progress, and backups

1. Open **Save & load**.
2. Download a full progress backup before changing installed content.
3. Choose **Load lesson set** and select the JSON file.
4. Review the preview showing the pack, skill, and problem counts, then confirm.
5. Open **Mastery map** or **Lessons** to use the new content.

Installed lesson sets are embedded in full QuickMaths JSON backups. Progress, drafts, attempts, reviews, and selected skills for custom content therefore restore together. CSV files are analysis exports and cannot restore lesson sets.

Lesson-set files and full backups contain answer keys and solution steps. Treat them as teacher/author files rather than learner worksheets, and do not paste their raw contents into a tutoring chat.

## Validation failures

Import is rejected without changing saved state when the file has an unsupported version, duplicate IDs, missing prerequisites, prerequisite cycles, mismatched skill/problem IDs, unsupported grading or work modes, malformed multiple-choice options, missing solution steps, or exceeds safety limits.
