import test from "node:test";
import assert from "node:assert/strict";

import { createLearningStore } from "./challenge-core.js";
import { buildToolDefinitions, registerWebMcpTools, TOOL_NAMES } from "./webmcp-tools.js";

function store() {
  return createLearningStore({
    storage: { getItem: () => null, setItem: () => undefined },
    now: () => new Date("2026-09-01T09:42:00.000Z"),
  });
}

test("registers all tools once with the WebMCP document context", async () => {
  const registered = [];
  const result = await registerWebMcpTools(store(), {
    async registerTool(definition) { registered.push(definition); },
  });
  assert.equal(result.available, true);
  assert.deepEqual(result.registered, TOOL_NAMES);
  assert.deepEqual(registered.map(({ name }) => name), TOOL_NAMES);
  assert.ok(registered.every(({ description }) => description.length > 0));
});

test("degrades cleanly when WebMCP is unavailable", async () => {
  const result = await registerWebMcpTools(store(), undefined);
  assert.deepEqual(result, { available: false, registered: [], error: null });
});

test("tool schemas reject unknown properties and mismatched question IDs", async () => {
  const tools = Object.fromEntries(buildToolDefinitions(store()).map((tool) => [tool.name, tool]));
  await assert.rejects(
    tools.get_learning_context.execute({ unexpected: true }),
    /Unknown input property/,
  );
  await assert.rejects(
    tools.inspect_student_work.execute({ question_id: "ALG002-NOT-REAL" }),
    /currently on screen/,
  );
});

test("agent workflow can inspect, record feedback, and open an allowlisted follow-up", async () => {
  const learningStore = store();
  learningStore.setStudentResponse({ work: "3x = 25\nx = 8.33", finalAnswer: "8.33" });
  const tools = Object.fromEntries(buildToolDefinitions(learningStore).map((tool) => [tool.name, tool]));

  const inspection = await tools.inspect_student_work.execute({ question_id: "ALG002-P1" });
  assert.equal(inspection.mistake_tag, "inverse_operations");

  const feedback = await tools.record_tutor_feedback.execute({
    question_id: "ALG002-P1",
    feedback: "Which inverse operation removes +5 from both sides?",
    mistake_tag: inspection.mistake_tag,
    next_step: "Rewrite the first line after undoing +5.",
    confidence: "high",
  });
  assert.equal(feedback.saved, true);

  const followup = await tools.create_followup_problem.execute({
    skill_id: "MATH_ALG_002",
    difficulty: "same",
    focus: "equation_balance",
  });
  assert.equal(followup.problem.question_id, "ALG002-P2");
  assert.equal(learningStore.snapshot().currentProblem.id, "ALG002-P2");
});
