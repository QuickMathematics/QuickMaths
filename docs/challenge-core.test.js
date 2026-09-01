import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  APP_VERSION,
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  createQuickMathsStore,
  loadState,
} from "./challenge-core.js";

const curriculum = JSON.parse(readFileSync(new URL("./curriculum-data.json", import.meta.url), "utf8"));

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

function answerActiveTestCorrectly(store) {
  const draft = store.snapshot().activeTest;
  assert.equal(draft.problems.length, 5);
  for (const problem of draft.problems) {
    store.updateResponse(problem.template_id, {
      finalAnswer: String(problem.expected_answer),
      work: problem.work_required ? "A valid first step\nA valid final step" : "",
    });
  }
  return draft;
}

function workFor(problem, final = String(problem.expected_answer)) {
  return Array.from({ length: Math.max(1, Number(problem.work?.minimum_steps ?? 1)) }, () => final).join("\n");
}

test("ships the complete 25-skill curriculum and opens at the profile picker", () => {
  const { store } = harness();
  const state = store.snapshot();
  assert.equal(curriculum.skills.length, 25);
  assert.equal(curriculum.skills.reduce((count, skill) => count + skill.problems.length, 0), 375);
  assert.equal(state.profiles.length, 0);
  assert.equal(state.activeProfile, null);
  assert.equal(state.ui.route, "welcome");
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
  assert.equal(state.ui.route, "home");
  assert.equal(state.progressRows.find((row) => row.id === "MATH_ARITH_001").status, "ready");
  assert.equal(state.progressRows.find((row) => row.id === "MATH_SYS_001").status, "locked");
  assert.match(storage.value(STORAGE_KEY), /Ada Learner/);
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
