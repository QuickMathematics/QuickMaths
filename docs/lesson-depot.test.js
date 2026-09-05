import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDepotSubmissionPrompt,
  compareVersions,
  createLessonDepot,
  filterDepotPackages,
  normalizeDepotCatalog,
  normalizeFederationIndex,
} from "./lesson-depot.js";

const catalog = {
  format: "quickmaths.lesson-depot.catalog",
  schema_version: "1.0",
  packages: [
    { id: "PACK_BIO", slug: "biology", version: "1.1.0", name: "Cell Biology", description: "Cells and systems", author: "Ada", license: "CC BY 4.0", lesson_path: "lessons/bio.json", subject_id: "SUBJECT_BIO", subject_name: "Biology", tags: ["cells"], skills: 2, problems: 8, updated_at: "2026-08-01", community: { votes: 4, comments: 2 } },
    { id: "PACK_MONEY", slug: "money", version: "1.0.0", name: "Money Maths", description: "Percentages", author: "Bo", license: "CC BY 4.0", lesson_path: "lessons/money.json", subject_id: "SUBJECT_MATH", subject_name: "Mathematics", tags: ["money"], skills: 1, problems: 5, updated_at: "2026-09-01", community: { votes: 9, comments: 1 } },
  ],
};

test("normalizes safe static catalog URLs and community data", () => {
  const result = normalizeDepotCatalog(catalog, { catalogUrl: "./lesson-depot/catalog.json", baseUrl: "https://example.com/app/" });
  assert.equal(result.packages[0].lessonUrl, "https://example.com/app/lesson-depot/lessons/bio.json");
  assert.equal(result.packages[0].discussionUrl, "https://github.com/QuickMathematics/QuickMaths/discussions");
  assert.equal(result.packages[1].votes, 9);
});

test("rejects duplicate identities and unsafe lesson URLs", () => {
  assert.throws(() => normalizeDepotCatalog({ ...catalog, packages: [catalog.packages[0], catalog.packages[0]] }, { baseUrl: "https://example.com/" }), /duplicate/);
  assert.throws(() => normalizeDepotCatalog({ ...catalog, packages: [{ ...catalog.packages[0], lesson_path: "javascript:alert(1)" }] }, { baseUrl: "https://example.com/" }), /invalid lesson URL/);
});

test("normalizes concept previews without inventing an install URL", () => {
  const preview = {
    ...catalog.packages[0],
    id: "PACK_PREVIEW_CELL_BIOLOGY",
    slug: "cell-biology",
    version: "0.0.0-preview.1",
    availability: "preview",
    lesson_path: undefined,
  };
  const result = normalizeDepotCatalog({ ...catalog, packages: [preview] }, { baseUrl: "https://example.com/" });
  assert.equal(result.packages[0].availability, "preview");
  assert.equal(result.packages[0].lessonUrl, "");
});

test("searches by subject, tag, and author and sorts predictably", () => {
  const packages = normalizeDepotCatalog(catalog, { baseUrl: "https://example.com/" }).packages;
  assert.deepEqual(filterDepotPackages(packages, { query: "cells" }).map((pack) => pack.id), ["PACK_BIO"]);
  assert.deepEqual(filterDepotPackages(packages, { subject: "SUBJECT_MATH" }).map((pack) => pack.id), ["PACK_MONEY"]);
  assert.deepEqual(filterDepotPackages(packages, { sort: "popular" }).map((pack) => pack.id), ["PACK_MONEY", "PACK_BIO"]);
  assert.deepEqual(filterDepotPackages(packages, { sort: "newest" }).map((pack) => pack.id), ["PACK_MONEY", "PACK_BIO"]);
});

test("popular ranking subtracts downvotes and ignores comment and source-status weights", () => {
  const packs = normalizeDepotCatalog(catalog, { baseUrl: "https://example.com/" }).packages;
  Object.assign(packs[0], { trust: "official", comments: 10000, downvotes: 0 });
  Object.assign(packs[1], { trust: "new", comments: 0, downvotes: 2 });
  assert.deepEqual(filterDepotPackages(packs).map((pack) => pack.id), ["PACK_MONEY", "PACK_BIO"]);
  packs[1].downvotes = 6;
  assert.deepEqual(filterDepotPackages(packs).map((pack) => pack.id), ["PACK_BIO", "PACK_MONEY"]);
  packs[1].downvotes = 5;
  assert.deepEqual(filterDepotPackages(packs).map((pack) => pack.id), ["PACK_BIO", "PACK_MONEY"]);
});

test("confirmed lesson reactions update ranking and persist after closing the discussion", async () => {
  const data = structuredClone(catalog);
  data.packages.forEach((pack, index) => { pack.community.discussion_url = `https://github.com/QuickMathematics/QuickMaths/discussions/${index + 1}`; });
  const depot = createLessonDepot({ store: {}, catalogUrl: "https://example.com/catalog.json", federationUrl: "", fetchImpl: async () => Response.json(data) });
  await depot.load();
  const url = data.packages[0].community.discussion_url;
  depot.updateDiscussionReactions(url, [{ content: "HEART", count: 15 }, { content: "CONFUSED", count: 3 }]);
  assert.deepEqual(filterDepotPackages(depot.snapshot().catalog.packages).map((pack) => pack.id), ["PACK_BIO", "PACK_MONEY"]);
  assert.equal(depot.snapshot().catalog.packages[0].downvotes, 3);
  depot.updateDiscussionReactions(url, null);
  assert.equal(depot.snapshot().catalog.packages[0].votes, 15);
  depot.updateDiscussionReactions("https://github.com/QuickMathematics/QuickMaths/discussions/99", [{ content: "HEART", count: 99 }]);
  assert.equal(depot.snapshot().catalog.packages[1].votes, 9);
  depot.updateDiscussionReactions(url, [{ content: "HEART", count: 15 }, { content: "THUMBS_DOWN", count: 20 }, { content: "EYES", count: 1000 }]);
  assert.equal(depot.snapshot().catalog.packages[0].moderationScore, -5);
  assert.deepEqual(filterDepotPackages(depot.snapshot().catalog.packages).map((pack) => pack.id), ["PACK_MONEY", "PACK_BIO"]);
});

test("compares common semantic versions", () => {
  assert.equal(compareVersions("1.2.0", "1.1.9"), 1);
  assert.equal(compareVersions("1.0.0", "2.0.0"), -1);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
});

test("controller previews before explicit install", async () => {
  const raw = JSON.stringify({ format: "quickmaths.lesson-set", id: "PACK_BIO", version: "1.1.0" });
  const store = {
    snapshot: () => ({ lessonPacks: [] }),
    previewLessonPack: () => ({ id: "PACK_BIO", version: "1.1.0", name: "Cell Biology", author: "Ada", subjectName: "Biology", skillCount: 2, problemCount: 8 }),
    importLessonPack: () => ({ ok: true, id: "PACK_BIO", name: "Cell Biology", subjectName: "Biology" }),
  };
  const fetchImpl = async (url) => url.endsWith("catalog.json")
    ? { ok: true, text: async () => JSON.stringify(catalog) }
    : { ok: true, text: async () => raw };
  let confirmations = 0;
  const depot = createLessonDepot({ store, fetchImpl, catalogUrl: "https://example.com/catalog.json", confirmInstall: () => { confirmations += 1; return true; } });
  await depot.load();
  await depot.previewPack("PACK_BIO", "1.1.0");
  assert.equal(confirmations, 0);
  const result = await depot.installPack("PACK_BIO", "1.1.0");
  assert.equal(confirmations, 1);
  assert.equal(result.installed, true);
});

test("controller refuses to fetch or stage metadata-only concept previews", async () => {
  const previewCatalog = {
    ...catalog,
    packages: [{
      ...catalog.packages[0],
      id: "PACK_PREVIEW_CELL_BIOLOGY",
      slug: "cell-biology",
      version: "0.0.0-preview.1",
      availability: "preview",
      lesson_path: undefined,
    }],
  };
  let lessonFetches = 0;
  const store = { snapshot: () => ({ lessonPacks: [] }) };
  const fetchImpl = async (url) => {
    if (url.endsWith("catalog.json")) return { ok: true, text: async () => JSON.stringify(previewCatalog) };
    lessonFetches += 1;
    throw new Error("Concept previews must never be fetched.");
  };
  const depot = createLessonDepot({ store, fetchImpl, catalogUrl: "https://example.com/catalog.json" });
  await depot.load();
  await assert.rejects(depot.previewPack("PACK_PREVIEW_CELL_BIOLOGY", "0.0.0-preview.1"), /concept preview/i);
  await assert.rejects(depot.stagePack("PACK_PREVIEW_CELL_BIOLOGY", "0.0.0-preview.1"), /concept preview/i);
  assert.equal(lessonFetches, 0);
});

test("Depot installation fails closed when a declared hash cannot be verified", async () => {
  const hashedCatalog = {
    ...catalog,
    packages: [{ ...catalog.packages[0], sha256: "0".repeat(64) }],
  };
  const store = {
    snapshot: () => ({ lessonPacks: [] }),
    previewLessonPack: () => ({ id: "PACK_BIO", version: "1.1.0" }),
  };
  const fetchImpl = async (url) => url.endsWith("catalog.json")
    ? { ok: true, text: async () => JSON.stringify(hashedCatalog) }
    : { ok: true, headers: { get: () => null }, text: async () => "{}" };
  const depot = createLessonDepot({ store, fetchImpl, cryptoImpl: null, catalogUrl: "https://example.com/catalog.json" });
  await depot.load();
  await assert.rejects(depot.previewPack("PACK_BIO", "1.1.0"), /cannot verify .* hash/i);
});

test("controller validates a Depot batch before opening one sequential human review queue", async () => {
  const raws = {
    PACK_BIO: JSON.stringify({ id: "PACK_BIO", version: "1.1.0", name: "Cell Biology", subjectName: "Biology", skillCount: 2, problemCount: 8 }),
    PACK_MONEY: JSON.stringify({ id: "PACK_MONEY", version: "1.0.0", name: "Money Maths", subjectName: "Mathematics", skillCount: 1, problemCount: 5 }),
  };
  let stagedRaws = [];
  const store = {
    snapshot: () => ({ lessonPacks: [] }),
    previewLessonPack(raw) { return JSON.parse(raw); },
    stageLessonPacks(rawItems) {
      stagedRaws = rawItems;
      return { ok: true, status: "staged", staged_count: rawItems.length, sequential_review: true, requires_human_confirmation: true, previews: rawItems.map((raw) => JSON.parse(raw)) };
    },
  };
  const fetchImpl = async (url) => {
    if (url.endsWith("catalog.json")) return { ok: true, text: async () => JSON.stringify(catalog) };
    const id = url.includes("bio.json") ? "PACK_BIO" : "PACK_MONEY";
    return { ok: true, text: async () => raws[id] };
  };
  const depot = createLessonDepot({ store, fetchImpl, catalogUrl: "https://example.com/catalog.json" });
  await depot.load();
  const result = await depot.stagePacks([
    { package_id: "PACK_BIO", version: "1.1.0" },
    { package_id: "PACK_MONEY", version: "1.0.0" },
  ]);
  assert.equal(result.staged_count, 2);
  assert.equal(result.sequential_review, true);
  assert.deepEqual(result.review_queue.map((item) => item.package_id), ["PACK_BIO", "PACK_MONEY"]);
  assert.equal(stagedRaws.length, 2);
  await assert.rejects(depot.stagePacks([
    { package_id: "PACK_BIO", version: "1.1.0" },
    { package_id: "PACK_BIO", version: "1.1.0" },
  ]), /duplicate package/i);
});

test("publishing prompt keeps validation and human approval in the flow", () => {
  const prompt = buildDepotSubmissionPrompt({ id: "PACK_BIO", name: "Cell Biology", version: "1.1.0" });
  assert.match(prompt, /federated QuickMaths Lesson Depot/);
  assert.match(prompt, /SHA-256 digest/);
  assert.match(prompt, /before creating the discussion/);
});

test("normalizes a federated registry index with immutable moderation overlays", () => {
  const commit = "a".repeat(40);
  const result = normalizeFederationIndex({
    format: "quickmaths.lesson-depot.federation",
    schema_version: "1.0",
    registries: [{
      id: "alice/learning",
      name: "Alice Learning",
      catalog_url: `https://raw.githubusercontent.com/alice/learning/${commit}/quickmaths-registry.json`,
      status: "new",
      packages: [{ id: "PACK_ALICE_BIO", version: "1.0.0", sha256: "b".repeat(64), status: "recommended", votes: 8, flags: 1 }],
    }],
  }, { federationUrl: "https://raw.githubusercontent.com/QuickMathematics/QuickMaths/main/docs/lesson-depot/federation.json" });
  assert.equal(result.registries[0].id, "alice/learning");
  assert.equal(result.registries[0].packages[0].status, "recommended");
  assert.equal(result.registries[0].packages[0].votes, 8);
  assert.throws(() => normalizeFederationIndex({
    format: "quickmaths.lesson-depot.federation",
    schema_version: "1.0",
    registries: [{ id: "alice/learning", name: "Alice Learning", catalog_url: "https://raw.githubusercontent.com/alice/learning/main/quickmaths-registry.json" }],
  }), /complete Git commit SHA/);
});

test("a pinned registry can reference a different immutable commit in the same repository", () => {
  const catalogCommit = "a".repeat(40);
  const lessonCommit = "b".repeat(40);
  const source = { id: "alice/learning", name: "Alice Learning", trust: "new", packages: [] };
  const candidate = {
    format: "quickmaths.lesson-depot.catalog",
    schema_version: "1.0",
    registry: { id: "alice/learning", name: "Alice Learning", namespace: "ALICE" },
    packages: [{ ...catalog.packages[0], id: "PACK_ALICE_BIO", version: "1.0.0", lesson_url: `https://raw.githubusercontent.com/alice/learning/${lessonCommit}/lesson.json`, sha256: "c".repeat(64) }],
  };
  const result = normalizeDepotCatalog(candidate, { catalogUrl: `https://raw.githubusercontent.com/alice/learning/${catalogCommit}/registry.json`, source, requireHashes: true });
  assert.equal(result.packages[0].lessonUrl.includes(lessonCommit), true);
  assert.throws(() => normalizeDepotCatalog({ ...candidate, packages: [{ ...candidate.packages[0], lesson_url: `https://raw.githubusercontent.com/mallory/other/${lessonCommit}/lesson.json` }] }, { catalogUrl: `https://raw.githubusercontent.com/alice/learning/${catalogCommit}/registry.json`, source, requireHashes: true }), /outside its registry repository/);
});

test("controller merges official and federated catalogs while isolating a failed source", async () => {
  const commit = "a".repeat(40);
  const federationUrl = "https://raw.githubusercontent.com/QuickMathematics/QuickMaths/main/docs/lesson-depot/federation.json";
  const registryUrl = `https://raw.githubusercontent.com/alice/learning/${commit}/quickmaths-registry.json`;
  const federation = {
    format: "quickmaths.lesson-depot.federation",
    schema_version: "1.0",
    registries: [
      { id: "alice/learning", name: "Alice Learning", catalog_url: registryUrl, status: "new", packages: [{ id: "PACK_ALICE_BIO", version: "1.0.0", sha256: "b".repeat(64), status: "recommended", votes: 5 }] },
      { id: "broken/feed", name: "Broken feed", catalog_url: `https://raw.githubusercontent.com/broken/feed/${commit}/registry.json`, status: "new", packages: [] },
    ],
  };
  const external = {
    format: "quickmaths.lesson-depot.catalog",
    schema_version: "1.0",
    registry: { id: "alice/learning", name: "Alice Learning", namespace: "ALICE" },
    packages: [{ ...catalog.packages[0], id: "PACK_ALICE_BIO", version: "1.0.0", lesson_path: "lesson.json", sha256: "b".repeat(64) }],
  };
  const fetchImpl = async (url) => {
    if (url === federationUrl) return { ok: true, text: async () => JSON.stringify(federation) };
    if (url === registryUrl) return { ok: true, text: async () => JSON.stringify(external) };
    if (url.includes("broken/feed")) return { ok: false, status: 404, text: async () => "" };
    if (url.includes("catalog.json")) return { ok: true, text: async () => JSON.stringify(catalog) };
    throw new Error(`Unexpected URL ${url}`);
  };
  const depot = createLessonDepot({ store: { snapshot: () => ({ lessonPacks: [] }) }, fetchImpl, catalogUrl: "https://example.com/catalog.json", federationUrl });
  const state = await depot.load();
  assert.equal(state.phase, "ready");
  assert.equal(state.catalog.packages.some((pack) => pack.id === "PACK_ALICE_BIO" && pack.trust === "recommended"), true);
  assert.equal(state.sources.find((source) => source.id === "broken/feed").available, false);
  assert.match(state.warnings.join(" "), /Broken feed/);
});

test("contested packages are hidden by default but can be deliberately revealed", () => {
  const packs = [{ ...normalizeDepotCatalog(catalog, { baseUrl: "https://example.com/" }).packages[0], trust: "contested" }];
  assert.equal(filterDepotPackages(packs).length, 0);
  assert.equal(filterDepotPackages(packs, { showContested: true }).length, 1);
});

test("direct registry subscriptions persist locally and remain removable", async () => {
  const commit = "c".repeat(40);
  const registryUrl = `https://raw.githubusercontent.com/bob/science/${commit}/quickmaths-registry.json`;
  const external = {
    format: "quickmaths.lesson-depot.catalog",
    schema_version: "1.0",
    registry: { id: "bob/science", name: "Bob Science", namespace: "BOB" },
    packages: [{ ...catalog.packages[0], id: "PACK_BOB_BIO", version: "1.0.0", lesson_path: "lesson.json", sha256: "d".repeat(64) }],
  };
  const values = new Map();
  const sourceStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const fetchImpl = async (url) => {
    if (url === registryUrl) return { ok: true, text: async () => JSON.stringify(external) };
    if (url.includes("catalog.json")) return { ok: true, text: async () => JSON.stringify(catalog) };
    throw new Error(`Unexpected URL ${url}`);
  };
  const depot = createLessonDepot({ store: { snapshot: () => ({ lessonPacks: [] }) }, fetchImpl, sourceStorage, catalogUrl: "https://example.com/catalog.json" });
  await depot.load();
  const added = await depot.addRegistry(registryUrl);
  assert.equal(added.id, "bob/science");
  assert.equal(depot.snapshot().catalog.packages.some((pack) => pack.id === "PACK_BOB_BIO" && pack.trust === "subscribed"), true);
  assert.match([...values.values()][0], /bob\/science/);
  await depot.removeRegistry("bob/science");
  assert.equal(depot.snapshot().catalog.packages.some((pack) => pack.id === "PACK_BOB_BIO"), false);
});

test("direct registry subscriptions discard URL secrets and reject credentials", async () => {
  const commit = "c".repeat(40);
  const registryUrl = `https://raw.githubusercontent.com/bob/science/${commit}/quickmaths-registry.json`;
  const external = {
    format: "quickmaths.lesson-depot.catalog",
    schema_version: "1.0",
    registry: { id: "bob/science", name: "Bob Science", namespace: "BOB" },
    packages: [{ ...catalog.packages[0], id: "PACK_BOB_BIO", version: "1.0.0", lesson_path: "lesson.json", sha256: "d".repeat(64) }],
  };
  const values = new Map();
  const sourceStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const fetchImpl = async (url) => {
    if (url === registryUrl) return { ok: true, text: async () => JSON.stringify(external) };
    if (url.includes("catalog.json")) return { ok: true, text: async () => JSON.stringify(catalog) };
    throw new Error(`Unexpected URL ${url}`);
  };
  const depot = createLessonDepot({ store: { snapshot: () => ({ lessonPacks: [] }) }, fetchImpl, sourceStorage, catalogUrl: "https://example.com/catalog.json" });

  await depot.addRegistry(`${registryUrl}?token=secret#section`);
  const saved = JSON.parse([...values.values()][0]);
  assert.equal(saved[0].catalogUrl, registryUrl);
  assert.doesNotMatch(JSON.stringify(saved), /secret|token/);
  await assert.rejects(
    () => depot.addRegistry(`https://user:pass@raw.githubusercontent.com/bob/science/${commit}/quickmaths-registry.json`),
    /Use a public GitHub/,
  );
});
