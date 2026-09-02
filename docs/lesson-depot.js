const CATALOG_FORMAT = "quickmaths.lesson-depot.catalog";
const CATALOG_SCHEMA = "1.0";
const MAX_PACKAGES = 1000;
const DEFAULT_CARD_THEME = Object.freeze({
  paperLight: "#fffdf8", primary: "#153f36", primaryAlt: "#205c4e",
  tint: "#b8d9c9", highlight: "#dceca9", accent: "#df755b",
});
export const DEFAULT_DEPOT_CATALOG = "./lesson-depot/catalog.json?v=20260902-geography-depot-v2";
export const DEPOT_REPOSITORY_URL = "https://github.com/QuickMathematics/QuickMaths";
export const DEPOT_SUBMISSION_URL = `${DEPOT_REPOSITORY_URL}/issues/new?template=lesson-submission.yml`;
export const DEPOT_DISCUSSIONS_URL = `${DEPOT_REPOSITORY_URL}/discussions`;

function text(value, field, max = 500) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  if (value.length > max) throw new Error(`${field} is too long.`);
  return value.trim();
}

function optionalText(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeHttpUrl(value, base = "") {
  if (!value) return "";
  try {
    const url = new URL(value, base || undefined);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function cleanCount(value) {
  return Math.max(0, Math.min(1_000_000, Math.floor(Number(value) || 0)));
}

function normalizeCardTheme(value) {
  const candidate = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(DEFAULT_CARD_THEME).map(([key, fallback]) => [
    key,
    /^#[0-9a-f]{6}$/i.test(candidate[key] ?? "") ? candidate[key].toLowerCase() : fallback,
  ]));
}

export function normalizeDepotCatalog(input, { catalogUrl = DEFAULT_DEPOT_CATALOG, baseUrl = globalThis.location?.href ?? "https://example.invalid/" } = {}) {
  const candidate = typeof input === "string" ? JSON.parse(input) : input;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Lesson Depot catalog must be an object.");
  if (candidate.format !== CATALOG_FORMAT || candidate.schema_version !== CATALOG_SCHEMA) throw new Error("Unsupported Lesson Depot catalog format.");
  if (!Array.isArray(candidate.packages) || candidate.packages.length > MAX_PACKAGES) throw new Error("Lesson Depot catalog has an invalid package list.");
  const resolvedCatalogUrl = safeHttpUrl(catalogUrl, baseUrl);
  if (!resolvedCatalogUrl) throw new Error("Lesson Depot catalog URL is invalid.");
  const seen = new Set();
  const packages = candidate.packages.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`Catalog package ${index + 1} is invalid.`);
    const id = text(entry.id, `Package ${index + 1} ID`, 60);
    const version = text(entry.version, `${id} version`, 40);
    const key = `${id}@${version}`;
    if (seen.has(key)) throw new Error(`Catalog contains duplicate ${key}.`);
    seen.add(key);
    const availability = entry.availability === "preview" ? "preview" : "published";
    const lessonUrl = availability === "preview" ? "" : safeHttpUrl(entry.lesson_url || entry.lesson_path, resolvedCatalogUrl);
    if (availability === "published" && !lessonUrl) throw new Error(`${id} has an invalid lesson URL.`);
    const community = entry.community && typeof entry.community === "object" ? entry.community : {};
    const discussionUrl = safeHttpUrl(community.discussion_url, resolvedCatalogUrl) || DEPOT_DISCUSSIONS_URL;
    return {
      id,
      slug: text(entry.slug, `${id} slug`, 80),
      version,
      name: text(entry.name, `${id} name`, 160),
      description: optionalText(entry.description, 1000),
      author: text(entry.author, `${id} author`, 160),
      license: text(entry.license, `${id} license`, 120),
      subjectId: optionalText(entry.subject_id, 60) || "SUBJECT_MATH",
      subjectName: optionalText(entry.subject_name, 160) || "Mathematics",
      theme: normalizeCardTheme(entry.subject_theme),
      tags: Array.isArray(entry.tags) ? entry.tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim().slice(0, 40)).filter(Boolean).slice(0, 20) : [],
      skills: cleanCount(entry.skills),
      problems: cleanCount(entry.problems),
      publishedAt: optionalText(entry.published_at, 20),
      updatedAt: optionalText(entry.updated_at, 20),
      availability,
      lessonUrl,
      sha256: /^[a-f0-9]{64}$/i.test(entry.sha256 ?? "") ? entry.sha256.toLowerCase() : "",
      votes: cleanCount(community.votes),
      comments: cleanCount(community.comments),
      discussionUrl,
    };
  });
  return { format: CATALOG_FORMAT, schemaVersion: CATALOG_SCHEMA, catalogUrl: resolvedCatalogUrl, packages };
}

function versionParts(value) {
  return String(value).split(/[.+-]/).slice(0, 3).map((part) => Number(part) || 0);
}

export function compareVersions(left, right) {
  const a = versionParts(left); const b = versionParts(right);
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  return String(left).localeCompare(String(right));
}

export function filterDepotPackages(packages, { query = "", sort = "popular", subject = "all" } = {}) {
  const needle = query.trim().toLowerCase();
  const filtered = packages.filter((pack) => {
    if (subject !== "all" && pack.subjectId !== subject) return false;
    if (!needle) return true;
    return [pack.name, pack.description, pack.author, pack.subjectName, pack.slug, ...pack.tags].join(" ").toLowerCase().includes(needle);
  });
  return filtered.sort((a, b) => {
    if (sort === "newest") return String(b.updatedAt || b.publishedAt).localeCompare(String(a.updatedAt || a.publishedAt)) || a.name.localeCompare(b.name);
    if (sort === "name") return a.name.localeCompare(b.name);
    return (b.votes - a.votes) || (b.comments - a.comments) || a.name.localeCompare(b.name);
  });
}

export function buildDepotSubmissionPrompt(pack = null) {
  const packContext = pack ? `I have a validated QuickMaths lesson-set file for ${pack.name} (${pack.id} v${pack.version}). ` : "I have a validated QuickMaths lesson-set JSON file. ";
  return `${packContext}Help me submit it to the public QuickMaths Lesson Depot at ${DEPOT_REPOSITORY_URL}. Create a fork or branch, place it under docs/lesson-depot/lessons/<slug>/<version>/lesson-set.json, add metadata.json with author, content license, tags, and dates, run the Lesson Depot builder and the full test suite, then open a pull request. Do not alter the lesson answer keys, IDs, prerequisites, or grading rules without asking me. Show me the final validation result and ask before publishing the pull request.`;
}

async function sha256(raw) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") return "";
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createLessonDepot({ store, fetchImpl = globalThis.fetch?.bind(globalThis), showToast = () => {}, onChange = () => {}, catalogUrl = DEFAULT_DEPOT_CATALOG, confirmInstall = (message) => globalThis.confirm?.(message) ?? false } = {}) {
  if (!store || typeof fetchImpl !== "function") throw new Error("Lesson Depot needs a store and fetch implementation.");
  const state = { phase: "idle", error: "", catalog: null, query: "", sort: "popular", subject: "all", preview: null, installingId: "" };
  const emit = () => onChange(snapshot());
  const snapshot = () => ({ ...state, catalog: state.catalog ? { ...state.catalog, packages: state.catalog.packages.map((pack) => ({ ...pack })) } : null, preview: state.preview ? { ...state.preview, pack: { ...state.preview.pack } } : null });

  const load = async ({ force = false } = {}) => {
    if (!force && ["loading", "ready"].includes(state.phase)) return snapshot();
    state.phase = "loading"; state.error = ""; emit();
    try {
      const response = await fetchImpl(catalogUrl, { cache: force ? "reload" : "default" });
      if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`);
      state.catalog = normalizeDepotCatalog(await response.json(), { catalogUrl, baseUrl: globalThis.location?.href });
      state.phase = "ready";
    } catch (error) {
      state.phase = "error"; state.error = error instanceof Error ? error.message : String(error);
    }
    emit(); return snapshot();
  };

  const fetchPack = async (pack) => {
    if (pack.availability === "preview") throw new Error(`${pack.name} is a concept preview. Installable lesson content has not been published yet.`);
    const response = await fetchImpl(pack.lessonUrl, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Lesson download failed (${response.status}).`);
    const raw = await response.text();
    if (pack.sha256) {
      const actual = await sha256(raw);
      if (actual && actual !== pack.sha256) throw new Error("Lesson file hash does not match the reviewed Depot catalog.");
    }
    const preview = store.previewLessonPack(raw);
    if (preview.id !== pack.id || preview.version !== pack.version) throw new Error("Lesson file identity does not match its Depot listing.");
    return { raw, preview };
  };

  const previewPack = async (id, version) => {
    const pack = state.catalog?.packages.find((item) => item.id === id && item.version === version);
    if (!pack) throw new Error("Lesson package was not found in the current catalog.");
    try {
      const result = await fetchPack(pack);
      state.preview = { pack, preview: result.preview, raw: result.raw };
      showToast(`${pack.name} passed local validation.`); emit(); return result.preview;
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); throw error; }
  };

  const installPack = async (id, version) => {
    const pack = state.catalog?.packages.find((item) => item.id === id && item.version === version);
    if (!pack) throw new Error("Lesson package was not found in the current catalog.");
    const installed = store.snapshot().lessonPacks.find((item) => item.id === pack.id);
    if (installed) { showToast(`${pack.name} is already installed.`); return { ok: true, installed: false }; }
    state.installingId = pack.id; emit();
    try {
      const result = state.preview?.pack.id === id && state.preview?.pack.version === version
        ? { raw: state.preview.raw, preview: state.preview.preview }
        : await fetchPack(pack);
      const accepted = confirmInstall(`Install ${result.preview.name} from the Lesson Depot?\n\n${result.preview.skillCount} lessons · ${result.preview.problemCount} questions · ${result.preview.subjectName}\nAuthor: ${result.preview.author}\nLicense: ${pack.license}\n\nThe file passed QuickMaths validation and will be included in progress backups.`);
      if (!accepted) return { ok: true, installed: false };
      const installedResult = store.importLessonPack(result.raw);
      state.preview = null;
      showToast(`${installedResult.name} installed.`);
      return { ...installedResult, installed: true };
    } finally { state.installingId = ""; emit(); }
  };

  const search = async ({ query = "", subject = "all", sort = "popular", limit = 20 } = {}) => {
    if (state.phase !== "ready") await load();
    if (state.phase !== "ready") throw new Error(state.error || "Lesson Depot catalog is unavailable.");
    return filterDepotPackages(state.catalog.packages, { query, subject, sort }).slice(0, Math.max(1, Math.min(50, Number(limit) || 20))).map((pack) => ({
      id: pack.id, name: pack.name, version: pack.version, description: pack.description, author: pack.author,
      license: pack.license, subject_id: pack.subjectId, subject_name: pack.subjectName, tags: [...pack.tags],
      skill_count: pack.skills, problem_count: pack.problems, votes: pack.votes, comments: pack.comments, availability: pack.availability,
    }));
  };

  const stagePack = async (id, version) => {
    if (state.phase !== "ready") await load();
    if (state.phase !== "ready") throw new Error(state.error || "Lesson Depot catalog is unavailable.");
    const pack = state.catalog?.packages.find((item) => item.id === id && item.version === version);
    if (!pack) throw new Error("Lesson package was not found in the current catalog.");
    if (store.snapshot().lessonPacks.some((item) => item.id === id)) throw new Error(`${pack.name} is already installed.`);
    const result = await fetchPack(pack);
    return store.stageLessonPack(result.raw, { activityActor: "agent" });
  };

  const stagePacks = async (requests) => {
    if (!Array.isArray(requests) || requests.length < 2) throw new Error("A batch must contain at least two Lesson Depot packages.");
    if (requests.length > 20) throw new Error("A batch can contain at most 20 Lesson Depot packages.");
    if (state.phase !== "ready") await load();
    if (state.phase !== "ready") throw new Error(state.error || "Lesson Depot catalog is unavailable.");
    const seen = new Set();
    const installedIds = new Set(store.snapshot().lessonPacks.map((item) => item.id));
    const selected = [];
    const alreadyInstalled = [];
    for (const request of requests) {
      const id = String(request?.id ?? request?.package_id ?? "").trim();
      const version = String(request?.version ?? "").trim();
      const key = `${id}@${version}`;
      if (seen.has(key)) throw new Error(`The batch contains duplicate package ${key}.`);
      seen.add(key);
      const pack = state.catalog.packages.find((item) => item.id === id && item.version === version);
      if (!pack) throw new Error(`Lesson package ${key} was not found in the current catalog.`);
      if (pack.availability === "preview") throw new Error(`${pack.name} is a concept preview. Installable lesson content has not been published yet.`);
      if (installedIds.has(id)) alreadyInstalled.push({ id, version, name: pack.name });
      else selected.push(pack);
    }
    if (!selected.length) throw new Error("Every requested Lesson Depot package is already installed.");
    const downloaded = [];
    for (const pack of selected) downloaded.push({ pack, ...(await fetchPack(pack)) });
    const staged = store.stageLessonPacks(downloaded.map((item) => item.raw), { activityActor: "agent" });
    return {
      ...staged,
      requested_count: requests.length,
      staged_count: downloaded.length,
      already_installed: alreadyInstalled,
      review_queue: downloaded.map(({ pack, preview }, index) => ({
        position: index + 1,
        package_id: pack.id,
        version: pack.version,
        name: preview.name,
        subject_name: preview.subjectName,
        skill_count: preview.skillCount,
        problem_count: preview.problemCount,
      })),
    };
  };

  const setFilters = ({ query = state.query, sort = state.sort, subject = state.subject } = {}, { notify = true } = {}) => {
    state.query = String(query).slice(0, 120); state.sort = ["popular", "newest", "name"].includes(sort) ? sort : "popular"; state.subject = String(subject).slice(0, 60) || "all";
    if (notify) emit();
  };

  const closePreview = () => { state.preview = null; emit(); };

  return { snapshot, load, previewPack, installPack, search, stagePack, stagePacks, setFilters, closePreview };
}
