import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createQuickMathsStore } from "./challenge-core.js";
import { buildToolDefinitions, registerWebMcpTools, TOOL_NAMES } from "./webmcp-tools.js";

const curriculum = JSON.parse(readFileSync(new URL("./curriculum-data.json", import.meta.url), "utf8"));
const agentManifest = JSON.parse(readFileSync(new URL("./agent-manifest.json", import.meta.url), "utf8"));

function createStore({ profile = true } = {}) {
  const values = new Map();
  const store = createQuickMathsStore({
    storage: {
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, String(value)); },
    },
    curriculum,
    now: () => new Date("2026-09-01T09:42:00.000Z"),
  });
  if (profile) store.createProfile("Agent Learner");
  return store;
}

function toolsFor(store) {
  return Object.fromEntries(buildToolDefinitions(store, agentManifest).map((tool) => [tool.name, tool]));
}

test("browser shell exposes Settings, map zoom, prompt copy, and persistent Agent Studio controls", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("./challenge.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("./challenge.css", import.meta.url), "utf8");
  assert.match(html, /data-route="settings"/);
  assert.doesNotMatch(html, /class="mode-switch"|id="replay-tutorial"/);
  assert.match(js, /data-action="map-zoom-in"/);
  assert.match(js, /MAP_ZOOM_MIN = 0\.1/);
  assert.match(js, /addEventListener\("pointermove"/);
  assert.match(js, /startDistance/);
  assert.match(js, /data-tutorial-action="copy-agent-prompt"/);
  assert.match(css, /touch-action: none/);
  assert.match(css, /\.agent-dock\.is-closed/);
  assert.match(css, /\.app-shell\.agent-collapsed \.agent-toggle/);
});

test("registers all fifteen tools once with the WebMCP document context", async () => {
  const registered = [];
  const result = await registerWebMcpTools(createStore(), {
    async registerTool(definition) { registered.push(definition); },
  }, agentManifest);
  assert.equal(result.available, true);
  assert.equal(TOOL_NAMES.length, 15);
  assert.deepEqual(result.registered, TOOL_NAMES);
  assert.deepEqual(registered.map(({ name }) => name), TOOL_NAMES);
  assert.ok(registered.every(({ description }) => description.length > 0));
  assert.ok(registered.every(({ inputSchema }) => inputSchema.additionalProperties === false));
});

test("degrades cleanly when WebMCP is unavailable", async () => {
  const result = await registerWebMcpTools(createStore(), undefined);
  assert.deepEqual(result, { available: false, registered: [], error: null });
});

test("agent guide exposes operating, backup, and custom-content policy without learner answers", async () => {
  const store = createStore();
  store.startTest("MATH_ARITH_001");
  const guide = await toolsFor(store).get_agent_guide.execute({});
  const serialized = JSON.stringify(guide);
  assert.equal(guide.guide.app, "QuickMaths Web");
  assert.equal(guide.guide.backup_policy.recommend, true);
  assert.equal(guide.guide.custom_lesson_sets.format, "quickmaths.lesson-set");
  assert.equal(guide.guide.tools.length, 15);
  assert.equal(serialized.includes("expected_answer"), false);
  assert.equal(serialized.includes("finalAnswer"), false);
});

test("schemas reject unknown properties and invalid navigation values", async () => {
  const tools = toolsFor(createStore());
  await assert.rejects(tools.get_learning_context.execute({ unexpected: true }), /Unknown input property/);
  await assert.rejects(tools.navigate_learning_app.execute({ view: "somewhere" }), /view is invalid/);
});

test("app, curriculum, and progress tools expose the full learner state", async () => {
  const tools = toolsFor(createStore());
  const app = await tools.get_app_state.execute({});
  const map = await tools.get_curriculum_map.execute({ include_locked: true });
  const summary = await tools.get_progress_summary.execute({});
  assert.equal(app.has_profile, true);
  assert.equal(app.view, "tutorial");
  assert.equal(map.skills.length, 25);
  assert.equal(summary.skills.length, 25);
  assert.equal(summary.suggested_next.skill_id, "MATH_ARITH_001");
});

test("agent navigation updates the same visible route and selected skill", async () => {
  const store = createStore();
  const tools = toolsFor(store);
  const result = await tools.navigate_learning_app.execute({ view: "lesson", skill_id: "MATH_ARITH_001" });
  assert.deepEqual(result, { ok: true, visible_view: "lesson", selected_skill_id: "MATH_ARITH_001" });
  assert.equal(store.snapshot().ui.route, "lesson");
});

test("agent navigation opens Settings and normalizes the former data route", async () => {
  const store = createStore();
  const tools = toolsFor(store);
  const settings = await tools.navigate_learning_app.execute({ view: "settings" });
  assert.equal(settings.visible_view, "settings");
  const legacy = await tools.navigate_learning_app.execute({ view: "data" });
  assert.equal(legacy.visible_view, "settings");
});

test("Agent activity includes tool actions but excludes learner UI actions", async () => {
  const store = createStore();
  const tools = toolsFor(store);
  assert.deepEqual(store.snapshot().activity, []);

  store.setLearningPreferences({ progressionMode: "soft" });
  assert.deepEqual(store.snapshot().activity, []);

  await tools.set_learning_preferences.execute({ progression_mode: "hard" });
  const activity = store.snapshot().activity;
  assert.equal(activity.length, 1);
  assert.equal(activity[0].actor, "agent");
  assert.equal(activity[0].tool, "set_learning_preferences");
});

test("subject tools switch visible curricula and open the no-code creator", async () => {
  const store = createStore();
  const tools = toolsFor(store);
  const subjects = await tools.list_subjects.execute({});
  assert.equal(subjects.active_subject_id, "SUBJECT_MATH");
  assert.equal(subjects.subjects[0].skill_count, 25);
  const changed = await tools.set_learning_preferences.execute({ progression_mode: "soft" });
  assert.equal(changed.progression_mode, "soft");
  const opened = await tools.open_lesson_creator.execute({ subject_id: "SUBJECT_MATH" });
  assert.equal(opened.visible_view, "creator");
  assert.equal(store.snapshot().ui.route, "creator");
});

test("lesson-set tools validate and stage content but cannot install it", async () => {
  const store = createStore();
  const tools = toolsFor(store);
  const raw = readFileSync(new URL("./lesson-set-example.json", import.meta.url), "utf8");
  const validated = await tools.validate_lesson_set.execute({ lesson_set_json: raw });
  assert.equal(validated.valid, true);
  assert.equal(store.snapshot().lessonPacks.length, 0);
  const staged = await tools.stage_custom_lesson_set.execute({ lesson_set_json: raw });
  assert.equal(staged.requires_human_confirmation, true);
  assert.equal(store.snapshot().ui.route, "settings");
  assert.equal(store.snapshot().stagedLessonPack.id, "PACK_PERSONAL_FINANCE");
  assert.equal(store.snapshot().lessonPacks.length, 0);
  assert.equal(tools.confirm_lesson_set_install, undefined);
});

test("starting a test exposes prompts but not expected answers", async () => {
  const store = createStore();
  const tools = toolsFor(store);
  const started = await tools.start_skill_test.execute({ skill_id: "MATH_ARITH_001" });
  const context = await tools.get_learning_context.execute({ include_history: true });
  const serialized = JSON.stringify({ started, context });
  assert.equal(started.question_count, 5);
  assert.equal(store.snapshot().ui.route, "test");
  assert.equal(serialized.includes("expected_answer"), false);
  assert.equal(serialized.includes("solution_steps"), false);
});

test("locked test starts are rejected through the agent surface", async () => {
  const tools = toolsFor(createStore());
  await assert.rejects(tools.start_skill_test.execute({ skill_id: "MATH_SYS_001" }), /locked/i);
});

test("agent workflow inspects work, saves feedback, and opens a follow-up", async () => {
  const store = createStore();
  const tools = toolsFor(store);
  await tools.start_skill_test.execute({ skill_id: "MATH_ARITH_001" });
  const draft = store.snapshot().activeTest;
  const first = draft.problems[0];
  store.updateResponse(first.template_id, { finalAnswer: "definitely wrong", work: "I changed the sign." });

  const inspection = await tools.inspect_student_work.execute({ question_id: first.template_id });
  assert.equal(inspection.final_answer_status, "incorrect");
  assert.ok(inspection.mistake_tag);

  const feedback = await tools.record_tutor_feedback.execute({
    question_id: first.template_id,
    feedback: "Check what operation the two signs are asking you to perform.",
    mistake_tag: inspection.mistake_tag,
    next_step: "Rewrite the expression with one sign rule at a time.",
    confidence: "high",
    verdict: "needs_revision",
  });
  assert.equal(feedback.saved, true);
  assert.equal(store.snapshot().reviews.length, 1);
  assert.equal(store.snapshot().backupStatus.recommended, true);

  const followup = await tools.create_followup_problem.execute({
    skill_id: "MATH_ARITH_001",
    focus: inspection.mistake_tag,
  });
  assert.equal(followup.saved, true);
  assert.equal(followup.problem.skill_id, "MATH_ARITH_001");
  assert.ok(draft.problems.some((problem) => problem.template_id === followup.problem.question_id));
  assert.equal(store.snapshot().activeTest.problems[0].template_id, followup.problem.question_id);
});

test("draft-time agent feedback follows the saved attempt", async () => {
  const store = createStore();
  const tools = toolsFor(store);
  await tools.start_skill_test.execute({ skill_id: "MATH_ARITH_001" });
  const draft = store.snapshot().activeTest;
  const first = draft.problems[0];
  store.updateResponse(first.template_id, { finalAnswer: String(first.expected_answer), work: "" });
  await tools.record_tutor_feedback.execute({
    question_id: first.template_id,
    feedback: "Your sign reasoning is clear.",
    next_step: "Finish the remaining questions with the same sign check.",
    confidence: "high",
    verdict: "pass",
  });
  for (const problem of draft.problems) {
    store.updateResponse(problem.template_id, { finalAnswer: String(problem.expected_answer), work: "" });
  }
  assert.equal(store.submitTest().ok, true);
  const attempt = store.saveReflection({
    confidenceRating: 4,
    difficultyFelt: "medium",
    hintsUsed: "none",
    guessed: "no",
    wantsMorePractice: "yes",
  });
  assert.equal(store.snapshot().reviews[0].attemptId, attempt.attemptId);
});

test("registration reports partial failure without duplicating names", async () => {
  const registered = [];
  const result = await registerWebMcpTools(createStore(), {
    async registerTool(definition) {
      if (registered.length === 3) throw new Error("registration stopped");
      registered.push(definition.name);
    },
  }, agentManifest);
  assert.equal(result.available, true);
  assert.deepEqual(result.registered, TOOL_NAMES.slice(0, 3));
  assert.match(result.error, /registration stopped/);
});
