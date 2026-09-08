import assert from "node:assert/strict";
import test from "node:test";
import { branchId } from "./learning-fields.js?v=20260908-statistics-v1";
import { fieldBranchMapLayout } from "./map-layout.js?v=20260908-statistics-v1";
import { buildGroupedMasteryMap, COLLAPSED_NODE_HEIGHT, COLLAPSED_NODE_WIDTH } from "./map-groups.js";

const skills = [
  { id: "a1", fieldId: "field/a", branch: "Core", prerequisites: [] },
  { id: "a2", fieldId: "field/a", branch: "Core", prerequisites: ["a1"] },
  { id: "b1", fieldId: "field/b", branch: "Core", prerequisites: [] },
  { id: "b2", fieldId: "field/b", branch: "Core", prerequisites: ["a1", "a1", "a2"] },
  { id: "leaf", fieldId: "field/b", branch: "Other", prerequisites: ["missing"] },
];

function input(overrides = {}) {
  return {
    skills,
    layout: {
      positions: { a1: { x: 10, y: 10 }, a2: { x: 220, y: 10 }, b1: { x: 10, y: 120 }, b2: { x: 220, y: 120 }, leaf: { x: 220, y: 240 } },
      width: 500,
      height: 300,
      lanes: [
        { subject: { id: "field/a" }, branches: [{ id: branchId("field/a", "Core"), height: 200 }] },
        { subject: { id: "field/b" }, branches: [{ id: branchId("field/b", "Core"), height: 300 }, { id: branchId("field/b", "Other"), height: 140 }] },
      ],
    },
    savedPositions: { a2: { x: 900, y: 40 } },
    ...overrides,
  };
}

test("uses field-qualified branch identity and preserves input objects", () => {
  const value = input({ visibleIds: ["a1", "a2", "b1", "b2"] });
  const before = JSON.stringify(value);
  const result = buildGroupedMasteryMap(value);
  assert.equal(result.groups.length, 2);
  assert.notEqual(branchId("field/a", "Core"), branchId("field/b", "Core"));
  assert.equal(result.positions["skill:a2"].x, 900);
  assert.equal(JSON.stringify(value), before);
});

test("aggregates directed prerequisite pairs and drops hidden, dangling, and internal links", () => {
  const result = buildGroupedMasteryMap(input({
    visibleIds: ["a1", "a2", "b1", "b2"],
    collapsedBranchIds: [branchId("field/a", "Core")],
  }));
  assert.equal(result.edges.length, 1);
  assert.deepEqual(result.edges[0], {
    from: "group:field%2Fa/Core",
    to: "skill:b2",
    count: 2,
    originalPairs: [{ from: "a1", to: "b2" }, { from: "a2", to: "b2" }],
  });
  assert.equal(result.positions["group:field%2Fa/Core"].width, COLLAPSED_NODE_WIDTH);
  assert.equal(result.endpointBySkillId.get("a1"), "group:field%2Fa/Core");
});

test("collapsed groups use doubled dimensions, avoid overlaps, and retain bounds", () => {
  const result = buildGroupedMasteryMap(input({
    visibleIds: ["a1", "a2", "b1", "b2"],
    collapsedBranchIds: [branchId("field/a", "Core"), branchId("field/b", "Core")],
  }));
  const groups = Object.values(result.positions);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].height, COLLAPSED_NODE_HEIGHT);
  assert.ok(groups[1].y >= groups[0].y + COLLAPSED_NODE_HEIGHT || groups[1].x >= groups[0].x + COLLAPSED_NODE_WIDTH);
  assert.ok(result.bounds.width >= COLLAPSED_NODE_WIDTH);
  assert.ok(result.bounds.height >= COLLAPSED_NODE_HEIGHT);
});

test("partial collapse compacts unsaved nodes, preserves saved coordinates, and handles reverse edges", () => {
  const value = input({ visibleIds: ["a1", "a2", "b1", "b2", "leaf"], collapsedBranchIds: [branchId("field/b", "Core")], savedPositions: { a2: { x: 910, y: 400 } } });
  const result = buildGroupedMasteryMap(value);
  assert.equal(result.positions["skill:a2"].x, 910);
  assert.equal(result.positions["skill:a2"].y, 400);
  assert.ok(result.positions["skill:leaf"].y >= 0);
  assert.ok(result.lanes.flatMap((lane) => lane.branches).find((branch) => branch.id === branchId("field/b", "Core")).height >= 212);
  const crossEdge = result.edges.find((edge) => edge.to === "group:field%2Fb/Core");
  assert.equal(crossEdge.from, "skill:a1");
});

test("empty and hidden groups emit no endpoints or edges", () => {
  const result = buildGroupedMasteryMap(input({ visibleIds: ["leaf"] }));
  assert.deepEqual(result.edges, []);
  assert.equal(result.groups.length, 1);
  assert.equal(Object.keys(result.positions).length, 1);
});

test("all collapsed real layout groups fit their compact branch bands without overlap", () => {
  const subjects = [
    { id: "field/a", name: "A" },
    { id: "field/b", name: "B" },
  ];
  const realSkills = skills.map((skill) => ({ ...skill }));
  const layout = fieldBranchMapLayout(realSkills, { subjects });
  const collapsedBranchIds = [...new Set(realSkills.map((skill) => {
    const fieldId = skill.fieldId;
    return branchId(fieldId, skill.branch);
  }))];
  const result = buildGroupedMasteryMap({ layout, skills: realSkills, collapsedBranchIds });
  const rects = Object.values(result.positions);
  for (let index = 0; index < rects.length; index += 1) {
    for (let other = index + 1; other < rects.length; other += 1) {
      assert.ok(rects[index].x + rects[index].width <= rects[other].x || rects[other].x + rects[other].width <= rects[index].x || rects[index].y + rects[index].height <= rects[other].y || rects[other].y + rects[other].height <= rects[index].y);
    }
  }
  for (const group of result.groups.filter((item) => item.collapsed)) {
    const lane = result.lanes.find((item) => item.branches.some((branch) => branch.id === group.id));
    const band = lane.branches.find((branch) => branch.id === group.id);
    const node = result.positions[group.endpointId];
    assert.ok(node.y >= band.y && node.y + node.height <= band.y + band.height);
  }
});
import { readFileSync } from 'node:fs';

test('collapsing shipped curricula reduces map height and expansion restores every saved position', () => {
  const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
  const native = read('./curriculum-data.json');
  const packs = ['programming-fundamentals-python/1.2.0', 'python-extensions/1.0.0'].map(path => read(`./lesson-depot/lessons/${path}/lesson-set.json`));
  const subjects = [{ id: 'SUBJECT_MATH', name: 'Math' }, ...new Map(packs.map(pack => [pack.subject.id, pack.subject])).values()];
  const skills = [...native.skills.map(skill => ({ ...skill, subjectId: 'SUBJECT_MATH' })), ...packs.flatMap(pack => pack.skills.map(skill => ({ ...skill, subjectId: pack.subject.id })))];
  const layout = fieldBranchMapLayout(skills, { subjects });
  const collapsedBranchIds = layout.lanes.flatMap(lane => lane.branches.map(branch => branch.id));
  const collapsed = buildGroupedMasteryMap({ layout, skills, collapsedBranchIds });
  const bottom = lanes => Math.max(...lanes.map(lane => lane.y + lane.height));
  assert.ok(bottom(collapsed.lanes) < bottom(layout.lanes) * 0.8);
  for (const group of collapsed.groups) {
    const band = collapsed.lanes.flatMap(lane => lane.branches).find(branch => branch.id === group.id);
    assert.ok(group.position.y >= band.y && group.position.y + 140 <= band.y + band.height, group.name);
  }
  const savedPositions = { [skills[0].id]: { x: -220, y: 730 } };
  const expanded = buildGroupedMasteryMap({ layout, skills, savedPositions });
  for (const skill of skills) {
    const expected = savedPositions[skill.id] ?? layout.positions[skill.id];
    assert.equal(expanded.positions[`skill:${skill.id}`].x, expected.x);
    assert.equal(expanded.positions[`skill:${skill.id}`].y, expected.y);
  }
});
