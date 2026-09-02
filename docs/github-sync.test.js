import test from "node:test";
import assert from "node:assert/strict";

import {
  AGENT_STATE_PATH,
  BRIDGE_FORMAT,
  createBridgeEnvelope,
  createGitHubContentsClient,
  createGitHubCredentialStore,
  createGitHubSyncController,
  GitHubSyncConflictError,
  LEARNER_STATE_PATH,
  normalizeGitHubSyncConfig,
  parseBridgeEnvelope,
} from "./github-sync.js";

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
  let revision = 0;
  return {
    files,
    async verify(config) { return { owner: config.owner, repo: config.repo, private: true, defaultBranch: config.branch }; },
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
      return { sha: next.sha, commitSha: `commit-${revision}` };
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

function controller({ role, client, harness, date = "2026-09-01T12:00:00.000Z" }) {
  return createGitHubSyncController({
    role,
    client,
    credentialStore: credentials(),
    serializeState: harness.serialize,
    applyState: harness.apply,
    subscribeToState: harness.subscribe,
    now: () => new Date(date),
    deviceId: `${role}-device`,
    setTimer: () => 1,
    clearTimer: () => {},
  });
}

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

test("bridge envelopes preserve unicode state and channel metadata", () => {
  const raw = createBridgeEnvelope({
    channel: "agent",
    stateJson: JSON.stringify({ learner: "Jadranko Σ", score: 92 }),
    deviceId: "agent-one",
    baseLearnerSha: "base-sha",
    now: () => new Date("2026-09-01T10:00:00.000Z"),
  });
  const value = JSON.parse(raw);
  assert.equal(value.format, BRIDGE_FORMAT);
  const parsed = parseBridgeEnvelope(raw, { expectedChannel: "agent" });
  assert.equal(JSON.parse(parsed.stateJson).learner, "Jadranko Σ");
  assert.equal(parsed.baseLearnerSha, "base-sha");
  assert.throws(() => parseBridgeEnvelope(raw, { expectedChannel: "learner" }), /wrong channel/i);
});

test("contents client reads and writes Base64 GitHub files", async () => {
  const calls = [];
  const responses = [
    new Response(JSON.stringify({ owner: { login: "octo-user" }, name: "quickmaths-sync", private: true, default_branch: "main" }), { status: 200 }),
    new Response(JSON.stringify({ type: "file", sha: "old-sha", content: btoa(unescape(encodeURIComponent("hello Σ"))) }), { status: 200 }),
    new Response(JSON.stringify({ content: { sha: "new-sha" }, commit: { sha: "commit-sha" } }), { status: 200 }),
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

test("stale agent output is rejected before it can overwrite newer learner work", async () => {
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
  await assert.rejects(agent.pushNow(), /learner changed/i);
  assert.equal(agent.snapshot().phase, "conflict");
  assert.equal(learnerState.read().staleTutorNote, undefined);
});

test("learner safely acknowledges an agent response made stale by newer learner work", async () => {
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
  await learner.pushNow();
  const ignored = await learner.pullNow();
  assert.equal(ignored.stale, true);
  assert.equal(ignored.ignored, true);
  assert.equal(learnerState.read().staleTutorNote, undefined);
  assert.equal(learner.snapshot().phase, "synced");
  assert.equal(learner.snapshot().conflict, null);

  const alreadyAcknowledged = await learner.pullNow();
  assert.equal(alreadyAcknowledged.updated, false);
  assert.equal(alreadyAcknowledged.stale, undefined);
});

test("explicit learner conflict resolution retries one raced remote write", async () => {
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
  await second.pushNow({ force: true });
  const resolved = parseBridgeEnvelope(github.files.get(LEARNER_STATE_PATH).content);
  assert.equal(JSON.parse(resolved.stateJson).profiles[0].displayName, "Second");
  assert.equal(second.snapshot().phase, "synced");
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
  await assert.rejects(learner.pullNow(), /not checkpointed yet/i);
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
});
