import { APP_VERSION, createQuickMathsStore, MAX_LONG_WORK_CHARS, STATUS_COLORS, STORAGE_KEY } from "./challenge-core.js?v=20260905-state-fixes-v1";
import { registerWebMcpTools, TOOL_NAMES } from "./webmcp-tools.js?v=20260903-federation-v1";
import { createLessonStudio } from "./lesson-creator.js?v=20260903-combined-map-v1";
import {
  buildDepotSubmissionPrompt,
  createLessonDepot,
  DEFAULT_DEPOT_FEDERATION,
  DEPOT_DISCUSSIONS_URL,
  DEPOT_REPOSITORY_URL,
  DEPOT_SUBMISSION_URL,
  filterDepotPackages,
} from "./lesson-depot.js?v=20260903-federation-v1";
import {
  createGitHubContentsClient,
  createGitHubCredentialStore,
  createGitHubSyncController,
  learnerBridgeStartupAction,
  summarizeBridgeWorkspace,
} from "./github-sync.js?v=20260903-device-aware-sync-v1";
import {
  createGitHubCommunityClient,
  createGitHubCommunityCredentialStore,
} from "./github-community.js?v=20260903-federation-v1";
import { fetchTextLimited, githubFileRawUrl, readFileTextLimited } from "./safe-fetch.js?v=20260902-python-v1";
import { cancelActivePythonGraders, gradePythonProgram, visiblePythonTests } from "./python-grader.js?v=20260903-sandbox-v2";
import {
  buildAgentPrompt,
  buildQuickMathsDesktopLink,
  detectBrowserName,
  detectMobileDevice,
  webMcpAvailable,
} from "./agent-prompts.js?v=20260903-final-handoff-v1";

const MAX_CURRICULUM_FILE_BYTES = 10_000_000;
const MAX_LESSON_FILE_BYTES = 2_000_000;
const PLAN_CANVAS_MARGIN_X = 520;
const PLAN_CANVAS_MARGIN_Y = 360;

function assessmentCount(skill) {
  const bankLength = skill?.problems?.length ?? 0;
  const configured = Number(skill?.question_count ?? skill?.questionCount);
  if (!Number.isInteger(configured)) return bankLength;
  return bankLength ? Math.max(1, Math.min(bankLength, configured)) : Math.max(1, configured);
}

const elements = {
  loading: document.querySelector("#loading-screen"),
  welcome: document.querySelector("#welcome-screen"),
  shell: document.querySelector("#app-shell"),
  profiles: document.querySelector("#profile-list"),
  educatorProfiles: document.querySelector("#educator-profile-list"),
  profileError: document.querySelector("#profile-error"),
  educatorError: document.querySelector("#educator-error"),
  welcomeLessonCount: document.querySelector("#welcome-lesson-count"),
  welcomeQuestionCount: document.querySelector("#welcome-question-count"),
  welcomeToolCount: document.querySelector("#welcome-tool-count"),
  welcomeStorageRestore: document.querySelector("#welcome-storage-restore"),
  welcomeAgentBoundary: document.querySelector("#welcome-agent-boundary"),
  view: document.querySelector("#view-root"),
  profileName: document.querySelector("#sidebar-profile-name"),
  profileAvatar: document.querySelector("#profile-avatar"),
  sessionTime: document.querySelector("#session-time"),
  profileTime: document.querySelector("#profile-time"),
  bridgeCard: document.querySelector(".bridge-card"),
  bridgeStatus: document.querySelector("#bridge-status"),
  bridgeDetail: document.querySelector("#bridge-detail"),
  activity: document.querySelector("#activity-list"),
  activityEmpty: document.querySelector("#activity-empty"),
  agentDock: document.querySelector("#agent-dock"),
  agentToggle: document.querySelector("#agent-toggle"),
  backupFile: document.querySelector("#backup-file"),
  lessonSetFile: document.querySelector("#lesson-set-file"),
  creatorFile: document.querySelector("#creator-file"),
  curriculumFile: document.querySelector("#curriculum-file"),
  toast: document.querySelector("#toast"),
  educatorWelcome: document.querySelector("#educator-welcome-root"),
  agentWelcome: document.querySelector("#agent-welcome-root"),
  agentHandoff: document.querySelector("#agent-handoff-root"),
};

let store;
let currentSnapshot;
let toastTimer;
let agentHighlightTimer;
let depotSearchTimer;
let routeHistoryReady = false;
let applyingHistory = false;
let lessonStudio;
let lessonDepot;
let githubCommunity;
let githubSync;
let githubCredentials;
let githubSyncSnapshot = { phase: "disconnected", connected: false, dirty: false, remoteAvailable: false, config: null, error: null, conflict: null };
let bridgeNeedsChoice = false;
let learnerConflictRecovery = null;
let bridgeChoiceDetails = null;
let activeBridgeDecision = null;
let bridgeFormDraft = null;
let welcomeStorageOpen = new URLSearchParams(window.location.search).get("handoff") === "workspace";
let welcomePath = "learner";
let pendingLandingCurriculumId = null;
let legacyGeographyMigrationPromise = null;
const communityUi = { phase: "idle", activePack: null, discussion: null, commentDraft: "", error: "", busy: false, connectionError: "" };
const runningPythonQuestionIds = new Set();

const EDUCATOR_GUIDE_URL = "https://quickmathematics.github.io/QuickMaths/QuickMaths-Educator-Guide.pdf";
const AGENT_HANDOFF_NOTICE_KEY = "quickmaths.agent-handoff-notice.v1";
const MAP_ZOOM_MIN = 0.1;
const MAP_ZOOM_MAX = 1.6;
const MAP_ZOOM_STEP = 0.1;

const THEME_VARIABLES = {
  paper: "--paper", paperDeep: "--paper-deep", paperLight: "--paper-light", ink: "--ink", muted: "--muted",
  line: "--line", primary: "--pine", primaryAlt: "--pine-2", tint: "--mint", highlight: "--lime", accent: "--coral",
};

function agentStarterPrompt() {
  return buildAgentPrompt();
}

function currentAgentPrompt() {
  return agentStarterPrompt();
}

function hasPriorAgentActivity(snapshot = currentSnapshot) {
  return Boolean(snapshot?.activeProfile?.agentActivityAt || snapshot?.activity?.length);
}

function hasWorkspaceStorageToken() {
  return Boolean(githubCredentials?.load({ role: "learner" })?.token);
}

function bridgeDeviceLabel(navigatorObject = globalThis.navigator) {
  const userAgent = String(navigatorObject?.userAgent ?? "");
  const browser = webMcpAvailable(globalThis.document?.modelContext)
    ? "OpenAI in-app browser"
    : detectBrowserName(navigatorObject) === "this browser" ? "Browser" : detectBrowserName(navigatorObject);
  let platform = "";
  if (/Android/i.test(userAgent)) platform = "Android";
  else if (/iPhone/i.test(userAgent)) platform = "iPhone";
  else if (/iPad/i.test(userAgent)) platform = "iPad";
  else if (/Windows/i.test(userAgent)) platform = "Windows";
  else if (/Macintosh|Mac OS X/i.test(userAgent)) platform = "macOS";
  else if (/Linux/i.test(userAgent)) platform = "Linux";
  return platform ? `${browser} on ${platform}` : browser;
}

function activeAgentRole(snapshot = currentSnapshot) {
  return snapshot?.activeProfile?.role === "educator" ? "educator" : "learner";
}

function agentDesktopLink(snapshot = currentSnapshot, { fresh = false, role = activeAgentRole(snapshot) } = {}) {
  return buildQuickMathsDesktopLink({
    role,
    includePrompt: fresh || !hasPriorAgentActivity(snapshot),
    handoff: fresh ? "fresh" : "workspace",
  });
}

function mobileRemoteSetupMarkup({ compact = false } = {}) {
  if (!detectMobileDevice(navigator)) return "";
  return `<aside class="mobile-remote-setup${compact ? " is-compact" : ""}"><strong>First-time agent setup needs a computer.</strong><p>A phone can continue an already-prepared remote task, but it cannot create the first desktop QuickMaths agent session.</p><details><summary>Prepare the computer before you leave</summary><ul><li>Save work, then close only apps or high-load processes you recognize and do not need. Never end Windows, security, driver, or remote-session processes in Task Manager.</li><li>Temporarily set Sleep to Never and disable hibernation for the remote session. Keep a laptop plugged in and ventilated, then restore normal power settings when you return.</li><li>For security, an agent can stage lesson packages only in the desktop QuickMaths session, and a human must approve each install. If you are working from mobile, install and approve the required packs yourself first, then ask the agent to build the curriculum from the installed library.</li></ul></details><a href="./bridge-guide.html" target="_blank" rel="noopener">Open the desktop setup guide ↗</a></aside>`;
}

function applySubjectTheme(subject) {
  if (!subject?.theme) return;
  for (const [key, variable] of Object.entries(THEME_VARIABLES)) document.documentElement.style.setProperty(variable, subject.theme[key]);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", subject.theme.paper);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

let activeAppConfirmation = null;

function requestAppConfirmation({
  title = "Confirm action",
  message = "Are you sure?",
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  destructive = false,
} = {}) {
  activeAppConfirmation?.cancel();
  return new Promise((resolve) => {
    const backdrop = document.createElement("section");
    backdrop.className = "action-confirm-backdrop";
    backdrop.setAttribute("role", "presentation");
    backdrop.innerHTML = `
      <article class="action-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="action-confirm-title" aria-describedby="action-confirm-message">
        <p class="eyebrow">Workspace Storage</p>
        <h2 id="action-confirm-title">${escapeHtml(title)}</h2>
        <p id="action-confirm-message">${escapeHtml(message).replace(/\n/g, "<br>")}</p>
        <div class="action-confirm-actions">
          <button class="button button-outline" type="button" data-confirm-cancel>${escapeHtml(cancelLabel)}</button>
          <button class="button ${destructive ? "button-danger" : "button-primary"}" type="button" data-confirm-accept>${escapeHtml(confirmLabel)}</button>
        </div>
      </article>`;

    const finish = (accepted) => {
      if (!backdrop.isConnected) return;
      document.removeEventListener("keydown", onKeyDown);
      backdrop.remove();
      activeAppConfirmation = null;
      resolve(accepted);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") finish(false);
    };
    const cancel = () => finish(false);
    activeAppConfirmation = { cancel };
    backdrop.querySelector("[data-confirm-cancel]")?.addEventListener("click", cancel);
    backdrop.querySelector("[data-confirm-accept]")?.addEventListener("click", () => finish(true));
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) finish(false);
    });
    document.addEventListener("keydown", onKeyDown);
    document.body.append(backdrop);
    requestAnimationFrame(() => backdrop.querySelector("[data-confirm-cancel]")?.focus({ preventScroll: true }));
  });
}

const BRIDGE_COMPARISON_ROWS = [
  ["Profiles", "profileCount"],
  ["Progress records", "progressRecordCount"],
  ["Saved attempts", "attemptCount"],
  ["Reviews", "reviewCount"],
  ["Curricula", "curriculumCount"],
  ["Lesson packs", "lessonPackCount"],
  ["Profiles with plans", "plannedProfileCount"],
];

function localBridgeStateJson() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch { /* The store's serializer remains available when browser storage is blocked. */ }
  return store.exportSyncState();
}

function bridgeWorkspaceSummary(stateJson) {
  try { return summarizeBridgeWorkspace(stateJson); }
  catch {
    return {
      profileCount: 0, profileNames: [], activeProfileName: null, progressRecordCount: 0,
      attemptCount: 0, reviewCount: 0, curriculumCount: 0, lessonPackCount: 0, plannedProfileCount: 0,
    };
  }
}

function bridgeActorLabel(envelope) {
  if (envelope?.actorKind === "agent") return envelope.actorLabel || "QuickMaths agent";
  return envelope?.actorLabel || envelope?.deviceLabel || "Another QuickMaths device";
}

function buildBridgeChoiceDetails(remoteLearner, kind = "device-conflict") {
  const local = bridgeWorkspaceSummary(localBridgeStateJson());
  const remote = bridgeWorkspaceSummary(remoteLearner?.envelope?.stateJson ?? "{}");
  const localUpdatedAt = githubSync?.snapshot()?.localChangedAt ?? githubCredentials?.loadMetadata?.({ role: "learner" })?.localChangedAt ?? null;
  const remoteUpdatedAt = remoteLearner?.envelope?.updatedAt ?? null;
  return {
    kind,
    remoteLearner,
    local,
    remote,
    localLabel: githubSync?.snapshot()?.deviceLabel || bridgeDeviceLabel(),
    remoteLabel: bridgeActorLabel(remoteLearner?.envelope),
    localUpdatedAt,
    remoteUpdatedAt,
  };
}

function closeBridgeSourceChoice() {
  const current = activeBridgeDecision;
  if (!current) return;
  document.removeEventListener("keydown", current.onKeyDown);
  current.backdrop.remove();
  activeBridgeDecision = null;
}

function openBridgeSourceChoice({ force = false } = {}) {
  if (!bridgeNeedsChoice || !bridgeChoiceDetails) return;
  if (activeBridgeDecision && !force) {
    activeBridgeDecision.backdrop.querySelector("[data-bridge-choice-cancel]")?.focus({ preventScroll: true });
    return;
  }
  if (activeBridgeDecision) closeBridgeSourceChoice();
  activeAppConfirmation?.cancel();
  const details = bridgeChoiceDetails;
  const migration = details.kind === "migration";
  const changedRows = BRIDGE_COMPARISON_ROWS.filter(([, key]) => details.local[key] !== details.remote[key]);
  const rows = (changedRows.length ? changedRows : BRIDGE_COMPARISON_ROWS).map(([label, key]) => `
    <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(details.local[key])}</strong><strong>${escapeHtml(details.remote[key])}</strong></div>`).join("");
  const localProfiles = details.local.profileNames.length ? details.local.profileNames.join(", ") : "No profiles";
  const remoteProfiles = details.remote.profileNames.length ? details.remote.profileNames.join(", ") : "No profiles";
  const backdrop = document.createElement("section");
  backdrop.className = "action-confirm-backdrop bridge-source-backdrop";
  backdrop.setAttribute("role", "presentation");
  backdrop.innerHTML = `
    <article class="action-confirm-dialog bridge-source-dialog" role="dialog" aria-modal="true" aria-labelledby="bridge-source-title" aria-describedby="bridge-source-copy">
      <p class="eyebrow">Workspace Storage · ${migration ? "device migration" : "sync decision"}</p>
      <h2 id="bridge-source-title">Which workspace should continue?</h2>
      <p id="bridge-source-copy">${migration
        ? "This browser and GitHub both contain independent QuickMaths work. Choose the complete copy to keep as the shared workspace."
        : "This device has unsynced work and a substantially older or undated GitHub history from another device. Compare them before choosing."}</p>
      <div class="bridge-source-columns">
        <article><span>This device</span><strong>${escapeHtml(details.localLabel)}</strong><small>${escapeHtml(details.localUpdatedAt ? formatDate(details.localUpdatedAt) : "Time unavailable")}</small><p>${escapeHtml(localProfiles)}</p></article>
        <article><span>GitHub copy · last writer</span><strong>${escapeHtml(details.remoteLabel)}</strong><small>${escapeHtml(details.remoteUpdatedAt ? formatDate(details.remoteUpdatedAt) : "Time unavailable")}</small><p>${escapeHtml(remoteProfiles)}</p></article>
      </div>
      <div class="bridge-diff-table" role="table" aria-label="Workspace comparison">
        <div class="bridge-diff-head" role="row"><span>Workspace data</span><strong>This device</strong><strong>GitHub</strong></div>
        ${rows}
      </div>
      <p class="bridge-choice-note">Nothing is deleted from Git history. Download a JSON backup first if both copies matter.</p>
      <div class="action-confirm-actions bridge-source-actions">
        <button class="button button-outline" type="button" data-bridge-choice-cancel>Not now</button>
        <button class="button button-secondary" type="button" data-bridge-choice-remote>Use GitHub copy</button>
        <button class="button button-primary" type="button" data-bridge-choice-local>Use this device</button>
      </div>
    </article>`;
  const cancel = () => closeBridgeSourceChoice();
  const choose = async (source) => {
    backdrop.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    await resolveBridgeSourceChoice(source);
    if (activeBridgeDecision) backdrop.querySelectorAll("button").forEach((button) => { button.disabled = false; });
  };
  const onKeyDown = (event) => { if (event.key === "Escape") cancel(); };
  activeBridgeDecision = { backdrop, onKeyDown };
  backdrop.querySelector("[data-bridge-choice-cancel]")?.addEventListener("click", cancel);
  backdrop.querySelector("[data-bridge-choice-remote]")?.addEventListener("click", () => void choose("remote"));
  backdrop.querySelector("[data-bridge-choice-local]")?.addEventListener("click", () => void choose("local"));
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) cancel(); });
  document.addEventListener("keydown", onKeyDown);
  document.body.append(backdrop);
  requestAnimationFrame(() => backdrop.querySelector("[data-bridge-choice-cancel]")?.focus({ preventScroll: true }));
}

function setBridgeSourceChoice(remoteLearner, kind) {
  bridgeNeedsChoice = true;
  bridgeChoiceDetails = buildBridgeChoiceDetails(remoteLearner, kind);
  githubSync.stop();
  openBridgeSourceChoice();
}

function agentHandoffMarkup(snapshot, { compact = false } = {}) {
  const agentReady = webMcpAvailable(document.modelContext);
  const previousActivity = hasPriorAgentActivity(snapshot);
  const role = activeAgentRole(snapshot);
  const roleLabel = role === "educator" ? "educator" : "learner";
  if (agentReady) {
    if (previousActivity) {
      return `<section class="agent-handoff-card is-active${compact ? " is-compact" : ""}"><p class="eyebrow">Agent connected before</p><h3>Continue in this tab.</h3><p>This profile already has attributed Agent Activity, so the one-time starter prompt is hidden. Your agent can reuse this open QuickMaths tab and continue from the live workspace.</p></section>`;
    }
    return `<section class="agent-prompt-card${compact ? " is-compact" : ""}"><div class="mini-heading"><span>Suggested start · get_agent_guide · summary</span><button type="button" data-action="copy-current-agent-prompt">Copy</button></div><p>${escapeHtml(agentStarterPrompt())}</p></section>`;
  }
  const browserName = detectBrowserName(navigator);
  if (hasWorkspaceStorageToken()) {
    return `<section class="agent-handoff-card is-ready${compact ? " is-compact" : ""}"><p class="eyebrow">Ready to hand off</p><h3>Open QuickMaths with your agent.</h3><p>Your ${browserName === "this browser" ? "current browser" : escapeHtml(browserName)} workspace has private Workspace Storage configured. Open QuickMaths in the ChatGPT or Codex in-app browser, then restore the workspace there from the same private repository.</p>${mobileRemoteSetupMarkup({ compact })}<a class="button button-primary agent-desktop-link" href="${escapeHtml(agentDesktopLink(snapshot))}">${detectMobileDevice(navigator) ? "Continue an already-prepared task" : "Open in ChatGPT / Codex"}</a>${previousActivity ? `<small>The starter prompt is omitted because this ${roleLabel} profile already has Agent Activity.</small>` : ""}</section>`;
  }
  return `<section class="agent-handoff-card needs-migration${compact ? " is-compact" : ""}"><p class="eyebrow">Move your workspace first</p><h3>Protect your progress before switching browsers.</h3><p>WebMCP needs the ChatGPT or Codex in-app browser, whose browser storage is separate from this one. Download a local backup or set up private GitHub Workspace Storage, then restore it after moving.</p>${mobileRemoteSetupMarkup({ compact })}<div class="agent-handoff-actions"><button class="button button-primary" type="button" data-action="save-backup">Download backup</button><button class="button button-outline" type="button" data-action="open-storage-setup">Set up GitHub storage</button></div></section>`;
}

function renderAgentEntry(snapshot) {
  if (elements.agentHandoff) elements.agentHandoff.innerHTML = agentHandoffMarkup(snapshot);
  if (elements.welcomeAgentBoundary) {
    elements.welcomeAgentBoundary.innerHTML = webMcpAvailable(document.modelContext)
      ? `<strong>Agent-ready here.</strong><span>This in-app browser can expose QuickMaths through WebMCP. The agent starts by reading the manifest.</span>`
      : `<strong>Want an agent in the loop?</strong><span>Use the guided handoff to open QuickMaths in the ChatGPT or Codex in-app browser. Your learning app still works fully here.</span>`;
  }
}

function freshAgentNoticeDismissed() {
  try { return window.localStorage.getItem(AGENT_HANDOFF_NOTICE_KEY) === "dismissed"; }
  catch { return false; }
}

function renderFreshAgentWelcome(snapshot) {
  const fresh = !snapshot.activeProfile && snapshot.profiles.length === 0;
  if (!fresh || webMcpAvailable(document.modelContext) || freshAgentNoticeDismissed()) {
    elements.agentWelcome.innerHTML = "";
    return;
  }
  const role = welcomePath === "educator" ? "educator" : "learner";
  const mobile = detectMobileDevice(navigator);
  elements.agentWelcome.innerHTML = `<section class="agent-welcome-backdrop" role="presentation"><article class="agent-welcome-dialog" role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="agent-welcome-title" aria-describedby="agent-welcome-copy"><div class="agent-welcome-mark" aria-hidden="true">✦</div><p class="eyebrow">Optional agent support</p><h1 id="agent-welcome-title">${mobile ? "Prepare agent support on your computer first." : "Start where QuickMaths can work with your agent."}</h1><p id="agent-welcome-copy">${mobile ? "First-time agent-in-the-loop setup must be completed on a computer. After its QuickMaths task and in-app browser are prepared, your phone can continue that running remote session." : "For an agent in the loop, open QuickMaths in the ChatGPT or Codex in-app browser. The handoff opens the app and preloads one concise instruction to read the unified QuickMaths manifest through WebMCP."}</p>${mobileRemoteSetupMarkup()}<a class="button button-primary agent-desktop-link" href="${escapeHtml(agentDesktopLink(snapshot, { fresh: true, role }))}">${mobile ? "Continue an already-prepared task" : "Open in ChatGPT / Codex"}</a><button class="quiet-button agent-welcome-continue" type="button" data-action="dismiss-agent-welcome">Continue in this browser</button></article></section>`;
  requestAnimationFrame(() => elements.agentWelcome.querySelector(".agent-welcome-dialog")?.focus({ preventScroll: true }));
}

function formatDuration(seconds) {
  const clean = Math.max(0, Math.floor(seconds ?? 0));
  const hours = Math.floor(clean / 3600);
  const minutes = Math.floor((clean % 3600) / 60);
  const secs = clean % 60;
  if (hours) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes) return `${minutes}m ${String(secs).padStart(2, "0")}s`;
  return `${secs}s`;
}

function formatDate(value) {
  if (!value) return "Not yet";
  try { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)); }
  catch { return "Unknown"; }
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { elements.toast.hidden = true; }, 2800);
}

function openAgentStudio({ announce = true, focus = true } = {}) {
  elements.shell.classList.remove("agent-collapsed");
  elements.agentDock.classList.remove("is-closed");
  elements.agentDock.classList.add("is-open", "is-highlighted");
  elements.agentToggle.setAttribute("aria-expanded", "true");
  if (focus) {
    elements.agentDock.focus({ preventScroll: true });
    elements.agentDock.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }
  window.clearTimeout(agentHighlightTimer);
  agentHighlightTimer = window.setTimeout(() => elements.agentDock.classList.remove("is-highlighted"), 1400);
  if (announce) showToast("Agent Studio opened.");
}

function closeAgentStudio({ focusToggle = true } = {}) {
  elements.agentDock.classList.remove("is-open", "is-highlighted");
  elements.agentDock.classList.add("is-closed");
  elements.shell.classList.add("agent-collapsed");
  elements.agentToggle.setAttribute("aria-expanded", "false");
  if (focusToggle) elements.agentToggle.focus();
}

async function copyAgentPrompt() {
  try {
    await navigator.clipboard.writeText(currentAgentPrompt());
    showToast("Starting prompt copied.");
  } catch {
    showToast("Select the prompt to copy it.");
  }
}

function profileCards(profiles, emptyMessage) {
  if (!profiles.length) return `<div class="empty-profiles">${escapeHtml(emptyMessage)}</div>`;
  return profiles.map((profile) => `
    <button class="profile-card" type="button" data-profile-id="${escapeHtml(profile.id)}">
      <span class="avatar">${escapeHtml(profile.displayName.slice(0, 1).toUpperCase())}</span>
      <span><strong>${escapeHtml(profile.displayName)}</strong><small>${profile.role === "educator" ? "Curriculum educator" : `${profile.demo ? "Sample progress · " : ""}${escapeHtml(formatDuration(profile.totalLoggedSeconds))} practiced`}</small></span>
      <b aria-hidden="true">→</b>
    </button>
  `).join("");
}

function setWelcomePath(role) {
  welcomePath = role === "educator" ? "educator" : "learner";
  const educator = welcomePath === "educator";
  document.querySelector("#student-path-body").hidden = educator;
  document.querySelector("#educator-path-body").hidden = !educator;
  document.querySelector("#welcome-student-path").classList.toggle("is-active", !educator);
  document.querySelector("#welcome-educator-path").classList.toggle("is-active", educator);
  document.querySelector("#welcome-student-path").setAttribute("aria-selected", String(!educator));
  document.querySelector("#welcome-educator-path").setAttribute("aria-selected", String(educator));
  document.querySelector("#profiles-title").textContent = educator ? "Choose an educator" : "Choose a learner";
}

function renderProfiles(snapshot) {
  elements.profiles.innerHTML = profileCards(snapshot.profiles.filter((profile) => profile.role !== "educator"), "No learner profiles yet. Create one below or explore the sample learner.");
  elements.educatorProfiles.innerHTML = profileCards(snapshot.profiles.filter((profile) => profile.role === "educator"), "No educator profiles yet. Create one to open Curriculum designer.");
  setWelcomePath(welcomePath);
}

function renderWelcomeSummary(snapshot) {
  const lessonCount = snapshot.curriculum.allSkills.length;
  const subjectCount = snapshot.subjects.length;
  const questionCount = Object.values(store.skillsById).reduce((total, skill) => total + (skill.problems?.length ?? 0), 0);
  elements.welcomeLessonCount.textContent = String(lessonCount);
  elements.welcomeQuestionCount.textContent = String(questionCount);
  elements.welcomeToolCount.textContent = String(TOOL_NAMES.length);
}

function statusChip(status) {
  return `<span class="status-chip" style="--status-color:${STATUS_COLORS[status] ?? STATUS_COLORS.locked}">${escapeHtml(status)}</span>`;
}

const TUTORIAL_STEPS = [
  {
    eyebrow: "Your learning workspace",
    title: "Welcome to QuickMaths.",
    lede: "QuickMaths is a mastery map, lesson library, testing room, tutor workspace, and portable learning record. Work starts locally, with two deliberate ways to carry it to another device.",
    points: ["Your profile keeps progress separate from other learners and autosaves in this browser.", "A full JSON backup can move the complete workspace without an account.", "Optional private GitHub Workspace Storage keeps the complete browser workspace recoverable across devices."],
    tip: "Browser storage is local to each browser profile. Before changing devices or moving into the agent-capable in-app browser, download a backup or configure private Workspace Storage. Replay this tour anytime from Settings.",
    visual: "welcome",
  },
  {
    eyebrow: "Subjects and learning paths",
    title: "See every subject—and choose how strict the path should be.",
    lede: "The mastery map keeps every installed subject together in one connected view. Custom lesson sets can extend Mathematics or add entirely new subjects with their own colors.",
    points: ["Subject colors keep each curriculum recognizable on the combined map.", "Opening a lesson applies that subject’s theme until you study another subject.", "Hard path enforces prerequisites; Open path keeps the same connections as guidance."],
    tip: "The learning-path choice and last studied subject theme belong to this profile and travel inside backups.",
    visual: "subjects",
  },
  {
    eyebrow: "The mastery map",
    title: "Read the map before picking your next lesson.",
    lede: "Every node is a lesson. Connections show prerequisite knowledge, including bridges between any installed subjects.",
    points: ["Every installed subject appears in a labeled lane, with bridge lines connecting related knowledge.", "Drag in either direction; use the mouse wheel on desktop or pinch on mobile to zoom.", "Turn on Plan mode to arrange nodes anywhere on a free canvas, hide distractions, draw colored study paths, and place draggable free or lesson-connected comment nodes without changing the canonical map."],
    tip: "Colored subject bands are guides, not fences. Use Ctrl or a selection rectangle on desktop; touch and hold lessons on mobile. Hide selected nodes for a quieter plan, then use Show hidden nodes to restore them. Your plan autosaves with this profile and travels in full backups.",
    visual: "map",
  },
  {
    eyebrow: "The learning loop",
    title: "Learn, test, reflect, then review.",
    lede: "QuickMaths does more than mark a final answer. It collects shown work, checks algebraic steps, routes proofs and rubric responses through review, and uses reflection when updating mastery.",
    points: ["Lessons provide theory, applications, and worked examples.", "Tests preserve unfinished answers and can require calculations, explanations, structured work, or proof.", "Results show solutions; reflection records confidence, guessing, difficulty, and review needs."],
    tip: "Proof and rubric questions stay in Learning until their required review passes—correct syntax alone is not treated as understanding.",
    visual: "loop",
  },
  {
    eyebrow: "Lesson Depot",
    title: "Find lessons—and join the conversation.",
    lede: "Browse published lesson packs and clearly labelled roadmap concepts. Every card follows its subject’s color scheme, and published packages can carry live GitHub-backed upvotes and discussion.",
    points: ["Preview, hash-check, and validate a published pack before installing it.", "Connect GitHub Community to upvote and comment without leaving the app.", "Open Lesson Studio from the Depot to build new lessons or improve a native one."],
    tip: "Community authorization is separate from Workspace Storage. Installing content and posting publicly always remain human-controlled actions.",
    visual: "depot",
  },
  {
    eyebrow: "Agent-assisted learning",
    title: "Bring a tutor into the same live workspace.",
    lede: "Agent support starts on a computer in the ChatGPT or Codex in-app browser, where QuickMaths can expose WebMCP. A phone can continue that prepared remote task after the first desktop setup.",
    points: ["Before moving, download a full backup or configure private Workspace Storage so no local work is stranded.", "Before leaving the computer on, close only recognized unnecessary apps, keep remote-session and system processes running, and temporarily disable Sleep and hibernation.", "Lesson packages stay human-controlled: the agent stages them in the desktop session; mobile users can approve or install the required packs first, then ask the agent to compose a curriculum from them."],
    tip: "Every agent starts with get_agent_guide and section \"summary\". Keep the computer powered, plugged in, ventilated, and reachable; restore normal power settings when you return.",
    visual: "agent",
  },
  {
    eyebrow: "Settings, sync, and creation",
    title: "Keep it portable. Extend it when you are ready.",
    lede: "Settings brings together learning-path controls, JSON save and load, the optional GitHub Bridge, and this replayable tour. Lesson Studio creates lesson packs and safely improves built-in lessons without requiring raw JSON; educator profiles compose those packs into curricula.",
    points: ["Download full backups containing profiles, progress, subjects, lessons, improvements, reviews, and timers.", "Optionally sync learner and remote-agent checkpoints through your own GitHub repository.", "Create new lessons—or edit a native lesson while keeping its ID, map position, and completed learner progress."],
    tip: "Agents may validate and stage content, but only you can install it. Native improvements are reversible from Settings without erasing progress.",
    visual: "ownership",
  },
];

function tutorialVisual(type, snapshot) {
  if (type === "welcome") return `<div class="tour-profile-preview"><img src="./quickmaths-logo.png" alt="" width="88" height="82"><div><span>Profile ready</span><strong>${escapeHtml(snapshot.activeProfile.displayName)}</strong><small>Autosaving in this browser</small></div><i>✓</i></div><div class="tour-local-row"><span>Browser autosave</span><span>JSON backup</span><span>Private GitHub storage</span></div>`;
  if (type === "subjects") {
    const assigned = Boolean(snapshot.activeCurriculum);
    return `<div class="tour-subject-preview"><p>One connected curriculum</p><div><span>∞</span><strong>All installed subjects</strong><b>${snapshot.subjects.length}</b></div><small>Subject lanes stay visible together. The app theme remembers the subject of the last lesson you opened.</small></div><div class="tour-mode-preview" aria-label="${assigned ? "Educator-set learning path" : "Choose a learning path"}"><button type="button" data-progression-mode="hard" class="${snapshot.progressionMode === "hard" ? "is-active" : ""}" aria-pressed="${snapshot.progressionMode === "hard"}" ${assigned ? "disabled" : ""}><span>Hard path</span><strong>Prerequisites enforced</strong><small>Connected tests unlock in order.</small><i>${assigned ? "Set by educator" : snapshot.progressionMode === "hard" ? "Selected" : "Choose hard"}</i></button><button type="button" data-progression-mode="soft" class="${snapshot.progressionMode === "soft" ? "is-active" : ""}" aria-pressed="${snapshot.progressionMode === "soft"}" ${assigned ? "disabled" : ""}><span>Open path</span><strong>Explore freely</strong><small>Connections become recommendations.</small><i>${assigned ? "Set by educator" : snapshot.progressionMode === "soft" ? "Selected" : "Choose open"}</i></button></div>${assigned ? `<p class="tour-assignment-note">This curriculum’s educator chose ${snapshot.progressionMode === "soft" ? "Open" : "Hard"} path. The controls demonstrate both modes but cannot override the assignment.</p>` : ""}`;
  }
  if (type === "map") return `<div class="tour-map-preview"><div class="tour-map-controls"><strong>All subjects</strong><span>Connected by default</span><b>✦ Plan mode</b><i>− &nbsp; 100% &nbsp; +</i></div><svg viewBox="0 0 560 250" role="img" aria-label="Example connected mastery map"><path d="M110 125 C170 125 165 65 235 65 M110 125 C170 125 165 185 235 185 M335 65 C395 65 390 125 455 125 M335 185 C395 185 390 125 455 125"></path><g transform="translate(20 90)"><rect width="90" height="70" rx="13"></rect><text x="45" y="34">Ready</text><text x="45" y="50">0 / 100</text></g><g transform="translate(235 30)" class="learning"><rect width="100" height="70" rx="13"></rect><text x="50" y="34">Learning</text><text x="50" y="50">46 / 100</text></g><g transform="translate(235 150)" class="proven"><rect width="100" height="70" rx="13"></rect><text x="50" y="34">Proven</text><text x="50" y="50">74 / 100</text></g><g transform="translate(455 90)" class="locked"><rect width="85" height="70" rx="13"></rect><text x="42" y="34">Locked</text><text x="42" y="50">0 / 100</text></g></svg></div><div class="tour-statuses">${["ready", "learning", "proven", "mastered", "rusty", "locked"].map(statusChip).join("")}</div>`;
  if (type === "loop") return `<div class="tour-loop-preview"><article><span>01</span><b>Read</b><small>Theory and examples</small></article><i>→</i><article><span>02</span><b>Test</b><small>Answers and shown work</small></article><i>→</i><article><span>03</span><b>Reflect</b><small>Confidence and difficulty</small></article><i>→</i><article><span>04</span><b>Review</b><small>Mastery and next date</small></article></div><div class="tour-work-preview"><code>2x + 5 = 13<br>2x = 8<br>x = 4</code><span>Step check passed</span></div>`;
  if (type === "depot") return `<div class="tour-depot-preview"><header><div><small>Community curriculum</small><strong>Lesson Depot</strong></div><span>Browse · discuss · install</span></header><div><article class="is-geography"><span>Geography</span><strong>Field Cartography</strong><small>3 lessons · Published</small><footer><b>👍 18</b><b>◯ 6</b></footer></article><article class="is-biology"><span>Biology</span><strong>Cell Systems</strong><small>Concept preview</small><footer><b>Roadmap</b></footer></article></div><p><b>✓</b> Packages are hash-checked and validated before installation.</p></div>`;
  if (type === "agent") return `<div class="tour-agent-preview"><div class="tour-agent-head"><span>✦</span><div><small>Agent handoff</small><strong>Tutor in the loop</strong></div><i>${webMcpAvailable(document.modelContext) ? "Agent-ready" : "Move safely"}</i></div>${agentHandoffMarkup(snapshot, { compact: true })}<div class="tour-tool-row"><code>get_agent_guide</code><code>get_progress_summary</code><code>record_tutor_feedback</code></div></div>`;
  return `<div class="tour-ownership-preview"><article><span>↧</span><div><strong>Full progress backup</strong><small>Profiles, subjects, lessons, attempts, reviews, themes, and timers</small></div><b>JSON</b></article><article><span>↔</span><div><strong>Optional GitHub Bridge</strong><small>Checkpoint learner state and exchange agent updates across sessions</small></div><b>Sync</b></article><article><span>✎</span><div><strong>Lesson Studio</strong><small>Create lesson packs or install reversible improvements over native lessons</small></div><b>Create / improve</b></article></div>`;
}

function renderTutorial(snapshot) {
  const stepIndex = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, Number(snapshot.ui.tutorialStep ?? 0)));
  const step = TUTORIAL_STEPS[stepIndex];
  const last = stepIndex === TUTORIAL_STEPS.length - 1;
  elements.view.innerHTML = `
    <section class="app-tour" aria-labelledby="tutorial-title">
      <header class="tour-topbar"><a class="tour-brand" href="#/tutorial"><img src="./quickmaths-logo.png" alt="" width="48" height="45"><span>QuickMaths tour</span></a><div><span>${stepIndex + 1} of ${TUTORIAL_STEPS.length}</span><button class="quiet-button" type="button" data-tutorial-action="skip">Skip tutorial</button></div></header>
      <div class="tour-progress" aria-hidden="true"><i style="width:${((stepIndex + 1) / TUTORIAL_STEPS.length) * 100}%"></i></div>
      <div class="tour-layout">
        <nav class="tour-steps" aria-label="Tutorial chapters">${TUTORIAL_STEPS.map((item, index) => `<button type="button" data-tutorial-step="${index}" class="${index === stepIndex ? "is-active" : ""} ${index < stepIndex ? "is-complete" : ""}" aria-current="${index === stepIndex ? "step" : "false"}"><span>${index < stepIndex ? "✓" : String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHtml(item.eyebrow)}</strong><small>${escapeHtml(item.title)}</small></div></button>`).join("")}</nav>
        <article class="tour-stage">
          <div class="tour-copy"><p class="eyebrow">${escapeHtml(step.eyebrow)}</p><h1 id="tutorial-title">${escapeHtml(step.title)}</h1><p class="tour-lede">${escapeHtml(step.lede)}</p><ul>${step.points.map((point) => `<li><span>✓</span>${escapeHtml(point)}</li>`).join("")}</ul><aside><span>Good to know</span><p>${escapeHtml(step.tip)}</p></aside></div>
          <div class="tour-visual">${tutorialVisual(step.visual, snapshot)}</div>
          <footer class="tour-actions">${stepIndex ? `<button class="button button-outline" type="button" data-tutorial-action="back">← Back</button>` : `<span></span>`}<div>${!last ? `<button class="quiet-button" type="button" data-tutorial-action="skip">Skip for now</button><button class="button button-primary" type="button" data-tutorial-action="next">Next chapter →</button>` : `<button class="button button-outline" type="button" data-tutorial-action="finish-creator">Finish in Lesson Studio</button><button class="button button-primary" type="button" data-tutorial-action="finish">Finish tour · Open dashboard</button>`}</div></footer>
        </article>
      </div>
    </section>`;
}

function renderDashboard(snapshot) {
  const counts = snapshot.progressCounts;
  const attempts = snapshot.attempts.slice(0, 5);
  const suggested = snapshot.suggested;
  const curriculumComplete = Boolean(snapshot.activeCurriculum && snapshot.allProgressRows.length && snapshot.allProgressRows.every((row) => ["proven", "mastered"].includes(row.status)));
  const completionEmail = curriculumComplete && snapshot.activeCurriculum.settings.contactEmail
    ? `mailto:${encodeURIComponent(snapshot.activeCurriculum.settings.contactEmail)}?subject=${encodeURIComponent(`QuickMaths curriculum complete · ${snapshot.activeCurriculum.name}`)}&body=${encodeURIComponent(`Student: ${snapshot.activeCurriculum.settings.studentName || snapshot.activeProfile.displayName}\nCurriculum: ${snapshot.activeCurriculum.name}\nCompleted lessons: ${snapshot.allProgressRows.length}\n\nAttach a QuickMaths JSON backup or CSV export if the educator needs the complete record.`)}`
    : null;
  elements.view.innerHTML = `
    <header class="page-head">
      <div>
        <p class="eyebrow">${escapeHtml(snapshot.activeSubject.icon)} ${escapeHtml(snapshot.activeSubject.name)} dashboard · ${snapshot.progressionMode === "soft" ? "Open path" : "Hard path"}</p>
        <h1>Welcome back, ${escapeHtml(snapshot.activeProfile.displayName)}.</h1>
        <p>Your ${escapeHtml(snapshot.activeSubject.shortName)} map updates from saved attempts, confidence, reasoning review, and time—not just one score.</p>
      </div>
      <div class="page-actions">
        <a class="button button-outline" href="./QuickMaths-Student-Guide.pdf" target="_blank" rel="noopener">Student guide ↗</a>
        <button class="button button-outline" type="button" data-action="save-backup">Save backup</button>
        <button class="button button-primary" type="button" data-route="map">Open mastery map</button>
      </div>
    </header>

    ${snapshot.storageError ? `<div class="content-card" role="alert"><strong>Browser autosave is unavailable.</strong> Download a backup before leaving this page.</div>` : ""}
    ${curriculumComplete ? `<aside class="backup-recommendation curriculum-complete"><span aria-hidden="true">✓</span><div><strong>Curriculum complete</strong><p>Every lesson in ${escapeHtml(snapshot.activeCurriculum.name)} is complete.</p></div>${completionEmail ? `<a class="button button-primary" href="${escapeHtml(completionEmail)}">Email educator</a>` : `<button class="button button-primary" data-action="save-backup">Download completion record</button>`}</aside>` : ""}

    <section class="metric-grid" aria-label="Mastery status summary">
      <article class="metric-card" style="--metric-color:${STATUS_COLORS.ready}"><span>Ready</span><strong>${counts.ready}</strong><small>Prerequisites complete</small></article>
      <article class="metric-card" style="--metric-color:${STATUS_COLORS.learning}"><span>Learning</span><strong>${counts.learning}</strong><small>Started, not yet proven</small></article>
      <article class="metric-card" style="--metric-color:${STATUS_COLORS.proven}"><span>Proven</span><strong>${counts.proven}</strong><small>Passed the mastery gate</small></article>
      <article class="metric-card" style="--metric-color:${STATUS_COLORS.mastered}"><span>Mastered / rusty</span><strong>${counts.mastered} / ${counts.rusty}</strong><small>Strong or due for review</small></article>
    </section>

    <section class="dashboard-grid">
      ${suggested ? `
        <article class="suggested-card">
          <p class="eyebrow">Suggested next step</p>
          <h2>${escapeHtml(suggested.name)}</h2>
          <p>${escapeHtml(suggested.description)}</p>
          <div class="suggested-meta">${statusChip(suggested.status)}<span>${Math.round(suggested.masteryScore)} / 100 mastery · ${suggested.attemptCount} attempt${suggested.attemptCount === 1 ? "" : "s"}</span></div>
          <div class="suggested-actions">
            <button class="button button-primary" type="button" data-action="start-suggested" data-skill-id="${escapeHtml(suggested.id)}">${suggested.attemptCount ? "Continue practice" : "Take first test"}</button>
            <button class="button button-outline" type="button" data-route="lesson" data-skill-id="${escapeHtml(suggested.id)}">Open lesson</button>
          </div>
        </article>
      ` : `
        <article class="suggested-card"><p class="eyebrow">Suggested next step</p><h2>Your map is clear.</h2><p>Review a mastered skill or explore the curriculum.</p><div class="suggested-actions"><button class="button button-primary" data-route="map">Open map</button></div></article>
      `}

      <article class="content-card">
        <div class="card-heading"><div><h2>Recent attempts</h2><p>The latest work saved to this profile.</p></div><button class="quiet-button" type="button" data-route="results">View results</button></div>
        <div class="attempt-list">
          ${attempts.length ? attempts.map((attempt) => `
            <button class="attempt-row quiet-button" type="button" data-action="open-attempt" data-attempt-id="${escapeHtml(attempt.attemptId)}">
              <span><strong>${escapeHtml(attempt.skillName)}</strong><small>${escapeHtml(formatDate(attempt.completedAt))} · ${escapeHtml(attempt.masteryUpdate?.status ?? "saved")}</small></span>
              <span class="attempt-score">${Math.round((attempt.percentScore ?? 0) * 100)}%</span>
            </button>
          `).join("") : '<div class="empty-state">No attempts yet. The suggested test is a good place to start.</div>'}
        </div>
      </article>
    </section>
  `;
}

function rowForSkill(snapshot, skillId) {
  return snapshot.progressRows.find((row) => row.id === skillId);
}

function skillOptions(snapshot, selectedId) {
  return snapshot.curriculum.skills.map((skill) => `<option value="${escapeHtml(skill.id)}" ${skill.id === selectedId ? "selected" : ""}>${escapeHtml(skill.name)} · ${escapeHtml(skill.subdomain)} · ${assessmentCount(skill)} scenarios</option>`).join("");
}

function mapSkillOptions(snapshot, rows, selectedId) {
  return rows.map((row) => {
    const subject = snapshot.subjects.find((item) => item.id === row.subjectId);
    const subjectLabel = `${subject?.icon ?? "◇"} ${subject?.shortName ?? subject?.name ?? row.subjectId} · `;
    return `<option value="${escapeHtml(row.id)}" ${row.id === selectedId ? "selected" : ""}>${escapeHtml(subjectLabel)}${escapeHtml(row.name)} · ${escapeHtml(row.subdomain)}</option>`;
  }).join("");
}

function mapLayout(skills, { subjects = [], combined = false } = {}) {
  const byId = Object.fromEntries(skills.map((skill) => [skill.id, skill]));
  const cache = {};
  const depthOf = (id, trail = new Set()) => {
    if (cache[id] != null) return cache[id];
    if (trail.has(id)) return 0;
    const skill = byId[id];
    if (!skill?.prerequisites.length) return (cache[id] = 0);
    const nextTrail = new Set(trail).add(id);
    return (cache[id] = Math.max(...skill.prerequisites.map((prerequisite) => depthOf(prerequisite, nextTrail))) + 1);
  };
  const depthById = Object.fromEntries(skills.map((skill) => [skill.id, depthOf(skill.id)]));
  const maxDepth = Math.max(...Object.values(depthById), 0);
  if (combined) {
    const positions = {};
    const lanes = [];
    let laneTop = 24;
    subjects.filter((subject) => skills.some((skill) => skill.subjectId === subject.id)).forEach((subject) => {
      const subjectSkills = skills.filter((skill) => skill.subjectId === subject.id);
      const groups = {};
      subjectSkills.forEach((skill) => { (groups[depthById[skill.id]] ??= []).push(skill); });
      const widest = Math.max(...Object.values(groups).map((group) => group.length), 1);
      const laneHeight = Math.max(220, widest * 112 + 92);
      Object.entries(groups).forEach(([depth, group]) => {
        const columnHeight = group.length * 112;
        const offset = laneTop + 68 + Math.max(0, (laneHeight - 92 - columnHeight) / 2);
        group.forEach((skill, index) => { positions[skill.id] = { x: 54 + Number(depth) * 224, y: offset + index * 112 }; });
      });
      lanes.push({ subject, y: laneTop, height: laneHeight });
      laneTop += laneHeight + 20;
    });
    return {
      positions,
      lanes,
      width: Math.max(900, 108 + (maxDepth + 1) * 224),
      height: Math.max(620, laneTop + 4),
    };
  }
  const groups = {};
  skills.forEach((skill) => { const depth = depthById[skill.id]; (groups[depth] ??= []).push(skill); });
  const positions = {};
  const widest = Math.max(...Object.values(groups).map((group) => group.length), 1);
  Object.entries(groups).forEach(([depth, group]) => {
    const columnHeight = group.length * 112;
    const offset = Math.max(32, (widest * 112 - columnHeight) / 2 + 32);
    group.forEach((skill, index) => { positions[skill.id] = { x: 42 + Number(depth) * 224, y: offset + index * 112 }; });
  });
  return { positions, lanes: [], width: Math.max(900, 84 + (maxDepth + 1) * 224), height: Math.max(620, widest * 112 + 64) };
}

function splitLabel(value, max = 22) {
  const words = String(value).split(/\s+/);
  const lines = [""];
  for (const word of words) {
    const current = lines.at(-1);
    if (current && `${current} ${word}`.length > max && lines.length < 2) lines.push(word);
    else lines[lines.length - 1] = current ? `${current} ${word}` : word;
  }
  return lines;
}

function clampMapZoom(value) {
  return Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, Math.round(Number(value) * 100) / 100));
}

function applyMapZoom(zoom, anchor = null) {
  const svg = document.querySelector(".mastery-map");
  if (!svg) return null;
  const scroller = svg.closest(".map-scroll");
  const baseWidth = Number(svg.dataset.baseWidth);
  const baseHeight = Number(svg.dataset.baseHeight);
  const normalized = clampMapZoom(zoom);
  const previousWidth = svg.getBoundingClientRect().width || baseWidth * Number(svg.dataset.currentZoom ?? 1);
  const previousHeight = svg.getBoundingClientRect().height || baseHeight * Number(svg.dataset.currentZoom ?? 1);
  let focalPoint = null;
  if (anchor && scroller) {
    const bounds = scroller.getBoundingClientRect();
    const localX = anchor.clientX - bounds.left;
    const localY = anchor.clientY - bounds.top;
    focalPoint = {
      localX,
      localY,
      ratioX: anchor.contentXRatio ?? (scroller.scrollLeft + localX) / Math.max(previousWidth, 1),
      ratioY: anchor.contentYRatio ?? (scroller.scrollTop + localY) / Math.max(previousHeight, 1),
    };
  }
  const nextWidth = baseWidth * normalized;
  const nextHeight = baseHeight * normalized;
  svg.style.width = `${Math.round(nextWidth)}px`;
  svg.style.height = `${Math.round(nextHeight)}px`;
  svg.dataset.currentZoom = String(normalized);
  if (focalPoint && scroller) {
    scroller.scrollLeft = focalPoint.ratioX * nextWidth - focalPoint.localX;
    scroller.scrollTop = focalPoint.ratioY * nextHeight - focalPoint.localY;
  }
  const output = document.querySelector("#map-zoom-output");
  if (output) output.textContent = `${Math.round(normalized * 100)}%`;
  document.querySelector('[data-action="map-zoom-out"]')?.toggleAttribute("disabled", normalized <= MAP_ZOOM_MIN);
  document.querySelector('[data-action="map-zoom-in"]')?.toggleAttribute("disabled", normalized >= MAP_ZOOM_MAX);
  return normalized;
}

function changeMapZoom(delta) {
  const svg = document.querySelector(".mastery-map");
  const scroller = svg?.closest(".map-scroll");
  const current = Number(svg?.dataset.currentZoom ?? store.snapshot().ui.mapZoom ?? 1);
  const bounds = scroller?.getBoundingClientRect();
  const anchor = bounds ? { clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 } : null;
  applyMapZoom(store.setMapZoom(current + delta), anchor);
}

function mapEdgePath(from, to, kind = "prerequisite") {
  if (kind === "plan") {
    const x1 = from.x + 89;
    const y1 = from.y + 35;
    const x2 = to.x + 89;
    const y2 = to.y + 35;
    const bend = Math.max(48, Math.abs(x2 - x1) * .42);
    const direction = x2 >= x1 ? 1 : -1;
    return `M ${x1} ${y1} C ${x1 + bend * direction} ${y1}, ${x2 - bend * direction} ${y2}, ${x2} ${y2}`;
  }
  const x1 = from.x + 178;
  const y1 = from.y + 35;
  const x2 = to.x;
  const y2 = to.y + 35;
  const bend = Math.max(40, (x2 - x1) * .5);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function mapCommentEdgePath(target, comment) {
  const x1 = target.x + 89;
  const y1 = target.y + 35;
  const x2 = comment.x + 95;
  const y2 = comment.y + 42;
  const bend = Math.max(32, Math.abs(x2 - x1) * .35);
  const direction = x2 >= x1 ? 1 : -1;
  return `M ${x1} ${y1} C ${x1 + bend * direction} ${y1}, ${x2 - bend * direction} ${y2}, ${x2} ${y2}`;
}

function updateMapPlanCommentLinks(svg, positions) {
  const commentPositions = new Map(Array.from(svg.querySelectorAll("[data-plan-comment]")).map((comment) => [
    comment.dataset.planComment,
    { x: Number(comment.dataset.planX), y: Number(comment.dataset.planY) },
  ]));
  svg.querySelectorAll("[data-plan-comment-link][data-map-edge-to]").forEach((edge) => {
    const target = positions[edge.dataset.mapEdgeTo];
    const comment = commentPositions.get(edge.dataset.planCommentLink);
    if (target && comment) edge.setAttribute("d", mapCommentEdgePath(target, comment));
  });
}

function updateMapPlanGeometry(svg, positions) {
  svg.querySelectorAll("[data-map-skill]").forEach((node) => {
    const position = positions[node.dataset.mapSkill];
    if (position) node.setAttribute("transform", `translate(${position.x} ${position.y})`);
  });
  svg.querySelectorAll("[data-map-edge-from][data-map-edge-to]").forEach((edge) => {
    const from = positions[edge.dataset.mapEdgeFrom];
    const to = positions[edge.dataset.mapEdgeTo];
    if (from && to) edge.setAttribute("d", mapEdgePath(from, to, edge.dataset.mapEdgeKind));
  });
  updateMapPlanCommentLinks(svg, positions);
}

function setupMapInteractions({ planMode = false, layoutKey = "", positions = {}, width = 0, height = 0, viewMinX = 0, viewMinY = 0 } = {}) {
  const scroller = document.querySelector(".map-scroll");
  const svg = scroller?.querySelector(".mastery-map");
  if (!scroller || !svg) return;

  const pointers = new Map();
  let gesture = null;
  let suppressClickUntil = 0;
  let wheelDelta = 0;
  let longPressTimer = null;
  let workingSelection = (store.snapshot().ui.mapPlanSelection ?? []).filter((id) => positions[id]);
  const workingPositions = Object.fromEntries(Object.entries(positions).map(([id, position]) => [id, { ...position }]));
  const initialSelectionKey = workingSelection.join("\u0000");

  const pointFrom = (event) => ({ x: event.clientX, y: event.clientY });
  const pair = () => Array.from(pointers.values()).slice(0, 2);
  const midpoint = ([first, second]) => ({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });
  const distance = ([first, second]) => Math.hypot(second.x - first.x, second.y - first.y);
  const currentZoom = () => Number(svg.dataset.currentZoom ?? store.snapshot().ui.mapZoom ?? 1);
  const mapPoint = (point) => {
    const bounds = svg.getBoundingClientRect();
    return {
      x: viewMinX + (point.x - bounds.left) * Number(svg.dataset.baseWidth) / Math.max(bounds.width, 1),
      y: viewMinY + (point.y - bounds.top) * Number(svg.dataset.baseHeight) / Math.max(bounds.height, 1),
    };
  };
  const clearLongPress = () => {
    if (longPressTimer) window.clearTimeout(longPressTimer);
    longPressTimer = null;
  };
  const updateSelectionClasses = () => {
    const selected = new Set(workingSelection);
    svg.querySelectorAll("[data-map-skill]").forEach((node) => node.classList.toggle("is-plan-selected", selected.has(node.dataset.mapSkill)));
  };
  const commitPlanner = (movedPositions = null) => {
    const selectionChanged = workingSelection.join("\u0000") !== initialSelectionKey;
    if (movedPositions && Object.keys(movedPositions).length) {
      store.updateMapPlanLayout({ layoutKey, positions: movedPositions, selectedSkillIds: workingSelection });
    } else if (selectionChanged) store.setMapPlanSelection(workingSelection);
  };

  const beginPan = (pointer, pressedSkillId = null) => {
    gesture = {
      mode: "pan",
      startX: pointer.x,
      startY: pointer.y,
      startScrollLeft: scroller.scrollLeft,
      startScrollTop: scroller.scrollTop,
      pressedSkillId,
      moved: false,
    };
  };

  const beginPinch = () => {
    clearLongPress();
    const points = pair();
    if (points.length < 2) return;
    const center = midpoint(points);
    const bounds = scroller.getBoundingClientRect();
    const svgBounds = svg.getBoundingClientRect();
    const localX = center.x - bounds.left;
    const localY = center.y - bounds.top;
    gesture = {
      mode: "pinch",
      startDistance: Math.max(distance(points), 1),
      startZoom: currentZoom(),
      contentXRatio: (scroller.scrollLeft + localX) / Math.max(svgBounds.width, 1),
      contentYRatio: (scroller.scrollTop + localY) / Math.max(svgBounds.height, 1),
    };
  };

  const finishPointer = (event) => {
    if (!pointers.has(event.pointerId)) return;
    const finishedGesture = gesture;
    clearLongPress();
    pointers.delete(event.pointerId);
    if (finishedGesture?.mode === "pinch") {
      applyMapZoom(store.setMapZoom(currentZoom()));
      suppressClickUntil = Date.now() + 300;
    }
    if (planMode && finishedGesture?.mode === "plan-node") {
      if (finishedGesture.moved) commitPlanner(finishedGesture.movedPositions);
      else {
        if (finishedGesture.pointerType === "mouse") {
          if (finishedGesture.additive) {
            if (finishedGesture.wasSelected) workingSelection = workingSelection.filter((id) => id !== finishedGesture.skillId);
          } else workingSelection = [finishedGesture.skillId];
        }
        updateSelectionClasses();
        commitPlanner();
      }
      suppressClickUntil = Date.now() + 300;
    }
    if (planMode && finishedGesture?.mode === "plan-empty-touch" && finishedGesture.longPressed) {
      updateSelectionClasses();
      commitPlanner();
      suppressClickUntil = Date.now() + 300;
    }
    if (planMode && finishedGesture?.mode === "plan-comment") {
      if (finishedGesture.moved) {
        store.updateMapPlanAnnotationPosition(finishedGesture.annotationId, {
          layoutKey,
          position: finishedGesture.position,
        });
      }
      suppressClickUntil = Date.now() + 300;
    }
    if (planMode && finishedGesture?.mode === "marquee") {
      const rect = finishedGesture.rect;
      const minX = Math.min(rect.x1, rect.x2);
      const maxX = Math.max(rect.x1, rect.x2);
      const minY = Math.min(rect.y1, rect.y2);
      const maxY = Math.max(rect.y1, rect.y2);
      const matches = Object.entries(workingPositions).filter(([, position]) => {
        const centerX = position.x + 89;
        const centerY = position.y + 35;
        return centerX >= minX && centerX <= maxX && centerY >= minY && centerY <= maxY;
      }).map(([id]) => id);
      const dragged = Math.hypot(maxX - minX, maxY - minY) > 6;
      workingSelection = dragged
        ? finishedGesture.additive ? [...new Set([...finishedGesture.baseSelection, ...matches])] : matches
        : finishedGesture.additive ? finishedGesture.baseSelection : [];
      updateSelectionClasses();
      commitPlanner();
      suppressClickUntil = Date.now() + 300;
    }
    if (pointers.size === 1) beginPan(Array.from(pointers.values())[0]);
    else if (!pointers.size) {
      gesture = null;
      scroller.classList.remove("is-panning", "is-pinching", "is-selecting", "is-moving-nodes");
      svg.querySelector(".map-selection-marquee")?.setAttribute("visibility", "hidden");
    }
    if (!planMode && finishedGesture?.mode === "pan" && !finishedGesture.moved && finishedGesture.pressedSkillId) {
      suppressClickUntil = Date.now() + 300;
      store.selectMapSkill(finishedGesture.pressedSkillId);
    }
  };

  scroller.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const pointer = pointFrom(event);
    pointers.set(event.pointerId, { ...pointer, pointerType: event.pointerType });
    try { scroller.setPointerCapture(event.pointerId); } catch { /* Capture is best-effort. */ }
    if (pointers.size > 1) {
      beginPinch();
      scroller.classList.remove("is-panning");
      scroller.classList.add("is-pinching");
      return;
    }
    const comment = event.target.closest?.("[data-plan-comment]");
    const skillId = event.target.closest?.("[data-map-skill]")?.dataset.mapSkill ?? null;
    if (!planMode) {
      beginPan(pointer, skillId);
      return;
    }
    if (comment) {
      const startMapPoint = mapPoint(pointer);
      gesture = {
        mode: "plan-comment",
        annotationId: comment.dataset.planComment,
        startX: pointer.x,
        startY: pointer.y,
        startMapPoint,
        startPosition: { x: Number(comment.dataset.planX), y: Number(comment.dataset.planY) },
        position: { x: Number(comment.dataset.planX), y: Number(comment.dataset.planY) },
        moved: false,
      };
      return;
    }
    if (skillId) {
      const wasSelected = workingSelection.includes(skillId);
      const additive = event.ctrlKey || event.metaKey;
      if (event.pointerType === "mouse") {
        if (!wasSelected) workingSelection = additive ? [...workingSelection, skillId] : [skillId];
        updateSelectionClasses();
      }
      const startMapPoint = mapPoint(pointer);
      gesture = {
        mode: "plan-node", pointerType: event.pointerType, skillId, wasSelected, additive,
        startX: pointer.x, startY: pointer.y, startMapPoint, moved: false, longPressed: false,
        startPositions: Object.fromEntries(workingSelection.map((id) => [id, { ...workingPositions[id] }])),
        movedPositions: {},
      };
      if (event.pointerType !== "mouse") {
        longPressTimer = window.setTimeout(() => {
          if (gesture?.mode !== "plan-node" || gesture.moved) return;
          gesture.longPressed = true;
          if (gesture.wasSelected) workingSelection = workingSelection.filter((id) => id !== skillId);
          else {
            workingSelection = [...workingSelection, skillId];
            gesture.startPositions[skillId] = { ...workingPositions[skillId] };
          }
          updateSelectionClasses();
          if (navigator.vibrate) navigator.vibrate(18);
        }, 480);
      }
      return;
    }
    if (event.pointerType === "mouse") {
      if (event.shiftKey) {
        beginPan(pointer);
        return;
      }
      const start = mapPoint(pointer);
      const marquee = svg.querySelector(".map-selection-marquee");
      marquee?.setAttribute("x", String(start.x));
      marquee?.setAttribute("y", String(start.y));
      marquee?.setAttribute("width", "0");
      marquee?.setAttribute("height", "0");
      marquee?.setAttribute("visibility", "visible");
      gesture = {
        mode: "marquee", additive: event.ctrlKey || event.metaKey,
        baseSelection: (event.ctrlKey || event.metaKey) ? [...workingSelection] : [],
        rect: { x1: start.x, y1: start.y, x2: start.x, y2: start.y },
      };
      scroller.classList.add("is-selecting");
    } else {
      gesture = {
        mode: "plan-empty-touch",
        startX: pointer.x,
        startY: pointer.y,
        longPressed: false,
      };
      longPressTimer = window.setTimeout(() => {
        if (gesture?.mode !== "plan-empty-touch") return;
        gesture.longPressed = true;
        if (workingSelection.length) {
          workingSelection = [];
          updateSelectionClasses();
          if (navigator.vibrate) navigator.vibrate(18);
        }
      }, 480);
    }
  });

  scroller.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { ...pointFrom(event), pointerType: event.pointerType });
    if (pointers.size >= 2) {
      if (gesture?.mode !== "pinch") beginPinch();
      const points = pair();
      const center = midpoint(points);
      const nextZoom = clampMapZoom(gesture.startZoom * distance(points) / gesture.startDistance);
      applyMapZoom(nextZoom, {
        clientX: center.x,
        clientY: center.y,
        contentXRatio: gesture.contentXRatio,
        contentYRatio: gesture.contentYRatio,
      });
      suppressClickUntil = Date.now() + 300;
      event.preventDefault();
      return;
    }
    if (planMode && gesture?.mode === "marquee") {
      const current = mapPoint(pointFrom(event));
      gesture.rect.x2 = current.x;
      gesture.rect.y2 = current.y;
      const marquee = svg.querySelector(".map-selection-marquee");
      marquee?.setAttribute("x", String(Math.min(gesture.rect.x1, current.x)));
      marquee?.setAttribute("y", String(Math.min(gesture.rect.y1, current.y)));
      marquee?.setAttribute("width", String(Math.abs(current.x - gesture.rect.x1)));
      marquee?.setAttribute("height", String(Math.abs(current.y - gesture.rect.y1)));
      event.preventDefault();
      return;
    }
    if (planMode && gesture?.mode === "plan-empty-touch") {
      const pointer = pointFrom(event);
      if (gesture.longPressed) {
        event.preventDefault();
        return;
      }
      if (Math.hypot(pointer.x - gesture.startX, pointer.y - gesture.startY) <= 8) return;
      clearLongPress();
      beginPan({ x: gesture.startX, y: gesture.startY });
    }
    if (planMode && gesture?.mode === "plan-comment") {
      const pointer = pointFrom(event);
      if (!gesture.moved && Math.hypot(pointer.x - gesture.startX, pointer.y - gesture.startY) > 6) {
        gesture.moved = true;
        scroller.classList.add("is-moving-nodes");
      }
      if (gesture.moved) {
        const currentMapPoint = mapPoint(pointer);
        gesture.position = {
          x: Math.max(viewMinX, Math.min(viewMinX + width - 190, gesture.startPosition.x + currentMapPoint.x - gesture.startMapPoint.x)),
          y: Math.max(viewMinY, Math.min(viewMinY + height - 84, gesture.startPosition.y + currentMapPoint.y - gesture.startMapPoint.y)),
        };
        const commentNode = svg.querySelector(`[data-plan-comment="${CSS.escape(gesture.annotationId)}"]`);
        if (commentNode) {
          commentNode.dataset.planX = String(gesture.position.x);
          commentNode.dataset.planY = String(gesture.position.y);
          commentNode.setAttribute("transform", `translate(${gesture.position.x} ${gesture.position.y})`);
          updateMapPlanCommentLinks(svg, workingPositions);
        }
        suppressClickUntil = Date.now() + 300;
        event.preventDefault();
      }
      return;
    }
    if (planMode && gesture?.mode === "plan-node") {
      const pointer = pointFrom(event);
      const screenDistance = Math.hypot(pointer.x - gesture.startX, pointer.y - gesture.startY);
      if (!gesture.moved && screenDistance > 8) {
        if (gesture.pointerType !== "mouse" && !gesture.wasSelected && !gesture.longPressed) {
          clearLongPress();
          beginPan({ x: gesture.startX, y: gesture.startY });
        } else if (gesture.pointerType !== "mouse" && gesture.longPressed && gesture.wasSelected) {
          beginPan({ x: gesture.startX, y: gesture.startY });
        } else {
          clearLongPress();
          gesture.moved = true;
          scroller.classList.add("is-moving-nodes");
        }
      }
      if (gesture?.mode === "plan-node" && gesture.moved) {
        const currentMapPoint = mapPoint(pointer);
        const deltaX = currentMapPoint.x - gesture.startMapPoint.x;
        const deltaY = currentMapPoint.y - gesture.startMapPoint.y;
        gesture.movedPositions = {};
        for (const [id, start] of Object.entries(gesture.startPositions)) {
          const next = {
            x: Math.max(viewMinX, Math.min(viewMinX + width - 178, start.x + deltaX)),
            y: Math.max(viewMinY, Math.min(viewMinY + height - 70, start.y + deltaY)),
          };
          workingPositions[id] = next;
          gesture.movedPositions[id] = next;
        }
        updateMapPlanGeometry(svg, workingPositions);
        suppressClickUntil = Date.now() + 300;
        event.preventDefault();
        return;
      }
    }
    if (gesture?.mode !== "pan") return;
    const pointer = pointFrom(event);
    const deltaX = pointer.x - gesture.startX;
    const deltaY = pointer.y - gesture.startY;
    if (!gesture.moved && Math.hypot(deltaX, deltaY) > 8) {
      gesture.moved = true;
      scroller.classList.add("is-panning");
    }
    if (!gesture.moved) return;
    scroller.scrollLeft = gesture.startScrollLeft - deltaX;
    scroller.scrollTop = gesture.startScrollTop - deltaY;
    suppressClickUntil = Date.now() + 300;
    event.preventDefault();
  });

  scroller.addEventListener("pointerup", finishPointer);
  scroller.addEventListener("pointercancel", finishPointer);
  scroller.addEventListener("lostpointercapture", finishPointer);
  scroller.addEventListener("wheel", (event) => {
    if (!event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    // Keep vertical wheel gestures in zoom mode even when the zoom is clamped.
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    const zoom = currentZoom();
    if ((direction < 0 && zoom <= MAP_ZOOM_MIN) || (direction > 0 && zoom >= MAP_ZOOM_MAX)) {
      wheelDelta = 0;
      return;
    }
    const deltaUnit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientHeight : 1;
    wheelDelta += event.deltaY * deltaUnit;
    if (Math.abs(wheelDelta) < 40) return;
    wheelDelta = 0;
    applyMapZoom(store.setMapZoom(zoom + direction * MAP_ZOOM_STEP), {
      clientX: event.clientX,
      clientY: event.clientY,
    });
  }, { passive: false });
  scroller.addEventListener("click", (event) => {
    if (Date.now() >= suppressClickUntil && !planMode) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
}

function mapPlanTargetLabel(annotation, snapshot) {
  if (!annotation.skillIds.length) return "Free map comment";
  const names = annotation.skillIds.map((id) => store.skillsById[id]?.name ?? id);
  if (names.length <= 2) return names.join(" + ");
  return `${names.slice(0, 2).join(" + ")} + ${names.length - 2} more`;
}

function splitPlanComment(value, limit = 27, maxLines = 3) {
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  for (const word of words) {
    if (!lines.length || `${lines.at(-1)} ${word}`.trim().length > limit) lines.push(word);
    else lines[lines.length - 1] += ` ${word}`;
    if (lines.length > maxLines) {
      lines.length = maxLines;
      lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(1, limit - 1))}…`;
      break;
    }
  }
  return lines;
}

function mapAnnotationInsertPosition(skillIds = []) {
  const scroller = document.querySelector(".map-scroll");
  const svg = scroller?.querySelector(".mastery-map");
  if (!scroller || !svg) return { x: 24, y: 72 };
  const zoom = Number(svg.dataset.currentZoom ?? 1) || 1;
  const minX = Number(svg.dataset.viewMinX ?? 0);
  const minY = Number(svg.dataset.viewMinY ?? 0);
  const maxX = minX + Math.max(0, Number(svg.dataset.baseWidth) - 190);
  const maxY = minY + Math.max(0, Number(svg.dataset.baseHeight) - 84);
  const selectedPositions = skillIds.map((skillId) => {
    const transform = svg.querySelector(`[data-map-skill="${CSS.escape(skillId)}"]`)?.getAttribute("transform") ?? "";
    const match = transform.match(/translate\(([-\d.]+)[ ,]([-\d.]+)\)/);
    return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
  }).filter(Boolean);
  if (selectedPositions.length) {
    const center = {
      x: selectedPositions.reduce((sum, item) => sum + item.x + 89, 0) / selectedPositions.length,
      y: selectedPositions.reduce((sum, item) => sum + item.y + 35, 0) / selectedPositions.length,
    };
    const x = center.x + 130 <= maxX ? center.x + 130 : center.x - 220;
    return { x: Math.max(minX, Math.min(maxX, x)), y: Math.max(minY, Math.min(maxY, center.y - 42)) };
  }
  return {
    x: Math.max(minX, Math.min(maxX, minX + (scroller.scrollLeft + scroller.clientWidth / 2) / zoom - 95)),
    y: Math.max(minY, Math.min(maxY, minY + (scroller.scrollTop + scroller.clientHeight / 2) / zoom - 42)),
  };
}

function renderMapPlanPanel(snapshot, mapRows, layoutKey) {
  const visibleIds = new Set(mapRows.map((row) => row.id));
  const selectedIds = snapshot.ui.mapPlanSelection.filter((id) => visibleIds.has(id));
  const selectedPath = snapshot.mapPlan.paths.find((path) => path.id === snapshot.ui.selectedMapPlanPathId) ?? null;
  const selectedNames = selectedIds.map((id) => store.skillsById[id]?.name ?? id);
  const hiddenIds = new Set(snapshot.mapPlan.hiddenSkillIds ?? []);
  const selectedHiddenIds = selectedIds.filter((id) => hiddenIds.has(id));
  const selectedVisibleIds = selectedIds.filter((id) => !hiddenIds.has(id));
  const hasMovedSelection = selectedIds.some((id) => snapshot.mapPlan.layouts?.[layoutKey]?.[id]);
  const hasMovedLayout = Boolean(Object.keys(snapshot.mapPlan.layouts?.[layoutKey] ?? {}).length);
  const composer = snapshot.ui.mapPlanComposer;
  const selectionCard = `<section class="map-plan-selection" aria-live="polite">
      <header><strong>${selectedIds.length} selected</strong>${selectedPath ? `<span style="--plan-color:${escapeHtml(selectedPath.color)}">${escapeHtml(selectedPath.name)}</span>` : ""}</header>
      <p>${selectedNames.length ? escapeHtml(selectedNames.slice(0, 4).join(" · ")) + (selectedNames.length > 4 ? ` · +${selectedNames.length - 4}` : "") : "Select lessons on the map to move, connect, or annotate them."}</p>
      <div><button class="quiet-button" type="button" data-action="plan-reset-selected" ${hasMovedSelection ? "" : "disabled"}>Reset selected positions</button>${selectedHiddenIds.length ? `<button class="quiet-button" type="button" data-action="plan-unhide-selected">Unhide selected</button>` : `<button class="quiet-button" type="button" data-action="plan-hide-selected" ${selectedVisibleIds.length ? "" : "disabled"}>Hide selected</button>`}<button class="quiet-button" type="button" data-action="plan-clear-selection" ${selectedIds.length ? "" : "disabled"}>Clear selection</button></div>
    </section>`;
  const pathComposer = `<form id="map-plan-path-form" class="map-plan-form map-plan-composer-form">
      <div class="map-plan-section-heading"><strong>Create a path</strong><small>Selection order becomes path order</small></div>
      <label><span>Path name</span><input name="name" maxlength="80" placeholder="Exam route, next week…"></label>
      <label class="map-plan-color"><span>Outline color</span><input name="color" type="color" value="${escapeHtml(selectedPath?.color ?? "#df755b")}"><output>${escapeHtml(selectedPath?.color ?? "#df755b")}</output></label>
      <button class="button button-primary" type="submit" ${selectedIds.length < 2 ? "disabled" : ""}>Create path from ${selectedIds.length} lesson${selectedIds.length === 1 ? "" : "s"}</button>
    </form>`;
  const annotationComposer = `<form id="map-plan-annotation-form" class="map-plan-form map-plan-composer-form">
      <div class="map-plan-section-heading"><strong>${selectedIds.length ? "Connected comment" : "Free comment"}</strong><small>${selectedIds.length ? `${selectedIds.length} selected lesson${selectedIds.length === 1 ? "" : "s"}` : "Place it on this map"}</small></div>
      <p class="map-plan-composer-copy">${selectedIds.length ? "The comment node will be connected to every selected lesson. Drag the comment anywhere after saving it." : "The comment node will appear in the center of the visible map. Drag it wherever it belongs."}</p>
      <label><span>Comment</span><textarea name="body" maxlength="1200" rows="4" placeholder="Why this matters, a deadline, a resource, or the next action…" required></textarea></label>
      <button class="button button-secondary" type="submit">Insert ${selectedIds.length ? "connected " : ""}comment node</button>
    </form>`;
  const management = `<div class="map-plan-help">
      <p class="map-plan-desktop-help"><strong>Desktop</strong> Drag nodes anywhere on the free canvas; subject bands are guides only. Drag empty space to box-select. Ctrl-click or Ctrl-drag adds; Shift-drag empty space pans.</p>
      <p class="map-plan-touch-help"><strong>Phone</strong> Hold a node to select it; hold again to deselect. Hold empty space to clear the selection. Drag selected nodes anywhere on the free canvas; drag empty space to pan.</p>
    </div>
    ${selectionCard}
    <section class="map-plan-paths">
      <div class="map-plan-section-heading"><strong>Saved paths</strong><small>Outlined nodes + bold links</small></div>
      ${snapshot.mapPlan.paths.length ? snapshot.mapPlan.paths.map((path) => `<article class="${path.id === selectedPath?.id ? "is-active" : ""}" style="--plan-color:${escapeHtml(path.color)}">
        <button type="button" data-action="plan-select-path" data-path-id="${escapeHtml(path.id)}"><i></i><span><strong>${escapeHtml(path.name)}</strong><small>${path.skillIds.length} lessons</small></span></button>
        <label title="Change ${escapeHtml(path.name)} color"><input type="color" value="${escapeHtml(path.color)}" data-plan-path-color="${escapeHtml(path.id)}"><span>Color</span></label>
        <button class="map-plan-delete" type="button" data-action="plan-delete-path" data-path-id="${escapeHtml(path.id)}" aria-label="Delete ${escapeHtml(path.name)}">×</button>
      </article>`).join("") : `<p class="map-plan-empty">No paths yet. Select at least two lessons to draw one.</p>`}
    </section>
    <section class="map-plan-notes">
      <div class="map-plan-section-heading"><strong>Annotations</strong><small>${snapshot.mapPlan.annotations.length} saved</small></div>
      ${snapshot.mapPlan.annotations.length ? snapshot.mapPlan.annotations.map((annotation) => `<article><div><strong>${escapeHtml(mapPlanTargetLabel(annotation, snapshot))}</strong><p>${escapeHtml(annotation.body)}</p></div><button type="button" data-action="plan-delete-annotation" data-annotation-id="${escapeHtml(annotation.id)}" aria-label="Delete annotation">×</button></article>`).join("") : `<p class="map-plan-empty">Notes attached to lessons or placed freely on the map will appear here.</p>`}
    </section>`;
  const body = composer === "path" ? `${selectionCard}${pathComposer}` : composer === "annotation" ? `${selectionCard}${annotationComposer}` : management;
  return `<aside class="map-detail map-plan-panel ${composer ? "is-composer-open" : ""}" data-plan-card="${escapeHtml(composer ?? "manage")}">
    <div class="map-plan-heading"><div><p class="eyebrow">Visual learning planner</p><h2>${composer === "path" ? "Custom path" : composer === "annotation" ? "Annotation" : "Plan details"}</h2></div>${composer ? `<button type="button" data-action="plan-close-composer" aria-label="Close Plan mode card">×</button>` : `<span>${snapshot.mapPlan.paths.length} paths · ${snapshot.mapPlan.annotations.length} comments</span>`}</div>
    <p class="map-plan-intro">The map stays in view while you plan. Everything here autosaves with ${snapshot.activeProfile.role === "educator" ? "this curriculum" : "this profile"}.</p>
    ${body}
    <div class="map-plan-footer">${composer === "path" || composer === "annotation" ? `<button class="button button-outline" type="button" data-action="plan-close-composer">Cancel</button>` : `<button class="quiet-button" type="button" data-action="plan-reset-layout" ${hasMovedLayout ? "" : "disabled"}>Reset this layout</button>${snapshot.activeProfile.role === "educator" ? "" : `<button class="button button-outline" type="button" data-action="toggle-plan-mode">Exit Plan mode</button>`}`}</div>
  </aside>`;
}

function renderEducatorDashboard(snapshot) {
  const workspace = snapshot.activeCurriculum;
  const enabled = snapshot.lessonPacks.filter((pack) => pack.enabledForCurriculum && pack.mode !== "override");
  elements.view.innerHTML = `
    <header class="page-head educator-page-head"><div><p class="eyebrow">Educator workspace</p><h1>${escapeHtml(workspace?.name ?? "Curriculum workspace")}</h1><p>Shape the content, map, learning rules, and agent boundaries that travel with this curriculum.</p></div><div class="page-actions"><a class="button button-outline" href="./QuickMaths-Educator-Guide.pdf" target="_blank" rel="noopener">Educator guide ↗</a><button class="button button-outline" data-action="export-curriculum">Export public blueprint</button><button class="button button-primary" data-route="curriculum">Open designer</button></div></header>
    <section class="metric-grid educator-metrics"><article class="metric-card"><span>Curricula</span><strong>${snapshot.curricula.length}</strong><small>Owned by this educator</small></article><article class="metric-card"><span>Visible lessons</span><strong>${snapshot.curriculum.allSkills.length}</strong><small>Native + enabled packs</small></article><article class="metric-card"><span>Enabled packs</span><strong>${enabled.length}</strong><small>Chosen from the Depot library</small></article><article class="metric-card"><span>Agent tutoring</span><strong>${workspace?.settings.agentEnabled ? "On" : "Off"}</strong><small>${workspace?.settings.progressionMode === "soft" ? "Open path" : "Hard path"}</small></article></section>
    <section class="dashboard-grid"><article class="suggested-card educator-next"><p class="eyebrow">Curriculum design loop</p><h2>Compose, arrange, constrain, share.</h2><p>Enable lesson packs, drag the canonical map into shape, create highlighted learning paths, annotate decisions, then export a public blueprint or private learner assignment.</p><div class="suggested-actions"><button class="button button-primary" data-route="curriculum">Continue designing</button><button class="button button-outline" data-route="depot">Browse lesson Depot</button></div></article><article class="content-card"><div class="card-heading"><div><h2>Current learner policy</h2><p>These rules are enforced by the app. Supplemental guidance remains visible to both educator and learner and is labeled untrusted for agents.</p></div></div><dl class="educator-policy-summary"><div><dt>Student</dt><dd>${escapeHtml(workspace?.settings.studentName || "Not named yet")}</dd></div><div><dt>Learning path</dt><dd>${workspace?.settings.progressionMode === "soft" ? "Open" : "Hard"}</dd></div><div><dt>Agent tutoring</dt><dd>${workspace?.settings.agentEnabled ? "On" : "Off"}</dd></div><div><dt>Proof contact</dt><dd>${escapeHtml(workspace?.settings.contactEmail || "Not set")}</dd></div></dl><aside class="assessment-disclaimer"><strong>Learning, not exam supervision</strong><p>QuickMaths is a learning and practice tool. It is not a substitute for supervised, identity-verified, or high-stakes tests.</p></aside></article></section>`;
}

function renderCurriculumWorkspace(snapshot) {
  const workspace = snapshot.activeCurriculum;
  if (!workspace) return `<section class="content-card educator-empty"><p class="eyebrow">Curriculum designer</p><h1>Create your first curriculum.</h1><p>A curriculum keeps its own enabled Depot packs, canonical map, annotations, paths, and learner policy.</p><form id="create-curriculum-form" class="educator-inline-form"><input name="name" maxlength="100" placeholder="Curriculum name" required><button class="button button-primary" type="submit">Create curriculum</button></form></section>`;
  const settings = workspace.settings;
  return `<section class="curriculum-workspace" aria-labelledby="curriculum-workspace-title">
    <header class="curriculum-workspace-head"><div><p class="eyebrow">Open curriculum</p><h1 id="curriculum-workspace-title">${escapeHtml(workspace.name)}</h1><p>${escapeHtml(workspace.description || "A portable, educator-authored learning plan.")}</p></div><div class="curriculum-workspace-actions"><label>Switch curriculum<select id="curriculum-select">${snapshot.curricula.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === workspace.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label><a class="button button-outline" href="./QuickMaths-Educator-Guide.pdf" target="_blank" rel="noopener">Guide ↗</a><button class="button button-outline" data-action="import-curriculum">Import</button><button class="button button-outline" data-action="export-curriculum">Public blueprint</button><button class="button button-outline" data-action="export-private-assignment">Private assignment</button></div></header>
    <div class="curriculum-editor-grid">
      <form id="curriculum-identity-form" class="curriculum-editor-card"><div class="card-heading"><div><h2>Curriculum profile</h2><p>Name and describe this particular course of study.</p></div></div><label>Name<input name="name" maxlength="100" value="${escapeHtml(workspace.name)}" required></label><label>Description<textarea name="description" maxlength="1000" rows="3" placeholder="Purpose, audience, and intended outcome…">${escapeHtml(workspace.description)}</textarea></label><div class="form-actions"><button class="button button-secondary" type="submit">Save profile</button><button class="quiet-button" type="button" data-action="create-curriculum">New curriculum</button></div></form>
      <form id="curriculum-settings-form" class="curriculum-editor-card curriculum-policy-card"><div class="card-heading"><div><h2>Learner & agent-tutoring policy</h2><p>These settings travel with a private assignment. Supplemental text is shown to the learner and treated as untrusted curriculum content by WebMCP.</p></div></div><div class="curriculum-field-grid"><label><span>Student name <button class="studio-help" type="button" data-studio-help aria-expanded="false" aria-label="How the student name affects progress" data-tooltip="When this name matches the recipient's selected learner profile, matching lesson mastery is reused. A different or empty name starts the curriculum in a separate blank assignment profile.">?</button></span><input name="studentName" maxlength="60" value="${escapeHtml(settings.studentName)}" placeholder="Optional learner name"></label><label>Proof / completion email<input name="contactEmail" type="email" maxlength="160" value="${escapeHtml(settings.contactEmail)}" placeholder="educator@example.com"></label><label>Learning path<select name="progressionMode"><option value="hard" ${settings.progressionMode === "hard" ? "selected" : ""}>Hard · enforce prerequisites</option><option value="soft" ${settings.progressionMode === "soft" ? "selected" : ""}>Open · connections are guidance</option></select></label></div><label class="curriculum-agent-toggle"><input name="agentEnabled" type="checkbox" ${settings.agentEnabled ? "checked" : ""}><span><strong>Agent tutoring</strong><small>Allow tutoring and learner-plan changes through WebMCP. Navigation and read-only inspection remain available.</small></span></label><label>Supplemental agent guidance · visible to learner<textarea name="agentInstructions" maxlength="4000" rows="5" placeholder="For example: never solve assessed tasks; ask one targeted question at a time…">${escapeHtml(settings.agentInstructions)}</textarea></label><div class="agent-policy-preview"><strong>Untrusted curriculum guidance</strong><p>Agents receive this only as supplemental context. Platform safety rules and the learner’s explicit request always take precedence.</p></div><aside class="assessment-disclaimer"><strong>QuickMaths is for learning and practice</strong><p>It does not replace supervised, identity-verified, or high-stakes assessment. Use appropriate human supervision when results must establish who completed the work.</p></aside><button class="button button-secondary" type="submit">Save learner policy</button></form>
      <section class="curriculum-editor-card curriculum-pack-manager"><div class="card-heading"><div><h2>Curriculum content</h2><p>Choose whether native Mathematics and each installed Depot pack belong to this curriculum. Completion and recommendations use only this visible set.</p></div><button class="quiet-button" data-route="depot">Browse Depot</button></div><div class="curriculum-pack-list"><label class="curriculum-pack-row is-native"><input type="checkbox" data-curriculum-native ${workspace.includeNativeLessons !== false ? "checked" : ""}><span><strong>Full native Mathematics curriculum</strong><small>53 built-in lessons · when off, QuickMaths keeps only the specific native prerequisites required by enabled packs</small></span></label>${snapshot.lessonPacks.length ? snapshot.lessonPacks.map((pack) => `<label class="curriculum-pack-row ${pack.mode === "override" ? "is-fixed" : ""}"><input type="checkbox" data-curriculum-pack="${escapeHtml(pack.id)}" ${pack.enabledForCurriculum ? "checked" : ""} ${pack.mode === "override" ? "disabled" : ""}><span><strong>${escapeHtml(pack.name)}</strong><small>${escapeHtml(pack.subjectName)} · ${pack.skillCount} lessons${pack.mode === "override" ? " · native improvement applies globally" : ""}</small></span></label>`).join("") : `<div class="empty-state">No additive packs installed yet. Visit the Lesson Depot to add subjects and specialist tracks.</div>`}</div><p class="curriculum-scope-note">Custom paths remain highlighted guidance; they do not silently hide lessons. Content membership is controlled explicitly by the switches above, with prerequisite foundations added automatically.</p></section>
    </div>
  </section>`;
}

function renderMap(snapshot, { designer = false } = {}) {
  const combined = true;
  const viewportKey = "all-subjects";
  const previousScroller = elements.view.querySelector(".map-scroll");
  const previousViewport = previousScroller?.dataset.mapViewportKey === viewportKey
    ? {
      scrollLeft: previousScroller.scrollLeft,
      scrollTop: previousScroller.scrollTop,
      zoom: Number(previousScroller.querySelector(".mastery-map")?.dataset.currentZoom ?? 1) || 1,
      viewMinX: Number(previousScroller.querySelector(".mastery-map")?.dataset.viewMinX ?? 0) || 0,
      viewMinY: Number(previousScroller.querySelector(".mastery-map")?.dataset.viewMinY ?? 0) || 0,
    }
    : null;
  const mapRows = snapshot.allProgressRows;
  const mapSkills = snapshot.curriculum.allSkills;
  let selected = mapRows.find((row) => row.id === snapshot.ui.selectedMapSkillId) ?? mapRows[0];
  if (!selected) {
    elements.view.innerHTML = `<section class="test-empty content-card"><h2>${combined ? "No installed lessons" : `No lessons in ${escapeHtml(snapshot.activeSubject.name)}`}</h2><p>Use Lesson studio or load a custom set to add the first lesson.</p><button class="button button-primary" data-route="creator">Open Lesson studio</button></section>`;
    return;
  }
  const planMode = designer || Boolean(snapshot.ui.mapPlanMode);
  const planView = !designer && !planMode && snapshot.ui.mapPlanView !== false;
  const displayedPlan = planMode || planView
    ? snapshot.mapPlan
    : { layouts: {}, paths: [], annotations: [], hiddenSkillIds: [] };
  const layout = mapLayout(mapSkills, { subjects: snapshot.subjects, combined: true });
  const savedPositions = displayedPlan.layouts?.[viewportKey] ?? {};
  const positions = Object.fromEntries(Object.entries(layout.positions).map(([id, position]) => [
    id,
    savedPositions[id] ? { ...position, ...savedPositions[id] } : { ...position },
  ]));
  const hiddenIds = new Set(displayedPlan.hiddenSkillIds ?? []);
  const showHiddenNodes = planMode && Boolean(snapshot.ui.mapPlanShowHidden);
  const renderedRows = (planMode || planView) && !showHiddenNodes ? mapRows.filter((row) => !hiddenIds.has(row.id)) : mapRows;
  const renderedSkillIds = new Set(renderedRows.map((row) => row.id));
  if (renderedRows.length && !renderedSkillIds.has(selected.id)) selected = renderedRows[0];
  const selectedSkill = store.skillsById[selected.id];
  const selectedSubject = snapshot.subjects.find((subject) => subject.id === selected.subjectId) ?? snapshot.activeSubject;
  const hasPlanContent = Boolean(Object.keys(savedPositions).length || displayedPlan.paths.length || displayedPlan.annotations.length || hiddenIds.size);
  const freeCanvas = planMode || (planView && hasPlanContent);
  const planPositionValues = Object.values(positions);
  const commentPositionValues = displayedPlan.annotations.flatMap((annotation) => {
    const position = annotation.positions?.[viewportKey];
    return position ? [position] : [];
  });
  const viewMinX = freeCanvas ? Math.min(0, ...planPositionValues.map((position) => position.x), ...commentPositionValues.map((position) => position.x)) - PLAN_CANVAS_MARGIN_X : 0;
  const viewMinY = freeCanvas ? Math.min(0, ...planPositionValues.map((position) => position.y), ...commentPositionValues.map((position) => position.y)) - PLAN_CANVAS_MARGIN_Y : 0;
  const viewMaxX = freeCanvas ? Math.max(layout.width, ...planPositionValues.map((position) => position.x + 178), ...commentPositionValues.map((position) => position.x + 190)) + PLAN_CANVAS_MARGIN_X : layout.width;
  const viewMaxY = freeCanvas ? Math.max(layout.height, ...planPositionValues.map((position) => position.y + 70), ...commentPositionValues.map((position) => position.y + 84)) + PLAN_CANVAS_MARGIN_Y : layout.height;
  const width = viewMaxX - viewMinX;
  const height = viewMaxY - viewMinY;
  const { lanes } = layout;
  const zoom = Number(snapshot.ui.mapZoom ?? 1);
  const edges = mapSkills.flatMap((skill) => skill.prerequisites.map((prerequisite) => {
    if (!renderedSkillIds.has(prerequisite) || !renderedSkillIds.has(skill.id)) return "";
    const from = positions[prerequisite];
    const to = positions[skill.id];
    if (!from || !to) return "";
    const crossSubject = store.skillsById[prerequisite]?.subjectId !== skill.subjectId;
    return `<path class="${crossSubject ? "is-cross-subject" : ""}" data-map-edge-from="${escapeHtml(prerequisite)}" data-map-edge-to="${escapeHtml(skill.id)}" data-map-edge-kind="prerequisite" d="${mapEdgePath(from, to)}" />`;
  })).join("");
  const planConnections = (planMode || displayedPlan.paths.length) ? displayedPlan.paths.flatMap((path) => {
    const visibleSkillIds = path.skillIds.filter((id) => positions[id] && renderedSkillIds.has(id));
    return visibleSkillIds.slice(1).map((skillId, index) => {
      const fromId = visibleSkillIds[index];
      return `<path class="map-plan-connection ${path.id === snapshot.ui.selectedMapPlanPathId ? "is-active" : ""}" style="--plan-color:${escapeHtml(path.color)}" data-map-edge-from="${escapeHtml(fromId)}" data-map-edge-to="${escapeHtml(skillId)}" data-map-edge-kind="plan" d="${mapEdgePath(positions[fromId], positions[skillId], "plan")}" />`;
    });
  }).join("") : "";
  const commentLinks = [];
  const planComments = (planMode || displayedPlan.annotations.length) ? displayedPlan.annotations.map((annotation, index) => {
    const allTargetSkillIds = annotation.skillIds.filter((id) => positions[id]);
    const targetSkillIds = allTargetSkillIds.filter((id) => renderedSkillIds.has(id));
    const savedPosition = annotation.positions?.[viewportKey] ?? null;
    if (allTargetSkillIds.length && !targetSkillIds.length) return "";
    if (!savedPosition && !targetSkillIds.length) return "";
    const targets = targetSkillIds.map((id) => positions[id]);
    const anchor = targets.length ? {
      x: targets.reduce((sum, position) => sum + position.x + 89, 0) / targets.length,
      y: targets.reduce((sum, position) => sum + position.y + 35, 0) / targets.length,
    } : { x: viewMinX + width / 2, y: viewMinY + height / 2 };
    const autoX = anchor.x + 130 <= viewMaxX - 190 ? anchor.x + 130 : Math.max(viewMinX, anchor.x - 220);
    const position = savedPosition ? { ...savedPosition } : {
      x: Math.max(viewMinX, Math.min(viewMaxX - 190, autoX)),
      y: Math.max(viewMinY, Math.min(viewMaxY - 84, anchor.y - 42 + (index % 3) * 18)),
    };
    for (const skillId of targetSkillIds) {
      commentLinks.push(`<path class="map-plan-comment-link" data-plan-comment-link="${escapeHtml(annotation.id)}" data-map-edge-to="${escapeHtml(skillId)}" d="${mapCommentEdgePath(positions[skillId], position)}"></path>`);
    }
    const lines = splitPlanComment(annotation.body);
    return `<g class="map-plan-comment" role="note" tabindex="0" data-plan-comment="${escapeHtml(annotation.id)}" data-plan-x="${position.x}" data-plan-y="${position.y}" transform="translate(${position.x} ${position.y})">
      <title>${escapeHtml(annotation.body)}</title>
      <rect width="190" height="84" rx="14"></rect>
      <circle cx="18" cy="18" r="9"></circle><text class="map-plan-comment-icon" x="18" y="21" text-anchor="middle">✎</text>
      <text class="map-plan-comment-copy" x="34" y="18">${lines.map((line, lineIndex) => `<tspan x="34" dy="${lineIndex ? 15 : 0}">${escapeHtml(line)}</tspan>`).join("")}</text>
      <text class="map-plan-comment-meta" x="174" y="72" text-anchor="end">${targetSkillIds.length ? `${targetSkillIds.length} linked` : "free"}</text>
    </g>`;
  }).join("") : "";
  const subjectLanes = lanes.map(({ subject, y, height: laneHeight }) => `<g class="map-subject-lane">
    <rect x="12" y="${y}" width="${layout.width - 24}" height="${laneHeight}" rx="22" fill="${escapeHtml(subject.theme?.tint ?? "#dceca9")}"></rect>
    <line x1="28" y1="${y + 42}" x2="${layout.width - 28}" y2="${y + 42}" stroke="${escapeHtml(subject.theme?.primary ?? "#153f36")}"></line>
    <text x="30" y="${y + 29}" fill="${escapeHtml(subject.theme?.primary ?? "#153f36")}">${escapeHtml(subject.icon)} ${escapeHtml(subject.name)}</text>
  </g>`).join("");
  const nodes = renderedRows.map((row) => {
    const position = positions[row.id];
    const lines = splitLabel(row.name);
    const subject = snapshot.subjects.find((item) => item.id === row.subjectId) ?? snapshot.activeSubject;
    const nodeFill = combined ? subject.theme?.primary ?? STATUS_COLORS[row.status] : STATUS_COLORS[row.status] ?? STATUS_COLORS.locked;
    const nodeAccent = subject.theme?.primaryAlt ?? subject.theme?.primary ?? "#ffffff";
    const memberPaths = (planMode || displayedPlan.paths.length) ? displayedPlan.paths.filter((path) => path.skillIds.includes(row.id)).slice(0, 4) : [];
    const noteCount = (planMode || displayedPlan.annotations.length) ? displayedPlan.annotations.filter((annotation) => annotation.skillIds.includes(row.id)).length : 0;
    return `<g class="map-node ${row.id === selected.id && !planMode ? "is-selected" : ""} ${planMode && snapshot.ui.mapPlanSelection.includes(row.id) ? "is-plan-selected" : ""} ${planMode && hiddenIds.has(row.id) ? "is-plan-hidden" : ""}" role="button" tabindex="0" data-map-skill="${escapeHtml(row.id)}" aria-label="${escapeHtml(row.name)}${planMode && hiddenIds.has(row.id) ? ", hidden in Plan mode" : ""}" transform="translate(${position.x} ${position.y})">
      <title>${escapeHtml(subject?.name ?? row.subjectId)}: ${escapeHtml(row.name)} · ${escapeHtml(row.status)}</title>
      ${memberPaths.map((path, index) => `<rect class="map-node-plan-outline ${path.id === snapshot.ui.selectedMapPlanPathId ? "is-active" : ""}" x="${-4 - index * 3}" y="${-4 - index * 3}" width="${186 + index * 6}" height="${78 + index * 6}" rx="${17 + index * 2}" fill="none" stroke="${escapeHtml(path.color)}"></rect>`).join("")}
      <rect class="map-node-body" width="178" height="70" rx="13" fill="${escapeHtml(nodeFill)}"></rect>
      ${combined ? `<rect class="map-node-subject-accent" x="13" y="8" width="152" height="4" rx="2" fill="${escapeHtml(nodeAccent)}"></rect>` : ""}
      <text x="14" y="24">${lines.map((line, index) => `<tspan x="14" dy="${index ? 15 : 0}">${escapeHtml(line)}</tspan>`).join("")}</text>
      ${combined ? `<circle class="map-node-status-dot" cx="17" cy="56" r="4" fill="${STATUS_COLORS[row.status] ?? STATUS_COLORS.locked}"></circle>` : ""}
      <text class="map-node-meta" x="${combined ? 26 : 14}" y="58">${escapeHtml(row.status)} · ${Math.round(row.masteryScore)}/100</text>
      ${combined ? `<text class="map-node-subject" x="164" y="58" text-anchor="end">${escapeHtml(subject?.icon ?? "◇")}</text>` : ""}
      ${noteCount ? `<g class="map-node-note-badge" transform="translate(166 -5)"><circle r="10"></circle><text text-anchor="middle" y="3">${Math.min(noteCount, 9)}</text></g>` : ""}
      ${planMode && hiddenIds.has(row.id) ? `<g class="map-node-hidden-badge" transform="translate(132 8)"><rect width="38" height="14" rx="7"></rect><text x="19" y="10" text-anchor="middle">Hidden</text></g>` : ""}
    </g>`;
  }).join("");
  const selectedHiddenCount = snapshot.ui.mapPlanSelection.filter((id) => hiddenIds.has(id)).length;
  const selectedVisibleCount = snapshot.ui.mapPlanSelection.filter((id) => !hiddenIds.has(id)).length;
  const hiddenCount = hiddenIds.size;

  elements.view.innerHTML = `${designer ? renderCurriculumWorkspace(snapshot) : ""}
    <header class="page-head">
      <div><p class="eyebrow">All subjects · ${mapRows.length} connected lessons across ${snapshot.subjects.length} curricula</p><h1>${designer ? "Canonical curriculum map" : "Mastery map"}</h1><p>${designer ? "Drag this curriculum’s canonical map into shape. Learners receive these positions, custom paths, and annotations when they load the file." : `${snapshot.progressionMode === "soft" ? "Open path treats the connections as guidance: every lesson and test is available." : "Hard path unlocks tests when prerequisite lessons are proven."} Subject lanes and highlighted bridge lines show how knowledge travels across every installed curriculum.`}</p></div>
      <div class="page-actions map-toolbar">${designer ? "" : `<button type="button" class="map-plan-toggle" data-action="toggle-plan-mode" aria-pressed="${planMode}"><span>✦</span><strong>Plan mode</strong><small>${planMode ? "Editing private plan" : "Arrange · connect · annotate"}</small></button><button type="button" class="map-plan-toggle map-plan-view-toggle" data-action="toggle-plan-view" aria-pressed="${planView}" ${planMode ? "disabled" : ""}><span>◎</span><strong>Plan view</strong><small>${planMode ? "Exit editor to view" : planView ? "Showing saved plan" : "Showing canonical map"}</small></button>`}<label class="compact-select">Jump to skill<select id="map-skill-select">${mapSkillOptions(snapshot, renderedRows.length ? renderedRows : mapRows, selected.id)}</select></label><div class="map-zoom-control" role="group" aria-label="Mastery map zoom"><button type="button" data-action="map-zoom-out" aria-label="Zoom mastery map out" ${zoom <= MAP_ZOOM_MIN ? "disabled" : ""}>−</button><output id="map-zoom-output" aria-live="polite">${Math.round(zoom * 100)}%</output><button type="button" data-action="map-zoom-in" aria-label="Zoom mastery map in" ${zoom >= MAP_ZOOM_MAX ? "disabled" : ""}>+</button></div></div>
    </header>
    <div class="status-legend">${Object.entries(STATUS_COLORS).map(([status, color]) => `<span><i style="background:${color}"></i>${status}</span>`).join("")}${planMode ? `<span class="map-plan-key">Plan mode is autosaving</span>` : planView ? `<span class="map-plan-key">Plan view · read only</span>` : combined ? `<span class="map-subject-key">Node color = subject · dot = status</span>` : ""}</div>
    <section class="map-layout ${planMode ? "is-plan-mode" : ""}">
      <div class="map-canvas-shell">
      ${planMode ? `<div class="map-plan-actionbar" role="toolbar" aria-label="Plan mode actions">
        <div><strong>${snapshot.ui.mapPlanSelection.length} selected · ${hiddenCount} hidden</strong><small>Subject bands are guides · the whole canvas is editable</small></div>
        <button type="button" data-action="plan-open-annotation"><span>✎</span><strong>Annotation</strong><small>${snapshot.ui.mapPlanSelection.length ? "Connect to selection" : "Free comment node"}</small></button>
        <button type="button" data-action="plan-open-path"><span>↝</span><strong>Custom path</strong><small>${snapshot.ui.mapPlanSelection.length > 1 ? `${snapshot.ui.mapPlanSelection.length} lessons selected` : "Select multiple lessons"}</small></button>
        <button type="button" data-action="${selectedHiddenCount ? "plan-unhide-selected" : "plan-hide-selected"}" ${selectedHiddenCount || selectedVisibleCount ? "" : "disabled"}><span>${selectedHiddenCount ? "◉" : "◌"}</span><strong>${selectedHiddenCount ? "Unhide selected" : "Hide selected"}</strong><small>${selectedHiddenCount ? `${selectedHiddenCount} hidden lesson${selectedHiddenCount === 1 ? "" : "s"}` : selectedVisibleCount ? `${selectedVisibleCount} lesson${selectedVisibleCount === 1 ? "" : "s"}` : "Select lesson nodes"}</small></button>
        <button type="button" data-action="plan-toggle-hidden" aria-pressed="${showHiddenNodes}" ${hiddenCount ? "" : "disabled"}><span>◎</span><strong>${showHiddenNodes ? "Hide hidden nodes" : "Show hidden nodes"}</strong><small>${hiddenCount ? `${hiddenCount} available to restore` : "Nothing hidden"}</small></button>
        <button type="button" data-action="plan-open-manage"><span>•••</span><strong>Plan details</strong><small>${snapshot.mapPlan.paths.length} paths · ${snapshot.mapPlan.annotations.length} comments</small></button>
      </div>` : ""}
      <div class="map-scroll ${planMode ? "is-plan-mode" : ""}" data-map-viewport-key="${escapeHtml(viewportKey)}" aria-label="${planMode ? "Plan mode mastery map. Drag lessons to move them. On desktop, drag empty space to select. On touch, hold lessons to select and hold empty space to clear the selection." : planView ? "Read-only saved Plan view. Select lessons for their detail cards, drag to pan, use the mouse wheel on desktop, or pinch on a touchscreen to zoom." : "Interactive canonical prerequisite map. Drag to move. Use the mouse wheel on desktop or pinch on a touchscreen to zoom."}">
        <div class="map-gesture-hint" aria-hidden="true">${planMode ? `<span class="map-hint-desktop">Box-select · Ctrl adds · Drag nodes</span><span class="map-hint-touch">Hold node to select · Hold empty to clear · Pinch to zoom</span>` : `Drag to move <span class="map-hint-desktop">· Wheel to zoom</span><span class="map-hint-touch">· Pinch to zoom</span>`}</div>
        <svg class="mastery-map" viewBox="${viewMinX} ${viewMinY} ${width} ${height}" data-base-width="${width}" data-base-height="${height}" data-view-min-x="${viewMinX}" data-view-min-y="${viewMinY}" data-current-zoom="${zoom}" style="width:${Math.round(width * zoom)}px;height:${Math.round(height * zoom)}px">
          <g class="map-subject-lanes ${planMode || planView ? "is-plan-reference" : ""}">${subjectLanes}</g>
          <g class="map-edges">${edges}</g>
          <g class="map-plan-connections">${planConnections}</g>
          <g class="map-plan-comment-links">${commentLinks.join("")}</g>
          <g>${nodes}</g>
          <g class="map-plan-comments">${planComments}</g>
          <rect class="map-selection-marquee" visibility="hidden" x="0" y="0" width="0" height="0"></rect>
        </svg>
      </div>
      </div>
      ${planMode ? renderMapPlanPanel(snapshot, mapRows, viewportKey) : `<aside class="map-detail">
        <div class="map-detail-top">${statusChip(selected.status)}<code>${escapeHtml(selected.id)}</code></div>
        <p class="eyebrow">${combined ? `${escapeHtml(selectedSubject.icon)} ${escapeHtml(selectedSubject.name)} · ` : ""}${escapeHtml(selected.subdomain)}</p>
        <h2>${escapeHtml(selected.name)}</h2>
        <p>${escapeHtml(selected.description)}</p>
        <div class="detail-metrics">
          <span>Mastery<strong>${Math.round(selected.masteryScore)}/100</strong></span>
          <span>Latest<strong>${selected.latestScore == null ? "—" : `${Math.round(selected.latestScore * 100)}%`}</strong></span>
          <span>Confidence<strong>${selected.confidence == null ? "—" : `${selected.confidence}/5`}</strong></span>
        </div>
        <dl class="skill-relations">
          <div><dt>${snapshot.progressionMode === "soft" ? "Recommended preparation" : "Prerequisites"}</dt><dd>${selected.prerequisites.length ? selected.prerequisites.map((id) => { const target = store.skillsById[id]; const subject = snapshot.subjects.find((item) => item.id === target?.subjectId); return `${escapeHtml(target?.name ?? id)}${target?.subjectId !== selected.subjectId ? ` <small>(${escapeHtml(subject?.name ?? target?.subjectId)})</small>` : ""}`; }).join(", ") : "None"}</dd></div>
          <div><dt>Unlocks</dt><dd>${selected.unlocks.length ? selected.unlocks.map((id) => { const target = store.skillsById[id]; const subject = snapshot.subjects.find((item) => item.id === target?.subjectId); return `${escapeHtml(target?.name ?? id)}${target?.subjectId !== selected.subjectId ? ` <small>(${escapeHtml(subject?.name ?? target?.subjectId)})</small>` : ""}`; }).join(", ") : "Track complete"}</dd></div>
        </dl>
        ${selected.status === "locked" ? `<div class="locked-note"><strong>Why locked?</strong><p>Prove ${selected.unmetPrerequisites.map((id) => escapeHtml(store.skillsById[id]?.name ?? id)).join(" and ")} first, or switch this profile to Open path.</p></div>` : selected.unmetPrerequisites.length ? `<div class="guideline-note"><strong>Open-path guidance</strong><p>${selected.unmetPrerequisites.map((id) => escapeHtml(store.skillsById[id]?.name ?? id)).join(" and ")} would make this lesson easier, but they do not block you.</p></div>` : ""}
        ${selectedSkill.applications?.length ? `<div class="application-mini"><strong>Why this matters</strong>${selectedSkill.applications.slice(0, 2).map((item) => `<p>${escapeHtml(item.title)}: ${escapeHtml(item.description)}</p>`).join("")}</div>` : ""}
        <div class="map-detail-actions">
          <button class="button button-secondary" type="button" data-route="lesson" data-skill-id="${escapeHtml(selected.id)}">Open lesson</button>
          <button class="button button-primary" type="button" data-action="start-test" data-skill-id="${escapeHtml(selected.id)}" ${selected.status === "locked" ? "disabled" : ""}>Take ${assessmentCount(selectedSkill)}-scenario test</button>
        </div>
      </aside>`}
    </section>
  `;
  if (previousViewport) {
    const nextScroller = elements.view.querySelector(".map-scroll");
    const worldLeft = previousViewport.viewMinX + previousViewport.scrollLeft / previousViewport.zoom;
    const worldTop = previousViewport.viewMinY + previousViewport.scrollTop / previousViewport.zoom;
    nextScroller.scrollLeft = Math.max(0, (worldLeft - viewMinX) * zoom);
    nextScroller.scrollTop = Math.max(0, (worldTop - viewMinY) * zoom);
  } else if (freeCanvas) {
    const nextScroller = elements.view.querySelector(".map-scroll");
    nextScroller.scrollLeft = Math.max(0, -viewMinX * zoom);
    nextScroller.scrollTop = Math.max(0, -viewMinY * zoom);
  }
  const interactivePositions = Object.fromEntries(Object.entries(positions).filter(([id]) => renderedSkillIds.has(id)));
  setupMapInteractions({ planMode, layoutKey: viewportKey, positions: interactivePositions, width, height, viewMinX, viewMinY });
}

function formatTheory(value) {
  const blocks = String(value ?? "").trim().split(/\n\s*\n/);
  return blocks.map((block) => {
    const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length > 1 && lines.every((line) => /^\d+\.|^-/.test(line))) {
      const ordered = /^\d+\./.test(lines[0]);
      return `<${ordered ? "ol" : "ul"}>${lines.map((line) => `<li>${escapeHtml(line.replace(/^\d+\.\s*|^-\s*/, ""))}</li>`).join("")}</${ordered ? "ol" : "ul"}>`;
    }
    if (lines.length === 1 && /:$/.test(lines[0]) && lines[0].length < 80) return `<h3>${escapeHtml(lines[0].slice(0, -1))}</h3>`;
    return `<p>${lines.map(escapeHtml).join("<br>")}</p>`;
  }).join("");
}

function renderLesson(snapshot) {
  const skill = snapshot.selectedSkill;
  const row = rowForSkill(snapshot, skill.id);
  elements.view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Lesson library</p><h1>${escapeHtml(skill.name)}</h1><p>${escapeHtml(skill.description)}</p></div>
      <div class="page-actions"><label class="compact-select">Choose lesson<select id="lesson-select">${skillOptions(snapshot, skill.id)}</select></label></div>
    </header>
    <section class="lesson-overview">
      <div class="lesson-status-card">
        <div>${statusChip(row.status)}<code>${escapeHtml(skill.id)}</code></div>
        <div class="lesson-score"><span>Mastery</span><strong>${Math.round(row.masteryScore)}</strong><small>/ 100</small></div>
        <div class="mastery-track"><i style="width:${Math.round(row.masteryScore)}%"></i></div>
        <dl class="skill-relations"><div><dt>${snapshot.progressionMode === "soft" ? "Recommended preparation" : "Prerequisites"}</dt><dd>${row.prerequisites.length ? row.prerequisites.map((id) => escapeHtml(store.skillsById[id]?.name ?? id)).join(", ") : "None"}</dd></div><div><dt>Unlocks</dt><dd>${row.unlocks.length ? row.unlocks.map((id) => escapeHtml(store.skillsById[id]?.name ?? id)).join(", ") : "Track complete"}</dd></div></dl>
        ${row.status === "locked" ? `<div class="locked-note"><strong>Lesson available, test locked</strong><p>Prove the prerequisite skills or switch this profile to Open path.</p></div>` : `<button class="button button-primary" type="button" data-action="start-test" data-skill-id="${escapeHtml(skill.id)}">Start ${assessmentCount(skill)}-question coverage test</button>`}
      </div>
      <article class="theory-card">
        <p class="eyebrow">Core idea</p>
        <div class="theory-copy">${formatTheory(skill.theory)}</div>
      </article>
    </section>
    ${skill.applications?.length ? `<section class="application-grid"><div class="section-title"><p class="eyebrow">Why this matters</p><h2>${escapeHtml(snapshot.activeSubject.shortName)} that travels</h2></div>${skill.applications.map((item) => `<article><strong>${escapeHtml(item.title ?? item.subject ?? "Application")}</strong><p>${escapeHtml(item.description)}</p></article>`).join("")}</section>` : ""}
    <section class="examples-section">
      <div class="section-title"><p class="eyebrow">Worked examples</p><h2>Watch the method</h2></div>
      <div class="example-list">${skill.examples.map((example, index) => `<details ${index === 0 ? "open" : ""}><summary><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(example.prompt)}</summary><div><p class="example-solution">${escapeHtml(example.solution)}</p><p>${escapeHtml(example.explanation)}</p></div></details>`).join("")}</div>
    </section>
  `;
}

function renderWorkGuide(problem) {
  const mode = problem.work?.mode;
  if (mode === "proof_obligations") {
    const obligations = problem.work?.proof_policy?.obligations ?? [];
    const strategies = problem.work?.proof_policy?.accepted_strategies ?? [];
    return `<details class="work-guide" open><summary>What your proof must cover</summary><p class="work-syntax-note">Write in plain text—no special proof syntax is required. One claim or reason per line is easiest to review.</p><ol>${obligations.map((item) => `<li>${escapeHtml(typeof item === "string" ? item : item.description ?? item.label ?? item.id)}</li>`).join("")}</ol>${strategies.length ? `<p><strong>Accepted approaches:</strong> ${strategies.map((item) => escapeHtml(typeof item === "string" ? item : item.name ?? item.id)).join(" · ")}</p>` : ""}</details>`;
  }
  if (mode === "rubric_check") {
    const criteria = problem.work?.rubric?.criteria ?? [];
    return `<details class="work-guide" open><summary>How your response will be reviewed</summary><p class="work-syntax-note">Use normal prose, headings, or one point per line. Address every criterion below.</p><ul>${criteria.map((item) => `<li>${escapeHtml(item.description ?? item.label ?? item.id)}${item.weight && item.weight !== 1 ? ` · weight ${escapeHtml(item.weight)}` : ""}</li>`).join("")}</ul></details>`;
  }
  return "";
}

function workResponsePlaceholder(problem) {
  const mode = problem.work?.mode;
  if (mode === "procedural_steps") return "One mathematical step per line…";
  if (mode === "proof_obligations") return "Claim: …\nReason: …\nTherefore: …";
  if (mode === "rubric_check") return "Write a complete response that addresses each criterion…";
  return "Write your reasoning here…";
}

function rationalCandidateRow(candidate = {}) {
  return `<div class="structured-candidate-row" data-rational-candidate><input data-candidate-field="value" value="${escapeHtml(candidate.value ?? "")}" placeholder="Candidate value"><select data-candidate-field="status"><option value="valid" ${candidate.status === "valid" ? "selected" : ""}>Valid solution</option><option value="excluded" ${candidate.status === "excluded" ? "selected" : ""}>Excluded by domain</option><option value="extraneous" ${candidate.status === "extraneous" ? "selected" : ""}>Extraneous</option><option value="repeated" ${candidate.status === "repeated" ? "selected" : ""}>Repeated candidate</option><option value="non_real" ${candidate.status === "non_real" ? "selected" : ""}>Non-real</option></select><input data-candidate-field="original_check" value="${escapeHtml(candidate.original_check ?? "")}" placeholder="Original-equation check"><button type="button" class="quiet-button" data-action="remove-structured-row" aria-label="Remove candidate">×</button></div>`;
}

function renderFormattedCode(source, language = "text", caption = "Code") {
  return `<figure class="formatted-code-block"><figcaption><span>${escapeHtml(caption)}</span><small>${escapeHtml(language)}</small></figcaption><pre><code class="language-${escapeHtml(language)}">${escapeHtml(source)}</code></pre></figure>`;
}

function renderProblemPrompt(problem) {
  if (!problem.prompt_blocks?.length) return `<h2>${escapeHtml(problem.prompt)}</h2>`;
  return `<div class="question-prompt-blocks" aria-label="Question prompt">${problem.prompt_blocks.map((block) => block.type === "code"
    ? renderFormattedCode(block.text, block.language, "Question code")
    : `<p>${escapeHtml(block.text)}</p>`).join("")}</div>`;
}

function pythonGradePanel(problem, response, { submitted = false } = {}) {
  const grade = response?.structuredWorkJson?.python_grade;
  const running = runningPythonQuestionIds.has(problem.template_id);
  const visible = visiblePythonTests(grade, { submitted });
  const label = running
    ? "Running in an isolated Python worker…"
    : !grade
      ? "Run the code to check the authored examples and mastery tests. Hidden cases reveal only pass/fail status."
      : grade.status === "passed"
        ? `All ${grade.total} sandbox tests passed.`
        : `${grade.passed} of ${grade.total} sandbox tests passed · ${String(grade.status).replaceAll("_", " ")}.`;
  const testRows = visible.length ? `<ul>${visible.map((test) => `<li class="${test.status === "passed" ? "passed" : "failed"}"><strong>${escapeHtml(test.id)}</strong><span>${escapeHtml(test.message || test.status)}</span></li>`).join("")}</ul>` : "";
  return `<section class="python-sandbox-status ${grade?.status === "passed" ? "passed" : grade ? "failed" : "idle"}" aria-live="polite"><div><p class="eyebrow">Sandboxed Python grader</p><strong>${escapeHtml(label)}</strong></div>${testRows}${grade?.stdout ? `<details><summary>Captured output</summary><pre>${escapeHtml(grade.stdout)}</pre></details>` : ""}</section>`;
}

function renderPythonResponse(problem, response) {
  const running = runningPythonQuestionIds.has(problem.template_id);
  return `<div class="python-response"><label class="response-field code-response-field"><span>Python solution</span><textarea rows="13" maxlength="12000" data-question-id="${escapeHtml(problem.template_id)}" data-response-kind="answer" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="def ${escapeHtml(problem.program_spec?.entrypoint?.name ?? "solve")}(...):\n    ...">${escapeHtml(response.finalAnswer)}</textarea></label><div class="python-run-row"><button class="button button-secondary" type="button" data-action="run-python-tests" data-question-id="${escapeHtml(problem.template_id)}" ${running ? "disabled" : ""}>${running ? "Running…" : "Run sandboxed tests"}</button><small>Human-triggered only · local disposable runtime · no files, network, imports, browser APIs, packages, or input</small></div><p class="python-privacy-note">Your source and bounded pass/fail summary autosave with this profile and may enter its backup or GitHub workspace sync. Captured output is discarded. The authored memory figure is guidance; the disposable worker and wall timeout are the hard browser boundary.</p>${pythonGradePanel(problem, response)}</div>`;
}

function renderStructuredWorkEditor(problem, response) {
  const data = response.structuredWorkJson ?? {};
  const pieces = [];
  if (problem.grading_method === "rational_expression") {
    const excluded = Array.isArray(data.excluded_values) ? data.excluded_values.join(", ") : data.excluded_values ?? "";
    pieces.push(`<section class="structured-work-editor compact"><p class="eyebrow">Domain is part of the answer</p><label>Excluded x-values<input data-structured-field="excluded-values" value="${escapeHtml(excluded)}" placeholder="Example: -2, 3 or {}"><small>List every value excluded by the original denominator, including canceled holes.</small></label></section>`);
  }
  if (problem.work?.mode === "rational_equation_steps") {
    const restrictions = Array.isArray(data.restrictions) ? data.restrictions.join(", ") : "";
    const steps = Array.isArray(data.steps) ? data.steps.join("\n") : data.steps ?? response.work ?? "";
    const candidates = Array.isArray(data.candidates) ? data.candidates : [];
    pieces.push(`<section class="structured-work-editor" data-structured-mode="rational_equation_steps"><header><div><p class="eyebrow">Structured equation check</p><h3>Restrictions, candidates, verification</h3></div><span>Autosaved</span></header><label>Original denominator restrictions<input data-structured-field="restrictions" value="${escapeHtml(restrictions)}" placeholder="Example: -2, 5"><small>These survive denominator clearing and cancellation.</small></label><label>Algebra steps<textarea rows="5" data-structured-field="rational-steps" placeholder="One denominator-clearing or solving step per line">${escapeHtml(steps)}</textarea></label><fieldset><legend>Candidate ledger</legend><div data-rational-candidates>${Array.from({ length: Math.max(2, candidates.length) }, (_, index) => rationalCandidateRow(candidates[index] ?? {})).join("")}</div><button type="button" class="quiet-button" data-action="add-rational-candidate">+ Add candidate</button></fieldset></section>`);
  }
  if (problem.work?.mode === "sign_chart_steps") {
    const chart = problem.work.sign_chart ?? {};
    const expectedCount = chart.critical_points?.length ?? 0;
    const points = Array.isArray(data.critical_points) ? data.critical_points : [];
    const intervals = Array.isArray(data.intervals) ? data.intervals : [];
    const endpoints = Array.isArray(data.endpoints) ? data.endpoints : [];
    const layoutValues = points.map((point) => String(point?.value ?? "").trim()).filter(Boolean).sort((left, right) => structuredNumber(left) - structuredNumber(right));
    pieces.push(`<section class="structured-work-editor sign-chart-editor" data-structured-mode="sign_chart_steps"><header><div><p class="eyebrow">Structured sign chart</p><h3>${escapeHtml(chart.expression ?? "Expression")} ${escapeHtml(chart.relation ?? "") } 0</h3></div><span>${expectedCount} critical point${expectedCount === 1 ? "" : "s"}</span></header>${chart.require_factorization ? `<label>Factorization<input data-structured-field="factorization" value="${escapeHtml(data.factorization ?? "")}" placeholder="Factor completely"></label>` : ""}<fieldset><legend>1. Critical points</legend><div class="structured-grid">${Array.from({ length: expectedCount }, (_, index) => { const point = points[index] ?? {}; return `<div data-sign-critical><input data-critical-field="value" value="${escapeHtml(point.value ?? "")}" placeholder="Value ${index + 1}"><select data-critical-field="kind"><option value="zero" ${point.kind === "zero" ? "selected" : ""}>Zero</option><option value="undefined" ${point.kind === "undefined" ? "selected" : ""}>Undefined / pole</option><option value="hole" ${point.kind === "hole" ? "selected" : ""}>Hole</option></select></div>`; }).join("") || "<p>No real critical points are expected; test the whole real line.</p>"}</div></fieldset><fieldset><legend>2. Interval tests</legend><p class="structured-hint">Interval boundaries follow your critical points automatically. Enter one test value and sign per row.</p><div class="sign-interval-list">${Array.from({ length: expectedCount + 1 }, (_, index) => { const row = intervals[index] ?? {}; const lower = index === 0 ? "" : (layoutValues[index - 1] ?? row.lower ?? ""); const upper = index === expectedCount ? "" : (layoutValues[index] ?? row.upper ?? ""); return `<div data-sign-interval><strong>Interval ${index + 1}</strong><input data-interval-field="lower" value="${escapeHtml(lower)}" placeholder="-inf" readonly><input data-interval-field="upper" value="${escapeHtml(upper)}" placeholder="inf" readonly><input data-interval-field="test_value" value="${escapeHtml(row.test_value ?? "")}" placeholder="Test value"><select data-interval-field="sign"><option value="positive" ${row.sign === "positive" ? "selected" : ""}>Positive</option><option value="negative" ${row.sign === "negative" ? "selected" : ""}>Negative</option><option value="zero" ${row.sign === "zero" ? "selected" : ""}>Zero</option></select><label class="check-field"><input type="checkbox" data-interval-field="selected" ${row.selected ? "checked" : ""}> Belongs in solution</label></div>`; }).join("")}</div></fieldset>${expectedCount ? `<fieldset><legend>3. Endpoint decisions</legend><div class="structured-grid">${Array.from({ length: expectedCount }, (_, index) => { const endpoint = endpoints[index] ?? {}; return `<div data-sign-endpoint><input data-endpoint-field="value" value="${escapeHtml(layoutValues[index] ?? endpoint.value ?? "")}" placeholder="Endpoint ${index + 1}" readonly><label class="check-field"><input type="checkbox" data-endpoint-field="included" ${endpoint.included ? "checked" : ""}> Include endpoint</label></div>`; }).join("")}</div></fieldset>` : ""}</section>`);
  }
  if (problem.work?.mode === "code_trace_steps") {
    const trace = problem.work.trace_spec;
    const rows = Array.isArray(data.rows) ? data.rows : [];
    pieces.push(`<section class="structured-work-editor trace-table-editor" data-structured-mode="code_trace_steps"><header><div><p class="eyebrow">Structured trace table</p><h3>Follow the state one step at a time</h3></div><span>${trace.expected_rows.length} row${trace.expected_rows.length === 1 ? "" : "s"}</span></header>${trace.display_code ? renderFormattedCode(trace.display_code, trace.language, "Trace this code") : ""}<p class="structured-hint">Each row is one authored execution checkpoint. Enter the variable values and output after that step; blank output means nothing was printed yet.</p><div class="trace-table-scroll"><table><thead><tr>${trace.columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${trace.expected_rows.map((expectedRow, rowIndex) => { const row = rows[rowIndex] ?? {}; return `<tr data-trace-row="${rowIndex}">${trace.columns.map((column) => column === "step" ? `<th scope="row">${escapeHtml(expectedRow.step)}<input type="hidden" data-trace-field="step" value="${escapeHtml(expectedRow.step)}"></th>` : `<td><input data-trace-field="${escapeHtml(column)}" value="${escapeHtml(row[column] ?? "")}" aria-label="Step ${escapeHtml(expectedRow.step)}, ${escapeHtml(column)}" autocomplete="off" spellcheck="false"></td>`).join("")}</tr>`; }).join("")}</tbody></table></div></section>`);
  }
  return pieces.join("");
}

function structuredNumber(value) {
  const source = String(value ?? "").trim().toLowerCase();
  if (!source) return Number.POSITIVE_INFINITY;
  if (source === "pi" || source === "π") return Math.PI;
  if (source === "e") return Math.E;
  const fraction = source.match(/^(-?\d+)\s*\/\s*(-?\d+)$/);
  if (fraction && Number(fraction[2])) return Number(fraction[1]) / Number(fraction[2]);
  const radical = source.match(/^sqrt\s*\(\s*([\d.]+)\s*\)$/);
  if (radical) return Math.sqrt(Number(radical[1]));
  const numeric = Number(source);
  return Number.isFinite(numeric) ? numeric : Number.POSITIVE_INFINITY;
}

function syncSignChartLayout(card) {
  if (card?.dataset.workMode !== "sign_chart_steps") return;
  const values = [...card.querySelectorAll('[data-critical-field="value"]')].map((input) => input.value.trim()).filter(Boolean).sort((left, right) => structuredNumber(left) - structuredNumber(right));
  [...card.querySelectorAll("[data-sign-interval]")].forEach((row, index, rows) => {
    const lower = row.querySelector('[data-interval-field="lower"]');
    const upper = row.querySelector('[data-interval-field="upper"]');
    if (lower) lower.value = index === 0 ? "" : (values[index - 1] ?? "");
    if (upper) upper.value = index === rows.length - 1 ? "" : (values[index] ?? "");
  });
  [...card.querySelectorAll("[data-sign-endpoint]")].forEach((row, index) => {
    const field = row.querySelector('[data-endpoint-field="value"]');
    if (field) field.value = values[index] ?? "";
  });
}

function collectStructuredWork(card) {
  const output = {};
  const exclusions = card.querySelector('[data-structured-field="excluded-values"]');
  if (exclusions) output.excluded_values = exclusions.value;
  if (card.dataset.workMode === "rational_equation_steps") {
    output.restrictions = (card.querySelector('[data-structured-field="restrictions"]')?.value ?? "").split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean);
    output.steps = (card.querySelector('[data-structured-field="rational-steps"]')?.value ?? "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    output.candidates = [...card.querySelectorAll("[data-rational-candidate]")].map((row) => Object.fromEntries([...row.querySelectorAll("[data-candidate-field]")].map((field) => [field.dataset.candidateField, field.value.trim()]))).filter((item) => item.value || item.original_check);
  }
  if (card.dataset.workMode === "sign_chart_steps") {
    output.factorization = card.querySelector('[data-structured-field="factorization"]')?.value.trim() ?? "";
    output.critical_points = [...card.querySelectorAll("[data-sign-critical]")].map((row) => Object.fromEntries([...row.querySelectorAll("[data-critical-field]")].map((field) => [field.dataset.criticalField, field.value.trim()])));
    output.intervals = [...card.querySelectorAll("[data-sign-interval]")].map((row) => Object.fromEntries([...row.querySelectorAll("[data-interval-field]")].map((field) => [field.dataset.intervalField, field.type === "checkbox" ? field.checked : field.value.trim()])));
    output.endpoints = [...card.querySelectorAll("[data-sign-endpoint]")].map((row) => Object.fromEntries([...row.querySelectorAll("[data-endpoint-field]")].map((field) => [field.dataset.endpointField, field.type === "checkbox" ? field.checked : field.value.trim()])));
  }
  if (card.dataset.workMode === "code_trace_steps") {
    output.rows = [...card.querySelectorAll("[data-trace-row]")].map((row) => Object.fromEntries([...row.querySelectorAll("[data-trace-field]")].map((field) => [field.dataset.traceField, field.value.trim()])));
  }
  return Object.keys(output).length ? output : null;
}

function renderTest(snapshot) {
  const skill = snapshot.selectedSkill;
  const row = rowForSkill(snapshot, skill.id);
  const draft = snapshot.activeTest;
  if (!draft) {
    elements.view.innerHTML = `
      <header class="page-head"><div><p class="eyebrow">Mastery test</p><h1>Choose what to prove.</h1><p>Tests use real questions generated from the original QuickMaths curriculum.</p></div><div class="page-actions"><label class="compact-select">Skill<select id="test-skill-select">${skillOptions(snapshot, skill.id)}</select></label></div></header>
      <section class="test-empty content-card">${statusChip(row.status)}<h2>${escapeHtml(skill.name)}</h2><p>${escapeHtml(skill.description)}</p><p>${assessmentCount(skill)} questions cover the lesson's authored assessment scenarios; retakes rotate available variants.</p>${row.status === "locked" ? `<div class="locked-note"><strong>Test locked</strong><p>Open the mastery map to complete its prerequisites first.</p></div><button class="button button-secondary" data-route="lesson" data-skill-id="${escapeHtml(skill.id)}">Read lesson</button>` : `<button class="button button-primary" data-action="start-test" data-skill-id="${escapeHtml(skill.id)}">Start ${assessmentCount(skill)} coverage questions</button>`}</section>
    `;
    return;
  }
  const answered = Object.values(draft.responses).filter((response) => response.finalAnswer).length;
  const questionIds = new Set(draft.problems.map((problem) => problem.template_id));
  const latestReview = snapshot.reviews.find((review) => questionIds.has(review.questionId));
  elements.view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Mastery test · autosaved</p><h1>${escapeHtml(skill.name)}</h1><p>All ${draft.problems.length} authored scenarios are included. Retakes rotate available variants; shown work stays available for tutor or self review.</p></div>
      <div class="test-progress"><span>${answered} / ${draft.problems.length} scenarios answered</span><i><b style="width:${draft.problems.length ? answered / draft.problems.length * 100 : 0}%"></b></i></div>
    </header>
    ${latestReview ? `<aside class="inline-feedback"><span aria-hidden="true">✦</span><div><p class="eyebrow">Latest tutor note</p><strong>${escapeHtml(latestReview.feedback)}</strong><p>${escapeHtml(latestReview.nextStep)}</p></div></aside>` : ""}
    <form id="test-form" class="test-form">
      ${draft.problems.map((problem, index) => {
        const response = draft.responses[problem.template_id] ?? { finalAnswer: "", work: "" };
        return `<article class="question-card" id="question-${escapeHtml(problem.template_id)}" data-work-mode="${escapeHtml(problem.work?.mode ?? "none")}" data-grading-method="${escapeHtml(problem.grading_method)}">
          <div class="question-number"><span>${String(index + 1).padStart(2, "0")}</span><small>${escapeHtml(problem.difficulty)} · ${escapeHtml(problem.answer_mode.replaceAll("_", " "))}</small></div>
          ${renderProblemPrompt(problem)}
          ${problem.grading_method === "python_program" ? renderPythonResponse(problem, response) : problem.options?.length ? `<fieldset class="answer-options"><legend>Final answer</legend>${problem.options.map((option) => `<label><input type="radio" name="answer-${escapeHtml(problem.template_id)}" value="${escapeHtml(option.id)}" data-question-id="${escapeHtml(problem.template_id)}" data-response-kind="answer" ${response.finalAnswer === String(option.id) ? "checked" : ""}><span><b>${escapeHtml(option.id)}</b>${escapeHtml(option.label ?? option.id)}</span></label>`).join("")}</fieldset>` : `<label class="response-field"><span>Final answer</span><input type="text" value="${escapeHtml(response.finalAnswer)}" data-question-id="${escapeHtml(problem.template_id)}" data-response-kind="answer" autocomplete="off" spellcheck="false" placeholder="Enter your answer"></label>`}
          ${renderWorkGuide(problem)}
          ${renderStructuredWorkEditor(problem, response)}
          ${problem.work?.mode && problem.work.mode !== "none" && !["rational_equation_steps", "sign_chart_steps", "code_trace_steps"].includes(problem.work.mode) ? `<label class="response-field work-field"><span>${escapeHtml(problem.work.prompt ?? "Show your work")} ${problem.work_required ? "(required)" : "(optional)"}</span><textarea rows="${["proof_obligations", "rubric_check"].includes(problem.work.mode) ? 7 : 4}" maxlength="${MAX_LONG_WORK_CHARS}" data-question-id="${escapeHtml(problem.template_id)}" data-response-kind="work" placeholder="${escapeHtml(workResponsePlaceholder(problem))}">${escapeHtml(response.work)}</textarea><small>${Number(response.work?.length ?? 0).toLocaleString()} / ${MAX_LONG_WORK_CHARS.toLocaleString()} characters · saved without silent truncation</small></label>` : ""}
        </article>`;
      }).join("")}
      <p id="test-error" class="form-message" role="alert"></p>
      <div class="sticky-submit"><span>Your draft is saved automatically in this browser.</span><button class="button button-primary" type="submit">Submit answers</button></div>
    </form>
  `;
}

function resultReviewGuide(result) {
  if (result.workMode === "proof_obligations" && result.proofObligations?.length) {
    return `<section class="result-review-guide"><strong>Review this proof against</strong><ol>${result.proofObligations.map((item) => `<li>${escapeHtml(typeof item === "string" ? item : item.description ?? item.label ?? item.id)}</li>`).join("")}</ol></section>`;
  }
  if (result.workMode === "rubric_check" && result.rubricCriteria?.length) {
    return `<section class="result-review-guide"><strong>Review this response against</strong><ul>${result.rubricCriteria.map((item) => `<li>${escapeHtml(typeof item === "string" ? item : item.description ?? item.label ?? item.id)}${typeof item === "object" && item.weight ? ` · ${escapeHtml(item.weight)} point${Number(item.weight) === 1 ? "" : "s"}` : ""}</li>`).join("")}</ul></section>`;
  }
  return "";
}

function resultStructuredDetails(result) {
  const structured = result.structuredWorkJson;
  if (!structured) return "";
  if (result.gradingMethod === "python_program") {
    const grade = structured.python_grade;
    const tests = visiblePythonTests(grade, { submitted: true });
    return `<div class="shown-work python-result"><strong>Sandbox result · ${escapeHtml(grade?.passed ?? 0)} / ${escapeHtml(grade?.total ?? 0)} tests passed</strong>${tests.length ? `<ul>${tests.map((test) => `<li class="${test.status === "passed" ? "passed" : "failed"}"><b>${escapeHtml(test.id)}</b> ${escapeHtml(test.message || test.status)}</li>`).join("")}</ul>` : ""}<small>Hidden tests remain hidden; they report status without their inputs or expected values.</small></div>`;
  }
  if (result.workMode === "code_trace_steps") {
    const rows = Array.isArray(structured.rows) ? structured.rows : [];
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    return `<div class="shown-work trace-result"><strong>Your trace table</strong>${rows.length ? `<div class="trace-table-scroll"><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : '<p>No trace rows were entered.</p>'}${result.traceDiagnostics?.length ? `<ul class="trace-diagnostics">${result.traceDiagnostics.map((item) => `<li>${escapeHtml(item.message)}</li>`).join("")}</ul>` : '<p class="trace-correct">Every traced checkpoint matches.</p>'}</div>`;
  }
  return `<div class="shown-work"><strong>Structured work</strong><pre>${escapeHtml(JSON.stringify(structured, null, 2))}</pre></div>`;
}

function resultDetails(results) {
  return results.map((result, index) => `<details class="result-question" ${!result.correct || result.reviewRequired ? "open" : ""}>
    <summary><span class="result-icon ${result.correct ? "correct" : "incorrect"}">${result.correct ? "✓" : "×"}</span><span><strong>Question ${index + 1}</strong><small>${escapeHtml(result.prompt)}</small></span><b>${result.reviewRequired ? "Review required" : result.correct ? "Correct" : "Needs work"}</b></summary>
    <div class="result-body"><dl><div><dt>Your answer</dt><dd>${result.gradingMethod === "python_program" ? `<pre class="result-code"><code>${escapeHtml(result.finalAnswer || "No code submitted")}</code></pre>` : escapeHtml(result.finalAnswer || "No answer")}</dd></div><div><dt>Expected</dt><dd>${escapeHtml(result.expectedAnswer)}</dd></div></dl>${resultReviewGuide(result)}${result.work ? `<div class="shown-work"><strong>Your work</strong><pre>${escapeHtml(result.work)}</pre></div>` : ""}${resultStructuredDetails(result)}${result.mistakeTags?.length ? `<p class="mistake-tags">Review: ${result.mistakeTags.map(escapeHtml).join(" · ")}</p>` : ""}${result.solutionSteps?.length ? `<ol>${result.solutionSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>` : ""}</div>
  </details>`).join("");
}

function renderAttemptReviewForm(attempt) {
  const targets = attempt?.results?.filter((item) => item.work) ?? [];
  if (!targets.length) return "";
  const first = targets[0];
  const structured = targets.map((result, index) => {
    const obligations = result.proofObligations ?? [];
    const criteria = result.rubricCriteria ?? [];
    if (!obligations.length && !criteria.length) return `<div class="structured-review" data-review-structure="${escapeHtml(result.questionId)}" ${index ? "hidden" : ""}><p>This response has no checklist. Use the overall verdict below.</p></div>`;
    if (obligations.length) return `<fieldset class="structured-review" data-review-structure="${escapeHtml(result.questionId)}" ${index ? "hidden" : ""}><legend>Proof obligations · score each one</legend>${obligations.map((item, obligationIndex) => { const value = typeof item === "string" ? { id: `obligation_${obligationIndex + 1}`, description: item } : item; return `<div class="structured-review-row" data-obligation-id="${escapeHtml(value.id)}"><strong>${escapeHtml(value.description ?? value.label ?? value.id)}</strong><select class="review-obligation-status" aria-label="Status for ${escapeHtml(value.description ?? value.id)}"><option value="satisfied">Satisfied</option><option value="flawed">Flawed / incomplete</option><option value="missing">Missing</option>${value.required === false ? '<option value="not_applicable">Not applicable</option>' : ""}</select><input class="review-item-note" placeholder="Evidence or revision note (optional)"></div>`; }).join("")}</fieldset>`;
    return `<fieldset class="structured-review" data-review-structure="${escapeHtml(result.questionId)}" ${index ? "hidden" : ""}><legend>Rubric · award points per criterion</legend>${criteria.map((item, criterionIndex) => { const value = typeof item === "string" ? { id: `criterion_${criterionIndex + 1}`, description: item, weight: 1 } : item; return `<div class="structured-review-row" data-rubric-id="${escapeHtml(value.id)}"><strong>${escapeHtml(value.description ?? value.label ?? value.id)}</strong><label>Points <input class="review-rubric-score" type="number" min="0" max="${escapeHtml(value.weight ?? 1)}" step="0.1" value="${escapeHtml(value.weight ?? 1)}"> / ${escapeHtml(value.weight ?? 1)}</label><input class="review-item-note" placeholder="Evidence or revision note (optional)"></div>`; }).join("")}</fieldset>`;
  }).join("");
  return `<section class="self-review content-card"><div class="card-heading"><div><p class="eyebrow">${attempt.hasPendingReview ? "Required sign-off" : "Optional review"}</p><h2>${attempt.hasPendingReview ? "Review the saved reasoning" : "Add tutor / self review"}</h2><p>Select the response, score every proof obligation or rubric criterion, then leave concise feedback. QuickMaths calculates the structured verdict.</p></div></div><form id="self-review-form"><div class="review-form-grid"><label>Response<select id="review-question-select" name="question">${targets.map((result) => `<option value="${escapeHtml(result.questionId)}" data-allow-self="${result.allowSelfReview ? "true" : "false"}">Question ${attempt.results.findIndex((item) => item.questionId === result.questionId) + 1} · ${escapeHtml(result.workMode?.replaceAll("_", " ") ?? "shown work")}</option>`).join("")}</select></label><label>Reviewer<select id="review-reviewer-select" name="reviewer"><option value="self" ${first.allowSelfReview ? "" : "disabled"}>Self</option><option value="human_tutor" ${first.allowSelfReview ? "" : "selected"}>Human tutor</option><option value="ai_tutor">AI tutor / agent</option></select></label><label>Overall verdict for unstructured work<select name="verdict"><option value="pass">Pass</option><option value="partial" selected>Partial</option><option value="needs_revision">Needs revision</option><option value="fail">Fail</option></select></label><label>Confidence<select name="confidence"><option>low</option><option selected>medium</option><option>high</option></select></label></div><p id="review-permission-note" class="review-permission-note">${first.allowSelfReview ? "This response allows self review." : "This response requires a tutor or connected agent."}</p>${structured}<label>Feedback<textarea name="feedback" rows="3" required placeholder="Which requirements were met, and what needs revision?"></textarea></label><label>Next step<input name="next" required placeholder="One concrete action for the learner"></label><button class="button button-secondary" type="submit">Save review</button></form></section>`;
}

function savedReviewDetails(review) {
  const details = [
    ...(review.obligationResults ?? []).map((item) => `<li><b>${escapeHtml(item.id)}</b> · ${escapeHtml(item.status)}${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}</li>`),
    ...(review.rubricResults ?? []).map((item) => `<li><b>${escapeHtml(item.id)}</b> · ${escapeHtml(item.awardedPoints)} / ${escapeHtml(item.maxPoints)}${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}</li>`),
  ];
  return `<article><strong>${escapeHtml(review.verdict)} · ${Math.round(review.score * 100)}%</strong>${details.length ? `<ul>${details.join("")}</ul>` : ""}<p>${escapeHtml(review.feedback)}</p><small>${escapeHtml(review.nextStep)}</small></article>`;
}

function renderResults(snapshot) {
  const pending = snapshot.pendingResults;
  const attempt = pending ? null : store.getAttempt();
  const result = pending ?? attempt;
  if (!result) {
    elements.view.innerHTML = `<header class="page-head"><div><p class="eyebrow">Results</p><h1>No saved attempts yet.</h1><p>Complete a mastery test, reflect on it, and this page becomes your attempt history.</p></div></header><section class="content-card"><div class="empty-state"><button class="button button-primary" data-route="test">Open mastery test</button></div></section>`;
    return;
  }
  const skill = store.skillsById[result.skillId];
  const score = Math.round((result.percentScore ?? 0) * 100);
  const reviews = snapshot.reviews.filter((review) => !attempt || review.attemptId === attempt.attemptId);
  const curriculumSettings = snapshot.activeCurriculum?.settings;
  const contactHref = curriculumSettings?.contactEmail && attempt
    ? `mailto:${encodeURIComponent(curriculumSettings.contactEmail)}?subject=${encodeURIComponent(`QuickMaths proof · ${skill?.name ?? result.skillName}`)}&body=${encodeURIComponent(`Student: ${curriculumSettings.studentName || snapshot.activeProfile.displayName}\nLesson: ${skill?.name ?? result.skillName}\nScore: ${score}%\nCompleted: ${attempt.completedAt}\n\nAttach the downloaded QuickMaths review packet to this email.`)}`
    : null;
  elements.view.innerHTML = `
    <header class="page-head"><div><p class="eyebrow">${pending ? "Unsaved reflection" : "Saved attempt"}</p><h1>${escapeHtml(skill?.name ?? result.skillName)}</h1><p>${pending ? "Review the outcome, then save your reflection to update the mastery map." : `Completed ${formatDate(attempt.completedAt)} · ${escapeHtml(attempt.masteryUpdate?.status ?? "saved")}`}</p>${pending ? "" : `<div class="page-actions"><button class="button button-outline" data-action="download-tutor-summary">Tutor summary ↓</button><button class="button button-outline" data-action="download-review-packet">Review packet ↓</button></div>`}</div><div class="result-score"><strong>${score}%</strong><span>${result.rawScore} / ${result.scoreTotal} correct</span></div></header>
    <section class="results-layout">
      <div class="result-questions">${resultDetails(result.results ?? [])}</div>
      <aside class="reflection-card">
        ${pending ? `<p class="eyebrow">Reflection</p><h2>How did that feel?</h2><p>Mastery is accumulated. Confidence, hints, guessing, and difficulty shape the update.</p>
          <form id="reflection-form">
            <label>Confidence <output id="confidence-output">3 / 5</output><input id="reflection-confidence" name="confidence" type="range" min="1" max="5" value="3"></label>
            <div class="two-fields"><label>Difficulty<select name="difficulty"><option>easy</option><option selected>medium</option><option>hard</option><option>brutal</option></select></label><label>Hints used<select name="hints"><option>none</option><option>little</option><option>some</option><option>a_lot</option></select></label></div>
            <div class="two-fields"><label>Guessed<select name="guessed"><option>no</option><option>maybe</option><option>yes</option></select></label><label>More practice<select name="more"><option>yes</option><option>no</option></select></label></div>
            <label>What was confusing?<textarea name="confusing" rows="3"></textarea></label>
            <label>Notes<textarea name="notes" rows="3"></textarea></label>
            <button class="button button-primary" type="submit">Save result & update map</button>
          </form>` : `<p class="eyebrow">Mastery update</p><h2>${escapeHtml(attempt.masteryUpdate?.status ?? "Saved")}</h2><div class="saved-mastery"><strong>${Math.round(attempt.masteryUpdate?.masteryScore ?? 0)}</strong><span>/ 100 mastery</span></div><dl class="reflection-summary"><div><dt>Confidence</dt><dd>${attempt.reflection?.confidenceRating ?? "—"}/5</dd></div><div><dt>Difficulty</dt><dd>${escapeHtml(attempt.reflection?.difficultyFelt ?? "—")}</dd></div><div><dt>Hints</dt><dd>${escapeHtml(attempt.reflection?.hintsUsed ?? "—")}</dd></div></dl><button class="button button-primary" data-action="retake" data-skill-id="${escapeHtml(attempt.skillId)}">Practice again</button>${contactHref ? `<a class="button button-outline" href="${escapeHtml(contactHref)}">Email proof to educator</a>` : ""}`}
        ${reviews.length ? `<div class="saved-reviews"><p class="eyebrow">Saved review</p>${reviews.map(savedReviewDetails).join("")}</div>` : ""}
      </aside>
    </section>
    ${!pending ? renderAttemptReviewForm(attempt) : ""}
  `;
}

function bridgePhaseLabel(status) {
  if (bridgeNeedsChoice) return "Needs your choice";
  if (status.phase === "conflict") return "Sync paused";
  if (status.error) return "Connection problem";
  if (["connecting", "checking", "pulling", "pushing", "deleting"].includes(status.phase)) return `${status.phase[0].toUpperCase()}${status.phase.slice(1)}…`;
  if (status.connected && status.dirty) return "Waiting to sync";
  if (status.connected) return "Connected";
  return "Not connected";
}

function bridgeFormValues() {
  const saved = githubCredentials?.load({ role: "learner" });
  return {
    owner: bridgeFormDraft?.owner ?? saved?.owner ?? "",
    repo: bridgeFormDraft?.repo ?? saved?.repo ?? "quickmaths-sync",
    branch: bridgeFormDraft?.branch ?? saved?.branch ?? "main",
    token: bridgeFormDraft?.token ?? "",
    remember: bridgeFormDraft?.remember ?? saved?.rememberToken ?? false,
    hasSavedToken: Boolean(saved?.token),
  };
}

function captureBridgeFormDraft(form = document.querySelector("[data-bridge-form]")) {
  if (!form) return;
  bridgeFormDraft = {
    owner: String(form.querySelector('[name="owner"]')?.value ?? ""),
    repo: String(form.querySelector('[name="repo"]')?.value ?? ""),
    branch: String(form.querySelector('[name="branch"]')?.value ?? ""),
    token: String(form.querySelector('[name="token"]')?.value ?? ""),
    remember: Boolean(form.querySelector('[name="remember"]')?.checked),
  };
}

function restoreBridgeFormDraft(form) {
  if (!form) return;
  const values = bridgeFormValues();
  const owner = form.querySelector('[name="owner"]');
  const repo = form.querySelector('[name="repo"]');
  const branch = form.querySelector('[name="branch"]');
  const token = form.querySelector('[name="token"]');
  const remember = form.querySelector('[name="remember"]');
  if (owner) owner.value = values.owner;
  if (repo) repo.value = values.repo;
  if (branch) branch.value = values.branch;
  if (token && values.token) token.value = values.token;
  if (remember) remember.checked = values.remember;
}

function renderBridgeConnectionForm({ id = "github-sync-form", landing = false } = {}) {
  const values = bridgeFormValues();
  const tokenRequired = !values.hasSavedToken && !values.token;
  return `<div class="github-sync-form ${landing ? "welcome-github-sync-form" : ""}" data-bridge-form>
    <div class="github-repo-fields"><label>Repository owner<input name="owner" value="${escapeHtml(values.owner)}" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="your-github-username" required></label><label>Data repository<input name="repo" value="${escapeHtml(values.repo)}" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="quickmaths-sync" required></label><label>Branch<input name="branch" value="${escapeHtml(values.branch)}" autocomplete="off" autocapitalize="none" spellcheck="false" required></label></div>
    <form id="${id}" class="bridge-token-form" autocomplete="off">
      <label>Fine-grained storage token<input name="token" type="password" autocomplete="new-password" data-1p-ignore data-lpignore="true" spellcheck="false" placeholder="${values.hasSavedToken ? "Saved for this browser session" : "Paste your fine-grained GitHub token"}" ${tokenRequired ? "required" : ""}></label>
      <label class="bridge-remember"><input name="remember" type="checkbox" ${values.remember ? "checked" : ""}><span><strong>Remember token on this device</strong><small>Useful on your own phone. This stores it in browser storage—not cookies or the repository. Leave off on a shared device.</small></span></label>
      <div class="bridge-connect-actions"><button class="button button-primary" type="submit">${landing ? "Connect and load my workspace" : "Connect Workspace Storage"}</button>${landing ? `<a class="quiet-button" href="./bridge-guide.html" target="_blank" rel="noopener">Storage setup guide ↗</a>` : `<a class="button button-outline" href="https://github.com/new" target="_blank" rel="noopener">Create private data repo ↗</a><a class="button button-outline" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Create fine-grained token ↗</a><a class="quiet-button" href="./bridge-guide.html" target="_blank" rel="noopener">Setup guide ↗</a>`}</div>
      <p class="bridge-form-note"><strong>Workspace-wide storage:</strong> this uploads the complete QuickMaths workspace in this browser—including every learner and educator profile, curriculum, attempt, review, installed pack, map plan, and educator guidance. The repository must be private, and the fine-grained token must be limited to that repository with <strong>Contents → Read and write</strong>.</p>
      <p class="form-message" role="status">${escapeHtml(githubSyncSnapshot.error ?? "")}</p>
    </form>
  </div>`;
}

function renderWelcomeStorageRestore(snapshot) {
  if (!elements.welcomeStorageRestore) return;
  if (snapshot.profiles.length) {
    elements.welcomeStorageRestore.innerHTML = "";
    return;
  }
  const open = welcomeStorageOpen || Boolean(bridgeFormDraft);
  elements.welcomeStorageRestore.innerHTML = `<details id="welcome-storage-details" class="welcome-storage-restore" ${open ? "open" : ""}>
    <summary><span><strong>Already have a profile on another device?</strong><small>Restore it from GitHub storage instead of starting over.</small></span><b>Connect storage</b></summary>
    <div class="welcome-storage-body"><p>Use the same private data repository and fine-grained token as your other device. QuickMaths will load the complete browser workspace, not only one learner profile.</p>${renderBridgeConnectionForm({ id: "welcome-github-sync-form", landing: true })}</div>
  </details>`;
  restoreBridgeFormDraft(document.querySelector("#welcome-github-sync-form")?.closest("[data-bridge-form]"));
}

function renderGitHubBridge(snapshot) {
  const status = githubSyncSnapshot;
  const saved = githubCredentials?.load({ role: "learner" });
  const educator = snapshot.activeProfile?.role === "educator";
  const checkpointLabel = "complete QuickMaths workspace";
  const repository = status.config ? `${status.config.owner}/${status.config.repo}` : null;
  const choice = bridgeChoiceDetails;
  const phaseClass = status.phase === "conflict" ? "conflict" : status.error ? "error" : status.connected ? "connected" : "idle";
  if (!status.connected) {
    return `
      <section class="content-card github-bridge-card" id="github-bridge">
        <div class="bridge-card-heading"><div><p class="eyebrow">Workspace Storage · experimental</p><h2>${educator ? "Sync curriculum work across devices" : "Connect mobile learning to a remote agent"}</h2><p>Your browser remains the instant local save. A dedicated private GitHub repository carries debounced checkpoints for this ${escapeHtml(checkpointLabel)}.</p></div><span class="sync-phase ${phaseClass}"><i></i>${escapeHtml(bridgePhaseLabel(status))}</span></div>
        ${renderBridgeConnectionForm()}
      </section>`;
  }

  return `
    <section class="content-card github-bridge-card" id="github-bridge">
      <div class="bridge-card-heading"><div><p class="eyebrow">Workspace Storage · experimental</p><h2>${escapeHtml(repository)}</h2><p>The complete browser workspace is checkpointed after a short pause. Remote updates are accepted only when they were created from the current app revision.</p></div><span class="sync-phase ${phaseClass}"><i></i>${escapeHtml(bridgePhaseLabel(status))}</span></div>
      ${status.error ? `<aside class="bridge-warning"><strong>${status.phase === "conflict" ? "Sync conflict" : "Bridge paused"}</strong><p>${escapeHtml(status.error)}</p></aside>` : ""}
      ${bridgeNeedsChoice ? `<aside class="bridge-choice"><div><strong>A workspace decision is waiting.</strong><p>${choice?.kind === "migration" ? "This is a first-time migration between independent browser and GitHub work." : "This device has unsynced work that needs a quick comparison with GitHub."}${choice ? ` Last GitHub writer: ${escapeHtml(choice.remoteLabel)}.` : ""}</p></div><button class="button button-primary" data-action="bridge-review-choice">Compare versions</button></aside>` : ""}
      <div class="bridge-status-grid">
        <article><span>Local state</span><strong>${status.dirty ? "Pending checkpoint" : "Checkpointed"}</strong><small>${escapeHtml(status.deviceLabel ?? bridgeDeviceLabel())}</small></article>
        <article><span>Last workspace push</span><strong>${status.lastPushedAt ? escapeHtml(formatDate(status.lastPushedAt)) : "This session: not yet"}</strong><small>${escapeHtml(status.config.branch)}</small></article>
        <article><span>Last remote writer</span><strong>${escapeHtml(status.lastRemoteActor ?? "Waiting for remote work")}</strong><small>${status.lastRemoteUpdatedAt ? escapeHtml(formatDate(status.lastRemoteUpdatedAt)) : "No newer checkpoint seen"}</small></article>
        <article><span>Token storage</span><strong>${saved?.rememberToken ? "Remembered here" : "This tab session"}</strong><small>Never committed</small></article>
      </div>
      <div class="bridge-toolbar"><button class="button button-primary" data-action="bridge-push" ${bridgeNeedsChoice ? "disabled" : ""}>Sync now</button><button class="button button-outline" data-action="bridge-pull-agent" ${bridgeNeedsChoice ? "disabled" : ""}>Check agent updates</button><button class="button button-outline" data-action="manage-workspace-storage">Manage GitHub storage</button><a class="button button-outline" href="./agent-bridge.html" target="_blank" rel="noopener">Open Agent Bridge ↗</a><a class="quiet-button" href="./bridge-guide.html" target="_blank" rel="noopener">Setup guide ↗</a><button class="quiet-button danger-link" data-action="bridge-disconnect">Disconnect</button></div>
      <p class="bridge-form-note"><strong>Remote-session flow:</strong> keep the Agent Bridge open in the paired computer’s Codex browser, then start or guide that task from ChatGPT Remote on your phone.</p>
    </section>`;
}

function renderWorkspaceStorageManager(snapshot) {
  const connected = githubSyncSnapshot.connected;
  const repository = connected && githubSyncSnapshot.config
    ? `${githubSyncSnapshot.config.owner}/${githubSyncSnapshot.config.repo}`
    : null;
  const deletionDisabled = bridgeNeedsChoice ? "disabled" : "";
  return `<details class="content-card workspace-storage-manager" id="workspace-storage-manager">
    <summary><span><span class="eyebrow">Privacy & deletion</span><strong>${connected ? "Manage GitHub storage" : "Manage browser data"}</strong><small>${connected ? `Current checkpoint: ${escapeHtml(repository)}` : "Connect Workspace Storage above to remove its current GitHub files too."}</small></span><b>Open manager</b></summary>
    <div class="workspace-storage-manager-body">
      <div class="storage-manager-notice"><strong>QuickMaths has no undo for deletion.</strong><p>Download a full JSON backup first if you may need this work again. GitHub repository history can retain older checkpoint contents even after current files are replaced or deleted.</p></div>
      <section aria-labelledby="stored-profiles-title"><div class="storage-manager-heading"><div><p class="eyebrow">Stored profiles</p><h2 id="stored-profiles-title">Delete one profile</h2><p>Deletes its progress, attempts, reviews, drafts, map plan, and any curriculum it owns. When GitHub is connected, QuickMaths replaces the current learner checkpoint and discards the stale agent checkpoint.</p></div><span>${snapshot.profiles.length} total</span></div>
        <div class="storage-profile-list">${snapshot.profiles.map((profile) => `<article><span class="storage-profile-avatar" aria-hidden="true">${escapeHtml(profile.displayName.slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(profile.displayName)}</strong><small>${profile.role === "educator" ? "Educator" : "Learner"}${profile.id === snapshot.activeProfile.id ? " · current profile" : ""}</small></div><button class="button button-outline danger-button" type="button" data-action="delete-stored-profile" data-profile-id="${escapeHtml(profile.id)}" ${deletionDisabled}>Delete profile</button></article>`).join("")}</div>
      </section>
      <section class="storage-clear-zone" aria-labelledby="clear-workspace-title"><div><p class="eyebrow">Danger zone</p><h2 id="clear-workspace-title">Clear all QuickMaths data</h2><p>Resets every profile, curriculum, lesson pack, test, review, plan, local draft, and Agent Bridge working copy on this browser while preserving saved connections and tokens.${connected ? " It also deletes learner-state.json and agent-state.json from the current GitHub branch, then keeps Workspace Storage connected." : " No GitHub files can be removed while Workspace Storage is disconnected."}</p></div><button class="button danger-button danger-button-solid" type="button" data-action="clear-all-workspace-data" ${deletionDisabled}>Clear all data</button></section>
      ${bridgeNeedsChoice ? `<p class="form-message" role="alert">Resolve the GitHub checkpoint choice above before deleting synchronized data.</p>` : ""}
    </div>
  </details>`;
}

function renderStagedLessonReview(snapshot) {
  if (!snapshot.stagedLessonPack) return "";
  const staged = snapshot.stagedLessonPack;
  const heading = staged.batchTotal > 1
    ? `Review ${staged.batchIndex} of ${staged.batchTotal}`
    : staged.mode === "override" ? "Native improvement" : "Agent-staged";
  const note = staged.mode === "override"
    ? "Validated and staged by an agent. Installing keeps completed progress, restarts affected unfinished tests, and can be undone from Settings."
    : staged.batchTotal > 1
      ? `An agent prepared an ordered batch. Review and approve this pack separately; ${staged.queueRemaining} remain after it.`
      : "An agent validated this file, but only you can install it.";
  const installLabel = staged.mode === "override"
    ? "Install improvement"
    : staged.batchTotal > 1 ? "Approve & install" : "Install";
  return `<aside class="staged-pack"><span>${heading}</span><div><strong>${escapeHtml(staged.name)}</strong><p>${escapeHtml(staged.subjectName)} · ${staged.skillCount} lesson${staged.skillCount === 1 ? "" : "s"} · ${staged.problemCount} questions · ${escapeHtml(staged.author)}</p><small>${note}</small></div><button class="button button-primary" data-action="install-staged-pack">${installLabel}</button><button class="button button-outline" data-action="discard-staged-pack">${staged.batchTotal > 1 ? "Skip this pack" : "Discard"}</button></aside>`;
}

function renderEducatorSettings(snapshot) {
  const backup = snapshot.backupStatus;
  const workspace = snapshot.activeCurriculum;
  elements.view.innerHTML = `
    <header class="page-head educator-page-head"><div><p class="eyebrow">Educator workspace & data</p><h1>Settings</h1><p>Manage portable backups, GitHub storage, curriculum files, and installed lesson sources.</p></div><div class="page-actions"><a class="button button-outline" href="./QuickMaths-Educator-Guide.pdf" target="_blank" rel="noopener">Educator guide ↗</a><button class="button button-outline" data-action="load-backup">Load backup</button><button class="button button-primary" data-action="save-backup">Save full backup</button></div></header>
    ${renderGitHubBridge(snapshot)}
    <section class="content-card tutor-setup"><div class="card-heading"><div><h2>Agent handoff</h2><p>QuickMaths detects whether this tab can expose WebMCP, keeps migration steps outside the prompt, and starts every role from the unified agent guide.</p></div></div>${agentHandoffMarkup(snapshot, { compact: true })}</section>
    ${renderWorkspaceStorageManager(snapshot)}
    ${renderDepotSourceManager()}
    ${backup.recommended ? `<aside class="backup-recommendation"><span aria-hidden="true">↧</span><div><strong>Portable backup recommended</strong><p>${escapeHtml(backup.reason)}</p></div><button class="button button-primary" data-action="save-backup">Download now</button></aside>` : ""}
    <section class="data-grid educator-data-grid"><article class="content-card"><div class="card-heading"><div><h2>Full educator backup</h2><p>Profiles, curricula, installed packs, map plans, policy, and any learner records in this browser.</p></div></div><div class="data-actions"><button class="button button-primary" data-action="save-backup">Download full JSON backup</button><button class="button button-outline" data-action="load-backup">Restore full backup</button></div></article><article class="content-card"><div class="card-heading"><div><h2>Current curriculum exports</h2><p>Public blueprints omit names, email, and supplemental guidance. Private assignments include them with a privacy warning.</p></div></div><p><strong>${escapeHtml(workspace?.name ?? "No curriculum open")}</strong></p><div class="data-actions"><button class="button button-primary" data-action="export-curriculum" ${workspace ? "" : "disabled"}>Download public blueprint</button><button class="button button-outline" data-action="export-private-assignment" ${workspace ? "" : "disabled"}>Download private assignment</button><button class="button button-outline" data-action="import-curriculum">Import curriculum</button></div></article></section>
    <section class="content-card lesson-packs-card"><div class="card-heading"><div><p class="eyebrow">Shared lesson library</p><h2>Installed lesson packs</h2><p>Installed packs are available to Curriculum designer, where each curriculum enables only what it needs.</p></div><button class="button button-primary" data-action="load-lesson-set">Load lesson file</button></div>${renderStagedLessonReview(snapshot)}<div class="installed-packs">${snapshot.lessonPacks.length ? snapshot.lessonPacks.map((pack) => `<article><span class="pack-mark">${pack.mode === "override" ? "↻" : "＋"}</span><div><strong>${escapeHtml(pack.name)}</strong><p>${escapeHtml(pack.description)}</p><small>${escapeHtml(pack.subjectName)} · ${pack.skillCount} lessons · ${pack.problemCount} questions</small></div><div class="pack-actions"><button class="quiet-button" data-action="export-lesson-set" data-pack-id="${escapeHtml(pack.id)}">Download source</button></div></article>`).join("") : `<div class="empty-state">No additional lesson packs installed. Browse the Depot to assemble a library.</div>`}</div></section>`;
  restoreBridgeFormDraft(document.querySelector("#github-sync-form")?.closest("[data-bridge-form]"));
}

function renderSettings(snapshot) {
  if (snapshot.activeProfile.role === "educator") {
    renderEducatorSettings(snapshot);
    return;
  }
  captureBridgeFormDraft(document.querySelector("[data-bridge-form]"));
  const backup = snapshot.backupStatus;
  const improvementPacks = snapshot.lessonPacks.filter((pack) => pack.mode === "override");
  const addedLessonCount = snapshot.lessonPacks.filter((pack) => pack.mode !== "override").reduce((count, pack) => count + pack.skillCount, 0);
  const lessonPackDetail = [
    addedLessonCount ? `${addedLessonCount} added lesson${addedLessonCount === 1 ? "" : "s"}` : "",
    improvementPacks.length ? `${improvementPacks.length} native improvement${improvementPacks.length === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" · ") || "Built-ins unchanged";
  elements.view.innerHTML = `
    <header class="page-head"><div><p class="eyebrow">Profile preferences & data</p><h1>Settings</h1><p>Choose how this profile moves through the curriculum, replay the guided tour, and manage every save, export, custom lesson, and restore point.</p></div><div class="page-actions"><a class="button button-outline" href="./QuickMaths-Student-Guide.pdf" target="_blank" rel="noopener">Student guide ↗</a><button class="button button-outline" data-action="load-backup">Load backup</button><button class="button button-primary" data-action="save-backup">Save full backup</button></div></header>
    <section class="settings-controls">
      <article class="settings-control-card"><h2>Learning path</h2><p>${snapshot.activeCurriculum ? `Controlled by ${escapeHtml(snapshot.activeCurriculum.name)}. Ask the educator for a revised curriculum file to change it.` : `This setting belongs to ${escapeHtml(snapshot.activeProfile.displayName)} and travels inside full backups.`}</p><div class="settings-mode-grid" role="group" aria-label="Progression mode"><button type="button" data-progression-mode="hard" aria-pressed="${snapshot.progressionMode === "hard"}" ${snapshot.activeCurriculum ? "disabled" : ""}><strong>Hard path</strong><small>Prerequisites must be proven before connected mastery tests unlock.</small></button><button type="button" data-progression-mode="soft" aria-pressed="${snapshot.progressionMode === "soft"}" ${snapshot.activeCurriculum ? "disabled" : ""}><strong>Open path</strong><small>Connections remain guidance, while every lesson and test stays available.</small></button></div></article>
      <article class="settings-control-card settings-tour-action"><div><h2>App tutorial</h2><p>Replay all seven chapters without resetting progress, subjects, lessons, or preferences.</p></div><button class="button button-secondary" type="button" data-action="replay-tutorial">Replay app tour</button></article>
    </section>
    <section class="content-card learner-curriculum-card"><div class="card-heading"><div><p class="eyebrow">Educator curriculum</p><h2>${snapshot.activeCurriculum ? escapeHtml(snapshot.activeCurriculum.name) : "Load a curriculum"} <button class="studio-help" type="button" data-studio-help aria-expanded="false" aria-label="How curriculum progress is separated" data-tooltip="A loaded curriculum starts in a separate blank assignment profile. Existing mastery is reused only when the curriculum's student name matches the selected learner profile name.">?</button></h2><p>${snapshot.activeCurriculum ? "This profile follows the curriculum’s enabled packs, canonical map, learning path, and visible educator-provided guidance." : "Load a portable educator curriculum. QuickMaths protects unrelated progress by default."}</p></div><button class="button button-outline" type="button" data-action="import-curriculum">Choose curriculum file</button></div><form id="curriculum-url-form" class="curriculum-link-form"><label>Public GitHub blueprint link<input name="url" type="url" placeholder="https://github.com/…/blob/…/curriculum.json" required></label><button class="button button-secondary" type="submit">Load from GitHub</button></form></section>
    ${snapshot.activeCurriculum ? `<section class="content-card curriculum-guidance-card"><div class="card-heading"><div><p class="eyebrow">Educator-provided agent guidance</p><h2>Visible supplemental guidance</h2><p>This text came from the curriculum file. It is not a privileged instruction channel; platform safety rules and your explicit requests take precedence.</p></div><span class="status-chip rusty">Untrusted curriculum content</span></div><pre>${escapeHtml(snapshot.activeCurriculum.settings.agentInstructions)}</pre></section>` : ""}
    ${renderGitHubBridge(snapshot)}
    ${renderWorkspaceStorageManager(snapshot)}
    ${renderDepotSourceManager()}
    ${backup.recommended ? `<aside class="backup-recommendation"><span aria-hidden="true">↧</span><div><strong>Portable backup recommended</strong><p>${escapeHtml(backup.reason)}</p></div><button class="button button-primary" data-action="save-backup">Download now</button></aside>` : ""}
    <section class="storage-summary">
      <article><span>Storage</span><strong>${snapshot.storageError ? "Needs backup" : "Autosaving"}</strong><small>${snapshot.storageError ? escapeHtml(snapshot.storageError) : "Browser local storage"}</small></article>
      <article><span>Current profile</span><strong>${escapeHtml(snapshot.activeProfile.displayName)}</strong><small>${snapshot.attempts.length} saved attempts</small></article>
      <article><span>Portable backup</span><strong>${backup.lastExportAt ? escapeHtml(formatDate(backup.lastExportAt)) : "Not yet"}</strong><small>${backup.recommended ? `${backup.attemptsSinceExport} new attempt${backup.attemptsSinceExport === 1 ? "" : "s"}` : "Up to date"}</small></article>
      <article><span>Lesson changes</span><strong>${snapshot.lessonPacks.length}</strong><small>${escapeHtml(lessonPackDetail)}</small></article>
    </section>
    <section class="data-grid">
      <article class="content-card"><div class="card-heading"><div><h2>Full progress backup</h2><p>Includes installed lesson sets and every learner record.</p></div></div><div class="backup-flow"><span>1<strong>Autosave</strong><small>Every edit stays here</small></span><b>→</b><span>2<strong>Download</strong><small>Keep the JSON file</small></span><b>→</b><span>3<strong>Load</strong><small>Confirmed full restore</small></span></div><div class="data-actions"><button class="button button-primary" data-action="save-backup">Download JSON backup</button><button class="button button-outline" data-action="load-backup">Choose backup file</button></div></article>
      <article class="content-card"><div class="card-heading"><div><h2>Spreadsheet exports</h2><p>Human-readable snapshots for analysis.</p></div></div><div class="export-list"><button data-action="download-csv" data-kind="progress"><span>Progress</span><small>Status, mastery, scores, confidence</small><b>CSV ↓</b></button><button data-action="download-csv" data-kind="attempts"><span>Attempts</span><small>Scores, dates, mastery updates</small><b>CSV ↓</b></button><button data-action="download-csv" data-kind="reviews"><span>Reviews</span><small>Verdicts, feedback, next steps</small><b>CSV ↓</b></button></div></article>
    </section>
    <section class="content-card lesson-packs-card">
      <div class="card-heading"><div><p class="eyebrow">Extend or improve the curriculum</p><h2>Lesson sets and native improvements</h2><p>Add validated lessons, or install a reversible improvement over a built-in lesson without losing its ID, map position, or completed learner progress.</p></div><button class="button button-primary" data-action="load-lesson-set">Load lesson file</button></div>
      ${renderStagedLessonReview(snapshot)}
      <div class="lesson-pack-guide"><div><strong>Two ways to build</strong><p>Use Lesson Studio to create a lesson pack or open a native lesson as an editable copy—or give the machine-readable guide to an agent. Educator profiles assemble installed packs into portable curricula.</p></div><button class="button button-primary" data-route="creator">Open Lesson Studio</button><a class="button button-outline" href="./CUSTOM_LESSON_SETS.md" target="_blank" rel="noopener">Agent Lesson Authoring Guide</a></div>
      <div class="installed-packs">
        ${snapshot.lessonPacks.length ? snapshot.lessonPacks.map((pack) => `<article><span class="pack-mark">${pack.mode === "override" ? "↻" : escapeHtml(snapshot.subjects.find((subject) => subject.id === pack.subjectId)?.icon ?? "＋")}</span><div><strong>${escapeHtml(pack.name)}</strong><p>${escapeHtml(pack.description)}</p><small>${pack.mode === "override" ? `Native improvement · ${pack.overridesNativeSkills.map((id) => escapeHtml(id)).join(", ")} · completed progress preserved` : `${escapeHtml(pack.subjectName)} · ${pack.skillCount} lesson${pack.skillCount === 1 ? "" : "s"}`} · ${pack.problemCount} questions · ${escapeHtml(pack.author)} · v${escapeHtml(pack.version)}</small></div><div class="pack-actions"><button class="quiet-button" data-action="export-lesson-set" data-pack-id="${escapeHtml(pack.id)}">Download source</button>${pack.mode === "override" ? `<button class="quiet-button danger-link" data-action="restore-native-lessons" data-pack-id="${escapeHtml(pack.id)}">Restore original</button>` : ""}</div></article>`).join("") : `<div class="empty-state">No lesson sets or improvements installed. Mathematics remains the native curriculum; install Geography and other subjects from the Lesson Depot.</div>`}
      </div>
      <p class="pack-security-note"><strong>Teacher-file warning:</strong> lesson-set JSON contains answer keys and solutions. Don’t paste the raw file into a learner tutoring conversation.</p>
    </section>
    <section class="content-card tutor-setup"><div class="card-heading"><div><h2>Agent handoff</h2><p>QuickMaths detects whether this tab can expose WebMCP, keeps migration steps outside the prompt, and starts the agent from the correct manifest.</p></div></div>${agentHandoffMarkup(snapshot, { compact: true })}</section>
  `;
  restoreBridgeFormDraft(document.querySelector("#github-sync-form")?.closest("[data-bridge-form]"));
}

function renderLessonHubTabs(activeRoute) {
  return `<nav class="lesson-hub-tabs" aria-label="Lesson Depot and Studio"><span>Lessons hub</span><div><button type="button" data-route="depot" aria-current="${activeRoute === "depot" ? "page" : "false"}"><b>◇</b> Browse Depot</button><button type="button" data-route="creator" aria-current="${activeRoute === "creator" ? "page" : "false"}"><b>✎</b> Create in Studio</button></div></nav>`;
}

function communityConnection() {
  return githubCommunity?.snapshot?.() ?? { configured: false, connected: false, remembered: false, viewer: null };
}

function formatCommunityDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function renderCommunityComment(comment) {
  const body = escapeHtml(comment.body).replaceAll("\n", "<br>");
  return `<article class="community-comment"><div class="community-comment-avatar" aria-hidden="true">${escapeHtml(comment.author.slice(0, 1).toUpperCase() || "?")}</div><div><header><strong>${escapeHtml(comment.author)}</strong>${comment.viewerDidAuthor ? "<span>You</span>" : ""}<time datetime="${escapeHtml(comment.createdAt)}">${escapeHtml(formatCommunityDate(comment.createdAt))}</time></header><p>${body}</p><a href="${escapeHtml(comment.url)}" target="_blank" rel="noopener">View on GitHub ↗</a></div></article>`;
}

function renderDepotCommunityPanel() {
  const pack = communityUi.activePack;
  if (!pack) return "";
  const connection = communityConnection();
  const external = `<a class="button button-outline" href="${escapeHtml(pack.discussionUrl)}" target="_blank" rel="noopener">Open on GitHub ↗</a>`;
  let content = "";
  if (!connection.configured) {
    content = `<div class="community-connect-copy"><p class="eyebrow">GitHub Discussions</p><h2>Vote and discuss this lesson.</h2><p>In-app participation is being connected. The complete discussion remains available on GitHub.</p><div>${external}</div></div>`;
  } else if (!connection.connected) {
    content = `<div class="community-connect-copy"><p class="eyebrow">One-time connection</p><h2>Join the discussion without leaving QuickMaths.</h2><p>GitHub will ask you to authorize the QuickMaths Community App. It can participate only in this repository’s Discussions—it cannot read learner progress, alter lessons, or access the separate storage bridge.</p>${communityUi.connectionError ? `<p class="community-error" role="alert">${escapeHtml(communityUi.connectionError)}</p>` : ""}<label class="community-remember"><input id="community-remember" type="checkbox"><span><strong>Keep me connected on this device</strong><small>Otherwise the authorization lasts only in this browser tab.</small></span></label><div><button class="button button-primary" type="button" data-depot-action="community-connect">Authorize with GitHub</button>${external}</div></div>`;
  } else if (communityUi.phase === "loading") {
    content = `<div class="community-loading"><span class="depot-spinner" aria-hidden="true"></span><strong>Loading the live discussion…</strong><small>Signed in as ${escapeHtml(connection.viewer?.login ?? "a GitHub user")}</small></div>`;
  } else if (communityUi.phase === "error") {
    content = `<div class="community-connect-copy"><p class="eyebrow">Discussion unavailable</p><h2>GitHub did not return this conversation.</h2><p class="community-error" role="alert">${escapeHtml(communityUi.error)}</p><div><button class="button button-primary" type="button" data-depot-action="community-refresh">Try again</button>${external}</div></div>`;
  } else if (communityUi.discussion) {
    const discussion = communityUi.discussion;
    content = `<div class="community-discussion-heading"><div><p class="eyebrow">Live GitHub Discussion</p><h2>${escapeHtml(discussion.title || pack.name)}</h2><p>Participating as <strong>${escapeHtml(connection.viewer?.login ?? "GitHub user")}</strong>. Recommend useful work, flag serious correctness, licensing, or safety concerns, and explain flags in a public comment.</p></div><div class="community-reaction-actions"><button class="community-vote-button" type="button" data-depot-action="community-vote" aria-pressed="${discussion.viewerHasVoted}" ${communityUi.busy ? "disabled" : ""}><span>👍</span><strong>${discussion.viewerHasVoted ? "Upvoted" : "Upvote"}</strong><small>${discussion.votes} vote${discussion.votes === 1 ? "" : "s"}</small></button><button class="community-flag-button" type="button" data-depot-action="community-flag" aria-pressed="${discussion.viewerHasFlagged}" ${communityUi.busy ? "disabled" : ""}><span>⚑</span><strong>${discussion.viewerHasFlagged ? "Flagged" : "Flag concern"}</strong><small>${discussion.flags} flag${discussion.flags === 1 ? "" : "s"}</small></button></div></div><div class="community-comments"><div class="community-comments-heading"><strong>${discussion.commentCount} comment${discussion.commentCount === 1 ? "" : "s"}</strong><a href="${escapeHtml(discussion.url)}" target="_blank" rel="noopener">Full thread ↗</a></div>${discussion.comments.length ? discussion.comments.map(renderCommunityComment).join("") : `<div class="community-empty">No comments yet. Start the conversation.</div>`}</div><form id="community-comment-form" class="community-comment-form"><label for="community-comment-body">Add a public comment</label><textarea id="community-comment-body" name="body" maxlength="10000" rows="4" placeholder="Question, correction, teaching note, review, or reason for a flag…" required>${escapeHtml(communityUi.commentDraft)}</textarea><div><small>Your GitHub username and comment will be public.</small><button class="button button-primary" type="submit" ${communityUi.busy ? "disabled" : ""}>${communityUi.busy ? "Sending…" : "Post comment"}</button></div></form>`;
  }
  return `<aside class="depot-community-panel" id="depot-community-panel"><header><div><span>Community</span><strong>${escapeHtml(pack.name)}</strong></div><button class="quiet-button" type="button" data-depot-action="community-close" aria-label="Close lesson discussion">Close ×</button></header>${content}<footer><span>Community authorization is separate from Workspace Storage.</span>${connection.connected ? `<button class="quiet-button danger-link" type="button" data-depot-action="community-disconnect">Disconnect GitHub</button>` : ""}</footer></aside>`;
}

function rerenderDepotCommunity() {
  if (currentSnapshot?.activeProfile && currentSnapshot.ui.route === "depot") renderLessonDepot(store.snapshot());
}

async function loadDepotDiscussion() {
  if (!githubCommunity?.configured || !communityUi.activePack) return;
  communityUi.phase = "loading"; communityUi.error = ""; communityUi.discussion = null; rerenderDepotCommunity();
  try {
    communityUi.discussion = await githubCommunity.loadDiscussion(communityUi.activePack.discussionUrl);
    communityUi.phase = "ready";
  } catch (error) {
    communityUi.phase = "error";
    communityUi.error = error instanceof Error ? error.message : String(error);
  }
  rerenderDepotCommunity();
  document.querySelector("#depot-community-panel")?.scrollIntoView({ block: "start", behavior: "smooth" });
}

async function openDepotCommunity(packId, packVersion) {
  const pack = lessonDepot?.snapshot().catalog?.packages.find((item) => item.id === packId && item.version === packVersion);
  if (!pack) throw new Error("Lesson package discussion was not found.");
  communityUi.activePack = pack; communityUi.discussion = null; communityUi.commentDraft = ""; communityUi.error = ""; communityUi.phase = "idle";
  rerenderDepotCommunity();
  if (communityConnection().connected) await loadDepotDiscussion();
  else document.querySelector("#depot-community-panel")?.scrollIntoView({ block: "start", behavior: "smooth" });
}

function depotTrustLabel(pack) {
  return ({
    official: "Official",
    recommended: "Community recommended",
    new: "New",
    subscribed: "Subscribed",
    contested: "Contested",
    preview: "Concept",
  }[pack?.trust] ?? "New");
}

function renderDepotSourceManager() {
  const depot = lessonDepot?.snapshot() ?? { sources: [], warnings: [], showContested: false };
  const sources = depot.sources ?? [];
  const subscribed = sources.filter((source) => source.subscription);
  const federated = sources.filter((source) => !source.subscription && source.trust !== "official");
  return `<details class="content-card depot-source-manager" id="depot-source-manager">
    <summary><span><span class="eyebrow">Advanced lesson discovery</span><strong>Manage lesson sources</strong><small>${sources.filter((source) => source.available).length} active source${sources.filter((source) => source.available).length === 1 ? "" : "s"} · official, community, and direct subscriptions</small></span><b>Open manager</b></summary>
    <div class="depot-source-manager-body">
      <div class="storage-manager-notice"><strong>Federated, locally verified</strong><p>Authors can keep lessons in their own public GitHub repositories. QuickMaths verifies the exact SHA-256 file, validates its complete graph, and still asks before installation.</p></div>
      <form id="depot-registry-form" class="curriculum-link-form"><label>Public registry file<input name="url" type="url" placeholder="https://github.com/author/repo/blob/commit/quickmaths-registry.json" required></label><button class="button button-secondary" type="submit">Add registry</button></form>
      <div class="depot-source-list">
        ${sources.map((source) => `<article class="${source.available ? "" : "is-error"}"><div><strong>${escapeHtml(source.name)}</strong><small>${source.trust === "official" ? "Built-in official catalog" : source.subscription ? "Direct subscription on this device" : `${depotTrustLabel(source)} community registry`} · ${source.packageCount ?? 0} package${source.packageCount === 1 ? "" : "s"}</small>${source.error ? `<p>${escapeHtml(source.error)}</p>` : ""}</div>${source.subscription ? `<button class="quiet-button danger-link" type="button" data-depot-source-action="remove" data-source-id="${escapeHtml(source.id)}">Remove</button>` : ""}</article>`).join("") || `<div class="empty-state">The official catalog will appear after the Depot has loaded.</div>`}
      </div>
      <label class="community-remember"><input id="depot-show-contested" type="checkbox" ${depot.showContested ? "checked" : ""}><span><strong>Show community-contested packages</strong><small>They remain hidden from normal search but are never silently erased.</small></span></label>
      ${depot.warnings?.length ? `<div class="depot-source-warnings"><strong>${depot.warnings.length} source warning${depot.warnings.length === 1 ? "" : "s"}</strong>${depot.warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>` : ""}
      ${federated.length ? `<p class="pack-security-note"><strong>Community federation:</strong> ${federated.length} public registr${federated.length === 1 ? "y is" : "ies are"} being merged automatically.</p>` : ""}
      ${subscribed.length ? `<p class="pack-security-note">Direct subscriptions are browser preferences and do not grant their authors access to your progress or storage.</p>` : ""}
    </div>
  </details>`;
}

function renderLessonDepot(snapshot) {
  const depot = lessonDepot?.snapshot() ?? { phase: "loading", catalog: null, error: "", query: "", sort: "popular", subject: "all", preview: null, installingId: "" };
  const packages = filterDepotPackages(depot.catalog?.packages ?? [], depot);
  const subjects = [...new Map((depot.catalog?.packages ?? []).map((pack) => [pack.subjectId, pack.subjectName])).entries()];
  const installedById = new Map(snapshot.lessonPacks.map((pack) => [pack.id, pack]));
  const preview = depot.preview;
  const connection = communityConnection();
  elements.view.innerHTML = `
    ${renderLessonHubTabs("depot")}
    <header class="page-head depot-head"><div><p class="eyebrow">Free · open · federated</p><h1>Lesson Depot</h1><p>Install lessons published from independent community repositories alongside the official catalog. Every exact download is hash-checked and run through the same local validator before you can install it.</p></div><div class="page-actions">${connection.configured ? `<button class="button ${connection.connected ? "button-secondary" : "button-outline"}" type="button" data-depot-action="community-connect">${connection.connected ? `GitHub · ${escapeHtml(connection.viewer?.login ?? "connected")}` : "Connect GitHub"}</button>` : `<a class="button button-outline" href="${DEPOT_DISCUSSIONS_URL}" target="_blank" rel="noopener">Community ↗</a>`}<a class="button button-primary" href="${DEPOT_SUBMISSION_URL}" target="_blank" rel="noopener">Submit a lesson ↗</a></div></header>
    ${renderDepotCommunityPanel()}
    <section class="depot-trust-strip" aria-label="Lesson Depot safety model"><span><b>1</b><strong>Authors publish</strong><small>Their own GitHub repository</small></span><i>→</i><span><b>2</b><strong>Community reviews</strong><small>Recommend, flag, discuss</small></span><i>→</i><span><b>3</b><strong>QuickMaths verifies</strong><small>Hash, schema, full graph</small></span><i>→</i><span><b>4</b><strong>You approve</strong><small>Local installation only</small></span></section>
    ${preview ? `<aside class="depot-preview"><div><p class="eyebrow">Validated preview · ${escapeHtml(depotTrustLabel(preview.pack))}</p><h2>${escapeHtml(preview.pack.name)}</h2><p>${escapeHtml(preview.pack.description)}</p><div class="depot-preview-facts"><span>${preview.preview.skillCount}<small>Lessons</small></span><span>${preview.preview.problemCount}<small>Questions</small></span><span>${escapeHtml(preview.preview.subjectName)}<small>Subject</small></span><span>${escapeHtml(preview.pack.sourceName)}<small>Source</small></span></div></div><button class="button button-primary" data-depot-action="install" data-pack-id="${escapeHtml(preview.pack.id)}" data-pack-version="${escapeHtml(preview.pack.version)}">Install this pack</button><button class="quiet-button" data-depot-action="close-preview">Close preview</button></aside>` : ""}
    <section class="depot-toolbar" aria-label="Filter lesson packages">
      <label><span>Search</span><input id="depot-search" type="search" value="${escapeHtml(depot.query)}" placeholder="Percentages, biology, author…"></label>
      <label><span>Subject</span><select id="depot-subject"><option value="all">All subjects</option>${subjects.map(([id, name]) => `<option value="${escapeHtml(id)}" ${depot.subject === id ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>
      <label><span>Sort</span><select id="depot-sort"><option value="popular" ${depot.sort === "popular" ? "selected" : ""}>Most supported</option><option value="newest" ${depot.sort === "newest" ? "selected" : ""}>Newest</option><option value="name" ${depot.sort === "name" ? "selected" : ""}>Name</option></select></label>
      <button class="quiet-button" data-depot-action="reload">Refresh catalog</button>
    </section>
    ${depot.phase === "loading" ? `<section class="depot-state"><span class="depot-spinner" aria-hidden="true"></span><h2>Opening the catalog…</h2><p>The app itself remains fully local-first.</p></section>` : ""}
    ${depot.phase === "error" ? `<section class="depot-state is-error"><span>!</span><h2>The catalog is unavailable</h2><p>${escapeHtml(depot.error)}</p><button class="button button-primary" data-depot-action="reload">Try again</button></section>` : ""}
    ${depot.phase === "ready" ? `<section class="depot-results-heading"><div><p class="eyebrow">Catalog</p><h2>${packages.length} package${packages.length === 1 ? "" : "s"}</h2></div><small>${connection.connected ? "Open a package’s community panel for live recommendations, flags, and comments." : "Community totals are cached from GitHub Discussions. Connect GitHub to participate inside the app."}</small></section><section id="lesson-depot" class="depot-grid">${packages.map((pack) => {
      const installed = installedById.get(pack.id);
      const busy = depot.installingId === pack.id;
      const isPreview = pack.availability === "preview";
      const live = communityUi.activePack?.id === pack.id && communityUi.activePack?.version === pack.version ? communityUi.discussion : null;
      const votes = live?.votes ?? pack.votes;
      const flags = live?.flags ?? pack.flags;
      const comments = live?.commentCount ?? pack.comments;
      const hasDiscussion = /\/discussions\/\d+$/.test(pack.discussionUrl ?? "");
      const communityControl = isPreview
        ? `<button type="button" class="depot-preview-community" disabled><span>◇</span><b>Discussion opens when published</b></button>`
        : connection.configured && hasDiscussion
          ? `<button type="button" data-depot-action="community-open" data-pack-id="${escapeHtml(pack.id)}" data-pack-version="${escapeHtml(pack.version)}" aria-label="Recommend, flag, or discuss ${escapeHtml(pack.name)} inside QuickMaths"><span>👍 ${votes}</span><span>⚑ ${flags}</span><span>◯ ${comments}</span><b>${connection.connected ? "Join discussion" : "Review & discuss"}</b></button>`
          : hasDiscussion
            ? `<a href="${escapeHtml(pack.discussionUrl)}" target="_blank" rel="noopener" aria-label="Recommend, flag, or comment on ${escapeHtml(pack.name)} on GitHub"><span>👍 ${votes}</span><span>⚑ ${flags}</span><span>◯ ${comments}</span><b>Review on GitHub ↗</b></a>`
            : `<button type="button" disabled><span>◇</span><b>Community review pending</b></button>`;
      const actions = isPreview
        ? `<button class="button button-outline" disabled>Concept preview</button><button class="button button-primary" disabled>Coming soon</button>`
        : `<button class="button button-outline" data-depot-action="preview" data-pack-id="${escapeHtml(pack.id)}" data-pack-version="${escapeHtml(pack.version)}" ${installed ? "disabled" : ""}>Preview</button><button class="button button-primary" data-depot-action="install" data-pack-id="${escapeHtml(pack.id)}" data-pack-version="${escapeHtml(pack.version)}" ${installed || busy ? "disabled" : ""}>${installed ? `Installed v${escapeHtml(installed.version)}` : busy ? "Checking…" : "Install"}</button>`;
      const cardTheme = `--depot-paper:${pack.theme.paperLight};--depot-primary:${pack.theme.primary};--depot-primary-alt:${pack.theme.primaryAlt};--depot-tint:${pack.theme.tint};--depot-highlight:${pack.theme.highlight};--depot-accent:${pack.theme.accent}`;
      return `<article class="depot-card${isPreview ? " is-preview" : ""}${pack.trust === "contested" ? " is-contested" : ""}" data-depot-pack-id="${escapeHtml(pack.id)}" style="${escapeHtml(cardTheme)}"><div class="depot-card-top"><span class="depot-subject">${escapeHtml(pack.subjectName)}</span><span class="depot-card-badges"><span class="depot-trust-badge is-${escapeHtml(pack.trust)}">${escapeHtml(depotTrustLabel(pack))}</span><span class="depot-version">${isPreview ? "Concept" : `v${escapeHtml(pack.version)}`}</span></span></div><h2>${escapeHtml(pack.name)}</h2><p>${escapeHtml(pack.description)}</p><div class="depot-tags">${pack.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div><dl><div><dt>Author</dt><dd>${escapeHtml(pack.author)}</dd></div><div><dt>Contents</dt><dd>${isPreview ? "Not authored yet" : `${pack.skills} lessons · ${pack.problems} questions`}</dd></div><div><dt>${isPreview ? "Status" : "Source"}</dt><dd>${escapeHtml(isPreview ? "Roadmap concept" : pack.sourceName)}</dd></div></dl><div class="depot-community">${communityControl}</div><div class="depot-card-actions">${actions}</div></article>`;
    }).join("")}</section>${!packages.length ? `<section class="depot-state"><span>⌕</span><h2>No matching lessons yet</h2><p>Try another search—or publish the lesson you wish existed.</p></section>` : ""}` : ""}
    <section class="depot-contribute"><div><p class="eyebrow">Share what works</p><h2>Create a lesson. Help someone else learn it.</h2><p>Build in Lesson Studio, publish it for community review, or install lessons that other learners and teachers have shared. Every published pack is previewed and checked before it can join your curriculum.</p></div><div><button class="button button-primary" data-route="creator">Open Lesson Studio</button><button class="button button-outline" data-depot-action="copy-publish-prompt">Copy Codex publishing prompt</button><a class="button button-outline" href="${DEPOT_REPOSITORY_URL}/tree/main/docs/lesson-depot" target="_blank" rel="noopener">See how the Depot works ↗</a></div></section>`;
}

function renderActivity(activity) {
  elements.activity.replaceChildren();
  elements.activityEmpty.hidden = activity.length > 0;
  activity.slice(-12).reverse().forEach((entry) => {
    const item = document.createElement("li");
    const time = document.createElement("time");
    const date = new Date(entry.at);
    time.dateTime = Number.isFinite(date.getTime()) ? entry.at : "";
    time.textContent = Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date)
      : "—";
    const detail = document.createElement("span");
    const tool = document.createElement("code");
    tool.textContent = entry.tool;
    const message = document.createElement("small");
    message.textContent = entry.message;
    detail.append(tool, message);
    item.append(time, detail);
    elements.activity.append(item);
  });
}

function syncNavigation(route) {
  document.querySelectorAll("[data-route]").forEach((button) => {
    if (button.tagName !== "BUTTON") return;
    const activeRoute = button.closest(".mobile-nav") && route === "creator" ? "depot" : route;
    button.setAttribute("aria-current", button.dataset.route === activeRoute ? "page" : "false");
  });
}

function renderEducatorWelcome(snapshot) {
  const show = snapshot.activeProfile?.role === "educator" && !snapshot.activeProfile.educatorGuideSeenAt;
  if (!show) {
    elements.educatorWelcome.innerHTML = "";
    return;
  }
  elements.educatorWelcome.innerHTML = `<section class="educator-welcome-backdrop" role="presentation">
    <article class="educator-welcome-dialog" role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="educator-welcome-title" aria-describedby="educator-welcome-copy">
      <div class="educator-welcome-mark" aria-hidden="true">QM</div>
      <p class="eyebrow">Educator setup</p>
      <h1 id="educator-welcome-title">Bring an agent into Curriculum Designer.</h1>
      <p id="educator-welcome-copy">The educator guide explains every control, workflow, safety boundary, file format, and recovery path. Agent support starts from the unified QuickMaths manifest in the ChatGPT or Codex in-app browser.</p>
      <a class="educator-guide-link" href="${escapeHtml(EDUCATOR_GUIDE_URL)}" target="_blank" rel="noopener"><span><small>Complete product documentation</small><strong>Open the educator guide PDF</strong></span><b aria-hidden="true">↗</b></a>
      ${agentHandoffMarkup(snapshot, { compact: true })}
      <button class="button button-primary educator-welcome-ok" type="button" data-action="dismiss-educator-welcome">OK, open Curriculum Designer</button>
    </article>
  </section>`;
  requestAnimationFrame(() => elements.educatorWelcome.querySelector(".educator-welcome-dialog")?.focus({ preventScroll: true }));
}

function render(snapshot) {
  captureBridgeFormDraft();
  const welcomeStorageDetails = document.querySelector("#welcome-storage-details");
  if (welcomeStorageDetails) welcomeStorageOpen = welcomeStorageDetails.open;
  const previousRoute = currentSnapshot?.ui.route;
  currentSnapshot = snapshot;
  elements.loading.hidden = true;
  const signedIn = Boolean(snapshot.activeProfile);
  elements.welcome.hidden = signedIn;
  elements.shell.hidden = !signedIn;
  renderAgentEntry(snapshot);
  renderFreshAgentWelcome(snapshot);
  renderEducatorWelcome(snapshot);
  renderWelcomeSummary(snapshot);
  if (!signedIn) {
    renderProfiles(snapshot);
    renderWelcomeStorageRestore(snapshot);
    if (location.hash !== "#/welcome") history.replaceState(null, "", "#/welcome");
    routeHistoryReady = true;
    return;
  }

  elements.profileName.textContent = snapshot.activeProfile.displayName;
  elements.profileAvatar.textContent = snapshot.activeProfile.displayName.slice(0, 1).toUpperCase();
  const educator = snapshot.activeProfile.role === "educator";
  elements.shell.classList.toggle("is-educator", educator);
  applySubjectTheme(snapshot.activeSubject);
  document.querySelectorAll("[data-progression-mode]").forEach((button) => button.setAttribute("aria-pressed", button.dataset.progressionMode === snapshot.progressionMode ? "true" : "false"));
  const sidebarSubtitle = document.querySelector(".sidebar-brand small");
  if (sidebarSubtitle) sidebarSubtitle.textContent = educator ? "Curriculum workspace" : "Learning workspace";
  document.querySelectorAll("[data-nav-role]").forEach((item) => { item.hidden = item.dataset.navRole !== (educator ? "educator" : "learner"); });
  const dashboardLabel = document.querySelector('[data-route="home"] [data-nav-label]');
  if (dashboardLabel) dashboardLabel.textContent = educator ? "Overview" : "Dashboard";
  document.querySelector(".profile-dashboard-button")?.setAttribute("aria-label", educator ? "Open educator overview" : "Open learner dashboard");
  document.querySelector("#logout-button")?.setAttribute("title", educator ? "Change educator" : "Change learner");
  elements.sessionTime.textContent = formatDuration(snapshot.timers.sessionSeconds);
  elements.profileTime.textContent = formatDuration(snapshot.timers.profileSeconds);
  renderActivity(snapshot.activity);
  syncNavigation(snapshot.ui.route);
  if (snapshot.ui.route === "home") (educator ? renderEducatorDashboard(snapshot) : renderDashboard(snapshot));
  else if (snapshot.ui.route === "tutorial") renderTutorial(snapshot);
  else if (snapshot.ui.route === "map") renderMap(snapshot);
  else if (snapshot.ui.route === "curriculum") renderMap(snapshot, { designer: true });
  else if (snapshot.ui.route === "lesson") renderLesson(snapshot);
  else if (snapshot.ui.route === "test") renderTest(snapshot);
  else if (snapshot.ui.route === "results") renderResults(snapshot);
  else if (snapshot.ui.route === "settings") renderSettings(snapshot);
  else if (snapshot.ui.route === "creator") elements.view.innerHTML = `${renderLessonHubTabs("creator")}${lessonStudio.render(snapshot)}`;
  else if (snapshot.ui.route === "depot") renderLessonDepot(snapshot);
  if (previousRoute && previousRoute !== snapshot.ui.route) window.scrollTo({ top: 0, behavior: "auto" });
  const nextHash = ["map", "lesson", "test", "results"].includes(snapshot.ui.route)
    ? `#/${snapshot.ui.route}/${snapshot.ui.selectedSkillId}`
    : `#/${snapshot.ui.route}`;
  if (location.hash !== nextHash) {
    if (routeHistoryReady && !applyingHistory) history.pushState(null, "", nextHash);
    else history.replaceState(null, "", nextHash);
  }
  routeHistoryReady = true;
}

function applyLocationRoute() {
  if (!store) return;
  const state = store.snapshot();
  const [route, skillId] = location.hash.replace(/^#\/?/, "").split("/");
  if (!state.activeProfile) return;
  if (route === "welcome") {
    applyingHistory = true;
    try { store.logout(); } finally { applyingHistory = false; }
    return;
  }
  if (!["tutorial", "home", "map", "curriculum", "lesson", "test", "results", "settings", "data", "creator", "depot"].includes(route)) return;
  const selectedSkill = skillId && store.skillsById[skillId] ? skillId : null;
  if (state.ui.route === route && (!selectedSkill || state.ui.selectedSkillId === selectedSkill)) return;
  applyingHistory = true;
  try { store.navigate(route, selectedSkill); } finally { applyingHistory = false; }
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function saveBackup() {
  const date = new Date().toISOString().slice(0, 10);
  download(`quickmaths-backup-${date}.json`, store.exportBackup(), "application/json");
  showToast("Backup downloaded.");
}

async function prepareLearnerBridge({ resumed = false } = {}) {
  const remote = await githubSync.inspectRemote();
  const local = store.snapshot();
  const metadata = githubCredentials.loadMetadata?.({ role: "learner" });
  const syncStatus = githubSync.snapshot();
  const remoteMatchesKnown = remote.learner.exists && metadata?.learnerSha === remote.learner.sha;
  const establishedConnection = resumed || typeof metadata?.learnerSha === "string";
  const startupAction = learnerBridgeStartupAction({
    remoteExists: remote.learner.exists,
    localProfileCount: local.profiles.length,
    establishedConnection,
    remoteMatchesKnown,
    localDirty: syncStatus.dirty,
    sameDevice: remote.learner.envelope?.deviceId === syncStatus.deviceId,
    remoteActorKind: remote.learner.envelope?.actorKind,
    localChangedAt: syncStatus.localChangedAt,
    remoteUpdatedAt: remote.learner.envelope?.updatedAt,
  });
  bridgeNeedsChoice = false;
  bridgeChoiceDetails = null;
  closeBridgeSourceChoice();
  if (startupAction === "push-local") {
    await githubSync.pushNow();
    githubSync.start();
  } else if (startupAction === "start") {
    githubSync.start();
  } else if (startupAction === "restore-remote") {
    await githubSync.restoreLearner({ force: true });
    githubSync.start();
  } else if (startupAction === "resume-known") {
    githubSync.start();
    if (githubSync.snapshot().dirty) await githubSync.pushNow();
  } else {
    setBridgeSourceChoice(remote.learner, startupAction === "choose-migration-source" ? "migration" : "device-conflict");
  }
  if (!bridgeNeedsChoice && remote.agent?.exists) {
    try { await githubSync.pullNow(); } catch { /* The status card explains stale agent output. */ }
  }
  if (store.snapshot().ui.route === "settings") renderSettings(store.snapshot());
  return remote;
}

function recoverEstablishedLearnerConflict() {
  if (learnerConflictRecovery || !githubSyncSnapshot.connected) return learnerConflictRecovery;
  githubSync.stop();
  learnerConflictRecovery = (async () => {
    const remote = await githubSync.inspectRemote();
    if (!remote.learner.exists) {
      await githubSync.pushNow({ force: true });
      githubSync.start();
      return;
    }
    const syncStatus = githubSync.snapshot();
    const action = learnerBridgeStartupAction({
      remoteExists: true,
      localProfileCount: store.snapshot().profiles.length,
      establishedConnection: true,
      remoteMatchesKnown: false,
      localDirty: syncStatus.dirty,
      sameDevice: remote.learner.envelope?.deviceId === syncStatus.deviceId,
      remoteActorKind: remote.learner.envelope?.actorKind,
      localChangedAt: syncStatus.localChangedAt,
      remoteUpdatedAt: remote.learner.envelope?.updatedAt,
    });
    if (action === "compare-sources") {
      setBridgeSourceChoice(remote.learner, "device-conflict");
      showToast("QuickMaths paused sync so you can compare this device with GitHub.");
      return;
    }
    bridgeNeedsChoice = false;
    bridgeChoiceDetails = null;
    await githubSync.restoreLearner({ force: true });
    try { await githubSync.pullNow(); } catch { /* A stale agent checkpoint remains safely ignored. */ }
    githubSync.start();
    showToast(remote.learner.envelope?.actorKind === "agent"
      ? "Agent changes were applied to this workspace."
      : "This device fast-forwarded to the current GitHub workspace.");
  })().catch((error) => {
    showToast(error instanceof Error ? error.message : String(error));
  }).finally(() => { learnerConflictRecovery = null; });
  return learnerConflictRecovery;
}

async function resolveBridgeSourceChoice(source) {
  if (!bridgeNeedsChoice || !["remote", "local"].includes(source)) return;
  try {
    if (source === "remote") await githubSync.restoreLearner({ force: true });
    else await githubSync.pushNow({ force: true });
    bridgeNeedsChoice = false;
    bridgeChoiceDetails = null;
    closeBridgeSourceChoice();
    try { await githubSync.pullNow(); } catch { /* A stale agent checkpoint must not undo the chosen learner workspace. */ }
    githubSync.start();
    if (store.snapshot().ui.route === "settings") renderSettings(store.snapshot());
    showToast(source === "remote" ? "GitHub workspace loaded." : "This device is now the shared GitHub workspace.");
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error));
  }
}

async function connectLearnerBridge(form, { restoreOnly = false } = {}) {
  const container = form.closest("[data-bridge-form]") ?? form;
  captureBridgeFormDraft(container);
  const saved = githubCredentials.load({ role: "learner" });
  if (restoreOnly && store.snapshot().profiles.length) {
    throw new Error("This browser already has local profiles. Open one and connect storage from Settings.");
  }
  await githubSync.connect({
    owner: container.querySelector('[name="owner"]')?.value,
    repo: container.querySelector('[name="repo"]')?.value,
    branch: container.querySelector('[name="branch"]')?.value,
    token: String(container.querySelector('[name="token"]')?.value || saved?.token || ""),
    rememberToken: Boolean(container.querySelector('[name="remember"]')?.checked),
  }, { startPolling: false });
  if (restoreOnly) {
    const remote = await githubSync.inspectRemote();
    if (!remote.learner.exists) {
      githubSync.disconnect();
      throw new Error("No learner checkpoint was found in that repository. Check the owner, repository, branch, and token.");
    }
    await githubSync.restoreLearner({ force: true });
    if (!store.snapshot().profiles.length) {
      githubSync.disconnect();
      throw new Error("The GitHub checkpoint does not contain a learner profile.");
    }
    bridgeFormDraft = null;
    if (remote.agent?.exists) {
      try { await githubSync.pullNow(); } catch { /* A stale agent checkpoint must not block learner restoration. */ }
    }
    githubSync.start();
    showToast("Profile loaded from GitHub storage.");
    return;
  }
  await prepareLearnerBridge();
  bridgeFormDraft = null;
  showToast(bridgeNeedsChoice ? "Choose which learner checkpoint to keep." : "QuickMaths Bridge connected.");
}

async function bridgeAction(action) {
  if (!githubSync) return;
  try {
    if (action === "bridge-push") {
      await githubSync.pushNow();
      showToast("Learner checkpoint pushed to GitHub.");
    }
    if (action === "bridge-pull-agent") {
      const result = await githubSync.pullNow();
      showToast(result.updated ? "Agent changes applied." : result.stale ? "Outdated agent changes ignored. Ask the agent to sync again." : "No new agent changes.");
    }
    if (action === "bridge-review-choice") openBridgeSourceChoice({ force: true });
    if (action === "bridge-load-remote") {
      if (!await requestAppConfirmation({
        title: "Load the GitHub workspace?",
        message: "This replaces the complete QuickMaths workspace in this browser. Download a JSON backup first if you need to keep the current browser copy.",
        confirmLabel: "Load GitHub copy",
        destructive: true,
      })) return;
      await resolveBridgeSourceChoice("remote");
    }
    if (action === "bridge-replace-remote") {
      if (!await requestAppConfirmation({
        title: "Use this browser's workspace?",
        message: "This replaces the GitHub learner checkpoint with the complete QuickMaths workspace in this browser. The previous GitHub version remains in repository history.",
        confirmLabel: "Replace GitHub copy",
        destructive: true,
      })) return;
      await resolveBridgeSourceChoice("local");
    }
    if (action === "bridge-disconnect") {
      githubSync.disconnect();
      bridgeNeedsChoice = false;
      bridgeChoiceDetails = null;
      closeBridgeSourceChoice();
      showToast("QuickMaths Bridge disconnected on this device.");
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error));
  }
}

function confirmPermanentDeletion(firstMessage, secondMessage) {
  if (!window.confirm(firstMessage)) return false;
  return window.confirm(secondMessage);
}

function clearAuxiliaryWorkspaceData() {
  for (const key of [
    "quickmaths.agent-bridge.quickmaths.web.v2",
    "quickmaths.agent-bridge.quickmaths.webmcp.challenge.v1",
  ]) {
    try { window.localStorage.removeItem(key); } catch { /* Exact QuickMaths workspace keys only; continue best effort. */ }
  }
}

async function deleteStoredProfile(profileId) {
  const profile = store.snapshot().profiles.find((item) => item.id === profileId);
  if (!profile) throw new Error("Profile not found.");
  const connected = githubSyncSnapshot.connected;
  const ownedCurriculumWarning = profile.role === "educator" ? ", plus every curriculum it owns" : "";
  const first = `Delete the ${profile.role} profile “${profile.displayName}” and all of its progress, tests, reviews, drafts, and map plans${ownedCurriculumWarning}?\n\nThis is not reversible in QuickMaths unless you made a backup.${connected ? " The current GitHub learner checkpoint will be replaced and the stale agent checkpoint deleted. Repository history may still retain older copies." : " Workspace Storage is disconnected, so this removes browser data only."}`;
  if (!confirmPermanentDeletion(first, `Are you absolutely sure you want to permanently delete “${profile.displayName}”?`)) return;
  const result = store.deleteProfile(profile.id);
  if (connected) {
    try {
      await githubSync.pushNow();
      await githubSync.deleteRemoteAgentCheckpoint();
    } catch (error) {
      showToast(`Profile deleted from this browser, but GitHub cleanup needs attention: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
  }
  showToast(`${result.displayName} deleted${connected ? " from this browser and the current GitHub checkpoint" : " from this browser"}.`);
}

async function clearAllWorkspaceData() {
  const connected = githubSyncSnapshot.connected;
  const repository = connected && githubSyncSnapshot.config ? `${githubSyncSnapshot.config.owner}/${githubSyncSnapshot.config.repo}` : null;
  const first = `Clear every QuickMaths profile, curriculum, lesson pack, attempt, review, plan, and local draft from this browser${connected ? `, and delete learner-state.json and agent-state.json from ${repository}` : ""}?\n\nThis is not reversible in QuickMaths unless you made a backup.${connected ? " GitHub commit history may still retain older copies." : " Workspace Storage is disconnected, so remote files will not be changed."}`;
  if (!confirmPermanentDeletion(first, "Are you absolutely sure you want to permanently clear all QuickMaths data?")) return;
  if (connected) await githubSync.clearRemoteWorkspace();
  cancelActivePythonGraders();
  lessonStudio?.clearDraft?.();
  store.clearAllData();
  clearAuxiliaryWorkspaceData();
  if (connected) githubSync.resumeAfterClear();
  bridgeNeedsChoice = false;
  bridgeFormDraft = null;
  pendingLandingCurriculumId = null;
  welcomeStorageOpen = false;
  communityUi.phase = "idle";
  communityUi.activePack = null;
  communityUi.discussion = null;
  communityUi.commentDraft = "";
  communityUi.error = "";
  communityUi.connectionError = "";
  showToast(connected ? "Workspace cleared. Your GitHub storage connection and token were kept." : "Browser workspace cleared. Saved connections were kept; disconnected GitHub files were left untouched.");
}

document.querySelector("#create-profile-form").addEventListener("submit", (event) => {
  event.preventDefault();
  elements.profileError.textContent = "";
  try {
    bridgeFormDraft = null;
    store.createProfile(document.querySelector("#profile-name").value, { curriculumId: pendingLandingCurriculumId });
    pendingLandingCurriculumId = null;
    event.currentTarget.reset();
  } catch (error) {
    elements.profileError.textContent = error instanceof Error ? error.message : String(error);
  }
});

document.querySelector("#create-educator-form").addEventListener("submit", (event) => {
  event.preventDefault();
  elements.educatorError.textContent = "";
  try {
    bridgeFormDraft = null;
    store.createProfile(document.querySelector("#educator-name").value, { role: "educator" });
    event.currentTarget.reset();
  } catch (error) {
    elements.educatorError.textContent = error instanceof Error ? error.message : String(error);
  }
});

document.querySelector("#welcome-student-path").addEventListener("click", () => setWelcomePath("learner"));
document.querySelector("#welcome-educator-path").addEventListener("click", () => setWelcomePath("educator"));

document.querySelector("#create-demo").addEventListener("click", () => {
  store.createProfile("Demo Learner", { demo: true });
});

elements.profiles.addEventListener("click", (event) => {
  const profile = event.target.closest("[data-profile-id]");
  if (profile) {
    store.selectProfile(profile.dataset.profileId);
    if (pendingLandingCurriculumId) {
      store.attachCurriculum(pendingLandingCurriculumId);
      pendingLandingCurriculumId = null;
    }
  }
});
elements.educatorProfiles.addEventListener("click", (event) => {
  const profile = event.target.closest("[data-profile-id]");
  if (profile) store.selectProfile(profile.dataset.profileId);
});

document.querySelector("#logout-button").addEventListener("click", () => store.logout());
document.querySelector("#welcome-load").addEventListener("click", () => elements.backupFile.click());
document.querySelector("#welcome-curriculum-file-button").addEventListener("click", () => elements.curriculumFile.click());

function githubCurriculumRawUrl(value) {
  try { return githubFileRawUrl(value); }
  catch (error) { throw new Error((error instanceof Error ? error.message : String(error)).replace(/file/g, "curriculum")); }
}

async function importCurriculumRaw(raw, { sourceUrl = null } = {}) {
  const preview = store.previewCurriculum(raw);
  const stateBeforeImport = store.snapshot();
  const selectedLearner = stateBeforeImport.activeProfile?.role === "learner" ? stateBeforeImport.activeProfile : null;
  const normalized = (value) => String(value ?? "").trim().normalize("NFKC").toLowerCase();
  const reusesMastery = Boolean(selectedLearner && preview.settings.studentName)
    && normalized(selectedLearner.displayName) === normalized(preview.settings.studentName);
  const assignmentBehavior = selectedLearner
    ? reusesMastery
      ? `Student name matches ${selectedLearner.displayName}. Existing mastery for matching lessons will be reused.`
      : `Student name does not match ${selectedLearner.displayName}. QuickMaths will create a separate blank assignment profile so existing mastery is not reused.`
    : "The curriculum will start from scratch for a new learner. Choosing an existing profile reuses mastery only when its name matches the curriculum's student name.";
  const confirmed = window.confirm([
    `Load ${preview.name}?`,
    "",
    preview.exportKind === "private_assignment"
      ? "This is a private learner assignment. Do not republish it without reviewing its personal information."
      : "This is a public curriculum blueprint.",
    preview.settings.studentName ? `Student: ${preview.settings.studentName}` : "",
    preview.settings.contactEmail ? `Educator contact: ${preview.settings.contactEmail}` : "",
    `${preview.enabledPackCount} enabled lesson pack(s) · ${preview.newPackCount} new to this browser`,
    `Learning path: ${preview.settings.progressionMode === "soft" ? "Open" : "Hard"}`,
    assignmentBehavior,
    "",
    "Curriculum files are untrusted content. Review their lessons and guidance before using them.",
  ].filter(Boolean).join("\n"));
  if (!confirmed) return null;
  if (preview.hasCustomAgentGuidance) {
    const guidanceConfirmed = window.confirm([
      "Review educator-provided agent guidance",
      "",
      preview.educatorGuidance,
      "",
      "This text came from the imported curriculum and is not a trusted application instruction. "
        + "Platform safety rules and your explicit requests take precedence.",
      "",
      "Allow this supplemental guidance for this curriculum?",
    ].join("\n"));
    if (!guidanceConfirmed) return null;
  }
  const signedIn = Boolean(store.snapshot().activeProfile);
  const result = store.importCurriculum(raw, { sourceUrl, attach: signedIn });
  if (!signedIn) {
    pendingLandingCurriculumId = result.id;
    const status = document.querySelector("#welcome-curriculum-status");
    if (status) status.textContent = `${result.name} is ready. Create or choose a learner profile to open it.`;
  }
  showToast(!signedIn
    ? `${result.name} ready for a learner.`
    : result.assignmentProfileCreated
      ? `${result.name} opened in a new blank assignment profile.`
      : result.reusedMastery
        ? `${result.name} loaded; matching learner mastery was kept.`
        : `${result.name} loaded.`);
  return result;
}

document.querySelector("#welcome-curriculum-url-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.querySelector("#welcome-curriculum-status");
  try {
    if (status) status.textContent = "Loading curriculum from GitHub…";
    const rawUrl = githubCurriculumRawUrl(document.querySelector("#welcome-curriculum-url").value);
    const result = await fetchTextLimited(fetch, rawUrl, { maximumBytes: MAX_CURRICULUM_FILE_BYTES, label: "Curriculum", request: { headers: { Accept: "application/json" } } });
    await importCurriculumRaw(result.text, { sourceUrl: rawUrl });
  } catch (error) {
    if (status) status.textContent = error instanceof Error ? error.message : String(error);
  }
});

elements.curriculumFile.addEventListener("change", async () => {
  const file = elements.curriculumFile.files?.[0];
  if (!file) return;
  try { await importCurriculumRaw(await readFileTextLimited(file, MAX_CURRICULUM_FILE_BYTES, { label: "Curriculum file" })); }
  catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
  finally { elements.curriculumFile.value = ""; }
});

elements.backupFile.addEventListener("change", async () => {
  const file = elements.backupFile.files?.[0];
  if (!file) return;
  try {
    const raw = await readFileTextLimited(file, MAX_CURRICULUM_FILE_BYTES, { label: "Backup file" });
    await ensureLegacyGeographyMigration(raw);
    const preview = store.previewBackup(raw);
    const names = preview.profileNames.slice(0, 5).join(", ") + (preview.profileNames.length > 5 ? ", …" : "");
    const lessonSets = preview.lessonPackNames.length ? `\nLesson sets: ${preview.lessonPackNames.join(", ")}` : "\nLesson sets: none";
    const confirmed = window.confirm(
      `Load ${file.name}?\n\nIncoming: ${preview.profileCount} profile(s), ${preview.attemptCount} attempt(s), ${preview.reviewCount} review(s), ${preview.lessonPackCount} custom lesson set(s)\nProfiles: ${names}${lessonSets}\n\nThis replaces everything currently saved in this browser. Download a backup first if you want to keep it.`,
    );
    if (!confirmed) return;
    const result = store.importBackup(raw);
    showToast(`Loaded ${result.profileCount} profile${result.profileCount === 1 ? "" : "s"}.`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error));
  } finally {
    elements.backupFile.value = "";
  }
});

elements.lessonSetFile.addEventListener("change", async () => {
  const file = elements.lessonSetFile.files?.[0];
  if (!file) return;
  try {
    const raw = await readFileTextLimited(file, MAX_LESSON_FILE_BYTES, { label: "Lesson-set file" });
    const preview = store.previewLessonPack(raw);
    const installDetail = preview.mode === "override"
      ? `Native lessons improved: ${preview.overridesNativeSkills.join(", ")}\n\nTheir IDs, map positions, and completed learner progress stay intact. Any unfinished tests for those lessons restart so answers cannot cross between question-bank versions. The original content can be restored later from Settings.`
      : "The set will be added to the mastery map and embedded in future full backups. Download a progress backup first if you want a restore point before changing installed content.";
    const confirmed = window.confirm(
      `Install ${preview.name}?\n\nSubject: ${preview.subjectName}${preview.createsSubject ? " (new subject)" : ""}\n${preview.skillCount} lesson(s) · ${preview.problemCount} questions\nAuthor: ${preview.author}\nVersion: ${preview.version}\n\n${installDetail}`,
    );
    if (!confirmed) return;
    const result = store.importLessonPack(raw);
    showToast(result.mode === "override" ? `${result.name} installed. Completed progress was preserved${result.restartedDraftCount ? `; ${result.restartedDraftCount} unfinished test${result.restartedDraftCount === 1 ? " restarted" : "s restarted"}` : ""}.` : `${result.name} installed. ${result.totalSkillCount} skills are now available.`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error));
  } finally {
    elements.lessonSetFile.value = "";
  }
});

elements.creatorFile.addEventListener("change", async () => {
  const file = elements.creatorFile.files?.[0];
  if (!file) return;
  try {
    if (lessonStudio.loadRaw(await readFileTextLimited(file, MAX_LESSON_FILE_BYTES, { label: "Lesson Studio file" }))) render(store.snapshot());
  } finally { elements.creatorFile.value = ""; }
});

document.addEventListener("click", async (event) => {
  const structuredAction = event.target.closest?.('[data-action="add-rational-candidate"], [data-action="remove-structured-row"]');
  if (structuredAction) {
    event.preventDefault();
    const card = structuredAction.closest(".question-card");
    if (!card) return;
    if (structuredAction.dataset.action === "add-rational-candidate") card.querySelector("[data-rational-candidates]")?.insertAdjacentHTML("beforeend", rationalCandidateRow());
    else structuredAction.closest("[data-rational-candidate]")?.remove();
    const answerField = card.querySelector('[data-response-kind="answer"]:checked') ?? card.querySelector('[data-response-kind="answer"]');
    const workField = card.querySelector('[data-response-kind="work"]');
    store.updateResponse(card.id.replace(/^question-/, ""), { finalAnswer: answerField?.value ?? "", work: workField?.value ?? "", structuredWorkJson: collectStructuredWork(card) });
    return;
  }
  const educatorWelcomeAction = event.target.closest?.("[data-action='dismiss-educator-welcome']");
  if (educatorWelcomeAction) {
    event.preventDefault();
    store.completeEducatorWelcome();
    showToast("Educator setup complete. The guide remains available in your workspace.");
    return;
  }
  const studioHelp = event.target.closest?.("[data-studio-help]");
  const openStudioHelp = document.querySelectorAll?.('[data-studio-help][aria-expanded="true"]') ?? [];
  openStudioHelp.forEach((button) => {
    if (button !== studioHelp) button.setAttribute("aria-expanded", "false");
  });
  if (studioHelp) {
    event.preventDefault();
    studioHelp.setAttribute("aria-expanded", studioHelp.getAttribute("aria-expanded") === "true" ? "false" : "true");
    return;
  }
  const tutorialStep = event.target.closest?.("[data-tutorial-step]");
  if (tutorialStep && currentSnapshot?.ui.route === "tutorial") {
    store.setTutorialStep(Number(tutorialStep.dataset.tutorialStep));
    return;
  }
  const tutorialAction = event.target.closest?.("[data-tutorial-action]");
  if (tutorialAction && currentSnapshot?.ui.route === "tutorial") {
    const action = tutorialAction.dataset.tutorialAction;
    if (action === "next") store.setTutorialStep(currentSnapshot.ui.tutorialStep + 1);
    if (action === "back") store.setTutorialStep(currentSnapshot.ui.tutorialStep - 1);
    if (action === "skip") { store.completeTutorial({ skipped: true }); showToast("Tour skipped. Replay it anytime from Settings."); }
    if (action === "finish") { store.completeTutorial(); showToast("Tour complete. Welcome to QuickMaths."); }
    if (action === "finish-creator") { store.completeTutorial(); store.navigate("creator"); }
    return;
  }
  const creatorAction = event.target.closest?.("[data-creator-action]");
  if (creatorAction && currentSnapshot?.ui.route === "creator") {
    event.preventDefault();
    if (lessonStudio.handleAction(creatorAction)) render(store.snapshot());
    return;
  }
  const depotSourceAction = event.target.closest?.("[data-depot-source-action]");
  if (depotSourceAction) {
    event.preventDefault();
    try {
      if (depotSourceAction.dataset.depotSourceAction === "remove") await lessonDepot.removeRegistry(depotSourceAction.dataset.sourceId);
      render(store.snapshot());
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
    return;
  }
  const depotAction = event.target.closest?.("[data-depot-action]");
  if (depotAction && currentSnapshot?.ui.route === "depot") {
    event.preventDefault();
    const actionName = depotAction.dataset.depotAction;
    try {
      if (actionName === "reload") await lessonDepot.load({ force: true });
      if (actionName === "preview") await lessonDepot.previewPack(depotAction.dataset.packId, depotAction.dataset.packVersion);
      if (actionName === "install") await lessonDepot.installPack(depotAction.dataset.packId, depotAction.dataset.packVersion);
      if (actionName === "close-preview") lessonDepot.closePreview();
      if (actionName === "community-open") await openDepotCommunity(depotAction.dataset.packId, depotAction.dataset.packVersion);
      if (actionName === "community-close") {
        communityUi.activePack = null; communityUi.discussion = null; communityUi.commentDraft = ""; communityUi.error = ""; communityUi.phase = "idle";
        rerenderDepotCommunity();
      }
      if (actionName === "community-connect") {
        if (!githubCommunity?.configured) throw new Error("In-app GitHub community access is not configured yet.");
        const authorizationUrl = await githubCommunity.beginAuthorization({ remember: document.querySelector("#community-remember")?.checked === true });
        window.location.assign(authorizationUrl);
      }
      if (actionName === "community-refresh") await loadDepotDiscussion();
      if (actionName === "community-vote" && communityUi.discussion && !communityUi.busy) {
        communityUi.busy = true; rerenderDepotCommunity();
        try {
          const vote = await githubCommunity.setVote(communityUi.discussion.id, !communityUi.discussion.viewerHasVoted);
          communityUi.discussion = { ...communityUi.discussion, ...vote };
          showToast(vote.viewerHasVoted ? "Lesson upvote saved on GitHub." : "GitHub upvote removed.");
        } finally { communityUi.busy = false; rerenderDepotCommunity(); }
      }
      if (actionName === "community-flag" && communityUi.discussion && !communityUi.busy) {
        communityUi.busy = true; rerenderDepotCommunity();
        try {
          const flag = await githubCommunity.setFlag(communityUi.discussion.id, !communityUi.discussion.viewerHasFlagged);
          communityUi.discussion = { ...communityUi.discussion, ...flag };
          showToast(flag.viewerHasFlagged ? "Concern flagged. Add a comment explaining it." : "GitHub flag removed.");
        } finally { communityUi.busy = false; rerenderDepotCommunity(); }
      }
      if (actionName === "community-disconnect") {
        githubCommunity?.disconnect();
        communityUi.phase = "idle"; communityUi.discussion = null; communityUi.error = ""; communityUi.connectionError = "";
        rerenderDepotCommunity();
        showToast("GitHub community disconnected on this device.");
      }
      if (actionName === "copy-publish-prompt") {
        await navigator.clipboard.writeText(buildDepotSubmissionPrompt());
        showToast("Depot publishing prompt copied.");
      }
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
    return;
  }
  const modeButton = event.target.closest?.("[data-progression-mode]");
  if (modeButton && currentSnapshot?.activeProfile) {
    if (currentSnapshot.activeCurriculum) {
      showToast(`This assignment's ${currentSnapshot.progressionMode === "soft" ? "Open" : "Hard"} path was set by its educator.`);
      return;
    }
    store.setLearningPreferences({ progressionMode: modeButton.dataset.progressionMode });
    showToast(modeButton.dataset.progressionMode === "soft" ? "Open path enabled. Connections are now guidance." : "Hard path enabled. Prerequisites lock tests.");
    return;
  }
  const mapNode = event.target.closest?.("[data-map-skill]");
  if (mapNode && !currentSnapshot?.ui.mapPlanMode) store.selectMapSkill(mapNode.dataset.mapSkill);
  const routeButton = event.target.closest("[data-route]");
  if (routeButton && currentSnapshot?.activeProfile) {
    const route = routeButton.dataset.route;
    const skillId = routeButton.dataset.skillId || null;
    store.navigate(route, skillId);
  }
  const action = event.target.closest("[data-action]");
  if (!action) return;
  if (action.dataset.action === "manage-workspace-storage") {
    const manager = document.querySelector("#workspace-storage-manager");
    if (manager) {
      manager.open = true;
      manager.scrollIntoView({ behavior: "smooth", block: "start" });
      manager.querySelector("summary")?.focus?.();
    }
    return;
  }
  if (action.dataset.action === "delete-stored-profile") {
    if (bridgeNeedsChoice) { showToast("Resolve the GitHub checkpoint choice before deleting synchronized data."); return; }
    try { await deleteStoredProfile(action.dataset.profileId); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
    return;
  }
  if (action.dataset.action === "clear-all-workspace-data") {
    if (bridgeNeedsChoice) { showToast("Resolve the GitHub checkpoint choice before clearing synchronized data."); return; }
    try { await clearAllWorkspaceData(); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
    return;
  }
  if (action.dataset.action === "run-python-tests") {
    event.preventDefault();
    const questionId = action.dataset.questionId;
    if (!questionId || runningPythonQuestionIds.has(questionId)) return;
    const draft = store.snapshot().activeTest;
    const problem = draft?.problems.find((item) => item.template_id === questionId);
    const response = draft?.responses?.[questionId];
    if (!problem?.program_spec || !response) return;
    if (!response.finalAnswer.trim()) {
      showToast("Write the Python function before running its tests.");
      return;
    }
    runningPythonQuestionIds.add(questionId);
    action.disabled = true;
    action.textContent = "Running…";
    const status = action.closest(".python-response")?.querySelector(".python-sandbox-status strong");
    if (status) status.textContent = "Loading the isolated Python runtime and running tests…";
    try {
      const result = await gradePythonProgram(response.finalAnswer, problem.program_spec);
      store.recordPythonGrade(questionId, response.finalAnswer, result);
      showToast(result.status === "passed" ? `All ${result.total} Python tests passed.` : `${result.passed} of ${result.total} Python tests passed.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    } finally {
      runningPythonQuestionIds.delete(questionId);
      if (store.snapshot().ui.route === "test") render(store.snapshot());
    }
    return;
  }
  if (["map", "curriculum"].includes(currentSnapshot?.ui.route) && (action.dataset.action.startsWith("plan-") || ["toggle-plan-mode", "toggle-plan-view"].includes(action.dataset.action))) {
    const layoutKey = "all-subjects";
    try {
      if (action.dataset.action === "toggle-plan-mode") {
        const enabled = !currentSnapshot.ui.mapPlanMode;
        store.setMapPlanMode(enabled);
        showToast(enabled ? "Plan mode enabled. Your planner autosaves with this profile." : "Plan mode closed. Showing your saved plan in read-only Plan view.");
      }
      if (action.dataset.action === "toggle-plan-view") {
        const result = store.setMapPlanView(!currentSnapshot.ui.mapPlanView);
        showToast(result.enabled ? "Plan view enabled. Node clicks and map navigation remain read-only." : "Showing the untouched canonical mastery map.");
      }
      if (action.dataset.action === "plan-open-annotation") store.setMapPlanComposer("annotation");
      if (action.dataset.action === "plan-open-path") {
        if (currentSnapshot.ui.mapPlanSelection.length < 2) showToast("Select multiple nodes to create a custom path.");
        else store.setMapPlanComposer("path");
      }
      if (action.dataset.action === "plan-open-manage") store.setMapPlanComposer("manage");
      if (action.dataset.action === "plan-close-composer") store.setMapPlanComposer(null);
      if (action.dataset.action === "plan-clear-selection") store.setMapPlanSelection([]);
      if (action.dataset.action === "plan-hide-selected") {
        const hiddenIds = new Set(currentSnapshot.mapPlan.hiddenSkillIds ?? []);
        const targets = currentSnapshot.ui.mapPlanSelection.filter((id) => !hiddenIds.has(id));
        const result = store.setMapPlanNodesHidden(targets, true);
        showToast(`${result.skillIds.length} lesson${result.skillIds.length === 1 ? "" : "s"} hidden from this plan. Use Show hidden nodes to restore ${result.skillIds.length === 1 ? "it" : "them"}.`);
      }
      if (action.dataset.action === "plan-unhide-selected") {
        const hiddenIds = new Set(currentSnapshot.mapPlan.hiddenSkillIds ?? []);
        const targets = currentSnapshot.ui.mapPlanSelection.filter((id) => hiddenIds.has(id));
        const result = store.setMapPlanNodesHidden(targets, false);
        showToast(`${result.skillIds.length} lesson${result.skillIds.length === 1 ? "" : "s"} restored to this plan.`);
      }
      if (action.dataset.action === "plan-toggle-hidden") {
        const result = store.setMapPlanShowHidden(!currentSnapshot.ui.mapPlanShowHidden);
        showToast(result.visible ? "Hidden lessons are visible and can be selected, moved, or restored." : "Hidden lessons are concealed again.");
      }
      if (action.dataset.action === "plan-reset-selected") {
        const result = store.resetMapPlanLayout(layoutKey, currentSnapshot.ui.mapPlanSelection);
        showToast(`${result.reset} selected position${result.reset === 1 ? "" : "s"} reset.`);
      }
      if (action.dataset.action === "plan-reset-layout") {
        if (window.confirm("Reset every moved node in this map layout?\n\nSaved paths and annotations will stay intact.")) {
          const result = store.resetMapPlanLayout(layoutKey);
          showToast(`${result.reset} position${result.reset === 1 ? "" : "s"} reset.`);
        }
      }
      if (action.dataset.action === "plan-select-path") store.selectMapPlanPath(action.dataset.pathId);
      if (action.dataset.action === "plan-delete-path") {
        const path = currentSnapshot.mapPlan.paths.find((item) => item.id === action.dataset.pathId);
        if (path && window.confirm(`Delete ${path.name}?\n\nConnected lesson annotations and moved node positions will stay where they are.`)) {
          store.deleteMapPlanPath(path.id);
          showToast(`${path.name} deleted.`);
        }
      }
      if (action.dataset.action === "plan-delete-annotation") {
        store.deleteMapPlanAnnotation(action.dataset.annotationId);
        showToast("Annotation deleted.");
      }
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
    return;
  }
  if (action.dataset.action.startsWith("bridge-")) {
    bridgeAction(action.dataset.action);
    return;
  }
  if (action.dataset.action === "save-backup") saveBackup();
  if (action.dataset.action === "create-curriculum") {
    const name = window.prompt("Name the new curriculum:", "New curriculum");
    if (name) store.createCurriculum({ name });
  }
  if (action.dataset.action === "import-curriculum") elements.curriculumFile.click();
  if (action.dataset.action === "export-curriculum") {
    try {
      const workspace = store.snapshot().activeCurriculum;
      if (!workspace) return;
      const stem = workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "quickmaths-curriculum";
      download(`${stem}.quickmaths-blueprint.json`, store.exportCurriculum(workspace.id, { kind: "blueprint" }), "application/json");
      showToast("Public curriculum blueprint downloaded.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    }
  }
  if (action.dataset.action === "export-private-assignment") {
    const workspace = store.snapshot().activeCurriculum;
    if (!workspace) return;
    const confirmed = window.confirm("Export a private learner assignment?\n\nThis file may contain a student name, educator contact email, and full educator-provided agent guidance. Deliver it directly or through a private channel. Do not publish it in a public GitHub repository.");
    if (!confirmed) return;
    try {
      const stem = workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "quickmaths-curriculum";
      download(`${stem}.quickmaths-private-assignment.json`, store.exportCurriculum(workspace.id, { kind: "private_assignment" }), "application/json");
      showToast("Private learner assignment downloaded.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    }
  }
  if (["start-suggested", "start-test", "retake"].includes(action.dataset.action)) store.startTest(action.dataset.skillId);
  if (action.dataset.action === "open-attempt") store.openAttempt(action.dataset.attemptId);
  if (action.dataset.action === "load-backup") elements.backupFile.click();
  if (action.dataset.action === "load-lesson-set") elements.lessonSetFile.click();
  if (action.dataset.action === "replay-tutorial") store.startTutorial();
  if (action.dataset.action === "map-zoom-out") changeMapZoom(-MAP_ZOOM_STEP);
  if (action.dataset.action === "map-zoom-in") changeMapZoom(MAP_ZOOM_STEP);
  if (action.dataset.action === "install-staged-pack") {
    const staged = store.snapshot().stagedLessonPack;
    const installNote = staged?.mode === "override"
      ? "This replaces native lesson content while preserving lesson IDs, map positions, and completed learner progress. Unfinished tests for affected lessons restart so answers cannot cross between question-bank versions. You can restore the original here later."
      : "This agent-staged set passed validation, but installation changes your curriculum.";
    if (staged && window.confirm(`Install ${staged.name}?\n\n${staged.skillCount} lessons · ${staged.problemCount} questions · ${staged.subjectName}\n\n${installNote}`)) {
      const result = store.installStagedLessonPack();
      showToast(result.mode === "override" ? `${result.name} installed. Completed progress was preserved${result.restartedDraftCount ? `; ${result.restartedDraftCount} unfinished test${result.restartedDraftCount === 1 ? " restarted" : "s restarted"}` : ""}.` : result.reviewQueueRemaining ? `${result.name} installed. ${result.reviewQueueRemaining} staged pack${result.reviewQueueRemaining === 1 ? " is" : "s are"} ready for review.` : `${result.name} installed.`);
    }
  }
  if (action.dataset.action === "discard-staged-pack") store.discardStagedLessonPack();
  if (action.dataset.action === "restore-native-lessons") {
    const packId = action.dataset.packId;
    const pack = store.snapshot().lessonPacks.find((item) => item.id === packId);
    if (pack && window.confirm(`Restore the original QuickMaths version of ${pack.overridesNativeSkills.join(", ")}?\n\nThe installed improvement will be removed, but every learner's completed progress remains attached to the native lesson. Unfinished tests for the affected lessons restart.`)) {
      const result = store.restoreNativeLessons(packId);
      showToast(`${result.restored.length} native lesson${result.restored.length === 1 ? "" : "s"} restored. Completed progress was preserved${result.restartedDraftCount ? `; ${result.restartedDraftCount} unfinished test${result.restartedDraftCount === 1 ? " restarted" : "s restarted"}` : ""}.`);
    }
  }
  if (action.dataset.action === "export-lesson-set") {
    const packId = action.dataset.packId;
    download(`${packId.toLowerCase().replaceAll("_", "-")}.json`, store.exportLessonPack(packId), "application/json");
    showToast("Lesson-set source downloaded.");
  }
  if (action.dataset.action === "download-csv") {
    const kind = action.dataset.kind;
    download(`quickmaths-${kind}.csv`, store.exportCsv(kind), "text/csv");
    showToast(`${kind[0].toUpperCase()}${kind.slice(1)} CSV downloaded.`);
  }
  if (action.dataset.action === "download-tutor-summary") {
    const attempt = store.getAttempt();
    download(`quickmaths-${attempt.skillId.toLowerCase()}-tutor-summary.md`, store.exportTutorSummary(attempt.attemptId), "text/markdown");
    showToast("Rich tutor summary downloaded.");
  }
  if (action.dataset.action === "download-review-packet") {
    const attempt = store.getAttempt();
    download(`quickmaths-${attempt.skillId.toLowerCase()}-review-packet.md`, store.exportTutorReviewPacket(attempt.attemptId), "text/markdown");
    showToast("Tutor review packet downloaded.");
  }
  if (action.dataset.action === "copy-current-agent-prompt") copyAgentPrompt();
  if (action.dataset.action === "open-storage-setup") {
    store.navigate("settings");
    requestAnimationFrame(() => document.querySelector("#github-bridge")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  if (action.dataset.action === "dismiss-agent-welcome") {
    try { window.localStorage.setItem(AGENT_HANDOFF_NOTICE_KEY, "dismissed"); } catch { /* The notice may return next visit if storage is unavailable. */ }
    elements.agentWelcome.innerHTML = "";
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "depot-show-contested") {
    lessonDepot.setFilters({ showContested: event.target.checked });
    if (currentSnapshot?.ui.route === "settings") renderSettings(store.snapshot());
    return;
  }
  if (event.target.matches?.("[data-plan-path-color]") && ["map", "curriculum"].includes(currentSnapshot?.ui.route)) {
    try {
      store.updateMapPlanPath(event.target.dataset.planPathColor, { color: event.target.value });
      showToast("Path color updated.");
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
    return;
  }
  if (event.target.id === "review-question-select") {
    const option = event.target.selectedOptions?.[0];
    const reviewer = document.querySelector("#review-reviewer-select");
    const selfOption = reviewer?.querySelector('option[value="self"]');
    const allowSelf = option?.dataset.allowSelf === "true";
    if (selfOption) selfOption.disabled = !allowSelf;
    if (!allowSelf && reviewer?.value === "self") reviewer.value = "human_tutor";
    const note = document.querySelector("#review-permission-note");
    if (note) note.textContent = allowSelf ? "This response allows self review." : "This response requires a tutor or connected agent.";
    document.querySelectorAll("[data-review-structure]").forEach((section) => { section.hidden = section.dataset.reviewStructure !== event.target.value; });
    return;
  }
  if (event.target.id === "depot-subject" || event.target.id === "depot-sort") {
    lessonDepot.setFilters({ subject: document.querySelector("#depot-subject")?.value ?? "all", sort: document.querySelector("#depot-sort")?.value ?? "popular" });
    return;
  }
  if (event.target.id === "curriculum-select") {
    store.selectCurriculum(event.target.value);
    return;
  }
  if (event.target.matches?.("[data-curriculum-pack]")) {
    const packId = event.target.dataset.curriculumPack;
    const enabled = event.target.checked;
    try {
      store.setCurriculumPackEnabled(packId, enabled);
    } catch (error) {
      if (!enabled && error?.code === "curriculum_plan_references") {
        const confirmed = window.confirm(`${error.message}\n\nDisable the lesson set and remove those affected plan references? This cannot be undone except by restoring a backup.`);
        if (confirmed) {
          try {
            const result = store.setCurriculumPackEnabled(packId, false, { removePlanReferences: true });
            showToast(`Lesson set disabled; ${result.removedPlanReferences} affected plan reference${result.removedPlanReferences === 1 ? "" : "s"} removed.`);
          } catch (retryError) {
            event.target.checked = true;
            showToast(retryError instanceof Error ? retryError.message : String(retryError));
          }
        } else event.target.checked = true;
      } else {
        event.target.checked = !enabled;
        showToast(error instanceof Error ? error.message : String(error));
      }
    }
    return;
  }
  if (event.target.matches?.("[data-curriculum-native]")) {
    const enabled = event.target.checked;
    try {
      store.setCurriculumNativeLessonsEnabled(enabled);
    } catch (error) {
      if (!enabled && error?.code === "curriculum_plan_references") {
        const confirmed = window.confirm(`${error.message}\n\nExclude native Mathematics and remove those affected plan references? This cannot be undone except by restoring a backup.`);
        if (confirmed) {
          try {
            const result = store.setCurriculumNativeLessonsEnabled(false, { removePlanReferences: true });
            showToast(`Native Mathematics excluded; ${result.removedPlanReferences} affected plan reference${result.removedPlanReferences === 1 ? "" : "s"} removed.`);
          } catch (retryError) {
            event.target.checked = true;
            showToast(retryError instanceof Error ? retryError.message : String(retryError));
          }
        } else event.target.checked = true;
      } else {
        event.target.checked = !enabled;
        showToast(error instanceof Error ? error.message : String(error));
      }
    }
    return;
  }
  if (currentSnapshot?.ui.route === "creator" && (event.target.matches?.("[data-creator-field]") || event.target.matches?.("[data-creator-prerequisites]"))) {
    lessonStudio.handleInput(event.target);
    render(store.snapshot());
    return;
  }
  if (event.target.id === "lesson-select") store.navigate("lesson", event.target.value);
  if (event.target.id === "map-skill-select") store.selectMapSkill(event.target.value);
  if (event.target.id === "test-skill-select") store.navigate("test", event.target.value);
});

document.addEventListener("input", (event) => {
  if (event.target.matches?.('#map-plan-path-form input[type="color"]')) {
    const output = event.target.closest("label")?.querySelector("output");
    if (output) output.textContent = event.target.value;
    return;
  }
  const bridgeForm = event.target.closest?.("[data-bridge-form]");
  if (bridgeForm) {
    captureBridgeFormDraft(bridgeForm);
    return;
  }
  if (event.target.id === "community-comment-body") {
    communityUi.commentDraft = event.target.value;
    return;
  }
  if (event.target.id === "depot-search") {
    const value = event.target.value;
    const caret = event.target.selectionStart;
    lessonDepot.setFilters({ query: value }, { notify: false });
    window.clearTimeout(depotSearchTimer);
    depotSearchTimer = window.setTimeout(() => {
      if (currentSnapshot?.ui.route !== "depot") return;
      renderLessonDepot(store.snapshot());
      const input = document.querySelector("#depot-search");
      input?.focus();
      if (Number.isInteger(caret)) input?.setSelectionRange(caret, caret);
    }, 90);
    return;
  }
  if (currentSnapshot?.ui.route === "creator" && event.target.matches?.("[data-creator-field]")) {
    if (lessonStudio.handleInput(event.target)) render(store.snapshot());
    return;
  }
  if (event.target.id === "reflection-confidence") {
    const output = document.querySelector("#confidence-output");
    if (output) output.textContent = `${event.target.value} / 5`;
  }
  const responseInput = event.target.closest?.("[data-question-id][data-response-kind]");
  const card = responseInput?.closest(".question-card") ?? event.target.closest?.(".question-card");
  if (!card || (!responseInput && !event.target.matches?.("[data-structured-field], [data-candidate-field], [data-critical-field], [data-interval-field], [data-endpoint-field], [data-trace-field]"))) return;
  if (event.target.matches?.('[data-critical-field="value"]')) syncSignChartLayout(card);
  const questionId = responseInput?.dataset.questionId ?? card.id.replace(/^question-/, "");
  const answerField = card.querySelector('[data-response-kind="answer"]:checked') ?? card.querySelector('[data-response-kind="answer"]');
  const workField = card.querySelector('[data-response-kind="work"]');
  store.updateResponse(questionId, { finalAnswer: answerField?.value ?? "", work: workField?.value ?? "", structuredWorkJson: collectStructuredWork(card) });
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "depot-registry-form") {
    event.preventDefault();
    const form = event.target;
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    lessonDepot.addRegistry(new FormData(form).get("url"))
      .then(() => { form.reset(); render(store.snapshot()); })
      .catch((error) => showToast(error instanceof Error ? error.message : String(error)))
      .finally(() => { if (submit?.isConnected) submit.disabled = false; });
    return;
  }
  if (event.target.id === "curriculum-url-form") {
    event.preventDefault();
    const submit = event.target.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const rawUrl = githubCurriculumRawUrl(new FormData(event.target).get("url"));
      fetchTextLimited(fetch, rawUrl, { maximumBytes: MAX_CURRICULUM_FILE_BYTES, label: "Curriculum", request: { headers: { Accept: "application/json" } } })
        .then((result) => importCurriculumRaw(result.text, { sourceUrl: rawUrl }))
        .catch((error) => showToast(error instanceof Error ? error.message : String(error)))
        .finally(() => { if (submit?.isConnected) submit.disabled = false; });
    } catch (error) {
      if (submit) submit.disabled = false;
      showToast(error instanceof Error ? error.message : String(error));
    }
    return;
  }
  if (event.target.id === "create-curriculum-form") {
    event.preventDefault();
    const data = new FormData(event.target);
    try { store.createCurriculum({ name: data.get("name") }); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
    return;
  }
  if (event.target.id === "curriculum-identity-form") {
    event.preventDefault();
    const data = new FormData(event.target);
    try {
      store.updateCurriculum({ name: data.get("name"), description: data.get("description") });
      showToast("Curriculum profile saved.");
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
    return;
  }
  if (event.target.id === "curriculum-settings-form") {
    event.preventDefault();
    const data = new FormData(event.target);
    try {
      store.updateCurriculumSettings({
        studentName: data.get("studentName"),
        contactEmail: data.get("contactEmail"),
        progressionMode: data.get("progressionMode"),
        agentEnabled: data.get("agentEnabled") === "on",
        agentInstructions: data.get("agentInstructions"),
      });
      showToast("Learner and agent policy saved.");
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
    return;
  }
  if (event.target.id === "map-plan-path-form") {
    event.preventDefault();
    const data = new FormData(event.target);
    try {
      const path = store.createMapPlanPath({
        name: data.get("name"),
        color: data.get("color"),
        skillIds: currentSnapshot.ui.mapPlanSelection,
      });
      store.setMapPlanComposer(null);
      showToast(`${path.name} created with ${path.skillIds.length} lessons.`);
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
    return;
  }
  if (event.target.id === "map-plan-annotation-form") {
    event.preventDefault();
    const data = new FormData(event.target);
    const selectedSkillIds = [...currentSnapshot.ui.mapPlanSelection];
    const layoutKey = "all-subjects";
    try {
      store.addMapPlanAnnotation({
        body: data.get("body"),
        skillIds: selectedSkillIds,
        layoutKey,
        position: mapAnnotationInsertPosition(selectedSkillIds),
      });
      store.setMapPlanComposer(null);
      showToast(selectedSkillIds.length ? "Connected comment added to the selected lessons." : "Free comment node added to the map.");
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
    return;
  }
  if (event.target.id === "community-comment-form") {
    event.preventDefault();
    if (!communityUi.discussion || communityUi.busy) return;
    const form = event.target;
    const body = new FormData(form).get("body");
    communityUi.commentDraft = String(body ?? "");
    communityUi.busy = true; rerenderDepotCommunity();
    githubCommunity.addComment(communityUi.discussion.id, body).then((comment) => {
      communityUi.discussion = {
        ...communityUi.discussion,
        commentCount: communityUi.discussion.commentCount + 1,
        comments: [...communityUi.discussion.comments, comment].slice(-50),
      };
      communityUi.commentDraft = "";
      showToast("Comment posted to GitHub Discussions.");
    }).catch((error) => {
      showToast(error instanceof Error ? error.message : String(error));
    }).finally(() => { communityUi.busy = false; rerenderDepotCommunity(); });
    return;
  }
  if (event.target.id === "github-sync-form") {
    event.preventDefault();
    connectLearnerBridge(event.target).catch((error) => {
      showToast(error instanceof Error ? error.message : String(error));
    });
    return;
  }
  if (event.target.id === "welcome-github-sync-form") {
    event.preventDefault();
    const submit = event.target.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    connectLearnerBridge(event.target, { restoreOnly: true }).catch((error) => {
      showToast(error instanceof Error ? error.message : String(error));
      const message = document.querySelector("#welcome-github-sync-form .form-message");
      if (message) message.textContent = error instanceof Error ? error.message : String(error);
    }).finally(() => { if (submit?.isConnected) submit.disabled = false; });
    return;
  }
  if (event.target.id === "test-form") {
    event.preventDefault();
    const result = store.submitTest();
    if (!result.ok) {
      const error = document.querySelector("#test-error");
      if (error) error.textContent = result.workIssues?.map((issue) => `Question ${store.snapshot().activeTest.problems.findIndex((problem) => problem.template_id === issue.questionId) + 1}: ${issue.message}`).join(" ")
        || `Complete the required work for ${result.missingWork.length} question${result.missingWork.length === 1 ? "" : "s"} before submitting.`;
    }
  }
  if (event.target.id === "reflection-form") {
    event.preventDefault();
    const data = new FormData(event.target);
    store.saveReflection({
      confidenceRating: Number(data.get("confidence")), difficultyFelt: data.get("difficulty"), hintsUsed: data.get("hints"),
      guessed: data.get("guessed"), wantsMorePractice: data.get("more"), confusingParts: data.get("confusing"), notes: data.get("notes"),
    });
    showToast("Result saved and mastery map updated.");
  }
  if (event.target.id === "self-review-form") {
    event.preventDefault();
    const data = new FormData(event.target);
    const attempt = store.getAttempt();
    const reviewed = attempt?.results?.find((result) => result.questionId === data.get("question")) ?? attempt?.results?.find((result) => result.work) ?? attempt?.results?.[0];
    const structure = [...event.target.querySelectorAll("[data-review-structure]")].find((section) => section.dataset.reviewStructure === reviewed?.questionId);
    const obligationResults = [...(structure?.querySelectorAll("[data-obligation-id]") ?? [])].map((row) => ({
      id: row.dataset.obligationId,
      status: row.querySelector(".review-obligation-status")?.value ?? "missing",
      note: row.querySelector(".review-item-note")?.value ?? "",
    }));
    const rubricResults = [...(structure?.querySelectorAll("[data-rubric-id]") ?? [])].map((row) => ({
      id: row.dataset.rubricId,
      awardedPoints: Number(row.querySelector(".review-rubric-score")?.value ?? 0),
      note: row.querySelector(".review-item-note")?.value ?? "",
    }));
    store.recordTutorFeedback({
      questionId: reviewed?.questionId ?? "attempt", feedback: data.get("feedback"), nextStep: data.get("next"),
      confidence: data.get("confidence"), verdict: data.get("verdict"), reviewerType: data.get("reviewer"),
      mistakeTag: reviewed?.mistakeTags?.[0] ?? "none",
      obligationResults, rubricResults,
    });
    showToast("Review saved to this profile.");
  }
});

document.addEventListener("keydown", (event) => {
  const mapNode = event.target.closest?.("[data-map-skill]");
  if (mapNode && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    if (currentSnapshot?.ui.mapPlanMode) {
      const selected = currentSnapshot.ui.mapPlanSelection;
      const id = mapNode.dataset.mapSkill;
      store.setMapPlanSelection(event.ctrlKey || event.metaKey
        ? selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]
        : [id]);
    } else store.selectMapSkill(mapNode.dataset.mapSkill);
  }
  if (currentSnapshot?.ui.route === "map" && currentSnapshot.ui.mapPlanMode && event.key === "Escape") store.setMapPlanSelection([]);
});

document.querySelector("#agent-toggle").addEventListener("click", () => openAgentStudio());
document.querySelector("#agent-close").addEventListener("click", () => closeAgentStudio());
function initClock() {
  const svgNS = "http://www.w3.org/2000/svg";
  const minutes = document.querySelector("#clock-minute-marks");
  const hours = document.querySelector("#clock-hour-marks");
  const point = (angle, radius) => {
    const radians = (angle - 90) * Math.PI / 180;
    return { x: 60 + radius * Math.cos(radians), y: 60 + radius * Math.sin(radians) };
  };
  for (let index = 0; index < 60; index += 1) {
    const angle = index * 6;
    const hour = index % 5 === 0;
    const outer = point(angle, 49);
    const inner = point(angle, hour ? 41 : 46);
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", inner.x.toFixed(2)); line.setAttribute("y1", inner.y.toFixed(2));
    line.setAttribute("x2", outer.x.toFixed(2)); line.setAttribute("y2", outer.y.toFixed(2));
    line.setAttribute("class", hour ? "clock-tick-hour" : "clock-tick-minute");
    (hour ? hours : minutes).appendChild(line);
  }
  const update = () => {
    const date = new Date();
    const seconds = date.getSeconds() + date.getMilliseconds() / 1000;
    const minute = date.getMinutes() + seconds / 60;
    const hour = (date.getHours() % 12) + minute / 60;
    document.querySelector("#clock-second").setAttribute("transform", `rotate(${seconds * 6} 60 60)`);
    document.querySelector("#clock-minute").setAttribute("transform", `rotate(${minute * 6} 60 60)`);
    document.querySelector("#clock-hour").setAttribute("transform", `rotate(${hour * 30} 60 60)`);
    requestAnimationFrame(update);
  };
  update();
}

async function boot() {
  const response = await fetch("./curriculum-data.json?v=20260902-native-math-expansion");
  if (!response.ok) throw new Error("Could not load the QuickMaths curriculum.");
  const curriculum = await response.json();
  let bundledLessonPacks = [];
  let needsLegacyGeography = false;
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    needsLegacyGeography = Boolean(saved && Number(saved.version) < APP_VERSION);
  } catch {
    // The store's normal malformed-state recovery remains authoritative.
  }
  if (needsLegacyGeography) {
    const geography = await fetchTextLimited(fetch, "./lesson-depot/lessons/geography/1.0.0/lesson-set.json?v=20260902-geography-depot", { maximumBytes: MAX_LESSON_FILE_BYTES, label: "Geography migration pack" });
    bundledLessonPacks = [geography.text];
  }
  let agentManifest = {};
  let authoringGuideMarkdown = "";
  const productManuals = { learner: "", educator: "" };
  let communityConfig = { enabled: false };
  try {
    const [manifestResponse, authoringGuideResponse, learnerManualResponse, educatorManualResponse] = await Promise.all([
      fetch("./agent-manifest.json?v=20260903-federation-v1").catch(() => null),
      fetch("./CUSTOM_LESSON_SETS.md?v=20260902-python-v1").catch(() => null),
      fetch("./STUDENT_GUIDE.md?v=20260903-final-handoff-v1").catch(() => null),
      fetch("./EDUCATOR_GUIDE.md?v=20260903-final-handoff-v1").catch(() => null),
    ]);
    if (manifestResponse?.ok) agentManifest = await manifestResponse.json();
    if (authoringGuideResponse?.ok) authoringGuideMarkdown = await authoringGuideResponse.text();
    if (learnerManualResponse?.ok) productManuals.learner = await learnerManualResponse.text();
    if (educatorManualResponse?.ok) productManuals.educator = await educatorManualResponse.text();
  } catch {
    // The tools still work if the optional human/machine-readable guide is unavailable.
  }
  try {
    const communityResponse = await fetch("./github-community-config.json", { cache: "no-store" });
    if (communityResponse.ok) communityConfig = await communityResponse.json();
  } catch {
    // External GitHub links remain available if optional in-app community authorization is unavailable.
  }
  store = createQuickMathsStore({ storage: window.localStorage, curriculum, bundledLessonPacks });
  lessonDepot = createLessonDepot({
    store,
    federationUrl: DEFAULT_DEPOT_FEDERATION,
    sourceStorage: window.localStorage,
    showToast,
    onChange: () => { if (currentSnapshot?.activeProfile && currentSnapshot.ui.route === "depot") renderLessonDepot(store.snapshot()); },
  });
  githubCredentials = createGitHubCredentialStore({
    configStorage: window.localStorage,
    sessionCredentialStorage: window.sessionStorage,
    persistentCredentialStorage: window.localStorage,
  });
  githubCommunity = createGitHubCommunityClient({
    config: communityConfig,
    credentialStore: createGitHubCommunityCredentialStore({ sessionStorage: window.sessionStorage, persistentStorage: window.localStorage }),
    transactionStorage: window.sessionStorage,
  });
  githubSync = createGitHubSyncController({
    role: "learner",
    client: createGitHubContentsClient(),
    credentialStore: githubCredentials,
    serializeState: () => store.exportSyncState(),
    applyState: (raw) => store.importSyncState(raw),
    subscribeToState: (listener) => store.subscribe(listener),
    deviceLabel: bridgeDeviceLabel(),
  });
  githubSyncSnapshot = githubSync.snapshot();
  githubSync.subscribe((status) => {
    githubSyncSnapshot = status;
    if (status.phase === "conflict" && status.conflictDetails?.channel === "learner") {
      // Polling runs independently of the current route. Most learner-channel
      // changes fast-forward automatically; only old/undated dirty work from a
      // different device opens the global comparison dialog.
      void recoverEstablishedLearnerConflict();
    }
    if (currentSnapshot?.activeProfile && currentSnapshot.ui.route === "settings") renderSettings(currentSnapshot);
  });
  lessonStudio = createLessonStudio({
    store,
    download,
    showToast,
    getSnapshot: () => store.snapshot(),
    openFilePicker: () => elements.creatorFile.click(),
    publishToDepot: (pack) => {
      download(`${pack.id.toLowerCase().replaceAll("_", "-")}.json`, JSON.stringify(pack, null, 2), "application/json");
      navigator.clipboard.writeText(buildDepotSubmissionPrompt(pack)).then(() => showToast("Lesson downloaded and Codex publishing prompt copied.")).catch(() => showToast("Lesson downloaded. Open the Depot submission form next."));
      window.open(DEPOT_SUBMISSION_URL, "_blank", "noopener");
    },
  });
  lessonDepot.load();
  closeAgentStudio({ focusToggle: false });
  applyLocationRoute();
  store.subscribe(render);
  initClock();
  document.querySelector("#tool-list").innerHTML = TOOL_NAMES.map((name) => `<code>${name}</code>`).join("");
  document.querySelector("#tool-count").textContent = String(TOOL_NAMES.length);
  const bridge = await registerWebMcpTools(store, document.modelContext, agentManifest, lessonDepot, lessonStudio, authoringGuideMarkdown, productManuals);
  const failedTools = new Set(bridge.failures.map((failure) => failure.name));
  document.querySelector("#tool-list").innerHTML = TOOL_NAMES.map((name) => `<code class="${failedTools.has(name) ? "tool-failed" : ""}">${escapeHtml(name)}</code>`).join("");
  elements.bridgeCard.dataset.state = bridge.available && !bridge.error ? "ready" : bridge.error ? "warning" : "idle";
  elements.bridgeStatus.textContent = bridge.error ? "WebMCP partly connected" : bridge.available ? "Agent tools connected in this tab" : "WebMCP unavailable in this browser";
  elements.bridgeDetail.textContent = bridge.error
    ? `${bridge.registered.length} of ${TOOL_NAMES.length} tools registered. Failed: ${bridge.failures.map((failure) => failure.name).join(", ")}.`
    : bridge.available
      ? `${bridge.registered.length} tools can navigate and tutor across this in-app QuickMaths tab.`
      : "This browser cannot expose page tools. Use the backup/storage handoff below before opening QuickMaths in the ChatGPT or Codex in-app browser.";
  render(store.snapshot());
  const returnedFromCommunityAuthorization = new URLSearchParams(window.location.search).get("community") === "connected";
  if (returnedFromCommunityAuthorization) history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
  if (communityConnection().connected) {
    githubCommunity.connect().then(() => {
      communityUi.connectionError = "";
      rerenderDepotCommunity();
      if (returnedFromCommunityAuthorization) showToast("GitHub connected. You can vote and comment inside QuickMaths.");
    }).catch((error) => {
      communityUi.connectionError = error instanceof Error ? error.message : String(error);
      rerenderDepotCommunity();
    });
  }
  window.setInterval(() => {
    store.heartbeat();
    const snapshot = store.snapshot();
    elements.sessionTime.textContent = formatDuration(snapshot.timers.sessionSeconds);
    elements.profileTime.textContent = formatDuration(snapshot.timers.profileSeconds);
  }, 1000);
  document.addEventListener("visibilitychange", () => { if (document.hidden) store.heartbeat(true); });
  window.addEventListener("pagehide", () => store.heartbeat(true));
  window.addEventListener("pagehide", () => githubSync.stop());
  window.addEventListener("pagehide", cancelActivePythonGraders);
  window.addEventListener("storage", (event) => { if (event.key === "quickmaths.web.v2") store.replaceFromStorage(); });
  window.addEventListener("popstate", applyLocationRoute);
  window.addEventListener("hashchange", applyLocationRoute);
  const savedBridge = githubCredentials.load({ role: "learner" });
  if (savedBridge?.token) {
    try {
      await githubSync.resume({ startPolling: false });
      await prepareLearnerBridge({ resumed: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    }
  }
}

async function ensureLegacyGeographyMigration(raw) {
  let version = APP_VERSION;
  try { version = Number(JSON.parse(raw)?.version ?? APP_VERSION); } catch { return; }
  if (version >= APP_VERSION) return;
  legacyGeographyMigrationPromise ??= fetchTextLimited(fetch, "./lesson-depot/lessons/geography/1.0.0/lesson-set.json?v=20260902-geography-depot", { maximumBytes: MAX_LESSON_FILE_BYTES, label: "Geography migration pack" });
  const result = await legacyGeographyMigrationPromise;
  store.registerBundledLessonPacks([result.text]);
}

boot().catch((error) => {
  elements.loading.innerHTML = `<p><strong>QuickMaths could not start.</strong></p><p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
});
