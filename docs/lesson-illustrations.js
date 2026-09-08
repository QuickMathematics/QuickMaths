import { LESSON_ILLUSTRATIONS } from "./lesson-illustration-data.js?v=20260908-statistics-v1";

// A compatibility stamp, not an authenticity or security check. Only bundled,
// trusted metadata provides asset URLs. Edited lessons keep their own content.
export function illustrationFingerprint(skill) {
  const parts = [String(skill.name ?? "").trim(), String(skill.theory ?? "").trim()];
  for (const example of skill.examples ?? []) parts.push(String(example.prompt ?? "").trim(), String(example.solution ?? "").trim());
  let value = 2166136261;
  for (const char of parts.join("\u241e")) value = Math.imul(value ^ char.codePointAt(0), 16777619) >>> 0;
  return value.toString(16).padStart(8, "0");
}

const moduleUrl = new URL(import.meta.url);
const baseUrl = moduleUrl.protocol === "file:" ? "https://quickmathematics.github.io/QuickMaths/assets/" : new URL("./assets/", moduleUrl).href;
export function lessonIllustrations(skill) {
  const row = LESSON_ILLUSTRATIONS[skill?.id];
  if (!row || skill.overridden || row.fingerprint !== illustrationFingerprint(skill)) return null;
  const existing = new Set([skill, ...(skill.examples ?? []), ...(skill.applications ?? [])].flatMap(section => (section.media ?? []).map(item => item.src)));
  const media = row.media.filter(item => !existing.has(item.src));
  if (!media.length) return null;
  return { ...row, media, packId: "__illustrations__" + skill.id, asset_base_url: baseUrl };
}

export function illustrationAssets(packId) {
  if (!String(packId).startsWith("__illustrations__")) return null;
  const row = LESSON_ILLUSTRATIONS[String(packId).slice("__illustrations__".length)];
  return row ? { assets: row.assets, asset_base_url: baseUrl } : null;
}

// Native Studio copies carry the figures as ordinary, hash-verified assets.
// Existing embedded native media remain usable with the illustration base URL.
export function includeLessonIllustrations(pack) {
  if (pack.asset_base_url && pack.asset_base_url !== baseUrl) return pack;
  const result = structuredClone(pack);
  const existing = new Set((result.assets ?? []).map(asset => asset.path));
  let added = false;
  for (const skill of result.skills ?? []) {
    const library = lessonIllustrations(skill);
    if (!library) continue;
    if ((skill.media?.length ?? 0) + library.media.length > 12 || existing.size + library.assets.filter(asset => !existing.has(asset.path)).length > 60) continue;
    if (library.assets.some(asset => result.assets?.some(current => current.path === asset.path && current.sha256 !== asset.sha256))) continue;
    const paths = new Set((skill.media ?? []).map(item => item.src));
    skill.media = [...(skill.media ?? []), ...library.media.filter(item => !paths.has(item.src))];
    result.assets ??= [];
    for (const asset of library.assets) if (!existing.has(asset.path)) {
      existing.add(asset.path); result.assets.push(structuredClone(asset)); added = true;
    }
  }
  if (added) { result.asset_base_url = baseUrl; result.schema_version = "2.1"; }
  return result;
}
