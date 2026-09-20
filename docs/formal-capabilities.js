export const FORMAL_CAPABILITY_IDS = Object.freeze([
  "algebra",
  "limits",
  "derivatives",
  "sequences-series",
  "radicals",
]);

const statementText = (statement = {}) => [
  ...(Array.isArray(statement.declarations) ? statement.declarations : []),
  ...(Array.isArray(statement.assumptions) ? statement.assumptions : []),
  ...(statement.goal == null ? [] : [statement.goal]),
].filter((item) => typeof item === "string").join(" ").toLowerCase();

const formalGoalKind = (goal) => {
  const text = String(goal ?? "").trim();
  if (/^as\s+[a-z][a-z0-9_]*\s+tends\s+to\s+infinity\b/i.test(text)) return "sequences-series";
  if (/^the\s+series\s+from\b/i.test(text)) return "sequences-series";
  if (/^the\s+derivative\s+of\b/i.test(text)) return "derivatives";
  if (/^(?:as\s+[a-z][a-z0-9_]*\s+approaches\b|the\s+limit\b)/i.test(text)) return "limits";
  return null;
};

export function inferFormalCapabilities(statement = {}, allowedRules = []) {
  const text = statementText(statement);
  const rules = Array.isArray(allowedRules) ? allowedRules.filter((item) => typeof item === "string").map((item) => item.toLowerCase()) : [];
  const inferred = ["algebra"];
  const goalCapability = formalGoalKind(statement.goal);
  if (goalCapability) inferred.push(goalCapability);
  const ruleCapabilities = new Set();
  for (const rule of rules) {
    if (rule === "derivative_from_limit") ruleCapabilities.add("limits");
    if (/(?:sequence_|series_)/.test(rule)) ruleCapabilities.add("sequences-series");
    else if (/derivative/.test(rule)) ruleCapabilities.add("derivatives");
    else if (/(?:limit|continuity|continuous|ivt)/.test(rule)) ruleCapabilities.add("limits");
  }
  for (const capability of ["derivatives", "limits", "sequences-series"]) {
    if (ruleCapabilities.has(capability) && !inferred.includes(capability)) inferred.push(capability);
  }
  if (/(?:sqrt)/.test(text) || rules.some((rule) => /(?:sqrt|conjugate)/.test(rule))) inferred.push("radicals");
  return inferred;
}

export function normalizeFormalCapabilities(candidate, { statement = {}, allowedRules = [], templateId = "formal problem" } = {}) {
  if (!Array.isArray(candidate)) throw new Error(`${templateId} formal capabilities must be an array.`);
  if (candidate.length > FORMAL_CAPABILITY_IDS.length) throw new Error(`${templateId} formal capabilities contain unsupported entries.`);
  if (candidate.some((item) => typeof item !== "string" || !FORMAL_CAPABILITY_IDS.includes(item))) {
    throw new Error(`${templateId} formal capabilities contain an unsupported capability.`);
  }
  if (new Set(candidate).size !== candidate.length) throw new Error(`${templateId} formal capabilities must not contain duplicates.`);
  const missing = inferFormalCapabilities(statement, allowedRules).find((capability) => !candidate.includes(capability));
  if (missing) throw new Error(`${templateId} formal capabilities must include inferred capability ${missing}.`);
  return [...candidate];
}
