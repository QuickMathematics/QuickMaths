import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  APP_VERSION,
  DEFAULT_SUBJECT,
  LEGACY_STORAGE_KEY,
  LESSON_SET_FORMAT,
  STORAGE_KEY,
  createQuickMathsStore,
  gradeProblem,
  gradeTraceTable,
  loadState,
  normalizeLessonPack,
  normalizeLessonPackCollection,
  validateProceduralWork,
} from "./challenge-core.js";

const curriculum = JSON.parse(readFileSync(new URL("./curriculum-data.json", import.meta.url), "utf8"));
const lessonSetExample = readFileSync(new URL("./lesson-set-example.json", import.meta.url), "utf8");
const geographyLessonSet = readFileSync(new URL("./lesson-depot/lessons/geography/1.0.0/lesson-set.json", import.meta.url), "utf8");
const programmingLessonSet = readFileSync(new URL("./lesson-depot/lessons/programming-fundamentals-python/1.2.0/lesson-set.json", import.meta.url), "utf8");
const AUTHORED_MATH_SCENARIO_COUNTS = Object.freeze({
  MATH_ALG_001: 21, MATH_ALG_002: 23, MATH_ALG_003: 22, MATH_ALG_004: 24,
  MATH_ALG_005: 21, MATH_ALG_006: 24, MATH_ALG_007: 8, MATH_ALG_008: 8,
  MATH_ARITH_001: 10, MATH_ARITH_002: 16, MATH_ARITH_003: 21,
  MATH_ARITH_004: 22, MATH_ARITH_005: 25,
  MATH_GRAPH_001: 8, MATH_GRAPH_002: 8, MATH_GRAPH_003: 8,
  MATH_GRAPH_004: 8, MATH_GRAPH_005: 8, MATH_GRAPH_006: 8,
  MATH_PREALG_001: 20, MATH_PREALG_002: 18, MATH_PREALG_003: 20,
  MATH_PREALG_004: 21, MATH_PREALG_005: 23, MATH_SYS_001: 8,
  MATH_FUNC_001: 10, MATH_EXP_001: 10, MATH_RAD_001: 10,
  MATH_POLY_001: 10, MATH_POLY_002: 10, MATH_POLY_003: 10, MATH_POLY_004: 10,
  MATH_SEQ_001: 10, MATH_SEQ_002: 10, MATH_EXP_002: 12, MATH_EXP_003: 10,
  MATH_QUAD_001: 10, MATH_QUAD_002: 11, MATH_QUAD_003: 10,
  MATH_QUAD_004: 10, MATH_QUAD_005: 10,
  MATH_RAT_001: 10, MATH_RAT_002: 10, MATH_RAT_003: 10, MATH_RAT_004: 10, MATH_RAT_005: 10,
  MATH_RAT_006: 13, MATH_RAT_007: 12, MATH_INEQ_001: 12, MATH_INEQ_002: 12,
});

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    value(key) { return values.get(key); },
  };
}

function harness(seed = {}) {
  const storage = memoryStorage(seed);
  let nowMs = Date.parse("2026-09-01T09:41:00.000Z");
  const store = createQuickMathsStore({
    storage,
    curriculum,
    now: () => new Date(nowMs),
  });
  return {
    store,
    storage,
    advance(seconds) { nowMs += seconds * 1000; },
  };
}

function biologyLessonSet() {
  const pack = JSON.parse(lessonSetExample);
  pack.id = "PACK_CELL_BIOLOGY";
  pack.name = "Cell Biology";
  pack.description = "A biology subject with a bridge from Mathematics.";
  pack.subject = {
    id: "SUBJECT_BIOLOGY", name: "Biology", short_name: "Bio", icon: "DNA", description: "Cells and living systems.",
    theme: {
      paper: "#eef6f1", paperDeep: "#dcebe2", paperLight: "#ffffff", ink: "#18231d", muted: "#607067",
      line: "#c7d8ce", primary: "#225c48", primaryAlt: "#33765e", tint: "#bfe2ce", highlight: "#e4ef9b", accent: "#e06b54",
    },
  };
  pack.track.id = "TRACK_CELL_BIOLOGY";
  pack.track.name = "Cell Biology";
  pack.track.skills = ["CUSTOM_BIO_CELL_001"];
  pack.track.entry_skills = ["CUSTOM_BIO_CELL_001"];
  pack.track.exit_skills = ["CUSTOM_BIO_CELL_001"];
  const skill = pack.skills[0];
  skill.id = "CUSTOM_BIO_CELL_001";
  skill.name = "Cell ratios";
  skill.domain = "Biology";
  skill.prerequisites = [{ subject_id: "SUBJECT_MATH", skill_id: "MATH_ARITH_005" }];
  skill.problems = skill.problems.map((problem, index) => ({ ...problem, template_id: `CUSTOM_BIO_CELL_Q${String(index + 1).padStart(2, "0")}`, skill_id: skill.id }));
  return pack;
}

function chainLessonSet(index, prerequisite = { subject_id: "SUBJECT_MATH", skill_id: "MATH_ARITH_001" }) {
  const pack = JSON.parse(lessonSetExample);
  const suffix = String(index).padStart(2, "0");
  const skillId = `CUSTOM_CHAIN_${suffix}`;
  pack.id = `PACK_CHAIN_${suffix}`;
  pack.name = `Chain Pack ${suffix}`;
  pack.description = `A test lesson set for dependency position ${suffix}.`;
  pack.version = "1.0.0";
  pack.subject = {
    id: "SUBJECT_CHAIN", name: "Dependency Chain", short_name: "Chain", icon: "C", description: "Regression-test lessons.",
    theme: {
      paper: "#eef6f1", paperDeep: "#dcebe2", paperLight: "#ffffff", ink: "#18231d", muted: "#607067",
      line: "#c7d8ce", primary: "#225c48", primaryAlt: "#33765e", tint: "#bfe2ce", highlight: "#e4ef9b", accent: "#e06b54",
    },
  };
  pack.track = { id: `TRACK_CHAIN_${suffix}`, name: `Chain ${suffix}`, skills: [skillId], entry_skills: [skillId], exit_skills: [skillId] };
  const skill = pack.skills[0];
  skill.id = skillId;
  skill.name = `Chain lesson ${suffix}`;
  skill.domain = "Dependency Chain";
  skill.prerequisites = [prerequisite];
  skill.problems = skill.problems.map((problem, problemIndex) => ({ ...problem, template_id: `${skillId}_Q${problemIndex + 1}`, skill_id: skillId }));
  return pack;
}

function curriculumFile({
  name = "Imported curriculum",
  settings = { agentEnabled: true, progressionMode: "hard" },
  packs = [],
  enabledPackIds = packs.map((pack) => pack.id),
  includeNativeLessons = true,
  mapPlan = { layouts: {}, paths: [], annotations: [] },
} = {}) {
  return JSON.stringify({
    format: "quickmaths.curriculum",
    schema_version: "1.0",
    export_kind: "private_assignment",
    id: "CURRICULUM_REGRESSION_IMPORT",
    name,
    description: "A regression-test curriculum.",
    enabled_pack_ids: enabledPackIds,
    include_native_lessons: includeNativeLessons,
    settings,
    map_plan: mapPlan,
    lesson_packs: packs,
  });
}

function nativeImprovement(skillId = "MATH_ARITH_001", name = "Integer operations · revised") {
  const source = structuredClone(curriculum.skills.find((skill) => skill.id === skillId));
  const sourceSubjectId = source.subjectId ?? DEFAULT_SUBJECT.id;
  const sourceSubject = sourceSubjectId === DEFAULT_SUBJECT.id
    ? DEFAULT_SUBJECT
    : curriculum.subjects.find((subject) => subject.id === sourceSubjectId);
  return {
    format: LESSON_SET_FORMAT,
    schema_version: "2.0",
    mode: "override",
    id: `PACK_IMPROVE_${skillId}`,
    name: `Improvement · ${source.name}`,
    description: `A reversible improvement to ${source.name}.`,
    author: "QuickMaths test author",
    version: "1.0.0",
    subject: { ...structuredClone(sourceSubject), short_name: sourceSubject.shortName ?? sourceSubject.short_name },
    track: { id: `TRACK_IMPROVE_${skillId}`, name: `Improvement · ${source.name}`, skills: [skillId] },
    skills: [{ ...source, name }],
  };
}

function answerActiveTestCorrectly(store) {
  const draft = store.snapshot().activeTest;
  const configuredLength = store.skillsById[draft.skillId].question_count ?? store.skillsById[draft.skillId].problems.length;
  assert.equal(draft.problems.length, configuredLength);
  for (const problem of draft.problems) {
    store.updateResponse(problem.template_id, {
      finalAnswer: String(problem.expected_answer),
      work: problem.work_required ? workFor(problem) : "",
    });
  }
  return draft;
}

function workFor(problem, final = String(problem.expected_answer)) {
  return Array.from({ length: Math.max(1, Number(problem.work?.minimum_steps ?? 1)) }, () => final).join("\n");
}

test("passing retakes preserve mastery and its review interval", () => {
  const { store, advance } = harness();
  store.createProfile("Retake Learner");
  for (const expectedStatus of ["proven", "mastered", "mastered"]) {
    store.startTest("MATH_ARITH_001", { force: true });
    answerActiveTestCorrectly(store);
    assert.equal(store.submitTest().ok, true);
    const attempt = store.saveReflection({ confidenceRating: 4, guessed: "no" });
    assert.equal(attempt.masteryUpdate.status, expectedStatus);
    const progress = store.snapshot().progressRows.find((row) => row.id === "MATH_ARITH_001");
    assert.equal(progress.status, expectedStatus);
    assert.equal(Date.parse(progress.nextReviewAt) - Date.parse(attempt.completedAt), (expectedStatus === "mastered" ? 21 : 7) * 86_400_000);
    advance(22 * 86_400);
  }
  store.startTest("MATH_ARITH_001", { force: true });
  answerActiveTestCorrectly(store);
  store.submitTest();
  assert.equal(store.saveReflection({ confidenceRating: 1, guessed: "yes" }).masteryUpdate.status, "learning");
});

test("staged review queues survive reloads, backups, and Bridge checkpoints without installing", () => {
  const { store, storage } = harness();
  store.createProfile("Queue Learner");
  store.stageLessonPacks([chainLessonSet(1), chainLessonSet(2, { subject_id: "SUBJECT_CHAIN", skill_id: "CUSTOM_CHAIN_01" })]);
  const preview = store.snapshot().stagedLessonPack;
  const reloaded = harness({ [STORAGE_KEY]: storage.value(STORAGE_KEY) }).store;
  assert.deepEqual(reloaded.snapshot().stagedLessonPack, preview);
  assert.equal(reloaded.snapshot().lessonPacks.length, 0);
  const restored = harness().store;
  restored.importBackup(reloaded.exportBackup());
  assert.deepEqual(restored.snapshot().stagedLessonPack, preview);
  assert.equal(restored.snapshot().lessonPacks.length, 0);
  restored.installStagedLessonPack();
  const synced = harness().store;
  synced.importSyncState(restored.exportSyncState());
  assert.equal(synced.snapshot().lessonPacks.length, 1);
  assert.equal(synced.snapshot().stagedLessonPack.id, "PACK_CHAIN_02");
  assert.equal(synced.snapshot().stagedLessonPack.batchIndex, 2);
  assert.equal(synced.snapshot().stagedLessonPack.batchTotal, 2);
  synced.installStagedLessonPack();
  assert.equal(synced.snapshot().lessonPacks.length, 2);
  assert.equal(synced.snapshot().stagedLessonPack, null);
});

test("replacing workspace state replaces its staged queue, including legacy snapshots", () => {
  const { store, storage } = harness();
  store.createProfile("Queue Learner");
  const legacy = JSON.parse(store.exportSyncState());
  delete legacy.stagedLessonPacks;
  store.stageLessonPack(lessonSetExample);
  store.importSyncState(JSON.stringify(legacy));
  assert.equal(store.snapshot().stagedLessonPack, null);
  store.stageLessonPack(lessonSetExample);
  store.importBackup(JSON.stringify(legacy));
  assert.equal(store.snapshot().stagedLessonPack, null);
  store.stageLessonPack(lessonSetExample);
  storage.setItem(STORAGE_KEY, JSON.stringify(legacy));
  store.replaceFromStorage();
  assert.equal(store.snapshot().stagedLessonPack, null);
});

test("restored proposals recheck dependencies and conflicts on approval", () => {
  const { store, storage } = harness();
  store.createProfile("Queue Learner");
  store.stageLessonPacks([chainLessonSet(1), chainLessonSet(2, { subject_id: "SUBJECT_CHAIN", skill_id: "CUSTOM_CHAIN_01" })]);
  store.discardStagedLessonPack();
  const restored = harness().store;
  restored.importSyncState(store.exportSyncState());
  assert.equal(restored.snapshot().stagedLessonPack.batchIndex, 2);
  assert.throws(() => restored.installStagedLessonPack(), /missing prerequisite/);
  assert.equal(restored.snapshot().stagedLessonPack.id, "PACK_CHAIN_02");
  assert.equal(restored.snapshot().lessonPacks.length, 0);
  restored.importLessonPack(chainLessonSet(1));
  restored.installStagedLessonPack();
  assert.equal(restored.snapshot().lessonPacks.length, 2);

  store.discardStagedLessonPack();
  assert.equal(harness({ [STORAGE_KEY]: storage.value(STORAGE_KEY) }).store.snapshot().stagedLessonPack, null);
  store.stageLessonPack(lessonSetExample);
  store.importLessonPack(lessonSetExample);
  restored.importSyncState(store.exportSyncState());
  assert.throws(() => restored.installStagedLessonPack(), /already installed/);
  assert.equal(restored.snapshot().lessonPacks.length, 1);
  restored.clearAllData();
  assert.equal(restored.snapshot().stagedLessonPack, null);
});

test("invalid serialized review queues reject imports without replacing the workspace", () => {
  const { store } = harness();
  store.createProfile("Queue Learner");
  store.stageLessonPack(lessonSetExample);
  const saved = JSON.parse(store.exportSyncState());
  const corruptions = [
    (state) => { state.stagedLessonPacks = {}; },
    (state) => { state.stagedLessonPacks[0].batchIndex = 0; },
    (state) => { state.stagedLessonPacks[0].batchTotal = 21; },
    (state) => { state.stagedLessonPacks[0].pack.skills[0].problems[0].grading_method = "execute_code"; },
    (state) => { state.stagedLessonPacks[0].pack = null; },
    (state) => { state.stagedLessonPacks = Array.from({ length: 21 }, () => state.stagedLessonPacks[0]); },
    (state) => { state.stagedLessonPacks[0].pack.description = "x".repeat(2 * 1024 * 1024); },
  ];
  for (const corrupt of corruptions) {
    const invalid = structuredClone(saved);
    corrupt(invalid);
    for (const importState of [store.importBackup, store.importSyncState]) {
      const before = store.snapshot();
      assert.throws(() => importState(JSON.stringify(invalid)));
      assert.deepEqual(store.snapshot(), before);
    }
    const recovered = harness({ [STORAGE_KEY]: JSON.stringify(invalid) }).store.snapshot();
    assert.equal(recovered.activeProfile.displayName, "Queue Learner");
    assert.equal(recovered.stagedLessonPack, null);
  }
});

for (const mode of ["proof_obligations", "rubric_check"]) {
  test(`${mode} retakes retain mastery across checkpoints and repeated tutor feedback`, () => {
    let { store } = harness();
    store.createProfile("Reviewed Learner");
    const pack = biologyLessonSet();
    const problem = pack.skills[0].problems[0];
    problem.answer_mode = "final_plus_required_work";
    problem.work = mode === "proof_obligations"
      ? { mode, prompt: "Explain the claim.", proof_policy: { obligations: ["Connect the evidence"] } }
      : { mode, prompt: "Explain the model.", rubric: { criteria: [{ id: "evidence", description: "Connect the evidence", weight: 1 }] } };
    problem.review_policy = { work_review: "tutor_required", mastery_requires_review_pass: true, allow_self_review: false };
    store.importLessonPack(pack);
    store.setLearningPreferences({ progressionMode: "soft" });
    for (const [index, expectedStatus] of ["proven", "mastered", "mastered"].entries()) {
      store.startTest("CUSTOM_BIO_CELL_001", { force: true });
      const draft = store.snapshot().activeTest;
      for (const item of draft.problems) {
        store.updateResponse(item.template_id, { finalAnswer: String(item.expected_answer), work: item.work.mode === mode ? "The evidence supports the claim because each step connects to the next." : workFor(item) });
      }
      assert.equal(store.submitTest().ok, true);
      const attempt = store.saveReflection({ confidenceRating: 4, guessed: "no" });
      assert.equal(attempt.masteryUpdate.status, "learning");
      const checkpoint = store.exportSyncState();
      store = harness().store;
      store.importSyncState(checkpoint);
      for (const verdict of ["partial", "pass", "pass"]) {
        store.recordTutorFeedback({ questionId: draft.problems.find((item) => item.work.mode === mode).template_id, verdict, feedback: "Reviewed the reasoning.", nextStep: "Continue practising.", reviewerType: "human_tutor" });
        const result = store.getAttempt(attempt.attemptId);
        assert.equal(result.masteryUpdate.status, verdict === "pass" ? expectedStatus : "learning");
        assert.equal(result.masteryUpdate.masteryScore, index * 12 + (verdict === "pass" ? 12 : 3));
      }
    }
  });
}

test("ships the complete native Mathematics curriculum and opens at the profile picker", () => {
  const { store } = harness();
  const state = store.snapshot();
  assert.equal(curriculum.skills.length, 53);
  assert.equal(curriculum.skills.reduce((count, skill) => count + skill.question_count, 0), 695);
  assert.ok(curriculum.skills.reduce((count, skill) => count + skill.problems.length, 0) > 695);
  assert.equal(curriculum.skills.filter((skill) => skill.subjectId === "SUBJECT_GEOGRAPHY").length, 0);
  assert.equal(curriculum.skills.filter((skill) => skill.id.startsWith("MATH_GEOM_")).length, 3);
  assert.deepEqual(state.subjects.map((subject) => [subject.id, subject.skillIds.length]), [["SUBJECT_MATH", 53]]);
  assert.equal(state.curriculum.skills.find((skill) => skill.id === "MATH_ARITH_002").questionCount, 16);
  assert.equal(state.profiles.length, 0);
  assert.equal(state.activeProfile, null);
  assert.equal(state.ui.route, "welcome");
});

test("every Mathematics test covers every authored scenario and keeps retake variants", () => {
  assert.equal(Object.values(AUTHORED_MATH_SCENARIO_COUNTS).reduce((total, count) => total + count, 0), 665);
  for (const [skillId, expectedLength] of Object.entries(AUTHORED_MATH_SCENARIO_COUNTS)) {
    const skill = curriculum.skills.find((candidate) => candidate.id === skillId);
    assert.ok(skill, `${skillId} must ship`);
    assert.equal(skill.question_count, expectedLength, `${skillId} assessment length`);
    assert.equal(skill.native_templates.length, expectedLength, `${skillId} runtime template coverage`);
    assert.equal(new Set(skill.problems.map((problem) => problem.source_template_id)).size, expectedLength, `${skillId} authored scenario coverage`);
    assert.ok(skill.problems.length >= expectedLength, `${skillId} needs a complete question bank`);
  }
});

test("every built-in assessment starts with exactly one problem from every authored scenario", () => {
  const { store } = harness();
  store.createProfile("Coverage Auditor");
  for (const skill of curriculum.skills) {
    store.startTest(skill.id, { force: true });
    const draft = store.snapshot().activeTest;
    const scenarioIds = draft.problems.map((problem) => problem.source_template_id ?? problem.template_id);
    assert.equal(draft.problems.length, skill.question_count, `${skill.id} configured length`);
    assert.equal(new Set(scenarioIds).size, skill.question_count, `${skill.id} unique scenario coverage`);
    assert.ok(draft.problems.every((problem) => gradeProblem(problem, String(problem.expected_answer), problem.grading_method === "rational_expression" ? { excluded_values: problem.answer_metadata?.excluded_values ?? [] } : null).correct), `${skill.id} generated answers must pass their declared graders`);
    if (skill.native_templates?.length) assert.ok(draft.problems.every((problem) => problem.template_id.includes("__RUNTIME_")), `${skill.id} should generate every native scenario in-browser without bank fallback`);
  }
});

test("Depot Geography is substantial, installable, and bridges through native Mathematics", () => {
  const rawPack = JSON.parse(geographyLessonSet);
  const geography = rawPack.skills;
  assert.equal(geography.length, 15);
  assert.ok(geography.every((skill) => skill.theory.length > 2_200));
  assert.ok(geography.every((skill) => skill.examples.length >= 4));
  assert.ok(geography.every((skill) => skill.applications.length >= 3));
  assert.ok(geography.every((skill) => skill.problems.length === 10));
  assert.ok(geography.every((skill) => skill.problems.some((problem) => problem.work?.mode === "rubric_check")));

  const { store } = harness();
  store.createProfile("Geography Learner");
  assert.deepEqual(store.snapshot().subjects.map((subject) => subject.id), ["SUBJECT_MATH"]);
  const installed = store.importLessonPack(geographyLessonSet);
  assert.equal(installed.totalSkillCount, 68);
  const bridge = store.skillsById.GEO_CART_002;
  assert.ok(bridge.prerequisites.includes("MATH_GEOM_003"));
  assert.deepEqual(bridge.prerequisiteRefs, [
    { subjectId: null, skillId: "GEO_CART_001" },
    { subjectId: "SUBJECT_MATH", skillId: "MATH_GEOM_003" },
  ]);
  store.setLearningPreferences({ subjectId: "SUBJECT_GEOGRAPHY" });
  let state = store.snapshot();
  assert.equal(state.activeSubject.name, "Geography");
  assert.equal(state.progressRows.length, 15);
  assert.equal(state.progressRows.find((row) => row.id === "GEO_FOUND_001").status, "ready");
  assert.deepEqual(state.progressRows.find((row) => row.id === "GEO_CART_002").unmetPrerequisites, ["GEO_CART_001", "MATH_GEOM_003"]);
  assert.throws(() => store.startTest("GEO_CART_002"), /locked/i);
  store.setLearningPreferences({ progressionMode: "soft" });
  assert.doesNotThrow(() => store.startTest("GEO_CART_002"));
});

test("profiles from the native-Geography release migrate to the Depot package without losing progress", () => {
  const legacyState = {
    version: 13,
    activeProfileId: "legacy-geographer",
    profiles: [{
      id: "legacy-geographer", displayName: "Legacy Geographer", createdAt: "2026-09-01T09:00:00.000Z",
      activeSubjectId: "SUBJECT_GEOGRAPHY", progressionMode: "hard", mapScope: "subject", tutorialCompletedAt: "2026-09-01T09:10:00.000Z",
    }],
    progress: { "legacy-geographer": { GEO_FOUND_001: { status: "proven", masteryScore: 82, attemptCount: 2 } } },
    lessonPacks: [],
    ui: { route: "map", selectedSkillId: "GEO_FOUND_001", selectedMapSkillId: "GEO_FOUND_001" },
  };
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify(legacyState) });
  const store = createQuickMathsStore({ storage, curriculum, bundledLessonPacks: [geographyLessonSet] });
  const state = store.snapshot();
  assert.equal(state.lessonPacks[0].id, "PACK_GEOGRAPHY");
  assert.equal(state.activeSubject.id, "SUBJECT_GEOGRAPHY");
  assert.equal(state.progressRows.find((row) => row.id === "GEO_FOUND_001").masteryScore, 82);
  assert.equal(state.ui.selectedMapSkillId, "GEO_FOUND_001");
});

test("malformed storage falls back safely", () => {
  const storage = memoryStorage({ [STORAGE_KEY]: "{ definitely not json" });
  const state = loadState(storage, curriculum);
  assert.equal(state.version, APP_VERSION);
  assert.equal(state.profiles.length, 0);
  assert.equal(state.ui.route, "welcome");
});

test("a new profile gets the real unlock graph and persistent session", () => {
  const { store, storage } = harness();
  const profile = store.createProfile("Ada Learner");
  const state = store.snapshot();
  assert.equal(state.activeProfile.id, profile.id);
  assert.equal(state.ui.route, "tutorial");
  assert.equal(state.ui.tutorialStep, 0);
  assert.equal(state.activeProfile.tutorialCompletedAt, null);
  assert.equal(state.progressRows.find((row) => row.id === "MATH_ARITH_001").status, "ready");
  assert.equal(state.progressRows.find((row) => row.id === "MATH_SYS_001").status, "locked");
  assert.match(storage.value(STORAGE_KEY), /Ada Learner/);
});

test("new-profile tutorial can be stepped, skipped, replayed, and completed", () => {
  const { store } = harness();
  const profile = store.createProfile("Tour Learner");
  store.setTutorialStep(3);
  assert.equal(store.snapshot().ui.route, "tutorial");
  assert.equal(store.snapshot().ui.tutorialStep, 3);
  const skipped = store.completeTutorial({ skipped: true });
  assert.equal(skipped.skipped, true);
  assert.equal(store.snapshot().ui.route, "home");
  assert.equal(store.snapshot().activeProfile.tutorialSkipped, true);
  store.logout();
  store.selectProfile(profile.id);
  assert.equal(store.snapshot().ui.route, "home", "completed onboarding must not fire again when selecting the profile");
  store.startTutorial();
  assert.equal(store.snapshot().ui.route, "tutorial");
  assert.equal(store.snapshot().ui.tutorialStep, 0);
  store.setTutorialStep(99);
  assert.equal(store.snapshot().ui.tutorialStep, 6);
  store.completeTutorial();
  assert.equal(store.snapshot().activeProfile.tutorialSkipped, false);
});

test("Settings, map zoom, and the permanent combined-subject map persist safely", () => {
  const { store, storage } = harness();
  const firstProfile = store.createProfile("Settings Learner");
  store.completeTutorial();
  store.navigate("data");
  assert.equal(store.snapshot().ui.route, "settings");
  assert.equal(store.snapshot().mapScope, "all");
  assert.equal(store.setLearningPreferences({ mapScope: "all" }).map_scope, "all");
  assert.equal(store.setMapZoom(1.4), 1.4);
  assert.equal(store.setMapZoom(0.137), 0.14);
  assert.equal(store.setMapZoom(-10), 0.1);
  assert.equal(store.setMapZoom(99), 1.6);

  const reloaded = createQuickMathsStore({ storage, curriculum, now: () => new Date("2026-09-01T09:41:00.000Z") });
  assert.equal(reloaded.snapshot().ui.route, "settings");
  assert.equal(reloaded.snapshot().ui.mapZoom, 1.6);
  assert.equal(reloaded.snapshot().mapScope, "all");

  reloaded.createProfile("Second Learner");
  assert.equal(reloaded.snapshot().mapScope, "all", "new profiles always use the combined map");
  reloaded.selectProfile(firstProfile.id);
  assert.equal(reloaded.snapshot().mapScope, "all", "all profiles use the combined map");
  assert.throws(() => reloaded.setLearningPreferences({ mapScope: "subject" }), /always shows all installed subjects/);
  assert.throws(() => reloaded.setLearningPreferences({ mapScope: "galaxy" }), /map_scope/);
});

test("results navigation selects the requested skill's saved attempt", () => {
  const { store } = harness();
  store.createProfile("Results Learner", { demo: true });
  const attempt = store.snapshot().attempts.find((item) => item.skillId === "MATH_ARITH_002");
  store.navigate("results", "MATH_ARITH_002");
  assert.equal(store.snapshot().ui.activeAttemptId, attempt.attemptId);
  store.navigate("results", "MATH_ARITH_001");
  assert.equal(store.snapshot().ui.activeAttemptId, null, "a skill with no saved attempt must not show an unrelated latest result");
});

test("mastery-map plans persist per learner on the combined layout with colored paths and annotations", () => {
  const { store, storage } = harness();
  const firstProfile = store.createProfile("Planning Learner");
  store.completeTutorial();
  store.navigate("map");
  assert.equal(store.snapshot().ui.mapPlanView, true, "the read-only saved plan is the default map view");
  assert.equal(store.setMapPlanMode(true).enabled, true);
  assert.equal(store.setMapPlanComposer("annotation").composer, "annotation");
  store.setMapPlanSelection(["MATH_ARITH_001", "MATH_ARITH_002", "MATH_PREALG_001"]);
  store.updateMapPlanLayout({
    layoutKey: "all-subjects",
    selectedSkillIds: ["MATH_ARITH_001", "MATH_ARITH_002", "MATH_PREALG_001"],
    positions: {
      MATH_ARITH_001: { x: -110.25, y: -90.5 },
      MATH_ARITH_002: { x: 360, y: 180 },
    },
  });
  const path = store.createMapPlanPath({ name: "Algebra launch", color: "#7b4be2" });
  assert.deepEqual(path.skillIds, ["MATH_ARITH_001", "MATH_ARITH_002", "MATH_PREALG_001"]);
  store.addMapPlanAnnotation({ body: "Warm up here before Friday.", skillIds: ["MATH_ARITH_001"] });
  store.addMapPlanAnnotation({ body: "My route into equations.", skillIds: path.skillIds });
  assert.throws(() => store.addMapPlanAnnotation({ body: "Redundant path note.", pathId: path.id }), /not supported/i);
  const freeComment = store.addMapPlanAnnotation({
    body: "Remember to revisit this cluster.",
    skillIds: [],
    layoutKey: "all-subjects",
    position: { x: 480, y: 225 },
  });
  store.updateMapPlanAnnotationPosition(freeComment.id, {
    layoutKey: "all-subjects",
    position: { x: 505.5, y: 240.25 },
  });
  store.updateMapPlanPath(path.id, { color: "#1255aa" });
  store.setMapPlanNodesHidden(["MATH_ARITH_002", "MATH_PREALG_001"], true);
  assert.deepEqual(store.snapshot().ui.mapPlanSelection, ["MATH_ARITH_001"]);
  assert.equal(store.setMapPlanShowHidden(true).visible, true);
  store.setMapPlanSelection(["MATH_ARITH_002"]);
  store.setMapPlanNodesHidden(["MATH_ARITH_002"], false);

  let state = store.snapshot();
  assert.equal(state.ui.mapPlanMode, true);
  assert.deepEqual(state.mapPlan.layouts["all-subjects"].MATH_ARITH_001, { x: -110.25, y: -90.5 });
  assert.equal(state.mapPlan.paths[0].color, "#1255aa");
  assert.deepEqual(state.mapPlan.hiddenSkillIds, ["MATH_PREALG_001"]);
  assert.equal(state.mapPlan.annotations.length, 3);
  assert.equal(state.mapPlan.annotations[2].targetType, "free");
  assert.deepEqual(state.mapPlan.annotations[2].positions["all-subjects"], { x: 505.5, y: 240.25 });
  assert.match(store.exportBackup(), /My route into equations/);

  const reloaded = createQuickMathsStore({ storage, curriculum, now: () => new Date("2026-09-01T09:41:00.000Z") });
  state = reloaded.snapshot();
  assert.equal(state.mapPlan.paths[0].name, "Algebra launch");
  assert.equal(state.mapPlan.annotations[0].body, "Warm up here before Friday.");
  assert.equal(state.mapPlan.annotations[2].positions["all-subjects"].x, 505.5);
  assert.equal(state.mapPlan.layouts["all-subjects"].MATH_ARITH_002.x, 360);
  assert.deepEqual(state.mapPlan.hiddenSkillIds, ["MATH_PREALG_001"]);
  reloaded.setMapPlanMode(false);
  assert.equal(reloaded.snapshot().ui.mapPlanMode, false);
  assert.equal(reloaded.snapshot().ui.mapPlanView, true, "leaving the editor returns to read-only Plan view");
  assert.equal(reloaded.snapshot().ui.mapPlanComposer, null);
  assert.equal(reloaded.snapshot().mapPlan.paths.length, 1, "closing Plan mode must not erase the plan");
  assert.equal(reloaded.setMapPlanView(false).enabled, false);
  assert.equal(reloaded.setMapPlanView(true).enabled, true);

  reloaded.createProfile("Independent Planner");
  assert.deepEqual(reloaded.snapshot().mapPlan, { layouts: {}, paths: [], annotations: [], hiddenSkillIds: [] });
  reloaded.selectProfile(firstProfile.id);
  assert.equal(reloaded.snapshot().mapPlan.paths.length, 1, "plans belong to their learner profile");
  assert.throws(() => reloaded.createMapPlanPath({ skillIds: ["MATH_ARITH_001"] }), /at least two/i);
  assert.throws(() => reloaded.updateMapPlanPath(path.id, { color: "tomato" }), /valid path color/i);
});

test("legacy path annotations migrate to lesson-connected annotations", () => {
  const { store, storage } = harness();
  const profile = store.createProfile("Legacy Path Notes");
  store.completeTutorial();
  store.setMapPlanMode(true);
  const skillIds = ["MATH_ARITH_001", "MATH_ARITH_002"];
  const path = store.createMapPlanPath({ name: "Old route", skillIds });
  const persisted = JSON.parse(storage.value(STORAGE_KEY));
  persisted.mapPlans[profile.id].annotations = [{
    id: "legacy-path-note",
    targetType: "path",
    pathId: path.id,
    skillIds: [],
    positions: {},
    body: "This note used to belong to the path.",
    createdAt: "2026-09-01T09:41:00.000Z",
    updatedAt: "2026-09-01T09:41:00.000Z",
  }];
  storage.setItem(STORAGE_KEY, JSON.stringify(persisted));

  const reloaded = createQuickMathsStore({ storage, curriculum, now: () => new Date("2026-09-01T09:41:00.000Z") });
  const [annotation] = reloaded.snapshot().mapPlan.annotations;
  assert.deepEqual(annotation.skillIds, skillIds);
  assert.equal(annotation.targetType, "nodes");
  assert.equal("pathId" in annotation, false);
});

test("educator curricula isolate packs, export canonical plans, and keep practice repeatable", () => {
  const { store } = harness();
  store.createProfile("Curriculum Educator", { role: "educator" });
  assert.equal(store.snapshot().ui.route, "curriculum");
  assert.equal(store.snapshot().activeProfile.role, "educator");
  assert.equal(store.snapshot().activeProfile.educatorGuideSeenAt, null);
  const welcome = store.completeEducatorWelcome();
  assert.equal(welcome.ok, true);
  assert.match(store.snapshot().activeProfile.educatorGuideSeenAt, /^2026-/);
  store.importLessonPack(geographyLessonSet);
  assert.equal(store.snapshot().curriculum.allSkills.length, 68);
  store.setCurriculumPackEnabled("PACK_GEOGRAPHY", false);
  assert.equal(store.snapshot().curriculum.allSkills.length, 53);
  store.updateCurriculum({ name: "Ada's rigorous route", description: "A focused mathematics curriculum." });
  store.updateCurriculumSettings({
    studentName: "Ada",
    agentEnabled: true,
    agentInstructions: "Ask targeted questions and never complete assessed work.",
    progressionMode: "soft",
    contactEmail: "teacher@example.com",
    maxAttemptsPerLesson: 1,
  });
  store.updateMapPlanLayout({ layoutKey: "all-subjects", positions: { MATH_ARITH_001: { x: 120, y: 80 } } });
  store.createMapPlanPath({ name: "Arithmetic start", color: "#556677", skillIds: ["MATH_ARITH_001", "MATH_ARITH_002"] });
  const publicRaw = store.exportCurriculum();
  assert.match(publicRaw, /quickmaths\.curriculum/);
  assert.doesNotMatch(publicRaw, /Ask targeted questions/);
  assert.doesNotMatch(publicRaw, /teacher@example\.com/);
  assert.doesNotMatch(publicRaw, /"studentName": "Ada"/);
  const publicPreview = harness().store.previewCurriculum(publicRaw);
  assert.equal(publicPreview.educatorGuidance, "");
  assert.equal(publicPreview.hasCustomAgentGuidance, false);
  const raw = store.exportCurriculum(undefined, { kind: "private_assignment" });
  assert.match(raw, /Ask targeted questions/);
  assert.match(raw, /teacher@example\.com/);

  const learnerHarness = harness();
  const preview = learnerHarness.store.previewCurriculum(raw);
  assert.equal(preview.name, "Ada's rigorous route");
  const imported = learnerHarness.store.importCurriculum(raw, { attach: false });
  learnerHarness.store.createProfile("Ada", { curriculumId: imported.id });
  let state = learnerHarness.store.snapshot();
  assert.equal("maxAttemptsPerLesson" in state.activeCurriculum.settings, false, "legacy retake caps are ignored");
  assert.equal("masteryEnabled" in state.activeCurriculum.settings, false);
  assert.equal(state.progressionMode, "soft");
  assert.equal(state.curriculum.allSkills.length, 53);
  assert.equal(state.curriculumPlan.paths[0].name, "Arithmetic start");
  assert.equal(state.mapPlan.paths[0].name, "Arithmetic start", "the learner receives an editable copy of the canonical plan");
  assert.deepEqual(state.curriculumPlan.layouts["all-subjects"].MATH_ARITH_001, { x: 120, y: 80 });

  learnerHarness.store.startTest("MATH_ARITH_001");
  answerActiveTestCorrectly(learnerHarness.store);
  assert.equal(learnerHarness.store.submitTest().ok, true);
  const attempt = learnerHarness.store.saveReflection({ confidenceRating: 5, difficultyFelt: "hard", hintsUsed: "none", guessed: "no", wantsMorePractice: "yes" });
  assert.equal(attempt.masteryUpdate.status, "proven");
  assert.doesNotThrow(() => learnerHarness.store.startTest("MATH_ARITH_001"), "curricula never turn practice into a one-shot exam");
  state = learnerHarness.store.snapshot();
  assert.equal(state.progressRows.find((row) => row.id === "MATH_ARITH_001").attemptCount, 1);
  assert.match(learnerHarness.store.exportBackup(), /Ada's rigorous route/);
});

test("educator curricula can exclude native Mathematics and completion scope follows visible content", () => {
  const { store } = harness();
  store.createProfile("Programming Educator", { role: "educator" });
  assert.throws(() => store.setCurriculumNativeLessonsEnabled(false), /must include native Mathematics or at least one enabled lesson pack/i);
  store.importLessonPack(programmingLessonSet);
  const result = store.setCurriculumNativeLessonsEnabled(false);
  assert.equal(result.enabled, false);
  const snapshot = store.snapshot();
  assert.equal(snapshot.activeCurriculum.includeNativeLessons, false);
  assert.ok(snapshot.curriculum.allSkills.length >= 25);
  assert.ok(snapshot.curriculum.allSkills.length < 79, "unrelated native Mathematics lessons must be excluded");
  const retainedMath = snapshot.curriculum.allSkills.filter((skill) => skill.subjectId === "SUBJECT_MATH");
  assert.ok(retainedMath.length > 0 && retainedMath.length < 53, "only prerequisite Mathematics foundations should remain");
  assert.equal(retainedMath.some((skill) => skill.id === "MATH_ARITH_001"), true);
  const exported = JSON.parse(store.exportCurriculum());
  assert.equal(exported.include_native_lessons, false);
  const imported = harness().store.previewCurriculum(JSON.stringify(exported));
  assert.equal(imported.enabledPackCount, 1);
});

test("curriculum assignments reuse mastery only for a matching student name", () => {
  const educator = harness();
  educator.store.createProfile("Teacher", { role: "educator" });
  educator.store.updateCurriculum({ name: "Ada assignment" });
  educator.store.updateCurriculumSettings({ studentName: "Ada", agentInstructions: "Ask Ada to explain each choice." });
  const assignment = educator.store.exportCurriculum(undefined, { kind: "private_assignment" });

  const matching = harness();
  const ada = matching.store.createProfile("  ADA  ", { demo: true });
  const matchingResult = matching.store.importCurriculum(assignment);
  assert.equal(matchingResult.reusedMastery, true);
  assert.equal(matchingResult.assignmentProfileCreated, false);
  assert.equal(matching.store.snapshot().activeProfile.id, ada.id);
  assert.equal(matching.store.snapshot().progressRows.find((row) => row.id === "MATH_ARITH_001").attemptCount, 2);

  const mismatched = harness();
  const bob = mismatched.store.createProfile("Bob", { demo: true });
  const mismatchResult = mismatched.store.importCurriculum(assignment);
  assert.equal(mismatchResult.reusedMastery, false);
  assert.equal(mismatchResult.assignmentProfileCreated, true);
  assert.equal(mismatched.store.snapshot().activeProfile.displayName, "Ada");
  assert.equal(mismatched.store.snapshot().progressRows.find((row) => row.id === "MATH_ARITH_001").attemptCount, 0);
  mismatched.store.selectProfile(bob.id);
  assert.equal(mismatched.store.snapshot().progressRows.find((row) => row.id === "MATH_ARITH_001").attemptCount, 2, "the original learner keeps independent mastery");
});

test("curriculum import copies its canonical plan into both fresh and matching learner workspaces", () => {
  const plan = {
    layouts: { "subject:SUBJECT_MATH": { MATH_ARITH_001: { x: 220, y: 140 } } },
    paths: [{ id: "path-one", name: "First route", color: "#4455aa", skillIds: ["MATH_ARITH_001", "MATH_ARITH_002"] }],
    annotations: [{ id: "note-one", body: "Begin here.", targetType: "skills", skillIds: ["MATH_ARITH_001"], pathId: null, positions: {}, createdAt: "2026-09-01T09:41:00.000Z", updatedAt: "2026-09-01T09:41:00.000Z" }],
  };
  for (const profileName of ["Ada", "Bob"]) {
    const { store } = harness();
    store.createProfile(profileName);
    const result = store.importCurriculum(curriculumFile({ settings: { studentName: "Ada", agentEnabled: true, progressionMode: "hard" }, mapPlan: plan }));
    const snapshot = store.snapshot();
    assert.equal(snapshot.mapPlan.paths[0].name, "First route");
    assert.equal(snapshot.mapPlan.annotations[0].body, "Begin here.");
    assert.deepEqual(snapshot.mapPlan.layouts["subject:SUBJECT_MATH"].MATH_ARITH_001, { x: 220, y: 140 });
    assert.equal(result.assignmentProfileCreated, profileName === "Bob");
  }
});

test("external curriculum settings are strict and package contents are reproducible", () => {
  const { store } = harness();
  assert.throws(() => store.previewCurriculum(curriculumFile({ settings: { agent_enabled: "false" } })), /agentEnabled must be true or false/i);
  assert.throws(() => store.previewCurriculum(curriculumFile({ settings: { agentEnabled: true, progressionMode: "free" } })), /progressionMode must be hard or soft/i);

  const pack = chainLessonSet(1);
  store.importLessonPack(JSON.stringify(pack));
  const altered = structuredClone(pack);
  altered.skills[0].problems[0].expected_answer = "999999";
  assert.throws(() => store.previewCurriculum(curriculumFile({ packs: [altered] })), /does not match the curriculum copy/i);
  assert.throws(() => store.previewCurriculum(curriculumFile({ packs: [], enabledPackIds: [pack.id] })), /must be embedded/i);
  assert.throws(() => store.previewCurriculum(curriculumFile({ packs: [nativeImprovement()] })), /cannot install browser-wide native lesson improvements/i);
});

test("curriculum package capacity counts only new content", () => {
  const { store } = harness();
  const packs = Array.from({ length: 9 }, (_, index) => chainLessonSet(index + 1, index ? `CUSTOM_CHAIN_${String(index).padStart(2, "0")}` : undefined));
  packs.forEach((pack) => store.importLessonPack(JSON.stringify(pack)));
  const embedded = [JSON.parse(store.exportLessonPack(packs[0].id)), JSON.parse(store.exportLessonPack(packs[1].id))];
  assert.doesNotThrow(() => store.previewCurriculum(curriculumFile({ packs: embedded, enabledPackIds: embedded.map((pack) => pack.id) })));
});

test("ordered staging resolves earlier batch dependencies and preflights aggregate capacity", () => {
  const ordered = harness().store;
  const first = chainLessonSet(1);
  const second = chainLessonSet(2, "CUSTOM_CHAIN_01");
  const result = ordered.stageLessonPacks([JSON.stringify(first), JSON.stringify(second)]);
  assert.equal(result.staged_count, 2);
  assert.equal(ordered.snapshot().stagedLessonPack.id, first.id);

  const full = harness().store;
  for (let index = 1; index <= 9; index += 1) {
    full.importLessonPack(JSON.stringify(chainLessonSet(index, index === 1 ? undefined : `CUSTOM_CHAIN_${String(index - 1).padStart(2, "0")}`)));
  }
  assert.throws(() => full.stageLessonPacks([
    JSON.stringify(chainLessonSet(10, "CUSTOM_CHAIN_09")),
    JSON.stringify(chainLessonSet(11, "CUSTOM_CHAIN_10")),
  ]), /at most 10 installed lesson sets/i);
  assert.equal(full.snapshot().stagedLessonPack, null, "the review queue never opens for an impossible batch");
});

test("curriculum pack disabling validates hidden dependencies and offers explicit plan cleanup", () => {
  const { store } = harness();
  const first = chainLessonSet(1);
  const second = chainLessonSet(2, "CUSTOM_CHAIN_01");
  store.importLessonPack(JSON.stringify(first));
  store.importLessonPack(JSON.stringify(second));
  store.createProfile("Planner", { role: "educator" });
  store.setCurriculumPackEnabled(first.id, true);
  store.setCurriculumPackEnabled(second.id, true);
  assert.throws(() => store.setCurriculumPackEnabled(first.id, false), /depends on .* disabled lesson set/i);
  store.setCurriculumPackEnabled(second.id, false);
  store.updateMapPlanLayout({ layoutKey: "all-subjects", positions: { CUSTOM_CHAIN_01: { x: 10, y: 20 } } });
  assert.throws(() => store.setCurriculumPackEnabled(first.id, false), (error) => error?.code === "curriculum_plan_references");
  const cleaned = store.setCurriculumPackEnabled(first.id, false, { removePlanReferences: true });
  assert.ok(cleaned.removedPlanReferences > 0);
  assert.equal(store.snapshot().curriculum.allSkills.some((skill) => skill.id === "CUSTOM_CHAIN_01"), false);
});

test("curriculum import rejects an enabled graph with a disabled prerequisite pack", () => {
  const { store } = harness();
  const prerequisite = chainLessonSet(1);
  const dependent = chainLessonSet(2, "CUSTOM_CHAIN_01");
  assert.throws(() => store.previewCurriculum(curriculumFile({
    packs: [prerequisite, dependent],
    enabledPackIds: [dependent.id],
  })), /depends on .* disabled lesson set/i);
  assert.throws(() => store.previewCurriculum(curriculumFile({
    packs: [prerequisite, dependent],
    enabledPackIds: [dependent.id],
    includeNativeLessons: false,
  })), /depends on .* disabled lesson set/i, "native prerequisite closure must not silently enable a disabled external pack");
  assert.equal(store.snapshot().lessonPacks.length, 0, "a rejected curriculum must not install embedded packs");
});

test("profile creation limits fail before ephemeral state can be created", () => {
  const { store } = harness();
  for (let index = 1; index <= 30; index += 1) store.createProfile(`Learner ${index}`);
  assert.throws(() => store.createProfile("Learner 31"), /at most 30 profiles/i);
  assert.equal(store.snapshot().profiles.length, 30);
});

test("profile deletion removes every profile-owned record and educator curriculum", () => {
  const { store } = harness();
  const learner = store.createProfile("Delete Learner", { demo: true });
  const educator = store.createProfile("Delete Educator", { role: "educator" });
  const educatorCurriculumId = store.snapshot().activeCurriculum.id;
  const kept = store.createProfile("Keep Learner", { curriculumId: educatorCurriculumId });

  const learnerDeletion = store.deleteProfile(learner.id);
  assert.equal(learnerDeletion.remainingProfiles, 2);
  let persisted = JSON.parse(store.exportSyncState());
  assert.equal(persisted.profiles.some((profile) => profile.id === learner.id), false);
  assert.equal(persisted.progress[learner.id], undefined);
  assert.equal(persisted.drafts[learner.id], undefined);
  assert.equal(persisted.mapPlans[learner.id], undefined);
  assert.equal(persisted.attempts.some((attempt) => attempt.profileId === learner.id), false);
  assert.equal(persisted.activity.some((item) => item.profileId === learner.id), false);

  const educatorDeletion = store.deleteProfile(educator.id);
  assert.equal(educatorDeletion.deletedCurriculumCount, 1);
  persisted = JSON.parse(store.exportSyncState());
  assert.equal(persisted.curricula.some((item) => item.id === educatorCurriculumId), false);
  assert.equal(persisted.profiles.find((profile) => profile.id === kept.id).curriculumId, null);
  assert.equal(store.snapshot().activeProfile.id, kept.id);
});

test("clearing all data resets the persisted workspace and returns to welcome", () => {
  const { store, storage } = harness();
  store.createProfile("Clear Everything", { demo: true });
  store.importLessonPack(geographyLessonSet);
  const removed = store.clearAllData();
  assert.deepEqual(removed.removed, { profiles: 1, curricula: 0, lessonPacks: 1, attempts: 1, reviews: 0 });
  const snapshot = store.snapshot();
  assert.equal(snapshot.activeProfile, null);
  assert.equal(snapshot.profiles.length, 0);
  assert.equal(snapshot.lessonPacks.length, 0);
  assert.equal(snapshot.ui.route, "welcome");
  const persisted = JSON.parse(storage.value(STORAGE_KEY));
  assert.equal(persisted.version, APP_VERSION);
  assert.deepEqual(persisted.profiles, []);
  assert.deepEqual(persisted.lessonPacks, []);
});

test("selecting a mastery-map node updates both the detail card and routed skill", () => {
  const { store } = harness();
  store.createProfile("Map Learner");
  store.completeTutorial();
  store.navigate("map", "MATH_ARITH_001");

  store.selectMapSkill("MATH_PREALG_003");

  const state = store.snapshot();
  assert.equal(state.ui.selectedMapSkillId, "MATH_PREALG_003");
  assert.equal(state.ui.selectedSkillId, "MATH_PREALG_003");
  assert.equal(state.selectedMapSkill.id, "MATH_PREALG_003");
  assert.equal(state.selectedSkill.id, "MATH_PREALG_003");
});

test("profiles from older saves are treated as already onboarded", () => {
  const storage = memoryStorage({
    [STORAGE_KEY]: JSON.stringify({
      version: 4,
      profiles: [{ id: "profile-old", displayName: "Existing Learner", createdAt: "2026-08-01T00:00:00.000Z" }],
      activeProfileId: null,
    }),
  });
  const store = createQuickMathsStore({ storage, curriculum, now: () => new Date("2026-09-01T09:41:00.000Z") });
  store.selectProfile("profile-old");
  assert.equal(store.snapshot().ui.route, "home");
  assert.equal(store.snapshot().activeProfile.tutorialCompletedAt, "2026-08-01T00:00:00.000Z");
});

test("the demo profile arrives with visible progress and a suggested next step", () => {
  const { store } = harness();
  store.createProfile("Demo Learner", { demo: true });
  const state = store.snapshot();
  assert.equal(state.progressRows.find((row) => row.id === "MATH_ARITH_001").status, "proven");
  assert.equal(state.progressRows.find((row) => row.id === "MATH_ARITH_002").status, "learning");
  assert.equal(state.suggested.id, "MATH_ARITH_002");
  assert.equal(state.attempts.length, 1);
});

test("the analog-clock timers accumulate and persist profile time", () => {
  const { store, storage, advance } = harness();
  store.createProfile("Time Keeper");
  advance(31);
  store.heartbeat();
  assert.equal(store.snapshot().timers.sessionSeconds, 31);
  assert.equal(store.snapshot().timers.profileSeconds, 31);
  assert.match(storage.value(STORAGE_KEY), /"totalLoggedSeconds":31/);
});

test("a complete mastery-test reflection records an attempt and unlocks dependent skills", () => {
  const { store } = harness();
  store.createProfile("Test Learner");
  store.startTest("MATH_ARITH_001");
  answerActiveTestCorrectly(store);
  const submitted = store.submitTest();
  assert.equal(submitted.ok, true);
  assert.equal(submitted.results.rawScore, 10);

  const attempt = store.saveReflection({
    confidenceRating: 4,
    difficultyFelt: "medium",
    hintsUsed: "none",
    guessed: "no",
    wantsMorePractice: "yes",
    confusingParts: "",
    notes: "Solid signs practice.",
  });
  assert.equal(attempt.percentScore, 1);
  assert.equal(attempt.masteryUpdate.status, "proven");
  assert.equal(store.statusForSkill("MATH_ARITH_002"), "ready");
  assert.equal(store.snapshot().attempts.length, 1);
  assert.equal(store.snapshot().activeTest, null);
});

test("native retakes generate fresh comprehensive sets in the browser", () => {
  const { store } = harness();
  store.createProfile("Retake Learner");
  store.startTest("MATH_ARITH_001");
  const firstDraft = store.snapshot().activeTest;
  const firstIds = firstDraft.problems.map((problem) => problem.template_id);
  answerActiveTestCorrectly(store);
  store.submitTest();
  store.saveReflection({ confidenceRating: 4, difficultyFelt: "medium", hintsUsed: "none", guessed: "no" });
  store.startTest("MATH_ARITH_001");
  const secondDraft = store.snapshot().activeTest;
  const secondIds = secondDraft.problems.map((problem) => problem.template_id);
  assert.equal(firstIds.length, 10);
  assert.equal(secondIds.length, 10);
  assert.deepEqual(
    [...new Set(firstDraft.problems.map((problem) => problem.source_template_id))].sort(),
    [...new Set(secondDraft.problems.map((problem) => problem.source_template_id))].sort(),
  );
  assert.ok(secondIds.some((id) => !firstIds.includes(id)));
  assert.ok(secondDraft.problems.some((problem) => {
    const previous = firstDraft.problems.find((item) => item.source_template_id === problem.source_template_id);
    return previous && (previous.prompt !== problem.prompt || previous.expected_answer !== problem.expected_answer);
  }), "at least one generated scenario should draw fresh values");
});

test("saved five-question drafts expand in place without losing existing answers", () => {
  const { store, storage } = harness();
  store.createProfile("Persistent Test Learner");
  store.startTest("MATH_ALG_002", { force: true });
  assert.equal(store.snapshot().activeTest.problems.length, 23);
  const saved = JSON.parse(storage.value(STORAGE_KEY));
  const profileId = saved.activeProfileId;
  const legacyDraft = saved.drafts[profileId].MATH_ALG_002;
  legacyDraft.problems = legacyDraft.problems.slice(0, 5);
  const firstQuestionId = legacyDraft.problems[0].template_id;
  legacyDraft.problems[0].expected_answer = "tampered answer key";
  legacyDraft.responses[firstQuestionId].finalAnswer = "preserved answer";
  storage.setItem(STORAGE_KEY, JSON.stringify(saved));
  const reloaded = createQuickMathsStore({
    storage,
    curriculum,
    now: () => new Date("2026-09-01T09:42:00.000Z"),
  });
  assert.equal(reloaded.snapshot().activeTest.problems.length, 23);
  assert.equal(reloaded.snapshot().activeTest.responses[firstQuestionId].finalAnswer, "preserved answer");
  assert.notEqual(reloaded.snapshot().activeTest.problems.find((problem) => problem.template_id === firstQuestionId).expected_answer, "tampered answer key");
});

test("a valid custom lesson set joins the real curriculum without replacing built-in skills", () => {
  const { store } = harness();
  store.createProfile("Pack Learner");
  const preview = store.previewLessonPack(lessonSetExample);
  assert.equal(preview.id, "PACK_PERSONAL_FINANCE");
  assert.equal(preview.skillCount, 1);
  assert.equal(store.snapshot().progressRows.length, 53, "preview must not mutate state");

  const installed = store.importLessonPack(lessonSetExample);
  const state = store.snapshot();
  assert.equal(installed.totalSkillCount, 54);
  assert.equal(state.lessonPacks.length, 1);
  assert.equal(state.progressRows.length, 54);
  assert.equal(state.curriculum.skills.find((skill) => skill.id === "CUSTOM_FINANCE_DISCOUNTS").custom, true);
  assert.equal(store.statusForSkill("CUSTOM_FINANCE_DISCOUNTS"), "locked");
  assert.match(store.exportLessonPack("PACK_PERSONAL_FINANCE"), new RegExp(LESSON_SET_FORMAT));
});

test("agent-staged lesson batches require sequential human decisions", () => {
  const { store } = harness();
  store.createProfile("Batch Reviewer");
  const staged = store.stageLessonPacks([lessonSetExample, geographyLessonSet], { activityActor: "agent" });
  assert.equal(staged.staged_count, 2);
  assert.equal(staged.sequential_review, true);
  let state = store.snapshot();
  assert.equal(state.ui.route, "settings");
  assert.equal(state.stagedLessonPack.id, "PACK_PERSONAL_FINANCE");
  assert.equal(state.stagedLessonPack.batchIndex, 1);
  assert.equal(state.stagedLessonPack.batchTotal, 2);
  assert.equal(state.lessonPacks.length, 0, "staging never installs content");

  const installed = store.installStagedLessonPack();
  assert.equal(installed.id, "PACK_PERSONAL_FINANCE");
  assert.equal(installed.reviewQueueRemaining, 1);
  state = store.snapshot();
  assert.equal(state.stagedLessonPack.id, "PACK_GEOGRAPHY");
  assert.equal(state.stagedLessonPack.batchIndex, 2);
  assert.equal(state.lessonPacks.length, 1, "one approval installs only one package");

  const skipped = store.discardStagedLessonPack();
  assert.equal(skipped.reviewQueueRemaining, 0);
  assert.equal(store.snapshot().stagedLessonPack, null);
  assert.equal(store.snapshot().lessonPacks.length, 1, "skipping the second package leaves it uninstalled");
});

test("native lesson improvements replace content reversibly without moving IDs or completed learner progress", () => {
  const { store } = harness();
  store.createProfile("Native Editor");
  store.startTest("MATH_ARITH_001", { force: true });
  answerActiveTestCorrectly(store);
  store.submitTest();
  store.saveReflection({ confidenceRating: 4, difficultyFelt: "medium", hintsUsed: "none", guessed: "no" });
  const before = store.snapshot().progressRows.find((row) => row.id === "MATH_ARITH_001");
  store.startTest("MATH_ARITH_001", { force: true });

  const preview = store.previewLessonPack(nativeImprovement());
  assert.equal(preview.mode, "override");
  assert.deepEqual(preview.overridesNativeSkills, ["MATH_ARITH_001"]);
  assert.equal(store.snapshot().curriculum.allSkills.length, 53, "preview must not mutate the curriculum");

  const installed = store.importLessonPack(nativeImprovement());
  let state = store.snapshot();
  const improved = state.progressRows.find((row) => row.id === "MATH_ARITH_001");
  assert.equal(installed.mode, "override");
  assert.equal(installed.completedProgressPreserved, true);
  assert.equal(installed.restartedDraftCount, 1);
  assert.equal(installed.totalSkillCount, 53);
  assert.equal(state.curriculum.allSkills.length, 53);
  assert.equal(improved.name, "Integer operations · revised");
  assert.equal(improved.native, true);
  assert.equal(improved.overridden, true);
  assert.equal(improved.attemptCount, before.attemptCount);
  assert.equal(improved.masteryScore, before.masteryScore);
  assert.equal(state.activeTest, null);

  store.startTest("MATH_ARITH_001", { force: true });
  const improvedDraft = store.snapshot().activeTest;
  assert.equal(new Set(improvedDraft.problems.map((problem) => problem.source_template_id)).size, 10);
  const restored = store.restoreNativeLessons("PACK_IMPROVE_MATH_ARITH_001");
  state = store.snapshot();
  const original = state.progressRows.find((row) => row.id === "MATH_ARITH_001");
  assert.deepEqual(restored.restored, ["MATH_ARITH_001"]);
  assert.equal(restored.completedProgressPreserved, true);
  assert.equal(restored.restartedDraftCount, 1);
  assert.equal(original.name, "Integer operations");
  assert.equal(original.overridden, false);
  assert.equal(original.attemptCount, before.attemptCount);
  assert.equal(original.masteryScore, before.masteryScore);
  assert.equal(state.activeTest, null);
});

test("native improvements enforce the built-in identity and round-trip through full backups", () => {
  const source = harness();
  source.store.createProfile("Portable Improvement");
  source.store.importLessonPack(nativeImprovement());
  assert.throws(() => source.store.importLessonPack({ ...nativeImprovement(), id: "PACK_IMPROVE_MATH_ARITH_001_AGAIN" }), /already has an installed improvement/i);

  const exporter = harness();
  exporter.store.createProfile("Improvement Educator", { role: "educator" });
  exporter.store.importLessonPack(nativeImprovement());
  assert.throws(() => exporter.store.exportCurriculum(), /Restore installed native improvement/i);

  const missing = nativeImprovement();
  missing.id = "PACK_IMPROVE_MISSING_NATIVE";
  missing.skills[0].id = "MATH_NOT_NATIVE_999";
  missing.track.skills = ["MATH_NOT_NATIVE_999"];
  assert.throws(() => source.store.previewLessonPack(missing), /not a native QuickMaths lesson/i);

  const moved = nativeImprovement();
  moved.id = "PACK_IMPROVE_MOVED_NATIVE";
  moved.subject = structuredClone(biologyLessonSet().subject);
  assert.throws(() => source.store.previewLessonPack(moved), /belongs to SUBJECT_MATH/i);

  const target = harness();
  target.store.importBackup(source.store.exportBackup());
  target.store.selectProfile(target.store.snapshot().profiles[0].id);
  const restored = target.store.snapshot();
  assert.equal(restored.lessonPacks[0].mode, "override");
  assert.equal(restored.curriculum.allSkills.length, 53);
  assert.equal(restored.allProgressRows.find((row) => row.id === "MATH_ARITH_001").name, "Integer operations · revised");
});

test("subjects share one visible map, apply bridge locks, and theme the last opened lesson", () => {
  const { store } = harness();
  store.createProfile("Biology Learner");
  const preview = store.previewLessonPack(biologyLessonSet());
  assert.equal(preview.subjectId, "SUBJECT_BIOLOGY");
  assert.equal(preview.createsSubject, true);
  store.importLessonPack(biologyLessonSet());
  let state = store.snapshot();
  assert.equal(state.activeSubject.id, "SUBJECT_MATH", "installing a pack does not change the retained lesson theme");
  assert.equal(state.subjects.length, 2);
  assert.equal(state.progressRows.length, 53);
  assert.equal(state.allProgressRows.length, 54);
  assert.equal(state.allProgressRows.find((row) => row.id === "CUSTOM_BIO_CELL_001").status, "locked");
  assert.deepEqual(state.allProgressRows.find((row) => row.id === "CUSTOM_BIO_CELL_001").unmetPrerequisites, ["MATH_ARITH_005"]);
  store.setLearningPreferences({ progressionMode: "soft" });
  state = store.snapshot();
  assert.equal(state.progressionMode, "soft");
  assert.equal(state.allProgressRows.find((row) => row.id === "CUSTOM_BIO_CELL_001").status, "ready");
  store.selectMapSkill("CUSTOM_BIO_CELL_001");
  assert.equal(store.snapshot().activeSubject.id, "SUBJECT_MATH", "inspecting a node leaves the retained lesson theme alone");
  store.navigate("lesson");
  assert.equal(store.snapshot().activeSubject.id, "SUBJECT_BIOLOGY", "opening the selected lesson applies its subject theme");
  assert.doesNotThrow(() => store.startTest("CUSTOM_BIO_CELL_001"));
  assert.equal(store.snapshot().activeSubject.id, "SUBJECT_BIOLOGY", "starting the lesson test changes and retains its subject theme");
});

test("explicit cross-subject bridge references verify the target subject", () => {
  const { store } = harness();
  store.createProfile("Bridge Author");
  const invalid = biologyLessonSet();
  invalid.skills[0].prerequisites = [{ subject_id: "SUBJECT_BIOLOGY", skill_id: "MATH_ARITH_005" }];
  assert.throws(() => store.previewLessonPack(invalid), /belongs to SUBJECT_MATH/i);
  assert.equal(store.snapshot().lessonPacks.length, 0);
});

test("Depot collection validation resolves cross-pack bridges and rejects combined cycles", () => {
  const finance = JSON.parse(lessonSetExample);
  const biology = biologyLessonSet();
  biology.skills[0].prerequisites = [{ subject_id: "SUBJECT_MATH", skill_id: "CUSTOM_FINANCE_DISCOUNTS" }];
  const packs = normalizeLessonPackCollection([biology, finance], curriculum);
  assert.equal(packs.length, 2);
  finance.skills[0].prerequisites = ["CUSTOM_BIO_CELL_001"];
  assert.throws(() => normalizeLessonPackCollection([biology, finance], curriculum), /cycle/i);
});

test("proof and rubric authoring modes retain structured review policies", () => {
  const { store } = harness();
  store.createProfile("Proof Author");
  const pack = biologyLessonSet();
  const problem = pack.skills[0].problems[0];
  problem.answer_mode = "final_plus_required_work";
  problem.work = {
    mode: "proof_obligations", prompt: "Explain the biological claim.",
    proof_policy: { obligations: ["State the claim", "Connect evidence"], accepted_strategies: ["direct argument"] },
  };
  problem.review_policy = { work_review: "tutor_required", mastery_requires_review_pass: true, allow_self_review: false };
  const normalized = store.previewLessonPack(pack);
  assert.equal(normalized.problemCount, 5);
  store.importLessonPack(pack);
  store.setLearningPreferences({ progressionMode: "soft" });
  store.startTest("CUSTOM_BIO_CELL_001", { force: true });
  const draft = store.snapshot().activeTest;
  assert.equal(draft.problems[0].work.mode, "proof_obligations");
  assert.deepEqual(draft.problems[0].work.proof_policy.obligations, ["State the claim", "Connect evidence"]);
  for (const item of draft.problems) {
    store.updateResponse(item.template_id, {
      finalAnswer: String(item.expected_answer),
      work: item.work.mode === "proof_obligations" ? "The claim follows because the evidence connects each biological step." : item.work_required ? workFor(item) : "",
    });
  }
  const inspection = store.inspectStudentWork({ questionId: draft.problems[0].template_id });
  assert.equal(inspection.review_guide.mode, "proof_obligations");
  assert.deepEqual(inspection.review_guide.proof_obligations.map((item) => item.description), ["State the claim", "Connect evidence"]);
  assert.equal(store.submitTest().ok, true);
  const attempt = store.saveReflection({ confidenceRating: 4, difficultyFelt: "medium", hintsUsed: "none", guessed: "no" });
  assert.equal(attempt.hasPendingReview, true);
  assert.equal(attempt.results[0].workMode, "proof_obligations");
  assert.deepEqual(attempt.results[0].proofObligations.map((item) => item.description), ["State the claim", "Connect evidence"]);
  assert.equal(store.snapshot().progressRows[0].status, "learning");
  const savedInspection = store.inspectStudentWork({ questionId: draft.problems[0].template_id });
  assert.equal(savedInspection.source, "saved_attempt");
  assert.equal(savedInspection.attempt_id, attempt.attemptId);
  assert.equal(JSON.stringify(savedInspection).includes("expectedAnswer"), false);
  store.recordTutorFeedback({
    questionId: draft.problems[0].template_id, feedback: "The claim is clear, but the evidence link needs one more reason.", nextStep: "Add the missing causal link.",
    confidence: "high", reviewerType: "human_tutor", obligationResults: [
      { id: "obligation_1", status: "satisfied", note: "Claim is explicit." },
      { id: "obligation_2", status: "flawed", note: "Evidence is named but not connected." },
    ],
  });
  assert.equal(store.getAttempt(attempt.attemptId).reviewStatus, "partial");
  assert.equal(store.getAttempt(attempt.attemptId).hasPendingReview, true);
  assert.equal(store.snapshot().progressRows[0].masteryScore, 3);
  store.recordTutorFeedback({
    questionId: draft.problems[0].template_id, feedback: "The revision now addresses both obligations.", nextStep: "Continue to the next cell process.",
    confidence: "high", reviewerType: "human_tutor", obligationResults: [
      { id: "obligation_1", status: "satisfied", note: "Claim is explicit." },
      { id: "obligation_2", status: "satisfied", note: "The evidence is causally connected." },
    ],
  });
  assert.equal(store.getAttempt(attempt.attemptId).reviewStatus, "review_passed");
  assert.equal(store.getAttempt(attempt.attemptId).reviewMasteryDeltaApplied, 12);
  assert.equal(store.snapshot().progressRows[0].status, "proven");
});

test("rubric reviews derive weighted verdicts and replace rather than stack mastery deltas", () => {
  const { store } = harness();
  store.createProfile("Rubric Reviewer");
  const pack = biologyLessonSet();
  const problem = pack.skills[0].problems[0];
  problem.answer_mode = "final_plus_required_work";
  problem.work = { mode: "rubric_check", prompt: "Explain the model.", rubric: { criteria: [
    { id: "model", description: "Chooses a defensible model", weight: 2 },
    { id: "evidence", description: "Connects evidence to the conclusion", weight: 1 },
  ] } };
  problem.review_policy = { work_review: "tutor_required", mastery_requires_review_pass: true, allow_self_review: false };
  store.importLessonPack(pack);
  store.setLearningPreferences({ progressionMode: "soft" });
  store.startTest("CUSTOM_BIO_CELL_001", { force: true });
  const draft = store.snapshot().activeTest;
  for (const item of draft.problems) store.updateResponse(item.template_id, { finalAnswer: String(item.expected_answer), work: item.work.mode === "rubric_check" ? "The model is defensible because the evidence supports its conclusion." : workFor(item) });
  assert.equal(store.submitTest().ok, true);
  const attempt = store.saveReflection({ confidenceRating: 4, difficultyFelt: "medium", hintsUsed: "none", guessed: "no" });
  const questionId = draft.problems[0].template_id;
  const partial = store.recordTutorFeedback({
    questionId, feedback: "The evidence is present, but the model needs revision.", nextStep: "Justify the model choice.", reviewerType: "human_tutor",
    rubricResults: [{ id: "model", awardedPoints: 1, note: "Partly defensible." }, { id: "evidence", awardedPoints: 1, note: "Connection is explicit." }],
  });
  assert.equal(partial.verdict, "partial");
  assert.equal(store.snapshot().progressRows[0].masteryScore, 3);
  const passed = store.recordTutorFeedback({
    questionId, feedback: "Both weighted criteria are now complete.", nextStep: "Continue.", reviewerType: "human_tutor",
    rubricResults: [{ id: "model", awardedPoints: 2, note: "Fully justified." }, { id: "evidence", awardedPoints: 1, note: "Connection is explicit." }],
  });
  assert.equal(passed.verdict, "pass");
  assert.equal(store.getAttempt(attempt.attemptId).reviewMasteryDeltaApplied, 12);
  assert.equal(store.snapshot().progressRows[0].masteryScore, 12);
});

test("custom lesson-set validation rejects collisions, missing references, cycles, and unsupported grading", () => {
  const valid = JSON.parse(lessonSetExample);
  assert.equal(normalizeLessonPack(valid, { knownSkillIds: curriculum.track.skills }).skills.length, 1);

  const duplicateBuiltIn = structuredClone(valid);
  duplicateBuiltIn.skills[0].id = "CUSTOM_FINANCE_DISCOUNTS";
  assert.throws(
    () => normalizeLessonPack(duplicateBuiltIn, { knownSkillIds: [...curriculum.track.skills, "CUSTOM_FINANCE_DISCOUNTS"] }),
    /already installed/i,
  );

  const missing = structuredClone(valid);
  missing.skills[0].prerequisites = ["MISSING_SKILL"];
  assert.throws(() => normalizeLessonPack(missing, { knownSkillIds: curriculum.track.skills }), /missing prerequisite/i);

  const cycle = structuredClone(valid);
  cycle.skills.push({
    ...structuredClone(cycle.skills[0]),
    id: "CUSTOM_FINANCE_ADVANCED",
    name: "Advanced finance",
    prerequisites: ["CUSTOM_FINANCE_DISCOUNTS"],
    problems: cycle.skills[0].problems.map((problem, index) => ({
      ...problem,
      template_id: `CUSTOM_FINANCE_ADV_Q0${index + 1}`,
      skill_id: "CUSTOM_FINANCE_ADVANCED",
    })),
  });
  cycle.skills[0].prerequisites = ["CUSTOM_FINANCE_ADVANCED"];
  cycle.track.skills.push("CUSTOM_FINANCE_ADVANCED");
  cycle.track.exit_skills = ["CUSTOM_FINANCE_ADVANCED"];
  assert.throws(() => normalizeLessonPack(cycle, { knownSkillIds: curriculum.track.skills }), /cycle/i);

  const unsupported = structuredClone(valid);
  unsupported.skills[0].problems[0].grading_method = "run_javascript";
  assert.throws(() => normalizeLessonPack(unsupported, { knownSkillIds: curriculum.track.skills }), /unsupported grading/i);
});

test("Programming Depot pack validates formatted prompts, trace tables, and sandbox contracts", () => {
  const pack = normalizeLessonPack(programmingLessonSet, { knownSkillIds: curriculum.track.skills });
  assert.equal(pack.skills.length, 25);
  assert.equal(pack.skills.reduce((total, skill) => total + skill.problems.length, 0), 266);
  const problems = pack.skills.flatMap((skill) => skill.problems);
  assert.equal(problems.filter((problem) => problem.work.mode === "code_trace_steps").length, 16);
  assert.equal(problems.filter((problem) => problem.grading_method === "python_program").length, 16);
  assert.ok(problems.filter((problem) => problem.prompt_blocks.some((block) => block.type === "code")).length >= 50);

  const trace = problems.find((problem) => problem.template_id === "CUSTOM_PROG_001_Q03");
  const completeRows = structuredClone(trace.work.trace_spec.expected_rows);
  assert.equal(gradeTraceTable(trace, { rows: completeRows }).ok, true);
  const wrongRows = structuredClone(completeRows);
  wrongRows[1].y = 12;
  const wrong = gradeTraceTable(trace, { rows: wrongRows });
  assert.equal(wrong.ok, false);
  assert.deepEqual(wrong.diagnostics[0], {
    kind: "wrong_value", step: "2", column: "y", actual: 12, expected: 10,
    message: "Trace step 2, column y, does not match the program state.",
  });

  const program = problems.find((problem) => problem.template_id === "CUSTOM_PROG_004_CODE_01");
  assert.equal(program.program_spec.runtime, "python_subset_v1");
  assert.equal(program.program_spec.entrypoint.name, "is_even");
  assert.equal(program.program_spec.tests.filter((item) => item.visibility === "hidden").length, 2);
  assert.deepEqual(program.program_spec.policy.imports, []);
  assert.equal(program.program_spec.policy.network, false);
});

test("Python grades bind to exact editor contents and hidden cases stay out of learning context", () => {
  const { store } = harness();
  store.createProfile("Python Learner");
  store.importLessonPack(programmingLessonSet);
  store.setLearningPreferences({ progressionMode: "soft", subjectId: "SUBJECT_PROGRAMMING" });
  const draft = store.startTest("CUSTOM_PROG_002", { force: true });
  for (const problem of draft.problems) {
    let structuredWorkJson = null;
    let work = workFor(problem);
    let finalAnswer = String(problem.expected_answer);
    if (problem.work.mode === "code_trace_steps") structuredWorkJson = { rows: structuredClone(problem.work.trace_spec.expected_rows) };
    if (problem.grading_method === "python_program") {
      finalAnswer = "def rectangle_area(width, height):\n    return width * height";
      work = "";
    }
    store.updateResponse(problem.template_id, { finalAnswer, work, structuredWorkJson });
    if (problem.grading_method === "python_program") {
      store.recordPythonGrade(problem.template_id, finalAnswer, {
        status: "passed", score: 1, passed: problem.program_spec.tests.length, total: problem.program_spec.tests.length,
        tests: problem.program_spec.tests.map((item) => ({ id: item.id, visibility: item.visibility, status: "passed", message: "Passed." })),
        messages: ["All tests passed."], stdout: "",
      });
    }
  }
  const context = store.getLearningContext();
  const programming = context.active_test.questions.find((item) => item.programming)?.programming;
  assert.equal(programming.example_tests.length, 1);
  assert.equal(JSON.stringify(context).includes("zero_width"), false);
  assert.equal(JSON.stringify(context).includes("expected_answer"), false);
  const result = store.submitTest();
  assert.equal(result.ok, true);
  assert.equal(result.results.rawScore, draft.problems.length);

  store.saveReflection({ confidenceRating: 4, difficultyFelt: "hard", hintsUsed: "none", guessed: "no" });
  store.startTest("CUSTOM_PROG_002", { force: true });
  const nextProgram = store.snapshot().activeTest.problems.find((problem) => problem.grading_method === "python_program");
  store.updateResponse(nextProgram.template_id, { finalAnswer: "def rectangle_area(width, height):\n    return 0", work: "" });
  const stale = store.submitTest();
  assert.equal(stale.ok, false);
  assert.match(stale.workIssues.find((item) => item.questionId === nextProgram.template_id).message, /Run the current Python code/i);

  store.recordPythonGrade(nextProgram.template_id, "def rectangle_area(width, height):\n    return 0", {
    status: "unavailable", score: 0, passed: 0, total: nextProgram.program_spec.tests.length,
    tests: nextProgram.program_spec.tests.map((item) => ({ id: item.id, visibility: item.visibility, status: "runtime_error", message: "Runtime unavailable." })),
    messages: ["Runtime unavailable."], stdout: "transient output",
  });
  const unavailable = store.submitTest();
  assert.equal(unavailable.ok, false);
  assert.match(unavailable.workIssues.find((item) => item.questionId === nextProgram.template_id).message, /infrastructure failures are never graded/i);
  assert.equal(store.snapshot().activeTest.responses[nextProgram.template_id].structuredWorkJson.python_grade.stdout, "", "captured output must not persist");
});

test("long proof and capstone work is preserved without the former 5000-character truncation", () => {
  const { store } = harness();
  store.createProfile("Capstone Learner");
  store.setLearningPreferences({ progressionMode: "soft" });
  const skill = curriculum.skills.find((candidate) => candidate.problems.some((problem) => problem.work_required));
  const draft = store.startTest(skill.id, { force: true });
  const problem = draft.problems.find((item) => item.work_required);
  const work = "x".repeat(6_780);
  store.updateResponse(problem.template_id, { finalAnswer: String(problem.expected_answer), work });
  assert.equal(store.snapshot().activeTest.responses[problem.template_id].work.length, 6_780);
  assert.throws(
    () => store.updateResponse(problem.template_id, { finalAnswer: String(problem.expected_answer), work: "x".repeat(50_001) }),
    /50,000 characters/i,
  );
});

test("custom progress and content round-trip together through a full backup", () => {
  const source = harness();
  source.store.createProfile("Portable Pack");
  source.store.importLessonPack(lessonSetExample);
  source.store.startTest("CUSTOM_FINANCE_DISCOUNTS", { force: true });
  answerActiveTestCorrectly(source.store);
  assert.equal(source.store.submitTest().ok, true);
  source.store.saveReflection({ confidenceRating: 4, difficultyFelt: "medium", hintsUsed: "none", guessed: "no" });
  assert.equal(source.store.snapshot().backupStatus.recommended, true);
  const raw = source.store.exportBackup();
  assert.equal(source.store.snapshot().backupStatus.recommended, false);

  const target = harness();
  const preview = target.store.previewBackup(raw);
  assert.equal(preview.lessonPackCount, 1);
  assert.deepEqual(preview.lessonPackNames, ["Personal Finance Practice"]);
  target.store.importBackup(raw);
  target.store.selectProfile(target.store.snapshot().profiles[0].id);
  const restored = target.store.snapshot();
  assert.equal(restored.progressRows.length, 54);
  assert.equal(restored.attempts[0].skillId, "CUSTOM_FINANCE_DISCOUNTS");
  assert.equal(restored.progressRows.find((row) => row.id === "CUSTOM_FINANCE_DISCOUNTS").attemptCount, 1);
});

test("duplicate lesson-set installs fail without mutating saved state", () => {
  const { store } = harness();
  store.createProfile("Safe Packs");
  store.importLessonPack(lessonSetExample);
  const before = store.snapshot().progressRows.length;
  assert.throws(() => store.importLessonPack(lessonSetExample), /already installed/i);
  assert.equal(store.snapshot().progressRows.length, before);
  assert.equal(store.snapshot().lessonPacks.length, 1);
});

test("oversized lesson sets and invalid embedded backup packs are rejected before mutation", () => {
  const { store } = harness();
  store.createProfile("Strict Packs");
  assert.throws(() => store.previewLessonPack(" ".repeat(2_000_001)), /larger than 2 MB/i);

  store.importLessonPack(lessonSetExample);
  const backup = JSON.parse(store.exportBackup());
  backup.lessonPacks[0].skills[0].problems[0].grading_method = "unsafe_eval";
  const target = harness();
  assert.throws(() => target.store.previewBackup(JSON.stringify(backup)), /unsupported grading/i);
  assert.equal(target.store.snapshot().profiles.length, 0);
  assert.equal(target.store.snapshot().lessonPacks.length, 0);
});

test("locked tests cannot be started before their prerequisites", () => {
  const { store } = harness();
  store.createProfile("Careful Learner");
  assert.throws(() => store.startTest("MATH_SYS_001"), /locked/i);
});

test("required working blocks submission until it is present", () => {
  const { store } = harness();
  store.createProfile("Working Learner");
  const requiredSkill = curriculum.skills.find((skill) => skill.problems.some((problem) => problem.work_required));
  assert.ok(requiredSkill, "curriculum should contain a required-work problem");
  store.startTest(requiredSkill.id, { force: true });
  const draft = store.snapshot().activeTest;
  for (const problem of draft.problems) {
    store.updateResponse(problem.template_id, { finalAnswer: String(problem.expected_answer), work: "" });
  }
  const result = store.submitTest();
  assert.equal(result.ok, false);
  assert.ok(result.missingWork.length > 0);
});

test("symbolic grading accepts equivalent forms and rejects correlated-sample tricks", () => {
  const equivalent = harness();
  equivalent.store.createProfile("Symbol Learner");
  equivalent.store.startTest("MATH_PREALG_003", { force: true });
  for (const problem of equivalent.store.snapshot().activeTest.problems) {
    equivalent.store.updateResponse(problem.template_id, {
      finalAnswer: problem.expected_answer === "10x + 73" ? "73 + 10*x" : String(problem.expected_answer),
      work: workFor(problem),
    });
  }
  const equivalentResult = equivalent.store.submitTest().results;
  assert.equal(equivalentResult.rawScore, equivalentResult.scoreTotal);

  assert.equal(gradeProblem({ grading_method: "symbolic_expression", expected_answer: "-2y" }, "-2*y+(x+y)^2-1").correct, false);
});

test("procedural work rejects a broken middle equation even when the final answer is right", () => {
  const { store } = harness();
  store.createProfile("Step Checker");
  store.startTest("MATH_ALG_002", { force: true });
  const draft = store.snapshot().activeTest;
  for (const problem of draft.problems) {
    store.updateResponse(problem.template_id, {
      finalAnswer: String(problem.expected_answer),
      work: workFor(problem),
    });
  }
  const target = draft.problems.find((problem) => problem.work?.minimum_steps >= 3) ?? draft.problems[0];
  store.updateResponse(target.template_id, {
    finalAnswer: String(target.expected_answer),
    work: `3x + 5 = 20\n3x = 999\nx = ${target.expected_answer}`,
  });
  const result = store.submitTest();
  assert.equal(result.ok, false);
  assert.match(result.workIssues.find((issue) => issue.questionId === target.template_id).message, /changes the solution/i);
});

test("the browser grader understands mathematical notation and reversed equation answers", () => {
  assert.equal(gradeProblem({ grading_method: "exact_numeric", expected_answer: String(Math.sqrt(2)), tolerance: 1e-9 }, "√2").correct, true);
  assert.equal(gradeProblem({ grading_method: "exact_numeric", expected_answer: String(Math.PI), tolerance: 1e-9 }, "π").correct, true);
  assert.equal(gradeProblem({ grading_method: "equation_solution", expected_answer: "x = 4", variable: "x" }, "4 = x").correct, true);
  assert.equal(gradeProblem({ grading_method: "symbolic_expression", expected_answer: "(x + 1)^2" }, "x² + 2x + 1").correct, true);
  assert.equal(gradeProblem({ grading_method: "exact_text", expected_answer: "no solution", accepted_forms: ["none"] }, "none").correct, true);
  assert.equal(gradeProblem({ grading_method: "symbolic_expression", expected_answer: "x + x", accepted_forms: ["2y"] }, "2y").correct, true);
});

test("the browser grader handles finite sets, rational domains, and interval unions", () => {
  assert.equal(gradeProblem({ grading_method: "finite_set", expected_answer: "{-2, 5}", answer_metadata: { values: ["-2", "5"] } }, "x = 5 or x = -2").correct, true);
  assert.equal(gradeProblem({ grading_method: "finite_set", expected_answer: "{}", answer_metadata: { values: [] } }, "no solutions").correct, true);
  const rational = { grading_method: "rational_expression", expected_answer: "(x+4)/(x-3)", answer_metadata: { excluded_values: ["-2", "3"] }, grading_metadata: { require_reduced_form: true } };
  assert.equal(gradeProblem(rational, "(x+4)/(x-3)", { excluded_values: "3, -2" }).correct, true);
  assert.equal(gradeProblem(rational, "(x+4)/(x-3)", { excluded_values: "3" }).correct, false);
  assert.equal(gradeProblem({ grading_method: "interval_set", expected_answer: "(-inf, -2] U (5, inf)", variable: "x" }, "x <= -2 or x > 5").correct, true);
  assert.equal(gradeProblem({ grading_method: "interval_set", expected_answer: "(-inf, 3) U (3, inf)", variable: "x" }, "x != 3").correct, true);
  assert.equal(gradeProblem({ grading_method: "interval_set", expected_answer: "[-1, 4]", variable: "x" }, "-1 <= x <= 4").correct, true);
  assert.equal(gradeProblem({ grading_method: "interval_set", expected_answer: "[3, 3]", variable: "x" }, "x = 3").correct, true);
  assert.equal(gradeProblem({ grading_method: "interval_set", expected_answer: "(-inf, inf)", variable: "x" }, "[-inf, inf)").correct, false);
});

test("structured rational-equation and sign-chart work enforce the authored model", () => {
  const rational = {
    grading_method: "finite_set", expected_answer: "{2}", answer_metadata: { values: ["2"] }, variable: "x", work_required: true,
    work: {
      mode: "rational_equation_steps", target_variable: "x", minimum_steps: 2,
      original_equation: "(x - 2)/(x - 5) = 0", expected_restrictions: ["5"],
      require_restrictions: true, require_original_equation_check: true,
    },
  };
  const rationalWork = {
    restrictions: ["5"], steps: ["x - 2 = 0", "x = 2"],
    candidates: [{ value: "2", status: "valid", original_check: "(2-2)/(2-5)=0" }],
  };
  assert.equal(validateProceduralWork(rational, "", rationalWork, "{2}"), null);
  assert.match(validateProceduralWork(rational, "", { ...rationalWork, restrictions: ["4"] }, "{2}"), /restriction set/i);
  assert.match(validateProceduralWork(rational, "", { ...rationalWork, candidates: [{ ...rationalWork.candidates[0], status: "extraneous" }] }, "{2}"), /classified as valid/i);

  const signChart = {
    grading_method: "interval_set", expected_answer: "(-inf, 2] U (5, inf)", variable: "x", work_required: true,
    work: {
      mode: "sign_chart_steps", target_variable: "x",
      sign_chart: {
        expression_kind: "rational", expression: "(x - 2)/(x - 5)", reduced_expression: "(x - 2)/(x - 5)", relation: ">=",
        critical_points: [{ value: "2", kind: "zero", multiplicity: 1 }, { value: "5", kind: "undefined", multiplicity: 1 }],
        require_test_values: true, require_interval_signs: true, require_endpoint_decisions: true, require_final_answer_match: true,
      },
    },
  };
  const chartWork = {
    critical_points: [{ value: "5", kind: "undefined" }, { value: "2", kind: "zero" }],
    intervals: [
      { lower: "", upper: "2", test_value: "0", sign: "positive", selected: true },
      { lower: "2", upper: "5", test_value: "3", sign: "negative", selected: false },
      { lower: "5", upper: "", test_value: "6", sign: "positive", selected: true },
    ],
    endpoints: [{ value: "2", included: true }, { value: "5", included: false }],
  };
  assert.equal(validateProceduralWork(signChart, "", chartWork, "x <= 2 or x > 5"), null);
  const wrongBoundary = structuredClone(chartWork);
  wrongBoundary.intervals[1].upper = "6";
  assert.match(validateProceduralWork(signChart, "", wrongBoundary, "(-inf, 2] U (5, inf)"), /boundaries/i);
  const wrongSign = structuredClone(chartWork);
  wrongSign.intervals[1].sign = "positive";
  assert.match(validateProceduralWork(signChart, "", wrongSign, "(-inf, 2] U (5, inf)"), /sign in interval row 2/i);
});

test("inequality grading checks the complete solution set and sign reversals", () => {
  const problem = { grading_method: "inequality_solution", expected_answer: "x < 5", variable: "x" };
  assert.equal(gradeProblem(problem, "2x < 10").correct, true);
  assert.equal(gradeProblem(problem, "x <= 5").correct, false);
  assert.equal(gradeProblem(problem, "x > 5").correct, false);

  const workProblem = {
    ...problem,
    work_required: true,
    work: { mode: "procedural_steps", minimum_steps: 2, line_type: "inequality", target_variable: "x", require_final_answer_match: true },
  };
  assert.equal(validateProceduralWork(workProblem, "2x < 10\nx < 5"), null);
  assert.match(validateProceduralWork(workProblem, "-2x < -10\nx < 5"), /changes the inequality solution set/i);
});

test("literal-equation work preserves solutions with multiple symbols", () => {
  const problem = {
    grading_method: "equation_solution",
    expected_answer: "F/a",
    variable: "m",
    work_required: true,
    work: { mode: "procedural_steps", minimum_steps: 2, line_type: "equation", target_variable: "m", require_final_answer_match: true },
  };
  assert.equal(validateProceduralWork(problem, "F = ma\nF/a = m"), null);
  assert.match(validateProceduralWork(problem, "F = ma\nF + a = m"), /changes the solution/i);
});

test("learning context exposes prompts and student state but never answer keys", () => {
  const { store } = harness();
  store.createProfile("Private Answers");
  store.startTest("MATH_ARITH_001");
  const context = store.getLearningContext({ includeHistory: true });
  const serialized = JSON.stringify(context);
  assert.equal(context.active_test.question_count, 10);
  assert.equal(serialized.includes("expected_answer"), false);
  assert.equal(serialized.includes("solution_steps"), false);
});

test("backup import/export round-trips profiles and rejects unsafe files", () => {
  const source = harness();
  source.store.createProfile("Backup Learner", { demo: true });
  const raw = source.store.exportBackup();
  assert.match(raw, /Backup Learner/);

  const target = harness();
  const preview = target.store.previewBackup(raw);
  assert.equal(preview.profileCount, 1);
  assert.deepEqual(preview.profileNames, ["Backup Learner"]);
  const imported = target.store.importBackup(raw);
  assert.deepEqual(imported, { ok: true, profileCount: 1, attemptCount: 1 });
  assert.equal(target.store.snapshot().profiles[0].displayName, "Backup Learner");
  assert.equal(target.store.snapshot().activeProfile, null);
  assert.throws(() => target.store.importBackup("not json"), /valid JSON/i);
  assert.throws(
    () => target.store.importBackup(JSON.stringify({ version: APP_VERSION + 1, profiles: [] })),
    /newer QuickMaths version/i,
  );
});

test("bridge sync snapshots round-trip without pretending a manual backup was downloaded", () => {
  const source = harness();
  source.store.createProfile("Bridge Learner", { demo: true });
  const before = source.store.snapshot().backupStatus;
  const raw = source.store.exportSyncState();
  const after = source.store.snapshot().backupStatus;
  assert.equal(before.lastExportAt, null);
  assert.equal(after.lastExportAt, null);
  assert.match(raw, /QuickMaths Bridge/);

  const target = harness();
  const imported = target.store.importSyncState(raw);
  assert.equal(imported.profileCount, 1);
  assert.equal(target.store.snapshot().activeProfile.displayName, "Bridge Learner");
  assert.equal(target.store.snapshot().ui.route, "tutorial");
  assert.deepEqual(target.store.snapshot().activity, []);
});

test("malformed nested backup records are removed instead of bricking the app", () => {
  const source = harness();
  source.store.createProfile("Safe Import");
  const candidate = JSON.parse(source.store.exportBackup());
  candidate.attempts = [{ attemptId: "broken", profileId: candidate.profiles[0].id, skillId: "MATH_ARITH_001", results: "not-an-array" }];
  candidate.drafts = { [candidate.profiles[0].id]: { MATH_ARITH_001: { problems: "not-an-array", responses: null } } };
  candidate.ui.pendingResults = { skillId: "MATH_ARITH_001", results: "not-an-array" };
  const target = harness();
  target.store.importBackup(JSON.stringify(candidate));
  target.store.selectProfile(target.store.snapshot().profiles[0].id);
  const state = target.store.snapshot();
  assert.equal(state.activeTest, null);
  assert.equal(state.pendingResults, null);
  assert.deepEqual(state.attempts[0].results, []);
});

test("the original one-skill challenge state migrates into a demo profile", () => {
  const legacy = {
    masteryScore: 0.57,
    attemptCount: 3,
    finalAnswerStatus: "correct",
    mistakeTags: ["inverse_operations"],
  };
  const { store } = harness({ [LEGACY_STORAGE_KEY]: JSON.stringify(legacy) });
  const state = store.snapshot();
  assert.equal(state.activeProfile.displayName, "Demo Learner");
  assert.equal(state.progressRows.find((row) => row.id === "MATH_ALG_002").masteryScore, 57);
});

test("progress, attempt, and review CSV exports have stable headers", () => {
  const { store } = harness();
  store.createProfile("Export Learner", { demo: true });
  assert.match(store.exportCsv("progress"), /^"profile_id","skill_id","skill_name","domain"/);
  assert.match(store.exportCsv("attempts"), /^"attempt_id","profile_id","skill_id","skill_name"/);
  assert.match(store.exportCsv("reviews"), /^"review_id","attempt_id","question_id","reviewer_type"/);
  assert.match(store.exportCsv("reviews"), /"obligation_results_json","obligation_statuses","obligation_notes","rubric_points","rubric_notes"/);
});

test("rich tutor exports preserve post-attempt answers, work, reflection, and review instructions", () => {
  const { store } = harness();
  store.createProfile("Tutor Export");
  store.startTest("MATH_ARITH_001");
  const draft = answerActiveTestCorrectly(store);
  assert.equal(store.submitTest().ok, true);
  const attempt = store.saveReflection({ confidenceRating: 4, difficultyFelt: "hard", hintsUsed: "little", guessed: "no", notes: "Check sign rules." });
  const summary = store.exportTutorSummary(attempt.attemptId);
  const packet = store.exportTutorReviewPacket(attempt.attemptId);
  assert.match(summary, /QuickMaths Tutor Summary/);
  assert.match(summary, /Expected final answer:/);
  assert.match(summary, new RegExp(`Question ID: ${draft.problems[0].template_id}`));
  assert.match(summary, /Check sign rules\./);
  assert.match(packet, /QuickMaths Tutor Review Packet/);
  assert.match(packet, /Requested Return Format/);
});
