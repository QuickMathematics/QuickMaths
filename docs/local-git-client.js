import { GitHubSyncConflictError, GitHubSyncError } from "./github-sync.js";

const API_BASE = "/__quickmaths_bridge__";
const CAPABILITY_KEY = "quickmaths.local-git.capability.v1";
const METADATA_KEY = "quickmaths.local-git.meta.agent.v1";
const ALLOWED_PATHS = new Set(["learner-state.json", "agent-state.json"]);
const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{32,200}$/;

function safeSessionGet(storage, key) {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}
function safeSessionSet(storage, key, value) {
  try { storage?.setItem(key, value); } catch { /* The URL fragment still works for this page load. */ }
}

export function resolveLocalBridgeCapability({
  hash = globalThis.location?.hash ?? "",
  sessionStorage = globalThis.sessionStorage,
  history = globalThis.history,
  location = globalThis.location,
} = {}) {
  const match = String(hash).match(/^#local=([A-Za-z0-9_-]{32,200})$/);
  const fromFragment = match?.[1] ?? null;
  const capability = fromFragment ?? safeSessionGet(sessionStorage, CAPABILITY_KEY);
  if (!capability || !CAPABILITY_PATTERN.test(capability)) return null;
  if (fromFragment) {
    safeSessionSet(sessionStorage, CAPABILITY_KEY, capability);
    try { history?.replaceState(null, "", `${location.pathname}${location.search}`); } catch { /* Non-essential history cleanup. */ }
  }
  return capability;
}

async function responseError(response) {
  try {
    const body = await response.json();
    return body?.error?.message || body?.message || null;
  } catch {
    return null;
  }
}

function validatePath(path) {
  if (!ALLOWED_PATHS.has(path)) throw new GitHubSyncError("Local Bridge path is invalid.", { code: "invalid_path" });
  return path;
}

export function createLocalGitContentsClient({
  capability,
  fetchImpl = globalThis.fetch,
  apiBase = API_BASE,
} = {}) {
  if (!CAPABILITY_PATTERN.test(String(capability ?? ""))) throw new TypeError("A valid local Bridge capability is required.");
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function.");
  const base = String(apiBase).replace(/\/$/, "");

  const request = async (path, options = {}) => {
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        ...options,
        headers: {
          "X-QuickMaths-Bridge": capability,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers ?? {}),
        },
      });
    } catch (error) {
      throw new GitHubSyncError("The local Git Bridge is unavailable.", { code: "local_bridge_unavailable", details: String(error) });
    }
    if (response.ok) return response;
    const message = await responseError(response);
    if (response.status === 409) throw new GitHubSyncConflictError(message || undefined);
    throw new GitHubSyncError(message || `Local Git Bridge failed with status ${response.status}.`, {
      status: response.status,
      code: response.status === 403 ? "forbidden" : "local_bridge_error",
    });
  };

  const verify = async () => {
    const response = await request("/info");
    const value = await response.json();
    if (!value || value.transport !== "local-git" || typeof value.owner !== "string" || typeof value.repo !== "string" || typeof value.branch !== "string") {
      throw new GitHubSyncError("Local Git Bridge returned invalid repository information.", { code: "invalid_local_bridge" });
    }
    return {
      owner: value.owner,
      repo: value.repo,
      private: true,
      defaultBranch: value.branch,
      branch: value.branch,
      transport: "local-git",
      revision: typeof value.revision === "string" ? value.revision : null,
    };
  };

  const readFile = async (_config, path) => {
    const response = await request(`/files/${encodeURIComponent(validatePath(path))}`);
    const value = await response.json();
    if (!value || typeof value.exists !== "boolean") throw new GitHubSyncError("Local Git Bridge returned an invalid checkpoint.", { code: "invalid_local_bridge" });
    if (!value.exists) return { exists: false, sha: null, content: null };
    if (typeof value.sha !== "string" || typeof value.content !== "string") throw new GitHubSyncError("Local Git Bridge returned an invalid checkpoint.", { code: "invalid_local_bridge" });
    return { exists: true, sha: value.sha, content: value.content };
  };

  const writeFile = async (_config, path, content, { sha = null } = {}) => {
    const response = await request(`/files/${encodeURIComponent(validatePath(path))}`, {
      method: "PUT",
      body: JSON.stringify({ content, sha }),
    });
    const value = await response.json();
    if (!value || typeof value.sha !== "string") throw new GitHubSyncError("Local Git Bridge returned no checkpoint revision.", { code: "invalid_local_bridge" });
    return { sha: value.sha, commitSha: typeof value.commitSha === "string" ? value.commitSha : null };
  };

  return { verify, readFile, writeFile };
}

export function createLocalBridgeCredentialStore({ repository, metadataStorage = globalThis.localStorage } = {}) {
  if (!repository?.owner || !repository?.repo || !repository?.branch) throw new TypeError("Local Bridge repository information is required.");
  const config = {
    owner: repository.owner,
    repo: repository.repo,
    branch: repository.branch,
    token: "local-git-transport",
    role: "agent",
    rememberToken: false,
  };
  const loadMetadata = () => {
    try {
      const value = JSON.parse(metadataStorage?.getItem(METADATA_KEY) ?? "null");
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch { return null; }
  };
  return {
    load: () => ({ ...config }),
    save: () => ({ ...config }),
    clear: () => { try { metadataStorage?.removeItem(METADATA_KEY); } catch { /* Best effort. */ } },
    loadMetadata,
    saveMetadata({ metadata } = {}) {
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return;
      try { metadataStorage?.setItem(METADATA_KEY, JSON.stringify(metadata)); } catch { /* Polling still works without persistence. */ }
    },
  };
}
