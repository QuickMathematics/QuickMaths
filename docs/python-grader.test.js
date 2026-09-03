import test from "node:test";
import assert from "node:assert/strict";
import { cancelActivePythonGraders, gradePythonProgram, visiblePythonTests } from "./python-grader.js";

const spec = {
  limits: { wall_time_ms: 250 },
  tests: [
    { id: "example", visibility: "example" },
    { id: "later", visibility: "after_submission" },
    { id: "secret", visibility: "hidden" },
  ],
};

test("Python grader uses a disposable module worker and returns its result", async () => {
  class FakeWorker {
    listeners = {};
    terminated = false;
    constructor(url, options) { this.url = url; this.options = options; queueMicrotask(() => this.listeners.message?.({ data: { type: "ready" } })); }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    postMessage(message) {
      assert.equal(message.type, "grade");
      queueMicrotask(() => this.listeners.message({ data: { type: "result", requestId: message.requestId, result: { status: "passed", passed: 3, total: 3, tests: [] } } }));
    }
    terminate() { this.terminated = true; }
  }
  const result = await gradePythonProgram("def answer():\n    return 1", spec, { WorkerImpl: FakeWorker });
  assert.equal(result.status, "passed");
  assert.equal(result.total, 3);
  assert.equal(FakeWorker.prototype.terminated, undefined);
});

test("Python grader terminates runaway workers at the authored wall limit", async () => {
  let instance;
  class HangingWorker {
    listeners = {};
    constructor() { instance = this; queueMicrotask(() => this.listeners.message?.({ data: { type: "ready" } })); }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    postMessage() {}
    terminate() { this.terminated = true; }
  }
  const result = await gradePythonProgram("def answer():\n    while True: pass", spec, { WorkerImpl: HangingWorker });
  assert.equal(result.status, "timeout");
  assert.equal(instance.terminated, true);
});

test("hidden Python tests never enter learner-facing result lists", () => {
  const grade = { tests: spec.tests };
  assert.deepEqual(visiblePythonTests(grade).map((item) => item.id), ["example"]);
  assert.deepEqual(visiblePythonTests(grade, { submitted: true }).map((item) => item.id), ["example", "later"]);
});

test("Python grader reports startup rejection and terminates the worker", async () => {
  let instance;
  class StartupFailureWorker {
    listeners = {};
    constructor() { instance = this; queueMicrotask(() => this.listeners.message?.({ data: { type: "startup_error", message: "Runtime files unavailable" } })); }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    terminate() { this.terminated = true; }
  }
  const result = await gradePythonProgram("def answer():\n    return 1", spec, { WorkerImpl: StartupFailureWorker });
  assert.equal(result.status, "unavailable");
  assert.match(result.messages[0], /runtime files unavailable/i);
  assert.equal(instance.terminated, true);
});

test("Python grader sends only once after duplicate ready messages and ignores foreign results", async () => {
  let posts = 0;
  class NoisyWorker {
    listeners = {};
    constructor() {
      queueMicrotask(() => {
        this.listeners.message?.({ data: { type: "ready" } });
        this.listeners.message?.({ data: { type: "ready" } });
        this.listeners.message?.({ data: { type: "result", requestId: "foreign", result: { status: "passed" } } });
      });
    }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    postMessage(message) {
      posts += 1;
      queueMicrotask(() => this.listeners.message({ data: { type: "result", requestId: message.requestId, result: { status: "passed", passed: 3, total: 3, tests: [] } } }));
    }
    terminate() { this.terminated = true; }
  }
  const result = await gradePythonProgram("def answer():\n    return 1", spec, { WorkerImpl: NoisyWorker });
  assert.equal(result.status, "passed");
  assert.equal(posts, 1);
});

test("Python grader terminates on worker errors and constructor failures are bounded", async () => {
  let instance;
  class ErrorWorker {
    listeners = {};
    constructor() { instance = this; queueMicrotask(() => this.listeners.error?.(new Error("boom"))); }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    terminate() { this.terminated = true; }
  }
  const result = await gradePythonProgram("def answer():\n    return 1", spec, { WorkerImpl: ErrorWorker });
  assert.equal(result.status, "unavailable");
  assert.equal(instance.terminated, true);

  class ThrowingWorker { constructor() { throw new Error("constructor exploded"); } }
  const construction = await gradePythonProgram("def answer():\n    return 1", spec, { WorkerImpl: ThrowingWorker });
  assert.equal(construction.status, "unavailable");
  assert.match(construction.messages[0], /constructor exploded/i);
});

test("top-level supervisor failures remain infrastructure failures, not learner mistakes", async () => {
  let instance;
  class SupervisorFailureWorker {
    listeners = {};
    constructor() { instance = this; queueMicrotask(() => this.listeners.message?.({ data: { type: "ready" } })); }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    postMessage(message) {
      queueMicrotask(() => this.listeners.message({ data: { type: "error", requestId: message.requestId, message: "Supervisor failed" } }));
    }
    terminate() { this.terminated = true; }
  }
  const result = await gradePythonProgram("def answer():\n    return 1", spec, { WorkerImpl: SupervisorFailureWorker });
  assert.equal(result.status, "unavailable");
  assert.match(result.messages[0], /supervisor failed/i);
  assert.equal(instance.terminated, true);
});

test("page-level cancellation terminates every in-flight Python worker", async () => {
  let instance;
  class LoadingWorker {
    listeners = {};
    constructor() { instance = this; }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    terminate() { this.terminated = true; }
  }
  const pending = gradePythonProgram("def answer():\n    return 1", spec, { WorkerImpl: LoadingWorker, loadTimeoutMs: 5_000 });
  cancelActivePythonGraders();
  const result = await pending;
  assert.equal(result.status, "unavailable");
  assert.match(result.messages[0], /cancelled/i);
  assert.equal(instance.terminated, true);
});
