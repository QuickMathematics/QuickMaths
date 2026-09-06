import { MEDIA_TYPES, MAX_MEDIA_BYTES, MAX_EMBEDDED_MEDIA_BYTES, mediaPath, normalizeLessonAssets, normalizeLessonMedia, mediaDigest, encodeMediaData, decodeMediaData } from "./lesson-media.js?v=20260906-media-v1";
import { readFileTextLimited } from "./safe-fetch.js";

export async function parseLessonManifest(raw, name = "lesson-set.json") {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).byteLength > 2_000_000) throw new Error("Lesson manifest exceeds 2 MB.");
  let pack;
  if (/\.ya?ml$/i.test(name)) {
    const yaml = await import("./vendor/js-yaml-5.4.1/js-yaml.mjs");
    pack = yaml.load(raw, { schema: yaml.JSON_SCHEMA, maxDepth: 30, maxAliases: 0 });
  } else pack = JSON.parse(raw);
  if (!pack || pack.format !== "quickmaths.lesson-set" || !Array.isArray(pack.skills)) throw new Error("Choose a QuickMaths lesson-set YAML or JSON manifest.");
  if (pack.schema_version != null) pack.schema_version = String(pack.schema_version);
  if (pack.matplotlib_figures?.length) throw new Error('Build the Matplotlib figures first: quickmaths build-lesson lesson-set.yaml --output built-lesson. Then open the built folder here.');
  return pack;
}

export function referencedMediaPaths(pack) {
  const paths = new Set();
  for (const skill of pack.skills ?? []) for (const section of [skill, ...(skill.examples ?? []), ...(skill.applications ?? []), ...(skill.problems ?? [])]) {
    for (const media of normalizeLessonMedia(section.media)) for (const path of [media.src, ...(media.sources ?? []), ...(media.poster ? [media.poster] : [])]) paths.add(path);
  }
  return [...paths];
}

export async function readLessonFolder(input, { portable = true } = {}) {
  const files = [...input];
  if (!files.length || files.length > 300) throw new Error("Select a lesson folder with at most 300 files.");
  const pathOf = file => file.webkitRelativePath || file.name;
  const manifests = files.filter(file => /^lesson-set\.(json|ya?ml)$/i.test(file.name));
  if (!manifests.length) throw new Error("The folder needs a lesson-set.json, lesson-set.yaml or lesson-set.yml manifest.");
  const depth = Math.min(...manifests.map(file => pathOf(file).split("/").length));
  const nearest = manifests.filter(file => pathOf(file).split("/").length === depth);
  const json = nearest.filter(file => /\.json$/i.test(file.name));
  const choices = json.length ? json : nearest;
  if (choices.length !== 1) throw new Error("Select one lesson package folder at a time.");
  const manifest = choices[0];
  const prefix = pathOf(manifest).slice(0, -manifest.name.length);
  const pack = await parseLessonManifest(await readFileTextLimited(manifest, 2_000_000, { label: "Lesson manifest" }), manifest.name);
  const originals = new Map(normalizeLessonAssets(pack.assets).map(asset => [asset.path, asset]));
  const attachments = new Map();
  const assets = [];
  let total = 0;
  for (const path of referencedMediaPaths(pack)) {
    mediaPath(path);
    const matches = files.filter(file => pathOf(file) === prefix + path || (!file.webkitRelativePath && file.name === path.split("/").at(-1)));
    if (matches.length > 1) throw new Error(`More than one selected file matches ${path}. Select the folder to preserve its paths.`);
    const file = matches[0];
    const original = originals.get(path);
    if (!file && !original?.data_base64) throw new Error(`Missing attachment: ${path}.`);
    const size = file?.size ?? original.bytes;
    if (!size || size > MAX_MEDIA_BYTES || (total += size) > 100_000_000) throw new Error("Attachments must be at most 25 MB each and 100 MB per folder.");
    if (portable && total > MAX_EMBEDDED_MEDIA_BYTES) throw new Error("Portable attachments must total at most 1 MB. Use Publish → Open lesson folder for larger files.");
    const bytes = file ? new Uint8Array(await file.arrayBuffer()) : decodeMediaData(original.data_base64);
    if (bytes.length !== size) throw new Error(`Attachment changed while reading: ${path}.`);
    const sha256 = await mediaDigest(bytes);
    if (original && (original.sha256 !== sha256 || original.bytes !== size)) throw new Error(`${path} changed since its manifest was built. Rebuild the lesson folder to update its digest.`);
    const asset = { path, mime_type: MEDIA_TYPES[path.split(".").at(-1).toLowerCase()], sha256, bytes: size };
    if (portable) asset.data_base64 = encodeMediaData(bytes);
    assets.push(asset); attachments.set(path, bytes);
  }
  pack.assets = normalizeLessonAssets(assets);
  if (assets.length) pack.schema_version = "2.1";
  delete pack.asset_base_url;
  if (new TextEncoder().encode(JSON.stringify(pack)).byteLength > 2_000_000) throw new Error("Portable lesson manifest exceeds 2 MB.");
  return { pack, attachments };
}
