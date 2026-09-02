# QuickMaths WebMCP Challenge

QuickMaths is now a complete, zero-cost, agent-native learning app rather than a single worksheet demo. The static browser port carries the original product loop into GitHub Pages: choose a learner, install Geography or another Depot subject when wanted, inspect one curriculum or every installed subject in a combined bridge map, take varied mastery tests, reflect, review past work, and move progress between devices.

The app requires no OpenAI API key and sends no learner data to a hosted application server. GitHub Pages serves static files, browser `localStorage` holds the instant local copy, and visible JSON Save/Load controls provide portability. The optional QuickMaths Bridge uses a learner-owned private GitHub repository as a revisioned handoff channel between mobile learning and a remote Codex task. On the Codex computer, a loopback CLI serves the WebMCP workspace and uses the host Git credential manager; the GitHub credential never enters the agent page. A separate optional Community GitHub App enables in-app public Discussion votes via 👍 reactions and comments. Its stateless OAuth callback worker stores no data and is isolated from learner state and Bridge credentials.

## Challenge-period delta

QuickMaths existed before the WebMCP Challenge. The official submission period began on **August 25, 2026 at 11:00 a.m. Pacific Time**. The last pre-challenge commit is [`4c173a7`](https://github.com/QuickMathematics/QuickMaths/commit/4c173a7a9f32e741904cfe965f268d4cb9684771), dated July 10. The first WebMCP implementation commit is [`80738f6`](https://github.com/QuickMathematics/QuickMaths/commit/80738f6), dated September 1. The complete extension is visible in the [pre-challenge baseline → current challenge branch comparison](https://github.com/QuickMathematics/QuickMaths/compare/4c173a7...main).

| Before August 25, 2026 | Added during the challenge submission period |
| --- | --- |
| Python/Streamlit desktop-style application | Complete static browser application deployed on GitHub Pages |
| 25-lesson Mathematics YAML curriculum | Browser-ready native Mathematics runtime, an installable 15-lesson Geography Depot package, coordinate-geometry bridges, and combined subject maps |
| Existing mastery, grading, profile, review, and export foundations | Twenty-one page-level WebMCP learning tools operating on the same visible human state |
| Human-only navigation and learner workflows | Shared human-agent navigation, tutoring, saved-work inspection, structured reviews, and activity attribution |
| Local/Drive-oriented persistence in the original application | Browser autosave, portable backups, GitHub learner storage, and a revision-safe remote Agent Bridge |
| YAML authoring and developer preview utilities | Human Lesson Studio, agent lesson validation/staging, reversible native improvements, and answer-key-safe tutoring boundaries |
| No WebMCP transport or public curriculum exchange | Three explicit Bridge tools plus the Lesson Depot, safe package staging, and optional in-app community participation |

Challenge-period milestone evidence:

- [`80738f6`](https://github.com/QuickMathematics/QuickMaths/commit/80738f6) — first agent-native WebMCP workspace
- [`eb67d95`](https://github.com/QuickMathematics/QuickMaths/commit/eb67d95) — complete browser learning application
- [`18d0f02`](https://github.com/QuickMathematics/QuickMaths/commit/18d0f02) — revision-safe mobile/remote Agent Bridge
- [`a7daaae`](https://github.com/QuickMathematics/QuickMaths/commit/a7daaae) — public Lesson Depot
- [`5ad140c`](https://github.com/QuickMathematics/QuickMaths/commit/5ad140c) — in-app GitHub community participation
- [`dff92ed`](https://github.com/QuickMathematics/QuickMaths/commit/dff92ed) — substantial first-party Geography curriculum
- [`3caa0c9`](https://github.com/QuickMathematics/QuickMaths/commit/3caa0c9) — reversible native lesson improvements
- [`3f385ed`](https://github.com/QuickMathematics/QuickMaths/commit/3f385ed) — full-depth native assessment and structured review parity

## Product surface

- Original logo landing page with multiple learner profiles and sample progress
- Seven-chapter onboarding tour for every new profile, with skip and persistent replay controls
- Dashboard metrics, suggested next work, recent attempts, and continue flow
- 44 native Mathematics lessons plus a first-party 15-lesson Geography package in the Lesson Depot, joined through coordinate geometry and geodesy
- Theory, applications, prerequisites, unlocks, and worked examples for every skill
- Scenario-complete mastery tests: every authored assessment case appears once per attempt (8–25 questions in the original Mathematics curriculum), while retakes rotate generated variants
- Multiple-choice, free-response, required shown work, local grading, and step checks
- Results, reflection-based mastery updates, spaced review dates, and saved tutor/self reviews
- Live analog clock plus per-session and cumulative profile timers
- Browser autosave, backup recommendations, confirmed JSON restore, and formula-safe CSV exports
- Multi-subject curricula, cross-subject prerequisite bridges, safe per-subject themes, and Hard/Open progression modes
- Human Lesson Creator with tutorial, tooltips, multiple lessons, all graders, proof/rubric controls, validation, download, and install
- Validated schema 2.0 lesson-set JSON with Agent Lesson Authoring Guide and full backup integration
- Responsive desktop, tablet, and mobile navigation
- Optional GitHub Bridge with debounced learner checkpoints, an agent-only workspace, a credential-free local Git transport for Codex, revision-bound agent responses, conflict protection, and a mobile setup guide
- Optional in-app GitHub Discussion 👍 votes and comments through a least-privilege GitHub App, state + PKCE, short-lived user tokens, and a stateless free callback worker

## WebMCP integration

A compatible ChatGPT or Codex browser discovers twenty-seven page tools through `document.modelContext.registerTool()`. They operate on the same store and visible routes as the human interface—there is no separate agent-only demo state. The read-only `get_agent_guide` returns a compact operating summary by default; an agent can request `tutoring`, `navigation`, `planning`, `educator`, `bridge`, `custom_content`, `backup`, or `all` only when that policy is relevant. The complete source remains the machine-readable `agent-manifest.json`.

| Tool | Purpose |
| --- | --- |
| `get_agent_guide` | Read a compact operating summary or one detailed policy section on demand. |
| `get_app_state` | Read the visible view, learner, timers, mastery counts, and current suggestion. |
| `get_curriculum_map` | Read one subject map or the combined installed-subject map with statuses, prerequisite bridges, and unlocks. |
| `get_progress_summary` | Read per-skill mastery, attempts, and misconception tags. |
| `get_curriculum_workspace` | Read the educator's open curriculum, installed pack choices, canonical map, and learner-agent policy. |
| `create_curriculum` | Create and visibly open a new educator curriculum profile. |
| `select_curriculum` | Switch the educator workspace to an existing curriculum. |
| `update_curriculum_settings` | Set student, agent, progression, and contact rules for the open curriculum. |
| `set_curriculum_pack_enabled` | Enable or disable an installed additive lesson pack only for the open curriculum. |
| `list_subjects` | Read installed subjects and lesson totals. |
| `set_learning_preferences` | Change the visible subject, Hard/Open path mode, and focused/combined map scope. |
| `navigate_learning_app` | Open the dashboard, map, lesson, test, results, Lesson studio, or Settings. |
| `set_map_plan_mode` | Visibly open the persistent editable mastery-map plan or return to the untouched canonical map. |
| `arrange_map_plan_nodes` | Move lesson nodes to absolute positions in a subject or combined Plan mode layout. |
| `create_map_plan_path` | Create an ordered, colored study path through two or more installed lessons. |
| `add_map_plan_annotation` | Add a free, lesson-connected, or path-connected comment node to the visible plan. |
| `open_lesson_creator` | Open the no-code Human Lesson Creator. |
| `validate_lesson_set` | Validate schema 2.0 subjects, bridges, questions, proof/rubric policy, and safety limits. |
| `stage_custom_lesson_set` | Stage validated content in the visible UI; only the human can install it. |
| `search_lesson_depot` | Search published packages and clearly labeled roadmap previews without exposing answer keys. |
| `stage_depot_lesson` | Hash-check, validate, and visibly stage one published package for human review. |
| `stage_depot_lessons` | Prepare an ordered batch of published packages for sequential, per-pack human approval or skipping. |
| `get_learning_context` | Read the selected lesson or active test without answer keys. |
| `start_skill_test` | Create or resume a test for an unlocked skill and show it on screen. |
| `inspect_student_work` | Inspect one visible response without returning its expected answer. |
| `record_tutor_feedback` | Save concise Socratic feedback beside the correct draft or attempt. |
| `create_followup_problem` | Move a misconception-targeted question to the front of the visible test. |

The top-level `agent-bridge.html` workspace registers the same twenty-seven learning tools plus three transport tools:

| Bridge tool | Purpose |
| --- | --- |
| `get_bridge_sync_status` | Read connection, dirty state, repository, and synchronization timing without exposing credentials. |
| `sync_from_learner` | Pull the authoritative learner revision before inspection or work. |
| `publish_agent_checkpoint` | Publish agent changes bound to the last learner revision. |

Tool inputs use closed JSON Schemas and runtime validation. Read-only tools do not mutate learner state. Agent writes appear in the profile-scoped activity panel. Answer keys and solution steps are excluded from pre-submission learning context; arbitrary code, HTML, expressions to evaluate, storage keys, and network destinations are not accepted from tools.

## Architecture

```text
Mobile learner browser                          Computer / remote Codex task
┌──────────────────────────┐                    ┌────────────────────────────┐
│ Full QuickMaths SPA      │                    │ Top-level Agent Bridge     │
│ localStorage + WebMCP    │                    │ 30 WebMCP tools            │
└────────────┬─────────────┘                    └──────────────┬─────────────┘
             │ debounced, complete state                       │ explicit publish → host Git auth
             ▼                                                 ▼
        learner-state.json ◄──── private GitHub repo ────► agent-state.json
             │                    revision checks               │
             └──── learner remains authoritative; stale or conflicting writes stop

Default/offline mode: browser localStorage + JSON backup + CSV download only.
```

Important files:

- `docs/index.html` — landing page and persistent application shell
- `docs/challenge.css` — responsive visual system and original-style clock
- `docs/curriculum-data.json` — browser-ready 44-lesson native Mathematics curriculum with comprehensive assessments and rotating retake variants
- `docs/lesson-depot/lessons/geography/1.0.0/lesson-set.json` — installable first-party 15-lesson Geography curriculum
- `docs/challenge-core.js` — profiles, mastery graph, grading, attempts, reviews, timers, and persistence
- `docs/challenge.js` — routes, views, controls, clock, backup/load, and exports
- `docs/lesson-creator.js` — no-code multi-subject lesson authoring studio
- `docs/webmcp-tools.js` — WebMCP schemas, validation, registration, and execution
- `docs/github-sync.js` — GitHub Contents transport, credential separation, revisions, polling, and conflict checks
- `docs/github-community.js` — least-privilege GitHub App OAuth, credential isolation, live 👍 votes, and comments
- `community-worker/` — stateless OAuth code-exchange and refresh boundary for free deployment
- `docs/local-git-client.js` — same-origin browser adapter for the credential-free loopback transport
- `docs/agent-bridge.html` — top-level agent-only workspace with no learner-facing UI
- `docs/bridge-webmcp-tools.js` — pull, publish, and bridge-status tools
- `docs/bridge-guide.html` — human setup guide and copyable starting prompt
- `docs/QUICKMATHS_BRIDGE.md` — complete setup, security, and recovery protocol
- `docs/agent-manifest.json` — machine-readable agent operating and backup policy
- `docs/CUSTOM_LESSON_SETS.md` — Agent Lesson Authoring Guide
- `docs/lesson-set-example.json` — installable worked example
- `quickmaths/local_bridge.py` — loopback HTTP boundary and transactional Git adapter
- `content/geography/foundations/web-curriculum.json` — generated native Mathematics coordinate/geodesy bridge
- `scripts/build_geography_web_curriculum.mjs` — deterministic source for both that native bridge and the Geography Depot package
- `scripts/export_web_curriculum.py` — deterministic native browser export from the original Mathematics YAML and bridge expansion

## Run and test

```powershell
python scripts\export_web_curriculum.py
python -m http.server 8765 --directory docs
python -m quickmaths.cli agent-bridge --repo https://github.com/YOUR-NAME/quickmaths-sync.git
npm --prefix docs test
pytest -q
```

Open `http://localhost:8765/`. A compatible agent browser shows **Agent tools connected**; an ordinary browser keeps the complete manual experience. Open `http://localhost:8765/agent-bridge.html` for the separate 24-tool agent workspace.

The browser contract suite covers profiles, subject filtering, Hard/Open progression, cross-subject bridges, themes, proof-review mastery gates, unlocks, timers, mastery updates, varied retakes, symbolic grading, procedural-work validation, answer-key privacy, agent policy, lesson-set staging and progress round-trips, malformed backups, CSV exports, strict tool inputs, navigation, visible follow-ups, feedback-to-attempt linkage, credential isolation, Unicode GitHub transport, optimistic write conflicts, revision-bound agent output, and protection for unsynced learner work.

## Under-three-minute demo

1. On the phone-sized learner page, choose **Explore sample learner** and show the live clock, subject-aware mastery map, and Settings → QuickMaths Bridge status.
2. On the computer, open the dedicated Agent Bridge and call `sync_from_learner` from Codex. Show that its headless learner summary matches the phone.
3. Ask: **“Read my progress, choose the best next skill, save one concise Socratic recommendation, and publish it back.”**
4. Call `publish_agent_checkpoint`, then show the learner page receive the visible change and attribute it to the agent.
5. Make an unsynced learner edit and demonstrate that stale agent output stops with a conflict instead of overwriting it.
6. Open the no-code lesson creator or subject map, then download a JSON backup and point out: no app backend, no model API key, and no hosting bill.

## Free deployment and submission

GitHub Pages publishes the repository's `main` branch from `/docs` at:

- Live app: `https://quickmathematics.github.io/QuickMaths/`
- Source: `https://github.com/QuickMathematics/QuickMaths`

Remaining human-only submission steps:

- Record a public video under three minutes using the demo above.
- Complete the challenge submission form with the live URL, repository, and video.

References: [OpenAI WebMCP Challenge](https://openai.com/webmcp-challenge/), [WebMCP documentation](https://learn.chatgpt.com/docs/webmcp), and [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).
