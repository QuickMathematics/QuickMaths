import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createQuickMathsStore, gradeProblem, STORAGE_KEY } from "./challenge-core.js";
import { createLessonStudio } from "./lesson-creator.js";
import { loadLessonAsset } from "./lesson-media.js";

const curriculum = JSON.parse(readFileSync(new URL("./curriculum-data.json", import.meta.url)));
const geometry = curriculum.skills.filter(skill => skill.subdomain === "Geometry");
const triangle = curriculum.skills.find(skill => skill.id === "MATH_GEOM_004");
const mediaIn = skill => [skill, ...skill.examples, ...skill.applications, ...skill.problems].flatMap(row => row.media ?? []);
const storeFor = (data = curriculum, initial = null) => createQuickMathsStore({
  curriculum: data,
  storage: { getItem: key => key === STORAGE_KEY ? initial : null, setItem() {} },
});

test("all native Geometry illustrations load offline from verified, reproducible source files", async () => {
  assert.equal(geometry.length, 16);
  const usedPaths = new Set();
  for (const skill of geometry) {
    assert.ok(mediaIn(skill).length, `${skill.id} needs a teaching illustration`);
    for (const item of mediaIn(skill)) {
      assert.ok(item.alt && item.width && item.height, `${skill.id}: accessible, responsive media`);
      usedPaths.add(item.src);
    }
  }
  assert.deepEqual([...usedPaths].sort(), curriculum.assets.map(asset => asset.path).sort());
  assert.ok(curriculum.assets.reduce((sum, asset) => sum + asset.bytes, 0) < 1_000_000);
  for (const asset of curriculum.assets) {
    const bytes = await loadLessonAsset(asset, "", { fetchImpl() { throw new Error("Native media must work offline"); } });
    const folder = asset.path.startsWith("media/native-geometry/") ? "geography/foundations" : "math/algebra_foundations/skills";
    const source = readFileSync(new URL(`../content/${folder}/${asset.path}`, import.meta.url));
    assert.deepEqual(Buffer.from(bytes), source, asset.path);
  }
});

test("triangle assessment covers every scenario with correct units, fractions and scale across retakes", () => {
  const store = storeFor();
  const formulas = {
    TRIANGLE_WHOLE_LENGTHS: v => v.b * v.h / 2,
    TRIANGLE_ODD_PRODUCT: v => v.b * v.h / 2,
    TRIANGLE_DECIMAL_LENGTH: v => v.b * v.h / 2,
    TRIANGLE_FRACTION_LENGTH: v => (v.numerator / 2) * v.h / 2,
    TRIANGLE_MISSING_HEIGHT: v => 2 * v.area / v.b,
    TRIANGLE_MISSING_BASE: v => 2 * v.area / v.h,
    TRIANGLE_MILLIMETRE_CONVERSION: v => v.b * (v.mm / 10) / 2,
    TRIANGLE_METRE_CONVERSION: v => v.b * (v.cm / 100) / 2,
    TRIANGLE_ONE_LENGTH_SCALE: v => v.k,
    TRIANGLE_BOTH_LENGTHS_SCALE: v => v.k ** 2,
    TRIANGLE_COMPOSITE_CUTOUT: v => v.w * v.height - v.b * v.h / 2,
    TRIANGLE_MATERIAL_COST: v => v.b * v.h / 2 * v.rate,
    TRIANGLE_AREA_UNIT_CONVERSION: v => v.area * 10_000,
  };
  const fixedAnswers = { TRIANGLE_RIGHT_DIAGRAM: "24", TRIANGLE_ROTATED_DIAGRAM: "12", TRIANGLE_OUTSIDE_DIAGRAM: "30", TRIANGLE_PERPENDICULAR_PAIR: "A", TRIANGLE_SQUARE_UNITS: "C", TRIANGLE_FORGOTTEN_HALF: "B", TRIANGLE_SAME_BASE_HEIGHT: "D", TRIANGLE_INSUFFICIENT_INFORMATION: "B" };
  const seen = new Set();
  for (let variation = 0; variation < 100; variation++) {
    const { problems } = store.previewNativeAssessment(triangle.id, variation);
    assert.equal(new Set(problems.map(p => p.source_template_id)).size, 21);
    for (const problem of problems) {
      const id = problem.source_template_id;
      seen.add(id);
      assert.match(problem.template_id, /__RUNTIME_/);
      assert.doesNotMatch(problem.prompt, /\{[^}]+\}/);
      const values = Object.fromEntries(Object.entries(problem.values).map(([key, value]) => [key, Number(value)]));
      const answer = formulas[id] ? String(formulas[id](values)) : fixedAnswers[id];
      assert.ok(answer !== undefined, `${id} needs an independent expected answer`);
      assert.equal(gradeProblem(problem, answer).correct, true, `${id}: ${answer}`);
      if (problem.grading_method === "exact_numeric") assert.equal(gradeProblem(problem, String(Number(answer) * 2)).correct, false, `${id}: reject double the answer`);
      if (id === "TRIANGLE_ODD_PRODUCT") assert.equal(gradeProblem(problem, `${values.b * values.h}/2`).correct, true);
      if (problem.media?.length) assert.deepEqual(problem.values, {}, "Diagram labels must stay aligned with fixed question values");
    }
  }
  assert.equal(seen.size, 21);
});

test("native geometry improvements retain exactly their media through Studio, installation and backups", () => {
  const store = storeFor();
  store.createProfile("Geometry author");
  const studio = createLessonStudio({ store, getSnapshot: () => store.snapshot(), download() {}, showToast() {}, openFilePicker() {} });
  for (const skill of geometry) {
    studio.loadNativeLesson(skill.id, { announce: false });
    const pack = studio.buildPack();
    assert.deepEqual(new Set(pack.assets.map(asset => asset.path)), new Set(mediaIn(skill).map(item => item.src)));
    assert.equal(store.previewLessonPack(pack).mode, "override");
    store.importLessonPack(pack);
    const restored = storeFor();
    restored.importBackup(store.exportBackup());
    assert.deepEqual(restored.getLessonMediaAssets(pack.id).assets, pack.assets);
    assert.equal(restored.skillsById[skill.id].overridden, true);
    store.restoreNativeLessons(pack.id);
    assert.deepEqual(store.getLessonMediaAssets().assets, curriculum.assets);
  }
});

test("an existing workspace discovers triangle area without losing mastery or planned positions", () => {
  const previous = structuredClone(curriculum);
  previous.skills = previous.skills.filter(skill => skill.id !== triangle.id);
  previous.track.skills = previous.track.skills.filter(id => id !== triangle.id);
  const oldStore = storeFor(previous);
  const profile = oldStore.createProfile("Returning learner");
  oldStore.setMapPlanMode(true);
  oldStore.updateMapPlanLayout({ layoutKey: "all-subjects", positions: { MATH_GRAPH_001: { x: 120, y: 300 } } });
  const saved = JSON.parse(oldStore.exportSyncState());
  for (const id of triangle.prerequisites) saved.progress[profile.id][id] = { ...saved.progress[profile.id][id], status: "mastered", masteryScore: 91 };
  const updated = storeFor(curriculum, JSON.stringify(saved));
  const state = updated.snapshot();
  const row = state.progressRows.find(row => row.id === triangle.id);
  assert.ok(row, "new native lesson appears in the existing learner's map");
  assert.deepEqual(row.unmetPrerequisites, []);
  const after = JSON.parse(updated.exportSyncState());
  assert.deepEqual(after.mapPlans, saved.mapPlans);
  for (const id of triangle.prerequisites) assert.equal(after.progress[profile.id][id].masteryScore, 91);
});
