import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createQuickMathsStore } from "../docs/challenge-core.js";
import { createLessonDepot } from "../docs/lesson-depot.js";

const officialUrl = "https://quickmaths.test/official-catalog.json";
const federationUrl = "https://raw.githubusercontent.com/QuickMathematics/QuickMaths/main/docs/lesson-depot/federation.json";
const curriculum = JSON.parse(await readFile(new URL("../docs/curriculum-data.json", import.meta.url), "utf8"));
const officialCatalog = await readFile(new URL("../docs/lesson-depot/catalog.json", import.meta.url), "utf8");
const federationIndex = await readFile(new URL("../docs/lesson-depot/federation.json", import.meta.url), "utf8");

const values = new Map();
const storage = {
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) { values.set(key, String(value)); },
};
const fetchImpl = (url, request) => {
  if (String(url) === officialUrl) return Promise.resolve(new Response(officialCatalog, { status: 200, headers: { "content-type": "application/json" } }));
  if (String(url) === federationUrl) return Promise.resolve(new Response(federationIndex, { status: 200, headers: { "content-type": "application/json" } }));
  return fetch(url, request);
};
const store = createQuickMathsStore({ storage, curriculum });
const depot = createLessonDepot({ store, fetchImpl, sourceStorage: storage, catalogUrl: officialUrl, federationUrl });

await depot.load();
const depotState = depot.snapshot();
const source = depotState.sources.find((entry) => entry.id === "quickmathematics/qm_dev_depot");
assert.ok(source, `The external registry was not discovered from federation.json: ${depotState.warnings.join(" | ")}`);
assert.equal(source.available, true);
const found = await depot.search({ query: "", limit: 50 });
for (const id of ["PACK_GEOGRAPHY", "PACK_PROGRAMMING_FUNDAMENTALS"]) {
  const pack = found.find((entry) => entry.id === id);
  assert.ok(pack, `${id} was not discovered from the external registry.`);
  assert.equal(pack.source_id, "quickmathematics/qm_dev_depot");
  assert.equal(pack.trust, "new");
}

const staged = await depot.stagePacks([
  { id: "PACK_GEOGRAPHY", version: "1.0.0" },
  { id: "PACK_PROGRAMMING_FUNDAMENTALS", version: "1.2.0" },
]);
assert.equal(staged.staged_count, 2);
assert.deepEqual(staged.review_queue.map((entry) => entry.package_id), [
  "PACK_GEOGRAPHY",
  "PACK_PROGRAMMING_FUNDAMENTALS",
]);

console.log(JSON.stringify({
  registry: source.id,
  discovered: found.filter((entry) => ["PACK_GEOGRAPHY", "PACK_PROGRAMMING_FUNDAMENTALS"].includes(entry.id)).map((entry) => ({
    id: entry.id,
    version: entry.version,
    source: entry.source_id,
    trust: entry.trust,
  })),
  staged: staged.review_queue,
}, null, 2));
