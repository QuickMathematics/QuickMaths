import test from "node:test";
import assert from "node:assert/strict";

import { createLearningStore, loadState, PROBLEM_BANK, STORAGE_KEY } from "./challenge-core.js";

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    value(key) { return values.get(key); },
  };
}

const fixedNow = () => new Date("2026-09-01T09:41:00.000Z");

test("fresh state uses the real two-step equation skill", () => {
  const store = createLearningStore({ storage: memoryStorage(), now: fixedNow });
  const state = store.snapshot();
  assert.equal(state.skill.id, "MATH_ALG_002");
  assert.equal(state.currentProblem.prompt, "3x + 5 = 20");
  assert.equal(state.masteryScore, 0.45);
});

test("malformed local storage falls back safely", () => {
  const storage = memoryStorage({ [STORAGE_KEY]: "{ definitely not json" });
  assert.equal(loadState(storage).currentProblemId, PROBLEM_BANK[0].id);
});

test("student work persists but answer keys do not appear in learning context", () => {
  const storage = memoryStorage();
  const store = createLearningStore({ storage, now: fixedNow });
  store.setStudentResponse({ work: "3x = 25\nx = 8.33", finalAnswer: "8.33" });
  const context = store.getLearningContext({ includeHistory: true });
  assert.equal(context.current_problem.question_id, "ALG002-P1");
  assert.equal("expected_answer" in context.current_problem, false);
  assert.equal("solution_steps" in context.current_problem, false);
  assert.match(storage.value(STORAGE_KEY), /8\.33/);
});

test("inspection identifies the seeded inverse-operation mistake", () => {
  const store = createLearningStore({ storage: memoryStorage(), now: fixedNow });
  store.setStudentResponse({ work: "3x = 25\nx = 8.33", finalAnswer: "8.33" });
  const result = store.inspectStudentWork("ALG002-P1");
  assert.equal(result.final_answer_status, "incorrect");
  assert.equal(result.mistake_tag, "inverse_operations");
  assert.ok(!JSON.stringify(result).includes('"5"'));
});

test("correct work improves mastery and records a recovery", () => {
  const store = createLearningStore({ storage: memoryStorage(), now: fixedNow });
  store.setStudentResponse({ work: "3x = 15\nx = 5", finalAnswer: "x = 5" });
  assert.deepEqual(store.checkAnswer(), { correct: true, status: "correct" });
  store.runLocalTutor();
  const state = store.snapshot();
  assert.equal(state.masteryScore, 0.57);
  assert.equal(state.tutorFeedback.mistakeTag, "none");
  assert.match(state.tutorFeedback.feedback, /subtracted 5/i);
});

test("reviewing unchanged work preserves its checked status", () => {
  const store = createLearningStore({ storage: memoryStorage(), now: fixedNow });
  store.setStudentResponse({ work: "3x = 15\nx = 5", finalAnswer: "5" });
  store.checkAnswer();
  store.setStudentResponse({ work: "3x = 15\nx = 5", finalAnswer: "5" });
  store.runLocalTutor();
  assert.equal(store.snapshot().finalAnswerStatus, "correct");
});

test("follow-up creation only selects from the fixed problem bank", () => {
  const store = createLearningStore({ storage: memoryStorage(), now: fixedNow });
  const result = store.createFollowupProblem({
    skillId: "MATH_ALG_002",
    difficulty: "same",
    focus: "equation_balance",
  });
  assert.equal(result.problem.question_id, "ALG002-P2");
  assert.ok(PROBLEM_BANK.some((problem) => problem.id === result.problem.question_id));
  assert.throws(
    () => store.createFollowupProblem({ skillId: "OTHER", difficulty: "same", focus: "" }),
    /skill_id/,
  );
});

test("tutor feedback is length-bounded and visible in state", () => {
  const store = createLearningStore({ storage: memoryStorage(), now: fixedNow });
  assert.throws(
    () => store.recordTutorFeedback({ questionId: "ALG002-P1", feedback: "", nextStep: "Try again" }),
    /feedback is required/,
  );
  store.recordTutorFeedback({
    questionId: "ALG002-P1",
    feedback: "Undo the constant with its inverse.",
    mistakeTag: "inverse_operations",
    nextStep: "Apply the same operation to both sides.",
    confidence: "high",
  });
  assert.equal(store.snapshot().workStatus, "reviewed");
  assert.equal(store.snapshot().activity.at(-1).tool, "record_tutor_feedback");
});
