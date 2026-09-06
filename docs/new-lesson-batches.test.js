import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createQuickMathsStore, gradeProblem, normalizeLessonPackCollection, STORAGE_KEY } from "./challenge-core.js";

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const curriculum = read("./curriculum-data.json");
const foundation = read("./lesson-depot/lessons/programming-fundamentals-python/1.2.0/lesson-set.json");
const extension = read("./lesson-depot/lessons/python-extensions/1.0.0/lesson-set.json");
const additions = curriculum.skills.filter(s => /^MATH_(LOG|TRIG)_/.test(s.id));
const storeFor = (initial = null, data = curriculum) => createQuickMathsStore({ curriculum: data, now: () => new Date("2026-09-06T12:00:00Z"), storage: { getItem: key => key === STORAGE_KEY ? initial : null, setItem() {} } });

test("the three Python additions install alongside the original 25 without changing their content or saved work", () => {
  assert.deepEqual(extension.skills.map(s => s.id), ["CUSTOM_PROG_026", "CUSTOM_PROG_027", "CUSTOM_PROG_028"]);
  assert.equal(normalizeLessonPackCollection([foundation, extension], curriculum).length, 2);
  const store = storeFor();
  const profile = store.createProfile("Returning programmer");
  store.importLessonPack(foundation);
  store.setMapPlanMode(true);
  store.updateMapPlanLayout({ layoutKey: "all-subjects", positions: { CUSTOM_PROG_025: { x: 234, y: 567 } } });
  const saved = JSON.parse(store.exportSyncState());
  saved.progress[profile.id].CUSTOM_PROG_025 = { masteryScore: 94, status: "mastered" };
  const updated = storeFor(JSON.stringify(saved));
  const beforeInstall = JSON.parse(updated.exportSyncState());
  const originalLessons = foundation.skills.map(s => structuredClone(updated.skillsById[s.id]));
  updated.importLessonPack(extension);
  assert.deepEqual(foundation.skills.map(s => updated.skillsById[s.id]), originalLessons);
  const after = JSON.parse(updated.exportSyncState());
  assert.deepEqual(after.mapPlans, saved.mapPlans);
  assert.deepEqual(after.progress[profile.id].CUSTOM_PROG_025, beforeInstall.progress[profile.id].CUSTOM_PROG_025);
  assert.equal(updated.snapshot().curriculum.allSkills.filter(s => s.subjectId === "SUBJECT_PROGRAMMING").length, 28);
  for (const lesson of extension.skills) {
    assert.equal(lesson.problems.length, 10);
    for (const p of lesson.problems) assert.equal(gradeProblem(p, p.expected_answer).correct, true, p.template_id);
  }
  const missingBase = storeFor();
  const before = missingBase.exportSyncState();
  assert.throws(() => missingBase.importLessonPack(extension), /CUSTOM_PROG_025/);
  assert.equal(missingBase.exportSyncState(), before);
  const restored = storeFor();
  restored.importBackup(updated.exportBackup());
  assert.deepEqual(restored.skillsById.CUSTOM_PROG_026, updated.skillsById.CUSTOM_PROG_026);
});

test("new native lessons appear in existing workspaces without duplicating the three overlapping Math lessons", () => {
  const previous = structuredClone(curriculum);
  const ids = new Set(additions.map(s => s.id));
  previous.skills = previous.skills.filter(s => !ids.has(s.id));
  previous.track.skills = previous.track.skills.filter(id => !ids.has(id));
  previous.track.exit_skills = previous.track.exit_skills.filter(id => !ids.has(id));
  const old = storeFor(null, previous);
  old.createProfile("Returning mathematician");
  const saved = old.exportSyncState();
  const updated = storeFor(saved);
  assert.equal(additions.length, 9);
  for (const id of ["MATH_INEQ_001", "MATH_INEQ_002", "MATH_RAT_007", ...ids]) {
    assert.equal(updated.snapshot().curriculum.allSkills.filter(s => s.id === id).length, 1, id);
  }
  for (const s of additions) for (const id of s.prerequisites) assert.ok(updated.skillsById[id], `${s.id}: ${id}`);
});

test("all 117 new Math scenarios generate and grade correctly across 100 retakes", () => {
  const store = storeFor();
  const formulas = {
    LOG_EVAL_POSITIVE_INTEGER: v => v.exponent,
    LOG_EVAL_RECIPROCAL_POWER: v => -v.exponent,
    LOG_LAW_EXACT_PRODUCT_EVALUATION: v => v.m + v.n,
    LOG_LAW_EXACT_QUOTIENT_EVALUATION: v => v.m - v.n,
    EXP_EQ_SOLVE_WITH_LOGS: () => Math.log2(20/3),
    EXP_EQ_SHIFTED_EXPONENT_WITH_LOGS: () => Math.log(70)/Math.log(5)-1,
    EXP_MODEL_DOUBLING_TIME_WITH_LOGS: () => Math.log(2)/Math.log(1.08),
    LOG_CHANGE_OF_BASE_APPROXIMATION: () => Math.log2(10),
    TRIG_RIGHT_SINE_345: v => v.opposite/v.hypotenuse,
    TRIG_RIGHT_COSINE_51213: v => v.adjacent/v.hypotenuse,
    TRIG_RIGHT_TANGENT_81517: v => v.opposite/v.adjacent,
    TRIG_RIGHT_PYTHAGOREAN_HYPOTENUSE: v => Math.hypot(v.leg_a, v.leg_b),
    TRIG_RIGHT_PYTHAGOREAN_MISSING_LEG: v => Math.sqrt(v.hypotenuse**2-v.known_leg**2),
    TRIG_RIGHT_FIND_OPPOSITE_SIN30: v => v.hypotenuse/2,
    TRIG_RIGHT_FIND_ADJACENT_COS60: v => v.hypotenuse/2,
    TRIG_RIGHT_INVERSE_TANGENT_345: v => Math.atan(v.opposite/v.adjacent)*180/Math.PI,
    TRIG_RIGHT_INVERSE_SINE_51213: v => Math.asin(v.opposite/v.hypotenuse)*180/Math.PI,
    TRIG_RIGHT_454590_HYPOTENUSE: v => Math.sqrt(2)*v.leg,
    TRIG_RIGHT_306090_LONG_LEG: v => Math.sqrt(3)*v.short_leg,
    TRIG_RAD_DEGREES_TO_RADIANS: v => v.degrees*Math.PI/180,
    TRIG_RAD_RADIANS_TO_DEGREES: v => v.numerator*180/v.denominator,
    TRIG_RAD_ARC_LENGTH: v => v.radius*v.numerator*Math.PI/v.denominator,
    TRIG_UNIT_SINE_FIVE_PI_OVER_6: v => Math.sin(v.numerator*Math.PI/6),
    TRIG_UNIT_COSINE_SEVEN_PI_OVER_4: v => Math.cos(v.numerator*Math.PI/4),
    TRIG_UNIT_TANGENT_THREE_PI_OVER_4: v => Math.tan(v.numerator*Math.PI/4),
    TRIG_GRAPH_AMPLITUDE: v => Math.abs(v.a),
    TRIG_GRAPH_PERIOD: v => 2*Math.PI/Math.abs(v.b),
    TRIG_GRAPH_MAXIMUM: v => v.d+Math.abs(v.a),
    TRIG_GRAPH_MINIMUM: v => v.d-Math.abs(v.a),
    TRIG_ID_ODD_SINE: v => -v.numerator/v.denominator,
    TRIG_TRI_ANGLE_SUM: v => 180-v.angle_a-v.angle_b,
    TRIG_TRI_COSINE_FROM_SSS: v => (v.side_a**2+v.side_b**2-v.side_c**2)/(2*v.side_a*v.side_b),
    TRIG_TRI_AREA_INCLUDED_30: v => v.side_a*v.side_b/4,
    TRIG_TRI_AREA_INCLUDED_90: v => v.side_a*v.side_b/2,
    TRIG_TRI_NAVIGATION_COSINE: v => Math.sqrt(v.distance_a**2+v.distance_b**2-v.distance_a*v.distance_b),
  };
  const seen = new Set();
  const independentlyChecked = new Set();
  for (let variation = 0; variation < 100; variation++) for (const skill of additions) {
    const { problems } = store.previewNativeAssessment(skill.id, variation);
    assert.equal(problems.length, skill.question_count);
    for (const problem of problems) {
      const id = problem.source_template_id;
      seen.add(id);
      assert.match(problem.template_id, /__RUNTIME_/);
      assert.doesNotMatch(problem.prompt, /\{[^}]+\}/);
      assert.equal(gradeProblem(problem, String(problem.expected_answer)).correct, true, id);
      const v = Object.fromEntries(Object.entries(problem.values).map(([key, value]) => [key, Number(value)]));
      const formula = formulas[id.replace(/_001$/, "")];
      if (formula) {
        assert.equal(gradeProblem(problem, String(formula(v))).correct, true, `${id}: independent calculation`);
        independentlyChecked.add(id);
      }
      if (id === "LOG_EQ_EQUAL_LOGS_LINEAR_001") assert.ok(v.a !== v.d && v.a*v.solution+v.c > 0);
      if (id === "TRIG_TRI_ANGLE_SUM_001") assert.ok(v.angle_c > 0);
      if (id === "TRIG_ID_ODD_SINE_001") assert.ok(v.numerator < v.denominator);
      if (id === "TRIG_EQ_SHIFTED_SINE_001") {
        assert.equal(gradeProblem(problem, `{${v.n*Math.PI/4}, ${(v.n+4)*Math.PI/4}}`).correct, true);
        assert.equal(gradeProblem(problem, `{${v.n*Math.PI/4}}`).correct, false, "both roots are required");
      }
    }
  }
  assert.equal(seen.size, 117);
  assert.equal(independentlyChecked.size, Object.keys(formulas).length);
});
