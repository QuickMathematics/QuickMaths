// The upstream ESM bundle is stored with a .js suffix so even minimal static
// servers send a JavaScript MIME type. Its exact upstream hash is pinned in
// the adjacent integrity manifest.
import { loadPyodide } from "./vendor/pyodide-0.28.3/pyodide-esm.js";

const PYODIDE_INDEX = new URL("./vendor/pyodide-0.28.3/", import.meta.url).href;
const nativeFetch = globalThis.fetch.bind(globalThis);
const MAX_SUPERVISOR_BYTES = 48_000;

function blockCapability(name) {
  const blocked = () => { throw new Error(`${name} is disabled inside the QuickMaths Python sandbox.`); };
  try { Object.defineProperty(globalThis, name, { configurable: false, writable: false, value: blocked }); }
  catch { try { globalThis[name] = blocked; } catch { /* The Python AST boundary still blocks access. */ } }
}

async function readSupervisor() {
  const response = await nativeFetch(new URL("./python-sandbox-supervisor.py", import.meta.url), { cache: "force-cache", credentials: "omit" });
  if (!response.ok) throw new Error(`Sandbox supervisor failed to load (${response.status}).`);
  const declared = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > MAX_SUPERVISOR_BYTES) throw new Error("Sandbox supervisor is unexpectedly large.");
  const source = await response.text();
  if (new TextEncoder().encode(source).byteLength > MAX_SUPERVISOR_BYTES) throw new Error("Sandbox supervisor is unexpectedly large.");
  return source;
}

const runtime = (async () => {
  postMessage({ type: "loading" });
  const [pyodide, supervisor] = await Promise.all([
    loadPyodide({ indexURL: PYODIDE_INDEX }),
    readSupervisor(),
  ]);
  pyodide.runPython(supervisor);
  // Learner code cannot import or reach JS through the Python namespace. These
  // guards additionally fail closed if that language boundary regresses.
  for (const capability of [
    "fetch", "WebSocket", "XMLHttpRequest", "EventSource", "importScripts", "open",
    "showOpenFilePicker", "showSaveFilePicker", "indexedDB", "caches", "FileReaderSync",
  ]) blockCapability(capability);
  postMessage({ type: "ready" });
  return pyodide;
})();

runtime.catch((error) => {
  postMessage({ type: "startup_error", message: error instanceof Error ? error.message.slice(0, 500) : "The Python runtime could not start." });
});

self.addEventListener("message", async (event) => {
  if (event.data?.type !== "grade") return;
  const requestId = typeof event.data.requestId === "string" ? event.data.requestId.slice(0, 120) : "";
  if (!requestId) return;
  try {
    const pyodide = await runtime;
    const payload = JSON.stringify({ source: event.data.source, spec: event.data.spec });
    pyodide.globals.set("__qm_payload_json", payload);
    let raw;
    try { raw = pyodide.runPython("grade_payload(__qm_payload_json)"); }
    finally { pyodide.globals.delete("__qm_payload_json"); }
    postMessage({ type: "result", requestId, result: JSON.parse(raw) });
  } catch (error) {
    postMessage({ type: "error", requestId, message: error instanceof Error ? error.message.slice(0, 500) : "The Python sandbox could not grade this program." });
  }
});
