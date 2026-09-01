import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  APP_VERSION,
  LEGACY_STORAGE_KEY,
  LESSON_SET_FORMAT,
  STORAGE_KEY,
  createQuickMathsStore,
  loadState,
  normalizeLessonPack,
  normalizeLessonPackCollection,
} from "./challenge-core.js";

const curriculum = JSON.parse(readFileSync(new URL("./curriculum-data.json", import.meta.url), "utf8"));
const lessonSetExample = readFileSync(new URL("./lesson-set-example.json", import.meta.url), "utf8");

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

function answerActiveTestCorrectly(store) {
  const draft = store.snapshot().activeTest;
  assert.equal(draft.problems.length, 5);
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

test("ships the complete first-party Mathematics and Geography curriculum and opens at the profile picker", () => {
  const { store } = harness();
  const state = store.snapshot();
  assert.equal(curriculum.skills.length, 43);
  assert.equal(curriculum.skills.reduce((count, skill) => count + skill.problems.length, 0), 555);
  assert.equal(curriculum.skills.filter((skill) => skill.subjectId === "SUBJECT_GEOGRAPHY").length, 15);
  assert.equal(curriculum.skills.filter((skill) => skill.id.startsWith("MATH_GEOM_")).length, 3);
  assert.deepEqual(state.subjects.map((subject) => [subject.id, subject.skillIds.length]), [
    ["SUBJECT_MATH", 28],
    ["SUBJECT_GEOGRAPHY", 15],
  ]);
  assert.equal(state.profiles.length, 0);
  assert.equal(state.activeProfile, null);
  assert.equal(state.ui.route, "welcome");
});

test("first-party Geography is substantial and bridges through Mathematics coordinate geometry", () => {
  const geography = curriculum.skills.filter((skill) => skill.subjectId === "SUBJECT_GEOGRAPHY");
  assert.equal(geography.length, 15);
  assert.ok(geography.every((skill) => skill.theory.length > 2_200));
  assert.ok(geography.every((skill) => skill.examples.length >= 4));
  assert.ok(geography.every((skill) => skill.applications.length >= 3));
  assert.ok(geography.every((skill) => skill.problems.length === 10));
  assert.ok(geography.every((skill) => skill.problems.some((problem) => problem.work?.mode === "rubric_check")));

  const bridge = curriculum.skills.find((skill) => skill.id === "GEO_CART_002");
  assert.ok(bridge.prerequisites.includes("MATH_GEOM_003"));
  assert.deepEqual(bridge.prerequisiteRefs, [{ subjectId: "SUBJECT_MATH", skillId: "MATH_GEOM_003" }]);

  const { store } = harness();
  store.createProfile("Geography Learner");
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

test("Settings, map zoom, and combined-subject map scope persist safely", () => {
  const { store, storage } = harness();
  const firstProfile = store.createProfile("Settings Learner");
  store.completeTutorial();
  store.navigate("data");
  assert.equal(store.snapshot().ui.route, "settings");
  assert.equal(store.snapshot().mapScope, "subject");
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
  assert.equal(reloaded.snapshot().mapScope, "subject", "new profiles start with a focused map");
  reloaded.selectProfile(firstProfile.id);
  assert.equal(reloaded.snapshot().mapScope, "all", "map scope belongs to the learner profile");
  assert.throws(() => reloaded.setLearningPreferences({ mapScope: "galaxy" }), /map_scope/);
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
  assert.equal(submitted.results.rawScore, 5);

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

test("retakes draw a fresh five-question set from the seeded variant bank", () => {
  const { store } = harness();
  store.createProfile("Retake Learner");
  store.startTest("MATH_ARITH_001");
  const firstIds = store.snapshot().activeTest.problems.map((problem) => problem.template_id);
  answerActiveTestCorrectly(store);
  store.submitTest();
  store.saveReflection({ confidenceRating: 4, difficultyFelt: "medium", hintsUsed: "none", guessed: "no" });
  store.startTest("MATH_ARITH_001");
  const secondIds = store.snapshot().activeTest.problems.map((problem) => problem.template_id);
  assert.equal(new Set([...firstIds, ...secondIds]).size, 10);
});

test("a valid custom lesson set joins the real curriculum without replacing built-in skills", () => {
  const { store } = harness();
  store.createProfile("Pack Learner");
  const preview = store.previewLessonPack(lessonSetExample);
  assert.equal(preview.id, "PACK_PERSONAL_FINANCE");
  assert.equal(preview.skillCount, 1);
  assert.equal(store.snapshot().progressRows.length, 28, "preview must not mutate state");

  const installed = store.importLessonPack(lessonSetExample);
  const state = store.snapshot();
  assert.equal(installed.totalSkillCount, 44);
  assert.equal(state.lessonPacks.length, 1);
  assert.equal(state.progressRows.length, 29);
  assert.equal(state.curriculum.skills.find((skill) => skill.id === "CUSTOM_FINANCE_DISCOUNTS").custom, true);
  assert.equal(store.statusForSkill("CUSTOM_FINANCE_DISCOUNTS"), "locked");
  assert.match(store.exportLessonPack("PACK_PERSONAL_FINANCE"), new RegExp(LESSON_SET_FORMAT));
});

test("subjects filter the visible map, apply bridge locks, and support per-profile Open path", () => {
  const { store } = harness();
  store.createProfile("Biology Learner");
  const preview = store.previewLessonPack(biologyLessonSet());
  assert.equal(preview.subjectId, "SUBJECT_BIOLOGY");
  assert.equal(preview.createsSubject, true);
  store.importLessonPack(biologyLessonSet());
  let state = store.snapshot();
  assert.equal(state.activeSubject.id, "SUBJECT_BIOLOGY");
  assert.equal(state.subjects.length, 3);
  assert.equal(state.progressRows.length, 1);
  assert.equal(state.allProgressRows.length, 44);
  assert.equal(state.progressRows[0].status, "locked");
  assert.deepEqual(state.progressRows[0].unmetPrerequisites, ["MATH_ARITH_005"]);
  store.setLearningPreferences({ progressionMode: "soft" });
  state = store.snapshot();
  assert.equal(state.progressionMode, "soft");
  assert.equal(state.progressRows[0].status, "ready");
  assert.doesNotThrow(() => store.startTest("CUSTOM_BIO_CELL_001"));
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
  assert.deepEqual(inspection.review_guide.proof_obligations, ["State the claim", "Connect evidence"]);
  assert.equal(store.submitTest().ok, true);
  const attempt = store.saveReflection({ confidenceRating: 4, difficultyFelt: "medium", hintsUsed: "none", guessed: "no" });
  assert.equal(attempt.hasPendingReview, true);
  assert.equal(attempt.results[0].workMode, "proof_obligations");
  assert.deepEqual(attempt.results[0].proofObligations, ["State the claim", "Connect evidence"]);
  assert.equal(store.snapshot().progressRows[0].status, "learning");
  store.recordTutorFeedback({
    questionId: draft.problems[0].template_id, feedback: "The proof addresses both obligations.", nextStep: "Continue to the next cell process.",
    confidence: "high", verdict: "pass", reviewerType: "human_tutor",
  });
  assert.equal(store.getAttempt(attempt.attemptId).reviewStatus, "review_passed");
  assert.equal(store.snapshot().progressRows[0].status, "proven");
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
  assert.equal(restored.progressRows.length, 29);
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
  assert.equal(equivalent.store.submitTest().results.rawScore, 5);

  const adversarial = harness();
  adversarial.store.createProfile("Independent Samples");
  adversarial.store.startTest("MATH_PREALG_002", { force: true });
  for (const problem of adversarial.store.snapshot().activeTest.problems) {
    adversarial.store.updateResponse(problem.template_id, {
      finalAnswer: problem.expected_answer === "-2y" ? "-2*y+(x+y)^2-1" : String(problem.expected_answer),
      work: workFor(problem),
    });
  }
  assert.equal(adversarial.store.submitTest().results.rawScore, 4);
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

test("learning context exposes prompts and student state but never answer keys", () => {
  const { store } = harness();
  store.createProfile("Private Answers");
  store.startTest("MATH_ARITH_001");
  const context = store.getLearningContext({ includeHistory: true });
  const serialized = JSON.stringify(context);
  assert.equal(context.active_test.question_count, 5);
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
  assert.match(store.exportCsv("progress"), /^"skill_id","skill","status"/);
  assert.match(store.exportCsv("attempts"), /^"attempt_id","skill_id","skill"/);
  assert.match(store.exportCsv("reviews"), /^"review_id","attempt_id","question_id"/);
});
