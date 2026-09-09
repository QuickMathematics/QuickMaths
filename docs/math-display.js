// Dependency-free, bounded declarative math display. The renderer emits text and
// small semantic HTML fragments only; authored values are never treated as markup.

export const MATH_DISPLAY_LIMITS = Object.freeze({
  blocks: 24,
  rows: 16,
  steps: 16,
  text: 4000,
  shortText: 500,
  totalText: 40_000,
});

const TYPES = new Set(["piecewise", "fraction", "limit", "derivation", "notation"]);
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);
const fail = message => { throw new Error(`Math display ${message}`); };

function exactKeys(value, allowed) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`contains unknown key "${key}".`);
}

function requiredText(value, name, limit = MATH_DISPLAY_LIMITS.text) {
  if (typeof value !== "string" || value.trim() === "" || value.length > limit) fail(`${name} must be non-empty text of at most ${limit} characters.`);
  return value.trim();
}

function boundedText(value, name, limit = MATH_DISPLAY_LIMITS.shortText) {
  return requiredText(value, name, limit);
}

function collectPlaceholders(value, names) {
  if (typeof value !== "string") return;
  let match;
  PLACEHOLDER.lastIndex = 0;
  while ((match = PLACEHOLDER.exec(value))) names.add(match[1]);
  // Non-placeholder braces can be literal set notation, e.g. {1, 2}.
}

function normalizeBlock(block, index) {
  if (!block || typeof block !== "object" || Array.isArray(block)) fail(`block ${index + 1} is invalid.`);
  exactKeys(block, new Set(["type", "alt", "linear_text", "rows", "numerator", "denominator", "variable", "to", "direction", "expression", "steps", "text"]));
  if (typeof block.type !== "string" || !TYPES.has(block.type)) fail(`block ${index + 1} has an unsupported type.`);
  const result = {
    type: block.type,
    alt: requiredText(block.alt, `block ${index + 1} alt`),
    linear_text: requiredText(block.linear_text, `block ${index + 1} linear_text`),
  };
  const common = new Set(["type", "alt", "linear_text"]);
  if (block.type === "piecewise") {
    exactKeys(block, new Set([...common, "rows"]));
    if (!Array.isArray(block.rows) || block.rows.length < 1 || block.rows.length > MATH_DISPLAY_LIMITS.rows) fail("piecewise rows are out of bounds.");
    result.rows = block.rows.map((row, rowIndex) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) fail(`piecewise row ${rowIndex + 1} is invalid.`);
      exactKeys(row, new Set(["expression", "condition"]));
      return {
        expression: boundedText(row.expression, `piecewise row ${rowIndex + 1} expression`),
        condition: boundedText(row.condition, `piecewise row ${rowIndex + 1} condition`),
      };
    });
  } else if (block.type === "fraction") {
    exactKeys(block, new Set([...common, "numerator", "denominator"]));
    result.numerator = boundedText(block.numerator, "fraction numerator");
    result.denominator = boundedText(block.denominator, "fraction denominator");
  } else if (block.type === "limit") {
    exactKeys(block, new Set([...common, "variable", "to", "direction", "expression"]));
    result.variable = boundedText(block.variable, "limit variable");
    result.to = boundedText(block.to, "limit endpoint");
    if (!["left", "right", "both"].includes(block.direction)) fail("limit direction must be left, right or both.");
    result.direction = block.direction;
    result.expression = boundedText(block.expression, "limit expression");
  } else if (block.type === "derivation") {
    exactKeys(block, new Set([...common, "steps"]));
    if (!Array.isArray(block.steps) || block.steps.length < 1 || block.steps.length > MATH_DISPLAY_LIMITS.steps) fail("derivation steps are out of bounds.");
    result.steps = block.steps.map((step, stepIndex) => requiredText(step, `derivation step ${stepIndex + 1}`, MATH_DISPLAY_LIMITS.text));
  } else {
    exactKeys(block, new Set([...common, "text"]));
    result.text = requiredText(block.text, "notation text");
  }
  return result;
}

function mapStrings(block, transform) {
  const result = structuredClone(block);
  for (const key of ["alt", "linear_text", "numerator", "denominator", "variable", "to", "expression", "text"]) if (result[key] != null) result[key] = transform(result[key]);
  if (result.rows) for (const row of result.rows) { row.expression = transform(row.expression); row.condition = transform(row.condition); }
  if (result.steps) result.steps = result.steps.map(transform);
  return result;
}

function substitute(value, publicValues) {
  return value.replace(PLACEHOLDER, (_, name) => {
    if (!Object.prototype.hasOwnProperty.call(publicValues, name)) fail(`references unknown variable "${name}".`);
    const replacement = publicValues[name];
    if (!(typeof replacement === "string" || (typeof replacement === "number" && Number.isFinite(replacement)))) fail(`variable "${name}" must resolve to finite numeric or text data.`);
    const text = String(replacement);
    if (text.length > MATH_DISPLAY_LIMITS.shortText || /[{}]/.test(text)) fail(`variable "${name}" resolves to invalid text.`);
    return text;
  });
}

export function normalizeMathBlocks(candidate = []) {
  if (!Array.isArray(candidate) || candidate.length > MATH_DISPLAY_LIMITS.blocks) fail(`supports at most ${MATH_DISPLAY_LIMITS.blocks} blocks.`);
  const blocks = candidate.map(normalizeBlock);
  const total = blocks.reduce((sum, block) => sum + JSON.stringify(block).length, 0);
  if (total > MATH_DISPLAY_LIMITS.totalText) fail(`content exceeds ${MATH_DISPLAY_LIMITS.totalText} characters.`);
  return blocks;
}

export function resolveMathBlocks(candidate, publicValues = {}) {
  if (!publicValues || typeof publicValues !== "object" || Array.isArray(publicValues)) fail("publicValues must be an object.");
  const blocks = normalizeMathBlocks(candidate);
  const names = new Set();
  for (const block of blocks) {
    for (const value of Object.values(block)) {
      if (Array.isArray(value)) for (const item of value) for (const nested of Object.values(item ?? {})) collectPlaceholders(nested, names);
      else collectPlaceholders(value, names);
    }
  }
  for (const name of names) if (!Object.prototype.hasOwnProperty.call(publicValues, name)) fail(`references unknown variable "${name}".`);
  return normalizeMathBlocks(blocks.map(block => mapStrings(block, value => substitute(value, publicValues))));
}

function renderBlock(block, index) {
  const label = `Math display ${index + 1}: ${block.alt}`;
  let content;
  if (block.type === "piecewise") content = `<div class="math-display__piecewise" role="img" tabindex="0" aria-label="${escapeHtml(label)}">${block.rows.map(row => `<div class="math-display__row"><span class="math-display__expression">${escapeHtml(row.expression)}</span><span class="math-display__condition">${escapeHtml(row.condition)}</span></div>`).join("")}</div>`;
  else if (block.type === "fraction") content = `<div class="math-display__fraction" role="img" tabindex="0" aria-label="${escapeHtml(label)}"><span>${escapeHtml(block.numerator)}</span><span>${escapeHtml(block.denominator)}</span></div>`;
  else if (block.type === "limit") content = `<div class="math-display__limit" role="img" tabindex="0" aria-label="${escapeHtml(label)}"><span>lim<sub>${escapeHtml(block.variable)} → ${escapeHtml(block.to)}${block.direction === "both" ? "" : block.direction === "left" ? "⁻" : "⁺"}</sub></span><span>${escapeHtml(block.expression)}</span></div>`;
  else if (block.type === "derivation") content = `<div class="math-display__derivation" role="img" tabindex="0" aria-label="${escapeHtml(label)}">${block.steps.map(step => `<div>${escapeHtml(step)}</div>`).join("")}</div>`;
  else content = `<div class="math-display__notation" role="img" tabindex="0" aria-label="${escapeHtml(label)}">${escapeHtml(block.text)}</div>`;
  return `<figure class="math-display math-display--${block.type}">${content}<figcaption>${escapeHtml(block.alt)}</figcaption><details class="math-display__linear" tabindex="0"><summary>Linear text</summary><pre>${escapeHtml(block.linear_text)}</pre></details></figure>`;
}

export function renderMathBlocks(candidate = []) {
  return normalizeMathBlocks(candidate).map(renderBlock).join("");
}
