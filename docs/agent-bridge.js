import { createQuickMathsStore } from "./challenge-core.js?v=20260903-combined-map-v1";
import { registerWebMcpTools, TOOL_NAMES } from "./webmcp-tools.js?v=20260903-combined-map-v1";
import { createLessonDepot } from "./lesson-depot.js?v=20260902-python-v1";
import {
  createGitHubContentsClient,
  createGitHubCredentialStore,
  createGitHubSyncController,
} from "./github-sync.js?v=20260903-storage-manager-v1";
import { BRIDGE_TOOL_NAMES, registerBridgeWebMcpTools } from "./bridge-webmcp-tools.js";
import {
  createLocalBridgeCredentialStore,
  createLocalGitContentsClient,
  resolveLocalBridgeCapability,
} from "./local-git-client.js";

const elements = {
  liveStatus: document.querySelector("#live-status"),
  form: document.querySelector("#connection-form"),
  message: document.querySelector("#connection-message"),
  disconnect: document.querySelector("#disconnect-button"),
  pull: document.querySelector("#pull-button"),
  push: document.querySelector("#push-button"),
  learnerName: document.querySelector("#learner-name"),
  learnerSubject: document.querySelector("#learner-subject"),
  learnerRoute: document.querySelector("#learner-route"),
  learnerAttempts: document.querySelector("#learner-attempts"),
  learnerSuggested: document.querySelector("#learner-suggested"),
  profileMark: document.querySelector("#profile-mark"),
  stateNote: document.querySelector("#state-note"),
  toolCount: document.querySelector("#tool-count"),
  toolStatus: document.querySelector("#tool-status"),
  toolList: document.querySelector("#tool-list"),
  toast: document.querySelector("#toast"),
};

let store;
let sync;
let lessonDepot;
let credentialStore;
let toastTimer;
let localMode = false;

function createAgentStateStorage(storage) {
  const prefix = "quickmaths.agent-bridge.";
  return {
    getItem(key) { return storage.getItem(`${prefix}${key}`); },
    setItem(key, value) { storage.setItem(`${prefix}${key}`, value); },
    removeItem(key) { storage.removeItem(`${prefix}${key}`); },
  };
}

function toast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { elements.toast.hidden = true; }, 3200);
}

function formatDate(value) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date) : "Unknown";
}

function renderStore(snapshot) {
  const profile = snapshot.activeProfile;
  elements.learnerName.textContent = profile?.displayName ?? "Waiting for a checkpoint";
  elements.profileMark.textContent = profile?.displayName?.slice(0, 1).toUpperCase() ?? "?";
  elements.learnerSubject.textContent = snapshot.activeSubject?.name ?? "—";
  elements.learnerRoute.textContent = profile ? snapshot.ui.route : "—";
  elements.learnerAttempts.textContent = String(snapshot.attempts?.length ?? 0);
  elements.learnerSuggested.textContent = snapshot.suggested?.name ?? "—";
}

function renderSync(status) {
  const working = ["connecting", "checking", "pulling", "pushing"].includes(status.phase);
  const state = status.phase === "conflict" ? "conflict" : status.error ? "error" : working ? "working" : status.connected ? "synced" : "idle";
  elements.liveStatus.dataset.state = state;
  elements.liveStatus.querySelector("span").textContent = status.error
    ? status.error
    : working
      ? `${status.phase[0].toUpperCase()}${status.phase.slice(1)}…`
      : status.connected
        ? `${localMode ? "Local Git · " : ""}${status.config.owner}/${status.config.repo} · ${status.phase}`
        : "GitHub bridge disconnected";
  elements.disconnect.hidden = localMode || !status.connected;
  elements.pull.disabled = !status.connected || working;
  elements.push.disabled = !status.connected || working || !store.snapshot().activeProfile;
  elements.stateNote.textContent = status.conflict
    ? `${status.conflict} Pull the learner again before publishing.`
    : status.connected
      ? `Last learner pull: ${formatDate(status.lastPulledAt)}. Last agent publish: ${formatDate(status.lastPushedAt)}.${status.dirty ? " Agent changes are waiting to publish." : ""}`
      : localMode
        ? "Start the local Bridge command again if this host connection stops. GitHub credentials never enter this page."
        : "Connect the same repository used by the learner’s QuickMaths Settings page.";
}

async function connectFromForm(event) {
  event.preventDefault();
  elements.message.textContent = "";
  const data = new FormData(elements.form);
  const saved = credentialStore.load({ role: "agent" });
  try {
    await sync.connect({
      owner: data.get("owner"),
      repo: data.get("repo"),
      branch: data.get("branch"),
      token: String(data.get("token") || saved?.token || ""),
      rememberToken: data.get("remember") === "on",
    });
    await sync.pullNow();
    elements.form.elements.token.value = "";
    toast("Agent workspace connected and learner state pulled.");
  } catch (error) {
    elements.message.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function boot() {
  const [curriculumResponse, geographyResponse, manifestResponse, educatorManifestResponse, authoringGuideResponse] = await Promise.all([
    fetch("./curriculum-data.json?v=20260902-native-math-expansion"),
    fetch("./lesson-depot/lessons/geography/1.0.0/lesson-set.json?v=20260902-geography-depot"),
    fetch("./agent-manifest.json?v=20260903-combined-map-v1").catch(() => null),
    fetch("./educator-agent-manifest.json?v=20260903-combined-map-v1").catch(() => null),
    fetch("./CUSTOM_LESSON_SETS.md?v=20260902-python-v1").catch(() => null),
  ]);
  if (!curriculumResponse.ok || !geographyResponse.ok) throw new Error("Could not load the QuickMaths curriculum.");
  const curriculum = await curriculumResponse.json();
  const bundledLessonPacks = [await geographyResponse.text()];
  const manifest = manifestResponse?.ok ? await manifestResponse.json() : {};
  const educatorManifest = educatorManifestResponse?.ok ? await educatorManifestResponse.json() : {};
  const authoringGuideMarkdown = authoringGuideResponse?.ok ? await authoringGuideResponse.text() : "";
  store = createQuickMathsStore({ storage: createAgentStateStorage(window.localStorage), curriculum, bundledLessonPacks });
  lessonDepot = createLessonDepot({ store, showToast: toast });
  lessonDepot.load();
  const localCapability = resolveLocalBridgeCapability();
  let bridgeClient;
  let localRepository = null;
  if (localCapability && ["127.0.0.1", "localhost"].includes(window.location.hostname)) {
    bridgeClient = createLocalGitContentsClient({ capability: localCapability });
    localRepository = await bridgeClient.verify();
    credentialStore = createLocalBridgeCredentialStore({ repository: localRepository, metadataStorage: window.localStorage });
    localMode = true;
    document.body.dataset.transport = "local-git";
    [...elements.form.children].forEach((child) => { if (child !== elements.message) child.hidden = true; });
    elements.form.classList.add("local-connection");
    document.querySelector(".connection-panel h2").textContent = "Host Git credential bridge";
    document.querySelector(".connection-panel .eyebrow").textContent = "Local Codex transport";
    elements.message.textContent = `${localRepository.owner}/${localRepository.repo} is connected through this computer's Git credential manager.`;
  } else {
    bridgeClient = createGitHubContentsClient();
    credentialStore = createGitHubCredentialStore({
      configStorage: window.localStorage,
      sessionCredentialStorage: window.sessionStorage,
      persistentCredentialStorage: window.localStorage,
    });
  }
  sync = createGitHubSyncController({
    role: "agent",
    client: bridgeClient,
    credentialStore,
    serializeState: () => store.exportSyncState(),
    applyState: (raw) => store.importSyncState(raw),
    subscribeToState: (listener) => store.subscribe(listener),
  });
  store.subscribe(renderStore);
  sync.subscribe(renderSync);
  renderStore(store.snapshot());
  renderSync(sync.snapshot());

  const saved = credentialStore.load({ role: "agent" });
  if (saved && !localMode) {
    elements.form.elements.owner.value = saved.owner;
    elements.form.elements.repo.value = saved.repo;
    elements.form.elements.branch.value = saved.branch;
    elements.form.elements.remember.checked = saved.rememberToken;
  }

  const siteTools = await registerWebMcpTools(store, document.modelContext, manifest, lessonDepot, null, educatorManifest, authoringGuideMarkdown);
  const bridgeTools = await registerBridgeWebMcpTools(sync, document.modelContext);
  const toolNames = [...TOOL_NAMES, ...BRIDGE_TOOL_NAMES];
  elements.toolCount.textContent = String(toolNames.length);
  const failedToolNames = new Set([...siteTools.failures, ...bridgeTools.failures].map((failure) => failure.name));
  elements.toolList.innerHTML = toolNames.map((name) => `<code class="${failedToolNames.has(name) ? "tool-failed" : ""}">${name}</code>`).join("");
  const registeredCount = siteTools.registered.length + bridgeTools.registered.length;
  elements.toolStatus.textContent = siteTools.available || bridgeTools.available
    ? failedToolNames.size
      ? `${registeredCount} of ${toolNames.length} site tools registered. Failed: ${[...failedToolNames].join(", ")}.`
      : `${registeredCount} of ${toolNames.length} site tools registered in this in-app browser.`
    : "WebMCP is unavailable in this external browser. Open this page inside the ChatGPT or Codex in-app browser and reuse that tab.";

  if (!localMode) elements.form.addEventListener("submit", connectFromForm);
  elements.pull.addEventListener("click", async () => {
    try { const result = await sync.pullNow(); toast(result.updated ? "Learner checkpoint applied." : "Learner checkpoint already current."); }
    catch (error) { toast(error instanceof Error ? error.message : String(error)); }
  });
  elements.push.addEventListener("click", async () => {
    try { await sync.pushNow(); toast("Agent checkpoint published."); }
    catch (error) { toast(error instanceof Error ? error.message : String(error)); }
  });
  if (!localMode) elements.disconnect.addEventListener("click", () => { sync.disconnect(); toast("GitHub Bridge disconnected on this device."); });
  window.addEventListener("pagehide", () => sync.stop());

  if (localMode) {
    try {
      await sync.connect({
        owner: localRepository.owner,
        repo: localRepository.repo,
        branch: localRepository.branch,
        token: "local-git-transport",
        rememberToken: false,
      });
      await sync.pullNow();
      toast("Local Git Bridge connected and learner checkpoint pulled.");
    } catch (error) {
      elements.message.textContent = error instanceof Error ? error.message : String(error);
    }
  } else if (saved?.token) {
    try {
      await sync.resume();
      await sync.pullNow();
    } catch (error) {
      elements.message.textContent = error instanceof Error ? error.message : String(error);
    }
  }
}

boot().catch((error) => {
  elements.liveStatus.dataset.state = "error";
  elements.liveStatus.querySelector("span").textContent = error instanceof Error ? error.message : String(error);
});
