const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const MAX_BODY_BYTES = 12_000;

function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS ?? "https://quickmathematics.github.io")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean));
}

function corsHeaders(origin, env) {
  const allowed = allowedOrigins(env);
  return {
    "access-control-allow-origin": allowed.has(origin) ? origin : "null",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "referrer-policy": "no-referrer",
    vary: "Origin",
  };
}

function json(body, status, origin, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin, env), "content-type": "application/json; charset=utf-8" },
  });
}

function validOpaque(value, max = 500) {
  return typeof value === "string" && value.length >= 8 && value.length <= max && /^[A-Za-z0-9._~-]+$/.test(value);
}

function validRedirect(value, env) {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    const configured = new Set(String(env.ALLOWED_CALLBACKS ?? "https://quickmathematics.github.io/QuickMaths/community-auth.html")
      .split(",").map((entry) => entry.trim()).filter(Boolean));
    return configured.has(url.href);
  } catch { return false; }
}

async function requestBody(request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return null;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return null;
    const body = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch { return null; }
}

async function exchangeWithGitHub(body, env, fetchImpl) {
  const form = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
  });
  if (body.grant_type === "refresh_token") {
    form.set("grant_type", "refresh_token");
    form.set("refresh_token", body.refresh_token);
  } else {
    form.set("code", body.code);
    form.set("code_verifier", body.code_verifier);
    form.set("redirect_uri", body.redirect_uri);
  }
  const response = await fetchImpl(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded", "user-agent": "quickmaths-community-auth" },
    body: form,
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok || !payload?.access_token) {
    const error = payload?.error === "incorrect_client_credentials"
      ? "The QuickMaths Community credentials do not match the GitHub App. The maintainer needs to replace the callback secret."
      : payload?.error === "bad_verification_code"
        ? "This GitHub authorization code expired or was already used. Return to QuickMaths and connect again."
        : "GitHub sign-in is temporarily unavailable.";
    const knownOAuthError = ["incorrect_client_credentials", "bad_verification_code"].includes(payload?.error);
    return { ok: false, status: knownOAuthError || (response.status >= 400 && response.status < 500) ? 400 : 502, error };
  }
  return {
    ok: true,
    status: 200,
    payload: {
      access_token: payload.access_token,
      token_type: "bearer",
      expires_in: Number(payload.expires_in) || 0,
      refresh_token: typeof payload.refresh_token === "string" ? payload.refresh_token : "",
      refresh_token_expires_in: Number(payload.refresh_token_expires_in) || 0,
    },
  };
}

export function createCommunityAuthHandler({ fetchImpl = fetch } = {}) {
  return async function handle(request, env = {}) {
    const url = new URL(request.url);
    const origin = String(request.headers.get("origin") ?? "").replace(/\/$/, "");
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "quickmaths-community-auth" }, 200, origin, env);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: allowedOrigins(env).has(origin) ? 204 : 403, headers: corsHeaders(origin, env) });
    }
    if (request.method !== "POST" || !["/exchange", "/refresh"].includes(url.pathname)) {
      return json({ error: "Not found." }, 404, origin, env);
    }
    if (!allowedOrigins(env).has(origin)) return json({ error: "Origin is not allowed." }, 403, origin, env);
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return json({ error: "Service is not configured." }, 503, origin, env);
    const body = await requestBody(request);
    if (!body) return json({ error: "Request is invalid." }, 400, origin, env);
    if (url.pathname === "/exchange") {
      if (!validOpaque(body.code) || !validOpaque(body.code_verifier, 200) || !validRedirect(body.redirect_uri, env)) {
        return json({ error: "Authorization request is invalid." }, 400, origin, env);
      }
    } else if (!validOpaque(body.refresh_token)) {
      return json({ error: "Refresh request is invalid." }, 400, origin, env);
    }
    try {
      const result = await exchangeWithGitHub(url.pathname === "/refresh" ? { grant_type: "refresh_token", refresh_token: body.refresh_token } : body, env, fetchImpl);
      return json(result.ok ? result.payload : { error: result.error }, result.status, origin, env);
    } catch {
      return json({ error: "GitHub sign-in is temporarily unavailable." }, 502, origin, env);
    }
  };
}

const handle = createCommunityAuthHandler();
export default { fetch: (request, env) => handle(request, env) };
