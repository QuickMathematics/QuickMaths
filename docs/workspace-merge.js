// Three-way merge by meaningful changes. Coordinates, assessment questions,
// attempts and unfinished tests remain intact; independent edits can coexist.
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
  state.ui = { pendingResults: state.ui?.pendingResults ?? null };
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

const words = (value) => String(value).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const fieldNames = { displayName: "Name", status: "Mastery level", masteryScore: "Mastery score", body: "Note", skillIds: "Linked lessons", hiddenSkillIds: "Hidden lessons", enabledPackIds: "Enabled lesson sets", theory: "Lesson text", progressionMode: "Learning path", activeSubjectId: "Selected field", subject: "Field", subjectId: "Field", subdomain: "Branch", mapScope: "Map scope", nextReviewAt: "Next review", pendingResults: "Pending test result" };
const fieldName = (key) => get(fieldNames, key) ?? words(key);
const recordId = (item) => item?.id ?? item?.attemptId ?? item?.reviewId ?? item?.template_id ?? item?.pack?.id ?? item?.path;
function valueAt(state, path) {
  return path.reduce((value, key) => Array.isArray(value) ? value.find((item) => recordId(item) === key) : get(value, key), state);
}
const uniqueRecords = (items, id) => Array.isArray(items) && items.every((item) => object(item) && typeof id(item) === "string") && new Set(items.map(id)).size === items.length;

export function createWorkspaceMerge({ baseJson = null, localJson, remoteJson, skillNames = {} }) {
  const base = baseJson === null ? undefined : comparableWorkspace(baseJson);
  const local = comparableWorkspace(localJson);
  const remote = comparableWorkspace(remoteJson);
  const rows = [];
  const names = new Map(Object.entries(skillNames));
  for (const state of [base, remote, local].filter(Boolean)) {
    for (const item of [...(state.profiles ?? []), ...(state.curricula ?? []), ...(state.lessonPacks ?? []), ...(state.lessonPacks ?? []).flatMap((pack) => pack.skills ?? [])]) names.set(item.id, item.displayName ?? item.name ?? item.id);
    for (const item of state.attempts ?? []) if (item.skillName && !names.has(item.skillId)) names.set(item.skillId, item.skillName);
    for (const plan of [...Object.values(state.mapPlans ?? {}), ...(state.curricula ?? []).map((item) => item.mapPlan)].filter(Boolean)) for (const item of plan.paths ?? []) names.set(item.id, item.name);
  }
  const name = (id) => names.get(id) || fieldName(id);
  const planPath = (path) => path[0] === "mapPlans" ? path.slice(2) : path[0] === "curricula" && path[2] === "mapPlan" ? path.slice(3) : null;
  const textValue = (value, key = "") => {
    if (value === undefined) return "Not present";
    if (value === null || value === "") return "None";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) return value.length ? value.map((item) => textValue(item, key)).join("; ") : "None";
    if (object(value)) return Object.entries(value).filter(([k]) => !["id", "createdAt", "updatedAt"].includes(k)).map(([k, v]) => `${fieldName(k)}: ${textValue(v, k)}`).join(" · ") || "Empty";
    return names.has(value) || /Ids?$/.test(key) ? name(value) : String(value);
  };
  function details(before, after, prefix = "") {
    if (equal(before, after)) return [];
    if ([before, after].every((v) => v === undefined || object(v) && Number.isFinite(v.x) && Number.isFinite(v.y)) && [before, after].some(object)) {
      const position = (v) => v ? `(${v.x}, ${v.y})` : "Automatic position";
      return [{ label: prefix || "Position", before: position(before), after: position(after) }];
    }
    if ([before, after].some((v) => Array.isArray(v) && v.some(object)) && [before, after].every((v) => v === undefined || Array.isArray(v))) {
      return Array.from({ length: Math.max(before?.length ?? 0, after?.length ?? 0) }, (_, i) => details(before?.[i], after?.[i], `${prefix} · Item ${i + 1}`)).flat();
    }
    if ((object(before) || object(after)) && [before, after].every((v) => v === undefined || object(v))) {
      return [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter((key) => !["id", "createdAt", "updatedAt", "targetType", "data_base64"].includes(key)).flatMap((key) => details(get(before, key), get(after, key), [prefix, fieldName(key)].filter(Boolean).join(" · ")));
    }
    return [{ label: prefix || "Value", before: textValue(before), after: textValue(after) }];
  }
  function describe(path, before, after) {
    const record = after ?? before;
    const pp = planPath(path);
    const context = ["profiles", "curricula", "mapPlans", "progress", "drafts", "lessonPacks"].includes(path[0]) && path.length > 1 ? name(path[1]) : record?.profileId ? name(record.profileId) : "Workspace";
    let subject = [get(labels, path[0]) ?? fieldName(path[0]), ...path.slice(1).map(name)].join(" · ");
    let title;
    if (path.at(-1) === "order") {
      title = `Changed ${pp?.[0] === "paths" ? "map path" : pp?.[0] === "annotations" ? "map note" : path.at(-2) === "skills" ? "lesson" : "question"} order`;
    } else if (pp?.[0] === "layouts" && pp.length === 3) {
      subject = name(pp[2]);
      title = `${after === undefined ? "Reset position of" : before === undefined ? "Positioned" : "Moved"} ${subject}`;
    } else if (pp?.[0] === "annotations") {
      const annotationPath = path.slice(0, path.length - pp.length + 2);
      const note = valueAt(local, annotationPath) ?? valueAt(remote, annotationPath) ?? valueAt(base, annotationPath);
      subject = note?.skillIds?.length ? `note on ${note.skillIds.map(name).join(", ")}` : "map note";
      title = `${pp.length === 2 ? before === undefined ? "Added" : after === undefined ? "Removed" : "Edited" : pp[2] === "positions" ? "Moved" : "Changed"} ${subject}${pp.length > 2 && pp[2] !== "positions" ? ` · ${fieldName(pp[2])}` : ""}`;
    } else if (pp?.[0] === "paths") {
      const pathRecord = path.slice(0, path.length - pp.length + 2);
      const item = valueAt(local, pathRecord) ?? valueAt(remote, pathRecord) ?? valueAt(base, pathRecord);
      subject = `path “${item?.name || "Untitled"}”`;
      title = `${before === undefined ? "Added" : after === undefined ? "Removed" : "Changed"} ${subject}${pp.length > 2 ? ` · ${fieldName(pp[2])}` : ""}`;
    } else if (pp?.[0] === "hiddenSkillIds" && pp.length === 2) {
      title = `${after ? "Hid" : "Showed"} ${name(pp[1])} on the map`;
    } else {
      if (["progress", "drafts"].includes(path[0]) && path.length >= 3) subject = `${name(path[2])} · ${path[0] === "progress" ? "Progress" : "Unfinished test"}${path.length > 3 ? ` · ${fieldName(path.at(-1))}` : ""}`;
      else if (path[0] === "lessonPacks" && path[2] === "skills") {
        subject = `Lesson · ${name(path[3])}${path.length > 4 ? ` · ${path.slice(4).map(fieldName).join(" · ")}` : ""}`;
        if (["problems", "native_templates"].includes(path.at(-2))) subject = `Question in ${name(path[3])} · ${record?.prompt || record?.name || name(path.at(-1))}`;
      }
      else if (path[0] === "lessonPacks" && path[2] === "assets") subject = `Media file · ${path[3]}`;
      else if (["attempts", "reviews"].includes(path[0]) && path.length === 2) {
        const attempt = path[0] === "attempts" ? record : [...(local.attempts ?? []), ...(remote.attempts ?? [])].find((a) => a.attemptId === record?.attemptId);
        subject = `${path[0] === "attempts" ? "Test attempt" : "Feedback"} · ${attempt?.skillName || name(attempt?.skillId || "lesson")}${record?.completedAt || record?.createdAt ? ` · ${record.completedAt || record.createdAt}` : ""}`;
      } else if (path[0] === "stagedLessonPacks" && path.length === 2) subject = `Lesson approval · ${record?.pack?.name || name(path[1])}`;
      title = `${before === undefined ? "Added" : after === undefined ? "Removed" : "Changed"} ${subject}`;
    }
    return { title, context: [context, pp?.[0] === "layouts" ? pp[1] === "all-subjects" ? "All fields map" : name(pp[1].replace(/^subject:/, "")) : null].filter(Boolean).join(" · "), preview: pp?.[0] === "annotations" && pp.length === 2 ? record?.body : null, details: details(before, after, path.length > 2 && !object(record) ? fieldName(path.at(-1)) : "") };
  }
  function atomic(b, l, r, path) {
    const localChanged = base === undefined || !equal(l, b);
    const remoteChanged = base === undefined || !equal(r, b);
    const conflict = localChanged && remoteChanged && !equal(l, r);
    const row = {
      id: String(rows.length), path,
      label: describe(path, b, l ?? r).title,
      base: clone(b), local: clone(l), remote: clone(r),
      localExists: l !== undefined, remoteExists: r !== undefined,
      conflict, suggested: conflict ? null : localChanged ? "local" : "remote",
      changes: (equal(l, r) ? ["both"] : [localChanged && "local", remoteChanged && "remote"].filter(Boolean)).map((side) => ({ side: side === "both" ? "local" : side, source: side, ...describe(path, base === undefined ? (side === "local" ? r : l) : b, side === "remote" ? r : l) })),
    };
    rows.push(row);
    return { row };
  }
  function walk(b, l, r, path) {
    if (equal(l, r) && (base === undefined || equal(l, b))) return { value: clone(l) };
    const section = path[0];
    // Activity is an audit trail, not another competing copy of the user's work.
    if (section === "activity" && path.length === 1 && [b, l, r].every((v) => v === undefined || Array.isArray(v))) {
      return { value: [...new Map([...(l ?? []), ...(r ?? [])].map((item) => [JSON.stringify(canonical(item)), clone(item)])).values()].sort((a, c) => String(a.at).localeCompare(String(c.at))) };
    }
    const pp = planPath(path);
    const last = path.at(-1);
    // Absent map/progress containers have no content of their own. Compare their
    // children so two newly positioned nodes still get two checkboxes. Actual
    // record deletion remains atomic below.
    const container = (section === "mapPlans" && path.length <= 2) || (["progress", "drafts"].includes(section) && path.length <= 2) || (pp && (pp.length === 0 || pp[0] === "layouts" && pp.length <= 2 || pp[0] === "annotations" && pp[2] === "positions" && pp.length === 3));
    if (container && b === undefined && [l, r].every((v) => v === undefined || object(v)) && [l, r].some(object) && (!object(l) || !object(r))) {
      return { omitEmpty: true, children: [...new Set([...Object.keys(l ?? {}), ...Object.keys(r ?? {})])].map((key) => [key, walk(undefined, get(l, key), get(r, key), [...path, key])]) };
    }
    const keyField = path.length === 1 ? get(keyedArrays, section) : pp?.length === 1 && ["annotations", "paths"].includes(last) ? "id" : section === "lessonPacks" && last === "skills" ? "id" : section === "lessonPacks" && last === "assets" ? "path" : section === "lessonPacks" && ["problems", "native_templates"].includes(last) ? (last === "problems" ? "template_id" : "id") : null;
    const id = keyField ? (item) => get(item, keyField) : section === "stagedLessonPacks" && path.length === 1 ? (item) => item?.pack?.id : null;
    if (id && [l, r, b ?? []].every((items) => uniqueRecords(items, id))) {
      const ids = [...new Set([...l, ...r, ...(b ?? [])].map(id))];
      const common = new Set((b ?? l).map(id).filter((key) => l.some((item) => id(item) === key) && r.some((item) => id(item) === key)));
      const order = (items) => (items ?? []).map(id).filter((key) => common.has(key));
      const reordered = base === undefined ? !equal(order(l), order(r)) : !equal(order(b), order(l)) || !equal(order(b), order(r));
      return { array: ids.map((key) => walk(b?.find((item) => id(item) === key), l.find((item) => id(item) === key), r.find((item) => id(item) === key), [...path, key])), ...(reordered ? { order: atomic(order(b), order(l), order(r), [...path, "order"]), id } : {}) };
    }
    if ((pp?.length === 1 && last === "hiddenSkillIds" || section === "curricula" && last === "enabledPackIds") && [l, r, b ?? []].every((items) => Array.isArray(items) && items.every((item) => typeof item === "string"))) {
      return { members: [...new Set([...l, ...r, ...(b ?? [])])].map((key) => [key, walk(b?.includes(key) ?? false, l.includes(key), r.includes(key), [...path, key])]) };
    }
    const intact = (["attempts", "reviews", "stagedLessonPacks"].includes(section) && path.length === 2) || (section === "drafts" && path.length === 3) || (pp?.[0] === "layouts" && pp.length === 3) || (pp?.[0] === "annotations" && pp[2] === "positions" && pp.length === 4) || (section === "lessonPacks" && ["problems", "native_templates", "assets"].includes(path.at(-2)));
    if (!intact && object(l) && object(r) && (b === undefined || object(b))) {
      // An added/deleted record is one choice. Existing records are compared by
      // field; this preserves delete-versus-edit conflicts and required IDs.
      const newRecord = base !== undefined && b === undefined && (path.length === 2 && ["profiles", "curricula", "lessonPacks"].includes(section) || section === "progress" && path.length === 3 || pp?.length === 2 && ["annotations", "paths"].includes(pp[0]) || section === "lessonPacks" && path.at(-2) === "skills");
      if (!newRecord) {
        const keys = [...new Set([...Object.keys(l), ...Object.keys(r), ...Object.keys(b ?? {})])];
        const timestamp = keys.includes("updatedAt");
        const groups = section === "progress" && path.length === 3 ? { mastery: ["status", "masteryScore"], testHistory: ["lastTestScore", "bestTestScore", "attemptCount", "lastAttemptAt"] } : {};
        const grouped = new Set(Object.values(groups).flat());
        const children = keys.filter((key) => key !== "updatedAt" && !grouped.has(key)).map((key) => [key, walk(get(b, key), get(l, key), get(r, key), [...path, key])]);
        for (const [group, fields] of Object.entries(groups)) {
          const pick = (v) => Object.fromEntries(fields.filter((key) => own(v, key)).map((key) => [key, v[key]]));
          const values = [b, l, r].map(pick);
          children.push([null, equal(values[1], values[2]) && (base === undefined || equal(values[0], values[1])) ? { value: values[1] } : atomic(...values, [...path, group])]);
        }
        return { children, ...(timestamp ? { timestamp: { base: b, latest: [b?.updatedAt, l.updatedAt, r.updatedAt].filter(Boolean).sort().at(-1) } } : {}) };
      }
    }
    return atomic(b, l, r, path);
  }
  const tree = walk(base, local, remote, []);
  function resolve(choices = {}) {
    function build(node) {
      if (node.row) {
        const choice = choices[node.row.id] ?? node.row.suggested;
        if (!["local", "remote", ...(base !== undefined ? ["base"] : [])].includes(choice)) throw new Error(`Choose which change to keep for ${node.row.label}.`);
        return clone(node.row[choice]);
      }
      if (node.array) {
        const items = node.array.map(build).filter((item) => item !== undefined);
        if (!node.order) return items;
        const order = build(node.order);
        const ordered = order.map((key) => items.find((item) => node.id(item) === key)).filter(Boolean);
        return items.map((item) => order.includes(node.id(item)) ? ordered.shift() : item);
      }
      if (node.members) return node.members.filter(([, child]) => build(child)).map(([key]) => key);
      if (node.children) {
        const value = {};
        for (const [key, child] of node.children) {
          const item = build(child);
          if (key === null) { for (const [field, entry] of Object.entries(item ?? {})) set(value, field, entry); }
          else if (item !== undefined) set(value, key, item);
        }
        if (node.timestamp) {
          const original = clone(node.timestamp.base);
          if (original) delete original.updatedAt;
          const stamp = equal(value, original) ? node.timestamp.base?.updatedAt : node.timestamp.latest;
          if (stamp !== undefined) set(value, "updatedAt", stamp);
        }
        if (node.omitEmpty && !Object.keys(value).length) return undefined;
        return value;
      }
      return clone(node.value);
    }
    return preserveDeviceState(build(tree), localJson, remoteJson);
  }
  return { rows, hasBase: base !== undefined, resolve };
}
