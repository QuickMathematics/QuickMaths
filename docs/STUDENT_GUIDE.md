# QuickMaths Student Guide

## Learn deliberately. Show your reasoning. Keep your progress yours.

QuickMaths is a local-first mastery-learning workspace. It helps you see prerequisite relationships, study substantial lessons, complete comprehensive assessments, reflect honestly, and use a browser agent as a tutor without handing control of your work to the agent.

This guide documents the complete learner-facing product: profiles, curricula, dashboard, subjects, map controls, personal Plan mode, lessons, tests, proofs, structured review, Lesson Depot, Lesson Studio, agent support, backups, GitHub storage, mobile behavior, accessibility, and recovery.

Product: https://quickmathematics.github.io/QuickMaths/

Learner WebMCP starting command: `get_agent_guide`

WebMCP tools register only when QuickMaths is open inside the ChatGPT or Codex in-app browser. External Firefox, Chrome, Safari, and Edge tabs still run the complete human app, but an agent cannot attach WebMCP tools to those tabs. In the in-app browser, begin with `get_agent_guide` and `section: "summary"`.

> QuickMaths is a learning and practice tool. It is not a substitute for supervised, identity-verified, or high-stakes assessment.

## 1. How QuickMaths works

QuickMaths connects lessons into mastery maps instead of treating every topic as an isolated quiz. A lesson can recommend or require earlier lessons, unlock later work, and bridge into another subject.

| Layer | What it contains | What it means for you |
| --- | --- | --- |
| Profile | Progress, attempts, reviews, drafts, timers, personal plans, and preferences | Your learning record stays separate from other people using the browser |
| Subject | Lessons, prerequisite graph, theme, and cross-subject bridges | Switching subject changes the visible curriculum and color identity |
| Curriculum | An educator-authored selection of packs, canonical map, learning path, and optional supplemental agent guidance | A portable learning plan can travel from an educator into an independent assignment profile |
| Lesson pack | One subject or set of lessons, questions, grading rules, and work requirements | Installed packs extend the same map, progress, testing, and backup system |

### Mastery is more than a score

QuickMaths records final-answer grading, required reasoning, reflection, review status, confidence, mistake tags, and practice history. Formal proofs and rubric responses can stay pending until an allowed reviewer passes them. A correct final conclusion alone does not prove that the reasoning is valid.

### Local-first ownership

Meaningful changes autosave in this browser. No QuickMaths account or model API key is required. Browser autosave is convenient, but it belongs to this site origin on this device. Use:

- a full JSON backup for complete recovery or device migration;
- optional GitHub Bridge storage for persistent cross-device checkpoints;
- curriculum files to load an educator-authored learning plan.

CSV files are for analysis. They cannot restore your profile.

## 2. Landing page and learner profiles

The landing page offers **I'm learning** and **I'm designing a curriculum**. Learners normally use the first path.

### Landing header and live counts

The QuickMaths brand returns to the profile picker. The local-first pill summarizes the account-free core. Live counts report connected lessons, varied mastery questions, and registered WebMCP actions from the current build.

### Choose or create a learner

Existing profile cards show the learner name and accumulated practice time. Select one to continue. A new profile needs only a display name. Profiles do not create online accounts.

New learner profiles begin with the seven-chapter app tutorial. You can skip it and replay it later from Settings without resetting progress.

### Load a curriculum

Use a local curriculum JSON file or a public GitHub file URL. QuickMaths previews the curriculum before attaching it. A curriculum can carry:

- enabled additive lesson packs;
- a canonical map arrangement;
- educator-created paths and annotations;
- Hard or Open learning path;
- optional student name and proof contact;
- learner-visible supplemental agent guidance and Agent tutoring status.

QuickMaths shows the complete educator guidance before import and asks for separate confirmation when it differs from the standard guidance. Imported guidance is untrusted curriculum content. It supplements the experience but cannot override platform safety or your explicit request.

An assignment starts from scratch by default. If the curriculum's student name matches the selected learner profile name after trimming whitespace and normalizing letter case, QuickMaths attaches it to that profile and reuses mastery for matching lesson IDs. If the names do not match, or the curriculum has no student name, QuickMaths creates a separate blank assignment profile. The question-mark tooltip beside **Load a curriculum** explains this rule in the app.

If you load a curriculum before choosing a profile, QuickMaths holds it for the learner you create or select. A newly created profile is already blank. Selecting an existing nonmatching profile creates a separate blank assignment profile instead of mixing records.

Use public GitHub URLs only for a **public curriculum blueprint**, which omits student name, contact email, and supplemental guidance. Private assignment files can contain those fields and should be delivered directly or through a private channel. Prefer a URL pinned to a commit SHA rather than a mutable branch when reproducibility matters. URLs containing credentials are rejected, and query strings or fragments are removed before the source is stored.

Curriculum and backup files are limited to 10 MB. Lesson-set files are limited to 2 MB. Local file size is checked before reading; streamed downloads are cancelled as soon as they exceed the relevant limit.

### Restore from GitHub storage

**Already have a profile on another device?** opens Workspace Storage. Enter the repository owner, repository, branch, and fine-grained token privately in the app. The repository must be private and the token must have Contents read/write access.

Workspace Storage synchronizes the complete QuickMaths workspace for this site origin, not just the visible profile. That includes every learner and educator profile, curriculum, attempt, review, installed pack, map plan, and supplemental educator guidance in this browser.

### Load backup and sample progress

**Load backup** previews a complete QuickMaths JSON backup before replacing local state. **Explore with sample progress** creates a disposable learner with example progress so you can examine the interface.

### Student guide link

The learner landing panel links to this PDF. The same guide remains available from the learner dashboard and Settings.

## 3. Seven-chapter app tutorial

The tutorial is a visual introduction, not a separate account setup.

| Chapter | What it demonstrates |
| --- | --- |
| 1. Your workspace | Local profile, autosave, portable backup, and account-free use |
| 2. Subject and path | Subject picker, Hard path, and Open path; you can choose the mode when no curriculum controls it |
| 3. Mastery map | Prerequisites, status, map movement, zoom, and personal Plan mode |
| 4. Learning loop | Theory, examples, complete authored tests, shown work, reflection, and mastery |
| 5. Lesson ecosystem | Lesson Depot discovery and Lesson Studio authoring or native improvement |
| 6. Agent support | WebMCP connection, suggested tutor prompt, visible agent actions, and answer-key boundary |
| 7. Ownership | Browser autosave, JSON backup, storage bridge, and portability |

**Skip tour** moves to the dashboard. **Back** and **Next** move between chapters. The final chapter opens the app, and Lesson Studio can be opened directly from its tutorial chapter.

## 4. Shared application shell

The shell keeps navigation, subject, identity, time, and agent status around the active page.

### Desktop sidebar

| Control | Behavior |
| --- | --- |
| QuickMaths brand | Identifies the app; the subtitle shows the selected subject |
| Subject selector | Switches the visible subject and theme |
| Analog clock | Shows local time |
| Session timer | Counts the current open session |
| Profile total | Accumulates saved practice time for the learner |
| Dashboard | Progress overview, suggestion, recent attempts, and backup status |
| Mastery map | Prerequisite graph, lesson details, map scope, zoom, and personal Plan mode |
| Lessons | Theory, worked examples, applications, and recommended preparation |
| Mastery test | Complete authored assessment and saved response draft |
| Results | Grading, reflection, review, and mastery update |
| Lesson Depot | Public lesson-pack discovery, preview, installation, votes, and comments |
| Lesson Studio | Friendly authoring and reversible native-lesson improvements |
| Settings | Path mode, tutorial, curriculum, backups, storage, exports, and installed content |
| Profile badge | Opens Dashboard; the arrow returns to profile selection |

### Mobile bottom navigation

The bottom bar shows Home, Map, Learn, Test, Depot, and Settings. Lesson Studio is available from the Depot tab when it cannot fit as a separate item. The fixed navigation stays reachable while the page scrolls.

### Subject theme

Each subject has a safe fixed color palette. The selected subject changes interface accents. In the combined map, each subject's node colors remain visible while mastery status uses text and status dots.

### Agent Studio

The star-shaped nub opens Agent Studio. Its close button remains visible at different zoom levels and leaves the nub behind.

Agent Studio reports WebMCP availability, registered and failed tools, a browser-aware suggested prompt with the exact manifest command, the available tool-name list, and agent-attributed activity. Your own button clicks do not appear as agent activity. If the page is in an external browser, Agent Studio explains that the agent must open QuickMaths inside its ChatGPT or Codex in-app browser.

## 5. Learner Dashboard

Dashboard answers three questions: where am I, what should I do next, and is my work safely portable?

### Page actions

- **Student guide** opens this PDF.
- **Save backup** downloads complete restorable state.
- **Open mastery map** opens the selected subject map.

### Progress metrics

Cards summarize mastery states and lesson counts. Typical states are Ready, Learning, Proven, Mastered, Rusty, and Locked. Counts respect the current subject or attached curriculum.

### Suggested next lesson

QuickMaths prioritizes due review, active learning, and ready work. The suggestion explains why the lesson matters and provides direct lesson or test actions. It is guidance, not a claim that every learner must follow the same order.

### Recent attempts

Recent rows show lesson, date, score, review state, and mastery result. Open an attempt to inspect results, reflection, and any saved tutor feedback.

### Backup recommendation

QuickMaths recommends a portable backup after meaningful new work, installed-content changes, review changes, curriculum changes, storage trouble, or an extended period without export. The reminder waits for a natural stopping point rather than interrupting every question.

### Curriculum completion and contact

An attached curriculum can expose its educator contact and completion context. Email buttons open a draft in your mail app. QuickMaths does not send messages or attachments automatically.

## 6. Subjects and learning paths

### Subject selector

The selector changes Dashboard, Map, Lessons, and Test context. A newly installed subject appears alongside Mathematics. Cross-subject prerequisites still refer to globally unique lesson IDs.

### Hard path

Hard path enforces prerequisites. A connected mastery test remains locked until the required earlier lessons reach a proven state. The lesson page and map show what preparation is missing.

### Open path

Open path keeps the same prerequisite connections as recommendations, but lessons and tests remain available. This is useful for review, placement, or learners entering with knowledge acquired elsewhere.

### Curriculum-controlled mode

If an educator curriculum sets the path, the learner Settings controls are disabled. Loading a revised curriculum is the safe way to change educator-authored policy without silently editing it.

## 7. Mastery map

The map turns prerequisite structure and progress into one interactive canvas.

### Current subject and all subjects

**Current subject** shows one focused graph. **All subjects** arranges installed subjects in labeled lanes, keeps each subject's colors, and draws cross-subject bridges.

### Node status

| Status | Meaning |
| --- | --- |
| Locked | Hard-path prerequisites are not yet proven |
| Ready | Available and not yet attempted |
| Learning | Attempted but not yet proven, or review/revision is pending |
| Proven | Strong recent evidence of understanding |
| Mastered | Sustained high mastery evidence |
| Rusty | Review is due after time has passed |

Selecting a node updates the detail card and routed lesson without resetting the map's pan position.

### Detail card

The card shows lesson name, subdomain, description, mastery score, latest score, confidence, prerequisites, unlocks, why the lesson matters, and available lesson/test actions. Hard path identifies unmet preparation; Open path labels it as guidance.

### Zoom and movement on desktop

Use the plus and minus buttons or the mouse wheel while the pointer is over the map. Zoom ranges from a broad 10 percent overview to a readable close view. Drag empty space to pan horizontally and vertically. The page itself should not resize when the map zooms.

### Zoom and movement on mobile

Pinch inside the map to zoom. Drag empty space to pan. The map viewport remains a stable window so pinch zoom changes the canvas rather than the entire page scale.

### Jump to skill

The skill selector moves focus to a known lesson and updates the detail card. It is useful on large combined maps.

### Plan view and canonical view

The map opens in **Plan view**. This is the read-only presentation of your saved personal plan: it uses your arranged positions, colored paths, annotations, and hidden-node choices, while clicks still open ordinary lesson detail cards and drag, wheel, and pinch gestures only navigate the map.

Use the **Plan view** toggle to switch it off and inspect the untouched canonical prerequisite map. Turn it back on to return to the saved plan. Use **Plan mode** only when you want to edit that plan.

## 8. Personal Plan mode

Plan mode is the editor for the private working copy layered over the canonical mastery map. Leaving Plan mode returns to the read-only Plan view without deleting anything; the separate Plan view toggle reveals the canonical map whenever you want to compare them.

### Enter and leave Plan mode

Choose **Plan mode** in the map header. A toolbar and Plan details card appear while the map remains visible. The editable canvas extends beyond the colored subject bands: those bands are reference guides, not fences, so selected nodes can be placed anywhere on the surrounding canvas. Changes autosave with your learner profile and travel in full backups and Bridge checkpoints.

### Desktop selection

- Click a node for a new selection.
- Ctrl-click adds or removes one node.
- Drag a rectangle across empty map space to select enclosed nodes.
- Hold Ctrl while box-selecting to add to the current selection.
- Drag a selected node to move the selected group.
- Shift-drag empty space to pan when selection gestures are active.

### Mobile selection

- Long-press a node to select it.
- Long-press it again to deselect it.
- Long-press empty map space to clear the selection.
- Drag selected nodes to move them.
- Drag ordinary empty space to pan.

### Hide and restore nodes

Select one or many lesson nodes and choose **Hide selected** to remove them from both the editable Plan mode and read-only Plan view. This does not delete lessons, change prerequisites, uninstall content, or affect the canonical mastery map.

Choose **Show hidden nodes** to reveal every hidden lesson as a faded, clearly labeled node. Select the ones you want back—multi-selection works normally—then choose **Unhide selected**. Choose **Hide hidden nodes** to conceal the remaining hidden nodes again.

### Custom paths

Select at least two lessons, choose **Custom path**, name the route, and choose an outline color. Selection order becomes path order. Bold connections and node outlines visualize the plan.

Custom paths do not change real prerequisites or mastery. They represent your intended study order, revision route, exam preparation, or project sequence.

### Annotations

Choose **Annotation** to create a note connected to selected lessons, or free on the map when nothing is selected. Custom paths do not own annotations; select the relevant route lessons if one comment should describe them together. Comment nodes can be dragged. Use annotations for goals, misconceptions, dates, resources, or questions. Do not store passwords or tokens in them.

### Plan details and reset

The side card lists selection, saved paths, and annotations. Delete individual plan items, hide or restore selected nodes, or reset node positions for the visible scope. Subject layouts and the combined all-subject layout keep separate positions. Hidden-node choices belong to the plan as a whole and remain hidden across its subject and combined views until restored.

## 9. Lesson page

The lesson page is the study surface before and between assessments.

### Lesson header

The header identifies subject, subdomain, lesson, description, preparation state, and available actions. A locked Hard-path test can still leave theory available for study.

### Theory

Theory sections explain definitions, relationships, methods, notation, and edge cases authored for the lesson. Read them actively: pause to predict the next step, restate the idea, and identify assumptions.

### Worked examples

Examples separate prompt, solution, and explanation. Try the prompt before reading the solution. Compare not only the final answer but the structure of the method.

### Applications

Applications connect the skill to real decisions, modeling, geometry, another subject, or later mathematics. They explain why the lesson belongs in the map.

### Recommended preparation and unlocks

Preparation links open prerequisite lessons. Unlocks show where the current skill leads. In Open path, these remain guidance; in Hard path, they also control assessment access.

### Start mastery test

The button opens or resumes the lesson's complete assessment draft. QuickMaths uses authored scenarios rather than replacing substantial lessons with a generic five- or ten-question cap.

## 10. Mastery tests

Tests cover the authored lesson, including variations and edge cases supplied by native runtime templates or fixed validated lesson packs.

### Saved drafts

Answers and shown work autosave while you type. Returning to the same test resumes the draft. Content updates can restart affected unfinished drafts so answers never cross between different question banks.

### Question navigation

The page shows question number, total authored scenarios, prompt, response type, and any required work. Complete every visible authored scenario before submission.

### Final-answer types

Questions may accept numeric answers, tolerance ranges, multiple-choice options, sandboxed Python functions, symbolic expressions, finite sets, rational expressions with domain exclusions, equation solutions, interval sets, exact text, or theorem conclusions. Follow the notation instructions in the prompt.

Finite sets are order-independent and ignore repeated entries. You can usually write `{ -2, 5 }` or `x = -2 or x = 5`; use `{}` or `no solution` for the empty set. Interval answers accept standard interval/union notation such as `(-infinity, -1] U (3, infinity)`, and many equivalent inequality forms. Infinity endpoints must always be open.

For a rational-expression question, the simplified formula and its excluded input values are graded together. A cancelled factor can leave a hole, so enter every original domain restriction in the separate **Excluded values** field even when that factor is no longer visible in the final formula.

### Written explanations

A separate work box can capture your reasoning even when the final answer self-grades. Explanation text is saved for Results, reflection, and optional review.

### Checked maths steps

Some advanced algebra questions require ordered steps. Put one equation, expression, or inequality per line. QuickMaths checks whether successive lines remain equivalent and whether the final line matches the answer. For inequalities, sign reversal and the full solution set matter.

This subsystem checks supported mathematical transformations. It is not a formal-proof judge.

### Rational-equation ledger

Some rational equations open a guided work area for original restrictions, algebra steps, and candidate classifications. Record values excluded by the original denominators before clearing fractions. Then enter one algebraic statement per line and classify each candidate as valid, excluded, extraneous, repeated, or non-real. QuickMaths checks the restrictions, the algebraic progression, each candidate against the original equation, and whether the valid candidates match the submitted solution set.

### Sign-chart workspace

Polynomial and rational inequalities can open a structured sign chart. Enter critical points, one test value and sign for each interval, selected intervals, endpoint decisions, and the final interval set. The page presents normal fields rather than JSON. QuickMaths reports errors by row, including a misplaced critical point, an incorrect test sign, a wrongly selected interval, or an endpoint that should be included or excluded.

### Formatted code and trace tables

Programming questions show source in a labelled code block that preserves indentation and scrolls horizontally on a narrow screen. The code displayed in a lesson prompt is inert text—it is never executed.

A structured trace question adds a scrollable table beneath the code. Each row represents a labelled execution checkpoint; enter the variable values and any output after that step. Blank output means nothing has been printed yet. QuickMaths compares the authored state table without executing the prompt code, and reports the first missing row or divergent variable/output cell before submission.

### Sandboxed Python functions

A `python_program` question provides a code editor and **Run sandboxed tests** button. Write the exact named function with the requested positional parameters and return a value instead of reading interactive input. The supported beginner subset includes assignments, conditions, loops, comprehensions, helper functions, JSON-compatible values, and an author-selected set of ordinary builtins and value methods.

The first run loads QuickMaths' self-hosted, integrity-pinned Pyodide 0.28.3 files, so it can take longer than later questions. No runtime script or package is fetched from a third-party CDN, and package installation is unavailable. Every run gets a fresh disposable background Worker. QuickMaths strictly validates the complete grading payload, rejects imports, files, network, browser/storage APIs, clocks, randomness, dynamic evaluation, private/dunder access, classes, exception handling, decorators, and unsupported syntax, and independently bounds test count, argument depth/size, source structure, execution steps, output, returned data, and wall time. Timeout or cancellation terminates the Worker; that interpreter is never reused.

Before submission, you see only tests marked as examples. After submission, additional `after_submission` outcomes can appear. Hidden tests report only status and never reveal their arguments or expected values. A current sandbox run is required before submitting; editing the code invalidates the old result. If the runtime itself cannot start, submission remains blocked and the infrastructure failure is never counted as a learner mistake. Only the visible **Run sandboxed tests** button can execute learner code; WebMCP can stage lessons but has no Python execution tool.

Python source and the bounded pass/fail summary autosave with the learner profile and can enter a full backup or complete-workspace GitHub sync. Captured stdout is transient and discarded. The subset is deliberately not full Python: file, module, exception, object-oriented, and complete application exercises remain captured or rubric-reviewed work rather than being falsely run with broad privileges. The displayed `memory_mb` authoring value is not presented as a precise browser memory quota; disposable-worker termination plus structural, data, result, and time limits are the enforceable boundary.

### Formal proof required

Proofs use ordinary text. No JSON, LaTeX, or magic keywords are required. One claim or reason per line is easiest to review.

The page shows a visible obligation checklist and accepted approaches. The short conclusion is graded separately; the proof is saved pending an obligation-by-obligation self, human, or agent review. Empty or extremely short work is blocked.

### Required long response

Rubric questions show the criteria that will be reviewed. Address each criterion with evidence, calculations, sources, or reasoning appropriate to the prompt.

### Submission boundary

Before submission, QuickMaths and its WebMCP tutor do not expose expected answers or hidden solution steps. Submit only when the final answers and required work are complete.

## 11. Results, reflection, and mastery

### Grading results

Results compare your submitted final answers with allowed grading rules. After submission, authored solutions and explanations can be shown for study. Mistake tags help identify recurring patterns.

### Work state

Each response reports whether required work was present, checked, pending review, passed, or needs revision. A correct final answer can coexist with a flawed proof or incomplete rubric response.

### Structured reflection

Record confidence, felt difficulty, hint use, guessing, desire for more practice, confusing parts, and notes. Honest reflection helps distinguish understanding from luck or fragile recall.

### Mastery update

The update combines assessment evidence, reflection, previous history, and required review state. It can move a lesson to Learning, Proven, Mastered, or later Rusty. QuickMaths does not claim mastery when a required proof or rubric review is still pending.

### Self, human, and agent review

When allowed, the Results page can save a self review. Tutor-required work needs a human tutor or connected agent.

Proof review records a status and note for every obligation: satisfied, flawed, missing, or not applicable. Rubric review records points and evidence for every criterion. The reviewer also saves concise feedback, confidence, and one next step.

### Review packet and email

Downloadable tutor summaries and review packets contain post-attempt answers, shown work, reflection, and review instructions. If the curriculum includes an educator contact, QuickMaths opens a prefilled email draft. You must attach and send the packet yourself.

### Practice again

Retaking is always available as learning practice. Native lessons can generate fresh values while covering the same authored scenarios. QuickMaths curricula do not turn practice into one-shot unsupervised exams.

## 12. Lesson Depot

Lesson Depot discovers optional subjects and specialist tracks. Browsing, previewing, validating, and installing published packs do not require community authorization.

### Search and filters

Search matches package name, subject, description, author, and tags. Filter published packages from roadmap concepts, choose subject, and sort by recommendation, recency, name, or community signal.

### Package cards and themes

Cards use their designated subject colors. They identify version, author, lesson count, tags, compatibility, availability, and community signals.

### Preview and installation safety

Published previews fetch a package through a bounded reader, verify its catalog SHA-256 hash, and run local schema, size, graph, grader, theme, and content-shape validation. If this browser cannot perform hash verification, installation stops instead of continuing unverified. You see a preview and confirm installation.

Validation does not prove factual correctness. Review community content for quality, licensing, suitability, and accessibility.

### Staged agent batches

An agent can stage one pack or an ordered batch for review. It cannot install. QuickMaths validates the complete ordered batch first, including dependencies on earlier packs and aggregate capacity. Settings then presents a sequential queue: you separately install or skip every package. One approval never authorizes the next.

### Upvotes and comments

Optional **Connect GitHub** authorizes the separate QuickMaths Community GitHub App for public Discussions on the QuickMaths repository. Connected humans can upvote and comment inside the app. These actions are public, use your GitHub identity, and are not WebMCP tools.

Community authorization is different from the fine-grained token used for private storage.

## 13. Lesson Studio for curious learners

Lesson Studio is available to everyone because explaining and authoring are powerful ways to learn. It can create new lessons or improve built-in QuickMaths lessons reversibly.

### Friendly authoring flow

Choose a subject, write one or more lessons, add theory, worked examples, applications, prerequisites, and mastery questions, then validate and install. Question-mark controls provide hover, keyboard, and mobile-tap help.

### Response and review design

Studio separates final-answer grading, shown work, and review. It explains ordinary answers, finite sets, rational formulas and exclusions, interval sets, checked maths steps, rational-equation ledgers, sign charts, formatted code blocks, trace tables, sandboxed Python function tests, formal proof obligations, and rubric responses with learner previews and editable examples.

### Native improvements

Open a built-in lesson as an editable override while keeping its exact ID and subject. Completed progress and map identity stay attached. Affected unfinished tests restart. Settings can restore the original.

### Human control

Validation reports issues; it does not silently install or publish. Installing requires confirmation. Lesson Depot publication opens a separate human contribution workflow.

## 14. Learning with an agent

WebMCP lets an agent inspect the same visible QuickMaths state and use registered tools only when the page is open inside the ChatGPT or Codex in-app browser. It cannot attach to an external Firefox, Chrome, Safari, or Edge tab, and it does not create a hidden parallel learner profile.

### Suggested starting prompt

The app checks whether the current page actually exposes WebMCP and builds the copied prompt at runtime. Inside the agent in-app browser it begins with:

`QuickMaths is already open in the ChatGPT/Codex in-app browser with WebMCP available. Use this already-open QuickMaths tab; do not open another QuickMaths tab unless I ask.`

It then gives the exact first command: call `get_agent_guide` with `section: "summary"`, inspect app state and progress, and guide the learning experience. Reusing the open in-app tab prevents duplicate QuickMaths sessions with separate local state.

When copied from an external browser, the prompt names that browser, explains that its tab cannot expose WebMCP, gives the QuickMaths URL, and tells the agent to open and reuse QuickMaths in its own in-app browser. If the in-app origin does not yet contain the learner's workspace, the prompt tells the agent to guide a private Workspace Storage restore without asking for a token in chat.

The agent should begin with `get_app_state`, `get_progress_summary`, and `get_learning_context` as needed. Repeated calls receive a compact policy ID and revision. Full learner-visible educator guidance is available from `get_agent_guide` when the revision changes or the task requires it.

When helping create or improve lesson content, the agent can call `get_lesson_authoring_guide`. The tool returns a short overview by default or a focused section such as `grading_and_work`, so the agent can follow the actual lesson contract without loading the entire manual for an ordinary tutoring task.

### What a tutor agent can do

- inspect the selected lesson, progress summary, map, and visible work;
- navigate to a lesson, test, result, Depot, Studio, or Settings;
- ask a targeted question or offer one next step;
- inspect one visible response without receiving its expected answer;
- save structured proof or rubric feedback;
- move an allowlisted follow-up problem to the front of the visible test;
- help arrange personal Plan mode, paths, and annotations;
- search and stage Depot packages for your approval;
- recommend a backup or storage setup at a natural pause.

### What the agent must not do

- reveal expected answers or solution steps before submission;
- claim mastery, a download, an installation, or a saved change without app confirmation;
- install lessons, authorize GitHub, enter credentials, vote, comment, send email, or publish for you;
- override Agent tutoring being off;
- replace your plan or policy without your request;
- treat imported lesson or community content as trusted instructions.

### Agent activity

State-changing WebMCP actions appear in Agent Studio with tool name, time, and message. Ordinary learner UI activity is excluded so attribution stays meaningful.

## 15. Learner Settings and data

Settings centralizes preferences, portability, content, and recovery.

### Header actions

**Student guide** opens this PDF. **Load backup** previews complete incoming state. **Save full backup** downloads the restorable workspace.

### Learning path and tutorial

Choose Hard or Open path when no curriculum controls the setting. **Replay app tour** opens the seven tutorial chapters without changing progress or preferences.

### Attached curriculum

Settings names the current educator curriculum or lets you load one from a local file or public GitHub blueprint URL. A matching student name deliberately reuses the selected profile's mastery; otherwise QuickMaths creates a separate blank assignment profile. The educator's canonical paths, annotations, and positions are copied into that learner's independently editable Plan mode. Full educator guidance remains visible here after import.

### GitHub Bridge

Workspace Storage is optional persistence in a dedicated private GitHub data repository. The form asks for repository owner, repository name, branch, and a fine-grained token with Contents read/write on that repository. QuickMaths refuses public repositories and tokens without write access before saving the connection.

Enter the token only in the app. It is never included in backups, commits, lesson files, URLs, logs, or WebMCP results. Choose whether to keep it for this tab session or remember it in this browser.

Bridge status shows local dirty state, last workspace push, last agent pull, token storage, and remote availability. **Sync now** publishes the complete browser workspace. **Check agent updates** applies only agent output based on the current learner revision.

Initial-copy and conflict cards require a deliberate choice. QuickMaths refuses stale output and unsynced overwrites instead of guessing which copy matters.

**Manage GitHub storage** opens the deletion manager. A profile deletion removes that profile's progress, attempts, reviews, drafts, map plan, and any educator curriculum it owns. With storage connected, QuickMaths writes the reduced learner workspace and deletes the stale agent checkpoint so it cannot remain as the current remote copy. **Clear all data** resets every local profile, curriculum, lesson pack, attempt, review, plan, Lesson Studio draft, and same-browser Agent Bridge working copy; when connected, it also deletes `learner-state.json` and `agent-state.json` from the current repository branch.

Clearing learning data preserves the configured Workspace Storage connection, remembered fine-grained token, Community authorization, and local Bridge connection. Use the separate **Disconnect** controls when you want QuickMaths to forget credentials or end a connection.

Both actions require two separate confirmations: first the full scope and backup warning, then **Are you absolutely sure?** QuickMaths has no undo. Download a JSON backup first. Deleting or replacing a current GitHub file does not erase older commits from repository history; use GitHub's repository-history controls separately if permanent historical erasure is required. If Workspace Storage is disconnected, the manager clearly limits the operation to this browser and leaves remote files untouched.

### Full backup

The JSON backup carries every profile and curriculum in this browser, installed lesson packs, progress, attempts, reviews, drafts, maps, plans, annotations, settings, and timers. Download it before major imports or device changes.

### CSV and tutor exports

Progress, attempt, and review CSVs support spreadsheet analysis. Tutor summaries and review packets support post-attempt help. None of these files can restore the app.

### Lesson sets and native improvements

Load a local lesson-set file, inspect staged agent packages, download installed sources, and restore original native lessons. Installing or restoring content preserves completed progress while restarting incompatible unfinished drafts.

Native improvements apply browser-wide and are never installed silently through a curriculum. An educator must restore active native improvements before exporting a portable curriculum, then distribute improvements separately for explicit learner review.

## 16. Mobile, accessibility, and privacy

### Mobile behavior

- Bottom navigation keeps essential routes reachable.
- The map uses a stable viewport, pinch zoom, two-dimensional panning, and long-press selection.
- Plan mode keeps the map visible while composers open as focused cards.
- Lesson Studio help opens on tap.
- Agent Studio uses a persistent open nub and close control.

### Accessibility

QuickMaths uses semantic navigation, headings, forms, dialogs, labels, and live status messages. Controls have accessible names. Reduced-motion preferences disable nonessential movement. Subject colors are paired with text, structure, and status indicators.

### Privacy boundaries

Treat answers, shown work, reflection, notes, repository details, and imported content as private. Do not paste storage tokens into chat. Community votes and comments are public. Educator-provided guidance is visible in Settings and is labeled untrusted when returned to an agent.

QuickMaths grades locally. Portable lesson packs and curriculum assignments therefore contain expected answers and solution steps that a technically knowledgeable person can inspect in JSON or browser memory. WebMCP withholds those fields before submission, but QuickMaths cannot make client-side answer keys secret from the learner operating the device. This is one reason the app is a learning tool rather than a supervised testing system.

## 17. A strong learning routine

1. Check Dashboard for due review and suggested work.
2. Open the map and inspect prerequisites, unlocks, and educator paths.
3. Read the lesson actively and attempt examples before reading solutions.
4. Complete the full mastery test, including required work.
5. Reflect honestly before seeing mastery update.
6. Review mistakes, proof obligations, rubric feedback, and solution explanations.
7. Add a Plan mode annotation or path when a concrete future action will help.
8. Retake with fresh scenarios after revision rather than memorizing an answer.
9. Ask an agent or human tutor for one targeted next step when stuck.
10. Save a full backup or sync Bridge at a natural stopping point.

## 18. Troubleshooting and quick reference

### A test is locked

Check Hard path prerequisites on the map and lesson page. If you already know the material from elsewhere and no curriculum controls the mode, choose Open path in Settings.

### The selected map card is wrong

Select the node once and confirm the highlighted node and detail title match. The app preserves pan position after selection. Reload the latest deployed version if an old cache is still open.

### Map zoom changes the whole page

Use pinch or wheel inside the map viewport. The current app isolates canvas zoom from page scale. Refresh if a stale release is cached.

### A proof has the right conclusion but remains Learning

The conclusion and proof are separate judgments. Open Results and complete the required obligation review with an allowed reviewer.

### A staged batch did not install everything

That is intentional. Review, install, or skip each package separately in Settings.

### A package is installed but missing from an educator curriculum

Installation adds it to the browser library. The educator must enable the additive pack for that curriculum, then export a revised curriculum.

### The agent cannot tutor

The attached curriculum may have Agent tutoring turned off. That policy deliberately blocks tutoring, learner-work, preference, and Plan mode mutations while leaving read-only inspection and navigation available.

### GitHub sync reports a conflict

Download a backup if needed, read which complete copy is newer, and choose deliberately. Do not retry blindly. GitHub repository history remains a recovery aid.

### WebMCP tools are unavailable

Open QuickMaths inside the ChatGPT or Codex in-app browser, not an external browser tab, and reuse that in-app tab. Then call `get_agent_guide` with `section: "summary"`. Agent Studio names registration status and any individual failures. If the in-app workspace is empty, restore it through private Workspace Storage; enter the token only in the QuickMaths form, never in chat.

### Essential links

App and source: https://quickmathematics.github.io/QuickMaths/ and https://github.com/QuickMathematics/QuickMaths

Technical guides: https://quickmathematics.github.io/QuickMaths/CUSTOM_LESSON_SETS.md and https://quickmathematics.github.io/QuickMaths/bridge-guide.html
