import test from "node:test";
import assert from "node:assert/strict";

import {
  createLocalBridgeCredentialStore,
  createLocalGitContentsClient,
  resolveLocalBridgeCapability,
} from "./local-git-client.js";

const capability = "a".repeat(43);

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test("local capability moves from the URL fragment into session-only storage", () => {
  const storage = new MemoryStorage();
  const replacements = [];
  const resolved = resolveLocalBridgeCapability({
    hash: `#local=${capability}`,
    sessionStorage: storage,
    history: { replaceState(...args) { replacements.push(args); } },
    location: { pathname: "/agent-bridge.html", search: "" },
  });
  assert.equal(resolved, capability);
  assert.equal(storage.getItem("quickmaths.local-git.capability.v1"), capability);
  assert.deepEqual(replacements[0], [null, "", "/agent-bridge.html"]);
  assert.equal(resolveLocalBridgeCapability({ hash: "", sessionStorage: storage }), capability);
  assert.equal(resolveLocalBridgeCapability({ hash: "#local=short", sessionStorage: new MemoryStorage() }), null);
});
test("local client mirrors the GitHub Contents contract without forwarding credentials", async () => {
  const calls = [];
  const responses = [
    new Response(JSON.stringify({ transport: "local-git", owner: "octo", repo: "sync", branch: "main", revision: "commit" })),
    new Response(JSON.stringify({ exists: true, sha: "blob-one", content: "checkpoint" })),
    new Response(JSON.stringify({ sha: "blob-two", commitSha: "commit-two" })),
  ];
  const client = createLocalGitContentsClient({
    capability,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return responses.shift(); },
  });
  const repository = await client.verify({ token: "must-not-forward" });
  assert.equal(repository.transport, "local-git");
  assert.equal((await client.readFile({}, "learner-state.json")).sha, "blob-one");
  assert.deepEqual(await client.writeFile({}, "agent-state.json", "next", { sha: "blob-one" }), { sha: "blob-two", commitSha: "commit-two" });
  assert.ok(calls.every((call) => call.options.headers["X-QuickMaths-Bridge"] === capability));
  assert.equal(JSON.stringify(calls).includes("must-not-forward"), false);
  assert.deepEqual(JSON.parse(calls[2].options.body), { content: "next", sha: "blob-one" });
  await assert.rejects(client.readFile({}, "../../secret"), /path is invalid/i);
});

test("local client maps optimistic conflicts and keeps metadata separate", async () => {
  const client = createLocalGitContentsClient({
    capability,
    fetchImpl: async () => new Response(JSON.stringify({ error: { message: "newer checkpoint" } }), { status: 409 }),
  });
  await assert.rejects(client.writeFile({}, "agent-state.json", "x", { sha: null }), /newer checkpoint/);

  const storage = new MemoryStorage();
  const credentials = createLocalBridgeCredentialStore({ repository: { owner: "octo", repo: "sync", branch: "main" }, metadataStorage: storage });
  assert.equal(credentials.load().token, "local-git-transport");
  credentials.saveMetadata({ metadata: { learnerSha: "blob" } });
  assert.equal(credentials.loadMetadata().learnerSha, "blob");
  assert.equal(JSON.stringify([...storage.values.values()]).includes("local-git-transport"), false);
});
