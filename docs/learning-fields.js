import { FIELD_TAXONOMY } from "./learning-taxonomy.js?v=20260906-lesson-batches-v1";

export const standardBranches = (fieldId) => Object.keys(FIELD_TAXONOMY.fields.find((field) => field.id === fieldId)?.branches ?? {});
export function lessonClassification(skill, fieldId = skill.fieldId ?? skill.subjectId) {
  const original = String(skill.branch ?? skill.subdomain ?? "").trim() || "Foundations";
  const field = FIELD_TAXONOMY.fields.find((item) => item.id === fieldId);
  const match = Object.entries(field?.branches ?? {}).find(([name, aliases]) => [name, ...aliases].some((alias) => alias.toLowerCase() === original.toLowerCase()));
  const branch = match?.[0] ?? original;
  return { branch, topic: String(skill.topic ?? "").trim() || (branch !== original ? original : "") };
}
export const branchName = (skill) => lessonClassification(skill).branch;
export function normalizeLessonTaxonomy(skill, fieldId = skill.fieldId ?? skill.subjectId) {
  const { branch, topic } = lessonClassification(skill, fieldId);
  return { ...skill, subdomain: branch, ...(topic ? { topic } : {}) };
}
export const branchId = (fieldId, name) => `${encodeURIComponent(fieldId)}/${encodeURIComponent(name)}`;

export function learningFields(subjects = [], skills = []) {
  return subjects.map((subject) => {
    const members = skills.filter((skill) => (skill.fieldId ?? skill.subjectId) === subject.id);
    const branches = new Map();
    for (const skill of members) {
      const name = lessonClassification(skill, subject.id).branch;
      if (!branches.has(name)) branches.set(name, { id: branchId(subject.id, name), fieldId: subject.id, name, skillIds: [] });
      branches.get(name).skillIds.push(skill.id);
    }
    const order = standardBranches(subject.id);
    const rank = (name) => order.includes(name) ? order.indexOf(name) : order.length;
    return { ...subject, fieldId: subject.id, skillIds: members.map((skill) => skill.id), branches: [...branches.values()].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name)) };
  });
}
