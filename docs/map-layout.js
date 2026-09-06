import { learningFields } from "./learning-fields.js?v=20260906-app-audit-v1";

// Branch bands organize the canonical map; saved plan coordinates are overlaid
// by the caller and remain free to sit outside these reference bands.
export function fieldBranchMapLayout(skills, { subjects = [] } = {}) {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  const depths = new Map();
  function depthOf(id, trail = new Set()) {
    if (depths.has(id)) return depths.get(id);
    if (trail.has(id) || !byId.has(id)) return -1;
    const next = new Set([...trail, id]);
    const depth = Math.max(-1, ...(byId.get(id).prerequisites ?? []).map((parent) => depthOf(parent, next))) + 1;
    depths.set(id, depth);
    return depth;
  }
  skills.forEach((skill) => depthOf(skill.id));
  const maxDepth = Math.max(0, ...depths.values());
  const width = Math.max(900, 108 + (maxDepth + 1) * 224);
  const positions = {};
  const lanes = [];
  let top = 24;
  for (const field of learningFields(subjects, skills).filter((field) => field.skillIds.length)) {
    const y = top;
    top += 58;
    const branches = [];
    for (const branch of field.branches) {
      const columns = new Map();
      branch.skillIds.forEach((id) => {
        const depth = depths.get(id);
        if (!columns.has(depth)) columns.set(depth, []);
        columns.get(depth).push(id);
      });
      const height = Math.max(164, Math.max(...[...columns.values()].map((ids) => ids.length)) * 112 + 60);
      for (const [depth, ids] of columns) ids.sort().forEach((id, index) => {
        positions[id] = { x: 54 + depth * 224, y: top + 48 + index * 112 };
      });
      branches.push({ ...branch, y: top, height, count: branch.skillIds.length });
      top += height + 12;
    }
    lanes.push({ subject: field, y, height: top - y + 8, branches });
    top += 28;
  }
  return { positions, lanes, width, height: Math.max(620, top) };
}
