import { branchId, lessonClassification } from "./learning-fields.js?v=20260908-statistics-v1";

export const COLLAPSED_NODE_WIDTH = 356;
export const COLLAPSED_NODE_HEIGHT = 140;
export const SKILL_NODE_WIDTH = 178;
export const SKILL_NODE_HEIGHT = 70;

const keyForSkill = (id) => `skill:${String(id)}`;
const keyForGroup = (id) => `group:${String(id)}`;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function branchFor(skill) {
  const fieldId = skill.fieldId ?? skill.subjectId ?? "";
  const name = lessonClassification(skill, fieldId).branch;
  return { fieldId, name, id: branchId(fieldId, name) };
}

function rect(position, width, height) {
  return { x: finite(position?.x), y: finite(position?.y), width, height };
}

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function avoidOverlaps(position, width, height, occupied) {
  const result = { x: finite(position?.x), y: finite(position?.y) };
  let candidate = rect(result, width, height);
  while (occupied.some((item) => overlaps(candidate, item))) {
    result.y += 24;
    candidate = rect(result, width, height);
  }
  occupied.push(candidate);
  return result;
}

function boundsOf(rects, fallbackWidth = 0, fallbackHeight = 0) {
  if (!rects.length) return { x: 0, y: 0, width: fallbackWidth, height: fallbackHeight };
  const minX = Math.min(...rects.map((item) => item.x));
  const minY = Math.min(...rects.map((item) => item.y));
  const maxX = Math.max(...rects.map((item) => item.x + item.width));
  const maxY = Math.max(...rects.map((item) => item.y + item.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Build the renderable graph for the grouped mastery map without changing any
 * caller-owned layout, skill, or plan objects.
 */
export function buildGroupedMasteryMap({
  layout = {},
  savedPositions = {},
  skills = [],
  visibleIds,
  collapsedBranchIds = [],
} = {}) {
  const skillList = Array.isArray(skills) ? skills : [];
  const skillById = new Map(skillList.map((skill) => [String(skill.id), skill]));
  const visible = visibleIds == null
    ? new Set(skillList.map((skill) => String(skill.id)))
    : new Set([...visibleIds].map(String));
  const collapsed = new Set([...collapsedBranchIds].map(String));
  const compactShiftByBranch = new Map();
  const compactShiftByLane = new Map();
  const compactBranchHeight = new Map();
  let runningShift = 0;
  for (const lane of layout.lanes ?? []) {
    compactShiftByLane.set(lane, runningShift);
    for (const branch of lane.branches ?? []) {
      const id = String(branch.id ?? branchId(lane.subject?.id ?? lane.fieldId ?? "", branch.name ?? ""));
      compactShiftByBranch.set(id, runningShift);
      const height = collapsed.has(id) ? 212 : finite(branch.height);
      compactBranchHeight.set(id, height);
      if (collapsed.has(id)) runningShift += finite(branch.height) - height;
    }
  }
  const branches = new Map();
  for (const skill of skillList) {
    const id = String(skill.id);
    const branch = branchFor(skill);
    if (!branches.has(branch.id)) branches.set(branch.id, { ...branch, skillIds: [] });
    branches.get(branch.id).skillIds.push(id);
  }

  const positions = {};
  const endpointMeta = new Map();
  const occupied = [];
  const canonical = layout.positions ?? {};
  for (const skill of skillList) {
    const id = String(skill.id);
    if (!visible.has(id)) continue;
    const branch = branchFor(skill);
    if (collapsed.has(branch.id)) continue;
    const position = savedPositions[id]
      ? { ...canonical[id], ...savedPositions[id] }
      : { ...(canonical[id] ?? { x: 0, y: 0 }) };
    if (!savedPositions[id]) position.y = finite(position.y) - (compactShiftByBranch.get(branch.id) ?? 0);
    const endpoint = keyForSkill(id);
    positions[endpoint] = { x: finite(position.x), y: finite(position.y), width: SKILL_NODE_WIDTH, height: SKILL_NODE_HEIGHT };
    endpointMeta.set(id, { endpoint, branchId: branch.id, kind: "skill", skillIds: [id] });
    occupied.push(rect(positions[endpoint], SKILL_NODE_WIDTH, SKILL_NODE_HEIGHT));
  }

  const groups = [];
  for (const branch of branches.values()) {
    const members = branch.skillIds.filter((id) => visible.has(id));
    if (!members.length) continue;
    if (!collapsed.has(branch.id)) {
      groups.push({ ...branch, collapsed: false, endpointId: null, position: null });
      continue;
    }
    const memberPositions = members.map((id) => {
      const saved = savedPositions[id];
      const branch = branchFor(skillById.get(id));
      const position = saved ? { ...canonical[id], ...saved } : { ...(canonical[id] ?? { x: 0, y: 0 }) };
      if (!saved) position.y = finite(position.y) - (compactShiftByBranch.get(branch.id) ?? 0);
      return position;
    });
    const anchor = memberPositions.reduce((result, item) => ({
      x: Math.min(result.x, finite(item.x)),
      y: Math.min(result.y, finite(item.y)),
    }), { x: Infinity, y: Infinity });
    const position = avoidOverlaps(anchor, COLLAPSED_NODE_WIDTH, COLLAPSED_NODE_HEIGHT, occupied);
    const endpoint = keyForGroup(branch.id);
    positions[endpoint] = { ...position, width: COLLAPSED_NODE_WIDTH, height: COLLAPSED_NODE_HEIGHT };
    for (const id of members) endpointMeta.set(id, { endpoint, branchId: branch.id, kind: "group", skillIds: members.slice() });
    groups.push({ ...branch, skillIds: members, collapsed: true, endpointId: endpoint, position: { ...positions[endpoint] } });
  }

  const edgeMap = new Map();
  for (const target of skillList) {
    const targetId = String(target.id);
    if (!visible.has(targetId) || !endpointMeta.has(targetId)) continue;
    const seenPairs = new Set();
    for (const source of Array.isArray(target.prerequisites) ? target.prerequisites : []) {
      const sourceId = String(source);
      const pairKey = JSON.stringify([sourceId, targetId]);
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      if (!visible.has(sourceId) || !skillById.has(sourceId) || !endpointMeta.has(sourceId)) continue;
      const from = endpointMeta.get(sourceId).endpoint;
      const to = endpointMeta.get(targetId).endpoint;
      if (from === to) continue;
      const edgeKey = JSON.stringify([from, to]);
      if (!edgeMap.has(edgeKey)) edgeMap.set(edgeKey, { from, to, count: 0, originalPairs: [] });
      const edge = edgeMap.get(edgeKey);
      edge.count += 1;
      edge.originalPairs.push({ from: sourceId, to: targetId });
    }
  }

  const rects = Object.values(positions);
  const lanes = (layout.lanes ?? []).map((lane) => ({
    ...lane,
    y: finite(lane.y) - (compactShiftByLane.get(lane) ?? 0),
    height: finite(lane.height) - [...(lane.branches ?? [])].reduce((sum, branch) => {
      const id = String(branch.id ?? branchId(lane.subject?.id ?? lane.fieldId ?? "", branch.name ?? ""));
      return sum + (collapsed.has(id) ? (finite(branch.height) - (compactBranchHeight.get(id) ?? finite(branch.height))) : 0);
    }, 0),
    branches: (lane.branches ?? []).map((branch) => {
      const id = branch.id ?? branchId(lane.subject?.id ?? lane.fieldId ?? "", branch.name ?? "");
      return { ...branch, id, y: finite(branch.y) - (compactShiftByBranch.get(id) ?? 0), height: compactBranchHeight.get(id) ?? branch.height, collapsed: collapsed.has(id) };
    }),
  }));
  return {
    positions,
    endpointBySkillId: new Map([...endpointMeta].map(([id, meta]) => [id, meta.endpoint])),
    groups,
    lanes,
    bounds: boundsOf(rects, finite(layout.width), finite(layout.height)),
    edges: [...edgeMap.values()],
  };
}

