import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDepotSubmissionPrompt,
  compareVersions,
  createLessonDepot,
  filterDepotPackages,
  normalizeDepotCatalog,
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
  assert.equal(result.packages[0].discussionUrl, "https://github.com/Srednjak/QuickMaths/discussions");
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

test("compares common semantic versions", () => {
  assert.equal(compareVersions("1.2.0", "1.1.9"), 1);
  assert.equal(compareVersions("1.0.0", "2.0.0"), -1);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
});

test("controller previews before explicit install", async () => {
  const raw = JSON.stringify({ format: "quickmaths.lesson-set", id: "PACK_BIO" });
  const store = {
    snapshot: () => ({ lessonPacks: [] }),
    previewLessonPack: () => ({ id: "PACK_BIO", version: "1.1.0", name: "Cell Biology", author: "Ada", subjectName: "Biology", skillCount: 2, problemCount: 8 }),
    importLessonPack: () => ({ ok: true, id: "PACK_BIO", name: "Cell Biology", subjectName: "Biology" }),
  };
  const fetchImpl = async (url) => url.endsWith("catalog.json")
    ? { ok: true, json: async () => catalog }
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
    if (url.endsWith("catalog.json")) return { ok: true, json: async () => previewCatalog };
    lessonFetches += 1;
    throw new Error("Concept previews must never be fetched.");
  };
  const depot = createLessonDepot({ store, fetchImpl, catalogUrl: "https://example.com/catalog.json" });
  await depot.load();
  await assert.rejects(depot.previewPack("PACK_PREVIEW_CELL_BIOLOGY", "0.0.0-preview.1"), /concept preview/i);
  await assert.rejects(depot.stagePack("PACK_PREVIEW_CELL_BIOLOGY", "0.0.0-preview.1"), /concept preview/i);
  assert.equal(lessonFetches, 0);
});

test("publishing prompt keeps validation and human approval in the flow", () => {
  const prompt = buildDepotSubmissionPrompt({ id: "PACK_BIO", name: "Cell Biology", version: "1.1.0" });
  assert.match(prompt, /run the Lesson Depot builder and the full test suite/);
  assert.match(prompt, /ask before publishing/);
});
