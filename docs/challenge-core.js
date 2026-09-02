export const STORAGE_KEY = "quickmaths.web.v2";
export const LEGACY_STORAGE_KEY = "quickmaths.webmcp.challenge.v1";
export const APP_VERSION = 10;
export const LESSON_SET_FORMAT = "quickmaths.lesson-set";
export const LESSON_SET_SCHEMA_VERSION = "2.0";
export const DEFAULT_SUBJECT_ID = "SUBJECT_MATH";

export const DEFAULT_SUBJECT = Object.freeze({
  id: DEFAULT_SUBJECT_ID,
  name: "Mathematics",
  shortName: "Maths",
  icon: "∑",
  description: "The built-in Mathematics curriculum, from algebra foundations through coordinate geometry.",
  builtIn: true,
  theme: Object.freeze({
    paper: "#f3eee3", paperDeep: "#e8dfce", paperLight: "#fffdf8", ink: "#16211d",
    muted: "#68716b", line: "#d6cdbd", primary: "#153f36", primaryAlt: "#205c4e",
    tint: "#b8d9c9", highlight: "#dceca9", accent: "#df755b",
  }),
});

export const STATUS_COLORS = Object.freeze({
  locked: "#858a89",
  ready: "#2f74c0",
  learning: "#c47a18",
  proven: "#2f8f46",
  mastered: "#176b34",
  rusty: "#c43d3d",
});

const PROVEN = new Set(["proven", "mastered"]);
const ROUTES = new Set(["welcome", "tutorial", "home", "map", "lesson", "test", "results", "settings", "data", "creator", "depot"]);
const TUTORIAL_STEPS = 7;
const MAX_ACTIVITY = 60;
const MAX_ATTEMPTS = 500;
const MAX_REVIEWS = 1000;
const MAX_LESSON_SETS = 10;
const MAX_LESSON_SET_BYTES = 2_000_000;
const MAX_LESSON_SET_SKILLS = 50;
const MAX_PROBLEMS_PER_SKILL = 100;
const LESSON_SET_ID = /^PACK_[A-Z0-9_]{3,54}$/;
const CUSTOM_SKILL_ID = /^CUSTOM_[A-Z0-9_]{3,52}$/;
const SUBJECT_ID = /^SUBJECT_[A-Z0-9_]{2,51}$/;
const SAFE_ID = /^[A-Z][A-Z0-9_]{2,119}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const GRADING_METHODS = new Set([
  "exact_numeric", "numeric_with_tolerance", "multiple_choice", "symbolic_expression",
  "equation_solution", "exact_text", "theorem_conclusion",
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanText(value, maxLength = 1000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanNumber(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function assessmentLength(skill) {
  const bankLength = Array.isArray(skill?.problems) ? skill.problems.length : 0;
  if (!bankLength) return 0;
  const configured = Number(skill.question_count ?? skill.questionCount);
  if (!Number.isInteger(configured)) return bankLength;
  return Math.max(1, Math.min(bankLength, configured));
}

function assessmentGroupKey(problem) {
  return problem?.source_template_id ?? problem?.template_id;
}

function selectAssessmentProblems(skill, attemptCount = 0) {
  const bank = Array.isArray(skill?.problems) ? skill.problems : [];
  const questionCount = assessmentLength(skill);
  const groupMap = new Map();
  for (const problem of bank) {
    const key = assessmentGroupKey(problem);
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(problem);
  }
  const groups = [...groupMap.values()];
  if (groups.length === questionCount) {
    const rotation = attemptCount % Math.max(1, groups.length);
    const orderedGroups = [...groups.slice(rotation), ...groups.slice(0, rotation)];
    return orderedGroups.map((variants) => variants[attemptCount % variants.length]);
  }
  const offset = (attemptCount * questionCount) % Math.max(1, bank.length);
  return [...bank.slice(offset), ...bank.slice(0, offset)].slice(0, questionCount);
}

function makeId(prefix = "id") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function requiredText(value, label, maxLength, minLength = 1) {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const clean = value.trim();
  if (clean.length < minLength) throw new Error(`${label} is required.`);
  if (clean.length > maxLength) throw new Error(`${label} is too long (maximum ${maxLength} characters).`);
  if (/<script\b|javascript:/i.test(clean)) throw new Error(`${label} contains unsupported executable content.`);
  return clean;
}

function optionalText(value, label, maxLength) {
  if (value == null || value === "") return "";
  return requiredText(value, label, maxLength);
}

function idList(value, label, { max = 50 } = {}) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label} must be a list with at most ${max} IDs.`);
  const ids = value.map((item) => requiredText(item, label, 120));
  if (ids.some((id) => !SAFE_ID.test(id))) throw new Error(`${label} contains an invalid ID.`);
  if (new Set(ids).size !== ids.length) throw new Error(`${label} contains a duplicate ID.`);
  return ids;
}

function prerequisiteList(value, label, { max = 50 } = {}) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label} must be a list with at most ${max} references.`);
  const refs = value.map((item) => {
    if (typeof item === "string") return { skillId: requiredText(item, label, 120), subjectId: null };
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`${label} contains an invalid reference.`);
    const skillId = requiredText(item.skill_id, `${label} skill_id`, 120);
    const subjectId = item.subject_id == null ? null : requiredText(item.subject_id, `${label} subject_id`, 60);
    if (subjectId && !SUBJECT_ID.test(subjectId)) throw new Error(`${label} contains an invalid subject_id.`);
    return { skillId, subjectId };
  });
  if (refs.some((ref) => !SAFE_ID.test(ref.skillId))) throw new Error(`${label} contains an invalid skill ID.`);
  if (new Set(refs.map((ref) => ref.skillId)).size !== refs.length) throw new Error(`${label} contains a duplicate skill reference.`);
  return refs;
}

function normalizeTheme(value, { required = false } = {}) {
  if (value == null && !required) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Subject theme must be an object of color values.");
  const fallback = DEFAULT_SUBJECT.theme;
  const keys = ["paper", "paperDeep", "paperLight", "ink", "muted", "line", "primary", "primaryAlt", "tint", "highlight", "accent"];
  const output = {};
  for (const key of keys) {
    const color = value[key] ?? fallback[key];
    if (typeof color !== "string" || !HEX_COLOR.test(color)) throw new Error(`Subject theme ${key} must be a six-digit hex color.`);
    output[key] = color.toLowerCase();
  }
  return output;
}

function normalizeSubject(candidate, schemaVersion) {
  if (schemaVersion === "1.0") return clone(DEFAULT_SUBJECT);
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Lesson set subject is required for schema 2.0.");
  const id = requiredText(candidate.id, "Subject ID", 60);
  if (!SUBJECT_ID.test(id)) throw new Error("Subject ID must start with SUBJECT_ and use uppercase letters, numbers, and underscores.");
  const isMath = id === DEFAULT_SUBJECT_ID;
  return {
    id,
    name: isMath ? DEFAULT_SUBJECT.name : requiredText(candidate.name, "Subject name", 120),
    shortName: optionalText(candidate.short_name ?? candidate.shortName, "Subject short_name", 40) || (isMath ? DEFAULT_SUBJECT.shortName : requiredText(candidate.name, "Subject name", 120).slice(0, 24)),
    icon: optionalText(candidate.icon, "Subject icon", 8) || (isMath ? DEFAULT_SUBJECT.icon : "◇"),
    description: optionalText(candidate.description, "Subject description", 500) || (isMath ? DEFAULT_SUBJECT.description : "Custom QuickMaths subject."),
    builtIn: isMath,
    theme: isMath ? clone(DEFAULT_SUBJECT.theme) : normalizeTheme(candidate.theme, { required: true }),
  };
}

function normalizeProblem(candidate, skillId, questionIds) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error(`${skillId} contains an invalid problem.`);
  const templateId = requiredText(candidate.template_id, `${skillId} problem ID`, 120);
  if (!SAFE_ID.test(templateId)) throw new Error(`${templateId} is not a valid problem ID.`);
  const sourceTemplateId = candidate.source_template_id == null
    ? templateId
    : requiredText(candidate.source_template_id, `${templateId} source template ID`, 120);
  if (!SAFE_ID.test(sourceTemplateId)) throw new Error(`${sourceTemplateId} is not a valid source template ID.`);
  if (questionIds.has(templateId)) throw new Error(`Duplicate problem ID: ${templateId}.`);
  questionIds.add(templateId);
  if (candidate.skill_id != null && candidate.skill_id !== skillId) throw new Error(`${templateId} must use skill_id ${skillId}.`);
  const gradingMethod = requiredText(candidate.grading_method, `${templateId} grading_method`, 60);
  if (!GRADING_METHODS.has(gradingMethod)) throw new Error(`${templateId} uses unsupported grading method ${gradingMethod}.`);
  const expectedAnswer = requiredText(String(candidate.expected_answer ?? ""), `${templateId} expected_answer`, 300);
  const options = candidate.options == null ? [] : candidate.options;
  if (!Array.isArray(options) || options.length > 8) throw new Error(`${templateId} options must be a list of at most 8 choices.`);
  const normalizedOptions = options.map((option, index) => {
    if (!option || typeof option !== "object" || Array.isArray(option)) throw new Error(`${templateId} option ${index + 1} is invalid.`);
    return {
      id: requiredText(String(option.id ?? ""), `${templateId} option ID`, 30),
      label: requiredText(String(option.label ?? option.id ?? ""), `${templateId} option label`, 300),
    };
  });
  if (new Set(normalizedOptions.map((option) => option.id)).size !== normalizedOptions.length) throw new Error(`${templateId} contains duplicate option IDs.`);
  if (gradingMethod === "multiple_choice") {
    if (normalizedOptions.length < 2) throw new Error(`${templateId} needs at least two options.`);
    if (!normalizedOptions.some((option) => option.id === expectedAnswer)) throw new Error(`${templateId} expected_answer must match an option ID.`);
  }
  const workCandidate = candidate.work && typeof candidate.work === "object" && !Array.isArray(candidate.work) ? candidate.work : {};
  const workMode = workCandidate.mode ?? "none";
  if (!["none", "capture_only", "procedural_steps", "proof_obligations", "rubric_check"].includes(workMode)) throw new Error(`${templateId} uses unsupported work mode ${workMode}.`);
  const answerMode = candidate.answer_mode ?? (workMode === "none" ? "final_only" : "final_plus_required_work");
  if (!["final_only", "final_plus_optional_work", "final_plus_required_work"].includes(answerMode)) throw new Error(`${templateId} uses unsupported answer_mode ${answerMode}.`);
  const minimumSteps = Math.floor(cleanNumber(Number(workCandidate.minimum_steps), workMode === "procedural_steps" ? 2 : 1, 1, 10));
  const solutionSteps = Array.isArray(candidate.solution_steps)
    ? candidate.solution_steps.map((step) => requiredText(String(step), `${templateId} solution step`, 1000)).slice(0, 20)
    : [];
  if (!solutionSteps.length) throw new Error(`${templateId} needs at least one solution step.`);
  const proofCandidate = workCandidate.proof_policy && typeof workCandidate.proof_policy === "object" && !Array.isArray(workCandidate.proof_policy) ? workCandidate.proof_policy : {};
  const rubricCandidate = workCandidate.rubric && typeof workCandidate.rubric === "object" && !Array.isArray(workCandidate.rubric) ? workCandidate.rubric : {};
  const criteria = Array.isArray(rubricCandidate.criteria) ? rubricCandidate.criteria.slice(0, 12).map((criterion, index) => ({
    id: optionalText(criterion?.id, `${templateId} rubric criterion ${index + 1} ID`, 80) || `criterion_${index + 1}`,
    description: requiredText(criterion?.description, `${templateId} rubric criterion ${index + 1}`, 500),
    weight: cleanNumber(Number(criterion?.weight), 1, 0.01, 100),
  })) : [];
  if (workMode === "rubric_check" && !criteria.length) throw new Error(`${templateId} rubric_check needs at least one rubric criterion.`);
  const obligations = Array.isArray(proofCandidate.obligations)
    ? proofCandidate.obligations.map((item) => requiredText(String(item), `${templateId} proof obligation`, 500)).slice(0, 12)
    : [];
  if (workMode === "proof_obligations" && !obligations.length) throw new Error(`${templateId} proof_obligations needs at least one obligation.`);
  const reviewCandidate = candidate.review_policy && typeof candidate.review_policy === "object" && !Array.isArray(candidate.review_policy) ? candidate.review_policy : {};
  const workReview = reviewCandidate.work_review ?? (["proof_obligations", "rubric_check"].includes(workMode) ? "tutor_required" : "none");
  if (!["none", "optional", "auto", "tutor_required", "self_review"].includes(workReview)) throw new Error(`${templateId} uses unsupported work_review ${workReview}.`);
  return {
    template_id: templateId,
    source_template_id: sourceTemplateId,
    skill_id: skillId,
    seed: Math.floor(cleanNumber(Number(candidate.seed), 1, 0, 2_000_000_000)),
    difficulty: ["easy", "medium", "hard", "brutal"].includes(candidate.difficulty) ? candidate.difficulty : "medium",
    values: {},
    prompt: requiredText(candidate.prompt, `${templateId} prompt`, 2000),
    expected_answer: expectedAnswer,
    answer_type: optionalText(candidate.answer_type, `${templateId} answer_type`, 60) || "text",
    grading_method: gradingMethod,
    solution_steps: solutionSteps,
    mistake_tags: Array.isArray(candidate.mistake_tags) ? candidate.mistake_tags.map((tag) => requiredText(String(tag), `${templateId} mistake tag`, 80)).slice(0, 12) : [],
    variable: null,
    tolerance: candidate.tolerance == null ? null : cleanNumber(Number(candidate.tolerance), 0.001, 0, 1_000_000),
    options: normalizedOptions,
    answer_mode: answerMode,
    work: {
      mode: workMode,
      prompt: optionalText(workCandidate.prompt, `${templateId} work prompt`, 500) || (workMode === "procedural_steps" ? "Show one mathematical step per line." : workMode === "none" ? "" : "Explain your reasoning clearly."),
      line_type: ["expression", "equation", "mixed", "text"].includes(workCandidate.line_type) ? workCandidate.line_type : "expression",
      target_variable: optionalText(workCandidate.target_variable, `${templateId} target_variable`, 40) || null,
      minimum_steps: minimumSteps,
      require_final_answer_match: workCandidate.require_final_answer_match !== false,
      proof_policy: {
        obligations,
        accepted_strategies: Array.isArray(proofCandidate.accepted_strategies)
          ? proofCandidate.accepted_strategies.map((item) => requiredText(String(item), `${templateId} proof strategy`, 200)).slice(0, 12)
          : [],
      },
      rubric: { criteria },
    },
    review_policy: {
      work_review: workReview,
      mastery_requires_review_pass: reviewCandidate.mastery_requires_review_pass === true || ["proof_obligations", "rubric_check"].includes(workMode),
      allow_self_review: reviewCandidate.allow_self_review !== false,
    },
    accepted_forms: Array.isArray(candidate.accepted_forms) ? candidate.accepted_forms.map((form) => requiredText(String(form), `${templateId} accepted form`, 300)).slice(0, 12) : [],
    work_required: candidate.work_required === true || answerMode === "final_plus_required_work",
  };
}

export function normalizeLessonPack(input, { knownSkillIds = [], nativeSkills = [] } = {}) {
  let candidate = input;
  if (typeof input === "string") {
    if (input.length > MAX_LESSON_SET_BYTES) throw new Error("Lesson set is larger than 2 MB.");
    try { candidate = JSON.parse(input); } catch { throw new Error("Lesson set is not valid JSON."); }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Lesson set must be a JSON object.");
  if (candidate.format !== LESSON_SET_FORMAT) throw new Error(`Lesson set format must be ${LESSON_SET_FORMAT}.`);
  const schemaVersion = candidate.schema_version;
  if (!["1.0", LESSON_SET_SCHEMA_VERSION].includes(schemaVersion)) throw new Error(`Unsupported lesson set schema_version ${schemaVersion ?? "missing"}.`);
  const mode = candidate.mode == null || candidate.mode === "add" ? "add" : candidate.mode === "override" ? "override" : null;
  if (!mode) throw new Error("Lesson set mode must be add or override.");
  if (mode === "override" && schemaVersion !== LESSON_SET_SCHEMA_VERSION) throw new Error("Native lesson improvements require schema_version 2.0.");
  const subject = normalizeSubject(candidate.subject, schemaVersion);
  const id = requiredText(candidate.id, "Lesson set ID", 60);
  if (!LESSON_SET_ID.test(id)) throw new Error("Lesson set ID must start with PACK_ and use uppercase letters, numbers, and underscores.");
  if (!Array.isArray(candidate.skills) || !candidate.skills.length || candidate.skills.length > MAX_LESSON_SET_SKILLS) {
    throw new Error(`Lesson set must contain 1 to ${MAX_LESSON_SET_SKILLS} skills.`);
  }
  const usedSkillIds = new Set(knownSkillIds);
  const nativeById = new Map(nativeSkills.map((skill) => [skill.id, skill]));
  const packSkillIds = candidate.skills.map((skill) => requiredText(skill?.id, "Skill ID", 60));
  if (new Set(packSkillIds).size !== packSkillIds.length) throw new Error("Lesson set contains duplicate skill IDs.");
  for (const skillId of packSkillIds) {
    if (mode === "add") {
      if (!CUSTOM_SKILL_ID.test(skillId)) throw new Error(`${skillId} must start with CUSTOM_ and use uppercase letters, numbers, and underscores.`);
      if (usedSkillIds.has(skillId)) throw new Error(`Skill ID ${skillId} is already installed.`);
    } else {
      const nativeSkill = nativeById.get(skillId);
      if (!nativeSkill) throw new Error(`${skillId} is not a native QuickMaths lesson and cannot be overridden.`);
      const nativeSubjectId = nativeSkill.subjectId ?? nativeSkill.subject_id ?? DEFAULT_SUBJECT_ID;
      if (nativeSubjectId !== subject.id) throw new Error(`${skillId} belongs to ${nativeSubjectId}; a native improvement cannot move it to ${subject.id}.`);
    }
  }
  const packSkillSet = new Set(packSkillIds);
  const allKnown = new Set([...usedSkillIds, ...packSkillIds]);
  const questionIds = new Set();
  const skills = candidate.skills.map((skillCandidate) => {
    const skillId = skillCandidate.id;
    const prerequisiteRefs = prerequisiteList(skillCandidate.prerequisites, `${skillId} prerequisites`);
    const prerequisites = prerequisiteRefs.map((ref) => ref.skillId);
    const unlocks = idList(skillCandidate.unlocks, `${skillId} unlocks`);
    for (const prerequisite of prerequisites) if (!allKnown.has(prerequisite)) throw new Error(`${skillId} references missing prerequisite ${prerequisite}.`);
    for (const unlock of unlocks) {
      if (mode === "add" && !packSkillSet.has(unlock)) throw new Error(`${skillId} unlock ${unlock} must belong to the same lesson set.`);
      if (mode === "override" && !allKnown.has(unlock)) throw new Error(`${skillId} references missing unlock ${unlock}.`);
    }
    if (!Array.isArray(skillCandidate.problems) || !skillCandidate.problems.length || skillCandidate.problems.length > MAX_PROBLEMS_PER_SKILL) {
      throw new Error(`${skillId} must contain 1 to ${MAX_PROBLEMS_PER_SKILL} problems.`);
    }
    const questionCount = Number(skillCandidate.question_count ?? skillCandidate.questionCount ?? skillCandidate.problems.length);
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > skillCandidate.problems.length) {
      throw new Error(`${skillId} question_count must be a whole number from 1 to ${skillCandidate.problems.length}.`);
    }
    const mastery = skillCandidate.mastery && typeof skillCandidate.mastery === "object" ? skillCandidate.mastery : {};
    const examples = Array.isArray(skillCandidate.examples) ? skillCandidate.examples.slice(0, 20).map((example, index) => ({
      prompt: requiredText(example?.prompt, `${skillId} example ${index + 1} prompt`, 1000),
      solution: requiredText(String(example?.solution ?? ""), `${skillId} example ${index + 1} solution`, 1000),
      explanation: requiredText(example?.explanation, `${skillId} example ${index + 1} explanation`, 2000),
    })) : [];
    const applications = Array.isArray(skillCandidate.applications) ? skillCandidate.applications.slice(0, 20).map((application, index) => ({
      title: requiredText(application?.title, `${skillId} application ${index + 1} title`, 160),
      description: requiredText(application?.description, `${skillId} application ${index + 1} description`, 1000),
    })) : [];
    return {
      id: skillId,
      packId: id,
      custom: mode === "add",
      native: mode === "override",
      overridden: mode === "override",
      subjectId: subject.id,
      prerequisiteRefs,
      name: requiredText(skillCandidate.name, `${skillId} name`, 160),
      domain: optionalText(skillCandidate.domain, `${skillId} domain`, 80) || "Custom",
      subdomain: optionalText(skillCandidate.subdomain, `${skillId} subdomain`, 120) || requiredText(candidate.name, "Lesson set name", 160),
      description: requiredText(skillCandidate.description, `${skillId} description`, 1000),
      prerequisites,
      unlocks,
      tags: Array.isArray(skillCandidate.tags) ? skillCandidate.tags.map((tag) => requiredText(String(tag), `${skillId} tag`, 80)).slice(0, 20) : [],
      mastery: {
        passing_score: cleanNumber(Number(mastery.passing_score), 0.8, 0.5, 1),
        minimum_confidence: Math.round(cleanNumber(Number(mastery.minimum_confidence), 3, 1, 5)),
        max_guessing_allowed: ["no", "maybe"].includes(mastery.max_guessing_allowed) ? mastery.max_guessing_allowed : "maybe",
        review_after_days_if_mastered: Math.round(cleanNumber(Number(mastery.review_after_days_if_mastered), 7, 1, 365)),
        review_after_days_if_learning: Math.round(cleanNumber(Number(mastery.review_after_days_if_learning), 2, 1, 365)),
      },
      theory: requiredText(skillCandidate.theory, `${skillId} theory`, 15_000),
      examples,
      applications,
      question_count: questionCount,
      problems: skillCandidate.problems.map((problem) => normalizeProblem(problem, skillId, questionIds)),
    };
  });
  const skillById = Object.fromEntries(skills.map((skill) => [skill.id, skill]));
  const visiting = new Set();
  const visited = new Set();
  const visit = (skillId) => {
    if (visiting.has(skillId)) throw new Error(`Lesson set prerequisite cycle includes ${skillId}.`);
    if (visited.has(skillId)) return;
    visiting.add(skillId);
    for (const prerequisite of skillById[skillId].prerequisites.filter((item) => packSkillSet.has(item))) visit(prerequisite);
    visiting.delete(skillId);
    visited.add(skillId);
  };
  packSkillIds.forEach(visit);
  const trackCandidate = candidate.track && typeof candidate.track === "object" ? candidate.track : {};
  const trackSkills = idList(trackCandidate.skills ?? packSkillIds, "Track skills", { max: MAX_LESSON_SET_SKILLS });
  if (trackSkills.length !== packSkillIds.length || trackSkills.some((skillId) => !packSkillSet.has(skillId))) throw new Error("Track skills must list every lesson-set skill exactly once.");
  const entrySkills = idList(trackCandidate.entry_skills ?? trackSkills.filter((skillId) => !skillById[skillId].prerequisites.some((item) => packSkillSet.has(item))), "Track entry_skills");
  const exitSkills = idList(trackCandidate.exit_skills ?? trackSkills.filter((skillId) => !skills.some((skill) => skill.prerequisites.includes(skillId))), "Track exit_skills");
  if (entrySkills.some((skillId) => !packSkillSet.has(skillId)) || exitSkills.some((skillId) => !packSkillSet.has(skillId))) throw new Error("Track entry and exit skills must belong to this lesson set.");
  return {
    format: LESSON_SET_FORMAT,
    schema_version: LESSON_SET_SCHEMA_VERSION,
    mode,
    id,
    name: requiredText(candidate.name, "Lesson set name", 160),
    description: requiredText(candidate.description, "Lesson set description", 1000),
    author: optionalText(candidate.author, "Lesson set author", 160) || "Unknown author",
    version: optionalText(candidate.version, "Lesson set version", 40) || "1.0.0",
    importedAt: cleanText(candidate.importedAt, 40) || new Date().toISOString(),
    subject,
    track: {
      id: optionalText(trackCandidate.id, "Track ID", 120) || `TRACK_${id}`,
      name: optionalText(trackCandidate.name, "Track name", 160) || requiredText(candidate.name, "Lesson set name", 160),
      domain: optionalText(trackCandidate.domain, "Track domain", 80) || "Custom",
      description: optionalText(trackCandidate.description, "Track description", 1000) || requiredText(candidate.description, "Lesson set description", 1000),
      entry_skills: entrySkills,
      exit_skills: exitSkills,
      skills: trackSkills,
      schema_version: LESSON_SET_SCHEMA_VERSION,
      subject_id: subject.id,
    },
    skills,
  };
}

export function normalizeLessonPackCollection(inputs, curriculum) {
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 1000) throw new Error("Lesson pack collection must contain 1 to 1000 packages.");
  if (!curriculum || !Array.isArray(curriculum.skills)) throw new Error("A base curriculum is required.");
  const candidates = inputs.map((input) => {
    if (typeof input !== "string") return input;
    if (input.length > MAX_LESSON_SET_BYTES) throw new Error("Lesson set is larger than 2 MB.");
    try { return JSON.parse(input); } catch { throw new Error("Lesson set is not valid JSON."); }
  });
  const skillIdsByPack = candidates.map((candidate, index) => {
    if (!candidate || !Array.isArray(candidate.skills)) throw new Error(`Lesson pack ${index + 1} has no skill list.`);
    return candidate.skills.map((skill) => requiredText(skill?.id, `Lesson pack ${index + 1} skill ID`, 60));
  });
  const builtInIds = curriculum.skills.map((skill) => skill.id);
  const packs = candidates.map((candidate, index) => normalizeLessonPack(candidate, {
    knownSkillIds: [...builtInIds, ...skillIdsByPack.flatMap((ids, otherIndex) => otherIndex === index ? [] : ids)],
    nativeSkills: curriculum.skills,
  }));
  if (new Set(packs.map((pack) => pack.id)).size !== packs.length) throw new Error("Lesson pack collection contains duplicate pack IDs.");
  validateCatalogGraph(curriculum, packs);
  return packs;
}

function sanitizeLessonPacks(value, curriculum, { strict = false } = {}) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    if (strict) throw new Error("Backup lessonPacks must be a list.");
    return [];
  }
  if (strict && value.length > MAX_LESSON_SETS) throw new Error(`Backup contains more than ${MAX_LESSON_SETS} lesson sets.`);
  const output = [];
  const known = new Set(curriculum.skills.map((skill) => skill.id));
  const packIds = new Set();
  for (const candidate of value.slice(0, MAX_LESSON_SETS)) {
    try {
      const pack = normalizeLessonPack(candidate, { knownSkillIds: known, nativeSkills: curriculum.skills });
      if (packIds.has(pack.id)) throw new Error(`Duplicate lesson set ID: ${pack.id}.`);
      validateCatalogGraph(curriculum, [...output, pack]);
      output.push(pack);
      packIds.add(pack.id);
      pack.skills.forEach((skill) => known.add(skill.id));
    } catch (error) {
      if (strict) throw error;
    }
  }
  return output;
}

function resolveCatalogSkills(curriculum, lessonPacks) {
  const builtInSkills = curriculum.skills.map((skill) => ({
    ...skill, subjectId: skill.subjectId ?? skill.subject_id ?? DEFAULT_SUBJECT_ID,
    custom: false, native: true, overridden: false,
  }));
  const nativeById = new Map(builtInSkills.map((skill) => [skill.id, skill]));
  const overrideTargets = new Set();
  const additions = [];
  const installedIds = new Set(nativeById.keys());
  for (const pack of lessonPacks) {
    if (pack.mode === "override") {
      for (const skill of pack.skills) {
        if (!nativeById.has(skill.id)) throw new Error(`${skill.id} is not a native QuickMaths lesson and cannot be overridden.`);
        if (overrideTargets.has(skill.id)) throw new Error(`Native lesson ${skill.id} already has an installed improvement.`);
        overrideTargets.add(skill.id);
        nativeById.set(skill.id, { ...skill, custom: false, native: true, overridden: true, packId: pack.id });
      }
      continue;
    }
    for (const skill of pack.skills) {
      if (installedIds.has(skill.id)) throw new Error(`The combined curriculum contains duplicate skill ID ${skill.id}.`);
      installedIds.add(skill.id);
      additions.push(skill);
    }
  }
  return [...builtInSkills.map((skill) => nativeById.get(skill.id)), ...additions];
}

function validateCatalogGraph(curriculum, lessonPacks) {
  const skills = resolveCatalogSkills(curriculum, lessonPacks);
  const byId = Object.fromEntries(skills.map((skill) => [skill.id, skill]));
  for (const skill of skills) {
    for (const prerequisite of skill.prerequisites ?? []) {
      if (!byId[prerequisite]) throw new Error(`${skill.id} references missing prerequisite ${prerequisite}.`);
    }
    for (const ref of skill.prerequisiteRefs ?? []) {
      const target = byId[ref.skillId];
      if (ref.subjectId && target && ref.subjectId !== (target.subjectId ?? DEFAULT_SUBJECT_ID)) {
        throw new Error(`${skill.id} says ${ref.skillId} belongs to ${ref.subjectId}, but it belongs to ${target.subjectId ?? DEFAULT_SUBJECT_ID}.`);
      }
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (skillId) => {
    if (visiting.has(skillId)) throw new Error(`Combined prerequisite cycle includes ${skillId}.`);
    if (visited.has(skillId)) return;
    visiting.add(skillId);
    for (const prerequisite of byId[skillId]?.prerequisites ?? []) visit(prerequisite);
    visiting.delete(skillId);
    visited.add(skillId);
  };
  skills.forEach((skill) => visit(skill.id));
}

function mergeCurriculum(curriculum, lessonPacks) {
  validateCatalogGraph(curriculum, lessonPacks);
  const skills = resolveCatalogSkills(curriculum, lessonPacks);
  const additivePacks = lessonPacks.filter((pack) => pack.mode !== "override");
  const subjectMap = new Map([[DEFAULT_SUBJECT_ID, { ...clone(DEFAULT_SUBJECT), skillIds: [] }]]);
  for (const candidate of curriculum.subjects ?? []) {
    const subject = { ...normalizeSubject(candidate, "2.0"), builtIn: true, skillIds: [] };
    if (subject.id === DEFAULT_SUBJECT_ID) subjectMap.set(DEFAULT_SUBJECT_ID, { ...subjectMap.get(DEFAULT_SUBJECT_ID), ...subject, skillIds: [] });
    else if (subjectMap.has(subject.id)) throw new Error(`Duplicate built-in subject ID: ${subject.id}.`);
    else subjectMap.set(subject.id, subject);
  }
  for (const pack of lessonPacks) {
    if (!subjectMap.has(pack.subject.id)) subjectMap.set(pack.subject.id, { ...clone(pack.subject), skillIds: [] });
  }
  for (const skill of skills) {
    const subject = subjectMap.get(skill.subjectId);
    if (!subject) throw new Error(`${skill.id} belongs to unknown subject ${skill.subjectId}.`);
    subject.skillIds.push(skill.id);
  }
  return {
    ...curriculum,
    track: {
      ...curriculum.track,
      skills: [...curriculum.track.skills, ...additivePacks.flatMap((pack) => pack.track.skills)],
      exit_skills: [...curriculum.track.exit_skills, ...additivePacks.flatMap((pack) => pack.track.exit_skills)],
    },
    skills,
    subjects: [...subjectMap.values()],
  };
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
    lessonPacks: [],
    backup: {
      lastExportAt: null,
      attemptCountAtExport: 0,
      reviewCountAtExport: 0,
      lessonPackCountAtExport: 0,
    },
    ui: {
      route: "welcome",
      selectedSkillId: "MATH_ARITH_001",
      selectedMapSkillId: "MATH_ARITH_001",
      mapZoom: 1,
      activeAttemptId: null,
      pendingResults: null,
      agentOpen: false,
      stagedLessonPack: null,
      tutorialStep: 0,
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
  const createdAt = cleanText(candidate.createdAt, 40) || new Date().toISOString();
  return {
    id,
    displayName,
    createdAt,
    totalLoggedSeconds: Math.floor(cleanNumber(candidate.totalLoggedSeconds, 0, 0, 100_000_000)),
    demo: Boolean(candidate.demo),
    activeSubjectId: SUBJECT_ID.test(candidate.activeSubjectId) ? candidate.activeSubjectId : DEFAULT_SUBJECT_ID,
    progressionMode: candidate.progressionMode === "soft" ? "soft" : "hard",
    mapScope: candidate.mapScope === "all" ? "all" : "subject",
    tutorialCompletedAt: candidate.tutorialCompletedAt === null ? null : cleanText(candidate.tutorialCompletedAt, 40) || createdAt,
    tutorialSkipped: Boolean(candidate.tutorialSkipped),
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
    reviewRequired: Boolean(candidate.reviewRequired),
    allowSelfReview: candidate.allowSelfReview !== false,
    workMode: cleanText(candidate.workMode, 60) || "none",
    proofObligations: Array.isArray(candidate.proofObligations) ? candidate.proofObligations.map((item) => cleanText(item, 500)).filter(Boolean).slice(0, 12) : [],
    rubricCriteria: Array.isArray(candidate.rubricCriteria) ? candidate.rubricCriteria.map((item) => cleanText(item, 500)).filter(Boolean).slice(0, 12) : [],
    reviewPolicy: cleanText(candidate.reviewPolicy, 60) || "none",
  };
}

function sanitizeAttempt(candidate, profileIds, skillIds) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const attemptId = cleanText(candidate.attemptId, 120);
  const profileId = cleanText(candidate.profileId, 100);
  const skillId = cleanText(candidate.skillId, 60);
  if (!attemptId || !profileIds.has(profileId) || !skillIds.has(skillId)) return null;
  const results = Array.isArray(candidate.results) ? candidate.results.map(sanitizeResult).filter(Boolean).slice(0, MAX_PROBLEMS_PER_SKILL) : [];
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
    scoreTotal: Math.floor(cleanNumber(candidate.scoreTotal, results.length, 0, MAX_PROBLEMS_PER_SKILL)),
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
        ? rawDraft.problems.map((problem) => cleanText(problem?.template_id, 120)).filter((id) => canonical[id]).slice(0, MAX_PROBLEMS_PER_SKILL)
        : [];
      if (!problemIds.length) continue;
      const included = new Set(problemIds.map((id) => assessmentGroupKey(canonical[id])));
      for (const problem of selectAssessmentProblems(skill)) {
        const groupKey = assessmentGroupKey(problem);
        if (included.has(groupKey)) continue;
        problemIds.push(problem.template_id);
        included.add(groupKey);
      }
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
  const results = candidate.results.map(sanitizeResult).filter(Boolean).slice(0, MAX_PROBLEMS_PER_SKILL);
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

function sanitizeState(candidate, curriculum, { strictPacks = false } = {}) {
  const base = initialState();
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return base;
  const lessonPacks = sanitizeLessonPacks(candidate.lessonPacks, curriculum, { strict: strictPacks });
  const catalog = mergeCurriculum(curriculum, lessonPacks);
  const skills = new Set(catalog.skills.map((skill) => skill.id));
  const profiles = Array.isArray(candidate.profiles)
    ? candidate.profiles.map(sanitizeProfile).filter(Boolean).slice(0, 30)
    : [];
  const profileIds = new Set(profiles.map((profile) => profile.id));
  const activeProfileId = profileIds.has(candidate.activeProfileId) ? candidate.activeProfileId : null;
  const ui = candidate.ui && typeof candidate.ui === "object" ? candidate.ui : {};
  const savedRoute = ROUTES.has(ui.route) ? ui.route : activeProfileId ? "home" : "welcome";
  const route = savedRoute === "data" ? "settings" : savedRoute;
  const selectedSkillId = skills.has(ui.selectedSkillId) ? ui.selectedSkillId : catalog.track.entry_skills[0];
  for (const profile of profiles) {
    if (!catalog.subjects.some((subject) => subject.id === profile.activeSubjectId)) profile.activeSubjectId = DEFAULT_SUBJECT_ID;
  }

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
    drafts: sanitizeDrafts(candidate.drafts, profileIds, catalog),
    lessonPacks,
    backup: {
      lastExportAt: cleanText(candidate.backup?.lastExportAt, 40) || null,
      attemptCountAtExport: Math.floor(cleanNumber(candidate.backup?.attemptCountAtExport, 0, 0, MAX_ATTEMPTS)),
      reviewCountAtExport: Math.floor(cleanNumber(candidate.backup?.reviewCountAtExport, 0, 0, MAX_REVIEWS)),
      lessonPackCountAtExport: Math.floor(cleanNumber(candidate.backup?.lessonPackCountAtExport, 0, 0, MAX_LESSON_SETS)),
    },
    ui: {
      route: activeProfileId ? (route === "welcome" ? "home" : route) : "welcome",
      selectedSkillId,
      selectedMapSkillId: skills.has(ui.selectedMapSkillId) ? ui.selectedMapSkillId : selectedSkillId,
      mapZoom: Math.round(cleanNumber(Number(ui.mapZoom), 1, 0.1, 1.6) * 100) / 100,
      activeAttemptId: attempts.some((attempt) => attempt.attemptId === ui.activeAttemptId) ? ui.activeAttemptId : null,
      pendingResults: sanitizePendingResults(ui.pendingResults, skills),
      agentOpen: Boolean(ui.agentOpen),
      stagedLessonPack: null,
      tutorialStep: Math.floor(cleanNumber(Number(ui.tutorialStep), 0, 0, TUTORIAL_STEPS - 1)),
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
            actor: item.actor === "agent" ? "agent" : "learner",
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
    const profile = { id: "profile-migrated-demo", displayName: "Demo Learner", createdAt: now, totalLoggedSeconds: 0, demo: true, activeSubjectId: DEFAULT_SUBJECT_ID, progressionMode: "hard", mapScope: "subject", tutorialCompletedAt: now, tutorialSkipped: false };
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
  const mode = problem.work?.mode ?? "none";
  if (mode === "capture_only" && !lines.length) return "Add your reasoning or notes before submitting.";
  if (mode === "proof_obligations") {
    if (!lines.length || lines.join(" ").length < 20) return "Write a proof that addresses the listed obligations before submitting.";
    return null;
  }
  if (mode === "rubric_check") {
    if (!lines.length || lines.join(" ").length < 20) return "Add enough reasoning for the review rubric before submitting.";
    return null;
  }
  if (mode !== "procedural_steps") return null;
  if (lines.length < minimumSteps) return `Show at least ${minimumSteps} mathematical steps.`;
  const lineType = problem.work?.line_type ?? "expression";
  if (lineType === "text") return null;
  if (lineType === "equation" && lines.some((line) => !/[=<>≤≥]/.test(line))) return "Each work line needs an equation or relation.";
  if (problem.work?.target_variable && !lines.some((line) => line.includes(problem.work.target_variable))) return `Shown work needs to use ${problem.work.target_variable}.`;
  const partsFor = (line) => line.split(/<=|>=|≤|≥|=|<|>/).map((part) => part.trim()).filter(Boolean);
  for (const line of lines) {
    if (lineType === "mixed" && !/[\d=+\-*/^()<>≤≥]/.test(line)) continue;
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
  const skillsById = {};
  const skillOrder = [];
  const unlocks = {};
  let catalog = curriculum;
  let state = loadState(storage, curriculum);
  let stagedLessonPack = null;
  const listeners = new Set();
  let storageError = null;

  const rebuildCatalog = () => {
    catalog = mergeCurriculum(curriculum, state.lessonPacks ?? []);
    for (const key of Object.keys(skillsById)) delete skillsById[key];
    for (const key of Object.keys(unlocks)) delete unlocks[key];
    skillOrder.splice(0, skillOrder.length);
    for (const skill of catalog.skills) skillsById[skill.id] = skill;
    skillOrder.push(...catalog.track.skills.filter((id) => skillsById[id]));
    for (const id of skillOrder) unlocks[id] = [...(skillsById[id].unlocks ?? [])];
    for (const skill of catalog.skills) {
      for (const prerequisite of skill.prerequisites) {
        unlocks[prerequisite] ??= [];
        if (!unlocks[prerequisite].includes(skill.id)) unlocks[prerequisite].push(skill.id);
      }
    }
  };
  rebuildCatalog();

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

  const addActivity = (tool, message, profileId = state.activeProfileId, actor = "learner") => {
    state.activity = [...state.activity, {
      at: isoNow(), tool, message, profileId: profileId ?? null, actor: actor === "agent" ? "agent" : "learner",
    }].slice(-MAX_ACTIVITY);
  };

  const activeProfile = () => state.profiles.find((profile) => profile.id === state.activeProfileId) ?? null;
  const activeProgress = () => state.progress[state.activeProfileId] ?? {};
  const profileAttempts = () => state.attempts.filter((attempt) => attempt.profileId === state.activeProfileId);
  const activeSubjectId = () => activeProfile()?.activeSubjectId ?? DEFAULT_SUBJECT_ID;

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
      if (record.status === "locked" && activeProfile()?.progressionMode === "soft") return "ready";
      if (PROVEN.has(record.status) && record.nextReviewAt && new Date(record.nextReviewAt).getTime() < milliseconds()) return "rusty";
      return record.status;
    }
    if (activeProfile()?.progressionMode === "soft") return "ready";
    return skill.prerequisites.every((id) => PROVEN.has(activeProgress()[id]?.status)) ? "ready" : "locked";
  };

  const progressRows = ({ subjectId = null } = {}) => skillOrder.filter((skillId) => !subjectId || skillsById[skillId]?.subjectId === subjectId).map((skillId) => {
    const skill = skillsById[skillId];
    const record = activeProgress()[skillId] ?? {};
    return {
      id: skill.id,
      packId: skill.packId ?? null,
      custom: Boolean(skill.custom),
      native: Boolean(skill.native),
      overridden: Boolean(skill.overridden),
      subjectId: skill.subjectId,
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
      unmetPrerequisites: skill.prerequisites.filter((id) => !PROVEN.has(activeProgress()[id]?.status)),
    };
  });

  const timers = () => {
    const profile = activeProfile();
    if (!profile || !state.session) return { sessionSeconds: 0, profileSeconds: profile?.totalLoggedSeconds ?? 0 };
    const sessionSeconds = Math.max(0, Math.floor((milliseconds() - state.session.startedAt) / 1000));
    const unflushed = Math.max(0, Math.floor((milliseconds() - state.session.heartbeatAt) / 1000));
    return { sessionSeconds, profileSeconds: profile.totalLoggedSeconds + unflushed };
  };

  const backupStatus = () => {
    let reason = "Progress is covered by browser autosave.";
    let recommended = false;
    if (storageError) {
      recommended = true;
      reason = "Browser autosave reported a problem; download a backup now.";
    } else if (!state.backup.lastExportAt && (state.attempts.length > 0 || state.lessonPacks.length > 0)) {
      recommended = true;
      reason = "No portable backup has been downloaded yet.";
    } else if (state.attempts.length > state.backup.attemptCountAtExport) {
      recommended = true;
      reason = "New mastery attempts have been saved since the last backup.";
    } else if (state.reviews.length > state.backup.reviewCountAtExport) {
      recommended = true;
      reason = "New tutor or self reviews have been saved since the last backup.";
    } else if (state.lessonPacks.length !== state.backup.lessonPackCountAtExport) {
      recommended = true;
      reason = "The installed lesson sets changed since the last backup.";
    } else if (state.backup.lastExportAt && milliseconds() - new Date(state.backup.lastExportAt).getTime() > 7 * 86_400_000) {
      recommended = true;
      reason = "The last portable backup is more than seven days old.";
    }
    return {
      lastExportAt: state.backup.lastExportAt,
      recommended,
      reason,
      attemptsSinceExport: Math.max(0, state.attempts.length - state.backup.attemptCountAtExport),
    };
  };

  const snapshot = () => {
    const allRows = state.activeProfileId ? progressRows() : [];
    const rows = state.activeProfileId ? progressRows({ subjectId: activeSubjectId() }) : [];
    const counts = Object.fromEntries(["locked", "ready", "learning", "proven", "mastered", "rusty"].map((key) => [key, rows.filter((row) => row.status === key).length]));
    const suggested = rows.find((row) => row.status === "rusty")
      ?? rows.find((row) => row.status === "learning")
      ?? rows.find((row) => row.status === "ready")
      ?? null;
    return {
      version: state.version,
      activeProfile: clone(activeProfile()),
      activeSubject: clone(catalog.subjects.find((subject) => subject.id === activeSubjectId()) ?? catalog.subjects[0]),
      subjects: clone(catalog.subjects),
      progressionMode: activeProfile()?.progressionMode ?? "hard",
      mapScope: activeProfile()?.mapScope ?? "subject",
      profiles: clone(state.profiles),
      progressRows: clone(rows),
      allProgressRows: clone(allRows),
      progressCounts: counts,
      suggested: clone(suggested),
      attempts: clone(profileAttempts().slice().reverse()),
      reviews: clone(state.reviews.filter((review) => review.profileId === state.activeProfileId).slice().reverse()),
      ui: clone(state.ui),
      timers: timers(),
      activity: clone(state.activity.filter((item) => item.profileId === state.activeProfileId && item.actor === "agent")),
      storageError,
      backupStatus: backupStatus(),
      stagedLessonPack: stagedLessonPack ? {
        id: stagedLessonPack.pack.id,
        name: stagedLessonPack.pack.name,
        mode: stagedLessonPack.pack.mode,
        author: stagedLessonPack.pack.author,
        version: stagedLessonPack.pack.version,
        subjectId: stagedLessonPack.pack.subject.id,
        subjectName: stagedLessonPack.pack.subject.name,
        skillCount: stagedLessonPack.pack.skills.length,
        problemCount: stagedLessonPack.pack.skills.reduce((count, skill) => count + skill.problems.length, 0),
      } : null,
      lessonPacks: state.lessonPacks.map((pack) => ({
        id: pack.id,
        mode: pack.mode,
        name: pack.name,
        description: pack.description,
        author: pack.author,
        version: pack.version,
        importedAt: pack.importedAt,
        skillCount: pack.skills.length,
        problemCount: pack.skills.reduce((count, skill) => count + skill.problems.length, 0),
        overridesNativeSkills: pack.mode === "override" ? pack.skills.map((skill) => skill.id) : [],
        subjectId: pack.subject.id,
        subjectName: pack.subject.name,
      })),
      selectedSkill: clone(skillsById[state.ui.selectedSkillId] ?? skillsById[skillOrder[0]]),
      selectedMapSkill: clone(skillsById[state.ui.selectedMapSkillId] ?? skillsById[skillOrder[0]]),
      activeTest: clone(state.drafts[state.activeProfileId]?.[state.ui.selectedSkillId] ?? null),
      pendingResults: clone(state.ui.pendingResults),
      curriculum: {
        track: clone(catalog.track),
        subjects: clone(catalog.subjects),
        lessonPacks: state.lessonPacks.map((pack) => ({ id: pack.id, name: pack.name, mode: pack.mode, skill_ids: [...pack.track.skills] })),
        skills: catalog.skills.filter((skill) => skill.subjectId === activeSubjectId()).map((skill) => ({
          id: skill.id,
          packId: skill.packId ?? null,
          custom: Boolean(skill.custom),
          native: Boolean(skill.native),
          overridden: Boolean(skill.overridden),
          subjectId: skill.subjectId,
          name: skill.name,
          subdomain: skill.subdomain,
          description: skill.description,
          prerequisites: [...skill.prerequisites],
          unlocks: [...(unlocks[skill.id] ?? [])],
          applications: clone(skill.applications),
        })),
        allSkills: catalog.skills.map((skill) => ({
          id: skill.id, packId: skill.packId ?? null, custom: Boolean(skill.custom), native: Boolean(skill.native), overridden: Boolean(skill.overridden), subjectId: skill.subjectId,
          name: skill.name, subdomain: skill.subdomain, description: skill.description,
          prerequisites: [...skill.prerequisites], unlocks: [...(unlocks[skill.id] ?? [])],
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
    const subjectId = activeProfile()?.activeSubjectId ?? DEFAULT_SUBJECT_ID;
    const firstSkill = skillOrder.find((id) => skillsById[id]?.subjectId === subjectId) ?? skillOrder[0];
    if (firstSkill && skillsById[state.ui.selectedSkillId]?.subjectId !== subjectId) {
      state.ui.selectedSkillId = firstSkill;
      state.ui.selectedMapSkillId = firstSkill;
    }
    state.ui.route = activeProfile()?.tutorialCompletedAt ? "home" : "tutorial";
    state.ui.tutorialStep = 0;
    state.ui.pendingResults = null;
    startSession(profileId);
    addActivity("select_profile", "Opened a learner profile.");
    notify();
  };

  const createProfile = (displayName, { demo = false } = {}) => {
    const name = cleanText(displayName, 60);
    if (name.length < 2) throw new Error("Profile name must contain at least 2 characters.");
    const profile = {
      id: makeId("profile"), displayName: name, createdAt: isoNow(), totalLoggedSeconds: 0, demo,
      activeSubjectId: DEFAULT_SUBJECT_ID, progressionMode: "hard", mapScope: "subject", tutorialCompletedAt: null, tutorialSkipped: false,
    };
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

  const navigate = (route, skillId = null, { activityActor = "learner" } = {}) => {
    if (!ROUTES.has(route) || route === "welcome") throw new Error("Unknown app view.");
    if (!activeProfile()) throw new Error("Select a profile first.");
    if (skillId) {
      if (!skillsById[skillId]) throw new Error("Unknown skill_id.");
      state.ui.selectedSkillId = skillId;
      state.ui.selectedMapSkillId = skillId;
      activeProfile().activeSubjectId = skillsById[skillId].subjectId;
    }
    const visibleRoute = route === "data" ? "settings" : route;
    state.ui.route = visibleRoute;
    addActivity("navigate_learning_app", `Opened ${visibleRoute}${skillId ? ` for ${skillId}` : ""}.`, undefined, activityActor);
    notify();
  };

  const startTutorial = () => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    state.ui.route = "tutorial";
    state.ui.tutorialStep = 0;
    addActivity("start_tutorial", "Opened the QuickMaths app tour.");
    notify();
  };

  const setTutorialStep = (step) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    state.ui.route = "tutorial";
    state.ui.tutorialStep = Math.floor(cleanNumber(Number(step), 0, 0, TUTORIAL_STEPS - 1));
    persist();
    const view = snapshot();
    listeners.forEach((listener) => listener(view));
  };

  const completeTutorial = ({ skipped = false } = {}) => {
    const profile = activeProfile();
    if (!profile) throw new Error("Select a profile first.");
    profile.tutorialCompletedAt = isoNow();
    profile.tutorialSkipped = Boolean(skipped);
    state.ui.tutorialStep = 0;
    state.ui.route = "home";
    addActivity(skipped ? "skip_tutorial" : "complete_tutorial", skipped ? "Skipped the app tour." : "Completed the app tour.");
    notify();
    return { ok: true, skipped: Boolean(skipped), completed_at: profile.tutorialCompletedAt };
  };

  const selectMapSkill = (skillId) => {
    if (!skillsById[skillId]) throw new Error("Unknown skill_id.");
    activeProfile().activeSubjectId = skillsById[skillId].subjectId;
    state.ui.selectedMapSkillId = skillId;
    notify();
  };

  const setMapZoom = (zoom) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    state.ui.mapZoom = Math.round(cleanNumber(Number(zoom), 1, 0.1, 1.6) * 100) / 100;
    persist();
    return state.ui.mapZoom;
  };

  const setLearningPreferences = ({ subjectId = null, progressionMode = null, mapScope = null, activityActor = "learner" } = {}) => {
    const profile = activeProfile();
    if (!profile) throw new Error("Select a profile first.");
    if (subjectId != null) {
      if (!catalog.subjects.some((subject) => subject.id === subjectId)) throw new Error("Unknown subject_id.");
      profile.activeSubjectId = subjectId;
      const firstSkill = skillOrder.find((id) => skillsById[id]?.subjectId === subjectId);
      if (firstSkill && skillsById[state.ui.selectedSkillId]?.subjectId !== subjectId) {
        state.ui.selectedSkillId = firstSkill;
        state.ui.selectedMapSkillId = firstSkill;
      }
    }
    if (progressionMode != null) {
      if (!["hard", "soft"].includes(progressionMode)) throw new Error("progression_mode must be hard or soft.");
      profile.progressionMode = progressionMode;
    }
    if (mapScope != null) {
      if (!["subject", "all"].includes(mapScope)) throw new Error("map_scope must be subject or all.");
      profile.mapScope = mapScope;
      if (mapScope === "subject" && skillsById[state.ui.selectedMapSkillId]?.subjectId !== profile.activeSubjectId) {
        state.ui.selectedMapSkillId = skillOrder.find((id) => skillsById[id]?.subjectId === profile.activeSubjectId) ?? state.ui.selectedMapSkillId;
      }
    }
    addActivity("set_learning_preferences", `Using ${profile.progressionMode} progression in ${catalog.subjects.find((subject) => subject.id === profile.activeSubjectId)?.name ?? profile.activeSubjectId}; the map shows ${profile.mapScope === "all" ? "all installed subjects" : "the current subject"}.`, undefined, activityActor);
    notify();
    return { ok: true, subject_id: profile.activeSubjectId, progression_mode: profile.progressionMode, map_scope: profile.mapScope };
  };

  const startTest = (skillId, { force = false, activityActor = "learner" } = {}) => {
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
      const problems = selectAssessmentProblems(skillsById[skillId], attemptCount);
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
    addActivity("start_skill_test", `Prepared a mastery test for ${skillId}.`, undefined, activityActor);
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
        reviewRequired: ["proof_obligations", "rubric_check"].includes(problem.work?.mode) || problem.review_policy?.mastery_requires_review_pass === true,
        allowSelfReview: problem.review_policy?.allow_self_review !== false,
        workMode: problem.work?.mode ?? "none",
        proofObligations: clone(problem.work?.proof_policy?.obligations ?? []),
        rubricCriteria: clone((problem.work?.rubric?.criteria ?? []).map((criterion) => criterion.description)),
        reviewPolicy: problem.review_policy?.work_review ?? "none",
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
    const prerequisitesMet = activeProfile()?.progressionMode === "soft" || skill.prerequisites.every((id) => PROVEN.has(activeProgress()[id]?.status));
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
      review_guide: {
        mode: problem.work?.mode ?? "none",
        proof_obligations: clone(problem.work?.proof_policy?.obligations ?? []),
        rubric_criteria: clone((problem.work?.rubric?.criteria ?? []).map((criterion) => criterion.description)),
        review_policy: problem.review_policy?.work_review ?? "none",
        mastery_requires_review_pass: problem.review_policy?.mastery_requires_review_pass === true,
      },
      mistake_tag: mistakeTag,
      messages: [grade.correct ? "The final answer passes the local grader; review the reasoning quality." : "Use the mistake tag and shown work to give one Socratic next step."],
      inspected_at: isoNow(),
    };
  };

  const recordTutorFeedback = ({ questionId, feedback, mistakeTag = "", nextStep, confidence = "medium", verdict = "partial", reviewerType = "ai_tutor", activityActor = "learner" }) => {
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
    const activeResult = activeAttempt?.results?.find((result) => result.questionId === safeQuestionId);
    if (reviewerType === "self" && activeResult?.allowSelfReview === false) throw new Error("This question requires tutor review and does not allow self review.");
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
    if (activeAttempt?.hasPendingReview) {
      const required = activeAttempt.results.filter((result) => result.reviewRequired);
      const verdicts = required.map((result) => state.reviews.filter((item) => item.attemptId === activeAttempt.attemptId && item.questionId === result.questionId).at(-1)?.verdict ?? null);
      if (verdicts.every((item) => item === "pass")) {
        const skill = skillsById[activeAttempt.skillId];
        const record = activeProgress()[activeAttempt.skillId];
        const prerequisitesMet = activeProfile()?.progressionMode === "soft" || skill.prerequisites.every((id) => PROVEN.has(activeProgress()[id]?.status));
        const passed = prerequisitesMet
          && activeAttempt.percentScore >= Number(skill.mastery.passing_score ?? 0.8)
          && activeAttempt.reflection.confidenceRating >= Number(skill.mastery.minimum_confidence ?? 3)
          && activeAttempt.reflection.guessed !== "yes";
        record.masteryScore = updateMastery(record.masteryScore, activeAttempt.percentScore, activeAttempt.reflection);
        record.status = passed ? (record.status === "proven" ? "mastered" : "proven") : "learning";
        record.nextReviewAt = reviewDate(record.status, activeAttempt.percentScore, activeAttempt.reflection.confidenceRating, now());
        record.updatedAt = isoNow();
        activeAttempt.masteryUpdate = { status: record.status, masteryScore: record.masteryScore };
        activeAttempt.reviewStatus = "review_passed";
        activeAttempt.hasPendingReview = false;
      } else if (verdicts.every(Boolean) && verdicts.some((item) => item !== "pass")) {
        activeAttempt.reviewStatus = "needs_revision";
      }
    }
    addActivity("record_tutor_feedback", "Saved visible tutor feedback to this profile.", undefined, activityActor);
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
      skill: { id: skill.id, pack_id: skill.packId ?? null, custom: Boolean(skill.custom), name: skill.name, description: skill.description, status: row.status },
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
    const rows = progressRows({ subjectId: activeSubjectId() });
    const view = snapshot();
    return {
      ok: true,
      profile: { display_name: activeProfile()?.displayName ?? "" },
      subject: { subject_id: view.activeSubject.id, name: view.activeSubject.name },
      progression_mode: activeProfile()?.progressionMode ?? "hard",
      counts: view.progressCounts,
      suggested_next: view.suggested ? {
        skill_id: view.suggested.id,
        name: view.suggested.name,
        status: view.suggested.status,
        mastery_score: view.suggested.masteryScore,
      } : null,
      custom_lesson_sets: state.lessonPacks.map((pack) => ({ id: pack.id, name: pack.name, skill_count: pack.skills.length })),
      skills: rows.map((row) => ({ skill_id: row.id, pack_id: row.packId, custom: row.custom, name: row.name, status: row.status, mastery_score: row.masteryScore, mistake_tags: row.mistakeTags })),
    };
  };

  const createFollowupProblem = ({ skillId = state.ui.selectedSkillId, focus = "", activityActor = "learner" } = {}) => {
    const draft = startTest(skillId, { activityActor });
    const safeFocus = cleanText(focus, 80);
    const matching = draft.problems.find((problem) => problem.mistake_tags?.includes(safeFocus)) ?? draft.problems[0];
    const liveDraft = state.drafts[state.activeProfileId]?.[skillId];
    if (liveDraft && matching) {
      liveDraft.problems = [matching, ...liveDraft.problems.filter((problem) => problem.template_id !== matching.template_id)];
    }
    state.ui.route = "test";
    addActivity("create_followup_problem", `Prepared ${matching.template_id} for targeted practice.`, undefined, activityActor);
    notify();
    return { ok: true, saved: true, problem: { question_id: matching.template_id, skill_id: skillId, prompt: matching.prompt, difficulty: matching.difficulty } };
  };

  const parseLessonPack = (raw) => {
    if (state.lessonPacks.length >= MAX_LESSON_SETS) throw new Error(`QuickMaths supports at most ${MAX_LESSON_SETS} installed lesson sets and improvements.`);
    let candidate = raw;
    if (typeof raw === "string") {
      if (raw.length > MAX_LESSON_SET_BYTES) throw new Error("Lesson set is larger than 2 MB.");
      try { candidate = JSON.parse(raw); } catch { throw new Error("Lesson set is not valid JSON."); }
    }
    if (state.lessonPacks.some((pack) => pack.id === candidate?.id)) throw new Error(`Lesson set ${candidate.id} is already installed.`);
    const pack = normalizeLessonPack(candidate, { knownSkillIds: Object.keys(skillsById), nativeSkills: curriculum.skills });
    validateCatalogGraph(curriculum, [...state.lessonPacks, pack]);
    return pack;
  };

  const previewLessonPack = (raw) => {
    const pack = parseLessonPack(raw);
    return {
      ok: true,
      id: pack.id,
      name: pack.name,
      description: pack.description,
      author: pack.author,
      version: pack.version,
      mode: pack.mode,
      subjectId: pack.subject.id,
      subjectName: pack.subject.name,
      createsSubject: !catalog.subjects.some((subject) => subject.id === pack.subject.id),
      skillCount: pack.skills.length,
      problemCount: pack.skills.reduce((count, skill) => count + skill.problems.length, 0),
      overridesNativeSkills: pack.mode === "override" ? pack.skills.map((skill) => skill.id) : [],
      prerequisiteLinksToBuiltIn: pack.skills.reduce((count, skill) => count + skill.prerequisites.filter((id) => !id.startsWith("CUSTOM_")).length, 0),
    };
  };

  const importLessonPack = (raw) => {
    const pack = parseLessonPack(raw);
    let restartedDraftCount = 0;
    if (pack.mode === "override") {
      const targets = new Set(pack.skills.map((skill) => skill.id));
      for (const profileDrafts of Object.values(state.drafts)) {
        for (const skillId of targets) {
          if (!profileDrafts?.[skillId]) continue;
          delete profileDrafts[skillId];
          restartedDraftCount += 1;
        }
      }
    }
    state.lessonPacks.push(pack);
    rebuildCatalog();
    if (activeProfile()) {
      activeProfile().activeSubjectId = pack.subject.id;
      state.ui.selectedSkillId = pack.track.skills[0];
      state.ui.selectedMapSkillId = pack.track.skills[0];
    }
    addActivity("load_lesson_set", pack.mode === "override"
      ? `Installed ${pack.name}; ${pack.skills.length} native lesson${pack.skills.length === 1 ? "" : "s"} improved without resetting completed progress.${restartedDraftCount ? ` ${restartedDraftCount} unfinished test${restartedDraftCount === 1 ? " was" : "s were"} restarted.` : ""}`
      : `Installed ${pack.name} with ${pack.skills.length} skills.`);
    notify();
    return { ok: true, id: pack.id, name: pack.name, mode: pack.mode, subjectId: pack.subject.id, subjectName: pack.subject.name, skillCount: pack.skills.length, totalSkillCount: skillOrder.length, completedProgressPreserved: pack.mode === "override", restartedDraftCount };
  };

  const stageLessonPack = (raw, { activityActor = "learner" } = {}) => {
    const pack = parseLessonPack(raw);
    stagedLessonPack = { raw: typeof raw === "string" ? raw : JSON.stringify(raw), pack };
    state.ui.route = "settings";
    addActivity("stage_custom_lesson_set", `Staged ${pack.name}; human confirmation is required to install it.`, undefined, activityActor);
    notify();
    return { ok: true, status: "staged", requires_human_confirmation: true, preview: previewLessonPack(raw) };
  };

  const installStagedLessonPack = () => {
    if (!stagedLessonPack) throw new Error("No lesson set is staged.");
    const staged = stagedLessonPack;
    stagedLessonPack = null;
    try { return importLessonPack(staged.raw); }
    catch (error) { stagedLessonPack = staged; throw error; }
  };

  const discardStagedLessonPack = () => {
    if (!stagedLessonPack) return { ok: true, discarded: false };
    const name = stagedLessonPack.pack.name;
    stagedLessonPack = null;
    addActivity("discard_staged_lesson_set", `Discarded staged lesson set ${name}.`);
    notify();
    return { ok: true, discarded: true };
  };

  const restoreNativeLessons = (packId) => {
    const index = state.lessonPacks.findIndex((pack) => pack.id === packId);
    if (index < 0) throw new Error("Lesson improvement not found.");
    const pack = state.lessonPacks[index];
    if (pack.mode !== "override") throw new Error("Only a native lesson improvement can be restored this way.");
    let restartedDraftCount = 0;
    const targets = new Set(pack.skills.map((skill) => skill.id));
    for (const profileDrafts of Object.values(state.drafts)) {
      for (const skillId of targets) {
        if (!profileDrafts?.[skillId]) continue;
        delete profileDrafts[skillId];
        restartedDraftCount += 1;
      }
    }
    state.lessonPacks.splice(index, 1);
    rebuildCatalog();
    addActivity("restore_native_lessons", `Restored the original ${pack.skills.map((skill) => skill.name).join(", ")} lesson content. Completed learner progress was preserved.${restartedDraftCount ? ` ${restartedDraftCount} unfinished test${restartedDraftCount === 1 ? " was" : "s were"} restarted.` : ""}`);
    notify();
    return { ok: true, restored: pack.skills.map((skill) => skill.id), completedProgressPreserved: true, restartedDraftCount };
  };

  const exportLessonPack = (packId) => {
    const pack = state.lessonPacks.find((item) => item.id === packId);
    if (!pack) throw new Error("Lesson set not found.");
    return JSON.stringify(pack, null, 2);
  };

  const exportBackup = () => {
    heartbeat(true);
    state.backup.lastExportAt = isoNow();
    state.backup.attemptCountAtExport = state.attempts.length;
    state.backup.reviewCountAtExport = state.reviews.length;
    state.backup.lessonPackCountAtExport = state.lessonPacks.length;
    addActivity("export_progress_backup", "Downloaded a portable progress backup.");
    notify();
    return JSON.stringify({ ...clone(state), exportedAt: isoNow(), app: "QuickMaths Web" }, null, 2);
  };

  const exportSyncState = () => {
    heartbeat();
    return JSON.stringify({
      ...clone(state),
      syncedAt: isoNow(),
      app: "QuickMaths Web",
      transport: "QuickMaths Bridge",
    }, null, 2);
  };

  const parseBackup = (raw) => {
    if (typeof raw !== "string" || raw.length > 10_000_000) throw new Error("Backup file is invalid or too large.");
    let candidate;
    try { candidate = JSON.parse(raw); } catch { throw new Error("Backup file is not valid JSON."); }
    if (!candidate || typeof candidate !== "object") throw new Error("Backup file is invalid.");
    if (Number(candidate.version) > APP_VERSION) throw new Error("This backup was created by a newer QuickMaths version.");
    const imported = sanitizeState(candidate, curriculum, { strictPacks: true });
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
      lessonPackCount: imported.lessonPacks.length,
      lessonPackNames: imported.lessonPacks.map((pack) => pack.name),
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
    rebuildCatalog();
    state.activeProfileId = null;
    state.session = null;
    state.ui.route = "welcome";
    addActivity("load_progress_backup", `Loaded ${state.profiles.length} profile(s) from a backup.`);
    notify();
    return { ok: true, profileCount: state.profiles.length, attemptCount: state.attempts.length };
  };

  const importSyncState = (raw) => {
    const { imported } = parseBackup(raw);
    state = imported;
    rebuildCatalog();
    if (state.activeProfileId && state.profiles.some((profile) => profile.id === state.activeProfileId)) {
      startSession(state.activeProfileId);
      if (state.ui.route === "welcome") state.ui.route = state.profiles.find((profile) => profile.id === state.activeProfileId)?.tutorialCompletedAt ? "home" : "tutorial";
    } else {
      state.activeProfileId = null;
      state.session = null;
      state.ui.route = "welcome";
    }
    notify();
    return {
      ok: true,
      activeProfileId: state.activeProfileId,
      profileCount: state.profiles.length,
      attemptCount: state.attempts.length,
      lessonPackCount: state.lessonPacks.length,
    };
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
    rebuildCatalog();
    notify();
  };

  return {
    snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    createProfile,
    selectProfile,
    logout,
    navigate,
    startTutorial,
    setTutorialStep,
    completeTutorial,
    selectMapSkill,
    setMapZoom,
    setLearningPreferences,
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
    previewLessonPack,
    stageLessonPack,
    installStagedLessonPack,
    discardStagedLessonPack,
    restoreNativeLessons,
    importLessonPack,
    exportLessonPack,
    exportBackup,
    exportSyncState,
    previewBackup,
    importBackup,
    importSyncState,
    exportCsv,
    heartbeat,
    replaceFromStorage,
    statusForSkill,
    skillsById,
    unlocks,
  };
}
