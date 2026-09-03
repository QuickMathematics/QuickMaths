const DEFAULT_API_BASE = "https://api.github.com";
const roleKey = (prefix, role) => `${prefix}.${role === "agent" ? "agent" : "learner"}.v1`;
const configKey = (role) => roleKey("quickmaths.github-sync.config", role);
const sessionTokenKey = (role) => roleKey("quickmaths.github-sync.token.session", role);
const persistentTokenKey = (role) => roleKey("quickmaths.github-sync.token.persistent", role);
const metadataKey = (role) => `quickmaths.github-sync.meta.${role === "agent" ? "agent" : "learner"}.v1`;

export const BRIDGE_FORMAT = "quickmaths.github-bridge";
export const BRIDGE_SCHEMA_VERSION = "1.0";
export const LEARNER_STATE_PATH = "learner-state.json";
export const AGENT_STATE_PATH = "agent-state.json";
const MAX_BRIDGE_FILE_BYTES = 10_000_000;
export const BRIDGE_CONFLICT_WINDOW_MS = 10 * 60 * 1000;

export function learnerBridgeStartupAction({
  remoteExists = false,
  localProfileCount = 0,
  establishedConnection = false,
  remoteMatchesKnown = false,
  localDirty = false,
  sameDevice = false,
  remoteActorKind = "device",
  localChangedAt = null,
  remoteUpdatedAt = null,
  conflictWindowMs = BRIDGE_CONFLICT_WINDOW_MS,
} = {}) {
  if (!remoteExists) return localProfileCount > 0 ? "push-local" : "start";
  if (localProfileCount < 1) return "restore-remote";
  if (!establishedConnection) return "choose-migration-source";
  if (remoteMatchesKnown) return "resume-known";
  if (!localDirty || sameDevice || remoteActorKind === "agent") return "restore-remote";
  const localTime = Date.parse(String(localChangedAt ?? ""));
  const remoteTime = Date.parse(String(remoteUpdatedAt ?? ""));
  const comparable = Number.isFinite(localTime) && Number.isFinite(remoteTime);
  return comparable && Math.abs(localTime - remoteTime) <= conflictWindowMs
    ? "restore-remote"
    : "compare-sources";
}

export function summarizeBridgeWorkspace(stateJson) {
  const state = parseStateJson(stateJson);
  const profiles = Array.isArray(state.profiles) ? state.profiles : [];
  const progress = state.progress && typeof state.progress === "object" && !Array.isArray(state.progress) ? state.progress : {};
  const mapPlans = state.mapPlans && typeof state.mapPlans === "object" && !Array.isArray(state.mapPlans) ? state.mapPlans : {};
  const active = profiles.find((profile) => profile?.id === state.activeProfileId) ?? null;
  return {
    profileCount: profiles.length,
    profileNames: profiles.slice(0, 30).map((profile) => String(profile?.displayName ?? profile?.name ?? "Unnamed").slice(0, 80)),
    activeProfileName: active ? String(active.displayName ?? active.name ?? "Unnamed").slice(0, 80) : null,
    progressRecordCount: Object.values(progress).reduce((total, records) => total + (records && typeof records === "object" && !Array.isArray(records) ? Object.keys(records).length : 0), 0),
    attemptCount: Array.isArray(state.attempts) ? state.attempts.length : 0,
    reviewCount: Array.isArray(state.reviews) ? state.reviews.length : 0,
    curriculumCount: Array.isArray(state.curricula) ? state.curricula.length : 0,
    lessonPackCount: Array.isArray(state.lessonPacks) ? state.lessonPacks.length : 0,
    plannedProfileCount: Object.values(mapPlans).filter((plan) => plan && typeof plan === "object").length,
  };
}

export class GitHubSyncError extends Error {
  constructor(message, { status = null, code = "github_sync_error", details = null } = {}) {
    super(message);
    this.name = "GitHubSyncError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class GitHubSyncConflictError extends GitHubSyncError {
  constructor(message = "The GitHub copy changed on another device.", details = null) {
    super(message, { status: 409, code: "conflict", details });
    this.name = "GitHubSyncConflictError";
  }
}

function cleanIdentifier(value, label) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 100 || !/^[A-Za-z0-9_.-]+$/.test(text)) {
    throw new GitHubSyncError(`${label} is invalid.`, { code: "invalid_config" });
  }
  return text;
}

function cleanBranch(value) {
  const text = String(value ?? "main").trim();
  if (!text || text.length > 200 || text.startsWith("-") || text.endsWith(".") || /[\s~^:?*[\\]/.test(text) || text.includes("..") || text.includes("@{")) {
    throw new GitHubSyncError("Branch name is invalid.", { code: "invalid_config" });
  }
  return text;
}

export function normalizeGitHubSyncConfig(candidate, { requireToken = true } = {}) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new GitHubSyncError("GitHub sync configuration is missing.", { code: "invalid_config" });
  }
  const token = String(candidate.token ?? "").trim();
  if (requireToken && !token) throw new GitHubSyncError("GitHub access token is required.", { code: "missing_token" });
  if (token.length > 500) throw new GitHubSyncError("GitHub access token is invalid.", { code: "invalid_config" });
  const role = candidate.role === "agent" ? "agent" : "learner";
  const repo = cleanIdentifier(candidate.repo, "Repository name");
  if (repo.toLowerCase() === "quickmaths") {
    throw new GitHubSyncError("Use a separate private data repository, not the public QuickMaths source repository.", { code: "source_repository_forbidden" });
  }
  return {
    owner: cleanIdentifier(candidate.owner, "Repository owner"),
    repo,
    branch: cleanBranch(candidate.branch),
    token,
    role,
    rememberToken: candidate.rememberToken === true,
  };
}

function storageGet(storage, key) {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

function storageSet(storage, key, value) {
  if (!storage) return;
  storage.setItem(key, value);
}

function storageRemove(storage, key) {
  try { storage?.removeItem(key); } catch { /* Best-effort credential cleanup. */ }
}

export function createGitHubCredentialStore({
  configStorage,
  sessionCredentialStorage,
  persistentCredentialStorage,
} = {}) {
  const load = ({ role = "learner" } = {}) => {
    const resolvedRole = role === "agent" ? "agent" : "learner";
    let saved = null;
    try { saved = JSON.parse(storageGet(configStorage, configKey(resolvedRole)) ?? "null"); } catch { saved = null; }
    if (!saved) return null;
    const token = storageGet(sessionCredentialStorage, sessionTokenKey(resolvedRole))
      ?? storageGet(persistentCredentialStorage, persistentTokenKey(resolvedRole))
      ?? "";
    try {
      return normalizeGitHubSyncConfig({ ...saved, token, role: resolvedRole }, { requireToken: false });
    } catch {
      return null;
    }
  };

  const save = (candidate) => {
    const config = normalizeGitHubSyncConfig(candidate);
    storageSet(configStorage, configKey(config.role), JSON.stringify({
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
      role: config.role,
      rememberToken: config.rememberToken,
    }));
    storageRemove(sessionCredentialStorage, sessionTokenKey(config.role));
    storageRemove(persistentCredentialStorage, persistentTokenKey(config.role));
    if (config.rememberToken) storageSet(persistentCredentialStorage, persistentTokenKey(config.role), config.token);
    else storageSet(sessionCredentialStorage, sessionTokenKey(config.role), config.token);
    return config;
  };

  const clear = ({ role = "learner" } = {}) => {
    const resolvedRole = role === "agent" ? "agent" : "learner";
    storageRemove(configStorage, configKey(resolvedRole));
    storageRemove(sessionCredentialStorage, sessionTokenKey(resolvedRole));
    storageRemove(persistentCredentialStorage, persistentTokenKey(resolvedRole));
    storageRemove(configStorage, metadataKey(resolvedRole));
  };

  const loadMetadata = ({ role = "learner" } = {}) => {
    try {
      const value = JSON.parse(storageGet(configStorage, metadataKey(role)) ?? "null");
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch { return null; }
  };

  const saveMetadata = ({ role = "learner", metadata } = {}) => {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return;
    storageSet(configStorage, metadataKey(role), JSON.stringify(metadata));
  };

  return { load, save, clear, loadMetadata, saveMetadata };
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(String(value));
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return globalThis.btoa(binary);
}

function decodeBase64(value) {
  const binary = globalThis.atob(String(value).replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function responseMessage(response) {
  try {
    const body = await response.json();
    return typeof body?.message === "string" ? body.message : null;
  } catch {
    return null;
  }
}

function apiHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export function createGitHubContentsClient({ fetchImpl = globalThis.fetch, apiBase = DEFAULT_API_BASE } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function.");
  const base = String(apiBase).replace(/\/$/, "");

  const request = async (url, options, label) => {
    let response;
    try { response = await fetchImpl(url, options); }
    catch (error) {
      throw new GitHubSyncError(`Could not reach GitHub while ${label}.`, { code: "network_error", details: String(error) });
    }
    if (response.ok) return response;
    const message = await responseMessage(response);
    if (response.status === 401) throw new GitHubSyncError("GitHub rejected the access token.", { status: 401, code: "unauthorized" });
    if (response.status === 403) throw new GitHubSyncError(message || "GitHub denied access to this repository.", { status: 403, code: "forbidden" });
    if (response.status === 409) throw new GitHubSyncConflictError(message || undefined);
    throw new GitHubSyncError(message || `GitHub request failed with status ${response.status}.`, { status: response.status, code: "github_error" });
  };

  const repositoryUrl = (config) => `${base}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  const contentsUrl = (config, path) => `${repositoryUrl(config)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  const blobUrl = (config, sha) => `${repositoryUrl(config)}/git/blobs/${encodeURIComponent(sha)}`;

  const verify = async (candidate) => {
    const config = normalizeGitHubSyncConfig(candidate);
    const response = await request(repositoryUrl(config), { headers: apiHeaders(config.token) }, "checking the sync repository");
    const body = await response.json();
    return {
      owner: body?.owner?.login ?? config.owner,
      repo: body?.name ?? config.repo,
      private: body?.private === true,
      defaultBranch: body?.default_branch ?? config.branch,
      permissions: body?.permissions ?? null,
    };
  };

  const readFile = async (candidate, path) => {
    const config = normalizeGitHubSyncConfig(candidate);
    const url = `${contentsUrl(config, path)}?ref=${encodeURIComponent(config.branch)}`;
    let response;
    try { response = await fetchImpl(url, { headers: apiHeaders(config.token) }); }
    catch (error) {
      throw new GitHubSyncError("Could not reach GitHub while loading bridge state.", { code: "network_error", details: String(error) });
    }
    if (response.status === 404) return { exists: false, sha: null, content: null };
    if (!response.ok) {
      const message = await responseMessage(response);
      if (response.status === 401) throw new GitHubSyncError("GitHub rejected the access token.", { status: 401, code: "unauthorized" });
      if (response.status === 403) throw new GitHubSyncError(message || "GitHub denied access to this repository.", { status: 403, code: "forbidden" });
      throw new GitHubSyncError(message || `GitHub request failed with status ${response.status}.`, { status: response.status, code: "github_error" });
    }
    const body = await response.json();
    if (body?.type !== "file" || typeof body.sha !== "string") {
      throw new GitHubSyncError(`${path} is not a readable file.`, { code: "invalid_remote_state" });
    }
    if (Number.isFinite(body.size) && body.size > MAX_BRIDGE_FILE_BYTES) {
      throw new GitHubSyncError(`${path} is too large for QuickMaths Workspace Storage.`, { code: "invalid_remote_state" });
    }

    let encodedContent = typeof body.content === "string" ? body.content : null;
    // GitHub's Contents API intentionally omits inline content for files above
    // 1 MB. Fetch the immutable blob by SHA instead of mistaking the omission
    // for an empty/corrupt checkpoint.
    if ((!encodedContent && Number(body.size) > 0) || body.encoding === "none") {
      const blobResponse = await request(blobUrl(config, body.sha), { headers: apiHeaders(config.token) }, "loading large bridge state");
      const blob = await blobResponse.json();
      if (blob?.encoding !== "base64" || typeof blob.content !== "string") {
        throw new GitHubSyncError(`${path} has no readable GitHub blob.`, { code: "invalid_remote_state" });
      }
      if (Number.isFinite(blob.size) && blob.size > MAX_BRIDGE_FILE_BYTES) {
        throw new GitHubSyncError(`${path} is too large for QuickMaths Workspace Storage.`, { code: "invalid_remote_state" });
      }
      encodedContent = blob.content;
    }
    if (typeof encodedContent !== "string") {
      throw new GitHubSyncError(`${path} has no readable content.`, { code: "invalid_remote_state" });
    }
    const content = decodeBase64(encodedContent);
    if (new TextEncoder().encode(content).byteLength > MAX_BRIDGE_FILE_BYTES) {
      throw new GitHubSyncError(`${path} is too large for QuickMaths Workspace Storage.`, { code: "invalid_remote_state" });
    }
    return { exists: true, sha: body.sha, content };
  };

  const writeFile = async (candidate, path, content, { sha = null, message = null } = {}) => {
    const config = normalizeGitHubSyncConfig(candidate);
    const body = {
      message: message || `QuickMaths Bridge: update ${path}`,
      content: encodeBase64(content),
      branch: config.branch,
    };
    if (sha) body.sha = sha;
    const response = await request(contentsUrl(config, path), {
      method: "PUT",
      headers: { ...apiHeaders(config.token), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, "saving bridge state");
    const payload = await response.json();
    const nextSha = payload?.content?.sha;
    if (typeof nextSha !== "string") throw new GitHubSyncError("GitHub saved the file but returned no revision.", { code: "invalid_github_response" });
    return { sha: nextSha, commitSha: payload?.commit?.sha ?? null };
  };

  const deleteFile = async (candidate, path, { sha, message = null } = {}) => {
    const config = normalizeGitHubSyncConfig(candidate);
    if (typeof sha !== "string" || !sha.trim()) {
      throw new GitHubSyncError(`Cannot delete ${path} without its current revision.`, { code: "missing_file_revision" });
    }
    const response = await request(contentsUrl(config, path), {
      method: "DELETE",
      headers: { ...apiHeaders(config.token), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message || `QuickMaths Bridge: delete ${path}`,
        sha,
        branch: config.branch,
      }),
    }, "deleting bridge state");
    const payload = await response.json();
    return { deleted: true, commitSha: payload?.commit?.sha ?? null };
  };

  return { verify, readFile, writeFile, deleteFile };
}

function parseStateJson(stateJson) {
  if (typeof stateJson !== "string" || stateJson.length > 10_000_000) {
    throw new GitHubSyncError("QuickMaths state is invalid or too large.", { code: "invalid_local_state" });
  }
  try {
    const value = JSON.parse(stateJson);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value;
  } catch {
    throw new GitHubSyncError("QuickMaths state is not valid JSON.", { code: "invalid_local_state" });
  }
}

export function createBridgeEnvelope({
  channel,
  stateJson,
  deviceId,
  deviceLabel = null,
  actorKind = null,
  actorLabel = null,
  baseLearnerSha = null,
  now = () => new Date(),
}) {
  if (!["learner", "agent"].includes(channel)) throw new GitHubSyncError("Bridge channel is invalid.", { code: "invalid_channel" });
  const device = String(deviceId ?? "").trim();
  if (!device || device.length > 120) throw new GitHubSyncError("Bridge device ID is invalid.", { code: "invalid_device" });
  const resolvedDeviceLabel = String(deviceLabel ?? "QuickMaths device").trim().slice(0, 80) || "QuickMaths device";
  const resolvedActorKind = channel === "agent" || actorKind === "agent" ? "agent" : "device";
  const resolvedActorLabel = String(actorLabel ?? (resolvedActorKind === "agent" ? "QuickMaths agent" : resolvedDeviceLabel)).trim().slice(0, 80)
    || (resolvedActorKind === "agent" ? "QuickMaths agent" : resolvedDeviceLabel);
  if (channel === "agent" && (typeof baseLearnerSha !== "string" || !baseLearnerSha.trim() || baseLearnerSha.length > 200)) {
    throw new GitHubSyncError("Pull a learner checkpoint before publishing agent changes.", { code: "missing_learner_base" });
  }
  return JSON.stringify({
    format: BRIDGE_FORMAT,
    schema_version: BRIDGE_SCHEMA_VERSION,
    channel,
    updated_at: now().toISOString(),
    device_id: device,
    device_label: resolvedDeviceLabel,
    actor: { kind: resolvedActorKind, label: resolvedActorLabel },
    base_learner_sha: channel === "agent" ? baseLearnerSha : null,
    app_state: parseStateJson(stateJson),
  }, null, 2);
}

export function parseBridgeEnvelope(raw, { expectedChannel = null } = {}) {
  if (typeof raw !== "string" || raw.length > 10_000_000) throw new GitHubSyncError("Bridge state is invalid or too large.", { code: "invalid_remote_state" });
  let value;
  try { value = JSON.parse(raw); } catch { throw new GitHubSyncError("Bridge state is not valid JSON.", { code: "invalid_remote_state" }); }
  if (!value || value.format !== BRIDGE_FORMAT || value.schema_version !== BRIDGE_SCHEMA_VERSION || !["learner", "agent"].includes(value.channel)) {
    throw new GitHubSyncError("Repository file is not QuickMaths Bridge state.", { code: "invalid_remote_state" });
  }
  if (expectedChannel && value.channel !== expectedChannel) throw new GitHubSyncError("Bridge state belongs to the wrong channel.", { code: "invalid_remote_state" });
  if (!value.app_state || typeof value.app_state !== "object" || Array.isArray(value.app_state)) {
    throw new GitHubSyncError("Bridge state has no QuickMaths snapshot.", { code: "invalid_remote_state" });
  }
  if (value.channel === "agent" && (typeof value.base_learner_sha !== "string" || !value.base_learner_sha.trim())) {
    throw new GitHubSyncError("Agent bridge state has no learner revision.", { code: "invalid_remote_state" });
  }
  return {
    channel: value.channel,
    updatedAt: typeof value.updated_at === "string" ? value.updated_at : null,
    deviceId: typeof value.device_id === "string" ? value.device_id : null,
    deviceLabel: typeof value.device_label === "string" && value.device_label.trim() ? value.device_label.slice(0, 80) : "QuickMaths device",
    actorKind: value.actor?.kind === "agent" || value.channel === "agent" ? "agent" : "device",
    actorLabel: typeof value.actor?.label === "string" && value.actor.label.trim()
      ? value.actor.label.slice(0, 80)
      : value.channel === "agent" ? "QuickMaths agent" : (typeof value.device_label === "string" && value.device_label.trim() ? value.device_label.slice(0, 80) : "QuickMaths device"),
    baseLearnerSha: typeof value.base_learner_sha === "string" ? value.base_learner_sha : null,
    stateJson: JSON.stringify(value.app_state),
  };
}

function makeDeviceId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function statusClone(status) {
  return { ...status, config: status.config ? { ...status.config, token: undefined } : null };
}

export function createGitHubSyncController({
  role = "learner",
  client = createGitHubContentsClient(),
  credentialStore,
  serializeState,
  applyState,
  subscribeToState = null,
  now = () => new Date(),
  deviceId = null,
  deviceLabel = null,
  debounceMs = 8_000,
  pollMs = 5_000,
  idlePollMs = 30_000,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  if (!["learner", "agent"].includes(role)) throw new TypeError("role must be learner or agent.");
  if (typeof serializeState !== "function" || typeof applyState !== "function") throw new TypeError("serializeState and applyState are required.");
  if (!credentialStore?.load || !credentialStore?.save || !credentialStore?.clear) throw new TypeError("credentialStore is required.");

  const listeners = new Set();
  let config = credentialStore.load({ role });
  let metadata = credentialStore.loadMetadata?.({ role }) ?? null;
  const repositoryKey = (value) => value ? `${value.owner}/${value.repo}@${value.branch}`.toLowerCase() : null;
  if (metadata?.repositoryKey !== repositoryKey(config)) metadata = null;
  const resolvedDeviceId = String(deviceId || metadata?.deviceId || makeDeviceId());
  const resolvedDeviceLabel = String(deviceLabel || metadata?.deviceLabel || (role === "agent" ? "QuickMaths agent" : "QuickMaths device")).trim().slice(0, 80)
    || (role === "agent" ? "QuickMaths agent" : "QuickMaths device");
  let debounceTimer = null;
  let pollTimer = null;
  let stopped = true;
  let suppressStateChange = false;
  let operation = Promise.resolve();
  let learnerSha = typeof metadata?.learnerSha === "string" ? metadata.learnerSha : null;
  let agentSha = typeof metadata?.agentSha === "string" ? metadata.agentSha : null;
  let unsubscribe = null;
  let consecutiveIdlePolls = 0;
  let localChangedAt = typeof metadata?.localChangedAt === "string" ? metadata.localChangedAt : null;
  let pendingLearnerActor = role === "learner" && ["agent", "device"].includes(metadata?.pendingActor?.kind)
    ? {
        kind: metadata.pendingActor.kind,
        label: String(metadata.pendingActor.label ?? (metadata.pendingActor.kind === "agent" ? "QuickMaths agent" : resolvedDeviceLabel)).slice(0, 80),
      }
    : null;
  const status = {
    role,
    phase: config?.token ? "idle" : "disconnected",
    connected: false,
    dirty: metadata?.dirty === true,
    remoteAvailable: false,
    lastPushedAt: null,
    lastPulledAt: null,
    lastRemoteUpdatedAt: null,
    error: null,
    conflict: null,
    conflictDetails: null,
    deviceId: resolvedDeviceId,
    deviceLabel: resolvedDeviceLabel,
    localChangedAt,
    lastRemoteActor: null,
    config,
  };

  const emit = () => {
    const view = statusClone(status);
    listeners.forEach((listener) => listener(view));
  };

  const persistMetadata = ({ revisions = false, clearRevisions = false } = {}) => {
    if (!config) return;
    const currentRepositoryKey = repositoryKey(config);
    const saved = credentialStore.loadMetadata?.({ role }) ?? null;
    const sameRepository = saved?.repositoryKey === currentRepositoryKey;
    const savedLearnerSha = sameRepository && typeof saved?.learnerSha === "string" ? saved.learnerSha : null;
    const savedAgentSha = sameRepository && typeof saved?.agentSha === "string" ? saved.agentSha : null;
    const savedPendingActor = sameRepository && ["agent", "device"].includes(saved?.pendingActor?.kind) ? saved.pendingActor : null;
    credentialStore.saveMetadata?.({
      role,
      metadata: {
        repositoryKey: currentRepositoryKey,
        deviceId: resolvedDeviceId,
        deviceLabel: resolvedDeviceLabel,
        // Several QuickMaths tabs can share one credential store. Routine status
        // updates from an older tab must not erase a revision learned by the tab
        // that just pushed or pulled. Only revision-changing operations replace
        // these fields; clearing storage explicitly removes both.
        learnerSha: clearRevisions ? null : revisions ? learnerSha : (savedLearnerSha ?? learnerSha),
        agentSha: clearRevisions ? null : revisions ? agentSha : (savedAgentSha ?? agentSha),
        dirty: status.dirty,
        localChangedAt,
        pendingActor: clearRevisions ? null : revisions ? pendingLearnerActor : (pendingLearnerActor ?? savedPendingActor),
      },
    });
  };

  const update = (patch) => {
    if (patch.conflict === null) status.conflictDetails = null;
    Object.assign(status, patch);
    persistMetadata();
    emit();
  };

  const runSerial = (task) => {
    const next = operation.then(task, task);
    operation = next.catch(() => {});
    return next;
  };

  const requireConfig = () => {
    if (!config?.token) throw new GitHubSyncError("Connect a GitHub repository first.", { code: "not_connected" });
    return normalizeGitHubSyncConfig({ ...config, role });
  };

  const requireWritablePrivateRepository = (repository) => {
    if (!repository?.private) {
      throw new GitHubSyncError("QuickMaths workspace storage must use a private repository.", { code: "public_repository_forbidden" });
    }
    if (repository.transport !== "local-git" && repository.permissions?.push !== true) {
      throw new GitHubSyncError("The token does not have write access to this repository.", { code: "missing_write_permission" });
    }
    return repository;
  };

  const withPhase = async (phase, task) => {
    update({ phase, error: null });
    try { return await task(); }
    catch (error) {
      const conflict = error instanceof GitHubSyncConflictError ? error.message : null;
      update({
        phase: conflict ? "conflict" : "error",
        error: error instanceof Error ? error.message : String(error),
        conflict,
        conflictDetails: error instanceof GitHubSyncConflictError ? error.details : null,
      });
      throw error;
    }
  };

  const applyRemote = async (stateJson) => {
    suppressStateChange = true;
    try { await applyState(stateJson); }
    finally { suppressStateChange = false; }
  };

  const readChannel = async (channel) => {
    const current = requireConfig();
    const path = channel === "learner" ? LEARNER_STATE_PATH : AGENT_STATE_PATH;
    const remote = await client.readFile(current, path);
    if (!remote.exists) return { ...remote, envelope: null };
    return { ...remote, envelope: parseBridgeEnvelope(remote.content, { expectedChannel: channel }) };
  };

  const schedulePoll = () => {
    if (stopped || !status.connected) return;
    if (pollTimer) clearTimer(pollTimer);
    const delay = consecutiveIdlePolls >= 3 ? idlePollMs : pollMs;
    pollTimer = setTimer(async () => {
      pollTimer = null;
      try {
        // Learner browsers have two remote channels: the canonical workspace
        // written by devices, and the revision-bound response written by an
        // agent. Check both from every route; the page shell decides whether a
        // dirty cross-device mismatch can be resolved automatically or needs a
        // global A/B comparison.
        if (role === "learner") await syncLearnerNow({ quiet: true });
        await pullNow({ quiet: true });
      } catch { /* Status already records the failure. */ }
      schedulePoll();
    }, delay);
  };

  const schedulePush = ({ actorKind = "device", actorLabel = null, changedAt = null } = {}) => {
    if (suppressStateChange || !config?.token) return;
    localChangedAt = typeof changedAt === "string" && Number.isFinite(Date.parse(changedAt)) ? changedAt : now().toISOString();
    if (role === "learner") {
      pendingLearnerActor = actorKind === "agent"
        ? { kind: "agent", label: String(actorLabel || "QuickMaths agent").slice(0, 80) }
        : { kind: "device", label: resolvedDeviceLabel };
    }
    update({ dirty: true, localChangedAt });
    // Agent work is deliberately transactional: tools may make several related
    // state changes before publish_agent_checkpoint commits one coherent result.
    if (role === "agent") return;
    if (!status.connected || stopped) return;
    // Keep the first pending checkpoint timer. A session heartbeat updates the
    // store every second, so resetting this timer on every notification would
    // postpone autosave forever while the learner keeps the page open.
    if (debounceTimer) return;
    debounceTimer = setTimer(async () => {
      debounceTimer = null;
      try { await pushNow(); } catch { /* Status already records the failure. */ }
    }, Math.max(500, debounceMs));
  };

  const connect = (candidate, { startPolling = true } = {}) => runSerial(() => withPhase("connecting", async () => {
    const previousRepository = repositoryKey(config);
    const nextConfig = normalizeGitHubSyncConfig({ ...candidate, role });
    const repository = requireWritablePrivateRepository(await client.verify(nextConfig));
    config = credentialStore.save(nextConfig);
    if (previousRepository !== repositoryKey(config)) {
      learnerSha = null;
      agentSha = null;
      status.dirty = false;
    }
    status.config = config;
    stopped = false;
    update({ connected: true, phase: "idle", error: null, conflict: null, repository });
    persistMetadata();
    if (startPolling) schedulePoll();
    return repository;
  }));

  const resume = ({ startPolling = true } = {}) => runSerial(() => withPhase("connecting", async () => {
    config = credentialStore.load({ role });
    status.config = config;
    const current = requireConfig();
    const repository = requireWritablePrivateRepository(await client.verify(current));
    stopped = false;
    update({ connected: true, phase: "idle", error: null, conflict: null, repository });
    persistMetadata();
    if (startPolling) schedulePoll();
    return repository;
  }));

  const pushNow = ({ force = false } = {}) => runSerial(() => withPhase("pushing", async () => {
    const current = requireConfig();
    const channel = role;
    const path = channel === "learner" ? LEARNER_STATE_PATH : AGENT_STATE_PATH;
    if (role === "agent") {
      if (!learnerSha) throw new GitHubSyncConflictError("Pull the learner checkpoint before publishing agent changes.");
      const latestLearner = await readChannel("learner");
      if (!latestLearner.exists) throw new GitHubSyncConflictError("The learner checkpoint no longer exists. Pull it again before publishing.");
      if (latestLearner.sha !== learnerSha) {
        throw new GitHubSyncConflictError("The learner changed after this agent workspace pulled. Pull the learner again before publishing.", {
          knownLearnerSha: learnerSha,
          remoteLearnerSha: latestLearner.sha,
        });
      }
    }
    const latest = await readChannel(channel);
    const knownSha = channel === "learner" ? learnerSha : agentSha;
    if (!force && latest.exists && latest.sha !== knownSha) {
      throw new GitHubSyncConflictError("GitHub has a newer copy. Pull it before pushing.", { channel, knownSha, remoteSha: latest.sha });
    }
    const publishedActorLabel = role === "agent"
      ? resolvedDeviceLabel
      : pendingLearnerActor?.label || resolvedDeviceLabel;
    const envelope = createBridgeEnvelope({
      channel,
      stateJson: serializeState(),
      deviceId: resolvedDeviceId,
      deviceLabel: resolvedDeviceLabel,
      actorKind: role === "agent" ? "agent" : pendingLearnerActor?.kind,
      actorLabel: role === "agent" ? resolvedDeviceLabel : pendingLearnerActor?.label,
      baseLearnerSha: channel === "agent" ? learnerSha : null,
      now,
    });
    let result;
    try {
      result = await client.writeFile(current, path, envelope, {
        sha: latest.sha,
        message: `QuickMaths Bridge: ${channel} checkpoint`,
      });
    } catch (error) {
      if (!force || role !== "learner" || !(error instanceof GitHubSyncConflictError)) throw error;
      const refreshed = await readChannel(channel);
      result = await client.writeFile(current, path, envelope, {
        sha: refreshed.sha,
        message: `QuickMaths Bridge: resolve ${channel} checkpoint conflict`,
      });
    }
    if (channel === "learner") learnerSha = result.sha;
    else agentSha = result.sha;
    if (channel === "learner") pendingLearnerActor = null;
    persistMetadata({ revisions: true });
    const pushedAt = now().toISOString();
    update({
      phase: "synced",
      dirty: false,
      lastPushedAt: pushedAt,
      lastRemoteUpdatedAt: pushedAt,
      lastRemoteActor: publishedActorLabel,
      error: null,
      conflict: null,
      remoteAvailable: true,
    });
    return { ...result, channel };
  }));

  const pullNow = ({ quiet = false } = {}) => runSerial(() => withPhase(quiet ? status.phase : "pulling", async () => {
    const channel = role === "learner" ? "agent" : "learner";
    const remote = await readChannel(channel);
    if (!remote.exists) {
      consecutiveIdlePolls += 1;
      update({ phase: status.dirty ? "idle" : "synced", remoteAvailable: false, error: null });
      return { updated: false, exists: false, channel };
    }
    const knownSha = channel === "learner" ? learnerSha : agentSha;
    if (remote.sha === knownSha) {
      consecutiveIdlePolls += 1;
      update({ phase: status.dirty ? "idle" : "synced", remoteAvailable: true, error: null, lastRemoteActor: remote.envelope.actorLabel });
      return { updated: false, exists: true, sha: remote.sha, channel };
    }
    if (status.dirty) {
      throw new GitHubSyncConflictError(role === "learner"
        ? "This device has learner changes that are not checkpointed yet. Sync them before applying agent changes."
        : "This agent workspace has unpublished changes. Publish or discard them before pulling a newer learner checkpoint.");
    }
    if (role === "learner" && (!learnerSha || remote.envelope.baseLearnerSha !== learnerSha)) {
      agentSha = remote.sha;
      persistMetadata({ revisions: true });
      consecutiveIdlePolls = 0;
      update({
        phase: status.dirty ? "idle" : "synced",
        remoteAvailable: true,
        lastPulledAt: now().toISOString(),
        lastRemoteUpdatedAt: remote.envelope.updatedAt,
        lastRemoteActor: remote.envelope.actorLabel,
        error: null,
        conflict: null,
      });
      return {
        updated: false, exists: true, ignored: true, stale: true,
        sha: remote.sha, channel, updatedAt: remote.envelope.updatedAt,
      };
    }
    await applyRemote(remote.envelope.stateJson);
    localChangedAt = remote.envelope.updatedAt ?? now().toISOString();
    if (channel === "learner") learnerSha = remote.sha;
    else agentSha = remote.sha;
    persistMetadata({ revisions: true });
    consecutiveIdlePolls = 0;
    update({
      phase: "synced",
      dirty: false,
      remoteAvailable: true,
      lastPulledAt: now().toISOString(),
      lastRemoteUpdatedAt: remote.envelope.updatedAt,
      lastRemoteActor: remote.envelope.actorLabel,
      localChangedAt,
      error: null,
      conflict: null,
    });
    if (role === "learner") schedulePush({ actorKind: "agent", actorLabel: remote.envelope.actorLabel, changedAt: remote.envelope.updatedAt });
    return { updated: true, exists: true, sha: remote.sha, channel, updatedAt: remote.envelope.updatedAt };
  }));

  const syncLearnerNow = ({ quiet = false } = {}) => runSerial(() => withPhase(quiet ? status.phase : "pulling", async () => {
    if (role !== "learner") throw new GitHubSyncError("Only a learner browser can follow the canonical learner checkpoint.", { code: "wrong_role" });
    const remote = await readChannel("learner");
    if (!remote.exists) {
      update({ phase: status.dirty ? "idle" : "synced", remoteAvailable: false, error: null });
      return { updated: false, exists: false, channel: "learner" };
    }
    if (remote.sha === learnerSha) {
      update({
        phase: status.dirty ? "idle" : "synced",
        remoteAvailable: true,
        lastRemoteUpdatedAt: remote.envelope.updatedAt,
        lastRemoteActor: remote.envelope.actorLabel,
        error: null,
      });
      return { updated: false, exists: true, sha: remote.sha, channel: "learner" };
    }
    if (status.dirty) {
      throw new GitHubSyncConflictError("Another device or agent has a newer QuickMaths workspace while this device has unsynced work.", {
        channel: "learner",
        knownSha: learnerSha,
        remoteSha: remote.sha,
        remoteUpdatedAt: remote.envelope.updatedAt,
        remoteDeviceId: remote.envelope.deviceId,
        remoteDeviceLabel: remote.envelope.deviceLabel,
        remoteActorKind: remote.envelope.actorKind,
        remoteActorLabel: remote.envelope.actorLabel,
      });
    }
    await applyRemote(remote.envelope.stateJson);
    localChangedAt = remote.envelope.updatedAt ?? now().toISOString();
    pendingLearnerActor = null;
    learnerSha = remote.sha;
    persistMetadata({ revisions: true });
    consecutiveIdlePolls = 0;
    update({
      phase: "synced",
      dirty: false,
      remoteAvailable: true,
      lastPulledAt: now().toISOString(),
      lastRemoteUpdatedAt: remote.envelope.updatedAt,
      lastRemoteActor: remote.envelope.actorLabel,
      localChangedAt,
      error: null,
      conflict: null,
    });
    return {
      updated: true,
      exists: true,
      sha: remote.sha,
      channel: "learner",
      updatedAt: remote.envelope.updatedAt,
      actorKind: remote.envelope.actorKind,
      actorLabel: remote.envelope.actorLabel,
    };
  }));

  const restoreLearner = ({ force = false } = {}) => runSerial(() => withPhase("pulling", async () => {
    const remote = await readChannel("learner");
    if (!remote.exists) return { updated: false, exists: false, channel: "learner" };
    if (!force && status.dirty) throw new GitHubSyncConflictError("This device has unsynced changes. Push them or force the restore.");
    await applyRemote(remote.envelope.stateJson);
    localChangedAt = remote.envelope.updatedAt ?? now().toISOString();
    pendingLearnerActor = null;
    learnerSha = remote.sha;
    persistMetadata({ revisions: true });
    update({
      phase: "synced", dirty: false, remoteAvailable: true,
      lastPulledAt: now().toISOString(), lastRemoteUpdatedAt: remote.envelope.updatedAt,
      lastRemoteActor: remote.envelope.actorLabel, localChangedAt,
      error: null, conflict: null,
    });
    return { updated: true, exists: true, sha: remote.sha, channel: "learner", updatedAt: remote.envelope.updatedAt };
  }));

  const inspectRemote = () => runSerial(() => withPhase("checking", async () => {
    const learner = await readChannel("learner");
    if (role === "learner") {
      const agent = await readChannel("agent");
      update({ phase: "idle", remoteAvailable: learner.exists || agent.exists, error: null });
      return { learner, agent };
    }
    update({ phase: "idle", remoteAvailable: learner.exists, error: null });
    return { learner, agent: null };
  }));

  const pauseRemoteActivity = () => {
    stopped = true;
    if (debounceTimer) clearTimer(debounceTimer);
    if (pollTimer) clearTimer(pollTimer);
    debounceTimer = null;
    pollTimer = null;
  };

  const deleteRemoteAgentCheckpoint = () => runSerial(() => withPhase("deleting", async () => {
    if (role !== "learner") throw new GitHubSyncError("Only the learner workspace can discard an agent checkpoint.", { code: "wrong_role" });
    const current = requireConfig();
    requireWritablePrivateRepository(await client.verify(current));
    const remote = await readChannel("agent");
    if (remote.exists) {
      if (typeof client.deleteFile !== "function") throw new GitHubSyncError("This storage connection cannot delete files.", { code: "delete_unavailable" });
      await client.deleteFile(current, AGENT_STATE_PATH, {
        sha: remote.sha,
        message: "QuickMaths Workspace Storage: discard stale agent checkpoint",
      });
    }
    agentSha = null;
    persistMetadata({ revisions: true });
    update({ phase: "synced", error: null, conflict: null, remoteAvailable: learnerSha != null });
    return { deleted: remote.exists, path: AGENT_STATE_PATH };
  }));

  const clearRemoteWorkspace = () => runSerial(() => withPhase("deleting", async () => {
    if (role !== "learner") throw new GitHubSyncError("Only the learner workspace can clear Workspace Storage.", { code: "wrong_role" });
    pauseRemoteActivity();
    const current = requireConfig();
    requireWritablePrivateRepository(await client.verify(current));
    if (typeof client.deleteFile !== "function") throw new GitHubSyncError("This storage connection cannot delete files.", { code: "delete_unavailable" });
    const deletedPaths = [];
    // Delete the agent copy first because it can contain an older complete
    // workspace. A retry is safe if either file changes between reads.
    for (const [channel, path] of [["agent", AGENT_STATE_PATH], ["learner", LEARNER_STATE_PATH]]) {
      const remote = await readChannel(channel);
      if (!remote.exists) continue;
      await client.deleteFile(current, path, {
        sha: remote.sha,
        message: `QuickMaths Workspace Storage: clear ${path}`,
      });
      deletedPaths.push(path);
    }
    learnerSha = null;
    agentSha = null;
    persistMetadata({ clearRevisions: true });
    update({ phase: "cleared", dirty: false, remoteAvailable: false, error: null, conflict: null });
    return { deletedPaths };
  }));

  const resumeAfterClear = () => {
    if (role !== "learner") throw new GitHubSyncError("Only the learner workspace can resume cleared Workspace Storage.", { code: "wrong_role" });
    requireConfig();
    if (!status.connected) throw new GitHubSyncError("Connect a GitHub repository first.", { code: "not_connected" });
    stopped = false;
    update({ phase: "cleared", dirty: false, remoteAvailable: false, error: null, conflict: null });
    schedulePoll();
    return statusClone(status);
  };

  const disconnect = () => {
    pauseRemoteActivity();
    credentialStore.clear({ role });
    config = null;
    learnerSha = null;
    agentSha = null;
    update({
      phase: "disconnected", connected: false, dirty: false, remoteAvailable: false,
      error: null, conflict: null, config: null, repository: null,
    });
  };

  const stop = () => {
    stopped = true;
    if (debounceTimer) clearTimer(debounceTimer);
    if (pollTimer) clearTimer(pollTimer);
    debounceTimer = null;
    pollTimer = null;
  };

  const start = () => {
    if (!status.connected) throw new GitHubSyncError("Connect a GitHub repository first.", { code: "not_connected" });
    stopped = false;
    schedulePoll();
  };

  if (typeof subscribeToState === "function") unsubscribe = subscribeToState(() => schedulePush());

  return {
    connect,
    resume,
    disconnect,
    start,
    stop,
    dispose() { stop(); unsubscribe?.(); listeners.clear(); },
    pushNow,
    pullNow,
    restoreLearner,
    inspectRemote,
    syncLearnerNow,
    deleteRemoteAgentCheckpoint,
    clearRemoteWorkspace,
    resumeAfterClear,
    schedulePush,
    snapshot: () => statusClone(status),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
