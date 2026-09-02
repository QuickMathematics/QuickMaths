import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/pyodide.mjs";

const PYODIDE_INDEX = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/";
const nativeFetch = globalThis.fetch.bind(globalThis);

function blockCapability(name) {
  const blocked = () => { throw new Error(`${name} is disabled inside the QuickMaths Python sandbox.`); };
  try { Object.defineProperty(globalThis, name, { configurable: false, writable: false, value: blocked }); }
  catch { try { globalThis[name] = blocked; } catch { /* The Python AST boundary still blocks access. */ } }
}

const runtime = (async () => {
  postMessage({ type: "loading" });
  const [pyodide, supervisorResponse] = await Promise.all([
    loadPyodide({ indexURL: PYODIDE_INDEX }),
    nativeFetch(new URL("./python-sandbox-supervisor.py", import.meta.url), { cache: "force-cache", credentials: "omit" }),
  ]);
  if (!supervisorResponse.ok) throw new Error(`Sandbox supervisor failed to load (${supervisorResponse.status}).`);
  const supervisor = await supervisorResponse.text();
  pyodide.runPython(supervisor);
  for (const capability of ["fetch", "WebSocket", "XMLHttpRequest", "EventSource", "importScripts", "open", "showOpenFilePicker", "showSaveFilePicker"]) blockCapability(capability);
  postMessage({ type: "ready" });
  return pyodide;
})();

self.addEventListener("message", async (event) => {
  if (event.data?.type !== "grade") return;
  try {
    const pyodide = await runtime;
    pyodide.globals.set("__qm_payload_json", JSON.stringify({ source: event.data.source, spec: event.data.spec }));
    const raw = pyodide.runPython("grade_payload(__qm_payload_json)");
    pyodide.globals.delete("__qm_payload_json");
    postMessage({ type: "result", result: JSON.parse(raw) });
  } catch (error) {
    postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
});

