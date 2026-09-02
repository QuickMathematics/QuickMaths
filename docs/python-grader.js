const DEFAULT_WORKER_URL = new URL("./python-sandbox-worker.js", import.meta.url);

function terminalFailure(spec, status, message) {
  const tests = (spec?.tests ?? []).map((test) => ({
    id: test.id,
    status: status === "timeout" ? "timeout" : "runtime_error",
    visibility: test.visibility,
    message: test.visibility === "hidden" ? `A hidden test ${status === "timeout" ? "timed out" : "could not run"}.` : message,
  }));
  return { status, score: 0, passed: 0, total: tests.length, tests, messages: [message], stdout: "" };
}

export function gradePythonProgram(source, spec, {
  WorkerImpl = globalThis.Worker,
  workerUrl = DEFAULT_WORKER_URL,
  loadTimeoutMs = 45_000,
} = {}) {
  if (typeof WorkerImpl !== "function") return Promise.resolve(terminalFailure(spec, "unavailable", "This browser cannot start the isolated Python worker."));
  return new Promise((resolve) => {
    const worker = new WorkerImpl(workerUrl, { type: "module", name: "quickmaths-python-sandbox" });
    let settled = false;
    let executionTimer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(loadTimer);
      if (executionTimer) clearTimeout(executionTimer);
      worker.terminate();
      resolve(result);
    };
    const loadTimer = setTimeout(() => finish(terminalFailure(spec, "unavailable", "The local Python runtime did not finish loading.")), loadTimeoutMs);
    worker.addEventListener("message", (event) => {
      if (event.data?.type === "ready") {
        clearTimeout(loadTimer);
        const wallTime = Math.max(250, Math.min(3000, Number(spec?.limits?.wall_time_ms) || 1500));
        executionTimer = setTimeout(() => finish(terminalFailure(spec, "timeout", `The program exceeded its ${wallTime} ms wall-time limit.`)), wallTime);
        worker.postMessage({ type: "grade", source: String(source ?? ""), spec });
      }
      if (event.data?.type === "result") finish(event.data.result);
      if (event.data?.type === "error") finish(terminalFailure(spec, "runtime_error", event.data.message || "The Python sandbox could not grade this program."));
    });
    worker.addEventListener("error", () => finish(terminalFailure(spec, "unavailable", "The isolated Python runtime failed to start.")));
  });
}

export function visiblePythonTests(grade, { submitted = false } = {}) {
  return (grade?.tests ?? []).filter((test) => test.visibility === "example" || (submitted && test.visibility === "after_submission"));
}

