import test from "node:test";
import assert from "node:assert/strict";

import { buildEducatorAgentPrompt, buildLearnerAgentPrompt, detectBrowserName, webMcpAvailable } from "./agent-prompts.js";

test("detects common browsers without mistaking Edge for Chrome", () => {
  assert.equal(detectBrowserName({ userAgent: "Mozilla/5.0 Firefox/142.0" }), "Firefox");
  assert.equal(detectBrowserName({ userAgent: "Mozilla/5.0 Chrome/140.0 Safari/537.36 Edg/140.0" }), "Microsoft Edge");
  assert.equal(detectBrowserName({ userAgent: "Mozilla/5.0 Version/18.0 Safari/605.1.15" }), "Safari");
  assert.equal(detectBrowserName({ userAgent: "unknown" }), "this browser");
});

test("in-app learner and educator prompts target the already-open WebMCP tab and name their manifest tools", () => {
  const navigatorObject = { userAgent: "Mozilla/5.0 Firefox/142.0" };
  const modelContext = { registerTool() {} };
  const learner = buildLearnerAgentPrompt({ navigatorObject, modelContext });
  const educator = buildEducatorAgentPrompt({ navigatorObject, modelContext });
  for (const prompt of [learner, educator]) {
    assert.match(prompt, /ChatGPT\/Codex in-app browser/i);
    assert.match(prompt, /already-open QuickMaths tab/i);
    assert.match(prompt, /do not open another QuickMaths tab/i);
  }
  assert.match(learner, /get_agent_guide with section "summary"/);
  assert.match(educator, /get_educator_agent_manifest/);
});

test("external-browser prompts explain the boundary and direct the agent into its in-app browser", () => {
  const navigatorObject = { userAgent: "Mozilla/5.0 Firefox/142.0" };
  const learner = buildLearnerAgentPrompt({ navigatorObject, modelContext: undefined });
  const educator = buildEducatorAgentPrompt({ navigatorObject, modelContext: undefined });
  for (const prompt of [learner, educator]) {
    assert.match(prompt, /Firefox, an external browser/i);
    assert.match(prompt, /cannot expose WebMCP tools/i);
    assert.match(prompt, /Open https:\/\/quickmathematics\.github\.io\/QuickMaths\/ in your ChatGPT or Codex in-app browser/i);
    assert.match(prompt, /never ask me to paste a token into chat/i);
  }
  assert.match(learner, /get_agent_guide with section "summary"/);
  assert.match(educator, /get_educator_agent_manifest/);
});

test("detects WebMCP support from the page capability instead of the browser name", () => {
  assert.equal(webMcpAvailable({ registerTool() {} }), true);
  assert.equal(webMcpAvailable({}), false);
  assert.equal(webMcpAvailable(undefined), false);
});
