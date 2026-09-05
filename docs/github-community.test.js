import test from "node:test";
import assert from "node:assert/strict";

import {
  createGitHubCommunityClient,
  createGitHubCommunityCredentialStore,
  GITHUB_REACTIONS,
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

function reactionAccounts(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(reactionAccounts);
  const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, reactionAccounts(item)]));
  if (value.reactionGroups || value.bodyText) {
    result.reactionGroups ??= [];
    result.reactions ??= { nodes: result.reactionGroups.flatMap((group) => Array.from({ length: group.users?.totalCount ?? 0 }, (_, i) => ({ content: group.content, user: { id: `${group.content}_${i}` } }))), pageInfo: { hasNextPage: false, endCursor: null } };
  }
  return result;
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

test("authenticated community client uses account reaction votes for lessons and comments", async () => {
  const calls = [];
  const responses = [
    { data: { viewer: { login: "ada", avatarUrl: "https://avatars.example/ada", url: "https://github.com/ada" }, repository: { id: "R_repo", nameWithOwner: "QuickMathematics/QuickMaths", hasDiscussionsEnabled: true } } },
    { data: { repository: { discussion: { id: "D_1", number: 1, title: "Estimation Lab", url: "https://github.com/QuickMathematics/QuickMaths/discussions/1", viewerCanReact: true, reactionGroups: [{ content: "THUMBS_UP", viewerHasReacted: false, users: { totalCount: 3 } }, { content: "THUMBS_DOWN", viewerHasReacted: false, users: { totalCount: 1 } }], comments: { totalCount: 1, nodes: [{ id: "C_1", upvoteCount: 7, bodyText: "Useful pack", createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z", url: "https://github.com/comment", author: { login: "bo", avatarUrl: "", url: "https://github.com/bo" } }] } } } } },
    { data: { addReaction: { subject: { reactionGroups: [{ content: "THUMBS_DOWN", viewerHasReacted: true, users: { totalCount: 2 } }] } } } },
    { data: { addDiscussionComment: { comment: { id: "C_2", bodyText: "My note", createdAt: "2026-09-01T11:00:00Z", updatedAt: "2026-09-01T11:00:00Z", url: "https://github.com/comment2", author: { login: "ada", avatarUrl: "", url: "https://github.com/ada" } } } } },
  ];
  Object.assign(responses[1].data.repository.discussion, { upvoteCount: 10, viewerHasUpvoted: false, viewerCanUpvote: true });
  const client = createGitHubCommunityClient({
    config,
    credentialStore: credentialStore(),
    transactionStorage: new MemoryStorage(),
    fetchImpl: async (url, options) => { calls.push({ url, options, body: JSON.parse(options.body) }); return Response.json(reactionAccounts(responses.shift())); },
    cryptoImpl: crypto,
  });
  const discussion = await client.loadDiscussion("https://github.com/QuickMathematics/QuickMaths/discussions/1");
  assert.equal(discussion.votes, 3);
  assert.equal(discussion.downvotes, 1);
  assert.equal(discussion.score, 2);
  assert.equal(discussion.upvoteCount, undefined);
  assert.equal(discussion.comments[0].upvoteCount, undefined);
  assert.equal(discussion.comments[0].votes, 0);
  assert.equal(client.setUpvote, undefined);
  assert.equal(discussion.reactions.find((reaction) => reaction.content === "THUMBS_UP").count, 3);
  assert.equal(discussion.reactions.find((reaction) => reaction.content === "THUMBS_DOWN").count, 1);
  assert.equal(discussion.comments[0].body, "Useful pack");
  const reaction = await client.setReaction(discussion.id, "THUMBS_DOWN", true);
  assert.deepEqual(reaction.reactions.find((item) => item.content === "THUMBS_DOWN"), { content: "THUMBS_DOWN", count: 2, viewerHasReacted: true, userIds: ["THUMBS_DOWN_0", "THUMBS_DOWN_1"] });
  const comment = await client.addComment(discussion.id, "My note");
  assert.equal(comment.viewerDidAuthor, true);
  assert.ok(calls.every((call) => !/addUpvote|removeUpvote/.test(call.body.query)));
  assert.match(calls[2].body.query, /addReaction/);
  assert.equal(calls[2].body.variables.content, "THUMBS_DOWN");
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

for (const { content } of GITHUB_REACTIONS) {
  test(`${content} can be added and removed on a discussion or comment`, async () => {
    const calls = [];
    const client = createGitHubCommunityClient({
      config, credentialStore: credentialStore(), transactionStorage: new MemoryStorage(), cryptoImpl: crypto,
      fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body); calls.push(body);
        const adding = body.query.includes("addReaction");
        const subject = { reactionGroups: [{ content, viewerHasReacted: adding, users: { totalCount: adding ? 3 : 2 } }] };
        return Response.json(reactionAccounts({ data: { [adding ? "addReaction" : "removeReaction"]: { subject } } }));
      },
    });
    for (const id of ["D_lesson", "DC_comment"]) {
      const added = await client.setReaction(id, content, true);
      const removed = await client.setReaction(id, content, false);
      assert.deepEqual(added.reactions.find((reaction) => reaction.content === content), { content, count: 3, viewerHasReacted: true, userIds: [0, 1, 2].map((i) => `${content}_${i}`) });
      assert.deepEqual(removed.reactions.find((reaction) => reaction.content === content), { content, count: 2, viewerHasReacted: false, userIds: [0, 1].map((i) => `${content}_${i}`) });
      assert.equal(added.reactions.length, 8);
      assert.ok(added.reactions.filter((reaction) => reaction.content !== content).every((reaction) => reaction.count === 0 && !reaction.viewerHasReacted));
    }
    assert.match(calls[0].query, /\$content:ReactionContent!/);
    assert.deepEqual(calls[0].variables, { id: "D_lesson", content });
    assert.deepEqual(calls[2].variables, { id: "DC_comment", content });
    assert.match(calls[1].query, /removeReaction/);
  });
}

test("unsupported reactions and malformed targets are rejected before contacting GitHub", async () => {
  let calls = 0;
  const client = createGitHubCommunityClient({ config, credentialStore: credentialStore(), transactionStorage: new MemoryStorage(), cryptoImpl: crypto, fetchImpl: async () => { calls += 1; return Response.json({}); } });
  for (const [id, content, active] of [["D_1", "BOGUS", true], ["", "HEART", true], ["bad id", "HEART", true], ["D_1", "HEART", "true"]]) {
    await assert.rejects(client.setReaction(id, content, active), /invalid|supported/);
  }
  assert.equal(calls, 0);
});

test("missing mutation confirmation and permission errors cannot report a successful reaction", async () => {
  for (const response of [Response.json({ data: { addReaction: null } }), Response.json({ errors: [{ message: "Reactions are disabled" }] }, { status: 403 })]) {
    const client = createGitHubCommunityClient({ config, credentialStore: credentialStore(), transactionStorage: new MemoryStorage(), cryptoImpl: crypto, fetchImpl: async () => response });
    await assert.rejects(client.setReaction("D_1", "HEART", true), /confirm|disabled/);
  }
});

test("discussion and comment reactions load independently with permission and selected state", async () => {
  const queries = [];
  const client = createGitHubCommunityClient({
    config, credentialStore: credentialStore(), transactionStorage: new MemoryStorage(), cryptoImpl: crypto,
    fetchImpl: async (_url, options) => {
      const query = JSON.parse(options.body).query; queries.push(query);
      if (query.includes("QuickMathsCommunityViewer")) return Response.json({ data: { viewer: { login: "ada" }, repository: { id: "R_1", hasDiscussionsEnabled: true } } });
      return Response.json(reactionAccounts({ data: { repository: { discussion: { id: "D_1", viewerCanReact: false, reactionGroups: [{ content: "ROCKET", viewerHasReacted: true, users: { totalCount: 9 } }], comments: { nodes: [{ id: "DC_1", upvoteCount: 13, viewerCanReact: true, reactionGroups: [{ content: "HEART", viewerHasReacted: false, users: { totalCount: 2 } }] }] } } } } }));
    },
  });
  const discussion = await client.loadDiscussion("https://github.com/QuickMathematics/QuickMaths/discussions/1");
  assert.equal(discussion.viewerCanReact, false);
  assert.equal(discussion.reactions.find((reaction) => reaction.content === "ROCKET").count, 9);
  assert.equal(discussion.reactions.find((reaction) => reaction.content === "ROCKET").viewerHasReacted, true);
  assert.equal(discussion.comments[0].viewerCanReact, true);
  assert.equal(discussion.comments[0].upvoteCount, undefined);
  assert.equal(discussion.comments[0].votes, 2);
  assert.equal(discussion.comments[0].reactions.find((reaction) => reaction.content === "HEART").count, 2);
  assert.equal(discussion.comments[0].reactions.find((reaction) => reaction.content === "ROCKET").count, 0);
  assert.match(queries[1], /comments\(last:50\).*viewerCanReact reactionGroups/);
});

test("confirmed lesson and comment mutations count accounts across all reaction pages", async () => {
  for (const id of ["D_lesson", "DC_comment"]) {
    const calls = [];
    const client = createGitHubCommunityClient({
      config, credentialStore: credentialStore(), transactionStorage: new MemoryStorage(), cryptoImpl: crypto,
      fetchImpl: async (_url, options) => {
        const request = JSON.parse(options.body); calls.push(request);
        if (request.query.includes("QuickMathsReactionAccounts")) {
          assert.deepEqual(request.variables, { id, after: "NEXT" });
          return Response.json({ data: { node: { reactions: { nodes: [{ content: "ROCKET", user: { id: "A" } }, { content: "THUMBS_DOWN", user: { id: "B" } }], pageInfo: { hasNextPage: false } } } } });
        }
        return Response.json({ data: { addReaction: { subject: { reactionGroups: [{ content: "HEART", reactors: { totalCount: 2 } }, { content: "ROCKET", reactors: { totalCount: 1 }, viewerHasReacted: true }, { content: "THUMBS_DOWN", reactors: { totalCount: 1 } }], reactions: { nodes: [{ content: "HEART", user: { id: "A" } }, { content: "HEART", user: { id: "B" } }], pageInfo: { hasNextPage: true, endCursor: "NEXT" } } } } } });
      },
    });
    const result = await client.setReaction(id, "ROCKET", true);
    assert.equal(result.votes, 1);
    assert.equal(result.downvotes, 0);
    assert.equal(result.reactions.find((item) => item.content === "ROCKET").viewerHasReacted, true);
    assert.equal(calls.length, 2);
  }
});

test("a failed read after a saved reaction reports the saved state without repeating the mutation", async () => {
  const calls = [];
  const client = createGitHubCommunityClient({
    config, credentialStore: credentialStore(), transactionStorage: new MemoryStorage(), cryptoImpl: crypto,
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body); calls.push(request);
      if (request.query.includes("QuickMathsReactionAccounts")) return Response.json({ errors: [{ message: "Rate limit" }] });
      return Response.json({ data: { addReaction: { subject: { reactionGroups: [], reactions: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "NEXT" } } } } } });
    },
  });
  await assert.rejects(client.setReaction("D_1", "HEART", true), /saved the reaction.*Reopen/);
  assert.equal(calls.filter((call) => call.query.startsWith("mutation")).length, 1);
});
