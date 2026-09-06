import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fieldBranchMapLayout } from "./map-layout.js";
import { FIELD_TAXONOMY } from "./learning-taxonomy.js";
import { standardBranches, normalizeLessonTaxonomy } from "./learning-fields.js";
import { createQuickMathsStore, DEFAULT_SUBJECT, normalizeLessonPackCollection } from "./challenge-core.js";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const curriculum = read("./curriculum-data.json");
const packages = ["estimation-lab/1.0.0", "geography/1.0.0", "programming-fundamentals-python/1.2.0", "python-extensions/1.0.0"].map((path) => read(`./lesson-depot/lessons/${path}/lesson-set.json`));

test("all 107 shipped lessons use the shared broad-branch standard", () => {
  assert.deepEqual(FIELD_TAXONOMY, read("./learning-taxonomy.json"));
  const entries = [
    ...curriculum.skills.map((skill) => ["SUBJECT_MATH", skill]),
    ...packages.flatMap((pack) => pack.skills.map((skill) => [pack.subject.id, skill])),
  ];
  assert.equal(entries.length, 107);
  for (const [fieldId, skill] of entries) {
    assert.ok(standardBranches(fieldId).includes(skill.subdomain), `${skill.id}: ${skill.subdomain}`);
    assert.equal(normalizeLessonTaxonomy(skill, fieldId).subdomain, skill.subdomain);
  }
  assert.equal(curriculum.skills.find((skill) => skill.id === "MATH_QUAD_002").topic, "Quadratic Equations");
  assert.equal(curriculum.skills.find((skill) => skill.id === "MATH_GEOM_001").subdomain, "Geometry");
  normalizeLessonPackCollection(packages, curriculum);
});

test("canonical nodes sit in non-overlapping field/branch bands and prerequisites stay left of dependents", () => {
  const packs = normalizeLessonPackCollection(packages, curriculum);
  const subjects = [...new Map([DEFAULT_SUBJECT, ...packs.map(pack => pack.subject)].map(subject => [subject.id, subject])).values()];
  const skills = [...curriculum.skills.map((skill) => ({ ...skill, subjectId: "SUBJECT_MATH" })), ...packs.flatMap((pack) => pack.skills)];
  const layout = fieldBranchMapLayout(skills, { subjects });
  assert.equal(Object.keys(layout.positions).length, 107);
  assert.equal(layout.lanes.length, 3);
  assert.equal(layout.lanes.flatMap((lane) => lane.branches).length, 12);
  let end = 0;
  for (const lane of layout.lanes) {
    assert.ok(lane.y > end); end = lane.y + lane.height;
    let branchEnd = lane.y;
    for (const branch of lane.branches) {
      assert.ok(branch.y > branchEnd); branchEnd = branch.y + branch.height;
      for (const id of branch.skillIds) {
        const position = layout.positions[id];
        assert.ok(position.y >= branch.y + 48 && position.y + 70 <= branchEnd, id);
      }
    }
  }
  for (const skill of skills) for (const parent of skill.prerequisites) {
    assert.ok(layout.positions[parent].x < layout.positions[skill.id].x, `${parent} -> ${skill.id}`);
  }
  assert.deepEqual(fieldBranchMapLayout([...skills].reverse(), { subjects }).positions, layout.positions);
});

test("loading a legacy workspace migrates branches without changing mastery, tests or saved map work", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const now = () => new Date("2026-09-06T11:30:00Z");
  const store = createQuickMathsStore({ storage, curriculum, now });
  const profile = store.createProfile("Migration learner");
  store.importLessonPack(JSON.stringify(packages[2]));
  store.setMapPlanMode(true);
  store.updateMapPlanLayout({ layoutKey: "all-subjects", positions: { MATH_ARITH_003: { x: -100, y: 250 }, CUSTOM_PROG_001: { x: 300, y: 700 } } });
  store.addMapPlanAnnotation({ body: "Keep my map note", skillIds: ["MATH_ARITH_003"] });
  store.startTest("MATH_ARITH_001");
  const raw = JSON.parse(store.exportSyncState());
  raw.progress[profile.id].MATH_ARITH_003 = { ...raw.progress[profile.id].MATH_ARITH_003, status: "mastered", masteryScore: 97 };
  for (const skill of raw.lessonPacks[0].skills) { skill.subdomain = skill.topic || skill.subdomain; delete skill.topic; }
  const original = structuredClone(raw);
  values.set("quickmaths.web.v2", JSON.stringify(raw));
  const migrated = createQuickMathsStore({ storage, curriculum, now });
  const saved = JSON.parse(migrated.exportSyncState());
  assert.deepEqual(saved.mapPlans, original.mapPlans);
  assert.deepEqual(saved.drafts, original.drafts);
  assert.equal(saved.progress[profile.id].MATH_ARITH_003.masteryScore, 97);
  assert.equal(saved.progress[profile.id].MATH_ARITH_003.status, "mastered");
  assert.equal(migrated.skillsById.CUSTOM_PROG_004.subdomain, "Programming Fundamentals");
  assert.equal(migrated.skillsById.CUSTOM_PROG_004.topic, "Control Flow");
  assert.equal(migrated.validateSyncMerge(JSON.stringify(raw)).ok, true);
  const repeated = createQuickMathsStore({ storage: { getItem: () => migrated.exportSyncState(), setItem() {} }, curriculum, now });
  assert.deepEqual(repeated.snapshot().fields, migrated.snapshot().fields);
});


test("hiding more than 80 lessons survives reload and sync export", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const store = createQuickMathsStore({ storage, curriculum });
  store.createProfile("Large map");
  packages.forEach(pack => store.importLessonPack(JSON.stringify(pack)));
  const ids = store.snapshot().curriculum.allSkills.map(skill => skill.id);
  store.setMapPlanNodesHidden(ids.slice(0, 80));
  store.setMapPlanNodesHidden(ids.slice(80));
  assert.deepEqual(store.snapshot().mapPlan.hiddenSkillIds, ids);
  const reloaded = createQuickMathsStore({ storage, curriculum });
  assert.deepEqual(reloaded.snapshot().mapPlan.hiddenSkillIds, ids);
  const imported = createQuickMathsStore({ curriculum, storage: { getItem: () => null, setItem() {} } });
  imported.importSyncState(reloaded.exportSyncState());
  assert.deepEqual(imported.snapshot().mapPlan.hiddenSkillIds, ids);
  imported.setMapPlanNodesHidden(ids.slice(80), false);
  assert.deepEqual(imported.snapshot().mapPlan.hiddenSkillIds, ids.slice(0, 80));
});
