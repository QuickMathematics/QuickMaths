import test from "node:test";
import assert from "node:assert/strict";

import {
  QUICKMATHS_APP_URL,
  buildAgentPrompt,
  buildQuickMathsDesktopLink,
  detectBrowserName,
  detectMobileDevice,
  webMcpAvailable,
} from "./agent-prompts.js";

test("detects common browsers without mistaking Edge for Chrome", () => {
  assert.equal(detectBrowserName({ userAgent: "Mozilla/5.0 Firefox/142.0" }), "Firefox");
  assert.equal(detectBrowserName({ userAgent: "Mozilla/5.0 Chrome/140.0 Safari/537.36 Edg/140.0" }), "Microsoft Edge");
  assert.equal(detectBrowserName({ userAgent: "Mozilla/5.0 Version/18.0 Safari/605.1.15" }), "Safari");
  assert.equal(detectBrowserName({ userAgent: "unknown" }), "this browser");
});

test("detects mobile handoff devices without labelling desktop browsers mobile", () => {
  assert.equal(detectMobileDevice({ userAgent: "Mozilla/5.0 (Linux; Android 15) Mobile Safari/537.36" }), true);
  assert.equal(detectMobileDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)" }), true);
  assert.equal(detectMobileDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", maxTouchPoints: 5 }), true);
  assert.equal(detectMobileDevice({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/142.0" }), false);
  assert.equal(detectMobileDevice({ userAgent: "desktop", userAgentData: { mobile: true } }), true);
});

test("the unified prompt stays concise and names the single manifest command", () => {
  const prompt = buildAgentPrompt();
  assert.match(prompt, /QuickMaths is open in your in-app browser/i);
  assert.match(prompt, /unified manifest/i);
  assert.match(prompt, /get_agent_guide with section "summary"/);
  assert.doesNotMatch(prompt, /Firefox|Chrome|Safari|Edge|token|external browser|get_educator_agent_manifest/i);
});

test("desktop handoff opens QuickMaths and preloads the unified manifest prompt", () => {
  const link = new URL(buildQuickMathsDesktopLink({ role: "learner" }));
  assert.equal(link.protocol, "codex:");
  assert.equal(link.searchParams.get("mode"), "codex");
  const browserUrl = new URL(link.searchParams.get("browserUrl"));
  assert.equal(`${browserUrl.origin}${browserUrl.pathname}`, QUICKMATHS_APP_URL);
  assert.equal(browserUrl.searchParams.get("handoff"), "workspace");
  assert.equal(link.searchParams.get("prompt"), buildAgentPrompt());

  const educatorLink = new URL(buildQuickMathsDesktopLink({ role: "educator", handoff: "fresh" }));
  assert.equal(new URL(educatorLink.searchParams.get("browserUrl")).searchParams.get("handoff"), "fresh");
  assert.equal(educatorLink.searchParams.get("prompt"), buildAgentPrompt());
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
