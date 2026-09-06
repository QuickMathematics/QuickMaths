// Merge complete records, rather than mixing fields inside a lesson or attempt.
// This keeps assessment definitions and saved answers internally consistent.
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value ?? {}, key);
const get = (value, key) => own(value, key) ? value[key] : undefined;
const set = (value, key, item) => Object.defineProperty(value, key, { value: item, enumerable: true, configurable: true, writable: true });
const keyedArrays = { profiles: "id", curricula: "id", lessonPacks: "id", attempts: "attemptId", reviews: "reviewId" };
const labels = { profiles: "Profile", curricula: "Curriculum", lessonPacks: "Lesson set", attempts: "Attempt", reviews: "Review", progress: "Progress", drafts: "Unfinished test", mapPlans: "Mastery map plan", stagedLessonPacks: "Lesson approval queue", activity: "Activity history", ui: "Pending test result" };
const navigationActivity = new Set(["select_profile", "logout_profile", "navigate_learning_app", "export_progress_backup"]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

export function comparableWorkspace(raw) {
  const state = typeof raw === "string" ? JSON.parse(raw) : clone(raw);
  for (const key of ["syncedAt", "exportedAt", "session", "backup", "activeProfileId", "app", "transport"]) delete state[key];
  if (state.ui) state.ui = { pendingResults: state.ui.pendingResults ?? null };
  for (const profile of state.profiles ?? []) {
    delete profile.totalLoggedSeconds;
    delete profile.agentActivityAt;
  }
  if (state.activity) state.activity = state.activity.filter((item) => !navigationActivity.has(item.tool));
  for (const [key, id] of Object.entries(keyedArrays)) {
    if (Array.isArray(state[key])) state[key].sort((a, b) => String(a[id]).localeCompare(String(b[id])));
  }
  return state;
}

export const workspaceSignature = (raw) => JSON.stringify(canonical(comparableWorkspace(raw)));
export const sameWorkspace = (a, b) => workspaceSignature(a) === workspaceSignature(b);

// Session state stays on this device. Elapsed time must never go backwards just
// because an agent spent time on an older mirrored copy.
export function preserveDeviceState(raw, localRaw, otherRaw = null) {
  const result = typeof raw === "string" ? JSON.parse(raw) : clone(raw);
  const local = typeof localRaw === "string" ? JSON.parse(localRaw) : localRaw;
  const other = otherRaw ? (typeof otherRaw === "string" ? JSON.parse(otherRaw) : otherRaw) : {};
  for (const key of ["session", "backup", "syncedAt", "app", "transport"]) if (own(local, key)) result[key] = clone(local[key]);
  if (local.ui) result.ui = { ...clone(local.ui), pendingResults: result.ui?.pendingResults ?? null };
  if (result.stagedLessonPacks?.length) result.ui = { ...result.ui, route: "settings" };
  const profiles = result.profiles ?? [];
  if (profiles.some((p) => p.id === local.activeProfileId)) result.activeProfileId = local.activeProfileId;
  else if (!profiles.some((p) => p.id === result.activeProfileId)) result.activeProfileId = profiles[0]?.id ?? null;
  for (const profile of profiles) {
    const times = [profile, ...(local.profiles ?? []), ...(other.profiles ?? [])].filter((p) => p.id === profile.id).map((p) => p.totalLoggedSeconds).filter(Number.isFinite);
    if (times.length) profile.totalLoggedSeconds = Math.max(...times);
    const activityTimes = [profile, ...(local.profiles ?? []), ...(other.profiles ?? [])].filter((p) => p.id === profile.id).map((p) => p.agentActivityAt).filter(Boolean).sort();
    if (activityTimes.length) profile.agentActivityAt = activityTimes.at(-1);
  }
  if (local.activity || result.activity) {
    const activity = new Map([...(result.activity ?? []), ...(local.activity ?? []).filter((item) => navigationActivity.has(item.tool))].map((item) => [JSON.stringify(item), item]));
    result.activity = [...activity.values()].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }
  return JSON.stringify(result);
}

export function createWorkspaceMerge({ baseJson = null, localJson, remoteJson }) {
  const base = baseJson === null ? undefined : comparableWorkspace(baseJson);
  const local = comparableWorkspace(localJson);
  const remote = comparableWorkspace(remoteJson);
  const rows = [];
  const names = new Map([...(remote.profiles ?? []), ...(local.profiles ?? [])].map((p) => [p.id, p.displayName]));
  function walk(b, l, r, path) {
    if (equal(l, r)) return { value: clone(l) };
    const section = path[0];
    if (path.length === 0 || (["progress", "drafts"].includes(section) && path.length < 3) || (section === "mapPlans" && path.length === 1)) {
      if (object(l) && object(r) && (b === undefined || object(b))) {
        const keys = [...new Set([...Object.keys(l), ...Object.keys(r), ...Object.keys(b ?? {})])];
        return { children: keys.map((key) => [key, walk(get(b, key), get(l, key), get(r, key), [...path, key])]) };
      }
    }
    const id = path.length === 1 ? keyedArrays[section] : null;
    if (id && [l, r, b ?? []].every((items) => Array.isArray(items) && items.every((item) => object(item) && typeof item[id] === "string") && new Set(items.map((item) => item[id])).size === items.length)) {
      const ids = [...new Set([...l, ...r, ...(b ?? [])].map((item) => item[id]))];
      return { array: ids.map((key) => walk(b?.find((item) => item[id] === key), l.find((item) => item[id] === key), r.find((item) => item[id] === key), [...path, key])) };
    }
    const localChanged = base === undefined || !equal(l, b);
    const remoteChanged = base === undefined || !equal(r, b);
    const row = {
      id: String(rows.length), path,
      label: [labels[section] ?? section, ...path.slice(1).map((key) => names.get(key) || key), (l ?? r)?.name].filter(Boolean).join(" · "),
      base: clone(b), local: clone(l), remote: clone(r),
      localExists: l !== undefined, remoteExists: r !== undefined,
      conflict: localChanged && remoteChanged,
      suggested: localChanged && remoteChanged ? null : localChanged ? "local" : "remote",
    };
    rows.push(row);
    return { row };
  }
  const tree = walk(base, local, remote, []);
  function resolve(choices = {}) {
    function build(node) {
      if (node.row) {
        const choice = choices[node.row.id] ?? node.row.suggested;
        if (!["local", "remote"].includes(choice)) throw new Error(`Choose which version to keep for ${node.row.label}.`);
        return clone(node.row[choice]);
      }
      if (node.array) return node.array.map(build).filter((item) => item !== undefined);
      if (node.children) {
        const value = {};
        for (const [key, child] of node.children) {
          const item = build(child);
          if (item !== undefined) set(value, key, item);
        }
        return value;
      }
      return clone(node.value);
    }
    return preserveDeviceState(build(tree), localJson, remoteJson);
  }
  return { rows, hasBase: base !== undefined, resolve };
}
