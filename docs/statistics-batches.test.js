import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createQuickMathsStore, gradeProblem, STORAGE_KEY } from "./challenge-core.js";
import { lessonIllustrations } from "./lesson-illustrations.js";
import { loadLessonAsset } from "./lesson-media.js";

const curriculum = JSON.parse(readFileSync(new URL("./curriculum-data.json", import.meta.url), "utf8"));
const additions = curriculum.skills.filter(skill => /^MATH_(STAT|PROB)_/.test(skill.id));
const storeFor = (data = curriculum, saved = null) => createQuickMathsStore({
  curriculum: data,
  now: () => new Date("2026-09-08T08:00:00Z"),
  storage: { getItem: key => key === STORAGE_KEY ? saved : null, setItem() {} },
});

test("all 18 graphical statistics scenarios carry their restored offline diagrams", async () => {
  const graphTemplates = additions.flatMap(skill => skill.native_templates).filter(template => template.media?.length);
  assert.equal(graphTemplates.length, 18);
  const paths = new Set(graphTemplates.flatMap(template => template.media.map(item => item.src)));
  assert.equal(paths.size, 9);
  for (const path of paths) {
    const asset = curriculum.assets.find(asset => asset.path === path);
    assert.ok(asset, path);
    const bytes = await loadLessonAsset(asset, "", { fetchImpl() { throw new Error("Assessment diagrams must load offline"); } });
    const source = readFileSync(new URL(`../content/math/algebra_foundations/skills/${path}`, import.meta.url));
    assert.deepEqual(Buffer.from(bytes), source, path);
  }
  for (const template of graphTemplates) {
    assert.equal(template.type, "fixed", template.id);
    for (const item of template.media) {
      assert.ok(item.alt && item.width > 0 && item.height > 0, template.id);
      assert.doesNotMatch(`${item.caption ?? ""} ${item.alt}`, /both medians are 4|right skew means|random residual scatter supports|leaving the median unchanged/i, `${template.id}: media must not state the conclusion`);
    }
  }
});

test("new inference tests retain their givens, responses, and results through saves and backups", () => {
  const store = storeFor();
  store.createProfile("Returning inference learner");
  store.setLearningPreferences({ progressionMode: "soft" });
  const draft = store.startTest("MATH_STAT_014");
  for (const problem of draft.problems) store.updateResponse(problem.template_id, {
    finalAnswer: String(problem.expected_answer),
    work: problem.work_required ? "I calculated the requested quantity from the supplied sums of squares and degrees of freedom." : "",
  });
  const before = store.snapshot().activeTest;
  const restored = storeFor(curriculum, store.exportSyncState());
  assert.deepEqual(restored.snapshot().activeTest.problems, before.problems);
  assert.deepEqual(restored.snapshot().activeTest.responses, before.responses);
  assert.equal(restored.submitTest().ok, true);
  const result = restored.saveReflection({ confidenceRating: 4, guessed: "no" });
  const recipient = storeFor();
  recipient.importBackup(restored.exportBackup());
  recipient.selectProfile(result.profileId);
  assert.deepEqual(recipient.getAttempt(result.attemptId), restored.getAttempt(result.attemptId));
});

test("all 21 statistics and probability lessons join the existing curriculum without moving saved nodes", () => {
  assert.equal(additions.length, 21);
  assert.equal(curriculum.skills.length, 84);
  const previous = structuredClone(curriculum);
  const ids = new Set(additions.map(skill => skill.id));
  previous.skills = previous.skills.filter(skill => !ids.has(skill.id));
  for (const key of ["skills", "entry_skills", "exit_skills"]) previous.track[key] = previous.track[key].filter(id => !ids.has(id));
  const old = storeFor(previous);
  const profile = old.createProfile("Statistics learner");
  old.setMapPlanMode(true);
  old.updateMapPlanLayout({ layoutKey: "all-subjects", positions: { MATH_ARITH_003: { x: 234, y: 567 } } });
  const saved = JSON.parse(old.exportSyncState());
  saved.progress[profile.id].MATH_ARITH_003 = { masteryScore: 94, status: "mastered" };
  const updated = storeFor(curriculum, JSON.stringify(saved));
  const after = JSON.parse(updated.exportSyncState());
  assert.deepEqual(after.mapPlans, saved.mapPlans);
  assert.equal(after.progress[profile.id].MATH_ARITH_003.masteryScore, 94);
  for (const skill of additions) {
    assert.equal(updated.snapshot().curriculum.allSkills.filter(row => row.id === skill.id).length, 1, skill.id);
    assert.equal(updated.skillsById[skill.id].subjectId, "SUBJECT_MATH");
    assert.equal(skill.subdomain, skill.id.startsWith("MATH_STAT") ? "Statistics" : "Probability");
    for (const id of skill.prerequisites) assert.ok(updated.skillsById[id], `${skill.id}: missing ${id}`);
    assert.ok(skill.examples.length >= 2 && skill.applications.length > 0, `${skill.id}: teaching content`);
    assert.ok(lessonIllustrations(skill), `${skill.id}: teaching illustration`);
  }
});

test("all 280 imported scenarios produce complete, gradable browser assessments across 100 retakes", () => {
  const store = storeFor();
  const seen = new Set();
  const generated = new Set();
  const signatures = new Map();
  // Independent calculations exercise representative probability, inference,
  // and model scenarios in addition to the distribution acceptance vectors.
  const formulas = {
    PROB_FOUND_EQUAL_OUTCOMES: v => v.favorable / v.total,
    PROB_COMPOUND_WITHOUT_REPLACEMENT_GENERATED: v => v.s * (v.s - 1) / ((v.s + v.f) * (v.s + v.f - 1)),
    PROB_RV_TWO_OUTCOME_EXPECTATION: v => (v.p * v.hi + (v.d - v.p) * v.lo) / v.d,
    COUNT_COMBINATION_TRIPLES: v => v.n * (v.n - 1) * (v.n - 2) / 6,
    BINOMIAL_EXACTLY_TWO: v => v.n * (v.n - 1) / 2 * (v.p / 10) ** 2 * (1 - v.p / 10) ** (v.n - 2),
    STAT_CENTER_MEAN_BALANCED_001: v => (v.v1 + v.v2 + v.center + v.v4 + v.v5) / 5,
    STAT_CENTER_MISSING_FROM_MEAN_001: v => 5 * v.mean - v.a - v.b - v.c - v.d,
    STAT_CENTER_WEIGHTED_MEAN_001: v => (v.score1 * v.weight1 + v.score2 * v.weight2) / (v.weight1 + v.weight2),
    STAT_REGRESSION_RESIDUAL_001: v => v.observed - v.predicted,
    NORMAL_Z_SCORE: v => (v.x - v.mu) / v.sigma,
    SAMPLING_MEAN_STANDARD_ERROR: v => v.sigma / Math.sqrt(v.n),
    CI_CENTER_FROM_ENDPOINTS: v => (v.low + v.high) / 2,
    T_DIST_STAT: v => (v.xbar - v.mu0) / (v.s / Math.sqrt(v.n)),
    CHI_TABLE_DF: v => (v.r - 1) * (v.c - 1),
    ANOVA_DF_WITHIN: v => v.N - v.k,
    MLR_PREDICTION: v => v.b0 + v.b1 * v.x1 + v.b2 * v.x2,
  };
  const checked = new Set();
  for (let variation = 0; variation < 100; variation++) for (const skill of additions) {
    const { problems } = store.previewNativeAssessment(skill.id, variation);
    assert.equal(problems.length, skill.question_count);
    assert.equal(new Set(problems.map(problem => problem.source_template_id)).size, skill.native_templates.length);
    for (const problem of problems) {
      const id = problem.source_template_id;
      seen.add(id);
      assert.match(problem.template_id, /__RUNTIME_/, `${id}: runtime generation must not silently fall back`);
      assert.doesNotMatch(problem.prompt, /\{[^}]+\}|\b(?:NaN|Infinity)\b/, id);
      assert.equal(gradeProblem(problem, String(problem.expected_answer)).correct, true, id);
      const wrong = problem.grading_method === "multiple_choice"
        ? problem.options.find(option => option.id !== problem.expected_answer)?.id
        : "not a numerical answer";
      assert.equal(gradeProblem(problem, wrong).correct, false, `${id}: rejects wrong answers`);
      if (skill.native_templates.find(template => template.id === id).type === "generated") {
        generated.add(id);
        if (!signatures.has(id)) signatures.set(id, new Set());
        signatures.get(id).add(problem.prompt);
      }
      const formula = formulas[id];
      if (formula) {
        const values = Object.fromEntries(Object.entries(problem.values).map(([key, value]) => [key, Number(value)]));
        assert.equal(gradeProblem(problem, String(formula(values))).correct, true, `${id}: independent calculation`);
        checked.add(id);
      }
    }
  }
  assert.equal(seen.size, 280);
  assert.equal(generated.size, 126);
  assert.equal(checked.size, Object.keys(formulas).length);
  for (const [id, prompts] of signatures) assert.ok(prompts.size > 1, `${id}: randomized givens vary`);
});
