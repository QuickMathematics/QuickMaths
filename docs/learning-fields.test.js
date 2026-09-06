import test from "node:test";
import assert from "node:assert/strict";
import { learningFields } from "./learning-fields.js";
import { storageStatus } from "./storage-status.js";

test("legacy subjects and subdomains form separate field-scoped branches without moving nodes", () => {
  const skills = [{ id: "a", subjectId: "math", subdomain: "Foundations", position: { x: 1, y: 2 } }, { id: "b", subjectId: "biology", subdomain: "Foundations" }, { id: "c", subjectId: "math", subdomain: "Geometry" }];
  const before = JSON.stringify(skills);
  const fields = learningFields([{ id: "math", name: "Mathematics" }, { id: "biology", name: "Biology" }], skills);
  assert.deepEqual(fields[0].branches.map((b) => b.name), ["Foundations", "Geometry"]);
  assert.deepEqual(fields[0].branches[0].skillIds, ["a"]);
  assert.notEqual(fields[0].branches[0].id, fields[1].branches[0].id);
  assert.equal(JSON.stringify(skills), before);
});

test("global storage age uses only successful GitHub saves and has readable non-color states", () => {
  const now = Date.parse("2026-09-06T12:00:00Z");
  const base = { connected: true, phase: "synced", lastPushedAt: "2026-09-06T11:55:00Z" };
  assert.deepEqual([storageStatus(base, { now }).label, storageStatus(base, { now }).age], ["Connected", "GitHub · 5m ago"]);
  assert.equal(storageStatus({ ...base, dirty: true }, { now }).tone, "pending");
  assert.equal(storageStatus(base, { needsReview: true, now }).label, "Review changes");
  assert.equal(storageStatus({ lastPulledAt: new Date(now).toISOString() }, { now }).age, "No GitHub save yet");
  assert.equal(storageStatus({ ...base, lastPushedAt: "invalid" }, { now }).age, "No GitHub save yet");
  assert.equal(storageStatus(base, { now: now - 86400000 }).age, "GitHub · just now");
});
