const DEFAULT_WORKER_URL = new URL("./python-sandbox-worker.js", import.meta.url);
const activeRuns = new Set();

function boundedMessage(value, fallback) {
  const message = String(value ?? "").trim().slice(0, 500);
  return message || fallback;
}

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
    let worker;
    try {
      worker = new WorkerImpl(workerUrl, { type: "module", name: "quickmaths-python-sandbox" });
    } catch (error) {
      resolve(terminalFailure(spec, "unavailable", boundedMessage(error?.message, "The isolated Python runtime failed to start.")));
      return;
    }
    const requestId = globalThis.crypto?.randomUUID?.() ?? `python-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let phase = "loading";
    let executionTimer = null;
    const finish = (result) => {
      if (phase === "done") return;
      phase = "done";
      clearTimeout(loadTimer);
      if (executionTimer) clearTimeout(executionTimer);
      worker.terminate();
      activeRuns.delete(cancel);
      resolve(result);
    };
    const cancel = () => finish(terminalFailure(spec, "unavailable", "The Python run was cancelled before it completed."));
    activeRuns.add(cancel);
    const loadTimer = setTimeout(() => finish(terminalFailure(spec, "unavailable", "The local Python runtime did not finish loading.")), loadTimeoutMs);
    worker.addEventListener("message", (event) => {
      if (phase === "done") return;
      if (event.data?.type === "startup_error" && phase === "loading") {
        finish(terminalFailure(spec, "unavailable", boundedMessage(event.data.message, "The isolated Python runtime failed to start.")));
        return;
      }
      if (event.data?.type === "ready" && phase === "loading") {
        phase = "running";
        clearTimeout(loadTimer);
        const wallTime = Math.max(250, Math.min(3000, Number(spec?.limits?.wall_time_ms) || 1500));
        executionTimer = setTimeout(() => finish(terminalFailure(spec, "timeout", `The program exceeded its ${wallTime} ms wall-time limit.`)), wallTime);
        worker.postMessage({ type: "grade", requestId, source: String(source ?? ""), spec });
        return;
      }
      if (phase !== "running" || event.data?.requestId !== requestId) return;
      if (event.data?.type === "result") finish(event.data.result);
      // Learner syntax/runtime failures are returned inside a normal `result`.
      // A top-level worker error means the grading infrastructure itself failed
      // and must never be converted into a learner mistake.
      if (event.data?.type === "error") finish(terminalFailure(spec, "unavailable", boundedMessage(event.data.message, "The Python sandbox could not grade this program.")));
    });
    worker.addEventListener("error", (event) => finish(terminalFailure(
      spec,
      "unavailable",
      boundedMessage(event?.message, "The isolated Python runtime failed to start."),
    )));
  });
}

export function cancelActivePythonGraders() {
  [...activeRuns].forEach((cancel) => cancel());
}

export function visiblePythonTests(grade, { submitted = false } = {}) {
  return (grade?.tests ?? []).filter((test) => test.visibility === "example" || (submitted && test.visibility === "after_submission"));
}
