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
  assert.deepEqual(conflict.path, ["profiles", "p1", "displayName"]);
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

const mapPlan = () => ({ layouts: { "all-subjects": { fractions: { x: 10, y: 20 }, algebra: { x: 30, y: 40 } } }, paths: [], annotations: [], hiddenSkillIds: [] });
const merge = (base, local, remote) => createWorkspaceMerge({ baseJson: json(base), localJson: json(local), remoteJson: json(remote), skillNames: { fractions: "Fractions basics", algebra: "Algebra" } });

test("a GitHub note and two phone node moves are three independent choices", () => {
  const base = state();
  base.mapPlans.p1 = mapPlan();
  const local = structuredClone(base), remote = structuredClone(base);
  local.mapPlans.p1.layouts["all-subjects"].fractions = { x: 50, y: 60 };
  local.mapPlans.p1.layouts["all-subjects"].algebra = { x: 70, y: 80 };
  const note = { id: "note1", body: "Practise equivalent fractions", skillIds: ["fractions"], targetType: "node", positions: { "all-subjects": { x: 100, y: 110 } }, createdAt: "start", updatedAt: "finish" };
  remote.mapPlans.p1.annotations.push(note);
  const plan = merge(base, local, remote);
  assert.equal(plan.rows.length, 3);
  assert.ok(plan.rows.every((r) => !r.conflict));
  assert.equal(plan.rows.filter((r) => r.changes[0].title.startsWith("Moved")).length, 2);
  const added = plan.rows.find((r) => r.changes[0].title === "Added note on Fractions basics");
  assert.equal(added.changes[0].source, "remote");
  assert.equal(added.changes[0].preview, note.body);
  const result = JSON.parse(plan.resolve());
  assert.deepEqual(result.mapPlans.p1.layouts, local.mapPlans.p1.layouts);
  assert.deepEqual(result.mapPlans.p1.annotations, [note]);
  const omitted = JSON.parse(plan.resolve({ [added.id]: "base" }));
  assert.deepEqual(omitted.mapPlans.p1.annotations, []);
  assert.deepEqual(omitted.mapPlans.p1.layouts, local.mapPlans.p1.layouts);
  const move = plan.rows.find((r) => r.path.at(-1) === "fractions");
  const partial = JSON.parse(plan.resolve({ [move.id]: "base" }));
  assert.deepEqual(partial.mapPlans.p1.layouts["all-subjects"].fractions, base.mapPlans.p1.layouts["all-subjects"].fractions);
  assert.deepEqual(partial.mapPlans.p1.annotations, [note]);
});

test("same-node moves conflict as complete coordinates; skipping both restores the starting position", () => {
  const base = { mapPlans: { p1: mapPlan() } }, local = structuredClone(base), remote = structuredClone(base);
  local.mapPlans.p1.layouts["all-subjects"].fractions.x = 50;
  remote.mapPlans.p1.layouts["all-subjects"].fractions.y = 90;
  const plan = merge(base, local, remote);
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].conflict, true);
  assert.throws(() => plan.resolve(), /Choose/);
  assert.deepEqual(JSON.parse(plan.resolve({ 0: "base" })).mapPlans, base.mapPlans);
  assert.deepEqual(JSON.parse(plan.resolve({ 0: "local" })).mapPlans, local.mapPlans);
});

test("new map layouts and new profile progress containers still expose individual edits", () => {
  const base = { mapPlans: { p1: { layouts: {} } }, progress: {} }, local = structuredClone(base), remote = structuredClone(base);
  local.mapPlans.p1.layouts["all-subjects"] = { fractions: { x: 1, y: 2 }, algebra: { x: 3, y: 4 } };
  remote.progress.p1 = { fractions: { masteryScore: 20 }, algebra: { masteryScore: 30 } };
  const plan = merge(base, local, remote);
  assert.equal(plan.rows.length, 4);
  const skip = Object.fromEntries(plan.rows.map((row) => [row.id, "base"]));
  assert.deepEqual(JSON.parse(plan.resolve(skip)).mapPlans, base.mapPlans);
  assert.deepEqual(JSON.parse(plan.resolve(skip)).progress, base.progress);
});

test("curriculum maps merge note text, note moves, path names and visibility separately", () => {
  const plan = mapPlan();
  plan.annotations = [{ id: "n", body: "Old note", skillIds: ["fractions"], positions: { "all-subjects": { x: 1, y: 2 } }, updatedAt: "a" }];
  plan.paths = [{ id: "path1", name: "Old path", color: "blue", skillIds: ["fractions", "algebra"], updatedAt: "a" }];
  const base = { curricula: [{ id: "c1", name: "Maths", mapPlan: plan }] }, local = structuredClone(base), remote = structuredClone(base);
  local.curricula[0].mapPlan.annotations[0].positions["all-subjects"] = { x: 4, y: 5 };
  local.curricula[0].mapPlan.hiddenSkillIds.push("algebra");
  remote.curricula[0].mapPlan.annotations[0].body = "New note";
  remote.curricula[0].mapPlan.annotations[0].updatedAt = "b";
  remote.curricula[0].mapPlan.paths[0].name = "New path";
  remote.curricula[0].mapPlan.hiddenSkillIds.push("fractions");
  const merged = JSON.parse(merge(base, local, remote).resolve()).curricula[0].mapPlan;
  assert.equal(merged.annotations[0].body, "New note");
  assert.deepEqual(merged.annotations[0].positions["all-subjects"], { x: 4, y: 5 });
  assert.equal(merged.paths[0].name, "New path");
  assert.deepEqual(new Set(merged.hiddenSkillIds), new Set(["algebra", "fractions"]));
});

test("mastery stays coherent while notes, review dates, lessons and profile preferences merge independently", () => {
  const base = state();
  base.progress.p1.fractions = { status: "learning", masteryScore: 20, notes: "old", nextReviewAt: "Monday", updatedAt: "a" };
  base.lessonPacks = [{ id: "pack", name: "Maths", skills: [{ id: "fractions", name: "Fractions basics", theory: "Old theory", problems: [{ template_id: "q1", prompt: "Old question", expected_answer: "1" }] }] }];
  const local = structuredClone(base), remote = structuredClone(base);
  local.progress.p1.fractions.status = "mastered";
  local.progress.p1.fractions.masteryScore = 90;
  local.progress.p1.fractions.updatedAt = "b";
  local.profiles[0].displayName = "Ada on phone";
  local.lessonPacks[0].skills[0].theory = "Phone theory";
  remote.progress.p1.fractions.notes = "Agent feedback";
  remote.progress.p1.fractions.nextReviewAt = "Friday";
  remote.profiles[0].progressionMode = "open";
  remote.lessonPacks[0].skills[0].problems[0] = { template_id: "q1", prompt: "New question", expected_answer: "2" };
  const plan = merge(base, local, remote);
  assert.ok(plan.rows.every((r) => !r.conflict));
  const mastery = plan.rows.find((r) => r.path.at(-1) === "mastery");
  assert.deepEqual(mastery.local, { status: "mastered", masteryScore: 90 });
  assert.ok(mastery.changes[0].details.some((d) => d.label === "Mastery score" && d.after === "90"));
  const merged = JSON.parse(plan.resolve());
  assert.equal(merged.progress.p1.fractions.masteryScore, 90);
  assert.equal(merged.progress.p1.fractions.notes, "Agent feedback");
  assert.equal(merged.profiles[0].displayName, "Ada on phone");
  assert.equal(merged.profiles[0].progressionMode, "open");
  assert.equal(merged.lessonPacks[0].skills[0].theory, "Phone theory");
  assert.deepEqual(merged.lessonPacks[0].skills[0].problems[0], remote.lessonPacks[0].skills[0].problems[0]);
  const skipped = JSON.parse(plan.resolve({ [mastery.id]: "base" }));
  assert.equal(skipped.progress.p1.fractions.masteryScore, 20);
  assert.equal(skipped.progress.p1.fractions.status, "learning");
  assert.equal(skipped.progress.p1.fractions.notes, "Agent feedback");
});

test("attempts, feedback, drafts and approval packages can be selected independently", () => {
  const base = { attempts: [], reviews: [], drafts: { p1: {} }, stagedLessonPacks: [] };
  const local = structuredClone(base), remote = structuredClone(base);
  local.attempts.push({ attemptId: "a1", skillId: "fractions", skillName: "Fractions basics", rawScore: 3, scoreTotal: 5 });
  local.drafts.p1.algebra = { answer: "x+1" };
  remote.reviews.push({ reviewId: "r1", attemptId: "a1", feedback: "Check the denominator" });
  remote.stagedLessonPacks.push({ pack: { id: "pack1", name: "Geometry" } }, { pack: { id: "pack2", name: "Probability" } });
  const plan = merge(base, local, remote);
  assert.equal(plan.rows.length, 5);
  const probability = plan.rows.find((r) => r.path[1] === "pack2");
  const merged = JSON.parse(plan.resolve({ [probability.id]: "base" }));
  assert.deepEqual(merged.attempts, local.attempts);
  assert.deepEqual(merged.reviews, remote.reviews);
  assert.deepEqual(merged.drafts, local.drafts);
  assert.deepEqual(merged.stagedLessonPacks, [remote.stagedLessonPacks[0]]);
});

test("shared changes can be unchecked and activity history does not create duplicate choices", () => {
  const base = { profiles: [{ id: "p", displayName: "Old" }], activity: [] }, local = structuredClone(base), remote = structuredClone(base);
  local.profiles[0].displayName = remote.profiles[0].displayName = "Same edit";
  local.activity.push({ at: "b", tool: "move_map_node", message: "Moved a node" });
  remote.activity.push({ at: "c", tool: "add_map_note", message: "Added a note" });
  const plan = merge(base, local, remote);
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].changes[0].source, "both");
  const merged = JSON.parse(plan.resolve({ 0: "base" }));
  assert.equal(merged.profiles[0].displayName, "Old");
  assert.equal(merged.activity.length, 2);
});

test("reordering saved paths can be kept alongside an edit to a path", () => {
  const base = { mapPlans: { p1: { paths: [{ id: "a", name: "First" }, { id: "b", name: "Second" }] } } };
  const local = structuredClone(base), remote = structuredClone(base);
  local.mapPlans.p1.paths[0].name = "Updated first";
  remote.mapPlans.p1.paths.reverse();
  const plan = merge(base, local, remote);
  const order = plan.rows.find((r) => r.path.at(-1) === "order");
  assert.ok(order);
  assert.deepEqual(JSON.parse(plan.resolve()).mapPlans.p1.paths, [{ id: "b", name: "Second" }, { id: "a", name: "Updated first" }]);
  assert.deepEqual(JSON.parse(plan.resolve({ [order.id]: "base" })).mapPlans.p1.paths.map((p) => p.id), ["a", "b"]);
});

test("deleting a note versus editing it stays explicit, including when history is missing", () => {
  const base = { mapPlans: { p1: mapPlan() } };
  base.mapPlans.p1.annotations.push({ id: "n", body: "Old", skillIds: ["fractions"] });
  const local = structuredClone(base), remote = structuredClone(base);
  local.mapPlans.p1.annotations = [];
  remote.mapPlans.p1.annotations[0].body = "New";
  const plan = merge(base, local, remote);
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].conflict, true);
  assert.equal(JSON.parse(plan.resolve({ 0: "local" })).mapPlans.p1.annotations.length, 0);
  const withoutHistory = createWorkspaceMerge({ localJson: json(local), remoteJson: json(remote) });
  assert.throws(() => withoutHistory.resolve({ 0: "base" }), /Choose/);
});
