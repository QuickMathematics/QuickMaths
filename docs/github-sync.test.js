import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createQuickMathsStore } from "./challenge-core.js";

import {
  AGENT_STATE_PATH,
  BRIDGE_FORMAT,
  createBridgeEnvelope,
  createGitHubContentsClient,
  createGitHubCredentialStore,
  createGitHubSyncController,
  GitHubSyncConflictError,
  LEARNER_STATE_PATH,
  learnerBridgeStartupAction,
  normalizeGitHubSyncConfig,
  parseBridgeEnvelope,
} from "./github-sync.js";

test("learner startup never uses writer identity or nearby clocks to discard dirty work", () => {
  assert.equal(learnerBridgeStartupAction({ remoteExists: true, localProfileCount: 2 }), "choose-migration-source");
  assert.equal(learnerBridgeStartupAction({ remoteExists: true, localProfileCount: 2, establishedConnection: true }), "restore-remote");
  assert.equal(learnerBridgeStartupAction({ remoteExists: true, localProfileCount: 2, establishedConnection: true, remoteMatchesKnown: true }), "resume-known");
  assert.equal(learnerBridgeStartupAction({ remoteExists: true, localProfileCount: 2, establishedConnection: true, localDirty: true, sameDevice: true }), "compare-sources");
  assert.equal(learnerBridgeStartupAction({ remoteExists: true, localProfileCount: 2, establishedConnection: true, localDirty: true, remoteActorKind: "agent" }), "compare-sources");
  assert.equal(learnerBridgeStartupAction({ remoteExists: true, localProfileCount: 2, establishedConnection: true, localDirty: true, localChangedAt: "2026-09-03T12:08:00Z", remoteUpdatedAt: "2026-09-03T12:00:00Z" }), "compare-sources");
  assert.equal(learnerBridgeStartupAction({ remoteExists: true, localProfileCount: 2, establishedConnection: true, localDirty: true, localChangedAt: "2026-09-03T12:11:00Z", remoteUpdatedAt: "2026-09-03T12:00:00Z" }), "compare-sources");
  assert.equal(learnerBridgeStartupAction({ remoteExists: true, localProfileCount: 2, establishedConnection: true, localDirty: true }), "compare-sources");
  assert.equal(learnerBridgeStartupAction({ remoteExists: true, localProfileCount: 0 }), "restore-remote");
  assert.equal(learnerBridgeStartupAction({ remoteExists: false, localProfileCount: 1 }), "push-local");
  assert.equal(learnerBridgeStartupAction({ remoteExists: false, localProfileCount: 0 }), "start");
});

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function credentials() {
  return createGitHubCredentialStore({
    configStorage: new MemoryStorage(),
    sessionCredentialStorage: new MemoryStorage(),
    persistentCredentialStorage: new MemoryStorage(),
  });
}

function connection(role = "learner") {
  return { owner: "octo-user", repo: "quickmaths-sync", branch: "main", token: "github-token", role };
}

function fakeGitHub() {
  const files = new Map();
  const blobs = new Map();
  let revision = 0;
  return {
    files,
    async readBlob(_config, sha) { return { sha, content: blobs.get(sha) }; },
    async verify(config) { return { owner: config.owner, repo: config.repo, private: true, defaultBranch: config.branch, permissions: { push: true } }; },
    async readFile(_config, path) {
      const file = files.get(path);
      return file ? { exists: true, sha: file.sha, content: file.content } : { exists: false, sha: null, content: null };
    },
    async writeFile(_config, path, content, { sha = null } = {}) {
      const file = files.get(path);
      if ((file?.sha ?? null) !== sha) throw new GitHubSyncConflictError();
      revision += 1;
      const next = { sha: `sha-${revision}`, content };
      files.set(path, next);
      blobs.set(next.sha, content);
      return { sha: next.sha, commitSha: `commit-${revision}` };
    },
    async deleteFile(_config, path, { sha } = {}) {
      const file = files.get(path);
      if (!file || file.sha !== sha) throw new GitHubSyncConflictError();
      files.delete(path);
      revision += 1;
      return { deleted: true, commitSha: `commit-${revision}` };
    },
  };
}

function stateHarness(name) {
  let state = { version: 8, profiles: [{ id: name, displayName: name }], activeProfileId: name };
  const listeners = new Set();
  return {
    serialize: () => JSON.stringify(state),
    apply: (raw) => { state = JSON.parse(raw); listeners.forEach((listener) => listener()); },
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    mutate(patch) { state = { ...state, ...patch }; listeners.forEach((listener) => listener()); },
    read: () => structuredClone(state),
  };
}

function controller({ role, client, harness, credentialStore = credentials(), date = "2026-09-01T12:00:00.000Z", deviceId = `${role}-device`, deviceLabel = null, validateMergeState = null }) {
  return createGitHubSyncController({
    role,
    client,
    credentialStore,
    serializeState: harness.serialize,
    applyState: harness.apply,
    validateMergeState,
    subscribeToState: harness.subscribe,
    now: () => new Date(date),
    deviceId,
    deviceLabel,
    setTimer: () => 1,
    clearTimer: () => {},
  });
}

async function mergeFixture() {
  const github = fakeGitHub();
  const learnerState = stateHarness("Learner");
  const agentState = stateHarness("Agent");
  const learner = controller({ role: "learner", client: github, harness: learnerState });
  const agent = controller({ role: "agent", client: github, harness: agentState, date: "2026-09-01T12:02:00.000Z" });
  await learner.connect(connection(), { startPolling: false });
  await learner.pushNow();
  await agent.connect(connection("agent"), { startPolling: false });
  await agent.beginAgentTask();
  return { github, learnerState, agentState, learner, agent };
}

test("a prompt timestamp is local until publish and survives subsequent reads", async () => {
  const { github, agent, agentState } = await mergeFixture();
  assert.equal(github.files.has(AGENT_STATE_PATH), false);
  const start = agent.snapshot().taskStartedAt;
  await agent.pullNow({ quiet: true });
  agentState.mutate({ note: "ready" });
  await assert.rejects(agent.beginAgentTask(), /Publish/);
  await agent.pushNow();
  assert.equal(parseBridgeEnvelope(github.files.get(AGENT_STATE_PATH).content).taskStartedAt, start);
});

test("the timestamp is taken before the initial read and not at publish time", async () => {
  const github = fakeGitHub();
  await github.writeFile(connection(), LEARNER_STATE_PATH, createBridgeEnvelope({ channel: "learner", stateJson: stateHarness("Learner").serialize(), deviceId: "phone" }));
  let clock = "2026-09-06T09:00:00.000Z";
  const agent = createGitHubSyncController({ role: "agent", credentialStore: credentials(),
    client: { ...github, async readFile(...args) { clock = "2026-09-06T09:01:00.000Z"; return github.readFile(...args); } },
    serializeState: stateHarness("Agent").serialize, applyState: () => {}, now: () => new Date(clock), setTimer: () => 1, clearTimer: () => {},
  });
  await agent.connect(connection("agent"), { startPolling: false });
  await agent.beginAgentTask();
  await agent.pushNow();
  const checkpoint = parseBridgeEnvelope(github.files.get(AGENT_STATE_PATH).content);
  assert.equal(checkpoint.taskStartedAt, "2026-09-06T09:00:00.000Z");
  assert.equal(checkpoint.updatedAt, "2026-09-06T09:01:00.000Z");
});

test("an unchanged phone accepts the task despite harmless timer-only repository commits", async () => {
  const { learner, learnerState, agent, agentState } = await mergeFixture();
  learnerState.mutate({ session: { heartbeatAt: 1000 }, syncedAt: "later" });
  await learner.pushNow();
  agentState.mutate({ note: "new lesson" });
  await agent.pushNow();
  assert.equal((await learner.pullNow()).updated, true);
  assert.equal(learnerState.read().note, "new lesson");
});

test("merge choices can keep individual local and remote fields", async () => {
  const { learner, learnerState, agent, agentState } = await mergeFixture();
  learnerState.mutate({ score: 9, subject: "Local subject" });
  agentState.mutate({ score: 8, subject: "Remote subject" });
  await agent.pushNow();
  await assert.rejects(learner.pullNow(), /changed while/);
  const review = await learner.prepareMerge({ channel: "agent" });
  const choices = Object.fromEntries(review.rows.map((row) => [row.id, row.path[0] === "score" ? "local" : "remote"]));
  await learner.applyMerge({ reviewId: review.id, choices });
  assert.equal(learnerState.read().score, 9);
  assert.equal(learnerState.read().subject, "Remote subject");
});

test("an identical shared checkpoint with a newer SHA does not block the pending agent changes", async () => {
  const { github, learner, learnerState, agent, agentState } = await mergeFixture();
  learnerState.mutate({ positions: { fractions: { x: 2, y: 3 }, algebra: { x: 4, y: 5 } } });
  const current = github.files.get(LEARNER_STATE_PATH);
  await github.writeFile(connection(), LEARNER_STATE_PATH, createBridgeEnvelope({ channel: "learner", stateJson: learnerState.serialize(), deviceId: "another-tab" }), { sha: current.sha });
  agentState.mutate({ note: "New note on Fractions basics" });
  await agent.pushNow();
  await assert.rejects(learner.pullNow(), (error) => error.details.channel === "agent");
  const review = await learner.prepareMerge({ channel: "learner" });
  assert.equal(review.channel, "agent");
  assert.ok(review.taskStartedAt);
  assert.ok(review.rows.some((row) => row.remote === "New note on Fractions basics"));
  assert.ok(review.rows.some((row) => row.path[0] === "positions"));
  await learner.applyMerge({ reviewId: review.id });
  assert.equal(learnerState.read().note, "New note on Fractions basics");
  assert.equal(learnerState.read().positions.fractions.x, 2);
});

test("matching canonical content is remembered without a merge, import or extra commit", async () => {
  const { github, learner, learnerState } = await mergeFixture();
  learnerState.mutate({ answer: "Already saved by another tab" });
  const current = github.files.get(LEARNER_STATE_PATH);
  const saved = await github.writeFile(connection(), LEARNER_STATE_PATH, createBridgeEnvelope({ channel: "learner", stateJson: learnerState.serialize(), deviceId: "another-tab" }), { sha: current.sha });
  const unchanged = learnerState.serialize();
  const result = await learner.syncLearnerNow();
  assert.equal(result.matched, true);
  assert.equal(learner.snapshot().dirty, false);
  assert.equal(learnerState.serialize(), unchanged);
  const review = await learner.prepareMerge();
  assert.equal(review.resolved, true);
  assert.equal(github.files.get(LEARNER_STATE_PATH).sha, saved.sha);
});

test("a matching canonical copy cannot roll back a newer locally accepted agent acknowledgement", async () => {
  const { learner, agent } = await mergeFixture();
  await agent.pushNow();
  await learner.pullNow();
  await learner.pushNow();
  await agent.beginAgentTask();
  await agent.pushNow();
  assert.equal((await learner.pullNow()).updated, true);
  // The second agent checkpoint has no content changes and has not yet been
  // acknowledged in the shared learner file. It must not be applied repeatedly.
  await learner.syncLearnerNow();
  assert.equal((await learner.pullNow()).updated, false);
});

test("history-only comparisons settle and continue to the actual agent review", async () => {
  const { github, learner, learnerState, agent, agentState } = await mergeFixture();
  learnerState.mutate({ activity: [{ at: "a", tool: "read_lesson", message: "Opened lesson" }] });
  const current = github.files.get(LEARNER_STATE_PATH);
  const shared = { ...learnerState.read(), activity: [{ at: "b", tool: "read_map", message: "Opened map" }] };
  await github.writeFile(connection(), LEARNER_STATE_PATH, createBridgeEnvelope({ channel: "learner", stateJson: JSON.stringify(shared), deviceId: "another-tab" }), { sha: current.sha });
  agentState.mutate({ note: "New Fractions basics note" });
  await agent.pushNow();
  const agentSha = github.files.get(AGENT_STATE_PATH).sha;
  const review = await learner.prepareMerge();
  assert.equal(review.channel, "agent");
  assert.equal(review.rows.length, 1);
  assert.equal(review.rows[0].remote, "New Fractions basics note");
  assert.equal(learnerState.read().activity.length, 2);
  assert.equal(learnerState.read().note, undefined);
  assert.notEqual(parseBridgeEnvelope(github.files.get(LEARNER_STATE_PATH).content).appliedAgentSha, agentSha);
  await learner.applyMerge({ reviewId: review.id });
  assert.equal(learnerState.read().note, "New Fractions basics note");
});

test("a history-only agent update settles without asking the user to save zero choices", async () => {
  const { github, learner, learnerState, agent, agentState } = await mergeFixture();
  learnerState.mutate({ activity: [{ at: "a", tool: "read_lesson" }] });
  agentState.mutate({ activity: [{ at: "b", tool: "read_map" }] });
  await agent.pushNow();
  const review = await learner.prepareMerge({ channel: "agent" });
  assert.equal(review.resolved, true);
  assert.equal(learnerState.read().activity.length, 2);
  assert.equal(parseBridgeEnvelope(github.files.get(LEARNER_STATE_PATH).content).appliedAgentSha, github.files.get(AGENT_STATE_PATH).sha);
  assert.equal((await learner.pullNow()).updated, false);
});

test("automatic empty merges keep local work intact if a remote revision changes during the write", async () => {
  const { github, learner, learnerState } = await mergeFixture();
  learnerState.mutate({ activity: [{ at: "a", tool: "read_lesson" }] });
  const original = learnerState.serialize();
  const write = github.writeFile;
  github.writeFile = async (...args) => {
    const latest = github.files.get(LEARNER_STATE_PATH);
    await write(connection(), LEARNER_STATE_PATH, createBridgeEnvelope({ channel: "learner", stateJson: JSON.stringify({ ...learnerState.read(), note: "Concurrent note" }), deviceId: "other-device" }), { sha: latest.sha });
    return write(...args);
  };
  await assert.rejects(learner.prepareMerge(), /changed during review/);
  assert.equal(learnerState.serialize(), original);
  assert.equal(parseBridgeEnvelope(github.files.get(LEARNER_STATE_PATH).content).stateJson.includes("Concurrent note"), true);
});

test("edits on the phone during a merge require a fresh comparison", async () => {
  const { github, learner, learnerState, agent, agentState } = await mergeFixture();
  learnerState.mutate({ score: 9 });
  agentState.mutate({ score: 8 });
  await agent.pushNow();
  const review = await learner.prepareMerge({ channel: "agent" });
  const before = github.files.get(LEARNER_STATE_PATH).sha;
  learnerState.mutate({ answer: "typed during review" });
  await assert.rejects(learner.applyMerge({ reviewId: review.id, choices: { 0: "remote" } }), /changed during review/);
  assert.equal(github.files.get(LEARNER_STATE_PATH).sha, before);
  assert.equal(learnerState.read().answer, "typed during review");
  await assert.rejects(learner.pushNow(), /reviewing/);
});

test("a different GitHub revision during review cannot be overwritten", async () => {
  const { github, learner, learnerState, agent, agentState } = await mergeFixture();
  learnerState.mutate({ score: 9 });
  agentState.mutate({ score: 8 });
  await agent.pushNow();
  const review = await learner.prepareMerge({ channel: "agent" });
  const current = github.files.get(LEARNER_STATE_PATH);
  await github.writeFile(connection(), LEARNER_STATE_PATH, current.content, { sha: current.sha });
  await assert.rejects(learner.applyMerge({ reviewId: review.id, choices: { 0: "remote" } }), /changed during review/);
  assert.equal(learnerState.read().score, 9);
});

test("accepted agent checkpoints are acknowledged for other devices", async () => {
  const { github, learner, agent, agentState } = await mergeFixture();
  agentState.mutate({ lesson: "accepted" });
  await agent.pushNow();
  await learner.pullNow();
  await learner.pushNow();
  const secondState = stateHarness("Empty");
  const second = controller({ role: "learner", client: github, harness: secondState });
  await second.connect(connection(), { startPolling: false });
  await second.restoreLearner();
  assert.equal((await second.pullNow()).updated, false);
  assert.equal(secondState.read().lesson, "accepted");
});

test("missing starting history requires explicit two-way choices", async () => {
  const { github, learner, learnerState, agent, agentState } = await mergeFixture();
  // Advance enough revisions to evict the in-memory starting checkpoint.
  for (let n = 0; n < 7; n++) { learnerState.mutate({ n }); await learner.pushNow(); }
  github.readBlob = async () => { throw Object.assign(new Error("Missing history"), { status: 404 }); };
  agentState.mutate({ lesson: "new" });
  await agent.pushNow();
  const review = await learner.prepareMerge({ channel: "agent" });
  assert.equal(review.hasBase, false);
  assert.ok(review.rows.every((r) => r.suggested === null));
  await assert.rejects(learner.applyMerge({ reviewId: review.id }), /Choose/);
});

test("a failed merge write leaves the complete local workspace unchanged", async () => {
  const { github, learner, learnerState, agent, agentState } = await mergeFixture();
  learnerState.mutate({ answer: "local" });
  agentState.mutate({ lesson: "remote" });
  await agent.pushNow();
  const review = await learner.prepareMerge({ channel: "agent" });
  const local = learnerState.serialize();
  github.writeFile = async () => { throw new Error("Offline"); };
  await assert.rejects(learner.applyMerge({ reviewId: review.id }), /Offline/);
  assert.equal(learnerState.serialize(), local);
});

test("invalid dependency choices stay reviewable and are not reported as a connection failure", async () => {
  const { github, learnerState, agent, agentState } = await mergeFixture();
  agentState.mutate({ note: "New note" });
  await agent.pushNow();
  const learner = controller({ role: "learner", client: github, harness: learnerState,
    validateMergeState: () => { throw Object.assign(new Error("Feedback needs its unfinished test."), { code: "merge_dependency" }); },
  });
  await learner.connect(connection(), { startPolling: false });
  const before = learnerState.serialize();
  const sha = github.files.get(LEARNER_STATE_PATH).sha;
  const review = await learner.prepareMerge({ channel: "agent" });
  await assert.rejects(learner.applyMerge({ reviewId: review.id }), /unfinished test/);
  assert.equal(learner.snapshot().phase, "conflict");
  assert.equal(learner.snapshot().conflictDetails.reason, "dependencies");
  assert.equal(learnerState.serialize(), before);
  assert.equal(github.files.get(LEARNER_STATE_PATH).sha, sha);
  assert.equal((await learner.prepareMerge({ channel: "agent" })).rows.length, review.rows.length);
});

test("edits during a merge write survive and the saved remote result can be reviewed again", async () => {
  const { github, learner, learnerState, agent, agentState } = await mergeFixture();
  learnerState.mutate({ answer: "before" });
  agentState.mutate({ lesson: "remote" });
  await agent.pushNow();
  const review = await learner.prepareMerge({ channel: "agent" });
  const write = github.writeFile;
  github.writeFile = async (...args) => { const result = await write(...args); learnerState.mutate({ answer: "during write" }); return result; };
  await assert.rejects(learner.applyMerge({ reviewId: review.id }), /changed during review/);
  assert.equal(learnerState.read().answer, "during write");
  assert.equal(learnerState.read().lesson, undefined);
  const refreshed = await learner.prepareMerge({ channel: "agent" });
  assert.equal(refreshed.channel, "learner");
  assert.ok(refreshed.rows.some((row) => row.local === "during write"));
});

test("Bridge hands staged lesson batches to the learner for individual approval", async () => {
  const curriculum = JSON.parse(readFileSync(new URL("./curriculum-data.json", import.meta.url), "utf8"));
  const packs = ["./lesson-set-example.json", "./lesson-depot/lessons/geography/1.0.0/lesson-set.json"]
    .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
  const github = fakeGitHub();
  const learnerStore = createQuickMathsStore({ storage: new MemoryStorage(), curriculum });
  const agentStore = createQuickMathsStore({ storage: new MemoryStorage(), curriculum });
  learnerStore.createProfile("Bridge Learner");
  const workspace = (store) => ({ serialize: store.exportSyncState, apply: store.importSyncState, subscribe: store.subscribe });
  const learner = controller({ role: "learner", client: github, harness: workspace(learnerStore) });
  const agent = controller({ role: "agent", client: github, harness: workspace(agentStore) });
  await learner.connect(connection(), { startPolling: false });
  await learner.pushNow();
  await agent.connect(connection("agent"), { startPolling: false });
  await agent.pullNow();
  agentStore.stageLessonPacks(packs, { activityActor: "agent" });
  await agent.pushNow();
  assert.equal((await learner.pullNow()).updated, true);
  assert.equal(learnerStore.snapshot().ui.route, "settings");
  assert.equal(learnerStore.snapshot().stagedLessonPack.id, "PACK_PERSONAL_FINANCE");
  assert.equal(learnerStore.snapshot().stagedLessonPack.batchTotal, 2);
  assert.equal(learnerStore.snapshot().lessonPacks.length, 0);

  learnerStore.installStagedLessonPack();
  await learner.pushNow();
  await agent.pullNow();
  assert.equal(agentStore.snapshot().lessonPacks.length, 1);
  assert.equal(agentStore.snapshot().stagedLessonPack.id, "PACK_GEOGRAPHY");
  assert.equal(agentStore.snapshot().stagedLessonPack.batchIndex, 2);

  learnerStore.discardStagedLessonPack();
  await learner.pushNow();
  await agent.pullNow();
  assert.equal(agentStore.snapshot().stagedLessonPack, null);
  await agent.pushNow();
  await learner.pullNow();
  assert.equal(learnerStore.snapshot().stagedLessonPack, null);
  assert.equal(learnerStore.snapshot().lessonPacks.length, 1);
});

test("normalizes repository configuration and rejects unsafe identifiers", () => {
  assert.deepEqual(normalizeGitHubSyncConfig(connection()), {
    owner: "octo-user", repo: "quickmaths-sync", branch: "main", token: "github-token", role: "learner", rememberToken: false,
  });
  assert.throws(() => normalizeGitHubSyncConfig({ ...connection(), owner: "bad/owner" }), /owner is invalid/i);
  assert.throws(() => normalizeGitHubSyncConfig({ ...connection(), branch: "bad branch" }), /branch name/i);
  assert.throws(() => normalizeGitHubSyncConfig({ ...connection(), token: "" }), /token is required/i);
  assert.throws(() => normalizeGitHubSyncConfig({ ...connection(), repo: "QuickMaths" }), /separate private data repository/i);
});

test("credential storage keeps repository config separate from the token", () => {
  const configStorage = new MemoryStorage();
  const session = new MemoryStorage();
  const persistent = new MemoryStorage();
  const store = createGitHubCredentialStore({ configStorage, sessionCredentialStorage: session, persistentCredentialStorage: persistent });
  store.save(connection());
  assert.equal(configStorage.getItem("quickmaths.github-sync.config.learner.v1").includes("github-token"), false);
  assert.equal(session.getItem("quickmaths.github-sync.token.session.learner.v1"), "github-token");
  assert.equal(store.load().token, "github-token");

  store.save({ ...connection(), token: "remembered", rememberToken: true });
  assert.equal(session.getItem("quickmaths.github-sync.token.session.learner.v1"), null);
  assert.equal(persistent.getItem("quickmaths.github-sync.token.persistent.learner.v1"), "remembered");
  store.save({ ...connection("agent"), token: "agent-token" });
  assert.equal(store.load({ role: "agent" }).token, "agent-token");
  assert.equal(store.load({ role: "learner" }).token, "remembered");
  store.clear();
  assert.equal(store.load(), null);
  assert.equal(store.load({ role: "agent" }).token, "agent-token");
});

test("workspace storage rejects public repositories and read-only tokens before saving credentials", async () => {
  for (const repository of [
    { private: false, permissions: { push: true } },
    { private: true, permissions: { push: false } },
  ]) {
    const credentialStore = credentials();
    const harness = stateHarness("Learner");
    const sync = createGitHubSyncController({
      role: "learner",
      client: { async verify(config) { return { owner: config.owner, repo: config.repo, defaultBranch: config.branch, ...repository }; } },
      credentialStore,
      serializeState: harness.serialize,
      applyState: harness.apply,
      subscribeToState: harness.subscribe,
      setTimer: () => 1,
      clearTimer() {},
    });
    await assert.rejects(() => sync.connect(connection(), { startPolling: false }), repository.private ? /write access/i : /private repository/i);
    assert.equal(credentialStore.load({ role: "learner" }), null);
    assert.equal(sync.snapshot().connected, false);
  }
});

test("bridge envelopes preserve unicode state and channel metadata", () => {
  const raw = createBridgeEnvelope({
    channel: "agent",
    stateJson: JSON.stringify({ learner: "Jadranko Σ", score: 92 }),
    deviceId: "agent-one",
    deviceLabel: "Codex bridge on Windows",
    actorKind: "agent",
    actorLabel: "Curriculum helper",
    baseLearnerSha: "base-sha",
    now: () => new Date("2026-09-01T10:00:00.000Z"),
  });
  const value = JSON.parse(raw);
  assert.equal(value.format, BRIDGE_FORMAT);
  const parsed = parseBridgeEnvelope(raw, { expectedChannel: "agent" });
  assert.equal(JSON.parse(parsed.stateJson).learner, "Jadranko Σ");
  assert.equal(parsed.baseLearnerSha, "base-sha");
  assert.equal(parsed.deviceLabel, "Codex bridge on Windows");
  assert.equal(parsed.actorKind, "agent");
  assert.equal(parsed.actorLabel, "Curriculum helper");
  assert.throws(() => parseBridgeEnvelope(raw, { expectedChannel: "learner" }), /wrong channel/i);
});

test("contents client reads and writes Base64 GitHub files", async () => {
  const calls = [];
  const responses = [
    new Response(JSON.stringify({ owner: { login: "octo-user" }, name: "quickmaths-sync", private: true, default_branch: "main", permissions: { push: true } }), { status: 200 }),
    new Response(JSON.stringify({ type: "file", sha: "old-sha", content: btoa(unescape(encodeURIComponent("hello Σ"))) }), { status: 200 }),
    new Response(JSON.stringify({ content: { sha: "new-sha" }, commit: { sha: "commit-sha" } }), { status: 200 }),
    new Response(JSON.stringify({ content: null, commit: { sha: "delete-commit-sha" } }), { status: 200 }),
  ];
  const client = createGitHubContentsClient({
    fetchImpl: async (url, options = {}) => { calls.push({ url, options }); return responses.shift(); },
  });
  const verified = await client.verify(connection());
  assert.equal(verified.private, true);
  const file = await client.readFile(connection(), LEARNER_STATE_PATH);
  assert.equal(file.content, "hello Σ");
  const written = await client.writeFile(connection(), LEARNER_STATE_PATH, "next Σ", { sha: file.sha });
  assert.deepEqual(written, { sha: "new-sha", commitSha: "commit-sha" });
  const requestBody = JSON.parse(calls[2].options.body);
  assert.equal(decodeURIComponent(escape(atob(requestBody.content))), "next Σ");
  assert.equal(requestBody.sha, "old-sha");
  assert.equal(calls[2].options.headers.Authorization, "Bearer github-token");
  const deleted = await client.deleteFile(connection(), LEARNER_STATE_PATH, { sha: "new-sha" });
  assert.deepEqual(deleted, { deleted: true, commitSha: "delete-commit-sha" });
  const deleteBody = JSON.parse(calls[3].options.body);
  assert.equal(calls[3].options.method, "DELETE");
  assert.equal(deleteBody.sha, "new-sha");
  assert.equal(deleteBody.branch, "main");
});

test("contents client reads checkpoints above GitHub's one-megabyte inline limit through the blob endpoint", async () => {
  const calls = [];
  const checkpoint = JSON.stringify({ format: BRIDGE_FORMAT, channel: "learner", payload: "large checkpoint" });
  const responses = [
    new Response(JSON.stringify({ type: "file", sha: "large-sha", size: 1_122_948, encoding: "none", content: "" }), { status: 200 }),
    new Response(JSON.stringify({ sha: "large-sha", size: checkpoint.length, encoding: "base64", content: btoa(checkpoint) }), { status: 200 }),
  ];
  const client = createGitHubContentsClient({
    fetchImpl: async (url, options = {}) => { calls.push({ url, options }); return responses.shift(); },
  });

  const file = await client.readFile(connection(), LEARNER_STATE_PATH);

  assert.equal(file.sha, "large-sha");
  assert.equal(file.content, checkpoint);
  assert.match(calls[1].url, /\/git\/blobs\/large-sha$/);
  assert.equal(calls[1].options.headers.Authorization, "Bearer github-token");
});

test("contents client preserves a genuinely empty checkpoint instead of requesting a blob", async () => {
  let calls = 0;
  const client = createGitHubContentsClient({
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ type: "file", sha: "empty-sha", size: 0, encoding: "base64", content: "" }), { status: 200 });
    },
  });

  const file = await client.readFile(connection(), LEARNER_STATE_PATH);

  assert.equal(file.content, "");
  assert.equal(calls, 1);
});

test("learner can discard stale agent state and clear both current workspace files", async () => {
  const github = fakeGitHub();
  const learnerState = stateHarness("Learner");
  const agentState = stateHarness("Agent");
  const credentialStore = credentials();
  const learner = controller({ role: "learner", client: github, harness: learnerState, credentialStore });
  const agent = controller({ role: "agent", client: github, harness: agentState });
  await learner.connect(connection(), { startPolling: false });
  await learner.pushNow();
  await agent.connect(connection("agent"), { startPolling: false });
  await agent.pullNow();
  await agent.pushNow();
  assert.equal(github.files.has(LEARNER_STATE_PATH), true);
  assert.equal(github.files.has(AGENT_STATE_PATH), true);

  const agentDeletion = await learner.deleteRemoteAgentCheckpoint();
  assert.deepEqual(agentDeletion, { deleted: true, path: AGENT_STATE_PATH });
  assert.equal(github.files.has(AGENT_STATE_PATH), false);
  await agent.pullNow();
  await agent.pushNow();

  const cleared = await learner.clearRemoteWorkspace();
  assert.deepEqual(new Set(cleared.deletedPaths), new Set([AGENT_STATE_PATH, LEARNER_STATE_PATH]));
  assert.equal(github.files.size, 0);
  assert.equal(learner.snapshot().remoteAvailable, false);
  assert.equal(learner.snapshot().dirty, false);
  learnerState.mutate({ profiles: [], activeProfileId: null });
  assert.equal(learner.snapshot().dirty, true);
  learner.resumeAfterClear();
  assert.equal(learner.snapshot().connected, true);
  assert.equal(learner.snapshot().dirty, false);
  assert.equal(credentialStore.load({ role: "learner" }).token, "github-token");
});

test("learner checkpoints are debounced and can be pushed manually", async () => {
  const github = fakeGitHub();
  const learnerState = stateHarness("Learner");
  const learner = controller({ role: "learner", client: github, harness: learnerState });
  await learner.connect(connection(), { startPolling: false });
  learnerState.mutate({ score: 1 });
  learnerState.mutate({ score: 2 });
  assert.equal(learner.snapshot().dirty, true);
  assert.equal(github.files.has(LEARNER_STATE_PATH), false);
  await learner.pushNow();
  assert.equal(parseBridgeEnvelope(github.files.get(LEARNER_STATE_PATH).content).channel, "learner");
  assert.equal(JSON.parse(parseBridgeEnvelope(github.files.get(LEARNER_STATE_PATH).content).stateJson).score, 2);
  assert.equal(learner.snapshot().dirty, false);
  assert.equal(learner.snapshot().lastRemoteActor, "QuickMaths device");
});

test("continuous learner activity cannot postpone the scheduled checkpoint forever", async () => {
  const github = fakeGitHub();
  const learnerState = stateHarness("Learner");
  const scheduled = [];
  const learner = createGitHubSyncController({
    role: "learner",
    client: github,
    credentialStore: credentials(),
    serializeState: learnerState.serialize,
    applyState: learnerState.apply,
    subscribeToState: learnerState.subscribe,
    deviceId: "active-learner-device",
    setTimer(callback) { scheduled.push(callback); return scheduled.length; },
    clearTimer() {},
  });
  await learner.connect(connection(), { startPolling: false });

  learnerState.mutate({ sessionSeconds: 1 });
  learnerState.mutate({ sessionSeconds: 2, answerDraft: "latest work" });
  learnerState.mutate({ sessionSeconds: 3, answerDraft: "latest work" });

  assert.equal(scheduled.length, 1);
  await scheduled[0]();
  const saved = JSON.parse(parseBridgeEnvelope(github.files.get(LEARNER_STATE_PATH).content).stateJson);
  assert.equal(saved.sessionSeconds, 3);
  assert.equal(saved.answerDraft, "latest work");
});

test("agent pulls learner state, publishes a based response, and learner applies it", async () => {
  const github = fakeGitHub();
  const learnerState = stateHarness("Learner");
  const agentState = stateHarness("Empty agent");
  const learner = controller({ role: "learner", client: github, harness: learnerState });
  const agent = controller({ role: "agent", client: github, harness: agentState });
  await learner.connect(connection(), { startPolling: false });
  await learner.pushNow();
  await agent.connect(connection("agent"), { startPolling: false });
  const pulled = await agent.pullNow();
  assert.equal(pulled.updated, true);
  assert.equal(agentState.read().profiles[0].displayName, "Learner");

  agentState.mutate({ tutorNote: "Try the inequality lesson next." });
  await agent.pushNow();
  const agentEnvelope = parseBridgeEnvelope(github.files.get(AGENT_STATE_PATH).content);
  assert.equal(agentEnvelope.baseLearnerSha, github.files.get(LEARNER_STATE_PATH).sha);

  await learner.inspectRemote();
  const received = await learner.pullNow();
  assert.equal(received.updated, true);
  assert.equal(learnerState.read().tutorNote, "Try the inequality lesson next.");
  await learner.pushNow();
  const acknowledged = parseBridgeEnvelope(github.files.get(LEARNER_STATE_PATH).content);
  assert.equal(acknowledged.actorKind, "agent");
  assert.equal(acknowledged.actorLabel, "QuickMaths agent");
});

test("learner polling follows the canonical workspace on every route when local state is clean", async () => {
  const github = fakeGitHub();
  const phoneState = stateHarness("Phone");
  const desktopState = stateHarness("Desktop");
  const phone = controller({ role: "learner", client: github, harness: phoneState, deviceId: "phone", deviceLabel: "Firefox on Android" });
  const desktop = controller({ role: "learner", client: github, harness: desktopState, deviceId: "desktop", deviceLabel: "OpenAI in-app browser on Windows" });
  await phone.connect(connection(), { startPolling: false });
  await phone.pushNow();
  await desktop.connect(connection(), { startPolling: false });
  await desktop.restoreLearner({ force: true });
  phoneState.mutate({ currentLesson: "MATH_ALG_004" });
  await phone.pushNow();

  const result = await desktop.syncLearnerNow();

  assert.equal(result.updated, true);
  assert.equal(desktopState.read().currentLesson, "MATH_ALG_004");
  assert.equal(desktop.snapshot().lastRemoteActor, "Firefox on Android");
});

test("learner polling exposes source metadata when another device races unsynced local work", async () => {
  const github = fakeGitHub();
  const phoneState = stateHarness("Phone");
  const desktopState = stateHarness("Desktop");
  const phone = controller({ role: "learner", client: github, harness: phoneState, deviceId: "phone", deviceLabel: "Firefox on Android" });
  const desktop = controller({ role: "learner", client: github, harness: desktopState, deviceId: "desktop", deviceLabel: "OpenAI in-app browser on Windows" });
  await phone.connect(connection(), { startPolling: false });
  await phone.pushNow();
  await desktop.connect(connection(), { startPolling: false });
  await desktop.restoreLearner({ force: true });
  desktopState.mutate({ localDraft: "not pushed" });
  phoneState.mutate({ currentLesson: "MATH_ALG_005" });
  await phone.pushNow();

  await assert.rejects(desktop.syncLearnerNow(), /newer QuickMaths workspace/i);

  assert.equal(desktop.snapshot().conflictDetails.channel, "learner");
  assert.equal(desktop.snapshot().conflictDetails.remoteDeviceId, "phone");
  assert.equal(desktop.snapshot().conflictDetails.remoteActorLabel, "Firefox on Android");
});

test("an applied agent remains the recorded writer when its learner acknowledgement resumes after reload", async () => {
  const github = fakeGitHub();
  const learnerState = stateHarness("Learner");
  const agentState = stateHarness("Agent");
  const learnerCredentials = credentials();
  const learner = controller({ role: "learner", client: github, harness: learnerState, credentialStore: learnerCredentials, deviceId: "browser", deviceLabel: "Firefox on Android" });
  const agent = controller({ role: "agent", client: github, harness: agentState, deviceId: "codex", deviceLabel: "Codex agent bridge" });
  await learner.connect(connection(), { startPolling: false });
  await learner.pushNow();
  await agent.connect(connection("agent"), { startPolling: false });
  await agent.pullNow();
  agentState.mutate({ agentPlan: "A fresh path" });
  await agent.pushNow();
  await learner.pullNow();
  learner.stop();

  const resumed = controller({ role: "learner", client: github, harness: learnerState, credentialStore: learnerCredentials, deviceId: "browser", deviceLabel: "Firefox on Android" });
  await resumed.resume({ startPolling: false });
  await resumed.pushNow();

  const checkpoint = parseBridgeEnvelope(github.files.get(LEARNER_STATE_PATH).content);
  assert.equal(checkpoint.actorKind, "agent");
  assert.equal(checkpoint.actorLabel, "Codex agent bridge");
});

test("agent changes stay dirty until an explicit checkpoint is published", async () => {
  const github = fakeGitHub();
  const learnerState = stateHarness("Learner");
  const agentState = stateHarness("Empty agent");
  const learner = controller({ role: "learner", client: github, harness: learnerState });
  const scheduled = [];
  const agent = createGitHubSyncController({
    role: "agent",
    client: github,
    credentialStore: credentials(),
    serializeState: agentState.serialize,
    applyState: agentState.apply,
    subscribeToState: agentState.subscribe,
    now: () => new Date("2026-09-01T12:00:00.000Z"),
    deviceId: "agent-device",
    setTimer(callback) { scheduled.push(callback); return scheduled.length; },
    clearTimer() {},
  });

  await learner.connect(connection(), { startPolling: false });
  await learner.pushNow();
  await agent.connect(connection("agent"), { startPolling: false });
  await agent.pullNow();
  agentState.mutate({ tutorNote: "Work through the next example." });

  assert.equal(agent.snapshot().dirty, true);
  assert.equal(scheduled.length, 0);
  for (const callback of scheduled) await callback();
  assert.equal(github.files.has(AGENT_STATE_PATH), false);

  await agent.pushNow();
  assert.equal(github.files.has(AGENT_STATE_PATH), true);
  assert.equal(JSON.parse(parseBridgeEnvelope(github.files.get(AGENT_STATE_PATH).content).stateJson).tutorNote, "Work through the next example.");
});

test("overlapping agent output publishes with its original task time and opens a merge", async () => {
  const github = fakeGitHub();
  const learnerState = stateHarness("Learner");
  const agentState = stateHarness("Agent");
  const learner = controller({ role: "learner", client: github, harness: learnerState });
  const agent = controller({ role: "agent", client: github, harness: agentState });
  await learner.connect(connection(), { startPolling: false });
  await learner.pushNow();
  await agent.connect(connection("agent"), { startPolling: false });
  await agent.pullNow();

  learnerState.mutate({ score: 10 });
  await learner.pushNow();
  agentState.mutate({ staleTutorNote: true });
  await agent.pushNow();
  const envelope = parseBridgeEnvelope(github.files.get(AGENT_STATE_PATH).content);
  assert.equal(envelope.taskStartedAt, "2026-09-01T12:00:00.000Z");
  await assert.rejects(learner.pullNow(), /changed while the agent/i);
  assert.equal(learner.snapshot().conflictDetails.channel, "agent");
  assert.equal(learnerState.read().staleTutorNote, undefined);
});

test("learner retains both sides of an overlapping task until the merge is saved", async () => {
  const github = fakeGitHub();
  const learnerState = stateHarness("Learner");
  const agentState = stateHarness("Agent");
  const learner = controller({ role: "learner", client: github, harness: learnerState });
  const agent = controller({ role: "agent", client: github, harness: agentState });
  await learner.connect(connection(), { startPolling: false });
  await learner.pushNow();
  await agent.connect(connection("agent"), { startPolling: false });
  await agent.pullNow();
  agentState.mutate({ staleTutorNote: "This must never be applied." });
  await agent.pushNow();

  learnerState.mutate({ newerLearnerWork: true });
  await assert.rejects(learner.pushNow(), /agent update is waiting/i);
  await assert.rejects(learner.pullNow(), /changed while the agent/i);
  assert.equal(learnerState.read().staleTutorNote, undefined);
  const review = await learner.prepareMerge({ channel: "agent" });
  assert.equal(review.hasBase, true);
  await learner.applyMerge({ reviewId: review.id });
  assert.equal(learnerState.read().newerLearnerWork, true);
  assert.equal(learnerState.read().staleTutorNote, "This must never be applied.");
  const checkpoint = parseBridgeEnvelope(github.files.get(LEARNER_STATE_PATH).content);
  assert.equal(checkpoint.appliedAgentSha, github.files.get(AGENT_STATE_PATH).sha);
  assert.equal(checkpoint.resolvedAgentSha, checkpoint.appliedAgentSha);
  assert.equal((await learner.pullNow()).updated, false);
});

test("even explicit force never retries by overwriting an unseen raced version", async () => {
  const github = fakeGitHub();
  const firstState = stateHarness("First");
  const secondState = stateHarness("Second");
  const first = controller({ role: "learner", client: github, harness: firstState });
  await first.connect(connection(), { startPolling: false });
  await first.pushNow();

  let injectedRace = false;
  const racingClient = {
    ...github,
    async writeFile(config, path, content, options = {}) {
      if (!injectedRace && path === LEARNER_STATE_PATH && options.sha) {
        injectedRace = true;
        await github.writeFile(config, path, createBridgeEnvelope({
          channel: "learner",
          stateJson: JSON.stringify({ version: 8, profiles: [], raced: true }),
          deviceId: "racing-device",
        }), { sha: options.sha });
      }
      return github.writeFile(config, path, content, options);
    },
  };
  const second = controller({ role: "learner", client: racingClient, harness: secondState });
  await second.connect(connection(), { startPolling: false });
  await assert.rejects(second.pushNow({ force: true }), GitHubSyncConflictError);
  const resolved = parseBridgeEnvelope(github.files.get(LEARNER_STATE_PATH).content);
  assert.equal(JSON.parse(resolved.stateJson).raced, true);
  assert.equal(second.snapshot().phase, "conflict");
});

test("a stale open tab cannot erase the revision persisted by a successful push", async () => {
  const github = fakeGitHub();
  const credentialStore = credentials();
  const firstState = stateHarness("First tab");
  const staleState = stateHarness("Stale tab");
  const first = controller({ role: "learner", client: github, harness: firstState, credentialStore });
  const stale = controller({ role: "learner", client: github, harness: staleState, credentialStore });

  await first.connect(connection(), { startPolling: false });
  await stale.connect(connection(), { startPolling: false });
  await first.pushNow();
  stale.schedulePush();

  const resumedState = stateHarness("Reloaded tab");
  const resumed = controller({ role: "learner", client: github, harness: resumedState, credentialStore });
  await resumed.resume({ startPolling: false });
  await resumed.pushNow();

  assert.equal(resumed.snapshot().phase, "synced");
  assert.equal(parseBridgeEnvelope(github.files.get(LEARNER_STATE_PATH).content).channel, "learner");
});

test("changes made while a saved bridge is offline remain dirty for the next resume", async () => {
  const github = fakeGitHub();
  const learnerState = stateHarness("Learner");
  const credentialStore = credentials();
  const learner = createGitHubSyncController({
    role: "learner",
    client: github,
    credentialStore,
    serializeState: learnerState.serialize,
    applyState: learnerState.apply,
    subscribeToState: learnerState.subscribe,
    deviceId: "offline-device",
    setTimer: () => 1,
    clearTimer: () => {},
  });
  await learner.connect(connection(), { startPolling: false });
  await learner.pushNow();
  learner.stop();
  learnerState.mutate({ offlineAnswer: "kept" });
  assert.equal(learner.snapshot().dirty, true);
  assert.equal(credentialStore.loadMetadata({ role: "learner" }).dirty, true);
});

test("uncheckpointed learner changes reject an otherwise current agent response", async () => {
  const github = fakeGitHub();
  const learnerState = stateHarness("Learner");
  const agentState = stateHarness("Agent");
  const learner = controller({ role: "learner", client: github, harness: learnerState });
  const agent = controller({ role: "agent", client: github, harness: agentState });
  await learner.connect(connection(), { startPolling: false });
  await learner.pushNow();
  await agent.connect(connection("agent"), { startPolling: false });
  await agent.pullNow();
  agentState.mutate({ tutorNote: "Review this next." });
  await agent.pushNow();

  learnerState.mutate({ localAnswer: "still typing" });
  await assert.rejects(learner.pullNow(), /changed while the agent/i);
  assert.equal(learnerState.read().tutorNote, undefined);
});

test("remote file changes cause optimistic push conflicts", async () => {
  const github = fakeGitHub();
  const firstState = stateHarness("First");
  const secondState = stateHarness("Second");
  const first = controller({ role: "learner", client: github, harness: firstState });
  const second = controller({ role: "learner", client: github, harness: secondState });
  await first.connect(connection(), { startPolling: false });
  await first.pushNow();
  await second.connect(connection(), { startPolling: false });
  await assert.rejects(second.pushNow(), /newer copy/i);
  await second.restoreLearner({ force: true });
  secondState.mutate({ score: 7 });
  await second.pushNow();
  firstState.mutate({ score: 8 });
  await assert.rejects(first.pushNow(), /newer copy/i);
  assert.equal(first.snapshot().conflictDetails.channel, "learner");
});


async function legacySeenAgentFixture() {
  const { github, learnerState, agent, agentState } = await mergeFixture();
  learnerState.mutate({ positions: { fractions: { x: 2, y: 3 }, algebra: { x: 4, y: 5 } } });
  agentState.mutate({ note: "New Fractions basics note" });
  await agent.pushNow();
  const agentSha = github.files.get(AGENT_STATE_PATH).sha;
  const latest = github.files.get(LEARNER_STATE_PATH);
  const canonical = await github.writeFile(connection(), LEARNER_STATE_PATH, createBridgeEnvelope({ channel: "learner", stateJson: learnerState.serialize(), deviceId: "phone", appliedAgentSha: agentSha }), { sha: latest.sha });
  const credentialStore = credentials();
  credentialStore.save(connection());
  credentialStore.saveMetadata({ role: "learner", metadata: { repositoryKey: "octo-user/quickmaths-sync@main", learnerSha: canonical.sha, agentSha, dirty: false } });
  const learner = controller({ role: "learner", client: github, harness: learnerState, credentialStore });
  await learner.resume({ startPolling: false });
  return { github, learnerState, learner, agentSha, credentialStore };
}

test("legacy seen-only acknowledgements cannot hide a pending note or be promoted by Sync now", async () => {
  const { github, learnerState, learner, agentSha } = await legacySeenAgentFixture();
  const canonical = github.files.get(LEARNER_STATE_PATH).sha;
  await learner.syncLearnerNow();
  await assert.rejects(learner.pushNow(), /agent update is waiting/i);
  await assert.rejects(learner.pushNow({ force: true }), /agent update is waiting/i);
  assert.equal(github.files.get(LEARNER_STATE_PATH).sha, canonical);
  await assert.rejects(learner.pullNow(), (error) => error.details.channel === "agent");
  const review = await learner.prepareMerge({ channel: "learner" });
  assert.equal(review.channel, "agent");
  assert.ok(review.rows.some((row) => row.remote === "New Fractions basics note"));
  await learner.applyMerge({ reviewId: review.id });
  assert.equal(learnerState.read().note, "New Fractions basics note");
  assert.equal(learnerState.read().positions.fractions.x, 2);
  const checkpoint = parseBridgeEnvelope(github.files.get(LEARNER_STATE_PATH).content);
  assert.equal(checkpoint.resolvedAgentSha, agentSha);
  await learner.pushNow();
  assert.equal((await learner.pullNow()).updated, false);
});

test("a new explicit choice to skip a note remains resolved after reload and on other devices", async () => {
  const { github, learnerState, learner, credentialStore } = await legacySeenAgentFixture();
  const review = await learner.prepareMerge({ channel: "agent" });
  const note = review.rows.find((row) => row.path[0] === "note");
  await learner.applyMerge({ reviewId: review.id, choices: { [note.id]: "base" } });
  assert.equal(learnerState.read().note, undefined);
  const reloaded = controller({ role: "learner", client: github, harness: learnerState, credentialStore });
  await reloaded.resume({ startPolling: false });
  assert.equal((await reloaded.pullNow()).updated, false);
  const secondState = stateHarness("Second device");
  const second = controller({ role: "learner", client: github, harness: secondState });
  await second.connect(connection(), { startPolling: false });
  await second.restoreLearner();
  assert.equal((await second.pullNow()).updated, false);
  assert.equal(secondState.read().note, undefined);
});

test("legacy acceptance needs review even when the shared content happens to equal the task base", async () => {
  const { github, learner, agent, agentState, learnerState } = await mergeFixture();
  agentState.mutate({ note: "Review this previously skipped update" });
  await agent.pushNow();
  const latest = github.files.get(LEARNER_STATE_PATH);
  await github.writeFile(connection(), LEARNER_STATE_PATH, createBridgeEnvelope({ channel: "learner", stateJson: learnerState.serialize(), deviceId: "phone", appliedAgentSha: github.files.get(AGENT_STATE_PATH).sha }), { sha: latest.sha });
  await assert.rejects(learner.pullNow(), (error) => error.details.channel === "agent");
  assert.equal(learnerState.read().note, undefined);
});
