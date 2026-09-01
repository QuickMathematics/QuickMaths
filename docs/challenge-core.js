export const STORAGE_KEY = "quickmaths.web.v2";
export const LEGACY_STORAGE_KEY = "quickmaths.webmcp.challenge.v1";
export const APP_VERSION = 2;

export const STATUS_COLORS = Object.freeze({
  locked: "#858a89",
  ready: "#2f74c0",
  learning: "#c47a18",
  proven: "#2f8f46",
  mastered: "#176b34",
  rusty: "#c43d3d",
});

const PROVEN = new Set(["proven", "mastered"]);
const ROUTES = new Set(["welcome", "home", "map", "lesson", "test", "results", "data"]);
const MAX_ACTIVITY = 60;
const MAX_ATTEMPTS = 500;
const MAX_REVIEWS = 1000;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanText(value, maxLength = 1000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanNumber(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function makeId(prefix = "id") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function initialState() {
  return {
    version: APP_VERSION,
    activeProfileId: null,
    profiles: [],
    progress: {},
    attempts: [],
    reviews: [],
    drafts: {},
    ui: {
      route: "welcome",
      selectedSkillId: "MATH_ARITH_001",
      selectedMapSkillId: "MATH_ARITH_001",
      activeAttemptId: null,
      pendingResults: null,
      agentOpen: false,
    },
    session: null,
    activity: [],
  };
}

function sanitizeProfile(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const id = cleanText(candidate.id, 100);
  const displayName = cleanText(candidate.displayName ?? candidate.display_name, 60);
  if (!id || !displayName) return null;
  return {
    id,
    displayName,
    createdAt: cleanText(candidate.createdAt, 40) || new Date().toISOString(),
    totalLoggedSeconds: Math.floor(cleanNumber(candidate.totalLoggedSeconds, 0, 0, 100_000_000)),
    demo: Boolean(candidate.demo),
  };
}

function sanitizeProgress(progress, profileIds, skillIds) {
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) return {};
  const output = {};
  for (const profileId of profileIds) {
    const rows = progress[profileId];
    if (!rows || typeof rows !== "object" || Array.isArray(rows)) continue;
    output[profileId] = {};
    for (const skillId of skillIds) {
      const row = rows[skillId];
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const status = ["ready", "learning", "proven", "mastered", "rusty", "locked"].includes(row.status)
        ? row.status
        : "learning";
      output[profileId][skillId] = {
        status,
        masteryScore: cleanNumber(row.masteryScore, 0, 0, 100),
        confidenceRating: row.confidenceRating == null ? null : Math.round(cleanNumber(row.confidenceRating, 3, 1, 5)),
        lastTestScore: row.lastTestScore == null ? null : cleanNumber(row.lastTestScore, 0, 0, 1),
        bestTestScore: row.bestTestScore == null ? null : cleanNumber(row.bestTestScore, 0, 0, 1),
        attemptCount: Math.floor(cleanNumber(row.attemptCount, 0, 0, 10_000)),
        lastAttemptAt: cleanText(row.lastAttemptAt, 40) || null,
        nextReviewAt: cleanText(row.nextReviewAt, 40) || null,
        mistakeTags: Array.isArray(row.mistakeTags)
          ? row.mistakeTags.map((tag) => cleanText(tag, 80)).filter(Boolean).slice(0, 12)
          : [],
        notes: cleanText(row.notes, 2000),
        updatedAt: cleanText(row.updatedAt, 40) || new Date().toISOString(),
      };
    }
  }
  return output;
}

function sanitizeResult(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const questionId = cleanText(candidate.questionId ?? candidate.question_id, 120);
  if (!questionId) return null;
  return {
    questionId,
    prompt: cleanText(candidate.prompt, 2000),
    finalAnswer: cleanText(candidate.finalAnswer, 300),
    work: cleanText(candidate.work, 5000),
    expectedAnswer: cleanText(candidate.expectedAnswer, 300),
    correct: Boolean(candidate.correct),
    gradingMethod: cleanText(candidate.gradingMethod, 60),
    solutionSteps: Array.isArray(candidate.solutionSteps) ? candidate.solutionSteps.map((step) => cleanText(step, 1000)).filter(Boolean).slice(0, 20) : [],
    mistakeTags: Array.isArray(candidate.mistakeTags) ? candidate.mistakeTags.map((tag) => cleanText(tag, 80)).filter(Boolean).slice(0, 12) : [],
    workRequired: Boolean(candidate.workRequired),
  };
}

function sanitizeAttempt(candidate, profileIds, skillIds) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const attemptId = cleanText(candidate.attemptId, 120);
  const profileId = cleanText(candidate.profileId, 100);
  const skillId = cleanText(candidate.skillId, 60);
  if (!attemptId || !profileIds.has(profileId) || !skillIds.has(skillId)) return null;
  const results = Array.isArray(candidate.results) ? candidate.results.map(sanitizeResult).filter(Boolean).slice(0, 20) : [];
  const reflection = candidate.reflection && typeof candidate.reflection === "object" ? candidate.reflection : {};
  const masteryUpdate = candidate.masteryUpdate && typeof candidate.masteryUpdate === "object" ? candidate.masteryUpdate : {};
  return {
    attemptId,
    profileId,
    skillId,
    skillName: cleanText(candidate.skillName, 160),
    startedAt: cleanText(candidate.startedAt, 40),
    completedAt: cleanText(candidate.completedAt, 40),
    rawScore: Math.floor(cleanNumber(candidate.rawScore, 0, 0, results.length)),
    scoreTotal: Math.floor(cleanNumber(candidate.scoreTotal, results.length, 0, 20)),
    percentScore: cleanNumber(candidate.percentScore, 0, 0, 1),
    reflection: {
      confidenceRating: Math.round(cleanNumber(reflection.confidenceRating, 3, 1, 5)),
      difficultyFelt: ["easy", "medium", "hard", "brutal"].includes(reflection.difficultyFelt) ? reflection.difficultyFelt : "medium",
      hintsUsed: ["none", "little", "some", "a_lot"].includes(reflection.hintsUsed) ? reflection.hintsUsed : "none",
      guessed: ["no", "maybe", "yes"].includes(reflection.guessed) ? reflection.guessed : "no",
      wantsMorePractice: reflection.wantsMorePractice === "no" ? "no" : "yes",
      confusingParts: cleanText(reflection.confusingParts, 2000),
      notes: cleanText(reflection.notes, 2000),
    },
    results,
    masteryUpdate: {
      status: ["ready", "learning", "proven", "mastered", "rusty"].includes(masteryUpdate.status) ? masteryUpdate.status : "learning",
      masteryScore: cleanNumber(masteryUpdate.masteryScore, 0, 0, 100),
    },
    reviewStatus: cleanText(candidate.reviewStatus, 60) || "graded",
    hasPendingReview: Boolean(candidate.hasPendingReview),
  };
}

function sanitizeReview(candidate, profileIds) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const reviewId = cleanText(candidate.reviewId, 120);
  const profileId = cleanText(candidate.profileId, 100);
  if (!reviewId || !profileIds.has(profileId)) return null;
  return {
    reviewId,
    profileId,
    attemptId: cleanText(candidate.attemptId, 120) || null,
    draftId: cleanText(candidate.draftId, 120) || null,
    questionId: cleanText(candidate.questionId, 120),
    reviewerType: ["ai_tutor", "human_tutor", "self"].includes(candidate.reviewerType) ? candidate.reviewerType : "ai_tutor",
    verdict: ["pass", "partial", "needs_revision", "fail"].includes(candidate.verdict) ? candidate.verdict : "partial",
    score: cleanNumber(candidate.score, 0, 0, 1),
    reviewerConfidence: ["low", "medium", "high"].includes(candidate.reviewerConfidence) ? candidate.reviewerConfidence : "medium",
    mistakeTag: cleanText(candidate.mistakeTag, 80),
    feedback: cleanText(candidate.feedback, 1500),
    nextStep: cleanText(candidate.nextStep, 300),
    createdAt: cleanText(candidate.createdAt, 40),
  };
}

function sanitizeDrafts(candidate, profileIds, curriculum) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return {};
  const skillsById = Object.fromEntries(curriculum.skills.map((skill) => [skill.id, skill]));
  const output = {};
  for (const profileId of profileIds) {
    const profileDrafts = candidate[profileId];
    if (!profileDrafts || typeof profileDrafts !== "object" || Array.isArray(profileDrafts)) continue;
    output[profileId] = {};
    for (const [skillId, rawDraft] of Object.entries(profileDrafts)) {
      const skill = skillsById[skillId];
      if (!skill || !rawDraft || typeof rawDraft !== "object" || Array.isArray(rawDraft)) continue;
      const canonical = Object.fromEntries(skill.problems.map((problem) => [problem.template_id, problem]));
      const problemIds = Array.isArray(rawDraft.problems)
        ? rawDraft.problems.map((problem) => cleanText(problem?.template_id, 120)).filter((id) => canonical[id]).slice(0, 5)
        : [];
      if (!problemIds.length) continue;
      const responses = rawDraft.responses && typeof rawDraft.responses === "object" ? rawDraft.responses : {};
      output[profileId][skillId] = {
        draftId: cleanText(rawDraft.draftId, 120) || `draft-imported-${profileId}-${skillId}`,
        skillId,
        startedAt: cleanText(rawDraft.startedAt, 40) || new Date().toISOString(),
        problems: problemIds.map((id) => clone(canonical[id])),
        responses: Object.fromEntries(problemIds.map((id) => [id, {
          finalAnswer: cleanText(responses[id]?.finalAnswer, 300),
          work: cleanText(responses[id]?.work, 5000),
        }])),
      };
    }
  }
  return output;
}

function sanitizePendingResults(candidate, skillIds) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const skillId = cleanText(candidate.skillId, 60);
  const draftId = cleanText(candidate.draftId, 120);
  if (!skillIds.has(skillId) || !draftId || !Array.isArray(candidate.results)) return null;
  const results = candidate.results.map(sanitizeResult).filter(Boolean).slice(0, 20);
  if (!results.length) return null;
  return {
    draftId,
    skillId,
    submittedAt: cleanText(candidate.submittedAt, 40),
    results,
    rawScore: Math.floor(cleanNumber(candidate.rawScore, 0, 0, results.length)),
    scoreTotal: results.length,
    percentScore: cleanNumber(candidate.percentScore, 0, 0, 1),
  };
}

function sanitizeState(candidate, curriculum) {
  const base = initialState();
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return base;
  const skills = new Set(curriculum.skills.map((skill) => skill.id));
  const profiles = Array.isArray(candidate.profiles)
    ? candidate.profiles.map(sanitizeProfile).filter(Boolean).slice(0, 30)
    : [];
  const profileIds = new Set(profiles.map((profile) => profile.id));
  const activeProfileId = profileIds.has(candidate.activeProfileId) ? candidate.activeProfileId : null;
  const ui = candidate.ui && typeof candidate.ui === "object" ? candidate.ui : {};
  const route = ROUTES.has(ui.route) ? ui.route : activeProfileId ? "home" : "welcome";
  const selectedSkillId = skills.has(ui.selectedSkillId) ? ui.selectedSkillId : curriculum.track.entry_skills[0];

  const attempts = Array.isArray(candidate.attempts)
    ? candidate.attempts.map((item) => sanitizeAttempt(item, profileIds, skills)).filter(Boolean).slice(-MAX_ATTEMPTS)
    : [];
  const reviews = Array.isArray(candidate.reviews)
    ? candidate.reviews.map((item) => sanitizeReview(item, profileIds)).filter(Boolean).slice(-MAX_REVIEWS)
    : [];
  return {
    ...base,
    activeProfileId,
    profiles,
    progress: sanitizeProgress(candidate.progress, profileIds, skills),
    attempts,
    reviews,
    drafts: sanitizeDrafts(candidate.drafts, profileIds, curriculum),
    ui: {
      route: activeProfileId ? (route === "welcome" ? "home" : route) : "welcome",
      selectedSkillId,
      selectedMapSkillId: skills.has(ui.selectedMapSkillId) ? ui.selectedMapSkillId : selectedSkillId,
      activeAttemptId: attempts.some((attempt) => attempt.attemptId === ui.activeAttemptId) ? ui.activeAttemptId : null,
      pendingResults: sanitizePendingResults(ui.pendingResults, skills),
      agentOpen: Boolean(ui.agentOpen),
    },
    session: candidate.session && profileIds.has(candidate.session.profileId)
      ? {
          profileId: candidate.session.profileId,
          startedAt: cleanNumber(candidate.session.startedAt, Date.now(), 0),
          heartbeatAt: cleanNumber(candidate.session.heartbeatAt, Date.now(), 0),
        }
      : null,
    activity: Array.isArray(candidate.activity)
      ? candidate.activity
          .filter((item) => item && typeof item === "object")
          .map((item) => ({
            at: cleanText(item.at, 40),
            tool: cleanText(item.tool, 80),
            message: cleanText(item.message, 200),
            profileId: profileIds.has(item.profileId) ? item.profileId : null,
          }))
          .filter((item) => item.at && item.tool && item.message)
          .slice(-MAX_ACTIVITY)
      : [],
  };
}

function migrateLegacy(storage, curriculum) {
  try {
    const legacy = JSON.parse(storage?.getItem(LEGACY_STORAGE_KEY) ?? "null");
    if (!legacy || typeof legacy !== "object") return null;
    const state = initialState();
    const now = new Date().toISOString();
    const profile = { id: "profile-migrated-demo", displayName: "Demo Learner", createdAt: now, totalLoggedSeconds: 0, demo: true };
    state.profiles = [profile];
    state.activeProfileId = profile.id;
    state.ui.route = "home";
    state.ui.selectedSkillId = "MATH_ALG_002";
    state.progress[profile.id] = {
      MATH_ALG_002: {
        status: legacy.finalAnswerStatus === "correct" ? "proven" : "learning",
        masteryScore: Math.round(cleanNumber(legacy.masteryScore, 0.45, 0, 1) * 100),
        confidenceRating: 3,
        lastTestScore: legacy.finalAnswerStatus === "correct" ? 1 : null,
        bestTestScore: legacy.finalAnswerStatus === "correct" ? 1 : null,
        attemptCount: Math.floor(cleanNumber(legacy.attemptCount, 0, 0, 1000)),
        lastAttemptAt: now,
        nextReviewAt: null,
        mistakeTags: Array.isArray(legacy.mistakeTags) ? legacy.mistakeTags.slice(0, 8) : [],
        notes: "Migrated from the original WebMCP challenge demo.",
        updatedAt: now,
      },
    };
    return sanitizeState(state, curriculum);
  } catch {
    return null;
  }
}

export function loadState(storage, curriculum) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) return sanitizeState(JSON.parse(raw), curriculum);
  } catch {
    // Fall through to migration or a clean state.
  }
  return migrateLegacy(storage, curriculum) ?? initialState();
}

function normalizeAnswer(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[−–]/g, "-")
    .replace(/\s+/g, "")
    .replace(/[.]+$/, "");
}

function numericValue(value) {
  const clean = normalizeAnswer(value).replace(/^[a-z]=/, "");
  if (/^-?\d+(\.\d+)?\/-?\d+(\.\d+)?$/.test(clean)) {
    const [numerator, denominator] = clean.split("/").map(Number);
    return denominator ? numerator / denominator : Number.NaN;
  }
  if (/^-?\d+\s+-?\d+\/\d+$/.test(String(value).trim())) {
    const [whole, fraction] = String(value).trim().split(/\s+/);
    const [numerator, denominator] = fraction.split("/").map(Number);
    return Number(whole) + Math.sign(Number(whole) || 1) * numerator / denominator;
  }
  return Number(clean);
}

function expressionTokens(value) {
  const source = String(value ?? "").replace(/[−–]/g, "-").replace(/\s+/g, "");
  if (!source || source.length > 300) return null;
  const raw = [];
  for (let index = 0; index < source.length;) {
    const rest = source.slice(index);
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    const identifier = rest.match(/^[A-Za-z][A-Za-z0-9_]*/);
    if (number) {
      raw.push({ type: "number", value: Number(number[0]) });
      index += number[0].length;
    } else if (identifier) {
      raw.push({ type: "identifier", value: identifier[0] });
      index += identifier[0].length;
    } else if ("+-*/^()".includes(source[index])) {
      raw.push({ type: "operator", value: source[index] });
      index += 1;
    } else {
      return null;
    }
    if (raw.length > 200) return null;
  }
  const tokens = [];
  const endsValue = (token) => token && (token.type === "number" || token.type === "identifier" || token.value === ")");
  const startsValue = (token) => token && (token.type === "number" || token.type === "identifier" || token.value === "(");
  for (const token of raw) {
    if (endsValue(tokens.at(-1)) && startsValue(token)) tokens.push({ type: "operator", value: "*" });
    tokens.push(token);
  }
  return tokens;
}

function evaluateExpression(tokens, variables) {
  let index = 0;
  const peek = (value) => tokens[index]?.value === value;
  const take = () => tokens[index++];
  const primary = () => {
    const token = take();
    if (!token) throw new Error("Unexpected end of expression.");
    if (token.type === "number") return token.value;
    if (token.type === "identifier") {
      if (!(token.value in variables)) throw new Error("Unknown variable.");
      return variables[token.value];
    }
    if (token.value === "(") {
      const value = addSubtract();
      if (!peek(")")) throw new Error("Missing closing parenthesis.");
      take();
      return value;
    }
    throw new Error("Invalid expression.");
  };
  const power = () => {
    let value = primary();
    if (peek("^")) {
      take();
      value **= unary();
    }
    return value;
  };
  const unary = () => {
    if (peek("+")) { take(); return unary(); }
    if (peek("-")) { take(); return -unary(); }
    return power();
  };
  const multiplyDivide = () => {
    let value = unary();
    while (peek("*") || peek("/")) {
      const operator = take().value;
      const right = unary();
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  };
  const addSubtract = () => {
    let value = multiplyDivide();
    while (peek("+") || peek("-")) {
      const operator = take().value;
      const right = multiplyDivide();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };
  const result = addSubtract();
  if (index !== tokens.length) throw new Error("Unexpected token.");
  return result;
}

function symbolicEquivalent(left, right) {
  const leftTokens = expressionTokens(left);
  const rightTokens = expressionTokens(right);
  if (!leftTokens || !rightTokens) return false;
  const names = [...new Set([...leftTokens, ...rightTokens].filter((token) => token.type === "identifier").map((token) => token.value))];
  if (names.length > 12) return false;
  let successfulSamples = 0;
  for (let sample = 0; sample < 8; sample += 1) {
    const variables = Object.fromEntries(names.map((name, variableIndex) => {
      let seed = (((sample + 1) * 2654435761) ^ ((variableIndex + 11) * 2246822519)) >>> 0;
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      const magnitude = 2 + ((seed >>> 1) % 17);
      return [name, seed & 1 ? -magnitude : magnitude];
    }));
    try {
      const leftValue = evaluateExpression(leftTokens, variables);
      const rightValue = evaluateExpression(rightTokens, variables);
      if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) continue;
      const scale = Math.max(1, Math.abs(leftValue), Math.abs(rightValue));
      if (Math.abs(leftValue - rightValue) > 1e-8 * scale) return false;
      successfulSamples += 1;
    } catch {
      return false;
    }
  }
  return successfulSamples >= 3;
}

function gradeProblem(problem, answer) {
  const expected = String(problem.expected_answer ?? "");
  const method = problem.grading_method;
  const normalizedExpected = normalizeAnswer(expected);
  const normalizedAnswer = normalizeAnswer(answer);
  let correct = false;

  if (["exact_numeric", "numeric_with_tolerance"].includes(method)) {
    const expectedNumber = numericValue(expected);
    const answerNumber = numericValue(answer);
    const tolerance = method === "numeric_with_tolerance" ? Number(problem.tolerance ?? 0.001) : 1e-9;
    correct = Number.isFinite(expectedNumber) && Number.isFinite(answerNumber) && Math.abs(expectedNumber - answerNumber) <= tolerance;
  } else if (method === "equation_solution") {
    correct = normalizedAnswer === normalizedExpected
      || (Number.isFinite(numericValue(answer)) && Math.abs(numericValue(answer) - numericValue(expected)) < 1e-9);
  } else if (method === "symbolic_expression") {
    correct = symbolicEquivalent(answer, expected);
  } else if (method === "theorem_conclusion") {
    const accepted = [expected, ...(problem.accepted_forms ?? [])].map(normalizeAnswer);
    correct = accepted.includes(normalizedAnswer);
  } else {
    correct = normalizedAnswer === normalizedExpected;
  }

  return { correct, expected, method };
}

function validateProceduralWork(problem, work) {
  if (!problem.work_required) return null;
  const lines = String(work ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const minimumSteps = Math.max(1, Number(problem.work?.minimum_steps ?? 1));
  if (lines.length < minimumSteps) return `Show at least ${minimumSteps} mathematical steps.`;
  const partsFor = (line) => line.split(/<=|>=|≤|≥|=|<|>/).map((part) => part.trim()).filter(Boolean);
  for (const line of lines) {
    if (!/[\d=+\-*/^()<>≤≥]/.test(line)) return "Each work line needs a mathematical expression or equation.";
    const parts = partsFor(line);
    if (!parts.length || parts.some((part) => !expressionTokens(part))) return "One or more work lines are not valid mathematical notation.";
  }
  const parsedLines = lines.map((line) => {
    const match = line.match(/^(.*?)(<=|>=|≤|≥|=|<|>)(.*)$/);
    return match ? { left: match[1].trim(), relation: match[2], right: match[3].trim() } : { expression: line };
  });
  const equationRoot = (line, variable) => {
    const leftTokens = expressionTokens(line.left);
    const rightTokens = expressionTokens(line.right);
    const difference = (value) => evaluateExpression(leftTokens, { [variable]: value }) - evaluateExpression(rightTokens, { [variable]: value });
    const atZero = difference(0);
    const slope = difference(1) - atZero;
    if (Math.abs(slope) < 1e-10) return Math.abs(atZero) < 1e-10 ? { all: true } : { none: true };
    return { root: -atZero / slope };
  };
  for (let index = 1; index < parsedLines.length; index += 1) {
    const previous = parsedLines[index - 1];
    const current = parsedLines[index];
    if (previous.expression && current.expression && !symbolicEquivalent(previous.expression, current.expression)) {
      return `Step ${index + 1} is not equivalent to the step before it.`;
    }
    if (previous.relation === "=" && current.relation === "=") {
      const tokens = [previous.left, previous.right, current.left, current.right].flatMap((part) => expressionTokens(part) ?? []);
      const variables = [...new Set(tokens.filter((token) => token.type === "identifier").map((token) => token.value))];
      if (variables.length === 1) {
        const first = equationRoot(previous, variables[0]);
        const second = equationRoot(current, variables[0]);
        const sameSpecial = (first.all && second.all) || (first.none && second.none);
        const sameRoot = Number.isFinite(first.root) && Number.isFinite(second.root) && Math.abs(first.root - second.root) < 1e-8 * Math.max(1, Math.abs(first.root), Math.abs(second.root));
        if (!sameSpecial && !sameRoot) return `Step ${index + 1} changes the solution from the step before it.`;
      }
    }
  }
  if (problem.work?.require_final_answer_match) {
    const lastLine = lines.at(-1);
    const candidates = [lastLine, partsFor(lastLine).at(-1)].filter(Boolean);
    if (!candidates.some((candidate) => gradeProblem(problem, candidate).correct)) return "The final work line needs to match the final answer.";
  }
  return null;
}

function updateMastery(current, scorePercent, reflection) {
  let mastery = current;
  if (scorePercent >= 0.9) mastery += 15;
  else if (scorePercent >= 0.8) mastery += 10;
  else if (scorePercent >= 0.7) mastery += 4;
  else if (scorePercent >= 0.6) mastery += 1;
  else mastery -= 10;
  mastery += (reflection.confidenceRating - 3) * 3;
  if (reflection.difficultyFelt === "easy") mastery += 3;
  if (reflection.difficultyFelt === "hard") mastery -= 4;
  if (reflection.difficultyFelt === "brutal") mastery -= 8;
  if (reflection.hintsUsed === "little") mastery -= 2;
  if (reflection.hintsUsed === "some") mastery -= 5;
  if (reflection.hintsUsed === "a_lot") mastery -= 10;
  if (reflection.guessed === "maybe") mastery -= 4;
  if (reflection.guessed === "yes") mastery -= 10;
  return Math.max(0, Math.min(100, Math.round(mastery * 100) / 100));
}

function reviewDate(status, score, confidence, date) {
  let days = 3;
  if (score < 0.7 || confidence <= 2) days = 1;
  else if (status === "learning") days = 2;
  else if (status === "mastered") days = 21;
  else if (status === "proven") days = 7;
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

export function createQuickMathsStore({ storage, curriculum, now = () => new Date() }) {
  const skillsById = Object.fromEntries(curriculum.skills.map((skill) => [skill.id, skill]));
  const skillOrder = curriculum.track.skills.filter((id) => skillsById[id]);
  const unlocks = Object.fromEntries(skillOrder.map((id) => [id, [...(skillsById[id].unlocks ?? [])]]));
  for (const skill of curriculum.skills) {
    for (const prerequisite of skill.prerequisites) {
      unlocks[prerequisite] ??= [];
      if (!unlocks[prerequisite].includes(skill.id)) unlocks[prerequisite].push(skill.id);
    }
  }

  let state = loadState(storage, curriculum);
  const listeners = new Set();
  let storageError = null;

  const milliseconds = () => now().getTime();
  const isoNow = () => now().toISOString();

  const persist = () => {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
      storageError = null;
    } catch (error) {
      storageError = error instanceof Error ? error.message : "Browser storage is unavailable.";
    }
  };

  const notify = () => {
    persist();
    const view = snapshot();
    listeners.forEach((listener) => listener(view));
  };

  const addActivity = (tool, message, profileId = state.activeProfileId) => {
    state.activity = [...state.activity, { at: isoNow(), tool, message, profileId: profileId ?? null }].slice(-MAX_ACTIVITY);
  };

  const activeProfile = () => state.profiles.find((profile) => profile.id === state.activeProfileId) ?? null;
  const activeProgress = () => state.progress[state.activeProfileId] ?? {};
  const profileAttempts = () => state.attempts.filter((attempt) => attempt.profileId === state.activeProfileId);

  const heartbeat = (force = false) => {
    const profile = activeProfile();
    if (!profile || !state.session || state.session.profileId !== profile.id) return;
    const elapsed = Math.max(0, Math.floor((milliseconds() - state.session.heartbeatAt) / 1000));
    if (elapsed >= 30 || (force && elapsed > 0)) {
      profile.totalLoggedSeconds += elapsed;
      state.session.heartbeatAt += elapsed * 1000;
      if (force) notify();
      else persist();
    }
  };

  const statusForSkill = (skillId) => {
    const skill = skillsById[skillId];
    if (!skill) return "locked";
    const record = activeProgress()[skillId];
    if (record) {
      if (PROVEN.has(record.status) && record.nextReviewAt && new Date(record.nextReviewAt).getTime() < milliseconds()) return "rusty";
      return record.status;
    }
    return skill.prerequisites.every((id) => PROVEN.has(activeProgress()[id]?.status)) ? "ready" : "locked";
  };

  const progressRows = () => skillOrder.map((skillId) => {
    const skill = skillsById[skillId];
    const record = activeProgress()[skillId] ?? {};
    return {
      id: skill.id,
      name: skill.name,
      subdomain: skill.subdomain,
      description: skill.description,
      prerequisites: [...skill.prerequisites],
      unlocks: [...(unlocks[skill.id] ?? [])],
      status: statusForSkill(skill.id),
      masteryScore: record.masteryScore ?? 0,
      latestScore: record.lastTestScore ?? null,
      bestScore: record.bestTestScore ?? null,
      confidence: record.confidenceRating ?? null,
      attemptCount: record.attemptCount ?? 0,
      nextReviewAt: record.nextReviewAt ?? null,
      mistakeTags: [...(record.mistakeTags ?? [])],
    };
  });

  const timers = () => {
    const profile = activeProfile();
    if (!profile || !state.session) return { sessionSeconds: 0, profileSeconds: profile?.totalLoggedSeconds ?? 0 };
    const sessionSeconds = Math.max(0, Math.floor((milliseconds() - state.session.startedAt) / 1000));
    const unflushed = Math.max(0, Math.floor((milliseconds() - state.session.heartbeatAt) / 1000));
    return { sessionSeconds, profileSeconds: profile.totalLoggedSeconds + unflushed };
  };

  const snapshot = () => {
    const rows = state.activeProfileId ? progressRows() : [];
    const counts = Object.fromEntries(["locked", "ready", "learning", "proven", "mastered", "rusty"].map((key) => [key, rows.filter((row) => row.status === key).length]));
    const suggested = rows.find((row) => row.status === "rusty")
      ?? rows.find((row) => row.status === "learning")
      ?? rows.find((row) => row.status === "ready")
      ?? null;
    return {
      version: state.version,
      activeProfile: clone(activeProfile()),
      profiles: clone(state.profiles),
      progressRows: clone(rows),
      progressCounts: counts,
      suggested: clone(suggested),
      attempts: clone(profileAttempts().slice().reverse()),
      reviews: clone(state.reviews.filter((review) => review.profileId === state.activeProfileId).slice().reverse()),
      ui: clone(state.ui),
      timers: timers(),
      activity: clone(state.activity.filter((item) => item.profileId === state.activeProfileId)),
      storageError,
      selectedSkill: clone(skillsById[state.ui.selectedSkillId] ?? skillsById[skillOrder[0]]),
      selectedMapSkill: clone(skillsById[state.ui.selectedMapSkillId] ?? skillsById[skillOrder[0]]),
      activeTest: clone(state.drafts[state.activeProfileId]?.[state.ui.selectedSkillId] ?? null),
      pendingResults: clone(state.ui.pendingResults),
      curriculum: {
        track: clone(curriculum.track),
        skills: curriculum.skills.map((skill) => ({
          id: skill.id,
          name: skill.name,
          subdomain: skill.subdomain,
          description: skill.description,
          prerequisites: [...skill.prerequisites],
          unlocks: [...(unlocks[skill.id] ?? [])],
          applications: clone(skill.applications),
        })),
      },
    };
  };

  const startSession = (profileId) => {
    state.session = { profileId, startedAt: milliseconds(), heartbeatAt: milliseconds() };
  };

  const selectProfile = (profileId) => {
    if (!state.profiles.some((profile) => profile.id === profileId)) throw new Error("Profile not found.");
    heartbeat(true);
    state.activeProfileId = profileId;
    state.progress[profileId] ??= {};
    state.drafts[profileId] ??= {};
    state.ui.route = "home";
    state.ui.pendingResults = null;
    startSession(profileId);
    addActivity("select_profile", "Opened a learner profile.");
    notify();
  };

  const createProfile = (displayName, { demo = false } = {}) => {
    const name = cleanText(displayName, 60);
    if (name.length < 2) throw new Error("Profile name must contain at least 2 characters.");
    const profile = { id: makeId("profile"), displayName: name, createdAt: isoNow(), totalLoggedSeconds: 0, demo };
    state.profiles.push(profile);
    state.progress[profile.id] = {};
    state.drafts[profile.id] = {};
    if (demo) {
      state.progress[profile.id].MATH_ARITH_001 = {
        status: "proven", masteryScore: 72, confidenceRating: 4, lastTestScore: 0.9, bestTestScore: 0.9,
        attemptCount: 2, lastAttemptAt: isoNow(), nextReviewAt: reviewDate("proven", 0.9, 4, now()),
        mistakeTags: ["sign_error"], notes: "Good recovery on subtracting negatives.", updatedAt: isoNow(),
      };
      state.progress[profile.id].MATH_ARITH_002 = {
        status: "learning", masteryScore: 46, confidenceRating: 3, lastTestScore: 0.6, bestTestScore: 0.7,
        attemptCount: 1, lastAttemptAt: isoNow(), nextReviewAt: reviewDate("learning", 0.6, 3, now()),
        mistakeTags: ["order_error"], notes: "Review multiplication before addition.", updatedAt: isoNow(),
      };
      state.attempts.push({
        attemptId: makeId("attempt"), profileId: profile.id, skillId: "MATH_ARITH_002", skillName: skillsById.MATH_ARITH_002?.name ?? "Order of operations",
        startedAt: isoNow(), completedAt: isoNow(), rawScore: 3, scoreTotal: 5, percentScore: 0.6,
        reflection: { confidenceRating: 3, difficultyFelt: "medium", hintsUsed: "little", guessed: "no", wantsMorePractice: "yes", notes: "", confusingParts: "Nested groups" },
        results: [], masteryUpdate: { status: "learning", masteryScore: 46 }, reviewStatus: "graded", hasPendingReview: false,
      });
    }
    addActivity("create_profile", `Created profile ${name}.`, profile.id);
    selectProfile(profile.id);
    return clone(profile);
  };

  const logout = () => {
    heartbeat(true);
    state.activeProfileId = null;
    state.session = null;
    state.ui.route = "welcome";
    state.ui.pendingResults = null;
    addActivity("logout_profile", "Returned to the profile picker.");
    notify();
  };

  const navigate = (route, skillId = null) => {
    if (!ROUTES.has(route) || route === "welcome") throw new Error("Unknown app view.");
    if (!activeProfile()) throw new Error("Select a profile first.");
    if (skillId) {
      if (!skillsById[skillId]) throw new Error("Unknown skill_id.");
      state.ui.selectedSkillId = skillId;
      state.ui.selectedMapSkillId = skillId;
    }
    state.ui.route = route;
    addActivity("navigate_learning_app", `Opened ${route}${skillId ? ` for ${skillId}` : ""}.`);
    notify();
  };

  const selectMapSkill = (skillId) => {
    if (!skillsById[skillId]) throw new Error("Unknown skill_id.");
    state.ui.selectedMapSkillId = skillId;
    notify();
  };

  const startTest = (skillId, { force = false } = {}) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    if (!skillsById[skillId]) throw new Error("Unknown skill_id.");
    if (state.ui.pendingResults) throw new Error("Save the current reflection before starting another test.");
    const status = statusForSkill(skillId);
    if (!force && status === "locked") throw new Error("This skill is locked by its prerequisites.");
    const profileId = state.activeProfileId;
    state.drafts[profileId] ??= {};
    const existing = state.drafts[profileId][skillId];
    if (!existing) {
      const attemptCount = activeProgress()[skillId]?.attemptCount ?? 0;
      const bank = skillsById[skillId].problems;
      const offset = (attemptCount * 5) % Math.max(1, bank.length);
      const problems = [...bank.slice(offset), ...bank.slice(0, offset)].slice(0, Math.min(5, bank.length));
      state.drafts[profileId][skillId] = {
        draftId: makeId("draft"),
        skillId,
        startedAt: isoNow(),
        problems: clone(problems),
        responses: Object.fromEntries(problems.map((problem) => [problem.template_id, { finalAnswer: "", work: "" }])),
      };
    }
    state.ui.selectedSkillId = skillId;
    state.ui.activeAttemptId = null;
    state.ui.route = "test";
    addActivity("start_skill_test", `Prepared a mastery test for ${skillId}.`);
    notify();
    return clone(state.drafts[profileId][skillId]);
  };

  const updateResponse = (questionId, { finalAnswer, work }) => {
    const draft = state.drafts[state.activeProfileId]?.[state.ui.selectedSkillId];
    if (!draft || !draft.responses[questionId]) throw new Error("Question is not in the active test.");
    draft.responses[questionId] = { finalAnswer: cleanText(finalAnswer, 300), work: cleanText(work, 5000) };
    persist();
  };

  const submitTest = () => {
    const draft = state.drafts[state.activeProfileId]?.[state.ui.selectedSkillId];
    if (!draft) throw new Error("No active test.");
    const workIssues = draft.problems.map((problem) => ({
      questionId: problem.template_id,
      message: validateProceduralWork(problem, draft.responses[problem.template_id]?.work),
    })).filter((issue) => issue.message);
    if (workIssues.length) return { ok: false, missingWork: workIssues.map((issue) => issue.questionId), workIssues };
    const results = draft.problems.map((problem) => {
      const response = draft.responses[problem.template_id] ?? { finalAnswer: "", work: "" };
      const grade = gradeProblem(problem, response.finalAnswer);
      return {
        questionId: problem.template_id,
        prompt: problem.prompt,
        finalAnswer: response.finalAnswer,
        work: response.work,
        expectedAnswer: grade.expected,
        correct: grade.correct,
        gradingMethod: grade.method,
        solutionSteps: clone(problem.solution_steps ?? []),
        mistakeTags: grade.correct ? [] : clone(problem.mistake_tags ?? []),
        workRequired: Boolean(problem.work_required),
      };
    });
    const rawScore = results.filter((result) => result.correct).length;
    state.ui.pendingResults = {
      draftId: draft.draftId,
      skillId: draft.skillId,
      submittedAt: isoNow(),
      results,
      rawScore,
      scoreTotal: results.length,
      percentScore: results.length ? rawScore / results.length : 0,
    };
    state.ui.route = "results";
    addActivity("submit_mastery_test", `Graded ${rawScore} of ${results.length} answers correct.`);
    notify();
    return { ok: true, results: clone(state.ui.pendingResults) };
  };

  const saveReflection = (input) => {
    const pending = state.ui.pendingResults;
    if (!pending) throw new Error("No result is waiting to be saved.");
    const skill = skillsById[pending.skillId];
    const reflection = {
      confidenceRating: Math.round(cleanNumber(Number(input.confidenceRating), 3, 1, 5)),
      difficultyFelt: ["easy", "medium", "hard", "brutal"].includes(input.difficultyFelt) ? input.difficultyFelt : "medium",
      hintsUsed: ["none", "little", "some", "a_lot"].includes(input.hintsUsed) ? input.hintsUsed : "none",
      guessed: ["no", "maybe", "yes"].includes(input.guessed) ? input.guessed : "no",
      wantsMorePractice: input.wantsMorePractice === "no" ? "no" : "yes",
      confusingParts: cleanText(input.confusingParts, 2000),
      notes: cleanText(input.notes, 2000),
    };
    const previous = activeProgress()[skill.id] ?? { status: "ready", masteryScore: 0, attemptCount: 0, bestTestScore: null };
    const hasPendingReview = pending.results.some((result) => {
      const source = state.drafts[state.activeProfileId]?.[skill.id]?.problems.find((problem) => problem.template_id === result.questionId);
      const mode = source?.work?.mode;
      return ["proof_obligations", "rubric_check"].includes(mode) || source?.review_policy?.mastery_requires_review_pass === true;
    });
    const prerequisitesMet = skill.prerequisites.every((id) => PROVEN.has(activeProgress()[id]?.status));
    const mastery = hasPendingReview ? previous.masteryScore : updateMastery(previous.masteryScore, pending.percentScore, reflection);
    const passed = prerequisitesMet
      && pending.percentScore >= Number(skill.mastery.passing_score ?? 0.8)
      && reflection.confidenceRating >= Number(skill.mastery.minimum_confidence ?? 3)
      && reflection.guessed !== "yes";
    const status = hasPendingReview ? "learning" : passed ? (previous.status === "proven" ? "mastered" : "proven") : "learning";
    const completedAt = isoNow();
    const mistakeTags = [...new Set(pending.results.flatMap((result) => result.mistakeTags))].slice(0, 12);
    const record = {
      status,
      masteryScore: mastery,
      confidenceRating: reflection.confidenceRating,
      lastTestScore: pending.percentScore,
      bestTestScore: Math.max(previous.bestTestScore ?? 0, pending.percentScore),
      attemptCount: (previous.attemptCount ?? 0) + 1,
      lastAttemptAt: completedAt,
      nextReviewAt: reviewDate(status, pending.percentScore, reflection.confidenceRating, now()),
      mistakeTags,
      notes: reflection.notes,
      updatedAt: completedAt,
    };
    state.progress[state.activeProfileId][skill.id] = record;
    const attempt = {
      attemptId: makeId("attempt"),
      profileId: state.activeProfileId,
      skillId: skill.id,
      skillName: skill.name,
      startedAt: state.drafts[state.activeProfileId]?.[skill.id]?.startedAt ?? completedAt,
      completedAt,
      rawScore: pending.rawScore,
      scoreTotal: pending.scoreTotal,
      percentScore: pending.percentScore,
      reflection,
      results: clone(pending.results),
      masteryUpdate: { status, masteryScore: mastery },
      reviewStatus: hasPendingReview ? "pending_review" : "graded",
      hasPendingReview,
    };
    for (const review of state.reviews) {
      if (review.profileId === state.activeProfileId && review.draftId === pending.draftId && !review.attemptId) {
        review.attemptId = attempt.attemptId;
      }
    }
    state.attempts = [...state.attempts, attempt].slice(-MAX_ATTEMPTS);
    delete state.drafts[state.activeProfileId][skill.id];
    state.ui.pendingResults = null;
    state.ui.activeAttemptId = attempt.attemptId;
    state.ui.route = "results";
    addActivity("save_reflection", `Saved ${skill.name} at ${Math.round(pending.percentScore * 100)}%.`);
    notify();
    return clone(attempt);
  };

  const getAttempt = (attemptId = state.ui.activeAttemptId) => profileAttempts().find((attempt) => attempt.attemptId === attemptId) ?? null;

  const openAttempt = (attemptId) => {
    const attempt = getAttempt(attemptId);
    if (!attempt) throw new Error("Attempt not found for this profile.");
    state.ui.activeAttemptId = attempt.attemptId;
    state.ui.selectedSkillId = attempt.skillId;
    state.ui.pendingResults = null;
    state.ui.route = "results";
    addActivity("open_results", `Opened a saved ${attempt.skillName} result.`);
    notify();
    return clone(attempt);
  };

  const inspectStudentWork = ({ questionId = "" } = {}) => {
    const draft = state.drafts[state.activeProfileId]?.[state.ui.selectedSkillId];
    if (!draft) throw new Error("Open or start a mastery test first.");
    const problem = questionId
      ? draft.problems.find((item) => item.template_id === questionId)
      : draft.problems.find((item) => draft.responses[item.template_id]?.finalAnswer || draft.responses[item.template_id]?.work) ?? draft.problems[0];
    if (!problem) throw new Error("question_id is not in the active test.");
    const response = draft.responses[problem.template_id] ?? { finalAnswer: "", work: "" };
    const grade = response.finalAnswer ? gradeProblem(problem, response.finalAnswer) : { correct: false, method: problem.grading_method };
    const mistakeTag = grade.correct ? "none" : problem.mistake_tags?.[0] ?? "needs_explanation";
    return {
      ok: true,
      question_id: problem.template_id,
      skill_id: problem.skill_id,
      prompt: problem.prompt,
      final_answer: response.finalAnswer,
      work: response.work,
      work_lines: response.work.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
      final_answer_status: response.finalAnswer ? (grade.correct ? "correct" : "incorrect") : "missing",
      work_status: response.work ? "pending_review" : problem.work_required ? "missing" : "not_required",
      mistake_tag: mistakeTag,
      messages: [grade.correct ? "The final answer passes the local grader; review the reasoning quality." : "Use the mistake tag and shown work to give one Socratic next step."],
      inspected_at: isoNow(),
    };
  };

  const recordTutorFeedback = ({ questionId, feedback, mistakeTag = "", nextStep, confidence = "medium", verdict = "partial", reviewerType = "ai_tutor" }) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    const safeQuestionId = cleanText(questionId, 120);
    const activeDraft = state.drafts[state.activeProfileId]?.[state.ui.selectedSkillId];
    const activeAttempt = state.ui.activeAttemptId ? getAttempt(state.ui.activeAttemptId) : null;
    const visibleQuestionIds = new Set([
      ...(activeDraft?.problems?.map((problem) => problem.template_id) ?? []),
      ...(activeAttempt?.results?.map((result) => result.questionId) ?? []),
    ]);
    if (!safeQuestionId || !visibleQuestionIds.has(safeQuestionId)) throw new Error("question_id is not in the visible test or result.");
    const safeFeedback = cleanText(feedback, 1500);
    const safeNextStep = cleanText(nextStep, 300);
    if (!safeFeedback || !safeNextStep) throw new Error("feedback and next_step are required.");
    if (!["low", "medium", "high"].includes(confidence)) throw new Error("confidence is invalid.");
    if (!["pass", "partial", "needs_revision", "fail"].includes(verdict)) throw new Error("verdict is invalid.");
    const review = {
      reviewId: makeId("review"), profileId: state.activeProfileId, attemptId: state.ui.activeAttemptId,
      draftId: state.drafts[state.activeProfileId]?.[state.ui.selectedSkillId]?.draftId ?? null,
      questionId: safeQuestionId, reviewerType: ["ai_tutor", "human_tutor", "self"].includes(reviewerType) ? reviewerType : "ai_tutor", verdict,
      score: { pass: 1, partial: 0.6, needs_revision: 0.35, fail: 0 }[verdict],
      reviewerConfidence: confidence, mistakeTag: cleanText(mistakeTag, 80), feedback: safeFeedback,
      nextStep: safeNextStep, createdAt: isoNow(),
    };
    state.reviews = [...state.reviews, review].slice(-MAX_REVIEWS);
    if (review.mistakeTag && review.mistakeTag !== "none") {
      const record = activeProgress()[state.ui.selectedSkillId];
      if (record) record.mistakeTags = [review.mistakeTag, ...(record.mistakeTags ?? []).filter((tag) => tag !== review.mistakeTag)].slice(0, 12);
    }
    addActivity("record_tutor_feedback", "Saved visible tutor feedback to this profile.");
    notify();
    return { ok: true, saved: true, review_id: review.reviewId, feedback: safeFeedback, next_step: safeNextStep };
  };

  const latestReview = () => state.reviews.filter((review) => review.profileId === state.activeProfileId).at(-1) ?? null;

  const getLearningContext = ({ includeHistory = false } = {}) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    const skill = skillsById[state.ui.selectedSkillId];
    const row = progressRows().find((item) => item.id === skill.id);
    const draft = state.drafts[state.activeProfileId]?.[skill.id];
    return {
      ok: true,
      route: state.ui.route,
      skill: { id: skill.id, name: skill.name, description: skill.description, status: row.status },
      active_test: draft ? {
        question_count: draft.problems.length,
        answered_count: Object.values(draft.responses).filter((response) => response.finalAnswer).length,
        questions: draft.problems.map((problem) => ({ question_id: problem.template_id, prompt: problem.prompt, difficulty: problem.difficulty, answer_mode: problem.answer_mode })),
      } : null,
      progress: { mastery_score: row.masteryScore, attempt_count: row.attemptCount, mistake_tags: row.mistakeTags },
      recent_attempts: includeHistory ? profileAttempts().slice(-5).map((attempt) => ({ skill_id: attempt.skillId, percent_score: attempt.percentScore, completed_at: attempt.completedAt })) : [],
    };
  };

  const getProgressSummary = () => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    const rows = progressRows();
    const view = snapshot();
    return {
      ok: true,
      profile: { display_name: activeProfile()?.displayName ?? "" },
      counts: view.progressCounts,
      suggested_next: view.suggested ? {
        skill_id: view.suggested.id,
        name: view.suggested.name,
        status: view.suggested.status,
        mastery_score: view.suggested.masteryScore,
      } : null,
      skills: rows.map((row) => ({ skill_id: row.id, name: row.name, status: row.status, mastery_score: row.masteryScore, mistake_tags: row.mistakeTags })),
    };
  };

  const createFollowupProblem = ({ skillId = state.ui.selectedSkillId, focus = "" } = {}) => {
    const draft = startTest(skillId);
    const safeFocus = cleanText(focus, 80);
    const matching = draft.problems.find((problem) => problem.mistake_tags?.includes(safeFocus)) ?? draft.problems[0];
    const liveDraft = state.drafts[state.activeProfileId]?.[skillId];
    if (liveDraft && matching) {
      liveDraft.problems = [matching, ...liveDraft.problems.filter((problem) => problem.template_id !== matching.template_id)];
    }
    state.ui.route = "test";
    addActivity("create_followup_problem", `Prepared ${matching.template_id} for targeted practice.`);
    notify();
    return { ok: true, saved: true, problem: { question_id: matching.template_id, skill_id: skillId, prompt: matching.prompt, difficulty: matching.difficulty } };
  };

  const exportBackup = () => {
    heartbeat(true);
    return JSON.stringify({ ...clone(state), exportedAt: isoNow(), app: "QuickMaths Web" }, null, 2);
  };

  const parseBackup = (raw) => {
    if (typeof raw !== "string" || raw.length > 10_000_000) throw new Error("Backup file is invalid or too large.");
    let candidate;
    try { candidate = JSON.parse(raw); } catch { throw new Error("Backup file is not valid JSON."); }
    if (!candidate || typeof candidate !== "object") throw new Error("Backup file is invalid.");
    if (Number(candidate.version) > APP_VERSION) throw new Error("This backup was created by a newer QuickMaths version.");
    const imported = sanitizeState(candidate, curriculum);
    if (!imported.profiles.length) throw new Error("Backup does not contain any learner profiles.");
    return { candidate, imported };
  };

  const previewBackup = (raw) => {
    const { candidate, imported } = parseBackup(raw);
    return {
      ok: true,
      version: imported.version,
      exportedAt: cleanText(candidate.exportedAt, 40) || null,
      profileCount: imported.profiles.length,
      profileNames: imported.profiles.map((profile) => profile.displayName),
      attemptCount: imported.attempts.length,
      reviewCount: imported.reviews.length,
      replaces: {
        profileCount: state.profiles.length,
        attemptCount: state.attempts.length,
        reviewCount: state.reviews.length,
      },
    };
  };

  const importBackup = (raw) => {
    const { imported } = parseBackup(raw);
    state = imported;
    state.activeProfileId = null;
    state.session = null;
    state.ui.route = "welcome";
    addActivity("load_progress_backup", `Loaded ${state.profiles.length} profile(s) from a backup.`);
    notify();
    return { ok: true, profileCount: state.profiles.length, attemptCount: state.attempts.length };
  };

  const exportCsv = (kind) => {
    const quote = (value) => {
      let safe = String(value ?? "");
      if (/^[=+\-@]/.test(safe)) safe = `'${safe}`;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    if (kind === "progress") {
      const header = ["skill_id", "skill", "status", "mastery_score", "latest_score", "best_score", "confidence", "attempt_count", "next_review_at"];
      const rows = progressRows().map((row) => [row.id, row.name, row.status, row.masteryScore, row.latestScore, row.bestScore, row.confidence, row.attemptCount, row.nextReviewAt]);
      return [header, ...rows].map((row) => row.map(quote).join(",")).join("\n");
    }
    if (kind === "reviews") {
      const header = ["review_id", "attempt_id", "question_id", "verdict", "score", "confidence", "feedback", "next_step", "created_at"];
      const rows = state.reviews.filter((review) => review.profileId === state.activeProfileId).map((review) => [review.reviewId, review.attemptId, review.questionId, review.verdict, review.score, review.reviewerConfidence, review.feedback, review.nextStep, review.createdAt]);
      return [header, ...rows].map((row) => row.map(quote).join(",")).join("\n");
    }
    const header = ["attempt_id", "skill_id", "skill", "score", "total", "percent", "status", "completed_at"];
    const rows = profileAttempts().map((attempt) => [attempt.attemptId, attempt.skillId, attempt.skillName, attempt.rawScore, attempt.scoreTotal, attempt.percentScore, attempt.masteryUpdate?.status, attempt.completedAt]);
    return [header, ...rows].map((row) => row.map(quote).join(",")).join("\n");
  };

  const replaceFromStorage = () => {
    state = loadState(storage, curriculum);
    notify();
  };

  return {
    snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    createProfile,
    selectProfile,
    logout,
    navigate,
    selectMapSkill,
    startTest,
    updateResponse,
    submitTest,
    saveReflection,
    getAttempt,
    openAttempt,
    inspectStudentWork,
    recordTutorFeedback,
    latestReview,
    getLearningContext,
    getProgressSummary,
    createFollowupProblem,
    exportBackup,
    previewBackup,
    importBackup,
    exportCsv,
    heartbeat,
    replaceFromStorage,
    statusForSkill,
    skillsById,
    unlocks,
  };
}
