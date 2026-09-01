import test from "node:test";
import assert from "node:assert/strict";

import { createLessonStudio } from "./lesson-creator.js";

function snapshot() {
  const activeSubject = {
    id: "SUBJECT_MATH", name: "Mathematics", shortName: "Maths", icon: "∑",
    description: "Mathematics curriculum.", skillIds: [],
    theme: {
      paper: "#eef6f1", paperDeep: "#dcebe2", paperLight: "#ffffff", ink: "#18231d",
      muted: "#607067", line: "#c7d8ce", primary: "#225c48", primaryAlt: "#33765e",
      tint: "#bfe2ce", highlight: "#e4ef9b", accent: "#e06b54",
    },
  };
  return { activeSubject, subjects: [activeSubject], curriculum: { allSkills: [] } };
}

function studioHarness() {
  const state = snapshot();
  const studio = createLessonStudio({
    store: { previewLessonPack() { return { name: "Pack", skillCount: 1, problemCount: 1, subjectName: "Mathematics" }; } },
    download() {}, showToast() {}, getSnapshot: () => state, openFilePicker() {},
  });
  return { studio, state };
}

function changeWorkMode(studio, value) {
  return studio.handleInput({
    value, type: "select", checked: false,
    dataset: { creatorField: "problem.workMode", index: "0" },
    matches() { return false; },
  });
}

test("Lesson Studio explains proof syntax and builds a required reviewed proof", () => {
  const { studio, state } = studioHarness();
  assert.equal(changeWorkMode(studio, "proof_obligations"), true);
  const html = studio.render(state);
  const problem = studio.buildPack().skills[0].problems[0];

  assert.match(html, /Author a proof skeleton, not a secret answer/);
  assert.match(html, /Formal proof required — reviewed before mastery/);
  assert.match(html, /Question response type/);
  assert.match(html, /Advanced Algebra/);
  assert.match(html, /One question, two judgments, four stages/);
  assert.match(html, /WebMCP tutor judges validity/);
  assert.match(html, /Learner view preview/);
  assert.match(html, /ordinary text/);
  assert.match(html, /Mastery waits for a passed review/);
  assert.equal(problem.answer_mode, "final_plus_required_work");
  assert.equal(problem.work.mode, "proof_obligations");
  assert.equal(problem.review_policy.work_review, "tutor_required");
  assert.equal(problem.review_policy.mastery_requires_review_pass, true);
  assert.equal(problem.review_policy.allow_self_review, false);
  assert.ok(problem.work.proof_policy.obligations.length >= 3);
});

test("Lesson Studio help controls expose tappable tooltip content", () => {
  const { studio, state } = studioHarness();
  const html = studio.render(state);
  assert.match(html, /data-studio-help/);
  assert.match(html, /data-tooltip="Advanced Algebra-style steps are checked automatically/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /Tap or hover any/);
});

test("advanced authoring examples populate readable proof and rubric guidance", () => {
  const { studio, state } = studioHarness();
  changeWorkMode(studio, "proof_obligations");
  studio.handleAction({ dataset: { creatorAction: "apply-proof-example", index: "0" } });
  let problem = studio.buildPack().skills[0].problems[0];
  assert.match(problem.work.prompt, /plain language/i);
  assert.equal(problem.grading_method, "theorem_conclusion");
  assert.equal(problem.expected_answer, "sqrt(2) is irrational");
  assert.equal(problem.work.proof_policy.obligations.length, 6);
  assert.deepEqual(problem.work.proof_policy.accepted_strategies, ["Contradiction using parity"]);
  assert.equal(problem.review_policy.mastery_requires_review_pass, true);

  changeWorkMode(studio, "rubric_check");
  studio.handleAction({ dataset: { creatorAction: "apply-rubric-example", index: "0" } });
  const html = studio.render(state);
  problem = studio.buildPack().skills[0].problems[0];
  assert.match(html, /Describe observable qualities/);
  assert.match(html, /response will be reviewed for/i);
  assert.equal(problem.work.rubric.criteria.length, 5);
  assert.equal(problem.review_policy.mastery_requires_review_pass, true);
});
