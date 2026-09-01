import { createQuickMathsStore, STATUS_COLORS } from "./challenge-core.js";
import { registerWebMcpTools, TOOL_NAMES } from "./webmcp-tools.js";

const elements = {
  loading: document.querySelector("#loading-screen"),
  welcome: document.querySelector("#welcome-screen"),
  shell: document.querySelector("#app-shell"),
  profiles: document.querySelector("#profile-list"),
  profileError: document.querySelector("#profile-error"),
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
  backupFile: document.querySelector("#backup-file"),
  lessonSetFile: document.querySelector("#lesson-set-file"),
  toast: document.querySelector("#toast"),
};

let store;
let currentSnapshot;
let toastTimer;
let routeHistoryReady = false;
let applyingHistory = false;

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

function statusChip(status) {
  return `<span class="status-chip" style="--status-color:${STATUS_COLORS[status] ?? STATUS_COLORS.locked}">${escapeHtml(status)}</span>`;
}

function renderDashboard(snapshot) {
  const counts = snapshot.progressCounts;
  const attempts = snapshot.attempts.slice(0, 5);
  const suggested = snapshot.suggested;
  elements.view.innerHTML = `
    <header class="page-head">
      <div>
        <p class="eyebrow">Learning dashboard</p>
        <h1>Welcome back, ${escapeHtml(snapshot.activeProfile.displayName)}.</h1>
        <p>Your map updates from saved attempts, confidence, reasoning review, and time—not just one score.</p>
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

function mapLayout(skills) {
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
  const groups = {};
  skills.forEach((skill) => { const depth = depthOf(skill.id); (groups[depth] ??= []).push(skill); });
  const positions = {};
  const maxDepth = Math.max(...Object.keys(groups).map(Number), 0);
  const widest = Math.max(...Object.values(groups).map((group) => group.length), 1);
  Object.entries(groups).forEach(([depth, group]) => {
    const columnHeight = group.length * 112;
    const offset = Math.max(32, (widest * 112 - columnHeight) / 2 + 32);
    group.forEach((skill, index) => { positions[skill.id] = { x: 42 + Number(depth) * 224, y: offset + index * 112 }; });
  });
  return { positions, width: Math.max(900, 84 + (maxDepth + 1) * 224), height: Math.max(620, widest * 112 + 64) };
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

function renderMap(snapshot) {
  const selected = rowForSkill(snapshot, snapshot.ui.selectedMapSkillId) ?? snapshot.progressRows[0];
  const selectedSkill = snapshot.curriculum.skills.find((skill) => skill.id === selected.id);
  const { positions, width, height } = mapLayout(snapshot.curriculum.skills);
  const edges = snapshot.curriculum.skills.flatMap((skill) => skill.prerequisites.map((prerequisite) => {
    const from = positions[prerequisite];
    const to = positions[skill.id];
    if (!from || !to) return "";
    const x1 = from.x + 178;
    const y1 = from.y + 35;
    const x2 = to.x;
    const y2 = to.y + 35;
    const bend = Math.max(40, (x2 - x1) * .5);
    return `<path d="M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}" />`;
  })).join("");
  const nodes = snapshot.progressRows.map((row) => {
    const position = positions[row.id];
    const lines = splitLabel(row.name);
    return `<g class="map-node ${row.id === selected.id ? "is-selected" : ""}" role="button" tabindex="0" data-map-skill="${escapeHtml(row.id)}" transform="translate(${position.x} ${position.y})">
      <rect width="178" height="70" rx="13" fill="${STATUS_COLORS[row.status] ?? STATUS_COLORS.locked}"></rect>
      <text x="14" y="24">${lines.map((line, index) => `<tspan x="14" dy="${index ? 15 : 0}">${escapeHtml(line)}</tspan>`).join("")}</text>
      <text class="map-node-meta" x="14" y="58">${escapeHtml(row.status)} · ${Math.round(row.masteryScore)}/100</text>
    </g>`;
  }).join("");

  elements.view.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">${snapshot.progressRows.length} connected skills${snapshot.lessonPacks.length ? ` · ${snapshot.lessonPacks.length} custom set${snapshot.lessonPacks.length === 1 ? "" : "s"}` : ""}</p><h1>Mastery map</h1><p>Every path begins with what you have already proven. Select a node to see why it is ready, locked, learning, or due for review.</p></div>
      <div class="page-actions"><label class="compact-select">Jump to skill<select id="map-skill-select">${skillOptions(snapshot, selected.id)}</select></label></div>
    </header>
    <div class="status-legend">${Object.entries(STATUS_COLORS).map(([status, color]) => `<span><i style="background:${color}"></i>${status}</span>`).join("")}</div>
    <section class="map-layout">
      <div class="map-scroll" aria-label="Interactive prerequisite map">
        <svg class="mastery-map" viewBox="0 0 ${width} ${height}" style="width:${width}px;height:${height}px">
          <g class="map-edges">${edges}</g>
          <g>${nodes}</g>
        </svg>
      </div>
      <aside class="map-detail">
        <div class="map-detail-top">${statusChip(selected.status)}<code>${escapeHtml(selected.id)}</code></div>
        <p class="eyebrow">${escapeHtml(selected.subdomain)}</p>
        <h2>${escapeHtml(selected.name)}</h2>
        <p>${escapeHtml(selected.description)}</p>
        <div class="detail-metrics">
          <span>Mastery<strong>${Math.round(selected.masteryScore)}/100</strong></span>
          <span>Latest<strong>${selected.latestScore == null ? "—" : `${Math.round(selected.latestScore * 100)}%`}</strong></span>
          <span>Confidence<strong>${selected.confidence == null ? "—" : `${selected.confidence}/5`}</strong></span>
        </div>
        <dl class="skill-relations">
          <div><dt>Prerequisites</dt><dd>${selected.prerequisites.length ? selected.prerequisites.map((id) => escapeHtml(store.skillsById[id]?.name ?? id)).join(", ") : "None"}</dd></div>
          <div><dt>Unlocks</dt><dd>${selected.unlocks.length ? selected.unlocks.map((id) => escapeHtml(store.skillsById[id]?.name ?? id)).join(", ") : "Track complete"}</dd></div>
        </dl>
        ${selected.status === "locked" ? `<div class="locked-note"><strong>Why locked?</strong><p>Prove ${selected.prerequisites.map((id) => escapeHtml(store.skillsById[id]?.name ?? id)).join(" and ")} first.</p></div>` : ""}
        ${selectedSkill.applications?.length ? `<div class="application-mini"><strong>Why this matters</strong>${selectedSkill.applications.slice(0, 2).map((item) => `<p>${escapeHtml(item.title)}: ${escapeHtml(item.description)}</p>`).join("")}</div>` : ""}
        <div class="map-detail-actions">
          <button class="button button-secondary" type="button" data-route="lesson" data-skill-id="${escapeHtml(selected.id)}">Open lesson</button>
          <button class="button button-primary" type="button" data-action="start-test" data-skill-id="${escapeHtml(selected.id)}" ${selected.status === "locked" ? "disabled" : ""}>Take test</button>
        </div>
      </aside>
    </section>
  `;
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
        <dl class="skill-relations"><div><dt>Prerequisites</dt><dd>${row.prerequisites.length ? row.prerequisites.map((id) => escapeHtml(store.skillsById[id]?.name ?? id)).join(", ") : "None"}</dd></div><div><dt>Unlocks</dt><dd>${row.unlocks.length ? row.unlocks.map((id) => escapeHtml(store.skillsById[id]?.name ?? id)).join(", ") : "Track complete"}</dd></div></dl>
        ${row.status === "locked" ? `<div class="locked-note"><strong>Lesson available, test locked</strong><p>Prove the prerequisite skills before testing this one.</p></div>` : `<button class="button button-primary" type="button" data-action="start-test" data-skill-id="${escapeHtml(skill.id)}">Start ${skill.problems.length}-question test</button>`}
      </div>
      <article class="theory-card">
        <p class="eyebrow">Core idea</p>
        <div class="theory-copy">${formatTheory(skill.theory)}</div>
      </article>
    </section>
    ${skill.applications?.length ? `<section class="application-grid"><div class="section-title"><p class="eyebrow">Why this matters</p><h2>Math that travels</h2></div>${skill.applications.map((item) => `<article><strong>${escapeHtml(item.title ?? item.subject ?? "Application")}</strong><p>${escapeHtml(item.description)}</p></article>`).join("")}</section>` : ""}
    <section class="examples-section">
      <div class="section-title"><p class="eyebrow">Worked examples</p><h2>Watch the method</h2></div>
      <div class="example-list">${skill.examples.map((example, index) => `<details ${index === 0 ? "open" : ""}><summary><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(example.prompt)}</summary><div><p class="example-solution">${escapeHtml(example.solution)}</p><p>${escapeHtml(example.explanation)}</p></div></details>`).join("")}</div>
    </section>
  `;
}

function renderWorkGuide(problem) {
  const mode = problem.work?.mode;
  if (mode === "proof_obligations") {
    const strategies = problem.work?.proof_policy?.accepted_strategies ?? [];
    return `<details class="work-guide"><summary>Proof skeleton</summary>${strategies.map((strategy) => `<strong>${escapeHtml(strategy.name ?? strategy.id)}</strong><p>${escapeHtml(strategy.description ?? "")}</p>`).join("")}</details>`;
  }
  if (mode === "rubric_check") {
    const criteria = problem.work?.rubric?.criteria ?? [];
    return `<details class="work-guide"><summary>Rubric</summary><ul>${criteria.map((item) => `<li>${escapeHtml(item.label ?? item.id)} · ${escapeHtml(item.points)} pts</li>`).join("")}</ul></details>`;
  }
  return "";
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
          ${problem.work?.mode && problem.work.mode !== "none" ? `<label class="response-field work-field"><span>${escapeHtml(problem.work.prompt ?? "Show your work")} ${problem.work_required ? "(required)" : "(optional)"}</span><textarea rows="4" data-question-id="${escapeHtml(problem.template_id)}" data-response-kind="work" placeholder="One reasoning step per line…">${escapeHtml(response.work)}</textarea></label>` : ""}
        </article>`;
      }).join("")}
      <p id="test-error" class="form-message" role="alert"></p>
      <div class="sticky-submit"><span>Your draft is saved automatically in this browser.</span><button class="button button-primary" type="submit">Submit answers</button></div>
    </form>
  `;
}

function resultDetails(results) {
  return results.map((result, index) => `<details class="result-question" ${!result.correct ? "open" : ""}>
    <summary><span class="result-icon ${result.correct ? "correct" : "incorrect"}">${result.correct ? "✓" : "×"}</span><span><strong>Question ${index + 1}</strong><small>${escapeHtml(result.prompt)}</small></span><b>${result.correct ? "Correct" : "Needs work"}</b></summary>
    <div class="result-body"><dl><div><dt>Your answer</dt><dd>${escapeHtml(result.finalAnswer || "No answer")}</dd></div><div><dt>Expected</dt><dd>${escapeHtml(result.expectedAnswer)}</dd></div></dl>${result.work ? `<div class="shown-work"><strong>Your work</strong><pre>${escapeHtml(result.work)}</pre></div>` : ""}${result.mistakeTags?.length ? `<p class="mistake-tags">Review: ${result.mistakeTags.map(escapeHtml).join(" · ")}</p>` : ""}${result.solutionSteps?.length ? `<ol>${result.solutionSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>` : ""}</div>
  </details>`).join("");
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
    ${!pending && attempt?.results?.some((item) => item.work) ? `<section class="self-review content-card"><div class="card-heading"><div><h2>Add tutor / self review</h2><p>Save a reasoning verdict beside this attempt.</p></div></div><form id="self-review-form"><div class="review-form-grid"><label>Reviewer<select name="reviewer"><option value="self">Self</option><option value="human_tutor">Human tutor</option><option value="ai_tutor">AI tutor</option></select></label><label>Verdict<select name="verdict"><option value="pass">Pass</option><option value="partial" selected>Partial</option><option value="needs_revision">Needs revision</option><option value="fail">Fail</option></select></label><label>Confidence<select name="confidence"><option>low</option><option selected>medium</option><option>high</option></select></label></div><label>Feedback<textarea name="feedback" rows="3" required></textarea></label><label>Next step<input name="next" required></label><button class="button button-secondary" type="submit">Save review</button></form></section>` : ""}
  `;
}

const TUTOR_SETUP_PROMPT = `You are my QuickMaths tutor. Use the learner's mastery map, attempts, shown work, confidence, and mistake tags. Diagnose briefly, teach one concept at a time, ask one practice question at a time, and do not reveal answers before I attempt them. Save concise Socratic feedback in the app when WebMCP tools are available. At natural stopping points, before imports or lesson-set changes, and whenever the app says a backup is recommended, ask me to download a full JSON backup from Save & load.`;

function renderData(snapshot) {
  const backup = snapshot.backupStatus;
  elements.view.innerHTML = `
    <header class="page-head"><div><p class="eyebrow">Data portability & custom content</p><h1>Save & load</h1><p>QuickMaths autosaves on this device. A JSON backup moves every profile, lesson set, attempt, review, timer, and mastery record without an account.</p></div><div class="page-actions"><button class="button button-outline" data-action="load-backup">Load backup</button><button class="button button-primary" data-action="save-backup">Save full backup</button></div></header>
    ${backup.recommended ? `<aside class="backup-recommendation"><span aria-hidden="true">↧</span><div><strong>Portable backup recommended</strong><p>${escapeHtml(backup.reason)}</p></div><button class="button button-primary" data-action="save-backup">Download now</button></aside>` : ""}
    <section class="storage-summary">
      <article><span>Storage</span><strong>${snapshot.storageError ? "Needs backup" : "Autosaving"}</strong><small>${snapshot.storageError ? escapeHtml(snapshot.storageError) : "Browser local storage"}</small></article>
      <article><span>Current profile</span><strong>${escapeHtml(snapshot.activeProfile.displayName)}</strong><small>${snapshot.attempts.length} saved attempts</small></article>
      <article><span>Portable backup</span><strong>${backup.lastExportAt ? escapeHtml(formatDate(backup.lastExportAt)) : "Not yet"}</strong><small>${backup.recommended ? `${backup.attemptsSinceExport} new attempt${backup.attemptsSinceExport === 1 ? "" : "s"}` : "Up to date"}</small></article>
      <article><span>Custom lesson sets</span><strong>${snapshot.lessonPacks.length}</strong><small>${snapshot.lessonPacks.reduce((count, pack) => count + pack.skillCount, 0)} added skills</small></article>
    </section>
    <section class="data-grid">
      <article class="content-card"><div class="card-heading"><div><h2>Full progress backup</h2><p>Includes installed lesson sets and every learner record.</p></div></div><div class="backup-flow"><span>1<strong>Autosave</strong><small>Every edit stays here</small></span><b>→</b><span>2<strong>Download</strong><small>Keep the JSON file</small></span><b>→</b><span>3<strong>Load</strong><small>Confirmed full restore</small></span></div><div class="data-actions"><button class="button button-primary" data-action="save-backup">Download JSON backup</button><button class="button button-outline" data-action="load-backup">Choose backup file</button></div></article>
      <article class="content-card"><div class="card-heading"><div><h2>Spreadsheet exports</h2><p>Human-readable snapshots for analysis.</p></div></div><div class="export-list"><button data-action="download-csv" data-kind="progress"><span>Progress</span><small>Status, mastery, scores, confidence</small><b>CSV ↓</b></button><button data-action="download-csv" data-kind="attempts"><span>Attempts</span><small>Scores, dates, mastery updates</small><b>CSV ↓</b></button><button data-action="download-csv" data-kind="reviews"><span>Reviews</span><small>Verdicts, feedback, next steps</small><b>CSV ↓</b></button></div></article>
    </section>
    <section class="content-card lesson-packs-card">
      <div class="card-heading"><div><p class="eyebrow">Extend the curriculum</p><h2>Custom lesson sets</h2><p>Load validated JSON lessons into the same map, testing, progress, and backup pipeline.</p></div><button class="button button-primary" data-action="load-lesson-set">Load lesson set</button></div>
      <div class="lesson-pack-guide"><div><strong>Build your own</strong><p>Start from the working example, keep IDs namespaced, then let QuickMaths validate prerequisites, grading, questions, and safety limits before anything is installed.</p></div><a class="button button-outline" href="./lesson-set-example.json" download>Download example</a><a class="button button-secondary" href="./CUSTOM_LESSON_SETS.md" target="_blank" rel="noopener">Read authoring guide</a></div>
      <div class="installed-packs">
        ${snapshot.lessonPacks.length ? snapshot.lessonPacks.map((pack) => `<article><span class="pack-mark">＋</span><div><strong>${escapeHtml(pack.name)}</strong><p>${escapeHtml(pack.description)}</p><small>${pack.skillCount} skill${pack.skillCount === 1 ? "" : "s"} · ${pack.problemCount} problems · ${escapeHtml(pack.author)} · v${escapeHtml(pack.version)}</small></div><button class="quiet-button" data-action="export-lesson-set" data-pack-id="${escapeHtml(pack.id)}">Download source</button></article>`).join("") : `<div class="empty-state">No custom sets installed. The built-in 25-skill Algebra Foundations track remains available.</div>`}
      </div>
      <p class="pack-security-note"><strong>Teacher-file warning:</strong> lesson-set JSON contains answer keys and solutions. Don’t paste the raw file into a learner tutoring conversation.</p>
    </section>
    <section class="content-card tutor-setup"><div class="card-heading"><div><h2>Tutor setup prompt</h2><p>Use this in any AI tutor when WebMCP is unavailable.</p></div><button class="quiet-button" data-action="copy-tutor-setup">Copy prompt</button></div><pre id="tutor-setup-prompt">${escapeHtml(TUTOR_SETUP_PROMPT)}</pre></section>
  `;
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
    if (button.tagName === "BUTTON") button.setAttribute("aria-current", button.dataset.route === route ? "page" : "false");
  });
}

function render(snapshot) {
  currentSnapshot = snapshot;
  elements.loading.hidden = true;
  const signedIn = Boolean(snapshot.activeProfile);
  elements.welcome.hidden = signedIn;
  elements.shell.hidden = !signedIn;
  if (!signedIn) {
    renderProfiles(snapshot);
    if (location.hash !== "#/welcome") history.replaceState(null, "", "#/welcome");
    routeHistoryReady = true;
    return;
  }

  elements.profileName.textContent = snapshot.activeProfile.displayName;
  elements.profileAvatar.textContent = snapshot.activeProfile.displayName.slice(0, 1).toUpperCase();
  elements.sessionTime.textContent = formatDuration(snapshot.timers.sessionSeconds);
  elements.profileTime.textContent = formatDuration(snapshot.timers.profileSeconds);
  renderActivity(snapshot.activity);
  syncNavigation(snapshot.ui.route);
  if (snapshot.ui.route === "home") renderDashboard(snapshot);
  else if (snapshot.ui.route === "map") renderMap(snapshot);
  else if (snapshot.ui.route === "lesson") renderLesson(snapshot);
  else if (snapshot.ui.route === "test") renderTest(snapshot);
  else if (snapshot.ui.route === "results") renderResults(snapshot);
  else if (snapshot.ui.route === "data") renderData(snapshot);
  const nextHash = snapshot.ui.route === "home" ? "#/home" : `#/${snapshot.ui.route}/${snapshot.ui.selectedSkillId}`;
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
  if (!["home", "map", "lesson", "test", "results", "data"].includes(route)) return;
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

document.querySelector("#create-profile-form").addEventListener("submit", (event) => {
  event.preventDefault();
  elements.profileError.textContent = "";
  try {
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
    const confirmed = window.confirm(
      `Install ${preview.name}?\n\n${preview.skillCount} skill(s) · ${preview.problemCount} problems\nAuthor: ${preview.author}\nVersion: ${preview.version}\n\nThe set will be added to the mastery map and embedded in future full backups. Download a progress backup first if you want a restore point before changing installed content.`,
    );
    if (!confirmed) return;
    const result = store.importLessonPack(raw);
    showToast(`${result.name} installed. ${result.totalSkillCount} skills are now available.`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error));
  } finally {
    elements.lessonSetFile.value = "";
  }
});

document.addEventListener("click", (event) => {
  const mapNode = event.target.closest?.("[data-map-skill]");
  if (mapNode) store.selectMapSkill(mapNode.dataset.mapSkill);
  const routeButton = event.target.closest("[data-route]");
  if (routeButton && currentSnapshot?.activeProfile) {
    const route = routeButton.dataset.route;
    const skillId = routeButton.dataset.skillId || null;
    store.navigate(route, skillId);
    elements.agentDock.classList.remove("is-open");
  }
  const action = event.target.closest("[data-action]");
  if (!action) return;
  if (action.dataset.action === "save-backup") saveBackup();
  if (["start-suggested", "start-test", "retake"].includes(action.dataset.action)) store.startTest(action.dataset.skillId);
  if (action.dataset.action === "open-attempt") store.openAttempt(action.dataset.attemptId);
  if (action.dataset.action === "load-backup") elements.backupFile.click();
  if (action.dataset.action === "load-lesson-set") elements.lessonSetFile.click();
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
  if (event.target.id === "lesson-select") store.navigate("lesson", event.target.value);
  if (event.target.id === "map-skill-select") store.selectMapSkill(event.target.value);
  if (event.target.id === "test-skill-select") store.navigate("test", event.target.value);
});

document.addEventListener("input", (event) => {
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
    const reviewed = attempt?.results?.find((result) => result.work) ?? attempt?.results?.[0];
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

document.querySelector("#agent-toggle").addEventListener("click", () => elements.agentDock.classList.toggle("is-open"));
document.querySelector("#agent-close").addEventListener("click", () => elements.agentDock.classList.remove("is-open"));
document.querySelector("#copy-prompt").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector("#agent-prompt").textContent.trim());
    showToast("Agent prompt copied.");
  } catch { showToast("Select the prompt to copy it."); }
});

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
  const response = await fetch("./curriculum-data.json");
  if (!response.ok) throw new Error("Could not load the QuickMaths curriculum.");
  const curriculum = await response.json();
  let agentManifest = {};
  try {
    const manifestResponse = await fetch("./agent-manifest.json");
    if (manifestResponse.ok) agentManifest = await manifestResponse.json();
  } catch {
    // The tools still work if the optional human/machine-readable guide is unavailable.
  }
  store = createQuickMathsStore({ storage: window.localStorage, curriculum });
  applyLocationRoute();
  store.subscribe(render);
  initClock();
  document.querySelector("#tool-list").innerHTML = TOOL_NAMES.map((name) => `<code>${name}</code>`).join("");
  document.querySelector("#tool-count").textContent = String(TOOL_NAMES.length);
  const bridge = await registerWebMcpTools(store, document.modelContext, agentManifest);
  elements.bridgeCard.dataset.state = bridge.available && !bridge.error ? "ready" : bridge.error ? "warning" : "idle";
  elements.bridgeStatus.textContent = bridge.error ? "WebMCP partly connected" : bridge.available ? "Agent tools connected" : "Ready for a WebMCP browser";
  elements.bridgeDetail.textContent = bridge.error
    ? `${bridge.registered.length} of ${TOOL_NAMES.length} tools registered.`
    : bridge.available
      ? `${bridge.registered.length} tools can navigate and tutor across QuickMaths.`
      : "Open this site in a compatible ChatGPT or Codex browser to expose the tools.";
  render(store.snapshot());
  window.setInterval(() => {
    store.heartbeat();
    const snapshot = store.snapshot();
    elements.sessionTime.textContent = formatDuration(snapshot.timers.sessionSeconds);
    elements.profileTime.textContent = formatDuration(snapshot.timers.profileSeconds);
  }, 1000);
  document.addEventListener("visibilitychange", () => { if (document.hidden) store.heartbeat(true); });
  window.addEventListener("pagehide", () => store.heartbeat(true));
  window.addEventListener("storage", (event) => { if (event.key === "quickmaths.web.v2") store.replaceFromStorage(); });
  window.addEventListener("popstate", applyLocationRoute);
  window.addEventListener("hashchange", applyLocationRoute);
}

boot().catch((error) => {
  elements.loading.innerHTML = `<p><strong>QuickMaths could not start.</strong></p><p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
});
