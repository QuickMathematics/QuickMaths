import test from "node:test";
import assert from "node:assert/strict";

import {
  createGitHubCommunityClient,
  createGitHubCommunityCredentialStore,
  normalizeGitHubCommunityConfig,
  parseDiscussionNumber,
} from "./github-community.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const config = {
  enabled: true,
  client_id: "Iv1.quickmaths123",
  broker_url: "https://auth.example.test",
  callback_url: "https://quickmathematics.github.io/QuickMaths/community-auth.html",
  graphql_url: "https://api.example.test/graphql",
  repository: { owner: "QuickMathematics", name: "QuickMaths" },
};

function credentialStore({ accessToken = "ghu_access", refreshToken = "ghr_refresh", expiresAt = 0, remembered = false } = {}) {
  const session = new MemoryStorage();
  const persistent = new MemoryStorage();
  const store = createGitHubCommunityCredentialStore({ sessionStorage: session, persistentStorage: persistent });
  store.save({ accessToken, refreshToken, expiresAt }, { remember: remembered });
  return store;
}

test("community config is least-privilege HTTPS metadata", () => {
  assert.deepEqual(normalizeGitHubCommunityConfig({ enabled: false }), { enabled: false });
  const result = normalizeGitHubCommunityConfig(config);
  assert.equal(result.repository.owner, "QuickMathematics");
  assert.equal(result.brokerUrl, "https://auth.example.test");
  assert.throws(() => normalizeGitHubCommunityConfig({ ...config, broker_url: "http://evil.example" }), /HTTPS/);
});

test("discussion links are restricted to the configured GitHub repository", () => {
  assert.equal(parseDiscussionNumber("https://github.com/QuickMathematics/QuickMaths/discussions/42", config.repository), 42);
  assert.equal(parseDiscussionNumber("https://github.com/other/QuickMaths/discussions/42", config.repository), null);
  assert.equal(parseDiscussionNumber("javascript:alert(1)", config.repository), null);
});

test("credentials remain separate and honor session versus remembered storage", () => {
  const session = new MemoryStorage();
  const persistent = new MemoryStorage();
  const store = createGitHubCommunityCredentialStore({ sessionStorage: session, persistentStorage: persistent });
  store.save({ accessToken: "session", refreshToken: "refresh" });
  assert.equal(store.load().accessToken, "session");
  assert.equal(store.load().remembered, false);
  store.save({ accessToken: "persistent", refreshToken: "refresh" }, { remember: true });
  assert.equal(store.load().accessToken, "persistent");
  assert.equal(store.load().remembered, true);
  store.clear();
  assert.equal(store.load(), null);
});

test("OAuth start uses state and PKCE without exposing a client secret", async () => {
  const transaction = new MemoryStorage();
  const client = createGitHubCommunityClient({
    config,
    credentialStore: createGitHubCommunityCredentialStore({ sessionStorage: new MemoryStorage(), persistentStorage: new MemoryStorage() }),
    transactionStorage: transaction,
    fetchImpl: async () => { throw new Error("unused"); },
    cryptoImpl: crypto,
    now: () => 1_000,
  });
  const url = new URL(await client.beginAuthorization({ remember: true }));
  assert.equal(url.origin + url.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), config.client_id);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.has("client_secret"), false);
  const saved = JSON.parse(transaction.getItem("quickmaths.github-community.oauth.v1"));
  assert.equal(saved.remember, true);
  assert.equal(saved.state, url.searchParams.get("state"));
  assert.notEqual(saved.verifier, url.searchParams.get("code_challenge"));
});

test("OAuth callback rejects mismatched state before contacting the broker", async () => {
  const transaction = new MemoryStorage();
  const store = createGitHubCommunityCredentialStore({ sessionStorage: new MemoryStorage(), persistentStorage: new MemoryStorage() });
  let calls = 0;
  const client = createGitHubCommunityClient({ config, credentialStore: store, transactionStorage: transaction, fetchImpl: async () => { calls += 1; return new Response(); }, cryptoImpl: crypto, now: () => 1_000 });
  const authorization = new URL(await client.beginAuthorization());
  await assert.rejects(client.completeAuthorization({ code: "good-code", state: `${authorization.searchParams.get("state")}wrong` }), /could not be verified/i);
  assert.equal(calls, 0);
  assert.equal(store.load(), null);
});

test("authenticated community client loads live votes/comments and writes both actions", async () => {
  const calls = [];
  const responses = [
    { data: { viewer: { login: "ada", avatarUrl: "https://avatars.example/ada", url: "https://github.com/ada" }, repository: { id: "R_repo", nameWithOwner: "QuickMathematics/QuickMaths", hasDiscussionsEnabled: true } } },
    { data: { repository: { discussion: { id: "D_1", number: 1, title: "Estimation Lab", url: "https://github.com/QuickMathematics/QuickMaths/discussions/1", viewerCanReact: true, reactionGroups: [{ content: "THUMBS_UP", viewerHasReacted: false, users: { totalCount: 3 } }], comments: { totalCount: 1, nodes: [{ id: "C_1", bodyText: "Useful pack", createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z", url: "https://github.com/comment", author: { login: "bo", avatarUrl: "", url: "https://github.com/bo" } }] } } } } },
    { data: { addReaction: { subject: { reactionGroups: [{ content: "THUMBS_UP", viewerHasReacted: true, users: { totalCount: 4 } }] } } } },
    { data: { addDiscussionComment: { comment: { id: "C_2", bodyText: "My note", createdAt: "2026-09-01T11:00:00Z", updatedAt: "2026-09-01T11:00:00Z", url: "https://github.com/comment2", author: { login: "ada", avatarUrl: "", url: "https://github.com/ada" } } } } },
  ];
  const client = createGitHubCommunityClient({
    config,
    credentialStore: credentialStore(),
    transactionStorage: new MemoryStorage(),
    fetchImpl: async (url, options) => { calls.push({ url, options, body: JSON.parse(options.body) }); return Response.json(responses.shift()); },
    cryptoImpl: crypto,
  });
  const discussion = await client.loadDiscussion("https://github.com/QuickMathematics/QuickMaths/discussions/1");
  assert.equal(discussion.votes, 3);
  assert.equal(discussion.comments[0].body, "Useful pack");
  const vote = await client.setVote(discussion.id, true);
  assert.deepEqual(vote, { votes: 4, viewerHasVoted: true });
  const comment = await client.addComment(discussion.id, "My note");
  assert.equal(comment.viewerDidAuthor, true);
  assert.match(calls[2].body.query, /addReaction/);
  assert.equal(calls[3].body.variables.body, "My note");
  assert.ok(calls.every((call) => call.options.headers.authorization === "Bearer ghu_access"));
});

test("expired access token refreshes through the broker without leaking into GraphQL variables", async () => {
  const calls = [];
  const store = credentialStore({ expiresAt: 1_000, remembered: true });
  const client = createGitHubCommunityClient({
    config,
    credentialStore: store,
    transactionStorage: new MemoryStorage(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/refresh")) return Response.json({ access_token: "ghu_new", refresh_token: "ghr_new", expires_in: 28800, refresh_token_expires_in: 1000 });
      return Response.json({ data: { viewer: { login: "ada" }, repository: { id: "R_repo", hasDiscussionsEnabled: true } } });
    },
    cryptoImpl: crypto,
    now: () => 5_000,
  });
  await client.connect();
  assert.equal(calls[0].url, "https://auth.example.test/refresh");
  assert.equal(calls[1].options.headers.authorization, "Bearer ghu_new");
  assert.equal(calls[1].options.body.includes("ghu_new"), false);
  assert.equal(store.load().remembered, true);
});
