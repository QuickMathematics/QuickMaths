# QuickMaths WebMCP Challenge

QuickMaths is now a complete, zero-cost, agent-native learning app rather than a single worksheet demo. The static browser port carries the original product loop into GitHub Pages: choose a learner, read a lesson, follow the 25-skill prerequisite tree, take varied mastery tests, reflect, review past work, and move progress between devices.

The app requires no OpenAI API key and sends no learner data to an application server. GitHub Pages serves static files, browser `localStorage` holds the current copy, and visible JSON Save/Load controls provide portability.

## Product surface

- Original logo landing page with multiple learner profiles and sample progress
- Six-chapter onboarding tour for every new profile, with skip and persistent replay controls
- Dashboard metrics, suggested next work, recent attempts, and continue flow
- Full 25-skill Algebra Foundations prerequisite/mastery map
- Theory, applications, prerequisites, unlocks, and worked examples for every skill
- Five-question mastery tests drawn from 375 seeded problem variants
- Multiple-choice, free-response, required shown work, local grading, and step checks
- Results, reflection-based mastery updates, spaced review dates, and saved tutor/self reviews
- Live analog clock plus per-session and cumulative profile timers
- Browser autosave, backup recommendations, confirmed JSON restore, and formula-safe CSV exports
- Multi-subject curricula, cross-subject prerequisite bridges, safe per-subject themes, and Hard/Open progression modes
- Human Lesson Creator with tutorial, tooltips, multiple lessons, all graders, proof/rubric controls, validation, download, and install
- Validated schema 2.0 lesson-set JSON with Agent Lesson Authoring Guide and full backup integration
- Responsive desktop, tablet, and mobile navigation

## WebMCP integration

A compatible ChatGPT or Codex browser discovers fifteen page tools through `document.modelContext.registerTool()`. They operate on the same store and visible routes as the human interface—there is no separate agent-only demo state. A machine-readable `agent-manifest.json` is exposed through the read-only `get_agent_guide` tool so backup, tutoring, privacy, navigation, subjects, and custom-content policy are available in context.

| Tool | Purpose |
| --- | --- |
| `get_agent_guide` | Read operating, tutoring, privacy, backup, and custom lesson-set guidance. |
| `get_app_state` | Read the visible view, learner, timers, mastery counts, and current suggestion. |
| `get_curriculum_map` | Read one subject map with statuses, prerequisite bridges, and unlocks. |
| `get_progress_summary` | Read per-skill mastery, attempts, and misconception tags. |
| `list_subjects` | Read installed subjects and lesson totals. |
| `set_learning_preferences` | Change the visible subject and Hard/Open path mode. |
| `navigate_learning_app` | Open the dashboard, map, lesson, test, results, Lesson studio, or Settings. |
| `open_lesson_creator` | Open the no-code Human Lesson Creator. |
| `validate_lesson_set` | Validate schema 2.0 subjects, bridges, questions, proof/rubric policy, and safety limits. |
| `stage_custom_lesson_set` | Stage validated content in the visible UI; only the human can install it. |
| `get_learning_context` | Read the selected lesson or active test without answer keys. |
| `start_skill_test` | Create or resume a test for an unlocked skill and show it on screen. |
| `inspect_student_work` | Inspect one visible response without returning its expected answer. |
| `record_tutor_feedback` | Save concise Socratic feedback beside the correct draft or attempt. |
| `create_followup_problem` | Move a misconception-targeted question to the front of the visible test. |

Tool inputs use closed JSON Schemas and runtime validation. Read-only tools do not mutate learner state. Agent writes appear in the profile-scoped activity panel. Answer keys and solution steps are excluded from pre-submission learning context; arbitrary code, HTML, expressions to evaluate, storage keys, and network destinations are not accepted from tools.

## Architecture

```text
ChatGPT / Codex browser agent
            │ WebMCP tool calls
            ▼
document.modelContext.registerTool
            │
            ▼
QuickMaths browser store ─────► visible SPA routes
      │                              │
      ├── learner profiles           ├── dashboard / subject maps / lessons
      ├── progress + attempts        ├── tests / results / reviews
      ├── subjects + lesson packs    ├── Human Lesson Creator
      ├── reviews + drafts           └── save / load / exports
      └── themes + timers + activity
            │
            ├── browser localStorage
            └── JSON backup / CSV download
```

Important files:

- `docs/index.html` — landing page and persistent application shell
- `docs/challenge.css` — responsive visual system and original-style clock
- `docs/curriculum-data.json` — browser-ready 25-skill curriculum and 375 problem variants
- `docs/challenge-core.js` — profiles, mastery graph, grading, attempts, reviews, timers, and persistence
- `docs/challenge.js` — routes, views, controls, clock, backup/load, and exports
- `docs/lesson-creator.js` — no-code multi-subject lesson authoring studio
- `docs/webmcp-tools.js` — WebMCP schemas, validation, registration, and execution
- `docs/agent-manifest.json` — machine-readable agent operating and backup policy
- `docs/CUSTOM_LESSON_SETS.md` — Agent Lesson Authoring Guide
- `docs/lesson-set-example.json` — installable worked example
- `scripts/export_web_curriculum.py` — deterministic export from the original YAML curriculum

## Run and test

```powershell
python scripts\export_web_curriculum.py
python -m http.server 8765 --directory docs
npm --prefix docs test
pytest -q
```

Open `http://localhost:8765/`. A compatible agent browser shows **Agent tools connected**; an ordinary browser keeps the complete manual experience.

The browser contract suite covers profiles, subject filtering, Hard/Open progression, cross-subject bridges, themes, proof-review mastery gates, unlocks, timers, mastery updates, varied retakes, symbolic grading, procedural-work validation, answer-key privacy, agent policy, lesson-set staging and progress round-trips, malformed backups, CSV exports, strict tool inputs, navigation, visible follow-ups, and feedback-to-attempt linkage.

## Under-three-minute demo

1. Open the landing page and choose **Explore sample learner**.
2. Show the live clock, dashboard metrics, and recent attempt, then open the full **Mastery map**.
3. Ask the browser agent: **“Look at my progress, open my map, choose the best next skill, take me to its lesson, and start its test.”**
4. Enter one intentionally wrong answer with shown work. Ask: **“Inspect this reasoning, save one Socratic hint without revealing the answer, and prepare a follow-up targeting the misconception.”**
5. Show the visible tutor note, targeted question, and profile-scoped activity log.
6. Open **Settings**, download the JSON backup, and point out that the app has no backend, API key, or hosting bill.

## Free deployment and submission

GitHub Pages publishes the repository's `main` branch from `/docs` at:

- Live app: `https://srednjak.github.io/QuickMaths/`
- Source: `https://github.com/Srednjak/QuickMaths`

Remaining human-only submission steps:

- Record a public video under three minutes using the demo above.
- Complete the challenge submission form with the live URL, repository, and video.

References: [OpenAI WebMCP Challenge](https://openai.com/webmcp-challenge/), [WebMCP documentation](https://learn.chatgpt.com/docs/webmcp), and [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).
