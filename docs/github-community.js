const DEFAULT_GRAPHQL_URL = "https://api.github.com/graphql";
const OAUTH_TRANSACTION_KEY = "quickmaths.github-community.oauth.v1";
const SESSION_CREDENTIAL_KEY = "quickmaths.github-community.credential.session.v1";
const PERSISTENT_CREDENTIAL_KEY = "quickmaths.github-community.credential.persistent.v1";

export class GitHubCommunityError extends Error {
  constructor(message, { code = "github_community_error", status = null, details = null } = {}) {
    super(message);
    this.name = "GitHubCommunityError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function safeStorageGet(storage, key) {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

function safeStorageSet(storage, key, value) {
  try { storage?.setItem(key, value); } catch { /* Best-effort credential persistence. */ }
}

function safeStorageRemove(storage, key) {
  try { storage?.removeItem(key); } catch { /* Best-effort credential cleanup. */ }
}

function normalizeUrl(value, label, { allowLocal = false } = {}) {
  let url;
  try { url = new URL(String(value ?? "")); }
  catch { throw new GitHubCommunityError(`${label} is invalid.`, { code: "invalid_config" }); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(allowLocal && local && url.protocol === "http:")) {
    throw new GitHubCommunityError(`${label} must use HTTPS.`, { code: "invalid_config" });
  }
  return url.href.replace(/\/$/, "");
}

function cleanIdentifier(value, label) {
  const result = String(value ?? "").trim();
  if (!result || result.length > 100 || !/^[A-Za-z0-9_.-]+$/.test(result)) {
    throw new GitHubCommunityError(`${label} is invalid.`, { code: "invalid_config" });
  }
  return result;
}

export function normalizeGitHubCommunityConfig(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new GitHubCommunityError("GitHub community configuration is missing.", { code: "invalid_config" });
  }
  const enabled = candidate.enabled === true;
  if (!enabled) return { enabled: false };
  const clientId = String(candidate.client_id ?? candidate.clientId ?? "").trim();
  if (!/^[A-Za-z0-9_.-]{8,120}$/.test(clientId)) {
    throw new GitHubCommunityError("GitHub App client ID is invalid.", { code: "invalid_config" });
  }
  const repository = candidate.repository && typeof candidate.repository === "object" ? candidate.repository : {};
  return {
    enabled: true,
    clientId,
    brokerUrl: normalizeUrl(candidate.broker_url ?? candidate.brokerUrl, "Community callback service", { allowLocal: true }),
    callbackUrl: normalizeUrl(candidate.callback_url ?? candidate.callbackUrl, "Community callback URL", { allowLocal: true }),
    graphqlUrl: candidate.graphql_url || candidate.graphqlUrl
      ? normalizeUrl(candidate.graphql_url ?? candidate.graphqlUrl, "GitHub GraphQL URL", { allowLocal: true })
      : DEFAULT_GRAPHQL_URL,
    repository: {
      owner: cleanIdentifier(repository.owner, "Community repository owner"),
      name: cleanIdentifier(repository.name, "Community repository name"),
    },
  };
}

function normalizeCredential(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const accessToken = String(candidate.accessToken ?? candidate.access_token ?? "").trim();
  const refreshToken = String(candidate.refreshToken ?? candidate.refresh_token ?? "").trim();
  const expiresAt = Number(candidate.expiresAt ?? candidate.expires_at ?? 0) || 0;
  const refreshExpiresAt = Number(candidate.refreshExpiresAt ?? candidate.refresh_expires_at ?? 0) || 0;
  if (!accessToken || accessToken.length > 500 || (refreshToken && refreshToken.length > 500)) return null;
  return { accessToken, refreshToken, expiresAt, refreshExpiresAt };
}

export function createGitHubCommunityCredentialStore({ sessionStorage, persistentStorage } = {}) {
  const load = () => {
    for (const [storage, key, remembered] of [
      [sessionStorage, SESSION_CREDENTIAL_KEY, false],
      [persistentStorage, PERSISTENT_CREDENTIAL_KEY, true],
    ]) {
      try {
        const credential = normalizeCredential(JSON.parse(safeStorageGet(storage, key) ?? "null"));
        if (credential) return { ...credential, remembered };
      } catch { /* Try the next storage location. */ }
    }
    return null;
  };

  const save = (candidate, { remember = false } = {}) => {
    const credential = normalizeCredential(candidate);
    if (!credential) throw new GitHubCommunityError("GitHub returned an invalid community credential.", { code: "invalid_credential" });
    safeStorageRemove(sessionStorage, SESSION_CREDENTIAL_KEY);
    safeStorageRemove(persistentStorage, PERSISTENT_CREDENTIAL_KEY);
    safeStorageSet(remember ? persistentStorage : sessionStorage, remember ? PERSISTENT_CREDENTIAL_KEY : SESSION_CREDENTIAL_KEY, JSON.stringify(credential));
    return { ...credential, remembered: remember };
  };

  const clear = () => {
    safeStorageRemove(sessionStorage, SESSION_CREDENTIAL_KEY);
    safeStorageRemove(persistentStorage, PERSISTENT_CREDENTIAL_KEY);
  };

  return { load, save, clear };
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function randomToken(cryptoImpl, length = 32) {
  const bytes = new Uint8Array(length);
  cryptoImpl.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256Token(cryptoImpl, value) {
  const digest = await cryptoImpl.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

export function parseDiscussionNumber(value, { owner, name } = {}) {
  let url;
  try { url = new URL(String(value ?? "")); } catch { return null; }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 4 || parts[2] !== "discussions" || !/^\d+$/.test(parts[3])) return null;
  if (owner && parts[0].toLowerCase() !== String(owner).toLowerCase()) return null;
  if (name && parts[1].toLowerCase() !== String(name).toLowerCase()) return null;
  return Number(parts[3]);
}

function oauthResponseCredential(body, now) {
  const expiresIn = Math.max(0, Number(body?.expires_in) || 0);
  const refreshExpiresIn = Math.max(0, Number(body?.refresh_token_expires_in) || 0);
  return normalizeCredential({
    access_token: body?.access_token,
    refresh_token: body?.refresh_token,
    expires_at: expiresIn ? now() + expiresIn * 1000 : 0,
    refresh_expires_at: refreshExpiresIn ? now() + refreshExpiresIn * 1000 : 0,
  });
}

async function readJson(response) {
  try { return await response.json(); } catch { return null; }
}

function githubErrorMessage(errors) {
  if (!Array.isArray(errors)) return "GitHub could not complete that community action.";
  const message = errors.map((error) => String(error?.message ?? "")).filter(Boolean).join("; ");
  return message.slice(0, 500) || "GitHub could not complete that community action.";
}

function normalizeDiscussion(node, viewerLogin = "") {
  const voteReaction = Array.isArray(node?.reactionGroups)
    ? node.reactionGroups.find((group) => group?.content === "THUMBS_UP")
    : null;
  const comments = Array.isArray(node?.comments?.nodes) ? node.comments.nodes : [];
  return {
    id: String(node?.id ?? ""),
    number: Number(node?.number) || 0,
    title: String(node?.title ?? ""),
    url: String(node?.url ?? ""),
    votes: Math.max(0, Number(voteReaction?.users?.totalCount) || 0),
    viewerHasVoted: voteReaction?.viewerHasReacted === true,
    commentCount: Math.max(0, Number(node?.comments?.totalCount) || 0),
    comments: comments.map((comment) => ({
      id: String(comment?.id ?? ""),
      body: String(comment?.bodyText ?? ""),
      createdAt: String(comment?.createdAt ?? ""),
      updatedAt: String(comment?.updatedAt ?? ""),
      url: String(comment?.url ?? ""),
      author: String(comment?.author?.login ?? "ghost"),
      authorUrl: String(comment?.author?.url ?? ""),
      avatarUrl: String(comment?.author?.avatarUrl ?? ""),
      viewerDidAuthor: Boolean(viewerLogin && String(comment?.author?.login ?? "").toLowerCase() === viewerLogin.toLowerCase()),
    })),
  };
}

export function createGitHubCommunityClient({
  config: rawConfig,
  credentialStore,
  transactionStorage,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  cryptoImpl = globalThis.crypto,
  now = () => Date.now(),
} = {}) {
  const config = normalizeGitHubCommunityConfig(rawConfig);
  if (!config.enabled) return {
    configured: false,
    beginAuthorization: async () => { throw new GitHubCommunityError("In-app GitHub community access is not configured yet.", { code: "not_configured" }); },
  };
  if (!credentialStore || typeof fetchImpl !== "function" || !cryptoImpl?.subtle || typeof cryptoImpl.getRandomValues !== "function") {
    throw new GitHubCommunityError("GitHub community access is unavailable in this browser.", { code: "unsupported" });
  }

  let credential = credentialStore.load();
  let viewer = null;

  const brokerRequest = async (path, body) => {
    let response;
    try {
      response = await fetchImpl(`${config.brokerUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new GitHubCommunityError("Could not reach the QuickMaths GitHub sign-in service.", { code: "broker_unavailable", details: String(error) });
    }
    const payload = await readJson(response);
    if (!response.ok) throw new GitHubCommunityError(String(payload?.error ?? "GitHub sign-in failed."), { code: "broker_error", status: response.status });
    return payload;
  };

  const refresh = async () => {
    if (!credential?.refreshToken || (credential.refreshExpiresAt && credential.refreshExpiresAt <= now())) {
      credentialStore.clear(); credential = null;
      throw new GitHubCommunityError("Your GitHub community session expired. Connect GitHub again.", { code: "session_expired", status: 401 });
    }
    const payload = await brokerRequest("/refresh", { refresh_token: credential.refreshToken });
    const next = oauthResponseCredential(payload, now);
    if (!next) throw new GitHubCommunityError("GitHub returned an invalid refreshed session.", { code: "invalid_credential" });
    credential = credentialStore.save(next, { remember: credential.remembered });
    return credential;
  };

  const accessToken = async () => {
    if (!credential) throw new GitHubCommunityError("Connect GitHub to vote or comment.", { code: "not_connected", status: 401 });
    if (credential.expiresAt && credential.expiresAt <= now() + 60_000) await refresh();
    return credential.accessToken;
  };

  const graphql = async (query, variables = {}, { retry = true } = {}) => {
    const token = await accessToken();
    let response;
    try {
      response = await fetchImpl(config.graphqlUrl, {
        method: "POST",
        headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
    } catch (error) {
      throw new GitHubCommunityError("Could not reach GitHub Discussions.", { code: "network_error", details: String(error) });
    }
    if (response.status === 401 && retry && credential?.refreshToken) {
      await refresh();
      return graphql(query, variables, { retry: false });
    }
    const payload = await readJson(response);
    if (response.status === 401) {
      credentialStore.clear(); credential = null; viewer = null;
      throw new GitHubCommunityError("Your GitHub community session expired. Connect again.", { code: "unauthorized", status: 401 });
    }
    if (!response.ok || payload?.errors?.length) {
      throw new GitHubCommunityError(githubErrorMessage(payload?.errors) || `GitHub request failed (${response.status}).`, { code: response.status === 403 ? "forbidden" : "github_error", status: response.status });
    }
    return payload?.data;
  };

  const beginAuthorization = async ({ remember = false } = {}) => {
    const state = randomToken(cryptoImpl);
    const verifier = randomToken(cryptoImpl, 48);
    const challenge = await sha256Token(cryptoImpl, verifier);
    safeStorageSet(transactionStorage, OAUTH_TRANSACTION_KEY, JSON.stringify({ state, verifier, remember, createdAt: now() }));
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", config.callbackUrl);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.href;
  };

  const completeAuthorization = async ({ code, state } = {}) => {
    let transaction = null;
    try { transaction = JSON.parse(safeStorageGet(transactionStorage, OAUTH_TRANSACTION_KEY) ?? "null"); } catch { transaction = null; }
    safeStorageRemove(transactionStorage, OAUTH_TRANSACTION_KEY);
    if (!transaction || now() - Number(transaction.createdAt) > 15 * 60_000 || !state || state !== transaction.state) {
      throw new GitHubCommunityError("GitHub sign-in could not be verified. Start again from the Lesson Depot.", { code: "invalid_oauth_state" });
    }
    if (!code || String(code).length > 500) throw new GitHubCommunityError("GitHub did not return a valid authorization code.", { code: "invalid_oauth_code" });
    const payload = await brokerRequest("/exchange", {
      code: String(code),
      code_verifier: transaction.verifier,
      redirect_uri: config.callbackUrl,
    });
    const next = oauthResponseCredential(payload, now);
    if (!next) throw new GitHubCommunityError("GitHub returned an invalid community session.", { code: "invalid_credential" });
    credential = credentialStore.save(next, { remember: transaction.remember === true });
    viewer = null;
    return credential;
  };

  const connect = async () => {
    const data = await graphql(`query QuickMathsCommunityViewer($owner:String!,$name:String!){viewer{login avatarUrl url}repository(owner:$owner,name:$name){id nameWithOwner hasDiscussionsEnabled}}`, config.repository);
    if (!data?.repository?.id || data.repository.hasDiscussionsEnabled !== true) {
      throw new GitHubCommunityError("QuickMaths Discussions are unavailable to this GitHub account.", { code: "repository_unavailable" });
    }
    viewer = { login: String(data.viewer?.login ?? ""), avatarUrl: String(data.viewer?.avatarUrl ?? ""), url: String(data.viewer?.url ?? "") };
    return { ...viewer };
  };

  const loadDiscussion = async (discussionUrl) => {
    const number = parseDiscussionNumber(discussionUrl, config.repository);
    if (!number) throw new GitHubCommunityError("This lesson package does not have a valid QuickMaths discussion.", { code: "invalid_discussion" });
    if (!viewer) await connect();
    const data = await graphql(`query QuickMathsLessonDiscussion($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){discussion(number:$number){id number title url viewerCanReact reactionGroups{content viewerHasReacted users{totalCount}}comments(last:50){totalCount nodes{id bodyText createdAt updatedAt url author{login avatarUrl url}}}}}}`, { ...config.repository, number });
    if (!data?.repository?.discussion?.id) throw new GitHubCommunityError("This package discussion no longer exists.", { code: "discussion_missing", status: 404 });
    return normalizeDiscussion(data.repository.discussion, viewer?.login);
  };

  const setVote = async (discussionId, shouldVote) => {
    const id = String(discussionId ?? "");
    if (!id || id.length > 200) throw new GitHubCommunityError("Discussion ID is invalid.", { code: "invalid_discussion" });
    const mutation = shouldVote
      ? `mutation QuickMathsVote($id:ID!){addReaction(input:{subjectId:$id,content:THUMBS_UP}){subject{reactionGroups{content viewerHasReacted users{totalCount}}}}}`
      : `mutation QuickMathsRemoveVote($id:ID!){removeReaction(input:{subjectId:$id,content:THUMBS_UP}){subject{reactionGroups{content viewerHasReacted users{totalCount}}}}}`;
    const data = await graphql(mutation, { id });
    const subject = shouldVote ? data?.addReaction?.subject : data?.removeReaction?.subject;
    const voteReaction = subject?.reactionGroups?.find((group) => group?.content === "THUMBS_UP");
    return { votes: Math.max(0, Number(voteReaction?.users?.totalCount) || 0), viewerHasVoted: voteReaction?.viewerHasReacted === true };
  };

  const addComment = async (discussionId, body) => {
    const id = String(discussionId ?? "");
    const cleanBody = String(body ?? "").trim();
    if (!id || id.length > 200) throw new GitHubCommunityError("Discussion ID is invalid.", { code: "invalid_discussion" });
    if (!cleanBody) throw new GitHubCommunityError("Write a comment first.", { code: "empty_comment" });
    if (cleanBody.length > 10_000) throw new GitHubCommunityError("Comments must be 10,000 characters or fewer.", { code: "comment_too_long" });
    const data = await graphql(`mutation QuickMathsComment($id:ID!,$body:String!){addDiscussionComment(input:{discussionId:$id,body:$body}){comment{id bodyText createdAt updatedAt url author{login avatarUrl url}}}}`, { id, body: cleanBody });
    const comment = data?.addDiscussionComment?.comment;
    if (!comment?.id) throw new GitHubCommunityError("GitHub did not save the comment.", { code: "comment_failed" });
    return normalizeDiscussion({ comments: { totalCount: 1, nodes: [comment] } }, viewer?.login).comments[0];
  };

  const disconnect = () => { credentialStore.clear(); credential = null; viewer = null; };
  const snapshot = () => ({ configured: true, connected: Boolean(credential), remembered: credential?.remembered === true, viewer: viewer ? { ...viewer } : null });

  return { configured: true, config, snapshot, beginAuthorization, completeAuthorization, connect, loadDiscussion, setVote, addComment, disconnect };
}
