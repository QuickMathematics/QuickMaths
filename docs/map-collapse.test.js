import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createQuickMathsStore, STORAGE_KEY } from "./challenge-core.js";

const curriculum = JSON.parse(readFileSync(new URL("./curriculum-data.json", import.meta.url), "utf8"));

function storage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    value(key) { return values.get(key); },
  };
}

function learner(seed = {}) {
  const saved = storage(seed);
  const store = createQuickMathsStore({ curriculum, storage: saved });
  if (!store.snapshot().activeProfile) store.createProfile("Branch learner");
  return { store, saved };
}

test("collapse preferences sanitize, deduplicate, persist, and survive reload", () => {
  const { store, saved } = learner();
  const result = store.setMapCollapsedBranches([
    "SUBJECT_MATH/Geometry",
    "SUBJECT_MATH/Geometry",
    "bad",
    "too/many/parts",
    "x/" + "a".repeat(241),
  ]);
  assert.deepEqual(result.branch_ids, ["SUBJECT_MATH/Geometry"]);
  assert.deepEqual(store.snapshot().ui.mapCollapsedBranchIds, ["SUBJECT_MATH/Geometry"]);
  const reloaded = createQuickMathsStore({ curriculum, storage: saved });
  assert.deepEqual(reloaded.snapshot().ui.mapCollapsedBranchIds, ["SUBJECT_MATH/Geometry"]);
  assert.deepEqual(JSON.parse(saved.value(STORAGE_KEY)).ui.mapCollapsedBranchIds, ["SUBJECT_MATH/Geometry"]);
});

test("plan mode temporarily expands branches without losing the learner preference", () => {
  const { store } = learner();
  store.setMapCollapsedBranches(["SUBJECT_MATH/Geometry"]);
  store.setMapPlanMode(true);
  assert.equal(store.snapshot().ui.mapPlanMode, true);
  assert.deepEqual(store.snapshot().ui.mapCollapsedBranchIds, ["SUBJECT_MATH/Geometry"]);
  store.setMapPlanMode(false);
  assert.equal(store.snapshot().ui.mapPlanMode, false);
  assert.deepEqual(store.snapshot().ui.mapCollapsedBranchIds, ["SUBJECT_MATH/Geometry"]);
});

test("toggling a branch changes only device UI state, not lesson data or saved map plans", () => {
  const { store } = learner();
  const before = store.snapshot();
  const lesson = before.curriculum.allSkills.find((skill) => skill.id === "MATH_ARITH_001");
  const row = before.allProgressRows.find((item) => item.id === lesson.id);
  const plan = before.mapPlan;
  store.toggleMapBranch("SUBJECT_MATH/Geometry");
  const after = store.snapshot();
  const afterLesson = after.curriculum.allSkills.find((skill) => skill.id === lesson.id);
  const afterRow = after.allProgressRows.find((item) => item.id === lesson.id);
  assert.deepEqual(afterLesson.prerequisites, lesson.prerequisites);
  assert.equal(afterRow.masteryScore, row.masteryScore);
  assert.deepEqual(after.mapPlan, plan);
  assert.notDeepEqual(after.ui.mapCollapsedBranchIds, before.ui.mapCollapsedBranchIds);
});

import { sameWorkspace, preserveDeviceState } from './workspace-merge.js';

test('collapse preferences neither trigger workspace conflicts nor get overwritten by remote view state', () => {
  const { store } = learner();
  const remote = store.exportSyncState();
  store.setMapCollapsedBranches(['SUBJECT_MATH/Geometry']);
  const local = store.exportSyncState();
  assert.equal(sameWorkspace(local, remote), true);
  const merged = JSON.parse(preserveDeviceState(remote, local));
  assert.deepEqual(merged.ui.mapCollapsedBranchIds, ['SUBJECT_MATH/Geometry']);
});
