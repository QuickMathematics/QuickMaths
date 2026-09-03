import test from "node:test";
import assert from "node:assert/strict";

import { buildEducatorAgentPrompt, buildLearnerAgentPrompt, detectBrowserName } from "./agent-prompts.js";

test("detects common browsers without mistaking Edge for Chrome", () => {
  assert.equal(detectBrowserName({ userAgent: "Mozilla/5.0 Firefox/142.0" }), "Firefox");
  assert.equal(detectBrowserName({ userAgent: "Mozilla/5.0 Chrome/140.0 Safari/537.36 Edg/140.0" }), "Microsoft Edge");
  assert.equal(detectBrowserName({ userAgent: "Mozilla/5.0 Version/18.0 Safari/605.1.15" }), "Safari");
  assert.equal(detectBrowserName({ userAgent: "unknown" }), "this browser");
});

test("learner and educator prompts target the already-open browser tab", () => {
  const navigatorObject = { userAgent: "Mozilla/5.0 Firefox/142.0" };
  const learner = buildLearnerAgentPrompt({ navigatorObject });
  const educator = buildEducatorAgentPrompt({ navigatorObject });
  for (const prompt of [learner, educator]) {
    assert.match(prompt, /already open in Firefox/i);
    assert.match(prompt, /this open QuickMaths tab/i);
    assert.match(prompt, /do not open a new QuickMaths tab/i);
  }
  assert.match(learner, /agent guide summary/i);
  assert.match(educator, /get_educator_agent_manifest/);
});
