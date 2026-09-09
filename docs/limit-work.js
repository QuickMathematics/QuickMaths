const MAX_TEXT = 2000;
const FIELDS = new Set(["variable", "approach", "direction", "original_expression", "restrictions"]);
const DATA_FIELDS = new Set([...FIELDS, "steps", "result_kind", "result_value"]);
const KINDS = new Set(["finite", "positive_infinity", "negative_infinity", "no_common_limit"]);
const text = (value, name) => {
  if (typeof value !== "string" || !value.trim() || value.length > MAX_TEXT) throw new Error(`${name} must be non-empty text of at most ${MAX_TEXT} characters.`);
  return value.trim();
};
const keys = (value, allowed) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("limit work must be an object.");
  const unknown = Object.keys(value).find(key => !allowed.has(key));
  if (unknown) throw new Error(`unknown limit-work field "${unknown}".`);
};
const compact = value => value.replace(/\s+/g, "");

export function normalizeLimitSpec(value) {
  keys(value, FIELDS);
  if (!["left", "right", "both"].includes(value.direction)) throw new Error("limit direction must be left, right or both.");
  if (!Array.isArray(value.restrictions) || value.restrictions.length > 16) throw new Error("limit restrictions must be a list of at most 16 items.");
  return { variable: text(value.variable, "limit variable"), approach: text(value.approach, "limit approach"), direction: value.direction, original_expression: text(value.original_expression, "original expression"), restrictions: value.restrictions.map(item => text(item, "limit restriction")) };
}

function normalizeData(value = {}, { partial = false } = {}) {
  keys(value, DATA_FIELDS);
  const restrictions = value.restrictions ?? (partial ? [] : null);
  const steps = value.steps ?? (partial ? [] : null);
  if (!Array.isArray(restrictions) || restrictions.length > 16) throw new Error("limit restrictions must be a list of at most 16 items.");
  if (!Array.isArray(steps) || (!partial && steps.length < 1) || steps.length > 16) throw new Error("limit work needs 1 to 16 steps.");
  const clean = name => partial && (value[name] == null || value[name] === "") ? "" : text(value[name], name.replaceAll("_", " "));
  const cleanItems = (items, name) => items.map(item => partial && item === "" ? "" : text(item, name));
  const resultValue = partial && (value.result_value == null || value.result_value === "") ? "" : value.result_value;
  if (resultValue !== "" && (typeof resultValue !== "string" || resultValue.length > MAX_TEXT)) throw new Error("result value must be text of at most 2000 characters.");
  if (!partial && value.result_kind === "finite" && !resultValue.trim()) throw new Error("A finite limit needs a non-empty result value.");
  return { variable: clean("variable"), approach: clean("approach"), direction: value.direction ?? "", original_expression: clean("original_expression"), restrictions: cleanItems(restrictions, "limit restriction"), steps: cleanItems(steps, "limit step"), result_kind: value.result_kind ?? "", result_value: resultValue.trim() };
}

export function validateLimitWork(spec, data) {
  let authored, learner;
  try { authored = normalizeLimitSpec(spec); } catch (error) { return error.message; }
  try { learner = normalizeData(data); } catch (error) { return error.message; }
  for (const field of ["variable", "approach", "direction"]) if (learner[field] !== authored[field]) return `Limit ${field} must match the authored setup.`;
  if (compact(learner.original_expression) !== compact(authored.original_expression)) return "The original expression must match exactly modulo whitespace.";
  if (compact(learner.steps[0]) !== compact(authored.original_expression)) return "The first work step must restate the original expression before transformations.";
  const authoredRestrictions = new Set(authored.restrictions.map(compact));
  const learnerRestrictions = new Set(learner.restrictions.map(compact));
  for (const restriction of authoredRestrictions) if (!learnerRestrictions.has(restriction)) return "Every original restriction must be retained.";
  for (const restriction of learnerRestrictions) if (!authoredRestrictions.has(restriction)) return "Extra restrictions require tutor review.";
  if (!KINDS.has(learner.result_kind)) return "Result kind must be finite, positive_infinity, negative_infinity, or no_common_limit.";
  if (learner.result_kind === "finite" && !learner.result_value) return "A finite limit needs a non-empty result value.";
  return null;
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
export function renderLimitWork(spec, data) {
  const authored = normalizeLimitSpec(spec);
  const learner = normalizeData(data, { partial: true });
  const direction = value => `<option value="${value}" ${learner.direction === value ? "selected" : ""}>${value}</option>`;
  const resultKind = (value, label) => `<option value="${value}" ${learner.result_kind === value ? "selected" : ""}>${label}</option>`;
  const side = authored.direction === "both" ? "from both sides" : `from the ${authored.direction}`;
  return `<section class="structured-work-editor limit-work-review" aria-label="Limit work pending tutor review"><p class="eyebrow">Limit work · pending tutor review</p><p>For ${escapeHtml(authored.original_expression)}, ${escapeHtml(authored.variable)} approaches ${escapeHtml(authored.approach)}, ${escapeHtml(side)}. Record the original expression before any transformation.</p><label>Variable<input data-limit-work-field="variable" value="${escapeHtml(learner.variable)}"></label><label>Approach<input data-limit-work-field="approach" value="${escapeHtml(learner.approach)}"></label><label>Direction<select data-limit-work-field="direction">${direction("left")}${direction("right")}${direction("both")}</select></label><label>Original expression<textarea data-limit-work-field="original_expression" rows="2">${escapeHtml(learner.original_expression)}</textarea></label><label>Restrictions<textarea data-limit-work-field="restrictions" rows="2" placeholder="List every authored domain restriction">${escapeHtml(learner.restrictions.join("\n"))}</textarea></label><label>Steps<textarea data-limit-work-field="steps" rows="5" placeholder="One step per line">${escapeHtml(learner.steps.join("\n"))}</textarea></label><label>Result kind<select data-limit-work-field="result_kind"><option value=""></option>${resultKind("finite", "Finite value")}${resultKind("positive_infinity", "Positive infinity")}${resultKind("negative_infinity", "Negative infinity")}${resultKind("no_common_limit", "No common limit")}</select></label><label>Finite result (if applicable)<input data-limit-work-field="result_value" value="${escapeHtml(learner.result_value)}"></label><p>Transformations and hypotheses are awaiting tutor review; this is not an automated proof pass.</p></section>`;
}

export function collectLimitWork(card) {
  const read = field => card?.querySelector(`[data-limit-work-field="${field}"]`)?.value?.trim() ?? "";
  return { variable: read("variable"), approach: read("approach"), direction: read("direction"), original_expression: read("original_expression"), restrictions: read("restrictions").split(/[,;\n]+/).map(item => item.trim()).filter(Boolean), steps: read("steps").split(/\r?\n/).map(item => item.trim()).filter(Boolean), result_kind: read("result_kind"), result_value: read("result_value") };
}
