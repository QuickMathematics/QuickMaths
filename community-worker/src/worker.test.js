import test from "node:test";
import assert from "node:assert/strict";

import { createCommunityAuthHandler } from "./worker.js";

const origin = "https://srednjak.github.io";
const env = {
  ALLOWED_ORIGINS: origin,
  ALLOWED_CALLBACKS: "https://srednjak.github.io/QuickMaths/community-auth.html",
  GITHUB_CLIENT_ID: "Iv1.quickmaths",
  GITHUB_CLIENT_SECRET: "secret-never-returned",
};

function request(path, body, requestOrigin = origin) {
  return new Request(`https://auth.example.test${path}`, {
    method: "POST",
    headers: { origin: requestOrigin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("health endpoint is public but never reveals configuration", async () => {
  const response = await createCommunityAuthHandler()(new Request("https://auth.example.test/health"), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, { ok: true, service: "quickmaths-community-auth" });
  assert.equal(JSON.stringify(payload).includes("GITHUB_CLIENT"), false);
});

test("callback broker rejects foreign origins and callback URLs", async () => {
  let calls = 0;
  const handler = createCommunityAuthHandler({ fetchImpl: async () => { calls += 1; return new Response(); } });
  const foreign = await handler(request("/exchange", { code: "abcdefgh", code_verifier: "abcdefgh", redirect_uri: env.ALLOWED_CALLBACKS }, "https://evil.example"), env);
  assert.equal(foreign.status, 403);
  const redirect = await handler(request("/exchange", { code: "abcdefgh", code_verifier: "abcdefgh", redirect_uri: "https://evil.example/callback" }), env);
  assert.equal(redirect.status, 400);
  assert.equal(calls, 0);
});

test("authorization codes are exchanged server-side and secrets are never returned", async () => {
  let githubRequest = null;
  const handler = createCommunityAuthHandler({
    fetchImpl: async (_url, options) => {
      githubRequest = options;
      return Response.json({ access_token: "ghu_user", expires_in: 28800, refresh_token: "ghr_refresh", refresh_token_expires_in: 1000 });
    },
  });
  const response = await handler(request("/exchange", {
    code: "authorization-code",
    code_verifier: "pkce-verifier-value",
    redirect_uri: env.ALLOWED_CALLBACKS,
  }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const payload = await response.json();
  assert.equal(payload.access_token, "ghu_user");
  assert.equal(JSON.stringify(payload).includes(env.GITHUB_CLIENT_SECRET), false);
  const form = new URLSearchParams(githubRequest.body);
  assert.equal(form.get("client_secret"), env.GITHUB_CLIENT_SECRET);
  assert.equal(form.get("code_verifier"), "pkce-verifier-value");
});

test("refresh preserves the secretless browser contract", async () => {
  const handler = createCommunityAuthHandler({
    fetchImpl: async (_url, options) => {
      const form = new URLSearchParams(options.body);
      assert.equal(form.get("grant_type"), "refresh_token");
      assert.equal(form.get("refresh_token"), "ghr_old-token");
      return Response.json({ access_token: "ghu_new", refresh_token: "ghr_new", expires_in: 28800, refresh_token_expires_in: 1000 });
    },
  });
  const response = await handler(request("/refresh", { refresh_token: "ghr_old-token" }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).access_token, "ghu_new");
});

test("GitHub errors are sanitized", async () => {
  const handler = createCommunityAuthHandler({
    fetchImpl: async () => Response.json({ error: "incorrect_client_credentials", error_description: "secret leaked in diagnostic" }, { status: 401 }),
  });
  const response = await handler(request("/exchange", { code: "authorization-code", code_verifier: "pkce-verifier", redirect_uri: env.ALLOWED_CALLBACKS }), env);
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.match(payload.error, /could not verify/i);
  assert.equal(JSON.stringify(payload).includes("secret leaked"), false);
});
