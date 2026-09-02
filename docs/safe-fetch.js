export async function readTextLimited(response, maximumBytes, { label = "Remote file" } = {}) {
  if (!response || !Number.isFinite(maximumBytes) || maximumBytes < 1) throw new Error("A valid response and byte limit are required.");
  const declared = Number(response.headers?.get?.("Content-Length"));
  if (Number.isFinite(declared) && declared > maximumBytes) throw new Error(`${label} is larger than ${formatLimit(maximumBytes)}.`);
  if (!response.body?.getReader) {
    const text = await response.text();
    const length = typeof TextEncoder === "function" ? new TextEncoder().encode(text).length : text.length;
    if (length > maximumBytes) throw new Error(`${label} is larger than ${formatLimit(maximumBytes)}.`);
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel(`${label} exceeded its byte limit.`);
      throw new Error(`${label} is larger than ${formatLimit(maximumBytes)}.`);
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

export async function fetchTextLimited(fetchImpl, url, {
  maximumBytes,
  timeoutMs = 15_000,
  label = "Remote file",
  request = {},
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(url, { ...request, ...(controller ? { signal: controller.signal } : {}) });
    if (!response.ok) throw new Error(`${label} download failed (${response.status}).`);
    return { response, text: await readTextLimited(response, maximumBytes, { label }) };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`${label} download timed out.`);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function readFileTextLimited(file, maximumBytes, { label = "File" } = {}) {
  if (!file || typeof file.text !== "function") throw new Error(`${label} could not be read.`);
  if (Number.isFinite(file.size) && file.size > maximumBytes) throw new Error(`${label} is larger than ${formatLimit(maximumBytes)}.`);
  const text = await file.text();
  const length = typeof TextEncoder === "function" ? new TextEncoder().encode(text).length : text.length;
  if (length > maximumBytes) throw new Error(`${label} is larger than ${formatLimit(maximumBytes)}.`);
  return text;
}

export function githubFileRawUrl(value) {
  let url;
  try { url = new URL(String(value ?? "").trim()); } catch { throw new Error("Paste a complete GitHub file URL."); }
  if (url.protocol !== "https:") throw new Error("GitHub file links must use HTTPS.");
  if (url.username || url.password) throw new Error("GitHub file links cannot contain credentials.");
  url.search = "";
  url.hash = "";
  if (url.hostname === "raw.githubusercontent.com") {
    if (url.pathname.split("/").filter(Boolean).length < 4) throw new Error("The raw GitHub file link is incomplete.");
    return url.href;
  }
  if (url.hostname !== "github.com") throw new Error("For safety, use a github.com or raw.githubusercontent.com file link.");
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 5 || parts[2] !== "blob") throw new Error("Use a GitHub file link containing /blob/ref/path.");
  return `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${parts.slice(3).join("/")}`;
}

function formatLimit(bytes) {
  if (bytes % 1_000_000 === 0) return `${bytes / 1_000_000} MB`;
  if (bytes % 1_000 === 0) return `${bytes / 1_000} KB`;
  return `${bytes} bytes`;
}
