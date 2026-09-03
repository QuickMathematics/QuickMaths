import test from "node:test";
import assert from "node:assert/strict";

import {
  QUICKMATHS_APP_URL,
  buildEducatorAgentPrompt,
  buildLearnerAgentPrompt,
  buildQuickMathsDesktopLink,
  detectBrowserName,
  webMcpAvailable,
} from "./agent-prompts.js";

test("detects common browsers without mistaking Edge for Chrome", () => {
  assert.equal(detectBrowserName({ userAgent: "Mozilla/5.0 Firefox/142.0" }), "Firefox");
  assert.equal(detectBrowserName({ userAgent: "Mozilla/5.0 Chrome/140.0 Safari/537.36 Edg/140.0" }), "Microsoft Edge");
  assert.equal(detectBrowserName({ userAgent: "Mozilla/5.0 Version/18.0 Safari/605.1.15" }), "Safari");
  assert.equal(detectBrowserName({ userAgent: "unknown" }), "this browser");
});

test("learner and educator prompts stay concise and name their manifest tools", () => {
  const learner = buildLearnerAgentPrompt();
  const educator = buildEducatorAgentPrompt();
  for (const prompt of [learner, educator]) {
    assert.match(prompt, /QuickMaths is open in your in-app browser/i);
    assert.match(prompt, /follow the manifest/i);
    assert.doesNotMatch(prompt, /Firefox|Chrome|Safari|Edge|token|external browser/i);
  }
  assert.match(learner, /get_agent_guide with section "summary"/);
  assert.match(educator, /get_educator_agent_manifest/);
});

test("desktop handoff opens QuickMaths and preloads the role-specific manifest prompt", () => {
  const link = new URL(buildQuickMathsDesktopLink({ role: "learner" }));
  assert.equal(link.protocol, "codex:");
  assert.equal(link.searchParams.get("mode"), "codex");
  const browserUrl = new URL(link.searchParams.get("browserUrl"));
  assert.equal(`${browserUrl.origin}${browserUrl.pathname}`, QUICKMATHS_APP_URL);
  assert.equal(browserUrl.searchParams.get("handoff"), "workspace");
  assert.equal(link.searchParams.get("prompt"), buildLearnerAgentPrompt());

  const educatorLink = new URL(buildQuickMathsDesktopLink({ role: "educator", handoff: "fresh" }));
  assert.equal(new URL(educatorLink.searchParams.get("browserUrl")).searchParams.get("handoff"), "fresh");
  assert.equal(educatorLink.searchParams.get("prompt"), buildEducatorAgentPrompt());
});

test("desktop handoff can omit a starter prompt after prior agent activity", () => {
  const link = new URL(buildQuickMathsDesktopLink({ includePrompt: false }));
  assert.equal(link.searchParams.has("prompt"), false);
});

test("detects WebMCP support from the page capability instead of the browser name", () => {
  assert.equal(webMcpAvailable({ registerTool() {} }), true);
  assert.equal(webMcpAvailable({}), false);
  assert.equal(webMcpAvailable(undefined), false);
});
