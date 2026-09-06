// File compatibility: field = subject; branch = a lesson's subdomain. Branches
// belong to one field, so identically named branches never share membership.
export const branchName = (skill) => String(skill.branch ?? skill.subdomain ?? "").trim() || "Foundations";
export const branchId = (fieldId, name) => `${encodeURIComponent(fieldId)}/${encodeURIComponent(name)}`;

export function learningFields(subjects = [], skills = []) {
  return subjects.map((subject) => {
    const members = skills.filter((skill) => (skill.fieldId ?? skill.subjectId) === subject.id);
    const branches = new Map();
    for (const skill of members) {
      const name = branchName(skill);
      if (!branches.has(name)) branches.set(name, { id: branchId(subject.id, name), fieldId: subject.id, name, skillIds: [] });
      branches.get(name).skillIds.push(skill.id);
    }
    return { ...subject, fieldId: subject.id, skillIds: members.map((skill) => skill.id), branches: [...branches.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  });
}
