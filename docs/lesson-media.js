// Lesson attachments remain data. SVGs are displayed only through <img>, never
// inserted as markup, and media downloads never carry GitHub credentials.
export const MEDIA_TYPES = Object.freeze({
  png: "image/png", apng: "image/apng", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml", bmp: "image/bmp",
  webm: "video/webm", mp4: "video/mp4", m4v: "video/mp4", ogv: "video/ogg",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg",
  m4a: "audio/mp4", flac: "audio/flac", opus: "audio/ogg",
});
export const MAX_MEDIA_BYTES = 25_000_000;
export const MAX_EMBEDDED_MEDIA_BYTES = 1_000_000;
const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const fail = message => { throw new Error(message); };
const text = (value, limit = 1000) => typeof value === "string" && value.length <= limit ? value.trim() : fail("Media text is invalid or too long.");

export function mediaPath(value) {
  const path = text(value, 240);
  if (!path || !/^[A-Za-z0-9][A-Za-z0-9_./ -]*$/.test(path) || path.split("/").some(part => !part || part === "." || part === ".." || part.endsWith(".") || part.endsWith(" ")) || path.split("/").length > 12) fail("Media paths must stay inside the lesson folder.");
  if (path.split("/").some(part => /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(part.split(".")[0]))) fail("Use portable media filenames, without reserved device names.");
  if (!MEDIA_TYPES[path.split(".").at(-1).toLowerCase()]) fail(`Unsupported media format: ${path}. Use a browser image, audio or video format.`);
  return path;
}

export function mediaBaseUrl(value) {
  if (!value) return "";
  let url;
  try { url = new URL(value); } catch { fail("Media base URL must be a complete HTTPS folder URL."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash || !url.pathname.endsWith("/")) fail("Media base URL must be an HTTPS folder URL without credentials or query parameters.");
  if (!local && url.hostname !== "raw.githubusercontent.com" && !url.hostname.endsWith(".github.io")) fail("Host lesson media in its GitHub lesson folder.");
  return url.href;
}

export function normalizeLessonAssets(candidate = []) {
  if (!Array.isArray(candidate) || candidate.length > 60) fail("A lesson pack supports at most 60 media files.");
  const paths = new Set();
  let embeddedBytes = 0, totalBytes = 0;
  return candidate.map(asset => {
    if (!asset || typeof asset !== "object") fail("Invalid lesson media file.");
    const path = mediaPath(asset.path);
    if (paths.has(path)) fail(`Duplicate media file: ${path}.`);
    paths.add(path);
    const mime = MEDIA_TYPES[path.split(".").at(-1).toLowerCase()];
    if (asset.mime_type && asset.mime_type !== mime) fail(`Media type does not match ${path}.`);
    if (!/^[a-f0-9]{64}$/i.test(asset.sha256 ?? "")) fail(`${path} needs a SHA-256 digest.`);
    if (!Number.isInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > MAX_MEDIA_BYTES) fail(`${path} must be at most 25 MB.`);
    totalBytes += asset.bytes;
    if (totalBytes > 100_000_000) fail("Lesson attachments must total at most 100 MB.");
    const normalized = { path, mime_type: mime, sha256: asset.sha256.toLowerCase(), bytes: asset.bytes };
    if (asset.data_base64 != null) {
      const encoded = asset.data_base64;
      if (typeof encoded !== "string" || encoded.length > Math.ceil(MAX_EMBEDDED_MEDIA_BYTES / 3) * 4 || encoded.length % 4 || /[^A-Za-z0-9+/=]/.test(encoded) || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) fail(`${path} contains invalid embedded data.`);
      const length = encoded.length / 4 * 3 - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
      embeddedBytes += length;
      if (length !== asset.bytes || embeddedBytes > MAX_EMBEDDED_MEDIA_BYTES) fail("Portable lesson attachments must total at most 1 MB. Publish larger files alongside the lesson manifest.");
      normalized.data_base64 = encoded;
    }
    return normalized;
  });
}

export function normalizeLessonMedia(candidate = []) {
  if (!Array.isArray(candidate) || candidate.length > 12) fail("A lesson section supports at most 12 media items.");
  return candidate.map(item => {
    if (!item || typeof item !== "object") fail("Invalid lesson media item.");
    const src = mediaPath(item.src);
    const type = MEDIA_TYPES[src.split(".").at(-1).toLowerCase()].split("/")[0];
    if (item.type && item.type !== type) fail(`${src} must use media type ${type}.`);
    const result = { type, src, alt: text(item.alt ?? "", 500), caption: text(item.caption ?? "", 1000), fit: item.fit ?? "contain" };
    if (!result.alt) fail(`${src} needs alternative text describing its teaching content.`);
    if (!["contain", "cover"].includes(result.fit)) fail("Media fit must be contain or cover.");
    for (const name of ["width", "height"]) {
      if (item[name] == null) continue;
      if (!Number.isInteger(item[name]) || item[name] < 1 || item[name] > 4096) fail(`Media ${name} must be 1 to 4096 pixels.`);
      result[name] = item[name];
    }
    if (item.sources != null) {
      if (type === "image" || !Array.isArray(item.sources) || item.sources.length > 3) fail("Audio and video can have up to three fallback source files.");
      result.sources = [...new Set(item.sources.map(mediaPath))];
      if (result.sources.some(path => !MEDIA_TYPES[path.split(".").at(-1).toLowerCase()].startsWith(`${type}/`))) fail("Fallback sources must have the same media type.");
    }
    if (item.poster != null) {
      result.poster = mediaPath(item.poster);
      if (type !== "video" || !MEDIA_TYPES[result.poster.split(".").at(-1).toLowerCase()].startsWith("image/")) fail("A video poster must be an image.");
    }
    return result;
  });
}

export function validateMediaReferences(skills, assets) {
  const available = new Set(assets.map(asset => asset.path));
  for (const skill of skills) for (const section of [skill, ...(skill.examples ?? []), ...(skill.applications ?? []), ...(skill.problems ?? [])]) {
    for (const item of section.media ?? []) for (const path of [item.src, ...(item.sources ?? []), ...(item.poster ? [item.poster] : [])]) {
      if (!available.has(path)) fail(`Media file ${path} is not listed in the lesson pack assets.`);
    }
  }
}

export function renderLessonMedia(items = [], packId = "") {
  return items.map(item => `<figure class="lesson-media" data-lesson-media data-media-pack="${escape(packId)}" data-media-item="${escape(JSON.stringify(item))}" style="${item.width ? `max-width:${Number(item.width)}px;` : ""}"><div class="lesson-media-content"${item.width && item.height ? ` style="aspect-ratio:${Number(item.width)}/${Number(item.height)}"` : ""}><p class="lesson-media-status" role="status">Loading ${escape(item.type)}…</p></div>${item.caption ? `<figcaption>${escape(item.caption)}</figcaption>` : ""}</figure>`).join("");
}

export async function mediaDigest(bytes, cryptoImpl = globalThis.crypto) {
  return [...new Uint8Array(await cryptoImpl.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
}

export function decodeMediaData(encoded) {
  return Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
}

export function encodeMediaData(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export async function loadLessonAsset(asset, base, { fetchImpl = globalThis.fetch, signal, cryptoImpl = globalThis.crypto } = {}) {
  let bytes;
  if (asset.data_base64) bytes = decodeMediaData(asset.data_base64);
  else {
    if (!base) throw new Error(`Missing attachment ${asset.path}. Open the lesson folder or a portable package.`);
    const url = new URL(mediaPath(asset.path).split("/").map(encodeURIComponent).join("/"), mediaBaseUrl(base));
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 30_000);
    try {
      const response = await fetchImpl(url.href, { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer", redirect: "error" });
      if (!response.ok) throw new Error(`Media download failed (${response.status}).`);
      if (Number(response.headers.get("content-length")) > asset.bytes) throw new Error("Media size differs from its manifest.");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("This browser cannot read the media download.");
      const chunks = []; let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > asset.bytes || size > MAX_MEDIA_BYTES) { await reader.cancel(); throw new Error("Media exceeds its declared size."); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
  }
  if (bytes.byteLength !== asset.bytes || await mediaDigest(bytes, cryptoImpl) !== asset.sha256) throw new Error(`${asset.path} does not match the lesson's verified digest.`);
  return bytes;
}
