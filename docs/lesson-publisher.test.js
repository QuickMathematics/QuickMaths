import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createLessonPublisher, preparePublicLesson } from "./lesson-publisher.js";
import { DEFAULT_DEPOT_FEDERATION, normalizeDepotCatalog } from "./lesson-depot.js";
import { registryUrlFromBody, validateFederatedNamespace, validateFederatedReleases } from "./depot-validation.js";

const curriculum = JSON.parse(await readFile(new URL("./curriculum-data.json", import.meta.url)));
const fixture = JSON.parse(await readFile(new URL("./lesson-depot/lessons/estimation-lab/1.0.0/lesson-set.json", import.meta.url)));
const hash = (text) => createHash("sha256").update(text).digest("hex");
const githubSha = (text) => createHash("sha1").update(text).digest("hex");
const pack = () => structuredClone(fixture);

function harness({ exists = false, privateRepo = false } = {}) {
  const state = { calls: [], mutations: [], exists, privateRepo, files: new Map(), history: new Map(), sha: null, discussions: [], failure: null, federation: { registries: [] }, statusComments: [] };
  const commit = () => {
    state.sha = githubSha(`${state.history.size}:${JSON.stringify([...state.files])}`);
    state.history.set(state.sha, new Map(state.files));
    return state.sha;
  };
  const metadata = () => ({ full_name: "alice/quickmaths-lessons", owner: { login: "alice" }, permissions: { push: true }, private: state.privateRepo, default_branch: "main" });
  const fetchImpl = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    const call = { url, method: options.method ?? "GET", body, options };
    state.calls.push(call);
    if (url.startsWith("https://api.github.com")) {
      assert.equal(options.headers.authorization, "Bearer ghp_test");
      assert.equal(options.redirect, "error");
    } else assert.equal(options.headers?.authorization, undefined, "public fetch must never carry the token");
    if (state.failure?.(call)) throw new Error("simulated network failure");
    if (url === DEFAULT_DEPOT_FEDERATION) return Response.json(state.federation);
    if (url.startsWith("https://raw.githubusercontent.com")) {
      const parts = new URL(url).pathname.split("/");
      const text = state.history.get(parts[3])?.get(parts.slice(4).join("/"));
      return new Response(text ?? "missing", { status: text == null ? 404 : 200 });
    }
    const path = new URL(url).pathname;
    if (path === "/user") return Response.json({ login: "alice" }, { headers: state.scopes ? { "x-oauth-scopes": state.scopes } : {} });
    if (path === "/graphql") {
      const query = body.query;
      if (query.includes("PublisherConnection")) return Response.json({ data: { repository: { id: "R_MAIN", hasDiscussionsEnabled: true, discussionCategories: { nodes: [{ id: "C_GENERAL", name: "General", isAnswerable: false }] } } } });
      if (query.includes("PublisherSubmissions")) return Response.json({ data: { repository: { discussions: { nodes: state.discussions, pageInfo: { hasNextPage: false } } } } });
      if (query.includes("PublisherStatus")) return Response.json({ data: { repository: { discussion: { comments: { nodes: state.statusComments } } } } });
      state.mutations.push(call);
      if (query.includes("PublisherSubmit")) {
        const discussion = { id: `D_${state.discussions.length + 1}`, number: state.discussions.length + 1, url: "https://github.com/QuickMathematics/QuickMaths/discussions/12", title: body.variables.title, body: body.variables.body, author: { login: "alice" } };
        state.discussions.push(discussion);
        if (state.loseSubmitResponse) { state.loseSubmitResponse = false; throw new Error("Lost response after GitHub saved the Discussion"); }
        return Response.json({ data: { createDiscussion: { discussion } } });
      }
      if (query.includes("PublisherUpdate")) {
        const discussion = state.discussions.find((item) => item.id === body.variables.id);
        discussion.body = body.variables.body;
        return Response.json({ data: { updateDiscussion: { discussion } } });
      }
      throw new Error(`Unexpected query: ${query}`);
    }
    if (path === "/user/repos") { state.mutations.push(call); assert.equal(body.private, false); state.exists = true; return Response.json(metadata(), { status: 201 }); }
    if (path === "/repos/alice/quickmaths-lessons") return Response.json(state.exists ? metadata() : {}, { status: state.exists ? 200 : 404 });
    if (path.includes("/commits/")) return Response.json(state.sha ? { sha: state.sha } : {}, { status: state.sha ? 200 : 409 });
    if (path.includes("/contents/")) {
      const filePath = decodeURIComponent(path.split("/contents/")[1]);
      const ref = new URL(url).searchParams.get("ref");
      const files = ref ? state.history.get(ref) : state.files;
      const old = files?.get(filePath);
      if (options.method === "PUT") {
        state.mutations.push(call);
        const current = state.files.get(filePath);
        if ((body.sha ?? null) !== (current == null ? null : githubSha(current))) return Response.json({}, { status: 409 });
        const text = Buffer.from(body.content, "base64").toString("utf8");
        state.files.set(filePath, text);
        return Response.json({ commit: { sha: commit() } }, { status: 201 });
      }
      if (old == null) return Response.json({}, { status: 404 });
      if (options.headers.accept.includes("raw")) return new Response(old);
      return Response.json({ type: "file", encoding: "base64", size: Buffer.byteLength(old), sha: githubSha(old), content: Buffer.from(old).toString("base64") });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  const client = createLessonPublisher({ curriculum, fetchImpl, now: () => new Date("2026-09-05T12:00:00Z") });
  const connect = () => client.connect("ghp_test");
  const review = (input = pack()) => client.prepare({ pack: input, repo: "quickmaths-lessons", license: "CC BY 4.0" });
  return { state, client, commit, connect, review };
}

test("public payload is deterministic, namespaced and excludes workspace data", async () => {
  const input = pack(); input.profiles = [{ name: "private learner" }]; input.token = "private-token"; input.importedAt = "yesterday";
  input.skills[0].privateNote = "private-note";
  const first = await preparePublicLesson(input, { namespace: "ALICE", curriculum, author: "alice" });
  const second = await preparePublicLesson(input, { namespace: "ALICE", curriculum, author: "alice" });
  assert.equal(first.text, second.text);
  assert.equal(first.pack.id, "PACK_ALICE_ESTIMATION_LAB");
  assert.ok(first.pack.skills.every((skill) => skill.id.startsWith("CUSTOM_ALICE_") && skill.problems.every((problem) => problem.skill_id === skill.id)));
  assert.doesNotMatch(first.text, /private learner|private-token|private-note|importedAt/);
  validateFederatedReleases([{ pack: first.pack, raw: first.text }], curriculum);
  const again = await preparePublicLesson(first.pack, { namespace: "ALICE", curriculum, author: "alice" });
  assert.equal(again.text, first.text, "published JSON can be imported and republished without identity or hash drift");
});

test("full publishing creates a public repo, two pinned commits and one registry submission", async () => {
  const { state, client, connect, review } = harness();
  await connect(); const plan = await review();
  assert.equal(state.mutations.length, 0, "review must not mutate GitHub");
  await assert.rejects(client.publish(plan), /Confirm/);
  assert.equal(state.mutations.length, 0);
  const result = await client.publish(plan, { consent: true });
  assert.equal(state.mutations.length, 4);
  assert.equal(state.discussions.length, 1);
  assert.equal(registryUrlFromBody(state.discussions[0].body), result.catalogUrl);
  const catalog = JSON.parse(state.files.get("quickmaths-depot.json"));
  const normalized = normalizeDepotCatalog(catalog, { catalogUrl: result.catalogUrl, source: { id: result.repository.toLowerCase(), trust: "new" }, requireHashes: true });
  assert.equal(normalized.packages[0].sha256, hash(plan.text));
  assert.notEqual(new URL(result.lessonUrl).pathname.split("/")[3], new URL(result.catalogUrl).pathname.split("/")[3]);
  assert.equal(state.files.size, 2);
  validateFederatedReleases([{ pack: normalized.packages[0], raw: plan.text }], curriculum);
});

test("repeat publishing reuses uploaded files and the existing Discussion", async () => {
  const { state, client, connect, review } = harness();
  await connect(); await client.publish(await review(), { consent: true });
  const writes = state.mutations.length;
  await client.publish(await review(), { consent: true });
  assert.equal(state.mutations.length, writes);
  assert.equal(state.discussions.length, 1);
});

test("new versions preserve history and update the existing submission", async () => {
  const { state, client, connect, review } = harness();
  await connect(); await client.publish(await review(), { consent: true });
  const old = JSON.parse(state.files.get("quickmaths-depot.json")).packages[0];
  const next = pack(); next.version = "1.1.0"; next.name = "Updated estimation";
  await client.publish(await review(next), { consent: true });
  const catalog = JSON.parse(state.files.get("quickmaths-depot.json"));
  assert.equal(catalog.packages.length, 2);
  assert.deepEqual(catalog.packages[0], old);
  assert.equal(state.discussions.length, 1);
  assert.match(state.mutations.at(-1).body.query, /updateDiscussion/);
});

test("changed or older versions fail before any further public mutations", async () => {
  const { state, client, connect, review } = harness();
  await connect(); await client.publish(await review(), { consent: true });
  const count = state.mutations.length;
  const changed = pack(); changed.description += " revised";
  await assert.rejects(review(changed), /Increase the lesson version/);
  const older = pack(); older.version = "0.9.0";
  await assert.rejects(review(older), /newer/);
  assert.equal(state.mutations.length, count);
});

test("private repositories and private visibility changes never receive lesson uploads", async () => {
  const h = harness({ exists: true, privateRepo: true }); await h.connect();
  await assert.rejects(h.review(), /Private workspace storage/);
  assert.equal(h.state.mutations.length, 0);
  h.state.privateRepo = false; const plan = await h.review(); h.state.privateRepo = true;
  await assert.rejects(h.client.publish(plan, { consent: true }), /Private workspace storage/);
  assert.equal(h.state.mutations.length, 0);
});

test("a changed registry invalidates a review without overwriting it", async () => {
  const { state, client, connect, review, commit } = harness();
  await connect(); const plan = await review();
  state.exists = true; state.files.set("quickmaths-depot.json", '{"other":"publisher"}'); commit();
  await assert.rejects(client.publish(plan, { consent: true }), /registry changed/);
  assert.equal(state.mutations.length, 0);
});

test("an interrupted registry write reuses the completed immutable lesson upload", async () => {
  const { state, client, connect, review } = harness();
  await connect(); const plan = await review();
  state.failure = (call) => call.method === "PUT" && call.url.endsWith("quickmaths-depot.json");
  await assert.rejects(client.publish(plan, { consent: true }), /interrupted/);
  assert.equal(state.files.size, 1);
  const lessonWrites = state.mutations.filter((call) => call.url.includes("/lessons/")).length;
  state.failure = null;
  await client.publish(await review(), { consent: true });
  assert.equal(state.mutations.filter((call) => call.url.includes("/lessons/")).length, lessonWrites);
  assert.equal(state.discussions.length, 1);
});

test("a failed submission retries without uploading any files again", async () => {
  const { state, client, connect, review } = harness();
  await connect();
  state.failure = (call) => call.body?.query?.includes("PublisherSubmit");
  await assert.rejects(client.publish(await review(), { consent: true }), /interrupted/);
  assert.equal(state.files.size, 2);
  const writes = state.mutations.length;
  state.failure = null;
  await client.publish(await review(), { consent: true });
  assert.equal(state.mutations.length, writes + 1);
});

test("missing private-only prerequisites fail public validation", async () => {
  const { state, connect, review } = harness(); await connect();
  const input = pack(); input.skills[0].prerequisites.push("CUSTOM_ONLY_ON_THIS_DEVICE");
  await assert.rejects(review(input), /missing prerequisite/);
  assert.equal(state.mutations.length, 0);
});

test("disconnect invalidates approval and removes the publishing connection", async () => {
  const { state, client, connect, review } = harness(); await connect();
  const plan = await review(); client.disconnect();
  assert.equal(client.snapshot().connected, false);
  await assert.rejects(client.publish(plan, { consent: true }), /current GitHub connection/);
  assert.equal(state.mutations.length, 0);
});

test("publication status distinguishes submission from exact-release listing", async () => {
  const { state, client, connect, review } = harness(); await connect();
  const result = await client.publish(await review(), { consent: true });
  assert.equal((await client.checkStatus(result)).phase, "pending");
  state.federation.registries = [{ id: result.repository.toLowerCase(), packages: [{ id: result.id, version: result.version, sha256: "0".repeat(64) }] }];
  assert.equal((await client.checkStatus(result)).phase, "pending");
  state.federation.registries[0].packages[0].sha256 = result.sha256;
  assert.equal((await client.checkStatus(result)).phase, "listed");
});

test("native improvements keep native IDs and still pass full federation validation", async () => {
  const native = structuredClone(curriculum.skills[0]);
  const input = pack(); input.id = "PACK_NATIVE_FIX"; input.mode = "override"; input.skills = [native];
  input.track = { id: "TRACK_NATIVE_FIX", name: "Native fix", skills: [native.id] };
  const prepared = await preparePublicLesson(input, { namespace: "ALICE", curriculum, author: "alice" });
  assert.equal(prepared.pack.skills[0].id, native.id);
  validateFederatedNamespace("alice/lessons", prepared.pack.id, prepared.pack, "ALICE");
  validateFederatedReleases([{ pack: prepared.pack, raw: prepared.text }], curriculum);
  prepared.pack.skills[0].id = "FAKE_NATIVE";
  await assert.rejects(preparePublicLesson(prepared.pack, { namespace: "ALICE", curriculum, author: "alice" }), /not a native/);
});

test("prerequisites from another published Studio package are remapped to their public IDs", async () => {
  const { state, client, connect, review } = harness(); await connect();
  await client.publish(await review(), { consent: true });
  const input = pack();
  input.id = "PACK_FOLLOW_UP";
  const previousId = input.skills[0].id;
  input.skills[0].id = "CUSTOM_FOLLOW_UP";
  input.skills[0].prerequisites = [previousId];
  input.skills[0].problems.forEach((problem) => { problem.skill_id = "CUSTOM_FOLLOW_UP"; });
  input.track = { id: "TRACK_FOLLOW_UP", name: "Follow up", skills: ["CUSTOM_FOLLOW_UP"] };
  const plan = await review(input);
  const prepared = JSON.parse(plan.text);
  assert.ok(prepared.skills[0].prerequisites[0].skill_id.startsWith("CUSTOM_QM"));
  await client.publish(plan, { consent: true });
  assert.equal(JSON.parse(state.files.get("quickmaths-depot.json")).packages.length, 2);
});

test("a lost Discussion response recovers without creating a duplicate submission", async () => {
  const { state, client, connect, review } = harness(); await connect();
  state.loseSubmitResponse = true;
  await assert.rejects(client.publish(await review(), { consent: true }), /interrupted/);
  assert.equal(state.discussions.length, 1);
  const count = state.mutations.length;
  await client.publish(await review(), { consent: true });
  assert.equal(state.discussions.length, 1);
  assert.equal(state.mutations.length, count);
});

test("validation rejection status is tied to the exact registry revision and workflow author", async () => {
  const { state, client, connect, review } = harness(); await connect();
  const result = await client.publish(await review(), { consent: true });
  const body = `<!-- quickmaths-federation-status -->\n❌ **Registry not listed.**\nBad dependency.\nRegistry revision: ${result.catalogUrl}`;
  state.statusComments = [{ body, author: { login: "someone" } }];
  assert.equal((await client.checkStatus(result)).phase, "pending");
  state.statusComments = [{ body: body.replace(result.catalogUrl, "https://example.invalid/old-revision"), author: { login: "github-actions[bot]" } }];
  assert.equal((await client.checkStatus(result)).phase, "pending");
  state.statusComments = [{ body, author: { login: "github-actions[bot]" } }];
  assert.equal((await client.checkStatus(result)).phase, "rejected");
  assert.ok(state.calls.some((call) => call.url === DEFAULT_DEPOT_FEDERATION));
});

test("missing token scopes are caught during connection before publication", async () => {
  const { state, client, connect } = harness(); state.scopes = "public_repo";
  await assert.rejects(connect(), /both public_repo and write:discussion/);
  assert.equal(client.snapshot().connected, false);
  assert.equal(state.mutations.length, 0);
});

test("published history and contested releases have accurate visibility messages", async () => {
  const { state, client, connect, review } = harness(); await connect();
  const result = await client.publish(await review(), { consent: true });
  state.federation.registries = [{ id: result.repository.toLowerCase(), status: "contested", packages: [{ id: result.id, version: result.version, sha256: result.sha256 }] }];
  assert.match((await client.checkStatus(result)).message, /hidden/);
  state.federation.registries[0].status = "new";
  state.federation.registries[0].packages.push({ id: result.id, version: "2.0.0", sha256: "a".repeat(64) });
  assert.match((await client.checkStatus(result)).message, /newer version/);
});

test("concurrent publishes cannot write twice while the first is in progress", async () => {
  const { state, client, connect, review } = harness(); await connect();
  const plan = await review();
  const first = client.publish(plan, { consent: true });
  await assert.rejects(client.publish(plan, { consent: true }), /already in progress/);
  await first;
  assert.equal(state.discussions.length, 1);
});
