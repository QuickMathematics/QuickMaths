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
  const nativeSkill = {
    id: "MATH_ARITH_001", name: "Integer operations", domain: "Math", subdomain: "Arithmetic",
    description: "Operate with signed integers.", subjectId: activeSubject.id, native: true, custom: false, overridden: false,
    prerequisites: [], unlocks: [], tags: ["integers"],
    mastery: { passing_score: .8, minimum_confidence: 3, max_guessing_allowed: "maybe", review_after_days_if_mastered: 7, review_after_days_if_learning: 2 },
    theory: "Integers include positive numbers, negative numbers, and zero.", examples: [], applications: [],
    problems: [{
      template_id: "INTEGER_NATIVE_Q01", source_template_id: "INTEGER_NATIVE_SCENARIO", skill_id: "MATH_ARITH_001", difficulty: "easy", prompt: "Compute -2 + 5.",
      expected_answer: "3", answer_type: "integer", grading_method: "exact_numeric", solution_steps: ["Add five to negative two."],
      mistake_tags: ["signs"], answer_mode: "final_only", work: { mode: "none" },
      review_policy: { work_review: "none", mastery_requires_review_pass: false, allow_self_review: true },
    }],
  };
  return { activeSubject, subjects: [activeSubject], selectedSkill: nativeSkill, curriculum: { allSkills: [nativeSkill] } };
}

function studioHarness({ questionCount = 1 } = {}) {
  const state = snapshot();
  const source = state.curriculum.allSkills[0];
  while (source.problems.length < questionCount) {
    const index = source.problems.length;
    source.problems.push({ ...structuredClone(source.problems[0]), template_id: `INTEGER_NATIVE_Q${String(index + 1).padStart(2, "0")}`, prompt: `Native question ${index + 1}` });
  }
  const studio = createLessonStudio({
    store: {
      skillsById: Object.fromEntries(state.curriculum.allSkills.map((skill) => [skill.id, skill])),
      previewLessonPack() { return { name: "Pack", mode: "add", skillCount: 1, problemCount: 1, subjectName: "Mathematics" }; },
      previewNativeAssessment(skillId, variation) {
        return { ok: true, skillId, skillName: source.name, variation, templateCount: 1, problems: [{ ...structuredClone(source.problems[0]), template_id: `INTEGER_NATIVE_SCENARIO__RUNTIME_${variation + 1}`, values: { a: String(variation + 2), b: "5" } }] };
      },
    },
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

function changeProblemField(studio, field, value, { type = "text", checked = false } = {}) {
  return studio.handleInput({ value, type, checked, dataset: { creatorField: `problem.${field}`, index: "0" }, matches() { return false; } });
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

test("Lesson Studio authors rational-equation and sign-chart contracts without raw JSON", () => {
  const { studio, state } = studioHarness();
  changeProblemField(studio, "gradingMethod", "finite_set");
  changeProblemField(studio, "answerValues", "-2\n5");
  changeWorkMode(studio, "rational_equation_steps");
  changeProblemField(studio, "originalEquation", "(x - 5)/(x + 2) = 0");
  changeProblemField(studio, "expectedRestrictions", "-2");
  let problem = studio.buildPack().skills[0].problems[0];
  assert.equal(problem.grading_method, "finite_set");
  assert.deepEqual(problem.answer_metadata.values, ["-2", "5"]);
  assert.equal(problem.work.mode, "rational_equation_steps");
  assert.equal(problem.work.require_restrictions, true);
  assert.equal(problem.work.require_original_equation_check, true);
  assert.equal(problem.work.original_equation, "(x - 5)/(x + 2) = 0");
  assert.deepEqual(problem.work.expected_restrictions, ["-2"]);
  assert.equal(problem.review_policy.work_review, "auto");
  assert.match(studio.render(state), /learner sees a form, not JSON/i);

  changeProblemField(studio, "gradingMethod", "interval_set");
  changeProblemField(studio, "expectedAnswer", "(-inf, 2] U (5, inf)");
  changeWorkMode(studio, "sign_chart_steps");
  changeProblemField(studio, "signExpressionKind", "rational");
  changeProblemField(studio, "signExpression", "(x - 2)\/(x - 5)");
  changeProblemField(studio, "signRelation", ">=");
  changeProblemField(studio, "criticalPoints", "2 | zero | 1 | x - 2\n5 | undefined | 1 | x - 5");
  problem = studio.buildPack().skills[0].problems[0];
  assert.equal(problem.grading_method, "interval_set");
  assert.equal(problem.work.mode, "sign_chart_steps");
  assert.equal(problem.work.sign_chart.expression_kind, "rational");
  assert.deepEqual(problem.work.sign_chart.critical_points.map(({ value, kind }) => ({ value, kind })), [{ value: "2", kind: "zero" }, { value: "5", kind: "undefined" }]);
  assert.match(studio.render(state), /value \| kind \| multiplicity \| factor/);
});

test("Lesson Studio opens native lessons as reversible overrides without changing identity", () => {
  const { studio, state } = studioHarness();
  const opened = studio.loadNativeLesson("MATH_ARITH_001", { announce: false });
  const pack = studio.buildPack();
  const html = studio.render(state);

  assert.equal(opened.mode, "override");
  assert.equal(opened.completedProgressPreserved, true);
  assert.equal(pack.mode, "override");
  assert.deepEqual(pack.track.skills, ["MATH_ARITH_001"]);
  assert.equal(pack.skills[0].id, "MATH_ARITH_001");
  assert.equal(pack.skills[0].problems[0].template_id, "INTEGER_NATIVE_Q01");
  assert.equal(pack.skills[0].problems[0].source_template_id, "INTEGER_NATIVE_SCENARIO");
  assert.match(html, /Edit a native lesson/);
  assert.match(html, /Native improvement/);
  assert.match(html, /completed progress remain preserved/);
  assert.match(html, /Original native runtime generator/);
  assert.match(html, /Variation 1/);
  assert.match(html, /Install improvement/);
  assert.match(html, /readonly/);
  studio.handleAction({ dataset: { creatorAction: "reroll-native-preview" } });
  assert.match(studio.render(state), /Variation 2/);
});

test("large native question banks render one editable question at a time", () => {
  const { studio, state } = studioHarness({ questionCount: 30 });
  studio.loadNativeLesson("MATH_ARITH_001", { announce: false });
  const html = studio.render(state);
  assert.equal((html.match(/data-creator-action="select-problem"/g) ?? []).length, 30);
  assert.equal((html.match(/class="studio-problem-body"/g) ?? []).length, 1);
  assert.match(html, /Editing question 1 of 30/);
  assert.equal(studio.buildPack().skills[0].problems.length, 30);
  studio.handleAction({ dataset: { creatorAction: "select-problem", index: "12" } });
  const selectedHtml = studio.render(state);
  assert.match(selectedHtml, /Editing question 13 of 30/);
  assert.match(selectedHtml, /Native question 13/);
});
