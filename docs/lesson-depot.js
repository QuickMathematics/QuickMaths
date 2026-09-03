import { fetchTextLimited } from "./safe-fetch.js?v=20260902-python-v1";

const CATALOG_FORMAT = "quickmaths.lesson-depot.catalog";
const CATALOG_SCHEMA = "1.0";
const FEDERATION_FORMAT = "quickmaths.lesson-depot.federation";
const FEDERATION_SCHEMA = "1.0";
const MAX_PACKAGES = 1000;
const MAX_REGISTRIES = 40;
const MAX_CATALOG_BYTES = 500_000;
const REGISTRY_STORAGE_KEY = "quickmaths.lesson-depot.registries.v1";
const DEFAULT_CARD_THEME = Object.freeze({
  paperLight: "#fffdf8", primary: "#153f36", primaryAlt: "#205c4e",
  tint: "#b8d9c9", highlight: "#dceca9", accent: "#df755b",
});
export const DEFAULT_DEPOT_CATALOG = "./lesson-depot/catalog.json?v=20260902-geography-depot-v2";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
export const DEFAULT_DEPOT_FEDERATION = LOCAL_HOSTS.has(globalThis.location?.hostname)
  ? "./lesson-depot/federation.json?v=20260903-federation-v1"
  : "https://raw.githubusercontent.com/QuickMathematics/QuickMaths/main/docs/lesson-depot/federation.json";
export const DEPOT_REPOSITORY_URL = "https://github.com/QuickMathematics/QuickMaths";
export const DEPOT_SUBMISSION_URL = `${DEPOT_REPOSITORY_URL}/discussions/new?category=show-and-tell`;
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

function canonicalRegistryUrl(value, base = globalThis.location?.href ?? "https://example.invalid/") {
  if (!value) return "";
  try {
    let url = new URL(String(value).trim(), base);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) return "";
    if (url.username || url.password) return "";
    if (url.hostname.toLowerCase() === "github.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length < 5 || parts[2] !== "blob") return "";
      url = new URL(`https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${parts.slice(3).join("/")}`);
    }
    const hostname = url.hostname.toLowerCase();
    const baseUrl = new URL(base);
    const allowed = hostname === "raw.githubusercontent.com"
      || hostname.endsWith(".github.io")
      || hostname === baseUrl.hostname.toLowerCase()
      || ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
    if (!allowed) return "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch { return ""; }
}

function sameRegistryBoundary(lessonUrl, catalogUrl) {
  try {
    const lesson = new URL(lessonUrl);
    const catalog = new URL(catalogUrl);
    if (lesson.username || lesson.password) return false;
    if (lesson.origin !== catalog.origin) {
      if (!catalog.hostname.toLowerCase().endsWith(".github.io") || lesson.hostname.toLowerCase() !== "raw.githubusercontent.com") return false;
      const catalogOwner = catalog.hostname.slice(0, -".github.io".length).toLowerCase();
      const catalogRepo = catalog.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
      const lessonParts = lesson.pathname.split("/").filter(Boolean);
      return lessonParts.length >= 4 && lessonParts[0].toLowerCase() === catalogOwner && lessonParts[1].toLowerCase() === catalogRepo;
    }
    if (catalog.hostname.toLowerCase() !== "raw.githubusercontent.com") return true;
    const lessonParts = lesson.pathname.split("/").filter(Boolean);
    const catalogParts = catalog.pathname.split("/").filter(Boolean);
    return lessonParts.length >= 4
      && catalogParts.length >= 4
      && lessonParts.slice(0, 2).join("/").toLowerCase() === catalogParts.slice(0, 2).join("/").toLowerCase();
  } catch { return false; }
}

function immutableCommunityLessonUrl(value) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    return url.protocol === "https:"
      && url.hostname.toLowerCase() === "raw.githubusercontent.com"
      && parts.length >= 4
      && /^[a-f0-9]{40}$/i.test(parts[2]);
  } catch { return false; }
}

function immutableRegistryUrl(value) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    return url.protocol === "https:"
      && url.hostname.toLowerCase() === "raw.githubusercontent.com"
      && parts.length >= 4
      && /^[a-f0-9]{40}$/i.test(parts[2]);
  } catch { return false; }
}

function registryKey(url) {
  let hash = 2166136261;
  for (const character of url) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `registry-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function safeStorageGet(storage, key) {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

function safeStorageSet(storage, key, value) {
  try { storage?.setItem(key, value); } catch { /* A registry subscription is a best-effort local preference. */ }
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

export function normalizeDepotCatalog(input, {
  catalogUrl = DEFAULT_DEPOT_CATALOG,
  baseUrl = globalThis.location?.href ?? "https://example.invalid/",
  source = null,
  requireHashes = false,
} = {}) {
  const candidate = typeof input === "string" ? JSON.parse(input) : input;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Lesson Depot catalog must be an object.");
  if (candidate.format !== CATALOG_FORMAT || candidate.schema_version !== CATALOG_SCHEMA) throw new Error("Unsupported Lesson Depot catalog format.");
  if (!Array.isArray(candidate.packages) || candidate.packages.length > MAX_PACKAGES) throw new Error("Lesson Depot catalog has an invalid package list.");
  const resolvedCatalogUrl = safeHttpUrl(catalogUrl, baseUrl);
  if (!resolvedCatalogUrl) throw new Error("Lesson Depot catalog URL is invalid.");
  const registry = candidate.registry && typeof candidate.registry === "object" && !Array.isArray(candidate.registry) ? candidate.registry : {};
  const sourceId = optionalText(source?.id, 100) || optionalText(registry.id, 100) || "quickmaths-official";
  const sourceName = optionalText(source?.name, 160) || optionalText(registry.name, 160) || "QuickMaths Official";
  const sourceTrust = ["official", "recommended", "new", "subscribed", "contested"].includes(source?.trust) ? source.trust : "official";
  const sourceHomepage = safeHttpUrl(source?.homepageUrl ?? registry.homepage_url, resolvedCatalogUrl);
  const moderationItems = Array.isArray(source?.packages) ? source.packages : [];
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
    if (availability === "published" && sourceTrust !== "official" && !sameRegistryBoundary(lessonUrl, resolvedCatalogUrl)) {
      throw new Error(`${id} points outside its registry repository.`);
    }
    if (availability === "published" && sourceTrust !== "official" && !immutableCommunityLessonUrl(lessonUrl)) {
      throw new Error(`${id} must use a raw GitHub lesson URL pinned to a complete commit SHA.`);
    }
    const digest = /^[a-f0-9]{64}$/i.test(entry.sha256 ?? "") ? entry.sha256.toLowerCase() : "";
    if (availability === "published" && requireHashes && !digest) throw new Error(`${id} must publish a SHA-256 digest.`);
    const moderation = moderationItems.find((item) => item?.id === id && item?.version === version && (!item.sha256 || item.sha256 === digest)) ?? {};
    const trust = availability === "preview" ? "preview" : sourceTrust === "official"
      ? "official"
      : sourceTrust === "contested"
        ? "contested"
        : ["recommended", "new", "subscribed", "contested"].includes(moderation.status) ? moderation.status : sourceTrust;
    const community = entry.community && typeof entry.community === "object" ? entry.community : {};
    const discussionUrl = safeHttpUrl(moderation.discussion_url, resolvedCatalogUrl)
      || (sourceTrust === "official" ? safeHttpUrl(community.discussion_url, resolvedCatalogUrl) : "")
      || safeHttpUrl(source?.discussionUrl, resolvedCatalogUrl)
      || (sourceTrust === "official" ? DEPOT_DISCUSSIONS_URL : "");
    const votes = sourceTrust === "official" ? cleanCount(community.votes) : cleanCount(moderation.votes);
    const flags = sourceTrust === "official" ? 0 : cleanCount(moderation.flags);
    const comments = sourceTrust === "official" ? cleanCount(community.comments) : cleanCount(moderation.comments);
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
      sha256: digest,
      votes,
      flags,
      comments,
      discussionUrl,
      trust,
      sourceId,
      sourceName,
      sourceHomepage,
      sourceCatalogUrl: resolvedCatalogUrl,
      moderationScore: Math.max(-1_000_000, votes - (flags * 2)),
    };
  });
  return {
    format: CATALOG_FORMAT,
    schemaVersion: CATALOG_SCHEMA,
    catalogUrl: resolvedCatalogUrl,
    registry: { id: sourceId, name: sourceName, homepageUrl: sourceHomepage, trust: sourceTrust },
    packages,
  };
}

export function normalizeFederationIndex(input, { federationUrl = DEFAULT_DEPOT_FEDERATION, baseUrl = globalThis.location?.href ?? "https://example.invalid/" } = {}) {
  const candidate = typeof input === "string" ? JSON.parse(input) : input;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Lesson Depot federation index must be an object.");
  if (candidate.format !== FEDERATION_FORMAT || candidate.schema_version !== FEDERATION_SCHEMA) throw new Error("Unsupported Lesson Depot federation format.");
  if (!Array.isArray(candidate.registries) || candidate.registries.length > MAX_REGISTRIES) throw new Error("Lesson Depot federation has an invalid registry list.");
  const resolvedFederationUrl = canonicalRegistryUrl(federationUrl, baseUrl);
  if (!resolvedFederationUrl) throw new Error("Lesson Depot federation URL is invalid.");
  const seen = new Set();
  const registries = candidate.registries.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`Federated registry ${index + 1} is invalid.`);
    const id = text(entry.id, `Registry ${index + 1} ID`, 100);
    if (!/^[a-z0-9][a-z0-9._/-]{2,99}$/i.test(id) || seen.has(id.toLowerCase())) throw new Error(`Federated registry ${id} has an invalid or duplicate ID.`);
    seen.add(id.toLowerCase());
    const catalogUrl = canonicalRegistryUrl(entry.catalog_url, resolvedFederationUrl);
    if (!catalogUrl) throw new Error(`Federated registry ${id} has an unsupported catalog URL.`);
    if (!immutableRegistryUrl(catalogUrl)) throw new Error(`Federated registry ${id} is not pinned to a complete Git commit SHA.`);
    const status = ["recommended", "new", "contested"].includes(entry.status) ? entry.status : "new";
    const packages = Array.isArray(entry.packages) ? entry.packages.slice(0, 200).map((item) => ({
      id: optionalText(item?.id, 60),
      version: optionalText(item?.version, 40),
      sha256: /^[a-f0-9]{64}$/i.test(item?.sha256 ?? "") ? item.sha256.toLowerCase() : "",
      status: ["recommended", "new", "contested"].includes(item?.status) ? item.status : status,
      votes: cleanCount(item?.votes),
      flags: cleanCount(item?.flags),
      comments: cleanCount(item?.comments),
      discussion_url: safeHttpUrl(item?.discussion_url, resolvedFederationUrl),
    })).filter((item) => item.id && item.version && item.sha256) : [];
    return {
      id,
      name: text(entry.name, `${id} name`, 160),
      catalogUrl,
      homepageUrl: safeHttpUrl(entry.homepage_url, resolvedFederationUrl),
      discussionUrl: safeHttpUrl(entry.discussion_url, resolvedFederationUrl),
      submittedBy: optionalText(entry.submitted_by, 100),
      trust: status,
      status,
      packages,
    };
  });
  return { format: FEDERATION_FORMAT, schemaVersion: FEDERATION_SCHEMA, federationUrl: resolvedFederationUrl, registries };
}

function versionParts(value) {
  return String(value).split(/[.+-]/).slice(0, 3).map((part) => Number(part) || 0);
}

export function compareVersions(left, right) {
  const a = versionParts(left); const b = versionParts(right);
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  return String(left).localeCompare(String(right));
}

export function filterDepotPackages(packages, { query = "", sort = "popular", subject = "all", showContested = false } = {}) {
  const needle = query.trim().toLowerCase();
  const filtered = packages.filter((pack) => {
    if (!showContested && pack.trust === "contested") return false;
    if (subject !== "all" && pack.subjectId !== subject) return false;
    if (!needle) return true;
    return [pack.name, pack.description, pack.author, pack.subjectName, pack.slug, ...pack.tags].join(" ").toLowerCase().includes(needle);
  });
  return filtered.sort((a, b) => {
    if (sort === "newest") return String(b.updatedAt || b.publishedAt).localeCompare(String(a.updatedAt || a.publishedAt)) || a.name.localeCompare(b.name);
    if (sort === "name") return a.name.localeCompare(b.name);
    const trustWeight = (pack) => ({ official: 4, recommended: 3, new: 2, subscribed: 1, contested: 0, preview: -1 }[pack.trust] ?? 0);
    return (trustWeight(b) - trustWeight(a)) || (b.moderationScore - a.moderationScore) || (b.comments - a.comments) || a.name.localeCompare(b.name);
  });
}

export function buildDepotSubmissionPrompt(pack = null) {
  const packContext = pack ? `I have a validated QuickMaths lesson-set file for ${pack.name} (${pack.id} v${pack.version}). ` : "I have a validated QuickMaths lesson-set JSON file. ";
  return `${packContext}Help me publish it through the federated QuickMaths Lesson Depot. Create or use my own public GitHub repository. First commit the final versioned lesson file and record its complete commit SHA. Then generate a quickmaths.lesson-depot.catalog registry whose lesson URL points to that immutable content commit, with a SHA-256 digest and GitHub-owner namespace; validate the complete package and graph; commit the registry; and pin the registry URL to this second commit. Finally open a [Registry] discussion at ${DEPOT_DISCUSSIONS_URL} containing the machine-readable registry URL so the automatic federation check can list it. Do not alter lesson answer keys, IDs, prerequisites, or grading rules without asking me. Show me the validation result and exact public files before creating the discussion.`;
}

async function sha256(raw, cryptoImpl) {
  if (!cryptoImpl?.subtle || typeof TextEncoder === "undefined") throw new Error("This browser cannot verify the Lesson Depot file hash. Installation was stopped.");
  const digest = await cryptoImpl.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createLessonDepot({
  store,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  cryptoImpl = globalThis.crypto,
  showToast = () => {},
  onChange = () => {},
  catalogUrl = DEFAULT_DEPOT_CATALOG,
  federationUrl = "",
  sourceStorage = null,
  confirmInstall = (message) => globalThis.confirm?.(message) ?? false,
} = {}) {
  if (!store || typeof fetchImpl !== "function") throw new Error("Lesson Depot needs a store and fetch implementation.");
  const readSubscriptions = () => {
    try {
      const raw = JSON.parse(safeStorageGet(sourceStorage, REGISTRY_STORAGE_KEY) ?? "[]");
      if (!Array.isArray(raw)) return [];
      const seen = new Set();
      return raw.slice(0, MAX_REGISTRIES).map((entry) => {
        const url = canonicalRegistryUrl(entry?.catalogUrl ?? entry?.catalog_url);
        if (!url || seen.has(url)) return null;
        seen.add(url);
        return { id: optionalText(entry?.id, 100) || registryKey(url), name: optionalText(entry?.name, 160) || "Subscribed registry", catalogUrl: url, homepageUrl: "", discussionUrl: "", trust: "subscribed", status: "subscribed", packages: [], subscription: true };
      }).filter(Boolean);
    } catch { return []; }
  };
  let subscriptions = readSubscriptions();
  const state = {
    phase: "idle", error: "", warnings: [], catalog: null, sources: [], query: "", sort: "popular", subject: "all",
    showContested: false, preview: null, installingId: "",
  };
  const emit = () => onChange(snapshot());
  const snapshot = () => ({
    ...state,
    warnings: [...state.warnings],
    sources: state.sources.map((source) => ({ ...source })),
    catalog: state.catalog ? { ...state.catalog, packages: state.catalog.packages.map((pack) => ({ ...pack })) } : null,
    preview: state.preview ? { ...state.preview, pack: { ...state.preview.pack } } : null,
  });

  const fetchCatalog = async (source) => {
    const { text: raw } = await fetchTextLimited(fetchImpl, source.catalogUrl, {
      maximumBytes: MAX_CATALOG_BYTES,
      label: `${source.name} registry`,
      request: { cache: "no-cache" },
    });
    const parsed = JSON.parse(raw);
    const declared = parsed?.registry;
    if (source.trust !== "official" && (!declared || typeof declared !== "object" || !String(declared.id ?? "").trim() || !String(declared.name ?? "").trim())) {
      throw new Error(`${source.name} does not declare its registry identity.`);
    }
    const effectiveSource = source.subscription ? {
      ...source,
      id: text(declared.id, "Registry ID", 100),
      name: text(declared.name, "Registry name", 160),
      homepageUrl: safeHttpUrl(declared.homepage_url, source.catalogUrl),
    } : source;
    const normalized = normalizeDepotCatalog(parsed, {
      catalogUrl: source.catalogUrl,
      baseUrl: globalThis.location?.href,
      source: effectiveSource,
      requireHashes: source.trust !== "official",
    });
    return normalized;
  };

  const mergeCatalogs = (catalogs) => {
    const selected = new Map();
    const collisions = [];
    for (const catalog of catalogs) {
      for (const pack of catalog.packages) {
        const prior = selected.get(pack.id);
        if (!prior) { selected.set(pack.id, pack); continue; }
        if (prior.sourceId !== pack.sourceId) {
          if (prior.trust === "official") { collisions.push(`${pack.sourceName}: ${pack.id} conflicts with an official package.`); continue; }
          if (pack.trust === "official") { selected.set(pack.id, pack); collisions.push(`${prior.sourceName}: ${pack.id} conflicts with an official package.`); continue; }
          collisions.push(`${pack.sourceName}: ${pack.id} is already claimed by ${prior.sourceName}.`);
          continue;
        }
        if (compareVersions(pack.version, prior.version) > 0) selected.set(pack.id, pack);
      }
    }
    return { packages: [...selected.values()], collisions };
  };

  const load = async ({ force = false } = {}) => {
    if (!force && ["loading", "ready"].includes(state.phase)) return snapshot();
    state.phase = "loading"; state.error = ""; state.warnings = []; emit();
    try {
      const officialSource = { id: "quickmaths-official", name: "QuickMaths Official", catalogUrl: safeHttpUrl(catalogUrl, globalThis.location?.href), homepageUrl: DEPOT_REPOSITORY_URL, discussionUrl: DEPOT_DISCUSSIONS_URL, trust: "official", status: "official", packages: [], subscription: false };
      let federated = [];
      if (federationUrl) {
        try {
          const { text: raw } = await fetchTextLimited(fetchImpl, federationUrl, { maximumBytes: MAX_CATALOG_BYTES, label: "Lesson Depot federation index", request: { cache: force ? "reload" : "no-cache" } });
          federated = normalizeFederationIndex(raw, { federationUrl, baseUrl: globalThis.location?.href }).registries;
        } catch (error) {
          state.warnings.push(`Community federation: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      const uniqueSources = [];
      const sourceUrls = new Set();
      for (const source of [officialSource, ...federated, ...subscriptions]) {
        if (!source.catalogUrl || sourceUrls.has(source.catalogUrl)) continue;
        sourceUrls.add(source.catalogUrl);
        uniqueSources.push(source);
      }
      const catalogs = [];
      state.sources = [];
      for (const source of uniqueSources) {
        try {
          const normalized = await fetchCatalog(source);
          catalogs.push(normalized);
          state.sources.push({ ...source, packageCount: normalized.packages.length, available: true, error: "" });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          state.sources.push({ ...source, packageCount: 0, available: false, error: message });
          if (source.trust === "official") throw error;
          state.warnings.push(`${source.name}: ${message}`);
        }
      }
      const merged = mergeCatalogs(catalogs);
      state.warnings.push(...merged.collisions);
      state.catalog = { format: CATALOG_FORMAT, schemaVersion: CATALOG_SCHEMA, catalogUrl, packages: merged.packages };
      state.phase = "ready";
    } catch (error) {
      state.phase = "error"; state.error = error instanceof Error ? error.message : String(error);
    }
    emit(); return snapshot();
  };

  const fetchPack = async (pack) => {
    if (pack.availability === "preview") throw new Error(`${pack.name} is a concept preview. Installable lesson content has not been published yet.`);
    const { text: raw } = await fetchTextLimited(fetchImpl, pack.lessonUrl, { maximumBytes: 2_000_000, label: "Lesson file", request: { cache: "no-cache" } });
    if (pack.sha256) {
      const actual = await sha256(raw, cryptoImpl);
      if (actual !== pack.sha256) throw new Error("Lesson file hash does not match the reviewed Depot catalog.");
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
      const trustLabel = ({ official: "Official", recommended: "Community recommended", new: "New and unreviewed", subscribed: "Directly subscribed", contested: "Community contested" }[pack.trust] ?? "Unreviewed");
      const accepted = confirmInstall(`Install ${result.preview.name} from the Lesson Depot?\n\n${result.preview.skillCount} lessons · ${result.preview.problemCount} questions · ${result.preview.subjectName}\nAuthor: ${result.preview.author}\nSource: ${pack.sourceName} · ${trustLabel}\nLicense: ${pack.license}\n\nThe exact file passed SHA-256 and QuickMaths validation and will be included in progress backups.`);
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
      skill_count: pack.skills, problem_count: pack.problems, votes: pack.votes, flags: pack.flags, comments: pack.comments, availability: pack.availability,
      trust: pack.trust, source_id: pack.sourceId, source_name: pack.sourceName, source_url: pack.sourceHomepage,
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

  const setFilters = ({ query = state.query, sort = state.sort, subject = state.subject, showContested = state.showContested } = {}, { notify = true } = {}) => {
    state.query = String(query).slice(0, 120); state.sort = ["popular", "newest", "name"].includes(sort) ? sort : "popular"; state.subject = String(subject).slice(0, 60) || "all"; state.showContested = showContested === true;
    if (notify) emit();
  };

  const addRegistry = async (value) => {
    const url = canonicalRegistryUrl(value);
    if (!url) throw new Error("Use a public GitHub or GitHub Pages registry URL.");
    if (subscriptions.some((entry) => entry.catalogUrl === url)) throw new Error("That lesson registry is already subscribed.");
    const temporary = { id: registryKey(url), name: "Subscribed registry", catalogUrl: url, homepageUrl: "", discussionUrl: "", trust: "subscribed", status: "subscribed", packages: [], subscription: true };
    const catalog = await fetchCatalog(temporary);
    temporary.id = optionalText(catalog.registry.id, 100) || temporary.id;
    temporary.name = optionalText(catalog.registry.name, 160) || temporary.name;
    temporary.homepageUrl = catalog.registry.homepageUrl;
    if (subscriptions.some((entry) => entry.id.toLowerCase() === temporary.id.toLowerCase())) throw new Error("A registry with that identity is already subscribed.");
    subscriptions = [...subscriptions, temporary].slice(0, MAX_REGISTRIES);
    safeStorageSet(sourceStorage, REGISTRY_STORAGE_KEY, JSON.stringify(subscriptions.map(({ id, name, catalogUrl }) => ({ id, name, catalogUrl }))));
    await load({ force: true });
    showToast(`${temporary.name} added to the Lesson Depot.`);
    return { id: temporary.id, name: temporary.name, catalog_url: temporary.catalogUrl, package_count: catalog.packages.length };
  };

  const removeRegistry = async (id) => {
    const source = subscriptions.find((entry) => entry.id === id);
    if (!source) throw new Error("That subscribed registry was not found.");
    subscriptions = subscriptions.filter((entry) => entry.id !== id);
    safeStorageSet(sourceStorage, REGISTRY_STORAGE_KEY, JSON.stringify(subscriptions.map(({ id: sourceId, name, catalogUrl: url }) => ({ id: sourceId, name, catalogUrl: url }))));
    if (state.preview?.pack.sourceId === id) state.preview = null;
    await load({ force: true });
    showToast(`${source.name} removed from this device.`);
    return { ok: true, id };
  };

  const closePreview = () => { state.preview = null; emit(); };

  return { snapshot, load, previewPack, installPack, search, stagePack, stagePacks, setFilters, addRegistry, removeRegistry, closePreview };
}
