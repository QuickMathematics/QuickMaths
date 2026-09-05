import { GITHUB_REACTIONS, lessonReactionTotals } from "./depot-reactions.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import { createQuickMathsStore } from "./challenge-core.js";
import { createLessonDepot } from "./lesson-depot.js";
import { normalizeDepotCatalog } from "./lesson-depot.js";
import { fetchTextLimited } from "./safe-fetch.js";
import * as federationCore from "../scripts/federated_depot_core.mjs";
const { validateFederatedReleases } = federationCore;

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
    GITHUB_REACTIONS, lessonReactionTotals,
    githubCommunity: { configured: true, disconnect() {}, loadDiscussion: (url) => { const request = { url, ...deferred() }; pending.push(request); return request.promise; } },
    lessonDepot: { snapshot: () => ({ catalog: { packages: packs } }), updateDiscussionReactions() {} },
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
  const click = (action, dataset = {}) => handlers.get("click")({ preventDefault() {}, target: { closest: (selector) => selector === "[data-depot-action]" ? { dataset: { depotAction: action, ...dataset } } : null } });
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

test("comment reactions update only the selected comment and preserve native comment upvotes and lesson ranking", async () => {
  const { context, state, pending, click } = communityHarness();
  const loading = context.openDepotCommunity("A", "1");
  pending[0].resolve({ id: "DISCUSSION_A", votes: 3, comments: [{ id: "C_1", upvoteCount: 7, reactions: [] }, { id: "C_2", reactions: [] }] }); await loading;
  context.githubCommunity.setReaction = async (id, content, selected) => {
    assert.equal(id, "C_1"); assert.equal(content, "THUMBS_UP"); assert.equal(selected, true);
    return { reactions: [{ content, count: 9, viewerHasReacted: true }] };
  };
  await click("community-react", { commentId: "C_1", reactionContent: "THUMBS_UP" });
  assert.equal(state.discussion.comments[0].reactions[0].count, 9);
  assert.equal(state.discussion.comments[1].reactions.length, 0);
  assert.equal(state.discussion.votes, 3);
  assert.equal(state.discussion.comments[0].upvoteCount, 7);
  assert.equal(state.busy, false);
});

test("reaction toggles use the viewer's saved state and ignore a duplicate click while busy", async () => {
  const { context, state, pending, click } = communityHarness();
  const loading = context.openDepotCommunity("A", "1");
  pending[0].resolve({ id: "DISCUSSION_A", reactions: [{ content: "HEART", count: 2, viewerHasReacted: true }], comments: [] }); await loading;
  const gate = deferred(); let calls = 0;
  context.githubCommunity.setReaction = (id, content, selected) => {
    calls += 1; assert.equal(id, "DISCUSSION_A"); assert.equal(selected, false); return gate.promise;
  };
  const saving = click("community-react", { reactionContent: "HEART" });
  await click("community-react", { reactionContent: "HEART" });
  assert.equal(calls, 1);
  gate.resolve({ reactions: [{ content: "HEART", count: 1, viewerHasReacted: false }] }); await saving;
  assert.equal(state.discussion.reactions[0].viewerHasReacted, false);
});

test("a pending reaction cannot update another lesson or a newly opened comment", async () => {
  for (const commentId of [undefined, "C_1"]) {
    const { context, state, pending, click } = communityHarness();
    const loading = context.openDepotCommunity("A", "1");
    pending[0].resolve({ id: "DISCUSSION_A", reactions: [], comments: [{ id: "C_1", reactions: [] }] }); await loading;
    const gate = deferred(); context.githubCommunity.setReaction = () => gate.promise;
    const saving = click("community-react", { commentId, reactionContent: "HEART" });
    const switching = context.openDepotCommunity("B", "1");
    pending[1].resolve({ id: "DISCUSSION_B", reactions: [], comments: [{ id: "C_2", reactions: [] }] }); await switching;
    gate.resolve({ reactions: [{ content: "HEART", count: 4, viewerHasReacted: true }] }); await saving;
    assert.equal(state.discussion.id, "DISCUSSION_B");
    assert.equal(state.discussion.reactions.length, 0);
    assert.equal(state.discussion.comments[0].reactions.length, 0);
    assert.equal(state.busy, false);
  }
});

test("unavailable targets, denied permissions and failed reactions preserve the discussion", async () => {
  const { context, state, pending, click } = communityHarness();
  const loading = context.openDepotCommunity("A", "1");
  pending[0].resolve({ id: "DISCUSSION_A", viewerCanReact: false, reactions: [], comments: [{ id: "C_1", viewerCanReact: false, reactions: [] }] }); await loading;
  let calls = 0;
  context.githubCommunity.setReaction = async () => { calls += 1; throw new Error("GitHub unavailable"); };
  for (const commentId of [undefined, "C_1", "NOT_IN_THIS_DISCUSSION"]) await click("community-react", { commentId, reactionContent: "HEART" });
  assert.equal(calls, 0);
  state.discussion.viewerCanReact = true;
  await click("community-react", { reactionContent: "HEART" });
  assert.equal(calls, 1);
  assert.equal(state.discussion.reactions.length, 0);
  assert.equal(state.busy, false);
});

test("only confirmed lesson reactions update catalog rankings", async () => {
  const { context, state, pending, click } = communityHarness();
  const loading = context.openDepotCommunity("A", "1");
  pending[0].resolve({ id: "DISCUSSION_A", votes: 0, reactions: [], comments: [{ id: "C_1", upvoteCount: 10, reactions: [] }] }); await loading;
  const updates = [];
  context.lessonDepot.updateDiscussionReactions = (...args) => updates.push(args);
  context.githubCommunity.setReaction = async (_id, content) => ({ reactions: [{ content, count: 4, viewerHasReacted: true }] });
  await click("community-react", { commentId: "C_1", reactionContent: "HEART" });
  assert.equal(state.discussion.comments[0].upvoteCount, 10);
  assert.equal(state.discussion.votes, 0);
  assert.equal(updates.length, 0);
  await click("community-react", { reactionContent: "HEART" });
  assert.equal(state.discussion.votes, 4);
  assert.equal(state.discussion.score, 4);
  assert.equal(updates.length, 1);
  assert.equal(updates[0][1][0].content, "HEART");
  await click("community-react", { reactionContent: "CONFUSED" });
  assert.equal(state.discussion.downvotes, 4);
  assert.equal(state.discussion.score, -4);
  assert.equal(state.discussion.comments[0].upvoteCount, 10);
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

async function runIndexWorker(filename, { official, discussions, remote = new Map(), statusDenied = false }) {
  const source = readFileSync(new URL(`../scripts/${filename}`, import.meta.url), "utf8").replace(/^import[\s\S]*?;\s*/gm, "");
  const files = new Map([["catalog.json", official], ["docs/curriculum-data.json", curriculum]]), written = new Map(), queries = [];
  const globals = {
    ...federationCore, lessonReactionTotals, normalizeDepotCatalog, fetchTextLimited, createHash, URL, Response,
    process: { env: { GITHUB_TOKEN: "mock-token", GITHUB_REPOSITORY: "QuickMathematics/QuickMaths" }, argv: ["node", filename], exit: (code) => { throw new Error(`Unexpected worker exit ${code}`); } },
    console: { log() {}, warn() {} }, resolve: (...parts) => parts.join("/"),
    readFile: async (path) => {
      const value = files.get(path) ?? files.get(path.split("/").at(-1));
      if (!value) throw new Error("No prior snapshot");
      return JSON.stringify(value);
    },
    writeFile: async (path, text) => written.set(path.split("/").at(-1), JSON.parse(text)),
    fetch: async (url, options) => {
      if (remote.has(url)) return Response.json(remote.get(url));
      assert.equal(url, "https://api.github.com/graphql");
      const body = JSON.parse(options.body); queries.push(body.query);
      if (body.query.includes("addDiscussionComment") || body.query.includes("updateDiscussionComment")) return statusDenied
        ? Response.json({ errors: [{ message: "Resource not accessible by integration" }] })
        : Response.json({ data: { addDiscussionComment: { comment: { id: "STATUS" } } } });
      assert.match(body.query, /reactionGroups/);
      assert.doesNotMatch(body.query, /upvoteCount/);
      assert.doesNotMatch(body.query, /reactions\(content:/);
      return Response.json({ data: { viewer: { login: "bot" }, repository: { id: "R_1", hasDiscussionsEnabled: true, discussionCategories: { nodes: [{ id: "CAT_1", name: "General" }] }, discussions: { nodes: discussions, pageInfo: { hasNextPage: false } } } } });
    },
  };
  await runInNewContext(`(async () => { ${source}\n })()`, globals);
  return { written, queries };
}

test("official catalog refresh totals positive and negative reactions independently", async () => {
  const pack = lesson("A");
  const { written } = await runIndexWorker("sync_depot_community.mjs", {
    official: catalog([listing(pack)]),
    discussions: [{ title: `[Lesson] ${pack.id}`, url: "https://github.com/QuickMathematics/QuickMaths/discussions/1", upvoteCount: 999, reactionGroups: [{ content: "HEART", users: { totalCount: 4 } }, { content: "ROCKET", users: { totalCount: 3 } }, { content: "HOORAY", users: { totalCount: 2 } }, { content: "THUMBS_UP", users: { totalCount: 1 } }, { content: "THUMBS_DOWN", users: { totalCount: 2 } }, { content: "CONFUSED", users: { totalCount: 1 } }, { content: "EYES", users: { totalCount: 500 } }], comments: { totalCount: 800 } }],
  });
  assert.equal(written.get("community.json").packages[pack.id].votes, 10);
  assert.equal(written.get("community.json").packages[pack.id].downvotes, 3);
  assert.equal(written.get("community.json").packages[pack.id].comments, 800);
});

test("federated refresh uses reaction scores and survives status-comment permission failures", async () => {
  for (const [votes, statusDenied] of [[0, false], [0, true], [3, false], [3, true], [5, false], [5, true]]) {
    const pack = lesson("A"), entry = listing(pack);
    const registry = { id: "alice/lessons", name: "Alice Lessons", namespace: "ALICE" };
    const { written } = await runIndexWorker("sync_federated_depot.mjs", {
      official: catalog([]), statusDenied, remote: new Map([[registryUrl, catalog([entry], registry)], [entry.lesson_url, pack]]),
      discussions: [
        { id: "SUBMISSION", title: "[Registry] alice/lessons", body: `<!-- quickmaths-registry\n${JSON.stringify({ catalog_url: registryUrl })}\n-->`, url: "https://github.com/QuickMathematics/QuickMaths/discussions/2", author: { login: "alice" }, upvoteCount: 100, comments: { nodes: statusDenied ? [{ id: "OLD_STATUS", body: "<!-- quickmaths-federation-status -->\nOld status", viewerDidAuthor: true }] : [], totalCount: statusDenied ? 1 : 0 } },
        { id: "LESSON", title: federationCore.packageDiscussionTitle(registry.id, entry), upvoteCount: 1000, reactionGroups: [{ content: "HEART", users: { totalCount: votes } }, { content: "CONFUSED", users: { totalCount: 2 } }, { content: "LAUGH", users: { totalCount: 2000 } }], url: "https://github.com/QuickMathematics/QuickMaths/discussions/3", comments: { totalCount: 500 } },
      ],
    });
    const indexed = written.get("federation.json").registries[0];
    assert.ok(indexed, "Valid registry must remain listed despite thumbs-down reactions");
    assert.equal(indexed.packages[0].votes, votes);
    assert.equal(indexed.packages[0].downvotes, 2);
    assert.equal(indexed.packages[0].status, votes - 2 >= 3 ? "recommended" : "new");
  }
});
