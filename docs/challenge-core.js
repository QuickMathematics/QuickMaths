export const STORAGE_KEY = "quickmaths.web.v2";
export const LEGACY_STORAGE_KEY = "quickmaths.webmcp.challenge.v1";
export const APP_VERSION = 16;
export const LESSON_SET_FORMAT = "quickmaths.lesson-set";
export const LESSON_SET_SCHEMA_VERSION = "2.0";
export const CURRICULUM_FORMAT = "quickmaths.curriculum";
export const CURRICULUM_SCHEMA_VERSION = "1.0";
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
const ROUTES = new Set(["welcome", "tutorial", "home", "map", "curriculum", "lesson", "test", "results", "settings", "data", "creator", "depot"]);
const TUTORIAL_STEPS = 7;
const MAX_ACTIVITY = 60;
const MAX_ATTEMPTS = 500;
const MAX_REVIEWS = 1000;
const MAX_PROFILES = 30;
const MAX_LESSON_SETS = 10;
const MAX_CURRICULA = 30;
const MAX_CURRICULUM_BYTES = 10_000_000;
const MAX_LESSON_SET_BYTES = 2_000_000;
const MAX_LESSON_SET_SKILLS = 50;
const MAX_PROBLEMS_PER_SKILL = 100;
const MAX_MAP_PLAN_PATHS = 40;
const MAX_MAP_PLAN_ANNOTATIONS = 200;
const MAP_PLAN_COORDINATE_LIMIT = 20_000;
export const MAX_LONG_WORK_CHARS = 50_000;
const LESSON_SET_ID = /^PACK_[A-Z0-9_]{3,54}$/;
const CUSTOM_SKILL_ID = /^CUSTOM_[A-Z0-9_]{3,52}$/;
const LEGACY_FIRST_PARTY_DEPOT_SKILL_ID = /^GEO_[A-Z0-9_]{3,52}$/;
const SUBJECT_ID = /^SUBJECT_[A-Z0-9_]{2,51}$/;
const CURRICULUM_ID = /^CURRICULUM_[A-Z0-9_]{3,100}$/;
const SAFE_ID = /^[A-Z][A-Z0-9_]{2,119}$/;
const RESERVED_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const GRADING_METHODS = new Set([
  "exact_numeric", "numeric_with_tolerance", "multiple_choice", "symbolic_expression",
  "equation_solution", "inequality_solution", "exact_text", "theorem_conclusion",
  "finite_set", "rational_expression", "interval_set", "python_program",
]);
const WORK_MODES = new Set([
  "none", "capture_only", "procedural_steps", "proof_obligations", "rubric_check",
  "rational_equation_steps", "sign_chart_steps", "code_trace_steps",
]);
const PYTHON_BUILTINS = new Set(["abs", "all", "any", "bool", "dict", "enumerate", "float", "int", "len", "list", "max", "min", "range", "round", "set", "sorted", "str", "sum", "tuple", "zip"]);
const PYTHON_VALUE_TYPES = new Set(["json", "int", "float", "str", "bool", "list", "dict"]);
const EXPRESSION_FUNCTIONS = new Set(["sqrt"]);
const EXPRESSION_CONSTANTS = Object.freeze({ pi: Math.PI, e: Math.E });
const SUPERSCRIPT_DIGITS = Object.freeze({ "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" });

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function cleanText(value, maxLength = 1000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanNumber(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function utf8ByteLength(value) {
  const text = String(value ?? "");
  return typeof TextEncoder === "function" ? new TextEncoder().encode(text).length : text.length;
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

function renderNativeValue(value, values) {
  if (typeof value === "string") return renderNativeTemplate(value, values);
  if (Array.isArray(value)) return value.map((item) => renderNativeValue(item, values));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renderNativeValue(item, values)]));
  return clone(value);
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
      const answer = renderNativeValue(template.answer ?? {}, values);
      const explanation = template.explanation_template ? renderNativeTemplate(template.explanation_template, values).split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : clone(template.solution_steps ?? []);
      const answerMode = template.answer_mode ?? "final_only";
      const work = renderNativeValue(template.work ?? {}, values);
      const expectedAnswer = answer.value == null && answer.type === "finite_set"
        ? `{${(answer.values ?? []).join(", ")}}`
        : String(answer.value ?? "");
      return {
        template_id: `${template.id}__RUNTIME_${attemptCount + 1}`,
        source_template_id: template.id,
        skill_id: skill.id,
        seed,
        difficulty: template.difficulty ?? "medium",
        values: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, stringifyTemplateValue(value)])),
        prompt: renderNativeTemplate(template.prompt_template, values),
        expected_answer: expectedAnswer,
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
        answer_metadata: clone(answer),
        grading_metadata: renderNativeValue(template.grading ?? {}, values),
        work_required: ["final_plus_required_work", "structured_steps", "proof_required"].includes(answerMode) || ["required", "procedural_steps", "proof_obligations", "rubric_check", "rational_equation_steps", "sign_chart_steps"].includes(work.mode ?? "none"),
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

function preservedText(value, label, maxLength) {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const clean = value.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").replace(/^\n+|\n+$/g, "");
  if (!clean.trim()) throw new Error(`${label} is required.`);
  if (clean.length > maxLength) throw new Error(`${label} is too long (maximum ${maxLength} characters).`);
  if (/<script\b|javascript:/i.test(clean)) throw new Error(`${label} contains unsupported executable content.`);
  return clean;
}

function jsonCompatibleValue(value, label, { depth = 0, budget = { nodes: 0 } } = {}) {
  budget.nodes += 1;
  if (budget.nodes > 500 || depth > 8) throw new Error(`${label} is too complex.`);
  if (value == null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > 1e12) throw new Error(`${label} contains an unsupported number.`);
    return value;
  }
  if (typeof value === "string") {
    if (value.length > 2000) throw new Error(`${label} contains text longer than 2,000 characters.`);
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) throw new Error(`${label} contains too many list items.`);
    return value.map((item) => jsonCompatibleValue(item, label, { depth: depth + 1, budget }));
  }
  if (typeof value !== "object") throw new Error(`${label} must contain JSON-compatible values only.`);
  const entries = Object.entries(value);
  if (entries.length > 100) throw new Error(`${label} contains too many object fields.`);
  const output = {};
  for (const [key, item] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_ -]{0,79}$/.test(key) || RESERVED_OBJECT_KEYS.has(key)) throw new Error(`${label} contains an invalid object key.`);
    output[key] = jsonCompatibleValue(item, label, { depth: depth + 1, budget });
  }
  return output;
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

function normalizeAnswerMetadata(candidate, templateId) {
  const source = candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : {};
  return {
    type: optionalText(source.type, `${templateId} answer metadata type`, 60) || "text",
    variable: optionalText(source.variable, `${templateId} answer metadata variable`, 40) || null,
    value: source.value == null ? null : cleanText(String(source.value), 300),
    values: Array.isArray(source.values) ? source.values.map((value) => cleanText(String(value), 120)).slice(0, 40) : [],
    excluded_values: Array.isArray(source.excluded_values) ? source.excluded_values.map((value) => cleanText(String(value), 120)).slice(0, 40) : [],
  };
}

function normalizeSignChart(candidate, templateId) {
  const source = candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : {};
  const points = Array.isArray(source.critical_points) ? source.critical_points.slice(0, 20).map((point, index) => ({
    value: requiredText(String(point?.value ?? ""), `${templateId} critical point ${index + 1}`, 120),
    kind: ["zero", "undefined", "hole"].includes(point?.kind) ? point.kind : "zero",
    multiplicity: Math.floor(cleanNumber(Number(point?.multiplicity), 1, 1, 20)),
    factor: cleanText(String(point?.factor ?? ""), 300),
  })) : [];
  return {
    expression_kind: ["polynomial", "rational"].includes(source.expression_kind) ? source.expression_kind : "polynomial",
    expression: cleanText(String(source.expression ?? ""), 1000),
    relation: [">", ">=", "<", "<="].includes(source.relation) ? source.relation : ">",
    expected_factorization: cleanText(String(source.expected_factorization ?? ""), 1000),
    reduced_expression: cleanText(String(source.reduced_expression ?? ""), 1000),
    require_factorization: source.require_factorization === true,
    critical_points: points,
    require_test_values: source.require_test_values !== false,
    require_interval_signs: source.require_interval_signs !== false,
    require_endpoint_decisions: source.require_endpoint_decisions !== false,
    require_final_answer_match: source.require_final_answer_match !== false,
  };
}

function normalizePromptBlocks(candidate, templateId) {
  if (candidate == null) return [];
  if (!Array.isArray(candidate) || candidate.length > 12) throw new Error(`${templateId} prompt_blocks must contain at most 12 blocks.`);
  let aggregate = 0;
  return candidate.map((block, index) => {
    if (!block || typeof block !== "object" || Array.isArray(block)) throw new Error(`${templateId} prompt block ${index + 1} is invalid.`);
    const unknown = Object.keys(block).find((key) => !["type", "text", "language"].includes(key));
    if (unknown) throw new Error(`${templateId} prompt block ${index + 1} contains unsupported field ${unknown}.`);
    if (!['text', 'code'].includes(block.type)) throw new Error(`${templateId} prompt block ${index + 1} type must be text or code.`);
    const text = preservedText(block.text, `${templateId} prompt block ${index + 1}`, block.type === "code" ? 8000 : 4000);
    aggregate += text.length;
    if (aggregate > 12_000) throw new Error(`${templateId} prompt_blocks are too long.`);
    const language = block.type === "code" ? (optionalText(block.language, `${templateId} code language`, 30) || "text") : null;
    if (language && !/^[A-Za-z][A-Za-z0-9_+.-]{0,29}$/.test(language)) throw new Error(`${templateId} code language is invalid.`);
    return { type: block.type, text, ...(language ? { language: language.toLowerCase() } : {}) };
  });
}

function normalizeTraceSpec(candidate, templateId) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error(`${templateId} code_trace_steps needs trace_spec.`);
  const unknown = Object.keys(candidate).find((key) => !["language", "display_code", "columns", "expected_rows", "comparison"].includes(key));
  if (unknown) throw new Error(`${templateId} trace_spec contains unsupported field ${unknown}.`);
  const language = optionalText(candidate.language, `${templateId} trace language`, 30) || "python";
  if (language !== "python") throw new Error(`${templateId} trace language must be python.`);
  const displayCode = preservedText(candidate.display_code, `${templateId} trace display_code`, 8000);
  if (!Array.isArray(candidate.columns) || !candidate.columns.length || candidate.columns.length > 12) throw new Error(`${templateId} trace columns must contain 1 to 12 labels.`);
  const columns = candidate.columns.map((column, index) => requiredText(String(column ?? ""), `${templateId} trace column ${index + 1}`, 40));
  if (!columns.includes("step")) throw new Error(`${templateId} trace columns must include step.`);
  if (new Set(columns).size !== columns.length) throw new Error(`${templateId} trace columns must be unique.`);
  if (columns.some((column) => RESERVED_OBJECT_KEYS.has(column))) throw new Error(`${templateId} trace columns contain a reserved name.`);
  if (!Array.isArray(candidate.expected_rows) || !candidate.expected_rows.length || candidate.expected_rows.length > 100) throw new Error(`${templateId} trace expected_rows must contain 1 to 100 rows.`);
  const expectedRows = candidate.expected_rows.map((row, rowIndex) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`${templateId} trace row ${rowIndex + 1} is invalid.`);
    const unknownColumn = Object.keys(row).find((key) => !columns.includes(key));
    if (unknownColumn) throw new Error(`${templateId} trace row ${rowIndex + 1} contains unknown column ${unknownColumn}.`);
    const output = {};
    for (const column of columns) {
      const value = row[column];
      if (value != null && !["string", "number", "boolean"].includes(typeof value)) throw new Error(`${templateId} trace row ${rowIndex + 1} column ${column} must be a simple value.`);
      output[column] = value ?? null;
    }
    if (output.step == null || String(output.step).trim() === "") throw new Error(`${templateId} trace row ${rowIndex + 1} needs a stable step value.`);
    return output;
  });
  if (new Set(expectedRows.map((row) => String(row.step))).size !== expectedRows.length) throw new Error(`${templateId} trace step values must be unique.`);
  const comparison = candidate.comparison && typeof candidate.comparison === "object" && !Array.isArray(candidate.comparison) ? candidate.comparison : {};
  const unknownComparison = Object.keys(comparison).find((key) => !["trim_strings", "numeric_equivalence", "blank_equals_null"].includes(key));
  if (unknownComparison) throw new Error(`${templateId} trace comparison contains unsupported field ${unknownComparison}.`);
  return {
    language,
    display_code: displayCode,
    columns,
    expected_rows: expectedRows,
    comparison: {
      trim_strings: comparison.trim_strings !== false,
      numeric_equivalence: comparison.numeric_equivalence !== false,
      blank_equals_null: comparison.blank_equals_null !== false,
    },
  };
}

function normalizePythonProgramSpec(candidate, templateId) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error(`${templateId} python_program needs program_spec.`);
  const unknown = Object.keys(candidate).find((key) => !["runtime", "entrypoint", "tests", "limits", "policy"].includes(key));
  if (unknown) throw new Error(`${templateId} program_spec contains unsupported field ${unknown}.`);
  if (candidate.runtime !== "python_subset_v1") throw new Error(`${templateId} program_spec runtime must be python_subset_v1.`);
  const entrypoint = candidate.entrypoint;
  if (!entrypoint || typeof entrypoint !== "object" || Array.isArray(entrypoint)) throw new Error(`${templateId} program_spec needs an entrypoint.`);
  const entryUnknown = Object.keys(entrypoint).find((key) => !["kind", "name", "parameters", "return_type"].includes(key));
  if (entryUnknown) throw new Error(`${templateId} entrypoint contains unsupported field ${entryUnknown}.`);
  if (entrypoint.kind !== "function") throw new Error(`${templateId} entrypoint kind must be function.`);
  const name = requiredText(entrypoint.name, `${templateId} entrypoint name`, 60);
  if (!/^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(name) || name.startsWith("_") || RESERVED_OBJECT_KEYS.has(name)) throw new Error(`${templateId} entrypoint name is invalid.`);
  if (!Array.isArray(entrypoint.parameters) || entrypoint.parameters.length > 8) throw new Error(`${templateId} entrypoint parameters must contain at most 8 items.`);
  const parameters = entrypoint.parameters.map((parameter, index) => {
    if (!parameter || typeof parameter !== "object" || Array.isArray(parameter)) throw new Error(`${templateId} parameter ${index + 1} is invalid.`);
    const parameterUnknown = Object.keys(parameter).find((key) => !["name", "type"].includes(key));
    if (parameterUnknown) throw new Error(`${templateId} parameter ${index + 1} contains unsupported field ${parameterUnknown}.`);
    const parameterName = requiredText(parameter.name, `${templateId} parameter ${index + 1} name`, 60);
    if (!/^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(parameterName) || parameterName.startsWith("_") || RESERVED_OBJECT_KEYS.has(parameterName)) throw new Error(`${templateId} parameter ${index + 1} name is invalid.`);
    if (!PYTHON_VALUE_TYPES.has(parameter.type)) throw new Error(`${templateId} parameter ${parameterName} has unsupported type ${parameter.type}.`);
    return { name: parameterName, type: parameter.type };
  });
  if (new Set(parameters.map((parameter) => parameter.name)).size !== parameters.length) throw new Error(`${templateId} parameter names must be unique.`);
  const returnType = entrypoint.return_type ?? "json";
  if (![...PYTHON_VALUE_TYPES, "none"].includes(returnType)) throw new Error(`${templateId} return_type is unsupported.`);
  if (!Array.isArray(candidate.tests) || !candidate.tests.length || candidate.tests.length > 30) throw new Error(`${templateId} program_spec tests must contain 1 to 30 cases.`);
  const tests = candidate.tests.map((test, index) => {
    if (!test || typeof test !== "object" || Array.isArray(test)) throw new Error(`${templateId} program test ${index + 1} is invalid.`);
    const testUnknown = Object.keys(test).find((key) => !["id", "args", "expected_return", "visibility"].includes(key));
    if (testUnknown) throw new Error(`${templateId} program test ${index + 1} contains unsupported field ${testUnknown}.`);
    const id = requiredText(test.id, `${templateId} program test ${index + 1} ID`, 60);
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,59}$/.test(id)) throw new Error(`${templateId} program test ${index + 1} ID is invalid.`);
    if (!Array.isArray(test.args) || test.args.length !== parameters.length) throw new Error(`${templateId} program test ${id} must provide ${parameters.length} argument(s).`);
    const args = test.args.map((argument) => jsonCompatibleValue(argument, `${templateId} program test ${id} arguments`));
    const expectedReturn = jsonCompatibleValue(test.expected_return, `${templateId} program test ${id} expected_return`);
    const visibility = test.visibility ?? "hidden";
    if (!["example", "after_submission", "hidden"].includes(visibility)) throw new Error(`${templateId} program test ${id} visibility is invalid.`);
    return { id, args, expected_return: expectedReturn, visibility };
  });
  if (new Set(tests.map((test) => test.id)).size !== tests.length) throw new Error(`${templateId} program test IDs must be unique.`);
  if (!tests.some((test) => test.visibility === "example")) throw new Error(`${templateId} program_spec needs at least one visible example test.`);
  const limits = candidate.limits && typeof candidate.limits === "object" && !Array.isArray(candidate.limits) ? candidate.limits : {};
  const limitUnknown = Object.keys(limits).find((key) => !["wall_time_ms", "step_limit", "memory_mb", "stdout_chars"].includes(key));
  if (limitUnknown) throw new Error(`${templateId} program limits contain unsupported field ${limitUnknown}.`);
  const normalizedLimits = {
    wall_time_ms: Math.floor(cleanNumber(Number(limits.wall_time_ms), 1500, 250, 3000)),
    step_limit: Math.floor(cleanNumber(Number(limits.step_limit), 20_000, 100, 50_000)),
    memory_mb: Math.floor(cleanNumber(Number(limits.memory_mb), 32, 16, 64)),
    stdout_chars: Math.floor(cleanNumber(Number(limits.stdout_chars), 2000, 0, 4000)),
  };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isFinite(Number(value)) || Number(value) !== normalizedLimits[key]) throw new Error(`${templateId} program limit ${key} is outside the supported range.`);
  }
  const policy = candidate.policy && typeof candidate.policy === "object" && !Array.isArray(candidate.policy) ? candidate.policy : {};
  const policyUnknown = Object.keys(policy).find((key) => !["allowed_builtins", "imports", "network", "storage", "clock", "randomness"].includes(key));
  if (policyUnknown) throw new Error(`${templateId} program policy contains unsupported field ${policyUnknown}.`);
  if (!Array.isArray(policy.allowed_builtins) || policy.allowed_builtins.some((item) => !PYTHON_BUILTINS.has(item))) throw new Error(`${templateId} program policy contains an unsupported builtin.`);
  if (!Array.isArray(policy.imports) || policy.imports.length) throw new Error(`${templateId} program policy cannot allow imports.`);
  for (const capability of ["network", "storage", "clock", "randomness"]) {
    if (policy[capability] !== false) throw new Error(`${templateId} program policy must explicitly disable ${capability}.`);
  }
  return {
    runtime: "python_subset_v1",
    entrypoint: { kind: "function", name, parameters, return_type: returnType },
    tests,
    limits: normalizedLimits,
    policy: { allowed_builtins: [...new Set(policy.allowed_builtins)], imports: [], network: false, storage: false, clock: false, randomness: false },
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
  if (gradingMethod === "python_program" && candidate.answer_type !== "code") throw new Error(`${templateId} python_program must use answer_type code.`);
  const workCandidate = candidate.work && typeof candidate.work === "object" && !Array.isArray(candidate.work) ? candidate.work : {};
  const workMode = workCandidate.mode ?? "none";
  if (!WORK_MODES.has(workMode)) throw new Error(`${templateId} uses unsupported work mode ${workMode}.`);
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
  const workReview = reviewCandidate.work_review ?? (["proof_obligations", "rubric_check"].includes(workMode) ? "tutor_required" : ["rational_equation_steps", "sign_chart_steps", "code_trace_steps"].includes(workMode) ? "auto" : "none");
  if (!["none", "optional", "auto", "tutor_required", "self_review"].includes(workReview)) throw new Error(`${templateId} uses unsupported work_review ${workReview}.`);
  const signChart = normalizeSignChart(workCandidate.sign_chart, templateId);
  const traceSpec = workMode === "code_trace_steps" ? normalizeTraceSpec(workCandidate.trace_spec, templateId) : null;
  const programSpec = gradingMethod === "python_program" ? normalizePythonProgramSpec(candidate.program_spec, templateId) : null;
  if (workMode === "rational_equation_steps") {
    if (!optionalText(workCandidate.target_variable, `${templateId} target_variable`, 40)) throw new Error(`${templateId} rational-equation work needs a target variable.`);
    if (workCandidate.require_restrictions === true && (!Array.isArray(workCandidate.expected_restrictions) || !workCandidate.expected_restrictions.length)) throw new Error(`${templateId} must list the expected original denominator restrictions.`);
    if (workCandidate.require_original_equation_check === true && parseRelation(String(workCandidate.original_equation ?? ""))?.relation !== "=") throw new Error(`${templateId} must provide the original equation used for candidate checks.`);
  }
  if (workMode === "sign_chart_steps") {
    if (!signChart.expression) throw new Error(`${templateId} sign chart needs an expression.`);
    if (![">", ">=", "<", "<="].includes(workCandidate.sign_chart?.relation)) throw new Error(`${templateId} sign chart relation is invalid.`);
    if (signChart.require_factorization && !signChart.expected_factorization) throw new Error(`${templateId} must provide the expected factorization.`);
    const pointKeys = signChart.critical_points.map((point) => `${point.value}`.trim());
    if (new Set(pointKeys).size !== pointKeys.length) throw new Error(`${templateId} sign chart critical points must not be duplicated.`);
  }
  return {
    template_id: templateId,
    source_template_id: sourceTemplateId,
    skill_id: skillId,
    seed: Math.floor(cleanNumber(Number(candidate.seed), 1, 0, 2_000_000_000)),
    difficulty: ["easy", "medium", "hard", "brutal"].includes(candidate.difficulty) ? candidate.difficulty : "medium",
    values: {},
    prompt: requiredText(candidate.prompt, `${templateId} prompt`, 2000),
    prompt_blocks: normalizePromptBlocks(candidate.prompt_blocks, templateId),
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
      prompt: optionalText(workCandidate.prompt, `${templateId} work prompt`, 2000) || (workMode === "procedural_steps" ? "Show one mathematical step per line." : workMode === "code_trace_steps" ? "Complete the trace table after each labeled step." : workMode === "none" ? "" : "Explain your reasoning clearly."),
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
      require_original_equation_check: workCandidate.require_original_equation_check === true,
      require_restrictions: workCandidate.require_restrictions === true,
      original_equation: optionalText(workCandidate.original_equation, `${templateId} original equation`, 1000) || null,
      expected_restrictions: Array.isArray(workCandidate.expected_restrictions)
        ? workCandidate.expected_restrictions.map((value, index) => requiredText(String(value), `${templateId} restriction ${index + 1}`, 120)).slice(0, 24)
        : [],
      sign_chart: signChart,
      trace_spec: traceSpec,
    },
    review_policy: {
      work_review: workReview,
      mastery_requires_review_pass: reviewCandidate.mastery_requires_review_pass === true || ["proof_obligations", "rubric_check"].includes(workMode),
      allow_self_review: reviewCandidate.allow_self_review !== false,
    },
    accepted_forms: Array.isArray(candidate.accepted_forms) ? candidate.accepted_forms.map((form) => requiredText(String(form), `${templateId} accepted form`, 300)).slice(0, 12) : [],
    answer_metadata: normalizeAnswerMetadata(candidate.answer_metadata, templateId),
    grading_metadata: {
      require_reduced_form: candidate.grading_metadata?.require_reduced_form === true,
    },
    program_spec: programSpec,
    work_required: candidate.work_required === true || answerMode === "final_plus_required_work",
  };
}

export function normalizeLessonPack(input, { knownSkillIds = [], nativeSkills = [], allowMissingReferences = false } = {}) {
  let candidate = input;
  if (typeof input === "string") {
    if (utf8ByteLength(input) > MAX_LESSON_SET_BYTES) throw new Error("Lesson set is larger than 2 MB.");
    try { candidate = JSON.parse(input); } catch { throw new Error("Lesson set is not valid JSON."); }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Lesson set must be a JSON object.");
  if (candidate.format !== LESSON_SET_FORMAT) throw new Error(`Lesson set format must be ${LESSON_SET_FORMAT}.`);
  const schemaVersion = candidate.schema_version;
  if (!["1.0", LESSON_SET_SCHEMA_VERSION].includes(schemaVersion)) throw new Error(`Unsupported lesson set schema_version ${schemaVersion ?? "missing"}.`);
  const mode = candidate.mode == null || candidate.mode === "add" ? "add" : candidate.mode === "override" ? "override" : null;
  if (!mode) throw new Error("Lesson set mode must be add or override.");
  if (mode === "override" && schemaVersion !== LESSON_SET_SCHEMA_VERSION) throw new Error("Native lesson improvements require schema_version 2.0.");
  const id = requiredText(candidate.id, "Lesson set ID", 60);
  if (!LESSON_SET_ID.test(id)) throw new Error("Lesson set ID must start with PACK_ and use uppercase letters, numbers, and underscores.");
  const subject = normalizeSubject(candidate.subject, schemaVersion);
  const firstPartyGeography = id === "PACK_GEOGRAPHY" && subject.id === "SUBJECT_GEOGRAPHY";
  if (!Array.isArray(candidate.skills) || !candidate.skills.length || candidate.skills.length > MAX_LESSON_SET_SKILLS) {
    throw new Error(`Lesson set must contain 1 to ${MAX_LESSON_SET_SKILLS} skills.`);
  }
  const usedSkillIds = new Set(knownSkillIds);
  const nativeById = new Map(nativeSkills.map((skill) => [skill.id, skill]));
  const packSkillIds = candidate.skills.map((skill) => requiredText(skill?.id, "Skill ID", 60));
  if (new Set(packSkillIds).size !== packSkillIds.length) throw new Error("Lesson set contains duplicate skill IDs.");
  for (const skillId of packSkillIds) {
    if (mode === "add") {
      if (!CUSTOM_SKILL_ID.test(skillId) && !(firstPartyGeography && LEGACY_FIRST_PARTY_DEPOT_SKILL_ID.test(skillId))) {
        throw new Error(`${skillId} must start with CUSTOM_ and use uppercase letters, numbers, and underscores.`);
      }
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
    const serializedRefs = Array.isArray(skillCandidate.prerequisiteRefs)
      ? skillCandidate.prerequisiteRefs.map((ref) => ({ subject_id: ref.subjectId ?? ref.subject_id, skill_id: ref.skillId ?? ref.skill_id }))
      : [];
    const basePrerequisiteRefs = prerequisiteList(
      Array.isArray(skillCandidate.prerequisites) && skillCandidate.prerequisites.length ? skillCandidate.prerequisites : serializedRefs,
      `${skillId} prerequisites`,
    );
    const serializedBySkill = new Map(prerequisiteList(serializedRefs, `${skillId} prerequisiteRefs`).map((ref) => [ref.skillId, ref]));
    const prerequisiteRefs = basePrerequisiteRefs.map((ref) => serializedBySkill.get(ref.skillId) ?? ref);
    const prerequisites = prerequisiteRefs.map((ref) => ref.skillId);
    const unlocks = idList(skillCandidate.unlocks, `${skillId} unlocks`);
    for (const prerequisite of prerequisites) if (!allowMissingReferences && !allKnown.has(prerequisite)) throw new Error(`${skillId} references missing prerequisite ${prerequisite}.`);
    for (const unlock of unlocks) {
      if (mode === "add" && !packSkillSet.has(unlock)) throw new Error(`${skillId} unlock ${unlock} must belong to the same lesson set.`);
      if (mode === "override" && !allowMissingReferences && !allKnown.has(unlock)) throw new Error(`${skillId} references missing unlock ${unlock}.`);
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
    if (utf8ByteLength(input) > MAX_LESSON_SET_BYTES) throw new Error("Lesson set is larger than 2 MB.");
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

function sanitizeStagedLessonPacks(value, curriculum, { strict = false } = {}) {
  if (value == null) return [];
  try {
    if (!Array.isArray(value) || value.length > 20) throw new Error("Staged lesson sets must be a list of at most 20 review items.");
    const packIds = new Set();
    return value.map((item, index) => {
      const { batchIndex, batchTotal } = item ?? {};
      if (!Number.isInteger(batchIndex) || !Number.isInteger(batchTotal)
        || batchIndex < 1 || batchIndex > batchTotal || batchTotal > 20
        || batchIndex !== value[0].batchIndex + index || batchTotal !== value[0].batchTotal
        || batchIndex + value.length - index - 1 !== batchTotal) {
        throw new Error("Staged lesson set review positions are invalid.");
      }
      // These are proposals, not installed content. A prerequisite may have been
      // skipped or removed since staging; installation rechecks the full catalog.
      const pack = normalizeLessonPack(JSON.stringify(item.pack), {
        knownSkillIds: curriculum.skills.map((skill) => skill.id),
        nativeSkills: curriculum.skills,
        allowMissingReferences: true,
      });
      if (packIds.has(pack.id)) throw new Error(`Duplicate staged lesson set ID: ${pack.id}.`);
      packIds.add(pack.id);
      return { pack, batchIndex, batchTotal };
    });
  } catch (error) {
    if (strict) throw error;
    return [];
  }
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
    mapPlans: {},
    lessonPacks: [],
    stagedLessonPacks: [],
    curricula: [],
    backup: {
      lastExportAt: null,
      attemptCountAtExport: 0,
      reviewCountAtExport: 0,
      lessonPackCountAtExport: 0,
      curriculumUpdatedAtAtExport: null,
    },
    ui: {
      route: "welcome",
      selectedSkillId: "MATH_ARITH_001",
      selectedMapSkillId: "MATH_ARITH_001",
      mapZoom: 1,
      mapPlanMode: false,
      mapPlanView: true,
      mapPlanShowHidden: false,
      mapPlanSelection: [],
      selectedMapPlanPathId: null,
      mapPlanComposer: null,
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

function emptyMapPlan() {
  return { layouts: {}, paths: [], annotations: [], hiddenSkillIds: [] };
}

function defaultCurriculumSettings() {
  return {
    studentName: "",
    agentEnabled: true,
    agentInstructions: "Guide the student Socratically. Do not solve assessed tasks for them; ask targeted questions and respond to their visible work.",
    progressionMode: "hard",
    contactEmail: "",
  };
}

function sanitizeCurriculumSettings(candidate = {}) {
  const email = cleanText(candidate.contactEmail ?? candidate.contact_email, 254);
  return {
    studentName: cleanText(candidate.studentName ?? candidate.student_name, 60),
    agentEnabled: candidate.agentEnabled !== false && candidate.agent_enabled !== false,
    agentInstructions: cleanText(candidate.agentInstructions ?? candidate.agent_instructions, 4000) || defaultCurriculumSettings().agentInstructions,
    progressionMode: ["soft", "open"].includes(candidate.progressionMode ?? candidate.progression_mode) ? "soft" : "hard",
    contactEmail: !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
  };
}

function validateExternalCurriculumSettings(candidate = {}) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Curriculum settings must be an object.");
  const allowed = new Set([
    "studentName", "student_name", "agentEnabled", "agent_enabled", "agentInstructions", "agent_instructions",
    "progressionMode", "progression_mode", "contactEmail", "contact_email",
  ]);
  const unknown = Object.keys(candidate).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`Curriculum settings contain unsupported field ${unknown}.`);
  const read = (camel, snake) => {
    if (candidate[camel] !== undefined && candidate[snake] !== undefined) throw new Error(`Curriculum settings must not provide both ${camel} and ${snake}.`);
    return candidate[camel] !== undefined ? candidate[camel] : candidate[snake];
  };
  const studentName = read("studentName", "student_name");
  const agentEnabled = read("agentEnabled", "agent_enabled");
  const agentInstructions = read("agentInstructions", "agent_instructions");
  const progressionMode = read("progressionMode", "progression_mode");
  const contactEmail = read("contactEmail", "contact_email");
  if (studentName !== undefined && typeof studentName !== "string") throw new Error("Curriculum studentName must be text.");
  if (agentEnabled !== undefined && typeof agentEnabled !== "boolean") throw new Error("Curriculum agentEnabled must be true or false.");
  if (agentInstructions !== undefined && typeof agentInstructions !== "string") throw new Error("Curriculum agentInstructions must be text.");
  if (progressionMode !== undefined && !["hard", "soft"].includes(progressionMode)) throw new Error("Curriculum progressionMode must be hard or soft.");
  if (contactEmail !== undefined && typeof contactEmail !== "string") throw new Error("Curriculum contactEmail must be text.");
  if (studentName?.trim().length > 60) throw new Error("Curriculum studentName is too long.");
  if (agentInstructions?.trim().length > 4000) throw new Error("Curriculum agentInstructions are too long.");
  if (contactEmail?.trim().length > 160) throw new Error("Curriculum contactEmail is too long.");
  if (contactEmail?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) throw new Error("Curriculum contactEmail is invalid.");
  const settings = sanitizeCurriculumSettings(candidate);
  if (agentInstructions === undefined) settings.agentInstructions = "";
  return settings;
}

function canonicalLessonPack(pack) {
  const normalize = (value, key = "") => {
    if (key === "importedAt") return undefined;
    if (Array.isArray(value)) return value.map((item) => normalize(item));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().flatMap((childKey) => {
      const child = normalize(value[childKey], childKey);
      return child === undefined ? [] : [[childKey, child]];
    }));
  };
  return JSON.stringify(normalize(pack));
}

function sanitizeMapPlans(candidate, profileIds, skillIds, subjectIds) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return {};
  const output = {};
  const validLayoutKeys = new Set(["all-subjects", ...[...subjectIds].map((id) => `subject:${id}`)]);
  for (const profileId of profileIds) {
    const rawPlan = candidate[profileId];
    if (!rawPlan || typeof rawPlan !== "object" || Array.isArray(rawPlan)) continue;
    const layouts = {};
    if (rawPlan.layouts && typeof rawPlan.layouts === "object" && !Array.isArray(rawPlan.layouts)) {
      for (const [layoutKey, rawPositions] of Object.entries(rawPlan.layouts)) {
        if (!validLayoutKeys.has(layoutKey) || !rawPositions || typeof rawPositions !== "object" || Array.isArray(rawPositions)) continue;
        const positions = {};
        for (const [skillId, rawPosition] of Object.entries(rawPositions)) {
          if (!skillIds.has(skillId) || !rawPosition || typeof rawPosition !== "object" || Array.isArray(rawPosition)) continue;
          if (!Number.isFinite(Number(rawPosition.x)) || !Number.isFinite(Number(rawPosition.y))) continue;
          positions[skillId] = {
            x: Math.round(cleanNumber(Number(rawPosition.x), 0, -MAP_PLAN_COORDINATE_LIMIT, MAP_PLAN_COORDINATE_LIMIT) * 100) / 100,
            y: Math.round(cleanNumber(Number(rawPosition.y), 0, -MAP_PLAN_COORDINATE_LIMIT, MAP_PLAN_COORDINATE_LIMIT) * 100) / 100,
          };
        }
        if (Object.keys(positions).length) layouts[layoutKey] = positions;
      }
    }
    const paths = Array.isArray(rawPlan.paths) ? rawPlan.paths.map((path, index) => {
      if (!path || typeof path !== "object" || Array.isArray(path)) return null;
      const pathSkillIds = Array.isArray(path.skillIds)
        ? [...new Set(path.skillIds.filter((id) => skillIds.has(id)))].slice(0, 80)
        : [];
      if (pathSkillIds.length < 2) return null;
      return {
        id: cleanText(path.id, 120) || `plan-path-imported-${index + 1}`,
        name: cleanText(path.name, 80) || `Path ${index + 1}`,
        color: HEX_COLOR.test(path.color) ? path.color.toLowerCase() : "#df755b",
        skillIds: pathSkillIds,
        createdAt: cleanText(path.createdAt, 40) || new Date().toISOString(),
        updatedAt: cleanText(path.updatedAt, 40) || cleanText(path.createdAt, 40) || new Date().toISOString(),
      };
    }).filter(Boolean).slice(0, MAX_MAP_PLAN_PATHS) : [];
    const annotations = Array.isArray(rawPlan.annotations) ? rawPlan.annotations.map((annotation, index) => {
      if (!annotation || typeof annotation !== "object" || Array.isArray(annotation)) return null;
      const body = cleanText(annotation.body, 1200);
      if (!body) return null;
      const pathId = cleanText(annotation.pathId, 120) || null;
      const directSkillIds = Array.isArray(annotation.skillIds)
        ? [...new Set(annotation.skillIds.filter((id) => skillIds.has(id)))].slice(0, 80)
        : [];
      const legacyPath = pathId ? paths.find((path) => path.id === pathId) : null;
      const annotationSkillIds = legacyPath ? [...legacyPath.skillIds] : directSkillIds;
      const positions = {};
      if (annotation.positions && typeof annotation.positions === "object" && !Array.isArray(annotation.positions)) {
        for (const [layoutKey, rawPosition] of Object.entries(annotation.positions)) {
          if (!validLayoutKeys.has(layoutKey) || !rawPosition || typeof rawPosition !== "object" || Array.isArray(rawPosition)) continue;
          if (!Number.isFinite(Number(rawPosition.x)) || !Number.isFinite(Number(rawPosition.y))) continue;
          positions[layoutKey] = {
            x: Math.round(cleanNumber(Number(rawPosition.x), 0, -MAP_PLAN_COORDINATE_LIMIT, MAP_PLAN_COORDINATE_LIMIT) * 100) / 100,
            y: Math.round(cleanNumber(Number(rawPosition.y), 0, -MAP_PLAN_COORDINATE_LIMIT, MAP_PLAN_COORDINATE_LIMIT) * 100) / 100,
          };
        }
      }
      if (!annotationSkillIds.length && !Object.keys(positions).length) return null;
      return {
        id: cleanText(annotation.id, 120) || `plan-note-imported-${index + 1}`,
        targetType: annotationSkillIds.length === 1 ? "node" : annotationSkillIds.length > 1 ? "nodes" : "free",
        skillIds: annotationSkillIds,
        positions,
        body,
        createdAt: cleanText(annotation.createdAt, 40) || new Date().toISOString(),
        updatedAt: cleanText(annotation.updatedAt, 40) || cleanText(annotation.createdAt, 40) || new Date().toISOString(),
      };
    }).filter(Boolean).slice(0, MAX_MAP_PLAN_ANNOTATIONS) : [];
    const hiddenSkillIds = Array.isArray(rawPlan.hiddenSkillIds ?? rawPlan.hidden_skill_ids)
      ? [...new Set((rawPlan.hiddenSkillIds ?? rawPlan.hidden_skill_ids).filter((id) => skillIds.has(id)))].slice(0, 80)
      : [];
    output[profileId] = { layouts, paths, annotations, hiddenSkillIds };
  }
  return output;
}

function sanitizeCurricula(candidate, lessonPacks, skillIds, subjectIds) {
  if (!Array.isArray(candidate)) return [];
  const packIds = new Set(lessonPacks.filter((pack) => pack.mode !== "override").map((pack) => pack.id));
  const seen = new Set();
  return candidate.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const rawId = cleanText(item.id, 120).toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const id = CURRICULUM_ID.test(rawId) ? rawId : `CURRICULUM_IMPORTED_${index + 1}`;
    if (seen.has(id)) return null;
    const name = cleanText(item.name, 100);
    if (!name) return null;
    seen.add(id);
    const plan = sanitizeMapPlans({ curriculum: item.mapPlan ?? item.map_plan }, new Set(["curriculum"]), skillIds, subjectIds).curriculum ?? emptyMapPlan();
    return {
      id,
      name,
      description: cleanText(item.description, 1000),
      ownerProfileId: cleanText(item.ownerProfileId ?? item.owner_profile_id, 100) || null,
      enabledPackIds: Array.isArray(item.enabledPackIds ?? item.enabled_pack_ids)
        ? [...new Set((item.enabledPackIds ?? item.enabled_pack_ids).filter((packId) => packIds.has(packId)))].slice(0, MAX_LESSON_SETS)
        : [],
      includeNativeLessons: (item.includeNativeLessons ?? item.include_native_lessons) !== false,
      settings: sanitizeCurriculumSettings(item.settings),
      mapPlan: plan,
      createdAt: cleanText(item.createdAt ?? item.created_at, 40) || new Date().toISOString(),
      updatedAt: cleanText(item.updatedAt ?? item.updated_at, 40) || cleanText(item.createdAt ?? item.created_at, 40) || new Date().toISOString(),
      sourceUrl: cleanText(item.sourceUrl ?? item.source_url, 1000) || null,
    };
  }).filter(Boolean).slice(0, MAX_CURRICULA);
}

function sanitizeProfile(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const id = cleanText(candidate.id, 100);
  const displayName = cleanText(candidate.displayName ?? candidate.display_name, 60);
  if (!id || RESERVED_OBJECT_KEYS.has(id) || !displayName) return null;
  const createdAt = cleanText(candidate.createdAt, 40) || new Date().toISOString();
  const role = candidate.role === "educator" ? "educator" : "learner";
  return {
    id,
    displayName,
    role,
    curriculumId: cleanText(candidate.curriculumId ?? candidate.curriculum_id, 120) || null,
    activeCurriculumId: cleanText(candidate.activeCurriculumId ?? candidate.active_curriculum_id, 120) || null,
    createdAt,
    totalLoggedSeconds: Math.floor(cleanNumber(candidate.totalLoggedSeconds, 0, 0, 100_000_000)),
    demo: Boolean(candidate.demo),
    activeSubjectId: SUBJECT_ID.test(candidate.activeSubjectId) ? candidate.activeSubjectId : DEFAULT_SUBJECT_ID,
    progressionMode: candidate.progressionMode === "soft" ? "soft" : "hard",
    mapScope: "all",
    agentActivityAt: cleanText(candidate.agentActivityAt, 40) || null,
    educatorGuideSeenAt: role === "educator"
      ? candidate.educatorGuideSeenAt === null ? null : cleanText(candidate.educatorGuideSeenAt, 40) || null
      : null,
    tutorialCompletedAt: role === "educator" ? cleanText(candidate.tutorialCompletedAt, 40) || createdAt : candidate.tutorialCompletedAt === null ? null : cleanText(candidate.tutorialCompletedAt, 40) || createdAt,
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

function sanitizeStructuredWork(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  try {
    const serialized = JSON.stringify(candidate);
    if (serialized.length > 30_000) return null;
    return JSON.parse(serialized);
  } catch { return null; }
}

function sanitizePythonGrade(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const status = ["passed", "incorrect", "syntax_error", "policy_error", "runtime_error", "timeout", "unavailable"].includes(candidate.status) ? candidate.status : "runtime_error";
  const tests = Array.isArray(candidate.tests) ? candidate.tests.slice(0, 30).map((test, index) => ({
    id: cleanText(test?.id, 60) || `test_${index + 1}`,
    status: ["passed", "failed", "runtime_error", "timeout"].includes(test?.status) ? test.status : "failed",
    visibility: ["example", "after_submission", "hidden"].includes(test?.visibility) ? test.visibility : "hidden",
    message: cleanText(test?.message, 500),
  })) : [];
  const total = Math.floor(cleanNumber(Number(candidate.total), tests.length, 0, 30));
  const passed = Math.floor(cleanNumber(Number(candidate.passed), tests.filter((test) => test.status === "passed").length, 0, total));
  return {
    status,
    score: cleanNumber(Number(candidate.score), total ? passed / total : 0, 0, 1),
    passed,
    total,
    tests,
    messages: Array.isArray(candidate.messages) ? candidate.messages.map((message) => cleanText(message, 500)).filter(Boolean).slice(0, 12) : [],
    stdout: cleanText(candidate.stdout, 4000),
  };
}

function sanitizeResult(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const questionId = cleanText(candidate.questionId ?? candidate.question_id, 120);
  if (!questionId) return null;
  return {
    questionId,
    prompt: cleanText(candidate.prompt, 2000),
    finalAnswer: cleanText(candidate.finalAnswer, (candidate.gradingMethod ?? candidate.grading_method) === "python_program" ? 12_000 : 300),
    work: cleanText(candidate.work, MAX_LONG_WORK_CHARS),
    structuredWorkJson: sanitizeStructuredWork(candidate.structuredWorkJson),
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
    traceDiagnostics: Array.isArray(candidate.traceDiagnostics) ? candidate.traceDiagnostics.slice(0, 200).map((item) => ({
      kind: cleanText(item?.kind, 40),
      step: cleanText(String(item?.step ?? ""), 40),
      column: cleanText(item?.column, 40),
      actual: item?.actual == null ? null : cleanText(String(item.actual), 300),
      expected: item?.expected == null ? null : cleanText(String(item.expected), 300),
      message: cleanText(item?.message, 500),
    })) : [],
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
    curriculumId: cleanText(candidate.curriculumId, 120) || null,
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
    previousMasteryStatus: ["ready", "learning", "proven", "mastered", "rusty"].includes(candidate.previousMasteryStatus) ? candidate.previousMasteryStatus : null,
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
          finalAnswer: cleanText(responses[id]?.finalAnswer, safeProblems.get(id)?.grading_method === "python_program" ? 12_000 : 300),
          work: cleanText(responses[id]?.work, MAX_LONG_WORK_CHARS),
          structuredWorkJson: sanitizeStructuredWork(responses[id]?.structuredWorkJson),
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
  const subjects = new Set(catalog.subjects.map((subject) => subject.id));
  const curricula = sanitizeCurricula(candidate.curricula, lessonPacks, skills, subjects);
  const curriculumIds = new Set(curricula.map((item) => item.id));
  const seenProfileIds = new Set();
  const profiles = Array.isArray(candidate.profiles)
    ? candidate.profiles.map(sanitizeProfile).filter((profile) => {
      if (!profile || seenProfileIds.has(profile.id)) return false;
      seenProfileIds.add(profile.id);
      return true;
    }).slice(0, MAX_PROFILES)
    : [];
  for (const item of curricula) {
    if (profiles.some((profile) => profile.id === item.ownerProfileId && profile.role === "educator")) continue;
    const legacyOwners = profiles.filter((profile) => profile.role === "educator" && profile.activeCurriculumId === item.id);
    item.ownerProfileId = legacyOwners.length === 1 ? legacyOwners[0].id : null;
  }
  for (const profile of profiles) {
    if (!curriculumIds.has(profile.curriculumId)) profile.curriculumId = null;
    if (profile.role === "educator") {
      const owned = curricula.find((item) => item.id === profile.activeCurriculumId && item.ownerProfileId === profile.id)
        ?? curricula.find((item) => item.ownerProfileId === profile.id)
        ?? null;
      profile.activeCurriculumId = owned?.id ?? null;
    }
  }
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
  const activity = Array.isArray(candidate.activity)
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
    : [];
  for (const profile of profiles) {
    if (profile.agentActivityAt) continue;
    profile.agentActivityAt = activity.filter((item) => item.profileId === profile.id && item.actor === "agent").at(-1)?.at ?? null;
  }
  return {
    ...base,
    activeProfileId,
    profiles,
    curricula,
    progress: sanitizeProgress(candidate.progress, profileIds, skills),
    attempts,
    reviews,
    drafts: sanitizeDrafts(candidate.drafts, profileIds, catalog),
    mapPlans: sanitizeMapPlans(candidate.mapPlans, profileIds, skills, subjects),
    lessonPacks,
    stagedLessonPacks: sanitizeStagedLessonPacks(candidate.stagedLessonPacks, curriculum, { strict: strictPacks }),
    backup: {
      lastExportAt: cleanText(candidate.backup?.lastExportAt, 40) || null,
      attemptCountAtExport: Math.floor(cleanNumber(candidate.backup?.attemptCountAtExport, 0, 0, MAX_ATTEMPTS)),
      reviewCountAtExport: Math.floor(cleanNumber(candidate.backup?.reviewCountAtExport, 0, 0, MAX_REVIEWS)),
      lessonPackCountAtExport: Math.floor(cleanNumber(candidate.backup?.lessonPackCountAtExport, 0, 0, MAX_LESSON_SETS)),
      curriculumUpdatedAtAtExport: cleanText(candidate.backup?.curriculumUpdatedAtAtExport, 40) || null,
    },
    ui: {
      route: activeProfileId ? (route === "welcome" ? (profiles.find((profile) => profile.id === activeProfileId)?.role === "educator" ? "curriculum" : "home") : route) : "welcome",
      selectedSkillId,
      selectedMapSkillId: skills.has(ui.selectedMapSkillId) ? ui.selectedMapSkillId : selectedSkillId,
      mapZoom: Math.round(cleanNumber(Number(ui.mapZoom), 1, 0.1, 1.6) * 100) / 100,
      mapPlanMode: Boolean(ui.mapPlanMode),
      mapPlanView: ui.mapPlanView !== false,
      mapPlanShowHidden: Boolean(ui.mapPlanShowHidden),
      mapPlanSelection: Array.isArray(ui.mapPlanSelection) ? [...new Set(ui.mapPlanSelection.filter((id) => skills.has(id)))].slice(0, 80) : [],
      selectedMapPlanPathId: cleanText(ui.selectedMapPlanPathId, 120) || null,
      mapPlanComposer: ["annotation", "path", "manage"].includes(ui.mapPlanComposer) ? ui.mapPlanComposer : null,
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
    activity,
  };
}

function migrateBundledLessonPacks(candidate, bundledLessonPacks = []) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return candidate;
  if (Number(candidate.version) >= APP_VERSION || !Array.isArray(candidate.profiles) || !candidate.profiles.length) return candidate;
  if (!Array.isArray(bundledLessonPacks) || !bundledLessonPacks.length) return candidate;
  const migrated = clone(candidate);
  migrated.lessonPacks = Array.isArray(migrated.lessonPacks) ? [...migrated.lessonPacks] : [];
  const installedIds = new Set(migrated.lessonPacks.map((pack) => pack?.id).filter(Boolean));
  for (const rawPack of bundledLessonPacks) {
    let pack = rawPack;
    if (typeof rawPack === "string") {
      try { pack = JSON.parse(rawPack); } catch { continue; }
    }
    if (!pack?.id || installedIds.has(pack.id)) continue;
    migrated.lessonPacks.push(pack);
    installedIds.add(pack.id);
  }
  return migrated;
}

function migrateLegacy(storage, curriculum) {
  try {
    const legacy = JSON.parse(storage?.getItem(LEGACY_STORAGE_KEY) ?? "null");
    if (!legacy || typeof legacy !== "object") return null;
    const state = initialState();
    const now = new Date().toISOString();
    const profile = { id: "profile-migrated-demo", displayName: "Demo Learner", createdAt: now, totalLoggedSeconds: 0, demo: true, activeSubjectId: DEFAULT_SUBJECT_ID, progressionMode: "hard", mapScope: "all", tutorialCompletedAt: now, tutorialSkipped: false };
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

export function loadState(storage, curriculum, { bundledLessonPacks = [] } = {}) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) return sanitizeState(migrateBundledLessonPacks(JSON.parse(raw), bundledLessonPacks), curriculum);
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

function parseFiniteSetValues(value, variable = "x") {
  if (Array.isArray(value)) return value.map((item) => extractSolutionValue(String(item), variable)).filter(Boolean);
  let source = normalizeMathNotation(String(value ?? "")).trim();
  if (["", "{}", "∅", "empty", "empty set", "no solution", "no solutions"].includes(source.toLowerCase())) return [];
  if (source.startsWith("{") && source.endsWith("}")) source = source.slice(1, -1);
  return source.replace(/\s+or\s+/gi, ",").split(/[,;]/).map((item) => extractSolutionValue(item.trim(), variable)).filter(Boolean);
}

function finiteSetsEquivalent(expectedValues, answer, variable = "x") {
  const expected = parseFiniteSetValues(expectedValues, variable);
  const actual = parseFiniteSetValues(answer, variable);
  const unique = (items) => items.filter((item, index) => !items.slice(0, index).some((previous) => symbolicEquivalent(previous, item)));
  const left = unique(expected);
  const right = unique(actual);
  if (left.length !== right.length) return false;
  const unmatched = [...right];
  for (const item of left) {
    const index = unmatched.findIndex((candidate) => symbolicEquivalent(item, candidate));
    if (index < 0) return false;
    unmatched.splice(index, 1);
  }
  return true;
}

function expressionHasObviousCancellation(source) {
  const compact = normalizeMathNotation(String(source ?? "")).replace(/\s+/g, "");
  const slash = compact.indexOf("/");
  if (slash < 0) return false;
  const factors = (text) => text.replace(/^\(+|\)+$/g, "").split("*").map((item) => item.replace(/^\(+|\)+$/g, "")).filter(Boolean);
  const numerator = factors(compact.slice(0, slash));
  const denominator = factors(compact.slice(slash + 1));
  return numerator.some((factor) => denominator.includes(factor));
}

function intervalEndpoint(source) {
  const value = normalizeMathNotation(String(source ?? "")).trim().toLowerCase().replace(/^\+/, "");
  if (["inf", "infinity", "oo", "∞"].includes(value)) return Infinity;
  if (["-inf", "-infinity", "-oo", "-∞"].includes(value)) return -Infinity;
  const parsed = numericValue(value);
  if (!Number.isFinite(parsed)) throw new Error("Interval endpoint is not a real constant.");
  return parsed;
}

function relationInterval(variableSide, relation, boundary, variableOnLeft) {
  let operator = relation;
  if (!variableOnLeft) operator = { "<": ">", "<=": ">=", ">": "<", ">=": "<=" }[relation];
  if (operator === "<") return { lo: -Infinity, hi: boundary, leftClosed: false, rightClosed: false };
  if (operator === "<=") return { lo: -Infinity, hi: boundary, leftClosed: false, rightClosed: true };
  if (operator === ">") return { lo: boundary, hi: Infinity, leftClosed: false, rightClosed: false };
  return { lo: boundary, hi: Infinity, leftClosed: true, rightClosed: false };
}

function intersectIntervals(left, right) {
  const lo = Math.max(left.lo, right.lo);
  const hi = Math.min(left.hi, right.hi);
  const leftClosed = (lo === left.lo ? left.leftClosed : right.leftClosed) && (lo !== left.lo || lo !== right.lo || (left.leftClosed && right.leftClosed));
  const rightClosed = (hi === left.hi ? left.rightClosed : right.rightClosed) && (hi !== left.hi || hi !== right.hi || (left.rightClosed && right.rightClosed));
  if (lo > hi || (lo === hi && !(leftClosed && rightClosed))) return null;
  return { lo, hi, leftClosed, rightClosed };
}

function normalizeIntervals(intervals) {
  const sorted = intervals.filter(Boolean).sort((a, b) => a.lo - b.lo || Number(b.leftClosed) - Number(a.leftClosed));
  const merged = [];
  for (const current of sorted) {
    const previous = merged.at(-1);
    const joins = previous && (current.lo < previous.hi || (current.lo === previous.hi && (previous.rightClosed || current.leftClosed)));
    if (!joins) { merged.push({ ...current }); continue; }
    if (current.hi > previous.hi) {
      previous.hi = current.hi;
      previous.rightClosed = current.rightClosed;
    } else if (current.hi === previous.hi) previous.rightClosed ||= current.rightClosed;
  }
  return merged;
}

function parseIntervalSet(source, variable = "x") {
  const text = normalizeMathNotation(String(source ?? "")).replace(/∞/g, "inf").trim();
  const folded = text.replace(/\s+/g, " ").toLowerCase();
  if (["", "{}", "∅", "empty", "empty set", "no solution", "no solutions"].includes(folded)) return [];
  if (["r", "ℝ", "reals", "real numbers", "all reals", "all real numbers"].includes(folded)) return [{ lo: -Infinity, hi: Infinity, leftClosed: false, rightClosed: false }];
  const unionParts = text.split(/\s*(?:∪|\bU\b|\bor\b)\s*/i).filter(Boolean);
  const parseOne = (part) => {
    const interval = part.match(/^\s*([[(])\s*(.+?)\s*,\s*(.+?)\s*([\])])\s*$/);
    if (interval) {
      const lo = intervalEndpoint(interval[2]);
      const hi = intervalEndpoint(interval[3]);
      const leftClosed = interval[1] === "[";
      const rightClosed = interval[4] === "]";
      if ((lo === -Infinity && leftClosed) || (hi === Infinity && rightClosed) || lo > hi || (lo === hi && !(leftClosed && rightClosed))) throw new Error("Invalid interval endpoints.");
      return [{ lo, hi, leftClosed, rightClosed }];
    }
    const notEqual = part.match(new RegExp(`^\\s*${variable}\\s*!=\\s*(.+)$`, "i"));
    if (notEqual) {
      const boundary = intervalEndpoint(notEqual[1]);
      return [{ lo: -Infinity, hi: boundary, leftClosed: false, rightClosed: false }, { lo: boundary, hi: Infinity, leftClosed: false, rightClosed: false }];
    }
    const equal = part.match(new RegExp(`^\\s*${variable}\\s*=\\s*(.+)$`, "i"));
    if (equal) {
      const boundary = intervalEndpoint(equal[1]);
      return [{ lo: boundary, hi: boundary, leftClosed: true, rightClosed: true }];
    }
    const chained = part.match(new RegExp(`^\\s*(.+?)\\s*(<=|>=|<|>)\\s*${variable}\\s*(<=|>=|<|>)\\s*(.+?)\\s*$`, "i"));
    if (chained) {
      const first = relationInterval(variable, chained[2], intervalEndpoint(chained[1]), false);
      const second = relationInterval(variable, chained[3], intervalEndpoint(chained[4]), true);
      const result = intersectIntervals(first, second);
      return result ? [result] : [];
    }
    const single = part.match(/^\s*(.+?)\s*(<=|>=|<|>)\s*(.+?)\s*$/);
    if (single) {
      const leftIsVariable = single[1].trim().toLowerCase() === variable.toLowerCase();
      const rightIsVariable = single[3].trim().toLowerCase() === variable.toLowerCase();
      if (leftIsVariable === rightIsVariable) throw new Error("Inequality must contain the target variable once.");
      return [relationInterval(variable, single[2], intervalEndpoint(leftIsVariable ? single[3] : single[1]), leftIsVariable)];
    }
    throw new Error("Could not parse interval set.");
  };
  return normalizeIntervals(unionParts.flatMap(parseOne));
}

function intervalSetsEquivalent(left, right, variable = "x") {
  try {
    const a = parseIntervalSet(left, variable);
    const b = parseIntervalSet(right, variable);
    return normalizedIntervalArraysEquivalent(a, b);
  } catch { return false; }
}

function normalizedIntervalArraysEquivalent(a, b) {
  if (a.length !== b.length) return false;
  const close = (x, y) => x === y || (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y)));
  return a.every((interval, index) => {
    const other = b[index];
    return close(interval.lo, other.lo) && close(interval.hi, other.hi) && interval.leftClosed === other.leftClosed && interval.rightClosed === other.rightClosed;
  });
}

function equationAcceptsCandidate(equation, variable, candidate) {
  const parsed = parseRelation(equation);
  const value = numericValue(candidate);
  if (!parsed || parsed.relation !== "=" || !Number.isFinite(value)) return null;
  try {
    const left = evaluateExpression(parsed.leftTokens, { [variable]: value });
    const right = evaluateExpression(parsed.rightTokens, { [variable]: value });
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    return Math.abs(left - right) <= 1e-8 * Math.max(1, Math.abs(left), Math.abs(right));
  } catch { return false; }
}

function signChartBoundaryMatches(actual, expected, side) {
  const source = String(actual ?? "").trim().toLowerCase();
  if (!Number.isFinite(expected)) {
    if (!source) return true;
    return side === "lower" ? ["-inf", "-infinity", "-∞"].includes(source) : ["inf", "+inf", "infinity", "+infinity", "∞", "+∞"].includes(source);
  }
  const value = numericValue(source);
  return Number.isFinite(value) && Math.abs(value - expected) <= 1e-9 * Math.max(1, Math.abs(value), Math.abs(expected));
}

export function gradeProblem(problem, answer, structuredWork = null) {
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
  } else if (method === "finite_set") {
    correct = finiteSetsEquivalent(problem.answer_metadata?.values ?? parseFiniteSetValues(expected), answer, problem.variable ?? problem.answer_metadata?.variable ?? "x");
  } else if (method === "rational_expression") {
    const expectedExcluded = problem.answer_metadata?.excluded_values ?? [];
    const actualExcluded = structuredWork?.excluded_values ?? "";
    correct = symbolicEquivalent(answer, expected)
      && finiteSetsEquivalent(expectedExcluded, actualExcluded, problem.variable ?? problem.answer_metadata?.variable ?? "x")
      && !(problem.grading_metadata?.require_reduced_form && expressionHasObviousCancellation(answer));
  } else if (method === "interval_set") {
    correct = intervalSetsEquivalent(expected, answer, problem.variable ?? problem.answer_metadata?.variable ?? "x");
  } else if (method === "python_program") {
    const grade = structuredWork?.python_grade;
    correct = grade?.status === "passed" && Number(grade?.passed) === Number(grade?.total) && Number(grade?.total) === Number(problem.program_spec?.tests?.length);
  } else {
    correct = acceptedForms.map(normalizeAnswer).includes(normalizedAnswer);
  }

  return { correct, expected, method };
}

function traceComparable(value, comparison) {
  if (value == null || (comparison.blank_equals_null && String(value).trim() === "")) return null;
  if (typeof value === "string" && comparison.trim_strings) return value.trim();
  return value;
}

function traceCellsEquivalent(actual, expected, comparison) {
  const left = traceComparable(actual, comparison);
  const right = traceComparable(expected, comparison);
  if (left === right) return true;
  if (comparison.numeric_equivalence && left !== null && right !== null && String(left).trim() !== "" && String(right).trim() !== "") {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return Math.abs(leftNumber - rightNumber) <= 1e-9 * Math.max(1, Math.abs(leftNumber), Math.abs(rightNumber));
  }
  return String(left) === String(right);
}

export function gradeTraceTable(problem, structuredWork = null) {
  const spec = problem?.work?.trace_spec;
  if (!spec) return { ok: false, diagnostics: [{ kind: "missing_spec", message: "The authored trace model is unavailable." }] };
  const rows = Array.isArray(structuredWork?.rows) ? structuredWork.rows : [];
  const diagnostics = [];
  const byStep = new Map();
  for (const [index, row] of rows.entries()) {
    const step = row && typeof row === "object" ? String(row.step ?? "").trim() : "";
    if (!step) diagnostics.push({ kind: "missing_step", row: index + 1, message: `Trace row ${index + 1} has no step label.` });
    else if (byStep.has(step)) diagnostics.push({ kind: "duplicate_step", step, message: `Trace step ${step} appears more than once.` });
    else byStep.set(step, row);
  }
  const expectedSteps = new Set(spec.expected_rows.map((row) => String(row.step)));
  for (const expectedRow of spec.expected_rows) {
    const step = String(expectedRow.step);
    const actualRow = byStep.get(step);
    if (!actualRow) {
      diagnostics.push({ kind: "missing_row", step, message: `Trace step ${step} is missing.` });
      continue;
    }
    for (const column of spec.columns) {
      if (column === "step") continue;
      if (!traceCellsEquivalent(actualRow[column], expectedRow[column], spec.comparison)) {
        diagnostics.push({
          kind: String(actualRow[column] ?? "").trim() === "" ? "missing_value" : column === "output" ? "wrong_output" : "wrong_value",
          step,
          column,
          actual: actualRow[column] ?? null,
          expected: expectedRow[column] ?? null,
          message: `Trace step ${step}, column ${column}, does not match the program state.`,
        });
      }
    }
  }
  for (const step of byStep.keys()) if (!expectedSteps.has(step)) diagnostics.push({ kind: "unexpected_row", step, message: `Trace step ${step} is not part of this trace.` });
  return { ok: diagnostics.length === 0, diagnostics };
}

export function validateProceduralWork(problem, work, structuredWork = null, finalAnswer = "") {
  if (!problem.work_required) return null;
  const lines = String(work ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const minimumSteps = Math.max(1, Number(problem.work?.minimum_steps ?? 1));
  const mode = problem.work?.mode ?? "none";
  if (mode === "code_trace_steps") {
    const trace = gradeTraceTable(problem, structuredWork);
    return trace.ok ? null : trace.diagnostics[0]?.message ?? "Complete the trace table.";
  }
  if (mode === "rational_equation_steps") {
    const data = structuredWork && typeof structuredWork === "object" ? structuredWork : {};
    const restrictions = Array.isArray(data.restrictions) ? data.restrictions.filter((item) => String(item).trim()) : [];
    const steps = Array.isArray(data.steps) ? data.steps.filter((item) => String(item).trim()) : String(data.steps ?? "").split(/\r?\n/).filter((item) => item.trim());
    const candidates = Array.isArray(data.candidates) ? data.candidates : [];
    const variable = problem.variable ?? problem.work?.target_variable ?? "x";
    const expectedRestrictions = problem.work?.expected_restrictions ?? [];
    if (problem.work?.require_restrictions && !restrictions.length) return "List every original denominator restriction.";
    if (expectedRestrictions.length && !finiteSetsEquivalent(expectedRestrictions, restrictions, variable)) return "The original denominator restriction set is incomplete or contains an extra value.";
    const minimumSteps = Math.max(1, Number(problem.work?.minimum_steps ?? 1));
    if (steps.length < minimumSteps) return `Add at least ${minimumSteps} denominator-clearing or solving step(s).`;
    if (steps.some((step) => parseRelation(step)?.relation !== "=")) return "Enter one valid equation per algebra-step line.";
    if (!candidates.length) return "Add and classify each candidate solution.";
    if (candidates.some((item) => !String(item?.value ?? "").trim() || !["valid", "excluded", "extraneous", "repeated", "non_real"].includes(item?.status))) return "Each candidate needs a value and classification.";
    const expectedValues = problem.answer_metadata?.values ?? parseFiniteSetValues(problem.expected_answer, variable);
    const seen = [];
    for (const [index, candidate] of candidates.entries()) {
      const value = String(candidate.value).trim();
      const repeated = seen.some((previous) => symbolicEquivalent(previous, value));
      let expectedStatus;
      if (repeated) expectedStatus = "repeated";
      else if (expectedRestrictions.some((restriction) => symbolicEquivalent(String(restriction), value))) expectedStatus = "excluded";
      else if (expectedValues.some((expected) => symbolicEquivalent(String(expected), value))) expectedStatus = "valid";
      else {
        const accepted = equationAcceptsCandidate(problem.work?.original_equation ?? problem.prompt.replace(/^.*?:\s*/, ""), variable, value);
        expectedStatus = accepted === true ? "valid" : accepted === false ? "extraneous" : /(?:\bi\b|sqrt\s*\(\s*-)/i.test(value) ? "non_real" : "extraneous";
      }
      seen.push(value);
      if (candidate.status !== expectedStatus) return `Candidate row ${index + 1} should be classified as ${expectedStatus.replaceAll("_", "-")}.`;
    }
    if (problem.work?.require_original_equation_check && candidates.some((item) => ["valid", "extraneous"].includes(item.status) && !String(item.original_check ?? "").trim())) return "Check every valid or extraneous candidate in the original equation.";
    const valid = candidates.filter((item) => item.status === "valid").map((item) => item.value);
    if (!finiteSetsEquivalent(expectedValues, valid, variable)) return "Candidates marked valid do not match the final solution set.";
    return null;
  }
  if (mode === "sign_chart_steps") {
    const data = structuredWork && typeof structuredWork === "object" ? structuredWork : {};
    const chart = problem.work?.sign_chart ?? {};
    const target = problem.work?.target_variable ?? problem.variable ?? "x";
    const expectedPoints = [...(chart.critical_points ?? [])].sort((left, right) => intervalEndpoint(left.value) - intervalEndpoint(right.value));
    const points = Array.isArray(data.critical_points) ? data.critical_points : [];
    const intervals = Array.isArray(data.intervals) ? data.intervals : [];
    const endpoints = Array.isArray(data.endpoints) ? data.endpoints : [];
    if (points.length !== expectedPoints.length) return `Enter all ${expectedPoints.length} critical point(s).`;
    for (const expectedPoint of expectedPoints) {
      const point = points.find((item) => symbolicEquivalent(String(item?.value ?? ""), String(expectedPoint.value ?? "")));
      if (!point || point.kind !== expectedPoint.kind) return `Classify critical point ${expectedPoint.value} correctly.`;
    }
    if (chart.require_factorization && !symbolicEquivalent(String(data.factorization ?? ""), String(chart.expected_factorization ?? chart.expression ?? ""))) return "Enter an equivalent factorization.";
    if (chart.require_interval_signs && intervals.length !== expectedPoints.length + 1) return `Complete all ${expectedPoints.length + 1} sign-chart interval rows.`;
    const expression = chart.reduced_expression || chart.expression;
    const expressionTokenList = expressionTokens(expression);
    if (!expressionTokenList) return "The authored sign-chart expression could not be parsed.";
    const pointValues = expectedPoints.map((point) => intervalEndpoint(point.value));
    const selectedIntervals = [];
    for (const [index, row] of intervals.entries()) {
      const lower = index === 0 ? -Infinity : pointValues[index - 1];
      const upper = index === pointValues.length ? Infinity : pointValues[index];
      if (!signChartBoundaryMatches(row?.lower, lower, "lower") || !signChartBoundaryMatches(row?.upper, upper, "upper")) return `The boundaries in interval row ${index + 1} do not match the ordered critical points.`;
      if (chart.require_test_values && !String(row?.test_value ?? "").trim()) return `Choose a test value for interval row ${index + 1}.`;
      try {
        const test = numericValue(row.test_value);
        if (!Number.isFinite(test) || !(test > lower && test < upper)) return `The test value in interval row ${index + 1} must lie strictly inside that interval.`;
        const learnerValue = evaluateExpression(expressionTokenList, { [target]: test });
        if (!Number.isFinite(learnerValue)) return `The expression is undefined at the test value in interval row ${index + 1}.`;
        const safeTest = !Number.isFinite(lower) && !Number.isFinite(upper) ? 0 : !Number.isFinite(lower) ? upper - 1 : !Number.isFinite(upper) ? lower + 1 : (lower + upper) / 2;
        const safeValue = evaluateExpression(expressionTokenList, { [target]: safeTest });
        const expectedSign = safeValue > 0 ? "positive" : safeValue < 0 ? "negative" : "zero";
        const learnerSign = learnerValue > 0 ? "positive" : learnerValue < 0 ? "negative" : "zero";
        if (learnerSign !== expectedSign || row.sign !== expectedSign) return `The sign in interval row ${index + 1} is ${expectedSign}.`;
        const selected = [">", ">="].includes(chart.relation) ? expectedSign === "positive" : expectedSign === "negative";
        if (Boolean(row.selected) !== selected) return `The selection in interval row ${index + 1} does not match ${chart.relation}.`;
        if (selected) selectedIntervals.push({ lo: lower, hi: upper, leftClosed: false, rightClosed: false });
      } catch { return `The test value in interval row ${index + 1} could not be evaluated.`; }
    }
    if (chart.require_endpoint_decisions) {
      for (const point of expectedPoints) {
        const endpoint = endpoints.find((item) => symbolicEquivalent(String(item?.value ?? ""), String(point.value ?? "")));
        const shouldInclude = point.kind === "zero" && [">=", "<="].includes(chart.relation);
        if (!endpoint || Boolean(endpoint.included) !== shouldInclude) return `Fix the endpoint decision for ${point.value}.`;
        if (shouldInclude) selectedIntervals.push({ lo: intervalEndpoint(point.value), hi: intervalEndpoint(point.value), leftClosed: true, rightClosed: true });
      }
    }
    if (!normalizedIntervalArraysEquivalent(normalizeIntervals(selectedIntervals), parseIntervalSet(problem.expected_answer, target))) return "The selected intervals and endpoint decisions do not form the authored solution set.";
    if (chart.require_final_answer_match && !intervalSetsEquivalent(problem.expected_answer, finalAnswer, target)) return "The final interval answer does not match the completed sign chart.";
    return null;
  }
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

export function createQuickMathsStore({ storage, curriculum, bundledLessonPacks = [], now = () => new Date() }) {
  const skillsById = {};
  const skillOrder = [];
  const unlocks = {};
  let catalog = curriculum;
  let migrationLessonPacks = [...bundledLessonPacks];
  let state = loadState(storage, curriculum, { bundledLessonPacks: migrationLessonPacks });
  let lessonPacksById = new Map();
  let visibleSkillCache = null;
  const listeners = new Set();
  let storageError = null;

  const rebuildCatalog = () => {
    catalog = mergeCurriculum(curriculum, state.lessonPacks ?? []);
    lessonPacksById = new Map(state.lessonPacks.map((pack) => [pack.id, pack]));
    visibleSkillCache = null;
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
    const profileIds = new Set(state.profiles.map((profile) => profile.id));
    const skillIds = new Set(skillOrder);
    const subjectIds = new Set(catalog.subjects.map((subject) => subject.id));
    state.mapPlans = sanitizeMapPlans(state.mapPlans, profileIds, skillIds, subjectIds);
    state.ui.mapPlanSelection = Array.isArray(state.ui.mapPlanSelection)
      ? state.ui.mapPlanSelection.filter((id) => skillIds.has(id))
      : [];
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
    const at = isoNow();
    state.activity = [...state.activity, {
      at, tool, message, profileId: profileId ?? null, actor: actor === "agent" ? "agent" : "learner",
    }].slice(-MAX_ACTIVITY);
    if (actor === "agent") {
      const profile = state.profiles.find((item) => item.id === profileId);
      if (profile) profile.agentActivityAt = at;
    }
  };

  const activeProfile = () => state.profiles.find((profile) => profile.id === state.activeProfileId) ?? null;
  const curriculaForProfile = (profile = activeProfile()) => {
    if (!profile) return [];
    if (profile.role === "educator") return state.curricula.filter((item) => item.ownerProfileId === profile.id);
    const assigned = state.curricula.find((item) => item.id === profile.curriculumId);
    return assigned ? [assigned] : [];
  };
  const activeCurriculum = () => {
    const profile = activeProfile();
    const curriculumId = profile?.role === "educator" ? profile.activeCurriculumId : profile?.curriculumId;
    return curriculaForProfile(profile).find((item) => item.id === curriculumId) ?? null;
  };
  const activeCurriculumSettings = () => activeCurriculum()?.settings ?? null;
  const effectiveProgressionMode = () => activeCurriculumSettings()?.progressionMode ?? activeProfile()?.progressionMode ?? "hard";
  const addPrerequisiteClosure = (ids, catalogView = catalog, shouldInclude = () => true) => {
    const byId = new Map(catalogView.skills.map((skill) => [skill.id, skill]));
    const pending = [...ids];
    while (pending.length) {
      const skill = byId.get(pending.pop());
      for (const prerequisiteId of skill?.prerequisites ?? []) {
        if (ids.has(prerequisiteId)) continue;
        const prerequisite = byId.get(prerequisiteId);
        if (!prerequisite || !shouldInclude(prerequisite)) continue;
        ids.add(prerequisiteId);
        pending.push(prerequisiteId);
      }
    }
    return ids;
  };
  const visibleSkillIds = () => {
    const active = activeCurriculum();
    if (!active) return new Set(skillOrder);
    const cacheKey = `${active.id}\u0000${active.includeNativeLessons !== false}\u0000${active.enabledPackIds.join("\u0000")}`;
    if (visibleSkillCache?.key === cacheKey) return new Set(visibleSkillCache.ids);
    const enabled = new Set(active.enabledPackIds);
    const included = new Set(skillOrder.filter((skillId) => {
      const skill = skillsById[skillId];
      if (skill?.native || !skill?.packId) return active.includeNativeLessons !== false;
      const pack = lessonPacksById.get(skill.packId);
      return (pack?.mode === "override" && active.includeNativeLessons !== false) || enabled.has(skill.packId);
    }));
    if (active.includeNativeLessons === false) {
      addPrerequisiteClosure(included, catalog, (skill) => skill.native || !skill.packId);
    }
    const ids = skillOrder.filter((skillId) => included.has(skillId));
    visibleSkillCache = { key: cacheKey, ids };
    return new Set(ids);
  };
  const validateEnabledCurriculum = (workspace, enabledPackIds, {
    checkPlan = true,
    packs = state.lessonPacks,
    catalogView = catalog,
  } = {}) => {
    const enabled = new Set(enabledPackIds);
    const visible = new Set(workspace.includeNativeLessons === false ? [] : curriculum.skills.map((skill) => skill.id));
    for (const pack of packs) {
      if ((pack.mode === "override" && workspace.includeNativeLessons !== false) || enabled.has(pack.id)) pack.skills.forEach((skill) => visible.add(skill.id));
    }
    if (!visible.size) throw new Error("A curriculum must include native Mathematics or at least one enabled lesson pack.");
    if (workspace.includeNativeLessons === false) {
      addPrerequisiteClosure(visible, catalogView, (skill) => skill.native || !skill.packId);
    }
    const catalogSkillsById = new Map(catalogView.skills.map((skill) => [skill.id, skill]));
    for (const skillId of visible) {
      const skill = catalogSkillsById.get(skillId);
      const missing = skill?.prerequisites?.find((prerequisiteId) => !visible.has(prerequisiteId));
      if (missing) throw new Error(`${skill?.name ?? skillId} depends on ${catalogSkillsById.get(missing)?.name ?? missing} in a disabled lesson set.`);
    }
    if (checkPlan) {
      const plan = workspace.mapPlan ?? emptyMapPlan();
      const referenced = new Set([
        ...Object.values(plan.layouts ?? {}).flatMap((positions) => Object.keys(positions ?? {})),
        ...(plan.paths ?? []).flatMap((path) => path.skillIds ?? []),
        ...(plan.annotations ?? []).flatMap((annotation) => annotation.skillIds ?? []),
        ...(plan.hiddenSkillIds ?? []),
      ]);
      const hiddenReferences = [...referenced].filter((skillId) => !visible.has(skillId));
      if (hiddenReferences.length) {
        const error = new Error(`The curriculum plan still references ${catalogSkillsById.get(hiddenReferences[0])?.name ?? hiddenReferences[0]}. Remove affected layouts, paths, and annotations before disabling its lesson set.`);
        error.code = "curriculum_plan_references";
        error.hiddenSkillIds = hiddenReferences;
        throw error;
      }
    }
    return visible;
  };
  const removeHiddenPlanReferences = (workspace, visible) => {
    const plan = workspace.mapPlan ?? emptyMapPlan();
    let removed = 0;
    for (const [layoutKey, positions] of Object.entries(plan.layouts ?? {})) {
      for (const skillId of Object.keys(positions ?? {})) {
        if (!visible.has(skillId)) {
          delete positions[skillId];
          removed += 1;
        }
      }
      if (!Object.keys(positions ?? {}).length) delete plan.layouts[layoutKey];
    }
    const retainedPaths = [];
    for (const path of plan.paths ?? []) {
      const nextIds = (path.skillIds ?? []).filter((skillId) => visible.has(skillId));
      removed += Math.max(0, (path.skillIds?.length ?? 0) - nextIds.length);
      if (nextIds.length < 2) {
        removed += 1;
      } else retainedPaths.push({ ...path, skillIds: nextIds, updatedAt: isoNow() });
    }
    plan.paths = retainedPaths;
    plan.annotations = (plan.annotations ?? []).flatMap((annotation) => {
      const nextIds = (annotation.skillIds ?? []).filter((skillId) => visible.has(skillId));
      removed += Math.max(0, (annotation.skillIds?.length ?? 0) - nextIds.length);
      if (!nextIds.length && !Object.keys(annotation.positions ?? {}).length) {
        removed += 1;
        return [];
      }
      return [{ ...annotation, skillIds: nextIds, targetType: nextIds.length === 1 ? "node" : nextIds.length > 1 ? "nodes" : "free", updatedAt: isoNow() }];
    });
    const nextHidden = (plan.hiddenSkillIds ?? []).filter((skillId) => visible.has(skillId));
    removed += Math.max(0, (plan.hiddenSkillIds?.length ?? 0) - nextHidden.length);
    plan.hiddenSkillIds = nextHidden;
    workspace.mapPlan = plan;
    return removed;
  };
  const isSkillVisible = (skillId) => visibleSkillIds().has(skillId);
  const activeProgress = () => state.progress[state.activeProfileId] ?? {};
  const activeMapPlan = () => {
    if (activeProfile()?.role === "educator" && activeCurriculum()) return activeCurriculum().mapPlan;
    if (!state.activeProfileId) return emptyMapPlan();
    state.mapPlans[state.activeProfileId] ??= emptyMapPlan();
    return state.mapPlans[state.activeProfileId];
  };
  const assignedCurriculumPlan = () => activeProfile()?.role === "learner" && activeCurriculum() ? activeCurriculum().mapPlan : emptyMapPlan();
  const touchActiveCurriculum = () => {
    const workspace = activeCurriculum();
    if (activeProfile()?.role === "educator" && workspace) workspace.updatedAt = isoNow();
  };
  const profileAttempts = () => state.attempts.filter((attempt) => attempt.profileId === state.activeProfileId);
  const activeSubjectId = () => {
    const preferred = activeProfile()?.activeSubjectId ?? DEFAULT_SUBJECT_ID;
    const visible = visibleSkillIds();
    return catalog.skills.some((skill) => visible.has(skill.id) && skill.subjectId === preferred)
      ? preferred
      : catalog.skills.find((skill) => visible.has(skill.id))?.subjectId ?? DEFAULT_SUBJECT_ID;
  };

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
      if (record.status === "locked" && effectiveProgressionMode() === "soft") return "ready";
      if (PROVEN.has(record.status) && record.nextReviewAt && new Date(record.nextReviewAt).getTime() < milliseconds()) return "rusty";
      return record.status;
    }
    if (effectiveProgressionMode() === "soft") return "ready";
    return skill.prerequisites.every((id) => PROVEN.has(activeProgress()[id]?.status)) ? "ready" : "locked";
  };

  const progressRows = ({ subjectId = null } = {}) => skillOrder.filter((skillId) => isSkillVisible(skillId) && (!subjectId || skillsById[skillId]?.subjectId === subjectId)).map((skillId) => {
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
    const latestCurriculumUpdate = state.curricula.map((item) => item.updatedAt).filter(Boolean).sort().at(-1) ?? null;
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
    } else if (latestCurriculumUpdate !== state.backup.curriculumUpdatedAtAtExport) {
      recommended = true;
      reason = "A curriculum changed since the last portable backup.";
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
    const visible = visibleSkillIds();
    const visibleSubjects = catalog.subjects.filter((subject) => catalog.skills.some((skill) => visible.has(skill.id) && skill.subjectId === subject.id));
    const curriculumWorkspace = activeCurriculum();
    const counts = Object.fromEntries(["locked", "ready", "learning", "proven", "mastered", "rusty"].map((key) => [key, rows.filter((row) => row.status === key).length]));
    const suggested = rows.find((row) => row.status === "rusty")
      ?? rows.find((row) => row.status === "learning")
      ?? rows.find((row) => row.status === "ready")
      ?? null;
    return {
      version: state.version,
      activeProfile: clone(activeProfile()),
      activeCurriculum: clone(curriculumWorkspace),
      curricula: clone(curriculaForProfile().map((item) => ({
        id: item.id, name: item.name, description: item.description, ownerProfileId: item.ownerProfileId,
        enabledPackIds: [...item.enabledPackIds], includeNativeLessons: item.includeNativeLessons !== false, settings: item.settings, createdAt: item.createdAt, updatedAt: item.updatedAt,
      }))),
      curriculumPlan: clone(assignedCurriculumPlan()),
      activeSubject: clone(visibleSubjects.find((subject) => subject.id === activeSubjectId()) ?? visibleSubjects[0] ?? catalog.subjects[0]),
      subjects: clone(visibleSubjects),
      progressionMode: effectiveProgressionMode(),
      mapScope: "all",
      profiles: clone(state.profiles),
      progressRows: clone(rows),
      allProgressRows: clone(allRows),
      progressCounts: counts,
      suggested: clone(suggested),
      attempts: clone(profileAttempts().slice().reverse()),
      reviews: clone(state.reviews.filter((review) => review.profileId === state.activeProfileId).slice().reverse()),
      mapPlan: clone(activeMapPlan()),
      ui: clone(state.ui),
      timers: timers(),
      activity: clone(state.activity.filter((item) => item.profileId === state.activeProfileId && item.actor === "agent")),
      storageError,
      backupStatus: backupStatus(),
      stagedLessonPack: state.stagedLessonPacks[0] ? {
        id: state.stagedLessonPacks[0].pack.id,
        name: state.stagedLessonPacks[0].pack.name,
        mode: state.stagedLessonPacks[0].pack.mode,
        author: state.stagedLessonPacks[0].pack.author,
        version: state.stagedLessonPacks[0].pack.version,
        subjectId: state.stagedLessonPacks[0].pack.subject.id,
        subjectName: state.stagedLessonPacks[0].pack.subject.name,
        skillCount: state.stagedLessonPacks[0].pack.skills.length,
        problemCount: state.stagedLessonPacks[0].pack.skills.reduce((count, skill) => count + skill.problems.length, 0),
        batchIndex: state.stagedLessonPacks[0].batchIndex,
        batchTotal: state.stagedLessonPacks[0].batchTotal,
        queueRemaining: Math.max(0, state.stagedLessonPacks.length - 1),
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
        enabledForCurriculum: curriculumWorkspace ? pack.mode === "override" || curriculumWorkspace.enabledPackIds.includes(pack.id) : true,
      })),
      selectedSkill: clone(skillsById[state.ui.selectedSkillId] ?? skillsById[skillOrder[0]]),
      selectedMapSkill: clone(skillsById[state.ui.selectedMapSkillId] ?? skillsById[skillOrder[0]]),
      activeTest: clone(state.drafts[state.activeProfileId]?.[state.ui.selectedSkillId] ?? null),
      pendingResults: clone(state.ui.pendingResults),
      curriculum: {
        track: clone({ ...catalog.track, skills: catalog.track.skills.filter((id) => visible.has(id)), entry_skills: catalog.track.entry_skills.filter((id) => visible.has(id)), exit_skills: catalog.track.exit_skills.filter((id) => visible.has(id)) }),
        subjects: clone(visibleSubjects),
        lessonPacks: state.lessonPacks.filter((pack) => pack.mode === "override" || !curriculumWorkspace || curriculumWorkspace.enabledPackIds.includes(pack.id)).map((pack) => ({ id: pack.id, name: pack.name, mode: pack.mode, skill_ids: [...pack.track.skills] })),
        skills: catalog.skills.filter((skill) => visible.has(skill.id) && skill.subjectId === activeSubjectId()).map((skill) => ({
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
        allSkills: catalog.skills.filter((skill) => visible.has(skill.id)).map((skill) => ({
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

  const buildCurriculum = ({ name, description = "", ownerProfileId = null, enabledPackIds = [], includeNativeLessons = true, settings = {}, sourceUrl = null } = {}) => ({
    id: makeId("curriculum").toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
    name: cleanText(name, 100) || "Untitled curriculum",
    description: cleanText(description, 1000),
    ownerProfileId,
    enabledPackIds: [...new Set(enabledPackIds.filter((packId) => state.lessonPacks.some((pack) => pack.id === packId && pack.mode !== "override")))].slice(0, MAX_LESSON_SETS),
    includeNativeLessons: includeNativeLessons !== false,
    settings: sanitizeCurriculumSettings(settings),
    mapPlan: emptyMapPlan(),
    createdAt: isoNow(),
    updatedAt: isoNow(),
    sourceUrl: cleanText(sourceUrl, 1000) || null,
  });

  const selectProfile = (profileId) => {
    if (!state.profiles.some((profile) => profile.id === profileId)) throw new Error("Profile not found.");
    heartbeat(true);
    state.activeProfileId = profileId;
    state.progress[profileId] ??= {};
    state.drafts[profileId] ??= {};
    state.mapPlans[profileId] ??= emptyMapPlan();
    const profile = activeProfile();
    if (profile?.role === "educator" && !state.curricula.some((item) => item.id === profile.activeCurriculumId && item.ownerProfileId === profile.id)) {
      profile.activeCurriculumId = state.curricula.find((item) => item.ownerProfileId === profile.id)?.id ?? null;
    }
    const subjectId = activeProfile()?.activeSubjectId ?? DEFAULT_SUBJECT_ID;
    const firstSkill = skillOrder.find((id) => isSkillVisible(id) && skillsById[id]?.subjectId === subjectId) ?? skillOrder.find((id) => isSkillVisible(id));
    if (firstSkill && skillsById[state.ui.selectedSkillId]?.subjectId !== subjectId) {
      state.ui.selectedSkillId = firstSkill;
      state.ui.selectedMapSkillId = firstSkill;
    }
    state.ui.route = profile?.role === "educator" ? "curriculum" : profile?.tutorialCompletedAt ? "home" : "tutorial";
    state.ui.mapPlanMode = profile?.role === "educator";
    state.ui.mapPlanView = true;
    state.ui.mapPlanShowHidden = false;
    state.ui.tutorialStep = 0;
    state.ui.pendingResults = null;
    state.ui.mapPlanSelection = [];
    state.ui.selectedMapPlanPathId = null;
    state.ui.mapPlanComposer = null;
    startSession(profileId);
    addActivity("select_profile", `Opened a ${profile?.role === "educator" ? "curriculum educator" : "learner"} profile.`);
    notify();
  };

  const createProfile = (displayName, { demo = false, role = "learner", curriculumId = null } = {}) => {
    const name = cleanText(displayName, 60);
    if (name.length < 2) throw new Error("Profile name must contain at least 2 characters.");
    const safeRole = role === "educator" ? "educator" : "learner";
    if (state.profiles.length >= MAX_PROFILES) throw new Error(`QuickMaths supports at most ${MAX_PROFILES} profiles.`);
    if (safeRole === "educator" && state.curricula.length >= MAX_CURRICULA) throw new Error(`QuickMaths supports at most ${MAX_CURRICULA} curricula.`);
    const profile = {
      id: makeId("profile"), displayName: name, createdAt: isoNow(), totalLoggedSeconds: 0, demo,
      role: safeRole, curriculumId: safeRole === "learner" && state.curricula.some((item) => item.id === curriculumId) ? curriculumId : null,
      activeCurriculumId: null,
      activeSubjectId: DEFAULT_SUBJECT_ID, progressionMode: "hard", mapScope: "all", tutorialCompletedAt: safeRole === "educator" ? isoNow() : null, tutorialSkipped: false,
      agentActivityAt: null,
      educatorGuideSeenAt: null,
    };
    state.profiles.push(profile);
    state.progress[profile.id] = {};
    state.drafts[profile.id] = {};
    const assignedCurriculum = safeRole === "learner" ? state.curricula.find((item) => item.id === profile.curriculumId) : null;
    state.mapPlans[profile.id] = assignedCurriculum ? clone(assignedCurriculum.mapPlan) : emptyMapPlan();
    if (safeRole === "educator") {
      const workspace = buildCurriculum({ name: `${name}'s curriculum`, ownerProfileId: profile.id });
      state.curricula.push(workspace);
      profile.activeCurriculumId = workspace.id;
    }
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
    addActivity("create_profile", `Created ${safeRole} profile ${name}.`, profile.id);
    selectProfile(profile.id);
    return clone(profile);
  };

  const resetProfileUi = () => {
    state.activeProfileId = null;
    state.session = null;
    state.ui.route = "welcome";
    state.ui.pendingResults = null;
    state.ui.activeAttemptId = null;
    state.ui.mapPlanMode = false;
    state.ui.mapPlanView = true;
    state.ui.mapPlanShowHidden = false;
    state.ui.mapPlanSelection = [];
    state.ui.selectedMapPlanPathId = null;
    state.ui.mapPlanComposer = null;
  };

  const deleteProfile = (profileId) => {
    const profile = state.profiles.find((item) => item.id === profileId);
    if (!profile) throw new Error("Profile not found.");
    const deletedCurriculumIds = new Set(state.curricula
      .filter((item) => item.ownerProfileId === profile.id)
      .map((item) => item.id));
    state.profiles = state.profiles.filter((item) => item.id !== profile.id);
    state.curricula = state.curricula.filter((item) => !deletedCurriculumIds.has(item.id));
    for (const remaining of state.profiles) {
      if (deletedCurriculumIds.has(remaining.curriculumId)) remaining.curriculumId = null;
      if (deletedCurriculumIds.has(remaining.activeCurriculumId)) remaining.activeCurriculumId = null;
    }
    delete state.progress[profile.id];
    delete state.drafts[profile.id];
    delete state.mapPlans[profile.id];
    state.attempts = state.attempts.filter((attempt) => attempt.profileId !== profile.id);
    for (const attempt of state.attempts) {
      if (deletedCurriculumIds.has(attempt.curriculumId)) attempt.curriculumId = null;
    }
    state.reviews = state.reviews.filter((review) => review.profileId !== profile.id);
    state.activity = state.activity.filter((item) => item.profileId !== profile.id);
    visibleSkillCache = null;
    if (state.activeProfileId === profile.id) resetProfileUi();
    notify();
    return {
      ok: true,
      profileId: profile.id,
      displayName: profile.displayName,
      deletedCurriculumCount: deletedCurriculumIds.size,
      remainingProfiles: state.profiles.length,
    };
  };

  const clearAllData = () => {
    const removed = {
      profiles: state.profiles.length,
      curricula: state.curricula.length,
      lessonPacks: state.lessonPacks.length,
      attempts: state.attempts.length,
      reviews: state.reviews.length,
    };
    state = initialState();
    storageError = null;
    rebuildCatalog();
    try { storage?.removeItem?.(LEGACY_STORAGE_KEY); } catch { /* The current empty state still prevents legacy migration. */ }
    notify();
    return { ok: true, removed };
  };

  const logout = () => {
    heartbeat(true);
    state.activeProfileId = null;
    state.session = null;
    state.ui.route = "welcome";
    state.ui.pendingResults = null;
    state.ui.mapPlanMode = false;
    state.ui.mapPlanView = true;
    state.ui.mapPlanShowHidden = false;
    state.ui.mapPlanSelection = [];
    state.ui.selectedMapPlanPathId = null;
    state.ui.mapPlanComposer = null;
    addActivity("logout_profile", "Returned to the profile picker.");
    notify();
  };

  const navigate = (route, skillId = null, { activityActor = "learner" } = {}) => {
    if (!ROUTES.has(route) || route === "welcome") throw new Error("Unknown app view.");
    const profile = activeProfile();
    if (!profile) throw new Error("Select a profile first.");
    const requestedRoute = route === "data" ? "settings" : route;
    const visibleRoute = profile.role === "educator"
      ? requestedRoute === "map" ? "curriculum" : requestedRoute
      : requestedRoute === "curriculum" ? "map" : requestedRoute;
    if (profile.role === "educator" && ["lesson", "test", "results", "tutorial"].includes(visibleRoute)) {
      throw new Error("Educator profiles use Curriculum designer rather than learner lessons and tests.");
    }
    if (skillId) {
      if (!skillsById[skillId] || !isSkillVisible(skillId)) throw new Error("Unknown or disabled skill_id.");
      state.ui.selectedSkillId = skillId;
      state.ui.selectedMapSkillId = skillId;
      if (profile.role === "learner" && ["lesson", "test"].includes(visibleRoute)) profile.activeSubjectId = skillsById[skillId].subjectId;
    }
    if (!skillId && profile.role === "learner" && ["lesson", "test"].includes(visibleRoute)) {
      const studySkill = skillsById[state.ui.selectedSkillId];
      if (studySkill && isSkillVisible(studySkill.id)) profile.activeSubjectId = studySkill.subjectId;
    }
    if (visibleRoute === "results") {
      const attempt = skillId
        ? [...profileAttempts()].reverse().find((item) => item.skillId === skillId) ?? null
        : getAttempt() ?? profileAttempts().at(-1) ?? null;
      state.ui.activeAttemptId = attempt?.attemptId ?? null;
    }
    state.ui.route = visibleRoute;
    if (profile.role === "educator" && visibleRoute === "curriculum") state.ui.mapPlanMode = true;
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

  const completeEducatorWelcome = () => {
    const profile = activeProfile();
    if (!profile || profile.role !== "educator") throw new Error("Select an educator profile first.");
    profile.educatorGuideSeenAt = isoNow();
    addActivity("complete_educator_welcome", "Opened the educator workspace guide and dismissed setup.");
    notify();
    return { ok: true, completed_at: profile.educatorGuideSeenAt };
  };

  const selectMapSkill = (skillId) => {
    if (!skillsById[skillId] || !isSkillVisible(skillId)) throw new Error("Unknown or disabled skill_id.");
    if (state.ui.selectedMapSkillId === skillId && state.ui.selectedSkillId === skillId) return;
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

  const normalizeMapPlanSelection = (skillIds) => Array.isArray(skillIds)
    ? [...new Set(skillIds.filter((id) => skillsById[id]))].slice(0, 80)
    : [];

  const setMapPlanMode = (enabled, { activityActor = "learner" } = {}) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    state.ui.mapPlanMode = activeProfile().role === "educator" ? true : Boolean(enabled);
    if (!state.ui.mapPlanMode) {
      state.ui.mapPlanView = true;
      state.ui.mapPlanShowHidden = false;
      state.ui.selectedMapPlanPathId = null;
      state.ui.mapPlanComposer = null;
    }
    addActivity("set_map_plan_mode", `${state.ui.mapPlanMode ? "Opened" : "Closed"} Plan mode.`, undefined, activityActor);
    notify();
    return { ok: true, enabled: state.ui.mapPlanMode };
  };

  const setMapPlanView = (enabled) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    if (activeProfile().role === "educator") throw new Error("Educator Curriculum designer is always in editable Plan mode.");
    state.ui.mapPlanView = Boolean(enabled);
    state.ui.mapPlanShowHidden = false;
    state.ui.mapPlanSelection = [];
    state.ui.selectedMapPlanPathId = null;
    state.ui.mapPlanComposer = null;
    notify();
    return { ok: true, enabled: state.ui.mapPlanView };
  };

  const setMapPlanComposer = (composer = null) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    if (composer != null && !["annotation", "path", "manage"].includes(composer)) throw new Error("Unknown Plan mode card.");
    state.ui.mapPlanComposer = composer;
    notify();
    return { ok: true, composer };
  };

  const setMapPlanShowHidden = (visible) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    state.ui.mapPlanShowHidden = Boolean(visible) && activeMapPlan().hiddenSkillIds.length > 0;
    if (!state.ui.mapPlanShowHidden) {
      const hiddenIds = new Set(activeMapPlan().hiddenSkillIds);
      state.ui.mapPlanSelection = state.ui.mapPlanSelection.filter((id) => !hiddenIds.has(id));
    }
    notify();
    return { ok: true, visible: state.ui.mapPlanShowHidden };
  };

  const setMapPlanSelection = (skillIds, { selectedPathId = null } = {}) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    const plan = activeMapPlan();
    const selection = normalizeMapPlanSelection(skillIds);
    const pathId = cleanText(selectedPathId, 120) || null;
    state.ui.mapPlanSelection = selection;
    state.ui.selectedMapPlanPathId = pathId && plan.paths.some((path) => path.id === pathId) ? pathId : null;
    notify();
    return { ok: true, skillIds: [...selection], selectedPathId: state.ui.selectedMapPlanPathId };
  };

  const updateMapPlanLayout = ({ layoutKey, positions = {}, selectedSkillIds = state.ui.mapPlanSelection, activityActor = "learner" } = {}) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    if (layoutKey !== "all-subjects") throw new Error("The mastery map uses the all-subjects layout.");
    if (!positions || typeof positions !== "object" || Array.isArray(positions)) throw new Error("Plan positions must be an object.");
    const plan = activeMapPlan();
    plan.layouts[layoutKey] ??= {};
    for (const [skillId, position] of Object.entries(positions)) {
      if (!skillsById[skillId] || !position || typeof position !== "object" || Array.isArray(position)) continue;
      if (!Number.isFinite(Number(position.x)) || !Number.isFinite(Number(position.y))) continue;
      plan.layouts[layoutKey][skillId] = {
        x: Math.round(cleanNumber(Number(position.x), 0, -MAP_PLAN_COORDINATE_LIMIT, MAP_PLAN_COORDINATE_LIMIT) * 100) / 100,
        y: Math.round(cleanNumber(Number(position.y), 0, -MAP_PLAN_COORDINATE_LIMIT, MAP_PLAN_COORDINATE_LIMIT) * 100) / 100,
      };
    }
    state.ui.mapPlanSelection = normalizeMapPlanSelection(selectedSkillIds);
    state.ui.selectedMapPlanPathId = null;
    touchActiveCurriculum();
    addActivity("arrange_map_plan_nodes", `Moved ${Object.keys(positions).length} lesson${Object.keys(positions).length === 1 ? "" : "s"} in ${layoutKey}.`, undefined, activityActor);
    notify();
    return { ok: true, layoutKey, moved: Object.keys(positions).length, selectedSkillIds: [...state.ui.mapPlanSelection] };
  };

  const setMapPlanNodesHidden = (skillIds = state.ui.mapPlanSelection, hidden = true, { activityActor = "learner" } = {}) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    const targets = normalizeMapPlanSelection(skillIds);
    if (!targets.length) throw new Error(`Select at least one lesson to ${hidden ? "hide" : "unhide"}.`);
    const plan = activeMapPlan();
    const hiddenIds = new Set(plan.hiddenSkillIds ?? []);
    for (const skillId of targets) {
      if (hidden) hiddenIds.add(skillId);
      else hiddenIds.delete(skillId);
    }
    plan.hiddenSkillIds = [...hiddenIds].filter((id) => skillsById[id]).slice(0, 80);
    if (hidden) state.ui.mapPlanSelection = state.ui.mapPlanSelection.filter((id) => !hiddenIds.has(id));
    if (!plan.hiddenSkillIds.length) state.ui.mapPlanShowHidden = false;
    touchActiveCurriculum();
    addActivity("set_map_plan_nodes_hidden", `${hidden ? "Hid" : "Unhid"} ${targets.length} lesson${targets.length === 1 ? "" : "s"} in the saved plan.`, undefined, activityActor);
    notify();
    return { ok: true, hidden: Boolean(hidden), skillIds: targets, hiddenSkillIds: [...plan.hiddenSkillIds] };
  };

  const resetMapPlanLayout = (layoutKey, skillIds = null) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    if (layoutKey !== "all-subjects") throw new Error("The mastery map uses the all-subjects layout.");
    const plan = activeMapPlan();
    if (!plan.layouts[layoutKey]) return { ok: true, reset: 0 };
    const targets = skillIds == null ? null : normalizeMapPlanSelection(skillIds);
    const reset = targets == null ? Object.keys(plan.layouts[layoutKey]).length : targets.filter((id) => plan.layouts[layoutKey][id]).length;
    if (targets == null) delete plan.layouts[layoutKey];
    else {
      for (const skillId of targets) delete plan.layouts[layoutKey][skillId];
      if (!Object.keys(plan.layouts[layoutKey]).length) delete plan.layouts[layoutKey];
    }
    touchActiveCurriculum();
    notify();
    return { ok: true, reset };
  };

  const createMapPlanPath = ({ name = "", color = "#df755b", skillIds = state.ui.mapPlanSelection, activityActor = "learner" } = {}) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    const plan = activeMapPlan();
    if (plan.paths.length >= MAX_MAP_PLAN_PATHS) throw new Error(`A learning plan can contain at most ${MAX_MAP_PLAN_PATHS} paths.`);
    const pathSkillIds = normalizeMapPlanSelection(skillIds);
    if (pathSkillIds.length < 2) throw new Error("Select at least two lessons to create a path.");
    if (!HEX_COLOR.test(color)) throw new Error("Choose a valid path color.");
    const path = {
      id: makeId("plan-path"),
      name: cleanText(name, 80) || `Path ${plan.paths.length + 1}`,
      color: color.toLowerCase(),
      skillIds: pathSkillIds,
      createdAt: isoNow(),
      updatedAt: isoNow(),
    };
    plan.paths.push(path);
    touchActiveCurriculum();
    state.ui.mapPlanSelection = [...pathSkillIds];
    state.ui.selectedMapPlanPathId = path.id;
    addActivity("create_map_plan_path", `Created ${path.name} with ${path.skillIds.length} lessons.`, undefined, activityActor);
    notify();
    return clone(path);
  };

  const updateMapPlanPath = (pathId, { name = null, color = null } = {}) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    const path = activeMapPlan().paths.find((item) => item.id === pathId);
    if (!path) throw new Error("Plan path not found.");
    if (name != null) path.name = cleanText(name, 80) || path.name;
    if (color != null) {
      if (!HEX_COLOR.test(color)) throw new Error("Choose a valid path color.");
      path.color = color.toLowerCase();
    }
    path.updatedAt = isoNow();
    touchActiveCurriculum();
    notify();
    return clone(path);
  };

  const selectMapPlanPath = (pathId) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    const path = activeMapPlan().paths.find((item) => item.id === pathId);
    if (!path) throw new Error("Plan path not found.");
    state.ui.selectedMapPlanPathId = path.id;
    state.ui.mapPlanSelection = [...path.skillIds];
    notify();
    return clone(path);
  };

  const deleteMapPlanPath = (pathId) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    const plan = activeMapPlan();
    const index = plan.paths.findIndex((item) => item.id === pathId);
    if (index < 0) throw new Error("Plan path not found.");
    const [removed] = plan.paths.splice(index, 1);
    touchActiveCurriculum();
    if (state.ui.selectedMapPlanPathId === pathId) state.ui.selectedMapPlanPathId = null;
    addActivity("delete_map_plan_path", `Removed ${removed.name}.`);
    notify();
    return { ok: true, id: pathId };
  };

  const addMapPlanAnnotation = ({ body, pathId = null, skillIds = state.ui.mapPlanSelection, layoutKey = null, position = null, activityActor = "learner" } = {}) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    const plan = activeMapPlan();
    if (plan.annotations.length >= MAX_MAP_PLAN_ANNOTATIONS) throw new Error(`A learning plan can contain at most ${MAX_MAP_PLAN_ANNOTATIONS} annotations.`);
    const safeBody = cleanText(body, 1200);
    if (!safeBody) throw new Error("Write an annotation first.");
    const safePathId = cleanText(pathId, 120) || null;
    if (safePathId) throw new Error("Path annotations are not supported. Attach the comment to selected lessons instead.");
    const targetSkillIds = normalizeMapPlanSelection(skillIds);
    const safeLayoutKey = layoutKey === "all-subjects" ? layoutKey : null;
    const safePosition = safeLayoutKey && position && typeof position === "object" && !Array.isArray(position)
      && Number.isFinite(Number(position.x)) && Number.isFinite(Number(position.y))
      ? {
        x: Math.round(cleanNumber(Number(position.x), 0, -MAP_PLAN_COORDINATE_LIMIT, MAP_PLAN_COORDINATE_LIMIT) * 100) / 100,
        y: Math.round(cleanNumber(Number(position.y), 0, -MAP_PLAN_COORDINATE_LIMIT, MAP_PLAN_COORDINATE_LIMIT) * 100) / 100,
      }
      : null;
    if (!targetSkillIds.length && !safePosition) throw new Error("Place the free annotation on a mastery-map layout.");
    const annotation = {
      id: makeId("plan-note"),
      targetType: targetSkillIds.length === 1 ? "node" : targetSkillIds.length > 1 ? "nodes" : "free",
      skillIds: targetSkillIds,
      positions: safePosition ? { [safeLayoutKey]: safePosition } : {},
      body: safeBody,
      createdAt: isoNow(),
      updatedAt: isoNow(),
    };
    plan.annotations.push(annotation);
    touchActiveCurriculum();
    addActivity("add_map_plan_annotation", `Added a note to ${targetSkillIds.length ? `${targetSkillIds.length} selected lesson${targetSkillIds.length === 1 ? "" : "s"}` : "the mastery map"}.`, undefined, activityActor);
    notify();
    return clone(annotation);
  };

  const updateMapPlanAnnotationPosition = (annotationId, { layoutKey, position } = {}) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    if (layoutKey !== "all-subjects") throw new Error("The mastery map uses the all-subjects layout.");
    if (!position || typeof position !== "object" || Array.isArray(position)
      || !Number.isFinite(Number(position.x)) || !Number.isFinite(Number(position.y))) throw new Error("Choose a valid annotation position.");
    const annotation = activeMapPlan().annotations.find((item) => item.id === annotationId);
    if (!annotation) throw new Error("Plan annotation not found.");
    annotation.positions ??= {};
    annotation.positions[layoutKey] = {
      x: Math.round(cleanNumber(Number(position.x), 0, -MAP_PLAN_COORDINATE_LIMIT, MAP_PLAN_COORDINATE_LIMIT) * 100) / 100,
      y: Math.round(cleanNumber(Number(position.y), 0, -MAP_PLAN_COORDINATE_LIMIT, MAP_PLAN_COORDINATE_LIMIT) * 100) / 100,
    };
    annotation.updatedAt = isoNow();
    touchActiveCurriculum();
    notify();
    return clone(annotation);
  };

  const deleteMapPlanAnnotation = (annotationId) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    const plan = activeMapPlan();
    const index = plan.annotations.findIndex((annotation) => annotation.id === annotationId);
    if (index < 0) throw new Error("Plan annotation not found.");
    plan.annotations.splice(index, 1);
    touchActiveCurriculum();
    notify();
    return { ok: true, id: annotationId };
  };

  const setLearningPreferences = ({ subjectId = null, progressionMode = null, mapScope = null, activityActor = "learner" } = {}) => {
    const profile = activeProfile();
    if (!profile) throw new Error("Select a profile first.");
    let mapContextChanged = false;
    if (subjectId != null) {
      if (!catalog.subjects.some((subject) => subject.id === subjectId && subject.skillIds.some((id) => isSkillVisible(id)))) throw new Error("Unknown or disabled subject_id.");
      mapContextChanged ||= profile.activeSubjectId !== subjectId;
      profile.activeSubjectId = subjectId;
      const firstSkill = skillOrder.find((id) => isSkillVisible(id) && skillsById[id]?.subjectId === subjectId);
      if (firstSkill && skillsById[state.ui.selectedSkillId]?.subjectId !== subjectId) {
        state.ui.selectedSkillId = firstSkill;
        state.ui.selectedMapSkillId = firstSkill;
      }
    }
    if (progressionMode != null) {
      if (!["hard", "soft"].includes(progressionMode)) throw new Error("progression_mode must be hard or soft.");
      if (activeCurriculum()) throw new Error("Progression mode is controlled by the active curriculum.");
      profile.progressionMode = progressionMode;
    }
    if (mapScope != null && mapScope !== "all") throw new Error("The mastery map always shows all installed subjects; map_scope must be all.");
    profile.mapScope = "all";
    if (mapContextChanged) {
      state.ui.mapPlanSelection = [];
      state.ui.selectedMapPlanPathId = null;
      state.ui.mapPlanComposer = null;
    }
    addActivity("set_learning_preferences", `Using ${effectiveProgressionMode()} progression; the mastery map shows all installed subjects.`, undefined, activityActor);
    notify();
    return { ok: true, subject_id: profile.activeSubjectId, progression_mode: effectiveProgressionMode(), map_scope: profile.mapScope };
  };

  const parseCurriculumFile = (raw) => {
    let candidate = raw;
    if (typeof raw === "string") {
      if (utf8ByteLength(raw) > MAX_CURRICULUM_BYTES) throw new Error("Curriculum file is larger than 10 MB.");
      try { candidate = JSON.parse(raw); } catch { throw new Error("Curriculum file is not valid JSON."); }
    }
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Curriculum file is invalid.");
    if (candidate.format !== CURRICULUM_FORMAT) throw new Error(`Expected ${CURRICULUM_FORMAT} format.`);
    if (String(candidate.schema_version ?? candidate.schemaVersion) !== CURRICULUM_SCHEMA_VERSION) throw new Error(`Unsupported curriculum schema; expected ${CURRICULUM_SCHEMA_VERSION}.`);
    const embeddedCandidates = candidate.lesson_packs ?? candidate.lessonPacks ?? [];
    if (!Array.isArray(embeddedCandidates)) throw new Error("Curriculum lesson_packs must be a list.");
    const normalizedEmbedded = embeddedCandidates.length ? normalizeLessonPackCollection(embeddedCandidates, curriculum) : [];
    if (normalizedEmbedded.some((pack) => pack.mode === "override")) {
      throw new Error("Curriculum files cannot install browser-wide native lesson improvements. Review and install improvements separately in Lesson Studio.");
    }
    const newPacks = [];
    for (const pack of normalizedEmbedded) {
      const installed = state.lessonPacks.find((item) => item.id === pack.id);
      if (!installed) newPacks.push(pack);
      else if (canonicalLessonPack(installed) !== canonicalLessonPack(pack)) {
        throw new Error(`Installed lesson set ${pack.id} does not match the curriculum copy.`);
      }
    }
    if (state.lessonPacks.length + newPacks.length > MAX_LESSON_SETS) throw new Error(`QuickMaths supports at most ${MAX_LESSON_SETS} installed lesson sets and improvements.`);
    const combinedPacks = [...state.lessonPacks, ...newPacks];
    validateCatalogGraph(curriculum, combinedPacks);
    const combinedCatalog = mergeCurriculum(curriculum, combinedPacks);
    const combinedPackIds = new Set(combinedPacks.filter((pack) => pack.mode !== "override").map((pack) => pack.id));
    const embeddedPackIds = new Set(normalizedEmbedded.filter((pack) => pack.mode !== "override").map((pack) => pack.id));
    const rawEnabledPackIds = candidate.enabled_pack_ids ?? candidate.enabledPackIds;
    if (rawEnabledPackIds !== undefined && !Array.isArray(rawEnabledPackIds)) throw new Error("Curriculum enabled_pack_ids must be a list.");
    const requestedEnabledPackIds = rawEnabledPackIds ?? [...embeddedPackIds];
    if (requestedEnabledPackIds.some((id) => typeof id !== "string")) throw new Error("Curriculum enabled_pack_ids must contain lesson-set IDs.");
    const enabledPackIds = [...new Set(requestedEnabledPackIds)];
    const rawIncludeNative = candidate.include_native_lessons ?? candidate.includeNativeLessons;
    if (rawIncludeNative !== undefined && typeof rawIncludeNative !== "boolean") throw new Error("Curriculum include_native_lessons must be true or false.");
    const unknownEnabled = enabledPackIds.find((id) => !combinedPackIds.has(id));
    if (unknownEnabled) throw new Error(`Curriculum references unavailable lesson set ${unknownEnabled}.`);
    const unembeddedEnabled = enabledPackIds.find((id) => !embeddedPackIds.has(id));
    if (unembeddedEnabled) throw new Error(`Enabled lesson set ${unembeddedEnabled} must be embedded so the curriculum is reproducible on another device.`);
    const rawId = cleanText(candidate.id, 120).toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const desiredId = CURRICULUM_ID.test(rawId) ? rawId : makeId("curriculum").toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const skillIds = new Set(combinedCatalog.skills.map((skill) => skill.id));
    const subjectIds = new Set(combinedCatalog.subjects.map((subject) => subject.id));
    const plan = sanitizeMapPlans({ curriculum: candidate.map_plan ?? candidate.mapPlan ?? emptyMapPlan() }, new Set(["curriculum"]), skillIds, subjectIds).curriculum ?? emptyMapPlan();
    const parsedCurriculum = {
      id: desiredId,
      name: cleanText(candidate.name, 100) || "Imported curriculum",
      description: cleanText(candidate.description, 1000),
      ownerProfileId: null,
      enabledPackIds,
      includeNativeLessons: rawIncludeNative !== false,
      settings: validateExternalCurriculumSettings(candidate.settings ?? {}),
      mapPlan: plan,
      createdAt: cleanText(candidate.created_at ?? candidate.createdAt, 40) || isoNow(),
      updatedAt: isoNow(),
      sourceUrl: cleanText(candidate.source_url ?? candidate.sourceUrl, 1000) || null,
    };
    validateEnabledCurriculum(parsedCurriculum, enabledPackIds, {
      packs: combinedPacks,
      catalogView: combinedCatalog,
    });
    return {
      candidate,
      newPacks,
      curriculum: parsedCurriculum,
    };
  };

  const previewCurriculum = (raw) => {
    const parsed = parseCurriculumFile(raw);
    return {
      ok: true,
      id: parsed.curriculum.id,
      name: parsed.curriculum.name,
      description: parsed.curriculum.description,
      exportKind: parsed.candidate.export_kind === "private_assignment"
        ? "private_assignment"
        : "blueprint",
      enabledPackCount: parsed.curriculum.enabledPackIds.length,
      embeddedPackCount: (parsed.candidate.lesson_packs ?? parsed.candidate.lessonPacks ?? []).length,
      newPackCount: parsed.newPacks.length,
      settings: clone(parsed.curriculum.settings),
      educatorGuidance: parsed.curriculum.settings.agentInstructions,
      hasCustomAgentGuidance: Boolean(parsed.curriculum.settings.agentInstructions.trim()),
    };
  };

  const createCurriculum = ({ name = "", description = "" } = {}) => {
    const profile = activeProfile();
    if (profile?.role !== "educator") throw new Error("Select an educator profile first.");
    if (state.curricula.length >= MAX_CURRICULA) throw new Error(`QuickMaths supports at most ${MAX_CURRICULA} curricula.`);
    const workspace = buildCurriculum({ name, description, ownerProfileId: profile.id });
    state.curricula.push(workspace);
    profile.activeCurriculumId = workspace.id;
    profile.activeSubjectId = DEFAULT_SUBJECT_ID;
    state.ui.route = "curriculum";
    state.ui.mapPlanMode = true;
    addActivity("create_curriculum", `Created curriculum ${workspace.name}.`);
    notify();
    return clone(workspace);
  };

  const selectCurriculum = (curriculumId) => {
    const profile = activeProfile();
    if (profile?.role !== "educator") throw new Error("Select an educator profile first.");
    const workspace = state.curricula.find((item) => item.id === curriculumId && (!item.ownerProfileId || item.ownerProfileId === profile.id));
    if (!workspace) throw new Error("Curriculum not found for this educator.");
    if (!workspace.ownerProfileId) workspace.ownerProfileId = profile.id;
    profile.activeCurriculumId = workspace.id;
    const visible = validateEnabledCurriculum(workspace, workspace.enabledPackIds, { checkPlan: false });
    const firstSkill = skillOrder.find((id) => visible.has(id));
    if (firstSkill) {
      profile.activeSubjectId = skillsById[firstSkill].subjectId;
      state.ui.selectedSkillId = firstSkill;
      state.ui.selectedMapSkillId = firstSkill;
    }
    state.ui.route = "curriculum";
    state.ui.mapPlanMode = true;
    addActivity("select_curriculum", `Opened curriculum ${workspace.name}.`);
    notify();
    return clone(workspace);
  };

  const updateCurriculum = ({ name = null, description = null } = {}) => {
    const profile = activeProfile();
    const workspace = activeCurriculum();
    if (profile?.role !== "educator" || !workspace) throw new Error("Open a curriculum in an educator profile first.");
    if (name != null) workspace.name = cleanText(name, 100) || workspace.name;
    if (description != null) workspace.description = cleanText(description, 1000);
    workspace.updatedAt = isoNow();
    addActivity("update_curriculum", `Updated curriculum ${workspace.name}.`);
    notify();
    return clone(workspace);
  };

  const updateCurriculumSettings = (input = {}) => {
    const profile = activeProfile();
    const workspace = activeCurriculum();
    if (profile?.role !== "educator" || !workspace) throw new Error("Open a curriculum in an educator profile first.");
    workspace.settings = sanitizeCurriculumSettings({ ...workspace.settings, ...input });
    workspace.updatedAt = isoNow();
    addActivity("update_curriculum_settings", `Updated learner policy for ${workspace.name}.`);
    notify();
    return clone(workspace.settings);
  };

  const setCurriculumPackEnabled = (packId, enabled, { removePlanReferences = false } = {}) => {
    const profile = activeProfile();
    const workspace = activeCurriculum();
    if (profile?.role !== "educator" || !workspace) throw new Error("Open a curriculum in an educator profile first.");
    const pack = state.lessonPacks.find((item) => item.id === packId);
    if (!pack) throw new Error("Lesson set not found.");
    if (pack.mode === "override") throw new Error("Native lesson improvements apply to every curriculum while installed.");
    const ids = new Set(workspace.enabledPackIds);
    if (enabled) ids.add(packId); else ids.delete(packId);
    const visible = validateEnabledCurriculum(workspace, ids, { checkPlan: false });
    let removedPlanReferences = 0;
    try {
      validateEnabledCurriculum(workspace, ids);
    } catch (error) {
      if (error?.code !== "curriculum_plan_references" || !removePlanReferences) throw error;
      removedPlanReferences = removeHiddenPlanReferences(workspace, visible);
      validateEnabledCurriculum(workspace, ids);
    }
    workspace.enabledPackIds = [...ids].slice(0, MAX_LESSON_SETS);
    workspace.updatedAt = isoNow();
    const nextVisible = visibleSkillIds();
    if (!nextVisible.has(state.ui.selectedSkillId)) {
      const firstSkill = skillOrder.find((id) => nextVisible.has(id));
      if (firstSkill) {
        state.ui.selectedSkillId = firstSkill;
        state.ui.selectedMapSkillId = firstSkill;
        profile.activeSubjectId = skillsById[firstSkill].subjectId;
      }
    }
    addActivity("set_curriculum_pack", `${enabled ? "Enabled" : "Disabled"} ${pack.name} in ${workspace.name}.`);
    notify();
    return { ok: true, packId, enabled: Boolean(enabled), enabledPackIds: [...workspace.enabledPackIds], removedPlanReferences };
  };

  const setCurriculumNativeLessonsEnabled = (enabled, { removePlanReferences = false } = {}) => {
    const profile = activeProfile();
    const workspace = activeCurriculum();
    if (profile?.role !== "educator" || !workspace) throw new Error("Open a curriculum in an educator profile first.");
    const candidate = { ...workspace, includeNativeLessons: Boolean(enabled) };
    const visible = validateEnabledCurriculum(candidate, workspace.enabledPackIds, { checkPlan: false });
    let removedPlanReferences = 0;
    try {
      validateEnabledCurriculum(candidate, workspace.enabledPackIds);
    } catch (error) {
      if (error?.code !== "curriculum_plan_references" || !removePlanReferences) throw error;
      removedPlanReferences = removeHiddenPlanReferences(workspace, visible);
      validateEnabledCurriculum(candidate, workspace.enabledPackIds);
    }
    workspace.includeNativeLessons = Boolean(enabled);
    workspace.updatedAt = isoNow();
    visibleSkillCache = null;
    const firstSkill = skillOrder.find((id) => visible.has(id));
    if (firstSkill && !visible.has(state.ui.selectedSkillId)) {
      state.ui.selectedSkillId = firstSkill;
      state.ui.selectedMapSkillId = firstSkill;
      profile.activeSubjectId = skillsById[firstSkill].subjectId;
    }
    addActivity("set_curriculum_native_lessons", `${enabled ? "Included" : "Excluded"} native Mathematics in ${workspace.name}.`);
    notify();
    return { ok: true, enabled: Boolean(enabled), removedPlanReferences };
  };

  const normalizedLearnerName = (value) => cleanText(value, 60).normalize("NFKC").toLowerCase();
  const attachCurriculum = (curriculumId) => {
    const profile = activeProfile();
    if (!profile) throw new Error("Select a profile first.");
    if (profile.role === "educator") return selectCurriculum(curriculumId);
    const workspace = state.curricula.find((item) => item.id === curriculumId);
    if (!workspace) throw new Error("Curriculum not found.");
    const assignedName = workspace.settings.studentName;
    const reuseCurrentProfile = Boolean(assignedName)
      && normalizedLearnerName(assignedName) === normalizedLearnerName(profile.displayName);
    if (!reuseCurrentProfile) {
      if (state.profiles.length >= MAX_PROFILES) throw new Error(`QuickMaths needs a blank assignment profile, but this browser already has ${MAX_PROFILES} profiles.`);
      const assignmentName = assignedName.length >= 2
        ? assignedName
        : cleanText(`${profile.displayName} - ${workspace.name}`, 60);
      const created = createProfile(assignmentName, { curriculumId: workspace.id });
      state.mapPlans[created.id] = clone(workspace.mapPlan);
      addActivity("attach_curriculum", `Started ${workspace.name} from scratch in an independent assignment profile.`, created.id);
      notify();
      return { curriculum: clone(workspace), profile: clone(created), assignmentProfileCreated: true, reusedMastery: false };
    }
    profile.curriculumId = workspace.id;
    state.mapPlans[profile.id] = clone(workspace.mapPlan);
    const firstSkill = skillOrder.find((id) => isSkillVisible(id));
    if (firstSkill) {
      profile.activeSubjectId = skillsById[firstSkill].subjectId;
      state.ui.selectedSkillId = firstSkill;
      state.ui.selectedMapSkillId = firstSkill;
    }
    addActivity("load_curriculum", `Loaded curriculum ${workspace.name} for ${profile.displayName}.`);
    notify();
    return { curriculum: clone(workspace), profile: clone(profile), assignmentProfileCreated: false, reusedMastery: true };
  };

  const importCurriculum = (raw, { sourceUrl = null, attach = true } = {}) => {
    if (state.curricula.length >= MAX_CURRICULA) throw new Error(`QuickMaths supports at most ${MAX_CURRICULA} curricula.`);
    const parsed = parseCurriculumFile(raw);
    const importingForLearner = Boolean(attach && activeProfile()?.role === "learner");
    const learnerNameMatches = importingForLearner
      && Boolean(parsed.curriculum.settings.studentName)
      && normalizedLearnerName(parsed.curriculum.settings.studentName) === normalizedLearnerName(activeProfile().displayName);
    if (importingForLearner && !learnerNameMatches && state.profiles.length >= MAX_PROFILES) {
      throw new Error(`QuickMaths needs a blank assignment profile, but this browser already has ${MAX_PROFILES} profiles.`);
    }
    if (state.curricula.some((item) => item.id === parsed.curriculum.id)) parsed.curriculum.id = makeId("curriculum").toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    parsed.curriculum.sourceUrl = cleanText(sourceUrl, 1000) || parsed.curriculum.sourceUrl;
    if (activeProfile()?.role === "educator") parsed.curriculum.ownerProfileId = state.activeProfileId;
    state.lessonPacks.push(...parsed.newPacks);
    state.curricula.push(parsed.curriculum);
    rebuildCatalog();
    let attachment = null;
    if (attach && activeProfile()) attachment = attachCurriculum(parsed.curriculum.id);
    addActivity("import_curriculum", `Imported curriculum ${parsed.curriculum.name}${parsed.newPacks.length ? ` with ${parsed.newPacks.length} lesson set${parsed.newPacks.length === 1 ? "" : "s"}` : ""}.`);
    notify();
    return {
      ok: true,
      id: parsed.curriculum.id,
      name: parsed.curriculum.name,
      newPackCount: parsed.newPacks.length,
      attached: Boolean(attachment),
      assignmentProfileCreated: Boolean(attachment?.assignmentProfileCreated),
      reusedMastery: Boolean(attachment?.reusedMastery),
      profile: attachment?.profile ?? null,
    };
  };

  const exportCurriculum = (curriculumId = activeCurriculum()?.id, { kind = "blueprint" } = {}) => {
    if (!["blueprint", "private_assignment"].includes(kind)) throw new Error("Curriculum export kind must be blueprint or private_assignment.");
    const workspace = curriculaForProfile().find((item) => item.id === curriculumId);
    if (!workspace) throw new Error("Curriculum not found.");
    const improvements = state.lessonPacks.filter((pack) => pack.mode === "override");
    if (improvements.length) throw new Error(`Restore installed native improvement${improvements.length === 1 ? "" : "s"} before exporting. Curriculum files cannot silently install browser-wide native changes.`);
    validateEnabledCurriculum(workspace, workspace.enabledPackIds);
    const packs = state.lessonPacks.filter((pack) => pack.mode !== "override" && workspace.enabledPackIds.includes(pack.id));
    const settings = kind === "private_assignment"
      ? clone(workspace.settings)
      : { agentEnabled: workspace.settings.agentEnabled, progressionMode: workspace.settings.progressionMode };
    const output = JSON.stringify({
      format: CURRICULUM_FORMAT,
      schema_version: CURRICULUM_SCHEMA_VERSION,
      export_kind: kind,
      id: workspace.id,
      name: workspace.name,
      description: workspace.description,
      created_at: workspace.createdAt,
      updated_at: workspace.updatedAt,
      enabled_pack_ids: [...workspace.enabledPackIds],
      include_native_lessons: workspace.includeNativeLessons !== false,
      settings,
      map_plan: clone(workspace.mapPlan),
      lesson_packs: clone(packs),
    }, null, 2);
    const bytes = typeof TextEncoder === "function" ? new TextEncoder().encode(output).length : output.length;
    if (bytes > MAX_CURRICULUM_BYTES) throw new Error("This curriculum is larger than 10 MB. Remove lesson packs or map annotations before exporting it.");
    return output;
  };

  const startTest = (skillId, { force = false, activityActor = "learner" } = {}) => {
    if (!activeProfile()) throw new Error("Select a profile first.");
    if (activeProfile().role === "educator") throw new Error("Educator profiles design curricula but do not take learner tests.");
    if (!skillsById[skillId] || !isSkillVisible(skillId)) throw new Error("Unknown or disabled skill_id.");
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
        responses: Object.fromEntries(problems.map((problem) => [problem.template_id, { finalAnswer: "", work: "", structuredWorkJson: null }])),
      };
    }
    state.ui.selectedSkillId = skillId;
    activeProfile().activeSubjectId = skillsById[skillId].subjectId;
    state.ui.activeAttemptId = null;
    state.ui.route = "test";
    addActivity("start_skill_test", `Prepared a mastery test for ${skillId}.`, undefined, activityActor);
    notify();
    return clone(state.drafts[profileId][skillId]);
  };

  const updateResponse = (questionId, { finalAnswer, work, structuredWorkJson = null }) => {
    const draft = state.drafts[state.activeProfileId]?.[state.ui.selectedSkillId];
    if (!draft || !draft.responses[questionId]) throw new Error("Question is not in the active test.");
    const problem = draft.problems.find((item) => item.template_id === questionId);
    const previous = draft.responses[questionId];
    const answerLimit = problem?.grading_method === "python_program" ? 12_000 : 300;
    if (typeof work === "string" && work.length > MAX_LONG_WORK_CHARS) throw new Error(`Shown work is limited to ${MAX_LONG_WORK_CHARS.toLocaleString()} characters.`);
    const safeAnswer = cleanText(finalAnswer, answerLimit);
    const nextStructured = sanitizeStructuredWork(structuredWorkJson) ?? {};
    if (previous?.structuredWorkJson?.python_source === safeAnswer && previous.structuredWorkJson.python_grade) {
      nextStructured.python_source = safeAnswer;
      nextStructured.python_grade = previous.structuredWorkJson.python_grade;
    }
    draft.responses[questionId] = { finalAnswer: safeAnswer, work: cleanText(work, MAX_LONG_WORK_CHARS), structuredWorkJson: Object.keys(nextStructured).length ? nextStructured : null };
    persist();
  };

  const recordPythonGrade = (questionId, source, candidate) => {
    const draft = state.drafts[state.activeProfileId]?.[state.ui.selectedSkillId];
    const problem = draft?.problems.find((item) => item.template_id === questionId);
    if (!draft || !draft.responses[questionId] || problem?.grading_method !== "python_program") throw new Error("Python question is not in the active test.");
    const safeSource = cleanText(source, 12_000);
    if (!safeSource || safeSource !== draft.responses[questionId].finalAnswer) throw new Error("The Python result does not match the current editor contents.");
    const grade = sanitizePythonGrade(candidate);
    if (!grade || grade.total !== problem.program_spec.tests.length) throw new Error("The Python sandbox returned an incomplete grade.");
    const structured = sanitizeStructuredWork(draft.responses[questionId].structuredWorkJson) ?? {};
    structured.python_source = safeSource;
    // Source and the bounded grade summary persist with progress. Captured stdout
    // is deliberately transient and never enters browser backups or GitHub sync.
    structured.python_grade = { ...grade, stdout: "" };
    draft.responses[questionId].structuredWorkJson = structured;
    persist();
    notify();
    return clone(structured.python_grade);
  };

  const submitTest = () => {
    const draft = state.drafts[state.activeProfileId]?.[state.ui.selectedSkillId];
    if (!draft) throw new Error("No active test.");
    const workIssues = draft.problems.map((problem) => ({
      questionId: problem.template_id,
      message: problem.grading_method === "python_program" && draft.responses[problem.template_id]?.structuredWorkJson?.python_grade?.status === "unavailable"
        ? "The local Python runtime is unavailable. Retry the sandbox before submitting; infrastructure failures are never graded as learner mistakes."
        : problem.grading_method === "python_program" && (
          draft.responses[problem.template_id]?.structuredWorkJson?.python_source !== draft.responses[problem.template_id]?.finalAnswer
          || !draft.responses[problem.template_id]?.structuredWorkJson?.python_grade
        )
          ? "Run the current Python code in the sandbox before submitting."
        : validateProceduralWork(problem, draft.responses[problem.template_id]?.work, draft.responses[problem.template_id]?.structuredWorkJson, draft.responses[problem.template_id]?.finalAnswer),
    })).filter((issue) => issue.message);
    if (workIssues.length) return { ok: false, missingWork: workIssues.map((issue) => issue.questionId), workIssues };
    const results = draft.problems.map((problem) => {
      const response = draft.responses[problem.template_id] ?? { finalAnswer: "", work: "" };
      const grade = gradeProblem(problem, response.finalAnswer, response.structuredWorkJson);
      return {
        questionId: problem.template_id,
        prompt: problem.prompt,
        finalAnswer: response.finalAnswer,
        work: response.work,
        structuredWorkJson: clone(response.structuredWorkJson),
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
        traceDiagnostics: problem.work?.mode === "code_trace_steps" ? gradeTraceTable(problem, response.structuredWorkJson).diagnostics : [],
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
    const prerequisitesMet = effectiveProgressionMode() === "soft" || skill.prerequisites.every((id) => PROVEN.has(activeProgress()[id]?.status));
    const mastery = hasPendingReview ? previous.masteryScore : updateMastery(previous.masteryScore, pending.percentScore, reflection);
    const passed = prerequisitesMet
      && pending.percentScore >= Number(skill.mastery.passing_score ?? 0.8)
      && reflection.confidenceRating >= Number(skill.mastery.minimum_confidence ?? 3)
      && reflection.guessed !== "yes";
    const status = hasPendingReview ? "learning" : passed ? (PROVEN.has(previous.status) ? "mastered" : "proven") : "learning";
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
      curriculumId: activeCurriculum()?.id ?? null,
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
      previousMasteryStatus: previous.status,
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
    const prerequisitesMet = effectiveProgressionMode() === "soft" || skill.prerequisites.every((id) => PROVEN.has(activeProgress()[id]?.status));
    const passed = verdict === "pass" && prerequisitesMet
      && attempt.percentScore >= Number(skill.mastery.passing_score ?? 0.8)
      && attempt.reflection.confidenceRating >= Number(skill.mastery.minimum_confidence ?? 3)
      && attempt.reflection.guessed !== "yes";
    // Revisions to one review must not count as additional passing attempts.
    const previouslyProven = PROVEN.has(attempt.previousMasteryStatus) || record.status === "mastered";
    record.status = passed ? (previouslyProven ? "mastered" : "proven") : "learning";
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
    const response = saved ? { finalAnswer: item.finalAnswer, work: item.work, structuredWorkJson: item.structuredWorkJson } : draft.responses[questionKey] ?? { finalAnswer: "", work: "", structuredWorkJson: null };
    const correct = saved ? item.correct : response.finalAnswer ? gradeProblem(item, response.finalAnswer, response.structuredWorkJson).correct : false;
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
      structured_work_json: clone(response.structuredWorkJson),
      work_lines: response.work.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
      final_answer_status: response.finalAnswer ? (correct ? "correct" : "incorrect") : "missing",
      work_status: response.work || response.structuredWorkJson ? (latest ? latest.verdict : ["rational_equation_steps", "sign_chart_steps"].includes(mode) ? "auto_checked" : "pending_review") : (saved ? item.workRequired : item.work_required) ? "missing" : "not_required",
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
        questions: draft.problems.map((problem) => ({
          question_id: problem.template_id,
          prompt: problem.prompt,
          prompt_blocks: clone(problem.prompt_blocks ?? []),
          difficulty: problem.difficulty,
          answer_mode: problem.answer_mode,
          work_mode: problem.work?.mode ?? "none",
          trace: problem.work?.mode === "code_trace_steps" ? {
            language: problem.work.trace_spec.language,
            display_code: problem.work.trace_spec.display_code,
            columns: clone(problem.work.trace_spec.columns),
            step_labels: problem.work.trace_spec.expected_rows.map((row) => row.step),
          } : null,
          programming: problem.grading_method === "python_program" ? {
            runtime: problem.program_spec.runtime,
            entrypoint: problem.program_spec.entrypoint,
            parameters: clone(problem.program_spec.parameters),
            return_type: problem.program_spec.return_type,
            example_tests: problem.program_spec.tests.filter((test) => test.visibility === "example").map((test) => ({ id: test.id, arguments: clone(test.arguments), expected_return: clone(test.expected_return) })),
          } : null,
        })),
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
      progression_mode: effectiveProgressionMode(),
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

  const parseLessonPackAgainst = (raw, workingPacks = state.lessonPacks) => {
    if (workingPacks.length >= MAX_LESSON_SETS) throw new Error(`QuickMaths supports at most ${MAX_LESSON_SETS} installed lesson sets and improvements.`);
    let candidate = raw;
    if (typeof raw === "string") {
      if (utf8ByteLength(raw) > MAX_LESSON_SET_BYTES) throw new Error("Lesson set is larger than 2 MB.");
      try { candidate = JSON.parse(raw); } catch { throw new Error("Lesson set is not valid JSON."); }
    }
    if (workingPacks.some((pack) => pack.id === candidate?.id)) throw new Error(`Lesson set ${candidate.id} is already installed or repeated in this batch.`);
    const workingCatalog = mergeCurriculum(curriculum, workingPacks);
    const pack = normalizeLessonPack(candidate, { knownSkillIds: workingCatalog.skills.map((skill) => skill.id), nativeSkills: curriculum.skills });
    validateCatalogGraph(curriculum, [...workingPacks, pack]);
    return pack;
  };

  const parseLessonPack = (raw) => parseLessonPackAgainst(raw, state.lessonPacks);

  const lessonPackPreview = (pack) => ({
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
    });

  const previewLessonPack = (raw) => lessonPackPreview(parseLessonPack(raw));

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
    if (activeProfile()?.role === "educator" && activeCurriculum() && pack.mode !== "override") {
      activeCurriculum().enabledPackIds = [...new Set([...activeCurriculum().enabledPackIds, pack.id])];
      activeCurriculum().updatedAt = isoNow();
    }
    if (activeProfile() && isSkillVisible(pack.track.skills[0])) {
      state.ui.selectedSkillId = pack.track.skills[0];
      state.ui.selectedMapSkillId = pack.track.skills[0];
    }
    addActivity("load_lesson_set", pack.mode === "override"
      ? `Installed ${pack.name}; ${pack.skills.length} native lesson${pack.skills.length === 1 ? "" : "s"} improved without resetting completed progress.${restartedDraftCount ? ` ${restartedDraftCount} unfinished test${restartedDraftCount === 1 ? " was" : "s were"} restarted.` : ""}`
      : `Installed ${pack.name} with ${pack.skills.length} skills.`);
    notify();
    return { ok: true, id: pack.id, name: pack.name, mode: pack.mode, subjectId: pack.subject.id, subjectName: pack.subject.name, skillCount: pack.skills.length, totalSkillCount: skillOrder.length, completedProgressPreserved: pack.mode === "override", restartedDraftCount };
  };

  const stageLessonPacks = (rawItems, { activityActor = "learner" } = {}) => {
    if (!Array.isArray(rawItems) || !rawItems.length) throw new Error("At least one lesson set is required for staging.");
    if (rawItems.length > 20) throw new Error("At most 20 lesson sets can be staged together.");
    if (state.stagedLessonPacks.length) throw new Error("A lesson set is already awaiting human review. Finish or skip the current queue before staging another batch.");
    const parsed = [];
    const workingPacks = [...state.lessonPacks];
    for (const raw of rawItems) {
      const serialized = typeof raw === "string" ? raw : JSON.stringify(raw);
      const pack = parseLessonPackAgainst(serialized, workingPacks);
      workingPacks.push(pack);
      parsed.push({ pack });
    }
    state.stagedLessonPacks = parsed.map((item, index) => ({ ...item, batchIndex: index + 1, batchTotal: parsed.length }));
    state.ui.route = "settings";
    addActivity("stage_custom_lesson_set", parsed.length === 1
      ? `Staged ${parsed[0].pack.name}; human confirmation is required to install it.`
      : `Staged ${parsed.length} lesson sets as an ordered review queue; each installation requires separate human confirmation.`, undefined, activityActor);
    notify();
    return {
      ok: true,
      status: "staged",
      staged_count: parsed.length,
      sequential_review: true,
      requires_human_confirmation: true,
      previews: parsed.map((item) => lessonPackPreview(item.pack)),
      preview: lessonPackPreview(parsed[0].pack),
    };
  };

  const stageLessonPack = (raw, options = {}) => stageLessonPacks([raw], options);

  const installStagedLessonPack = () => {
    if (!state.stagedLessonPacks.length) throw new Error("No lesson set is staged.");
    const staged = state.stagedLessonPacks.shift();
    try {
      const result = importLessonPack(staged.pack);
      return { ...result, reviewQueueRemaining: state.stagedLessonPacks.length, reviewQueueTotal: staged.batchTotal };
    } catch (error) {
      state.stagedLessonPacks.unshift(staged);
      throw error;
    }
  };

  const discardStagedLessonPack = () => {
    if (!state.stagedLessonPacks.length) return { ok: true, discarded: false, reviewQueueRemaining: 0 };
    const staged = state.stagedLessonPacks.shift();
    const name = staged.pack.name;
    addActivity("discard_staged_lesson_set", `Discarded staged lesson set ${name}.`);
    notify();
    return { ok: true, discarded: true, reviewQueueRemaining: state.stagedLessonPacks.length, reviewQueueTotal: staged.batchTotal };
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
    state.backup.curriculumUpdatedAtAtExport = state.curricula.map((item) => item.updatedAt).filter(Boolean).sort().at(-1) ?? null;
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
    if (typeof raw !== "string" || utf8ByteLength(raw) > MAX_CURRICULUM_BYTES) throw new Error("Backup file is invalid or too large.");
    let candidate;
    try { candidate = JSON.parse(raw); } catch { throw new Error("Backup file is not valid JSON."); }
    if (!candidate || typeof candidate !== "object") throw new Error("Backup file is invalid.");
    if (Array.isArray(candidate.profiles)) {
      if (candidate.profiles.length > MAX_PROFILES) throw new Error(`Backup contains more than ${MAX_PROFILES} profiles.`);
      const ids = candidate.profiles.map((profile) => cleanText(profile?.id, 100));
      if (ids.some((id) => !id || RESERVED_OBJECT_KEYS.has(id))) throw new Error("Backup contains an invalid or reserved profile ID.");
      if (new Set(ids).size !== ids.length) throw new Error("Backup contains duplicate profile IDs.");
    }
    if (Number(candidate.version) > APP_VERSION) throw new Error("This backup was created by a newer QuickMaths version.");
    const imported = sanitizeState(migrateBundledLessonPacks(candidate, migrationLessonPacks), curriculum, { strictPacks: true });
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
      curriculumCount: imported.curricula.length,
      curriculumNames: imported.curricula.map((item) => item.name),
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
      if (state.ui.route === "welcome") {
        const profile = state.profiles.find((item) => item.id === state.activeProfileId);
        state.ui.route = profile?.role === "educator" ? "curriculum" : profile?.tutorialCompletedAt ? "home" : "tutorial";
      }
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
      curriculumCount: state.curricula.length,
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
    deleteProfile,
    clearAllData,
    logout,
    navigate,
    startTutorial,
    setTutorialStep,
    completeTutorial,
    completeEducatorWelcome,
    selectMapSkill,
    setMapZoom,
    setMapPlanMode,
    setMapPlanView,
    setMapPlanShowHidden,
    setMapPlanComposer,
    setMapPlanSelection,
    updateMapPlanLayout,
    resetMapPlanLayout,
    setMapPlanNodesHidden,
    createMapPlanPath,
    updateMapPlanPath,
    selectMapPlanPath,
    deleteMapPlanPath,
    addMapPlanAnnotation,
    updateMapPlanAnnotationPosition,
    deleteMapPlanAnnotation,
    setLearningPreferences,
    createCurriculum,
    selectCurriculum,
    updateCurriculum,
    updateCurriculumSettings,
    setCurriculumPackEnabled,
    setCurriculumNativeLessonsEnabled,
    attachCurriculum,
    previewCurriculum,
    importCurriculum,
    exportCurriculum,
    startTest,
    updateResponse,
    submitTest,
    recordPythonGrade,
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
    stageLessonPacks,
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
    registerBundledLessonPacks(rawPacks = []) {
      if (!Array.isArray(rawPacks)) throw new Error("Bundled lesson migrations must be a list.");
      migrationLessonPacks = [...new Set([...migrationLessonPacks, ...rawPacks.filter((raw) => typeof raw === "string")])];
      return { ok: true, count: migrationLessonPacks.length };
    },
    importSyncState,
    exportCsv,
    heartbeat,
    replaceFromStorage,
    statusForSkill,
    skillsById,
    unlocks,
  };
}
