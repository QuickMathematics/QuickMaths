export const STORAGE_KEY = "quickmaths.web.v2";
export const LEGACY_STORAGE_KEY = "quickmaths.webmcp.challenge.v1";
export const APP_VERSION = 11;
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
  "equation_solution", "inequality_solution", "exact_text", "theorem_conclusion",
]);
const EXPRESSION_FUNCTIONS = new Set(["sqrt"]);
const EXPRESSION_CONSTANTS = Object.freeze({ pi: Math.PI, e: Math.E });
const SUPERSCRIPT_DIGITS = Object.freeze({ "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" });

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

function stableTextSeed(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

function seededRandom(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function safeTemplateTokens(expression) {
  const source = String(expression ?? "");
  if (!source.trim() || source.length > 500) throw new Error("Unsafe template expression.");
  const tokens = [];
  for (let index = 0; index < source.length;) {
    if (/\s/.test(source[index])) { index += 1; continue; }
    const rest = source.slice(index);
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    const operator = rest.match(/^(?:\*\*|\/\/|==|!=|<=|>=|[+\-*/%(),<>])/);
    if (number) { tokens.push({ type: "number", value: Number(number[0]) }); index += number[0].length; }
    else if (identifier) { tokens.push({ type: "identifier", value: identifier[0] }); index += identifier[0].length; }
    else if (operator) { tokens.push({ type: "operator", value: operator[0] }); index += operator[0].length; }
    else throw new Error("Unsupported template expression.");
    if (tokens.length > 250) throw new Error("Template expression is too complex.");
  }
  return tokens;
}

function safeTemplateEval(expression, variables) {
  const tokens = safeTemplateTokens(expression);
  let index = 0;
  const peek = (value) => tokens[index]?.value === value;
  const take = () => tokens[index++];
  const primary = () => {
    const token = take();
    if (!token) throw new Error("Unexpected end of template expression.");
    if (token.type === "number") return token.value;
    if (token.value === "(") { const value = logicalOr(); if (!peek(")")) throw new Error("Missing parenthesis."); take(); return value; }
    if (token.type !== "identifier") throw new Error("Expected a value.");
    if (["true", "false"].includes(token.value)) return token.value === "true";
    if (peek("(")) {
      if (!["abs", "min", "max", "round"].includes(token.value)) throw new Error("Unsupported template function.");
      take();
      const args = [];
      if (!peek(")")) {
        do { args.push(logicalOr()); if (!peek(",")) break; take(); } while (!peek(")"));
      }
      if (!peek(")")) throw new Error("Missing function parenthesis.");
      take();
      return { abs: Math.abs, min: Math.min, max: Math.max, round: Math.round }[token.value](...args);
    }
    if (!(token.value in variables)) throw new Error(`Unknown template name ${token.value}.`);
    return variables[token.value];
  };
  const power = () => { const left = primary(); return peek("**") ? (take(), left ** unary()) : left; };
  const unary = () => {
    if (peek("+")) { take(); return +unary(); }
    if (peek("-")) { take(); return -unary(); }
    return power();
  };
  const multiply = () => {
    let value = unary();
    while (["*", "/", "//", "%"].includes(tokens[index]?.value)) {
      const operator = take().value;
      const right = unary();
      if (operator === "*") value *= right;
      else if (operator === "/") value /= right;
      else if (operator === "//") value = Math.floor(value / right);
      else value -= Math.floor(value / right) * right;
    }
    return value;
  };
  const add = () => {
    let value = multiply();
    while (["+", "-"].includes(tokens[index]?.value)) value = take().value === "+" ? value + multiply() : value - multiply();
    return value;
  };
  const comparison = () => {
    let left = add();
    let compared = false;
    let result = true;
    while (["==", "!=", "<", "<=", ">", ">="].includes(tokens[index]?.value)) {
      compared = true;
      const operator = take().value;
      const right = add();
      result &&= { "==": left === right, "!=": left !== right, "<": left < right, "<=": left <= right, ">": left > right, ">=": left >= right }[operator];
      left = right;
    }
    return compared ? result : left;
  };
  const logicalNot = () => { if (peek("not")) { take(); return !logicalNot(); } return comparison(); };
  const logicalAnd = () => { let value = logicalNot(); while (peek("and")) { take(); const right = logicalNot(); value = Boolean(value) && Boolean(right); } return value; };
  const logicalOr = () => { let value = logicalAnd(); while (peek("or")) { take(); const right = logicalAnd(); value = Boolean(value) || Boolean(right); } return value; };
  const value = logicalOr();
  if (index !== tokens.length || (typeof value === "number" && !Number.isFinite(value)) || !["number", "boolean", "string"].includes(typeof value)) throw new Error("Template expression did not resolve safely.");
  return value;
}

function stringifyTemplateValue(value) {
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  return String(value);
}

function formatGeneratedMath(value) {
  return String(value).replace(/\s+/g, " ").replace(/\+\s*-/g, "- ").replace(/-\s*-/g, "+ ").replace(/\b1([A-Za-z])/g, "$1").replace(/(?<!\d)-1([A-Za-z])/g, "-$1").replace(/\(\+\s*/g, "(").trim();
}

function renderNativeTemplate(template, values) {
  return formatGeneratedMath(String(template ?? "").replace(/{([^{}]+)}/g, (_, expression) => stringifyTemplateValue(expression.trim() in values ? values[expression.trim()] : safeTemplateEval(expression, values))));
}

function generateNativeProblem(skill, template, attemptCount, templateIndex) {
  const seed = (stableTextSeed(`${skill.id}:${template.id}`) + Math.imul(attemptCount + 1, 104729) + Math.imul(templateIndex + 1, 8191)) >>> 0;
  const random = seededRandom(seed);
  const tries = Math.max(1, Math.min(500, Number(template.max_attempts ?? 100)));
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const values = {};
    try {
      for (const [name, rule] of Object.entries(template.variables ?? {})) {
        const excluded = new Set(rule.exclude ?? []);
        if (rule.type === "int") {
          const candidates = [];
          for (let value = Number(rule.min); value <= Number(rule.max); value += 1) if (!excluded.has(value)) candidates.push(value);
          if (!candidates.length) throw new Error("No integer candidates.");
          values[name] = candidates[Math.floor(random() * candidates.length)];
        } else if (rule.type === "decimal") {
          const scale = 10 ** Number(rule.places ?? 1);
          const candidates = [];
          for (let value = Math.round(Number(rule.min) * scale); value <= Math.round(Number(rule.max) * scale); value += 1) if (!excluded.has(value / scale)) candidates.push(value / scale);
          if (!candidates.length) throw new Error("No decimal candidates.");
          values[name] = candidates[Math.floor(random() * candidates.length)];
        } else if (rule.type === "choice") {
          const candidates = (rule.values ?? []).filter((value) => !excluded.has(value));
          if (!candidates.length) throw new Error("No choice candidates.");
          values[name] = candidates[Math.floor(random() * candidates.length)];
        } else throw new Error("Unsupported native variable type.");
      }
      for (const [name, expression] of Object.entries(template.derived ?? {})) values[name] = safeTemplateEval(expression, values);
      if (!(template.constraints ?? []).every((constraint) => Boolean(safeTemplateEval(constraint, values)))) continue;
      const answer = template.answer ?? {};
      const explanation = template.explanation_template ? renderNativeTemplate(template.explanation_template, values).split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : clone(template.solution_steps ?? []);
      const answerMode = template.answer_mode ?? "final_only";
      const work = clone(template.work ?? {});
      return {
        template_id: `${template.id}__RUNTIME_${attemptCount + 1}`,
        source_template_id: template.id,
        skill_id: skill.id,
        seed,
        difficulty: template.difficulty ?? "medium",
        values: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, stringifyTemplateValue(value)])),
        prompt: renderNativeTemplate(template.prompt_template, values),
        expected_answer: renderNativeTemplate(String(answer.value ?? ""), values),
        answer_type: answer.type ?? "text",
        grading_method: template.grading?.method ?? "exact_text",
        solution_steps: explanation,
        mistake_tags: clone(template.mistake_tags ?? []),
        variable: answer.variable ?? null,
        tolerance: template.grading?.tolerance ?? null,
        options: (template.options ?? []).map((option) => ({ ...clone(option), label: option.label == null ? option.label : renderNativeTemplate(String(option.label), values) })),
        answer_mode: answerMode,
        work,
        review_policy: clone(template.review_policy ?? {}),
        accepted_forms: clone(answer.accepted_forms ?? template.grading?.accepted_forms ?? []),
        work_required: ["final_plus_required_work", "structured_steps", "proof_required"].includes(answerMode) || ["required", "procedural_steps", "proof_obligations", "rubric_check"].includes(work.mode ?? "none"),
      };
    } catch {
      // Try a fresh variable draw. Exported native templates are trusted, but every expression still uses the allowlisted parser above.
    }
  }
  throw new Error(`Could not generate ${skill.id}/${template.id}.`);
}

function generateNativeAssessment(skill, attemptCount) {
  const templates = [...skill.native_templates];
  if (skill.native_randomize_order !== false) {
    const random = seededRandom(stableTextSeed(`${skill.id}:order:${attemptCount}`));
    for (let index = templates.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [templates[index], templates[swap]] = [templates[swap], templates[index]];
    }
  }
  return templates.map((template, index) => {
    if (template.type === "fixed") {
      const fixed = skill.problems.find((problem) => assessmentGroupKey(problem) === template.id);
      if (fixed) return { ...clone(fixed), template_id: `${template.id}__RUNTIME_${attemptCount + 1}` };
    }
    try { return generateNativeProblem(skill, template, attemptCount, index); }
    catch {
      const variants = skill.problems.filter((problem) => assessmentGroupKey(problem) === template.id);
      if (!variants.length) throw new Error(`Native assessment scenario ${template.id} is unavailable.`);
      return clone(variants[attemptCount % variants.length]);
    }
  });
}

function selectAssessmentProblems(skill, attemptCount = 0) {
  if (!skill?.overridden && Array.isArray(skill?.native_templates) && skill.native_templates.length) return generateNativeAssessment(skill, attemptCount);
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
    ? proofCandidate.obligations.map((item, index) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        return {
          id: optionalText(item.id, `${templateId} proof obligation ${index + 1} ID`, 80) || `obligation_${index + 1}`,
          description: requiredText(item.description ?? item.label, `${templateId} proof obligation ${index + 1}`, 500),
          required: item.required !== false,
        };
      }
      return requiredText(String(item), `${templateId} proof obligation`, 500);
    }).slice(0, 12)
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
    variable: optionalText(candidate.variable, `${templateId} variable`, 40) || null,
    tolerance: candidate.tolerance == null ? null : cleanNumber(Number(candidate.tolerance), 0.001, 0, 1_000_000),
    options: normalizedOptions,
    answer_mode: answerMode,
    work: {
      mode: workMode,
      prompt: optionalText(workCandidate.prompt, `${templateId} work prompt`, 500) || (workMode === "procedural_steps" ? "Show one mathematical step per line." : workMode === "none" ? "" : "Explain your reasoning clearly."),
      line_type: ["expression", "equation", "inequality", "mixed", "text"].includes(workCandidate.line_type) ? workCandidate.line_type : "expression",
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

function normalizeReviewObligation(item, index) {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    return {
      id: cleanText(item.id, 80) || `obligation_${index + 1}`,
      description: cleanText(item.description ?? item.label, 500) || `Obligation ${index + 1}`,
      required: item.required !== false,
    };
  }
  return { id: `obligation_${index + 1}`, description: cleanText(item, 500) || `Obligation ${index + 1}`, required: true };
}

function normalizeReviewCriterion(item, index) {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    return {
      id: cleanText(item.id, 80) || `criterion_${index + 1}`,
      description: cleanText(item.description ?? item.label, 500) || `Criterion ${index + 1}`,
      weight: cleanNumber(Number(item.weight ?? item.maxPoints), 1, 0.01, 100),
    };
  }
  return { id: `criterion_${index + 1}`, description: cleanText(item, 500) || `Criterion ${index + 1}`, weight: 1 };
}

function sanitizeObligationResult(item, index) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const status = ["satisfied", "flawed", "missing", "not_applicable"].includes(item.status) ? item.status : "missing";
  return { id: cleanText(item.id, 80) || `obligation_${index + 1}`, status, note: cleanText(item.note, 500) };
}

function sanitizeRubricResult(item, index) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  return {
    id: cleanText(item.id, 80) || `criterion_${index + 1}`,
    awardedPoints: cleanNumber(Number(item.awardedPoints ?? item.awarded_points), 0, 0, 100),
    maxPoints: cleanNumber(Number(item.maxPoints ?? item.max_points), 1, 0.01, 100),
    note: cleanText(item.note, 500),
  };
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
    proofObligations: Array.isArray(candidate.proofObligations) ? candidate.proofObligations.map(normalizeReviewObligation).slice(0, 12) : [],
    rubricCriteria: Array.isArray(candidate.rubricCriteria) ? candidate.rubricCriteria.map(normalizeReviewCriterion).slice(0, 12) : [],
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
    reviewMasteryDeltaApplied: cleanNumber(candidate.reviewMasteryDeltaApplied, 0, -20, 20),
    reviewResolution: candidate.reviewResolution && typeof candidate.reviewResolution === "object" ? {
      verdict: ["pass", "partial", "needs_revision", "fail"].includes(candidate.reviewResolution.verdict) ? candidate.reviewResolution.verdict : "partial",
      score: cleanNumber(candidate.reviewResolution.score, 0, 0, 1),
      reviewIds: Array.isArray(candidate.reviewResolution.reviewIds) ? candidate.reviewResolution.reviewIds.map((id) => cleanText(id, 120)).filter(Boolean).slice(0, MAX_PROBLEMS_PER_SKILL) : [],
    } : null,
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
    obligationResults: Array.isArray(candidate.obligationResults) ? candidate.obligationResults.map(sanitizeObligationResult).filter(Boolean).slice(0, 12) : [],
    rubricResults: Array.isArray(candidate.rubricResults) ? candidate.rubricResults.map(sanitizeRubricResult).filter(Boolean).slice(0, 12) : [],
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
      const safeProblems = new Map(Object.entries(canonical));
      const nativeTemplateIds = new Set((skill.native_templates ?? []).map((template) => template.id));
      if (Array.isArray(rawDraft.problems) && nativeTemplateIds.size) {
        const generatedByVariation = new Map();
        for (const rawProblem of rawDraft.problems) {
          const id = cleanText(rawProblem?.template_id, 120);
          const sourceId = cleanText(rawProblem?.source_template_id, 120);
          if (!id || safeProblems.has(id) || !nativeTemplateIds.has(sourceId) || !id.startsWith(`${sourceId}__RUNTIME_`)) continue;
          const variation = Number(id.slice(`${sourceId}__RUNTIME_`.length)) - 1;
          if (!Number.isInteger(variation) || variation < 0 || variation > 10_000) continue;
          try {
            if (!generatedByVariation.has(variation)) generatedByVariation.set(variation, generateNativeAssessment(skill, variation));
            const regenerated = generatedByVariation.get(variation).find((problem) => problem.template_id === id && assessmentGroupKey(problem) === sourceId);
            if (regenerated) safeProblems.set(id, regenerated);
          } catch { /* Discard malformed or non-reproducible runtime problems. */ }
        }
      }
      const problemIds = Array.isArray(rawDraft.problems)
        ? rawDraft.problems.map((problem) => cleanText(problem?.template_id, 120)).filter((id) => safeProblems.has(id)).slice(0, MAX_PROBLEMS_PER_SKILL)
        : [];
      if (!problemIds.length) continue;
      const included = new Set(problemIds.map((id) => assessmentGroupKey(safeProblems.get(id))));
      for (const problem of selectAssessmentProblems(skill)) {
        const groupKey = assessmentGroupKey(problem);
        if (included.has(groupKey)) continue;
        safeProblems.set(problem.template_id, problem);
        problemIds.push(problem.template_id);
        included.add(groupKey);
      }
      const responses = rawDraft.responses && typeof rawDraft.responses === "object" ? rawDraft.responses : {};
      output[profileId][skillId] = {
        draftId: cleanText(rawDraft.draftId, 120) || `draft-imported-${profileId}-${skillId}`,
        skillId,
        startedAt: cleanText(rawDraft.startedAt, 40) || new Date().toISOString(),
        problems: problemIds.map((id) => clone(safeProblems.get(id))),
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

function normalizeMathNotation(value) {
  let source = String(value ?? "")
    .trim()
    .replace(/[−–—]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, "pi")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/\*\*/g, "^");
  source = source.replace(/([A-Za-z0-9_)])([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g, (_, base, exponent) => `${base}^${[...exponent].map((digit) => SUPERSCRIPT_DIGITS[digit]).join("")}`);
  source = source.replace(/√\s*\(([^()]*)\)/g, "sqrt($1)");
  source = source.replace(/√\s*([A-Za-z0-9_.]+)/g, "sqrt($1)");
  return source;
}

function normalizeAnswer(value) {
  return normalizeMathNotation(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[.]+$/, "");
}

function numericValue(value) {
  const clean = normalizeAnswer(value).replace(/^[a-z][a-z0-9_]*=/, "");
  if (/^-?\d+(\.\d+)?\/-?\d+(\.\d+)?$/.test(clean)) {
    const [numerator, denominator] = clean.split("/").map(Number);
    return denominator ? numerator / denominator : Number.NaN;
  }
  if (/^-?\d+\s+-?\d+\/\d+$/.test(String(value).trim())) {
    const [whole, fraction] = String(value).trim().split(/\s+/);
    const [numerator, denominator] = fraction.split("/").map(Number);
    return Number(whole) + Math.sign(Number(whole) || 1) * numerator / denominator;
  }
  const direct = Number(clean);
  if (Number.isFinite(direct)) return direct;
  const tokens = expressionTokens(clean);
  if (!tokens || tokens.some((token) => token.type === "identifier" && !(token.value in EXPRESSION_CONSTANTS) && !EXPRESSION_FUNCTIONS.has(token.value))) return Number.NaN;
  try {
    const evaluated = evaluateExpression(tokens, {});
    return Number.isFinite(evaluated) ? evaluated : Number.NaN;
  } catch {
    return Number.NaN;
  }
}

function expressionTokens(value) {
  const source = normalizeMathNotation(value).replace(/\s+/g, "");
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
      const value = identifier[0].toLowerCase();
      const conventionalProduct = /^[a-z]+$/.test(value) && value.length > 1 && !EXPRESSION_FUNCTIONS.has(value) && !(value in EXPRESSION_CONSTANTS);
      raw.push(...(conventionalProduct ? [...value].map((letter) => ({ type: "identifier", value: letter })) : [{ type: "identifier", value }]));
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
    const previous = tokens.at(-1);
    const isFunctionCall = previous?.type === "identifier" && EXPRESSION_FUNCTIONS.has(previous.value) && token.value === "(";
    if (!isFunctionCall && endsValue(previous) && startsValue(token)) tokens.push({ type: "operator", value: "*" });
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
      if (EXPRESSION_FUNCTIONS.has(token.value)) {
        if (!peek("(")) throw new Error("Function argument is missing.");
        take();
        const argument = addSubtract();
        if (!peek(")")) throw new Error("Missing closing parenthesis.");
        take();
        return token.value === "sqrt" ? Math.sqrt(argument) : Number.NaN;
      }
      if (token.value in EXPRESSION_CONSTANTS) return EXPRESSION_CONSTANTS[token.value];
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

function expressionVariableNames(...tokenSets) {
  return [...new Set(tokenSets.flat().filter((token) => token?.type === "identifier" && !(token.value in EXPRESSION_CONSTANTS) && !EXPRESSION_FUNCTIONS.has(token.value)).map((token) => token.value))];
}

function sampledVariables(names, sample) {
  return Object.fromEntries(names.map((name, variableIndex) => {
    let seed = (((sample + 1) * 2654435761) ^ ((variableIndex + 11) * 2246822519)) >>> 0;
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const magnitude = 2 + ((seed >>> 1) % 17);
    return [name, seed & 1 ? -magnitude : magnitude];
  }));
}

function parseRelation(value) {
  const source = normalizeMathNotation(value).trim();
  const matches = [...source.matchAll(/<=|>=|=|<|>/g)];
  if (matches.length !== 1) return null;
  const match = matches[0];
  const left = source.slice(0, match.index).trim();
  const right = source.slice(match.index + match[0].length).trim();
  const leftTokens = expressionTokens(left);
  const rightTokens = expressionTokens(right);
  if (!leftTokens || !rightTokens) return null;
  return { left, right, leftTokens, rightTokens, relation: match[0] };
}

function relationHolds(value, relation) {
  const epsilon = 1e-9 * Math.max(1, Math.abs(value));
  if (relation === "=") return Math.abs(value) <= epsilon;
  if (relation === "<") return value < -epsilon;
  if (relation === "<=") return value <= epsilon;
  if (relation === ">") return value > epsilon;
  if (relation === ">=") return value >= -epsilon;
  return false;
}

function linearRelationSignature(parsed, targetVariable, variables) {
  try {
    const difference = (target) => evaluateExpression(parsed.leftTokens, { ...variables, [targetVariable]: target })
      - evaluateExpression(parsed.rightTokens, { ...variables, [targetVariable]: target });
    const atZero = difference(0);
    const atOne = difference(1);
    const atTwo = difference(2);
    const slope = atOne - atZero;
    const scale = Math.max(1, Math.abs(atZero), Math.abs(atOne), Math.abs(atTwo));
    if (![atZero, atOne, atTwo].every(Number.isFinite) || Math.abs(atTwo - (atZero + 2 * slope)) > 1e-8 * scale) return null;
    if (Math.abs(slope) <= 1e-10 * scale) return { kind: relationHolds(atZero, parsed.relation) ? "all" : "none" };
    const boundary = -atZero / slope;
    if (parsed.relation === "=") return { kind: "point", boundary };
    const flip = { "<": ">", "<=": ">=", ">": "<", ">=": "<=" };
    return { kind: "range", relation: slope < 0 ? flip[parsed.relation] : parsed.relation, boundary };
  } catch {
    return null;
  }
}

function sameRelationSignature(left, right) {
  if (!left || !right || left.kind !== right.kind) return false;
  if (["all", "none"].includes(left.kind)) return true;
  if (left.relation !== right.relation) return false;
  return Math.abs(left.boundary - right.boundary) <= 1e-8 * Math.max(1, Math.abs(left.boundary), Math.abs(right.boundary));
}

function relationsEquivalent(leftValue, rightValue, targetVariable, expectedRelation) {
  const left = parseRelation(leftValue);
  const right = parseRelation(rightValue);
  if (!left || !right || left.relation !== expectedRelation || right.relation !== expectedRelation) return false;
  const names = expressionVariableNames(left.leftTokens, left.rightTokens, right.leftTokens, right.rightTokens).filter((name) => name !== targetVariable);
  if (names.length > 12) return false;
  let successfulSamples = 0;
  for (let sample = 0; sample < 8; sample += 1) {
    const variables = sampledVariables(names, sample);
    const leftSignature = linearRelationSignature(left, targetVariable, variables);
    const rightSignature = linearRelationSignature(right, targetVariable, variables);
    if (!leftSignature || !rightSignature) continue;
    if (!sameRelationSignature(leftSignature, rightSignature)) return false;
    successfulSamples += 1;
  }
  return successfulSamples >= 3;
}

function equationStepsEquivalent(left, right, targetVariable) {
  return relationsEquivalent(left, right, targetVariable, "=");
}

function inequalitySolutionsEquivalent(left, right, targetVariable) {
  const leftParsed = parseRelation(left);
  const rightParsed = parseRelation(right);
  if (!leftParsed || !rightParsed || leftParsed.relation === "=" || rightParsed.relation === "=") return false;
  const names = expressionVariableNames(leftParsed.leftTokens, leftParsed.rightTokens, rightParsed.leftTokens, rightParsed.rightTokens).filter((name) => name !== targetVariable);
  if (names.length > 12) return false;
  let successfulSamples = 0;
  for (let sample = 0; sample < 8; sample += 1) {
    const variables = sampledVariables(names, sample);
    const leftSignature = linearRelationSignature(leftParsed, targetVariable, variables);
    const rightSignature = linearRelationSignature(rightParsed, targetVariable, variables);
    if (!leftSignature || !rightSignature) continue;
    if (!sameRelationSignature(leftSignature, rightSignature)) return false;
    successfulSamples += 1;
  }
  return successfulSamples >= 3;
}

function symbolicEquivalent(left, right) {
  const leftTokens = expressionTokens(left);
  const rightTokens = expressionTokens(right);
  if (!leftTokens || !rightTokens) return false;
  const names = expressionVariableNames(leftTokens, rightTokens);
  if (names.length > 12) return false;
  let successfulSamples = 0;
  for (let sample = 0; sample < 8; sample += 1) {
    const variables = sampledVariables(names, sample);
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

function extractSolutionValue(value, variable = "x") {
  const source = normalizeMathNotation(value).trim();
  const parts = source.split("=");
  if (parts.length !== 2) return source;
  const [left, right] = parts.map((part) => part.trim());
  if (left.toLowerCase() === variable.toLowerCase()) return right;
  if (right.toLowerCase() === variable.toLowerCase()) return left;
  return right;
}

export function gradeProblem(problem, answer) {
  const expected = String(problem.expected_answer ?? "");
  const acceptedForms = [expected, ...(problem.accepted_forms ?? [])].map(String);
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
    correct = acceptedForms.some((form) => symbolicEquivalent(
      extractSolutionValue(answer, problem.variable ?? "x"),
      extractSolutionValue(form, problem.variable ?? "x"),
    ));
  } else if (method === "inequality_solution") {
    correct = acceptedForms.some((form) => inequalitySolutionsEquivalent(answer, form, problem.variable ?? problem.work?.target_variable ?? "x"));
  } else if (method === "symbolic_expression") {
    correct = acceptedForms.some((form) => symbolicEquivalent(answer, form));
  } else if (method === "theorem_conclusion") {
    const accepted = acceptedForms.map(normalizeAnswer);
    correct = accepted.includes(normalizedAnswer);
  } else {
    correct = acceptedForms.map(normalizeAnswer).includes(normalizedAnswer);
  }

  return { correct, expected, method };
}

export function validateProceduralWork(problem, work) {
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
  if (lineType === "equation" && lines.some((line) => parseRelation(line)?.relation !== "=")) return "Each work line needs one equation sign.";
  if (lineType === "inequality" && lines.some((line) => !["<", "<=", ">", ">="].includes(parseRelation(line)?.relation))) return "Each work line needs one inequality sign.";
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
  for (let index = 1; index < parsedLines.length; index += 1) {
    const previous = parsedLines[index - 1];
    const current = parsedLines[index];
    if (previous.expression && current.expression && !symbolicEquivalent(previous.expression, current.expression)) {
      return `Step ${index + 1} is not equivalent to the step before it.`;
    }
    if (lineType === "equation" && !equationStepsEquivalent(lines[index - 1], lines[index], problem.work?.target_variable ?? problem.variable ?? "x")) {
      return `Step ${index + 1} changes the solution from the step before it.`;
    }
    if (lineType === "inequality" && !inequalitySolutionsEquivalent(lines[index - 1], lines[index], problem.work?.target_variable ?? problem.variable ?? "x")) {
      return `Step ${index + 1} changes the inequality solution set.`;
    }
  }
  if (problem.work?.require_final_answer_match) {
    const lastLine = lines.at(-1);
    if (lineType === "inequality") {
      if (!inequalitySolutionsEquivalent(lastLine, problem.expected_answer, problem.work?.target_variable ?? problem.variable ?? "x")) return "The final work line needs to match the final answer.";
      return null;
    }
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
          questionCount: assessmentLength(skill),
          prerequisites: [...skill.prerequisites],
          unlocks: [...(unlocks[skill.id] ?? [])],
          applications: clone(skill.applications),
        })),
        allSkills: catalog.skills.map((skill) => ({
          id: skill.id, packId: skill.packId ?? null, custom: Boolean(skill.custom), native: Boolean(skill.native), overridden: Boolean(skill.overridden), subjectId: skill.subjectId,
          name: skill.name, subdomain: skill.subdomain, description: skill.description, questionCount: assessmentLength(skill),
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
    const profile = activeProfile();
    const subjectId = skillsById[skillId].subjectId;
    if (profile.activeSubjectId === subjectId && state.ui.selectedMapSkillId === skillId && state.ui.selectedSkillId === skillId) return;
    profile.activeSubjectId = subjectId;
    state.ui.selectedMapSkillId = skillId;
    state.ui.selectedSkillId = skillId;
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
        proofObligations: clone((problem.work?.proof_policy?.obligations ?? []).map(normalizeReviewObligation)),
        rubricCriteria: clone((problem.work?.rubric?.criteria ?? []).map(normalizeReviewCriterion)),
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
      reviewMasteryDeltaApplied: 0,
      reviewResolution: null,
    };
    for (const review of state.reviews) {
      if (review.profileId === state.activeProfileId && review.draftId === pending.draftId && !review.attemptId) {
        review.attemptId = attempt.attemptId;
      }
    }
    state.attempts = [...state.attempts, attempt].slice(-MAX_ATTEMPTS);
    resolveAttemptReview(attempt);
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

  const reviewAssessment = (target, { obligationResults = [], rubricResults = [], verdict = "partial" } = {}) => {
    const fallbackScores = { pass: 1, partial: 0.6, needs_revision: 0.35, fail: 0 };
    const obligations = (target.proofObligations ?? []).map(normalizeReviewObligation);
    const criteria = (target.rubricCriteria ?? []).map(normalizeReviewCriterion);
    if (obligations.length) {
      if (!obligationResults.length) {
        const status = verdict === "pass" ? "satisfied" : verdict === "fail" ? "missing" : "flawed";
        return { verdict, score: fallbackScores[verdict], obligationResults: obligations.map((item) => ({ id: item.id, status, note: "" })), rubricResults: [] };
      }
      const supplied = obligationResults.map(sanitizeObligationResult).filter(Boolean);
      if (supplied.length !== obligations.length || new Set(supplied.map((item) => item.id)).size !== obligations.length) throw new Error("Provide one unique status for every proof obligation.");
      const byId = Object.fromEntries(supplied.map((item) => [item.id, item]));
      if (obligations.some((item) => !byId[item.id])) throw new Error("Proof-obligation IDs do not match this question.");
      const applicable = obligations.filter((item) => item.required || byId[item.id].status !== "not_applicable");
      if (applicable.some((item) => item.required && byId[item.id].status === "not_applicable")) throw new Error("A required proof obligation cannot be marked not applicable.");
      const score = applicable.length ? applicable.reduce((total, item) => total + ({ satisfied: 1, flawed: 0.5, missing: 0, not_applicable: 0 }[byId[item.id].status]), 0) / applicable.length : 0;
      const missingCount = applicable.filter((item) => byId[item.id].status === "missing").length;
      const derivedVerdict = applicable.length && applicable.every((item) => byId[item.id].status === "satisfied") ? "pass" : score < 0.4 || missingCount >= Math.max(2, Math.floor(applicable.length / 2)) ? "fail" : score < 0.7 ? "needs_revision" : "partial";
      return { verdict: derivedVerdict, score, obligationResults: obligations.map((item) => byId[item.id]), rubricResults: [] };
    }
    if (criteria.length) {
      if (!rubricResults.length) {
        return { verdict, score: fallbackScores[verdict], obligationResults: [], rubricResults: criteria.map((item) => ({ id: item.id, awardedPoints: fallbackScores[verdict] * item.weight, maxPoints: item.weight, note: "" })) };
      }
      const supplied = rubricResults.map(sanitizeRubricResult).filter(Boolean);
      if (supplied.length !== criteria.length || new Set(supplied.map((item) => item.id)).size !== criteria.length) throw new Error("Provide one score for every rubric criterion.");
      const byId = Object.fromEntries(supplied.map((item) => [item.id, item]));
      if (criteria.some((item) => !byId[item.id])) throw new Error("Rubric-criterion IDs do not match this question.");
      const normalized = criteria.map((item) => {
        const awardedPoints = cleanNumber(byId[item.id].awardedPoints, 0, 0, item.weight);
        return { id: item.id, awardedPoints, maxPoints: item.weight, note: byId[item.id].note };
      });
      const possible = normalized.reduce((total, item) => total + item.maxPoints, 0);
      const score = possible ? normalized.reduce((total, item) => total + item.awardedPoints, 0) / possible : 0;
      const derivedVerdict = score >= 0.8 ? "pass" : score >= 0.6 ? "partial" : score >= 0.35 ? "needs_revision" : "fail";
      return { verdict: derivedVerdict, score, obligationResults: [], rubricResults: normalized };
    }
    return { verdict, score: fallbackScores[verdict], obligationResults: [], rubricResults: [] };
  };

  const resolveAttemptReview = (attempt) => {
    if (!attempt?.hasPendingReview && !attempt?.reviewResolution) return;
    const required = attempt.results.filter((result) => result.reviewRequired);
    const latest = required.map((result) => state.reviews.filter((item) => item.attemptId === attempt.attemptId && item.questionId === result.questionId).at(-1) ?? null);
    if (!latest.length || latest.some((review) => !review)) return;
    const score = latest.reduce((total, review) => total + review.score, 0) / latest.length;
    const verdict = latest.every((review) => review.verdict === "pass") ? "pass" : score >= 0.6 ? "partial" : score >= 0.35 ? "needs_revision" : "fail";
    const reviewIds = latest.map((review) => review.reviewId);
    if (attempt.reviewResolution?.reviewIds?.join("|") === reviewIds.join("|")) return;
    const desiredDelta = { pass: 12, partial: 3, needs_revision: 0, fail: -6 }[verdict];
    const record = activeProgress()[attempt.skillId];
    if (!record) return;
    record.masteryScore = Math.max(0, Math.min(100, record.masteryScore - Number(attempt.reviewMasteryDeltaApplied ?? 0) + desiredDelta));
    const skill = skillsById[attempt.skillId];
    const prerequisitesMet = activeProfile()?.progressionMode === "soft" || skill.prerequisites.every((id) => PROVEN.has(activeProgress()[id]?.status));
    const passed = verdict === "pass" && prerequisitesMet
      && attempt.percentScore >= Number(skill.mastery.passing_score ?? 0.8)
      && attempt.reflection.confidenceRating >= Number(skill.mastery.minimum_confidence ?? 3)
      && attempt.reflection.guessed !== "yes";
    record.status = passed ? (record.status === "proven" ? "mastered" : "proven") : "learning";
    record.nextReviewAt = reviewDate(record.status, attempt.percentScore, attempt.reflection.confidenceRating, now());
    record.updatedAt = isoNow();
    attempt.masteryUpdate = { status: record.status, masteryScore: record.masteryScore };
    attempt.reviewStatus = verdict === "pass" ? "review_passed" : verdict;
    attempt.hasPendingReview = verdict !== "pass";
    attempt.reviewMasteryDeltaApplied = desiredDelta;
    attempt.reviewResolution = { verdict, score, reviewIds };
  };

  const inspectStudentWork = ({ questionId = "" } = {}) => {
    const draft = state.drafts[state.activeProfileId]?.[state.ui.selectedSkillId];
    const attempt = !draft && state.ui.activeAttemptId ? getAttempt(state.ui.activeAttemptId) : null;
    if (!draft && !attempt) throw new Error("Open a mastery test or a saved attempt first.");
    const sourceItems = draft?.problems ?? attempt.results;
    const item = questionId
      ? sourceItems.find((candidate) => (candidate.template_id ?? candidate.questionId) === questionId)
      : draft
        ? sourceItems.find((candidate) => draft.responses[candidate.template_id]?.finalAnswer || draft.responses[candidate.template_id]?.work) ?? sourceItems[0]
        : sourceItems.find((candidate) => candidate.work) ?? sourceItems[0];
    if (!item) throw new Error("question_id is not in the visible test or saved attempt.");
    const saved = Boolean(attempt);
    const questionKey = item.template_id ?? item.questionId;
    const response = saved ? { finalAnswer: item.finalAnswer, work: item.work } : draft.responses[questionKey] ?? { finalAnswer: "", work: "" };
    const correct = saved ? item.correct : response.finalAnswer ? gradeProblem(item, response.finalAnswer).correct : false;
    const mode = saved ? item.workMode : item.work?.mode ?? "none";
    const proofObligations = saved ? item.proofObligations : (item.work?.proof_policy?.obligations ?? []).map(normalizeReviewObligation);
    const rubricCriteria = saved ? item.rubricCriteria : (item.work?.rubric?.criteria ?? []).map(normalizeReviewCriterion);
    const latest = state.reviews.filter((review) => review.profileId === state.activeProfileId && review.questionId === questionKey && (!attempt || review.attemptId === attempt.attemptId)).at(-1) ?? null;
    return {
      ok: true,
      source: saved ? "saved_attempt" : "active_draft",
      attempt_id: attempt?.attemptId ?? null,
      question_id: questionKey,
      skill_id: saved ? attempt.skillId : item.skill_id,
      prompt: item.prompt,
      final_answer: response.finalAnswer,
      work: response.work,
      work_lines: response.work.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
      final_answer_status: response.finalAnswer ? (correct ? "correct" : "incorrect") : "missing",
      work_status: response.work ? (latest ? latest.verdict : "pending_review") : (saved ? item.workRequired : item.work_required) ? "missing" : "not_required",
      review_guide: {
        mode,
        proof_obligations: clone(proofObligations),
        rubric_criteria: clone(rubricCriteria),
        review_policy: saved ? item.reviewPolicy : item.review_policy?.work_review ?? "none",
        mastery_requires_review_pass: saved ? item.reviewRequired : item.review_policy?.mastery_requires_review_pass === true,
      },
      latest_review: latest ? clone(latest) : null,
      mistake_tag: correct ? "none" : (saved ? item.mistakeTags : item.mistake_tags)?.[0] ?? "needs_explanation",
      messages: [correct ? "The final answer passes the local grader; review each reasoning requirement." : "Use the mistake tag and shown work to give one Socratic next step."],
      inspected_at: isoNow(),
    };
  };

  const recordTutorFeedback = ({ questionId, feedback, mistakeTag = "", nextStep, confidence = "medium", verdict = "partial", reviewerType = "ai_tutor", obligationResults = [], rubricResults = [], activityActor = "learner" }) => {
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
    const activeProblem = activeDraft?.problems?.find((problem) => problem.template_id === safeQuestionId);
    const target = activeResult ?? (activeProblem ? {
      proofObligations: (activeProblem.work?.proof_policy?.obligations ?? []).map(normalizeReviewObligation),
      rubricCriteria: (activeProblem.work?.rubric?.criteria ?? []).map(normalizeReviewCriterion),
      allowSelfReview: activeProblem.review_policy?.allow_self_review !== false,
    } : null);
    if (reviewerType === "self" && target?.allowSelfReview === false) throw new Error("This question requires tutor review and does not allow self review.");
    const assessment = reviewAssessment(target ?? {}, { obligationResults, rubricResults, verdict });
    const review = {
      reviewId: makeId("review"), profileId: state.activeProfileId, attemptId: state.ui.activeAttemptId,
      draftId: state.drafts[state.activeProfileId]?.[state.ui.selectedSkillId]?.draftId ?? null,
      questionId: safeQuestionId, reviewerType: ["ai_tutor", "human_tutor", "self"].includes(reviewerType) ? reviewerType : "ai_tutor", verdict: assessment.verdict,
      score: assessment.score,
      reviewerConfidence: confidence, mistakeTag: cleanText(mistakeTag, 80), feedback: safeFeedback,
      nextStep: safeNextStep, obligationResults: assessment.obligationResults, rubricResults: assessment.rubricResults, createdAt: isoNow(),
    };
    state.reviews = [...state.reviews, review].slice(-MAX_REVIEWS);
    if (review.mistakeTag && review.mistakeTag !== "none") {
      const record = activeProgress()[state.ui.selectedSkillId];
      if (record) record.mistakeTags = [review.mistakeTag, ...(record.mistakeTags ?? []).filter((tag) => tag !== review.mistakeTag)].slice(0, 12);
    }
    if (activeAttempt) resolveAttemptReview(activeAttempt);
    addActivity("record_tutor_feedback", "Saved visible tutor feedback to this profile.", undefined, activityActor);
    notify();
    return { ok: true, saved: true, review_id: review.reviewId, verdict: review.verdict, score: review.score, feedback: safeFeedback, next_step: safeNextStep };
  };

  const latestReview = () => state.reviews.filter((review) => review.profileId === state.activeProfileId).at(-1) ?? null;

  const getLearningContext = ({ includeHistory = false } = {}) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    const skill = skillsById[state.ui.selectedSkillId];
    const row = progressRows().find((item) => item.id === skill.id);
    const draft = state.drafts[state.activeProfileId]?.[skill.id];
    const attempt = state.ui.activeAttemptId ? getAttempt(state.ui.activeAttemptId) : null;
    return {
      ok: true,
      route: state.ui.route,
      skill: { id: skill.id, pack_id: skill.packId ?? null, custom: Boolean(skill.custom), name: skill.name, description: skill.description, status: row.status },
      active_test: draft ? {
        question_count: draft.problems.length,
        answered_count: Object.values(draft.responses).filter((response) => response.finalAnswer).length,
        questions: draft.problems.map((problem) => ({ question_id: problem.template_id, prompt: problem.prompt, difficulty: problem.difficulty, answer_mode: problem.answer_mode })),
      } : null,
      active_attempt: attempt ? {
        attempt_id: attempt.attemptId,
        skill_id: attempt.skillId,
        completed_at: attempt.completedAt,
        percent_score: attempt.percentScore,
        review_status: attempt.reviewStatus,
        pending_review: attempt.hasPendingReview,
        questions: attempt.results.map((result) => ({ question_id: result.questionId, prompt: result.prompt, final_answer_status: result.correct ? "correct" : "incorrect", work_mode: result.workMode, review_required: result.reviewRequired })),
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

  const previewNativeAssessment = (skillId, variation = 0) => {
    const skill = curriculum.skills.find((item) => item.id === skillId);
    if (!skill?.native_templates?.length) throw new Error("This lesson does not have native runtime templates.");
    const safeVariation = Math.floor(cleanNumber(Number(variation), 0, 0, 10_000));
    const problems = generateNativeAssessment({ ...skill, overridden: false }, safeVariation);
    return { ok: true, skillId: skill.id, skillName: skill.name, variation: safeVariation, templateCount: skill.native_templates.length, problems: clone(problems) };
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

  const exportTutorSummary = (attemptId = state.ui.activeAttemptId) => {
    const attempt = getAttempt(attemptId);
    if (!attempt) throw new Error("Open a saved attempt before exporting a tutor summary.");
    const skill = skillsById[attempt.skillId];
    const record = activeProgress()[attempt.skillId] ?? {};
    const reviews = state.reviews.filter((review) => review.profileId === state.activeProfileId && review.attemptId === attempt.attemptId);
    const missedTags = [...new Set(attempt.results.filter((result) => !result.correct).flatMap((result) => result.mistakeTags ?? []))];
    const lines = [
      "# QuickMaths Tutor Summary", "", "## Student Context",
      "Use this saved result as evidence of the learner's current understanding. Mastery is an accumulated 0–100 progress score, not the latest test percentage.", "",
      "## Current Skill", `Skill: ${skill.name}`, `Skill ID: ${skill.id}`, `Domain: ${skill.domain}`, `Subdomain: ${skill.subdomain}`,
      `Status: ${record.status ?? "ready"}`, `Mastery Score: ${record.masteryScore ?? 0}/100`, "",
      "## Test Result", `Attempt ID: ${attempt.attemptId}`, `Completed: ${attempt.completedAt}`, `Score: ${attempt.rawScore}/${attempt.scoreTotal}`,
      `Percent: ${Math.round(attempt.percentScore * 100)}%`, `Confidence: ${attempt.reflection.confidenceRating}/5`, `Difficulty Felt: ${attempt.reflection.difficultyFelt}`,
      `Hints Used: ${attempt.reflection.hintsUsed}`, `Guessed: ${attempt.reflection.guessed}`, `Review Status: ${attempt.reviewStatus}`, `Has Pending Review: ${attempt.hasPendingReview}`, "",
      "## Missed / Risk Areas", ...(missedTags.length ? missedTags.map((tag) => `- ${tag}`) : ["- None flagged"]), "", "## Relevant Prerequisites",
      ...(skill.prerequisites.length ? skill.prerequisites.map((id) => `- ${id}: ${statusForSkill(id)}`) : ["- None"]), "", "## Learner Notes", attempt.reflection.notes || "No notes provided.", "",
      "## Per-Question Details", "Review the learner's work for reasoning quality. The local grader judged the final answer and conservative procedural transitions only.", "",
    ];
    attempt.results.forEach((result, index) => {
      lines.push(`### Question ${index + 1}`, `Question ID: ${result.questionId}`, `Prompt: ${result.prompt}`, `Expected final answer: ${result.expectedAnswer}`, `User final answer: ${result.finalAnswer || "No answer"}`, "User work:", result.work || "No work submitted.", `Correct: ${result.correct}`, `Work mode: ${result.workMode}`, `Review required: ${result.reviewRequired}`, `Potential mistake tags: ${(result.mistakeTags ?? []).join(", ") || "none"}`, "Solution steps:", ...(result.solutionSteps?.length ? result.solutionSteps.map((step) => `- ${step}`) : ["- None provided."]), "");
    });
    if (reviews.length) {
      lines.push("## Saved Review Details", "");
      reviews.forEach((review) => {
        lines.push(`### Review ${review.reviewId}`, `Question ID: ${review.questionId}`, `Reviewer: ${review.reviewerType}`, `Verdict: ${review.verdict}`, `Score: ${Math.round(review.score * 100)}%`);
        review.obligationResults?.forEach((item) => lines.push(`- Obligation ${item.id}: ${item.status}${item.note ? ` — ${item.note}` : ""}`));
        review.rubricResults?.forEach((item) => lines.push(`- Rubric ${item.id}: ${item.awardedPoints}/${item.maxPoints}${item.note ? ` — ${item.note}` : ""}`));
        lines.push(`Feedback: ${review.feedback}`, `Next step: ${review.nextStep}`, "");
      });
    }
    lines.push("## Recommended Tutoring Instructions", "Start with a brief diagnosis, then tutor the weakest concept Socratically. Ask one practice question at a time, do not reveal answers prematurely, and recommend a QuickMaths retest only after independent success.", "", "AI tutors can make mistakes; verify important explanations and calculations.");
    return lines.join("\n");
  };

  const exportTutorReviewPacket = (attemptId = state.ui.activeAttemptId) => {
    const attempt = getAttempt(attemptId);
    if (!attempt) throw new Error("Open a saved attempt before exporting a review packet.");
    const skill = skillsById[attempt.skillId];
    const targets = attempt.results.filter((result) => result.reviewRequired || result.work);
    const lines = [
      "# QuickMaths Tutor Review Packet", "", "Review the saved proof or shown work against every listed obligation or rubric criterion. The app graded the separate final answer; do not infer that a correct final answer proves sound reasoning.", "",
      "## Skill", `Skill: ${skill.name}`, `Skill ID: ${skill.id}`, `Domain: ${skill.domain}`, `Subdomain: ${skill.subdomain}`, "",
      "## Attempt Context", `Attempt ID: ${attempt.attemptId}`, `Completed: ${attempt.completedAt}`, `Score: ${attempt.rawScore}/${attempt.scoreTotal} (${Math.round(attempt.percentScore * 100)}%)`, `Review Status: ${attempt.reviewStatus}`, `Confidence: ${attempt.reflection.confidenceRating}/5`, `Difficulty Felt: ${attempt.reflection.difficultyFelt}`, `Hints Used: ${attempt.reflection.hintsUsed}`, `Guessed: ${attempt.reflection.guessed}`, `Learner Notes: ${attempt.reflection.notes || "None"}`, "",
      "## Requested Return Format", "For a proof: return each obligation ID with satisfied | flawed | missing | not_applicable, plus evidence. For a rubric: return awarded points for every criterion, plus evidence. Then give concise feedback and one Socratic next step.", "",
    ];
    targets.forEach((result, index) => {
      lines.push(`## Question ${index + 1}`, `Question ID: ${result.questionId}`, `Prompt: ${result.prompt}`, `Expected final answer: ${result.expectedAnswer}`, `User final answer: ${result.finalAnswer || "No answer"}`, "User work/proof:", result.work || "No work submitted.", `Final answer autograde: ${result.correct ? "correct" : "incorrect"}`, `Final answer grading method: ${result.gradingMethod}`, `Work mode: ${result.workMode}`, `Review policy: ${result.reviewPolicy}`, "");
      if (result.proofObligations?.length) lines.push("### Proof Obligations", ...result.proofObligations.map((item) => `- ${item.id}: ${item.description}${item.required === false ? " (optional)" : ""}`), "");
      if (result.rubricCriteria?.length) lines.push("### Rubric", ...result.rubricCriteria.map((item) => `- ${item.id} (${item.weight} pts): ${item.description}`), "");
      lines.push("Solution outline for post-attempt review:", ...(result.solutionSteps?.length ? result.solutionSteps.map((step) => `- ${step}`) : ["- None provided."]), "");
    });
    return lines.join("\n");
  };

  const exportCsv = (kind) => {
    const quote = (value) => {
      let safe = String(value ?? "");
      if (/^[=+\-@]/.test(safe)) safe = `'${safe}`;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    if (kind === "progress") {
      const header = ["profile_id", "skill_id", "skill_name", "domain", "subdomain", "prerequisites", "status", "mastery_score", "last_test_score", "best_test_score", "confidence_rating", "difficulty_felt_latest", "hints_used_latest", "guessed_latest", "attempt_count", "last_attempt_at", "next_review_at", "mistake_tags", "notes", "next_recommended_action", "pending_review_count", "latest_review_status", "latest_review_verdict"];
      const rows = progressRows().map((row) => {
        const record = activeProgress()[row.id] ?? {};
        const latestAttempt = profileAttempts().filter((attempt) => attempt.skillId === row.id).at(-1);
        const latestReview = latestAttempt ? state.reviews.filter((review) => review.attemptId === latestAttempt.attemptId).at(-1) : null;
        const recommended = { rusty: "Review and retest.", learning: "Practice weak areas, then retest.", ready: "Start mastery test.", locked: "Prove prerequisites first.", proven: "Maintain with scheduled review.", mastered: "Maintain with scheduled review." }[row.status] ?? "Open lesson.";
        return [state.activeProfileId, row.id, row.name, skillsById[row.id].domain, row.subdomain, row.prerequisites.join(";"), row.status, row.masteryScore, row.latestScore, row.bestScore, row.confidence, latestAttempt?.reflection?.difficultyFelt, latestAttempt?.reflection?.hintsUsed, latestAttempt?.reflection?.guessed, row.attemptCount, record.lastAttemptAt, row.nextReviewAt, row.mistakeTags.join(";"), record.notes, recommended, profileAttempts().filter((attempt) => attempt.skillId === row.id && attempt.hasPendingReview).length, latestAttempt?.reviewStatus, latestReview?.verdict];
      });
      return [header, ...rows].map((row) => row.map(quote).join(",")).join("\n");
    }
    if (kind === "reviews") {
      const header = ["review_id", "attempt_id", "question_id", "reviewer_type", "verdict", "score", "reviewer_confidence", "created_at", "obligation_results_json", "obligation_statuses", "obligation_notes", "rubric_points", "rubric_notes", "feedback", "next_step"];
      const rows = state.reviews.filter((review) => review.profileId === state.activeProfileId).map((review) => {
        const obligationStatuses = review.obligationResults?.map((item) => `${item.id}=${item.status}`).join("; ") ?? "";
        const obligationNotes = review.obligationResults?.filter((item) => item.note).map((item) => `${item.id}: ${item.note}`).join("; ") ?? "";
        const rubricPoints = review.rubricResults?.map((item) => `${item.id}=${item.awardedPoints}/${item.maxPoints}`).join("; ") ?? "";
        const rubricNotes = review.rubricResults?.filter((item) => item.note).map((item) => `${item.id}: ${item.note}`).join("; ") ?? "";
        return [review.reviewId, review.attemptId, review.questionId, review.reviewerType, review.verdict, review.score, review.reviewerConfidence, review.createdAt, JSON.stringify({ obligations: review.obligationResults ?? [], rubric: review.rubricResults ?? [] }), obligationStatuses, obligationNotes, rubricPoints, rubricNotes, review.feedback, review.nextStep];
      });
      return [header, ...rows].map((row) => row.map(quote).join(",")).join("\n");
    }
    const header = ["attempt_id", "profile_id", "skill_id", "skill_name", "completed_at", "score_raw", "score_total", "score_percent", "confidence_rating", "difficulty_felt", "hints_used", "guessed", "wants_more_practice", "confusing_parts", "notes", "review_status", "has_pending_review", "mastery_status", "mastery_score"];
    const rows = profileAttempts().map((attempt) => [attempt.attemptId, attempt.profileId, attempt.skillId, attempt.skillName, attempt.completedAt, attempt.rawScore, attempt.scoreTotal, attempt.percentScore, attempt.reflection?.confidenceRating, attempt.reflection?.difficultyFelt, attempt.reflection?.hintsUsed, attempt.reflection?.guessed, attempt.reflection?.wantsMorePractice, attempt.reflection?.confusingParts, attempt.reflection?.notes, attempt.reviewStatus, attempt.hasPendingReview, attempt.masteryUpdate?.status, attempt.masteryUpdate?.masteryScore]);
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
    previewNativeAssessment,
    exportBackup,
    exportSyncState,
    exportTutorSummary,
    exportTutorReviewPacket,
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
