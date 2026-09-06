import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceMerge, sameWorkspace } from "./workspace-merge.js";
const json = JSON.stringify;
const state = () => ({ version: 8, profiles: [{ id: "p1", displayName: "Ada", totalLoggedSeconds: 10 }], attempts: [], progress: { p1: {} }, lessonPacks: [], mapPlans: { p1: {} } });

test("merge keeps independent records from both sides and requires choices for overlapping edits", () => {
  const base = state();
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.progress.p1.algebra = { score: 5 };
  local.profiles[0].displayName = "Local name";
  remote.lessonPacks.push({ id: "geometry", name: "Geometry" });
  remote.profiles[0].displayName = "Remote name";
  const plan = createWorkspaceMerge({ baseJson: json(base), localJson: json(local), remoteJson: json(remote) });
  const conflict = plan.rows.find((r) => r.conflict);
  assert.deepEqual(conflict.path, ["profiles", "p1"]);
  assert.throws(() => plan.resolve(), /Choose/);
  const merged = JSON.parse(plan.resolve({ [conflict.id]: "local" }));
  assert.equal(merged.profiles[0].displayName, "Local name");
  assert.equal(merged.progress.p1.algebra.score, 5);
  assert.equal(merged.lessonPacks[0].name, "Geometry");
});

test("delete versus edit stays a conflict and does not silently resurrect removed items", () => {
  const base = { attempts: [{ attemptId: "a", notes: "old" }] };
  const local = { attempts: [] };
  const remote = { attempts: [{ attemptId: "a", notes: "new" }] };
  const plan = createWorkspaceMerge({ baseJson: json(base), localJson: json(local), remoteJson: json(remote) });
  assert.equal(plan.rows[0].localExists, false);
  assert.equal(plan.rows[0].conflict, true);
  assert.deepEqual(JSON.parse(plan.resolve({ 0: "local" })).attempts, []);
  assert.equal(JSON.parse(plan.resolve({ 0: "remote" })).attempts[0].notes, "new");
});

test("without a baseline every difference needs an explicit choice", () => {
  const plan = createWorkspaceMerge({ localJson: '{"drafts":{}}', remoteJson: '{"drafts":{"p":{"s":{"answer":"x"}}}}' });
  assert.equal(plan.hasBase, false);
  assert.ok(plan.rows.every((row) => row.conflict && row.suggested === null));
  assert.throws(() => plan.resolve(), /Choose/);
});

test("clock, viewport and profile ordering changes do not cause conflicts; elapsed time is preserved", () => {
  const base = state();
  base.ui = { route: "home", pendingResults: null };
  const local = structuredClone(base);
  local.profiles[0].totalLoggedSeconds = 50;
  local.ui.route = "settings";
  local.syncedAt = "later";
  local.session = { heartbeatAt: 1 };
  base.activity = [];
  local.activity = [{ at: "2026-09-06T12:00:00Z", tool: "navigate_learning_app", message: "Opened map." }];
  assert.equal(sameWorkspace(json(base), json(local)), true);
  const remote = structuredClone(base);
  remote.lessonPacks.push({ id: "new" });
  const plan = createWorkspaceMerge({ baseJson: json(base), localJson: json(local), remoteJson: json(remote) });
  const merged = JSON.parse(plan.resolve());
  assert.equal(merged.profiles[0].totalLoggedSeconds, 50);
  assert.equal(merged.ui.route, "settings");
  assert.equal(merged.activity[0].tool, "navigate_learning_app");
  local.ui.pendingResults = { score: 10 };
  assert.equal(sameWorkspace(json(base), json(local)), false);
});

test("reserved JSON keys cannot modify object prototypes", () => {
  const plan = createWorkspaceMerge({ baseJson: '{}', localJson: '{}', remoteJson: '{"__proto__":{"polluted":true},"constructor":{"x":1}}' });
  assert.equal(JSON.parse(plan.resolve()).__proto__.polluted, true);
  assert.equal({}.polluted, undefined);
});
