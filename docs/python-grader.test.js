import test from "node:test";
import assert from "node:assert/strict";
import { gradePythonProgram, visiblePythonTests } from "./python-grader.js";

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
      queueMicrotask(() => this.listeners.message({ data: { type: "result", result: { status: "passed", passed: 3, total: 3, tests: [] } } }));
    }
    terminate() { this.terminated = true; }
  }
  const result = await gradePythonProgram("def answer():\n    return 1", spec, { WorkerImpl: FakeWorker });
  assert.equal(result.status, "passed");
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

