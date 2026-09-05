import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import { createQuickMathsStore } from "./challenge-core.js";
import { createLessonDepot } from "./lesson-depot.js";
import { validateFederatedReleases } from "../scripts/federated_depot_core.mjs";

const curriculum = JSON.parse(readFileSync(new URL("./curriculum-data.json", import.meta.url), "utf8"));
const example = JSON.parse(readFileSync(new URL("./lesson-set-example.json", import.meta.url), "utf8"));
const catalogUrl = "https://example.com/catalog.json";
const registryUrl = `https://raw.githubusercontent.com/alice/lessons/${"a".repeat(40)}/registry.json`;
const federationUrl = "https://raw.githubusercontent.com/QuickMathematics/QuickMaths/main/docs/lesson-depot/federation.json";
const appSource = readFileSync(new URL("./challenge.js", import.meta.url), "utf8");

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}

function lesson(suffix, version = "1.0.0", prerequisite = "MATH_ARITH_001") {
  const pack = structuredClone(example);
  const skillId = `CUSTOM_ALICE_${suffix}`;
  pack.id = `PACK_ALICE_${suffix}`; pack.version = version; pack.name = `Lesson ${suffix}`;
  pack.track = { id: `TRACK_ALICE_${suffix}`, name: pack.name, skills: [skillId], entry_skills: [skillId], exit_skills: [skillId] };
  pack.skills[0].id = skillId; pack.skills[0].prerequisites = [prerequisite];
  pack.skills[0].problems.forEach((problem, index) => { problem.skill_id = skillId; problem.template_id = `${skillId}_Q${index}`; });
  return pack;
}

function listing(pack, lessonUrl = `https://raw.githubusercontent.com/alice/lessons/${"b".repeat(40)}/${pack.id}/${pack.version}.json`) {
  return { id: pack.id, version: pack.version, slug: pack.id.toLowerCase(), name: pack.name, author: "Alice", license: "CC BY 4.0", lesson_url: lessonUrl, sha256: createHash("sha256").update(JSON.stringify(pack)).digest("hex") };
}

function catalog(packages, registry = null) {
  return { format: "quickmaths.lesson-depot.catalog", schema_version: "1.0", packages, ...(registry ? { registry } : {}) };
}

function harness(packs, options = {}) {
  const files = new Map([[catalogUrl, catalog(packs.map((pack) => listing(pack)))]]);
  packs.forEach((pack) => files.set(listing(pack).lesson_url, pack));
  const requests = [];
  const store = createQuickMathsStore({ curriculum, storage: memoryStorage() });
  const fetchImpl = async (url) => {
    requests.push(url);
    assert.ok(files.has(url), `Unexpected URL ${url}`);
    const value = await files.get(url);
    return value instanceof Response ? value : new Response(typeof value === "string" ? value : JSON.stringify(value));
  };
  const depot = createLessonDepot({ store, fetchImpl, cryptoImpl: webcrypto, catalogUrl, sourceStorage: memoryStorage(), confirmInstall: () => true, ...options });
  return { store, depot, files, requests, fetchImpl };
}

test("Depot stages dependent packages as one validated batch without installing them", async () => {
  const first = lesson("A"), second = lesson("B", "1.0.0", "CUSTOM_ALICE_A");
  const { store, depot } = harness([first, second]);
  const result = await depot.stagePacks([first, second]);
  assert.equal(result.staged_count, 2);
  assert.deepEqual(result.review_queue.map((entry) => entry.package_id), [first.id, second.id]);
  assert.equal(store.snapshot().lessonPacks.length, 0);
  assert.equal(store.snapshot().stagedLessonPack.id, first.id);
  store.installStagedLessonPack();
  assert.equal(store.snapshot().lessonPacks.length, 1);
  assert.equal(store.snapshot().stagedLessonPack.id, second.id);
  store.installStagedLessonPack();
  assert.equal(store.snapshot().lessonPacks.length, 2);
});

test("batch failures preserve the workspace and do not leave a partial queue", async () => {
  const first = lesson("A"), second = lesson("B", "1.0.0", "CUSTOM_ALICE_MISSING");
  const { store, depot, files } = harness([first, second]);
  await assert.rejects(depot.stagePacks([first, second]), /missing prerequisite/);
  assert.equal(store.snapshot().stagedLessonPack, null);
  second.skills[0].prerequisites = ["MATH_ARITH_001"];
  files.set(catalogUrl, catalog([listing(first), { ...listing(second), id: "PACK_ALICE_WRONG" }]));
  await depot.load({ force: true });
  await assert.rejects(depot.stagePacks([first, { id: "PACK_ALICE_WRONG", version: second.version }]), /identity does not match/);
  assert.equal(store.snapshot().stagedLessonPack, null);
  assert.equal(store.snapshot().lessonPacks.length, 0);
});

test("search and staging await the catalog load already in progress", async () => {
  const pack = lesson("A");
  const { store, depot, files, requests } = harness([pack]);
  const gate = deferred();
  files.set(catalogUrl, gate.promise);
  const loading = depot.load();
  const searching = depot.search({ query: "Lesson A" });
  const staging = depot.stagePack(pack.id, pack.version);
  await Promise.resolve();
  assert.equal(depot.snapshot().phase, "loading");
  gate.resolve(catalog([listing(pack)]));
  const [, matches, staged] = await Promise.all([loading, searching, staging]);
  assert.equal(matches[0].id, pack.id);
  assert.equal(staged.staged_count, 1);
  assert.equal(store.snapshot().lessonPacks.length, 0);
  assert.equal(requests.filter((url) => url === catalogUrl).length, 1);
});

test("a subscription added during loading is included by the queued refresh", async () => {
  const { depot, files } = harness([]);
  const gate = deferred(), pack = lesson("A");
  files.set(catalogUrl, gate.promise);
  files.set(registryUrl, catalog([listing(pack)], { id: "alice/lessons", name: "Alice Lessons" }));
  const loading = depot.load();
  await Promise.resolve();
  const adding = depot.addRegistry(registryUrl);
  gate.resolve(catalog([]));
  await Promise.all([loading, adding]);
  assert.equal((await depot.search())[0].id, pack.id);
});

test("catalog refresh invalidates cached lesson previews before installation", async () => {
  const pack = lesson("A");
  const { store, depot, files } = harness([pack]);
  await depot.load(); await depot.previewPack(pack.id, pack.version);
  const updated = structuredClone(pack);
  updated.skills[0].theory = "Corrected lesson explanation.";
  files.set(catalogUrl, catalog([listing(updated)]));
  files.set(listing(updated).lesson_url, updated);
  await depot.load({ force: true });
  assert.equal(depot.snapshot().preview, null);
  await depot.installPack(pack.id, pack.version);
  assert.equal(store.skillsById.CUSTOM_ALICE_A.theory, updated.skills[0].theory);
});

test("an old preview download cannot repopulate the cache after a catalog change", async () => {
  const pack = lesson("A");
  const { store, depot, files } = harness([pack]);
  await depot.load();
  const gate = deferred();
  files.set(listing(pack).lesson_url, gate.promise);
  const previewing = depot.previewPack(pack.id, pack.version);
  const updated = structuredClone(pack);
  updated.skills[0].theory = "Corrected lesson explanation.";
  files.set(catalogUrl, catalog([listing(updated)]));
  await depot.load({ force: true });
  gate.resolve(pack);
  await assert.rejects(previewing, /listing changed/);
  assert.equal(depot.snapshot().preview, null);
  assert.equal(store.snapshot().lessonPacks.length, 0);
});

test("direct subscriptions cannot claim official or other repositories' identities", async () => {
  const original = lesson("A");
  const { depot, files } = harness([original]);
  const replacement = lesson("A", "99.0.0");
  for (const id of ["quickmaths-official", "other/lessons"]) {
    files.set(registryUrl, catalog([listing(replacement)], { id, name: "Impersonated registry" }));
    await assert.rejects(depot.addRegistry(registryUrl), /must match its source repository/);
  }
  await depot.load();
  assert.equal((await depot.search())[0].version, original.version);
  files.set(registryUrl, catalog([listing(replacement)], { id: "ALICE/LESSONS", name: "Alice Lessons" }));
  await depot.addRegistry(registryUrl);
  assert.equal((await depot.search())[0].version, original.version);
  assert.match(depot.snapshot().warnings.join(" "), /conflicts with an official package/);
});

test("the Bridge startup discovers and stages federated packages", async () => {
  const pack = lesson("A");
  const { store, files, fetchImpl } = harness([]);
  files.set(registryUrl, catalog([listing(pack)], { id: "alice/lessons", name: "Alice Lessons" }));
  files.set(federationUrl, { format: "quickmaths.lesson-depot.federation", schema_version: "1.0", registries: [{ id: "alice/lessons", name: "Alice Lessons", catalog_url: registryUrl, status: "new" }] });
  files.set(listing(pack).lesson_url, pack);
  const source = readFileSync(new URL("./agent-bridge.js", import.meta.url), "utf8");
  const initializer = source.match(/lessonDepot = createLessonDepot\([^;]+;/)[0];
  const context = { store, toast() {}, DEFAULT_DEPOT_FEDERATION: federationUrl, window: { localStorage: memoryStorage() }, createLessonDepot: (options) => createLessonDepot({ ...options, catalogUrl, fetchImpl, cryptoImpl: webcrypto }) };
  runInNewContext(initializer, context);
  const found = await context.lessonDepot.search();
  assert.equal(found[0].source_id, "alice/lessons");
  await context.lessonDepot.stagePack(pack.id, pack.version);
  assert.equal(store.snapshot().stagedLessonPack.id, pack.id);
  assert.equal(store.snapshot().lessonPacks.length, 0);
});

function communityHarness() {
  const pending = [];
  const handlers = new Map();
  const state = { requestId: 0 };
  const packs = ["A", "B"].map((id) => ({ id, version: "1", discussionUrl: `discussion-${id}` }));
  const context = {
    communityUi: state,
    githubCommunity: { configured: true, disconnect() {}, loadDiscussion: (url) => { const request = { url, ...deferred() }; pending.push(request); return request.promise; } },
    lessonDepot: { snapshot: () => ({ catalog: { packages: packs } }) },
    communityConnection: () => ({ connected: true }), rerenderDepotCommunity() {}, showToast() {},
    currentSnapshot: { ui: { route: "depot" } },
    document: { querySelector: () => null, addEventListener: (type, handler) => handlers.set(type, handler) },
    FormData: class { constructor(form) { this.form = form; } get() { return this.form.body; } },
  };
  runInNewContext(appSource.slice(appSource.indexOf("async function loadDepotDiscussion()"), appSource.indexOf("\nfunction depotTrustLabel(")), context);
  for (const [type, next] of [["click", "change"], ["submit", "keydown"]]) {
    const start = appSource.indexOf(`document.addEventListener("${type}"`);
    runInNewContext(appSource.slice(start, appSource.indexOf(`document.addEventListener("${next}"`, start)), context);
  }
  const click = (action) => handlers.get("click")({ preventDefault() {}, target: { closest: (selector) => selector === "[data-depot-action]" ? { dataset: { depotAction: action } } : null } });
  const comment = (body) => handlers.get("submit")({ preventDefault() {}, target: { id: "community-comment-form", body } });
  return { context, state, pending, click, comment };
}

test("late discussion responses and failures cannot replace a newly selected lesson", async () => {
  for (const fail of [false, true]) {
    const { context, state, pending } = communityHarness();
    const first = context.openDepotCommunity("A", "1");
    const second = context.openDepotCommunity("B", "1");
    pending[1].resolve({ id: "DISCUSSION_B" }); await second;
    if (fail) pending[0].reject(new Error("Old request failed"));
    else pending[0].resolve({ id: "DISCUSSION_A" });
    await first;
    assert.equal(state.activePack.id, "B");
    assert.equal(state.discussion.id, "DISCUSSION_B");
    assert.equal(state.phase, "ready");
    assert.equal(state.error, "");
  }
});

test("refreshing the same lesson keeps only the newest discussion response", async () => {
  const { context, state, pending } = communityHarness();
  const first = context.openDepotCommunity("A", "1");
  const refresh = context.loadDepotDiscussion();
  pending[1].resolve({ id: "CURRENT" }); await refresh;
  pending[0].resolve({ id: "STALE" }); await first;
  assert.equal(state.discussion.id, "CURRENT");
});

test("closing or disconnecting a community panel invalidates its pending response", async () => {
  for (const action of ["community-close", "community-disconnect"]) {
    const { context, state, pending, click } = communityHarness();
    const loading = context.openDepotCommunity("A", "1");
    await click(action);
    pending[0].resolve({ id: "STALE" }); await loading;
    assert.equal(state.discussion, null);
    assert.equal(state.phase, "idle");
  }
});

test("pending votes and flags cannot update a different lesson's discussion", async () => {
  for (const [action, method, field] of [["community-vote", "setVote", "votes"], ["community-flag", "setFlag", "flags"]]) {
    const { context, state, pending, click } = communityHarness();
    const opening = context.openDepotCommunity("A", "1");
    pending[0].resolve({ id: "DISCUSSION_A", votes: 0, flags: 0 }); await opening;
    const gate = deferred();
    context.githubCommunity[method] = (id) => { assert.equal(id, "DISCUSSION_A"); return gate.promise; };
    const saving = click(action);
    const switching = context.openDepotCommunity("B", "1");
    pending[1].resolve({ id: "DISCUSSION_B", votes: 0, flags: 0 }); await switching;
    gate.resolve({ [field]: 1 }); await saving;
    assert.equal(state.discussion.id, "DISCUSSION_B");
    assert.equal(state.discussion[field], 0);
    assert.equal(state.busy, false);
  }
});

test("a pending comment stays with its original discussion when the lesson changes", async () => {
  const { context, state, pending, comment } = communityHarness();
  const opening = context.openDepotCommunity("A", "1");
  pending[0].resolve({ id: "DISCUSSION_A", commentCount: 0, comments: [] }); await opening;
  const gate = deferred();
  context.githubCommunity.addComment = (id, body) => { assert.equal(id, "DISCUSSION_A"); assert.equal(body, "Comment for A"); return gate.promise; };
  comment("Comment for A");
  const switching = context.openDepotCommunity("B", "1");
  pending[1].resolve({ id: "DISCUSSION_B", commentCount: 0, comments: [] }); await switching;
  state.commentDraft = "Draft for B";
  gate.resolve({ id: "COMMENT_A", body: "Comment for A" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.discussion.id, "DISCUSSION_B");
  assert.equal(state.discussion.commentCount, 0);
  assert.equal(state.commentDraft, "Draft for B");
  assert.equal(state.busy, false);
});

test("federation rejects a release whose ID or version differs from its listing", () => {
  const pack = lesson("A");
  for (const changed of [{ id: "PACK_ALICE_OTHER" }, { version: "2.0.0" }]) {
    assert.throws(() => validateFederatedReleases([{ pack: { ...listing(pack), ...changed }, raw: JSON.stringify(pack) }], curriculum), /identity does not match/);
  }
});

test("federation validates archived releases and selects one latest version per package", () => {
  const old = lesson("A"), latest = lesson("A", "2.0.0"), dependent = lesson("B", "1.0.0", "CUSTOM_ALICE_A");
  const releases = [latest, old, dependent].map((pack) => ({ pack: listing(pack), raw: JSON.stringify(pack) }));
  const selected = validateFederatedReleases(releases, curriculum);
  assert.deepEqual(selected.map((pack) => [pack.id, pack.version]), [[latest.id, "2.0.0"], [dependent.id, "1.0.0"]]);
  old.skills[0].problems[0].grading_method = "unsupported_grader";
  releases[1].raw = JSON.stringify(old);
  assert.throws(() => validateFederatedReleases(releases, curriculum), /grading/);
});

test("latest federated versions must still form a complete acyclic graph", () => {
  const first = lesson("A", "2.0.0", "CUSTOM_ALICE_B"), second = lesson("B", "1.0.0", "CUSTOM_ALICE_A");
  const releases = [first, second].map((pack) => ({ pack: listing(pack), raw: JSON.stringify(pack) }));
  assert.throws(() => validateFederatedReleases(releases, curriculum), /cycle/);
});
