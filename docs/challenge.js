import { createQuickMathsStore, STATUS_COLORS } from "./challenge-core.js?v=20260902-native-improvements-v2";
import { registerWebMcpTools, TOOL_NAMES } from "./webmcp-tools.js?v=20260902-native-improvements-v2";
import { createLessonStudio } from "./lesson-creator.js?v=20260902-native-improvements-v2";
import {
  buildDepotSubmissionPrompt,
  createLessonDepot,
  DEPOT_DISCUSSIONS_URL,
  DEPOT_REPOSITORY_URL,
  DEPOT_SUBMISSION_URL,
  filterDepotPackages,
} from "./lesson-depot.js?v=20260902-subject-colors";
import {
  createGitHubContentsClient,
  createGitHubCredentialStore,
  createGitHubSyncController,
} from "./github-sync.js?v=20260901-bridge-fix";
import {
  createGitHubCommunityClient,
  createGitHubCommunityCredentialStore,
} from "./github-community.js?v=20260902-community-vote";

const elements = {
  loading: document.querySelector("#loading-screen"),
  welcome: document.querySelector("#welcome-screen"),
  shell: document.querySelector("#app-shell"),
  profiles: document.querySelector("#profile-list"),
  profileError: document.querySelector("#profile-error"),
  welcomeLessonCount: document.querySelector("#welcome-lesson-count"),
  welcomeQuestionCount: document.querySelector("#welcome-question-count"),
  welcomeToolCount: document.querySelector("#welcome-tool-count"),
  welcomeStorageRestore: document.querySelector("#welcome-storage-restore"),
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
  subjectSelect: document.querySelector("#subject-select"),
  toast: document.querySelector("#toast"),
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
let bridgeFormDraft = null;
let welcomeStorageOpen = false;
const communityUi = { phase: "idle", activePack: null, discussion: null, commentDraft: "", error: "", busy: false, connectionError: "" };

const AGENT_STARTER_PROMPT = "Read the QuickMaths agent manifest through WebMCP, then guide me through the learning experience.";
const MAP_ZOOM_MIN = 0.1;
const MAP_ZOOM_MAX = 1.6;
const MAP_ZOOM_STEP = 0.1;

const THEME_VARIABLES = {
  paper: "--paper", paperDeep: "--paper-deep", paperLight: "--paper-light", ink: "--ink", muted: "--muted",
  line: "--line", primary: "--pine", primaryAlt: "--pine-2", tint: "--mint", highlight: "--lime", accent: "--coral",
};

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
    await navigator.clipboard.writeText(AGENT_STARTER_PROMPT);
    showToast("Starting prompt copied.");
  } catch {
    showToast("Select the prompt to copy it.");
  }
}

function renderProfiles(snapshot) {
  if (!snapshot.profiles.length) {
    elements.profiles.innerHTML = '<div class="empty-profiles">No profiles yet. Create one below or explore the sample learner.</div>';
    return;
  }
  elements.profiles.innerHTML = snapshot.profiles.map((profile) => `
    <button class="profile-card" type="button" data-profile-id="${escapeHtml(profile.id)}">
      <span class="avatar">${escapeHtml(profile.displayName.slice(0, 1).toUpperCase())}</span>
      <span><strong>${escapeHtml(profile.displayName)}</strong><small>${profile.demo ? "Sample progress · " : ""}${escapeHtml(formatDuration(profile.totalLoggedSeconds))} practiced</small></span>
      <b aria-hidden="true">→</b>
    </button>
  `).join("");
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
    lede: "This is a mastery map, lesson library, testing room, tutor workspace, and portable learning record—all running locally in your browser.",
    points: ["Your profile keeps progress separate from other learners.", "Work autosaves on this device as you learn.", "A full JSON backup moves everything without an account."],
    tip: "You can leave the tour at any time. Replay it later from Settings.",
    visual: "welcome",
  },
  {
    eyebrow: "Subjects and learning paths",
    title: "Choose what to learn—and how strict the path should be.",
    lede: "The subject picker in the left sidebar and Learning path control in Settings shape the curriculum you see. Custom lesson sets can extend Mathematics or add entirely new subjects with their own colors.",
    points: ["Subject switches the dashboard, map, lessons, and theme.", "Hard path locks tests until prerequisites are proven.", "Open path keeps the same connections as guidance but opens every test."],
    tip: "The subject and path choice belongs to this profile and travels inside backups.",
    visual: "subjects",
  },
  {
    eyebrow: "The mastery map",
    title: "Read the map before picking your next lesson.",
    lede: "Every node is a lesson. Connections show prerequisite knowledge—including bridges between Mathematics, Geography, and any subjects you install.",
    points: ["Switch between the current subject and an All subjects map.", "Drag in either direction; use the mouse wheel on desktop or pinch on mobile to zoom.", "Node colors identify subjects, while status dots show ready, learning, proven, mastered, rusty, or locked."],
    tip: "Select any node to inspect mastery, confidence, prerequisites, and everything it unlocks.",
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
    tip: "Community authorization is separate from learner storage. Installing content and posting publicly always remain human-controlled actions.",
    visual: "depot",
  },
  {
    eyebrow: "Agent-assisted learning",
    title: "Bring a tutor into the same live workspace.",
    lede: "In a compatible Codex or ChatGPT browser, WebMCP gives the agent narrow QuickMaths tools—not raw browser storage or hidden answer keys. The manifest teaches it the rules and available workflow.",
    points: ["The agent can inspect progress, navigate, recommend a lesson, and tutor from visible work.", "It can save Socratic feedback, prepare follow-up practice, and open a native lesson as an editable Studio improvement.", "Agent Activity records tool actions only, so your own clicks are never mislabelled as the agent’s."],
    tip: "The short starter prompt is enough: WebMCP provides the detailed operating guide when the agent begins.",
    visual: "agent",
  },
  {
    eyebrow: "Settings, sync, and creation",
    title: "Keep it portable. Extend it when you are ready.",
    lede: "Settings brings together learning-path controls, JSON save and load, the optional GitHub Bridge, and this replayable tour. Lesson Studio creates curricula and safely improves built-in lessons without requiring raw JSON.",
    points: ["Download full backups containing profiles, progress, subjects, lessons, improvements, reviews, and timers.", "Optionally sync learner and remote-agent checkpoints through your own GitHub repository.", "Create new lessons—or edit a native lesson while keeping its ID, map position, and completed learner progress."],
    tip: "Agents may validate and stage content, but only you can install it. Native improvements are reversible from Settings without erasing progress.",
    visual: "ownership",
  },
];

function tutorialVisual(type, snapshot) {
  if (type === "welcome") return `<div class="tour-profile-preview"><img src="./quickmaths-logo.png" alt="" width="88" height="82"><div><span>Profile ready</span><strong>${escapeHtml(snapshot.activeProfile.displayName)}</strong><small>Autosaving on this device</small></div><i>✓</i></div><div class="tour-local-row"><span>Free</span><span>Local-first</span><span>No account</span></div>`;
  if (type === "subjects") return `<div class="tour-subject-preview"><p>Subject selector</p><div><span>${escapeHtml(snapshot.activeSubject.icon)}</span><strong>${escapeHtml(snapshot.activeSubject.name)}</strong><b>⌄</b></div><small>Changes the visible curriculum, mastery map, and color theme.</small></div><div class="tour-mode-preview" aria-label="Choose a learning path"><button type="button" data-progression-mode="hard" class="${snapshot.progressionMode === "hard" ? "is-active" : ""}" aria-pressed="${snapshot.progressionMode === "hard"}"><span>Hard path</span><strong>Prerequisites enforced</strong><small>Connected tests unlock in order.</small><i>${snapshot.progressionMode === "hard" ? "Selected" : "Choose hard"}</i></button><button type="button" data-progression-mode="soft" class="${snapshot.progressionMode === "soft" ? "is-active" : ""}" aria-pressed="${snapshot.progressionMode === "soft"}"><span>Open path</span><strong>Explore freely</strong><small>Connections become recommendations.</small><i>${snapshot.progressionMode === "soft" ? "Selected" : "Choose open"}</i></button></div>`;
  if (type === "map") return `<div class="tour-map-preview"><div class="tour-map-controls"><span>Current subject</span><strong>All subjects</strong><i>− &nbsp; 100% &nbsp; +</i></div><svg viewBox="0 0 560 250" role="img" aria-label="Example connected mastery map"><path d="M110 125 C170 125 165 65 235 65 M110 125 C170 125 165 185 235 185 M335 65 C395 65 390 125 455 125 M335 185 C395 185 390 125 455 125"></path><g transform="translate(20 90)"><rect width="90" height="70" rx="13"></rect><text x="45" y="34">Ready</text><text x="45" y="50">0 / 100</text></g><g transform="translate(235 30)" class="learning"><rect width="100" height="70" rx="13"></rect><text x="50" y="34">Learning</text><text x="50" y="50">46 / 100</text></g><g transform="translate(235 150)" class="proven"><rect width="100" height="70" rx="13"></rect><text x="50" y="34">Proven</text><text x="50" y="50">74 / 100</text></g><g transform="translate(455 90)" class="locked"><rect width="85" height="70" rx="13"></rect><text x="42" y="34">Locked</text><text x="42" y="50">0 / 100</text></g></svg></div><div class="tour-statuses">${["ready", "learning", "proven", "mastered", "rusty", "locked"].map(statusChip).join("")}</div>`;
  if (type === "loop") return `<div class="tour-loop-preview"><article><span>01</span><b>Read</b><small>Theory and examples</small></article><i>→</i><article><span>02</span><b>Test</b><small>Answers and shown work</small></article><i>→</i><article><span>03</span><b>Reflect</b><small>Confidence and difficulty</small></article><i>→</i><article><span>04</span><b>Review</b><small>Mastery and next date</small></article></div><div class="tour-work-preview"><code>2x + 5 = 13<br>2x = 8<br>x = 4</code><span>Step check passed</span></div>`;
  if (type === "depot") return `<div class="tour-depot-preview"><header><div><small>Community curriculum</small><strong>Lesson Depot</strong></div><span>Browse · discuss · install</span></header><div><article class="is-geography"><span>Geography</span><strong>Field Cartography</strong><small>3 lessons · Published</small><footer><b>👍 18</b><b>◯ 6</b></footer></article><article class="is-biology"><span>Biology</span><strong>Cell Systems</strong><small>Concept preview</small><footer><b>Roadmap</b></footer></article></div><p><b>✓</b> Packages are hash-checked and validated before installation.</p></div>`;
  if (type === "agent") return `<div class="tour-agent-preview"><div class="tour-agent-head"><span>✦</span><div><small>Agent studio</small><strong>Tutor in the loop</strong></div><i>Connected</i></div><div class="tour-agent-prompt"><span>Suggested starting prompt</span><p>${escapeHtml(AGENT_STARTER_PROMPT)}</p><button class="button button-secondary" type="button" data-tutorial-action="copy-agent-prompt">Copy to clipboard</button></div><div class="tour-tool-row"><code>get_progress_summary</code><code>inspect_student_work</code><code>record_tutor_feedback</code></div></div>`;
  return `<div class="tour-ownership-preview"><article><span>↧</span><div><strong>Full progress backup</strong><small>Profiles, subjects, lessons, attempts, reviews, themes, and timers</small></div><b>JSON</b></article><article><span>↔</span><div><strong>Optional GitHub Bridge</strong><small>Checkpoint learner state and exchange agent updates across sessions</small></div><b>Sync</b></article><article><span>✎</span><div><strong>Lesson Studio</strong><small>Create new curricula or install reversible improvements over native lessons</small></div><b>Create / improve</b></article></div>`;
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
  elements.view.innerHTML = `
    <header class="page-head">
      <div>
        <p class="eyebrow">${escapeHtml(snapshot.activeSubject.icon)} ${escapeHtml(snapshot.activeSubject.name)} dashboard · ${snapshot.progressionMode === "soft" ? "Open path" : "Hard path"}</p>
        <h1>Welcome back, ${escapeHtml(snapshot.activeProfile.displayName)}.</h1>
        <p>Your ${escapeHtml(snapshot.activeSubject.shortName)} map updates from saved attempts, confidence, reasoning review, and time—not just one score.</p>
      </div>
      <div class="page-actions">
        <button class="button button-outline" type="button" data-action="save-backup">Save backup</button>
        <button class="button button-primary" type="button" data-route="map">Open mastery map</button>
      </div>
    </header>

    ${snapshot.storageError ? `<div class="content-card" role="alert"><strong>Browser autosave is unavailable.</strong> Download a backup before leaving this page.</div>` : ""}

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
  return snapshot.curriculum.skills.map((skill) => `<option value="${escapeHtml(skill.id)}" ${skill.id === selectedId ? "selected" : ""}>${escapeHtml(skill.name)} · ${escapeHtml(skill.subdomain)}</option>`).join("");
}

function mapSkillOptions(snapshot, rows, selectedId) {
  const allSubjects = snapshot.mapScope === "all";
  return rows.map((row) => {
    const subject = snapshot.subjects.find((item) => item.id === row.subjectId);
    const subjectLabel = allSubjects ? `${subject?.icon ?? "◇"} ${subject?.shortName ?? subject?.name ?? row.subjectId} · ` : "";
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

function setupMapInteractions() {
  const scroller = document.querySelector(".map-scroll");
  const svg = scroller?.querySelector(".mastery-map");
  if (!scroller || !svg) return;

  const pointers = new Map();
  let gesture = null;
  let suppressClickUntil = 0;
  let wheelDelta = 0;

  const pointFrom = (event) => ({ x: event.clientX, y: event.clientY });
  const pair = () => Array.from(pointers.values()).slice(0, 2);
  const midpoint = ([first, second]) => ({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });
  const distance = ([first, second]) => Math.hypot(second.x - first.x, second.y - first.y);
  const currentZoom = () => Number(svg.dataset.currentZoom ?? store.snapshot().ui.mapZoom ?? 1);

  const beginPan = (pointer) => {
    gesture = {
      mode: "pan",
      startX: pointer.x,
      startY: pointer.y,
      startScrollLeft: scroller.scrollLeft,
      startScrollTop: scroller.scrollTop,
      moved: false,
    };
  };

  const beginPinch = () => {
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
    pointers.delete(event.pointerId);
    if (gesture?.mode === "pinch") {
      applyMapZoom(store.setMapZoom(currentZoom()));
      suppressClickUntil = Date.now() + 300;
    }
    if (pointers.size === 1) beginPan(Array.from(pointers.values())[0]);
    else if (!pointers.size) {
      gesture = null;
      scroller.classList.remove("is-panning", "is-pinching");
    }
  };

  scroller.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointers.set(event.pointerId, pointFrom(event));
    try { scroller.setPointerCapture(event.pointerId); } catch { /* Capture is best-effort. */ }
    if (pointers.size === 1) beginPan(pointFrom(event));
    else {
      beginPinch();
      scroller.classList.remove("is-panning");
      scroller.classList.add("is-pinching");
    }
  });

  scroller.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, pointFrom(event));
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
    if (gesture?.mode !== "pan") return;
    const pointer = pointFrom(event);
    const deltaX = pointer.x - gesture.startX;
    const deltaY = pointer.y - gesture.startY;
    if (!gesture.moved && Math.hypot(deltaX, deltaY) > 4) {
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
    const direction = event.deltaY > 0 ? -1 : 1;
    const zoom = currentZoom();
    if ((direction < 0 && zoom <= MAP_ZOOM_MIN) || (direction > 0 && zoom >= MAP_ZOOM_MAX)) {
      wheelDelta = 0;
      return;
    }
    event.preventDefault();
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
    if (Date.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
}

function renderMap(snapshot) {
  const combined = snapshot.mapScope === "all";
  const mapRows = combined ? snapshot.allProgressRows : snapshot.progressRows;
  const mapSkills = combined ? snapshot.curriculum.allSkills : snapshot.curriculum.skills;
  const selected = mapRows.find((row) => row.id === snapshot.ui.selectedMapSkillId) ?? mapRows[0];
  if (!selected) {
    elements.view.innerHTML = `<section class="test-empty content-card"><h2>${combined ? "No installed lessons" : `No lessons in ${escapeHtml(snapshot.activeSubject.name)}`}</h2><p>Use Lesson studio or load a custom set to add the first lesson.</p><button class="button button-primary" data-route="creator">Open Lesson studio</button></section>`;
    return;
  }
  const selectedSkill = store.skillsById[selected.id];
  const selectedSubject = snapshot.subjects.find((subject) => subject.id === selected.subjectId) ?? snapshot.activeSubject;
  const { positions, lanes, width, height } = mapLayout(mapSkills, { subjects: snapshot.subjects, combined });
  const zoom = Number(snapshot.ui.mapZoom ?? 1);
  const edges = mapSkills.flatMap((skill) => skill.prerequisites.map((prerequisite) => {
    const from = positions[prerequisite];
    const to = positions[skill.id];
    if (!from || !to) return "";
    const x1 = from.x + 178;
    const y1 = from.y + 35;
    const x2 = to.x;
    const y2 = to.y + 35;
    const bend = Math.max(40, (x2 - x1) * .5);
    const crossSubject = store.skillsById[prerequisite]?.subjectId !== skill.subjectId;
    return `<path class="${crossSubject ? "is-cross-subject" : ""}" d="M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}" />`;
  })).join("");
  const subjectLanes = lanes.map(({ subject, y, height: laneHeight }) => `<g class="map-subject-lane">
    <rect x="12" y="${y}" width="${width - 24}" height="${laneHeight}" rx="22" fill="${escapeHtml(subject.theme?.tint ?? "#dceca9")}"></rect>
    <line x1="28" y1="${y + 42}" x2="${width - 28}" y2="${y + 42}" stroke="${escapeHtml(subject.theme?.primary ?? "#153f36")}"></line>
    <text x="30" y="${y + 29}" fill="${escapeHtml(subject.theme?.primary ?? "#153f36")}">${escapeHtml(subject.icon)} ${escapeHtml(subject.name)}</text>
  </g>`).join("");
  const nodes = mapRows.map((row) => {
    const position = positions[row.id];
    const lines = splitLabel(row.name);
    const subject = snapshot.subjects.find((item) => item.id === row.subjectId) ?? snapshot.activeSubject;
    const nodeFill = combined ? subject.theme?.primary ?? STATUS_COLORS[row.status] : STATUS_COLORS[row.status] ?? STATUS_COLORS.locked;
    const nodeAccent = subject.theme?.primaryAlt ?? subject.theme?.primary ?? "#ffffff";
    return `<g class="map-node ${row.id === selected.id ? "is-selected" : ""}" role="button" tabindex="0" data-map-skill="${escapeHtml(row.id)}" transform="translate(${position.x} ${position.y})">
      <title>${escapeHtml(subject?.name ?? row.subjectId)}: ${escapeHtml(row.name)} · ${escapeHtml(row.status)}</title>
      <rect class="map-node-body" width="178" height="70" rx="13" fill="${escapeHtml(nodeFill)}"></rect>
      ${combined ? `<rect class="map-node-subject-accent" x="13" y="8" width="152" height="4" rx="2" fill="${escapeHtml(nodeAccent)}"></rect>` : ""}
      <text x="14" y="24">${lines.map((line, index) => `<tspan x="14" dy="${index ? 15 : 0}">${escapeHtml(line)}</tspan>`).join("")}</text>
      ${combined ? `<circle class="map-node-status-dot" cx="17" cy="56" r="4" fill="${STATUS_COLORS[row.status] ?? STATUS_COLORS.locked}"></circle>` : ""}
      <text class="map-node-meta" x="${combined ? 26 : 14}" y="58">${escapeHtml(row.status)} · ${Math.round(row.masteryScore)}/100</text>
      ${combined ? `<text class="map-node-subject" x="164" y="58" text-anchor="end">${escapeHtml(subject?.icon ?? "◇")}</text>` : ""}
    </g>`;
  }).join("");

  elements.view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">${combined ? `All subjects · ${mapRows.length} connected lessons across ${snapshot.subjects.length} curricula` : `${escapeHtml(snapshot.activeSubject.icon)} ${escapeHtml(snapshot.activeSubject.name)} · ${mapRows.length} connected lessons`}</p><h1>Mastery map</h1><p>${snapshot.progressionMode === "soft" ? "Open path treats the connections as guidance: every lesson and test is available." : "Hard path unlocks tests when prerequisite lessons are proven."} ${combined ? "Subject lanes and highlighted bridge lines show how knowledge travels across every installed curriculum." : "Cross-subject prerequisites stay listed in the detail panel; choose All subjects to draw them between curricula."}</p></div>
      <div class="page-actions map-toolbar"><div class="map-scope-control" role="group" aria-label="Subjects shown on mastery map"><button type="button" data-map-scope="subject" aria-pressed="${!combined}">Current subject</button><button type="button" data-map-scope="all" aria-pressed="${combined}">All subjects</button></div><label class="compact-select">Jump to skill<select id="map-skill-select">${mapSkillOptions(snapshot, mapRows, selected.id)}</select></label><div class="map-zoom-control" role="group" aria-label="Mastery map zoom"><button type="button" data-action="map-zoom-out" aria-label="Zoom mastery map out" ${zoom <= MAP_ZOOM_MIN ? "disabled" : ""}>−</button><output id="map-zoom-output" aria-live="polite">${Math.round(zoom * 100)}%</output><button type="button" data-action="map-zoom-in" aria-label="Zoom mastery map in" ${zoom >= MAP_ZOOM_MAX ? "disabled" : ""}>+</button></div></div>
    </header>
    <div class="status-legend">${Object.entries(STATUS_COLORS).map(([status, color]) => `<span><i style="background:${color}"></i>${status}</span>`).join("")}${combined ? `<span class="map-subject-key">Node color = subject · dot = status</span>` : ""}</div>
    <section class="map-layout">
      <div class="map-scroll" aria-label="Interactive prerequisite map. Drag to move. Use the mouse wheel on desktop or pinch on a touchscreen to zoom.">
        <div class="map-gesture-hint" aria-hidden="true">Drag to move <span class="map-hint-desktop">· Wheel to zoom</span><span class="map-hint-touch">· Pinch to zoom</span></div>
        <svg class="mastery-map" viewBox="0 0 ${width} ${height}" data-base-width="${width}" data-base-height="${height}" data-current-zoom="${zoom}" style="width:${Math.round(width * zoom)}px;height:${Math.round(height * zoom)}px">
          <g class="map-subject-lanes">${subjectLanes}</g>
          <g class="map-edges">${edges}</g>
          <g>${nodes}</g>
        </svg>
      </div>
      <aside class="map-detail">
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
          <button class="button button-primary" type="button" data-action="start-test" data-skill-id="${escapeHtml(selected.id)}" ${selected.status === "locked" ? "disabled" : ""}>Take test</button>
        </div>
      </aside>
    </section>
  `;
  setupMapInteractions();
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
        ${row.status === "locked" ? `<div class="locked-note"><strong>Lesson available, test locked</strong><p>Prove the prerequisite skills or switch this profile to Open path.</p></div>` : `<button class="button button-primary" type="button" data-action="start-test" data-skill-id="${escapeHtml(skill.id)}">Start ${Math.min(5, skill.problems.length)}-question test</button>`}
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

function renderTest(snapshot) {
  const skill = snapshot.selectedSkill;
  const row = rowForSkill(snapshot, skill.id);
  const draft = snapshot.activeTest;
  if (!draft) {
    elements.view.innerHTML = `
      <header class="page-head"><div><p class="eyebrow">Mastery test</p><h1>Choose what to prove.</h1><p>Tests use real questions generated from the original QuickMaths curriculum.</p></div><div class="page-actions"><label class="compact-select">Skill<select id="test-skill-select">${skillOptions(snapshot, skill.id)}</select></label></div></header>
      <section class="test-empty content-card">${statusChip(row.status)}<h2>${escapeHtml(skill.name)}</h2><p>${escapeHtml(skill.description)}</p>${row.status === "locked" ? `<div class="locked-note"><strong>Test locked</strong><p>Open the mastery map to complete its prerequisites first.</p></div><button class="button button-secondary" data-route="lesson" data-skill-id="${escapeHtml(skill.id)}">Read lesson</button>` : `<button class="button button-primary" data-action="start-test" data-skill-id="${escapeHtml(skill.id)}">Start ${Math.min(5, skill.problems.length)} questions</button>`}</section>
    `;
    return;
  }
  const answered = Object.values(draft.responses).filter((response) => response.finalAnswer).length;
  const questionIds = new Set(draft.problems.map((problem) => problem.template_id));
  const latestReview = snapshot.reviews.find((review) => questionIds.has(review.questionId));
  elements.view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">Mastery test · autosaved</p><h1>${escapeHtml(skill.name)}</h1><p>Final answers are graded locally. Your shown work stays available for tutor or self review.</p></div>
      <div class="test-progress"><span>${answered} / ${draft.problems.length} answered</span><i><b style="width:${draft.problems.length ? answered / draft.problems.length * 100 : 0}%"></b></i></div>
    </header>
    ${latestReview ? `<aside class="inline-feedback"><span aria-hidden="true">✦</span><div><p class="eyebrow">Latest tutor note</p><strong>${escapeHtml(latestReview.feedback)}</strong><p>${escapeHtml(latestReview.nextStep)}</p></div></aside>` : ""}
    <form id="test-form" class="test-form">
      ${draft.problems.map((problem, index) => {
        const response = draft.responses[problem.template_id] ?? { finalAnswer: "", work: "" };
        return `<article class="question-card" id="question-${escapeHtml(problem.template_id)}">
          <div class="question-number"><span>${String(index + 1).padStart(2, "0")}</span><small>${escapeHtml(problem.difficulty)} · ${escapeHtml(problem.answer_mode.replaceAll("_", " "))}</small></div>
          <h2>${escapeHtml(problem.prompt)}</h2>
          ${problem.options?.length ? `<fieldset class="answer-options"><legend>Final answer</legend>${problem.options.map((option) => `<label><input type="radio" name="answer-${escapeHtml(problem.template_id)}" value="${escapeHtml(option.id)}" data-question-id="${escapeHtml(problem.template_id)}" data-response-kind="answer" ${response.finalAnswer === String(option.id) ? "checked" : ""}><span><b>${escapeHtml(option.id)}</b>${escapeHtml(option.label ?? option.id)}</span></label>`).join("")}</fieldset>` : `<label class="response-field"><span>Final answer</span><input type="text" value="${escapeHtml(response.finalAnswer)}" data-question-id="${escapeHtml(problem.template_id)}" data-response-kind="answer" autocomplete="off" spellcheck="false" placeholder="Enter your answer"></label>`}
          ${renderWorkGuide(problem)}
          ${problem.work?.mode && problem.work.mode !== "none" ? `<label class="response-field work-field"><span>${escapeHtml(problem.work.prompt ?? "Show your work")} ${problem.work_required ? "(required)" : "(optional)"}</span><textarea rows="${["proof_obligations", "rubric_check"].includes(problem.work.mode) ? 7 : 4}" data-question-id="${escapeHtml(problem.template_id)}" data-response-kind="work" placeholder="${escapeHtml(workResponsePlaceholder(problem))}">${escapeHtml(response.work)}</textarea></label>` : ""}
        </article>`;
      }).join("")}
      <p id="test-error" class="form-message" role="alert"></p>
      <div class="sticky-submit"><span>Your draft is saved automatically in this browser.</span><button class="button button-primary" type="submit">Submit answers</button></div>
    </form>
  `;
}

function resultReviewGuide(result) {
  if (result.workMode === "proof_obligations" && result.proofObligations?.length) {
    return `<section class="result-review-guide"><strong>Review this proof against</strong><ol>${result.proofObligations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol></section>`;
  }
  if (result.workMode === "rubric_check" && result.rubricCriteria?.length) {
    return `<section class="result-review-guide"><strong>Review this response against</strong><ul>${result.rubricCriteria.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`;
  }
  return "";
}

function resultDetails(results) {
  return results.map((result, index) => `<details class="result-question" ${!result.correct || result.reviewRequired ? "open" : ""}>
    <summary><span class="result-icon ${result.correct ? "correct" : "incorrect"}">${result.correct ? "✓" : "×"}</span><span><strong>Question ${index + 1}</strong><small>${escapeHtml(result.prompt)}</small></span><b>${result.reviewRequired ? "Review required" : result.correct ? "Correct" : "Needs work"}</b></summary>
    <div class="result-body"><dl><div><dt>Your answer</dt><dd>${escapeHtml(result.finalAnswer || "No answer")}</dd></div><div><dt>Expected</dt><dd>${escapeHtml(result.expectedAnswer)}</dd></div></dl>${resultReviewGuide(result)}${result.work ? `<div class="shown-work"><strong>Your work</strong><pre>${escapeHtml(result.work)}</pre></div>` : ""}${result.mistakeTags?.length ? `<p class="mistake-tags">Review: ${result.mistakeTags.map(escapeHtml).join(" · ")}</p>` : ""}${result.solutionSteps?.length ? `<ol>${result.solutionSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>` : ""}</div>
  </details>`).join("");
}

function renderAttemptReviewForm(attempt) {
  const targets = attempt?.results?.filter((item) => item.work) ?? [];
  if (!targets.length) return "";
  const first = targets[0];
  return `<section class="self-review content-card"><div class="card-heading"><div><p class="eyebrow">${attempt.hasPendingReview ? "Required sign-off" : "Optional review"}</p><h2>${attempt.hasPendingReview ? "Review the saved reasoning" : "Add tutor / self review"}</h2><p>Select the exact response, compare it with its proof checklist or rubric above, then save one overall verdict.</p></div></div><form id="self-review-form"><div class="review-form-grid"><label>Response<select id="review-question-select" name="question">${targets.map((result, index) => `<option value="${escapeHtml(result.questionId)}" data-allow-self="${result.allowSelfReview ? "true" : "false"}">Question ${index + 1} · ${escapeHtml(result.workMode?.replaceAll("_", " ") ?? "shown work")}</option>`).join("")}</select></label><label>Reviewer<select id="review-reviewer-select" name="reviewer"><option value="self" ${first.allowSelfReview ? "" : "disabled"}>Self</option><option value="human_tutor" ${first.allowSelfReview ? "" : "selected"}>Human tutor</option><option value="ai_tutor">AI tutor / agent</option></select></label><label>Verdict<select name="verdict"><option value="pass">Pass</option><option value="partial" selected>Partial</option><option value="needs_revision">Needs revision</option><option value="fail">Fail</option></select></label><label>Confidence<select name="confidence"><option>low</option><option selected>medium</option><option>high</option></select></label></div><p id="review-permission-note" class="review-permission-note">${first.allowSelfReview ? "This response allows self review." : "This response requires a tutor or connected agent."}</p><label>Feedback<textarea name="feedback" rows="3" required placeholder="Which requirements were met, and what needs revision?"></textarea></label><label>Next step<input name="next" required placeholder="One concrete action for the learner"></label><button class="button button-secondary" type="submit">Save review</button></form></section>`;
}

function renderResults(snapshot) {
  const pending = snapshot.pendingResults;
  const attempt = pending ? null : (store.getAttempt() ?? snapshot.attempts[0] ?? null);
  const result = pending ?? attempt;
  if (!result) {
    elements.view.innerHTML = `<header class="page-head"><div><p class="eyebrow">Results</p><h1>No saved attempts yet.</h1><p>Complete a mastery test, reflect on it, and this page becomes your attempt history.</p></div></header><section class="content-card"><div class="empty-state"><button class="button button-primary" data-route="test">Open mastery test</button></div></section>`;
    return;
  }
  const skill = store.skillsById[result.skillId];
  const score = Math.round((result.percentScore ?? 0) * 100);
  const reviews = snapshot.reviews.filter((review) => !attempt || review.attemptId === attempt.attemptId);
  elements.view.innerHTML = `
    <header class="page-head"><div><p class="eyebrow">${pending ? "Unsaved reflection" : "Saved attempt"}</p><h1>${escapeHtml(skill?.name ?? result.skillName)}</h1><p>${pending ? "Review the outcome, then save your reflection to update the mastery map." : `Completed ${formatDate(attempt.completedAt)} · ${escapeHtml(attempt.masteryUpdate?.status ?? "saved")}`}</p></div><div class="result-score"><strong>${score}%</strong><span>${result.rawScore} / ${result.scoreTotal} correct</span></div></header>
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
          </form>` : `<p class="eyebrow">Mastery update</p><h2>${escapeHtml(attempt.masteryUpdate?.status ?? "Saved")}</h2><div class="saved-mastery"><strong>${Math.round(attempt.masteryUpdate?.masteryScore ?? 0)}</strong><span>/ 100 mastery</span></div><dl class="reflection-summary"><div><dt>Confidence</dt><dd>${attempt.reflection?.confidenceRating ?? "—"}/5</dd></div><div><dt>Difficulty</dt><dd>${escapeHtml(attempt.reflection?.difficultyFelt ?? "—")}</dd></div><div><dt>Hints</dt><dd>${escapeHtml(attempt.reflection?.hintsUsed ?? "—")}</dd></div></dl><button class="button button-primary" data-action="retake" data-skill-id="${escapeHtml(attempt.skillId)}">Practice again</button>`}
        ${reviews.length ? `<div class="saved-reviews"><p class="eyebrow">Saved review</p>${reviews.map((review) => `<article><strong>${escapeHtml(review.verdict)} · ${Math.round(review.score * 100)}%</strong><p>${escapeHtml(review.feedback)}</p><small>${escapeHtml(review.nextStep)}</small></article>`).join("")}</div>` : ""}
      </aside>
    </section>
    ${!pending ? renderAttemptReviewForm(attempt) : ""}
  `;
}

const TUTOR_SETUP_PROMPT = `${AGENT_STARTER_PROMPT} If WebMCP tools are unavailable, ask me to paste only the relevant progress summary or shown work—never a raw lesson-set file with answer keys.`;

function bridgePhaseLabel(status) {
  if (bridgeNeedsChoice) return "Needs your choice";
  if (status.phase === "conflict") return "Sync paused";
  if (status.error) return "Connection problem";
  if (["connecting", "checking", "pulling", "pushing"].includes(status.phase)) return `${status.phase[0].toUpperCase()}${status.phase.slice(1)}…`;
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
      <div class="bridge-connect-actions"><button class="button button-primary" type="submit">${landing ? "Connect and load my profile" : "Connect GitHub storage"}</button>${landing ? `<a class="quiet-button" href="./bridge-guide.html" target="_blank" rel="noopener">Storage setup guide ↗</a>` : `<a class="button button-outline" href="https://github.com/new" target="_blank" rel="noopener">Create private data repo ↗</a><a class="button button-outline" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Create fine-grained token ↗</a><a class="quiet-button" href="./bridge-guide.html" target="_blank" rel="noopener">Setup guide ↗</a>`}</div>
      <p class="bridge-form-note">Paste a fine-grained token limited to your separate QuickMaths data repository. It needs <strong>Repository permissions → Contents → Read and write</strong>, with no account, workflow, or administration permissions.</p>
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
    <div class="welcome-storage-body"><p>Use the same private data repository and fine-grained token as your other device. QuickMaths will load its complete learner checkpoint before opening the app.</p>${renderBridgeConnectionForm({ id: "welcome-github-sync-form", landing: true })}</div>
  </details>`;
  restoreBridgeFormDraft(document.querySelector("#welcome-github-sync-form")?.closest("[data-bridge-form]"));
}

function renderGitHubBridge(snapshot) {
  const status = githubSyncSnapshot;
  const saved = githubCredentials?.load({ role: "learner" });
  const repository = status.config ? `${status.config.owner}/${status.config.repo}` : null;
  const phaseClass = status.phase === "conflict" ? "conflict" : status.error ? "error" : status.connected ? "connected" : "idle";
  if (!status.connected) {
    return `
      <section class="content-card github-bridge-card" id="github-bridge">
        <div class="bridge-card-heading"><div><p class="eyebrow">QuickMaths Bridge · experimental</p><h2>Connect mobile learning to a remote agent</h2><p>Your browser remains the instant local save. A dedicated GitHub data repository carries debounced checkpoints between this learner page and the agent workspace.</p></div><span class="sync-phase ${phaseClass}"><i></i>${escapeHtml(bridgePhaseLabel(status))}</span></div>
        ${renderBridgeConnectionForm()}
      </section>`;
  }

  return `
    <section class="content-card github-bridge-card" id="github-bridge">
      <div class="bridge-card-heading"><div><p class="eyebrow">QuickMaths Bridge · experimental</p><h2>${escapeHtml(repository)}</h2><p>Local work is checkpointed after a short pause. Agent updates are accepted only when they were created from the current learner revision.</p></div><span class="sync-phase ${phaseClass}"><i></i>${escapeHtml(bridgePhaseLabel(status))}</span></div>
      ${status.error ? `<aside class="bridge-warning"><strong>${status.phase === "conflict" ? "Sync conflict" : "Bridge paused"}</strong><p>${escapeHtml(status.error)}</p></aside>` : ""}
      ${bridgeNeedsChoice ? `<aside class="bridge-choice"><div><strong>A learner checkpoint already exists on GitHub.</strong><p>Choose which complete copy should become current. Nothing is overwritten until you choose.</p></div><button class="button button-primary" data-action="bridge-load-remote">Load GitHub copy</button><button class="button button-outline" data-action="bridge-replace-remote">Use this device</button></aside>` : ""}
      <div class="bridge-status-grid">
        <article><span>Local state</span><strong>${status.dirty ? "Pending checkpoint" : "Checkpointed"}</strong><small>Browser autosave stays instant</small></article>
        <article><span>Last learner push</span><strong>${status.lastPushedAt ? escapeHtml(formatDate(status.lastPushedAt)) : "This session: not yet"}</strong><small>${escapeHtml(status.config.branch)}</small></article>
        <article><span>Last agent pull</span><strong>${status.lastPulledAt ? escapeHtml(formatDate(status.lastPulledAt)) : "Waiting"}</strong><small>${status.remoteAvailable ? "Remote files detected" : "No agent checkpoint yet"}</small></article>
        <article><span>Token storage</span><strong>${saved?.rememberToken ? "Remembered here" : "This tab session"}</strong><small>Never committed</small></article>
      </div>
      <div class="bridge-toolbar"><button class="button button-primary" data-action="bridge-push" ${bridgeNeedsChoice ? "disabled" : ""}>Sync now</button><button class="button button-outline" data-action="bridge-pull-agent" ${bridgeNeedsChoice ? "disabled" : ""}>Check agent updates</button><a class="button button-outline" href="./agent-bridge.html" target="_blank" rel="noopener">Open Agent Bridge ↗</a><a class="quiet-button" href="./bridge-guide.html" target="_blank" rel="noopener">Setup guide ↗</a><button class="quiet-button danger-link" data-action="bridge-disconnect">Disconnect</button></div>
      <p class="bridge-form-note"><strong>Remote-session flow:</strong> keep the Agent Bridge open in the paired computer’s Codex browser, then start or guide that task from ChatGPT Remote on your phone.</p>
    </section>`;
}

function renderSettings(snapshot) {
  captureBridgeFormDraft(document.querySelector("[data-bridge-form]"));
  const backup = snapshot.backupStatus;
  const improvementPacks = snapshot.lessonPacks.filter((pack) => pack.mode === "override");
  const addedLessonCount = snapshot.lessonPacks.filter((pack) => pack.mode !== "override").reduce((count, pack) => count + pack.skillCount, 0);
  const lessonPackDetail = [
    addedLessonCount ? `${addedLessonCount} added lesson${addedLessonCount === 1 ? "" : "s"}` : "",
    improvementPacks.length ? `${improvementPacks.length} native improvement${improvementPacks.length === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" · ") || "Built-ins unchanged";
  elements.view.innerHTML = `
    <header class="page-head"><div><p class="eyebrow">Profile preferences & data</p><h1>Settings</h1><p>Choose how this profile moves through the curriculum, replay the guided tour, and manage every save, export, custom lesson, and restore point.</p></div><div class="page-actions"><button class="button button-outline" data-action="load-backup">Load backup</button><button class="button button-primary" data-action="save-backup">Save full backup</button></div></header>
    <section class="settings-controls">
      <article class="settings-control-card"><h2>Learning path</h2><p>This setting belongs to ${escapeHtml(snapshot.activeProfile.displayName)} and travels inside full backups.</p><div class="settings-mode-grid" role="group" aria-label="Progression mode"><button type="button" data-progression-mode="hard" aria-pressed="${snapshot.progressionMode === "hard"}"><strong>Hard path</strong><small>Prerequisites must be proven before connected mastery tests unlock.</small></button><button type="button" data-progression-mode="soft" aria-pressed="${snapshot.progressionMode === "soft"}"><strong>Open path</strong><small>Connections remain guidance, while every lesson and test stays available.</small></button></div></article>
      <article class="settings-control-card settings-tour-action"><div><h2>App tutorial</h2><p>Replay all seven chapters without resetting progress, subjects, lessons, or preferences.</p></div><button class="button button-secondary" type="button" data-action="replay-tutorial">Replay app tour</button></article>
    </section>
    ${renderGitHubBridge(snapshot)}
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
      ${snapshot.stagedLessonPack ? `<aside class="staged-pack"><span>${snapshot.stagedLessonPack.mode === "override" ? "Native improvement" : "Agent-staged"}</span><div><strong>${escapeHtml(snapshot.stagedLessonPack.name)}</strong><p>${escapeHtml(snapshot.stagedLessonPack.subjectName)} · ${snapshot.stagedLessonPack.skillCount} lesson${snapshot.stagedLessonPack.skillCount === 1 ? "" : "s"} · ${snapshot.stagedLessonPack.problemCount} questions · ${escapeHtml(snapshot.stagedLessonPack.author)}</p><small>${snapshot.stagedLessonPack.mode === "override" ? "Validated and staged by an agent. Installing keeps completed progress, restarts affected unfinished tests, and can be undone from Settings." : "An agent validated this file, but only you can install it."}</small></div><button class="button button-primary" data-action="install-staged-pack">${snapshot.stagedLessonPack.mode === "override" ? "Install improvement" : "Install"}</button><button class="button button-outline" data-action="discard-staged-pack">Discard</button></aside>` : ""}
      <div class="lesson-pack-guide"><div><strong>Two ways to build</strong><p>Use Lesson Studio to create a curriculum or open a native lesson as an editable copy—or give the machine-readable guide to an agent.</p></div><button class="button button-primary" data-route="creator">Open Lesson Studio</button><a class="button button-outline" href="./CUSTOM_LESSON_SETS.md" target="_blank" rel="noopener">Agent Lesson Authoring Guide</a></div>
      <div class="installed-packs">
        ${snapshot.lessonPacks.length ? snapshot.lessonPacks.map((pack) => `<article><span class="pack-mark">${pack.mode === "override" ? "↻" : escapeHtml(snapshot.subjects.find((subject) => subject.id === pack.subjectId)?.icon ?? "＋")}</span><div><strong>${escapeHtml(pack.name)}</strong><p>${escapeHtml(pack.description)}</p><small>${pack.mode === "override" ? `Native improvement · ${pack.overridesNativeSkills.map((id) => escapeHtml(id)).join(", ")} · completed progress preserved` : `${escapeHtml(pack.subjectName)} · ${pack.skillCount} lesson${pack.skillCount === 1 ? "" : "s"}`} · ${pack.problemCount} questions · ${escapeHtml(pack.author)} · v${escapeHtml(pack.version)}</small></div><div class="pack-actions"><button class="quiet-button" data-action="export-lesson-set" data-pack-id="${escapeHtml(pack.id)}">Download source</button>${pack.mode === "override" ? `<button class="quiet-button danger-link" data-action="restore-native-lessons" data-pack-id="${escapeHtml(pack.id)}">Restore original</button>` : ""}</div></article>`).join("") : `<div class="empty-state">No lesson sets or improvements installed. The built-in Mathematics and Geography curricula remain unchanged.</div>`}
      </div>
      <p class="pack-security-note"><strong>Teacher-file warning:</strong> lesson-set JSON contains answer keys and solutions. Don’t paste the raw file into a learner tutoring conversation.</p>
    </section>
    <section class="content-card tutor-setup"><div class="card-heading"><div><h2>Tutor setup prompt</h2><p>Use this in any AI tutor when WebMCP is unavailable.</p></div><button class="quiet-button" data-action="copy-tutor-setup">Copy prompt</button></div><pre id="tutor-setup-prompt">${escapeHtml(TUTOR_SETUP_PROMPT)}</pre></section>
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
    content = `<div class="community-discussion-heading"><div><p class="eyebrow">Live GitHub Discussion</p><h2>${escapeHtml(discussion.title || pack.name)}</h2><p>Participating as <strong>${escapeHtml(connection.viewer?.login ?? "GitHub user")}</strong>. Comments are public and Markdown works when viewed on GitHub.</p></div><button class="community-vote-button" type="button" data-depot-action="community-vote" aria-pressed="${discussion.viewerHasVoted}" ${communityUi.busy ? "disabled" : ""}><span>👍</span><strong>${discussion.viewerHasVoted ? "Upvoted" : "Upvote"}</strong><small>${discussion.votes} vote${discussion.votes === 1 ? "" : "s"}</small></button></div><div class="community-comments"><div class="community-comments-heading"><strong>${discussion.commentCount} comment${discussion.commentCount === 1 ? "" : "s"}</strong><a href="${escapeHtml(discussion.url)}" target="_blank" rel="noopener">Full thread ↗</a></div>${discussion.comments.length ? discussion.comments.map(renderCommunityComment).join("") : `<div class="community-empty">No comments yet. Start the conversation.</div>`}</div><form id="community-comment-form" class="community-comment-form"><label for="community-comment-body">Add a public comment</label><textarea id="community-comment-body" name="body" maxlength="10000" rows="4" placeholder="Question, correction, teaching note, or experience with this lesson…" required>${escapeHtml(communityUi.commentDraft)}</textarea><div><small>Your GitHub username and comment will be public.</small><button class="button button-primary" type="submit" ${communityUi.busy ? "disabled" : ""}>${communityUi.busy ? "Sending…" : "Post comment"}</button></div></form>`;
  }
  return `<aside class="depot-community-panel" id="depot-community-panel"><header><div><span>Community</span><strong>${escapeHtml(pack.name)}</strong></div><button class="quiet-button" type="button" data-depot-action="community-close" aria-label="Close lesson discussion">Close ×</button></header>${content}<footer><span>Community authorization is separate from learner storage.</span>${connection.connected ? `<button class="quiet-button danger-link" type="button" data-depot-action="community-disconnect">Disconnect GitHub</button>` : ""}</footer></aside>`;
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

function renderLessonDepot(snapshot) {
  const depot = lessonDepot?.snapshot() ?? { phase: "loading", catalog: null, error: "", query: "", sort: "popular", subject: "all", preview: null, installingId: "" };
  const packages = filterDepotPackages(depot.catalog?.packages ?? [], depot);
  const subjects = [...new Map((depot.catalog?.packages ?? []).map((pack) => [pack.subjectId, pack.subjectName])).entries()];
  const installedById = new Map(snapshot.lessonPacks.map((pack) => [pack.id, pack]));
  const preview = depot.preview;
  const connection = communityConnection();
  elements.view.innerHTML = `
    ${renderLessonHubTabs("depot")}
    <header class="page-head depot-head"><div><p class="eyebrow">Free · open · community reviewed</p><h1>Lesson Depot</h1><p>Install complete community lesson packs and explore clearly marked concepts for future subjects. Every published download is hash-checked and run through the same local validator before you can install it.</p></div><div class="page-actions">${connection.configured ? `<button class="button ${connection.connected ? "button-secondary" : "button-outline"}" type="button" data-depot-action="community-connect">${connection.connected ? `GitHub · ${escapeHtml(connection.viewer?.login ?? "connected")}` : "Connect GitHub"}</button>` : `<a class="button button-outline" href="${DEPOT_DISCUSSIONS_URL}" target="_blank" rel="noopener">Community ↗</a>`}<a class="button button-primary" href="${DEPOT_SUBMISSION_URL}" target="_blank" rel="noopener">Submit a lesson ↗</a></div></header>
    ${renderDepotCommunityPanel()}
    <section class="depot-trust-strip" aria-label="Lesson Depot safety model"><span><b>1</b><strong>Authors submit</strong><small>GitHub pull request</small></span><i>→</i><span><b>2</b><strong>Checks run</strong><small>Schema, graph, hashes</small></span><i>→</i><span><b>3</b><strong>You approve</strong><small>Local install confirmation</small></span><i>→</i><span><b>4</b><strong>Progress saves</strong><small>Normal backup pipeline</small></span></section>
    ${preview ? `<aside class="depot-preview"><div><p class="eyebrow">Validated preview</p><h2>${escapeHtml(preview.pack.name)}</h2><p>${escapeHtml(preview.pack.description)}</p><div class="depot-preview-facts"><span>${preview.preview.skillCount}<small>Lessons</small></span><span>${preview.preview.problemCount}<small>Questions</small></span><span>${escapeHtml(preview.preview.subjectName)}<small>Subject</small></span><span>${escapeHtml(preview.pack.license)}<small>License</small></span></div></div><button class="button button-primary" data-depot-action="install" data-pack-id="${escapeHtml(preview.pack.id)}" data-pack-version="${escapeHtml(preview.pack.version)}">Install this pack</button><button class="quiet-button" data-depot-action="close-preview">Close preview</button></aside>` : ""}
    <section class="depot-toolbar" aria-label="Filter lesson packages">
      <label><span>Search</span><input id="depot-search" type="search" value="${escapeHtml(depot.query)}" placeholder="Percentages, biology, author…"></label>
      <label><span>Subject</span><select id="depot-subject"><option value="all">All subjects</option>${subjects.map(([id, name]) => `<option value="${escapeHtml(id)}" ${depot.subject === id ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>
      <label><span>Sort</span><select id="depot-sort"><option value="popular" ${depot.sort === "popular" ? "selected" : ""}>Most supported</option><option value="newest" ${depot.sort === "newest" ? "selected" : ""}>Newest</option><option value="name" ${depot.sort === "name" ? "selected" : ""}>Name</option></select></label>
      <button class="quiet-button" data-depot-action="reload">Refresh catalog</button>
    </section>
    ${depot.phase === "loading" ? `<section class="depot-state"><span class="depot-spinner" aria-hidden="true"></span><h2>Opening the catalog…</h2><p>The app itself remains fully local-first.</p></section>` : ""}
    ${depot.phase === "error" ? `<section class="depot-state is-error"><span>!</span><h2>The catalog is unavailable</h2><p>${escapeHtml(depot.error)}</p><button class="button button-primary" data-depot-action="reload">Try again</button></section>` : ""}
    ${depot.phase === "ready" ? `<section class="depot-results-heading"><div><p class="eyebrow">Catalog</p><h2>${packages.length} package${packages.length === 1 ? "" : "s"}</h2></div><small>${connection.connected ? "Open a package’s community panel for live totals, voting, and comments." : "Catalog totals are cached from GitHub Discussions. Connect GitHub for live in-app voting and comments."}</small></section><section id="lesson-depot" class="depot-grid">${packages.map((pack) => {
      const installed = installedById.get(pack.id);
      const busy = depot.installingId === pack.id;
      const isPreview = pack.availability === "preview";
      const live = communityUi.activePack?.id === pack.id && communityUi.activePack?.version === pack.version ? communityUi.discussion : null;
      const votes = live?.votes ?? pack.votes;
      const comments = live?.commentCount ?? pack.comments;
      const communityControl = isPreview
        ? `<button type="button" class="depot-preview-community" disabled><span>◇</span><b>Discussion opens when published</b></button>`
        : connection.configured
          ? `<button type="button" data-depot-action="community-open" data-pack-id="${escapeHtml(pack.id)}" data-pack-version="${escapeHtml(pack.version)}" aria-label="Upvote and discuss ${escapeHtml(pack.name)} inside QuickMaths"><span>👍 ${votes}</span><span>◯ ${comments}</span><b>${connection.connected ? "Join discussion" : "Upvote & discuss"}</b></button>`
          : `<a href="${escapeHtml(pack.discussionUrl)}" target="_blank" rel="noopener" aria-label="Upvote or comment on ${escapeHtml(pack.name)} on GitHub"><span>👍 ${votes}</span><span>◯ ${comments}</span><b>Upvote or comment ↗</b></a>`;
      const actions = isPreview
        ? `<button class="button button-outline" disabled>Concept preview</button><button class="button button-primary" disabled>Coming soon</button>`
        : `<button class="button button-outline" data-depot-action="preview" data-pack-id="${escapeHtml(pack.id)}" data-pack-version="${escapeHtml(pack.version)}" ${installed ? "disabled" : ""}>Preview</button><button class="button button-primary" data-depot-action="install" data-pack-id="${escapeHtml(pack.id)}" data-pack-version="${escapeHtml(pack.version)}" ${installed || busy ? "disabled" : ""}>${installed ? `Installed v${escapeHtml(installed.version)}` : busy ? "Checking…" : "Install"}</button>`;
      const cardTheme = `--depot-paper:${pack.theme.paperLight};--depot-primary:${pack.theme.primary};--depot-primary-alt:${pack.theme.primaryAlt};--depot-tint:${pack.theme.tint};--depot-highlight:${pack.theme.highlight};--depot-accent:${pack.theme.accent}`;
      return `<article class="depot-card${isPreview ? " is-preview" : ""}" data-depot-pack-id="${escapeHtml(pack.id)}" style="${escapeHtml(cardTheme)}"><div class="depot-card-top"><span class="depot-subject">${escapeHtml(pack.subjectName)}</span><span class="depot-version">${isPreview ? "Concept" : `v${escapeHtml(pack.version)}`}</span></div><h2>${escapeHtml(pack.name)}</h2><p>${escapeHtml(pack.description)}</p><div class="depot-tags">${pack.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div><dl><div><dt>Author</dt><dd>${escapeHtml(pack.author)}</dd></div><div><dt>Contents</dt><dd>${isPreview ? "Not authored yet" : `${pack.skills} lessons · ${pack.problems} questions`}</dd></div><div><dt>${isPreview ? "Status" : "License"}</dt><dd>${escapeHtml(isPreview ? "Roadmap concept" : pack.license)}</dd></div></dl><div class="depot-community">${communityControl}</div><div class="depot-card-actions">${actions}</div></article>`;
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
  applySubjectTheme(snapshot.activeSubject);
  elements.subjectSelect.innerHTML = snapshot.subjects.map((subject) => `<option value="${escapeHtml(subject.id)}" ${subject.id === snapshot.activeSubject.id ? "selected" : ""}>${escapeHtml(subject.icon)} ${escapeHtml(subject.name)}</option>`).join("");
  document.querySelectorAll("[data-progression-mode]").forEach((button) => button.setAttribute("aria-pressed", button.dataset.progressionMode === snapshot.progressionMode ? "true" : "false"));
  const sidebarSubtitle = document.querySelector(".sidebar-brand small");
  if (sidebarSubtitle) sidebarSubtitle.textContent = snapshot.activeSubject.name;
  elements.sessionTime.textContent = formatDuration(snapshot.timers.sessionSeconds);
  elements.profileTime.textContent = formatDuration(snapshot.timers.profileSeconds);
  renderActivity(snapshot.activity);
  syncNavigation(snapshot.ui.route);
  if (snapshot.ui.route === "home") renderDashboard(snapshot);
  else if (snapshot.ui.route === "tutorial") renderTutorial(snapshot);
  else if (snapshot.ui.route === "map") renderMap(snapshot);
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
  if (!["tutorial", "home", "map", "lesson", "test", "results", "settings", "data", "creator", "depot"].includes(route)) return;
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
  const remoteMatchesKnown = remote.learner.exists && metadata?.learnerSha === remote.learner.sha;
  bridgeNeedsChoice = false;
  if (!remote.learner.exists) {
    if (local.profiles.length) await githubSync.pushNow();
    githubSync.start();
  } else if (!local.profiles.length) {
    await githubSync.restoreLearner({ force: true });
    githubSync.start();
  } else if (resumed && remoteMatchesKnown) {
    githubSync.start();
    if (githubSync.snapshot().dirty) await githubSync.pushNow();
  } else {
    bridgeNeedsChoice = true;
    githubSync.stop();
  }
  if (!bridgeNeedsChoice && remote.agent?.exists) {
    try { await githubSync.pullNow(); } catch { /* The status card explains stale agent output. */ }
  }
  if (store.snapshot().ui.route === "settings") renderSettings(store.snapshot());
  return remote;
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
    if (action === "bridge-load-remote") {
      if (!window.confirm("Replace this browser's complete QuickMaths state with the GitHub learner checkpoint?\n\nDownload a JSON backup first if you need to keep the current browser copy.")) return;
      await githubSync.restoreLearner({ force: true });
      bridgeNeedsChoice = false;
      try { await githubSync.pullNow(); } catch { /* Keep the resolved learner channel active; polling can retry the agent channel. */ }
      githubSync.start();
      renderSettings(store.snapshot());
      showToast("GitHub learner checkpoint loaded.");
    }
    if (action === "bridge-replace-remote") {
      if (!window.confirm("Replace the GitHub learner checkpoint with this browser's complete QuickMaths state?\n\nThe previous GitHub version remains in repository history.")) return;
      await githubSync.pushNow({ force: true });
      bridgeNeedsChoice = false;
      try { await githubSync.pullNow(); } catch { /* Keep the resolved learner channel active; polling can retry the agent channel. */ }
      githubSync.start();
      renderSettings(store.snapshot());
      showToast("GitHub learner checkpoint replaced.");
    }
    if (action === "bridge-disconnect") {
      githubSync.disconnect();
      bridgeNeedsChoice = false;
      showToast("QuickMaths Bridge disconnected on this device.");
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error));
  }
}

document.querySelector("#create-profile-form").addEventListener("submit", (event) => {
  event.preventDefault();
  elements.profileError.textContent = "";
  try {
    bridgeFormDraft = null;
    store.createProfile(document.querySelector("#profile-name").value);
    event.currentTarget.reset();
  } catch (error) {
    elements.profileError.textContent = error instanceof Error ? error.message : String(error);
  }
});

document.querySelector("#create-demo").addEventListener("click", () => {
  store.createProfile("Demo Learner", { demo: true });
});

elements.profiles.addEventListener("click", (event) => {
  const profile = event.target.closest("[data-profile-id]");
  if (profile) store.selectProfile(profile.dataset.profileId);
});

document.querySelector("#logout-button").addEventListener("click", () => store.logout());
document.querySelector("#welcome-load").addEventListener("click", () => elements.backupFile.click());

elements.backupFile.addEventListener("change", async () => {
  const file = elements.backupFile.files?.[0];
  if (!file) return;
  try {
    const raw = await file.text();
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
    const raw = await file.text();
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
    if (lessonStudio.loadRaw(await file.text())) render(store.snapshot());
  } finally { elements.creatorFile.value = ""; }
});

document.addEventListener("click", async (event) => {
  const studioHelp = event.target.closest?.("[data-studio-help]");
  const openStudioHelp = document.querySelectorAll?.('[data-studio-help][aria-expanded="true"]') ?? [];
  openStudioHelp.forEach((button) => {
    if (button !== studioHelp) button.setAttribute("aria-expanded", "false");
  });
  if (studioHelp && currentSnapshot?.ui.route === "creator") {
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
    if (action === "copy-agent-prompt") copyAgentPrompt();
    return;
  }
  const creatorAction = event.target.closest?.("[data-creator-action]");
  if (creatorAction && currentSnapshot?.ui.route === "creator") {
    event.preventDefault();
    if (lessonStudio.handleAction(creatorAction)) render(store.snapshot());
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
          showToast(vote.viewerHasVoted ? "Lesson vote saved on GitHub." : "GitHub vote removed.");
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
    store.setLearningPreferences({ progressionMode: modeButton.dataset.progressionMode });
    showToast(modeButton.dataset.progressionMode === "soft" ? "Open path enabled. Connections are now guidance." : "Hard path enabled. Prerequisites lock tests.");
    return;
  }
  const mapScopeButton = event.target.closest?.("[data-map-scope]");
  if (mapScopeButton && currentSnapshot?.ui.route === "map") {
    store.setLearningPreferences({ mapScope: mapScopeButton.dataset.mapScope });
    showToast(mapScopeButton.dataset.mapScope === "all" ? "Showing every installed subject and bridge." : `Showing ${store.snapshot().activeSubject.name} only.`);
    return;
  }
  const mapNode = event.target.closest?.("[data-map-skill]");
  if (mapNode) store.selectMapSkill(mapNode.dataset.mapSkill);
  const routeButton = event.target.closest("[data-route]");
  if (routeButton && currentSnapshot?.activeProfile) {
    const route = routeButton.dataset.route;
    const skillId = routeButton.dataset.skillId || null;
    store.navigate(route, skillId);
  }
  const action = event.target.closest("[data-action]");
  if (!action) return;
  if (action.dataset.action.startsWith("bridge-")) {
    bridgeAction(action.dataset.action);
    return;
  }
  if (action.dataset.action === "save-backup") saveBackup();
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
      showToast(result.mode === "override" ? `${result.name} installed. Completed progress was preserved${result.restartedDraftCount ? `; ${result.restartedDraftCount} unfinished test${result.restartedDraftCount === 1 ? " restarted" : "s restarted"}` : ""}.` : `${result.name} installed.`);
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
  if (action.dataset.action === "copy-tutor-setup") {
    navigator.clipboard.writeText(TUTOR_SETUP_PROMPT).then(() => showToast("Tutor prompt copied.")).catch(() => showToast("Select the prompt to copy it."));
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "review-question-select") {
    const option = event.target.selectedOptions?.[0];
    const reviewer = document.querySelector("#review-reviewer-select");
    const selfOption = reviewer?.querySelector('option[value="self"]');
    const allowSelf = option?.dataset.allowSelf === "true";
    if (selfOption) selfOption.disabled = !allowSelf;
    if (!allowSelf && reviewer?.value === "self") reviewer.value = "human_tutor";
    const note = document.querySelector("#review-permission-note");
    if (note) note.textContent = allowSelf ? "This response allows self review." : "This response requires a tutor or connected agent.";
    return;
  }
  if (event.target.id === "depot-subject" || event.target.id === "depot-sort") {
    lessonDepot.setFilters({ subject: document.querySelector("#depot-subject")?.value ?? "all", sort: document.querySelector("#depot-sort")?.value ?? "popular" });
    return;
  }
  if (event.target.id === "subject-select") {
    store.setLearningPreferences({ subjectId: event.target.value });
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
  if (!responseInput) return;
  const questionId = responseInput.dataset.questionId;
  const card = responseInput.closest(".question-card");
  const answerField = card.querySelector('[data-response-kind="answer"]:checked') ?? card.querySelector('[data-response-kind="answer"]');
  const workField = card.querySelector('[data-response-kind="work"]');
  store.updateResponse(questionId, { finalAnswer: answerField?.value ?? "", work: workField?.value ?? "" });
});

document.addEventListener("submit", (event) => {
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
    store.recordTutorFeedback({
      questionId: reviewed?.questionId ?? "attempt", feedback: data.get("feedback"), nextStep: data.get("next"),
      confidence: data.get("confidence"), verdict: data.get("verdict"), reviewerType: data.get("reviewer"),
      mistakeTag: reviewed?.mistakeTags?.[0] ?? "none",
    });
    showToast("Review saved to this profile.");
  }
});

document.addEventListener("keydown", (event) => {
  const mapNode = event.target.closest?.("[data-map-skill]");
  if (mapNode && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    store.selectMapSkill(mapNode.dataset.mapSkill);
  }
});

document.querySelector("#agent-toggle").addEventListener("click", () => openAgentStudio());
document.querySelector("#agent-close").addEventListener("click", () => closeAgentStudio());
document.querySelector("#copy-prompt").addEventListener("click", copyAgentPrompt);

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
  const response = await fetch("./curriculum-data.json?v=20260901-geography");
  if (!response.ok) throw new Error("Could not load the QuickMaths curriculum.");
  const curriculum = await response.json();
  let agentManifest = {};
  let communityConfig = { enabled: false };
  try {
    const manifestResponse = await fetch("./agent-manifest.json?v=20260902-storage-onboarding");
    if (manifestResponse.ok) agentManifest = await manifestResponse.json();
  } catch {
    // The tools still work if the optional human/machine-readable guide is unavailable.
  }
  try {
    const communityResponse = await fetch("./github-community-config.json", { cache: "no-store" });
    if (communityResponse.ok) communityConfig = await communityResponse.json();
  } catch {
    // External GitHub links remain available if optional in-app community authorization is unavailable.
  }
  store = createQuickMathsStore({ storage: window.localStorage, curriculum });
  lessonDepot = createLessonDepot({
    store,
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
  });
  githubSyncSnapshot = githubSync.snapshot();
  githubSync.subscribe((status) => {
    githubSyncSnapshot = status;
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
  document.querySelector("#agent-prompt").textContent = AGENT_STARTER_PROMPT;
  closeAgentStudio({ focusToggle: false });
  applyLocationRoute();
  store.subscribe(render);
  initClock();
  document.querySelector("#tool-list").innerHTML = TOOL_NAMES.map((name) => `<code>${name}</code>`).join("");
  document.querySelector("#tool-count").textContent = String(TOOL_NAMES.length);
  const bridge = await registerWebMcpTools(store, document.modelContext, agentManifest, lessonDepot, lessonStudio);
  elements.bridgeCard.dataset.state = bridge.available && !bridge.error ? "ready" : bridge.error ? "warning" : "idle";
  elements.bridgeStatus.textContent = bridge.error ? "WebMCP partly connected" : bridge.available ? "Agent tools connected" : "Ready for a WebMCP browser";
  elements.bridgeDetail.textContent = bridge.error
    ? `${bridge.registered.length} of ${TOOL_NAMES.length} tools registered.`
    : bridge.available
      ? `${bridge.registered.length} tools can navigate and tutor across QuickMaths.`
      : "Open this site in a compatible ChatGPT or Codex browser to expose the tools.";
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

boot().catch((error) => {
  elements.loading.innerHTML = `<p><strong>QuickMaths could not start.</strong></p><p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
});
