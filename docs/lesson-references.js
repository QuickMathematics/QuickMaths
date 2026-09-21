// Only known lesson IDs become internal navigation links; all authored text stays escaped.
export function lessonReferenceText(value, knownIds) {
  const escaped = String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  return escaped.replace(/\bMATH_[A-Z]+_\d{3}\b/g, id => knownIds.has(id)
    ? `<a href="#/lesson/${id}">${id}</a>` : id);
}
